"""Immutable, tamper-evident audit store for support access (ZHR-PRIV-001 Phase 9).

Every support-access event - a request, an approval, an issuance, a read, a denial, an export, a revocation - is appended
here as one row in a hash chain: each row commits to the row before it, so an edit to any row (or a deletion) breaks the
chain and `verify_chain` points at the first row that no longer matches.

The rows hold NAMES and opaque ids only. A field value, a record payload, a password, a bank or medical value never
reaches this table; the payload is whatever non-sensitive metadata the caller passed.

Defence in depth, applied by the migration on PostgreSQL only:
  * a BEFORE UPDATE OR DELETE trigger that refuses every change: the table is append-only for the application role;
  * the deployment grants the application INSERT only (a role change, not a schema one) - documented as a deployment
    action in the runbook.
External anchoring (periodically publishing the head hash to a store the application cannot rewrite) is a seam here:
`anchor(sink=...)`. Where no external sink is wired the anchor is logged and the gap is recorded in control_status.
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime
from typing import Callable, Optional

from sqlalchemy import JSON, Column, DateTime, Integer, String
from sqlalchemy.orm import Session

from app.database import Base

logger = logging.getLogger("zoiko.privacy.audit")

GENESIS = "0" * 64

# The columns that are chained, in a fixed order. Anything not here (the surrogate id) is not part of the commitment.
_CHAIN_FIELDS = (
    "event_type", "occurred_at", "actor_person_id", "tenant_id", "grant_id", "request_id", "action", "reason", "payload",
)


class PrivacyAuditEvent(Base):
    """One link in the support-access audit chain. Append-only."""

    __tablename__ = "privacy_audit_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_type = Column(String(64), nullable=False, index=True)
    occurred_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    actor_person_id = Column(Integer, nullable=True)
    tenant_id = Column(Integer, nullable=True, index=True)
    grant_id = Column(String(64), nullable=True, index=True)
    request_id = Column(Integer, nullable=True)
    action = Column(String(32), nullable=True)
    reason = Column(String(64), nullable=True)
    payload = Column(JSON, nullable=True)
    prev_hash = Column(String(64), nullable=False)
    hash = Column(String(64), nullable=False, index=True)


def _fields_of(ev: PrivacyAuditEvent) -> dict:
    out = {}
    for name in _CHAIN_FIELDS:
        v = getattr(ev, name)
        if isinstance(v, datetime):
            v = v.isoformat()
        out[name] = v
    return out


def _digest(prev_hash: str, fields: dict) -> str:
    body = json.dumps(fields, sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.sha256((prev_hash + "|" + body).encode()).hexdigest()


def head_hash(db: Session) -> str:
    return db.query(PrivacyAuditEvent.hash).order_by(PrivacyAuditEvent.id.desc()).limit(1).scalar() or GENESIS


def record(
    db: Session,
    event_type: str,
    *,
    actor_person_id: Optional[int] = None,
    tenant_id: Optional[int] = None,
    grant_id: Optional[str] = None,
    request_id: Optional[int] = None,
    action: Optional[str] = None,
    reason: Optional[str] = None,
    payload: Optional[dict] = None,
    occurred_at: Optional[datetime] = None,
) -> PrivacyAuditEvent:
    """Append one event. Flushes (so a failure fails the caller's transaction - audit is not best-effort)."""
    prev = head_hash(db)
    ev = PrivacyAuditEvent(
        event_type=event_type,
        occurred_at=occurred_at or datetime.utcnow(),
        actor_person_id=actor_person_id,
        tenant_id=tenant_id,
        grant_id=grant_id,
        request_id=request_id,
        action=action,
        reason=reason,
        payload=payload,
        prev_hash=prev,
    )
    ev.hash = _digest(prev, _fields_of(ev))
    db.add(ev)
    db.flush()
    return ev


def verify_chain(db: Session) -> tuple[bool, Optional[int]]:
    """Walk the chain in order. Return (True, None) when intact, else (False, first_offending_id)."""
    prev = GENESIS
    for ev in db.query(PrivacyAuditEvent).order_by(PrivacyAuditEvent.id.asc()).yield_per(500):
        if ev.prev_hash != prev:
            return False, ev.id
        if ev.hash != _digest(prev, _fields_of(ev)):
            return False, ev.id
        prev = ev.hash
    return True, None


def anchor(db: Session, sink: Optional[Callable[[dict], None]] = None) -> dict:
    """Publish the current head hash so a later rewrite is detectable outside this database."""
    payload = {
        "head_hash": head_hash(db),
        "count": db.query(PrivacyAuditEvent).count(),
        "at": datetime.utcnow().isoformat(),
    }
    if sink is None:
        logger.info("privacy audit anchor (no external sink wired): %s", payload)
    else:
        sink(payload)
    return payload
