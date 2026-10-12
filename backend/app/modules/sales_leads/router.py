"""Pricing requests: a public form (no sign-in) and a super-admin list to follow them up."""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_super_admin
from app.core.exceptions import NotFoundException
from app.core.rate_limiter import limiter
from app.database import get_db
from app.modules.sales_leads import service
from app.modules.sales_leads.models import PricingRequest
from app.modules.sales_leads.schema import PricingRequestIn, PricingRequestOut

public_router = APIRouter(prefix="/public", tags=["Pricing requests"])
admin_router = APIRouter(
    prefix="/super-admin/pricing-requests", tags=["Pricing requests (super admin)"],
    dependencies=[Depends(get_current_super_admin)],
)

THANKS = "Thank you. We have received your request and will be in touch within one business day."


@public_router.post("/pricing-requests", response_model=PricingRequestOut, status_code=201)
@limiter.limit("5/hour")
def request_pricing(request: Request, data: PricingRequestIn, db: Session = Depends(get_db)):
    """Anyone can ask for pricing. The request is saved, the person gets a confirmation e-mail, and the sales team is notified."""
    if data.website:                         # the hidden field only a bot fills in: pretend it worked, store nothing
        return PricingRequestOut(reference="PR-RECEIVED", message=THANKS, confirmation_email_sent=False)
    ip = request.client.host if request.client else None
    row = service.create_pricing_request(db, data, source_ip=ip)
    sent = service.send_pricing_request_emails(db, row)
    return PricingRequestOut(reference=row.reference, message=THANKS, confirmation_email_sent=bool(sent["confirmation"]))


def _row(r: PricingRequest) -> dict:
    return {
        "id": r.id, "reference": r.reference, "full_name": r.full_name, "work_email": r.work_email, "phone": r.phone,
        "company": r.company, "job_title": r.job_title, "country": r.country, "company_size": r.company_size,
        "plan_interest": r.plan_interest, "products": [p for p in (r.products or "").split(",") if p],
        "billing_preference": r.billing_preference, "timeline": r.timeline, "message": r.message, "status": r.status,
        "confirmation_sent": r.confirmation_sent, "team_notified": r.team_notified,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@admin_router.get("")
def list_pricing_requests(
    status: Optional[Literal["new", "contacted", "closed"]] = None,
    page: int = Query(1, ge=1), per_page: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
):
    q = db.query(PricingRequest)
    if status:
        q = q.filter(PricingRequest.status == status)
    total = q.count()
    rows = q.order_by(PricingRequest.created_at.desc(), PricingRequest.id.desc()).offset((page - 1) * per_page).limit(per_page).all()
    return {"items": [_row(r) for r in rows], "total": total, "page": page, "per_page": per_page}


class StatusIn(BaseModel):
    status: Literal["new", "contacted", "closed"]


@admin_router.patch("/{request_id}")
def update_pricing_request(request_id: int, body: StatusIn, db: Session = Depends(get_db)):
    row = db.query(PricingRequest).filter(PricingRequest.id == request_id).first()
    if not row:
        raise NotFoundException("Pricing request not found.")
    row.status = body.status
    db.commit()
    return _row(row)
