"""zhr24_workflow_execution_organization: workflow_executions.organization_id

Revision ID: o1b2c3d4e5f0
Revises: n1a2b3c4d5e9
Create Date: 2026-10-01

Adds a nullable, indexed organization_id to workflow_executions and backfills it
from the trigger payload / the workflow's workspace for existing rows (NULL stays
NULL = platform-level). Additive and idempotent. Rollback
(alembic downgrade n1a2b3c4d5e9) drops just this column.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "o1b2c3d4e5f0"
down_revision: Union[str, Sequence[str], None] = "n1a2b3c4d5e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if "organization_id" not in {c["name"] for c in insp.get_columns("workflow_executions")}:
        op.add_column("workflow_executions", sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=True))
        op.create_index("ix_workflow_executions_organization_id", "workflow_executions", ["organization_id"])
    # Backfill from the workflow's workspace where the workspace is organization-scoped.
    op.execute(
        "UPDATE workflow_executions SET organization_id = ("
        "SELECT ws.organization_id FROM workflow_workflows wf "
        "JOIN workflow_workspaces ws ON ws.id = wf.workspace_id "
        "WHERE wf.id = workflow_executions.workflow_id) "
        "WHERE organization_id IS NULL AND workflow_id IS NOT NULL"
    )


def downgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if "organization_id" in {c["name"] for c in insp.get_columns("workflow_executions")}:
        op.drop_index("ix_workflow_executions_organization_id", table_name="workflow_executions")
        op.drop_column("workflow_executions", "organization_id")
