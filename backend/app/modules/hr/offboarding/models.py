"""Offboarding tables. Every table carries organization_id, so each one is a tenant table with the isolation policy.

Statuses of a case:
  submitted  — a resignation (or an HR-started exit that needs a second approver) waiting for a decision
  approved   — accepted; the person is serving notice / working through clearance until the last working day
  exited     — the last working day has passed (or access was stopped and the day reached): account closed, seat freed
  closed     — clearance, assets and settlement are finished; nothing more to do
  rejected   — the resignation was not accepted
  withdrawn  — the person took the resignation back (before approval, or after with HR's agreement)
  cancelled  — HR cancelled an exit it started
"""
from sqlalchemy import (JSON, Boolean, Column, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text,
                        UniqueConstraint)
from sqlalchemy.sql import func

from app.database import Base

CASE_STATUSES = ("submitted", "approved", "exited", "closed", "rejected", "withdrawn", "cancelled")
OPEN_STATUSES = ("submitted", "approved", "exited")
EXIT_TYPES = ("resignation", "termination", "end_of_contract", "mutual_separation", "retirement", "death_in_service")
NOTICE_HANDLING = ("serve", "waive", "pay_in_lieu", "garden_leave")
OWNER_ROLES = ("hr", "manager", "it", "finance", "admin", "employee")
TASK_STATUSES = ("open", "done", "exception", "cancelled")
ASSET_RETURN_STATUSES = ("pending", "returned", "damaged", "lost", "written_off")
SETTLEMENT_STATUSES = ("draft", "approved", "paid", "not_applicable")
INTERVIEW_STATUSES = ("not_sent", "sent", "draft", "submitted", "declined")
DOCUMENT_KINDS = ("resignation_acknowledgement", "relieving_letter", "experience_letter", "settlement_statement",
                  "exit_summary")


class OffboardingCase(Base):
    __tablename__ = "offboarding_cases"
    __table_args__ = (Index("ix_offb_case_org_status", "organization_id", "status"),
                      Index("ix_offb_case_employee", "organization_id", "employee_id"),
                      Index("ix_offb_case_lwd", "status", "last_working_day"))

    id                  = Column(Integer, primary_key=True)
    organization_id     = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    employee_id         = Column(Integer, ForeignKey("employees.id"), nullable=False)
    case_number         = Column(String(30), nullable=False)
    exit_type           = Column(String(30), nullable=False)
    status              = Column(String(20), nullable=False, default="submitted", server_default="submitted")
    source              = Column(String(20), nullable=False, default="hr", server_default="hr")   # employee | hr | system | legacy
    reason_category     = Column(String(60), nullable=True)
    reason              = Column(Text, nullable=True)          # what the person / HR wrote
    hr_notes            = Column(Text, nullable=True)          # never shown to the leaver
    resignation_date    = Column(Date, nullable=True)          # the day the notice was given
    requested_last_day  = Column(Date, nullable=True)          # what the person asked for
    notice_days         = Column(Integer, nullable=True)       # notice the rules give, in calendar days
    notice_end_date     = Column(Date, nullable=True)          # resignation_date + notice
    notice_handling     = Column(String(20), nullable=False, default="serve", server_default="serve")
    last_working_day    = Column(Date, nullable=True)
    reportees_to_id     = Column(Integer, ForeignKey("employees.id"), nullable=True)
    rehire_eligible     = Column(Boolean, nullable=True)
    rehire_notes        = Column(Text, nullable=True)
    requested_by        = Column(Integer, ForeignKey("employees.id"), nullable=True)
    decided_by          = Column(Integer, ForeignKey("employees.id"), nullable=True)
    decided_at          = Column(DateTime, nullable=True)
    decision_note       = Column(Text, nullable=True)
    withdrawal_requested_at = Column(DateTime, nullable=True)
    withdrawal_reason   = Column(Text, nullable=True)
    access_revoked_at   = Column(DateTime, nullable=True)
    exited_at           = Column(DateTime, nullable=True)
    closed_at           = Column(DateTime, nullable=True)
    closed_by           = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at          = Column(DateTime, nullable=False, server_default=func.now())
    updated_at          = Column(DateTime, nullable=True, onupdate=func.now())


class OffboardingTask(Base):
    """One clearance item of a case. owner_role says whose job it is; assignee_id is the person who does it."""
    __tablename__ = "offboarding_tasks"
    __table_args__ = (Index("ix_offb_task_case", "organization_id", "case_id"),
                      Index("ix_offb_task_assignee", "organization_id", "assignee_id", "status"))

    id              = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    case_id         = Column(Integer, ForeignKey("offboarding_cases.id", ondelete="CASCADE"), nullable=False)
    title           = Column(String(200), nullable=False)
    description     = Column(Text, nullable=True)
    owner_role      = Column(String(20), nullable=False)
    assignee_id     = Column(Integer, ForeignKey("employees.id"), nullable=True)
    mandatory       = Column(Boolean, nullable=False, default=True, server_default="true")
    due_date        = Column(Date, nullable=True)
    status          = Column(String(12), nullable=False, default="open", server_default="open")
    note            = Column(Text, nullable=True)
    exception_reason = Column(Text, nullable=True)
    completed_by    = Column(Integer, ForeignKey("employees.id"), nullable=True)
    completed_at    = Column(DateTime, nullable=True)
    reminded_at     = Column(DateTime, nullable=True)
    # set when the item only mirrors another record of the case (assets | settlement | interview | relieving_letter):
    # it is ticked automatically when that record is done (service.sync_auto_tasks)
    auto_key        = Column(String(30), nullable=True)
    sort_order      = Column(Integer, nullable=False, default=0, server_default="0")
    created_at      = Column(DateTime, nullable=False, server_default=func.now())


class OffboardingChecklistTemplate(Base):
    """A reusable clearance checklist. items: [{title, description, owner_role, due_offset_days, mandatory}] where
    due_offset_days counts from the last working day (negative = before it)."""
    __tablename__ = "offboarding_checklist_templates"
    __table_args__ = (Index("ix_offb_tpl_org", "organization_id"),)

    id              = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    name            = Column(String(120), nullable=False)
    exit_types      = Column(JSON, nullable=True)      # None / []: every exit type
    department_id   = Column(Integer, ForeignKey("departments.id"), nullable=True)
    items           = Column(JSON, nullable=False, default=list)
    is_default      = Column(Boolean, nullable=False, default=False, server_default="false")
    is_active       = Column(Boolean, nullable=False, default=True, server_default="true")
    created_by      = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at      = Column(DateTime, nullable=False, server_default=func.now())
    updated_at      = Column(DateTime, nullable=True, onupdate=func.now())


class OffboardingAssetReturn(Base):
    __tablename__ = "offboarding_asset_returns"
    __table_args__ = (UniqueConstraint("case_id", "asset_id", name="uq_offb_asset_case"),
                      Index("ix_offb_asset_org_status", "organization_id", "status"))

    id              = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    case_id         = Column(Integer, ForeignKey("offboarding_cases.id", ondelete="CASCADE"), nullable=False)
    asset_id        = Column(Integer, ForeignKey("assets.id"), nullable=False)
    asset_name      = Column(String(200), nullable=True)     # as it was when the case started
    asset_tag       = Column(String(100), nullable=True)
    status          = Column(String(12), nullable=False, default="pending", server_default="pending")
    condition       = Column(String(50), nullable=True)
    note            = Column(Text, nullable=True)
    recovery_amount = Column(Numeric(12, 2), nullable=True)  # charged to the leaver (damaged / lost)
    received_by     = Column(Integer, ForeignKey("employees.id"), nullable=True)
    resolved_at     = Column(DateTime, nullable=True)
    created_at      = Column(DateTime, nullable=False, server_default=func.now())


class OffboardingSettlement(Base):
    """The final settlement record. It is a record HR and finance agree on, not a payroll run.
    earnings / deductions: [{label, amount, source}] — source 'leave' / 'assets' lines are computed, the rest typed."""
    __tablename__ = "offboarding_settlements"
    __table_args__ = (UniqueConstraint("case_id", name="uq_offb_settlement_case"),)

    id              = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    case_id         = Column(Integer, ForeignKey("offboarding_cases.id", ondelete="CASCADE"), nullable=False)
    currency        = Column(String(3), nullable=True)
    leave_days      = Column(Numeric(8, 2), nullable=True)    # leave paid out
    daily_rate      = Column(Numeric(12, 2), nullable=True)
    earnings        = Column(JSON, nullable=False, default=list)
    deductions      = Column(JSON, nullable=False, default=list)
    net_amount      = Column(Numeric(12, 2), nullable=True)
    status          = Column(String(16), nullable=False, default="draft", server_default="draft")
    notes           = Column(Text, nullable=True)
    approved_by     = Column(Integer, ForeignKey("employees.id"), nullable=True)
    approved_at     = Column(DateTime, nullable=True)
    paid_on         = Column(Date, nullable=True)
    payment_reference = Column(String(120), nullable=True)
    updated_by      = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at      = Column(DateTime, nullable=False, server_default=func.now())
    updated_at      = Column(DateTime, nullable=True, onupdate=func.now())


class OffboardingInterview(Base):
    """The exit interview. questions are copied from settings when it is sent, so later edits do not change it."""
    __tablename__ = "offboarding_exit_interviews"
    __table_args__ = (UniqueConstraint("case_id", name="uq_offb_interview_case"),)

    id              = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    case_id         = Column(Integer, ForeignKey("offboarding_cases.id", ondelete="CASCADE"), nullable=False)
    status          = Column(String(12), nullable=False, default="not_sent", server_default="not_sent")
    questions       = Column(JSON, nullable=False, default=list)
    answers         = Column(JSON, nullable=True)
    primary_reason  = Column(String(60), nullable=True)
    would_recommend = Column(Integer, nullable=True)          # 0-10
    hr_summary      = Column(Text, nullable=True)
    sent_at         = Column(DateTime, nullable=True)
    submitted_at    = Column(DateTime, nullable=True)
    created_at      = Column(DateTime, nullable=False, server_default=func.now())


class OffboardingDocument(Base):
    """A letter issued to the leaver. content is a frozen snapshot of the values printed; the PDF is drawn from it, so
    a reissue is a new row and the old one stays as it was."""
    __tablename__ = "offboarding_documents"
    __table_args__ = (Index("ix_offb_doc_case", "organization_id", "case_id"),
                      Index("ix_offb_doc_token", "access_token_hash"))

    id              = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    case_id         = Column(Integer, ForeignKey("offboarding_cases.id", ondelete="CASCADE"), nullable=False)
    kind            = Column(String(40), nullable=False)
    title           = Column(String(200), nullable=False)
    content         = Column(JSON, nullable=False, default=dict)
    issued_by       = Column(Integer, ForeignKey("employees.id"), nullable=True)
    issued_at       = Column(DateTime, nullable=False, server_default=func.now())
    revoked_at      = Column(DateTime, nullable=True)
    access_token_hash = Column(String(64), nullable=True)     # the emailed link for after the last day (sha256)
    access_expires_at = Column(DateTime, nullable=True)
    downloaded_at   = Column(DateTime, nullable=True)


class OffboardingActivity(Base):
    __tablename__ = "offboarding_activity"
    __table_args__ = (Index("ix_offb_activity_case", "organization_id", "case_id"),)

    id              = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    case_id         = Column(Integer, ForeignKey("offboarding_cases.id", ondelete="CASCADE"), nullable=False)
    actor_id        = Column(Integer, ForeignKey("employees.id"), nullable=True)
    action          = Column(String(60), nullable=False)
    message         = Column(String(500), nullable=False)
    hr_only         = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at      = Column(DateTime, nullable=False, server_default=func.now())


class OffboardingSettings(Base):
    """One row per organisation. config holds every setting (service.DEFAULT_SETTINGS lists them and their defaults)."""
    __tablename__ = "offboarding_settings"
    __table_args__ = (UniqueConstraint("organization_id", name="uq_offb_settings_org"),)

    id              = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    config          = Column(JSON, nullable=False, default=dict)
    updated_by      = Column(Integer, ForeignKey("employees.id"), nullable=True)
    updated_at      = Column(DateTime, nullable=True, server_default=func.now(), onupdate=func.now())
