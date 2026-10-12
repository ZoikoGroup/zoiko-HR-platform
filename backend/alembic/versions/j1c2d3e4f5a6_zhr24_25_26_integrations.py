"""zhr24_25_26_integrations: connect channels, hub webhooks, workflows

Revision ID: j1c2d3e4f5a6
Revises: i1b2c3d4e5f6
Create Date: 2026-09-30

Adds six new tables (connect_channels, hub_webhooks, hub_webhook_deliveries,
workflow_workspaces, workflow_workflows, workflow_executions). Purely additive.
Tables are skipped if create_all already made them in a dev database.
Rollback (alembic downgrade i1b2c3d4e5f6) drops ONLY these new tables.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "j1c2d3e4f5a6"
down_revision: Union[str, Sequence[str], None] = "i1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NEW_TABLES = [
    "workflow_executions", "workflow_workflows", "workflow_workspaces",
    "hub_webhook_deliveries", "hub_webhooks", "connect_channels",
]


def _missing(name: str) -> bool:
    return not sa.inspect(op.get_bind()).has_table(name)


def upgrade() -> None:
    if _missing("connect_channels"):
        op.create_table(
            "connect_channels",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("channel", sa.String(20), nullable=False, unique=True),
            sa.Column("config_encrypted", sa.Text(), nullable=False),
            sa.Column("last_tested_at", sa.DateTime(), nullable=True),
            sa.Column("last_test_result", sa.String(20), nullable=True),
            sa.Column("last_error", sa.String(500), nullable=True),
            sa.Column("updated_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
    if _missing("hub_webhooks"):
        op.create_table(
            "hub_webhooks",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(120), nullable=False),
            sa.Column("url", sa.String(1000), nullable=False),
            sa.Column("events", sa.JSON(), nullable=False),
            sa.Column("secret_encrypted", sa.Text(), nullable=False),
            sa.Column("secret_hint", sa.String(16), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("auto_disabled", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("consecutive_failures", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("total_failures", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("last_delivery_at", sa.DateTime(), nullable=True),
            sa.Column("last_delivery_status", sa.String(20), nullable=True),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
    if _missing("hub_webhook_deliveries"):
        op.create_table(
            "hub_webhook_deliveries",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("webhook_id", sa.Integer(), sa.ForeignKey("hub_webhooks.id", ondelete="CASCADE"), nullable=False),
            sa.Column("event_id", sa.String(64), nullable=False),
            sa.Column("event_type", sa.String(80), nullable=False),
            sa.Column("payload", sa.JSON(), nullable=False),
            sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
            sa.Column("attempt", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("response_status", sa.Integer(), nullable=True),
            sa.Column("response_body", sa.String(1000), nullable=True),
            sa.Column("error", sa.String(500), nullable=True),
            sa.Column("duration_ms", sa.Integer(), nullable=True),
            sa.Column("next_attempt_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("last_attempt_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_hub_webhook_deliveries_webhook_id", "hub_webhook_deliveries", ["webhook_id"])
        op.create_index("ix_hub_deliveries_due", "hub_webhook_deliveries", ["status", "next_attempt_at"])
    if _missing("workflow_workspaces"):
        op.create_table(
            "workflow_workspaces",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(120), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=True),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
    if _missing("workflow_workflows"):
        op.create_table(
            "workflow_workflows",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workflow_workspaces.id"), nullable=False),
            sa.Column("name", sa.String(120), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("trigger_event", sa.String(80), nullable=False),
            sa.Column("steps", sa.JSON(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("last_run_at", sa.DateTime(), nullable=True),
            sa.Column("last_run_status", sa.String(20), nullable=True),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_workflow_workflows_workspace_id", "workflow_workflows", ["workspace_id"])
    if _missing("workflow_executions"):
        op.create_table(
            "workflow_executions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("workflow_id", sa.Integer(), sa.ForeignKey("workflow_workflows.id", ondelete="SET NULL"), nullable=True),
            sa.Column("workflow_name", sa.String(120), nullable=False),
            sa.Column("trigger_event", sa.String(80), nullable=False),
            sa.Column("trigger_payload", sa.JSON(), nullable=True),
            sa.Column("triggered_by", sa.String(20), nullable=False, server_default="event"),
            sa.Column("steps_snapshot", sa.JSON(), nullable=False),
            sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
            sa.Column("current_step", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("resume_at", sa.DateTime(), nullable=True),
            sa.Column("step_results", sa.JSON(), nullable=False),
            sa.Column("error", sa.String(500), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("finished_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_workflow_executions_workflow_id", "workflow_executions", ["workflow_id"])
        op.create_index("ix_workflow_exec_due", "workflow_executions", ["status", "resume_at"])


def downgrade() -> None:
    insp = sa.inspect(op.get_bind())
    for name in NEW_TABLES:
        if insp.has_table(name):
            op.drop_table(name)
