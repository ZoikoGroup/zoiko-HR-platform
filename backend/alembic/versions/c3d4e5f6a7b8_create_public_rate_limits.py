"""create public_rate_limits

Backs the public assistant endpoint's rate limit with a Postgres-shared
counter, since production runs multiple gunicorn workers and the in-process
slowapi limiter is per-worker (see guardrails.check_public_rate_limit).

Revision ID: c3d4e5f6a7b8
Revises: a1f3c9d02b7e
Create Date: 2026-09-04 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'a1f3c9d02b7e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "public_rate_limits" in inspector.get_table_names():
        return
    op.create_table(
        "public_rate_limits",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ip_hash", sa.String(length=64), nullable=False),
        sa.Column("window_start", sa.DateTime(), nullable=False),
        sa.Column("request_count", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("ip_hash", "window_start", name="uq_public_rate_limit_window"),
    )
    op.create_index("ix_public_rate_limits_ip_hash", "public_rate_limits", ["ip_hash"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "public_rate_limits" in inspector.get_table_names():
        op.drop_table("public_rate_limits")
