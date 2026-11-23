"""attendance: per-shift minimum worked minutes for a day to count (QA R1-24)

A completed day with less net work than this is ABSENT; from here up to the half-day threshold it is HALF_DAY.
NULL = the organization setting attendance.min_present_hours (organization_configs, default 1 hour).

Revision ID: d030f23705b4
Revises: c1d2e3f4a5b6
Create Date: 2026-11-23 09:33:51.630362

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd030f23705b4'
down_revision: Union[str, Sequence[str], None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    # idempotent: a fresh database may already have the column (tables created from the models)
    if "min_present_minutes" not in _columns("shifts"):
        op.add_column('shifts', sa.Column('min_present_minutes', sa.Integer(), nullable=True))


def downgrade() -> None:
    if "min_present_minutes" in _columns("shifts"):
        op.drop_column('shifts', 'min_present_minutes')
