"""Tables of the documents module (ZHR-DOCS-ARCH-001 §6.3).

Arrays (department / employee / role lists) are JSON lists so the same models run on PostgreSQL and on the SQLite test
databases; every list is validated and de-duplicated by the services before it is stored.
"""
import enum

from sqlalchemy import (
    JSON, BigInteger, Boolean, Column, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, event,
)
from sqlalchemy.sql import func

from app.database import Base


class DocumentScope(str, enum.Enum):
    EMPLOYEE = "employee"
    COMPANY = "company"


class DocumentSource(str, enum.Enum):
    EMPLOYEE = "employee"
    COMPANY = "company"
    PAYROLL = "payroll"
    SYSTEM_ISSUE = "system_issue"
    TEMPLATE = "template"
    LEGACY_ADMIN = "legacy_admin"


class VersionStatus(str, enum.Enum):
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    REUPLOAD_REQUESTED = "reupload_requested"
    EXPIRED = "expired"
    SUPERSEDED = "superseded"


class Uploader(str, enum.Enum):
    """Who supplies the files of an employee category."""
    EMPLOYEE = "employee"
    COMPANY = "company"
    SYSTEM = "system"


class Visibility(str, enum.Enum):
    ADMIN_ONLY = "admin_only"
    ALL_EMPLOYEES = "all_employees"
    DEPARTMENTS = "departments"
    ROLES = "roles"
    EMPLOYEES = "employees"


class AccessPermission(str, enum.Enum):
    VIEW = "view"
    DOWNLOAD = "download"


class PublishState(str, enum.Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    PUBLISHED = "published"
    UNPUBLISHED = "unpublished"


class HrEmployeeDocumentCategory(Base):
    """An employee document container (Identity Proof, Education, Payslips, ...), configurable per organization."""
    __tablename__ = "hr_employee_document_categories"
    __table_args__ = (
        UniqueConstraint("organization_id", "key", name="uq_hedc_org_key"),
        Index("ix_hedc_org_active", "organization_id", "is_active", "sort_order"),
    )

    id                      = Column(Integer, primary_key=True)
    organization_id         = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    key                     = Column(String(50), nullable=False)
    name                    = Column(String(120), nullable=False)
    description             = Column(Text, nullable=True)
    is_required             = Column(Boolean, nullable=False, default=False, server_default="0")
    uploader                = Column(String(20), nullable=False, default=Uploader.EMPLOYEE.value, server_default="employee")
    requires_expiry         = Column(Boolean, nullable=False, default=False, server_default="0")
    max_files               = Column(Integer, nullable=True)
    sensitivity             = Column(String(4), nullable=False, default="C3", server_default="C3")
    applies_to              = Column(JSON, nullable=True)        # {"department_ids": [...], "employment_types": [...]}
    id_number_field         = Column(String(20), nullable=True)  # validator key from the jurisdiction registry (pre-check 5)
    human_approval_required = Column(Boolean, nullable=False, default=False, server_default="0")
    escalation_ladder       = Column(JSON, nullable=True)
    sort_order              = Column(Integer, nullable=False, default=0, server_default="0")
    is_system               = Column(Boolean, nullable=False, default=False, server_default="0")
    is_active               = Column(Boolean, nullable=False, default=True, server_default="1")
    created_by              = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at              = Column(DateTime, nullable=False, server_default=func.now())
    updated_at              = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrCompanyDocumentCategory(Base):
    """A company document category (Company Policies, Employee Handbook, ...) with its publishing defaults."""
    __tablename__ = "hr_company_document_categories"
    __table_args__ = (UniqueConstraint("organization_id", "key", name="uq_hcdc_org_key"),)

    id                       = Column(Integer, primary_key=True)
    organization_id          = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    key                      = Column(String(50), nullable=False)
    name                     = Column(String(120), nullable=False)
    icon                     = Column(String(40), nullable=True)
    requires_approval        = Column(Boolean, nullable=False, default=False, server_default="0")
    default_require_ack      = Column(Boolean, nullable=False, default=False, server_default="0")
    ack_reminder_after_days  = Column(Integer, nullable=True)
    reack_interval_months    = Column(Integer, nullable=True)
    auto_unpublish_on_expiry = Column(Boolean, nullable=False, default=False, server_default="0")
    locked_by_org_admin      = Column(Boolean, nullable=False, default=False, server_default="0")
    escalation_ladder        = Column(JSON, nullable=True)
    is_system                = Column(Boolean, nullable=False, default=False, server_default="0")
    is_active                = Column(Boolean, nullable=False, default=True, server_default="1")
    is_hidden                = Column(Boolean, nullable=False, default=False, server_default="0")   # hidden from employees
    sort_order               = Column(Integer, nullable=False, default=0, server_default="0")
    created_by               = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at               = Column(DateTime, nullable=False, server_default=func.now())
    updated_at               = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrDocumentAccessRule(Base):
    """Who may see a company category, folder or document. One rule per target; lists are unions."""
    __tablename__ = "hr_document_access_rules"
    __table_args__ = (UniqueConstraint("organization_id", "target_type", "target_id", name="uq_hdar_target"),)

    id              = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    target_type     = Column(String(10), nullable=False)      # category | folder | document
    target_id       = Column(Integer, nullable=False)
    inherit         = Column(Boolean, nullable=False, default=True, server_default="1")
    visibility      = Column(String(20), nullable=False, default=Visibility.ADMIN_ONLY.value)
    department_ids  = Column(JSON, nullable=True)
    roles           = Column(JSON, nullable=True)
    employee_ids    = Column(JSON, nullable=True)
    permission      = Column(String(10), nullable=False, default=AccessPermission.VIEW.value, server_default="view")
    require_ack     = Column(Boolean, nullable=False, default=False, server_default="0")
    updated_by      = Column(Integer, ForeignKey("employees.id"), nullable=True)
    updated_at      = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrDocumentAckRound(Base):
    """One acknowledgement campaign for a company document version (initial, new version, periodic re-acknowledgement)."""
    __tablename__ = "hr_document_ack_rounds"
    __table_args__ = (UniqueConstraint("document_id", "round_no", name="uq_hdar_round"),)

    id              = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    document_id     = Column(Integer, ForeignKey("hr_documents.id"), nullable=False, index=True)
    version_id      = Column(Integer, ForeignKey("hr_document_versions.id"), nullable=True)
    round_no        = Column(Integer, nullable=False)
    reason          = Column(String(20), nullable=False)     # initial | new_version | periodic
    opened_at       = Column(DateTime, nullable=False)
    due_at          = Column(DateTime, nullable=True)


class HrDocumentAcknowledgement(Base):
    """'I have read this' for an uploaded company document. Append-only evidence."""
    __tablename__ = "hr_document_acknowledgements"
    __table_args__ = (UniqueConstraint("version_id", "round_no", "employee_id", name="uq_hda_once"),
                      Index("ix_hda_doc", "organization_id", "document_id"))

    id              = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    document_id     = Column(Integer, ForeignKey("hr_documents.id"), nullable=False)
    version_id      = Column(Integer, ForeignKey("hr_document_versions.id"), nullable=False)
    round_no        = Column(Integer, nullable=False, default=1, server_default="1")
    employee_id     = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    acknowledged_at = Column(DateTime, nullable=False)
    ip_address      = Column(String(45), nullable=True)
    user_agent      = Column(String(400), nullable=True)
    document_sha256 = Column(String(64), nullable=True)


class HrDocumentAuditLog(Base):
    """Every view, download, upload, decision and access change on documents. Append-only; never file contents."""
    __tablename__ = "hr_document_audit_logs"
    __table_args__ = (
        Index("ix_hdal_org_time", "organization_id", "created_at"),
        Index("ix_hdal_doc", "organization_id", "document_id", "created_at"),
        Index("ix_hdal_action", "organization_id", "action", "created_at"),
    )

    id                = Column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True)
    organization_id   = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    actor_type        = Column(String(12), nullable=False, default="user", server_default="user")   # user | system | automation
    actor_id          = Column(Integer, ForeignKey("employees.id"), nullable=True)
    actor_role        = Column(String(20), nullable=True)
    automation_run_id = Column(BigInteger().with_variant(Integer, "sqlite"), nullable=True)
    rule_id           = Column(Integer, nullable=True)
    action            = Column(String(30), nullable=False)
    target_type       = Column(String(15), nullable=False)
    target_id         = Column(Integer, nullable=False)
    document_id       = Column(Integer, nullable=True)
    employee_id       = Column(Integer, nullable=True)
    ip_address        = Column(String(45), nullable=True)
    user_agent        = Column(String(400), nullable=True)
    before            = Column(JSON, nullable=True)
    after             = Column(JSON, nullable=True)
    created_at        = Column(DateTime, nullable=False, server_default=func.now())


class HrDocumentReminder(Base):
    """Delivery log of reminders and alerts (one row per send). Unique keys make scheduled alerts idempotent."""
    __tablename__ = "hr_document_reminders"
    __table_args__ = (Index("ix_hdr_open", "organization_id", "employee_id", "kind"),)

    id                   = Column(Integer, primary_key=True)
    organization_id      = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    task_id              = Column(Integer, ForeignKey("document_tasks.id"), nullable=True, index=True)
    kind                 = Column(String(20), nullable=False)
    level                = Column(Integer, nullable=False, default=0, server_default="0")
    dedupe_key           = Column(String(120), nullable=True, unique=True)   # e.g. "expiry_30:doc:12", "task:5:level:2"
    employee_id          = Column(Integer, ForeignKey("employees.id"), nullable=True)
    document_id          = Column(Integer, nullable=True)
    employee_category_id = Column(Integer, nullable=True)
    sent_by              = Column(Integer, ForeignKey("employees.id"), nullable=True)
    channel              = Column(String(10), nullable=False, default="in_app")
    message              = Column(Text, nullable=True)
    sent_at              = Column(DateTime, nullable=False, server_default=func.now())
    resolved_at          = Column(DateTime, nullable=True)


class HrDocumentReminderRequest(Base):
    """A reminder HR asked for in Employee Documents ("upload what is missing"), sent now or at `scheduled_for` (QA R1-15).

    It also carries the per-document cooldown (QA R1-16): `sent_category_ids` are the containers the person was actually
    reminded about, so a second reminder about the SAME document within the cooldown is refused while the person's other
    documents can still be reminded about. Times are naive UTC like the rest of the module."""
    __tablename__ = "hr_document_reminder_requests"
    __table_args__ = (Index("ix_hdrr_due", "status", "scheduled_for"),
                      Index("ix_hdrr_employee", "organization_id", "employee_id", "sent_at"))

    id                = Column(Integer, primary_key=True)
    organization_id   = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    employee_id       = Column(Integer, ForeignKey("employees.id"), nullable=False)
    category_ids      = Column(JSON, nullable=True)          # what HR picked (None: every missing / to-replace document)
    sent_category_ids = Column(JSON, nullable=True)          # what the person was reminded about when it went out
    message           = Column(Text, nullable=True)
    channel           = Column(String(10), nullable=False, default="both", server_default="both")
    scheduled_for     = Column(DateTime, nullable=True)      # None: sent at once
    status            = Column(String(12), nullable=False, default="scheduled", server_default="scheduled")  # scheduled|sent|skipped|failed|cancelled
    detail            = Column(String(255), nullable=True)   # why it was skipped or failed
    created_by        = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at        = Column(DateTime, nullable=False, server_default=func.now())
    sent_at           = Column(DateTime, nullable=True)


# ── append-only evidence ──────────────────────────────────────────────────────────────────────────────────────────────

class AppendOnlyViolation(RuntimeError):
    pass


def _refuse_change(mapper, connection, target):
    raise AppendOnlyViolation(f"{target.__tablename__} rows are append-only evidence")


for _cls in (HrDocumentAuditLog, HrDocumentAcknowledgement):
    event.listen(_cls, "before_update", _refuse_change)
    event.listen(_cls, "before_delete", _refuse_change)


# ── email sharing (Company Documents P4) ───────────────────────────────────────────────────────────────────────────────

class HrDocumentShare(Base):
    """One "send by email" of a company file, folder or category. The files are fixed when the share is made
    (document_ids), so a retry sends exactly what was sent before. mode: link (portal link, employees only) or
    attachment (the files themselves, the only way to reach people outside the company)."""
    __tablename__ = "hr_document_shares"
    __table_args__ = (Index("ix_hds_target", "organization_id", "target_type", "target_id"),)

    id                   = Column(Integer, primary_key=True)
    organization_id      = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    target_type          = Column(String(10), nullable=False)          # document | folder | category
    target_id            = Column(Integer, nullable=False)
    target_name          = Column(String(255), nullable=False)
    mode                 = Column(String(12), nullable=False)          # link | attachment
    message              = Column(Text, nullable=True)
    grant_portal_access  = Column(Boolean, nullable=False, default=False, server_default="0")
    document_ids         = Column(JSON, nullable=False)
    total_bytes          = Column(BigInteger, nullable=False, default=0, server_default="0")
    status               = Column(String(10), nullable=False, default="sending", server_default="sending")  # sending|sent|partial|failed
    created_by           = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at           = Column(DateTime, nullable=False, server_default=func.now())


class HrDocumentShareRecipient(Base):
    """One person an email share went to: an employee (employee_id set) or an outside address."""
    __tablename__ = "hr_document_share_recipients"

    id              = Column(Integer, primary_key=True)
    share_id        = Column(Integer, ForeignKey("hr_document_shares.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    kind            = Column(String(10), nullable=False)               # employee | external
    employee_id     = Column(Integer, ForeignKey("employees.id"), nullable=True)
    email           = Column(String(255), nullable=True)
    status          = Column(String(10), nullable=False, default="pending", server_default="pending")  # pending|sent|failed|skipped
    error           = Column(String(500), nullable=True)
    attempts        = Column(Integer, nullable=False, default=0, server_default="0")
    last_attempt_at = Column(DateTime, nullable=True)
    sent_at         = Column(DateTime, nullable=True)
