"""Saving a pricing request and e-mailing it: a confirmation to the person, and a notification to the sales team."""
import logging
from datetime import datetime

from sqlalchemy.orm import Session

from app.config import settings
from app.modules.sales_leads.models import PricingRequest, PricingRequestStatus
from app.modules.sales_leads.schema import PricingRequestIn, PLAN_LABELS, PRODUCT_LABELS, TIMELINE_LABELS
from app.services import email_service

logger = logging.getLogger("zoiko")


def sales_recipients() -> list[str]:
    """Who is told about a new request: SALES_NOTIFY_EMAIL (comma separated), else the address the platform sends from."""
    raw = (getattr(settings, "SALES_NOTIFY_EMAIL", "") or "").strip() or (settings.SMTP_FROM_EMAIL or "").strip()
    return [a.strip() for a in raw.replace(";", ",").split(",") if a.strip()]


def create_pricing_request(db: Session, data: PricingRequestIn, source_ip: str | None = None) -> PricingRequest:
    now = datetime.utcnow()
    row = PricingRequest(
        reference="pending",
        full_name=data.full_name, work_email=data.work_email, phone=data.phone, company=data.company,
        job_title=data.job_title, country=data.country, company_size=data.company_size,
        plan_interest=data.plan_interest, products=",".join(data.products) or None,
        billing_preference=data.billing_preference, timeline=data.timeline, message=data.message,
        consent=True, status=PricingRequestStatus.NEW.value, source_ip=(source_ip or None),
    )
    db.add(row)
    db.flush()
    row.reference = f"PR-{now.year}-{row.id:06d}"     # the row id keeps references unique even under concurrent requests
    db.commit()
    db.refresh(row)
    return row


def send_pricing_request_emails(db: Session, row: PricingRequest) -> dict:
    """Both e-mails. A failed send is logged and recorded on the row, never raised: the request itself is already saved."""
    products = [PRODUCT_LABELS.get(p, p) for p in (row.products or "").split(",") if p]
    out = {"confirmation": False, "team": 0}
    try:
        out["confirmation"] = bool(email_service.send_pricing_request_received(
            email=row.work_email, first_name=row.full_name.split(" ")[0], reference=row.reference,
            plan_label=PLAN_LABELS.get(row.plan_interest, row.plan_interest), products=products, db=db,
        ))
    except Exception:
        logger.exception("[pricing] confirmation email failed for %s", row.reference)
    for recipient in sales_recipients():
        try:
            if email_service.send_pricing_request_to_sales(
                email=recipient, reference=row.reference, full_name=row.full_name, work_email=row.work_email,
                phone=row.phone or "", company=row.company, job_title=row.job_title or "", country=row.country,
                company_size=row.company_size, plan_label=PLAN_LABELS.get(row.plan_interest, row.plan_interest),
                products=products, billing_preference=(row.billing_preference or "").title(),
                timeline=TIMELINE_LABELS.get(row.timeline or "", ""), message=row.message or "", db=db,
            ):
                out["team"] += 1
        except Exception:
            logger.exception("[pricing] sales notification failed for %s", row.reference)
    try:
        row.confirmation_sent = out["confirmation"]
        row.team_notified = out["team"] > 0
        db.commit()
    except Exception:
        db.rollback()
    return out
