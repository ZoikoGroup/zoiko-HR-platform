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

Money is integer minor units (cents) end to end — DB column, service and API
(`amount_cents`, `*_cents`) — so no Decimal/float ever crosses a boundary.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.integrations.events import emit_event
from app.core.exceptions import BadRequestException, NotFoundException, ForbiddenException
from app.modules.billing.models import (
    BillingAuditAction,
    BillingInvoice,
    BillingRefundRequest,
    BillingSubscription,
    ProviderRef,
    RefundRequestStatus,
    RefundRequestType,
)

logger = logging.getLogger("zoiko.billing.refund")

MAX_REQUEST_CENTS = 100_000_000  # $1,000,000 — sanity cap; also keeps us inside INT4
DELETED_ORG_LABEL = "Deleted organization"
_COMMITTED = (RefundRequestStatus.PENDING_APPROVAL, RefundRequestStatus.APPROVED_AND_PROCESSED)


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


def actor_label(actor) -> str:
    """Stable string identity for the requested_by / approved_by columns."""
    if actor is None:
        return "unknown"
    if isinstance(actor, str):
        return actor
    return (
        getattr(actor, "email", None)
        or getattr(actor, "username", None)
        or str(getattr(actor, "id", "unknown"))
    )


def _commit_or_rollback(db: Session) -> None:
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise


# ── Balances & validation ─────────────────────────────────────────────────

def _sum_cents(db: Session, *criteria) -> int:
    total = db.query(
        func.coalesce(func.sum(BillingRefundRequest.amount_cents), 0)
    ).filter(*criteria).scalar()
    return int(total or 0)


def _paid_cents(db: Session, organization_id: int, stripe_invoice_id: Optional[str] = None) -> int:
    q = db.query(func.coalesce(func.sum(BillingInvoice.amount_paid_cents), 0)).filter(
        BillingInvoice.organization_id == organization_id
    )
    if stripe_invoice_id:
        q = q.filter(BillingInvoice.stripe_invoice_id == stripe_invoice_id)
    return int(q.scalar() or 0)


def get_balances(db: Session, organization_id: int, stripe_invoice_id: Optional[str] = None) -> dict:
    """Snapshot used for validation and for audit before/after.

    refundable_balance_cents = paid on the invoice(s) minus refunds already
    pending or processed against them. credit_balance_cents = credits processed
    through this workflow (the local ledger of what Stripe was asked to apply).
    """
    org = BillingRefundRequest.organization_id == organization_id
    refund_criteria = [
        org,
        BillingRefundRequest.request_type == RefundRequestType.REFUND,
        BillingRefundRequest.status.in_(_COMMITTED),
    ]
    if stripe_invoice_id:
        refund_criteria.append(BillingRefundRequest.stripe_invoice_id == stripe_invoice_id)
    return {
        "refundable_balance_cents": (
            _paid_cents(db, organization_id, stripe_invoice_id) - _sum_cents(db, *refund_criteria)
        ),
        "credit_balance_cents": _sum_cents(
            db, org,
            BillingRefundRequest.request_type == RefundRequestType.CREDIT,
            BillingRefundRequest.status == RefundRequestStatus.APPROVED_AND_PROCESSED,
        ),
    }


def _validate_request(
    db: Session,
    organization_id: int,
    amount_cents: int,
    reason: str,
    request_type: RefundRequestType,
    stripe_invoice_id: Optional[str],
) -> str:
    """Raise BadRequestException for any invalid input; return the currency."""
    if amount_cents is None or amount_cents <= 0:
        raise BadRequestException("Amount must be greater than zero.")
    if amount_cents > MAX_REQUEST_CENTS:
        raise BadRequestException(
            f"Amount exceeds the maximum of ${MAX_REQUEST_CENTS / 100:,.2f} per request."
        )
    if not reason or not reason.strip():
        raise BadRequestException("Reason is required.")

    currency = "USD"
    if stripe_invoice_id:
        invoice = (
            db.query(BillingInvoice)
            .filter(BillingInvoice.stripe_invoice_id == stripe_invoice_id)
            .first()
        )
        if not invoice or invoice.organization_id != organization_id:
            raise BadRequestException(
                f"Invoice '{stripe_invoice_id}' was not found for this organization."
            )
        currency = (invoice.currency or "USD").upper()

    if request_type == RefundRequestType.REFUND:
        refundable = get_balances(db, organization_id, stripe_invoice_id)["refundable_balance_cents"]
        if amount_cents > refundable:
            scope = "on this invoice" if stripe_invoice_id else "for this organization"
            raise BadRequestException(
                f"Refund of ${amount_cents / 100:,.2f} exceeds the refundable balance "
                f"{scope} (${max(refundable, 0) / 100:,.2f})."
            )
    return currency


# ── Audit helper ─────────────────────────────────────────────────────────

def _log_audit(
    db: Session,
    organization_id: int,
    action: BillingAuditAction,
    entity_type: str,
    entity_id: int,
    actor=None,
    before: dict = None,
    after: dict = None,
):
    """Stage the audit row in the caller's transaction (no commit here).

    Deliberately not wrapped in try/except: a refund/credit action with no
    audit trail must fail and roll back rather than succeed silently unaudited.
    """
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
        commit=False,
    )


# ── Request refund / credit ───────────────────────────────────────────────

def request_refund(
    db: Session,
    organization_id: int,
    amount_cents: int,
    reason: str,
    request_type: RefundRequestType = RefundRequestType.REFUND,
    stripe_subscription_id: Optional[str] = None,
    stripe_invoice_id: Optional[str] = None,
    requested_by=None,
) -> BillingRefundRequest:
    """Create a refund/credit request. Validates amount, invoice and balance.

    ``requested_by`` may be the authenticated user or an identity string; the
    request row and its audit entry are written in one transaction.
    """
    _get_subscription(db, organization_id)
    currency = _validate_request(
        db, organization_id, amount_cents, reason, request_type, stripe_invoice_id
    )
    before = get_balances(db, organization_id, stripe_invoice_id)

    request = BillingRefundRequest(
        organization_id=organization_id,
        request_type=request_type,
        amount_cents=amount_cents,
        currency=currency,
        reason=reason.strip(),
        stripe_subscription_id=stripe_subscription_id,
        stripe_invoice_id=stripe_invoice_id,
        status=RefundRequestStatus.PENDING_APPROVAL,
        requested_by=actor_label(requested_by),
    )
    db.add(request)
    db.flush()  # need the id for the audit row; nothing is committed yet

    _log_audit(
        db,
        organization_id=organization_id,
        action=BillingAuditAction.REFUND_REQUESTED if request_type == RefundRequestType.REFUND
               else BillingAuditAction.CREDIT_REQUESTED,
        entity_type="BillingRefundRequest",
        entity_id=request.id,
        actor=requested_by,
        before=before,
        after={
            **get_balances(db, organization_id, stripe_invoice_id),
            "amount_cents": amount_cents,
            "currency": currency,
            "request_type": request_type.value,
            "reason": reason.strip(),
        },
    )
    _commit_or_rollback(db)
    db.refresh(request)
    emit_event(db, "refund.created", {"id": request.id, "type": request_type.value,
                                      "amount_cents": amount_cents, "currency": currency}, organization_id)

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
    approved_by,
) -> BillingRefundRequest:
    """Approve and execute a pending refund/credit request.
    Same-actor rejection: approver cannot be the same as requester.
    ``approved_by`` may be the authenticated user or an identity string."""
    approver = actor_label(approved_by)
    # Row lock: two concurrent approvals must not both execute at the provider.
    request = (
        db.query(BillingRefundRequest)
        .filter(BillingRefundRequest.id == request_id)
        .with_for_update()
        .first()
    )
    if not request:
        raise NotFoundException(f"BillingRefundRequest not found: id={request_id}")

    if request.status != RefundRequestStatus.PENDING_APPROVAL:
        raise BadRequestException(
            f"Request is in status '{request.status.value}', not pending approval"
        )

    if request.requested_by == approver:
        raise ForbiddenException(
            "Same-actor rejection: approver cannot be the same as requester"
        )

    subscription = _get_subscription(db, request.organization_id)
    before = get_balances(db, request.organization_id, request.stripe_invoice_id)

    if request.request_type == RefundRequestType.REFUND:
        stripe_refund = _execute_stripe_refund(
            db=db,
            subscription=subscription,
            amount_cents=request.amount_cents,
            reason=request.reason,
            request_id=request.id,
            stripe_invoice_id=request.stripe_invoice_id,
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

    # Status change, balance effect and audit row commit together. The provider
    # call above ran first and is idempotent for refunds (keyed on request id),
    # so a failed commit here is safe to retry.
    request.status = RefundRequestStatus.APPROVED_AND_PROCESSED
    request.approved_by = approver
    request.processed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.flush()
    _log_audit(
        db,
        organization_id=request.organization_id,
        action=BillingAuditAction.REFUND_APPROVED if request.request_type == RefundRequestType.REFUND
               else BillingAuditAction.CREDIT_APPROVED,
        entity_type="BillingRefundRequest",
        entity_id=request.id,
        actor=approved_by,
        before={"status": "pending_approval", **before},
        after={
            "status": "approved_and_processed",
            "stripe_refund_id": request.stripe_refund_id,
            "amount_cents": request.amount_cents,
            "currency": request.currency,
            "request_type": request.request_type.value,
            **get_balances(db, request.organization_id, request.stripe_invoice_id),
        },
    )
    _commit_or_rollback(db)
    db.refresh(request)

    _send_refund_notification(db, request, subscription)

    logger.info(
        "[refund] Request %d approved by %s — $%.2f %s",
        request.id, approver, request.amount_cents / 100,
        request.request_type.value,
    )
    return request


# ── Reject refund / credit ───────────────────────────────────────────────

def reject_refund(
    db: Session,
    request_id: int,
    rejected_by,
    rejection_reason: str = "",
) -> BillingRefundRequest:
    """Reject a pending refund/credit request."""
    rejector = actor_label(rejected_by)
    request = (
        db.query(BillingRefundRequest)
        .filter(BillingRefundRequest.id == request_id)
        .with_for_update()
        .first()
    )
    if not request:
        raise NotFoundException(f"BillingRefundRequest not found: id={request_id}")

    if request.status != RefundRequestStatus.PENDING_APPROVAL:
        raise BadRequestException(
            f"Request is in status '{request.status.value}', not pending approval"
        )

    before = get_balances(db, request.organization_id, request.stripe_invoice_id)
    request.status = RefundRequestStatus.REJECTED
    request.rejection_reason = rejection_reason
    request.approved_by = rejector
    request.processed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.flush()
    _log_audit(
        db,
        organization_id=request.organization_id,
        action=BillingAuditAction.REFUND_REJECTED,
        entity_type="BillingRefundRequest",
        entity_id=request.id,
        actor=rejected_by,
        before={"status": "pending_approval", **before},
        after={
            "status": "rejected",
            "rejection_reason": rejection_reason,
            "amount_cents": request.amount_cents,
            "request_type": request.request_type.value,
            **get_balances(db, request.organization_id, request.stripe_invoice_id),
        },
    )
    _commit_or_rollback(db)
    db.refresh(request)

    logger.info(
        "[refund] Request %d rejected by %s: %s",
        request.id, rejector, rejection_reason,
    )
    return request


# ── Get requests ──────────────────────────────────────────────────────────

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


def get_all_refund_requests(
    db: Session,
    organization_id: Optional[int] = None,
    status: Optional[RefundRequestStatus] = None,
) -> list[BillingRefundRequest]:
    """Return refund requests across all orgs or for a specific org."""
    q = db.query(BillingRefundRequest)
    if organization_id:
        q = q.filter(BillingRefundRequest.organization_id == organization_id)
    if status:
        q = q.filter(BillingRefundRequest.status == status)
    return q.order_by(BillingRefundRequest.created_at.desc()).all()


def list_refund_requests_page(
    db: Session,
    *,
    organization_id: Optional[int] = None,
    status: Optional[RefundRequestStatus] = None,
    request_type: Optional[RefundRequestType] = None,
    created_from: Optional[datetime] = None,
    created_before: Optional[datetime] = None,
    min_amount_cents: Optional[int] = None,
    max_amount_cents: Optional[int] = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[tuple[BillingRefundRequest, str]], int]:
    """Filtered (AND), paginated list plus the unpaginated total.

    Outer-joins organizations so a request whose organization row is missing
    still renders, labelled DELETED_ORG_LABEL, instead of crashing the page.
    ``created_before`` is exclusive: callers pass the start of the day after the
    last wanted day. Both time bounds are naive UTC.
    """
    from app.modules.hr.models import Organization

    # Organization.name is a Python property, not a column — query the real ones.
    org_name = func.coalesce(Organization.organization_name, Organization.display_name)
    q = db.query(BillingRefundRequest, org_name).outerjoin(
        Organization, Organization.id == BillingRefundRequest.organization_id
    )
    if organization_id:
        q = q.filter(BillingRefundRequest.organization_id == organization_id)
    if status:
        q = q.filter(BillingRefundRequest.status == status)
    if request_type:
        q = q.filter(BillingRefundRequest.request_type == request_type)
    if created_from is not None:
        q = q.filter(BillingRefundRequest.created_at >= created_from)
    if created_before is not None:
        q = q.filter(BillingRefundRequest.created_at < created_before)
    if min_amount_cents is not None:
        q = q.filter(BillingRefundRequest.amount_cents >= min_amount_cents)
    if max_amount_cents is not None:
        q = q.filter(BillingRefundRequest.amount_cents <= max_amount_cents)

    total = q.order_by(None).count()
    rows = (
        q.order_by(BillingRefundRequest.created_at.desc(), BillingRefundRequest.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return [(r, name or DELETED_ORG_LABEL) for r, name in rows], total


def get_refund_summary(db: Session, organization_id: Optional[int] = None) -> dict:
    """Stat-card aggregates. Every figure is 0 (never None) on empty data."""
    base = []
    if organization_id:
        base.append(BillingRefundRequest.organization_id == organization_id)
    processed = BillingRefundRequest.status == RefundRequestStatus.APPROVED_AND_PROCESSED

    def _count(*criteria) -> int:
        return int(db.query(func.count(BillingRefundRequest.id)).filter(*base, *criteria).scalar() or 0)

    return {
        "pending_count": _count(BillingRefundRequest.status == RefundRequestStatus.PENDING_APPROVAL),
        "approved_total_cents": _sum_cents(db, *base, processed),
        "credits_issued_cents": _sum_cents(
            db, *base, processed, BillingRefundRequest.request_type == RefundRequestType.CREDIT
        ),
        "processed_count": _count(processed),
        "currency": "USD",
    }


def provider_warning() -> Optional[str]:
    """Non-blocking notice when the payment provider isn't available. Listing
    never calls Stripe, so the page always loads; this only tells the operator
    that approvals will be recorded locally without provider execution."""
    try:
        from app.modules.billing.stripe_client import stripe_enabled
        if not stripe_enabled():
            return ("Stripe is not configured in this environment. Approved refunds and "
                    "credits are recorded locally and are not executed at the payment provider.")
    except Exception as e:  # a status probe must never break the page
        logger.warning("[refund] provider status check failed: %s", e)
        return "Payment provider status could not be checked."
    return None


# ── Stripe execution helpers ──────────────────────────────────────────────

def _get_stripe_subscription_id(db: Session, organization_id: int) -> Optional[str]:
    """BillingSubscription has no stripe_subscription_id column of its own —
    that lives on ProviderRef, one row per org (see create_checkout_session's
    provider_ref lookup in router.py for the same pattern)."""
    ref = db.query(ProviderRef).filter(ProviderRef.organization_id == organization_id).first()
    return ref.stripe_subscription_id if ref else None


def _execute_stripe_refund(
    db: Session,
    subscription: BillingSubscription,
    amount_cents: int,
    reason: str,
    request_id: int,
    stripe_invoice_id: Optional[str] = None,
) -> dict:
    """Execute refund via Stripe. Falls back gracefully if Stripe not configured.

    The refund goes against the invoice the request names; only when none was named is the subscription's latest
    invoice used (which, after a plan change, may be a small proration and not the payment being refunded)."""
    from app.modules.billing.stripe_client import stripe_enabled, create_refund, payment_intent_for_invoice

    if not stripe_enabled():
        logger.warning("[refund] Stripe not configured — recording refund without Stripe execution")
        return {"refund_id": f"local_refund_{request_id}", "status": "local"}

    stripe_subscription_id = _get_stripe_subscription_id(db, subscription.organization_id)
    if not stripe_subscription_id:
        raise BadRequestException("No Stripe subscription ID — cannot execute refund")

    try:
        from app.modules.billing.stripe_client import get_stripe
        stripe = get_stripe()
        invoice_id = stripe_invoice_id
        if not invoice_id:
            sub = stripe.Subscription.retrieve(stripe_subscription_id)
            if not sub.latest_invoice:
                raise BadRequestException("No invoice found on subscription")
            invoice_id = sub.latest_invoice if isinstance(sub.latest_invoice, str) else sub.latest_invoice.id

        payment_intent = payment_intent_for_invoice(invoice_id)
        if not payment_intent:
            raise BadRequestException("No card payment was found on that invoice, so there is nothing to refund")

        return create_refund(
            payment_intent_id=payment_intent,
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

    stripe_subscription_id = _get_stripe_subscription_id(db, subscription.organization_id)
    if not stripe_subscription_id:
        raise BadRequestException("No Stripe subscription ID — cannot execute credit")

    try:
        from app.modules.billing.stripe_client import get_stripe
        stripe = get_stripe()
        sub = stripe.Subscription.retrieve(stripe_subscription_id)
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
        organization = subscription.organization if hasattr(subscription, "organization") and subscription.organization else None
        org_email = getattr(organization, "registered_email", None) if organization else None
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
