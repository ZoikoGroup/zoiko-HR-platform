"""
modules/billing/refund_service.py
---------------------------------
Two-step refund/credit workflow per Section 12 (I3):

1. Owner / Billing Admin requests → PENDING_APPROVAL
2. Billing Ops / Finance approves → Stripe refund/credit executed

Engineering hardening: requester ≠ approver (same-actor rejection).

Refund types:
  - refund: returns funds to original payment method via Stripe Refund API
  - credit: applies credit balance to Stripe customer account
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException, NotFoundException, ForbiddenException
from app.modules.billing.models import (
    BillingAuditAction,
    BillingAuditLog,
    BillingRefundRequest,
    BillingSubscription,
    RefundRequestStatus,
    RefundRequestType,
)

logger = logging.getLogger("zoiko.billing.refund")


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


# ── Request refund / credit ───────────────────────────────────────────────

def request_refund(
    db: Session,
    organization_id: int,
    amount_cents: int,
    reason: str,
    request_type: RefundRequestType = RefundRequestType.REFUND,
    stripe_subscription_id: Optional[str] = None,
    stripe_invoice_id: Optional[str] = None,
    requested_by: Optional[str] = None,
) -> BillingRefundRequest:
    """Create a refund/credit request. Validates amount and org ownership."""
    if amount_cents <= 0:
        raise BadRequestException("Refund amount must be positive")
    if not reason or not reason.strip():
        raise BadRequestException("Reason is required")

    subscription = _get_subscription(db, organization_id)

    request = BillingRefundRequest(
        organization_id=organization_id,
        request_type=request_type,
        amount_cents=amount_cents,
        reason=reason.strip(),
        stripe_subscription_id=stripe_subscription_id,
        stripe_invoice_id=stripe_invoice_id,
        status=RefundRequestStatus.PENDING_APPROVAL,
        requested_by=requested_by or "unknown",
    )
    db.add(request)
    db.commit()
    db.refresh(request)

    _log_audit(
        db,
        organization_id=organization_id,
        action=BillingAuditAction.REFUND_REQUESTED if request_type == RefundRequestType.REFUND
               else BillingAuditAction.CREDIT_REQUESTED,
        entity_type="BillingRefundRequest",
        entity_id=request.id,
        actor=requested_by,
        after={
            "amount_cents": amount_cents,
            "request_type": request_type.value,
            "reason": reason,
        },
    )

    logger.info(
        "[refund] Org %d %s request %d: $%.2f — %s",
        organization_id, request_type.value, request.id,
        amount_cents / 100, reason,
    )
    return request


# ── Approve refund / credit ───────────────────────────────────────────────

def approve_refund(
    db: Session,
    request_id: int,
    approved_by: str,
) -> BillingRefundRequest:
    """Approve and execute a pending refund/credit request.
    Same-actor rejection: approver cannot be the same as requester."""
    request = db.query(BillingRefundRequest).filter(BillingRefundRequest.id == request_id).first()
    if not request:
        raise NotFoundException(f"BillingRefundRequest not found: id={request_id}")

    if request.status != RefundRequestStatus.PENDING_APPROVAL:
        raise BadRequestException(
            f"Request is in status '{request.status.value}', not pending approval"
        )

    if request.requested_by == approved_by:
        raise ForbiddenException(
            "Same-actor rejection: approver cannot be the same as requester"
        )

    subscription = _get_subscription(db, request.organization_id)

    if request.request_type == RefundRequestType.REFUND:
        stripe_refund = _execute_stripe_refund(
            db=db,
            subscription=subscription,
            amount_cents=request.amount_cents,
            reason=request.reason,
            request_id=request.id,
        )
        request.stripe_refund_id = stripe_refund.get("refund_id")
    else:
        stripe_credit = _execute_stripe_credit(
            db=db,
            subscription=subscription,
            amount_cents=request.amount_cents,
            reason=request.reason,
        )
        request.stripe_refund_id = stripe_credit.get("invoice_id")

    request.status = RefundRequestStatus.APPROVED_AND_PROCESSED
    request.approved_by = approved_by
    request.processed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    db.refresh(request)

    _log_audit(
        db,
        organization_id=request.organization_id,
        action=BillingAuditAction.REFUND_APPROVED if request.request_type == RefundRequestType.REFUND
               else BillingAuditAction.CREDIT_APPROVED,
        entity_type="BillingRefundRequest",
        entity_id=request.id,
        actor=approved_by,
        before={"status": "pending_approval"},
        after={
            "status": "approved_and_processed",
            "stripe_refund_id": request.stripe_refund_id,
        },
    )

    _send_refund_notification(db, request, subscription)

    logger.info(
        "[refund] Request %d approved by %s — $%.2f %s",
        request.id, approved_by, request.amount_cents / 100,
        request.request_type.value,
    )
    return request


# ── Reject refund / credit ───────────────────────────────────────────────

def reject_refund(
    db: Session,
    request_id: int,
    rejected_by: str,
    rejection_reason: str = "",
) -> BillingRefundRequest:
    """Reject a pending refund/credit request."""
    request = db.query(BillingRefundRequest).filter(BillingRefundRequest.id == request_id).first()
    if not request:
        raise NotFoundException(f"BillingRefundRequest not found: id={request_id}")

    if request.status != RefundRequestStatus.PENDING_APPROVAL:
        raise BadRequestException(
            f"Request is in status '{request.status.value}', not pending approval"
        )

    request.status = RefundRequestStatus.REJECTED
    request.rejection_reason = rejection_reason
    request.approved_by = rejected_by
    request.processed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    db.refresh(request)

    _log_audit(
        db,
        organization_id=request.organization_id,
        action=BillingAuditAction.REFUND_REJECTED,
        entity_type="BillingRefundRequest",
        entity_id=request.id,
        actor=rejected_by,
        before={"status": "pending_approval"},
        after={
            "status": "rejected",
            "rejection_reason": rejection_reason,
        },
    )

    logger.info(
        "[refund] Request %d rejected by %s: %s",
        request.id, rejected_by, rejection_reason,
    )
    return request


# ── Get requests for org ──────────────────────────────────────────────────

def get_refund_requests(
    db: Session,
    organization_id: int,
    status: Optional[RefundRequestStatus] = None,
) -> list[BillingRefundRequest]:
    """Return refund requests for an org, optionally filtered by status."""
    q = db.query(BillingRefundRequest).filter(
        BillingRefundRequest.organization_id == organization_id,
    )
    if status:
        q = q.filter(BillingRefundRequest.status == status)
    return q.order_by(BillingRefundRequest.created_at.desc()).all()


# ── Stripe execution helpers ──────────────────────────────────────────────

def _execute_stripe_refund(
    db: Session,
    subscription: BillingSubscription,
    amount_cents: int,
    reason: str,
    request_id: int,
) -> dict:
    """Execute refund via Stripe. Falls back gracefully if Stripe not configured."""
    from app.modules.billing.stripe_client import stripe_enabled, create_refund

    if not stripe_enabled():
        logger.warning("[refund] Stripe not configured — recording refund without Stripe execution")
        return {"refund_id": f"local_refund_{request_id}", "status": "local"}

    if not subscription.stripe_subscription_id:
        raise BadRequestException("No Stripe subscription ID — cannot execute refund")

    try:
        from app.modules.billing.stripe_client import get_stripe
        stripe = get_stripe()
        sub = stripe.Subscription.retrieve(subscription.stripe_subscription_id)
        if not sub.latest_invoice:
            raise BadRequestException("No invoice found on subscription")

        invoice = stripe.Invoice.retrieve(sub.latest_invoice)
        if not invoice.charge:
            raise BadRequestException("No charge found on invoice")

        return create_refund(
            payment_intent_id=invoice.payment_intent,
            amount_cents=amount_cents,
            reason="requested_by_customer",
            idempotency_key=f"refund_req_{request_id}",
        )
    except Exception as e:
        logger.error("[refund] Stripe refund execution failed: %s", e)
        raise BadRequestException(f"Stripe refund execution failed: {e}") from e


def _execute_stripe_credit(
    db: Session,
    subscription: BillingSubscription,
    amount_cents: int,
    reason: str,
) -> dict:
    """Execute credit balance adjustment via Stripe."""
    from app.modules.billing.stripe_client import stripe_enabled, create_credit_balance_adjustment

    if not stripe_enabled():
        logger.warning("[refund] Stripe not configured — recording credit without Stripe execution")
        return {"invoice_id": "local_credit", "status": "local"}

    if not subscription.stripe_subscription_id:
        raise BadRequestException("No Stripe subscription ID — cannot execute credit")

    try:
        from app.modules.billing.stripe_client import get_stripe
        stripe = get_stripe()
        sub = stripe.Subscription.retrieve(subscription.stripe_subscription_id)
        customer_id = sub.customer

        return create_credit_balance_adjustment(
            customer_id=customer_id,
            amount_cents=amount_cents,
            description=reason,
        )
    except Exception as e:
        logger.error("[refund] Stripe credit execution failed: %s", e)
        raise BadRequestException(f"Stripe credit execution failed: {e}") from e


# ── Notifications ─────────────────────────────────────────────────────────

def _send_refund_notification(
    db: Session,
    request: BillingRefundRequest,
    subscription: BillingSubscription,
):
    """Send email notification for refund approval/rejection."""
    try:
        from app.services.email_service import send_refund_email
        org_email = subscription.organization.billing_owner_email if hasattr(subscription, 'organization') and subscription.organization else None
        if not org_email:
            return
        send_refund_email(
            email=org_email,
            customer_name=f"Org {request.organization_id}",
            refund_number=f"REF-{request.id:06d}",
            refund_date=request.processed_at.strftime("%Y-%m-%d") if request.processed_at else "",
            amount=f"${request.amount_cents / 100:.2f}",
            currency=request.currency,
            reason=request.reason,
            organization_id=request.organization_id,
            db=db,
        )
    except Exception as e:
        logger.warning("[refund] Notification failed: %s", e)


# ── Audit helper ─────────────────────────────────────────────────────────

def _log_audit(
    db: Session,
    organization_id: int,
    action: BillingAuditAction,
    entity_type: str,
    entity_id: int,
    actor: str = None,
    before: dict = None,
    after: dict = None,
):
    try:
        from app.modules.billing import service
        service.log_billing_audit(
            db,
            actor=actor,
            organization_id=organization_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            before=before,
            after=after,
        )
    except Exception as e:
        logger.warning("[refund] Audit log failed: %s", e)
