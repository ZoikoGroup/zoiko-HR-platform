"""End-of-day close (attendance plan M8): once a work day is over for everyone in the organization (00:30 the next
morning in each person's own time zone, so night shifts and late punch-outs finish first, and nobody working in a later
time zone is closed mid-shift), every person employed that day gets a final, stored status:

    no record, working day, no leave  -> ABSENT
    approved leave                    -> ON_LEAVE (work-from-home leave: REMOTE)
    holiday / not a working day       -> HOLIDAY / WEEKLY_OFF
    punched in, never out             -> MISSED_PUNCH (0 hours; the person is told once, unless a correction is pending)
    a complete day                    -> totals and status recomputed one last time

Safety:
* nothing is deleted; new rows are source="system", auto_marked=True; an HR-locked status is never changed
* only organizations that use attendance (any record in the last 30 days) are closed; an organization's first run closes
  just the latest day, later runs catch up gaps of up to CATCH_UP_DAYS
* each closed (organization, day) is recorded in attendance_day_closures, so running again changes nothing
* every row created or changed gets an attendance_audit_log entry (actor_type="system", action="auto_marked")
* a fixed number of queries per organization and day, whatever the headcount
"""
import logging
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from types import SimpleNamespace
from typing import Optional

from sqlalchemy.orm import Session

from app.modules.employee.models import Employee
from app.modules.hr.attendance import audit, clock, policy as policy_mod
from app.modules.hr.attendance.models import AttendanceBreak, AttendanceDayClosure
from app.modules.hr.attendance.status_engine import DayContext, LeaveInfo, resolve
from app.modules.hr.models import (AttendanceCorrectionRequest, AttendanceRecord, AttendanceStatus as S, EmployeeLifecycle,
                                   Organization)

logger = logging.getLogger("zoiko.attendance.day_close")

CLOSE_AFTER = time(0, 30)          # local time on the next morning
CATCH_UP_DAYS = 7
IN_USE_WINDOW_DAYS = 30
INACTIVE = {"terminated", "resigned", "inactive", "exited", "deactivated"}


@dataclass
class DayCloseResult:
    work_date: date
    written: int = 0
    updated: int = 0
    missed_punches: int = 0
    skipped_locked: int = 0
    notified: list = field(default_factory=list)


def _tz(db: Session, org: int):
    return clock.tz_for(None, db.get(Organization, org))


def last_closable_day(local_now: datetime) -> date:
    """The most recent day that is over: yesterday once it is past 00:30 local, otherwise the day before."""
    back = 1 if local_now.time() >= CLOSE_AFTER else 2
    return local_now.date() - timedelta(days=back)


def uses_attendance(db: Session, org: int, today: date) -> bool:
    return db.query(AttendanceRecord.id).filter(AttendanceRecord.organization_id == org,
                                                AttendanceRecord.date >= today - timedelta(days=IN_USE_WINDOW_DAYS)).first() is not None


def _zones(db: Session, org: int) -> list:
    """The organization's time zone plus every distinct personal time zone of its people (B7)."""
    organization = db.get(Organization, org)
    zones = {clock.tz_for(None, organization)}
    for (name,) in (db.query(Employee.timezone).filter(Employee.organization_id == org, Employee.timezone.isnot(None))
                    .distinct()):
        zones.add(clock.tz_for(SimpleNamespace(timezone=name), organization))
    return sorted(zones, key=lambda z: z.key)


def closable_days(db: Session, org: int, now_utc: datetime) -> list[date]:
    tz = _tz(db, org)
    local_now = clock.to_local(now_utc, tz)
    # a day closes only once it is over in every time zone the organization's people work in (B7): the latest zone decides
    last = min(last_closable_day(clock.to_local(now_utc, z)) for z in _zones(db, org))
    if not uses_attendance(db, org, local_now.date()):
        return []
    closed = {d for (d,) in db.query(AttendanceDayClosure.work_date).filter(AttendanceDayClosure.organization_id == org,
                                                                             AttendanceDayClosure.work_date >= last - timedelta(days=CATCH_UP_DAYS))}
    from sqlalchemy import func
    first = db.query(func.min(AttendanceDayClosure.work_date)).filter(AttendanceDayClosure.organization_id == org).scalar()
    if first is None:                                  # first run for this organization: only the latest finished day
        return [] if last in closed else [last]
    # catch up gaps, but never before the first day this organization was closed (no retroactive absences)
    days = (last - timedelta(days=i) for i in range(CATCH_UP_DAYS - 1, -1, -1))
    return [d for d in days if d >= first and d not in closed]


def _people(db: Session, org: int, day: date) -> list:
    """Everyone employed on `day`: active people who had joined, and people who left on or after it."""
    exits = dict(db.query(EmployeeLifecycle.employee_id, EmployeeLifecycle.event_date)
                 .filter(EmployeeLifecycle.organization_id == org, EmployeeLifecycle.event_type == "exit").all())
    out = []
    for e in db.query(Employee).filter(Employee.organization_id == org).all():
        left = str(getattr(e.status, "value", e.status) or "").lower() in INACTIVE or e.is_active is False
        exit_date = exits.get(e.id)
        if left and (exit_date is None or exit_date < day):
            continue
        if policy_mod.employed_on(e, day, exit_date if left else None):
            out.append(e)
    return out


def _leaves(db: Session, org: int, ids: list, day: date) -> dict:
    from app.modules.hr.models import LeaveRequest, RequestStatus
    out = {}
    for lv in (db.query(LeaveRequest).filter(LeaveRequest.organization_id == org, LeaveRequest.employee_id.in_(ids or [-1]),
                                             LeaveRequest.status.in_([RequestStatus.APPROVED, RequestStatus.COMPLETED]),
                                             LeaveRequest.start_date <= day, LeaveRequest.end_date >= day).order_by(LeaveRequest.id)):
        half = bool((lv.details or {}).get("half_day")) if isinstance(lv.details, dict) else False
        out[lv.employee_id] = LeaveInfo(leave_type=str(getattr(lv.leave_type, "value", lv.leave_type)), half_day=half)
    return out


def _apply(rec: AttendanceRecord, res, shift, tz) -> None:
    if res.status is not None:
        rec.status = res.status
    rec.shift_id = shift.shift_id if shift else None
    rec.late_minutes, rec.worked_minutes = res.late_minutes, res.worked_minutes
    rec.break_minutes, rec.overtime_minutes = res.break_minutes, res.overtime_minutes
    rec.total_hours = round(res.worked_minutes / 60, 2) if rec.check_out_at else None
    rec.work_date_tz = tz.key


def close_day(db: Session, org: int, day: date, *, now_utc: Optional[datetime] = None) -> DayCloseResult:
    from app.modules.hr.attendance.dashboard_today import _shifts_on
    now_utc = now_utc or clock.utcnow()
    organization = db.get(Organization, org)
    pol = policy_mod.get_policy(db, org)
    people = _people(db, org, day)
    ids = [p.id for p in people]
    records = {}
    for r in (db.query(AttendanceRecord).filter(AttendanceRecord.organization_id == org, AttendanceRecord.employee_id.in_(ids or [-1]),
                                                AttendanceRecord.date == day, AttendanceRecord.is_deleted.isnot(True))
              .order_by(AttendanceRecord.id)):
        records[r.employee_id] = r
    breaks: dict = {}
    for b in db.query(AttendanceBreak).filter(AttendanceBreak.attendance_id.in_([r.id for r in records.values()] or [-1])):
        breaks.setdefault(b.attendance_id, []).append((b.start_at, b.end_at))
    leaves = _leaves(db, org, ids, day)
    holiday = policy_mod.is_holiday(db, org, day)
    shifts = _shifts_on(db, org, people, day, pol)
    pending = {e for (e,) in db.query(AttendanceCorrectionRequest.employee_id)
               .filter(AttendanceCorrectionRequest.organization_id == org, AttendanceCorrectionRequest.date == day,
                       AttendanceCorrectionRequest.status == "PENDING")}
    result = DayCloseResult(work_date=day)
    for emp in people:
        tz = clock.tz_for(emp, organization)              # each person's punches are read in their own time zone (B7)
        shift = shifts.get(emp.id)
        rec = records.get(emp.id)
        if rec is not None:
            if rec.check_in_at is None and rec.check_in is not None:      # legacy wall-clock only
                rec.check_in_at = clock.to_utc(rec.check_in, tz)
            if rec.check_out_at is None and rec.check_out is not None:
                rec.check_out_at = clock.to_utc(rec.check_out, tz)
            if rec.check_in_at is not None and rec.check_out_at is None and not pol.auto_close_punch_out:
                continue                                                  # the organization closes missed punches by hand
        ctx = DayContext(
            work_date=day, employed=True, holiday=holiday, working_day=policy_mod.is_working_day(pol, shift, day),
            leave=leaves.get(emp.id), shift=shift, grace_minutes=pol.grace_minutes, standard_minutes=pol.standard_minutes,
            half_day_min_minutes=pol.half_day_min_minutes, min_present_minutes=pol.min_present_minutes, day_closed=True,
            check_in_local=clock.to_local(rec.check_in_at, tz) if rec else None,
            check_out_local=clock.to_local(rec.check_out_at, tz) if rec else None,
            check_in_utc=rec.check_in_at if rec else None, check_out_utc=rec.check_out_at if rec else None,
            breaks_utc=breaks.get(rec.id, []) if rec else [],
            locked_status=rec.status if rec is not None and rec.status_locked else None, now_utc=now_utc)
        res = resolve(ctx)
        if rec is None:
            if res.status is None:
                continue
            rec = AttendanceRecord(employee_id=emp.id, organization_id=org, date=day, status=res.status, source="system",
                                   auto_marked=True, is_deleted=False, notes=None)
            _apply(rec, res, shift, tz)
            db.add(rec)
            db.flush()
            audit.record(db, organization_id=org, employee_id=emp.id, work_date=day, action="auto_marked", attendance_id=rec.id,
                         actor_type="system", source="system", after=audit.snapshot(rec), reason=_why(res.status))
            result.written += 1
            continue
        before = audit.snapshot(rec)
        was = rec.status
        _apply(rec, res, shift, tz)
        b, a = audit.changed(before, audit.snapshot(rec))
        if rec.status_locked:
            result.skipped_locked += 1
        if a:
            rec.auto_marked = True if rec.status != was else rec.auto_marked
            audit.record(db, organization_id=org, employee_id=emp.id, work_date=day, action="auto_marked", attendance_id=rec.id,
                         actor_type="system", source="system", before=b, after=a, reason=_why(rec.status, recomputed=True))
            result.updated += 1
        if rec.status == S.MISSED_PUNCH:
            result.missed_punches += 1
            if was != S.MISSED_PUNCH and emp.id not in pending:
                result.notified.append(emp.id)
    db.add(AttendanceDayClosure(organization_id=org, work_date=day, closed_at=now_utc, records_written=result.written,
                                records_updated=result.updated, missed_punches=result.missed_punches))
    db.flush()
    if result.notified:
        from app.modules.hr.hr_notifications import notify_employee
        notify_employee(db, org, result.notified, "attendance.missed_punch", date=day, link="/employee/ess/attendance", commit=False)
    return result


def _why(status, recomputed: bool = False) -> str:
    text = {S.ABSENT: "no punch on a working day", S.ON_LEAVE: "approved leave", S.REMOTE: "approved work from home",
            S.HOLIDAY: "holiday", S.WEEKLY_OFF: "not a working day", S.MISSED_PUNCH: "punched in but never out",
            S.HALF_DAY: "worked less than the half-day threshold", S.LATE: "checked in after the grace period",
            S.PRESENT: "complete day"}.get(status, "day closed")
    return f"Day closed: {'totals recalculated, ' if recomputed else ''}{text}."


def close_due_days(db: Session, org: int, now_utc: datetime) -> list[DayCloseResult]:
    out = []
    for day in closable_days(db, org, now_utc):
        out.append(close_day(db, org, day, now_utc=now_utc))
    return out


def last_closure(db: Session, org: int) -> Optional[dict]:
    row = (db.query(AttendanceDayClosure).filter(AttendanceDayClosure.organization_id == org)
           .order_by(AttendanceDayClosure.work_date.desc()).first())
    if row is None:
        return None
    return {"date": row.work_date.isoformat(), "missed_punches": row.missed_punches, "closed_at": clock.iso_utc(row.closed_at)}
