"""Attendance engine (attendance plan M8): attendance_day_closures

Revision ID: a7c1d2e3f4a3
Revises: a7c1d2e3f4a2
Create Date: 2026-11-20

The end-of-day job records each finished (organization, work date) here, so a second run skips it and missed days are
caught up. Guarded and reversible.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "a7c1d2e3f4a3"
down_revision: Union[str, Sequence[str], None] = "a7c1d2e3f4a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table():
    import app.modules.hr.attendance.models  # noqa: F401
    from app.database import Base
    return Base.metadata.tables["attendance_day_closures"]


def upgrade() -> None:
    _table().create(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    _table().drop(bind=op.get_bind(), checkfirst=True)
