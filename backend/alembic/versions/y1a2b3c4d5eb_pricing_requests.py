"""pricing_requests: submissions from the public Request Pricing page

Revision ID: y1a2b3c4d5eb
Revises: x1a2b3c4d5ea
Create Date: 2026-10-09

Idempotent and reversible.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "y1a2b3c4d5eb"
down_revision: Union[str, Sequence[str], None] = "x1a2b3c4d5ea"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if sa.inspect(op.get_bind()).has_table("pricing_requests"):
        return
    op.create_table(
        "pricing_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("reference", sa.String(24), nullable=False, unique=True),
        sa.Column("full_name", sa.String(150), nullable=False),
        sa.Column("work_email", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(40), nullable=True),
        sa.Column("company", sa.String(200), nullable=False),
        sa.Column("job_title", sa.String(120), nullable=True),
        sa.Column("country", sa.String(100), nullable=False),
        sa.Column("company_size", sa.String(40), nullable=False),
        sa.Column("plan_interest", sa.String(40), nullable=False),
        sa.Column("products", sa.String(200), nullable=True),
        sa.Column("billing_preference", sa.String(20), nullable=True),
        sa.Column("timeline", sa.String(40), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("consent", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("status", sa.String(20), nullable=False, server_default="new"),
        sa.Column("source_ip", sa.String(64), nullable=True),
        sa.Column("confirmation_sent", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("team_notified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_pricing_requests_work_email", "pricing_requests", ["work_email"])
    op.create_index("ix_pricing_requests_status", "pricing_requests", ["status"])
    op.create_index("ix_pricing_requests_created", "pricing_requests", ["created_at"])


def downgrade() -> None:
    if sa.inspect(op.get_bind()).has_table("pricing_requests"):
        op.drop_table("pricing_requests")
