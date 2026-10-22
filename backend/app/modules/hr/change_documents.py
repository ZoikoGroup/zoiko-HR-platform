"""Employment changes through lifecycle requests (Prompt 4 §B): HR-CHG-001 / 002 / 004 / 006 / 007 / 008, and the decision
step the probation letters of performance_documents use.

    request (pending) → decision by someone other than the initiator (approved / rejected) → letter → completion by a person

* The **decision** is the lifecycle approval: approver ≠ initiator ≠ employee, recorded in `approved_by`. Internal transfers need
  two decisions: the receiving manager (or HR) and then HR, two different people.
* The **letter** communicates an approved decision. Generating it never changes the employee record.
* **Completion** (`POST /hr/changes/{id}/complete`) is the separate human step that updates department, manager, designation or
  title, and writes `employee_history`. Nothing happens to the record before it.
* A change that also moves someone to another country or region, or changes hours or contract type, is a terms variation:
  the letters refuse it with CONTRACT_VARIATION_REQUIRED (HR-CHG-009/010/011 are later tiers).
"""
from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Callable, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database import get_db
from app.modules.doc_templates import access, formatting, hooks, preflight, service as doc_service
from app.modules.hr.models import Department, Designation, EmployeeHistory, EmployeeLifecycle, SalaryRevision
from app.modules.hr.recruitment_documents import _try_generate, documents_for_source

logger = logging.getLogger("zoiko.doc_templates")

CHANGE_TYPES = ("promotion", "role_change", "department_change", "transfer", "manager_change")
LETTER_FOR = {"promotion": "HR-CHG-004", "role_change": "HR-CHG-006", "department_change": "HR-CHG-007",
              "transfer": "HR-CHG-007", "manager_change": "HR-CHG-008"}
TWO_STEP = {"transfer"}
VARIATION_KEYS = ("working_hours", "contract_type", "employment_type", "hours_per_week")
CHG_IDS = ("HR-CHG-001", "HR-CHG-002", "HR-CHG-004", "HR-CHG-006", "HR-CHG-007", "HR-CHG-008")

# Other modules (probation) register the event types they own: event_type -> handler(db, approver, event)
_on_approved: dict[str, Callable] = {}
_on_rejected: dict[str, Callable] = {}


def register(event_type: str, on_approved: Callable, on_rejected: Optional[Callable] = None) -> None:
    _on_approved[event_type] = on_approved
    if on_rejected:
        _on_rejected[event_type] = on_rejected


def _emp(db, organization_id: int, employee_id):
    from app.modules.employee.models import Employee
    e = db.get(Employee, employee_id) if employee_id else None
    if e is None or e.organization_id != organization_id:
        raise HTTPException(404, "Employee not found")
    return e


def _name(db, emp_id) -> Optional[str]:
    if not emp_id:
        return None
    from app.modules.employee.models import Employee
    p = db.get(Employee, emp_id)
    return " ".join(x for x in (p.first_name, p.last_name) if x) if p else None


def _title(db, emp) -> Optional[str]:
    if emp.designation_id:
        d = db.get(Designation, emp.designation_id)
        if d is not None and d.title:
            return d.title
    return emp.job_title


def snapshot(db, emp) -> dict:
    """What the record says now: the 'from' side of a change, kept on the event."""
    dept = db.get(Department, emp.department_id) if emp.department_id else None
    return {"title": _title(db, emp), "designation_id": emp.designation_id, "department_id": emp.department_id,
            "department": dept.name if dept else None, "manager_id": emp.reporting_manager_id, "manager": _name(db, emp.reporting_manager_id),
            "work_country": emp.work_country, "work_region": emp.work_region, "work_city": emp.work_city}


def can_initiate(db, user, employee_id: int) -> bool:
    return access.is_hr(user) or (access.role_of(user) == "manager" and employee_id in access.report_ids(db, user))


# ── requests ─────────────────────────────────────────────────────────────────────────────────────────────────────────

def _clean_new_value(db, organization_id: int, change_type: str, nv: dict) -> dict:
    out = {k: v for k, v in (nv or {}).items() if v not in (None, "", [])}
    if out.get("department_id"):
        d = db.get(Department, int(out["department_id"]))
        if d is None or d.organization_id != organization_id:
            raise HTTPException(422, "The department was not found.")
        out["department"] = d.name
    if out.get("designation_id"):
        d = db.get(Designation, int(out["designation_id"]))
        if d is None or d.organization_id != organization_id:
            raise HTTPException(422, "The designation was not found.")
        out.setdefault("title", d.title)
    if out.get("manager_id"):
        out["manager"] = _name(db, _emp(db, organization_id, int(out["manager_id"])).id)
    need = {"promotion": ("title",), "role_change": ("title",), "department_change": ("department_id",),
            "transfer": ("department_id",), "manager_change": ("manager_id",)}[change_type]
    missing = [k for k in need if not out.get(k)]
    if missing:
        raise HTTPException(422, f"Give the new {missing[0].replace('_id', '').replace('_', ' ')}.")
    return out


def create_change(db, user, data: dict, *, initiated_by_employee: bool = False) -> EmployeeLifecycle:
    change_type = data.get("event_type")
    if change_type not in CHANGE_TYPES:
        raise HTTPException(422, f"event_type must be one of {', '.join(CHANGE_TYPES)}.")
    emp = _emp(db, user.organization_id, data.get("employee_id"))
    if not initiated_by_employee and not can_initiate(db, user, emp.id):
        raise HTTPException(404, "Employee not found")
    if not data.get("effective_date"):
        raise HTTPException(422, "Give the effective date.")
    nv = _clean_new_value(db, user.organization_id, change_type, data.get("new_value") or {})
    for k in ("reason_statement", "duties_changed", "new_responsibilities", "manager_informed", "requested_role", "requested_location",
              "supporting_information", "new_grade"):
        if data.get(k) not in (None, "", []):
            nv[k] = data[k]
    rev_id = data.get("linked_salary_revision_id")
    if rev_id:
        rev = db.get(SalaryRevision, int(rev_id))
        if rev is None or rev.organization_id != user.organization_id or rev.employee_id != emp.id:
            raise HTTPException(422, "The linked salary revision was not found for this employee.")
    ev = EmployeeLifecycle(employee_id=emp.id, organization_id=user.organization_id, event_type=change_type, event_date=date.today(),
                           effective_date=data["effective_date"], previous_value=snapshot(db, emp), new_value=nv,
                           reason=(data.get("reason") or "").strip() or None, initiated_by=user.id, status="pending",
                           linked_salary_revision_id=int(rev_id) if rev_id else None)
    db.add(ev)
    db.commit()
    return ev


def request_transfer(db, employee, data: dict) -> EmployeeLifecycle:
    """ESS: an employee asks for an internal transfer (HR-CHG-001 records the request)."""
    if not (data.get("reason") or "").strip():
        raise HTTPException(422, "Give the reason for the transfer.")
    ev = create_change(db, employee, {"event_type": "transfer", "employee_id": employee.id, "effective_date": data.get("preferred_start") or date.today(),
                                      "new_value": {"department_id": data.get("requested_department_id"),
                                                    "designation_id": data.get("requested_designation_id"),
                                                    "work_city": data.get("requested_location")},
                                      "reason": data["reason"], "manager_informed": bool(data.get("manager_informed")),
                                      "requested_role": data.get("requested_role"), "requested_location": data.get("requested_location"),
                                      "supporting_information": data.get("supporting_information")}, initiated_by_employee=True)
    _try_generate(db, employee, canonical_id="HR-CHG-001", subject_type="employee", subject_id=employee.id,
                  source_ref=f"employee_lifecycle:{ev.id}", trigger="transfer_request.submitted")
    return ev


# ── decisions ────────────────────────────────────────────────────────────────────────────────────────────────────────

def _check_decider(db, user, ev: EmployeeLifecycle, first_of_two: bool) -> None:
    if user.id in (ev.initiated_by, ev.employee_id):
        raise HTTPException(403, {"code": "SEPARATION_OF_DUTIES",
                                  "message": "The person who asked for this change, or the employee concerned, cannot decide it."})
    if first_of_two:
        receiving = access.role_of(user) == "manager" and getattr(user, "department_id", None) is not None             and user.department_id == (ev.new_value or {}).get("department_id")
        if not (access.is_hr(user) or receiving):
            raise HTTPException(403, "Only a manager of the receiving department or HR can decide this.")
    elif not access.is_hr(user):
        raise HTTPException(403, "Only HR can approve this change.")
    if ev.approved_by and ev.approved_by == user.id:
        raise HTTPException(403, {"code": "SEPARATION_OF_DUTIES", "message": "A second, different person must approve this change."})


def decide(db, user, ev: EmployeeLifecycle, *, approve: bool, comment: Optional[str]) -> EmployeeLifecycle:
    if ev.organization_id != user.organization_id:
        raise HTTPException(404, "Change not found")
    if ev.status != "pending":
        raise HTTPException(409, "This change has already been decided.")
    two_step = ev.event_type in TWO_STEP
    first_of_two = two_step and ev.approved_by is None
    _check_decider(db, user, ev, first_of_two)
    if not approve and not (comment or "").strip():
        raise HTTPException(422, "Give the reason for refusing.")
    now = datetime.utcnow()
    if not approve:
        ev.status, ev.decision_comment = "rejected", comment.strip()
        if ev.approved_by is None:
            ev.approved_by, ev.approved_at = user.id, now
        else:
            ev.hr_approved_by, ev.hr_approved_at = user.id, now
        db.commit()
        if ev.event_type == "transfer":
            _decision_record(db, user, ev)
        if ev.event_type in _on_rejected:
            _on_rejected[ev.event_type](db, user, ev)
        return ev
    if first_of_two:
        ev.approved_by, ev.approved_at, ev.decision_comment = user.id, now, (comment or "").strip() or None
        db.commit()
        return ev                                           # waits for the HR approval
    if two_step:
        ev.hr_approved_by, ev.hr_approved_at = user.id, now
    else:
        ev.approved_by, ev.approved_at = user.id, now
        ev.decision_comment = (comment or "").strip() or None
    ev.status = "approved"
    db.commit()
    if ev.event_type in _on_approved:
        _on_approved[ev.event_type](db, user, ev)
    elif ev.event_type in LETTER_FOR:
        if ev.event_type == "transfer":
            _decision_record(db, user, ev)
        letter(db, user, ev)
    return db.get(EmployeeLifecycle, ev.id)


def _decision_record(db, user, ev) -> None:
    """HR-CHG-002 (L2): requested by the initiator, with the deciding approval reused when it is a different person."""
    initiator = _emp(db, ev.organization_id, ev.initiated_by) if ev.initiated_by else user
    prior = [{"approver_id": ev.hr_approved_by or ev.approved_by, "decided_at": datetime.utcnow(), "source": "transfer decision"}]
    doc = _try_generate(db, initiator, canonical_id="HR-CHG-002", subject_type="employee", subject_id=ev.employee_id,
                        source_ref=f"employee_lifecycle:{ev.id}", trigger="transfer.decided", issue=False, prior_approvals=prior)
    if doc is not None and doc.status == "HUMAN_APPROVED":
        try:
            doc_service.issue(db, doc, user, system_trigger="transfer.decided")
        except HTTPException:
            db.rollback()


def letter(db, approver, ev: EmployeeLifecycle, cid: Optional[str] = None, **kw):
    """The letter that communicates an approved change. L2 letters are requested by the initiator with the approval reused."""
    cid = cid or LETTER_FOR[ev.event_type]
    if cid == "HR-CHG-004" and ev.linked_salary_revision_id:
        kw.setdefault("min_sensitivity", "C3")          # a promotion letter with a pay section is a compensation document
    from app.modules.doc_templates.models import TemplateDefinition
    d = db.get(TemplateDefinition, cid)
    trigger = f"employee_lifecycle.{ev.event_type}"
    if d is not None and d.approval_policy in ("L2", "L3") and ev.initiated_by and ev.initiated_by != approver.id:
        initiator = _emp(db, ev.organization_id, ev.initiated_by)
        prior = [{"approver_id": approver.id, "decided_at": datetime.utcnow(), "source": "lifecycle approval"}]
        doc = _try_generate(db, initiator, canonical_id=cid, subject_type="employee", subject_id=ev.employee_id,
                            source_ref=f"employee_lifecycle:{ev.id}", trigger=trigger, issue=False, prior_approvals=prior, **kw)
        if doc is not None and doc.status == "HUMAN_APPROVED":
            try:
                doc = doc_service.issue(db, doc, approver, system_trigger=trigger)
            except HTTPException:
                db.rollback()
    else:
        doc = _try_generate(db, approver, canonical_id=cid, subject_type="employee", subject_id=ev.employee_id,
                            source_ref=f"employee_lifecycle:{ev.id}", trigger=trigger, **kw)
    if doc is not None:
        ev = db.get(EmployeeLifecycle, ev.id)
        ev.documents = list(ev.documents or []) + [{"canonical_id": cid, "document_id": doc.id}]
        db.commit()
        if ev.event_type == "manager_change":
            _notify_managers(db, ev)
    return doc


def _notify_managers(db, ev) -> None:
    """The old and new manager are told a reporting line changed: the reference only, no other details."""
    from app.services import email_service
    from app.modules.doc_templates import notify
    for mid in {(ev.previous_value or {}).get("manager_id"), (ev.new_value or {}).get("manager_id")} - {None}:
        from app.modules.employee.models import Employee
        m = db.get(Employee, mid)
        if m is None or not (m.work_email or m.email):
            continue
        try:
            email_service.send_reporting_line_changed_email(m.work_email or m.email, m.first_name or "there", f"CHG-{ev.id:05d}",
                                                            notify.app_url("/zoiko-hr"), db=db, organization_id=ev.organization_id)
        except Exception:
            logger.warning("reporting-line notice failed for change %s", ev.id)


# ── completion (the only step that changes the employee record) ─────────────────────────────────────────────────────

def complete(db, user, ev: EmployeeLifecycle) -> EmployeeLifecycle:
    access.require_hr(user)
    if ev.organization_id != user.organization_id:
        raise HTTPException(404, "Change not found")
    if ev.status != "approved":
        raise HTTPException(409, "Only an approved change can be completed.")
    if ev.effective_date and ev.effective_date > date.today():
        raise HTTPException(409, f"This change takes effect on {ev.effective_date.isoformat()}; complete it on or after that date.")
    emp = _emp(db, ev.organization_id, ev.employee_id)
    nv, changed = ev.new_value or {}, []
    for field, key in (("department_id", "department_id"), ("reporting_manager_id", "manager_id"), ("designation_id", "designation_id"),
                       ("work_city", "work_city")):
        if nv.get(key) is not None and getattr(emp, field) != nv[key]:
            changed.append((field, getattr(emp, field), nv[key]))
            setattr(emp, field, nv[key])
    if nv.get("title") and not nv.get("designation_id") and emp.job_title != nv["title"]:
        changed.append(("job_title", emp.job_title, nv["title"]))
        emp.job_title = nv["title"]
    for field, old, new in changed:
        db.add(EmployeeHistory(employee_id=emp.id, organization_id=emp.organization_id, field_name=field,
                               old_value=None if old is None else str(old), new_value=str(new), changed_by=user.id,
                               change_reason=f"Lifecycle change {ev.id} ({ev.event_type}) completed"))
    ev.status, ev.completed_by, ev.completed_at = "completed", user.id, datetime.utcnow()
    db.commit()
    return ev


# ── engine context ───────────────────────────────────────────────────────────────────────────────────────────────────

def _variation(ev, emp) -> bool:
    nv = ev.new_value or {}
    if any(k in nv for k in VARIATION_KEYS):
        return True
    for key in ("work_country", "work_region"):
        if nv.get(key) and nv[key] != getattr(emp, key, None):
            return True
    return False


def _change_context(ctx) -> None:
    ev = ctx.source
    if ev is None or type(ev).__name__ != "EmployeeLifecycle" or ev.employee_id != getattr(ctx.subject, "id", None):
        ctx.denials.append("CHANGE_SOURCE_MISMATCH")
        return
    db, cid = ctx.db, ctx.canonical_id
    pv, nv = ev.previous_value or {}, ev.new_value or {}
    if cid != "HR-CHG-001" and cid != "HR-CHG-002" and ev.status not in ("approved", "completed"):
        ctx.denials.append("CHANGE_NOT_APPROVED")
    if cid in ("HR-CHG-004", "HR-CHG-006", "HR-CHG-007", "HR-CHG-008") and _variation(ev, ctx.subject):
        ctx.denials.append("CONTRACT_VARIATION_REQUIRED")
    e = ctx.extra
    e.update({
        "change.effective_date": ev.effective_date, "change.previous_title": pv.get("title"), "change.new_title": nv.get("title") or pv.get("title"),
        "change.new_grade": nv.get("new_grade"), "change.new_manager": nv.get("manager") or pv.get("manager"),
        "change.previous_manager": pv.get("manager"), "change.department": nv.get("department") or pv.get("department"),
        "change.previous_department": pv.get("department"), "change.new_department": nv.get("department"),
        "change.new_responsibilities": [x for x in (nv.get("new_responsibilities") or []) if isinstance(x, str) and x.strip()] or None,
        "change.reason_statement": nv.get("reason_statement"), "change.duties_changed": bool(nv.get("duties_changed")),
        "change.work_location": ", ".join(x for x in (nv.get("work_city") or pv.get("work_city"), pv.get("work_country")) if x) or None,
        "change.working_pattern": "Unchanged",
    })
    if nv.get("manager_id"):
        from app.modules.employee.models import Employee
        m = db.get(Employee, nv["manager_id"])
        e["change.new_manager_title"] = (m.job_title if m else None) or "your manager"
    if cid == "HR-CHG-004":
        e["change.has_pay"] = False
        if ev.linked_salary_revision_id:
            rev = db.get(SalaryRevision, ev.linked_salary_revision_id)
            if rev is None or rev.status not in ("APPROVED", "COMMUNICATED"):
                ctx.denials.append("LINKED_COMPENSATION_NOT_APPROVED")
            else:
                money = lambda v: f"{formatting.format_money(v, rev.currency, ctx.language, ctx.country()).split(' ', 1)[-1]} {rev.currency or ''}".strip()  # noqa: E731
                e["change.has_pay"] = True
                e["change.pay_rows"] = [[money(rev.old_salary) if rev.old_salary is not None else "", money(rev.new_salary),
                                         formatting.format_date(rev.effective_date, ctx.language, ctx.country())]]
    if cid in ("HR-CHG-001", "HR-CHG-002"):
        ctx.form_values = {"current_role": pv.get("title"), "current_department": pv.get("department"),
                           "requested_department": nv.get("department"), "requested_role": nv.get("requested_role"),
                           "requested_location": nv.get("requested_location"),
                           "preferred_start": formatting.format_date(ev.effective_date, ctx.language, ctx.country()) if ev.effective_date else None,
                           "reason": ev.reason, "manager_informed": "Yes" if nv.get("manager_informed") else "No",
                           "supporting_information": nv.get("supporting_information")}
        refused = ev.status == "rejected"
        e.update({"change.from_summary": " · ".join(x for x in (pv.get("department"), pv.get("title"), pv.get("manager")) if x) or None,
                  "change.to_summary": " · ".join(x for x in (nv.get("department"), nv.get("title") or pv.get("title"), nv.get("manager")) if x) or None,
                  "change.decision_label": "Refused" if refused else ("Approved" if ev.status in ("approved", "completed") else None),
                  "change.is_refused": refused, "change.decided_by": _name(db, ev.approved_by),
                  "change.hr_approved_by": _name(db, ev.hr_approved_by), "change.decided_at": ev.hr_approved_at or ev.approved_at,
                  "change.decision_reason": ev.decision_comment})
        if cid == "HR-CHG-002" and ev.status not in ("approved", "rejected", "completed"):
            ctx.denials.append("CHANGE_NOT_DECIDED")


hooks.context(CHG_IDS, _change_context)


def serialize(db, ev: EmployeeLifecycle) -> dict:
    return {"id": ev.id, "employee_id": ev.employee_id, "employee_name": _name(db, ev.employee_id), "event_type": ev.event_type,
            "status": ev.status, "effective_date": ev.effective_date, "previous_value": ev.previous_value, "new_value": ev.new_value,
            "reason": ev.reason, "initiated_by": ev.initiated_by, "approved_by": ev.approved_by, "hr_approved_by": ev.hr_approved_by,
            "decision_comment": ev.decision_comment, "linked_salary_revision_id": ev.linked_salary_revision_id,
            "completed_at": ev.completed_at, "documents": ev.documents or [], "needs_second_approval": ev.event_type in TWO_STEP
            and ev.status == "pending" and ev.approved_by is not None}


def bulk_manager_change(db, user, employee_ids: list[int], new_manager_id: int, effective_date: date, reason: Optional[str],
                        *, preview: bool) -> dict:
    """A reorganisation of reporting lines: one manager_change request per person, previewed first."""
    access.require_hr(user)
    ids = list(dict.fromkeys(int(i) for i in employee_ids))[:500]
    _emp(db, user.organization_id, new_manager_id)
    if preview:
        out = []
        for eid in ids:
            r = preflight.run_preflight(db, organization_id=user.organization_id, actor=user, canonical_id="HR-CHG-008", subject_type="employee",
                                        subject_id=eid, organization=user.organization)
            reasons = [x for x in r.reasons if not x.startswith(("MISSING_FIELD:change.", "CHANGE_"))]
            out.append({"employee_id": eid, "outcome": "ALLOW" if not reasons else r.outcome, "reasons": reasons})
        return {"preview": True, "results": out}
    made = [create_change(db, user, {"event_type": "manager_change", "employee_id": eid, "effective_date": effective_date,
                                     "new_value": {"manager_id": new_manager_id}, "reason": reason}).id for eid in ids]
    return {"preview": False, "change_ids": made}


# ── HTTP ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/hr/changes", tags=["Employment changes"])
me_router = APIRouter(prefix="/hr/me/transfer-requests", tags=["Employment changes (self-service)"])


class ChangeIn(BaseModel):
    employee_id: int
    event_type: str = Field(..., pattern="^(promotion|role_change|department_change|transfer|manager_change)$")
    effective_date: date
    new_value: dict = Field(default_factory=dict)
    reason: Optional[str] = Field(None, max_length=2000)
    reason_statement: Optional[str] = Field(None, max_length=1000)
    duties_changed: Optional[bool] = None
    new_responsibilities: Optional[list[str]] = None
    new_grade: Optional[str] = Field(None, max_length=100)
    linked_salary_revision_id: Optional[int] = None


class DecisionIn(BaseModel):
    approve: bool
    comment: Optional[str] = Field(None, max_length=2000)


class TransferIn(BaseModel):
    requested_department_id: int
    requested_designation_id: Optional[int] = None
    requested_role: Optional[str] = Field(None, max_length=150)
    requested_location: Optional[str] = Field(None, max_length=100)
    preferred_start: Optional[date] = None
    reason: str = Field(..., min_length=3, max_length=2000)
    manager_informed: bool = False
    supporting_information: Optional[str] = Field(None, max_length=2000)


class BulkManagerIn(BaseModel):
    employee_ids: list[int] = Field(..., min_length=1, max_length=500)
    new_manager_id: int
    effective_date: date
    reason: Optional[str] = Field(None, max_length=1000)
    preview: bool = True


def _event(db, user, event_id: int) -> EmployeeLifecycle:
    ev = db.get(EmployeeLifecycle, event_id)
    if ev is None or ev.organization_id != user.organization_id:
        raise HTTPException(404, "Change not found")
    role = access.role_of(user)
    if role in ("admin", "hr_admin") or ev.employee_id == user.id or ev.initiated_by == user.id:
        return ev
    if role == "manager":
        return ev                    # a manager may decide as the receiving manager; the decision itself checks the rules
    raise HTTPException(404, "Change not found")


@router.get("")
def list_changes(status: Optional[str] = None, employee_id: Optional[int] = None, db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = db.query(EmployeeLifecycle).filter(EmployeeLifecycle.organization_id == user.organization_id,
                                           EmployeeLifecycle.event_type.in_(list(CHANGE_TYPES) + ["probation_extended", "confirmation",
                                                                                                    "probation_end"]))
    if not access.is_hr(user):
        if access.role_of(user) != "manager":
            raise HTTPException(404, "Not found")
        q = q.filter(EmployeeLifecycle.employee_id.in_(list(access.report_ids(db, user)) or [-1]))
    if status:
        q = q.filter(EmployeeLifecycle.status == status)
    if employee_id:
        q = q.filter(EmployeeLifecycle.employee_id == employee_id)
    return {"items": [serialize(db, e) for e in q.order_by(EmployeeLifecycle.id.desc()).limit(500).all()]}


@router.post("", status_code=201)
def new_change(body: ChangeIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return serialize(db, create_change(db, user, body.model_dump()))


@router.post("/bulk-manager-change")
def bulk_manager(body: BulkManagerIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return bulk_manager_change(db, user, body.employee_ids, body.new_manager_id, body.effective_date, body.reason, preview=body.preview)


@router.post("/{event_id}/decision")
def change_decision(event_id: int, body: DecisionIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return serialize(db, decide(db, user, _event(db, user, event_id), approve=body.approve, comment=body.comment))


@router.post("/{event_id}/complete")
def change_complete(event_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return serialize(db, complete(db, user, _event(db, user, event_id)))


@router.get("/{event_id}/documents")
def change_documents(event_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    ev = _event(db, user, event_id)
    out = documents_for_source(db, user.organization_id, f"employee_lifecycle:{ev.id}")
    if not access.is_hr(user):
        from app.modules.doc_templates.models import GeneratedDocument
        ok = {d.id for d in db.query(GeneratedDocument).filter(GeneratedDocument.source_ref == f"employee_lifecycle:{ev.id}").all()
              if access.can_view(db, user, d)}
        out = {"documents": [d for d in out["documents"] if d["id"] in ok], "blocked": []}
    return out


@me_router.get("")
def my_transfer_requests(db: Session = Depends(get_db), user=Depends(get_current_user)):
    rows = (db.query(EmployeeLifecycle).filter(EmployeeLifecycle.organization_id == user.organization_id, EmployeeLifecycle.employee_id == user.id,
                                               EmployeeLifecycle.event_type == "transfer").order_by(EmployeeLifecycle.id.desc()).all())
    return {"items": [serialize(db, e) for e in rows]}


@me_router.post("", status_code=201)
def new_transfer_request(body: TransferIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return serialize(db, request_transfer(db, user, body.model_dump()))
