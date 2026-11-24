"""The person's own attendance (attendance plan M2): a month view with a status for every day and KPIs computed over
working days only, and the detail of one day (punches, breaks, history).

Days without a stored record get a computed status (holiday, weekly off, approved leave, absent for a past working day)
so the calendar is complete before the end-of-day job has written those rows. Nothing here writes.
"""
import calendar
from datetime import date, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.modules.hr.attendance import clock, errors, policy as policy_mod
from app.modules.hr.attendance.models import AttendanceAuditLog, AttendanceBreak
from app.modules.hr.attendance.punch_service import serialize_day, tz_of
from app.modules.hr.attendance.status_engine import DayContext, resolve
from app.modules.hr.models import AttendanceRecord


def parse_month(month: Optional[str], today: date) -> tuple[date, date]:
    if not month:
        y, m = today.year, today.month
    else:
        try:
            y, m = (int(x) for x in month.split("-")[:2])
            if not 1 <= m <= 12 or not 2000 <= y <= 2100:
                raise ValueError
        except (ValueError, AttributeError):
            raise errors.invalid("month must look like 2026-11.", field="month")
    return date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1])


def _status_value(status):
    return getattr(status, "value", status)


def computed_status(employee, day: date, today: date, *, shift, holiday: bool, leave, pol):
    """The status of a day that has no stored record yet: none before joining / after leaving or in the future,
    otherwise what the rules say (holiday, weekly off, leave, or absent once the day is over). The calendar, the records
    table and the day drawer all use this, so a date shows the same status everywhere."""
    if not policy_mod.employed_on(employee, day) or day > today:
        return None
    working = policy_mod.is_working_day(pol, shift, day)
    return resolve(DayContext(work_date=day, holiday=holiday, working_day=working, leave=leave, shift=shift,
                              day_closed=day < today)).status


def month_view(db: Session, employee, month: Optional[str] = None) -> dict:
    now = clock.utcnow()
    tz, pol = tz_of(db, employee), policy_mod.get_policy(db, employee.organization_id)
    today = clock.work_date_for(now, tz)
    start, end = parse_month(month, today)
    org = employee.organization_id
    records = {r.date: r for r in (db.query(AttendanceRecord)
                                   .filter(AttendanceRecord.organization_id == org, AttendanceRecord.employee_id == employee.id,
                                           AttendanceRecord.is_deleted.isnot(True), AttendanceRecord.date.between(start, end))
                                   .order_by(AttendanceRecord.id).all())}
    shifts = policy_mod.shifts_for_range(db, org, employee.id, start, end, pol)
    holidays = policy_mod.holidays_in_range(db, org, start, end)
    leaves = policy_mod.leaves_in_range(db, org, employee.id, start, end)
    breaks: dict = {}
    if records:
        for b in (db.query(AttendanceBreak).filter(AttendanceBreak.attendance_id.in_([r.id for r in records.values()]))
                  .order_by(AttendanceBreak.start_at)):
            breaks.setdefault(b.attendance_id, []).append(b)

    days, kpi = [], {"working_days": 0, "present": 0, "late": 0, "absent": 0, "half_day": 0, "on_leave": 0, "remote": 0,
                     "holiday": 0, "weekly_off": 0, "missed_punch": 0}
    worked_total = worked_days = overtime = approved_overtime = 0
    # B4 / B5 (approved 2026-11-23): the rates are over working days that are "due": past ones, and today once punched in.
    attended = leave_days = punched_days = on_time_days = 0
    day = start
    while day <= end:
        rec = records.get(day)
        shift = shifts.get(day)
        employed = policy_mod.employed_on(employee, day)
        working = policy_mod.is_working_day(pol, shift, day)
        future = day > today
        status = rec.status if rec is not None else computed_status(employee, day, today, shift=shift, holiday=day in holidays,
                                                                     leave=leaves.get(day), pol=pol)
        sv = _status_value(status)
        due = employed and not future and day not in holidays and working and (
            day < today or (rec is not None and rec.check_in_at is not None))
        if due:
            kpi["working_days"] += 1
            if sv in ("present", "late", "remote"):
                attended += 1
            elif sv == "half_day":
                attended += 0.5
            elif sv == "on_leave":
                leave_days += 1
            if rec is not None and rec.check_in_at is not None:
                punched_days += 1
                if not (rec.late_minutes or 0):
                    on_time_days += 1
        if sv in kpi and not future:
            kpi[sv] += 1
        if rec is not None and rec.check_out_at is not None and sv not in ("holiday", "weekly_off"):
            worked_total += rec.worked_minutes or 0
            worked_days += 1
        if rec is not None:
            overtime += rec.overtime_minutes or 0
            approved_overtime += int(float(rec.overtime_authorized_hours or 0) * 60)
        days.append({
            "date": day.isoformat(), "status": sv, "weekday": day.strftime("%a").lower(), "future": future,
            "holiday": day in holidays, "working_day": working and employed,
            "leave_type": leaves[day].leave_type if day in leaves else None,
            "check_in_at": clock.iso_utc(rec.check_in_at) if rec else None,
            "check_out_at": clock.iso_utc(rec.check_out_at) if rec else None,
            "check_in": rec.check_in.strftime("%H:%M") if rec and rec.check_in else None,
            "check_out": rec.check_out.strftime("%H:%M") if rec and rec.check_out else None,
            "worked_minutes": rec.worked_minutes if rec else 0, "break_minutes": rec.break_minutes if rec else 0,
            "late_minutes": rec.late_minutes if rec else 0, "overtime_minutes": rec.overtime_minutes if rec else 0,
            "breaks": len(breaks.get(rec.id, [])) if rec else 0, "source": rec.source if rec else None,
            "shift": shift.name if shift else None, "record_id": rec.id if rec else None,
        })
        day += timedelta(days=1)

    # attendance %: attended working days / working days you were expected (approved leave excused); work on a weekly
    # off or holiday is not attendance (it shows as time beyond the standard day). punctuality %: on-time punch-ins /
    # punch-ins on working days (leave without a punch is not "on time").
    expected = kpi["working_days"] - leave_days
    kpis = {
        **kpi,
        "expected_days": expected,
        "attended_days": attended,
        "attendance_rate": round(100 * attended / expected) if expected > 0 else None,
        "punched_days": punched_days, "on_time_days": on_time_days,
        "punctuality_rate": round(100 * on_time_days / punched_days) if punched_days else None,
        "avg_worked_minutes": round(worked_total / worked_days) if worked_days else 0,
        "overtime_minutes": overtime,
        "approved_overtime_minutes": approved_overtime,
    }
    return {"month": start.strftime("%Y-%m"), "timezone": tz.key, "today": today.isoformat(), "days": days, "kpis": kpis,
            "policy": {"grace_minutes": pol.grace_minutes, "half_day_min_minutes": pol.half_day_min_minutes,
                       "min_present_minutes": pol.min_present_minutes,
                       "standard_minutes": pol.standard_minutes, "working_days": list(pol.working_days)}}


def day_detail(db: Session, employee, day: date) -> dict:
    now = clock.utcnow()
    tz, pol = tz_of(db, employee), policy_mod.get_policy(db, employee.organization_id)
    rec = (db.query(AttendanceRecord)
           .filter(AttendanceRecord.organization_id == employee.organization_id, AttendanceRecord.employee_id == employee.id,
                   AttendanceRecord.date == day, AttendanceRecord.is_deleted.isnot(True))
           .order_by(AttendanceRecord.id.desc()).first())
    out = serialize_day(db, rec, employee, day=day, tz=tz, pol=pol, now=now)
    if rec is None:                                      # same status the calendar shows for this date
        org = employee.organization_id
        status = computed_status(employee, day, clock.work_date_for(now, tz),
                                 shift=policy_mod.shift_for(db, org, employee.id, day, pol),
                                 holiday=day in policy_mod.holidays_in_range(db, org, day, day),
                                 leave=policy_mod.leaves_in_range(db, org, employee.id, day, day).get(day), pol=pol)
        out["status"] = _status_value(status)
    out["notes"] = rec.notes if rec else None
    out["history"] = [] if rec is None else [
        {"action": a.action, "at": clock.iso_utc(a.created_at), "by_self": a.actor_id == employee.id,
         "actor_type": a.actor_type, "reason": a.reason, "source": a.source}
        for a in (db.query(AttendanceAuditLog)
                  .filter(AttendanceAuditLog.organization_id == employee.organization_id,
                          AttendanceAuditLog.employee_id == employee.id, AttendanceAuditLog.work_date == day)
                  .order_by(AttendanceAuditLog.id).all())]
    return out
