"""demo_requests: submissions from the public Book a Demo page

Revision ID: z1a2b3c4d5ec
Revises: y1a2b3c4d5eb
Create Date: 2026-10-09

Idempotent and reversible.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "z1a2b3c4d5ec"
down_revision: Union[str, Sequence[str], None] = "y1a2b3c4d5eb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if sa.inspect(op.get_bind()).has_table("demo_requests"):
        return
    op.create_table(
        "demo_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("reference", sa.String(24), nullable=False, unique=True),
        sa.Column("full_name", sa.String(150), nullable=False),
        sa.Column("work_email", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(40), nullable=True),
        sa.Column("company", sa.String(200), nullable=False),
        sa.Column("job_title", sa.String(120), nullable=True),
        sa.Column("country", sa.String(100), nullable=False),
        sa.Column("company_size", sa.String(40), nullable=False),
        sa.Column("interests", sa.String(300), nullable=True),
        sa.Column("preferred_date", sa.Date(), nullable=True),
        sa.Column("preferred_time", sa.String(20), nullable=True),
        sa.Column("timezone", sa.String(64), nullable=True),
        sa.Column("demo_format", sa.String(20), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="new"),
        sa.Column("source_ip", sa.String(64), nullable=True),
        sa.Column("confirmation_sent", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("admins_notified", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_demo_requests_work_email", "demo_requests", ["work_email"])
    op.create_index("ix_demo_requests_status", "demo_requests", ["status"])
    op.create_index("ix_demo_requests_created_at", "demo_requests", ["created_at"])


def downgrade() -> None:
    if sa.inspect(op.get_bind()).has_table("demo_requests"):
        op.drop_table("demo_requests")
