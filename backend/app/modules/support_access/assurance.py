"""Detection, reconciliation and recertification for support access (ZHR-PRIV-001 Phases 10-12).

Three questions, answered from the same tables the enforcement path writes:

  detect(db)            is anything happening that deserves a human looking at it now?  (Phase 10)
  reconcile(db)         does the record agree with itself - is every live grant backed by an approval, is every
                        revocation propagated, is every break-glass session reviewed?  (Phase 12)
  recertification(db)   what must a person re-affirm on a schedule: authorisers, long-lived grants, emergency sessions.  (Phase 12)
  tenant_activity(db)   one tenant's own history, for its transparency page.  (Phase 11)

Findings carry NAMES, ids and counts only - never a field value. Nothing here writes; it is a read model an operator, a
daily job or a tenant page calls.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.privacy import classification as cls
from app.modules.support_access import scopes as sc
from app.modules.support_access.models import (
    Approval,
    ApprovalDecision,
    BreakGlassReview,
    BreakGlassSession,
    BreakGlassStatus,
    RequestStatus,
    RevocationEvent,
    SupportAccessRequest,
    SupportGrant,
)
from app.modules.support_access import audit as audit_store

APPROVED_DECISIONS = frozenset({ApprovalDecision.APPROVED.value, ApprovalDecision.APPROVED_NARROWED.value})
# how many refusals from one person inside the window before we call it probing
DENIAL_BURST_THRESHOLD = 10
DENIAL_BURST_WINDOW_MINUTES = 10
# a grant issued before this long ago is offered for recertification
RECERT_LONG_LIVED_MINUTES = 120


def _now(now: Optional[datetime] = None) -> datetime:
    return now or datetime.utcnow()


def _live_grants(db: Session):
    return (
        db.query(SupportGrant)
        .filter(SupportGrant.revoked_at.is_(None), SupportGrant.expires_at > _now())
        .all()
    )


# ── Phase 10: detection ─────────────────────────────────────────────────────────────────────────────────────────────
def detect(db: Session, *, now: Optional[datetime] = None) -> list[dict]:
    """Return findings, most severe first. Each is a dict: kind, severity, summary, refs."""
    now = _now(now)
    findings: list[dict] = []

    # an active emergency session is always worth a human's eyes
    for s in db.query(BreakGlassSession).filter(BreakGlassSession.status == BreakGlassStatus.ACTIVE.value).all():
        findings.append({
            "kind": "BREAK_GLASS_ACTIVE", "severity": "high",
            "summary": f"emergency session {s.incident_reference} is active on tenant {s.tenant_id}",
            "refs": {"breakglass_id": s.id, "tenant_id": s.tenant_id},
        })

    # a live grant that reaches special-category or financial data
    for g in _live_grants(db):
        levels = sc.levels_touched(g.effective_scope or {})
        if levels & {cls.Level.SPECIAL_CATEGORY, cls.Level.FINANCIAL, cls.Level.TENANT_BUSINESS_FINANCE}:
            findings.append({
                "kind": "SENSITIVE_GRANT_LIVE", "severity": "high",
                "summary": f"live grant {g.id} reaches {sc.categories(g.effective_scope or {})} on tenant {g.tenant_id}",
                "refs": {"grant_id": g.id, "tenant_id": g.tenant_id, "categories": sc.categories(g.effective_scope or {})},
            })

    # a live grant whose request has no approving decision (should be impossible; catching a broken flow)
    live_by_request = {g.request_id: g for g in _live_grants(db) if g.request_id is not None}
    if live_by_request:
        approved_request_ids = {
            row[0]
            for row in db.query(Approval.request_id)
            .filter(Approval.request_id.in_(list(live_by_request)), Approval.decision.in_(tuple(APPROVED_DECISIONS)))
            .all()
        }
        for rid, g in live_by_request.items():
            if rid not in approved_request_ids:
                findings.append({
                    "kind": "GRANT_WITHOUT_APPROVAL", "severity": "critical",
                    "summary": f"live grant {g.id} has no approving decision on request {rid}",
                    "refs": {"grant_id": g.id, "request_id": rid, "tenant_id": g.tenant_id},
                })

    # a closed request whose grant is still live
    closed_ids = {
        row[0]
        for row in db.query(SupportAccessRequest.id)
        .filter(SupportAccessRequest.status.in_((RequestStatus.CLOSED.value, RequestStatus.REVOKED.value, RequestStatus.EXPIRED.value)))
        .all()
    }
    for rid, g in live_by_request.items():
        if rid in closed_ids:
            findings.append({
                "kind": "GRANT_LIVE_AFTER_CLOSE", "severity": "critical",
                "summary": f"request {rid} is closed but grant {g.id} is still live",
                "refs": {"grant_id": g.id, "request_id": rid, "tenant_id": g.tenant_id},
            })

    # a break-glass session nobody confirmed in time is now stale
    for s in (
        db.query(BreakGlassSession)
        .filter(
            BreakGlassSession.status == BreakGlassStatus.PENDING_CONFIRMATION.value,
            BreakGlassSession.confirm_deadline.isnot(None),
            BreakGlassSession.confirm_deadline <= now,
        )
        .all()
    ):
        findings.append({
            "kind": "BREAK_GLASS_CONFIRMATION_LAPSED", "severity": "medium",
            "summary": f"emergency session {s.id} was never confirmed and its window has closed",
            "refs": {"breakglass_id": s.id, "tenant_id": s.tenant_id},
        })

    # a burst of refusals from one person: probing
    since = now - timedelta(minutes=DENIAL_BURST_WINDOW_MINUTES)
    rows = (
        db.query(audit_store.PrivacyAuditEvent.actor_person_id, func.count())
        .filter(
            audit_store.PrivacyAuditEvent.event_type == "ACCESS_DENIED",
            audit_store.PrivacyAuditEvent.occurred_at >= since,
            audit_store.PrivacyAuditEvent.actor_person_id.isnot(None),
        )
        .group_by(audit_store.PrivacyAuditEvent.actor_person_id)
        .all()
    )
    for actor_id, count in rows:
        if count >= DENIAL_BURST_THRESHOLD:
            findings.append({
                "kind": "DENIAL_BURST", "severity": "medium",
                "summary": f"person {actor_id} was refused {count} times in {DENIAL_BURST_WINDOW_MINUTES} minutes",
                "refs": {"actor_person_id": actor_id, "count": count},
            })

    # a revocation recorded but not marked propagated
    for r in db.query(RevocationEvent).filter(RevocationEvent.propagation_confirmed.is_(False)).all():
        findings.append({
            "kind": "REVOCATION_NOT_PROPAGATED", "severity": "high",
            "summary": f"revocation {r.id} ({r.target_type}) is not confirmed as propagated",
            "refs": {"revocation_id": r.id, "target_type": r.target_type, "target_ref": r.target_ref},
        })

    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    findings.sort(key=lambda f: order.get(f["severity"], 9))
    return findings


# ── Phase 12: reconciliation ────────────────────────────────────────────────────────────────────────────────────────
def reconcile(db: Session, *, now: Optional[datetime] = None) -> dict:
    """A daily integrity walk. Returns per-check counts so a job can page on a non-zero 'failed'."""
    now = _now(now)
    checks: list[dict] = []

    live = _live_grants(db)
    sensitive_live = [g for g in live if sc.levels_touched(g.effective_scope or {})]
    checks.append({"check": "live_grants", "value": len(live), "ok": True})

    exp_lost = (
        db.query(SupportGrant)
        .filter(SupportGrant.revoked_at.is_(None), SupportGrant.expires_at <= now)
        .count()
    )
    # grants past expiry but not yet marked revoked: expected 0 after the maintenance run
    checks.append({"check": "expired_but_unmarked", "value": exp_lost, "ok": exp_lost == 0})

    unpropagated = db.query(RevocationEvent).filter(RevocationEvent.propagation_confirmed.is_(False)).count()
    checks.append({"check": "revocations_unpropagated", "value": unpropagated, "ok": unpropagated == 0})

    active_bg = db.query(BreakGlassSession).filter(BreakGlassSession.status == BreakGlassStatus.ACTIVE.value).count()
    checks.append({"check": "breakglass_active", "value": active_bg, "ok": True})

    unreviewed_bg = (
        db.query(BreakGlassSession)
        .filter(
            BreakGlassSession.status.in_((BreakGlassStatus.ENDED.value, BreakGlassStatus.LAPSED.value)),
            BreakGlassSession.review_status == BreakGlassReview.PENDING_REVIEW.value,
        )
        .count()
    )
    checks.append({"check": "breakglass_awaiting_review", "value": unreviewed_bg, "ok": unreviewed_bg == 0})

    open_requests = (
        db.query(SupportAccessRequest)
        .filter(SupportAccessRequest.status.in_(
            (RequestStatus.PENDING_TENANT.value, RequestStatus.PENDING_INDEPENDENT.value, RequestStatus.APPROVED.value)))
        .count()
    )
    checks.append({"check": "requests_open", "value": open_requests, "ok": True})

    return {"generated_at": now.isoformat(), "ok": all(c["ok"] for c in checks), "checks": checks,
            "sensitive_live_grants": len(sensitive_live)}


# ── Phase 12: recertification ───────────────────────────────────────────────────────────────────────────────────────
def recertification(db: Session, *, now: Optional[datetime] = None) -> dict:
    """What a person must re-affirm: standing authorisers, long-lived grants, emergency sessions awaiting review."""
    now = _now(now)
    from app.modules.support_access.models import TenantAuthoriser

    authorisers = (
        db.query(TenantAuthoriser)
        .filter(TenantAuthoriser.revoked_at.is_(None))
        .all()
    )
    long_lived = [
        g for g in _live_grants(db)
        if (now - g.issued_at) >= timedelta(minutes=RECERT_LONG_LIVED_MINUTES) or g.kind == "BREAK_GLASS"
    ]
    pending_review = (
        db.query(BreakGlassSession)
        .filter(BreakGlassSession.review_status == BreakGlassReview.PENDING_REVIEW.value)
        .all()
    )
    return {
        "generated_at": now.isoformat(),
        "authorisers": [
            {"id": a.id, "tenant_id": a.tenant_id, "user_id": a.user_id, "scope_limits": a.scope_limits,
             "designated_at": a.designated_at.isoformat() if a.designated_at else None}
            for a in authorisers
        ],
        "long_lived_grants": [
            {"id": g.id, "tenant_id": g.tenant_id, "kind": g.kind,
             "issued_at": g.issued_at.isoformat() if g.issued_at else None}
            for g in long_lived
        ],
        "breakglass_awaiting_review": [
            {"id": s.id, "tenant_id": s.tenant_id, "incident_reference": s.incident_reference}
            for s in pending_review
        ],
    }


# ── Phase 11: one tenant's own history ──────────────────────────────────────────────────────────────────────────────
def tenant_activity(db: Session, tenant_id: int, *, limit: int = 100) -> dict:
    """Everything the tenant is entitled to see about access to their own data - names, shapes and statuses, no values."""
    requests = (
        db.query(SupportAccessRequest)
        .filter(SupportAccessRequest.tenant_id == tenant_id)
        .order_by(SupportAccessRequest.created_at.desc())
        .limit(limit)
        .all()
    )
    grants = (
        db.query(SupportGrant)
        .filter(SupportGrant.tenant_id == tenant_id)
        .order_by(SupportGrant.issued_at.desc())
        .limit(limit)
        .all()
    )
    breakglass = (
        db.query(BreakGlassSession)
        .filter(BreakGlassSession.tenant_id == tenant_id)
        .order_by(BreakGlassSession.created_at.desc())
        .limit(limit)
        .all()
    )
    revocations = (
        db.query(RevocationEvent)
        .filter(RevocationEvent.tenant_id == tenant_id)
        .order_by(RevocationEvent.requested_at.desc())
        .limit(limit)
        .all()
    )
    return {
        "tenant_id": tenant_id,
        "requests": [
            {"reference": r.reference, "status": r.status, "risk_level": r.risk_level,
             "purpose_category": r.purpose_category, "ticket_reference": r.ticket_reference,
             "scope": sc.summary(r.requested_scope), "created_at": r.created_at.isoformat() if r.created_at else None}
            for r in requests
        ],
        "grants": [
            {"id": g.id, "kind": g.kind, "status": "REVOKED" if g.revoked_at else "ACTIVE",
             "scope": sc.summary(g.effective_scope or {}),
             "issued_at": g.issued_at.isoformat() if g.issued_at else None,
             "expires_at": g.expires_at.isoformat() if g.expires_at else None}
            for g in grants
        ],
        "breakglass": [
            {"id": s.id, "incident_reference": s.incident_reference, "status": s.status,
             "started_at": s.started_at.isoformat() if s.started_at else None,
             "ended_at": s.ended_at.isoformat() if s.ended_at else None, "scope": sc.summary(s.scope)}
            for s in breakglass
        ],
        "revocations": [
            {"target_type": r.target_type, "reason": r.reason,
             "requested_at": r.requested_at.isoformat() if r.requested_at else None}
            for r in revocations
        ],
    }
