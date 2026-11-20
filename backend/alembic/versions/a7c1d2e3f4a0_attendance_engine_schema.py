"""Attendance engine (attendance plan M1): new tables and columns

Revision ID: a7c1d2e3f4a0
Revises: e1a2b3c4d5f3
Create Date: 2026-11-20

* New tables: attendance_breaks, employee_shifts, attendance_audit_log.
* attendance_records: check_in_at / check_out_at (UTC), work_date_tz, source, shift_id, late / break / worked / overtime
  minutes, status_locked, auto_marked, created_by, updated_by; index (organization_id, date, status).
* shifts: working_days, half_day_min_minutes.  shift_rosters: organization_id.
* attendance_correction_requests: kind, requested_status, requested_breaks; requested_check_in / out become nullable
  (PostgreSQL; SQLite keeps NOT NULL, the application always sends them there).
* attendancestatus enum (PostgreSQL): WEEKLY_OFF, MISSED_PUNCH (added outside the transaction, as PostgreSQL requires).

Every new column is nullable or has a server default, so existing rows stay valid. Guarded and reversible (enum values
stay on downgrade: PostgreSQL cannot drop them and unused values are harmless).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a7c1d2e3f4a0"
down_revision: Union[str, Sequence[str], None] = "e1a2b3c4d5f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("attendance_breaks", "employee_shifts", "attendance_audit_log")

COLUMNS = {
    "attendance_records": [
        lambda: sa.Column("check_in_at", sa.DateTime(), nullable=True),
        lambda: sa.Column("check_out_at", sa.DateTime(), nullable=True),
        lambda: sa.Column("work_date_tz", sa.String(64), nullable=True),
        lambda: sa.Column("source", sa.String(12), nullable=False, server_default="manual"),
        lambda: sa.Column("shift_id", sa.Integer(), sa.ForeignKey("shifts.id"), nullable=True),
        lambda: sa.Column("late_minutes", sa.Integer(), nullable=False, server_default="0"),
        lambda: sa.Column("break_minutes", sa.Integer(), nullable=False, server_default="0"),
        lambda: sa.Column("worked_minutes", sa.Integer(), nullable=False, server_default="0"),
        lambda: sa.Column("overtime_minutes", sa.Integer(), nullable=False, server_default="0"),
        lambda: sa.Column("status_locked", sa.Boolean(), nullable=False, server_default=sa.false()),
        lambda: sa.Column("auto_marked", sa.Boolean(), nullable=False, server_default=sa.false()),
        lambda: sa.Column("created_by", sa.Integer(), nullable=True),
        lambda: sa.Column("updated_by", sa.Integer(), nullable=True),
    ],
    "shifts": [
        lambda: sa.Column("working_days", sa.JSON(), nullable=True),
        lambda: sa.Column("half_day_min_minutes", sa.Integer(), nullable=True),
    ],
    "shift_rosters": [
        lambda: sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=True),
    ],
    "attendance_correction_requests": [
        lambda: sa.Column("kind", sa.String(20), nullable=False, server_default="missed_punch"),
        lambda: sa.Column("requested_status", sa.String(20), nullable=True),
        lambda: sa.Column("requested_breaks", sa.JSON(), nullable=True),
    ],
}

INDEXES = (
    ("ix_attendance_org_date_status", "attendance_records", ["organization_id", "date", "status"]),
    ("ix_shift_rosters_organization_id", "shift_rosters", ["organization_id"]),
)


def _metadata():
    import app.modules.hr.attendance.models  # noqa: F401
    from app.database import Base
    return Base.metadata


def _existing(table):
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def _indexes(table):
    return {i["name"] for i in sa.inspect(op.get_bind()).get_indexes(table)}


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE attendancestatus ADD VALUE IF NOT EXISTS 'WEEKLY_OFF'")
            op.execute("ALTER TYPE attendancestatus ADD VALUE IF NOT EXISTS 'MISSED_PUNCH'")
    md = _metadata()
    for name in TABLES:
        md.tables[name].create(bind=bind, checkfirst=True)
    for table, cols in COLUMNS.items():
        have = _existing(table)
        for make in cols:
            col = make()
            if col.name in have:
                continue
            if bind.dialect.name == "sqlite":        # SQLite cannot add a constraint to an existing table
                col = sa.Column(col.name, col.type, nullable=col.nullable, server_default=col.server_default)
            op.add_column(table, col)
    for name, table, columns in INDEXES:
        if name not in _indexes(table):
            op.create_index(name, table, columns)
    if bind.dialect.name == "postgresql":
        op.alter_column("attendance_correction_requests", "requested_check_in", nullable=True)
        op.alter_column("attendance_correction_requests", "requested_check_out", nullable=True)


def downgrade() -> None:
    bind = op.get_bind()
    for name, table, _ in reversed(INDEXES):
        if name in _indexes(table):
            op.drop_index(name, table_name=table)
    for table, cols in COLUMNS.items():
        have = _existing(table)
        drop = [make().name for make in reversed(cols) if make().name in have]
        if not drop:
            continue
        if bind.dialect.name == "sqlite":            # SQLite cannot drop a column with a foreign key in place
            with op.batch_alter_table(table) as batch:
                for name in drop:
                    batch.drop_column(name)
        else:
            for name in drop:
                op.drop_column(table, name)
    md = _metadata()
    for name in reversed(TABLES):
        md.tables[name].drop(bind=bind, checkfirst=True)
