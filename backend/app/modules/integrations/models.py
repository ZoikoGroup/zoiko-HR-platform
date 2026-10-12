"""Zoiko Connect channels, Zoiko Hub webhooks and Zoiko Workflow tables (ZHR-24/25/26)."""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, JSON, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class ConnectChannel(Base):
    """Outbound messaging channel config (slack / twilio). All config is stored
    as one Fernet-encrypted JSON blob; only masked values are ever returned."""
    __tablename__ = "connect_channels"

    id = Column(Integer, primary_key=True, index=True)
    channel = Column(String(20), unique=True, nullable=False)
    config_encrypted = Column(Text, nullable=False)
    last_tested_at = Column(DateTime, nullable=True)
    last_test_result = Column(String(20), nullable=True)  # success | failure
    last_error = Column(String(500), nullable=True)
    updated_by = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())


class Webhook(Base):
    __tablename__ = "hub_webhooks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    url = Column(String(1000), nullable=False)
    events = Column(JSON, nullable=False, default=list)
    secret_encrypted = Column(Text, nullable=False)
    secret_hint = Column(String(16), nullable=True)  # last 4 chars, for masking
    is_active = Column(Boolean, nullable=False, default=True)
    auto_disabled = Column(Boolean, nullable=False, default=False)
    consecutive_failures = Column(Integer, nullable=False, default=0)
    total_failures = Column(Integer, nullable=False, default=0)
    last_delivery_at = Column(DateTime, nullable=True)
    last_delivery_status = Column(String(20), nullable=True)  # success | failed
    created_by = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())

    deliveries = relationship("WebhookDelivery", back_populates="webhook", cascade="all, delete-orphan")


class WebhookDelivery(Base):
    __tablename__ = "hub_webhook_deliveries"

    id = Column(Integer, primary_key=True, index=True)
    webhook_id = Column(Integer, ForeignKey("hub_webhooks.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id = Column(String(64), nullable=False)
    event_type = Column(String(80), nullable=False)
    payload = Column(JSON, nullable=False)
    status = Column(String(20), nullable=False, default="pending")  # pending | success | failed
    attempt = Column(Integer, nullable=False, default=0)
    response_status = Column(Integer, nullable=True)
    response_body = Column(String(1000), nullable=True)
    error = Column(String(500), nullable=True)
    duration_ms = Column(Integer, nullable=True)
    next_attempt_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    last_attempt_at = Column(DateTime, nullable=True)

    webhook = relationship("Webhook", back_populates="deliveries")

    __table_args__ = (Index("ix_hub_deliveries_due", "status", "next_attempt_at"),)


class WorkflowWorkspace(Base):
    __tablename__ = "workflow_workspaces"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)
    created_by = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())

    workflows = relationship("Workflow", back_populates="workspace")


class Workflow(Base):
    __tablename__ = "workflow_workflows"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workflow_workspaces.id"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    trigger_event = Column(String(80), nullable=False)
    steps = Column(JSON, nullable=False, default=list)
    is_active = Column(Boolean, nullable=False, default=False)
    last_run_at = Column(DateTime, nullable=True)
    last_run_status = Column(String(20), nullable=True)
    created_by = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())

    workspace = relationship("WorkflowWorkspace", back_populates="workflows")


class WorkflowExecution(Base):
    __tablename__ = "workflow_executions"

    id = Column(Integer, primary_key=True, index=True)
    # Nullable + SET NULL: deleting a workflow keeps its execution history.
    workflow_id = Column(Integer, ForeignKey("workflow_workflows.id", ondelete="SET NULL"), nullable=True, index=True)
    workflow_name = Column(String(120), nullable=False)
    trigger_event = Column(String(80), nullable=False)
    # Organization the run is about (from the triggering event, or the workflow's
    # workspace for a manual run); NULL = platform-level. Lets the page show and
    # filter runs per organization without digging into the JSON payload.
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    trigger_payload = Column(JSON, nullable=True)
    triggered_by = Column(String(20), nullable=False, default="event")  # event | manual
    steps_snapshot = Column(JSON, nullable=False, default=list)
    status = Column(String(20), nullable=False, default="pending")  # pending|running|waiting|succeeded|failed
    current_step = Column(Integer, nullable=False, default=0)
    resume_at = Column(DateTime, nullable=True)
    step_results = Column(JSON, nullable=False, default=list)
    error = Column(String(500), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)

    __table_args__ = (Index("ix_workflow_exec_due", "status", "resume_at"),)


# ── Phase 2 hot-path indexes (migration a2b3c4d5e6f7) ─────────────────────────
from sqlalchemy import Index as _Index  # noqa: E402

_Index("ix_workflow_workspaces_organization_id", WorkflowWorkspace.organization_id)
