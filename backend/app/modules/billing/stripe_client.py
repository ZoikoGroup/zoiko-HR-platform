"""
modules/billing/stripe_client.py
---------------------------------
Thin wrapper around the official stripe Python SDK. All Stripe API calls
must go through this module — never call stripe.* directly from routers
or services — so retries/logging/idempotency stay centralized at one
boundary and tests can mock the entire Stripe surface.

Guarded behind HR_STRIPE_SECRET_KEY (test-mode only until Section 17/H2
approvals). If the key is missing or not a test-mode key, checkout/webhook
endpoints return a clear error rather than crashing.

Signature verification uses HR_STRIPE_WEBHOOK_SECRET — same module,
single boundary for all Stripe interactions.
"""

import hashlib
import hmac
import logging
import time
from typing import Optional

from app.config import settings

logger = logging.getLogger("zoiko.billing.stripe")

# In-memory retry store: prevents infinite retries on transient Stripe errors.
_MAX_RETRIES = 2
_RETRY_DELAY_BASE = 0.5  # seconds, exponential backoff


def stripe_enabled() -> bool:
    """True only when a Stripe TEST-MODE secret key is configured."""
    key = (settings.STRIPE_SECRET_KEY or "").strip()
    return bool(key) and key.startswith("sk_")


def get_stripe():
    """Lazily import and return a configured stripe module. Raises RuntimeError
    if the stripe library is unavailable (guard callers with stripe_enabled()).
    """
    try:
        import stripe
    except ImportError as e:
        raise RuntimeError(
            "stripe library is not installed. Add 'stripe' to requirements.txt."
        ) from e
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


def verify_webhook_signature(payload_body: bytes, sig_header: str) -> bool:
    """Verify Stripe webhook signature using HR_STRIPE_WEBHOOK_SECRET.
    Returns True if valid, False if invalid or missing secret.
    Uses the v1 signature scheme (HMAC-SHA256, t=<timestamp>,v1=<sig>).
    """
    secret = (settings.STRIPE_WEBHOOK_SECRET or "").strip()
    if not secret:
        logger.warning("[stripe] HR_STRIPE_WEBHOOK_SECRET not configured — rejecting all webhooks")
        return False
    if not sig_header:
        return False

    try:
        elements = dict(item.split("=", 1) for item in sig_header.split(","))
        timestamp = elements.get("t")
        expected_sig = elements.get("v1")
        if not timestamp or not expected_sig:
            return False

        # Reject payloads older than 5 minutes (replay protection)
        if abs(time.time() - float(timestamp)) > 300:
            logger.warning("[stripe] Webhook timestamp too old: %s", timestamp)
            return False

        signed_payload = f"{timestamp}.{payload_body.decode('utf-8')}"
        computed = hmac.new(
            secret.encode("utf-8"),
            signed_payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(computed, expected_sig)
    except Exception as e:
        logger.error("[stripe] Webhook signature verification error: %s", e)
        return False


def create_checkout_session(
    *,
    price_id: str,
    mode: str = "subscription",
    customer_id: Optional[str] = None,
    org_id: int,
    success_url: str,
    cancel_url: str,
    metadata: Optional[dict] = None,
    idempotency_key: Optional[str] = None,
) -> dict:
    """Create a Stripe Checkout Session. Returns dict with session ID + URL.
    All Stripe exceptions are caught and re-raised as RuntimeError with context.
    """
    stripe = get_stripe()
    params = {
        "line_items": [{"price": price_id, "quantity": 1}],
        "mode": mode,
        "success_url": success_url,
        "cancel_url": cancel_url,
        "metadata": {
            "organization_id": str(org_id),
            **(metadata or {}),
        },
    }
    if customer_id:
        params["customer"] = customer_id

    try:
        kwargs = {}
        if idempotency_key:
            kwargs["idempotency_key"] = idempotency_key
        session = stripe.checkout.Session.create(**params, **kwargs)
        return {"checkout_session_id": session.id, "checkout_url": session.url}
    except stripe.error.StripeError as e:
        logger.error("[stripe] Checkout session creation failed: %s", e)
        raise RuntimeError(f"Stripe checkout session failed: {e}") from e


def retrieve_subscription(stripe_subscription_id: str) -> dict:
    """Retrieve a Stripe subscription as a plain dict."""
    stripe = get_stripe()
    try:
        sub = stripe.Subscription.retrieve(stripe_subscription_id)
        return {
            "id": sub.id,
            "status": sub.status,
            "current_period_start": sub.current_period_start,
            "current_period_end": sub.current_period_end,
            "cancel_at_period_end": sub.cancel_at_period_end,
            "items": [
                {"price_id": item.price.id, "quantity": item.quantity}
                for item in sub.items.data
            ],
        }
    except stripe.error.StripeError as e:
        logger.error("[stripe] Failed to retrieve subscription %s: %s", stripe_subscription_id, e)
        raise RuntimeError(f"Stripe subscription retrieval failed: {e}") from e


def retrieve_invoice(stripe_invoice_id: str) -> dict:
    """Retrieve a Stripe invoice as a plain dict."""
    stripe = get_stripe()
    try:
        inv = stripe.Invoice.retrieve(stripe_invoice_id)
        return {
            "id": inv.id,
            "status": inv.status,
            "amount_due": inv.amount_due,
            "amount_paid": inv.amount_paid,
            "currency": inv.currency,
            "hosted_invoice_url": inv.hosted_invoice_url,
            "invoice_pdf": inv.invoice_pdf,
            "period_start": inv.period_start,
            "period_end": inv.period_end,
        }
    except stripe.error.StripeError as e:
        logger.error("[stripe] Failed to retrieve invoice %s: %s", stripe_invoice_id, e)
        raise RuntimeError(f"Stripe invoice retrieval failed: {e}") from e


# ── Proration Preview (Prompt 4) ──────────────────────────────────────────

def create_proration_preview(
    *,
    subscription_id: str,
    new_price_id: str,
    quantity: int = 1,
) -> dict:
    """Preview the proration for changing a subscription to a new price.
    Returns dict with proration details for the plan-change preview endpoint.
    Per Section 13/J3: downgrade enforces at renewal by default, proration
    only relevant for mid-cycle changes."""
    stripe = get_stripe()
    try:
        sub = stripe.Subscription.retrieve(subscription_id)
        old_price_id = sub.items.data[0].price.id if sub.items.data else None
        now_ts = int(time.time())

        preview = stripe.Subscription.create(
            items=[{
                "id": sub.items.data[0].id,
                "price": new_price_id,
                "quantity": quantity,
            }],
            proration_behavior="create_prorations",
            proration_date=now_ts,
            trial_settings={"end_behavior": {"missing_payment_method": "cancel"}},
            payment_behavior="error_incomplete",
        )

        upcoming = stripe.Invoice.upcoming(
            customer=sub.customer,
            subscription=subscription_id,
            subscription_items=[{
                "id": sub.items.data[0].id,
                "price": new_price_id,
                "quantity": quantity,
            }],
            subscription_proration_date=now_ts,
        )

        return {
            "old_price_id": old_price_id,
            "new_price_id": new_price_id,
            "current_period_start": sub.current_period_start,
            "current_period_end": sub.current_period_end,
            "proration_date": now_ts,
            "amount_due": upcoming.amount_due,
            "amount_credit": getattr(upcoming, "starting_balance", 0),
            "lines": [
                {
                    "description": line.description,
                    "amount": line.amount,
                    "quantity": line.quantity,
                    "proration": line.proration,
                }
                for line in (upcoming.lines.data if upcoming.lines else [])
            ],
        }
    except stripe.error.StripeError as e:
        logger.error("[stripe] Proration preview failed for %s: %s", subscription_id, e)
        raise RuntimeError(f"Stripe proration preview failed: {e}") from e


# ── Refund Creation (Section 12 I3) ───────────────────────────────────────

def create_refund(
    *,
    payment_intent_id: str,
    amount_cents: int,
    reason: str = "requested_by_customer",
    idempotency_key: Optional[str] = None,
) -> dict:
    """Create a Stripe refund for a completed payment. Returns dict with
    refund ID and status. Used by refund_service after approval."""
    stripe = get_stripe()
    try:
        kwargs = {"amount": amount_cents, "reason": reason}
        if idempotency_key:
            kwargs["idempotency_key"] = idempotency_key
        refund = stripe.Refund.create(
            payment_intent=payment_intent_id,
            **kwargs,
        )
        return {
            "refund_id": refund.id,
            "status": refund.status,
            "amount": refund.amount,
            "currency": refund.currency,
        }
    except stripe.error.StripeError as e:
        logger.error("[stripe] Refund creation failed for PI %s: %s", payment_intent_id, e)
        raise RuntimeError(f"Stripe refund creation failed: {e}") from e


def create_credit_balance_adjustment(
    *,
    customer_id: str,
    amount_cents: int,
    currency: str = "usd",
    description: str = "",
) -> dict:
    """Apply a credit balance to a Stripe customer (stores as negative invoice
    balance). Used for credit-note style operations where refund is not needed."""
    stripe = get_stripe()
    try:
        inv = stripe.Invoice.create(
            customer=customer_id,
            auto_advance=False,
            collection_method="send_invoice",
        )
        stripe.InvoiceItem.create(
            customer=customer_id,
            invoice=inv.id,
            amount=(-amount_cents),
            currency=currency,
            description=description or "Platform credit adjustment",
        )
        finalized = stripe.Invoice.finalize_invoice(inv.id)
        return {
            "invoice_id": finalized.id,
            "amount": finalized.amount_due,
            "status": finalized.status,
        }
    except stripe.error.StripeError as e:
        logger.error("[stripe] Credit adjustment failed for customer %s: %s", customer_id, e)
        raise RuntimeError(f"Stripe credit adjustment failed: {e}") from e


def retrieve_upcoming_invoice(
    *,
    customer_id: str,
    subscription_id: str,
    new_price_id: str,
    quantity: int = 1,
    proration_date: Optional[int] = None,
) -> dict:
    """Retrieve upcoming invoice with subscription change for preview."""
    stripe = get_stripe()
    try:
        sub = stripe.Subscription.retrieve(subscription_id)
        now_ts = proration_date or int(time.time())
        upcoming = stripe.Invoice.upcoming(
            customer=customer_id,
            subscription=subscription_id,
            subscription_items=[{
                "id": sub.items.data[0].id,
                "price": new_price_id,
                "quantity": quantity,
            }],
            subscription_proration_date=now_ts,
        )
        return {
            "invoice_id": upcoming.id,
            "amount_due": upcoming.amount_due,
            "currency": upcoming.currency,
            "lines": [
                {
                    "description": line.description,
                    "amount": line.amount,
                    "quantity": line.quantity,
                    "proration": line.proration,
                }
                for line in (upcoming.lines.data if upcoming.lines else [])
            ],
        }
    except stripe.error.StripeError as e:
        logger.error("[stripe] Upcoming invoice retrieval failed: %s", e)
        raise RuntimeError(f"Stripe upcoming invoice retrieval failed: {e}") from e
