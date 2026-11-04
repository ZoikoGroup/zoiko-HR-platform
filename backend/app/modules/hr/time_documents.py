"""Working time requests and notices (Prompt 3 §C): HR-TIM-003 / 004 / 007 / 013.

* Overtime requests (`overtime_requests`): asked for in advance or recorded afterwards (flagged retrospective / emergency). The
  decider is the employee's manager or HR, never the requester or the employee. Approval marks the attendance record's
  overtime as authorised (analytics split authorised / unauthorised) and emits an ID-only event for payroll or time-off
  systems; the record itself never changes pay.
* Attendance corrections (`attendance_correction_requests`): applied to `attendance_records` only after approval, through this
  service; the original times stay on the correction row and an `employee_history` entry is written.
* Shift notices: publishing a roster to many people produces one HR-TIM-003 per person; changing someone's shifts produces an
  HR-TIM-004. A change on less notice than `attendance.shift_change_notice_days` needs a reason and an L2 approval.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database import get_db
from app.modules.doc_templates import access, formatting, hooks, preflight, service as doc_service
from app.modules.hr import work_settings
from app.modules.hr.models import (AttendanceCorrectionRequest, AttendanceRecord, AttendanceStatus, EmployeeHistory, OvertimeRequest,
                                   Shift, ShiftNotice, ShiftRoster)
from app.modules.hr.recruitment_documents import _try_generate, documents_for_source

logger = logging.getLogger("zoiko.doc_templates")

OVERTIME, CORRECTION, SHIFT_ASSIGNED, SHIFT_CHANGED = "HR-TIM-007", "HR-TIM-013", "HR-TIM-003", "HR-TIM-004"
COMPENSATION_METHODS = {"pay": "Paid", "time_off": "Time off in lieu", "per_policy": "As set out in policy"}
CORRECTION_REASONS = {"forgot": "Forgot to check in/out", "system_issue": "System issue", "off_site": "Working off-site", "other": "Other"}
DAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
MAX_ROSTER_DAYS = 92
DEFAULT_PATTERN_DAYS = 28          # an open-ended pattern is rostered four weeks ahead; later weeks are rostered as usual


def _employee(db, organization_id: int, employee_id: int):
    from app.modules.employee.models import Employee
    e = db.get(Employee, employee_id)
    if e is None or e.organization_id != organization_id:
        raise HTTPException(404, "Employee not found")
    return e


def can_manage(db, user, employee_id: int) -> bool:
    """HR for everyone; a manager for their reports (direct or indirect)."""
    return access.is_hr(user) or (access.role_of(user) == "manager" and employee_id in access.report_ids(db, user))


def _require_manage(db, user, employee_id: int) -> None:
    if not can_manage(db, user, employee_id):
        raise HTTPException(404, "Employee not found")


def _hm(value: str) -> time:
    try:
        h, m = (int(x) for x in str(value).split(":")[:2])
        return time(h, m)
    except (ValueError, TypeError):
        raise HTTPException(422, f"Use HH:MM for times ({value!r}).")


def _hours(start: str, end: str) -> Decimal:
    a, b = _hm(start), _hm(end)
    minutes = (b.hour * 60 + b.minute) - (a.hour * 60 + a.minute)
    if minutes <= 0:
        minutes += 24 * 60                                     # crosses midnight
    return (Decimal(minutes) / Decimal(60)).quantize(Decimal("0.01"))


def _name(db, emp_id) -> Optional[str]:
    if not emp_id:
        return None
    from app.modules.employee.models import Employee
    p = db.get(Employee, emp_id)
    return " ".join(x for x in (p.first_name, p.last_name) if x) if p else None


def _emit(db, name: str, payload: dict, organization_id: int) -> None:
    try:
        from app.modules.integrations.events import emit_event
        emit_event(db, name, payload, organization_id)
    except Exception:
        logger.warning("time event %s failed for organization %s", name, organization_id)


def _ser_overtime(o: OvertimeRequest) -> dict:
    return {"id": o.id, "employee_id": o.employee_id, "date": o.date, "start_time": o.start_time, "end_time": o.end_time,
            "hours": float(o.hours), "reason": o.reason, "pre_approved": o.pre_approved, "emergency": o.emergency, "status": o.status,
            "requested_by": o.requested_by, "decided_by": o.decided_by, "decided_at": o.decided_at, "decision_reason": o.decision_reason,
            "compensation_method": o.compensation_method, "attendance_record_id": o.attendance_record_id, "document_id": o.document_id,
            "created_at": o.created_at}


def _ser_correction(c: AttendanceCorrectionRequest) -> dict:
    return {"id": c.id, "employee_id": c.employee_id, "attendance_record_id": c.attendance_record_id, "date": c.date,
            "original_check_in": c.original_check_in, "original_check_out": c.original_check_out,
            "requested_check_in": c.requested_check_in, "requested_check_out": c.requested_check_out, "reason": c.reason,
            "reason_detail": c.reason_detail, "status": c.status, "requested_by": c.requested_by, "decided_by": c.decided_by,
            "decided_at": c.decided_at, "decision_reason": c.decision_reason, "applied_at": c.applied_at, "document_id": c.document_id,
            "created_at": c.created_at}


def _check_decider(user, *, employee_id: int, requested_by: int) -> None:
    if user.id in (employee_id, requested_by):
        raise HTTPException(403, "The person who asked (or the employee concerned) cannot decide this request.")


def _scope(db, user, q, model):
    if access.is_hr(user):
        return q
    ids = {user.id}
    if access.role_of(user) == "manager":
        ids |= set(access.report_ids(db, user))
    return q.filter(model.employee_id.in_(list(ids)))


# ── overtime ─────────────────────────────────────────────────────────────────────────────────────────────────────────

def request_overtime(db, user, data: dict) -> OvertimeRequest:
    employee_id = data.get("employee_id") or user.id
    _employee(db, user.organization_id, employee_id)
    if employee_id != user.id:
        _require_manage(db, user, employee_id)
    if not (data.get("reason") or "").strip():
        raise HTTPException(422, "Give the reason for the overtime.")
    on = data["date"]
    o = OvertimeRequest(organization_id=user.organization_id, employee_id=employee_id, date=on, start_time=data["start_time"],
                        end_time=data["end_time"], hours=_hours(data["start_time"], data["end_time"]), reason=data["reason"].strip(),
                        pre_approved=on >= date.today(), emergency=bool(data.get("emergency")), status="PENDING",
                        requested_by=user.id)
    db.add(o)
    db.commit()
    return o


def decide_overtime(db, user, o: OvertimeRequest, *, approve: bool, reason: Optional[str], method: Optional[str]) -> OvertimeRequest:
    _check_decider(user, employee_id=o.employee_id, requested_by=o.requested_by)
    _require_manage(db, user, o.employee_id)
    if o.status != "PENDING":
        raise HTTPException(409, "This request has already been decided.")
    if not approve and not (reason or "").strip():
        raise HTTPException(422, "Give a reason when refusing overtime.")
    if approve and method not in COMPENSATION_METHODS:
        method = "per_policy"
    o.status = "APPROVED" if approve else "REJECTED"
    o.decided_by, o.decided_at, o.decision_reason = user.id, datetime.utcnow(), (reason or "").strip() or None
    o.compensation_method = method if approve else None
    if approve:
        rec = (db.query(AttendanceRecord).filter(AttendanceRecord.employee_id == o.employee_id, AttendanceRecord.date == o.date,
                                                 AttendanceRecord.is_deleted.isnot(True)).order_by(AttendanceRecord.id.desc()).first())
        if rec is not None:
            rec.overtime_authorized_hours = Decimal(rec.overtime_authorized_hours or 0) + Decimal(o.hours)
            rec.overtime_request_id = o.id
            o.attendance_record_id = rec.id
    db.commit()
    if approve:
        _emit(db, "attendance.overtime.approved", {"id": o.id, "employee_id": o.employee_id, "date": o.date.isoformat(),
                                                   "attendance_record_id": o.attendance_record_id}, o.organization_id)
    doc = _try_generate(db, user, canonical_id=OVERTIME, subject_type="employee", subject_id=o.employee_id,
                        source_ref=f"overtime_request:{o.id}", trigger="overtime_request.decided")
    if doc is not None:
        o = db.get(OvertimeRequest, o.id)
        o.document_id = doc.id
        db.commit()
    return o


def _overtime_context(ctx) -> None:
    o = ctx.source
    if o is None or type(o).__name__ != "OvertimeRequest" or o.employee_id != getattr(ctx.subject, "id", None):
        ctx.denials.append("OVERTIME_SOURCE_MISMATCH")
        return
    if o.status not in ("APPROVED", "REJECTED"):
        ctx.denials.append("OVERTIME_NOT_DECIDED")
    ctx.extra.update({
        "overtime.date": o.date, "overtime.time_range": f"{o.start_time}–{o.end_time}", "overtime.hours": f"{Decimal(o.hours).normalize():f}",
        "overtime.reason": o.reason, "overtime.timing_label": "Pre-approved" if o.pre_approved else "Retrospective",
        "overtime.emergency_label": "Yes" if o.emergency else "No",
        "overtime.status_label": {"APPROVED": "Approved", "REJECTED": "Refused"}.get(o.status),
        "overtime.decided_by": _name(ctx.db, o.decided_by), "overtime.decided_at": o.decided_at,
        "overtime.compensation_method_label": COMPENSATION_METHODS.get(o.compensation_method or ""),
        "overtime.decision_reason": o.decision_reason,
    })


hooks.context([OVERTIME], _overtime_context)


# ── attendance corrections ───────────────────────────────────────────────────────────────────────────────────────────

def _at(on: date, value) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.combine(on, _hm(value))


def request_correction(db, user, data: dict) -> AttendanceCorrectionRequest:
    employee_id = data.get("employee_id") or user.id
    _employee(db, user.organization_id, employee_id)
    if employee_id != user.id:
        _require_manage(db, user, employee_id)
    if not data.get("confirm_accurate"):
        raise HTTPException(422, "Confirm that the corrected times are accurate.")
    if data.get("reason") not in CORRECTION_REASONS:
        raise HTTPException(422, f"reason must be one of {', '.join(CORRECTION_REASONS)}.")
    if data["reason"] == "other" and not (data.get("reason_detail") or "").strip():
        raise HTTPException(422, "Describe the reason.")
    on = data["date"]
    if on > date.today():
        raise HTTPException(422, "You can only correct a day that has passed.")
    cin, cout = _at(on, data["requested_check_in"]), _at(on, data["requested_check_out"])
    if cout <= cin:
        cout += timedelta(days=1)
    rec = (db.query(AttendanceRecord).filter(AttendanceRecord.employee_id == employee_id, AttendanceRecord.date == on,
                                             AttendanceRecord.organization_id == user.organization_id,
                                             AttendanceRecord.is_deleted.isnot(True)).order_by(AttendanceRecord.id.desc()).first())
    c = AttendanceCorrectionRequest(organization_id=user.organization_id, employee_id=employee_id,
                                    attendance_record_id=rec.id if rec else None, date=on,
                                    original_check_in=rec.check_in if rec else None, original_check_out=rec.check_out if rec else None,
                                    requested_check_in=cin, requested_check_out=cout, reason=data["reason"],
                                    reason_detail=(data.get("reason_detail") or "").strip() or None,
                                    evidence_file=data.get("evidence_file"), declared_at=datetime.utcnow(), requested_by=user.id,
                                    status="PENDING")
    db.add(c)
    db.commit()
    return c


def apply_correction(db, actor, c: AttendanceCorrectionRequest) -> AttendanceRecord:
    """Write the approved times to attendance_records; the originals stay on the correction request."""
    rec = db.get(AttendanceRecord, c.attendance_record_id) if c.attendance_record_id else None
    if rec is None:
        rec = AttendanceRecord(employee_id=c.employee_id, organization_id=c.organization_id, date=c.date, status=AttendanceStatus.PRESENT,
                               notes="Created from an approved attendance correction")
        db.add(rec)
        db.flush()
        c.attendance_record_id = rec.id
    rec.check_in, rec.check_out = c.requested_check_in, c.requested_check_out
    rec.total_hours = round(Decimal((c.requested_check_out - c.requested_check_in).total_seconds()) / Decimal(3600), 2)
    if rec.status in (AttendanceStatus.ABSENT,):
        rec.status = AttendanceStatus.PRESENT
    for field, old, new in (("attendance.check_in", c.original_check_in, c.requested_check_in),
                            ("attendance.check_out", c.original_check_out, c.requested_check_out)):
        db.add(EmployeeHistory(employee_id=c.employee_id, organization_id=c.organization_id, field_name=field,
                               old_value=old.isoformat() if old else None, new_value=new.isoformat(), changed_by=actor.id,
                               change_reason=f"Attendance correction {c.id} approved"))
    c.applied_at = datetime.utcnow()
    return rec


def decide_correction(db, user, c: AttendanceCorrectionRequest, *, approve: bool, reason: Optional[str]) -> AttendanceCorrectionRequest:
    _check_decider(user, employee_id=c.employee_id, requested_by=c.requested_by)
    _require_manage(db, user, c.employee_id)
    if c.status != "PENDING":
        raise HTTPException(409, "This request has already been decided.")
    if not approve and not (reason or "").strip():
        raise HTTPException(422, "Give a reason when refusing a correction.")
    c.status = "APPROVED" if approve else "REJECTED"
    c.decided_by, c.decided_at, c.decision_reason = user.id, datetime.utcnow(), (reason or "").strip() or None
    if approve:
        apply_correction(db, user, c)
    db.commit()
    try:
        from app.modules.hr import service as hr_service
        hr_service._activity_record(db, "attendance.correction_decided", user, c.organization_id, entity_type="AttendanceCorrectionRequest",
                                    entity_id=c.id, target_name=_name(db, c.employee_id) or f"Employee #{c.employee_id}",
                                    changes=[{"field": "status", "label": "Status", "before": "PENDING", "after": c.status}], commit=True)
    except Exception:
        logger.warning("activity for attendance correction %s failed", c.id)
    doc = _try_generate(db, user, canonical_id=CORRECTION, subject_type="employee", subject_id=c.employee_id,
                        source_ref=f"attendance_correction:{c.id}", trigger="attendance_correction.decided")
    if doc is not None:
        c = db.get(AttendanceCorrectionRequest, c.id)
        c.document_id = doc.id
        db.commit()
    return c


def _correction_context(ctx) -> None:
    c = ctx.source
    if c is None or type(c).__name__ != "AttendanceCorrectionRequest" or c.employee_id != getattr(ctx.subject, "id", None):
        ctx.denials.append("CORRECTION_SOURCE_MISMATCH")
        return
    if c.status not in ("APPROVED", "REJECTED"):
        ctx.denials.append("CORRECTION_NOT_DECIDED")
    t = lambda v: v.strftime("%H:%M") if v else "Not recorded"  # noqa: E731
    ctx.form_values = {"date": formatting.format_date(c.date, ctx.language, ctx.country()), "recorded_check_in": t(c.original_check_in),
                       "recorded_check_out": t(c.original_check_out), "requested_check_in": t(c.requested_check_in),
                       "requested_check_out": t(c.requested_check_out), "reason": CORRECTION_REASONS.get(c.reason, c.reason),
                       "reason_detail": c.reason_detail, "evidence": "Yes" if c.evidence_file else "No"}
    ctx.extra.update({"correction.status_label": {"APPROVED": "Approved", "REJECTED": "Refused"}.get(c.status),
                      "correction.decided_by": _name(ctx.db, c.decided_by), "correction.decided_at": c.decided_at,
                      "correction.decision_reason": c.decision_reason})


hooks.context([CORRECTION], _correction_context)


# ── shift notices ────────────────────────────────────────────────────────────────────────────────────────────────────

def _shift(db, organization_id: int, shift_id: int) -> Shift:
    s = db.get(Shift, shift_id)
    if s is None or s.organization_id != organization_id:
        raise HTTPException(404, "Shift not found")
    return s


def _shift_hours(s: Shift) -> str:
    h = _hours(s.start_time, s.end_time) - (Decimal(s.break_duration_minutes or 0) / Decimal(60))
    return f"{h.quantize(Decimal('0.01')).normalize():f}"


def _label(s: Optional[Shift]) -> str:
    return f"{s.name} ({s.start_time}–{s.end_time})" if s else "No shift"


def publish_roster(db, user, data: dict, *, preview: bool = False) -> dict:
    """Roster one shift pattern to many people and send each of them an HR-TIM-003 (preview: dry-run preflight only)."""
    s = _shift(db, user.organization_id, data["shift_id"])
    ids = list(dict.fromkeys(int(i) for i in data.get("employee_ids") or []))
    if not ids:
        raise HTTPException(422, "Choose at least one employee.")
    for eid in ids:
        _employee(db, user.organization_id, eid)
        _require_manage(db, user, eid)
    start, end = data["start_date"], data.get("end_date")
    if end is not None and end < start:
        raise HTTPException(422, "The end date cannot be before the start date.")
    weekdays = sorted(set(data.get("weekdays") or [0, 1, 2, 3, 4]))
    if any(d not in range(7) for d in weekdays):
        raise HTTPException(422, "weekdays are 0 (Monday) to 6 (Sunday).")
    last = end or (start + timedelta(days=DEFAULT_PATTERN_DAYS - 1))
    if (last - start).days + 1 > MAX_ROSTER_DAYS:
        raise HTTPException(422, f"Roster at most {MAX_ROSTER_DAYS} days at a time.")
    if preview:
        results = []
        for eid in ids:
            r = preflight.run_preflight(db, organization_id=user.organization_id, actor=user, canonical_id=SHIFT_ASSIGNED,
                                        subject_type="employee", subject_id=eid, organization=user.organization,
                                        system_trigger="shift_roster.assigned")
            # the notice itself does not exist yet, so its own fields are not checked here — only jurisdiction, pack and variant
            reasons = [x for x in r.reasons if not x.startswith(("MISSING_FIELD:shift.", "SHIFT_"))]
            results.append({"employee_id": eid, "outcome": "ALLOW" if not reasons else r.outcome, "reasons": reasons})
        return {"preview": True, "recipients": len(ids), "results": results, "blocked": sum(1 for x in results if x["outcome"] != "ALLOW")}
    pattern = [[DAYS[d], s.start_time, s.end_time, _shift_hours(s)] for d in weekdays]
    out = []
    for eid in ids:
        notice = ShiftNotice(organization_id=user.organization_id, employee_id=eid, kind="assignment", shift_id=s.id, start_date=start,
                             end_date=end, pattern=pattern, location=(data.get("location") or "").strip() or None, created_by=user.id)
        db.add(notice)
        db.flush()
        rows = []
        day = start
        while day <= last:
            if day.weekday() in weekdays:
                row = (db.query(ShiftRoster).filter(ShiftRoster.employee_id == eid, ShiftRoster.date == day, ShiftRoster.is_active.is_(True))
                       .first())
                if row is None:
                    row = ShiftRoster(employee_id=eid, shift_id=s.id, date=day, assigned_by=user.id, is_active=True)
                    db.add(row)
                row.shift_id, row.notice_id = s.id, notice.id
                rows.append(row)
            day += timedelta(days=1)
        db.commit()
        doc = _try_generate(db, user, canonical_id=SHIFT_ASSIGNED, subject_type="employee", subject_id=eid,
                            source_ref=f"shift_notice:{notice.id}", trigger="shift_roster.assigned")
        _stamp(db, notice.id, doc)
        out.append({"employee_id": eid, "notice_id": notice.id, "rostered_days": len(rows), "document_id": doc.id if doc else None,
                    "document_status": doc.status if doc else None})
    return {"preview": False, "results": out}


def _stamp(db, notice_id: int, doc) -> None:
    if doc is None:
        return
    notice = db.get(ShiftNotice, notice_id)
    notice.document_id = doc.id
    issued = doc.status in ("ISSUED", "ACKNOWLEDGED")
    if issued:
        notice.notified_at = doc.issued_at or datetime.utcnow()
    for row in db.query(ShiftRoster).filter(ShiftRoster.notice_id == notice_id).all():
        row.document_id = doc.id
        if issued:
            row.notified_at = notice.notified_at
    db.commit()


def change_shifts(db, user, data: dict) -> dict:
    """Move one person's shifts on the given dates to another shift and send an HR-TIM-004 (L2 when the notice is short)."""
    eid = int(data["employee_id"])
    _employee(db, user.organization_id, eid)
    _require_manage(db, user, eid)
    new = _shift(db, user.organization_id, data["new_shift_id"])
    dates = sorted(set(data.get("dates") or []))
    if not dates:
        raise HTTPException(422, "Choose the dates that change.")
    if not (data.get("reason") or "").strip():
        raise HTTPException(422, "Give the reason for the change.")
    notice_days = (dates[0] - date.today()).days
    normal = work_settings.get(db, user.organization_id, "attendance.shift_change_notice_days")
    short = normal is not None and notice_days < int(normal)
    if short and not (data.get("short_notice_reason") or "").strip():
        raise HTTPException(422, f"This change gives {max(notice_days, 0)} days' notice instead of the usual {normal}. "
                                 "Explain why the notice is short.")
    changes = []
    notice = ShiftNotice(organization_id=user.organization_id, employee_id=eid, kind="change", shift_id=new.id, start_date=dates[0],
                         reason=data["reason"].strip(), short_notice_reason=(data.get("short_notice_reason") or "").strip() or None if short else None,
                         notice_days_given=notice_days, created_by=user.id)
    db.add(notice)
    db.flush()
    for day in dates:
        row = (db.query(ShiftRoster).filter(ShiftRoster.employee_id == eid, ShiftRoster.date == day, ShiftRoster.is_active.is_(True)).first())
        previous = db.get(Shift, row.shift_id) if row else None
        if row is None:
            row = ShiftRoster(employee_id=eid, shift_id=new.id, date=day, assigned_by=user.id, is_active=True)
            db.add(row)
        row.shift_id, row.notice_id = new.id, notice.id
        changes.append([formatting.format_date(day, "en", None), _label(previous), _label(new)])
    notice.changes = changes
    db.commit()
    doc = _try_generate(db, user, canonical_id=SHIFT_CHANGED, subject_type="employee", subject_id=eid,
                        source_ref=f"shift_notice:{notice.id}", trigger="shift_roster.changed", min_policy="L2" if short else None)
    _stamp(db, notice.id, doc)
    return {"notice_id": notice.id, "short_notice": short, "notice_days_given": notice_days,
            "document_id": doc.id if doc else None, "document_status": doc.status if doc else None,
            "needs_approval": bool(doc and doc.status == "PENDING_APPROVAL")}


def _shift_context(ctx) -> None:
    n = ctx.source
    if n is None or type(n).__name__ != "ShiftNotice" or n.employee_id != getattr(ctx.subject, "id", None):
        ctx.denials.append("SHIFT_SOURCE_MISMATCH")
        return
    if (ctx.canonical_id == SHIFT_ASSIGNED) != (n.kind == "assignment"):
        ctx.denials.append("SHIFT_NOTICE_KIND_MISMATCH")
    s = ctx.db.get(Shift, n.shift_id) if n.shift_id else None
    ctx.extra.update({
        "shift.name": s.name if s else None, "shift.pattern": n.pattern or None, "shift.start_date": n.start_date,
        "shift.end_date": n.end_date, "shift.break_summary": (f"{s.break_duration_minutes} minutes" if s and s.break_duration_minutes else None),
        "shift.location": n.location, "shift.changes": n.changes or None, "shift.change_effective_date": n.start_date,
        "shift.change_reason": n.reason, "shift.is_short_notice": bool(n.short_notice_reason), "shift.short_notice_reason": n.short_notice_reason,
    })


hooks.context([SHIFT_ASSIGNED, SHIFT_CHANGED], _shift_context)


# ── HTTP ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/hr/time", tags=["Working time documents"])


class OvertimeIn(BaseModel):
    employee_id: Optional[int] = None
    date: date
    start_time: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    end_time: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    reason: str = Field(..., min_length=3, max_length=1000)
    emergency: bool = False


class Decision(BaseModel):
    approve: bool
    reason: Optional[str] = Field(None, max_length=2000)
    compensation_method: Optional[str] = Field(None, pattern="^(pay|time_off|per_policy)$")


class CorrectionIn(BaseModel):
    employee_id: Optional[int] = None
    date: date
    requested_check_in: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    requested_check_out: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    reason: str = Field(..., pattern="^(forgot|system_issue|off_site|other)$")
    reason_detail: Optional[str] = Field(None, max_length=1000)
    confirm_accurate: bool = False


class RosterPublish(BaseModel):
    shift_id: int
    employee_ids: list[int] = Field(..., min_length=1, max_length=200)
    start_date: date
    end_date: Optional[date] = None
    weekdays: Optional[list[int]] = None
    location: Optional[str] = Field(None, max_length=200)
    preview: bool = False


class ShiftChange(BaseModel):
    employee_id: int
    new_shift_id: int
    dates: list[date] = Field(..., min_length=1, max_length=62)
    reason: str = Field(..., min_length=3, max_length=1000)
    short_notice_reason: Optional[str] = Field(None, max_length=1000)


def _get(db, user, model, rid):
    row = db.get(model, rid)
    if row is None or row.organization_id != user.organization_id or not (row.employee_id == user.id or can_manage(db, user, row.employee_id)):
        raise HTTPException(404, "Request not found")
    return row


@router.get("/overtime")
def list_overtime(status: Optional[str] = Query(None, max_length=20), employee_id: Optional[int] = None,
                  db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = _scope(db, user, db.query(OvertimeRequest).filter(OvertimeRequest.organization_id == user.organization_id), OvertimeRequest)
    if status:
        q = q.filter(OvertimeRequest.status == status.upper())
    if employee_id:
        q = q.filter(OvertimeRequest.employee_id == employee_id)
    return {"items": [_ser_overtime(o) for o in q.order_by(OvertimeRequest.id.desc()).limit(500).all()]}


@router.post("/overtime", status_code=201)
def create_overtime(body: OvertimeIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return _ser_overtime(request_overtime(db, user, body.model_dump()))


@router.post("/overtime/{request_id}/decision")
def overtime_decision(request_id: int, body: Decision, db: Session = Depends(get_db), user=Depends(get_current_user)):
    o = _get(db, user, OvertimeRequest, request_id)
    return _ser_overtime(decide_overtime(db, user, o, approve=body.approve, reason=body.reason, method=body.compensation_method))


@router.get("/corrections")
def list_corrections(status: Optional[str] = Query(None, max_length=20), employee_id: Optional[int] = None,
                     db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = _scope(db, user, db.query(AttendanceCorrectionRequest).filter(AttendanceCorrectionRequest.organization_id == user.organization_id),
               AttendanceCorrectionRequest)
    if status:
        q = q.filter(AttendanceCorrectionRequest.status == status.upper())
    if employee_id:
        q = q.filter(AttendanceCorrectionRequest.employee_id == employee_id)
    return {"items": [_ser_correction(c) for c in q.order_by(AttendanceCorrectionRequest.id.desc()).limit(500).all()]}


@router.post("/corrections", status_code=201)
def create_correction(body: CorrectionIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return _ser_correction(request_correction(db, user, body.model_dump()))


@router.post("/corrections/{request_id}/decision")
def correction_decision(request_id: int, body: Decision, db: Session = Depends(get_db), user=Depends(get_current_user)):
    c = _get(db, user, AttendanceCorrectionRequest, request_id)
    return _ser_correction(decide_correction(db, user, c, approve=body.approve, reason=body.reason))


@router.post("/rosters/publish")
def roster_publish(body: RosterPublish, db: Session = Depends(get_db), user=Depends(get_current_user)):
    data = body.model_dump()
    return publish_roster(db, user, data, preview=data.pop("preview"))


@router.post("/rosters/change")
def roster_change(body: ShiftChange, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return change_shifts(db, user, body.model_dump())


@router.get("/documents/{kind}/{record_id}")
def time_documents(kind: str, record_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    model = {"overtime_request": OvertimeRequest, "attendance_correction": AttendanceCorrectionRequest, "shift_notice": ShiftNotice}.get(kind)
    if model is None:
        raise HTTPException(404, "Not found")
    row = _get(db, user, model, record_id)
    out = documents_for_source(db, user.organization_id, f"{kind}:{row.id}")
    if not access.is_hr(user):
        from app.modules.doc_templates.models import GeneratedDocument
        ok = {d.id for d in db.query(GeneratedDocument).filter(GeneratedDocument.source_ref == f"{kind}:{row.id}").all()
              if access.can_view(db, user, d)}
        out = {"documents": [d for d in out["documents"] if d["id"] in ok], "blocked": []}
    return out


@router.get("/settings")
def get_settings(db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    from app.modules.hr.attendance_service import STANDARD_WORKDAY_HOURS
    return {**work_settings.group(db, user.organization_id, "attendance"), "fallback_standard_workday_hours": STANDARD_WORKDAY_HOURS}


@router.put("/settings")
def put_settings(body: dict, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return work_settings.save(db, user, body, "attendance")
