"""
modules/billing/quotation_service.py
-------------------------------------
Registration quotation workflow: a newly-registered org is emailed a quote
for the plan they selected; the registrant accepts or rejects it via a
single-use emailed link. Accepting notifies the registrant and every Super
Admin, then emails an invoice.

This runs independent of Stripe/webhooks — there is no real subscription at
registration time (registration only starts a free evaluation, see
employee/service.py::register_enterprise), so amount_cents here is the
quoted list price, and the "invoice" sent on acceptance is a notification
email (via the existing invoice_sent.html template), not a Stripe charge.
Converting the evaluation into an actual paid, Stripe-backed subscription is
the existing self-serve checkout flow (billing_router's /checkout-session).

Decision token: single-use, expiring, stored as a SHA-256 hash directly on
the quotation row (not the shared security_action_tokens table — a
quotation has exactly one decision link for its whole lifetime, so keeping
the hash local avoids widening that table/enum for an unrelated concern).
"""

import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException, NotFoundException
from app.modules.billing.models import BillingPlan, BillingQuotation, BillingCycle, PlanCode, QuotationStatus

logger = logging.getLogger("zoiko.billing.quotation")

QUOTE_VALIDITY_DAYS = 14


def _token_hash(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _decision_link(raw_token: str) -> str:
    base = os.environ.get("API_BASE_URL", "http://localhost:8000")
    return f"{base}/billing/quotations/decide?token={raw_token}"


def _generate_quote_number(db: Session) -> str:
    """Q-{year}-{seq:05d}, unique. billing_quotations is low-volume, so a
    simple count+retry loop is sufficient (no dedicated sequence table)."""
    year = datetime.utcnow().year
    prefix = f"Q-{year}-"
    seq = db.query(BillingQuotation).filter(BillingQuotation.quote_number.like(f"{prefix}%")).count() + 1
    while True:
        candidate = f"{prefix}{seq:05d}"
        if not db.query(BillingQuotation).filter(BillingQuotation.quote_number == candidate).first():
            return candidate
        seq += 1


def _quote_amount_cents(db: Session, plan_code: str, billing_cycle: str) -> tuple[int, BillingPlan]:
    plan = db.query(BillingPlan).filter(BillingPlan.code == PlanCode(plan_code)).first()
    if plan is None:
        raise NotFoundException("BillingPlan", plan_code)
    price = plan.annual_price if billing_cycle == BillingCycle.ANNUAL.value else plan.monthly_price
    if price is None:
        raise BadRequestException(
            f"Plan '{plan_code}' has no {billing_cycle} price configured — cannot generate a quotation."
        )
    return int(round(float(price) * 100)), plan


def create_and_send_quotation(
    db: Session,
    *,
    organization,
    plan_code: str,
    billing_cycle: str,
    recipient_email: str,
    recipient_name: str,
) -> Optional[BillingQuotation]:
    """Create a PENDING quotation and email it with a single-use decision
    link. Returns the quotation, or None if quoting failed (logged) — this
    must never block registration itself from succeeding."""
    try:
        amount_cents, plan = _quote_amount_cents(db, plan_code, billing_cycle)

        valid_until = datetime.utcnow() + timedelta(days=QUOTE_VALIDITY_DAYS)
        quotation = BillingQuotation(
            organization_id=organization.id,
            quote_number=_generate_quote_number(db),
            plan_code=PlanCode(plan_code),
            billing_cycle=BillingCycle(billing_cycle),
            currency=plan.currency or "USD",
            amount_cents=amount_cents,
            recipient_email=recipient_email,
            recipient_name=recipient_name,
            status=QuotationStatus.PENDING,
            valid_until=valid_until,
        )
        db.add(quotation)
        db.flush()

        raw_token = secrets.token_urlsafe(32)
        quotation.decision_token_hash = _token_hash(raw_token)
        quotation.decision_token_expires_at = valid_until
        db.commit()
        db.refresh(quotation)

        from app.services.email_service import send_quotation_proposal_email

        send_quotation_proposal_email(
            email=recipient_email,
            recipient_first_name=recipient_name or recipient_email,
            organization_name=organization.name,
            plan_name=plan.name or plan_code.title(),
            amount_display=f"{quotation.currency} {amount_cents / 100:,.2f}",
            valid_until_display=valid_until.strftime("%b %d, %Y"),
            decision_url=_decision_link(raw_token),
            db=db,
            organization_id=organization.id,
        )
        return quotation
    except Exception as e:
        logger.warning("[quotation] Failed to create/send quotation for org %s: %s", organization.id, e)
        return None


def get_quotation_by_token(db: Session, raw_token: str) -> Optional[BillingQuotation]:
    """Read-only validity check for the GET decision page. Returns None for
    EVERY invalid state (unknown, expired, already decided) so the page
    can't be used to enumerate token state."""
    quotation = db.query(BillingQuotation).filter(
        BillingQuotation.decision_token_hash == _token_hash(raw_token),
    ).first()
    if quotation is None:
        return None
    if quotation.status != QuotationStatus.PENDING:
        return None
    if quotation.decision_token_expires_at is None or quotation.decision_token_expires_at <= datetime.utcnow():
        return None
    return quotation


def decide_quotation(db: Session, raw_token: str, decision: str) -> BillingQuotation:
    """Atomically consume the decision token and apply accept/reject.

    Single UPDATE...RETURNING (via the ORM's synchronize-free update+refetch
    pattern below) keyed on status=PENDING so two concurrent requests for the
    same token can never both succeed — matches the security posture of
    employee/service.py's _consume_action_token for the shared token table.
    """
    if decision not in ("accept", "reject"):
        raise BadRequestException("decision must be 'accept' or 'reject'.")

    token_hash = _token_hash(raw_token)
    new_status = QuotationStatus.ACCEPTED if decision == "accept" else QuotationStatus.REJECTED

    from sqlalchemy import text as sql_text
    row = db.execute(
        sql_text(
            """
            UPDATE billing_quotations
            SET status = :new_status, decided_at = CURRENT_TIMESTAMP
            WHERE decision_token_hash = :hash
              AND status = 'PENDING'
              AND decision_token_expires_at > :now
            RETURNING id
            """
        ),
        {"new_status": new_status.name, "hash": token_hash, "now": datetime.utcnow()},
    ).fetchone()
    db.commit()

    if row is None:
        raise BadRequestException(
            "This quotation link is invalid, expired, or has already been used."
        )

    quotation = db.query(BillingQuotation).filter(BillingQuotation.id == row[0]).first()

    if decision == "accept":
        _on_quotation_accepted(db, quotation)

    return quotation


def _on_quotation_accepted(db: Session, quotation: BillingQuotation) -> None:
    """Notify the registrant + every Super Admin, then email an invoice.
    Each step is independently guarded — a failure in one must not roll back
    the (already-committed) acceptance decision or block the others."""
    from app.modules.hr.models import Organization
    from app.modules.employee.models import Employee, UserRole
    from app.services.email_service import send_quotation_accepted_email, send_quotation_invoice_email

    organization = db.query(Organization).filter(Organization.id == quotation.organization_id).first()
    org_name = organization.name if organization else "your organization"
    amount_display = f"{quotation.currency} {quotation.amount_cents / 100:,.2f}"

    try:
        send_quotation_accepted_email(
            email=quotation.recipient_email,
            recipient_first_name=quotation.recipient_name or quotation.recipient_email,
            organization_name=org_name,
            quote_number=quotation.quote_number,
            amount_display=amount_display,
            audience="registrant",
            db=db,
            organization_id=quotation.organization_id,
        )
    except Exception as e:
        logger.warning("[quotation] Failed to notify registrant of acceptance (quote %s): %s", quotation.quote_number, e)

    try:
        super_admins = db.query(Employee).filter(Employee.role == UserRole.SUPER_ADMIN).all()
        for sa in super_admins:
            send_quotation_accepted_email(
                email=sa.email,
                recipient_first_name=sa.first_name or "there",
                organization_name=org_name,
                quote_number=quotation.quote_number,
                amount_display=amount_display,
                audience="super_admin",
                db=db,
                organization_id=quotation.organization_id,
            )
    except Exception as e:
        logger.warning("[quotation] Failed to notify super admins of acceptance (quote %s): %s", quotation.quote_number, e)

    try:
        invoice_number = quotation.quote_number.replace("Q-", "INV-")
        due_date = datetime.utcnow() + timedelta(days=14)
        from app.config import settings

        pay_url = f"{settings.FRONTEND_URL.rstrip('/')}/organization-admin/pay-invoice?invoice={invoice_number}"
        send_quotation_invoice_email(
            email=quotation.recipient_email,
            recipient_first_name=quotation.recipient_name or quotation.recipient_email,
            organization_name=org_name,
            invoice_number=invoice_number,
            amount_display=amount_display,
            currency=quotation.currency,
            due_date_display=due_date.strftime("%b %d, %Y"),
            pay_url=pay_url,
            db=db,
            organization_id=quotation.organization_id,
        )
        quotation.invoice_number = invoice_number
        quotation.invoice_sent_at = datetime.utcnow()
        db.commit()
    except Exception as e:
        logger.warning("[quotation] Failed to send invoice for accepted quote %s: %s", quotation.quote_number, e)
