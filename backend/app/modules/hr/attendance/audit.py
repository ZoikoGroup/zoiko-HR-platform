"""The only writer of attendance_audit_log. Every attendance change goes through `record` (plan rule: "every attendance
edit must write an audit-log entry")."""
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from app.modules.hr.attendance.models import AttendanceAuditLog

# fields of an attendance record worth keeping in before/after snapshots
SNAPSHOT_FIELDS = ("status", "check_in_at", "check_out_at", "check_in", "check_out", "worked_minutes", "break_minutes",
                   "late_minutes", "overtime_minutes", "source", "shift_id", "status_locked", "notes", "is_deleted")


def _plain(value):
    if value is None or isinstance(value, (int, float, str, bool)):
        return value
    if hasattr(value, "value"):          # enums
        return value.value
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def snapshot(record) -> dict:
    return {f: _plain(getattr(record, f, None)) for f in SNAPSHOT_FIELDS}


def changed(before: dict, after: dict) -> tuple[dict, dict]:
    """Only the fields that differ, as (before, after)."""
    keys = [k for k in after if before.get(k) != after.get(k)]
    return {k: before.get(k) for k in keys}, {k: after.get(k) for k in keys}


def record(db: Session, *, organization_id: int, employee_id: int, work_date: date, action: str, attendance_id: Optional[int] = None,
           actor=None, actor_type: Optional[str] = None, source: Optional[str] = None, before: Optional[dict] = None,
           after: Optional[dict] = None, reason: Optional[str] = None, ctx=None) -> AttendanceAuditLog:
    row = AttendanceAuditLog(
        organization_id=organization_id, attendance_id=attendance_id, employee_id=employee_id, work_date=work_date,
        action=action[:30], actor_id=getattr(actor, "id", None), actor_type=actor_type or ("user" if actor is not None else "system"),
        source=source, before=before, after=after, reason=(reason or None),
        ip_address=getattr(ctx, "ip", None), user_agent=(getattr(ctx, "user_agent", None) or None))
    if row.user_agent:
        row.user_agent = row.user_agent[:255]
    db.add(row)
    return row
