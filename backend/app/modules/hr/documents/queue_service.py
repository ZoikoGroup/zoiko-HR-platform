"""Reading the approval queue, the decision history and the audit trail (ZHR-DOCS-ARCH-001 §7.3).

Lists are filtered and paged in SQL; counts for the stat cards come from the same queries as the lists, so the Pending tab
and the "Awaiting review" card can never disagree again (P7).
"""
import csv
import io
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Iterator, Optional

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.core.pagination import Page
from app.modules.hr.documents import storage_service
from app.modules.hr.documents.models import (
    HrCompanyDocumentCategory, HrDocumentAuditLog, HrEmployeeDocumentCategory, VersionStatus,
)
from app.modules.hr.documents.permissions import ORG_ADMIN, role_of

WAITING_RED_DAYS = 3
DEFAULT_SLA_HOURS = 72


@dataclass
class ApprovalFilter:
    tab: str = "pending"                       # pending | all
    status: Optional[str] = None               # version status (all tab)
    category_key: Optional[str] = None
    department_id: Optional[int] = None
    source: Optional[str] = None               # employee | company
    precheck: Optional[str] = None             # pass | warn
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    search: Optional[str] = None


def _models():
    from app.modules.employee.models import Employee
    from app.modules.hr.models import DocumentApprovalStep, HrDocument, HrDocumentVersion
    return Employee, DocumentApprovalStep, HrDocument, HrDocumentVersion


def _latest_version_subquery(db: Session):
    _, _, _, HrDocumentVersion = _models()
    return (db.query(HrDocumentVersion.document_id.label("doc_id"), func.max(HrDocumentVersion.version).label("v"))
            .group_by(HrDocumentVersion.document_id).subquery())


def _base(db: Session, org: int, f: ApprovalFilter):
    Employee, _, HrDocument, HrDocumentVersion = _models()
    latest = _latest_version_subquery(db)
    q = (db.query(HrDocument, HrDocumentVersion)
         .join(latest, latest.c.doc_id == HrDocument.id)
         .join(HrDocumentVersion, and_(HrDocumentVersion.document_id == HrDocument.id, HrDocumentVersion.version == latest.c.v))
         .outerjoin(Employee, Employee.id == HrDocument.employee_id)
         .filter(HrDocument.organization_id == org, HrDocument.is_deleted.is_(False)))
    if f.tab == "pending":
        q = q.filter(HrDocumentVersion.status == VersionStatus.PENDING_APPROVAL.value)
    elif f.status:
        q = q.filter(HrDocumentVersion.status == f.status)
    if f.source == "employee":
        q = q.filter(HrDocument.scope == "employee")
    elif f.source == "company":
        q = q.filter(HrDocument.scope == "company")
    if f.category_key:
        emp_cat = db.query(HrEmployeeDocumentCategory.id).filter(HrEmployeeDocumentCategory.organization_id == org,
                                                                 HrEmployeeDocumentCategory.key == f.category_key)
        comp_cat = db.query(HrCompanyDocumentCategory.id).filter(HrCompanyDocumentCategory.organization_id == org,
                                                                 HrCompanyDocumentCategory.key == f.category_key)
        q = q.filter(or_(HrDocument.employee_category_id.in_(emp_cat), HrDocument.company_category_id.in_(comp_cat)))
    if f.department_id:
        q = q.filter(Employee.department_id == f.department_id)
    if f.date_from:
        q = q.filter(HrDocumentVersion.created_at >= datetime.combine(f.date_from, datetime.min.time()))
    if f.date_to:
        q = q.filter(HrDocumentVersion.created_at < datetime.combine(f.date_to + timedelta(days=1), datetime.min.time()))
    if f.search and f.search.strip():
        needle = f"%{f.search.strip().lower()}%"
        q = q.filter(or_(func.lower(HrDocument.title).like(needle),
                         func.lower(func.coalesce(Employee.first_name, "") + " " + func.coalesce(Employee.last_name, "")).like(needle),
                         func.lower(func.coalesce(Employee.employee_id, "")).like(needle),
                         func.lower(func.coalesce(Employee.employee_code, "")).like(needle)))
    return q


def _precheck_status(version) -> Optional[str]:
    return version.precheck.get("status") if isinstance(version.precheck, dict) else None


def _people(db: Session, ids) -> dict:
    Employee, _, _, _ = _models()
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return {e.id: e for e in db.query(Employee).filter(Employee.id.in_(ids)).all()}


def _name(p) -> Optional[str]:
    return f"{p.first_name or ''} {p.last_name or ''}".strip() if p else None


def _categories(db: Session, org: int) -> tuple[dict, dict]:
    emp = {c.id: c for c in db.query(HrEmployeeDocumentCategory).filter(HrEmployeeDocumentCategory.organization_id == org)}
    comp = {c.id: c for c in db.query(HrCompanyDocumentCategory).filter(HrCompanyDocumentCategory.organization_id == org)}
    return emp, comp


def _sla_hours(db: Session, org: int) -> int:
    from app.modules.hr.documents.automation.limits import org_settings
    s = org_settings(db, org)
    return int(s.approval_sla_hours) if s and s.approval_sla_hours else DEFAULT_SLA_HOURS


def serialize_item(db: Session, actor, doc, version, people: dict, cats: tuple[dict, dict], steps: list, sla_hours: int,
                   now: datetime) -> dict:
    emp_cats, comp_cats = cats
    cat = emp_cats.get(doc.employee_category_id) if doc.scope == "employee" else comp_cats.get(doc.company_category_id)
    emp, uploader = people.get(doc.employee_id), people.get(version.uploaded_by)
    submitted = version.created_at or doc.created_at
    waiting = max((now - submitted).days, 0) if submitted else 0
    pending = version.status == VersionStatus.PENDING_APPROVAL.value
    lock = None
    if doc.review_locked_by and doc.review_locked_until and doc.review_locked_until > now:
        holder = people.get(doc.review_locked_by)
        lock = {"by_id": doc.review_locked_by, "by": _name(holder) or "Another approver",
                "until": doc.review_locked_until.isoformat() + "Z", "mine": doc.review_locked_by == actor.id}
    reason = None
    if pending:
        conflicted = {pid for pid in (version.uploaded_by, doc.employee_id) if pid}
        if actor.id in conflicted:
            from app.modules.hr.documents.approval_service import other_eligible_approvers
            if not (role_of(actor) == ORG_ADMIN and other_eligible_approvers(db, doc.organization_id, conflicted) == 0):
                reason = "self" if version.uploaded_by == actor.id else "subject"
        if reason is None and lock and not lock["mine"]:
            reason = "locked"
    decider = people.get(version.decided_by)
    return {
        "document_id": doc.id, "version_id": version.id, "version": version.version, "title": doc.title,
        "category_key": getattr(cat, "key", None), "category_name": getattr(cat, "name", None),
        "scope": doc.scope, "source": doc.source,
        "employee": ({"id": emp.id, "name": _name(emp), "employee_id_str": emp.employee_id or emp.employee_code,
                      "department_id": emp.department_id} if emp else None),
        "uploaded_by": {"id": version.uploaded_by, "name": _name(uploader)} if version.uploaded_by else None,
        "submitted_at": submitted.isoformat() + "Z" if submitted else None,
        "waiting_days": waiting if pending else None,
        "overdue": pending and waiting > WAITING_RED_DAYS,
        "sla_breached": pending and submitted is not None and now - submitted > timedelta(hours=sla_hours),
        "status": version.status, "precheck": version.precheck if isinstance(version.precheck, dict) else None,
        "file_name": version.file_name, "mime_type": version.mime_type, "expiry_date": version.expiry_date.isoformat() if version.expiry_date else None,
        "rejection_reason": version.rejection_reason, "reason_code": version.reason_code,
        "decided_by": {"name": _name(decider), "role": version.decided_role} if version.decided_by else (
            {"name": "System", "role": "system"} if version.decided_role == "system" else None),
        "decided_at": version.decided_at.isoformat() + "Z" if version.decided_at else None,
        "steps": [{"role": "hr_admin" if s.required_role == "manager" else s.required_role,
                   "status": getattr(s.status, "value", s.status), "by": _name(people.get(s.approved_by)),
                   "at": s.approved_at.isoformat() + "Z" if s.approved_at else None} for s in steps],
        "lock": lock, "can_decide": pending and reason is None, "cannot_decide_reason": reason if pending else None,
        # False: the record outlived its file; the preview offers "request a new copy" / "upload again" (QA R1-17)
        "file_available": storage_service.is_available(version) or storage_service.is_available(doc),
    }


def list_items(db: Session, actor, f: ApprovalFilter, page: int = 1, per_page: int = 25, now: Optional[datetime] = None) -> dict:
    Employee, DocumentApprovalStep, HrDocument, HrDocumentVersion = _models()
    now = now or datetime.utcnow()
    org = actor.organization_id
    q = _base(db, org, f)
    if f.precheck in ("pass", "warn"):
        rows_all = q.all()                 # pre-check outcome lives in JSON: filtered here (the pending queue is small)
        rows_all = [r for r in rows_all if _precheck_status(r[1]) == f.precheck]
        total = len(rows_all)
        rows = rows_all[(page - 1) * per_page: page * per_page]
    else:
        total = q.count()
        order = HrDocumentVersion.created_at.asc() if f.tab == "pending" else HrDocumentVersion.created_at.desc()
        rows = q.order_by(order, HrDocument.id).offset((page - 1) * per_page).limit(per_page).all()
    doc_ids = [d.id for d, _ in rows]
    steps_by_doc: dict = {}
    if doc_ids:
        for s in (db.query(DocumentApprovalStep).filter(DocumentApprovalStep.document_id.in_(doc_ids))
                  .order_by(DocumentApprovalStep.step_order).all()):
            steps_by_doc.setdefault((s.document_id, s.version_id), []).append(s)
    ids = set()
    for d, v in rows:
        ids |= {d.employee_id, v.uploaded_by, v.decided_by, d.review_locked_by}
        for s in steps_by_doc.get((d.id, v.id), []):
            ids.add(s.approved_by)
    people = _people(db, ids)
    cats = _categories(db, org)
    sla = _sla_hours(db, org)
    items = [serialize_item(db, actor, d, v, people, cats, steps_by_doc.get((d.id, v.id), []), sla, now) for d, v in rows]
    return Page(items=items, total=total, page=page, per_page=per_page).model_dump()


def summary(db: Session, actor, now: Optional[datetime] = None) -> dict:
    Employee, _, HrDocument, HrDocumentVersion = _models()
    now = now or datetime.utcnow()
    org = actor.organization_id
    base = _base(db, org, ApprovalFilter(tab="all"))
    counts = dict(base.with_entities(HrDocumentVersion.status, func.count()).group_by(HrDocumentVersion.status).all())
    pending_q = _base(db, org, ApprovalFilter(tab="pending"))
    sla = _sla_hours(db, org)
    overdue = pending_q.filter(HrDocumentVersion.created_at < now - timedelta(days=WAITING_RED_DAYS)).count()
    breached = pending_q.filter(HrDocumentVersion.created_at < now - timedelta(hours=sla)).count()
    from app.modules.hr.documents.automation.models import AutomationRun
    dead = db.query(AutomationRun.id).filter(AutomationRun.organization_id == org, AutomationRun.status == "dead").count()
    return {
        "awaiting_review": counts.get(VersionStatus.PENDING_APPROVAL.value, 0),
        "approved": counts.get(VersionStatus.APPROVED.value, 0),
        "rejected": counts.get(VersionStatus.REJECTED.value, 0),
        "reupload_requested": counts.get(VersionStatus.REUPLOAD_REQUESTED.value, 0),
        "expired": counts.get(VersionStatus.EXPIRED.value, 0),
        "overdue": overdue, "sla_breached": breached, "sla_hours": sla, "dead_runs": dead,
    }


# ── audit trail ────────────────────────────────────────────────────────────────────────────────────────────────────

@dataclass
class AuditFilter:
    actions: Optional[list[str]] = None
    actor_id: Optional[int] = None
    actor_type: Optional[str] = None
    employee_id: Optional[int] = None
    document_id: Optional[int] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None


def _audit_query(db: Session, org: int, f: AuditFilter):
    q = db.query(HrDocumentAuditLog).filter(HrDocumentAuditLog.organization_id == org)
    if f.actions:
        q = q.filter(HrDocumentAuditLog.action.in_(f.actions))
    if f.actor_id:
        q = q.filter(HrDocumentAuditLog.actor_id == f.actor_id)
    if f.actor_type:
        q = q.filter(HrDocumentAuditLog.actor_type == f.actor_type)
    if f.employee_id:
        q = q.filter(HrDocumentAuditLog.employee_id == f.employee_id)
    if f.document_id:
        q = q.filter(HrDocumentAuditLog.document_id == f.document_id)
    if f.date_from:
        q = q.filter(HrDocumentAuditLog.created_at >= datetime.combine(f.date_from, datetime.min.time()))
    if f.date_to:
        q = q.filter(HrDocumentAuditLog.created_at < datetime.combine(f.date_to + timedelta(days=1), datetime.min.time()))
    return q.order_by(HrDocumentAuditLog.created_at.desc(), HrDocumentAuditLog.id.desc())


def _audit_rows(db: Session, rows) -> list[dict]:
    _, _, HrDocument, _ = _models()
    people = _people(db, {r.actor_id for r in rows} | {r.employee_id for r in rows})
    titles = dict(db.query(HrDocument.id, HrDocument.title).filter(HrDocument.id.in_({r.document_id for r in rows if r.document_id} or {0})).all())
    out = []
    for r in rows:
        actor = people.get(r.actor_id)
        emp = people.get(r.employee_id)
        out.append({
            "id": r.id, "at": r.created_at.isoformat() + "Z" if r.created_at else None, "action": r.action,
            "actor_type": r.actor_type, "actor": {"id": r.actor_id, "name": _name(actor), "role": r.actor_role} if r.actor_id else None,
            "rule_id": r.rule_id, "automation_run_id": r.automation_run_id, "target_type": r.target_type, "target_id": r.target_id,
            "document_id": r.document_id, "document_title": titles.get(r.document_id),
            "employee": {"id": emp.id, "name": _name(emp)} if emp else None,
            "ip": r.ip_address, "before": r.before, "after": r.after,
        })
    return out


def audit_page(db: Session, actor, f: AuditFilter, page: int = 1, per_page: int = 50) -> dict:
    q = _audit_query(db, actor.organization_id, f)
    total = q.count()
    rows = q.offset((page - 1) * per_page).limit(per_page).all()
    return Page(items=_audit_rows(db, rows), total=total, page=page, per_page=per_page).model_dump()


CSV_COLUMNS = ("at", "action", "actor_type", "actor", "actor_role", "document_id", "document_title", "employee", "ip")


def audit_csv(db: Session, actor, f: AuditFilter, batch: int = 1000) -> Iterator[str]:
    """CSV, streamed in batches. Values that start with = + - @ are prefixed so a spreadsheet never runs them as formulas."""
    def safe(value) -> str:
        text = "" if value is None else str(value)
        return "'" + text if text[:1] in ("=", "+", "-", "@") else text

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(CSV_COLUMNS)
    yield buf.getvalue()
    q = _audit_query(db, actor.organization_id, f)
    offset = 0
    while True:
        rows = q.offset(offset).limit(batch).all()
        if not rows:
            break
        buf = io.StringIO()
        writer = csv.writer(buf)
        for r in _audit_rows(db, rows):
            writer.writerow([safe(r["at"]), safe(r["action"]), safe(r["actor_type"]), safe((r["actor"] or {}).get("name")),
                             safe((r["actor"] or {}).get("role")), safe(r["document_id"]), safe(r["document_title"]),
                             safe((r["employee"] or {}).get("name")), safe(r["ip"])])
        yield buf.getvalue()
        offset += batch
