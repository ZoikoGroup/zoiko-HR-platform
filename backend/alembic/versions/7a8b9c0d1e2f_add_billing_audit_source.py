"""add source and stripe_event_id to billing_audit_logs

Revision ID: 7a8b9c0d1e2f
Revises: d3e4f5a6b7c8
Create Date: 2026-09-07

Adds billing_audit_logs.source / stripe_event_id for webhook and
audit-source traceability (Section 21 provider_refs / webhook replay).
Both columns are additive and nullable — existing rows untouched.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '7a8b9c0d1e2f'
down_revision: Union[str, Sequence[str], None] = 'd3e4f5a6b7c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('billing_audit_logs', sa.Column('source', sa.String(length=50), nullable=True))
    op.add_column('billing_audit_logs', sa.Column('stripe_event_id', sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column('billing_audit_logs', 'stripe_event_id')
    op.drop_column('billing_audit_logs', 'source')
