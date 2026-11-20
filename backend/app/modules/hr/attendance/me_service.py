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
from app.modules.hr.models import AttendanceRecord, AttendanceStatus as S

ON_TIME = {S.PRESENT, S.REMOTE}


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
    day = start
    while day <= end:
        rec = records.get(day)
        shift = shifts.get(day)
        employed = policy_mod.employed_on(employee, day)
        working = policy_mod.is_working_day(pol, shift, day)
        future = day > today
        if rec is not None:
            status = rec.status
        elif not employed or future:
            status = None
        else:
            status = resolve(DayContext(work_date=day, holiday=day in holidays, working_day=working, leave=leaves.get(day),
                                        shift=shift, day_closed=day < today)).status
        sv = _status_value(status)
        if employed and not future and day not in holidays and working:
            kpi["working_days"] += 1
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

    attended = kpi["present"] + kpi["late"] + kpi["remote"] + kpi["half_day"] * 0.5
    arrivals = kpi["present"] + kpi["late"] + kpi["remote"]
    kpis = {
        **kpi,
        "attended_days": attended,
        "attendance_rate": round(100 * attended / kpi["working_days"]) if kpi["working_days"] else None,
        "punctuality_rate": round(100 * (kpi["present"] + kpi["remote"]) / arrivals) if arrivals else None,
        "avg_worked_minutes": round(worked_total / worked_days) if worked_days else 0,
        "overtime_minutes": overtime,
        "approved_overtime_minutes": approved_overtime,
    }
    return {"month": start.strftime("%Y-%m"), "timezone": tz.key, "today": today.isoformat(), "days": days, "kpis": kpis,
            "policy": {"grace_minutes": pol.grace_minutes, "half_day_min_minutes": pol.half_day_min_minutes,
                       "standard_minutes": pol.standard_minutes, "working_days": list(pol.working_days)}}


def day_detail(db: Session, employee, day: date) -> dict:
    now = clock.utcnow()
    tz, pol = tz_of(db, employee), policy_mod.get_policy(db, employee.organization_id)
    rec = (db.query(AttendanceRecord)
           .filter(AttendanceRecord.organization_id == employee.organization_id, AttendanceRecord.employee_id == employee.id,
                   AttendanceRecord.date == day, AttendanceRecord.is_deleted.isnot(True))
           .order_by(AttendanceRecord.id.desc()).first())
    out = serialize_day(db, rec, employee, day=day, tz=tz, pol=pol, now=now)
    out["notes"] = rec.notes if rec else None
    out["history"] = [] if rec is None else [
        {"action": a.action, "at": clock.iso_utc(a.created_at), "by_self": a.actor_id == employee.id,
         "actor_type": a.actor_type, "reason": a.reason, "source": a.source}
        for a in (db.query(AttendanceAuditLog)
                  .filter(AttendanceAuditLog.organization_id == employee.organization_id,
                          AttendanceAuditLog.employee_id == employee.id, AttendanceAuditLog.work_date == day)
                  .order_by(AttendanceAuditLog.id).all())]
    return out
