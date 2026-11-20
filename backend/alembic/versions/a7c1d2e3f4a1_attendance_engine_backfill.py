"""Attendance engine (attendance plan M1): data backfill

Revision ID: a7c1d2e3f4a1
Revises: a7c1d2e3f4a0
Create Date: 2026-11-20

1. Duplicate records for the same person and day are merged: the newest stays, the others are soft-deleted
   (is_deleted) with an attendance_audit_log entry ('merged'). Nothing is hard-deleted.
2. check_in_at / check_out_at (UTC) are filled from the existing wall-clock times read in the employee's time zone,
   else the organization's; work_date_tz and worked_minutes are recorded.
3. shift_rosters.organization_id is filled from the employee.

Idempotent (app/modules/hr/attendance/backfill.py). Downgrade is a no-op: the soft-deleted duplicates stay soft-deleted
and the extra columns are dropped by the previous revision's downgrade.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "a7c1d2e3f4a1"
down_revision: Union[str, Sequence[str], None] = "a7c1d2e3f4a0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from app.modules.hr.attendance.backfill import run_all
    run_all(op.get_bind())


def downgrade() -> None:
    pass
