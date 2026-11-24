"""Organization attendance policy and per-person day facts (shift, working day, holiday, approved leave).

Settings live in organization_configs through hr/work_settings (attendance.* keys); working days default to the leave
settings (Mon–Fri when unset) and a shift may override them.
"""
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.modules.hr import work_settings
from app.modules.hr.attendance.clock import parse_hhmm
from app.modules.hr.attendance.constants import DEFAULT_STANDARD_MINUTES, WEEKDAYS
from app.modules.hr.attendance.status_engine import LeaveInfo, ShiftInfo

DEFAULT_WORKING_DAYS = ("mon", "tue", "wed", "thu", "fri")


@dataclass(frozen=True)
class AttendancePolicy:
    grace_minutes: int = 10
    half_day_min_minutes: int = 240
    min_present_minutes: int = 60
    standard_minutes: int = DEFAULT_STANDARD_MINUTES
    overtime_requires_approval: bool = True
    default_shift_id: Optional[int] = None
    auto_close_punch_out: bool = True
    allow_web_punch: bool = True
    edit_lock_days: Optional[int] = None
    working_days: tuple = DEFAULT_WORKING_DAYS


def normalise_days(days) -> tuple:
    """['Monday', 'TUE', 'wed'] -> ('mon', 'tue', 'wed') in week order; unknown entries are dropped."""
    wanted = {str(d).strip().lower()[:3] for d in (days or [])}
    return tuple(d for d in WEEKDAYS if d in wanted)


def _minutes_from_hours(value, fallback: int) -> int:
    try:
        return int(Decimal(str(value)) * 60) if value not in (None, "") else fallback
    except Exception:
        return fallback


def get_policy(db: Session, organization_id: int) -> AttendancePolicy:
    from app.modules.hr.models import LeaveSetting
    get = lambda key: work_settings.get(db, organization_id, key)    # noqa: E731
    leave = db.query(LeaveSetting.working_days).filter(LeaveSetting.organization_id == organization_id).first()
    days = normalise_days(leave[0] if leave else None) or DEFAULT_WORKING_DAYS
    return AttendancePolicy(
        grace_minutes=int(get("attendance.grace_minutes") or 0),
        half_day_min_minutes=_minutes_from_hours(get("attendance.half_day_min_hours"), 240),
        min_present_minutes=_minutes_from_hours(get("attendance.min_present_hours"), 60),
        standard_minutes=_minutes_from_hours(get("attendance.standard_workday_hours"), DEFAULT_STANDARD_MINUTES),
        overtime_requires_approval=bool(get("attendance.overtime_requires_approval")),
        default_shift_id=get("attendance.default_shift_id"),
        auto_close_punch_out=bool(get("attendance.auto_close_punch_out")),
        allow_web_punch=bool(get("attendance.allow_web_punch")),
        edit_lock_days=get("attendance.edit_lock_days"),
        working_days=days,
    )


def shift_info(shift, policy: AttendancePolicy) -> Optional[ShiftInfo]:
    if shift is None:
        return None
    start, end = parse_hhmm(shift.start_time), parse_hhmm(shift.end_time)
    if not start or not end:
        return None
    standard = (_minutes_from_hours(shift.standard_hours, 0) if shift.standard_hours is not None else 0) or policy.standard_minutes
    return ShiftInfo(shift_id=shift.id, name=shift.name, start=start, end=end,
                     # shifts default to 0 grace in the database, so 0 / unset means "the organization's grace period"
                     grace_minutes=int(shift.grace_time_minutes) if shift.grace_time_minutes else policy.grace_minutes,
                     break_minutes=int(shift.break_duration_minutes or 0), standard_minutes=standard,
                     half_day_min_minutes=shift.half_day_min_minutes,
                     min_present_minutes=getattr(shift, "min_present_minutes", None),
                     working_days=normalise_days(shift.working_days) or None)


def shift_for(db: Session, organization_id: int, employee_id: int, day: date, policy: AttendancePolicy) -> Optional[ShiftInfo]:
    """The person's shift on `day`: that date's roster entry, else their assigned shift for the period, else the
    organization's default shift, else none."""
    from app.modules.hr.attendance.models import EmployeeShift
    from app.modules.hr.models import Shift, ShiftRoster
    roster = (db.query(Shift).join(ShiftRoster, ShiftRoster.shift_id == Shift.id)
              .filter(ShiftRoster.employee_id == employee_id, ShiftRoster.date == day, ShiftRoster.is_active.isnot(False),
                      Shift.organization_id == organization_id)
              .order_by(ShiftRoster.id.desc()).first())
    if roster is not None:
        return shift_info(roster, policy)
    assigned = (db.query(Shift).join(EmployeeShift, EmployeeShift.shift_id == Shift.id)
                .filter(EmployeeShift.organization_id == organization_id, EmployeeShift.employee_id == employee_id,
                        EmployeeShift.effective_from <= day,
                        or_(EmployeeShift.effective_to.is_(None), EmployeeShift.effective_to >= day))
                .order_by(EmployeeShift.effective_from.desc()).first())
    if assigned is not None:
        return shift_info(assigned, policy)
    if policy.default_shift_id:
        default = db.query(Shift).filter(Shift.id == policy.default_shift_id, Shift.organization_id == organization_id,
                                         Shift.is_active.isnot(False)).first()
        return shift_info(default, policy)
    return None


def is_working_day(policy: AttendancePolicy, shift: Optional[ShiftInfo], day: date) -> bool:
    days = (shift.working_days if shift and shift.working_days else None) or policy.working_days
    return WEEKDAYS[day.weekday()] in days


def is_holiday(db: Session, organization_id: int, day: date) -> bool:
    """An active holiday on that date, or a recurring one on the same month and day of an earlier year."""
    from app.modules.hr.models import Holiday
    rows = (db.query(Holiday.date, Holiday.is_recurring)
            .filter(Holiday.organization_id == organization_id, Holiday.is_active.isnot(False),
                    or_(Holiday.date == day, Holiday.is_recurring.is_(True)))
            .all())
    return any(d == day or (rec and d and (d.month, d.day) == (day.month, day.day) and d.year <= day.year) for d, rec in rows)


def approved_leave_on(db: Session, organization_id: int, employee_id: int, day: date) -> Optional[LeaveInfo]:
    from app.modules.hr.models import LeaveRequest, RequestStatus
    leave = (db.query(LeaveRequest)
             .filter(LeaveRequest.organization_id == organization_id, LeaveRequest.employee_id == employee_id,
                     LeaveRequest.status.in_([RequestStatus.APPROVED, RequestStatus.COMPLETED]),
                     LeaveRequest.start_date <= day, LeaveRequest.end_date >= day)
             .order_by(LeaveRequest.id.desc()).first())
    if leave is None:
        return None
    lt = getattr(leave.leave_type, "value", leave.leave_type)
    half = bool((leave.details or {}).get("half_day")) if isinstance(leave.details, dict) else False
    return LeaveInfo(leave_type=str(lt), half_day=half)


def employed_on(employee, day: date, exit_date: Optional[date] = None) -> bool:
    joined = getattr(employee, "date_of_joining", None)
    if joined and day < joined:
        return False
    if exit_date and day > exit_date:
        return False
    return True


# ── ranges (a month view in a handful of queries instead of several per day) ──────────────────────────────────────

def shifts_for_range(db: Session, organization_id: int, employee_id: int, start: date, end: date,
                     policy: AttendancePolicy) -> dict:
    """{date: ShiftInfo | None} for every day in [start, end], same precedence as shift_for."""
    from datetime import timedelta
    from app.modules.hr.attendance.models import EmployeeShift
    from app.modules.hr.models import Shift, ShiftRoster
    rosters = {}
    for r_date, shift in (db.query(ShiftRoster.date, Shift).join(Shift, Shift.id == ShiftRoster.shift_id)
                          .filter(ShiftRoster.employee_id == employee_id, ShiftRoster.date >= start, ShiftRoster.date <= end,
                                  ShiftRoster.is_active.isnot(False), Shift.organization_id == organization_id)
                          .order_by(ShiftRoster.id).all()):
        rosters[r_date] = shift                         # the latest entry for a date wins
    assigned = (db.query(EmployeeShift, Shift).join(Shift, Shift.id == EmployeeShift.shift_id)
                .filter(EmployeeShift.organization_id == organization_id, EmployeeShift.employee_id == employee_id,
                        EmployeeShift.effective_from <= end,
                        or_(EmployeeShift.effective_to.is_(None), EmployeeShift.effective_to >= start))
                .order_by(EmployeeShift.effective_from.desc()).all())
    default = None
    if policy.default_shift_id:
        default = db.query(Shift).filter(Shift.id == policy.default_shift_id, Shift.organization_id == organization_id,
                                         Shift.is_active.isnot(False)).first()
    cache: dict = {}

    def info(shift):
        if shift is None:
            return None
        if shift.id not in cache:
            cache[shift.id] = shift_info(shift, policy)
        return cache[shift.id]

    out, day = {}, start
    while day <= end:
        if day in rosters:
            out[day] = info(rosters[day])
        else:
            hit = next((s for a, s in assigned if a.effective_from <= day and (a.effective_to is None or a.effective_to >= day)), None)
            out[day] = info(hit or default)
        day += timedelta(days=1)
    return out


def next_shift_change(db: Session, organization_id: int, employee_id: int, today: date, policy: AttendancePolicy,
                      days: int = 60) -> Optional[tuple]:
    """(date, ShiftInfo | None) of the first day within `days` after `today` whose shift differs from today's (a new
    roster entry, assignment or the end of one), or None when nothing changes. Same precedence as shift_for."""
    from datetime import timedelta
    span = shifts_for_range(db, organization_id, employee_id, today, today + timedelta(days=days), policy)
    key = lambda s: s.shift_id if s is not None else None          # noqa: E731
    now = key(span.get(today))
    for day in sorted(d for d in span if d > today):
        if key(span[day]) != now:
            return day, span[day]
    return None


def holidays_in_range(db: Session, organization_id: int, start: date, end: date) -> set:
    """Holiday dates in [start, end], recurring ones included."""
    from datetime import timedelta
    from app.modules.hr.models import Holiday
    rows = (db.query(Holiday.date, Holiday.is_recurring)
            .filter(Holiday.organization_id == organization_id, Holiday.is_active.isnot(False),
                    or_(Holiday.date.between(start, end), Holiday.is_recurring.is_(True))).all())
    out, day = set(), start
    fixed = {d for d, _ in rows if d and start <= d <= end}
    recurring = {(d.month, d.day, d.year) for d, rec in rows if rec and d}
    while day <= end:
        if day in fixed or any((m, dd) == (day.month, day.day) and y <= day.year for m, dd, y in recurring):
            out.add(day)
        day += timedelta(days=1)
    return out


def leaves_in_range(db: Session, organization_id: int, employee_id: int, start: date, end: date) -> dict:
    """{date: LeaveInfo} for approved leave overlapping [start, end]."""
    from datetime import timedelta
    from app.modules.hr.models import LeaveRequest, RequestStatus
    out = {}
    for leave in (db.query(LeaveRequest)
                  .filter(LeaveRequest.organization_id == organization_id, LeaveRequest.employee_id == employee_id,
                          LeaveRequest.status.in_([RequestStatus.APPROVED, RequestStatus.COMPLETED]),
                          LeaveRequest.start_date <= end, LeaveRequest.end_date >= start)
                  .order_by(LeaveRequest.id).all()):
        lt = str(getattr(leave.leave_type, "value", leave.leave_type))
        half = bool((leave.details or {}).get("half_day")) if isinstance(leave.details, dict) else False
        day = max(leave.start_date, start)
        while day <= min(leave.end_date, end):
            out[day] = LeaveInfo(leave_type=lt, half_day=half)
            day += timedelta(days=1)
    return out
