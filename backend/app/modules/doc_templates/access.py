"""Who may see and do what with templates and generated documents (docs/templates/architecture.md §Access).

* HR roles (admin, hr_admin): everything in their own organization.
* Managers: documents about their reports, only for the families managers may see (performance, attendance, leave), never
  compensation, and only up to PERSONAL_CONFIDENTIAL (C2): C3/C4 documents are denied by core/privacy/policy.
* Employees: their own documents once issued, never HR-internal records.
* Candidates: one document, through a signed single-use link (signing.py), never through these checks.
* Platform / super admin: nothing. Data-plane routes 404 before reaching here; the policy denies as a second line.

Every decision goes through `core.privacy.policy.authorize()` (audited) on top of the role matrix.
"""
from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy import and_, or_

from app.core.privacy import policy
from app.core.privacy.classification import Level
from app.modules.doc_templates import registry
from app.modules.doc_templates.models import GeneratedDocument

POST_ISSUE = ("ISSUED", "ACKNOWLEDGED", "EXECUTED", "DECLINED", "EXPIRED", "CORRECTED", "SUPERSEDED", "RETAINED")
SUBJECT_RESOURCES = {"employee": "employees", "candidate": "recruitment_candidates", "new_hire": "onboarding_new_hires"}


def role_of(user) -> str:
    r = getattr(user, "role", None)
    return getattr(r, "value", str(r)) if r is not None else ""


def is_hr(user) -> bool:
    return role_of(user) in registry.HR_ROLES


def require_hr(user) -> None:
    if not is_hr(user):
        raise HTTPException(403, "Only an HR admin or organization admin can do this.")


def require_org_admin(user) -> None:
    if role_of(user) != "admin":
        raise HTTPException(403, "Only an organization admin can do this.")


def report_ids(db, user) -> frozenset:
    """Everyone who reports to `user`, directly or through other managers (bounded walk)."""
    if role_of(user) != "manager":
        return frozenset()
    from app.modules.employee.models import Employee
    found: set[int] = set()
    frontier = {user.id}
    for _ in range(10):
        rows = db.query(Employee.id).filter(Employee.organization_id == user.organization_id,
                                            Employee.reporting_manager_id.in_(frontier)).all()
        nxt = {r[0] for r in rows} - found - {user.id}
        if not nxt:
            break
        found |= nxt
        frontier = nxt
    return frozenset(found)


PERFORMANCE_FAMILY = "HR-PRF"
MANAGER_CHAIN_DEPTH = 2          # the direct manager and one level up see C3 performance documents (appraisals, PIPs)


def chain_report_ids(db, user, depth: int = MANAGER_CHAIN_DEPTH) -> frozenset:
    """People whose manager chain includes `user` within `depth` levels (direct reports and their reports)."""
    if role_of(user) != "manager":
        return frozenset()
    from app.modules.employee.models import Employee
    found, frontier = set(), {user.id}
    for _ in range(depth):
        rows = db.query(Employee.id).filter(Employee.organization_id == user.organization_id,
                                            Employee.reporting_manager_id.in_(frontier)).all()
        nxt = {r[0] for r in rows} - found - {user.id}
        if not nxt:
            break
        found |= nxt
        frontier = nxt
    return frozenset(found)


def subject_of(db, user):
    return policy.subject_for_user(user, report_ids=report_ids(db, user))


def level_for(sensitivity: Optional[str]) -> Level:
    return Level.PERSONAL_CONFIDENTIAL if (sensitivity or "C2") == "C2" else Level.SPECIAL_CATEGORY


def authorize_subject(db, user, subject_type: str, subject_id: Optional[int], *, sensitivity: str = "C2") -> policy.Decision:
    """May `user` produce a document about this subject? (preflight step 1)"""
    resource_type = SUBJECT_RESOURCES.get(subject_type)
    if resource_type is None or subject_id is None:
        # organization- or position-level documents carry no person: HR roles only (checked by the role matrix)
        return policy.Decision(is_hr(user), "ALLOWED" if is_hr(user) else "ACTION_NOT_PERMITTED")
    owner = subject_id if subject_type == "employee" else None
    resource = policy.Resource(type=resource_type, tenant_id=user.organization_id, owner_id=owner, record_id=subject_id,
                               classification=level_for(sensitivity))
    return policy.authorize(subject_of(db, user), "read", resource)


def document_resource(doc: GeneratedDocument) -> policy.Resource:
    owner = doc.subject_id if doc.subject_type == "employee" else doc.recipient_employee_id
    return policy.Resource(type="generated_documents", tenant_id=doc.organization_id, owner_id=owner, record_id=doc.id,
                           classification=level_for(doc.sensitivity))


def can_view(db, user, doc: GeneratedDocument, action: str = "read") -> bool:
    if doc is None or doc.organization_id != getattr(user, "organization_id", None):
        return False
    role = role_of(user)
    if role in registry.HR_ROLES:
        pass
    elif role == "manager":
        if doc.family_id in registry.COMPENSATION_FAMILIES and action == "read":
            # compensation is never visible to managers unless the organization grants it for their own reports (default off)
            from app.modules.hr.compensation_documents import manager_may_view
            return manager_may_view(db, user, doc)
        if doc.family_id == PERFORMANCE_FAMILY and doc.sensitivity == "C3":
            # appraisals, manager assessments and PIPs: the manager chain (never peers), once issued or when they asked for it
            return doc.subject_type == "employee" and (doc.requested_by == user.id or (
                doc.status in POST_ISSUE and doc.subject_id in chain_report_ids(db, user)))
        if doc.family_id not in registry.MANAGER_VISIBLE_FAMILIES:
            if doc.requested_by != user.id:
                return False
        if doc.subject_type != "employee":
            return False
    elif role == "employee":
        if doc.audience == "HR_INTERNAL" or doc.status not in POST_ISSUE:
            return False
        if user.id not in (doc.recipient_employee_id, doc.subject_id if doc.subject_type == "employee" else None):
            return False
    else:
        return False
    decision = policy.authorize(subject_of(db, user), action, document_resource(doc))
    return bool(decision.allow)


def require_view(db, user, doc: Optional[GeneratedDocument], action: str = "read") -> GeneratedDocument:
    """404 for anything the caller may not see: a foreign or forbidden document looks exactly like a missing one."""
    if doc is None or not can_view(db, user, doc, action):
        raise HTTPException(404, "Document not found")
    return doc


def list_filter(db, user):
    """SQL filter matching what `can_view` allows at list level (the per-row policy check still runs on detail)."""
    role = role_of(user)
    org = GeneratedDocument.organization_id == user.organization_id
    if role in registry.HR_ROLES:
        return org
    if role == "manager":
        reports = list(report_ids(db, user))
        mine = GeneratedDocument.requested_by == user.id
        about_reports = and_(GeneratedDocument.subject_type == "employee", GeneratedDocument.subject_id.in_(reports or [-1]),
                             GeneratedDocument.family_id.in_(sorted(registry.MANAGER_VISIBLE_FAMILIES)),
                             GeneratedDocument.sensitivity == "C2")
        chain = list(chain_report_ids(db, user))
        about_reports = or_(about_reports, and_(GeneratedDocument.family_id == PERFORMANCE_FAMILY, GeneratedDocument.sensitivity == "C3",
                                                GeneratedDocument.subject_id.in_(chain or [-1]),
                                                GeneratedDocument.status.in_(POST_ISSUE)))
        from app.modules.hr.compensation_documents import managers_see_reports
        if managers_see_reports(db, user.organization_id):
            about_reports = or_(about_reports, and_(GeneratedDocument.subject_id.in_(reports or [-1]),
                                                    GeneratedDocument.family_id.in_(sorted(registry.COMPENSATION_FAMILIES)),
                                                    GeneratedDocument.status.in_(POST_ISSUE)))
        return and_(org, GeneratedDocument.subject_type == "employee", or_(mine, about_reports))
    if role == "employee":
        return and_(org, GeneratedDocument.audience != "HR_INTERNAL", GeneratedDocument.status.in_(POST_ISSUE),
                    or_(GeneratedDocument.recipient_employee_id == user.id,
                        and_(GeneratedDocument.subject_type == "employee", GeneratedDocument.subject_id == user.id)))
    return GeneratedDocument.id == -1
