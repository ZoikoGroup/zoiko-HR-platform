"""copilot analytics: copilot_events, one row per assistant answer, no text and no person (M1-16)

Revision ID: 9a3d5f7b1c28
Revises: 4e8b2c6a9d17
Create Date: 2026-11-27
"""
from alembic import op
import sqlalchemy as sa

revision = "9a3d5f7b1c28"
down_revision = "4e8b2c6a9d17"
branch_labels = None
depends_on = None

TABLE = "copilot_events"


def upgrade() -> None:
    bind = op.get_bind()
    op.create_table(
        TABLE,
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("turn_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("asker_role", sa.String(length=20), nullable=True),
        sa.Column("intent", sa.String(length=50), nullable=True),
        sa.Column("page_screen", sa.String(length=200), nullable=True),
        sa.Column("outcome", sa.String(length=20), nullable=False),
        sa.Column("answer_type", sa.String(length=20), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("provider", sa.String(length=30), nullable=True),
        sa.Column("model", sa.String(length=100), nullable=True),
        sa.Column("feedback", sa.String(length=10), nullable=True),
        sa.Column("feedback_code", sa.String(length=30), nullable=True),
        sa.Column("handed_off", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_copilot_events_id", TABLE, ["id"])
    op.create_index("ix_copilot_events_organization_id", TABLE, ["organization_id"])
    op.create_index("ix_copilot_events_turn_id", TABLE, ["turn_id"])
    op.create_index("ix_copilot_events_org_created", TABLE, ["organization_id", "created_at"])

    if bind.dialect.name == "postgresql":
        # same protection as every tenant table: the tenant isolation policy, built exactly as rls.policy_plan builds it
        # (a CONTROL-kind table is also readable on the platform plane)
        from app.core.privacy import rls
        using = rls.TENANT_EXPR
        if rls.kind_of(TABLE) == "CONTROL":
            using = f"({using}) OR {rls.PLATFORM_EXPR}"
        for stmt in rls.enable_sql([{"table": TABLE, "using": using}]):
            op.execute(stmt)


def downgrade() -> None:
    op.drop_table(TABLE)
