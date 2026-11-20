"""Demo attendance data for ONE organization, for local verification of the attendance engine (attendance plan M9).

    python scripts/seed_attendance.py --org 12              # last 30 days, up to 20 people
    python scripts/seed_attendance.py --org 12 --days 14 --people 8
    python scripts/seed_attendance.py --org 12 --force      # allow a non-local database (think twice)

Creates, only where missing:
* two shifts ("Demo General" 09:00–18:00, "Demo Night" 22:00–06:00) and shift assignments for the people chosen
* weekday punches and a lunch break: mostly on time, some late, a few half days, a few absences (no punch), a missed
  punch-out now and then; one approved leave of two days; one holiday
* one pending attendance correction and one pending overtime request
then closes the finished days with the end-of-day close, so every day has a stored status.

Refuses to run against a database that is not on this machine unless --force is given. Never touches another
organization. Safe to run again: existing days, shifts, the demo leave, holiday and requests are not duplicated.
Prints counts only (no names).
"""
import argparse
import random
import sys
from datetime import date, datetime, time, timedelta
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

DEMO = "Demo data (scripts/seed_attendance.py)"
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", ""}


def is_local(url: str) -> bool:
    if url.startswith("sqlite"):
        return True
    return (urlparse(url).hostname or "") in LOCAL_HOSTS


def _shift(db, org, name, start, end, grace):
    from app.modules.hr.models import Shift, ShiftType
    s = db.query(Shift).filter(Shift.organization_id == org, Shift.name == name).first()
    if s is None:
        s = Shift(name=name, shift_type=ShiftType.NIGHT if start > end else ShiftType.GENERAL, start_time=start, end_time=end,
                  grace_time_minutes=grace, break_duration_minutes=45, organization_id=org, description=DEMO)
        db.add(s)
        db.flush()
    return s


def seed(db, org: int, *, days: int = 30, people: int = 20, today: date = None, seed_value: int = 7) -> dict:
    """Create the demo data. Returns counts. `today` is the organization's local date (defaults to now)."""
    from app.modules.employee.models import Employee
    from app.modules.hr.attendance import clock, day_close
    from app.modules.hr.attendance.models import AttendanceBreak, AttendanceDayClosure, EmployeeShift
    from app.modules.hr.models import (AttendanceCorrectionRequest, AttendanceRecord, AttendanceStatus, Holiday, LeaveRequest,
                                       LeaveType, Organization, OvertimeRequest, RequestStatus)
    organization = db.get(Organization, org)
    if organization is None:
        raise SystemExit(f"Organization {org} not found.")
    tz = clock.tz_for(None, organization)
    today = today or clock.local_today(tz)
    rnd = random.Random(seed_value)
    staff = (db.query(Employee).filter(Employee.organization_id == org, Employee.is_active.isnot(False))
             .order_by(Employee.id).limit(people).all())
    if not staff:
        raise SystemExit("This organization has no active employees to give attendance to.")
    out = {"shifts": 0, "assignments": 0, "records": 0, "breaks": 0, "leave": 0, "holiday": 0, "requests": 0, "days_closed": 0}
    general = _shift(db, org, "Demo General", "09:00", "18:00", 10)
    night = _shift(db, org, "Demo Night", "22:00", "06:00", 5)
    out["shifts"] = 2
    start = today - timedelta(days=days)
    for i, emp in enumerate(staff):
        if not db.query(EmployeeShift.id).filter(EmployeeShift.organization_id == org, EmployeeShift.employee_id == emp.id).first():
            db.add(EmployeeShift(organization_id=org, employee_id=emp.id, shift_id=(night if i == len(staff) - 1 and len(staff) > 3 else general).id,
                                 effective_from=min(start, emp.date_of_joining or start)))
            out["assignments"] += 1
    holiday_day = next(d for d in (today - timedelta(days=k) for k in range(days // 2, days)) if d.weekday() < 5)
    if not db.query(Holiday.id).filter(Holiday.organization_id == org, Holiday.description == DEMO).first():
        db.add(Holiday(name="Demo holiday", date=holiday_day, organization_id=org, description=DEMO, type="Company"))
        out["holiday"] = 1
    else:
        holiday_day = db.query(Holiday.date).filter(Holiday.organization_id == org, Holiday.description == DEMO).scalar()
    on_leave = staff[0]
    leave_from = next(d for d in (today - timedelta(days=k) for k in range(5, days)) if d.weekday() < 4)
    if not db.query(LeaveRequest.id).filter(LeaveRequest.organization_id == org, LeaveRequest.reason == DEMO).first():
        db.add(LeaveRequest(employee_id=on_leave.id, organization_id=org, leave_type=LeaveType.CASUAL, start_date=leave_from,
                            end_date=leave_from + timedelta(days=1), days=2, status=RequestStatus.APPROVED, reason=DEMO))
        out["leave"] = 1
    else:
        leave_from = db.query(LeaveRequest.start_date).filter(LeaveRequest.organization_id == org, LeaveRequest.reason == DEMO).scalar()
    db.flush()

    day = start
    while day < today:
        for i, emp in enumerate(staff):
            if day.weekday() >= 5 or day == holiday_day or (emp.date_of_joining and day < emp.date_of_joining):
                continue
            if emp.id == on_leave.id and leave_from <= day <= leave_from + timedelta(days=1):
                continue
            if db.query(AttendanceRecord.id).filter(AttendanceRecord.organization_id == org, AttendanceRecord.employee_id == emp.id,
                                                    AttendanceRecord.date == day, AttendanceRecord.is_deleted.isnot(True)).first():
                continue
            roll = rnd.random()
            if roll < 0.03:
                continue                                   # absent: no punch (the day close marks it)
            is_night = i == len(staff) - 1 and len(staff) > 3
            base = datetime.combine(day, time(22, 0) if is_night else time(9, 0))
            late = rnd.randint(15, 50) if roll < 0.13 else rnd.randint(-10, 8)
            cin = base + timedelta(minutes=late)
            hours = 3.5 if 0.13 <= roll < 0.17 else rnd.uniform(8.5, 10)
            cout = None if 0.17 <= roll < 0.19 else cin + timedelta(hours=hours)
            rec = AttendanceRecord(employee_id=emp.id, organization_id=org, date=day, status=AttendanceStatus.PRESENT, source="web",
                                   check_in=cin, check_out=cout, check_in_at=clock.to_utc(cin, tz), check_out_at=clock.to_utc(cout, tz),
                                   notes=DEMO, is_deleted=False)
            db.add(rec)
            db.flush()
            out["records"] += 1
            if cout is not None and hours > 5:
                b_start = cin + timedelta(hours=4)
                db.add(AttendanceBreak(organization_id=org, attendance_id=rec.id, start_at=clock.to_utc(b_start, tz),
                                       end_at=clock.to_utc(b_start + timedelta(minutes=rnd.choice((30, 45, 60))), tz), source="web"))
                out["breaks"] += 1
        day += timedelta(days=1)
    # one pending correction and one pending overtime request (for the approvals queue)
    asker = staff[1] if len(staff) > 1 else staff[0]
    last_weekday = next(d for d in (today - timedelta(days=k) for k in range(1, 8)) if d.weekday() < 5 and d != holiday_day)
    if not db.query(AttendanceCorrectionRequest.id).filter(AttendanceCorrectionRequest.organization_id == org,
                                                           AttendanceCorrectionRequest.reason_detail == DEMO).first():
        db.add(AttendanceCorrectionRequest(organization_id=org, employee_id=asker.id, date=last_weekday, kind="time_change", reason="forgot",
                                           reason_detail=DEMO, requested_check_in=datetime.combine(last_weekday, time(9, 0)),
                                           requested_check_out=datetime.combine(last_weekday, time(18, 15)), requested_by=asker.id,
                                           status="PENDING", declared_at=datetime.utcnow()))
        db.add(OvertimeRequest(organization_id=org, employee_id=asker.id, date=last_weekday, start_time="18:00", end_time="20:00", hours=2,
                               reason=DEMO, requested_by=asker.id, status="PENDING"))
        out["requests"] = 2
    db.flush()
    # close every finished day of the range that is not closed yet, so each day has a stored status
    closed = {d for (d,) in db.query(AttendanceDayClosure.work_date).filter(AttendanceDayClosure.organization_id == org)}
    now = clock.utcnow()
    day = start
    while day < today:
        if day not in closed:
            day_close.close_day(db, org, day, now_utc=now)
            out["days_closed"] += 1
        day += timedelta(days=1)
    db.commit()
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--org", type=int, required=True, help="the organization id to fill (required)")
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--people", type=int, default=20)
    parser.add_argument("--force", action="store_true", help="allow a database that is not on this machine")
    args = parser.parse_args()
    from app.config import settings
    from app.database import SessionLocal, engine
    url = str(engine.url)
    if not is_local(url) and not args.force:
        raise SystemExit("Refusing: the database is not on this machine. This script is for local verification; "
                         "use --force only if you really mean to add demo data there.")
    db = SessionLocal()
    try:
        counts = seed(db, args.org, days=max(1, min(args.days, 90)), people=max(1, min(args.people, 200)))
    finally:
        db.close()
    print("Demo attendance created:", ", ".join(f"{k}={v}" for k, v in counts.items()))
    _ = settings


if __name__ == "__main__":
    main()
