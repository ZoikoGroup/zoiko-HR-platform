"""add evaluation halfway reminder timestamp to organization_evaluations

Revision ID: a4b5c6d7e8f9
Revises: f3a4b5c6d7e8
Create Date: 2026-09-25

Adds reminder_halfway_sent_at to OrganizationEvaluation (ZHR-COM-ENT-001
Section 8.1) so the nightly reminder job can send the evaluation midpoint
email exactly once per evaluation. Additive and nullable — existing rows
are untouched (no midpoint reminder sent yet).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a4b5c6d7e8f9'
down_revision: Union[str, Sequence[str], None] = 'f3a4b5c6d7e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('organization_evaluations', sa.Column('reminder_halfway_sent_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('organization_evaluations', 'reminder_halfway_sent_at')