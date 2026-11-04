"""Leave records and letters (Prompt 3 §B): HR-LEV-001 / 003 / 007 / 013 / 018.

Both leave code paths (hr.service and attendance_service, plus ESS and the assistant's booking action) call into this module:

* `protect_reason(record)` before the first commit: a sickness reason is SPECIAL_CATEGORY, so it is encrypted into
  `reason_encrypted` and `reason` is left empty. No API, document, e-mail or event ever carries it; HR can reveal it through an
  audited endpoint. Managers never see it.
* `check_decision(...)` before a decision: the decider is never the employee, and a refusal needs a reason.
* `snapshot_balance(...)` at decision time: the balance printed in documents comes from `leave_balances` then, never later.
* `after_created` / `after_decided`: generate the documents mapped to the leave type (organization setting `leave.document_map`
  can change the map). Generating a document never changes the leave request.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database import get_db
from app.modules.doc_templates import access, hooks, service as doc_service
from app.modules.hr import work_settings
from app.modules.hr.models import EmployeeLifecycle, LeaveBalance, LeaveRequest, LeaveType, RequestStatus
from app.modules.hr.recruitment_documents import _try_generate, documents_for_source

logger = logging.getLogger("zoiko.doc_templates")

LEAVE_IDS = ("HR-LEV-001", "HR-LEV-003", "HR-LEV-007", "HR-LEV-013", "HR-LEV-018")
SENSITIVE_TYPES = {LeaveType.SICK}
FAMILY_TYPES = {LeaveType.MATERNITY, LeaveType.PATERNITY}
REASON_OPTIONAL_TYPES = {LeaveType.SICK, LeaveType.BEREAVEMENT}
_ANNUAL = {"created": [], "decided": ["HR-LEV-001", "HR-LEV-018"]}
DEFAULT_MAP = {
    "annual": _ANNUAL, "earned": _ANNUAL, "casual": _ANNUAL,
    "sick": {"created": ["HR-LEV-003"], "decided": ["HR-LEV-018"]},
    "maternity": {"created": [], "decided": ["HR-LEV-018"], "confirmed": ["HR-LEV-007"]},
    "paternity": {"created": [], "decided": ["HR-LEV-018"], "confirmed": ["HR-LEV-007"]},
    "bereavement": {"created": [], "decided": ["HR-LEV-013", "HR-LEV-018"]},
    "*": {"created": [], "decided": ["HR-LEV-018"]},
}
TYPE_LABELS = {
    "sick": "sick leave", "casual": "casual leave", "annual": "annual leave", "maternity": "maternity leave",
    "paternity": "paternity / partner leave", "unpaid": "unpaid leave", "other": "leave", "emergency": "emergency leave",
    "study": "study leave", "earned": "earned leave", "comp_off": "compensatory time off", "sabbatical": "sabbatical",
    "bereavement": "bereavement leave", "work_from_home": "work from home",
}
PARENTAL_TYPES = {"maternity": "Maternity", "paternity_partner": "Paternity / partner", "adoption": "Adoption",
                  "shared_parental": "Shared / parental"}
_PURPOSE = b"zoiko-hr:leave-special-category"


def _type(record) -> str:
    return getattr(record.leave_type, "value", record.leave_type) or ""


def document_map(db, organization_id: int) -> dict:
    custom = work_settings.get(db, organization_id, "leave.document_map") or {}
    allowed = set(LEAVE_IDS)
    out = {k: dict(v) for k, v in DEFAULT_MAP.items()}
    for leave_type, events in custom.items():
        if isinstance(events, dict):
            out[leave_type] = {e: [c for c in (ids or []) if c in allowed] for e, ids in events.items()
                               if e in ("created", "decided", "confirmed") and isinstance(ids, list)}
    return out


def _templates(db, record, event: str) -> list[str]:
    m = document_map(db, record.organization_id)
    return list((m.get(_type(record)) or m["*"]).get(event) or [])


# ── special-category reason ──────────────────────────────────────────────────────────────────────────────────────────

def _fernet():
    from app.core.crypto import fernet_for
    return fernet_for(_PURPOSE)


def protect_reason(record: LeaveRequest) -> None:
    """Move a sickness reason out of the plain column. Call before the request is first committed."""
    if record.leave_type in SENSITIVE_TYPES and (record.reason or "").strip():
        record.reason_encrypted = _fernet().encrypt(record.reason.strip().encode("utf-8")).decode("ascii")
        record.reason = None


def reveal_reason(db, actor, record: LeaveRequest) -> Optional[str]:
    access.require_hr(actor)
    if not record.reason_encrypted:
        return None
    from app.modules.hr import service as hr_service
    hr_service._activity_record(db, "leave.sensitive_reason_viewed", actor, record.organization_id, entity_type="LeaveRequest",
                                entity_id=record.id, **hr_service._leave_target(db, record), commit=True)
    return _fernet().decrypt(record.reason_encrypted.encode("ascii")).decode("utf-8")


def reason_required(leave_type) -> bool:
    return leave_type not in REASON_OPTIONAL_TYPES


# ── decisions ────────────────────────────────────────────────────────────────────────────────────────────────────────

def check_decision(record: LeaveRequest, decider_id: Optional[int], status, decision_reason: Optional[str]) -> None:
    from app.core.exceptions import BadRequestException
    if status not in (RequestStatus.APPROVED, RequestStatus.REJECTED):
        return
    if decider_id is not None and decider_id == record.employee_id:
        raise HTTPException(403, "You cannot decide your own leave request. Another manager or HR must decide it.")
    if status == RequestStatus.REJECTED and not (decision_reason or "").strip():
        raise BadRequestException("Give a reason when refusing a leave request.")


def snapshot_balance(db, record: LeaveRequest, approve: bool) -> None:
    """The balance before and after this leave, read from leave_balances at decision time (before the balance moves)."""
    b = db.query(LeaveBalance).filter(LeaveBalance.employee_id == record.employee_id, LeaveBalance.organization_id == record.organization_id,
                                      LeaveBalance.leave_type == record.leave_type, LeaveBalance.year == record.start_date.year).first()
    if b is None:
        record.balance_before = record.balance_after = None
        return
    before = Decimal((b.total_days or 0) - (b.used_days or 0))
    record.balance_before = before
    record.balance_after = before - Decimal(record.days or 0) if approve else before


def record_decision(db, record: LeaveRequest, decider_id: Optional[int], status, decision_reason: Optional[str],
                    alternative_dates: Optional[str] = None) -> None:
    """Validate, snapshot and stamp a decision on the request (the caller commits and moves the balance)."""
    check_decision(record, decider_id, status, decision_reason)
    if status not in (RequestStatus.APPROVED, RequestStatus.REJECTED):
        return
    snapshot_balance(db, record, status == RequestStatus.APPROVED)
    record.decided_by, record.decided_at = decider_id, datetime.utcnow()
    record.decision_reason = (decision_reason or "").strip() or None
    if alternative_dates is not None:
        record.alternative_dates = alternative_dates.strip() or None


def _actor(db, actor_or_id):
    from app.modules.employee.models import Employee
    if actor_or_id is None or isinstance(actor_or_id, Employee):
        return actor_or_id
    return db.get(Employee, actor_or_id)


def _generate(db, actor, record, cids, trigger) -> Optional[int]:
    first = None
    for cid in cids:
        doc = _try_generate(db, actor, canonical_id=cid, subject_type="employee", subject_id=record.employee_id,
                            source_ref=f"leave_request:{record.id}", trigger=trigger)
        if doc is not None and first is None and cid != "HR-LEV-018":
            first = doc.id
        elif doc is not None and first is None:
            first = doc.id
    return first


def after_created(db, record: LeaveRequest, actor=None) -> None:
    actor = _actor(db, actor) or _actor(db, record.employee_id)
    try:
        cids = _templates(db, record, "created")
        if cids:
            _generate(db, actor, record, cids, "leave_request.created")
        if record.leave_type == LeaveType.BEREAVEMENT:
            _fast_track(db, record)
    except Exception:
        db.rollback()
        logger.exception("leave documents after create failed for leave request id %s", record.id)


def after_decided(db, record: LeaveRequest, actor=None) -> None:
    if record.status not in (RequestStatus.APPROVED, RequestStatus.REJECTED):
        return
    actor = _actor(db, actor) or _actor(db, record.decided_by)
    try:
        doc_id = _generate(db, actor, record, _templates(db, record, "decided"), "leave_request.decided")
        if doc_id:
            record = db.get(LeaveRequest, record.id)
            record.document_id = doc_id
            db.commit()
    except Exception:
        db.rollback()
        logger.exception("leave documents after decision failed for leave request id %s", record.id)


def _fast_track(db, record: LeaveRequest) -> None:
    """Bereavement: tell the manager straight away so a decision can be made the same day (no details in the message)."""
    from app.modules.employee.models import Employee
    emp = db.get(Employee, record.employee_id)
    mgr = db.get(Employee, emp.reporting_manager_id) if emp is not None and emp.reporting_manager_id else None
    if mgr is None:
        return
    try:
        from app.config import settings
        from app.services import email_service
        email_service.send_leave_decision_needed_email(
            mgr.work_email or mgr.email, mgr.first_name or "there", f"LV-{record.organization_id}-{record.id:04d}",
            f"{settings.FRONTEND_URL.rstrip('/')}/zoiko-hr/leave/requests?request={record.id}", db=db,
            organization_id=record.organization_id)
    except Exception:
        logger.warning("bereavement fast-track notice failed for leave request id %s", record.id)


# ── family leave: HR confirmation (HR-LEV-007) ───────────────────────────────────────────────────────────────────────

def confirm_family_leave(db, actor, record: LeaveRequest, data: dict) -> dict:
    """HR confirms dates and pay; the request is approved, the confirmed record goes to the employee to acknowledge, and a
    return-to-work reminder is scheduled. The employee is the requester; HR's confirmation is the approval (two people)."""
    access.require_hr(actor)
    if record.leave_type not in FAMILY_TYPES and not (record.details or {}).get("parental_type"):
        raise HTTPException(409, "This is not a family leave request.")
    if record.employee_id == actor.id:
        raise HTTPException(403, "You cannot confirm your own family leave.")
    if record.status not in (RequestStatus.PENDING, RequestStatus.IN_PROGRESS):
        raise HTTPException(409, "This request has already been decided.")
    start, ret = data.get("confirmed_start") or record.start_date, data.get("expected_return")
    if not ret or ret <= start:
        raise HTTPException(422, "Give an expected return date after the confirmed start.")
    record.confirmation = {"confirmed_start": start.isoformat(), "expected_return": ret.isoformat(),
                           "pay_summary": (data.get("pay_summary") or "").strip() or None, "confirmed_by": actor.id,
                           "confirmed_at": datetime.utcnow().isoformat()}
    db.commit()
    from app.modules.hr import service as hr_service
    from app.modules.hr.schemas import LeaveRequestUpdate
    hr_service.review_leave_request(db, record.id, LeaveRequestUpdate(status=RequestStatus.APPROVED), record.organization_id, actor.id)
    record = db.get(LeaveRequest, record.id)
    employee = _actor(db, record.employee_id)
    doc = None
    for cid in _templates(db, record, "confirmed"):
        prior = [{"approver_id": actor.id, "decided_at": datetime.utcnow(), "comment": "Family leave confirmed", "source": "leave request"}]
        doc = _try_generate(db, employee, canonical_id=cid, subject_type="employee", subject_id=record.employee_id,
                            source_ref=f"leave_request:{record.id}", trigger="leave_request.confirmed", issue=False,
                            prior_approvals=prior)
        if doc is not None and doc.status == "HUMAN_APPROVED":
            try:
                doc = doc_service.issue(db, doc, actor)
            except HTTPException:
                db.rollback()
    remind_on = ret - timedelta(days=14)
    db.add(EmployeeLifecycle(employee_id=record.employee_id, organization_id=record.organization_id, event_type="return_to_work",
                             event_date=max(remind_on, date.today()), effective_date=ret, initiated_by=actor.id, status="pending",
                             notes=f"Plan the return from family leave (request LV-{record.organization_id}-{record.id:04d})."))
    db.commit()
    return {"leave_request_id": record.id, "status": getattr(record.status, "value", record.status),
            "document_id": doc.id if doc is not None else None}


# ── engine context (field values for the leave templates) ────────────────────────────────────────────────────────────

def _name(db, emp_id) -> Optional[str]:
    p = _actor(db, emp_id) if emp_id else None
    return " ".join(x for x in (p.first_name, p.last_name) if x) if p is not None else None


def _num(v):
    if v is None:
        return None
    d = Decimal(v)
    return int(d) if d == d.to_integral_value() else float(d)


def _leave_context(ctx) -> None:
    r = ctx.source
    if r is None or type(r).__name__ != "LeaveRequest" or r.employee_id != getattr(ctx.subject, "id", None):
        ctx.denials.append("LEAVE_SOURCE_MISMATCH")
        return
    e, t = ctx.extra, _type(r)
    decided = r.status in (RequestStatus.APPROVED, RequestStatus.REJECTED)
    if ctx.canonical_id in ("HR-LEV-001", "HR-LEV-013", "HR-LEV-018") and not decided:
        ctx.denials.append("LEAVE_NOT_DECIDED")
    approved = r.status == RequestStatus.APPROVED
    e.update({
        "leave.type_label": TYPE_LABELS.get(t, t.replace("_", " ")), "leave.start_date": r.start_date, "leave.end_date": r.end_date,
        "leave.return_date": (r.end_date + timedelta(days=1)) if r.end_date else None, "leave.days": r.days,
        "leave.balance_before": _num(r.balance_before), "leave.balance_after": _num(r.balance_after),
        "leave.requested_at": r.created_at.date() if isinstance(r.created_at, datetime) else r.created_at,
        "leave.decision_status_label": ("approved" if approved else "refused") if decided else None,
        "leave.is_approved": approved, "leave.is_refused": r.status == RequestStatus.REJECTED,
        "leave.decided_by": _name(ctx.db, r.decided_by or r.reviewed_by) if decided else None,
        "leave.decided_at": (r.decided_at or r.reviewed_at) if decided else None,
        "leave.decision_reason": r.decision_reason, "leave.alternative_dates": r.alternative_dates,
        "leave.handover_note": r.handover_note,
    })
    details = r.details or {}
    if ctx.canonical_id == "HR-LEV-013":
        ctx.form_values = {"relationship": details.get("relationship") or "Not given", "start_date": e["leave.start_date"],
                           "end_date": e["leave.end_date"], "travel_needed": "Yes" if details.get("travel_needed") else "No",
                           "message": details.get("message")}
    if ctx.canonical_id == "HR-LEV-007":
        conf = r.confirmation or {}
        ctx.form_values = {"parental_type": PARENTAL_TYPES.get(details.get("parental_type"), details.get("parental_type")),
                           "expected_date": details.get("expected_date"), "start_date": r.start_date, "end_date": r.end_date,
                           "pay_option": details.get("pay_option"), "kit_days_interest": "Yes" if details.get("kit_days_interest") else "No"}
        if conf:
            e.update({"leave.confirmed_start": date.fromisoformat(conf["confirmed_start"]),
                      "leave.expected_return": date.fromisoformat(conf["expected_return"]), "leave.pay_summary": conf.get("pay_summary"),
                      "leave.confirmed_by": _name(ctx.db, conf.get("confirmed_by")),
                      "leave.confirmed_at": datetime.fromisoformat(conf["confirmed_at"]).date()})
    for k, v in list(ctx.form_values.items()):
        if isinstance(v, (date, datetime)):
            from app.modules.doc_templates import formatting
            ctx.form_values[k] = formatting.format_date(v, ctx.language, ctx.country())


hooks.context(LEAVE_IDS, _leave_context)


def serialize_extras(db, record: LeaveRequest, viewer) -> dict:
    """Prompt 3 fields for leave API responses. The sickness reason is never included; `has_sensitive_reason` says one exists."""
    return {"decision_reason": record.decision_reason, "decided_by": record.decided_by, "decided_at": record.decided_at,
            "handover_note": record.handover_note, "alternative_dates": record.alternative_dates,
            "balance_before": _num(record.balance_before), "balance_after": _num(record.balance_after), "document_id": record.document_id,
            "details": record.details, "confirmation": record.confirmation, "has_sensitive_reason": bool(record.reason_encrypted)}


# ── HTTP ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/hr/leave-documents", tags=["Leave documents"])


class FamilyConfirm(BaseModel):
    confirmed_start: Optional[date] = None
    expected_return: date
    pay_summary: Optional[str] = Field(None, max_length=1000)


def _leave(db, user, leave_id: int) -> LeaveRequest:
    r = db.get(LeaveRequest, leave_id)
    if r is None or r.organization_id != user.organization_id:
        raise HTTPException(404, "Leave request not found")
    role = access.role_of(user)
    if role in ("admin", "hr_admin") or r.employee_id == user.id:
        return r
    if role == "manager" and r.employee_id in access.report_ids(db, user):
        return r
    raise HTTPException(404, "Leave request not found")


@router.get("/{leave_id}")
def leave_documents(leave_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """The decision records and letters of one leave request (what the caller may see of them)."""
    r = _leave(db, user, leave_id)
    out = documents_for_source(db, user.organization_id, f"leave_request:{r.id}")
    if not access.is_hr(user):
        from app.modules.doc_templates.models import GeneratedDocument
        visible = {d.id for d in db.query(GeneratedDocument).filter(GeneratedDocument.source_ref == f"leave_request:{r.id}").all()
                   if access.can_view(db, user, d)}
        out = {"documents": [d for d in out["documents"] if d["id"] in visible], "blocked": []}
    return {**out, **serialize_extras(db, r, user)}


@router.post("/{leave_id}/confirm-family-leave")
def confirm(leave_id: int, body: FamilyConfirm, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return confirm_family_leave(db, user, _leave(db, user, leave_id), body.model_dump())


@router.get("/{leave_id}/sensitive-reason")
def sensitive_reason(leave_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """HR only, audited. Managers and colleagues get the same 404 as for a missing request."""
    if not access.is_hr(user):
        raise HTTPException(404, "Leave request not found")
    return {"reason": reveal_reason(db, user, _leave(db, user, leave_id))}


@router.get("/settings/current")
def get_settings(db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    return {**work_settings.group(db, user.organization_id, "leave"), "default_map": DEFAULT_MAP}


@router.put("/settings/current")
def put_settings(body: dict, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return work_settings.save(db, user, body, "leave")
