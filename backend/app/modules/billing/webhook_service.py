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

from app.core.exceptions import BadRequestException
from app.modules.billing.models import (
    BillingAuditAction,
    BillingAuditLog,
    BillingCycle,
    BillingInvoice,
    BillingSubscription,
    BillingWebhookEvent,
    ProviderRef,
    SubscriptionStatus,
    BillingPlan,
)
from app.modules.billing import service as billing_service
from app.modules.billing.stripe_client import retrieve_subscription, retrieve_invoice, cancel_and_refund_duplicate_subscription

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
    if existing and existing.processed:
        logger.info("[webhook] Duplicate event %s (type=%s) — skipping", event_id, event_type)
        return {"status": "skipped", "message": "duplicate event"}

    # ── Record event in inbox ─────────────────────────────────────────────
    if existing:
        # An earlier attempt failed (the row says why). Stripe is retrying it: process it again.
        logger.info("[webhook] Retrying previously failed event %s (type=%s)", event_id, event_type)
        webhook_event = existing
        webhook_event.error_message = None
    else:
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
        logger.error("[webhook] Error processing event %s: %s", event_id, e, exc_info=True)
        # Whatever the handler half-did is undone, then the failure is recorded on its own so it is not lost.
        db.rollback()
        failed = db.query(BillingWebhookEvent).filter(BillingWebhookEvent.stripe_event_id == event_id).first()
        if failed is None:
            failed = BillingWebhookEvent(stripe_event_id=event_id, event_type=event_type, processed=False, payload=event)
            db.add(failed)
        failed.processed = False
        failed.error_message = str(e)[:500]
        db.commit()
        return {"status": "error", "message": str(e)}


# ── Event Handlers ─────────────────────────────────────────────────────────

def _epoch_to_datetime(value):
    """Stripe period timestamps are Unix seconds; returns a naive UTC datetime, or None when unusable."""
    try:
        return datetime.utcfromtimestamp(int(value)) if value else None
    except (TypeError, ValueError, OverflowError, OSError):
        return None


def _stripe_period_end(stripe_sub: dict | None):
    """End of the current billing period from a subscription payload (top level or on its first item)."""
    if not stripe_sub:
        return None
    end = stripe_sub.get("current_period_end")
    if end is None:
        items = stripe_sub.get("items") or []
        if isinstance(items, dict):
            items = items.get("data") or []
        end = (items[0] or {}).get("current_period_end") if items else None
    return _epoch_to_datetime(end)


def _handle_duplicate_checkout(db, org_id, new_subscription_id):
    """A second Checkout that completes while the organization already pays through another Stripe subscription
    (two tabs, a double click on Pay) would bill the customer twice every cycle. Cancel the newcomer and refund
    its payment; the organization keeps the subscription it already has. Returns a result dict when it handled
    one, else None."""
    if not new_subscription_id:
        return None
    ref = db.query(ProviderRef).filter(ProviderRef.organization_id == org_id).first()
    kept = ref.stripe_subscription_id if ref else None
    if not kept or kept == new_subscription_id:
        return None
    try:
        existing = retrieve_subscription(kept)
    except Exception as e:
        logger.warning("[webhook] could not check existing subscription %s for duplicate guard: %s", kept, e)
        return None
    if existing.get("status") not in ("active", "trialing", "past_due"):
        return None  # the old one is gone, the new one legitimately replaces it
    try:
        outcome = cancel_and_refund_duplicate_subscription(new_subscription_id)
    except Exception:
        logger.exception("[webhook] DUPLICATE SUBSCRIPTION %s for org %s needs manual cancel + refund (kept %s)", new_subscription_id, org_id, kept)
        return {"status": "error", "message": "duplicate subscription could not be cancelled automatically"}
    logger.error("[webhook] Duplicate checkout for org %s: cancelled %s and refunded it (kept %s)", org_id, new_subscription_id, kept)
    _log_audit(
        db, organization_id=org_id, action=BillingAuditAction.SUBSCRIPTION_ACTIVATED, entity_type="BillingSubscription",
        entity_id=None, before={"stripe_subscription_id": kept},
        after={"duplicate_cancelled": new_subscription_id, "refund_id": outcome.get("refund_id")},
        source="duplicate_checkout_guard", stripe_event_id=None,
    )
    return {"status": "duplicate_cancelled", **outcome}


def _handle_checkout_completed(db, event_id, data, full_event):
    """checkout.session.completed — mark org as active after successful checkout.

    This closes the evaluation→paid loop for self-serve Stripe Checkout and is
    also the completion step for a plan upgrade started from
    /organization-admin/billing-and-plan.

    Every read is defensive. The Checkout Session is the fallback for whatever
    the subscription read could not return: a single unhandled field used to
    raise AttributeError out of this handler after the customer had already
    paid, aborting the handler so the org kept its old plan, no email went out,
    and the audit trail only showed an event that changed nothing.
    """
    metadata = data.get("metadata") or {}
    org_id = int(metadata.get("organization_id") or 0)
    subscription_id = data.get("subscription") or metadata.get("subscription_id")
    customer_id = data.get("customer") or metadata.get("customer_id")

    if not org_id:
        logger.warning("[webhook] checkout.session.completed missing org_id metadata")
        return {"status": "error", "message": "missing org_id in metadata"}

    duplicate = _handle_duplicate_checkout(db, org_id, subscription_id)
    if duplicate is not None:
        return duplicate

    subscription = billing_service.get_or_create_subscription(db, org_id)
    previous_plan = _plan_label(db, subscription.plan_id, subscription.plan_code)

    # Provider refs first — invoice.paid may already be waiting on them.
    _upsert_provider_ref(db, org_id, stripe_customer_id=customer_id, stripe_subscription_id=subscription_id)

    stripe_sub = None
    if subscription_id:
        try:
            stripe_sub = retrieve_subscription(subscription_id)
        except Exception as e:
            logger.warning(
                "[webhook] Could not retrieve Stripe subscription %s: %s — "
                "falling back to Checkout Session fields",
                subscription_id, e,
            )

    items = (stripe_sub or {}).get("items") or []
    price_id = items[0].get("price_id") if items else None
    quantity = items[0].get("quantity") if items else None

    # Status: live Stripe status first; otherwise the Session outcome, which
    # still proves the customer paid even when the subscription read failed.
    if stripe_sub:
        mapped_status = _STRIPE_STATUS_MAP.get(stripe_sub["status"], SubscriptionStatus.ACTIVE)
    elif data.get("payment_status") == "paid" or data.get("status") == "complete":
        mapped_status = SubscriptionStatus.ACTIVE
    else:
        mapped_status = None
    if mapped_status:
        _transition_subscription(db, subscription, mapped_status, event_id, "checkout.session.completed")

    # Plan: the Stripe price is authoritative; session metadata is the
    # fallback that stops an upgrade from silently doing nothing when the
    # price could not be read back.
    plan = _find_plan_by_stripe_price(db, price_id)
    if plan is None:
        plan = _find_plan_by_id(db, metadata.get("plan_id"))
    if plan is not None:
        subscription.plan_id = plan.id
        subscription.plan_code = plan.code
        if subscription.billing_metric is None:
            subscription.billing_metric = plan.billing_metric

    if quantity is not None:
        subscription.quantity = quantity

    cycle = _billing_cycle(metadata.get("billing_cycle"))
    if cycle is not None:
        subscription.billing_cycle = cycle

    renews = _stripe_period_end(stripe_sub)
    if renews is not None:
        subscription.renewal_anchor_date = renews   # the Billing & Plan page shows this as the renewal date

    from app.modules.billing.models import BillingChannel
    subscription.billing_channel = BillingChannel.WEB_STRIPE
    subscription.service_start_at = subscription.service_start_at or datetime.utcnow()
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

    # Close the evaluation→paid loop (ZHR-COM-ENT-001 §8 steps 7-8): a self-serve
    # checkout completing must close the linked evaluation and record the
    # conversion, so trial and paid entitlements never remain simultaneously
    # active. Idempotent by construction — once converted, get_active_evaluation
    # returns None on any replay of this same (or a later) checkout event.
    evaluation = billing_service.get_active_evaluation(db, org_id)
    if evaluation:
        plan_id_str = metadata.get("plan_id")
        billing_cycle_str = metadata.get("billing_cycle")
        if plan_id_str and billing_cycle_str:
            try:
                conversion = billing_service.convert_evaluation(
                    db,
                    evaluation_id=evaluation.id,
                    plan_id=int(plan_id_str),
                    billing_cycle=BillingCycle(billing_cycle_str),
                    quantity_basis="self_serve_checkout",
                    commercial_effective_at=datetime.utcnow(),
                    approver="system:stripe_webhook",
                )
                _log_audit(
                    db,
                    organization_id=org_id,
                    action=BillingAuditAction.EVALUATION_CONVERTED,
                    entity_type="BillingConversion",
                    entity_id=conversion.id,
                    before={"evaluation_status": "active"},
                    after={"evaluation_status": "converted", "conversion_id": conversion.id},
                    source="stripe_webhook",
                    stripe_event_id=event_id,
                )
            except BadRequestException as e:
                logger.warning(
                    "[webhook] Could not auto-convert evaluation %s for org %s: %s",
                    evaluation.id, org_id, e,
                )
        else:
            logger.warning(
                "[webhook] checkout completed for org %s with active evaluation %s "
                "but missing plan_id/billing_cycle metadata — cannot auto-convert",
                org_id, evaluation.id,
            )

    # Entitlements are computed from plan + status + quantity, so any of these
    # changing must drop the cached decisions before the next request reads them.
    _invalidate_entitlements(org_id)

    new_plan = _plan_label(db, subscription.plan_id, subscription.plan_code)
    if new_plan and new_plan != previous_plan:
        send_plan_upgrade_emails(
            db,
            org_id,
            previous_plan=previous_plan or "Evaluation",
            new_plan=new_plan,
            billing_cycle=subscription.billing_cycle,
            plan=plan,
            # One confirmation per Checkout Session: the browser redirect and
            # the webhook both land here, and both must not mail twice.
            dedupe_key=f"checkout-completed:{data.get('id') or event_id}",
            source="checkout_session_completed",
        )

    # Converting the evaluation (above) stamps the anchor with "now"; the date customers care about, and the one
    # a downgrade takes effect on, is when the paid period they just bought ends.
    if renews is not None:
        subscription.renewal_anchor_date = renews
        db.commit()

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
    previous_plan = _plan_label(db, subscription.plan_id, subscription.plan_code)
    stripe_status = data.get("status", "")
    mapped_status = _STRIPE_STATUS_MAP.get(stripe_status)
    if mapped_status:
        _transition_subscription(db, subscription, mapped_status, event_id, "customer.subscription.updated")

    plan_changed = False

    renews = _stripe_period_end(data)
    if renews is not None:
        subscription.renewal_anchor_date = renews

    # Sync quantity + plan from Stripe. Plan used to be ignored here, so an
    # in-place price change (the path taken when an org upgrades while already
    # subscribed) updated status and left plan_id pointing at the old tier.
    items = data.get("items", {}).get("data", [])
    if items:
        item = items[0]
        quantity = item.get("quantity")
        if quantity is not None:
            subscription.quantity = quantity

        price_id = _price_id(item.get("price"))
        plan = _find_plan_by_stripe_price(db, price_id)
        if plan is not None and plan.id != subscription.plan_id:
            subscription.plan_id = plan.id
            subscription.plan_code = plan.code
            if subscription.billing_metric is None:
                subscription.billing_metric = plan.billing_metric
            cycle = _billing_cycle(_recurring_interval(item.get("price")))
            if cycle is not None:
                subscription.billing_cycle = cycle
            plan_changed = True
            logger.info(
                "[webhook] Subscription %d plan synced from Stripe price %s → %s",
                subscription.id, price_id, plan.code,
            )

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

    _invalidate_entitlements(provider_ref.organization_id)

    if plan_changed:
        send_plan_upgrade_emails(
            db,
            provider_ref.organization_id,
            previous_plan=previous_plan or "Previous plan",
            new_plan=_plan_label(db, subscription.plan_id, subscription.plan_code),
            billing_cycle=subscription.billing_cycle,
            plan=None,
            dedupe_key=f"subscription-updated:{data.get('id') or stripe_sub_id}:{subscription.plan_code}",
            source="customer_subscription_updated",
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

    _invalidate_entitlements(provider_ref.organization_id)

    return {"status": "ok", "message": "subscription deleted"}


def _handle_invoice_paid(db, event_id, data, full_event):
    """invoice.paid — record payment, ensure subscription is active."""
    stripe_invoice_id = data.get("id")
    customer_id = data.get("customer")
    subscription_id = data.get("subscription")

    # Find org by metadata on the invoice/subscription first, then by the
    # stored customer/subscription ids. Stripe does not order its events, so
    # invoice.paid can beat checkout.session.completed — without the metadata
    # fallback that early invoice (and its receipt email) was dropped.
    org_id = _find_org_by_stripe_ids(db, customer_id=customer_id, subscription_id=subscription_id, data=data)
    if not org_id:
        logger.warning(
            "[webhook] invoice.paid for unknown customer/subscription "
            "(customer=%s subscription=%s) — no receipt sent",
            customer_id, subscription_id,
        )
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
        _invalidate_entitlements(org_id)

    # Payment recovered → close any open delinquency case and restore
    # entitlements automatically if no other restriction reason exists.
    try:
        from app.modules.billing import delinquency_service

        delinquency_service.recover(db, org_id, stripe_event_id=event_id)
    except Exception as e:
        logger.error("[webhook] Delinquency recover failed for org %d: %s", org_id, e)

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

    _send_payment_receipt_emails(db, org_id, data)
    _send_subscription_renewed_emails(db, org_id, data, subscription)

    return {"status": "ok", "message": "invoice paid"}


def _handle_invoice_created(db, event_id, data, full_event):
    """invoice.created — persist the issued invoice and notify billing
    recipients so the invoice reaches the customer immediately."""
    customer_id = data.get("customer")
    subscription_id = data.get("subscription")

    org_id = _find_org_by_stripe_ids(db, customer_id=customer_id, subscription_id=subscription_id, data=data)
    if not org_id:
        logger.warning(
            "[webhook] invoice.created for unknown customer/subscription "
            "(customer=%s subscription=%s)",
            customer_id, subscription_id,
        )
        return {"status": "ok", "message": "no matching org"}

    _upsert_invoice(db, org_id, data)
    _upsert_provider_ref(db, org_id, stripe_latest_invoice_id=data.get("id"))

    _log_audit(
        db,
        organization_id=org_id,
        action=BillingAuditAction.INVOICE_CREATED,
        entity_type="BillingInvoice",
        entity_id=None,
        before=None,
        after={
            "stripe_invoice_id": data.get("id"),
            "amount_due_cents": data.get("amount_due", 0),
            "status": data.get("status", "draft"),
        },
        source="stripe_webhook",
        stripe_event_id=event_id,
    )

    _send_invoice_created_emails(db, org_id, data)

    return {"status": "ok", "message": "invoice created"}


def _handle_invoice_payment_failed(db, event_id, data, full_event):
    """invoice.payment_failed — transition to past_due."""
    customer_id = data.get("customer")
    subscription_id = data.get("subscription")

    org_id = _find_org_by_stripe_ids(db, customer_id=customer_id, subscription_id=subscription_id, data=data)
    if not org_id:
        logger.warning(
            "[webhook] invoice.payment_failed for unknown customer/subscription "
            "(customer=%s subscription=%s)",
            customer_id, subscription_id,
        )
        return {"status": "ok", "message": "no matching org"}

    subscription = db.query(BillingSubscription).filter(
        BillingSubscription.organization_id == org_id
    ).first()
    if subscription:
        _transition_subscription(
            db, subscription, SubscriptionStatus.PAST_DUE, event_id, "invoice.payment_failed"
        )
        _invalidate_entitlements(org_id)

    # Payment failed → open (or reopen) the delinquency case for the graduated
    # day-10/14/20/45 recovery timeline (Section 10 G1).
    try:
        from app.modules.billing import delinquency_service

        delinquency_service.open_case(db, org_id, stripe_event_id=event_id)
    except Exception as e:
        logger.error("[webhook] Delinquency case open failed for org %d: %s", org_id, e)

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

    _send_past_due_emails(db, org_id, data)

    return {"status": "ok", "message": "payment failed — past_due"}


# ── Email notification helpers ────────────────────────────────────────────

def _send_to_billing_recipients(db, org_id, send_fn):
    """Send one email (built by send_fn(email, org)) to every authorized
    billing recipient for the org. Never raises; failures are logged only."""
    from app.modules.hr.models import Organization
    from app.services.email_service import resolve_billing_recipients

    org = db.query(Organization).filter(Organization.id == org_id).first()
    if org is None:
        return
    recipients = resolve_billing_recipients(db, org_id)
    if not recipients and getattr(org, "registered_email", None):
        recipients = [org.registered_email]
    for email in recipients:
        if not email:
            continue
        try:
            send_fn(email, org)
        except Exception as e:
            logger.error("[webhook] Email to %s failed for org %d: %s", email, org_id, e)


def send_plan_upgrade_emails(
    db,
    org_id: int,
    *,
    previous_plan: str,
    new_plan: str,
    billing_cycle=None,
    plan=None,
    dedupe_key: str,
    source: str,
):
    """Send the plan-change confirmation once per `dedupe_key`.

    Two independent paths can reach the same completed upgrade — Stripe's
    webhook and the browser returning from Checkout — so the confirmation is
    gated on billing_idempotency_keys (unique per key/org/endpoint). Never
    raises: an unsendable confirmation must not fail the state transition that
    already happened.
    """
    from app.modules.billing.idempotency import execute_idempotent
    from app.services.email_service import send_plan_upgraded_email

    cycle_label = ""
    if billing_cycle is not None:
        cycle_label = str(billing_cycle.value if hasattr(billing_cycle, "value") else billing_cycle)
        cycle_label = cycle_label.replace("_", " ").title()

    amount = ""
    currency = "USD"
    if plan is not None:
        price = plan.annual_price if cycle_label == "Annual" else plan.monthly_price
        if price is not None:
            amount = f"{float(price):.2f}"
        if getattr(plan, "currency", None):
            currency = plan.currency

    def _send():
        def _one(email, org):
            send_plan_upgraded_email(
                email=email,
                customer_name=org.name,
                previous_plan_name=previous_plan,
                new_plan_name=new_plan,
                billing_cycle=cycle_label,
                effective_date=datetime.utcnow().strftime("%Y-%m-%d"),
                amount=amount,
                currency=currency,
                organization_id=org_id,
                db=db,
            )

        _send_to_billing_recipients(db, org_id, _one)
        return {"sent": True, "source": source}, 200

    try:
        execute_idempotent(db, dedupe_key, org_id, "plan-upgrade-email", {"source": source}, _send)
    except Exception as e:
        logger.error(
            "[webhook] Plan-upgrade confirmation failed for org %d (source=%s): %s",
            org_id, source, e,
        )


def _send_invoice_created_emails(db, org_id, data):
    from app.services.email_service import send_invoice_email

    def _send(email, org):
        total = (data.get("amount_due") or 0) / 100
        currency = (data.get("currency") or "USD").upper()
        issue_date = ""
        if data.get("created"):
            issue_date = datetime.utcfromtimestamp(data["created"]).strftime("%Y-%m-%d")
        due_date = ""
        due = data.get("due_date") or data.get("period_end")
        if due:
            due_date = datetime.utcfromtimestamp(due).strftime("%Y-%m-%d")
        send_invoice_email(
            email=email,
            customer_name=org.name,
            invoice_number=data.get("number") or data.get("id", ""),
            issue_date=issue_date,
            due_date=due_date,
            total_amount=f"{total:.2f}",
            status=(data.get("status") or "open").replace("_", " ").title(),
            balance_due=f"{total:.2f}",
            organization_id=org_id,
            db=db,
        )

    _send_to_billing_recipients(db, org_id, _send)


def _send_payment_receipt_emails(db, org_id, data):
    from app.services.email_service import send_payment_receipt_email

    def _send(email, org):
        amount = (data.get("amount_paid") or data.get("amount_due") or 0) / 100
        payment_date = ""
        if data.get("created"):
            payment_date = datetime.utcfromtimestamp(data["created"]).strftime("%Y-%m-%d")
        send_payment_receipt_email(
            email=email,
            customer_name=org.name,
            payment_number=data.get("number") or data.get("id", ""),
            payment_date=payment_date,
            amount=f"{amount:.2f}",
            currency=(data.get("currency") or "USD").upper(),
            payment_method="card",
            organization_id=org_id,
            db=db,
        )

    _send_to_billing_recipients(db, org_id, _send)


def _email_plan_label(db, org_id, subscription=None) -> str:
    """Readable plan name for an email ("Zoiko HR Core"), never a bare enum or a placeholder word. Stripe can
    deliver invoice.paid before checkout.session.completed, when the subscription row has no plan yet, so fall
    back to the organization's subscription row, then to a neutral name."""
    try:
        sub = subscription or db.query(BillingSubscription).filter(BillingSubscription.organization_id == org_id).first()
        plan = db.query(BillingPlan).filter(BillingPlan.id == sub.plan_id).first() if sub and sub.plan_id else None
        if plan is not None and plan.name:
            return plan.name
        code = getattr(getattr(sub, "plan_code", None), "value", getattr(sub, "plan_code", None))
        if code:
            return f"Zoiko HR {str(code).title()}"
    except Exception:
        pass
    return "Zoiko HR"


def _send_subscription_renewed_emails(db, org_id, data, subscription):
    from app.services.email_service import send_subscription_renewed_email

    # "Renewed" is only true for a later billing cycle. The first invoice of a new subscription is already
    # covered by the payment receipt and plan emails, and calling it a renewal confused customers.
    if data.get("billing_reason") not in (None, "subscription_cycle"):
        return

    plan_name_fallback = _email_plan_label(db, org_id, subscription)

    def _send(email, org):
        plan_name = plan_name_fallback
        term_start = ""
        term_end = ""
        period = data.get("period_start") or data.get("created")
        if period:
            term_start = datetime.utcfromtimestamp(period).strftime("%Y-%m-%d")
        period_end = data.get("period_end")
        if period_end:
            term_end = datetime.utcfromtimestamp(period_end).strftime("%Y-%m-%d")
        amount = (data.get("amount_paid") or data.get("amount_due") or 0) / 100
        send_subscription_renewed_email(
            email=email,
            customer_name=org.name,
            subscription_number=data.get("number") or data.get("id", ""),
            plan_name=plan_name,
            term_start=term_start,
            term_end=term_end,
            amount=f"{amount:.2f}",
            currency=(data.get("currency") or "USD").upper(),
            organization_id=org_id,
            db=db,
        )

    _send_to_billing_recipients(db, org_id, _send)


def _send_past_due_emails(db, org_id, data):
    from app.services.email_service import send_past_due_notice_email

    def _send(email, org):
        amount_due = (data.get("amount_due") or 0) / 100
        subscription = db.query(BillingSubscription).filter(
            BillingSubscription.organization_id == org_id
        ).first()
        plan_name = _email_plan_label(db, org_id, subscription)
        send_past_due_notice_email(
            email=email,
            customer_name=org.name,
            subscription_number=data.get("number") or data.get("id", ""),
            plan_name=plan_name,
            days_overdue="Pending",
            overdue_amount=f"{amount_due:.2f}",
            currency=(data.get("currency") or "USD").upper(),
            organization_id=org_id,
            db=db,
        )

    _send_to_billing_recipients(db, org_id, _send)


# ── Handler registry ───────────────────────────────────────────────────────

_HANDLERS = {
    "checkout.session.completed": _handle_checkout_completed,
    "customer.subscription.updated": _handle_subscription_updated,
    "customer.subscription.deleted": _handle_subscription_deleted,
    "invoice.created": _handle_invoice_created,
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


def _find_plan_by_id(db: Session, raw_plan_id) -> BillingPlan | None:
    """Find a BillingPlan by primary key, tolerating a missing/invalid value."""
    try:
        plan_pk = int(raw_plan_id)
    except (TypeError, ValueError):
        return None
    return db.query(BillingPlan).filter(BillingPlan.id == plan_pk).first()


def _price_id(price) -> str | None:
    """Price id from a Stripe price that may be expanded (object) or bare (str)."""
    if isinstance(price, str):
        return price
    if isinstance(price, dict):
        return price.get("id")
    return getattr(price, "id", None)


def _recurring_interval(price) -> str | None:
    """'monthly' | 'annual' derived from a Stripe price's recurring interval."""
    recurring = None
    if isinstance(price, dict):
        recurring = price.get("recurring")
    else:
        recurring = getattr(price, "recurring", None)
    interval = recurring.get("interval") if isinstance(recurring, dict) else getattr(recurring, "interval", None)
    if interval == "month":
        return "monthly"
    if interval == "year":
        return "annual"
    return None


def _billing_cycle(raw):
    """BillingCycle from a raw metadata/interval value, or None if unusable."""
    if not raw:
        return None
    try:
        return BillingCycle(str(raw).lower())
    except (TypeError, ValueError):
        return None


def _plan_label(db: Session, plan_id, plan_code) -> str:
    """Human-readable plan name for display/email, '' when unknown."""
    if plan_id:
        plan = db.query(BillingPlan).filter(BillingPlan.id == plan_id).first()
        if plan is not None:
            return plan.name or str(plan.code.value if hasattr(plan.code, "value") else plan.code)
    if plan_code is not None:
        return str(plan_code.value if hasattr(plan_code, "value") else plan_code)
    return ""


def _invalidate_entitlements(organization_id: int) -> None:
    """Drop cached entitlement decisions for an org after plan/status/quantity
    changed. Failures are logged only — a cache miss must never fail a webhook."""
    try:
        billing_service._invalidate_entitlement_cache(organization_id)
    except Exception as e:
        logger.error("[webhook] Entitlement cache invalidation failed for org %d: %s", organization_id, e)


def _metadata_org_id(data: dict | None) -> int | None:
    """organization_id from any metadata block Stripe attaches to this object.

    Covers the Checkout Session, the Checkout Session's `subscription_details`
    view, the invoice's `subscription_details` (and the newer
    `parent.subscription_details` nesting), and the invoice's own metadata —
    because invoice.paid frequently arrives before checkout.session.completed
    and no ProviderRef exists yet to look the org up by.
    """
    if not isinstance(data, dict):
        return None

    parent = data.get("parent") if isinstance(data.get("parent"), dict) else {}
    sub_details = data.get("subscription_details") if isinstance(data.get("subscription_details"), dict) else {}
    parent_sub_details = parent.get("subscription_details") if isinstance(parent.get("subscription_details"), dict) else {}

    blocks = [
        data.get("metadata"),
        sub_details.get("metadata"),
        parent_sub_details.get("metadata"),
        data.get("subscription_data"),
    ]
    for block in blocks:
        if isinstance(block, dict) and block.get("organization_id"):
            try:
                return int(block["organization_id"])
            except (TypeError, ValueError):
                continue
    return None


def _find_org_by_stripe_ids(
    db: Session,
    customer_id: str | None = None,
    subscription_id: str | None = None,
    data: dict | None = None,
) -> int | None:
    """Find organization_id for a Stripe event.

    Resolution order: embedded metadata → stored subscription ref → stored
    customer ref. Metadata first because the stored refs only exist once
    checkout.session.completed has been processed, and Stripe does not
    guarantee that event lands before the invoice events it causes.
    """
    org_id = _metadata_org_id(data)
    if org_id:
        return org_id
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
    # Write to audit log with WEBHOOK_UNHANDLED action; no org_id known
    # (unhandled events may not map to any org), so record NULL — a 0
    # sentinel would violate the organizations FK.
    log = BillingAuditLog(
        organization_id=None,
        action=BillingAuditAction.WEBHOOK_UNHANDLED,
        entity_type="StripeEvent",
        entity_id=None,
        before=None,
        after={"event_id": event_id, "event_type": event_type},
        source="stripe_webhook",
        stripe_event_id=event_id,
    )
    db.add(log)


def replay_webhook_event(db: Session, stripe_event_id: str, actor: str = "super_admin") -> dict:
    """Manually replay processing for an existing webhook event in the inbox."""
    event_row = db.query(BillingWebhookEvent).filter(
        BillingWebhookEvent.stripe_event_id == stripe_event_id
    ).first()

    if not event_row:
        raise ValueError(f"Webhook event '{stripe_event_id}' not found in inbox")

    if not event_row.payload:
        raise ValueError(f"Webhook event '{stripe_event_id}' has no saved payload to replay")

    event_type = event_row.event_type
    payload = event_row.payload
    data_object = payload.get("data", {}).get("object", {})

    handler = _HANDLERS.get(event_type)
    try:
        if handler:
            result = handler(db, stripe_event_id, data_object, payload)
        else:
            result = {"status": "ok", "message": f"unhandled event type '{event_type}' — logged"}

        event_row.processed = True
        event_row.error_message = None
        event_row.processed_at = datetime.utcnow()
        db.commit()

        _log_audit(
            db,
            organization_id=None,
            action=BillingAuditAction.WEBHOOK_RECEIVED,
            entity_type="BillingWebhookEvent",
            entity_id=event_row.id,
            before={"processed": False, "error": event_row.error_message},
            after={"processed": True, "replayed_by": actor},
            source="manual_replay",
            stripe_event_id=stripe_event_id,
        )

        return {"status": "ok", "message": f"Webhook event {stripe_event_id} replayed successfully", "event_id": stripe_event_id}

    except Exception as e:
        event_row.error_message = str(e)[:500]
        db.commit()
        logger.error("[webhook_replay] Failed to replay event %s: %s", stripe_event_id, e)
        raise RuntimeError(f"Replay failed: {e}") from e

