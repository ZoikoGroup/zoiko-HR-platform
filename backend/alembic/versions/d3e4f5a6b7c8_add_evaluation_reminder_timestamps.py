"""add evaluation reminder timestamps to organization_evaluations

Revision ID: d3e4f5a6b7c8
Revises: b6090e55e3e7
Create Date: 2026-09-07

Adds reminder_7d_sent_at / reminder_2d_sent_at to OrganizationEvaluation
(ZHR-COM-ENT-001 Section 8.1) so the nightly reminder job can send each
milestone email exactly once per evaluation. Both columns are additive and
nullable — existing rows are untouched (no reminder sent yet).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd3e4f5a6b7c8'
down_revision: Union[str, Sequence[str], None] = 'b6090e55e3e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('organization_evaluations', sa.Column('reminder_7d_sent_at', sa.DateTime(), nullable=True))
    op.add_column('organization_evaluations', sa.Column('reminder_2d_sent_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('organization_evaluations', 'reminder_2d_sent_at')
    op.drop_column('organization_evaluations', 'reminder_7d_sent_at')
