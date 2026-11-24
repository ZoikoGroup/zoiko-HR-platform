"""Leave decisions reach attendance (My Attendance plan B6, approved 2026-11-23).

When leave is approved, cancelled, re-dated or deleted after some of its days already have a stored attendance record
(a punch, or the end-of-day job's Absent / On leave row), those days are recalculated so the calendar, the records and
the KPIs follow the decision: a day closed as Absent becomes On leave, and back again if the leave is cancelled.

* only stored days up to today in the person's time zone; future days have no record and are resolved live
* an HR-locked status is never changed (recompute keeps it); totals are still refreshed
* every change is audited (actor_type "system", action "auto_marked", reason names the leave decision)
* never raises: a leave decision must not fail because of attendance (the error is logged)
"""
import logging
from datetime import date

from sqlalchemy.orm import Session

from app.modules.hr.attendance import audit, clock
from app.modules.hr.attendance.punch_service import recompute, tz_of
from app.modules.hr.models import AttendanceRecord

logger = logging.getLogger("zoiko.attendance.leave_sync")


def refresh_days_for_leave(db: Session, organization_id: int, employee_id: int, start: date, end: date, *, why: str) -> int:
    """Recalculate the stored attendance days of one person between `start` and `end` (inclusive). Returns how many
    records changed. Commits its own changes."""
    try:
        from app.modules.employee.models import Employee
        employee = db.get(Employee, employee_id)
        if employee is None or start is None or end is None:
            return 0
        tz = tz_of(db, employee)
        today = clock.work_date_for(clock.utcnow(), tz)
        last = min(end, today)
        if last < start:
            return 0
        changed = 0
        for rec in (db.query(AttendanceRecord)
                    .filter(AttendanceRecord.organization_id == organization_id, AttendanceRecord.employee_id == employee_id,
                            AttendanceRecord.date >= start, AttendanceRecord.date <= last, AttendanceRecord.is_deleted.isnot(True))
                    .order_by(AttendanceRecord.date)):
            before = audit.snapshot(rec)
            recompute(db, rec, employee, tz=tz, day_closed=rec.date < today)
            b, a = audit.changed(before, audit.snapshot(rec))
            if a:
                audit.record(db, organization_id=organization_id, employee_id=employee_id, work_date=rec.date,
                             action="auto_marked", attendance_id=rec.id, actor_type="system", source="system",
                             before=b, after=a, reason=why)
                changed += 1
        db.commit()
        return changed
    except Exception:                                    # never block the leave decision
        db.rollback()
        logger.exception("attendance refresh after a leave decision failed (employee %s)", employee_id)
        return 0
