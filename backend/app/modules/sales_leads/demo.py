"""Book a Demo: the public form, the stored request, and the e-mails (a confirmation to the person; every active super admin
and the sales inbox are told about it)."""
import logging
import re
from datetime import date, datetime, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_super_admin
from app.core.email_quality import check_real_email
from app.core.exceptions import NotFoundException
from app.core.rate_limiter import limiter
from app.database import get_db
from app.modules.sales_leads.models import DemoRequest
from app.modules.sales_leads.schema import COMPANY_SIZES, PRODUCT_LABELS  # noqa: F401  (shared choices)
from app.modules.sales_leads.service import sales_recipients
from app.services import email_service

logger = logging.getLogger("zoiko")

TIME_SLOTS = {"morning": "Morning (9am-12pm)", "afternoon": "Afternoon (12pm-4pm)", "evening": "Evening (4pm-7pm)"}
DEMO_FORMATS = {"live": "Live video call", "in_person": "In person", "recorded": "Recorded walkthrough"}
INTERESTS = {"core_hr": "Core HR", "leave": "Leave Management", "docs_pro": "Zoiko Docs Pro", "attendance": "Attendance",
             "payroll": "Payroll", "recruitment": "Recruitment", "performance": "Performance", "learning": "Learning"}


_PHONE = re.compile(r"^\+?[0-9 ()\-.]{7,20}$")


def _clean(v) -> str:
    return re.sub(r"\s+", " ", (v or "")).strip()


class DemoRequestIn(BaseModel):
    full_name: str = Field(..., max_length=150)
    work_email: str = Field(..., max_length=255)
    phone: Optional[str] = Field(None, max_length=40)
    company: str = Field(..., max_length=200)
    job_title: Optional[str] = Field(None, max_length=120)
    country: str = Field(..., max_length=100)
    company_size: Literal["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"]
    interests: list[Literal["core_hr", "leave", "docs_pro", "attendance", "payroll", "recruitment", "performance", "learning"]] = Field(default_factory=list)
    preferred_date: Optional[date] = None
    preferred_time: Optional[Literal["morning", "afternoon", "evening"]] = None
    timezone: Optional[str] = Field(None, max_length=64)
    demo_format: Literal["live", "in_person", "recorded"] = "live"
    message: Optional[str] = Field(None, max_length=2000)
    consent: bool = False
    website: Optional[str] = Field(None, max_length=200)   # honeypot

    @field_validator("full_name", "company", "country")
    @classmethod
    def _required(cls, v):
        v = _clean(v)
        if len(v) < 2:
            raise ValueError("This field is required.")
        return v

    @field_validator("job_title", "message", "timezone", mode="before")
    @classmethod
    def _optional(cls, v):
        v = v.strip() if isinstance(v, str) else v
        return v or None

    @field_validator("work_email")
    @classmethod
    def _email(cls, v):
        v = _clean(v).lower()
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$", v):
            raise ValueError("Enter a valid email address.")
        check_real_email(v, label="Work email")
        return v

    @field_validator("phone")
    @classmethod
    def _phone(cls, v):
        v = _clean(v)
        if not v:
            return None
        if not _PHONE.match(v) or len(re.sub(r"\D", "", v)) < 7:
            raise ValueError("Enter a valid phone number.")
        return v

    @field_validator("preferred_date")
    @classmethod
    def _date(cls, v):
        if v is None:
            return v
        today = date.today()
        if v < today:
            raise ValueError("Choose today or a later date.")
        if v > today + timedelta(days=180):
            raise ValueError("Choose a date within the next six months.")
        return v

    @field_validator("consent")
    @classmethod
    def _consent(cls, v):
        if not v:
            raise ValueError("Please agree to be contacted about this demo.")
        return v


class DemoRequestOut(BaseModel):
    reference: str
    message: str
    confirmation_email_sent: bool


def super_admin_emails(db: Session) -> list[str]:
    from app.modules.employee.models import Employee, UserRole
    rows = db.query(Employee.email).filter(Employee.role == UserRole.SUPER_ADMIN, Employee.is_active.is_(True)).all()
    return [r[0] for r in rows if r[0]]


def _labels(keys: str | None, table: dict) -> list[str]:
    return [table.get(k, k) for k in (keys or "").split(",") if k]


def _when(row: DemoRequest) -> str:
    if not row.preferred_date and not row.preferred_time:
        return "Any time that suits you"
    parts = [row.preferred_date.strftime("%a, %d %b %Y") if row.preferred_date else "Any day",
             TIME_SLOTS.get(row.preferred_time or "", "any time")]
    return " · ".join(parts) + (f" ({row.timezone})" if row.timezone else "")


def create_demo_request(db: Session, data: DemoRequestIn, source_ip: str | None = None) -> DemoRequest:
    row = DemoRequest(
        reference="pending", full_name=data.full_name, work_email=data.work_email, phone=data.phone, company=data.company,
        job_title=data.job_title, country=data.country, company_size=data.company_size, interests=",".join(data.interests) or None,
        preferred_date=data.preferred_date, preferred_time=data.preferred_time, timezone=data.timezone,
        demo_format=data.demo_format, message=data.message, status="new", source_ip=source_ip or None,
    )
    db.add(row)
    db.flush()
    row.reference = f"DM-{datetime.utcnow().year}-{row.id:06d}"
    db.commit()
    db.refresh(row)
    return row


def send_demo_emails(db: Session, row: DemoRequest) -> dict:
    interests = _labels(row.interests, INTERESTS)
    when = _when(row)
    fmt = DEMO_FORMATS.get(row.demo_format or "live", "Live video call")
    out = {"confirmation": False, "admins": 0}
    try:
        out["confirmation"] = bool(email_service.send_demo_request_received(
            email=row.work_email, first_name=row.full_name.split(" ")[0], reference=row.reference, when=when, demo_format=fmt,
            interests=interests, db=db))
    except Exception:
        logger.exception("[demo] confirmation email failed for %s", row.reference)
    recipients = []
    for addr in super_admin_emails(db) + sales_recipients():
        if addr.lower() not in {r.lower() for r in recipients}:
            recipients.append(addr)
    for addr in recipients:
        try:
            if email_service.send_demo_request_to_admins(
                email=addr, reference=row.reference, full_name=row.full_name, work_email=row.work_email, phone=row.phone or "",
                company=row.company, job_title=row.job_title or "", country=row.country, company_size=row.company_size,
                interests=interests, when=when, demo_format=fmt, message=row.message or "", db=db):
                out["admins"] += 1
        except Exception:
            logger.exception("[demo] admin notification failed for %s", row.reference)
    try:
        row.confirmation_sent = out["confirmation"]
        row.admins_notified = out["admins"]
        db.commit()
    except Exception:
        db.rollback()
    return out


THANKS = "Thank you. Your demo request is in, and our team will confirm a time with you within one business day."

public_router = APIRouter(prefix="/public", tags=["Demo requests"])
admin_router = APIRouter(prefix="/super-admin/demo-requests", tags=["Demo requests (super admin)"],
                         dependencies=[Depends(get_current_super_admin)])


@public_router.post("/demo-requests", response_model=DemoRequestOut, status_code=201)
@limiter.limit("5/hour")
def request_demo(request: Request, data: DemoRequestIn, db: Session = Depends(get_db)):
    if data.website:
        return DemoRequestOut(reference="DM-RECEIVED", message=THANKS, confirmation_email_sent=False)
    row = create_demo_request(db, data, source_ip=request.client.host if request.client else None)
    sent = send_demo_emails(db, row)
    return DemoRequestOut(reference=row.reference, message=THANKS, confirmation_email_sent=bool(sent["confirmation"]))


def _row(r: DemoRequest) -> dict:
    return {
        "id": r.id, "reference": r.reference, "full_name": r.full_name, "work_email": r.work_email, "phone": r.phone,
        "company": r.company, "job_title": r.job_title, "country": r.country, "company_size": r.company_size,
        "interests": [k for k in (r.interests or "").split(",") if k],
        "preferred_date": r.preferred_date.isoformat() if r.preferred_date else None, "preferred_time": r.preferred_time,
        "timezone": r.timezone, "demo_format": r.demo_format, "message": r.message, "status": r.status,
        "confirmation_sent": r.confirmation_sent, "admins_notified": r.admins_notified,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@admin_router.get("")
def list_demo_requests(status: Optional[Literal["new", "scheduled", "completed", "closed"]] = None,
                       page: int = Query(1, ge=1), per_page: int = Query(25, ge=1, le=100), db: Session = Depends(get_db)):
    q = db.query(DemoRequest)
    if status:
        q = q.filter(DemoRequest.status == status)
    total = q.count()
    rows = q.order_by(DemoRequest.created_at.desc(), DemoRequest.id.desc()).offset((page - 1) * per_page).limit(per_page).all()
    return {"items": [_row(r) for r in rows], "total": total, "page": page, "per_page": per_page}


class DemoStatusIn(BaseModel):
    status: Literal["new", "scheduled", "completed", "closed"]


@admin_router.patch("/{request_id}")
def update_demo_request(request_id: int, body: DemoStatusIn, db: Session = Depends(get_db)):
    row = db.query(DemoRequest).filter(DemoRequest.id == request_id).first()
    if not row:
        raise NotFoundException("Demo request not found.")
    row.status = body.status
    db.commit()
    return _row(row)
