"""A pricing request from the public "Request Pricing" page: who asked, about what, and what happened to it."""
import enum

from sqlalchemy import Column, Integer, String, Text, DateTime, Date, Boolean, Index
from sqlalchemy.sql import func

from app.database import Base


class PricingRequestStatus(str, enum.Enum):
    NEW = "new"
    CONTACTED = "contacted"
    CLOSED = "closed"


class PricingRequest(Base):
    __tablename__ = "pricing_requests"

    id = Column(Integer, primary_key=True, index=True)
    reference = Column(String(24), unique=True, nullable=False)          # PR-2026-000042, quoted in both emails
    full_name = Column(String(150), nullable=False)
    work_email = Column(String(255), nullable=False, index=True)
    phone = Column(String(40), nullable=True)
    company = Column(String(200), nullable=False)
    job_title = Column(String(120), nullable=True)
    country = Column(String(100), nullable=False)
    company_size = Column(String(40), nullable=False)                    # e.g. "51-200"
    plan_interest = Column(String(40), nullable=False)                   # core | advanced | enterprise | not_sure
    products = Column(String(200), nullable=True)                        # comma list: core_hr,leave,docs_pro
    billing_preference = Column(String(20), nullable=True)               # monthly | annual
    timeline = Column(String(40), nullable=True)                         # when they want to start
    message = Column(Text, nullable=True)
    consent = Column(Boolean, nullable=False, default=True)              # agreed to be contacted about this request
    status = Column(String(20), nullable=False, default=PricingRequestStatus.NEW.value, index=True)
    source_ip = Column(String(64), nullable=True)
    confirmation_sent = Column(Boolean, nullable=False, default=False)
    team_notified = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    __table_args__ = (Index("ix_pricing_requests_created", "created_at"),)


class DemoRequest(Base):
    __tablename__ = "demo_requests"

    id = Column(Integer, primary_key=True, index=True)
    reference = Column(String(24), unique=True, nullable=False)          # DM-2026-000042
    full_name = Column(String(150), nullable=False)
    work_email = Column(String(255), nullable=False, index=True)
    phone = Column(String(40), nullable=True)
    company = Column(String(200), nullable=False)
    job_title = Column(String(120), nullable=True)
    country = Column(String(100), nullable=False)
    company_size = Column(String(40), nullable=False)
    interests = Column(String(300), nullable=True)                       # comma list of INTERESTS keys
    preferred_date = Column(Date, nullable=True)
    preferred_time = Column(String(20), nullable=True)                   # morning | afternoon | evening
    timezone = Column(String(64), nullable=True)
    demo_format = Column(String(20), nullable=True)                      # live | in_person | recorded
    message = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="new", index=True)   # new | scheduled | completed | closed
    source_ip = Column(String(64), nullable=True)
    confirmation_sent = Column(Boolean, nullable=False, default=False)
    admins_notified = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)
