"""perf_composite_indexes: speed up the attendance and performance list queries

Revision ID: r1f2a3b4c5d4
Revises: q1e2f3a4b5c3
Create Date: 2026-10-06

attendance_records (organization_id, date) and (employee_id, date): the dashboard, analytics, exports and
daily records all filter by organization and a date range, or by one person and a date range.
performance_reviews (organization_id, employee_id): the review list and per-employee lookups.

Index-only change; idempotent and reversible.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "r1f2a3b4c5d4"
down_revision: Union[str, Sequence[str], None] = "q1e2f3a4b5c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_INDEXES = [
    ("ix_attendance_org_date", "attendance_records", ["organization_id", "date"]),
    ("ix_attendance_employee_date", "attendance_records", ["employee_id", "date"]),
    ("ix_perf_reviews_org_employee", "performance_reviews", ["organization_id", "employee_id"]),
]


def _existing(table: str) -> set:
    insp = sa.inspect(op.get_bind())
    return {i["name"] for i in insp.get_indexes(table)} if insp.has_table(table) else set()


def upgrade() -> None:
    for name, table, cols in _INDEXES:
        if sa.inspect(op.get_bind()).has_table(table) and name not in _existing(table):
            op.create_index(name, table, cols)


def downgrade() -> None:
    for name, table, _ in reversed(_INDEXES):
        if name in _existing(table):
            op.drop_index(name, table_name=table)
