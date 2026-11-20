"""The approval workflow (ZHR-DOCS-ARCH-001 §4, §5, §7.3). The single place approve / reject / request-re-upload happen.

Chain: HR Admin -> Org Admin; a decision by either completes the document (the other step is skipped).
Separation of duties: nobody decides on a version they uploaded or on a document about themselves. Decision Q2: when no
other eligible approver exists, an Org Admin may approve anyway; the audit row says so (after.self_approved = true).
Review lock: whoever opens a document for review holds it for LOCK_TTL; others get DOC_LOCKED until it lapses or is released.
Auto-approval (§14.2) is decided ONLY by auto_approval_reason(); employee uploads never qualify.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.modules.hr.documents import audit_service, errors, lifecycle
from app.modules.hr.documents.constants import APPROVAL_CHAIN, HUMAN_APPROVAL_KEYS, REJECT_REASONS
from app.modules.hr.documents.models import HrCompanyDocumentCategory, HrEmployeeDocumentCategory, VersionStatus
from app.modules.hr.documents.permissions import ADMINS, ORG_ADMIN, role_of

LOCK_TTL = timedelta(minutes=10)
_POWER = {"employee": 0, "manager": 1, "hr_admin": 2, "admin": 3}


@dataclass
class DecisionRef:
    document_id: int
    version_id: int


def _models():
    from app.modules.hr.models import (
        ApprovalStepStatus, DocumentApprovalLog, DocumentApprovalStep, HrDocument, HrDocumentVersion,
    )
    return ApprovalStepStatus, DocumentApprovalLog, DocumentApprovalStep, HrDocument, HrDocumentVersion


# ── auto-approval ──────────────────────────────────────────────────────────────────────────────────────────────────

def auto_approval_reason(db: Session, document, version=None) -> Optional[str]:
    """Why this upload may skip human review, or None. Employee uploads never skip it (§14.2)."""
    source = document.source or "employee"
    if source == "employee":
        return None
    if document.scope == "employee" and document.employee_category_id:
        cat = db.get(HrEmployeeDocumentCategory, document.employee_category_id)
        if cat is not None and (cat.human_approval_required or cat.key in HUMAN_APPROVAL_KEYS):
            return None
        if source in ("payroll", "system_issue") and cat is not None and cat.key in ("payslips", "tax_compliance"):
            return source
        if source == "template":
            return "template_executed"
        return None
    if document.scope == "company":
        cat = db.get(HrCompanyDocumentCategory, document.company_category_id) if document.company_category_id else None
        if cat is None or not cat.requires_approval:
            return "company_publish"
    return None


# ── steps ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def create_steps_for_version(db: Session, document, version) -> list:
    ApprovalStepStatus, _, DocumentApprovalStep, _, _ = _models()
    steps = []
    for order, role in enumerate(APPROVAL_CHAIN, start=1):
        step = DocumentApprovalStep(document_id=document.id, version_id=version.id, organization_id=document.organization_id,
                                    step_order=order, required_role=role, status=ApprovalStepStatus.PENDING)
        db.add(step)
        steps.append(step)
    db.flush()
    return steps


def _pending_steps(db: Session, document_id: int):
    ApprovalStepStatus, _, DocumentApprovalStep, _, _ = _models()
    return (db.query(DocumentApprovalStep)
            .filter(DocumentApprovalStep.document_id == document_id, DocumentApprovalStep.status == ApprovalStepStatus.PENDING)
            .order_by(DocumentApprovalStep.step_order).all())


def _log(db: Session, document, version, action: str, actor, step_id=None, comment=None, reason_code=None) -> None:
    _, DocumentApprovalLog, _, _, _ = _models()
    db.add(DocumentApprovalLog(document_id=document.id, version_id=getattr(version, "id", None),
                               organization_id=document.organization_id, action=action[:20], step_id=step_id,
                               performed_by=getattr(actor, "id", None), role_at_time=role_of(actor) or None,
                               comment=comment, reason_code=reason_code))


# ── guards ─────────────────────────────────────────────────────────────────────────────────────────────────────────

def _full_name(person) -> str:
    return f"{getattr(person, 'first_name', '') or ''} {getattr(person, 'last_name', '') or ''}".strip() or "Another approver"


def _document(db: Session, actor, document_id: int):
    _, _, _, HrDocument, _ = _models()
    doc = (db.query(HrDocument)
           .filter(HrDocument.id == document_id, HrDocument.organization_id == actor.organization_id,
                   HrDocument.is_deleted.is_(False)).first())
    if doc is None:
        raise errors.not_found()
    return doc


def _latest_version(db: Session, document):
    _, _, _, _, HrDocumentVersion = _models()
    return (db.query(HrDocumentVersion).filter(HrDocumentVersion.document_id == document.id)
            .order_by(HrDocumentVersion.version.desc()).first())


def other_eligible_approvers(db: Session, organization_id: int, exclude: set) -> int:
    from app.modules.employee.models import Employee, UserRole
    return (db.query(Employee.id)
            .filter(Employee.organization_id == organization_id, Employee.is_active.is_(True),
                    Employee.role.in_((UserRole.ADMIN, UserRole.HR_ADMIN)), ~Employee.id.in_(exclude or {0}))
            .count())


def assert_can_decide(db: Session, actor, document, version, *, allow_approved: bool = False,
                      now: Optional[datetime] = None) -> bool:
    """Raises when `actor` may not decide on `version` now. Returns True when this is a Q2 self-approval exception."""
    now = now or datetime.utcnow()
    if role_of(actor) not in ADMINS:
        raise errors.forbidden("Only an HR Admin or the Organization Admin can decide on documents.")
    latest = _latest_version(db, document)
    if latest is None or latest.id != version.id:
        raise errors.stale_version()
    allowed = {VersionStatus.PENDING_APPROVAL.value} | ({VersionStatus.APPROVED.value} if allow_approved else set())
    if version.status not in allowed:
        raise errors.already_decided(version.status)
    if (document.review_locked_by and document.review_locked_by != actor.id and document.review_locked_until
            and document.review_locked_until > now):
        from app.modules.employee.models import Employee
        holder = db.get(Employee, document.review_locked_by)
        raise errors.locked(_full_name(holder), document.review_locked_until)
    conflicted = {pid for pid in (version.uploaded_by, document.employee_id) if pid}
    if actor.id in conflicted:
        if role_of(actor) == ORG_ADMIN and other_eligible_approvers(db, document.organization_id, conflicted) == 0:
            return True
        raise errors.self_approval()
    return False


def _version_for(db: Session, document, version_id: Optional[int]):
    _, _, _, _, HrDocumentVersion = _models()
    if version_id is None:
        version = _latest_version(db, document)
    else:
        version = (db.query(HrDocumentVersion)
                   .filter(HrDocumentVersion.id == version_id, HrDocumentVersion.document_id == document.id).first())
    if version is None:
        raise errors.not_found("Version")
    return version


# ── decisions ──────────────────────────────────────────────────────────────────────────────────────────────────────

def _close_steps(db: Session, document, version, actor, outcome: str, comment: Optional[str], reason_code=None) -> None:
    """approve: steps the actor's role covers are approved, the rest skipped. reject: current step rejected, rest skipped."""
    ApprovalStepStatus, _, _, _, _ = _models()
    power = _POWER.get(role_of(actor), 0)
    now = datetime.utcnow()
    steps = _pending_steps(db, document.id)
    for i, step in enumerate(steps):
        role = "hr_admin" if step.required_role == "manager" else step.required_role
        if outcome == "approved" and _POWER.get(role, 9) <= power or (outcome != "approved" and i == 0):
            step.status = ApprovalStepStatus.APPROVED if outcome == "approved" else ApprovalStepStatus.REJECTED
            step.approved_by, step.approved_at, step.comment = actor.id, now, comment
            _log(db, document, version, outcome, actor, step_id=step.id, comment=comment, reason_code=reason_code)
        else:
            step.status = ApprovalStepStatus.SKIPPED
            step.comment = "Completed by another approver"
            _log(db, document, version, "skipped", actor, step_id=step.id)
    if not steps:
        _log(db, document, version, outcome, actor, comment=comment, reason_code=reason_code)


def _release(document) -> None:
    document.review_locked_by = None
    document.review_locked_until = None


def approve(db: Session, actor, document_id: int, version_id: Optional[int] = None, remark: Optional[str] = None,
            ctx: Optional[audit_service.RequestCtx] = None, commit: bool = True):
    document = _document(db, actor, document_id)
    version = _version_for(db, document, version_id)
    self_approved = assert_can_decide(db, actor, document, version)
    _close_steps(db, document, version, actor, "approved", remark)
    lifecycle.apply_transition(db, version, lifecycle.Event.APPROVE, actor, note=remark, ctx=ctx,
                               auto_reason="self_approved_no_other_approver" if self_approved else None)
    if document.scope == "company" and (document.publish_state or "published") == "published":
        from app.modules.hr.documents.company_docs import on_published       # approved company file becomes visible
        on_published(db, document, version, actor, material_change=bool(version.material_change))
    _release(document)
    if commit:
        db.commit()
    return document, version


def _check_reason(reason_code: str, note: str) -> str:
    if reason_code not in REJECT_REASONS:
        raise errors.invalid("Choose a reason.", "reason_code")
    note = (note or "").strip()
    if len(note) < 5:
        raise errors.invalid("Explain what needs to change (at least 5 characters).", "note")
    return note


def reject(db: Session, actor, document_id: int, version_id: Optional[int], reason_code: str, note: str,
           ctx: Optional[audit_service.RequestCtx] = None, commit: bool = True):
    note = _check_reason(reason_code, note)
    document = _document(db, actor, document_id)
    version = _version_for(db, document, version_id)
    assert_can_decide(db, actor, document, version)
    _close_steps(db, document, version, actor, "rejected", note, reason_code)
    lifecycle.apply_transition(db, version, lifecycle.Event.REJECT, actor, reason_code=reason_code, note=note, ctx=ctx)
    _release(document)
    if commit:
        db.commit()
    return document, version


def request_reupload(db: Session, actor, document_id: int, version_id: Optional[int], reason_code: str, note: str,
                     ctx: Optional[audit_service.RequestCtx] = None, commit: bool = True):
    """On a pending version: closes it like a rejection. On the approved version: it stays visible; a new copy is asked for."""
    note = _check_reason(reason_code, note)
    document = _document(db, actor, document_id)
    version = _version_for(db, document, version_id)
    assert_can_decide(db, actor, document, version, allow_approved=True)
    if version.status == VersionStatus.PENDING_APPROVAL.value:
        _close_steps(db, document, version, actor, "reupload_req", note, reason_code)
    else:
        _log(db, document, version, "reupload_req", actor, comment=note, reason_code=reason_code)
    was_approved = version.status == VersionStatus.APPROVED.value
    lifecycle.apply_transition(db, version, lifecycle.Event.REQUEST_REUPLOAD, actor, reason_code=reason_code, note=note, ctx=ctx)
    if was_approved:
        version.status = VersionStatus.APPROVED.value      # the approved copy stays the one readers see until replaced
        from app.modules.hr.models import HrDocumentStatus
        document.status = HrDocumentStatus.REUPLOAD_REQUESTED
    _release(document)
    if commit:
        db.commit()
    return document, version


def bulk_approve(db: Session, actor, items: list[DecisionRef], remark: Optional[str] = None,
                 ctx: Optional[audit_service.RequestCtx] = None) -> list[dict]:
    """Each item is decided in its own transaction; one failure never blocks the others."""
    results = []
    for item in items[:100]:
        try:
            approve(db, actor, item.document_id, item.version_id, remark, ctx)
            results.append({"document_id": item.document_id, "ok": True})
        except errors.DocError as exc:
            db.rollback()
            results.append({"document_id": item.document_id, "ok": False, "code": exc.error_code, "detail": exc.message})
    return results


# ── review lock ────────────────────────────────────────────────────────────────────────────────────────────────────

def acquire_lock(db: Session, actor, document_id: int, now: Optional[datetime] = None) -> datetime:
    if role_of(actor) not in ADMINS:
        raise errors.forbidden()
    now = now or datetime.utcnow()
    _, _, _, HrDocument, _ = _models()
    q = db.query(HrDocument).filter(HrDocument.id == document_id, HrDocument.organization_id == actor.organization_id,
                                    HrDocument.is_deleted.is_(False))
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        q = q.with_for_update()
    document = q.first()
    if document is None:
        raise errors.not_found()
    if (document.review_locked_by and document.review_locked_by != actor.id and document.review_locked_until
            and document.review_locked_until > now):
        from app.modules.employee.models import Employee
        raise errors.locked(_full_name(db.get(Employee, document.review_locked_by)), document.review_locked_until)
    newly_taken = not (document.review_locked_by == actor.id and document.review_locked_until
                       and document.review_locked_until > now)
    document.review_locked_by = actor.id
    document.review_locked_until = now + LOCK_TTL           # a heartbeat extends the lock without a new audit row
    if newly_taken:
        audit_service.record(db, org_id=document.organization_id, actor=actor, action="lock_acquired",
                             target_type="document", target_id=document.id, document_id=document.id)
    db.commit()
    return document.review_locked_until


def release_lock(db: Session, actor, document_id: int) -> None:
    _, _, _, HrDocument, _ = _models()
    document = (db.query(HrDocument).filter(HrDocument.id == document_id, HrDocument.organization_id == actor.organization_id)
                .first())
    if document is not None and document.review_locked_by == actor.id:
        _release(document)
        db.commit()


# ── legacy entry points (POST /hr/documents/{id}/approve | /reject) ────────────────────────────────────────────────

def has_versioned_review(db: Session, document_id: int) -> bool:
    """True when the document's latest version is waiting in the versioned workflow."""
    _, _, _, _, HrDocumentVersion = _models()
    latest = (db.query(HrDocumentVersion).filter(HrDocumentVersion.document_id == document_id)
              .order_by(HrDocumentVersion.version.desc()).first())
    return latest is not None and latest.status == VersionStatus.PENDING_APPROVAL.value
