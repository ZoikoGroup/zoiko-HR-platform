"""Approval chains for generated documents and separation of duties (HR-DOC-010).

* L1: no second approver. Whoever generated the document may issue it, if they hold the role (every issue is audited).
* L2: one approver who is not the requester: hr_admin or admin; for compensation templates an admin or an authorised
  signatory whose scope covers the template.
* L3: requester + HR approver + authorised signatory: three distinct people. If the organization does not have two eligible
  people besides the requester, generation is blocked with INSUFFICIENT_APPROVERS and the admin is told how to fix it.

There is no "a senior role approves everything at once" path: every step needs its own decision by a different person.
A tenant may make a template's policy stricter (doc_template_settings.approval_overrides), never looser.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from fastapi import HTTPException

from app.modules.doc_templates import registry
from app.modules.doc_templates.models import (AuthorisedSignatory, DocTemplateSettings, GeneratedDocument,
                                              GeneratedDocumentApproval)

HOW_TO_FIX = ("Add another HR admin or organization admin, or register an authorised signatory for the employer entity "
              "(Organization → Legal entities & signatories), so that the requester, the approver and the signatory are "
              "different people.")


def effective_policy(db, organization_id: int, definition) -> str:
    policy = definition.approval_policy or definition.legal_risk or "L1"
    settings_row = db.query(DocTemplateSettings).filter(DocTemplateSettings.organization_id == organization_id).first()
    overrides = (settings_row.approval_overrides or {}) if settings_row else {}
    for key in (definition.family_id, definition.canonical_id):
        if overrides.get(key) in registry.RISKS:
            policy = registry.stricter(policy, overrides[key])
    return policy


def signatory_covers(sig: AuthorisedSignatory, canonical_id: str, family_id: str, risk: str, on: Optional[date] = None) -> bool:
    on = on or date.today()
    if sig.status != "active" or sig.valid_from > on or (sig.valid_to and sig.valid_to < on):
        return False
    if registry.RISKS.index(sig.max_risk_level) < registry.RISKS.index(risk):
        return False
    scope = sig.authority_scope or []
    return "ALL" in scope or family_id in scope or canonical_id in scope


def eligible_signatories(db, organization_id: int, entity_id: Optional[int], canonical_id: str, family_id: str, risk: str,
                         exclude: set) -> list[AuthorisedSignatory]:
    if entity_id is None:
        return []
    from app.modules.employee.models import Employee
    rows = (db.query(AuthorisedSignatory)
            .join(Employee, Employee.id == AuthorisedSignatory.employee_id)
            .filter(AuthorisedSignatory.organization_id == organization_id, AuthorisedSignatory.entity_id == entity_id,
                    Employee.is_active.is_(True))
            .order_by(AuthorisedSignatory.id).all())
    return [s for s in rows if s.employee_id not in exclude and signatory_covers(s, canonical_id, family_id, risk)]


def _people_with_roles(db, organization_id: int, roles, exclude: set) -> list[int]:
    from app.modules.employee.models import Employee, UserRole
    wanted = [UserRole(r) for r in roles]
    rows = db.query(Employee.id).filter(Employee.organization_id == organization_id, Employee.role.in_(wanted),
                                        Employee.is_active.is_(True)).order_by(Employee.id).all()
    return [r[0] for r in rows if r[0] not in exclude]


def plan_chain(db, *, organization_id: int, definition, policy: str, requester_id: int, subject_employee_id: Optional[int],
               entity_id: Optional[int]) -> tuple[list[dict], Optional[str]]:
    """The steps a document needs, or (steps, "INSUFFICIENT_APPROVERS")."""
    exclude = {requester_id} | ({subject_employee_id} if subject_employee_id else set())
    if policy == "L1":
        return [], None
    if policy == "L2":
        compensation = definition.family_id in registry.COMPENSATION_FAMILIES
        roles = ["admin"] if compensation else ["hr_admin", "admin"]
        people = set(_people_with_roles(db, organization_id, roles, exclude))
        if compensation:
            people |= {s.employee_id for s in eligible_signatories(db, organization_id, entity_id, definition.canonical_id,
                                                                     definition.family_id, definition.legal_risk, exclude)}
        step = {"step_order": 1, "step_kind": "APPROVER", "required_roles": roles + (["authorised_signatory"] if compensation else [])}
        return [step], (None if people else "INSUFFICIENT_APPROVERS")
    hr_people = set(_people_with_roles(db, organization_id, ["hr_admin", "admin"], exclude))
    signers = {s.employee_id for s in eligible_signatories(db, organization_id, entity_id, definition.canonical_id,
                                                           definition.family_id, definition.legal_risk, exclude)}
    steps = [{"step_order": 1, "step_kind": "HR_APPROVER", "required_roles": ["hr_admin", "admin"]},
             {"step_order": 2, "step_kind": "SIGNATORY", "required_roles": ["authorised_signatory"]}]
    feasible = any(h != s for h in hr_people for s in signers)
    return steps, (None if feasible else "INSUFFICIENT_APPROVERS")


def create_steps(db, doc: GeneratedDocument, steps: list[dict]) -> None:
    for s in steps:
        db.add(GeneratedDocumentApproval(organization_id=doc.organization_id, document_id=doc.id, step_order=s["step_order"],
                                         step_kind=s["step_kind"], required_roles=s["required_roles"]))


def _actor_fits(db, doc: GeneratedDocument, step: GeneratedDocumentApproval, actor) -> bool:
    from app.modules.doc_templates.access import role_of
    role = role_of(actor)
    roles = set(step.required_roles or [])
    if role in roles:
        return True
    if "authorised_signatory" in roles:
        sig = (db.query(AuthorisedSignatory)
               .filter(AuthorisedSignatory.organization_id == doc.organization_id, AuthorisedSignatory.entity_id == doc.entity_id,
                       AuthorisedSignatory.employee_id == actor.id).all())
        return any(signatory_covers(s, doc.canonical_id, doc.family_id, doc.legal_risk) for s in sig)
    return False


def sod_check(db, doc: GeneratedDocument, step: GeneratedDocumentApproval, actor) -> dict:
    """Separation-of-duties rules for one approval decision. Every rule is recorded, passed or not."""
    earlier = {a.approver_id for a in doc_steps(db, doc) if a.decision == "APPROVED" and a.id != step.id}
    rules = [
        {"rule": "approver_is_not_requester", "passed": actor.id != doc.requested_by},
        {"rule": "approver_is_not_subject", "passed": not (doc.subject_type == "employee" and doc.subject_id == actor.id)},
        {"rule": "approver_not_used_in_earlier_step", "passed": actor.id not in earlier},
        {"rule": "approver_holds_required_authority", "passed": _actor_fits(db, doc, step, actor)},
    ]
    return {"passed": all(r["passed"] for r in rules), "rules": rules}


def doc_steps(db, doc: GeneratedDocument) -> list[GeneratedDocumentApproval]:
    return (db.query(GeneratedDocumentApproval).filter(GeneratedDocumentApproval.document_id == doc.id)
            .order_by(GeneratedDocumentApproval.step_order).all())


def current_step(db, doc: GeneratedDocument) -> Optional[GeneratedDocumentApproval]:
    return next((s for s in doc_steps(db, doc) if s.decision == "PENDING"), None)


def decide(db, doc: GeneratedDocument, actor, *, approve: bool, comment: Optional[str]) -> tuple[GeneratedDocumentApproval, bool]:
    """Record a decision on the current step. Returns (step, chain_complete). Raises 403/409 on any rule failure."""
    from app.modules.doc_templates.access import role_of
    if doc.status != "PENDING_APPROVAL":
        raise HTTPException(409, f"This document is {doc.status}, not waiting for approval.")
    step = current_step(db, doc)
    if step is None:
        raise HTTPException(409, "No approval step is pending.")
    check = sod_check(db, doc, step, actor)
    if not check["passed"]:
        failed = [r["rule"] for r in check["rules"] if not r["passed"]]
        raise HTTPException(403, {"code": "SEPARATION_OF_DUTIES", "failed_rules": failed,
                                  "message": "You cannot decide this step: " + ", ".join(failed).replace("_", " ") + "."})
    step.approver_id = actor.id
    step.approver_role = role_of(actor)
    step.decision = "APPROVED" if approve else "REJECTED"
    step.comment = (comment or "").strip()[:2000] or None
    step.sod_check = check
    step.decided_at = datetime.utcnow()
    if not approve:
        return step, False
    approved = list(doc.approved_by or [])
    approved.append(actor.id)
    doc.approved_by = approved
    return step, current_step(db, doc) is None


def apply_prior(db, doc: GeneratedDocument, prior: dict) -> bool:
    """Record an approval already given in the source module against the next pending step, if it passes separation of
    duties for that step. Returns False (leaving the step pending for a decision here) when it does not."""
    from app.modules.doc_templates.access import role_of
    from app.modules.employee.models import Employee
    step = current_step(db, doc)
    approver = db.get(Employee, prior.get("approver_id")) if prior.get("approver_id") else None
    if step is None or approver is None or approver.organization_id != doc.organization_id:
        return False
    check = sod_check(db, doc, step, approver)
    if not check["passed"]:
        return False
    step.approver_id, step.approver_role, step.decision = approver.id, role_of(approver), "APPROVED"
    step.comment = (f"Approved in {prior.get('source') or 'the source module'}"
                    + (f": {prior['comment']}" if prior.get("comment") else ""))[:2000]
    step.sod_check = {**check, "reused_from": prior.get("source")}
    step.decided_at = prior.get("decided_at") or datetime.utcnow()
    doc.approved_by = list(doc.approved_by or []) + [approver.id]
    db.flush()
    return True
