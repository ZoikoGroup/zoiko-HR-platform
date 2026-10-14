"""support grants: a break-glass grant has no prior support request (ZHR-PRIV-001 Phase 8)

Revision ID: 7c8d9e0f1a2b
Revises: 6b7c8d9e0f1a
Create Date: 2026-10-14

A break-glass capability is issued from an emergency session, not from an approved support request, so `request_id` may
be null. Batch mode is used so the change applies on SQLite (tests) as well as PostgreSQL.

Downgrade restores NOT NULL. If any break-glass grant rows exist, downgrade will fail on those rows by design - the
operator must decide what to do with live emergency grants rather than have them silently discarded.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "7c8d9e0f1a2b"
down_revision: Union[str, Sequence[str], None] = "6b7c8d9e0f1a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("support_grants") as batch:
        batch.alter_column("request_id", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    with op.batch_alter_table("support_grants") as batch:
        batch.alter_column("request_id", existing_type=sa.Integer(), nullable=False)
