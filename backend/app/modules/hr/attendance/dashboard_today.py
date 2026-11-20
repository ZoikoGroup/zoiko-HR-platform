"""Live "Today" for the attendance dashboard (attendance plan M6).

For everyone the viewer may see (Org Admin / HR Admin: the organization; a manager: themselves and their reports):
who is working, late, on a break, on leave, remote, off, absent or not checked in yet, by department, and the list of
people expected today who have not punched in. "Today" is the organization's local date. A fixed number of queries,
whatever the headcount.
"""
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.modules.employee.models import Employee, EmployeeStatus
from app.modules.hr.attendance import clock, policy as policy_mod
from app.modules.hr.attendance.models import AttendanceBreak, EmployeeShift
from app.modules.hr.attendance.status_engine import ShiftInfo
from app.modules.hr.models import AttendanceRecord, AttendanceStatus as S, Department, Organization, Shift, ShiftRoster

ATTENDED = {S.PRESENT, S.LATE, S.REMOTE, S.HALF_DAY}
INACTIVE = {"terminated", "resigned", "inactive", "exited", "deactivated"}


def _shifts_on(db: Session, org: int, people: list, day: date, pol) -> dict:
    """{employee_id: ShiftInfo | None} for one day: roster > assignment > organization default."""
    ids = [p.id for p in people] or [-1]
    cache: dict = {}

    def info(shift):
        if shift is None:
            return None
        if shift.id not in cache:
            cache[shift.id] = policy_mod.shift_info(shift, pol)
        return cache[shift.id]

    out = {}
    for emp_id, shift in (db.query(ShiftRoster.employee_id, Shift).join(Shift, Shift.id == ShiftRoster.shift_id)
                          .filter(ShiftRoster.employee_id.in_(ids), ShiftRoster.date == day, ShiftRoster.is_active.isnot(False),
                                  Shift.organization_id == org).order_by(ShiftRoster.id)):
        out[emp_id] = info(shift)
    for a, shift in (db.query(EmployeeShift, Shift).join(Shift, Shift.id == EmployeeShift.shift_id)
                     .filter(EmployeeShift.organization_id == org, EmployeeShift.employee_id.in_(ids),
                             EmployeeShift.effective_from <= day,
                             or_(EmployeeShift.effective_to.is_(None), EmployeeShift.effective_to >= day))
                     .order_by(EmployeeShift.effective_from)):
        out.setdefault(a.employee_id, info(shift))
    default = None
    if pol.default_shift_id:
        default = info(db.query(Shift).filter(Shift.id == pol.default_shift_id, Shift.organization_id == org).first())
    for p in people:
        out.setdefault(p.id, default)
    return out


def _leaves_on(db: Session, org: int, ids: list, day: date) -> dict:
    from app.modules.hr.models import LeaveRequest, RequestStatus
    out = {}
    for lv in (db.query(LeaveRequest).filter(LeaveRequest.organization_id == org, LeaveRequest.employee_id.in_(ids or [-1]),
                                             LeaveRequest.status.in_([RequestStatus.APPROVED, RequestStatus.COMPLETED]),
                                             LeaveRequest.start_date <= day, LeaveRequest.end_date >= day)):
        out[lv.employee_id] = str(getattr(lv.leave_type, "value", lv.leave_type))
    return out


def today(db: Session, actor, department_id: Optional[int] = None, now: Optional[datetime] = None) -> dict:
    from app.modules.hr.attendance_service import viewer_scope
    org = actor.organization_id
    now = now or clock.utcnow()
    tz = clock.tz_for(None, db.get(Organization, org))
    day = clock.work_date_for(now, tz)
    pol = policy_mod.get_policy(db, org)

    q = (db.query(Employee, Department).outerjoin(Department, Department.id == Employee.department_id)
         .filter(Employee.organization_id == org, Employee.is_active.isnot(False)))
    scope = viewer_scope(db, actor)
    if scope is not None:
        q = q.filter(Employee.id.in_(list(scope) or [-1]))
    if department_id:
        q = q.filter(Employee.department_id == department_id)
    rows = [(e, d) for e, d in q.all()
            if str(getattr(e.status, "value", e.status) or "").lower() not in INACTIVE and policy_mod.employed_on(e, day)]
    people = [e for e, _ in rows]
    ids = [e.id for e in people]
    records = {r.employee_id: r for r in (db.query(AttendanceRecord)
                                          .filter(AttendanceRecord.organization_id == org, AttendanceRecord.employee_id.in_(ids or [-1]),
                                                  AttendanceRecord.date == day, AttendanceRecord.is_deleted.isnot(True))
                                          .order_by(AttendanceRecord.id))}
    on_break = {b.attendance_id for b in db.query(AttendanceBreak.attendance_id)
                .filter(AttendanceBreak.attendance_id.in_([r.id for r in records.values()] or [-1]), AttendanceBreak.end_at.is_(None))}
    leaves = _leaves_on(db, org, ids, day)
    holiday = policy_mod.is_holiday(db, org, day)
    shifts = _shifts_on(db, org, people, day, pol)

    counts = {k: 0 for k in ("total", "present", "late", "half_day", "remote", "on_leave", "absent", "missed_punch", "off",
                             "not_checked_in", "on_break", "working_now", "checked_out")}
    by_dept: dict = defaultdict(lambda: {"total": 0, "attended": 0, "late": 0, "on_leave": 0, "not_checked_in": 0})
    waiting = []
    for emp, dept in rows:
        shift: Optional[ShiftInfo] = shifts.get(emp.id)
        rec = records.get(emp.id)
        dname = dept.name if dept else "Unassigned"
        d = by_dept[(dept.id if dept else None, dname)]
        counts["total"] += 1
        d["total"] += 1
        status = rec.status if rec is not None else None
        if rec is None or (rec.check_in_at is None and rec.check_in is None and status not in (S.ON_LEAVE, S.HOLIDAY, S.WEEKLY_OFF, S.ABSENT, S.REMOTE)):
            if emp.id in leaves:
                key = "remote" if leaves[emp.id] == "work_from_home" else "on_leave"
                counts[key] += 1
                if key == "on_leave":
                    d["on_leave"] += 1
                else:
                    d["attended"] += 1
            elif holiday or not policy_mod.is_working_day(pol, shift, day):
                counts["off"] += 1
            else:
                counts["not_checked_in"] += 1
                d["not_checked_in"] += 1
                # overdue: their shift started (plus grace) and they have not punched in
                overdue = bool(shift and clock.to_local(now, tz) > shift.start_on(day) + timedelta(minutes=shift.grace_minutes))
                waiting.append({"employee_id": emp.id, "name": emp.full_name, "employee_code": emp.employee_code,
                                "department": dname, "shift": shift.name if shift else None,
                                "shift_start": "%02d:%02d" % shift.start if shift else None, "overdue": overdue})
            continue
        if status in ATTENDED:
            d["attended"] += 1
            key = {S.PRESENT: "present", S.LATE: "late", S.HALF_DAY: "half_day", S.REMOTE: "remote"}[status]
            counts[key] += 1
            if status == S.LATE:
                d["late"] += 1
        elif status == S.ON_LEAVE:
            counts["on_leave"] += 1
            d["on_leave"] += 1
        elif status in (S.HOLIDAY, S.WEEKLY_OFF):
            counts["off"] += 1
        elif status == S.MISSED_PUNCH:
            counts["missed_punch"] += 1
        elif status == S.ABSENT:
            counts["absent"] += 1
        if rec.check_in_at is not None and rec.check_out_at is None:
            if rec.id in on_break:
                counts["on_break"] += 1
            else:
                counts["working_now"] += 1
        elif rec.check_out_at is not None:
            counts["checked_out"] += 1

    expected = counts["total"] - counts["off"] - counts["on_leave"]
    attended = counts["present"] + counts["late"] + counts["half_day"] + counts["remote"]
    waiting.sort(key=lambda w: (not w["overdue"], w["shift_start"] or "99:99", w["name"] or ""))
    return {
        "date": day.isoformat(), "timezone": tz.key, "as_of": clock.iso_utc(now), "holiday": holiday,
        **counts, "expected": expected,
        "attendance_rate": round(100 * attended / expected) if expected else None,
        "by_department": sorted(({"department_id": k[0], "department": k[1], **v} for k, v in by_dept.items()),
                                key=lambda x: (-x["total"], x["department"])),
        "not_checked_in_list": waiting[:200],
    }
