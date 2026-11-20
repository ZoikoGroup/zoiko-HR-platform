"""Tables of the documents automation layer (ZHR-DOCS-ARCH-001 §6.4)."""
import enum

from sqlalchemy import JSON, BigInteger, Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.sql import func

from app.database import Base


class RuleStatus(str, enum.Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    SHADOW = "shadow"


class RunStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    WAITING = "waiting"
    SUCCEEDED = "succeeded"
    FAILED = "failed"        # permanent error: not retried
    DEAD = "dead"            # retried MAX_ATTEMPTS times: dead-letter
    SKIPPED = "skipped"      # paused, feature off, tenant no longer active...


class RunMode(str, enum.Enum):
    LIVE = "live"
    DRY_RUN = "dry_run"
    SHADOW = "shadow"


class TaskKind(str, enum.Enum):
    UPLOAD_REQUIRED = "upload_required"
    REUPLOAD = "reupload"
    ACKNOWLEDGE = "acknowledge"
    REVIEW = "review"
    SIGN = "sign"
    RENEW = "renew"


class TaskStatus(str, enum.Enum):
    OPEN = "open"
    DONE = "done"
    CANCELLED = "cancelled"
    OVERDUE = "overdue"


OPEN_TASK_STATUSES = (TaskStatus.OPEN.value, TaskStatus.OVERDUE.value)

_BIGINT = BigInteger().with_variant(Integer, "sqlite")


class AutomationRule(Base):
    """WHEN trigger / IF conditions / THEN actions. System rules (`key` starting with 'sys.') cannot be deleted."""
    __tablename__ = "automation_rules"
    __table_args__ = (UniqueConstraint("organization_id", "key", name="uq_ar_org_key"),
                      Index("ix_ar_match", "organization_id", "trigger_event", "status"))

    id              = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    key             = Column(String(60), nullable=True)
    name            = Column(String(120), nullable=False)
    description     = Column(Text, nullable=True)
    trigger_event   = Column(String(80), nullable=True)
    trigger_cron    = Column(String(60), nullable=True)
    definition      = Column(JSON, nullable=False)
    status          = Column(String(10), nullable=False, default=RuleStatus.PAUSED.value, server_default="paused")
    is_system       = Column(Boolean, nullable=False, default=False, server_default="0")
    version         = Column(Integer, nullable=False, default=1, server_default="1")
    created_by      = Column(Integer, ForeignKey("employees.id"), nullable=True)
    updated_by      = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at      = Column(DateTime, nullable=False, server_default=func.now())
    updated_at      = Column(DateTime, nullable=True, onupdate=func.now())


class AutomationRun(Base):
    """One execution of one rule for one event. `idempotency_key` = sha256(rule_id:event_id) makes enqueueing idempotent."""
    __tablename__ = "automation_runs"
    __table_args__ = (Index("ix_arun_due", "status", "next_attempt_at"),
                      Index("ix_arun_org", "organization_id", "created_at"))

    id                  = Column(_BIGINT, primary_key=True)
    organization_id     = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    rule_id             = Column(Integer, ForeignKey("automation_rules.id", ondelete="SET NULL"), nullable=True, index=True)
    rule_version        = Column(Integer, nullable=True)
    event_id            = Column(String(64), nullable=True)
    event_type          = Column(String(80), nullable=True)
    trigger_payload     = Column(JSON, nullable=True)
    definition_snapshot = Column(JSON, nullable=False)
    mode                = Column(String(10), nullable=False, default=RunMode.LIVE.value, server_default="live")
    status              = Column(String(12), nullable=False, default=RunStatus.PENDING.value, server_default="pending")
    skip_reason         = Column(String(40), nullable=True)
    current_step        = Column(Integer, nullable=False, default=0, server_default="0")
    step_results        = Column(JSON, nullable=True)
    attempt             = Column(Integer, nullable=False, default=0, server_default="0")
    next_attempt_at     = Column(DateTime, nullable=True)
    resume_at           = Column(DateTime, nullable=True)
    error               = Column(String(500), nullable=True)
    idempotency_key     = Column(String(64), nullable=False, unique=True)
    created_at          = Column(DateTime, nullable=False, server_default=func.now())
    started_at          = Column(DateTime, nullable=True)
    finished_at         = Column(DateTime, nullable=True)


class AutomationSettings(Base):
    """Per-organization switches: pause, feature flags, quiet hours, rate limits, SLA and the default escalation ladder."""
    __tablename__ = "automation_settings"

    organization_id      = Column(Integer, ForeignKey("organizations.id"), primary_key=True)
    paused               = Column(Boolean, nullable=False, default=False, server_default="0")
    features             = Column(JSON, nullable=True)
    quiet_hours          = Column(JSON, nullable=True)       # {"start": "20:00", "end": "08:00", "tz": "Asia/Kolkata"}
    rate_limits          = Column(JSON, nullable=True)       # {"emails_per_hour": 500, "reminders_per_employee_per_day": 5}
    approval_sla_hours   = Column(Integer, nullable=False, default=72, server_default="72")
    default_ladder       = Column(JSON, nullable=True)
    lock_after_exit_days = Column(Integer, nullable=False, default=30, server_default="30")
    updated_by           = Column(Integer, ForeignKey("employees.id"), nullable=True)
    updated_at           = Column(DateTime, nullable=True, onupdate=func.now())


class NotificationTemplate(Base):
    """An organization's override of a notification's wording. The file templates stay the default."""
    __tablename__ = "notification_templates"
    __table_args__ = (UniqueConstraint("organization_id", "key", "channel", "locale", name="uq_nt_org_key"),)

    id              = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    key             = Column(String(60), nullable=False)
    channel         = Column(String(10), nullable=False)     # email | in_app | sms
    subject         = Column(String(200), nullable=True)
    body            = Column(Text, nullable=False)
    locale          = Column(String(10), nullable=False, default="en", server_default="en")
    is_active       = Column(Boolean, nullable=False, default=True, server_default="1")
    updated_by      = Column(Integer, ForeignKey("employees.id"), nullable=True)
    updated_at      = Column(DateTime, nullable=True, onupdate=func.now())


class DocumentTask(Base):
    """Something a person must do about a document (upload, re-upload, acknowledge, review, sign, renew).

    The source of "Documents to Action" for uploaded documents. At most one open task per (person, kind, target)."""
    __tablename__ = "document_tasks"
    __table_args__ = (Index("ix_dt_open", "organization_id", "employee_id", "status"),
                      Index("ix_dt_due", "status", "due_at"))

    id                    = Column(Integer, primary_key=True)
    organization_id       = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    kind                  = Column(String(20), nullable=False)
    employee_id           = Column(Integer, ForeignKey("employees.id"), nullable=True)
    assignee_role         = Column(String(20), nullable=True)
    document_id           = Column(Integer, ForeignKey("hr_documents.id"), nullable=True)
    version_id            = Column(Integer, nullable=True)
    employee_category_id  = Column(Integer, ForeignKey("hr_employee_document_categories.id"), nullable=True)
    generated_document_id = Column(Integer, nullable=True)
    ack_round_id          = Column(Integer, nullable=True)
    # Enforces "one open task per target" portably (NULL once closed; unique while open).
    open_key              = Column(String(120), nullable=True, unique=True)
    status                = Column(String(12), nullable=False, default=TaskStatus.OPEN.value, server_default="open")
    due_at                = Column(DateTime, nullable=True)
    escalation_level      = Column(Integer, nullable=False, default=0, server_default="0")
    ladder                = Column(JSON, nullable=True)
    source                = Column(String(20), nullable=False, default="system")   # rule | manual | system
    rule_id               = Column(Integer, nullable=True)
    created_by            = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at            = Column(DateTime, nullable=False, server_default=func.now())
    closed_at             = Column(DateTime, nullable=True)
    close_reason          = Column(String(30), nullable=True)


class RetentionPolicy(Base):
    """How long a category's files are kept and what happens afterwards. Deletion is never the default."""
    __tablename__ = "retention_policies"
    __table_args__ = (UniqueConstraint("organization_id", "scope", "category_key", name="uq_rp_org_cat"),)

    id              = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    scope           = Column(String(10), nullable=False)      # employee | company
    category_key    = Column(String(50), nullable=False)
    retain_years    = Column(Integer, nullable=False)
    clock           = Column(String(15), nullable=False)      # from_upload | from_exit | from_expiry
    action          = Column(String(10), nullable=False, default="archive", server_default="archive")  # flag | archive | delete
    review_days     = Column(Integer, nullable=False, default=30, server_default="30")
    updated_by      = Column(Integer, ForeignKey("employees.id"), nullable=True)
    updated_at      = Column(DateTime, nullable=True, onupdate=func.now())
