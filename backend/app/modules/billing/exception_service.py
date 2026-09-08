"""
modules/billing/exception_service.py
-------------------------------------
ZHR-COM-ENT-001 §19.1 — time-bound, operator-approved commercial exception
entitlements (commercial_exception_entitlement).

Two-step workflow (mirrors refund_service):
  1. Org billing authority requests → PENDING_APPROVAL
  2. Platform Billing Ops (super_admin) approves/rejects → ACTIVE/REJECTED

Engineering hardening:
  - requester ≠ approver (same-actor rejection)
  - expires_at is REQUIRED — no indefinite, hidden override (Section 14
    invariant on commercial_exception_entitlement)
  - starts_at/expires_at are validated (expires_at > starts_at)
  - only ENABLED / READ_ONLY are grantable modes (§14.1 subset)
  - a hard-blocked key (hr.ai.autonomous_action) can never be exceptioned —
    the entitlement resolver returns BEFORE the exception lookup fires
  - every transition writes a BillingAuditLog row + invalidates the org's
    entitlement cache so the override is visible immediately
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException, ForbiddenException, NotFoundException
from app.modules.billing.entitlement_service import invalidate_entitlement_cache
from app.modules.billing.feature_keys import FEATURE_KEYS
from app.modules.billing.models import (
    BillingAuditAction,
    BillingSubscription,
    CommercialExceptionEntitlement,
    CommercialExceptionStatus,
    EntitlementMode,
)

logger = logging.getLogger("zoiko.billing.exception")

# Only these modes are meaningful as an operator-granted override. Anything
# else (POLICY_BLOCKED, LIMIT_REACHED, ...) is a resolver-computed state, not
# something an exception row should assert.
GRANTABLE_MODES = frozenset({
    EntitlementMode.ENABLED,
    EntitlementMode.READ_ONLY,
})


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _actor_email(user) -> str:
    return getattr(user, "email", None) or f"user-{getattr(user, 'id', 'unknown')}"


def _require_subscription(db: Session, organization_id: int) -> BillingSubscription:
    sub = (
        db.query(BillingSubscription)
        .filter(BillingSubscription.organization_id == organization_id)
        .first()
    )
    if not sub:
        raise BadRequestException(
            f"No subscription exists for org {organization_id} — cannot request an entitlement exception."
        )
    return sub


def _existing_windowed_exception(
    db: Session,
    organization_id: int,
    feature_key: str,
    starts_at: datetime,
    expires_at: datetime,
) -> CommercialExceptionEntitlement | None:
    """Return an exception that conflicts with the requested time window:
    this preserves the Section 14 invariant (never two live overrides for the
    same org+key at the same time)."""
    return (
        db.query(CommercialExceptionEntitlement)
        .filter(
            CommercialExceptionEntitlement.organization_id == organization_id,
            CommercialExceptionEntitlement.feature_key == feature_key,
            CommercialExceptionEntitlement.status.in_([
                CommercialExceptionStatus.PENDING_APPROVAL,
                CommercialExceptionStatus.ACTIVE,
            ]),
            CommercialExceptionEntitlement.starts_at < expires_at,
            CommercialExceptionEntitlement.expires_at > starts_at,
        )
        .first()
    )


# ── Request ────────────────────────────────────────────────────────────────

def request_exception(
    db: Session,
    organization_id: int,
    feature_key: str,
    mode: EntitlementMode,
    reason: str,
    requested_by: str,
    starts_at: datetime,
    expires_at: datetime,
) -> CommercialExceptionEntitlement:
    """Create a PENDING_APPROVAL exception request. Validates feature key,
    grantable mode, mandatory time bounds and window conflicts."""
    if feature_key not in FEATURE_KEYS:
        raise BadRequestException(
            f"'{feature_key}' is not a registered FEATURE_KEYS key. "
            "Cannot exception an unknown feature."
        )
    # Section 8 E4 requires the resolver to stay authoritative (it already
    # ignores exceptions for these keys); this is a defense-in-depth guard so
    # an admin cannot even waste an approval cycle on an unrevivable key.
    from app.modules.billing.entitlement_service import (
        _HARD_BLOCKED_AUTONOMOUS_KEYS,
    )
    if feature_key in _HARD_BLOCKED_AUTONOMOUS_KEYS:
        raise BadRequestException(
            f"'{feature_key}' is hard-blocked by Section 8 E4 and can never "
            "be exceptioned."
        )
    if mode not in GRANTABLE_MODES:
        raise BadRequestException(
            f"Mode '{mode.value}' is not grantable as an exception. "
            f"Allowed: {sorted(m.value for m in GRANTABLE_MODES)}."
        )
    if not reason or not reason.strip():
        raise BadRequestException("reason is required — exceptions must be justified.")
    if starts_at is None or expires_at is None:
        raise BadRequestException(
            "starts_at and expires_at are required — an exception is never indefinite."
        )
    if expires_at <= starts_at:
        raise BadRequestException("expires_at must be after starts_at.")

    _require_subscription(db, organization_id)

    conflict = _existing_windowed_exception(
        db, organization_id, feature_key, starts_at, expires_at
    )
    if conflict is not None:
        raise BadRequestException(
            f"An exception for '{feature_key}' already exists "
            f"(id={conflict.id}, status='{conflict.status.value}') overlapping the requested window."
        )

    exception = CommercialExceptionEntitlement(
        organization_id=organization_id,
        feature_key=feature_key,
        mode=mode,
        reason=reason.strip(),
        requested_by=requested_by or "unknown",
        starts_at=starts_at,
        expires_at=expires_at,
        status=CommercialExceptionStatus.PENDING_APPROVAL,
    )
    db.add(exception)
    db.commit()
    db.refresh(exception)

    _log_audit(
        db,
        organization_id=organization_id,
        action=BillingAuditAction.EXCEPTION_REQUESTED,
        entity_type="CommercialExceptionEntitlement",
        entity_id=exception.id,
        actor=requested_by,
        after={
            "feature_key": feature_key,
            "mode": mode.value,
            "starts_at": starts_at.isoformat(),
            "expires_at": expires_at.isoformat(),
            "reason": reason,
        },
    )

    logger.info(
        "[exception] Org %d requested exception %d for '%s' (%s) %s → %s",
        organization_id, exception.id, feature_key, mode.value,
        starts_at.isoformat(), expires_at.isoformat(),
    )
    return exception


# ── Approve / reject / revoke ──────────────────────────────────────────────

def approve_exception(
    db: Session,
    exception_id: int,
    approved_by: str,
) -> CommercialExceptionEntitlement:
    """Approve a PENDING_APPROVAL exception → ACTIVE. Same-actor rejection:
    the approver must not be the requester."""
    exception = _get_exception(db, exception_id)

    if exception.status != CommercialExceptionStatus.PENDING_APPROVAL:
        raise BadRequestException(
            f"Exception is in status '{exception.status.value}', not pending_approval."
        )
    if exception.requested_by == approved_by:
        raise ForbiddenException(
            "Same-actor rejection: approver cannot be the same as the requester."
        )
    if exception.expires_at <= _utcnow():
        raise BadRequestException("Cannot approve an exception whose expires_at has already passed.")

    exception.status = CommercialExceptionStatus.ACTIVE
    exception.approved_by = approved_by
    exception.approved_at = _utcnow()
    db.commit()
    db.refresh(exception)

    _log_audit(
        db,
        organization_id=exception.organization_id,
        action=BillingAuditAction.EXCEPTION_APPROVED,
        entity_type="CommercialExceptionEntitlement",
        entity_id=exception.id,
        actor=approved_by,
        before={"status": "pending_approval"},
        after={"status": "active", "approved_by": approved_by},
    )
    invalidate_entitlement_cache(exception.organization_id)

    logger.info("[exception] Exception %d approved by %s", exception.id, approved_by)
    return exception


def reject_exception(
    db: Session,
    exception_id: int,
    rejected_by: str,
    rejection_reason: str = "",
) -> CommercialExceptionEntitlement:
    """Reject a PENDING_APPROVAL exception → REJECTED."""
    exception = _get_exception(db, exception_id)

    if exception.status != CommercialExceptionStatus.PENDING_APPROVAL:
        raise BadRequestException(
            f"Exception is in status '{exception.status.value}', not pending_approval."
        )

    exception.status = CommercialExceptionStatus.REJECTED
    exception.rejected_by = rejected_by
    exception.rejection_reason = rejection_reason or ""
    db.commit()
    db.refresh(exception)

    _log_audit(
        db,
        organization_id=exception.organization_id,
        action=BillingAuditAction.EXCEPTION_REJECTED,
        entity_type="CommercialExceptionEntitlement",
        entity_id=exception.id,
        actor=rejected_by,
        before={"status": "pending_approval"},
        after={"status": "rejected", "rejection_reason": rejection_reason},
    )

    logger.info("[exception] Exception %d rejected by %s: %s", exception.id, rejected_by, rejection_reason or "")
    return exception


def revoke_exception(
    db: Session,
    exception_id: int,
    revoked_by: str,
    revocation_reason: str = "",
) -> CommercialExceptionEntitlement:
    """Revoke an ACTIVE exception → REVOKED (immediate override removal)."""
    exception = _get_exception(db, exception_id)

    if exception.status != CommercialExceptionStatus.ACTIVE:
        raise BadRequestException(
            f"Exception is in status '{exception.status.value}', only ACTIVE exceptions can be revoked."
        )

    exception.status = CommercialExceptionStatus.REVOKED
    exception.revoked_by = revoked_by
    exception.revoked_at = _utcnow()
    exception.rejection_reason = revocation_reason or exception.rejection_reason
    db.commit()
    db.refresh(exception)

    _log_audit(
        db,
        organization_id=exception.organization_id,
        action=BillingAuditAction.EXCEPTION_REVOKED,
        entity_type="CommercialExceptionEntitlement",
        entity_id=exception.id,
        actor=revoked_by,
        before={"status": "active"},
        after={"status": "revoked", "revocation_reason": revocation_reason},
    )
    invalidate_entitlement_cache(exception.organization_id)

    logger.info("[exception] Exception %d revoked by %s", exception.id, revoked_by)
    return exception


# ── Listing / expiry ───────────────────────────────────────────────────────

def list_exceptions(
    db: Session,
    organization_id: Optional[int] = None,
    status: Optional[CommercialExceptionStatus] = None,
) -> list[CommercialExceptionEntitlement]:
    q = db.query(CommercialExceptionEntitlement)
    if organization_id is not None:
        q = q.filter(CommercialExceptionEntitlement.organization_id == organization_id)
    if status is not None:
        q = q.filter(CommercialExceptionEntitlement.status == status)
    return q.order_by(CommercialExceptionEntitlement.created_at.desc()).all()


def expire_overdue_exceptions(db: Session) -> list[CommercialExceptionEntitlement]:
    """FLIP any ACTIVE exception whose expires_at has passed to EXPIRED.
    Runs nightly on the scheduler; each expiry invalidates the org cache and
    writes an audit row so an override never silently outlives its window."""
    now = _utcnow()
    overdue = (
        db.query(CommercialExceptionEntitlement)
        .filter(
            CommercialExceptionEntitlement.status == CommercialExceptionStatus.ACTIVE,
            CommercialExceptionEntitlement.expires_at <= now,
        )
        .all()
    )
    expired = []
    for exception in overdue:
        exception.status = CommercialExceptionStatus.EXPIRED
        expired.append(exception)
        _log_audit(
            db,
            organization_id=exception.organization_id,
            action=BillingAuditAction.EXCEPTION_EXPIRED,
            entity_type="CommercialExceptionEntitlement",
            entity_id=exception.id,
            actor="scheduler",
            before={"status": "active"},
            after={"status": "expired", "expires_at": exception.expires_at.isoformat()},
        )
        invalidate_entitlement_cache(exception.organization_id)
    if overdue:
        db.commit()
        for e in expired:
            db.refresh(e)
        logger.info("[exception] Expired %d exception(s) past expires_at", len(expired))
    return expired


# ── Resolver helpers (read-only, used by entitlement_service) ──────────────

def get_active_exception(
    db: Session,
    organization_id: int,
    feature_key: str,
) -> CommercialExceptionEntitlement | None:
    """Return the single live (ACTIVE and inside the time window) exception
    for (org, feature_key), or None. This is the override consulted by
    check_entitlement()."""
    now = _utcnow()
    return (
        db.query(CommercialExceptionEntitlement)
        .filter(
            CommercialExceptionEntitlement.organization_id == organization_id,
            CommercialExceptionEntitlement.feature_key == feature_key,
            CommercialExceptionEntitlement.status == CommercialExceptionStatus.ACTIVE,
            CommercialExceptionEntitlement.starts_at <= now,
            CommercialExceptionEntitlement.expires_at > now,
        )
        .first()
    )


def get_active_exceptions_for_org(
    db: Session,
    organization_id: int,
) -> list[CommercialExceptionEntitlement]:
    """All live exceptions for an org — used by compute_entitlement_snapshot()."""
    now = _utcnow()
    return (
        db.query(CommercialExceptionEntitlement)
        .filter(
            CommercialExceptionEntitlement.organization_id == organization_id,
            CommercialExceptionEntitlement.status == CommercialExceptionStatus.ACTIVE,
            CommercialExceptionEntitlement.starts_at <= now,
            CommercialExceptionEntitlement.expires_at > now,
        )
        .all()
    )


def _get_exception(db: Session, exception_id: int) -> CommercialExceptionEntitlement:
    exception = (
        db.query(CommercialExceptionEntitlement)
        .filter(CommercialExceptionEntitlement.id == exception_id)
        .first()
    )
    if not exception:
        raise NotFoundException(f"CommercialExceptionEntitlement not found: id={exception_id}")
    return exception


# ── Audit helper ───────────────────────────────────────────────────────────

def _log_audit(
    db: Session,
    organization_id: int,
    action: BillingAuditAction,
    entity_type: str,
    entity_id: int,
    actor: str = None,
    before: dict = None,
    after: dict = None,
):
    try:
        from app.modules.billing import service
        service.log_billing_audit(
            db,
            actor=actor,
            organization_id=organization_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            before=before,
            after=after,
        )
    except Exception as e:
        logger.warning("[exception] Audit log failed: %s", e)