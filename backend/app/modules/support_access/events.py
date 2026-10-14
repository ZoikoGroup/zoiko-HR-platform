"""Seam for support-access events (ZHR-PRIV-001 F01-F06).

Every support-access event (request, approval, grant, access, denial, export, revocation, break-glass) is emitted here.
The event carries NAMES and NON-SENSITIVE metadata only - never a field value, a record payload, a password or a full
bank/medical value. Phase 9 replaces the in-memory tail with the immutable, hash-chained `privacy_audit_events` store;
this module keeps the call sites stable and provides the in-memory tail that tests read.
"""
from __future__ import annotations

import logging

logger = logging.getLogger("zoiko.privacy.audit")

RECENT: list[dict] = []
RECENT_MAX = 2000

# The complete event vocabulary (Phase 9).
EVENT_TYPES = frozenset({
    "GRANT_REQUESTED", "GRANT_SUBMITTED", "APPROVAL_DECIDED", "GRANT_ISSUED", "ACCESS_ALLOWED", "ACCESS_DENIED",
    "EXPORT_REQUESTED", "DOWNLOAD", "GRANT_REVOKED", "GRANT_EXPIRED", "BREAK_GLASS_STARTED", "BREAK_GLASS_CONFIRMED",
    "BREAK_GLASS_ENDED", "KILL_SWITCH", "AUTHORISER_DESIGNATED", "AUTHORISER_REVOKED", "TENANT_NOTIFIED",
    "POLICY_ERROR", "ROLE_CHANGED", "AUDIT_VERIFY_FAILED",
})


def emit(event_type: str, **fields) -> dict:
    """Record one event. With `db=` present it is appended to the immutable chain (Phase 9); the in-memory tail is kept
    either way so tests and the audit view can read the recent stream.

    The audit write is part of the caller's transaction: if it fails, `record` raises and the action does not proceed
    (fail closed - no unaudited access)."""
    db = fields.pop("db", None)
    event = {"event_type": event_type, **fields}
    RECENT.append(event)
    del RECENT[: max(0, len(RECENT) - RECENT_MAX)]
    logger.info("support-access %s %s", event_type, {k: v for k, v in fields.items() if k != "detail"})
    if db is not None:
        from app.modules.support_access import audit

        audit.record(
            db,
            event_type,
            actor_person_id=fields.get("actor_person_id"),
            tenant_id=fields.get("tenant_id"),
            grant_id=fields.get("grant_id"),
            request_id=fields.get("request_id"),
            action=fields.get("action") or fields.get("decision"),
            reason=fields.get("reason") or fields.get("detail"),
            payload={
                k: v for k, v in fields.items()
                if k not in ("actor_person_id", "tenant_id", "grant_id", "request_id")
            },
        )
    return event


def recent() -> list[dict]:
    return list(RECENT)


def reset() -> None:
    RECENT.clear()
