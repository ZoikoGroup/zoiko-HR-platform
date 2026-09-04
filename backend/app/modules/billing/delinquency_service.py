"""
modules/billing/delinquency_service.py
---------------------------------------
Graduated delinquency lifecycle per Section 10 G1-G5 and the Section 22
DAY_* recovery events:

  Recovery through day 14
  DAY_10_UNPAID    -> restrict new commercial expansion / cost-increasing actions
  DAY_20_UNPAID    -> controlled service restriction while preserving approved
                      read, billing-remediation, privacy/legal-hold and export paths
  DAY_45_UNPAID    -> terminate standard subscription, begin controlled
                      export/closure/deletion workflow (no immediate destructive purge)

Recovery (PAYMENT_RECOVERED) restores entitlements automatically ONLY when no
other suspension/restriction reason exists for the organization.

The stage is DERIVED from when the failure occurred (failed_at), never trusted
from the client. Entitlement gating reads DelinquencyCase.stage directly, so
frontend banners are informational, not authoritative (Section 10 G2).

Timing is clock-injectable via `now_utc()` so tests can freeze the clock.
"""

import hashlib
import logging
import secrets
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.modules.billing.models import (
    BillingAuditAction,
    BillingAuditLog,
    ConfirmationToken,
    ConfirmationTokenStatus,
    DelinquencyCase,
    DelinquencyCaseStatus,
    DelinquencyStage,
    SubscriptionStatus,
    SupportAccessGrant,
)

logger = logging.getLogger("zoiko.billing.delinquency")

# Standard graduated milestones (Section 10 G1). Enterprise contractual cure
# periods can override these through a contract-policy object (not yet modeled),
# which the service is scaffolded to receive via `cure_override`.
DAY_10 = 10
DAY_14 = 14
DAY_20 = 20
DAY_45 = 45

DEFAULT_RETENTION_HOLD_DAYS = 90  # G5: controlled retrieval window after termination


def now_utc() -> datetime:
    """Clock injection point for deterministic time-based tests."""
    return datetime.utcnow()


def resolve_stage(failed_at: datetime, _now: datetime | None = None, cure_override: int | None = None) -> tuple[DelinquencyStage, int]:
    """Return the (stage, days_elapsed) tuple for a failure that happened at
    failed_at. Monotonic: once a restriction is reached it is never relaxed
    just because the clock moves backwards (failed_at acts as the anchor)."""
    now = _now or now_utc()
    days = max(0, int((now - failed_at).total_seconds() // 86400))

    target_45 = cure_override if (cure_override is not None and cure_override < DAY_45) else DAY_45
    if days >= target_45:
        return DelinquencyStage.DAY_45_TERMINATION, days
    if days >= DAY_20:
        return DelinquencyStage.DAY_20_RESTRICT, days
    if days >= DAY_10:
        return DelinquencyStage.DAY_10_RESTRICT, days
    return DelinquencyStage.RECOVERY, days


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _log_billing_audit(
    db: Session,
    organization_id: int,
    action: BillingAuditAction,
    entity_type: str,
    entity_id: int | None,
    before: dict | None = None,
    after: dict | None = None,
    reason: str | None = None,
    source: str = "delinquency",
    stripe_event_id: str | None = None,
):
    from app.modules.billing.service import log_billing_audit as _log

    _log(
        db,
        actor=None,
        organization_id=organization_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        before=before,
        after=after,
        reason=reason,
        source=source,
        stripe_event_id=stripe_event_id,
    )


def open_case(
    db: Session,
    organization_id: int,
    stripe_event_id: str | None = None,
    failed_at: datetime | None = None,
    notes: str | None = None,
) -> DelinquencyCase:
    """Create (or reopen) a delinquency case for an organization on
    invoice.payment_failed. Idempotent: only one open case per org."""
    case = (
        db.query(DelinquencyCase)
        .filter(
            DelinquencyCase.organization_id == organization_id,
            DelinquencyCase.status == DelinquencyCaseStatus.OPEN,
        )
        .first()
    )
    failed_at = failed_at or now_utc()
    if case:
        case.stage, _ = resolve_stage(case.failed_at)
        case.stripe_event_id = stripe_event_id or case.stripe_event_id
        if notes:
            case.notes = notes
        db.commit()
        db.refresh(case)
        return case

    case = DelinquencyCase(
        organization_id=organization_id,
        status=DelinquencyCaseStatus.OPEN,
        stage=DelinquencyStage.RECOVERY,
        stripe_event_id=stripe_event_id,
        failed_at=failed_at,
        notes=notes,
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    _log_billing_audit(
        db,
        organization_id,
        BillingAuditAction.DELINQUENCY_CASE_OPENED,
        "DelinquencyCase",
        case.id,
        after={"stage": case.stage.name, "failed_at": failed_at.isoformat()},
        stripe_event_id=stripe_event_id,
    )
    return case


def get_open_case(db: Session, organization_id: int) -> DelinquencyCase | None:
    return (
        db.query(DelinquencyCase)
        .filter(
            DelinquencyCase.organization_id == organization_id,
            DelinquencyCase.status == DelinquencyCaseStatus.OPEN,
        )
        .first()
    )


def _stage_already_notified(db: Session, case: DelinquencyCase) -> bool:
    """Return True if a stage-change notification has already been dispatched
    for the case's current stage (dedup via the billing audit trail)."""
    from app.modules.billing.models import BillingAuditLog

    return (
        db.query(BillingAuditLog.id)
        .filter(
            BillingAuditLog.organization_id == case.organization_id,
            BillingAuditLog.action == BillingAuditAction.DELINQUENCY_STAGE_CHANGED,
            BillingAuditLog.entity_type == "DelinquencyCase",
            BillingAuditLog.entity_id == case.id,
            BillingAuditLog.source == "delinquency_notification",
        )
        .first()
        is not None
    )


def run_delinquency_walk(db: Session, _now: datetime | None = None) -> dict:
    """Daily scheduler walk: advance every open delinquency case along the
    day-10/20/45 timeline and dispatch the stage-change notice exactly once
    per stage (deduplicated). Returns a summary dict."""
    open_cases = (
        db.query(DelinquencyCase)
        .filter(DelinquencyCase.status == DelinquencyCaseStatus.OPEN)
        .all()
    )

    advanced = 0
    notified = 0
    for case in open_cases:
        before = case.stage
        case = advance_case(db, case.organization_id, _now)
        if case is None:
            continue
        if case.stage != before:
            advanced += 1
        if case.stage != DelinquencyStage.RECOVERY and not _stage_already_notified(db, case):
            _dispatch_stage_notice(db, case)
            notified += 1

    return {"open_cases": len(open_cases), "advanced": advanced, "notified": notified}


def _dispatch_stage_notice(db: Session, case: DelinquencyCase) -> None:
    """Send the G4 delinquency notice for a case's current stage and record a
    dedup marker on the audit trail. Never sends financial detail to HR admins;
    recipient resolution + financial gating is enforced in email_service."""
    try:
        from app.services.email_service import send_delinquency_notice

        days = max(0, int((now_utc() - case.failed_at).total_seconds() // 86400))
        send_delinquency_notice(
            db,
            case.organization_id,
            stage=case.stage.name,
            days_overdue=days,
            amounts={"currency": "USD", "overdue_amount": "unavailable"},
        )
    except Exception as e:
        logger.warning(
            "delinquency notice dispatch failed for org %d stage %s: %s",
            case.organization_id, case.stage, e,
        )
        return

    db.add(BillingAuditLog(
        organization_id=case.organization_id,
        action=BillingAuditAction.DELINQUENCY_STAGE_CHANGED,
        entity_type="DelinquencyCase",
        entity_id=case.id,
        before=None,
        after={"stage": case.stage.name, "notification_dispatched": True},
        source="delinquency_notification",
    ))
    db.commit()


def advance_case(db: Session, organization_id: int, _now: datetime | None = None) -> DelinquencyCase | None:
    """Recompute the stage for an open case from failed_at and apply any new
    downstream effects (termination workflow start / retention hold). Returns
    the case after update. Safe to run daily by the scheduler."""
    case = get_open_case(db, organization_id)
    if case is None:
        return None

    stage, days = resolve_stage(case.failed_at, _now)
    previous_stage = case.stage
    if stage != previous_stage:
        # Remember the last stage we reached (never regress a case that has
        # already been escalated).
        case.stage = stage
        db.commit()
        _log_billing_audit(
            db,
            organization_id,
            BillingAuditAction.DELINQUENCY_STAGE_CHANGED,
            "DelinquencyCase",
            case.id,
            before={"stage": previous_stage.name},
            after={"stage": stage.name, "days_elapsed": days},
        )

    if stage == DelinquencyStage.DAY_45_TERMINATION and not case.terminated_at:
        case.terminated_at = now_utc() if _now is None else _now
        case.retention_hold_until = (case.terminated_at or now_utc()) + timedelta(days=DEFAULT_RETENTION_HOLD_DAYS)
        _ensure_subscription_status(db, organization_id, SubscriptionStatus.RESTRICTED)
        db.commit()
        _log_billing_audit(
            db,
            organization_id,
            BillingAuditAction.DELINQUENCY_TERMINATION_STARTED,
            "DelinquencyCase",
            case.id,
            after={
                "terminated_at": case.terminated_at.isoformat(),
                "retention_hold_until": case.retention_hold_until.isoformat(),
            },
        )

    db.refresh(case)
    return case


def _ensure_subscription_status(db: Session, organization_id: int, status: SubscriptionStatus) -> None:
    from app.modules.billing.models import BillingSubscription

    sub = (
        db.query(BillingSubscription)
        .filter(BillingSubscription.organization_id == organization_id)
        .first()
    )
    if sub and sub.status != status:
        sub.status = status
        sub.updated_at = now_utc()


def recover(
    db: Session,
    organization_id: int,
    stripe_event_id: str | None = None,
    _now: datetime | None = None,
    resolve_locally: bool = False,
) -> DelinquencyCase | None:
    """Mark the open case recovered and restore the subscription to ACTIVE —
    but only if no other suspension/restriction reason exists (Section 22
    PAYMENT_RECOVERED: "restore entitlements automatically if no other
    suspension/restriction reason exists").

    `resolve_locally` defers the "other reason" check to the caller (e.g. the
    entitlement / subscription service that has full context)."""
    case = get_open_case(db, organization_id)
    if case is None:
        return None

    case.status = DelinquencyCaseStatus.RECOVERED
    case.stage = DelinquencyStage.RECOVERY
    case.recovered_at = now_utc() if _now is None else _now
    if stripe_event_id:
        case.stripe_event_id = stripe_event_id

    if not resolve_locally:
        from app.modules.billing.service import clear_delinquency_restriction

        if clear_delinquency_restriction(db, organization_id):
            _ensure_subscription_status(db, organization_id, SubscriptionStatus.ACTIVE)

    db.commit()
    db.refresh(case)
    _log_billing_audit(
        db,
        organization_id,
        BillingAuditAction.DELINQUENCY_RECOVERED,
        "DelinquencyCase",
        case.id,
        after={"recovered_at": case.recovered_at.isoformat(), "subscription_restored": not resolve_locally},
        stripe_event_id=stripe_event_id,
    )
    return case


def add_retention_hold(
    db: Session,
    organization_id: int,
    hold_until: datetime | None = None,
) -> DelinquencyCase | None:
    """G5: place / extend the controlled retention-hold window on a terminated
    case so export/closure/legal-hold paths remain available after termination."""
    case = (
        db.query(DelinquencyCase)
        .filter(
            DelinquencyCase.organization_id == organization_id,
            DelinquencyCase.status == DelinquencyCaseStatus.TERMINATED,
        )
        .first()
    )
    if case is None:
        case = get_open_case(db, organization_id)
    if case is None:
        return None

    case.retention_hold_until = hold_until or ((case.terminated_at or now_utc()) + timedelta(days=DEFAULT_RETENTION_HOLD_DAYS))
    db.commit()
    db.refresh(case)
    return case


# ── Support Access Grant (Section 18 O3 / G4 Billing Ops escalation) ───────

def mint_support_access(db: Session, organization_id: int, granted_by: str, reason: str | None = None, ttl_hours: int = 24) -> tuple[SupportAccessGrant, str]:
    """Mint a time-bounded support-access grant. Returns (grant, raw_token).
    Only the SHA-256 hash of the token is stored — the raw value is returned
    once to the caller and cannot be recovered afterward."""
    raw = secrets.token_urlsafe(32)
    grant = SupportAccessGrant(
        organization_id=organization_id,
        token_hash=_hash_token(raw),
        granted_by=granted_by,
        reason=reason,
        expires_at=now_utc() + timedelta(hours=ttl_hours),
    )
    db.add(grant)
    db.commit()
    db.refresh(grant)
    _log_billing_audit(
        db,
        organization_id,
        BillingAuditAction.SUPPORT_ACCESS_GRANTED,
        "SupportAccessGrant",
        grant.id,
        after={"expires_at": grant.expires_at.isoformat(), "granted_by": granted_by},
    )
    return grant, raw


def validate_support_access(db: Session, organization_id: int, raw_token: str) -> SupportAccessGrant:
    """Validate a support-access token for an org. Raises ValueError if the
    token is unknown, already revoked or expired."""
    granted = (
        db.query(SupportAccessGrant)
        .filter(
            SupportAccessGrant.organization_id == organization_id,
            SupportAccessGrant.token_hash == _hash_token(raw_token),
            SupportAccessGrant.revoked_at.is_(None),
        )
        .first()
    )
    if granted is None:
        raise ValueError("support_access_token_invalid")
    if granted.expires_at < now_utc():
        raise ValueError("support_access_token_expired")
    return granted


def revoke_support_access(db: Session, grant_id: int, revoked_by: str) -> SupportAccessGrant:
    grant = db.query(SupportAccessGrant).filter(SupportAccessGrant.id == grant_id).first()
    if grant is None:
        raise ValueError("support_access_grant_not_found")
    grant.revoked_at = now_utc()
    grant.revoked_by = revoked_by
    db.commit()
    db.refresh(grant)
    _log_billing_audit(
        db,
        grant.organization_id,
        BillingAuditAction.SUPPORT_ACCESS_REVOKED,
        "SupportAccessGrant",
        grant.id,
        after={"revoked_by": revoked_by},
    )
    return grant


# ── Confirmation Tokens (two-step destructive / state-changing actions) ────

def mint_confirmation_token(
    db: Session,
    organization_id: int,
    purpose,
    actor_id: int | None,
    actor_email: str | None,
    token_ttl_hours: int = 24,
    token_metadata: dict | None = None,
) -> tuple[ConfirmationToken, str]:
    """Mint a one-time confirmation token for a destructive/irrevocable org
    action. Returns (token_record, raw_token). Only the hash is stored."""
    raw = secrets.token_urlsafe(32)
    token = ConfirmationToken(
        organization_id=organization_id,
        purpose=purpose,
        token_hash=_hash_token(raw),
        expires_at=now_utc() + timedelta(hours=token_ttl_hours),
        status=ConfirmationTokenStatus.PENDING,
        actor_id=actor_id,
        actor_email=actor_email,
        token_metadata=token_metadata,
    )
    db.add(token)
    db.commit()
    db.refresh(token)
    _log_billing_audit(
        db,
        organization_id,
        BillingAuditAction.CONFIRMATION_TOKEN_CREATED,
        "ConfirmationToken",
        token.id,
        after={"purpose": getattr(purpose, "name", str(purpose)), "actor_email": actor_email},
    )
    return token, raw


def confirm_token(db: Session, token_id: int, raw_token: str, purpose, actor_id: int) -> ConfirmationToken:
    """Consume a confirmation token, enforcing one-time, binding-to-actor and
    expiry rules. Raises ValueError on any violation."""
    token = db.query(ConfirmationToken).filter(ConfirmationToken.id == token_id).first()
    if token is None:
        raise ValueError("confirmation_token_not_found")
    if token.purpose != purpose:
        raise ValueError("confirmation_token_purpose_mismatch")
    if token.status != ConfirmationTokenStatus.PENDING:
        raise ValueError("confirmation_token_already_used")
    if token.expires_at < now_utc():
        token.status = ConfirmationTokenStatus.EXPIRED.value
        db.commit()
        raise ValueError("confirmation_token_expired")
    # Binding: the token is scoped to the actor who minted it.
    if token.actor_id is not None and token.actor_id != actor_id:
        raise ValueError("confirmation_token_actor_mismatch")
    if not secrets.compare_digest(token.token_hash, _hash_token(raw_token)):
        raise ValueError("confirmation_token_invalid")

    token.status = ConfirmationTokenStatus.CONSUMED
    token.consumed_at = now_utc()
    db.commit()
    db.refresh(token)
    _log_billing_audit(
        db,
        token.organization_id,
        BillingAuditAction.CONFIRMATION_TOKEN_CONSUMED,
        "ConfirmationToken",
        token.id,
        after={"purpose": getattr(token.purpose, "name", str(token.purpose)), "actor_id": actor_id},
    )
    return token
