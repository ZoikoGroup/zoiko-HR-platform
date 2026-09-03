"""
modules/billing/webhook_service.py
-----------------------------------
Stripe webhook event handling with replay protection (event inbox),
signature verification, and BillingSubscription state transitions.

Event Inbox (Section 20 replay protection / Section 22
BILLING_COUNT_DISCREPANCY guardrail):
  - Every incoming event is logged to billing_webhook_events keyed by
    Stripe's event ID.
  - Duplicate event IDs are always no-ops.
  - Unhandled event types are logged for review, never silently dropped.

Each handled event must:
  1. Transition BillingSubscription.status correctly
  2. Write a billing_audit_logs row with source="stripe_webhook" and the
     Stripe event ID for traceability
"""

import json
import logging
from datetime import datetime

from sqlalchemy.orm import Session

from app.modules.billing.models import (
    BillingAuditAction,
    BillingAuditLog,
    BillingInvoice,
    BillingSubscription,
    BillingWebhookEvent,
    ProviderRef,
    SubscriptionStatus,
    BillingPlan,
)
from app.modules.billing import service as billing_service
from app.modules.billing.stripe_client import retrieve_subscription, retrieve_invoice

logger = logging.getLogger("zoiko.billing.stripe")

# Map Stripe subscription statuses → local SubscriptionStatus
_STRIPE_STATUS_MAP = {
    "active": SubscriptionStatus.ACTIVE,
    "past_due": SubscriptionStatus.PAST_DUE,
    "canceled": SubscriptionStatus.CANCELED,
    "unpaid": SubscriptionStatus.RESTRICTED,
    "incomplete": SubscriptionStatus.EVALUATION,
    "incomplete_expired": SubscriptionStatus.EVALUATION,
    "trialing": SubscriptionStatus.ACTIVE,
    "paused": SubscriptionStatus.SUSPENDED,
}


def process_webhook_event(db: Session, event: dict) -> dict:
    """Process a Stripe webhook event. Returns {"status": "ok"|"skipped"|"error", ...}.
    This is the single entry point — called after signature verification passes.
    """
    event_id = event.get("id")
    event_type = event.get("type")
    data_object = event.get("data", {}).get("object", {})

    if not event_id or not event_type:
        logger.error("[webhook] Malformed event — missing id or type")
        return {"status": "error", "message": "malformed event"}

    # ── Event inbox: duplicate check ──────────────────────────────────────
    existing = db.query(BillingWebhookEvent).filter(
        BillingWebhookEvent.stripe_event_id == event_id
    ).first()
    if existing:
        logger.info("[webhook] Duplicate event %s (type=%s) — skipping", event_id, event_type)
        return {"status": "skipped", "message": "duplicate event"}

    # ── Record event in inbox ─────────────────────────────────────────────
    webhook_event = BillingWebhookEvent(
        stripe_event_id=event_id,
        event_type=event_type,
        processed=False,
        payload=event,
    )
    db.add(webhook_event)
    db.flush()

    # ── Route to handler ──────────────────────────────────────────────────
    try:
        handler = _HANDLERS.get(event_type)
        if handler:
            result = handler(db, event_id, data_object, event)
            webhook_event.processed = True
            webhook_event.processed_at = datetime.utcnow()
        else:
            logger.warning(
                "[webhook] Unhandled event type=%s id=%s — logged for review",
                event_type, event_id,
            )
            _log_unhandled_event(db, event_id, event_type, event)
            webhook_event.processed = True
            webhook_event.processed_at = datetime.utcnow()
            result = {"status": "ok", "message": "unhandled — logged"}

        db.commit()
        return result

    except Exception as e:
        webhook_event.error_message = str(e)[:500]
        db.commit()
        logger.error("[webhook] Error processing event %s: %s", event_id, e, exc_info=True)
        return {"status": "error", "message": str(e)}


# ── Event Handlers ─────────────────────────────────────────────────────────

def _handle_checkout_completed(db, event_id, data, full_event):
    """checkout.session.completed — mark org as active after successful checkout.
    This is the evaluation→commercial conversion via self-serve Stripe Checkout."""
    org_id = int(data.get("metadata", {}).get("organization_id", 0))
    subscription_id = data.get("subscription")
    customer_id = data.get("customer")

    if not org_id:
        logger.warning("[webhook] checkout.session.completed missing org_id metadata")
        return {"status": "error", "message": "missing org_id in metadata"}

    subscription = billing_service.get_or_create_subscription(db, org_id)

    # Update provider refs
    _upsert_provider_ref(db, org_id, stripe_customer_id=customer_id, stripe_subscription_id=subscription_id)

    # Fetch subscription details from Stripe
    stripe_sub = None
    if subscription_id:
        try:
            stripe_sub = retrieve_subscription(subscription_id)
        except Exception as e:
            logger.warning("[webhook] Could not retrieve Stripe subscription %s: %s", subscription_id, e)

    if stripe_sub:
        mapped_status = _STRIPE_STATUS_MAP.get(stripe_sub["status"], SubscriptionStatus.ACTIVE)
        _transition_subscription(db, subscription, mapped_status, event_id, "checkout.session.completed")

        # Update subscription billing details from Stripe items
        items = stripe_sub.get("items", [])
        if items:
            price_id = items[0].get("price_id")
            quantity = items[0].get("quantity")
            plan = _find_plan_by_stripe_price(db, price_id)
            if plan:
                subscription.plan_id = plan.id
                subscription.plan_code = plan.code
                subscription.billing_metric = plan.billing_metric
            if quantity is not None:
                subscription.quantity = quantity

        # Set billing_channel to WEB_STRIPE
        from app.modules.billing.models import BillingChannel
        subscription.billing_channel = BillingChannel.WEB_STRIPE

        subscription.service_start_at = datetime.utcnow()
        db.commit()

    _log_audit(
        db,
        organization_id=org_id,
        action=BillingAuditAction.SUBSCRIPTION_ACTIVATED,
        entity_type="BillingSubscription",
        entity_id=subscription.id,
        before={"status": "evaluation"},
        after={"status": subscription.status.value if subscription.status else None},
        source="stripe_webhook",
        stripe_event_id=event_id,
    )

    return {"status": "ok", "message": "checkout completed"}


def _handle_subscription_updated(db, event_id, data, full_event):
    """customer.subscription.updated — sync status changes from Stripe."""
    stripe_sub_id = data.get("id")
    if not stripe_sub_id:
        return {"status": "error", "message": "missing subscription id"}

    provider_ref = db.query(ProviderRef).filter(
        ProviderRef.stripe_subscription_id == stripe_sub_id
    ).first()
    if not provider_ref:
        logger.warning("[webhook] subscription.updated for unknown subscription %s", stripe_sub_id)
        return {"status": "ok", "message": "no matching provider ref"}

    subscription = db.query(BillingSubscription).filter(
        BillingSubscription.organization_id == provider_ref.organization_id
    ).first()
    if not subscription:
        return {"status": "ok", "message": "no matching subscription"}

    old_status = subscription.status.value if subscription.status else None
    stripe_status = data.get("status", "")
    mapped_status = _STRIPE_STATUS_MAP.get(stripe_status)
    if mapped_status:
        _transition_subscription(db, subscription, mapped_status, event_id, "customer.subscription.updated")

    # Sync quantity from Stripe
    items = data.get("items", {}).get("data", [])
    if items:
        quantity = items[0].get("quantity")
        if quantity is not None:
            subscription.quantity = quantity

    # Sync cancel_at_period_end
    cancel_at_period_end = data.get("cancel_at_period_end", False)
    if cancel_at_period_end and subscription.status != SubscriptionStatus.CANCEL_AT_PERIOD_END:
        subscription.status = SubscriptionStatus.CANCEL_AT_PERIOD_END

    _upsert_provider_ref(
        db,
        provider_ref.organization_id,
        stripe_latest_invoice_id=data.get("latest_invoice"),
    )

    _log_audit(
        db,
        organization_id=provider_ref.organization_id,
        action=BillingAuditAction.SUBSCRIPTION_STATUS_CHANGED,
        entity_type="BillingSubscription",
        entity_id=subscription.id,
        before={"status": old_status},
        after={"status": subscription.status.value if subscription.status else None},
        source="stripe_webhook",
        stripe_event_id=event_id,
    )

    return {"status": "ok", "message": "subscription updated"}


def _handle_subscription_deleted(db, event_id, data, full_event):
    """customer.subscription.deleted — mark subscription as canceled."""
    stripe_sub_id = data.get("id")
    provider_ref = db.query(ProviderRef).filter(
        ProviderRef.stripe_subscription_id == stripe_sub_id
    ).first()
    if not provider_ref:
        logger.warning("[webhook] subscription.deleted for unknown subscription %s", stripe_sub_id)
        return {"status": "ok", "message": "no matching provider ref"}

    subscription = db.query(BillingSubscription).filter(
        BillingSubscription.organization_id == provider_ref.organization_id
    ).first()
    if not subscription:
        return {"status": "ok", "message": "no matching subscription"}

    _transition_subscription(
        db, subscription, SubscriptionStatus.CANCELED, event_id, "customer.subscription.deleted"
    )

    _log_audit(
        db,
        organization_id=provider_ref.organization_id,
        action=BillingAuditAction.SUBSCRIPTION_DELETED,
        entity_type="BillingSubscription",
        entity_id=subscription.id,
        before={"status": "active"},
        after={"status": "canceled"},
        source="stripe_webhook",
        stripe_event_id=event_id,
    )

    return {"status": "ok", "message": "subscription deleted"}


def _handle_invoice_paid(db, event_id, data, full_event):
    """invoice.paid — record payment, ensure subscription is active."""
    stripe_invoice_id = data.get("id")
    customer_id = data.get("customer")
    subscription_id = data.get("subscription")

    # Find org by customer or subscription
    org_id = _find_org_by_stripe_ids(db, customer_id=customer_id, subscription_id=subscription_id)
    if not org_id:
        logger.warning("[webhook] invoice.paid for unknown customer/subscription")
        return {"status": "ok", "message": "no matching org"}

    _upsert_invoice(db, org_id, data)
    _upsert_provider_ref(db, org_id, stripe_latest_invoice_id=stripe_invoice_id)

    # Ensure subscription is active after payment
    subscription = db.query(BillingSubscription).filter(
        BillingSubscription.organization_id == org_id
    ).first()
    if subscription and subscription.status == SubscriptionStatus.PAST_DUE:
        _transition_subscription(
            db, subscription, SubscriptionStatus.ACTIVE, event_id, "invoice.paid"
        )

    _log_audit(
        db,
        organization_id=org_id,
        action=BillingAuditAction.INVOICE_PAID,
        entity_type="BillingInvoice",
        entity_id=None,
        before=None,
        after={
            "stripe_invoice_id": stripe_invoice_id,
            "amount_paid_cents": data.get("amount_paid", 0),
        },
        source="stripe_webhook",
        stripe_event_id=event_id,
    )

    return {"status": "ok", "message": "invoice paid"}


def _handle_invoice_payment_failed(db, event_id, data, full_event):
    """invoice.payment_failed — transition to past_due."""
    customer_id = data.get("customer")
    subscription_id = data.get("subscription")

    org_id = _find_org_by_stripe_ids(db, customer_id=customer_id, subscription_id=subscription_id)
    if not org_id:
        return {"status": "ok", "message": "no matching org"}

    subscription = db.query(BillingSubscription).filter(
        BillingSubscription.organization_id == org_id
    ).first()
    if subscription:
        _transition_subscription(
            db, subscription, SubscriptionStatus.PAST_DUE, event_id, "invoice.payment_failed"
        )

    _log_audit(
        db,
        organization_id=org_id,
        action=BillingAuditAction.INVOICE_PAYMENT_FAILED,
        entity_type="BillingSubscription",
        entity_id=subscription.id if subscription else None,
        before=None,
        after={"status": "past_due", "stripe_invoice_id": data.get("id")},
        source="stripe_webhook",
        stripe_event_id=event_id,
    )

    return {"status": "ok", "message": "payment failed — past_due"}


# ── Handler registry ───────────────────────────────────────────────────────

_HANDLERS = {
    "checkout.session.completed": _handle_checkout_completed,
    "customer.subscription.updated": _handle_subscription_updated,
    "customer.subscription.deleted": _handle_subscription_deleted,
    "invoice.paid": _handle_invoice_paid,
    "invoice.payment_failed": _handle_invoice_payment_failed,
}


# ── Helpers ────────────────────────────────────────────────────────────────

def _transition_subscription(
    db: Session,
    subscription: BillingSubscription,
    new_status: SubscriptionStatus,
    stripe_event_id: str,
    event_type: str,
):
    """Transition subscription status with audit trail."""
    old_status = subscription.status.value if subscription.status else None
    subscription.status = new_status
    subscription.updated_at = datetime.utcnow()
    logger.info(
        "[webhook] Subscription %d status: %s → %s (event=%s)",
        subscription.id, old_status, new_status.value, event_type,
    )


def _upsert_provider_ref(
    db: Session,
    org_id: int,
    stripe_customer_id: str | None = None,
    stripe_subscription_id: str | None = None,
    stripe_payment_method_id: str | None = None,
    stripe_latest_invoice_id: str | None = None,
):
    """Upsert provider ref with only the fields passed."""
    ref = db.query(ProviderRef).filter(ProviderRef.organization_id == org_id).first()
    if not ref:
        ref = ProviderRef(organization_id=org_id)
        db.add(ref)

    if stripe_customer_id:
        ref.stripe_customer_id = stripe_customer_id
    if stripe_subscription_id:
        ref.stripe_subscription_id = stripe_subscription_id
    if stripe_payment_method_id:
        ref.stripe_payment_method_id = stripe_payment_method_id
    if stripe_latest_invoice_id:
        ref.stripe_latest_invoice_id = stripe_latest_invoice_id
    ref.updated_at = datetime.utcnow()


def _upsert_invoice(db: Session, org_id: int, stripe_invoice: dict):
    """Upsert a BillingInvoice from a Stripe invoice object."""
    stripe_inv_id = stripe_invoice.get("id")
    if not stripe_inv_id:
        return

    invoice = db.query(BillingInvoice).filter(
        BillingInvoice.stripe_invoice_id == stripe_inv_id
    ).first()
    if not invoice:
        invoice = BillingInvoice(
            organization_id=org_id,
            stripe_invoice_id=stripe_inv_id,
        )
        db.add(invoice)

    invoice.amount_due_cents = stripe_invoice.get("amount_due", 0)
    invoice.amount_paid_cents = stripe_invoice.get("amount_paid", 0)
    invoice.currency = (stripe_invoice.get("currency") or "USD").upper()
    invoice.status = stripe_invoice.get("status", "draft")
    invoice.hosted_invoice_url = stripe_invoice.get("hosted_invoice_url")
    invoice.invoice_pdf_url = stripe_invoice.get("invoice_pdf")
    invoice.updated_at = datetime.utcnow()


def _find_plan_by_stripe_price(db: Session, price_id: str) -> BillingPlan | None:
    """Find a BillingPlan by its Stripe price ID (monthly or annual)."""
    if not price_id:
        return None
    return db.query(BillingPlan).filter(
        (BillingPlan.stripe_monthly_price_id == price_id)
        | (BillingPlan.stripe_annual_price_id == price_id)
    ).first()


def _find_org_by_stripe_ids(
    db: Session, customer_id: str | None = None, subscription_id: str | None = None
) -> int | None:
    """Find organization_id from Stripe customer or subscription ID."""
    if subscription_id:
        ref = db.query(ProviderRef).filter(ProviderRef.stripe_subscription_id == subscription_id).first()
        if ref:
            return ref.organization_id
    if customer_id:
        ref = db.query(ProviderRef).filter(ProviderRef.stripe_customer_id == customer_id).first()
        if ref:
            return ref.organization_id
    return None


def _log_audit(
    db: Session,
    organization_id: int,
    action: BillingAuditAction,
    entity_type: str,
    entity_id: int | None,
    before: dict | None,
    after: dict | None,
    source: str = "stripe_webhook",
    stripe_event_id: str | None = None,
):
    """Write a billing audit log row with webhook source metadata."""
    log = BillingAuditLog(
        organization_id=organization_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        before=before,
        after=after,
        source=source,
        stripe_event_id=stripe_event_id,
    )
    db.add(log)


def _log_unhandled_event(db: Session, event_id: str, event_type: str, event: dict):
    """Log unhandled event type for review — never silently dropped."""
    # Write to audit log with WEBHOOOK_UNHANDLED action; no org_id known
    # (unhandled events may not map to any org), use org_id=0 as sentinel.
    log = BillingAuditLog(
        organization_id=0,
        action=BillingAuditAction.WEBHOOK_UNHANDLED,
        entity_type="StripeEvent",
        entity_id=None,
        before=None,
        after={"event_id": event_id, "event_type": event_type},
        source="stripe_webhook",
        stripe_event_id=event_id,
    )
    db.add(log)
