"""
modules/billing/reconciliation_service.py
------------------------------------------
Internal reconciliation endpoint logic. Per Section 21's
billing_reconciliation_case and Section 22's BILLING_COUNT_DISCREPANCY
rule: "open reconciliation case; do not silently rewrite finalized invoice
history."

This module re-fetches subscription state from Stripe for a given org,
diffs it against the local BillingSubscription row, and writes a
reconciliation case on mismatch rather than auto-overwriting.
"""

import logging
from datetime import datetime

from sqlalchemy.orm import Session

from app.modules.billing.models import (
    BillingReconciliationCase,
    BillingSubscription,
    ProviderRef,
    ReconciliationCaseReason,
    ReconciliationCaseStatus,
)
from app.modules.billing.stripe_client import retrieve_subscription

logger = logging.getLogger("zoiko.billing.reconciliation")


def reconcile_org(db: Session, organization_id: int, actor: str = "internal") -> dict:
    """Compare local subscription state vs Stripe state for an org.
    Returns {"matched": bool, "case_id": int|None, "diffs": [...]}.
    """
    # ── Load local state ──────────────────────────────────────────────────
    subscription = db.query(BillingSubscription).filter(
        BillingSubscription.organization_id == organization_id
    ).first()
    provider_ref = db.query(ProviderRef).filter(
        ProviderRef.organization_id == organization_id
    ).first()

    if not provider_ref or not provider_ref.stripe_subscription_id:
        reason = ReconciliationCaseReason.MISSING_PROVIDER_REF
        case = _open_case(
            db,
            organization_id=organization_id,
            reason=reason,
            local_snapshot=_subscription_to_dict(subscription) if subscription else None,
            stripe_snapshot=None,
            notes="No Stripe subscription reference found for this organization.",
            actor=actor,
        )
        db.commit()
        return {
            "matched": False,
            "case_id": case.id,
            "diffs": ["missing_stripe_subscription_ref"],
        }

    # ── Fetch Stripe state ────────────────────────────────────────────────
    try:
        stripe_sub = retrieve_subscription(provider_ref.stripe_subscription_id)
    except Exception as e:
        logger.error("[reconciliation] Failed to fetch Stripe subscription for org %d: %s", organization_id, e)
        return {"matched": False, "case_id": None, "diffs": [f"stripe_fetch_error: {e}"]}

    # ── Diff ──────────────────────────────────────────────────────────────
    diffs = []
    if subscription:
        local_status = subscription.status.value if subscription.status else None
        if local_status != stripe_sub.get("status"):
            diffs.append(f"status: local={local_status} stripe={stripe_sub.get('status')}")

        local_qty = subscription.quantity
        stripe_qty = stripe_sub.get("items", [{}])[0].get("quantity") if stripe_sub.get("items") else None
        if local_qty is not None and stripe_qty is not None and local_qty != stripe_qty:
            diffs.append(f"quantity: local={local_qty} stripe={stripe_qty}")

    if not diffs:
        logger.info("[reconciliation] Org %d — match, no case opened", organization_id)
        return {"matched": True, "case_id": None, "diffs": []}

    # ── Mismatch: open case (Section 22 BILLING_COUNT_DISCREPANCY) ───────
    reason = ReconciliationCaseReason.STATUS_MISMATCH
    if any("quantity" in d for d in diffs):
        reason = ReconciliationCaseReason.BILLING_COUNT_DISCREPANCY

    case = _open_case(
        db,
        organization_id=organization_id,
        reason=reason,
        local_snapshot=_subscription_to_dict(subscription),
        stripe_snapshot=stripe_sub,
        notes=f"Diffs: {'; '.join(diffs)}",
        actor=actor,
    )
    db.commit()
    logger.warning("[reconciliation] Org %d — case %d opened: %s", organization_id, case.id, diffs)
    return {"matched": False, "case_id": case.id, "diffs": diffs}


def _open_case(
    db: Session,
    organization_id: int,
    reason: ReconciliationCaseReason,
    local_snapshot: dict | None,
    stripe_snapshot: dict | None,
    notes: str | None,
    actor: str,
) -> BillingReconciliationCase:
    """Create and persist a new reconciliation case."""
    case = BillingReconciliationCase(
        organization_id=organization_id,
        reason=reason,
        status=ReconciliationCaseStatus.OPEN,
        local_snapshot=local_snapshot,
        stripe_snapshot=stripe_snapshot,
        notes=notes,
        opened_by=actor,
    )
    db.add(case)
    db.flush()
    return case


def _subscription_to_dict(subscription: BillingSubscription | None) -> dict | None:
    if not subscription:
        return None
    return {
        "id": subscription.id,
        "organization_id": subscription.organization_id,
        "status": subscription.status.value if subscription.status else None,
        "plan_id": subscription.plan_id,
        "plan_code": subscription.plan_code.value if subscription.plan_code else None,
        "quantity": subscription.quantity,
        "billing_cycle": subscription.billing_cycle.value if subscription.billing_cycle else None,
        "commercial_effective_at": (
            subscription.commercial_effective_at.isoformat()
            if subscription.commercial_effective_at else None
        ),
    }
