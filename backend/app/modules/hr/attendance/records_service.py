"""Admin attendance log (attendance plan M5): server-side filters, date presets and paging; add / edit with a required
reason; soft delete with a reason; the per-record audit trail.

Visibility: Org Admin / HR Admin see the organization; a manager sees themselves and their reports; everyone else only
themselves (attendance_service.viewer_scope). Writes are for Admin / HR Admin (the router guards them).
Every write records an attendance_audit_log entry with the before / after values and the reason.
"""
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import asc, desc, or_
from sqlalchemy.orm import Session

from app.core.pagination import Page
from app.modules.employee.models import Employee
from app.modules.hr.attendance import audit, clock, errors, policy as policy_mod
from app.modules.hr.attendance.constants import ERR_EXISTS, ERR_LOCKED, MAX_SHIFT_MINUTES
from app.modules.hr.attendance.models import AttendanceAuditLog, AttendanceBreak
from app.modules.hr.attendance.punch_service import recompute, tz_of
from app.modules.hr.models import AttendanceRecord, AttendanceStatus, Department

PRESETS = ("today", "yesterday", "this_week", "this_month", "last_month")
SORTS = {"date": AttendanceRecord.date, "status": AttendanceRecord.status, "worked": AttendanceRecord.worked_minutes,
         "late": AttendanceRecord.late_minutes, "check_in": AttendanceRecord.check_in_at}


@dataclass
class RecordFilter:
    page: int = 1
    per_page: int = 25
    search: Optional[str] = None
    status: Optional[str] = None
    department_id: Optional[int] = None
    department: Optional[str] = None          # legacy: a department name
    source: Optional[str] = None
    employee_id: Optional[int] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    preset: Optional[str] = None
    sort_by: str = "date"
    sort_order: str = "desc"


def preset_range(preset: str, today: date) -> tuple[date, date]:
    if preset == "today":
        return today, today
    if preset == "yesterday":
        y = today - timedelta(days=1)
        return y, y
    if preset == "this_week":
        start = today - timedelta(days=today.weekday())
        return start, today
    if preset == "this_month":
        return today.replace(day=1), today
    if preset == "last_month":
        end = today.replace(day=1) - timedelta(days=1)
        return end.replace(day=1), end
    raise errors.invalid(f"preset must be one of {', '.join(PRESETS)}.", field="preset")


def _org_today(db: Session, organization_id: int) -> date:
    from app.modules.hr.models import Organization
    return clock.local_today(clock.tz_for(None, db.get(Organization, organization_id)))


def base_query(db: Session, actor, f: RecordFilter):
    from app.modules.hr.attendance_service import viewer_scope
    org = actor.organization_id
    q = (db.query(AttendanceRecord, Employee, Department)
         .join(Employee, Employee.id == AttendanceRecord.employee_id)
         .outerjoin(Department, Department.id == Employee.department_id)
         .filter(AttendanceRecord.organization_id == org, AttendanceRecord.is_deleted.isnot(True)))
    scope = viewer_scope(db, actor)
    if scope is not None:
        q = q.filter(AttendanceRecord.employee_id.in_(list(scope) or [-1]))
    if f.preset:
        f.date_from, f.date_to = preset_range(f.preset, _org_today(db, org))
    if f.date_from and f.date_to and f.date_to < f.date_from:
        raise errors.invalid("The end date is before the start date.", field="date_to")
    if f.date_from:
        q = q.filter(AttendanceRecord.date >= f.date_from)
    if f.date_to:
        q = q.filter(AttendanceRecord.date <= f.date_to)
    if f.status:
        try:
            q = q.filter(AttendanceRecord.status == AttendanceStatus(f.status))
        except ValueError:
            raise errors.invalid("Unknown status.", field="status")
    if f.department_id:
        q = q.filter(Employee.department_id == f.department_id)
    elif f.department:
        q = q.filter(Department.name == f.department)
    if f.source:
        q = q.filter(AttendanceRecord.source == f.source)
    if f.employee_id:
        q = q.filter(AttendanceRecord.employee_id == f.employee_id)
    if f.search and f.search.strip():
        like = f"%{f.search.strip()}%"
        q = q.filter(or_(Employee.first_name.ilike(like), Employee.last_name.ilike(like), Employee.employee_code.ilike(like),
                         Department.name.ilike(like)))
    return q


def _hhmm(value: Optional[datetime]) -> Optional[str]:
    return value.strftime("%H:%M") if value else None


def serialize(rec: AttendanceRecord, emp: Optional[Employee], dept: Optional[Department]) -> dict:
    return {
        "id": rec.id, "employee_id": rec.employee_id, "employee_name": emp.full_name if emp else None,
        "employee_code": getattr(emp, "employee_code", None), "department": dept.name if dept else None,
        "department_id": dept.id if dept else None, "date": rec.date,
        "status": getattr(rec.status, "value", rec.status), "status_locked": bool(rec.status_locked),
        # wall-clock (the person's local time) and the real instants
        "check_in": rec.check_in, "check_out": rec.check_out,
        "check_in_time": _hhmm(rec.check_in), "check_out_time": _hhmm(rec.check_out),
        "check_in_at": clock.iso_utc(rec.check_in_at), "check_out_at": clock.iso_utc(rec.check_out_at),
        "worked_minutes": rec.worked_minutes or 0, "break_minutes": rec.break_minutes or 0,
        "late_minutes": rec.late_minutes or 0, "overtime_minutes": rec.overtime_minutes or 0,
        "total_hours": float(rec.total_hours) if rec.total_hours is not None else None,
        "source": rec.source or "manual", "auto_marked": bool(rec.auto_marked), "notes": rec.notes,
        "created_at": rec.created_at, "updated_at": rec.updated_at,
    }


def list_records(db: Session, actor, f: RecordFilter) -> dict:
    per_page = max(1, min(f.per_page, 200))
    q = base_query(db, actor, f)
    total = q.count()
    col = SORTS.get(f.sort_by, AttendanceRecord.date)
    order = desc if f.sort_order != "asc" else asc
    rows = (q.order_by(order(col), AttendanceRecord.id.desc()).offset((max(f.page, 1) - 1) * per_page).limit(per_page).all())
    return Page(items=[serialize(r, e, d) for r, e, d in rows], total=total, page=max(f.page, 1), per_page=per_page).model_dump()


def filtered_ids(db: Session, actor, f: RecordFilter) -> list[int]:
    return [r.id for r, _, _ in base_query(db, actor, f).all()]


# ── writes ─────────────────────────────────────────────────────────────────────────────────────────────────────────

def _reason(reason: Optional[str]) -> str:
    text = (reason or "").strip()
    if len(text) < 3:
        raise errors.invalid("Give a reason for this change (it is kept in the record's history).", field="reason")
    return text[:1000]


def _employee(db: Session, organization_id: int, employee_id: int) -> Employee:
    emp = db.query(Employee).filter(Employee.id == employee_id, Employee.organization_id == organization_id).first()
    if emp is None:
        raise errors.not_found("Employee")
    return emp


def _check_lock(db: Session, organization_id: int, day: date) -> None:
    pol = policy_mod.get_policy(db, organization_id)
    if pol.edit_lock_days and day < _org_today(db, organization_id) - timedelta(days=int(pol.edit_lock_days)):
        raise errors.conflict(ERR_LOCKED, f"Attendance older than {pol.edit_lock_days} days can no longer be changed.")


def _as_local(value, day: date) -> Optional[datetime]:
    """A local wall-clock time from the form: "HH:MM" (on the record's day) or an ISO datetime without a zone."""
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    text = str(value).strip()
    hm = clock.parse_hhmm(text) if len(text) <= 5 else None
    if hm:
        return datetime(day.year, day.month, day.day, *hm)
    try:
        return datetime.fromisoformat(text.replace("Z", "")).replace(tzinfo=None)
    except ValueError:
        raise errors.invalid("Use HH:MM or a date and time for check-in / check-out.", field="check_in")


def _apply_times(db: Session, rec: AttendanceRecord, tz, cin_local, cout_local) -> None:
    if cin_local and cout_local and cout_local <= cin_local:
        cout_local += timedelta(days=1)                   # ends after midnight
    if cin_local and cout_local and (cout_local - cin_local) > timedelta(minutes=MAX_SHIFT_MINUTES):
        raise errors.invalid("A working day cannot be longer than 20 hours.", field="check_out")
    if cout_local and not cin_local:
        raise errors.invalid("A check-out needs a check-in.", field="check_in")
    rec.check_in, rec.check_out = cin_local, cout_local
    rec.check_in_at, rec.check_out_at = clock.to_utc(cin_local, tz), clock.to_utc(cout_local, tz)


def _apply_breaks(db: Session, rec: AttendanceRecord, tz, breaks) -> None:
    db.query(AttendanceBreak).filter(AttendanceBreak.attendance_id == rec.id).delete(synchronize_session=False)
    base = rec.check_in
    for b in breaks or []:
        start, stop = _as_local(b.get("start"), rec.date), _as_local(b.get("end"), rec.date)
        if not start or not stop:
            raise errors.invalid("Each break needs a start and an end.", field="breaks")
        if base and start < base:
            start += timedelta(days=1)
        if stop <= start:
            stop += timedelta(days=1)
        db.add(AttendanceBreak(organization_id=rec.organization_id, attendance_id=rec.id, source="manual",
                               start_at=clock.to_utc(start, tz), end_at=clock.to_utc(stop, tz)))
    db.flush()


def _finish(db: Session, rec: AttendanceRecord, emp: Employee, tz, status: Optional[str]) -> None:
    if status:
        try:
            rec.status = AttendanceStatus(status)
        except ValueError:
            raise errors.invalid("Unknown status.", field="status")
        rec.status_locked = True                          # HR decided the status: the engine keeps it
    from app.modules.hr.attendance.constants import NO_TIME
    if rec.status_locked and rec.status in NO_TIME:      # absent / leave / holiday / weekly off carry no times
        rec.check_in = rec.check_out = rec.check_in_at = rec.check_out_at = None
        db.query(AttendanceBreak).filter(AttendanceBreak.attendance_id == rec.id).delete(synchronize_session=False)
    closed = rec.date < clock.local_today(tz) or rec.check_out_at is not None
    recompute(db, rec, emp, day_closed=closed, tz=tz)


def create(db: Session, actor, data: dict, ctx=None) -> dict:
    org = actor.organization_id
    reason = _reason(data.get("reason"))
    emp = _employee(db, org, data["employee_id"])
    day = data["date"]
    if day > _org_today(db, org) + timedelta(days=1):
        raise errors.invalid("Attendance cannot be added for a future date.", field="date")
    if not policy_mod.employed_on(emp, day):
        raise errors.invalid("This date is before the person's joining date.", field="date")
    _check_lock(db, org, day)
    existing = (db.query(AttendanceRecord.id).filter(AttendanceRecord.organization_id == org, AttendanceRecord.employee_id == emp.id,
                                                     AttendanceRecord.date == day, AttendanceRecord.is_deleted.isnot(True)).first())
    if existing:
        raise errors.conflict(ERR_EXISTS, "This person already has a record for that day. Edit it instead.", record_id=existing[0])
    tz = tz_of(db, emp)
    rec = AttendanceRecord(employee_id=emp.id, organization_id=org, date=day, status=AttendanceStatus.PRESENT, source="manual",
                           notes=(data.get("notes") or None), created_by=actor.id, updated_by=actor.id, is_deleted=False)
    db.add(rec)
    _apply_times(db, rec, tz, _as_local(data.get("check_in"), day), _as_local(data.get("check_out"), day))
    db.flush()
    if data.get("breaks"):
        _apply_breaks(db, rec, tz, data["breaks"])
    _finish(db, rec, emp, tz, data.get("status"))
    audit.record(db, organization_id=org, employee_id=emp.id, work_date=day, action="created", attendance_id=rec.id, actor=actor,
                 source="manual", after=audit.snapshot(rec), reason=reason, ctx=ctx)
    db.commit()
    return get_one(db, actor, rec.id)


def update(db: Session, actor, record_id: int, data: dict, ctx=None) -> dict:
    org = actor.organization_id
    reason = _reason(data.get("reason"))
    rec = _record(db, actor, record_id)
    _check_lock(db, org, rec.date)
    emp = _employee(db, org, rec.employee_id)
    tz = tz_of(db, emp)
    before = audit.snapshot(rec)
    if "check_in" in data or "check_out" in data:
        cin = _as_local(data["check_in"], rec.date) if "check_in" in data else rec.check_in
        cout = _as_local(data["check_out"], rec.date) if "check_out" in data else rec.check_out
        _apply_times(db, rec, tz, cin, cout)
    if "breaks" in data and data["breaks"] is not None:
        _apply_breaks(db, rec, tz, data["breaks"])
    if "notes" in data:
        rec.notes = data["notes"] or None
    if data.get("unlock_status"):
        rec.status_locked = False                         # back to the computed status
    rec.updated_by = actor.id
    _finish(db, rec, emp, tz, data.get("status"))
    b, a = audit.changed(before, audit.snapshot(rec))
    audit.record(db, organization_id=org, employee_id=rec.employee_id, work_date=rec.date, action="updated", attendance_id=rec.id,
                 actor=actor, source="manual", before=b, after=a, reason=reason, ctx=ctx)
    db.commit()
    return get_one(db, actor, rec.id)


def soft_delete(db: Session, actor, record_id: int, reason: Optional[str], ctx=None) -> None:
    text = _reason(reason)
    rec = _record(db, actor, record_id)
    _check_lock(db, actor.organization_id, rec.date)
    before = audit.snapshot(rec)
    rec.is_deleted, rec.updated_by = True, actor.id
    audit.record(db, organization_id=rec.organization_id, employee_id=rec.employee_id, work_date=rec.date, action="deleted",
                 attendance_id=rec.id, actor=actor, source="manual", before=before, after={"is_deleted": True}, reason=text, ctx=ctx)
    db.commit()


# ── reads ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def _record(db: Session, actor, record_id: int) -> AttendanceRecord:
    from app.modules.hr.attendance_service import can_view_employee
    rec = (db.query(AttendanceRecord).filter(AttendanceRecord.id == record_id, AttendanceRecord.organization_id == actor.organization_id,
                                             AttendanceRecord.is_deleted.isnot(True)).first())
    if rec is None or not can_view_employee(db, actor, rec.employee_id):
        raise errors.not_found()
    return rec


def get_one(db: Session, actor, record_id: int) -> dict:
    rec = _record(db, actor, record_id)
    emp = db.get(Employee, rec.employee_id)
    dept = db.get(Department, emp.department_id) if emp and emp.department_id else None
    out = serialize(rec, emp, dept)
    tz = tz_of(db, emp)
    out["timezone"] = tz.key
    out["breaks"] = [{"start": _hhmm(clock.to_local(b.start_at, tz)), "end": _hhmm(clock.to_local(b.end_at, tz)),
                      "start_at": clock.iso_utc(b.start_at), "end_at": clock.iso_utc(b.end_at)}
                     for b in db.query(AttendanceBreak).filter(AttendanceBreak.attendance_id == rec.id).order_by(AttendanceBreak.start_at)]
    return out


def audit_for(db: Session, actor, record_id: int) -> list[dict]:
    rec = _record(db, actor, record_id)
    rows = (db.query(AttendanceAuditLog).filter(AttendanceAuditLog.organization_id == actor.organization_id,
                                                or_(AttendanceAuditLog.attendance_id == rec.id,
                                                    (AttendanceAuditLog.employee_id == rec.employee_id) & (AttendanceAuditLog.work_date == rec.date)))
            .order_by(AttendanceAuditLog.id).all())
    names = {e.id: e.full_name for e in db.query(Employee).filter(Employee.id.in_({r.actor_id for r in rows if r.actor_id} or {-1}))}
    return [{"id": r.id, "action": r.action, "at": clock.iso_utc(r.created_at), "actor_id": r.actor_id,
             "actor_name": names.get(r.actor_id) if r.actor_id else None, "actor_type": r.actor_type, "source": r.source,
             "before": r.before, "after": r.after, "reason": r.reason} for r in rows]
