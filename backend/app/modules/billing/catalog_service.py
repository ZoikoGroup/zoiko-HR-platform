"""
modules/billing/catalog_service.py
------------------------------------
Section 17 (N. Canonical Price Catalog Governance).

Publication is APPEND-ONLY:
  - A plan becomes published when `published_at` is set (is_published derived).
  - A published plan/version is immutable — `ensure_plan_mutable` raises.
  - Re-publishing the same version string raises (append-only).
  - get_customer_visible_plans() NEVER returns an unpublished (draft) record.
    This is Section 17's core rule, enforced here and verified by a dedicated
    mixed published/draft fixture test — not just a code comment.

Numeric prices stay null until Finance approves them (Section 3/17 "no numeric
price guessing"). Activation is a DATA change (set published_at), not a code
change.
"""

import logging
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException
from app.modules.billing.models import (
    BillingPlan,
)

logger = logging.getLogger("zoiko.billing.catalog")


def is_published(plan: BillingPlan) -> bool:
    return plan.published_at is not None


def ensure_plan_mutable(plan: BillingPlan) -> None:
    """Section 17: 'A price already referenced by a finalized invoice is never
    mutated.' A published catalog entry is immutable — refuse to mutate it
    instead of silently succeeding. Raise if the caller tries to change a
    published plan."""
    if is_published(plan):
        raise BadRequestException(
            f"Plan '{plan.code}' catalog_version '{plan.catalog_version}' is published "
            f"and immutable. Create a new catalog version instead (append-only)."
        )


def _pricing_complete(plan: BillingPlan) -> bool:
    """Contract-priced plans carry no public numeric price (sales-led), so they
    are publishable with null prices. Every other plan must have BOTH monthly
    and annual prices approved before publication — never publish a broken
    catalog."""
    if plan.is_contract_priced:
        return True
    return plan.monthly_price is not None and plan.annual_price is not None


def _validate_version_publishable(db: Session, version: str) -> list[BillingPlan]:
    plans = (
        db.query(BillingPlan)
        .filter(BillingPlan.catalog_version == version)
        .order_by(BillingPlan.code)
        .all()
    )
    if not plans:
        raise BadRequestException(
            f"No plans exist for catalog_version '{version}'; nothing to publish."
        )

    incomplete = [
        f"{plan.code}" for plan in plans
        if not plan.is_contract_priced and not _pricing_complete(plan)
    ]
    if incomplete:
        raise BadRequestException(
            f"Cannot publish catalog_version '{version}': non-contract-priced plan(s) "
            f"missing an approved price: {', '.join(sorted(incomplete))}. "
            f"Grandfathering/price approval must land before publication."
        )
    return plans


def publish_catalog_version(db: Session, version: str, actor_email: str) -> list[BillingPlan]:
    """Publish every plan in `version`. Append-only — re-publishing the same
    version rejects. Returns the newly-published plans.

    version echo is the caller's job (router validates the typed confirmation);
    this service enforces the append-only + pricing-completeness rules.
    """
    plans = _validate_version_publishable(db, version)

    already = [p.code for p in plans if is_published(p)]
    if already:
        raise BadRequestException(
            f"Cannot publish catalog_version '{version}': already published "
            f"(append-only). Plan(s): {', '.join(sorted(already))}"
        )

    now = datetime.utcnow()
    for plan in plans:
        plan.published_at = now

    logger.info("[catalog] published version=%s actor=%s plans=%s",
                version, actor_email, [p.code for p in plans])
    db.commit()
    for plan in plans:
        db.refresh(plan)
    return plans


def get_active_catalog(db: Session) -> list[BillingPlan]:
    """All published, active plans across every version (Super Admin view,
    includes full detail incl. provider IDs and tax category)."""
    return (
        db.query(BillingPlan)
        .filter(BillingPlan.published_at.isnot(None))
        .order_by(BillingPlan.code, BillingPlan.catalog_version.desc())
        .all()
    )


def get_latest_published_catalog_version(db: Session) -> str | None:
    """Highest published catalog_version across plans, or None."""
    row = (
        db.query(BillingPlan.catalog_version)
        .filter(BillingPlan.published_at.isnot(None))
        .order_by(BillingPlan.published_at.desc())
        .limit(1)
        .first()
    )
    return row[0] if row else None


def get_customer_visible_plans(db: Session, version: str | None = None) -> list[BillingPlan]:
    """PUBLIC / customer-facing catalog. MUST NEVER return an unpublished
    (draft) price record — Section 17 core rule. Only published, active plans.
    Draft rows are excluded regardless of is_active."""
    q = db.query(BillingPlan).filter(
        BillingPlan.published_at.isnot(None),
        BillingPlan.is_active == True,  # noqa: E712
    )
    if version:
        q = q.filter(BillingPlan.catalog_version == version)
    q = q.order_by(BillingPlan.code)
    return q.all()


def catalog_plan_to_dict(plan: BillingPlan) -> dict:
    """Public-safe field projection for GET /billing/catalog."""
    return {
        "id": plan.id,
        "code": plan.code.value if hasattr(plan.code, "value") else str(plan.code),
        "name": plan.name,
        "catalog_version": plan.catalog_version,
        "billing_metric": plan.billing_metric.value if hasattr(plan.billing_metric, "value") else str(plan.billing_metric),
        "is_active": plan.is_active,
        "is_contract_priced": plan.is_contract_priced,
        "is_self_serve_enabled": plan.is_self_serve_enabled,
        "is_published": is_published(plan),
        "monthly_price": float(plan.monthly_price) if plan.monthly_price is not None else None,
        "annual_price": float(plan.annual_price) if plan.annual_price is not None else None,
        "currency": plan.currency,
        "description": plan.description,
        "tax_category": plan.tax_category.value if hasattr(plan.tax_category, "value") else str(plan.tax_category),
        "stripe_product_id": plan.stripe_product_id,
        "stripe_monthly_price_id": plan.stripe_monthly_price_id,
        "stripe_annual_price_id": plan.stripe_annual_price_id,
        "published_at": plan.published_at.isoformat() if plan.published_at else None,
        "created_at": plan.created_at.isoformat() if plan.created_at else None,
        "updated_at": plan.updated_at.isoformat() if plan.updated_at else None,
    }
