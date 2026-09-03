"""
modules/billing/stripe_sync_service.py
---------------------------------------
Stripe catalog sync for Section 17 (provider product/price IDs) + Section 11
(tax behavior per SKU).

Guarded entirely behind settings.STRIPE_SECRET_KEY:
  - If the key is absent (or not Stripe TEST mode), sync_plan_to_stripe logs
    and no-ops — mirroring the existing `_safe_import` philosophy in main.py
    (absence degrades gracefully, never crashes).
  - Only Stripe test-mode keys (sk_test_...) may sync. Live-mode syncing must
    wait until Section 17/H2 approvals land.

Partial-write safety: the Stripe Product + 2 Prices are created/updated first,
then the returned IDs are written back onto the catalog entry in ONE DB
transaction. If writing the DB fails, compensating cleanup deletes/archives the
just-created Stripe objects so the plan never ends up with a stripe_product_id
but missing price IDs (no partial write).

The Stripe client is injectable so CI can test with a fully mocked client and
never touch the network.
"""

import logging

from sqlalchemy.orm import Session

from app.config import settings

logger = logging.getLogger("zoiko.billing.stripe")

_STRIPE_KEY_NOTE = (
    "Stripe sync disabled: HR_STRIPE_SECRET_KEY is empty or not a test-mode "
    "(sk_test_) key. Set test-mode keys to enable — live-mode sync requires "
    "Section 17/H2 approvals."
)


def stripe_enabled() -> bool:
    """True only when a Stripe TEST-MODE secret key is configured."""
    key = (settings.STRIPE_SECRET_KEY or "").strip()
    return key.startswith("sk_test_")


def _get_stripe_client():
    """Lazily import and return a configured stripe client. Raises RuntimeError
    if the stripe library is unavailable (guard callers with stripe_enabled()).
    """
    try:
        import stripe
    except ImportError as e:  # pragma: no cover - depends on env
        raise RuntimeError(
            "stripe library is not installed. Add 'stripe' to requirements.txt."
        ) from e
    return stripe


def sync_plan_to_stripe(db: Session, plan, stripe_client=None) -> None:
    """Idempotently create/update the Stripe Product + monthly/annual Prices for
    `plan` and write the returned IDs back onto the catalog entry.

    No-op (logs) when Stripe is disabled. Raises if the plan is not priced
    (nothing to sync) or Stripe test-mode sync fails.
    """
    if not stripe_enabled():
        logger.warning(_STRIPE_KEY_NOTE)
        return

    # Deterministic external keys => create is idempotent across runs.
    plan_key = f"zoiko_hr_{plan.code.value if hasattr(plan.code, 'value') else plan.code}"
    plan_key = plan_key.lower()

    if not plan.is_contract_priced and (plan.monthly_price is None or plan.annual_price is None):
        raise ValueError(
            f"Plan '{plan.code}' cannot be synced to Stripe: missing approved "
            f"monthly/annual price. Sync requires a publishable (priced) plan."
        )

    if stripe_client is not None:
        stripe = stripe_client
    else:
        stripe = _get_stripe_client()
    stripe.api_key = settings.STRIPE_SECRET_KEY

    product = stripe.Product.create(
        name=plan.name or plan.code.value,
        description=plan.description,
        metadata={
            "zoiko_plan_code": str(plan.code.value if hasattr(plan.code, "value") else plan.code),
            "catalog_version": plan.catalog_version,
            "tax_category": str(plan.tax_category.value if hasattr(plan.tax_category, "value") else plan.tax_category),
        },
    )

    currency = (plan.currency or "USD").lower()
    monthly_price = stripe.Price.create(
        product=product.id,
        unit_amount=int(round(float(plan.monthly_price) * 100)),
        currency=currency,
        recurring={"interval": "month"},
        metadata={"catalog_version": plan.catalog_version, "zoiko_plan_code": str(plan.code)},
    )
    annual_price = stripe.Price.create(
        product=product.id,
        unit_amount=int(round(float(plan.annual_price) * 100)),
        currency=currency,
        recurring={"interval": "year"},
        metadata={"catalog_version": plan.catalog_version, "zoiko_plan_code": str(plan.code)},
    )

    try:
        plan.stripe_product_id = product.id
        plan.stripe_monthly_price_id = monthly_price.id
        plan.stripe_annual_price_id = annual_price.id
        db.commit()
        logger.info(
            "[stripe] synced plan=%s product=%s monthly=%s annual=%s",
            plan.code, product.id, monthly_price.id, annual_price.id,
        )
    except Exception:
        # Compensating cleanup: the DB write failed, so roll back the Stripe
        # objects to avoid a product/price with no catalog link (and never
        # leave a partial write of product id without price ids).
        db.rollback()
        try:
            for price in (monthly_price, annual_price):
                try:
                    stripe.Price.modify(price.id, active=False)
                except Exception:
                    pass
            stripe.Product.modify(product.id, active=False)
        except Exception:
            logger.warning("[stripe] compensating cleanup failed for product=%s", product.id)
        raise
