"""
modules/billing/plan_change_service.py
--------------------------------------
Plan change engine for Prompt 4: preview, schedule, cancel, and execute
plan changes (upgrades and downgrades) with blocker detection.

Per Section 13/J3: downgrade enforces at renewal by default, proration
only relevant for mid-cycle changes. Blockers checked at schedule time
and re-checked at execution time.

Refactor replaces the two stubs in service.py:
  - downgrade_subscription_dry_run → preview_plan_change
  - schedule_downgrade → schedule_plan_change
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException, NotFoundException
from app.modules.billing.models import (
    BillingAuditAction,
    BillingAuditLog,
    BillingCycle,
    BillingPlan,
    BillingPlanChange,
    BillingSubscription,
    PlanChangeStatus,
    PlanChangeType,
    PlanCode,
    SubscriptionStatus,
)
from app.modules.billing.downgrade_blockers import (
    detect_all_blockers,
    has_blocking_blockers,
    blockers_to_dict,
)
from app.modules.billing.entitlement_service import (
    check_entitlement,
    ENTITLED_AVAILABLE,
)

logger = logging.getLogger("zoiko.billing.plan_change")


def _get_plan_by_id(db: Session, plan_id: int) -> BillingPlan:
    plan = db.query(BillingPlan).filter(BillingPlan.id == plan_id).first()
    if not plan:
        raise NotFoundException(f"BillingPlan not found: id={plan_id}")
    return plan


def _get_plan_by_code(db: Session, plan_code: str) -> BillingPlan:
    plan = db.query(BillingPlan).filter(BillingPlan.code == plan_code).first()
    if not plan:
        raise NotFoundException(f"BillingPlan not found: code={plan_code}")
    return plan


def _get_subscription(db: Session, organization_id: int) -> BillingSubscription:
    sub = (
        db.query(BillingSubscription)
        .filter(BillingSubscription.organization_id == organization_id)
        .first()
    )
    if not sub:
        raise NotFoundException(
            f"BillingSubscription not found for org {organization_id}"
        )
    return sub


_PLAN_LEVELS = {
    PlanCode.CORE: 1,
    PlanCode.ADVANCED: 2,
    PlanCode.ENTERPRISE: 3,
}


def _is_downgrade(current_plan_code, target_plan_code) -> bool:
    """True when target plan level < current plan level."""
    try:
        current = PlanCode(current_plan_code)
        target = PlanCode(target_plan_code)
        current_level = _PLAN_LEVELS.get(current, 0)
        target_level = _PLAN_LEVELS.get(target, 0)
        return target_level < current_level
    except (ValueError, KeyError):
        return False


# ── Preview ────────────────────────────────────────────────────────────────

def preview_plan_change(
    db: Session,
    organization_id: int,
    plan_id: int,
) -> dict:
    """Dry-run eligibility check for plan change. Returns blockers list,
    proration preview (if mid-cycle), and entitlement delta (features
    gained/lost). No side effects."""
    subscription = _get_subscription(db, organization_id)
    target_plan = _get_plan_by_id(db, plan_id)

    if subscription.plan_id == plan_id:
        raise BadRequestException("Target plan is the same as current plan")

    is_downgrade_change = _is_downgrade(
        subscription.plan_code.value if subscription.plan_code else "FREE",
        target_plan.code.value,
    )

    blockers = detect_all_blockers(db, organization_id, target_plan.code.value)
    proration = None

    if is_downgrade_change and subscription.renewal_anchor_date:
        effective_at = subscription.renewal_anchor_date
    else:
        effective_at = datetime.now(timezone.utc).replace(tzinfo=None)

    from app.modules.billing.entitlement_service import compute_entitlement_snapshot
    from app.modules.billing.feature_keys import FEATURE_KEYS

    current_states = {}
    target_states = {}
    for fk in FEATURE_KEYS:
        current = check_entitlement(db, organization_id, fk)
        current_states[fk] = current["state"]

    from app.modules.billing.models import PlanEntitlementMapping, PlanCode as PC
    target_plan_code = target_plan.code
    target_mappings = (
        db.query(PlanEntitlementMapping)
        .filter(
            PlanEntitlementMapping.plan_code == target_plan_code,
        )
        .all()
    )
    target_map_by_key = {m.feature_key: m.state for m in target_mappings}
    for fk in FEATURE_KEYS:
        target_states[fk] = target_map_by_key.get(fk, "ENTITLED_NOT_CONFIGURED")

    gained = [
        fk for fk in FEATURE_KEYS
        if target_states.get(fk) == "ENTITLED_AVAILABLE"
        and current_states.get(fk) != "ENTITLED_AVAILABLE"
    ]
    lost = [
        fk for fk in FEATURE_KEYS
        if current_states.get(fk) == "ENTITLED_AVAILABLE"
        and target_states.get(fk) != "ENTITLED_AVAILABLE"
    ]

    change_type = PlanChangeType.DOWNGRADE if is_downgrade_change else PlanChangeType.UPGRADE

    return {
        "eligible": not has_blocking_blockers(blockers),
        "blockers": blockers_to_dict(blockers),
        "change_type": change_type.value,
        "from_plan_id": subscription.plan_id,
        "to_plan_id": plan_id,
        "from_plan_code": subscription.plan_code.value if subscription.plan_code else None,
        "to_plan_code": target_plan.code.value,
        "effective_at": effective_at.isoformat(),
        "renewal_anchor_date": subscription.renewal_anchor_date.isoformat() if subscription.renewal_anchor_date else None,
        "entitlement_delta": {
            "gained": gained,
            "lost": lost,
            "current_states": current_states,
            "target_states": target_states,
        },
        "proration_preview": proration,
    }


# ── Schedule ───────────────────────────────────────────────────────────────

def schedule_plan_change(
    db: Session,
    organization_id: int,
    plan_id: int,
    billing_cycle: BillingCycle,
    effective_at: Optional[datetime] = None,
    requested_by: Optional[str] = None,
) -> BillingPlanChange:
    """Schedule a plan change. For downgrades, effective_at defaults to
    renewal_anchor_date per Section 13/J3. Blockers checked; if any
    blocking, change status = BLOCKED for ops review."""
    subscription = _get_subscription(db, organization_id)
    target_plan = _get_plan_by_id(db, plan_id)

    if subscription.plan_id == plan_id:
        raise BadRequestException("Target plan is the same as current plan")

    is_downgrade_change = _is_downgrade(
        subscription.plan_code.value if subscription.plan_code else "FREE",
        target_plan.code.value,
    )

    if is_downgrade_change and not effective_at:
        effective_at = subscription.renewal_anchor_date
    if not effective_at:
        effective_at = datetime.now(timezone.utc).replace(tzinfo=None)

    blockers = detect_all_blockers(db, organization_id, target_plan.code.value)
    blockers_blocked = has_blocking_blockers(blockers)

    from app.modules.billing.entitlement_service import compute_entitlement_snapshot
    from app.modules.billing.feature_keys import FEATURE_KEYS

    current_states = {}
    target_states = {}
    for fk in FEATURE_KEYS:
        current = check_entitlement(db, organization_id, fk)
        current_states[fk] = current["state"]

    from app.modules.billing.models import PlanEntitlementMapping
    target_mappings = (
        db.query(PlanEntitlementMapping)
        .filter(
            PlanEntitlementMapping.plan_code == target_plan.code,
        )
        .all()
    )
    target_map_by_key = {m.feature_key: m.state for m in target_mappings}
    for fk in FEATURE_KEYS:
        target_states[fk] = target_map_by_key.get(fk, "ENTITLED_NOT_CONFIGURED")

    gained = [
        fk for fk in FEATURE_KEYS
        if target_states.get(fk) == "ENTITLED_AVAILABLE"
        and current_states.get(fk) != "ENTITLED_AVAILABLE"
    ]
    lost = [
        fk for fk in FEATURE_KEYS
        if current_states.get(fk) == "ENTITLED_AVAILABLE"
        and target_states.get(fk) != "ENTITLED_AVAILABLE"
    ]

    change = BillingPlanChange(
        organization_id=organization_id,
        change_type=PlanChangeType.DOWNGRADE if is_downgrade_change else PlanChangeType.UPGRADE,
        from_plan_id=subscription.plan_id,
        to_plan_id=plan_id,
        billing_cycle=billing_cycle,
        effective_at=effective_at,
        status=PlanChangeStatus.BLOCKED if blockers_blocked else PlanChangeStatus.SCHEDULED,
        blockers_snapshot=blockers_to_dict(blockers),
        proration_preview=None,
        entitlement_delta={"gained": gained, "lost": lost},
        requested_by=requested_by,
    )
    db.add(change)
    db.commit()
    db.refresh(change)

    if blockers_blocked:
        logger.warning(
            "[plan_change] Org %d downgrade BLOCKED — %d blocking blockers",
            organization_id, sum(1 for b in blockers if b.severity == "blocking"),
        )

    return change


# ── Cancel scheduled change ───────────────────────────────────────────────

def cancel_plan_change(
    db: Session,
    change_id: int,
    cancel_reason: Optional[str] = None,
    canceled_by: Optional[str] = None,
) -> BillingPlanChange:
    """Cancel a scheduled plan change. Only SCHEDULED or BLOCKED can be canceled."""
    change = db.query(BillingPlanChange).filter(BillingPlanChange.id == change_id).first()
    if not change:
        raise NotFoundException(f"BillingPlanChange not found: id={change_id}")

    if change.status not in (PlanChangeStatus.SCHEDULED, PlanChangeStatus.BLOCKED):
        raise BadRequestException(
            f"Cannot cancel plan change in status '{change.status.value}'"
        )

    change.status = PlanChangeStatus.CANCELED
    change.cancel_reason = cancel_reason
    change.canceled_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    db.refresh(change)

    logger.info(
        "[plan_change] Change %d canceled by %s: %s",
        change_id, canceled_by, cancel_reason,
    )
    return change


# ── Get pending changes for org ───────────────────────────────────────────

def get_pending_changes(
    db: Session,
    organization_id: int,
) -> list[BillingPlanChange]:
    """Return all scheduled/blocked changes for an org."""
    return (
        db.query(BillingPlanChange)
        .filter(
            BillingPlanChange.organization_id == organization_id,
            BillingPlanChange.status.in_([
                PlanChangeStatus.SCHEDULED,
                PlanChangeStatus.BLOCKED,
            ]),
        )
        .order_by(BillingPlanChange.effective_at.asc())
        .all()
    )


# ── Execute due changes (called by scheduler job) ─────────────────────────

def execute_due_changes(db: Session) -> dict:
    """Execute all plan changes where effective_at <= now and status in
    (SCHEDULED, BLOCKED). Re-checks blockers at execution time.

    Returns summary dict with executed/blocked/failed counts."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    due = (
        db.query(BillingPlanChange)
        .filter(
            BillingPlanChange.effective_at <= now,
            BillingPlanChange.status.in_([
                PlanChangeStatus.SCHEDULED,
                PlanChangeStatus.BLOCKED,
            ]),
        )
        .all()
    )

    executed = 0
    blocked = 0
    failed = 0
    results = []

    for change in due:
        try:
            blockers = detect_all_blockers(db, change.organization_id, change.to_plan.code.value)
            if has_blocking_blockers(blockers):
                change.status = PlanChangeStatus.BLOCKED
                change.blockers_snapshot = blockers_to_dict(blockers)
                db.commit()
                blocked += 1
                results.append({
                    "change_id": change.id,
                    "status": "blocked",
                    "reason": f"{sum(1 for b in blockers if b.severity == 'blocking')} blockers still active",
                })
                continue

            change.status = PlanChangeStatus.EXECUTING
            db.commit()

            subscription = _get_subscription(db, change.organization_id)
            subscription.plan_id = change.to_plan_id
            subscription.plan_code = change.to_plan.code
            subscription.billing_cycle = change.billing_cycle
            subscription.billing_metric = change.to_plan.billing_metric
            subscription.price_catalog_version = change.to_plan.catalog_version
            subscription.status = SubscriptionStatus.ACTIVE

            change.status = PlanChangeStatus.EXECUTED
            change.executed_at = now
            db.commit()

            _invalidate_entitlement_cache(change.organization_id)

            _log_plan_change_audit(db, change, "executed")

            executed += 1
            results.append({
                "change_id": change.id,
                "status": "executed",
                "new_plan": change.to_plan.code.value,
            })
            logger.info(
                "[plan_change] Org %d plan change executed → %s",
                change.organization_id, change.to_plan.code.value,
            )

        except Exception as e:
            logger.error(
                "[plan_change] Change %d execution failed: %s",
                change.id, e,
            )
            change.status = PlanChangeStatus.BLOCKED
            db.commit()
            failed += 1
            results.append({
                "change_id": change.id,
                "status": "failed",
                "error": str(e),
            })

    return {
        "total_due": len(due),
        "executed": executed,
        "blocked": blocked,
        "failed": failed,
        "results": results,
    }


def _invalidate_entitlement_cache(organization_id: int):
    try:
        from app.modules.billing.entitlement_service import invalidate_entitlement_cache
        invalidate_entitlement_cache(organization_id)
    except Exception as e:
        logger.warning("[plan_change] Cache invalidation failed: %s", e)


def _log_plan_change_audit(db: Session, change: BillingPlanChange, action: str):
    try:
        from app.modules.billing import service
        action_map = {
            "executed": BillingAuditAction.PLAN_CHANGE_EXECUTED,
            "scheduled": BillingAuditAction.PLAN_CHANGE_SCHEDULED,
            "canceled": BillingAuditAction.PLAN_CHANGE_CANCELED,
        }
        audit_action = action_map.get(action)
        if not audit_action:
            return

        service.log_billing_audit(
            db,
            actor=change.requested_by,
            organization_id=change.organization_id,
            action=audit_action,
            entity_type="BillingPlanChange",
            entity_id=change.id,
            before={"status": "scheduled"},
            after={
                "status": change.status.value,
                "to_plan_code": change.to_plan.code.value if change.to_plan else None,
            },
        )
    except Exception as e:
        logger.warning("[plan_change] Audit log failed: %s", e)
