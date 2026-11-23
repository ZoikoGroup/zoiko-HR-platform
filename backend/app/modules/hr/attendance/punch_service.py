"""Self-service punching (attendance plan M2): punch in, punch out, breaks, and "today".

Rules:
* One live record per person per work date (the unique index once migrated; checked here with a row lock on PostgreSQL).
* The work date is the local date of the punch-in (employee time zone, else organization, else UTC).
* Punch-out closes the open record even after midnight (night shifts), up to MAX_SHIFT_MINUTES after the punch-in.
* A double click on Punch In within DOUBLE_CLICK_SECONDS returns the existing day instead of an error.
* Every change recomputes status and minutes (status_engine) and writes an attendance_audit_log entry.
"""
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.hr.attendance import audit, clock, errors, policy as policy_mod
from app.modules.hr.attendance.constants import (ERR_ALREADY_IN, ERR_ALREADY_OUT, ERR_DAY_CLOSED, ERR_LOCKED, ERR_NOT_IN,
                                                 ERR_NOT_ON_BREAK, ERR_ON_BREAK, ERR_PUNCH_DISABLED, MAX_SHIFT_MINUTES)
from app.modules.hr.attendance.models import AttendanceBreak
from app.modules.hr.attendance.status_engine import DayContext, resolve
from app.modules.hr.models import AttendanceRecord, AttendanceStatus, Organization

DOUBLE_CLICK_SECONDS = 120


# ── helpers ────────────────────────────────────────────────────────────────────────────────────────────────────────

def _org(db: Session, organization_id: int) -> Optional[Organization]:
    return db.get(Organization, organization_id)


def tz_of(db: Session, employee) -> "clock.ZoneInfo":
    return clock.tz_for(employee, _org(db, employee.organization_id))


def _live(db: Session, organization_id: int):
    return db.query(AttendanceRecord).filter(AttendanceRecord.organization_id == organization_id,
                                             AttendanceRecord.is_deleted.isnot(True))


def _lock(db: Session, query):
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        query = query.with_for_update()
    return query


def record_for_day(db: Session, employee, day: date, *, lock: bool = False) -> Optional[AttendanceRecord]:
    q = _live(db, employee.organization_id).filter(AttendanceRecord.employee_id == employee.id, AttendanceRecord.date == day)
    if lock:
        q = _lock(db, q)
    return q.order_by(AttendanceRecord.id.desc()).first()


def open_record(db: Session, employee, now: datetime, *, lock: bool = False) -> Optional[AttendanceRecord]:
    """The record still waiting for a punch-out (possibly yesterday's, for a night shift). A day the end-of-day job has
    already closed as a missed punch-out is not open any more: it is fixed through a correction, never a late punch-out."""
    from sqlalchemy import or_
    q = (_live(db, employee.organization_id)
         .filter(AttendanceRecord.employee_id == employee.id, AttendanceRecord.check_in_at.isnot(None),
                 AttendanceRecord.check_out_at.is_(None),
                 or_(AttendanceRecord.status.is_(None), AttendanceRecord.status != AttendanceStatus.MISSED_PUNCH),
                 AttendanceRecord.check_in_at >= now - timedelta(minutes=MAX_SHIFT_MINUTES)))
    if lock:
        q = _lock(db, q)
    return q.order_by(AttendanceRecord.check_in_at.desc()).first()


def breaks_of(db: Session, record: AttendanceRecord) -> list:
    if record is None or record.id is None:
        return []
    return (db.query(AttendanceBreak).filter(AttendanceBreak.attendance_id == record.id)
            .order_by(AttendanceBreak.start_at).all())


def open_break(db: Session, record: AttendanceRecord) -> Optional[AttendanceBreak]:
    return next((b for b in reversed(breaks_of(db, record)) if b.end_at is None), None)


def recompute(db: Session, record: AttendanceRecord, employee, *, pol=None, now: Optional[datetime] = None,
              day_closed: bool = False, tz=None) -> AttendanceRecord:
    """Status and minute totals from the record's punches, breaks, shift, holiday and leave. A locked status stays."""
    pol = pol or policy_mod.get_policy(db, record.organization_id)
    tz = tz or tz_of(db, employee)
    day = record.date
    # a record from before the attendance engine (or a database not yet migrated) has only wall-clock times:
    # derive the instants the same way the backfill does, so the rules see the punches
    if record.check_in_at is None and record.check_in is not None:
        record.check_in_at = clock.to_utc(record.check_in, tz)
    if record.check_out_at is None and record.check_out is not None:
        record.check_out_at = clock.to_utc(record.check_out, tz)
    shift = policy_mod.shift_for(db, record.organization_id, employee.id, day, pol)
    ctx = DayContext(
        work_date=day, employed=policy_mod.employed_on(employee, day),
        holiday=policy_mod.is_holiday(db, record.organization_id, day),
        working_day=policy_mod.is_working_day(pol, shift, day),
        leave=policy_mod.approved_leave_on(db, record.organization_id, employee.id, day),
        shift=shift, grace_minutes=pol.grace_minutes, standard_minutes=pol.standard_minutes,
        half_day_min_minutes=pol.half_day_min_minutes, min_present_minutes=pol.min_present_minutes,
        check_in_local=clock.to_local(record.check_in_at, tz), check_out_local=clock.to_local(record.check_out_at, tz),
        check_in_utc=record.check_in_at, check_out_utc=record.check_out_at,
        breaks_utc=[(b.start_at, b.end_at) for b in breaks_of(db, record)],
        day_closed=day_closed, locked_status=record.status if record.status_locked else None,
        now_utc=now or clock.utcnow())
    res = resolve(ctx)
    if res.status is not None:
        record.status = res.status
    record.shift_id = shift.shift_id if shift else None
    record.late_minutes, record.worked_minutes = res.late_minutes, res.worked_minutes
    record.break_minutes, record.overtime_minutes = res.break_minutes, res.overtime_minutes
    # the existing dashboard, analytics and exports read total_hours: keep it in step once the day has an end
    record.total_hours = round(res.worked_minutes / 60, 2) if record.check_out_at else None
    record.work_date_tz = tz.key
    return record


def _shift_payload(shift, day: date, tz) -> Optional[dict]:
    if shift is None:
        return None
    return {"id": shift.shift_id, "name": shift.name, "start": "%02d:%02d" % shift.start, "end": "%02d:%02d" % shift.end,
            "grace_minutes": shift.grace_minutes, "break_minutes": shift.break_minutes,
            "standard_minutes": shift.standard_minutes, "crosses_midnight": shift.crosses_midnight,
            "expected_end": clock.iso_utc(clock.to_utc(shift.end_on(day), tz))}


def is_running(record: Optional[AttendanceRecord], now: datetime) -> bool:
    """Still being worked: punched in, not out, within the longest allowed shift, and not closed as a missed punch-out.
    Only such a day gets live totals; an old open day keeps its stored totals (it never grows to 52 hours)."""
    if record is None or record.check_in_at is None or record.check_out_at is not None:
        return False
    if getattr(record.status, "value", record.status) == AttendanceStatus.MISSED_PUNCH.value:
        return False
    return record.check_in_at >= now - timedelta(minutes=MAX_SHIFT_MINUTES)


def serialize_day(db: Session, record: Optional[AttendanceRecord], employee, *, day: date, tz, pol, now: datetime) -> dict:
    shift = policy_mod.shift_for(db, employee.organization_id, employee.id, day, pol)
    breaks = breaks_of(db, record)
    running = is_running(record, now)
    worked, taken = record.worked_minutes if record else 0, record.break_minutes if record else 0
    if running:                                          # live totals for the timer
        from app.modules.hr.attendance.status_engine import compute_minutes
        worked, taken = compute_minutes(record.check_in_at, None, [(b.start_at, b.end_at) for b in breaks], now_utc=now)
    on_break = any(b.end_at is None for b in breaks)
    status = getattr(record.status, "value", record.status) if record else None
    return {
        "date": day.isoformat(), "timezone": tz.key, "status": status,
        "as_of": clock.iso_utc(now),                     # the server time the live totals were taken at (the timer's base)
        "check_in_at": clock.iso_utc(record.check_in_at) if record else None,
        "check_out_at": clock.iso_utc(record.check_out_at) if record else None,
        "worked_minutes": worked, "break_minutes": taken,
        "late_minutes": record.late_minutes if record else 0, "overtime_minutes": record.overtime_minutes if record else 0,
        "on_break": on_break, "running": running, "source": record.source if record else None,
        "breaks": [{"start_at": clock.iso_utc(b.start_at), "end_at": clock.iso_utc(b.end_at)} for b in breaks],
        "shift": _shift_payload(shift, day, tz),
        "punch_enabled": pol.allow_web_punch,
        "can_punch_in": pol.allow_web_punch and (record is None or record.check_in_at is None) and not (record and record.status_locked),
        "can_punch_out": running, "can_start_break": running and not on_break, "can_end_break": running and on_break,
        "record_id": record.id if record else None,
    }


# ── public API ─────────────────────────────────────────────────────────────────────────────────────────────────────

def today(db: Session, employee, now: Optional[datetime] = None) -> dict:
    now = now or clock.utcnow()
    tz, pol = tz_of(db, employee), policy_mod.get_policy(db, employee.organization_id)
    record = open_record(db, employee, now) or record_for_day(db, employee, clock.work_date_for(now, tz))
    day = record.date if record is not None else clock.work_date_for(now, tz)
    return serialize_day(db, record, employee, day=day, tz=tz, pol=pol, now=now)


def punch_in(db: Session, employee, *, source: str = "web", ctx=None, now: Optional[datetime] = None) -> dict:
    now = now or clock.utcnow()
    tz, pol = tz_of(db, employee), policy_mod.get_policy(db, employee.organization_id)
    if source == "web" and not pol.allow_web_punch:
        raise errors.forbidden(ERR_PUNCH_DISABLED, "Punching in from the browser is turned off for your organization. Ask HR.")
    running = open_record(db, employee, now)
    if running is not None:
        if (now - running.check_in_at).total_seconds() <= DOUBLE_CLICK_SECONDS:
            out = serialize_day(db, running, employee, day=running.date, tz=tz, pol=pol, now=now)
            return {**out, "already": True}
        raise errors.conflict(ERR_ALREADY_IN, "You are already punched in.")
    day = clock.work_date_for(now, tz)
    if not policy_mod.employed_on(employee, day):
        raise errors.invalid("You can punch in from your joining date.")
    record = record_for_day(db, employee, day, lock=True)
    if record is not None and (record.check_in_at is not None or record.check_in is not None):
        raise errors.conflict(ERR_DAY_CLOSED, "You have already punched in and out today. Ask HR or request a correction to change it.")
    if record is not None and record.status_locked:
        raise errors.conflict(ERR_LOCKED, "HR has set today's attendance. Ask HR to change it.")
    before = audit.snapshot(record) if record is not None else None
    if record is None:
        record = AttendanceRecord(employee_id=employee.id, organization_id=employee.organization_id, date=day,
                                  status=AttendanceStatus.PRESENT, created_by=employee.id, is_deleted=False)
        db.add(record)
    record.check_in_at = now.replace(microsecond=0)
    record.check_in = clock.to_local(record.check_in_at, tz)
    record.source, record.updated_by = source, employee.id
    recompute(db, record, employee, pol=pol, now=now, tz=tz)
    try:
        db.flush()
    except IntegrityError:                               # a racing punch-in created the day first
        db.rollback()
        raise errors.conflict(ERR_ALREADY_IN, "You are already punched in.")
    audit.record(db, organization_id=record.organization_id, employee_id=employee.id, work_date=day, action="punch_in",
                 attendance_id=record.id, actor=employee, source=source, before=before, after=audit.snapshot(record), ctx=ctx)
    db.commit()
    return serialize_day(db, record, employee, day=day, tz=tz, pol=pol, now=now)


def punch_out(db: Session, employee, *, note: Optional[str] = None, source: str = "web", ctx=None,
              now: Optional[datetime] = None) -> dict:
    now = now or clock.utcnow()
    tz, pol = tz_of(db, employee), policy_mod.get_policy(db, employee.organization_id)
    record = open_record(db, employee, now, lock=True)
    if record is None:
        done = record_for_day(db, employee, clock.work_date_for(now, tz))
        if done is not None and done.check_out_at is not None:
            raise errors.conflict(ERR_ALREADY_OUT, "You have already punched out today.")
        raise errors.conflict(ERR_NOT_IN, "You are not punched in.")
    before = audit.snapshot(record)
    running_break = open_break(db, record)
    if running_break is not None:                        # punching out ends the break
        running_break.end_at = now.replace(microsecond=0)
    record.check_out_at = max(now.replace(microsecond=0), record.check_in_at)
    record.check_out = clock.to_local(record.check_out_at, tz)
    if note and note.strip():
        record.notes = (f"{record.notes}\n" if record.notes else "") + note.strip()[:1000]
    record.updated_by = employee.id
    recompute(db, record, employee, pol=pol, now=now, tz=tz)
    audit.record(db, organization_id=record.organization_id, employee_id=employee.id, work_date=record.date, action="punch_out",
                 attendance_id=record.id, actor=employee, source=source, before=before, after=audit.snapshot(record), ctx=ctx)
    db.commit()
    return serialize_day(db, record, employee, day=record.date, tz=tz, pol=pol, now=now)


def break_start(db: Session, employee, *, source: str = "web", ctx=None, now: Optional[datetime] = None) -> dict:
    now = now or clock.utcnow()
    tz, pol = tz_of(db, employee), policy_mod.get_policy(db, employee.organization_id)
    record = open_record(db, employee, now, lock=True)
    if record is None:
        raise errors.conflict(ERR_NOT_IN, "Punch in before starting a break.")
    if open_break(db, record) is not None:
        raise errors.conflict(ERR_ON_BREAK, "You are already on a break.")
    db.add(AttendanceBreak(organization_id=record.organization_id, attendance_id=record.id, start_at=now.replace(microsecond=0),
                           source=source))
    db.flush()
    audit.record(db, organization_id=record.organization_id, employee_id=employee.id, work_date=record.date, action="break_start",
                 attendance_id=record.id, actor=employee, source=source, after={"start_at": clock.iso_utc(now.replace(microsecond=0))},
                 ctx=ctx)
    db.commit()
    return serialize_day(db, record, employee, day=record.date, tz=tz, pol=pol, now=now)


def break_end(db: Session, employee, *, source: str = "web", ctx=None, now: Optional[datetime] = None) -> dict:
    now = now or clock.utcnow()
    tz, pol = tz_of(db, employee), policy_mod.get_policy(db, employee.organization_id)
    record = open_record(db, employee, now, lock=True)
    running_break = open_break(db, record) if record is not None else None
    if running_break is None:
        raise errors.conflict(ERR_NOT_ON_BREAK, "You are not on a break.")
    running_break.end_at = max(now.replace(microsecond=0), running_break.start_at)
    recompute(db, record, employee, pol=pol, now=now, tz=tz)
    audit.record(db, organization_id=record.organization_id, employee_id=employee.id, work_date=record.date, action="break_end",
                 attendance_id=record.id, actor=employee, source=source,
                 after={"start_at": clock.iso_utc(running_break.start_at), "end_at": clock.iso_utc(running_break.end_at)}, ctx=ctx)
    db.commit()
    return serialize_day(db, record, employee, day=record.date, tz=tz, pol=pol, now=now)
