"""Compensation decisions and letters (Prompt 3 §D): HR-CMP-001 / 002 / 005 / 010 / 024. All are C3.

* Who sees them: the employee, HR roles, and the approver; managers only when the organization switches on
  `compensation.managers_see_reports` (default off) and only for their reports. Field snapshots and files are encrypted at
  rest by the engine (C3); e-mails only say that a compensation document is available.
* Salary revisions: DRAFT → PENDING_APPROVAL → APPROVED / REJECTED → COMMUNICATED (once HR-CMP-005 is issued). The approver is
  an organization admin or an authorised signatory whose scope covers compensation, never the requester or the employee.
  HR-CMP-005 refuses a decrease (salary reduction is HR-CMP-006, out of scope) and is not produced for corrections.
* Allowance awards: PENDING_APPROVAL → APPROVED → COMMUNICATED (HR-CMP-010), same approver rules.
* Expense claims (HR-CMP-024): the approver is never the claimant; above `compensation.expense_second_approval_threshold` a
  second, different approver decides. Items over the travel policy limit are flagged.
* Payroll is out of scope. Approved changes reach payroll only as the ID-only event `compensation.change.approved`.
"""
from __future__ import annotations

import logging
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database import get_db
from app.modules.doc_templates import access, approvals, formatting, hooks, preflight, registry, service as doc_service
from app.modules.doc_templates.models import GeneratedDocument
from app.modules.hr import work_settings
from app.modules.hr.models import (Allowance, Benefit, CompensationStatementRequest, EmployeeBenefit, EmployeeCompensation,
                                   PayGrade, RequestStatus, SalaryRevision, StructureComponent, SalaryComponent, TravelExpense,
                                   TravelPolicy, TravelRequest, TravelSetting)
from app.modules.hr.recruitment_documents import _try_generate, documents_for_source

logger = logging.getLogger("zoiko.doc_templates")

CONFIRMATION, STATEMENT, INCREASE, ALLOWANCE, EXPENSE = "HR-CMP-001", "HR-CMP-002", "HR-CMP-005", "HR-CMP-010", "HR-CMP-024"
REVISION_TYPES = {"initial": "your initial salary", "annual_review": "your annual review", "merit": "a merit review",
                  "promotion": "your promotion", "market_adjustment": "a market adjustment", "correction": "a correction"}
PERIODS = {"annual": "per year", "monthly": "per month", "weekly": "per week", "hourly": "per hour"}
FREQUENCIES = {"monthly": "Monthly", "semi_monthly": "Twice a month", "biweekly": "Every two weeks", "weekly": "Weekly",
               "annual": "Annually", "one_time": "One-off"}
ANNUAL_FACTOR = {"annual": 1, "monthly": 12, "weekly": 52, "one_time": 1}
COMPENSATION_SCOPE = "HR-CMP"


# ── access ───────────────────────────────────────────────────────────────────────────────────────────────────────────

def managers_see_reports(db, organization_id: int) -> bool:
    return bool(work_settings.get(db, organization_id, "compensation.managers_see_reports"))


def require_compensation_hr(user) -> None:
    access.require_hr(user)


def is_compensation_approver(db, user, organization_id: int) -> bool:
    """An organization admin, or an authorised signatory whose scope covers compensation (HR-CMP)."""
    if access.role_of(user) == "admin":
        return True
    from app.modules.doc_templates.models import AuthorisedSignatory
    sigs = db.query(AuthorisedSignatory).filter(AuthorisedSignatory.organization_id == organization_id,
                                                AuthorisedSignatory.employee_id == user.id).all()
    return any(approvals.signatory_covers(s, INCREASE, COMPENSATION_SCOPE, "L2") for s in sigs)


def _check_approver(db, user, *, employee_id: int, requested_by: Optional[int]) -> None:
    if not is_compensation_approver(db, user, user.organization_id):
        raise HTTPException(403, "Only an organization admin or an authorised signatory for compensation can approve this.")
    if user.id in (employee_id, requested_by):
        raise HTTPException(403, {"code": "SEPARATION_OF_DUTIES",
                                  "message": "The approver must be a different person from the requester and the employee."})


def _employee(db, organization_id: int, employee_id: int):
    from app.modules.employee.models import Employee
    e = db.get(Employee, employee_id)
    if e is None or e.organization_id != organization_id:
        raise HTTPException(404, "Employee not found")
    return e


def _emit(db, name: str, payload: dict, organization_id: int) -> None:
    try:
        from app.modules.integrations.events import emit_event
        emit_event(db, name, payload, organization_id)
    except Exception:
        logger.warning("compensation event %s failed for organization %s", name, organization_id)


def _amount(v, currency, ctx) -> Optional[str]:
    if v is None:
        return None
    text = formatting.format_money(v, currency, ctx.language, ctx.country())
    return text.split(" ", 1)[1] if " " in text else text


def _money(v, currency, ctx) -> Optional[str]:
    a = _amount(v, currency, ctx)
    return f"{a} {currency}".strip() if a and currency else a


# ── current pay (latest approved revision, else the compensation record) ────────────────────────────────────────────

APPROVED_REVISION = ("APPROVED", "COMMUNICATED")


def current_compensation(db, employee_id: int) -> Optional[EmployeeCompensation]:
    return (db.query(EmployeeCompensation).filter(EmployeeCompensation.employee_id == employee_id)
            .order_by(EmployeeCompensation.effective_date.desc(), EmployeeCompensation.id.desc()).first())


def current_base(db, employee_id: int, on: Optional[date] = None, *, exclude_id: Optional[int] = None) -> tuple[Optional[Decimal], Optional[str]]:
    on = on or date.today()
    comp = current_compensation(db, employee_id)
    q = db.query(SalaryRevision).filter(SalaryRevision.employee_id == employee_id, SalaryRevision.effective_date <= on,
                                        (SalaryRevision.status.in_(APPROVED_REVISION)) | (SalaryRevision.status.is_(None)))
    if exclude_id:
        q = q.filter(SalaryRevision.id != exclude_id)
    rev = q.order_by(SalaryRevision.effective_date.desc(), SalaryRevision.id.desc()).first()
    if rev is not None:
        return Decimal(rev.new_salary), rev.currency or getattr(comp, "currency", None)
    if comp is not None and comp.base_amount is not None:
        return Decimal(comp.base_amount), comp.currency
    return None, getattr(comp, "currency", None)


# ── salary revisions (HR-CMP-005) ────────────────────────────────────────────────────────────────────────────────────

def _ser_revision(r: SalaryRevision) -> dict:
    return {"id": r.id, "employee_id": r.employee_id, "employee_compensation_id": r.employee_compensation_id,
            "old_salary": float(r.old_salary) if r.old_salary is not None else None, "new_salary": float(r.new_salary),
            "currency": r.currency, "percentage_change": float(r.percentage_change) if r.percentage_change is not None else None,
            "effective_date": r.effective_date, "revision_type": r.revision_type, "reason": r.reason, "reason_statement": r.reason_statement,
            "status": r.status, "requested_by": r.requested_by, "approved_by": r.approved_by, "approved_at": r.approved_at,
            "decision_comment": r.decision_comment, "communicated_document_id": r.communicated_document_id, "created_at": r.created_at}


def create_revision(db, user, data: dict) -> SalaryRevision:
    require_compensation_hr(user)
    emp = _employee(db, user.organization_id, data["employee_id"])
    comp = current_compensation(db, emp.id)
    if comp is None:
        raise HTTPException(409, "Record the employee's compensation before revising it.")
    if data.get("revision_type") not in REVISION_TYPES:
        raise HTTPException(422, f"revision_type must be one of {', '.join(REVISION_TYPES)}.")
    previous, currency = current_base(db, emp.id, data["effective_date"])
    new = Decimal(str(data["new_salary"]))
    if new <= 0:
        raise HTTPException(422, "The new salary must be more than zero.")
    pct = ((new - previous) / previous * 100).quantize(Decimal("0.01"), ROUND_HALF_UP) if previous else None
    r = SalaryRevision(employee_compensation_id=comp.id, employee_id=emp.id, organization_id=user.organization_id, old_salary=previous,
                       new_salary=new, effective_date=data["effective_date"], reason=(data.get("reason") or "").strip() or None,
                       reason_statement=(data.get("reason_statement") or "").strip() or None, revision_type=data["revision_type"],
                       currency=(data.get("currency") or currency or getattr(user.organization, "currency", None)),
                       percentage_change=pct, status="DRAFT", requested_by=user.id)
    db.add(r)
    db.commit()
    return r


def submit_revision(db, user, r: SalaryRevision) -> SalaryRevision:
    require_compensation_hr(user)
    if r.status != "DRAFT":
        raise HTTPException(409, "Only a draft revision can be submitted.")
    r.status = "PENDING_APPROVAL"
    db.commit()
    return r


def decide_revision(db, user, r: SalaryRevision, *, approve: bool, comment: Optional[str]) -> SalaryRevision:
    _check_approver(db, user, employee_id=r.employee_id, requested_by=r.requested_by)
    if r.status != "PENDING_APPROVAL":
        raise HTTPException(409, "Only a revision waiting for approval can be decided.")
    if not approve and not (comment or "").strip():
        raise HTTPException(422, "Give a reason for rejecting the revision.")
    r.status = "APPROVED" if approve else "REJECTED"
    r.approved_by, r.approved_at, r.decision_comment = user.id, datetime.utcnow(), (comment or "").strip() or None
    db.commit()
    if not approve:
        return r
    _emit(db, "compensation.change.approved", {"id": r.id, "type": "salary_revision", "employee_id": r.employee_id,
                                               "effective_date": r.effective_date.isoformat()}, r.organization_id)
    if r.revision_type != "correction":
        requester = _employee(db, r.organization_id, r.requested_by) if r.requested_by else None
        _letter(db, requester, user, INCREASE, r.employee_id, f"salary_revision:{r.id}", "salary_revision.approved")
    return db.get(SalaryRevision, r.id)


def _letter(db, requester, approver, cid, employee_id, source_ref, trigger) -> Optional[GeneratedDocument]:
    """Generate a C3 letter requested by `requester` with the module approval applied (so the two people are distinct), then
    issue it. If the approval cannot be reused (e.g. the approver is also the subject), it waits in the approvals queue."""
    if requester is None:
        return None
    prior = [{"approver_id": approver.id, "decided_at": datetime.utcnow(), "comment": "Approved in compensation", "source": "compensation"}]
    doc = _try_generate(db, requester, canonical_id=cid, subject_type="employee", subject_id=employee_id, source_ref=source_ref,
                        trigger=trigger, issue=False, prior_approvals=prior)
    if doc is not None and doc.status in ("HUMAN_APPROVED", "RENDERED_DRAFT"):
        try:
            doc = doc_service.issue(db, doc, approver, system_trigger=trigger)
        except HTTPException:
            db.rollback()
    return doc


def _on_increase_issued(db, doc) -> None:
    kind, _, rid = (doc.source_ref or "").partition(":")
    if kind == "salary_revision":
        r = db.get(SalaryRevision, int(rid))
        if r is not None and r.status == "APPROVED":
            r.status, r.communicated_document_id = "COMMUNICATED", doc.id
            db.commit()
    elif kind == "allowance":
        a = db.get(Allowance, int(rid))
        if a is not None and a.status == "APPROVED":
            a.status, a.document_id = "COMMUNICATED", doc.id
            db.commit()
    elif kind == "employee_compensation":
        c = db.get(EmployeeCompensation, int(rid))
        if c is not None:
            c.document_id = doc.id
            db.commit()


hooks.on("issued", [INCREASE, ALLOWANCE, CONFIRMATION], _on_increase_issued)


def _revision_context(ctx) -> None:
    r = ctx.source
    if r is None or type(r).__name__ != "SalaryRevision" or r.employee_id != getattr(ctx.subject, "id", None):
        ctx.denials.append("REVISION_SOURCE_MISMATCH")
        return
    if r.status not in APPROVED_REVISION:
        ctx.denials.append("REVISION_NOT_APPROVED")
    if r.revision_type == "correction":
        ctx.denials.append("REVISION_IS_A_CORRECTION")
    if r.old_salary is not None and Decimal(r.new_salary) < Decimal(r.old_salary):
        ctx.denials.append("SALARY_DECREASE_NOT_ALLOWED")      # a reduction is HR-CMP-006 (Tier 3), never an "increase" letter
    cur = r.currency
    pct = f"{Decimal(r.percentage_change):+.2f}%" if r.percentage_change is not None else ""
    prev = _money(r.old_salary, cur, ctx)
    new = _money(r.new_salary, cur, ctx)
    eff = formatting.format_date(r.effective_date, ctx.language, ctx.country())
    ctx.extra.update({
        "revision.previous_amount": _amount(r.old_salary, cur, ctx), "revision.new_amount": _amount(r.new_salary, cur, ctx),
        "revision.currency": cur, "revision.percentage_change": pct or None, "revision.effective_date": r.effective_date,
        "revision.type_label": REVISION_TYPES.get(r.revision_type or ""), "revision.reason_statement": r.reason_statement,
        "revision.summary_rows": [[prev or "", new or "", pct, eff]] if prev and new else None,
    })


hooks.context([INCREASE], _revision_context)


# ── allowance awards (HR-CMP-010) ────────────────────────────────────────────────────────────────────────────────────

def _ser_allowance(a: Allowance) -> dict:
    return {"id": a.id, "employee_id": a.employee_id, "allowance_type": a.allowance_type, "amount": float(a.amount), "currency": a.currency,
            "frequency": a.frequency, "effective_date": a.effective_date, "end_date": a.end_date, "review_date": a.review_date,
            "eligibility_reason": a.eligibility_reason, "conditions": a.conditions, "status": a.status, "requested_by": a.requested_by,
            "approved_by": a.approved_by, "approved_at": a.approved_at, "document_id": a.document_id}


def request_allowance(db, user, data: dict) -> Allowance:
    require_compensation_hr(user)
    emp = _employee(db, user.organization_id, data["employee_id"])
    if data.get("frequency") not in FREQUENCIES:
        raise HTTPException(422, f"frequency must be one of {', '.join(FREQUENCIES)}.")
    if not (data.get("conditions") or "").strip():
        raise HTTPException(422, "State the eligibility conditions the allowance depends on.")
    a = Allowance(employee_id=emp.id, organization_id=user.organization_id, allowance_type=data["allowance_type"].strip(),
                  amount=Decimal(str(data["amount"])), effective_date=data["effective_date"], end_date=data.get("end_date"),
                  review_date=data.get("review_date"), currency=data.get("currency") or getattr(user.organization, "currency", None),
                  frequency=data["frequency"], eligibility_reason=(data.get("eligibility_reason") or "").strip() or None,
                  conditions=data["conditions"].strip(), status="PENDING_APPROVAL", requested_by=user.id)
    db.add(a)
    db.commit()
    return a


def decide_allowance(db, user, a: Allowance, *, approve: bool, comment: Optional[str]) -> Allowance:
    _check_approver(db, user, employee_id=a.employee_id, requested_by=a.requested_by)
    if a.status != "PENDING_APPROVAL":
        raise HTTPException(409, "Only an award waiting for approval can be decided.")
    if not approve and not (comment or "").strip():
        raise HTTPException(422, "Give a reason for rejecting the award.")
    a.status = "APPROVED" if approve else "REJECTED"
    a.approved_by, a.approved_at = user.id, datetime.utcnow()
    db.commit()
    if approve:
        _emit(db, "compensation.change.approved", {"id": a.id, "type": "allowance", "employee_id": a.employee_id,
                                                   "effective_date": a.effective_date.isoformat()}, a.organization_id)
        requester = _employee(db, a.organization_id, a.requested_by) if a.requested_by else None
        _letter(db, requester, user, ALLOWANCE, a.employee_id, f"allowance:{a.id}", "allowance_award.approved")
    return db.get(Allowance, a.id)


def _allowance_context(ctx) -> None:
    a = ctx.source
    if a is None or type(a).__name__ != "Allowance" or a.employee_id != getattr(ctx.subject, "id", None):
        ctx.denials.append("ALLOWANCE_SOURCE_MISMATCH")
        return
    if a.status not in ("APPROVED", "COMMUNICATED"):
        ctx.denials.append("ALLOWANCE_NOT_APPROVED")
    ctx.extra.update({
        "allowance.name": a.allowance_type, "allowance.start_date": a.effective_date, "allowance.amount": _amount(a.amount, a.currency, ctx),
        "allowance.currency": a.currency, "allowance.amount_summary": _money(a.amount, a.currency, ctx),
        "allowance.frequency_label": FREQUENCIES.get(a.frequency or ""), "allowance.end_or_review_date": a.end_date or a.review_date,
        "allowance.eligibility_reason": a.eligibility_reason, "allowance.conditions": a.conditions,
    })


hooks.context([ALLOWANCE], _allowance_context)


# ── initial salary confirmation (HR-CMP-001) and total reward statement (HR-CMP-002) ─────────────────────────────────

def _components(db, ctx, employee_id: int, comp: Optional[EmployeeCompensation]) -> tuple[list, Decimal]:
    base, cur = current_base(db, employee_id)
    rows, annual = [], Decimal(0)
    if base is not None:
        period = getattr(comp, "pay_period", None) or "annual"
        rows.append(["Base salary", _money(base, cur, ctx) or "", PERIODS.get(period, period)])
        annual += base * {"annual": 1, "monthly": 12, "weekly": 52}.get(period, 0)
    today = date.today()
    for a in db.query(Allowance).filter(Allowance.employee_id == employee_id, Allowance.effective_date <= today).all():
        if (a.status not in (None, "APPROVED", "COMMUNICATED")) or (a.end_date and a.end_date < today):
            continue
        rows.append([a.allowance_type, _money(a.amount, a.currency or cur, ctx) or "", FREQUENCIES.get(a.frequency or "", a.frequency or "")])
        annual += Decimal(a.amount) * ANNUAL_FACTOR.get(a.frequency or "", 0)
    if comp is not None and comp.structure_id:
        for sc, comp_def in (db.query(StructureComponent, SalaryComponent).join(SalaryComponent, SalaryComponent.id == StructureComponent.component_id)
                             .filter(StructureComponent.structure_id == comp.structure_id).all()):
            if comp_def.component_type in ("earning", "allowance") and sc.amount_or_formula and comp_def.name.lower() != "base salary":
                rows.append([comp_def.name, sc.amount_or_formula, "as set out in your pay structure"])
    return rows, annual


def _confirmation_context(ctx) -> None:
    c = ctx.source
    if c is None or type(c).__name__ != "EmployeeCompensation" or c.employee_id != getattr(ctx.subject, "id", None):
        ctx.denials.append("COMPENSATION_SOURCE_MISMATCH")
        return
    grade = ctx.db.get(PayGrade, c.pay_grade_id) if c.pay_grade_id else None
    rows, annual = _components(ctx.db, ctx, c.employee_id, c)
    base = c.base_amount
    ctx.extra.update({
        "comp.base_amount": _amount(base, c.currency, ctx), "comp.currency": c.currency,
        "comp.pay_period_label": PERIODS.get(c.pay_period or ""), "comp.pay_frequency_label": FREQUENCIES.get(c.pay_frequency or ""),
        "comp.base_summary": " ".join(x for x in (_amount(base, c.currency, ctx), c.currency, PERIODS.get(c.pay_period or "")) if x) or None,
        "comp.effective_date": c.effective_date, "comp.pay_grade": grade.name if grade else None,
        "comp.components": rows or None, "comp.annual_total": _money(annual, c.currency, ctx) if annual else None,
    })


hooks.context([CONFIRMATION], _confirmation_context)


def after_compensation_created(db, actor, comp: EmployeeCompensation) -> Optional[GeneratedDocument]:
    """The first compensation record of an employee produces HR-CMP-001 (L2: waits for an approver who is not the requester)."""
    earlier = db.query(EmployeeCompensation.id).filter(EmployeeCompensation.employee_id == comp.employee_id,
                                                       EmployeeCompensation.id != comp.id).first()
    if earlier is not None or actor is None:
        return None
    return _try_generate(db, actor, canonical_id=CONFIRMATION, subject_type="employee", subject_id=comp.employee_id,
                         source_ref=f"employee_compensation:{comp.id}", trigger="employee_compensation.created")


def _statement_context(ctx) -> None:
    s = ctx.source
    if s is None or type(s).__name__ != "CompensationStatementRequest" or s.employee_id != getattr(ctx.subject, "id", None):
        ctx.denials.append("STATEMENT_SOURCE_MISMATCH")
        return
    comp = current_compensation(ctx.db, s.employee_id)
    rows, annual = _components(ctx.db, ctx, s.employee_id, comp)
    cur = getattr(comp, "currency", None) or ctx.currency()
    benefits = []
    for eb, b in (ctx.db.query(EmployeeBenefit, Benefit).join(Benefit, Benefit.id == EmployeeBenefit.benefit_id)
                  .filter(EmployeeBenefit.employee_id == s.employee_id).all()):
        if eb.coverage_end_date and eb.coverage_end_date < date.today():
            continue
        benefits.append([b.name, eb.provider or "", eb.employer_contribution or "", eb.employee_contribution or ""])
    ctx.extra.update({"comp.statement_period": s.period_label, "comp.components": rows or None, "comp.benefits": benefits or None,
                      "comp.total_value": _money(annual, cur, ctx) if annual else None})


hooks.context([STATEMENT], _statement_context)


def request_statement(db, user, employee_id: int, period_label: str, *, source: str) -> Optional[GeneratedDocument]:
    s = CompensationStatementRequest(organization_id=user.organization_id, employee_id=employee_id, period_label=period_label[:40],
                                     requested_by=user.id, source=source)
    db.add(s)
    db.commit()
    doc = _try_generate(db, user, canonical_id=STATEMENT, subject_type="employee", subject_id=employee_id,
                        source_ref=f"compensation_statement:{s.id}", trigger="compensation.statement_requested")
    if doc is not None:
        s = db.get(CompensationStatementRequest, s.id)
        s.document_id = doc.id
        db.commit()
    return doc


def statement_run(db, user, employee_ids: list[int], period_label: str, *, preview: bool) -> dict:
    require_compensation_hr(user)
    ids = list(dict.fromkeys(int(i) for i in employee_ids))[:200]
    results = []
    for eid in ids:
        _employee(db, user.organization_id, eid)
        if preview:
            r = preflight.run_preflight(db, organization_id=user.organization_id, actor=user, canonical_id=STATEMENT, subject_type="employee",
                                        subject_id=eid, organization=user.organization)
            reasons = [x for x in r.reasons if not x.startswith(("MISSING_FIELD:comp.statement_period", "STATEMENT_"))]
            results.append({"employee_id": eid, "outcome": "ALLOW" if not reasons else r.outcome, "reasons": reasons})
        else:
            doc = request_statement(db, user, eid, period_label, source="annual_run")
            results.append({"employee_id": eid, "document_id": doc.id if doc else None, "status": doc.status if doc else "BLOCKED"})
    return {"preview": preview, "results": results}


# ── expense claims (HR-CMP-024) ──────────────────────────────────────────────────────────────────────────────────────

def _limit(db, organization_id: int) -> Optional[Decimal]:
    s = db.query(TravelSetting).filter(TravelSetting.organization_id == organization_id).first()
    pols = db.query(TravelPolicy).filter(TravelPolicy.organization_id == organization_id, TravelPolicy.is_active.is_(True)).all()
    limits = [Decimal(p.max_daily_allowance) for p in pols if p.max_daily_allowance is not None]
    if s is not None and s.expense_limit_per_day is not None:
        limits.append(Decimal(s.expense_limit_per_day))
    return min(limits) if limits else None


def _within_policy(db, e: TravelExpense) -> Optional[bool]:
    limit = _limit(db, e.organization_id)
    return None if limit is None else Decimal(e.amount) <= limit


def decide_expense(db, user, e: TravelExpense, *, approve: bool, approved_amount=None, reason: Optional[str] = None,
                   require_reason: bool = True) -> TravelExpense:
    """One decision on a claim. Above the organization threshold an approval needs two different approvers."""
    if user.id == e.employee_id:
        raise HTTPException(403, {"code": "SEPARATION_OF_DUTIES", "message": "You cannot approve or refuse your own claim."})
    if not (access.is_hr(user) or (access.role_of(user) == "manager" and e.employee_id in access.report_ids(db, user))):
        raise HTTPException(404, "Claim not found")
    if e.status not in (RequestStatus.PENDING, RequestStatus.IN_PROGRESS):
        raise HTTPException(409, "This claim has already been decided.")
    amount = Decimal(e.amount)
    approved = Decimal(str(approved_amount)) if approved_amount is not None else amount
    if approve and not (Decimal(0) < approved <= amount):
        raise HTTPException(422, "The approved amount must be more than zero and no more than the amount claimed.")
    if require_reason and (not approve or approved < amount) and not (reason or "").strip():
        raise HTTPException(422, "Give the reason for refusing or reducing the claim.")
    e.within_policy = _within_policy(db, e)
    threshold = work_settings.get(db, e.organization_id, "compensation.expense_second_approval_threshold")
    if approve and threshold is not None and amount > Decimal(threshold) and e.first_approver_id is None:
        e.first_approver_id, e.first_approved_at, e.status = user.id, datetime.utcnow(), RequestStatus.IN_PROGRESS
        e.approved_amount = approved
        db.commit()
        return e
    if approve and e.first_approver_id == user.id:
        raise HTTPException(403, {"code": "SEPARATION_OF_DUTIES", "message": "A second, different approver must decide this claim."})
    if approve and e.first_approver_id is not None and e.approved_amount is not None:
        approved = min(approved, Decimal(e.approved_amount))
    e.status = RequestStatus.APPROVED if approve else RequestStatus.REJECTED
    e.approved_amount = approved if approve else Decimal(0)
    e.decided_by, e.decided_at, e.decision_reason = user.id, datetime.utcnow(), (reason or "").strip() or None
    if approve:
        e.approved_at = datetime.utcnow()
    db.commit()
    doc = _try_generate(db, user, canonical_id=EXPENSE, subject_type="employee", subject_id=e.employee_id,
                        source_ref=f"travel_expense:{e.id}", trigger="travel_expense.decided")
    if doc is not None:
        e = db.get(TravelExpense, e.id)
        e.document_id = doc.id
        db.commit()
    return e


def _name(db, emp_id) -> Optional[str]:
    if not emp_id:
        return None
    from app.modules.employee.models import Employee
    p = db.get(Employee, emp_id)
    return " ".join(x for x in (p.first_name, p.last_name) if x) if p else None


def _expense_context(ctx) -> None:
    e = ctx.source
    if e is None or type(e).__name__ != "TravelExpense" or e.employee_id != getattr(ctx.subject, "id", None):
        ctx.denials.append("EXPENSE_SOURCE_MISMATCH")
        return
    if e.status not in (RequestStatus.APPROVED, RequestStatus.REJECTED, RequestStatus.COMPLETED):
        ctx.denials.append("EXPENSE_NOT_DECIDED")
    cur = e.currency
    within = {True: "Yes", False: "No", None: "Not checked"}[e.within_policy]
    items = []
    receipts = list(e.receipts or [])
    if receipts:
        for rc in receipts:
            items.append([formatting.format_date(rc.expense_date, ctx.language, ctx.country()), e.expense_type, rc.vendor_name,
                          _amount(rc.amount, cur, ctx) or "", cur or "", "Yes", within])
    else:
        day = e.submitted_at.date() if isinstance(e.submitted_at, datetime) else e.submitted_at
        items.append([formatting.format_date(day, ctx.language, ctx.country()) if day else "", e.expense_type, e.description or "",
                      _amount(e.amount, cur, ctx) or "", cur or "", "Yes" if e.receipt_url else "No", within])
    trip = ctx.db.get(TravelRequest, e.request_id) if e.request_id else None
    approved = e.status in (RequestStatus.APPROVED, RequestStatus.COMPLETED)
    ctx.extra.update({
        "claim.reference": f"EXP-{e.id:05d}", "claim.trip_reference": f"TRV-{trip.id:05d}" if trip else None,
        "claim.submitted_on": e.submitted_at, "claim.items": items, "claim.total_claimed": _money(e.amount, cur, ctx),
        "claim.total_approved": _money(e.approved_amount if e.approved_amount is not None else (e.amount if approved else 0), cur, ctx),
        "claim.decision_label": ("Approved" if e.approved_amount is None or Decimal(e.approved_amount) >= Decimal(e.amount) else
                                 "Partly approved") if approved else ("Refused" if e.status == RequestStatus.REJECTED else None),
        "claim.decided_by": _name(ctx.db, e.decided_by), "claim.decided_at": e.decided_at, "claim.decision_reason": e.decision_reason,
        "claim.second_approver": None,
    })
    if e.first_approver_id:
        ctx.extra["claim.decided_by"] = _name(ctx.db, e.first_approver_id)
        ctx.extra["claim.second_approver"] = _name(ctx.db, e.decided_by)


hooks.context([EXPENSE], _expense_context)


# ── manager visibility (setting, default off) ────────────────────────────────────────────────────────────────────────

def manager_may_view(db, user, doc: GeneratedDocument) -> bool:
    return (doc.family_id in registry.COMPENSATION_FAMILIES and access.role_of(user) == "manager" and doc.subject_type == "employee"
            and doc.status in access.POST_ISSUE and managers_see_reports(db, user.organization_id)
            and doc.subject_id in access.report_ids(db, user))


# ── HTTP ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/hr/compensation-documents", tags=["Compensation documents"])
me_router = APIRouter(prefix="/hr/me/compensation", tags=["Compensation (self-service)"])


class RevisionIn(BaseModel):
    employee_id: int
    new_salary: Decimal = Field(..., gt=0)
    effective_date: date
    revision_type: str = Field(..., pattern="^(initial|annual_review|merit|promotion|market_adjustment|correction)$")
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    reason: Optional[str] = Field(None, max_length=2000)
    reason_statement: Optional[str] = Field(None, max_length=1000)


class DecisionIn(BaseModel):
    approve: bool
    comment: Optional[str] = Field(None, max_length=2000)


class AllowanceIn(BaseModel):
    employee_id: int
    allowance_type: str = Field(..., min_length=2, max_length=100)
    amount: Decimal = Field(..., gt=0)
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    frequency: str = Field(..., pattern="^(monthly|annual|weekly|one_time)$")
    effective_date: date
    end_date: Optional[date] = None
    review_date: Optional[date] = None
    eligibility_reason: Optional[str] = Field(None, max_length=1000)
    conditions: str = Field(..., min_length=3, max_length=1000)


class ExpenseDecisionIn(BaseModel):
    approve: bool
    approved_amount: Optional[Decimal] = None
    reason: Optional[str] = Field(None, max_length=2000)


class StatementRunIn(BaseModel):
    employee_ids: list[int] = Field(..., min_length=1, max_length=200)
    period_label: str = Field(..., min_length=2, max_length=40)
    preview: bool = True


class StatementIn(BaseModel):
    period_label: Optional[str] = Field(None, max_length=40)


def _org_row(db, user, model, rid):
    row = db.get(model, rid)
    if row is None or row.organization_id != user.organization_id:
        raise HTTPException(404, "Not found")
    return row


@router.get("/revisions")
def list_revisions(status: Optional[str] = None, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not (access.is_hr(user) or is_compensation_approver(db, user, user.organization_id)):
        raise HTTPException(404, "Not found")
    q = db.query(SalaryRevision).filter(SalaryRevision.organization_id == user.organization_id, SalaryRevision.status.isnot(None))
    if status:
        q = q.filter(SalaryRevision.status == status.upper())
    return {"items": [_ser_revision(r) for r in q.order_by(SalaryRevision.id.desc()).limit(500).all()]}


@router.post("/revisions", status_code=201)
def new_revision(body: RevisionIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return _ser_revision(create_revision(db, user, body.model_dump()))


@router.post("/revisions/{revision_id}/submit")
def submit(revision_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return _ser_revision(submit_revision(db, user, _org_row(db, user, SalaryRevision, revision_id)))


@router.post("/revisions/{revision_id}/decision")
def revision_decision(revision_id: int, body: DecisionIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return _ser_revision(decide_revision(db, user, _org_row(db, user, SalaryRevision, revision_id), approve=body.approve, comment=body.comment))


@router.get("/allowance-awards")
def list_awards(status: Optional[str] = None, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not (access.is_hr(user) or is_compensation_approver(db, user, user.organization_id)):
        raise HTTPException(404, "Not found")
    q = db.query(Allowance).filter(Allowance.organization_id == user.organization_id, Allowance.status.isnot(None))
    if status:
        q = q.filter(Allowance.status == status.upper())
    return {"items": [_ser_allowance(a) for a in q.order_by(Allowance.id.desc()).limit(500).all()]}


@router.post("/allowance-awards", status_code=201)
def new_award(body: AllowanceIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return _ser_allowance(request_allowance(db, user, body.model_dump()))


@router.post("/allowance-awards/{allowance_id}/decision")
def award_decision(allowance_id: int, body: DecisionIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return _ser_allowance(decide_allowance(db, user, _org_row(db, user, Allowance, allowance_id), approve=body.approve, comment=body.comment))


@router.post("/expenses/{expense_id}/decision")
def expense_decision(expense_id: int, body: ExpenseDecisionIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    e = decide_expense(db, user, _org_row(db, user, TravelExpense, expense_id), approve=body.approve,
                       approved_amount=body.approved_amount, reason=body.reason)
    return {"id": e.id, "status": getattr(e.status, "value", e.status), "approved_amount": float(e.approved_amount) if e.approved_amount is not None else None,
            "first_approver_id": e.first_approver_id, "decided_by": e.decided_by, "within_policy": e.within_policy, "document_id": e.document_id}


@router.post("/statements/run")
def run_statements(body: StatementRunIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return statement_run(db, user, body.employee_ids, body.period_label, preview=body.preview)


@router.get("/documents/{kind}/{record_id}")
def comp_documents(kind: str, record_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    model = {"salary_revision": SalaryRevision, "allowance": Allowance, "employee_compensation": EmployeeCompensation,
             "travel_expense": TravelExpense}.get(kind)
    if model is None or not access.is_hr(user):
        raise HTTPException(404, "Not found")
    row = _org_row(db, user, model, record_id)
    return documents_for_source(db, user.organization_id, f"{kind}:{row.id}")


@router.get("/settings")
def get_settings(db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    return work_settings.group(db, user.organization_id, "compensation")


@router.put("/settings")
def put_settings(body: dict, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return work_settings.save(db, user, body, "compensation")


@me_router.get("")
def my_compensation(db: Session = Depends(get_db), user=Depends(get_current_user)):
    """ESS "My compensation": the employee's own pay summary and compensation documents."""
    from app.modules.doc_templates import fields
    ctx = fields.FieldContext(db=db, organization=user.organization, subject_type="employee", subject=user)
    comp = current_compensation(db, user.id)
    rows, annual = _components(db, ctx, user.id, comp)
    docs = (db.query(GeneratedDocument).filter(GeneratedDocument.organization_id == user.organization_id,
                                               GeneratedDocument.family_id == "HR-CMP", GeneratedDocument.subject_type == "employee",
                                               GeneratedDocument.subject_id == user.id, GeneratedDocument.status.in_(access.POST_ISSUE))
            .order_by(GeneratedDocument.id.desc()).all())
    return {"components": [{"label": r[0], "amount": r[1], "frequency": r[2]} for r in rows],
            "estimated_annual_total": _money(annual, getattr(comp, "currency", None), ctx) if annual else None,
            "effective_date": getattr(comp, "effective_date", None),
            "documents": [{"id": d.id, "document_number": d.document_number, "canonical_id": d.canonical_id, "title": d.title,
                           "status": d.status, "issued_at": d.issued_at} for d in docs]}


@me_router.post("/statement")
def my_statement(body: StatementIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    period = (body.period_label or str(date.today().year)).strip()
    doc = request_statement(db, user, user.id, period, source="employee")
    if doc is None:
        raise HTTPException(409, {"code": "STATEMENT_NOT_AVAILABLE",
                                  "message": "A statement cannot be produced yet. HR has been told what is missing."})
    return {"document_id": doc.id, "status": doc.status}
