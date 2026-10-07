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


def _g(obj, key, default=None):
    """Read `key` from a dict, StripeObject, or plain object, returning
    `default` when absent.

    StripeObject deliberately does NOT subclass dict and raises AttributeError
    for `.get()`/`.keys()`, so index access (which raises KeyError) is the
    only probe that is safe across both shapes. Anything unexpected collapses
    to `default` — Stripe payload reading must never raise out of a webhook.
    """
    if obj is None:
        return default
    try:
        return obj[key]
    except Exception:
        return default


def _as_dict(value) -> dict:
    """Plain dict from a StripeObject / dict / anything else.

    StripeObject refuses `dict(...)` and `.get()` outright — it only offers
    `.to_dict()` — so metadata blocks must go through here or the read blows
    up on the first field access.
    """
    if not value:
        return {}
    if isinstance(value, dict):
        return dict(value)
    to_dict = getattr(value, "to_dict", None)
    if callable(to_dict):
        try:
            return to_dict() or {}
        except Exception:
            return {}
    return {}


def _price_id(value) -> str | None:
    """Stripe price id whether the price arrived expanded (object) or bare (str)."""
    if isinstance(value, str):
        return value
    return _g(value, "id")


def _stripe_error_cls(stripe_module):
    """Stripe's base exception class for this SDK version.

    `stripe.StripeError` is canonical; `stripe.error.StripeError` is the
    legacy alias that older versions require. Missing both falls back to
    `Exception` so the `except` clause is always well-formed.
    """
    cls = getattr(stripe_module, "StripeError", None)
    if cls is None:
        cls = _g(getattr(stripe_module, "error", None), "StripeError")
    return cls or Exception


def subscription_period(sub) -> tuple[int | None, int | None]:
    """Return (current_period_start, current_period_end) for a subscription.

    stripe-python >= 13 / API `2026-08-26.dahlia` moved these fields off the
    Subscription and onto each subscription item. Reading the removed
    top-level attribute raises AttributeError, which is NOT a StripeError and
    therefore escaped every `except StripeError` guard in this module —
    aborting `_handle_checkout_completed` mid-flight and leaving the org on
    its old plan after paying. Read both shapes defensively instead.
    """
    start = _g(sub, "current_period_start")
    end = _g(sub, "current_period_end")
    if start is None or end is None:
        first = (_g(_g(sub, "items"), "data") or [None])[0]
        if start is None:
            start = _g(first, "current_period_start")
        if end is None:
            end = _g(first, "current_period_end")
    return start, end


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
    customer_email: Optional[str] = None,
    org_id: int,
    success_url: str,
    cancel_url: str,
    metadata: Optional[dict] = None,
    subscription_metadata: Optional[dict] = None,
    client_reference_id: Optional[str] = None,
    quantity: int = 1,
    idempotency_key: Optional[str] = None,
) -> dict:
    """Create a Stripe Checkout Session. Returns dict with session ID + URL.

    `metadata` lands on the Checkout Session (read by
    `_handle_checkout_completed`). `subscription_metadata` lands on the Stripe
    Subscription *and* is mirrored onto its invoices
    (`invoice.subscription_details.metadata`), which is what lets
    invoice.paid / invoice.created be resolved to an organization before
    checkout.session.completed has been delivered.
    """
    stripe = get_stripe()
    err_cls = _stripe_error_cls(stripe)
    session_metadata = {"organization_id": str(org_id), **(metadata or {})}
    params = {
        "line_items": [{"price": price_id, "quantity": quantity}],
        "mode": mode,
        "success_url": success_url,
        "cancel_url": cancel_url,
        "metadata": session_metadata,
        "client_reference_id": client_reference_id or str(org_id),
    }
    if customer_id:
        params["customer"] = customer_id
    elif customer_email:
        # Allowed only when no customer is attached; needed so invoices raised
        # during checkout carry an address even before the customer is known.
        params["customer_email"] = customer_email
    if subscription_metadata:
        params["subscription_data"] = {
            "metadata": {"organization_id": str(org_id), **subscription_metadata},
        }

    try:
        kwargs = {}
        if idempotency_key:
            kwargs["idempotency_key"] = idempotency_key
        session = stripe.checkout.Session.create(**params, **kwargs)
        return {
            "checkout_session_id": session.id,
            "checkout_url": session.url,
            "status": getattr(session, "status", None),
            "payment_status": getattr(session, "payment_status", None),
            "subscription_id": _g(session, "subscription"),
            "customer_id": _g(session, "customer"),
        }
    except err_cls as e:
        logger.error("[stripe] Checkout session creation failed: %s", e)
        raise RuntimeError(f"Stripe checkout session failed: {e}") from e


def ensure_customer(
    *,
    org_id: int,
    email: Optional[str] = None,
    name: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> str:
    """Create a Stripe Customer tagged with `metadata.organization_id`.

    Called BEFORE opening Checkout so the organization's ProviderRef already
    holds the customer id. Stripe does not guarantee webhook ordering, so
    invoice.paid can arrive ahead of checkout.session.completed — with the
    customer pre-created, that early invoice is still resolvable to an org
    instead of being dropped as "no matching org".
    """
    stripe = get_stripe()
    err_cls = _stripe_error_cls(stripe)
    params: dict = {"metadata": {"organization_id": str(org_id), **(metadata or {})}}
    if email:
        params["email"] = email
    if name:
        params["name"] = name
    try:
        customer = stripe.Customer.create(**params)
    except err_cls as e:
        logger.error("[stripe] Customer creation failed for org %d: %s", org_id, e)
        raise RuntimeError(f"Stripe customer creation failed: {e}") from e
    return customer.id


def retrieve_checkout_session(checkout_session_id: str) -> dict:
    """Retrieve a Stripe Checkout Session as a plain dict.

    Used by the post-redirect confirm endpoint so a browser returning from
    Stripe can settle local state even when webhooks cannot reach the host
    (localhost / no ingress)."""
    stripe = get_stripe()
    err_cls = _stripe_error_cls(stripe)
    try:
        session = stripe.checkout.Session.retrieve(checkout_session_id)
    except err_cls as e:
        logger.error("[stripe] Failed to retrieve checkout session %s: %s", checkout_session_id, e)
        raise RuntimeError(f"Stripe checkout session retrieval failed: {e}") from e
    return {
        "id": _g(session, "id"),
        "status": _g(session, "status"),
        "payment_status": _g(session, "payment_status"),
        "subscription_id": _g(session, "subscription"),
        "customer_id": _g(session, "customer"),
        "customer_email": _g(_g(session, "customer_details"), "email") or _g(session, "customer_email"),
        "metadata": _as_dict(_g(session, "metadata")),
        "subscription_metadata": _as_dict(_g(_g(session, "subscription_details"), "metadata")),
        "amount_total": _g(session, "amount_total"),
        "currency": _g(session, "currency"),
    }


def modify_subscription_price(
    *,
    subscription_id: str,
    new_price_id: str,
    quantity: int = 1,
    proration_behavior: str = "always_invoice",
    payment_behavior: str = "error_if_incomplete",
    idempotency_key: Optional[str] = None,
) -> dict:
    """Swap the price on an existing subscription instead of opening a second one.

    Opening a fresh Checkout Session for an org that already subscribes creates
    TWO Stripe subscriptions and double-bills the customer. Changing the price
    in place prorates the difference onto a single invoice, which is what a
    "plan upgrade" means commercially.

    Returns the normalized subscription dict (same shape as
    `retrieve_subscription`) plus `unchanged` so the caller can tell a
    no-op (already on this price) from a real change.

    `payment_behavior="error_if_incomplete"` makes the update all-or-nothing: if
    the prorated invoice cannot be paid, Stripe rejects the whole change and
    the customer's plan is left as it was instead of silently repriced while
    the payment sits unpaid.
    """
    stripe = get_stripe()
    err_cls = _stripe_error_cls(stripe)
    kwargs = {}
    if idempotency_key:
        kwargs["idempotency_key"] = idempotency_key
    try:
        current = stripe.Subscription.retrieve(subscription_id)
        items = _g(_g(current, "items"), "data") or []
        if not items:
            raise RuntimeError(
                f"Stripe subscription {subscription_id} has no items to modify."
            )

        start, end = subscription_period(current)
        current_items = [
            {
                "price_id": _price_id(_g(item, "price")),
                "quantity": _g(item, "quantity"),
                "current_period_start": _g(item, "current_period_start", start),
                "current_period_end": _g(item, "current_period_end", end),
            }
            for item in items
        ]

        # Already on this price: nothing to change. Charging anyway would be a
        # duplicate invoice for a period the customer is already paying for.
        if current_items[0]["price_id"] == new_price_id:
            return {
                "id": _g(current, "id") or subscription_id,
                "status": _g(current, "status"),
                "current_period_start": start,
                "current_period_end": end,
                "cancel_at_period_end": _g(current, "cancel_at_period_end"),
                "latest_invoice": _g(current, "latest_invoice"),
                "items": current_items,
                "unchanged": True,
            }

        updated = stripe.Subscription.modify(
            subscription_id,
            items=[{"id": _g(items[0], "id"), "price": new_price_id, "quantity": quantity}],
            proration_behavior=proration_behavior,
            payment_behavior=payment_behavior,
            **kwargs,
        )
    except err_cls as e:
        logger.error("[stripe] Price change failed for %s: %s", subscription_id, e)
        raise RuntimeError(f"Stripe plan change failed: {e}") from e

    start, end = subscription_period(updated)
    updated_items = _g(_g(updated, "items"), "data") or []
    return {
        "id": _g(updated, "id") or subscription_id,
        "status": _g(updated, "status"),
        "current_period_start": start,
        "current_period_end": end,
        "cancel_at_period_end": _g(updated, "cancel_at_period_end"),
        "latest_invoice": _g(updated, "latest_invoice"),
        "items": [
            {
                "price_id": _price_id(_g(item, "price")),
                "quantity": _g(item, "quantity"),
                "current_period_start": _g(item, "current_period_start", start),
                "current_period_end": _g(item, "current_period_end", end),
            }
            for item in updated_items
        ],
        "unchanged": False,
    }


def retrieve_subscription(stripe_subscription_id: str) -> dict:
    """Retrieve a Stripe subscription as a plain dict."""
    stripe = get_stripe()
    err_cls = _stripe_error_cls(stripe)
    try:
        sub = stripe.Subscription.retrieve(stripe_subscription_id)
        start, end = subscription_period(sub)
        return {
            "id": sub.id,
            "status": sub.status,
            "current_period_start": start,
            "current_period_end": end,
            "cancel_at_period_end": sub.cancel_at_period_end,
            "latest_invoice": _g(sub, "latest_invoice"),
            "items": [
                {
                    "price_id": _price_id(_g(item, "price")),
                    "quantity": item.quantity,
                    "current_period_start": _g(item, "current_period_start", start),
                    "current_period_end": _g(item, "current_period_end", end),
                }
                for item in sub.items.data
            ],
        }
    except err_cls as e:
        logger.error("[stripe] Failed to retrieve subscription %s: %s", stripe_subscription_id, e)
        raise RuntimeError(f"Stripe subscription retrieval failed: {e}") from e
    except Exception as e:
        # Any non-Stripe failure (e.g. a payload shape this SDK version stopped
        # returning) is logged with context instead of propagating as an
        # unhandled AttributeError out of a webhook handler.
        logger.error(
            "[stripe] Failed to normalize subscription %s: %s", stripe_subscription_id, e
        )
        raise RuntimeError(f"Stripe subscription normalization failed: {e}") from e


def retrieve_invoice(stripe_invoice_id: str) -> dict:
    """Retrieve a Stripe invoice as a plain dict."""
    stripe = get_stripe()
    err_cls = _stripe_error_cls(stripe)
    try:
        inv = stripe.Invoice.retrieve(stripe_invoice_id)
        return {
            "id": inv.id,
            "status": _g(inv, "status"),
            "amount_due": _g(inv, "amount_due"),
            "amount_paid": _g(inv, "amount_paid"),
            "currency": _g(inv, "currency"),
            "hosted_invoice_url": _g(inv, "hosted_invoice_url"),
            "invoice_pdf": _g(inv, "invoice_pdf"),
            "period_start": _g(inv, "period_start"),
            "period_end": _g(inv, "period_end"),
        }
    except err_cls as e:
        logger.error("[stripe] Failed to retrieve invoice %s: %s", stripe_invoice_id, e)
        raise RuntimeError(f"Stripe invoice retrieval failed: {e}") from e
    except Exception as e:
        logger.error("[stripe] Failed to normalize invoice %s: %s", stripe_invoice_id, e)
        raise RuntimeError(f"Stripe invoice normalization failed: {e}") from e


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
    only relevant for mid-cycle changes.

    Preview only — `Invoice.upcoming` already applies the proposed change, so
    no subscription is ever created or modified here.
    """
    stripe = get_stripe()
    err_cls = _stripe_error_cls(stripe)
    try:
        sub = stripe.Subscription.retrieve(subscription_id)
        items = _g(_g(sub, "items"), "data") or []
        old_price_id = _price_id(_g(items[0], "price")) if items else None
        now_ts = int(time.time())

        upcoming = stripe.Invoice.upcoming(
            customer=_g(sub, "customer"),
            subscription=subscription_id,
            subscription_items=[{
                "id": _g(items[0], "id"),
                "price": new_price_id,
                "quantity": quantity,
            }],
            subscription_proration_date=now_ts,
        )

        start, end = subscription_period(sub)
        return {
            "old_price_id": old_price_id,
            "new_price_id": new_price_id,
            "current_period_start": start,
            "current_period_end": end,
            "proration_date": now_ts,
            "amount_due": _g(upcoming, "amount_due"),
            "amount_credit": _g(upcoming, "starting_balance", 0),
            "lines": [
                {
                    "description": _g(line, "description"),
                    "amount": _g(line, "amount"),
                    "quantity": _g(line, "quantity"),
                    "proration": _g(line, "proration"),
                }
                for line in (_g(_g(upcoming, "lines"), "data") or [])
            ],
        }
    except err_cls as e:
        logger.error("[stripe] Proration preview failed for %s: %s", subscription_id, e)
        raise RuntimeError(f"Stripe proration preview failed: {e}") from e
    except Exception as e:
        logger.error("[stripe] Proration preview normalization failed for %s: %s", subscription_id, e)
        raise RuntimeError(f"Stripe proration preview failed: {e}") from e


# ── Refund Creation (Section 12 I3) ───────────────────────────────────────

def payment_intent_for_invoice(invoice_id: str) -> Optional[str]:
    """The PaymentIntent that paid an invoice, or None if it was not paid by card (e.g. a zero-amount invoice).

    Stripe API versions from 2025-03 removed `invoice.payment_intent` / `invoice.charge`; the payment now hangs
    off `invoice.payments`. Older API versions are still read through the old attributes."""
    stripe = get_stripe()
    invoice = stripe.Invoice.retrieve(invoice_id, expand=["payments"])

    def _get(obj, key):
        try:
            return obj[key]
        except Exception:
            return getattr(obj, key, None)

    legacy = _get(invoice, "payment_intent")
    if legacy:
        return legacy if isinstance(legacy, str) else _get(legacy, "id")
    payments = _get(invoice, "payments")
    for item in (_get(payments, "data") or []) if payments else []:
        payment = _get(item, "payment") or {}
        if _get(payment, "type") == "payment_intent" and _get(payment, "payment_intent"):
            pi = _get(payment, "payment_intent")
            return pi if isinstance(pi, str) else _get(pi, "id")
    return None


def cancel_and_refund_duplicate_subscription(duplicate_subscription_id: str) -> dict:
    """Undo an accidental second subscription: cancel it and refund what it charged. Used when a customer
    completes two Checkout sessions (two tabs, a double click) and would otherwise be billed twice every month."""
    stripe = get_stripe()
    sub = stripe.Subscription.retrieve(duplicate_subscription_id)
    latest = getattr(sub, "latest_invoice", None)
    latest_id = latest if isinstance(latest, str) or latest is None else latest.id
    payment_intent = payment_intent_for_invoice(latest_id) if latest_id else None
    stripe.Subscription.cancel(duplicate_subscription_id)
    refund_id = None
    if payment_intent:
        refund = stripe.Refund.create(payment_intent=payment_intent, reason="duplicate",
                                      idempotency_key=f"duplicate_{duplicate_subscription_id}")
        refund_id = refund.id
    return {"cancelled": duplicate_subscription_id, "refund_id": refund_id}


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
    err_cls = _stripe_error_cls(stripe)
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
    except err_cls as e:
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
    err_cls = _stripe_error_cls(stripe)
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
    except err_cls as e:
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
    err_cls = _stripe_error_cls(stripe)
    try:
        sub = stripe.Subscription.retrieve(subscription_id)
        items = _g(_g(sub, "items"), "data") or []
        now_ts = proration_date or int(time.time())
        upcoming = stripe.Invoice.upcoming(
            customer=customer_id,
            subscription=subscription_id,
            subscription_items=[{
                "id": _g(items[0], "id") if items else None,
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
    except err_cls as e:
        logger.error("[stripe] Upcoming invoice retrieval failed: %s", e)
        raise RuntimeError(f"Stripe upcoming invoice retrieval failed: {e}") from e


# ── Payment-method validity (Prompt 6 self-serve reactivate) ───────────────

def payment_method_valid(*, customer_id: Optional[str] = None) -> bool:
    """Return True when the customer has a chargeable default payment method on
    file. Used by /billing/me/reactivate so a canceled subscription is not
    resurrected without a card that can be charged (Section 13 H2).

    - No customer_id -> False (nothing to charge).
    - Stripe disabled (no test key) -> True (skip the gate in non-Stripe mode);
      callers should therefore only rely on this when stripe_enabled() is True.
    - Otherwise retrieves the customer's default_source / invoice_settings and
      returns whether a usable payment method exists.
    Errors are treated as False (fail-closed): never resurrect billing when we
    cannot confirm a payment method.
    """
    if not customer_id:
        return False
    if not stripe_enabled():
        return True
    stripe = get_stripe()
    err_cls = _stripe_error_cls(stripe)
    try:
        customer = stripe.Customer.retrieve(customer_id)
        if customer is None or getattr(customer, "deleted", False):
            return False
        def_pm = (
            getattr(customer, "invoice_settings", None)
            and getattr(customer.invoice_settings, "default_payment_method", None)
        )
        default_source = getattr(customer, "default_source", None)
        return bool(def_pm or default_source)
    except Exception as e:
        logger.error("[stripe] payment_method_valid failed for %s: %s", customer_id, e)
        return False
