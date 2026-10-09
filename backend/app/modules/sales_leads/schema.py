import re
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.core.email_quality import check_real_email

PLAN_INTEREST = ("core", "advanced", "enterprise", "not_sure")
COMPANY_SIZES = ("1-10", "11-50", "51-200", "201-500", "501-1000", "1000+")
TIMELINES = ("now", "1-3-months", "3-6-months", "just-exploring")
PRODUCTS = ("core_hr", "leave", "docs_pro")

PRODUCT_LABELS = {"core_hr": "Core HR", "leave": "Leave Management", "docs_pro": "Zoiko Docs Pro"}
PLAN_LABELS = {"core": "Core", "advanced": "Advanced", "enterprise": "Enterprise", "not_sure": "Not sure yet"}
TIMELINE_LABELS = {"now": "As soon as possible", "1-3-months": "In 1-3 months", "3-6-months": "In 3-6 months", "just-exploring": "Just exploring"}

_PHONE = re.compile(r"^\+?[0-9 ()\-.]{7,20}$")


def _clean(value: Optional[str]) -> str:
    return re.sub(r"\s+", " ", (value or "")).strip()


class PricingRequestIn(BaseModel):
    full_name: str = Field(..., max_length=150)
    work_email: str = Field(..., max_length=255)
    phone: Optional[str] = Field(None, max_length=40)
    company: str = Field(..., max_length=200)
    job_title: Optional[str] = Field(None, max_length=120)
    country: str = Field(..., max_length=100)
    company_size: Literal["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"]
    plan_interest: Literal["core", "advanced", "enterprise", "not_sure"] = "not_sure"
    products: list[Literal["core_hr", "leave", "docs_pro"]] = Field(default_factory=list)
    billing_preference: Optional[Literal["monthly", "annual"]] = None
    timeline: Optional[Literal["now", "1-3-months", "3-6-months", "just-exploring"]] = None
    message: Optional[str] = Field(None, max_length=2000)
    consent: bool = False
    website: Optional[str] = Field(None, max_length=200)   # honeypot: a human never fills this in

    @field_validator("full_name", "company", "country")
    @classmethod
    def _required_text(cls, v, info):
        v = _clean(v)
        if len(v) < 2:
            raise ValueError("This field is required.")
        return v

    @field_validator("job_title", "message", mode="before")
    @classmethod
    def _optional_text(cls, v):
        v = (v or "").strip() if isinstance(v, str) else v
        return v or None

    @field_validator("work_email")
    @classmethod
    def _email(cls, v):
        v = _clean(v).lower()
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$", v):
            raise ValueError("Enter a valid email address.")
        check_real_email(v, label="Work email")      # raises a plain message for placeholder / disposable addresses
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

    @field_validator("consent")
    @classmethod
    def _consent(cls, v):
        if not v:
            raise ValueError("Please agree to be contacted about this request.")
        return v


class PricingRequestOut(BaseModel):
    reference: str
    message: str
    confirmation_email_sent: bool
