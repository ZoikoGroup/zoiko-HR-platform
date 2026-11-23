"""Who may see a company document (ZHR-DOCS-ARCH-001 §5, Module B "access control"). The ONLY place that decides it.

Rules live on a category, a folder or a document (hr_document_access_rules, one per target). A document's effective rule is
its own rule when it does not inherit, else the nearest folder rule that does not inherit (walking up), else its category's
rule, else admin-only. Visibility: admin_only | all_employees | departments | roles | employees (lists are unions).
Permission: view (inline only) or download. Legacy assignments (document_assignments) also grant view to the people named.

Admins and HR admins see every company document of their organization. Nobody sees a document that is not published, and
readers only ever get its approved version (file_access.readable_version).
"""
from dataclasses import dataclass
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.modules.hr.documents.models import AccessPermission, HrDocumentAccessRule, Visibility
from app.modules.hr.documents.permissions import ADMINS, role_of


@dataclass(frozen=True)
class Viewer:
    employee_id: int
    org_id: int
    role: str
    department_id: Optional[int]
    is_active: bool = True


@dataclass(frozen=True)
class EffectiveRule:
    visibility: str
    permission: str
    require_ack: bool
    source: tuple            # ("document" | "folder" | "category" | "default", id)
    department_ids: tuple = ()
    roles: tuple = ()
    employee_ids: tuple = ()


ADMIN_ONLY = EffectiveRule(Visibility.ADMIN_ONLY.value, AccessPermission.VIEW.value, False, ("default", 0))


def viewer_for(user) -> Viewer:
    return Viewer(employee_id=user.id, org_id=user.organization_id, role=role_of(user),
                  department_id=getattr(user, "department_id", None), is_active=bool(getattr(user, "is_active", True)))


def _ints(values) -> tuple:
    out = []
    for v in values or []:
        try:
            out.append(int(v))
        except (TypeError, ValueError):
            continue
    return tuple(sorted(set(out)))


def _as_effective(rule: HrDocumentAccessRule, source: tuple) -> EffectiveRule:
    return EffectiveRule(visibility=rule.visibility, permission=rule.permission or AccessPermission.VIEW.value,
                         require_ack=bool(rule.require_ack), source=source, department_ids=_ints(rule.department_ids),
                         roles=tuple(sorted({str(r) for r in (rule.roles or [])})), employee_ids=_ints(rule.employee_ids))


def _rules_by_target(db: Session, org: int, targets: Iterable[tuple]) -> dict:
    targets = list(targets)
    if not targets:
        return {}
    types = {t for t, _ in targets}
    ids = {i for _, i in targets}
    rows = (db.query(HrDocumentAccessRule)
            .filter(HrDocumentAccessRule.organization_id == org, HrDocumentAccessRule.target_type.in_(types),
                    HrDocumentAccessRule.target_id.in_(ids)).all())
    return {(r.target_type, r.target_id): r for r in rows}


def _folder_chain(db: Session, org: int, folder_id: Optional[int]) -> list[int]:
    from app.modules.hr.models import HrDocumentFolder
    chain, seen = [], set()
    while folder_id and folder_id not in seen:
        seen.add(folder_id)
        f = db.query(HrDocumentFolder).filter(HrDocumentFolder.id == folder_id, HrDocumentFolder.organization_id == org).first()
        if f is None:
            break
        chain.append(f.id)
        folder_id = f.parent_id
    return chain


def effective_rule(db: Session, org: int, document=None, *, folder_id: Optional[int] = None,
                   category_id: Optional[int] = None) -> EffectiveRule:
    """The rule that applies to a document (or, without one, to a folder / category)."""
    if document is not None:
        folder_id, category_id = document.folder_id, document.company_category_id
    chain = _folder_chain(db, org, folder_id)
    targets = ([("document", document.id)] if document is not None else []) + [("folder", f) for f in chain]
    if category_id:
        targets.append(("category", category_id))
    rules = _rules_by_target(db, org, targets)
    for target in targets:
        rule = rules.get(target)
        if rule is None:
            continue
        if target[0] != "category" and rule.inherit:
            continue                                   # this level defers to its parent
        return _as_effective(rule, target)
    return ADMIN_ONLY


def rule_allows(rule: EffectiveRule, viewer: Viewer) -> bool:
    v = rule.visibility
    if v == Visibility.ALL_EMPLOYEES.value:
        return True
    if v == Visibility.DEPARTMENTS.value:
        return viewer.department_id is not None and viewer.department_id in rule.department_ids
    if v == Visibility.ROLES.value:
        return viewer.role in rule.roles
    if v == Visibility.EMPLOYEES.value:
        return viewer.employee_id in rule.employee_ids
    return False


def _assigned(db: Session, document_id: int, employee_id: int) -> bool:
    from app.modules.hr.models import DocumentAssignment
    return db.query(DocumentAssignment.id).filter(DocumentAssignment.document_id == document_id,
                                                  DocumentAssignment.employee_id == employee_id).first() is not None


def _published(document) -> bool:
    return (document.publish_state or "published") == "published" and bool(document.approved_version_id) \
        and not document.is_deleted and not document.is_archived


def _hidden_category_ids(db: Session, org: int) -> set:
    from app.modules.hr.documents.models import HrCompanyDocumentCategory
    return {cid for (cid,) in db.query(HrCompanyDocumentCategory.id).filter(HrCompanyDocumentCategory.organization_id == org,
                                                                            HrCompanyDocumentCategory.is_hidden.is_(True))}


def in_hidden_category(db: Session, document) -> bool:
    """Files in a hidden category are invisible to everyone except admins (Company Documents P3)."""
    cid = getattr(document, "company_category_id", None)
    return bool(cid) and cid in _hidden_category_ids(db, document.organization_id)


def can_view(db: Session, viewer: Viewer, document, rule: Optional[EffectiveRule] = None) -> bool:
    if document.organization_id != viewer.org_id or document.scope != "company" or not viewer.is_active:
        return False
    if viewer.role in ADMINS:
        return True
    if not _published(document) or in_hidden_category(db, document):
        return False
    rule = rule or effective_rule(db, viewer.org_id, document)
    return rule_allows(rule, viewer) or _assigned(db, document.id, viewer.employee_id)


def can_download(db: Session, viewer: Viewer, document, rule: Optional[EffectiveRule] = None) -> bool:
    if viewer.role in ADMINS and document.organization_id == viewer.org_id:
        return True
    rule = rule or effective_rule(db, viewer.org_id, document)
    return can_view(db, viewer, document, rule) and rule.permission == AccessPermission.DOWNLOAD.value


def visible_company_documents(db: Session, viewer: Viewer, category_id: Optional[int] = None) -> list[tuple]:
    """[(document, rule)] the viewer may see, newest first. Candidates are narrowed in SQL (organization, company scope,
    published, approved); the rule check runs per document (rules are few and cached per target)."""
    from app.modules.hr.models import HrDocument
    q = (db.query(HrDocument)
         .filter(HrDocument.organization_id == viewer.org_id, HrDocument.scope == "company", HrDocument.is_deleted.is_(False),
                 HrDocument.is_archived.is_(False), HrDocument.publish_state == "published",
                 HrDocument.approved_version_id.isnot(None)))
    if category_id:
        q = q.filter(HrDocument.company_category_id == category_id)
    if viewer.role not in ADMINS:
        hidden = _hidden_category_ids(db, viewer.org_id)
        if hidden:
            q = q.filter((HrDocument.company_category_id.is_(None)) | (HrDocument.company_category_id.notin_(hidden)))
    out = []
    for doc in q.order_by(HrDocument.updated_at.desc(), HrDocument.id.desc()).all():
        rule = effective_rule(db, viewer.org_id, doc)
        if viewer.role in ADMINS or rule_allows(rule, viewer) or _assigned(db, doc.id, viewer.employee_id):
            out.append((doc, rule))
    return out


def audience(db: Session, org: int, rule: EffectiveRule, extra_employee_ids: Iterable[int] = ()) -> list:
    """Active employees a rule reaches (for notifications, acknowledgement rounds and the "Visible to N" preview)."""
    from app.modules.employee.models import Employee
    q = db.query(Employee).filter(Employee.organization_id == org, Employee.is_active.is_(True))
    v = rule.visibility
    if v == Visibility.ALL_EMPLOYEES.value:
        people = q.all()
    elif v == Visibility.DEPARTMENTS.value:
        people = q.filter(Employee.department_id.in_(rule.department_ids or (0,))).all()
    elif v == Visibility.EMPLOYEES.value:
        people = q.filter(Employee.id.in_(rule.employee_ids or (0,))).all()
    elif v == Visibility.ROLES.value:
        people = [p for p in q.all() if role_of(p) in rule.roles]
    else:
        people = []
    extra = set(extra_employee_ids or ())
    if extra:
        have = {p.id for p in people}
        people += q.filter(Employee.id.in_(extra - have)).all() if extra - have else []
    return people


def summary(rule: EffectiveRule, audience_count: Optional[int] = None) -> dict:
    label = {"admin_only": "Admin only", "all_employees": "All employees"}.get(rule.visibility, "Restricted")
    return {"visibility": rule.visibility, "label": label, "permission": rule.permission, "require_ack": rule.require_ack,
            "inherited_from": rule.source[0], "audience_count": audience_count}
