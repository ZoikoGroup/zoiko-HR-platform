import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, Numeric, Text, Enum, ForeignKey, Index, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class AuditAction(str, enum.Enum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    SUSPEND = "suspend"
    ACTIVATE = "activate"
    LOGIN = "login"
    LOGOUT = "logout"
    CONFIG_CHANGE = "config_change"
    APPROVED = "approved"
    REJECTED = "rejected"
    REACTIVATED = "reactivated"
    ON_HOLD = "on_hold"
    DEACTIVATE = "deactivate"
    ENABLE = "enable"
    DISABLE = "disable"
    LOCK = "lock"
    UNLOCK = "unlock"
    PASSWORD_RESET = "password_reset"


class PlatformSetting(Base):
    """Platform-level key/value configuration (branding, SMTP, security)."""
    __tablename__ = "super_admin_platform_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(200), unique=True, nullable=False)
    value = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    category = Column(String(100), default="general")
    is_encrypted = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())


class AuditLog(Base):
    __tablename__ = "super_admin_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    action = Column(Enum(AuditAction), nullable=False)
    entity_type = Column(String(100), nullable=False)
    entity_id = Column(Integer, nullable=True)
    performed_by = Column(Integer, ForeignKey("employees.id"), nullable=True)
    performed_by_email = Column(String(255), nullable=True)
    details = Column(JSON, nullable=True)
    ip_address = Column(String(50), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    performer = relationship("Employee", backref="audit_logs")

    # The audit page filters on all of these; without them every filtered page
    # is a sequential scan of an append-only table that only grows.
    __table_args__ = (
        Index("ix_super_admin_audit_logs_created_at", "created_at"),
        Index("ix_super_admin_audit_logs_actor_email", "performed_by_email"),
        Index("ix_super_admin_audit_logs_action", "action"),
        Index("ix_super_admin_audit_logs_entity", "entity_type", "entity_id"),
    )


class Notification(Base):
    """A platform notification, stored once with a target definition.

    Recipients are resolved, not fanned out: who can see a row is decided by
    target_type / NotificationTarget rows / audience (see
    notification_service.visible_filter). Per-recipient read state lives in
    NotificationRead (lazy: a row exists only once someone has read it).
    is_read is the legacy single flag, now used only for the Super Admin's own
    inbox of system events.
    """
    __tablename__ = "super_admin_notifications"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(300), nullable=False)
    message = Column(Text, nullable=False)  # plain-text body / fallback for body_html
    body_html = Column(Text, nullable=True)  # sanitised rich body (server-side on write)
    notification_type = Column(String(50), default="info")
    priority = Column(String(20), default="normal")
    is_read = Column(Boolean, default=False)
    # Legacy targets - kept for compatibility; new code uses NotificationTarget.
    target_org_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)
    target_user_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_by = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    sender_name = Column(String(120), nullable=False, default="Zoiko HR Admin", server_default="Zoiko HR Admin")
    channels = Column(JSON, nullable=True)  # e.g. ["in_app"]
    # all | organization | user | role | mixed | system (system = internal event, never delivered)
    target_type = Column(String(20), nullable=False, default="all", server_default="all")
    # For organization targets: org_admins (default) | all_members
    audience = Column(String(20), nullable=False, default="org_admins", server_default="org_admins")
    status = Column(String(20), nullable=False, default="sent", server_default="sent")
    sent_at = Column(DateTime, nullable=True)

    targets = relationship("NotificationTarget", cascade="all, delete-orphan", lazy="selectin")
    reads = relationship("NotificationRead", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_super_admin_notifications_sent_at", "sent_at"),
        Index("ix_super_admin_notifications_target_type", "target_type"),
    )


class NotificationTarget(Base):
    """One audience entry of a notification: an organization, a user or a role."""
    __tablename__ = "super_admin_notification_targets"

    id = Column(Integer, primary_key=True)
    notification_id = Column(
        Integer, ForeignKey("super_admin_notifications.id", ondelete="CASCADE"), nullable=False
    )
    kind = Column(String(10), nullable=False)  # org | user | role
    ref = Column(String(50), nullable=False)   # organization id / user id / role value

    __table_args__ = (
        UniqueConstraint("notification_id", "kind", "ref", name="uq_notification_target"),
        Index("ix_super_admin_notification_targets_kind_ref", "kind", "ref"),
        Index("ix_super_admin_notification_targets_notification_id", "notification_id"),
    )


class NotificationRead(Base):
    """Per-recipient read state. Lazy: a row means this user has read it."""
    __tablename__ = "super_admin_notification_reads"

    id = Column(Integer, primary_key=True)
    notification_id = Column(
        Integer, ForeignKey("super_admin_notifications.id", ondelete="CASCADE"), nullable=False
    )
    user_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    read_at = Column(DateTime, nullable=False, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("notification_id", "user_id", name="uq_notification_read"),
        Index("ix_super_admin_notification_reads_user_id", "user_id"),
    )


class SupportTicket(Base):
    __tablename__ = "super_admin_support_tickets"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    raised_by = Column(Integer, ForeignKey("employees.id"), nullable=False)
    subject = Column(String(300), nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String(50), default="general")
    priority = Column(String(20), default="normal")
    status = Column(String(20), default="open")
    assigned_to = Column(Integer, ForeignKey("employees.id"), nullable=True)
    resolution_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    organization = relationship("Organization")
    raised_by_user = relationship("Employee", foreign_keys=[raised_by])
    assigned_to_user = relationship("Employee", foreign_keys=[assigned_to])


class SecurityEvent(Base):
    __tablename__ = "super_admin_security_events"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(100), nullable=False)
    severity = Column(String(20), default="info")
    description = Column(Text, nullable=True)
    source_ip = Column(String(50), nullable=True)
    user_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)
    event_metadata = Column("metadata", JSON, nullable=True)
    is_resolved = Column(Boolean, default=False)
    resolved_by = Column(Integer, ForeignKey("employees.id"), nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("Employee", foreign_keys=[user_id])
    resolver = relationship("Employee", foreign_keys=[resolved_by])


class ApprovalHistory(Base):
    __tablename__ = "super_admin_approval_history"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    action = Column(String(50), nullable=False)
    previous_status = Column(String(50), nullable=True)
    new_status = Column(String(50), nullable=True)
    performed_by = Column(Integer, ForeignKey("employees.id"), nullable=False)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    organization = relationship("Organization", foreign_keys=[organization_id])
    performer = relationship("Employee", foreign_keys=[performed_by])


class LoginActivity(Base):
    __tablename__ = "super_admin_login_activities"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    email = Column(String(255), nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)
    ip_address = Column(String(50), nullable=True)
    user_agent = Column(String(500), nullable=True)
    status = Column(String(20), default="success")
    failure_reason = Column(String(200), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("Employee", foreign_keys=[user_id])


class EmailDeliveryLog(Base):
    """Audit ledger tracking every email send attempt (Finding 2 / Section 8.1 evidence)."""
    __tablename__ = "super_admin_email_delivery_logs"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    recipient_email = Column(String(255), nullable=False, index=True)
    template_name = Column(String(255), nullable=False, index=True)
    subject = Column(String(300), nullable=True)
    status = Column(String(50), nullable=False, default="sent")  # sent, failed, template_missing
    error_message = Column(Text, nullable=True)
    context_data = Column(JSON, nullable=True)
    sent_at = Column(DateTime, server_default=func.now(), index=True)

    organization = relationship("Organization", foreign_keys=[organization_id])



class ExpenseBudget(Base):
    """Operational budget for an organization over a period (ZHR-30).

    `spent` is never stored: it is computed from approved/paid expense claims in
    the same organization, currency, period (and category, when set)."""
    __tablename__ = "super_admin_expense_budgets"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(150), nullable=False)
    category = Column(String(100), nullable=True)  # a claim expense_type; NULL = all categories
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    currency = Column(String(3), nullable=False, default="USD")
    allocated_amount = Column(Numeric(14, 2), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_by = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
