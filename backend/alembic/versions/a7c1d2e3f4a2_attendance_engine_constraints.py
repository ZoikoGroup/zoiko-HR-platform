"""Attendance engine (attendance plan M1): one live record per person per day

Revision ID: a7c1d2e3f4a2
Revises: a7c1d2e3f4a1
Create Date: 2026-11-20

Partial unique index uq_attendance_emp_day on attendance_records (organization_id, employee_id, date) for rows that are
not deleted. The previous revision merged the existing duplicates, so this cannot fail on legacy data; it makes a double
punch-in or a racing double insert impossible at the database level.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a7c1d2e3f4a2"
down_revision: Union[str, Sequence[str], None] = "a7c1d2e3f4a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NAME = "uq_attendance_emp_day"


def upgrade() -> None:
    bind = op.get_bind()
    if NAME in {i["name"] for i in sa.inspect(bind).get_indexes("attendance_records")}:
        return
    live = sa.text("is_deleted = false OR is_deleted IS NULL") if bind.dialect.name == "postgresql" \
        else sa.text("is_deleted = 0 OR is_deleted IS NULL")
    op.create_index(NAME, "attendance_records", ["organization_id", "employee_id", "date"], unique=True,
                    postgresql_where=live, sqlite_where=live)


def downgrade() -> None:
    if NAME in {i["name"] for i in sa.inspect(op.get_bind()).get_indexes("attendance_records")}:
        op.drop_index(NAME, table_name="attendance_records")
