"""
modules/billing/stripe_sync_service.py
---------------------------------------
Stripe catalog sync for Section 17 (provider product/price IDs) + Section 11
(tax behavior per SKU).

Stripe object model, as used here:
  Product = WHAT is sold, one per plan CODE, reused across catalog versions.
  Price   = HOW MUCH it costs. **Stripe Prices are immutable** — an amount can
            never be edited in place. Changing a rate therefore means creating a
            NEW Price and archiving the old one.

Archiving (active=False) is safe for existing customers: a Price deactivated in
Stripe does NOT cancel subscriptions already attached to it, so subscribers keep
their grandfathered rate and only NEW checkouts pick up the new rate. That is the
behaviour a catalog re-price wants.

Guarded behind settings.STRIPE_SECRET_KEY: with no key, every function logs and
no-ops rather than crashing (same _safe_import philosophy as main.py).

The Stripe client is injectable so CI can test with a fully mocked client and
never touch the network.
"""

import logging

from sqlalchemy.orm import Session

from app.config import settings

logger = logging.getLogger("zoiko.billing.stripe")

_STRIPE_KEY_NOTE = (
    "Stripe sync disabled: STRIPE_SECRET_KEY is empty or not a sk_ key. "
    "Set a test-mode key (sk_test_...) to enable; live-mode sync requires "
    "Section 17/H2 approvals."
)

# interval -> model field. Keyed by INTERVAL because every loop below iterates
# intervals and looks the field up; do not invert this.
_INTERVAL_BY_FIELD = {
    "month": "monthly_price",
    "year": "annual_price",
}
_PRICE_ID_FIELD = {
    "month": "stripe_monthly_price_id",
    "year": "stripe_annual_price_id",
}


def stripe_enabled() -> bool:
    """True when a Stripe secret key is configured."""
    key = (settings.STRIPE_SECRET_KEY or "").strip()
    return bool(key) and key.startswith("sk_")


def _get_stripe_client():
    """Lazily import and return a configured stripe client. Raises RuntimeError
    if the library is unavailable (guard callers with stripe_enabled())."""
    try:
        import stripe
    except ImportError as e:  # pragma: no cover - depends on env
        raise RuntimeError(
            "stripe library is not installed. Add 'stripe' to requirements.txt."
        ) from e
    return stripe


def _meta(obj, key, default=None):
    """Read a key from Stripe metadata.

    stripe.StripeObject is NOT a dict: calling .get() on it raises
    "'get' is a dict method, but a StripeObject is not a dict". Metadata must be
    converted with to_dict() first. Handle both shapes so mocked clients that
    return plain dicts also work.
    """
    if obj is None:
        return default
    if hasattr(obj, "to_dict"):
        obj = obj.to_dict()
    try:
        return obj.get(key, default)
    except AttributeError:
        return default


def _price_interval(price):
    """recurring.interval as a plain string ('month' / 'year'), or None."""
    recurring = getattr(price, "recurring", None)
    if recurring is None:
        return None
    if hasattr(recurring, "to_dict"):
        recurring = recurring.to_dict()
    try:
        return recurring.get("interval")
    except AttributeError:
        return None


def _code_value(plan):
    code = plan.code
    return str(code.value if hasattr(code, "value") else code)


def _tax_value(plan):
    cat = plan.tax_category
    return str(cat.value if hasattr(cat, "value") else cat)


def _amount_cents(value) -> int:
    """Decimal dollars -> integer minor units (cents), half-up.

    Stripe rejects float-derived amounts like 12.000000000000002, so rounding
    happens exactly once, here.
    """
    if value is None:
        raise ValueError("Cannot build a Stripe price from a NULL amount.")
    from decimal import Decimal, ROUND_HALF_UP
    return int((Decimal(str(value)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _find_or_create_product(stripe, plan):
    """Reuse this plan code's Product, or create it once.

    A Product is per plan CODE, not per catalog version: re-pricing v1 -> v2
    must reuse the same Product and only mint new Prices, otherwise every
    catalog version orphans another Stripe Product.
    """
    code = _code_value(plan)
    try:
        found = stripe.Product.search(
            query=f"metadata['zoiko_plan_code']:'{code}' AND active:'true'"
        )
        for product in found.data:
            if _meta(product.metadata, "zoiko_plan_code") == code:
                return product, False
    except Exception as exc:  # search is best-effort; create still works
        logger.warning("[stripe] product search failed for %s: %s", code, exc)

    product = stripe.Product.create(
        name=plan.name or code,
        description=plan.description,
        metadata={
            "zoiko_plan_code": code,
            "tax_category": _tax_value(plan),
        },
    )
    return product, True


def _sync_one_price(stripe, plan, product, interval, field):
    """Reconcile one interval's Price against the catalog amount.

    Returns (price_id, changed). `changed` is True when a new Price had to be
    minted, i.e. the catalog rate and Stripe had drifted apart.
    """
    amount_decimal = getattr(plan, field, None)

    if amount_decimal is None:
        # Plan is not priced for this interval (e.g. contract-priced Enterprise).
        # Archive any live self-serve price so it can never be checked out.
        existing_id = getattr(plan, _PRICE_ID_FIELD[interval], None)
        if existing_id:
            try:
                stripe.Price.modify(existing_id, active=False)
                logger.info("[stripe] archived %s price %s (plan now unpriced)",
                            interval, existing_id)
            except Exception as exc:
                logger.warning("[stripe] could not archive %s price %s: %s",
                               interval, existing_id, exc)
            setattr(plan, _PRICE_ID_FIELD[interval], None)
        return None, False

    want_cents = _amount_cents(amount_decimal)
    currency = (plan.currency or "USD").lower()
    current_id = getattr(plan, _PRICE_ID_FIELD[interval], None)

    # If we already track a price, verify it still matches the catalog amount.
    if current_id:
        try:
            existing = stripe.Price.retrieve(current_id)
            if (not existing.active
                    or existing.unit_amount != want_cents
                    or (existing.currency or "").lower() != currency
                    or _price_interval(existing) != interval):
                current_id = None  # unusable: drifted, archived, or wrong shape
        except Exception as exc:
            logger.warning("[stripe] could not verify %s price %s: %s",
                           interval, current_id, exc)
            current_id = None

    if current_id:
        return current_id, False  # already correct: true no-op

    # Drift (or first sync): Stripe Price amounts are immutable, so mint a new
    # Price and archive the superseded one. Existing subscribers keep their
    # grandfathered rate; new checkouts get the new one.
    old_id = getattr(plan, _PRICE_ID_FIELD[interval], None)
    price = stripe.Price.create(
        product=product.id,
        unit_amount=want_cents,
        currency=currency,
        recurring={"interval": interval},
        metadata={
            "zoiko_plan_code": _code_value(plan),
            "catalog_version": str(plan.catalog_version),
        },
    )
    if old_id and old_id != price.id:
        try:
            stripe.Price.modify(old_id, active=False)
            logger.info("[stripe] re-priced %s: archived %s -> %s (%s -> %s cents)",
                        _code_value(plan), old_id, price.id, old_id, want_cents)
        except Exception as exc:
            logger.warning("[stripe] archived-price cleanup failed for %s: %s",
                           old_id, exc)
    return price.id, True


def sync_plan_to_stripe(db: Session, plan, stripe_client=None) -> dict:
    """Idempotently reconcile this plan's Stripe Product + Prices with the
    catalog amounts, and write the resulting IDs back onto the plan.

    Safe to call repeatedly: a no-op when Stripe already matches. Returns a
    summary dict. No-op (logs) when Stripe is disabled.
    """
    if not stripe_enabled():
        logger.warning(_STRIPE_KEY_NOTE)
        return {"synced": False, "reason": "stripe_disabled"}

    stripe = stripe_client or _get_stripe_client()
    stripe.api_key = settings.STRIPE_SECRET_KEY

    product, created_product = _find_or_create_product(stripe, plan)

    ids, changed_intervals = {}, []
    for interval, field in _INTERVAL_BY_FIELD.items():
        price_id, changed = _sync_one_price(stripe, plan, product, interval, field)
        ids[interval] = price_id
        if changed:
            changed_intervals.append(interval)

    try:
        plan.stripe_product_id = product.id
        plan.stripe_monthly_price_id = ids.get("month")
        plan.stripe_annual_price_id = ids.get("year")
        db.commit()
    except Exception:
        db.rollback()
        # The plan is left without IDs rather than half-written; the next sync
        # re-derives them from Stripe.
        logger.exception("[stripe] DB write-back failed for plan=%s", _code_value(plan))
        raise

    logger.info(
        "[stripe] synced plan=%s version=%s product=%s(%s) monthly=%s annual=%s changed=%s",
        _code_value(plan), plan.catalog_version, product.id,
        "created" if created_product else "reused",
        ids.get("month"), ids.get("year"), changed_intervals or "none",
    )
    return {
        "synced": True,
        "product_id": product.id,
        "monthly_price_id": ids.get("month"),
        "annual_price_id": ids.get("year"),
        "changed": changed_intervals,
    }


def stripe_price_drift(plan, stripe_client=None):
    """Report catalog-vs-Stripe amount disagreement without writing anything.

    Returns {"month": {...}, "year": {...}} per interval; each entry is either
    {"status": "match"|"missing"|"mismatch"|"unpriced", ...}. Used by the
    checkout path to refuse charging a stale price, and by the admin page to
    surface drift.
    """
    result = {}
    if not stripe_enabled():
        return {i: {"status": "stripe_disabled"} for i in ("month", "year")}

    stripe = stripe_client or _get_stripe_client()
    stripe.api_key = settings.STRIPE_SECRET_KEY

    for interval, field in _INTERVAL_BY_FIELD.items():
        amount = getattr(plan, field, None)
        price_id = getattr(plan, _PRICE_ID_FIELD[interval], None)
        if amount is None:
            result[interval] = {"status": "unpriced", "price_id": price_id}
            continue
        if not price_id:
            result[interval] = {"status": "missing", "expected_cents": _amount_cents(amount)}
            continue
        try:
            live = stripe.Price.retrieve(price_id)
        except Exception as exc:
            result[interval] = {"status": "unreadable", "price_id": price_id,
                                "error": str(exc)}
            continue
        if not live.active:
            result[interval] = {"status": "archived", "price_id": price_id}
            continue
        if live.unit_amount != _amount_cents(amount):
            result[interval] = {
                "status": "mismatch", "price_id": price_id,
                "stripe_cents": live.unit_amount,
                "catalog_cents": _amount_cents(amount),
            }
            continue
        result[interval] = {"status": "match", "price_id": price_id,
                            "amount": live.unit_amount / 100}
    return result


def has_drift(plan, stripe_client=None) -> bool:
    """True when any interval would be charged a different amount than the
    catalog advertises (or the price is missing/archived)."""
    drift = stripe_price_drift(plan, stripe_client=stripe_client)
    return any(
        d.get("status") in {"mismatch", "missing", "archived", "unreadable"}
        for d in drift.values()
    )
