"""The document lifecycle (ZHR-DOCS-ARCH-001 §4). The ONLY place a version's status changes.

Status is kept per version. The document row mirrors its latest version (`hr_documents.status`) and points at the version
readers see (`approved_version_id`). NOT_UPLOADED is never stored: it is a required category with no file.

apply_transition() checks the move is allowed, updates the version and the document, writes the audit row and queues the
domain event — all in the caller's transaction. Guards about WHO may act (separation of duties, locks, roles) belong to
approval_service; this module only knows which moves exist.
"""
from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException
from app.modules.hr.documents import audit_service
from app.modules.hr.documents.models import VersionStatus

V = VersionStatus


class Event(str, Enum):
    UPLOAD = "upload"
    APPROVE = "approve"
    REJECT = "reject"
    REQUEST_REUPLOAD = "request_reupload"
    EXPIRE = "expire"
    SUPERSEDE = "supersede"
    AUTO_APPROVE = "auto_approve"


# (current status of THIS version or None for a new version, event) -> new status
TRANSITIONS: dict[tuple[Optional[str], Event], str] = {
    (None, Event.UPLOAD): V.PENDING_APPROVAL.value,
    (None, Event.AUTO_APPROVE): V.APPROVED.value,
    (V.PENDING_APPROVAL.value, Event.APPROVE): V.APPROVED.value,
    (V.PENDING_APPROVAL.value, Event.AUTO_APPROVE): V.APPROVED.value,
    (V.PENDING_APPROVAL.value, Event.REJECT): V.REJECTED.value,
    (V.PENDING_APPROVAL.value, Event.REQUEST_REUPLOAD): V.REUPLOAD_REQUESTED.value,
    (V.APPROVED.value, Event.REQUEST_REUPLOAD): V.REUPLOAD_REQUESTED.value,
    (V.APPROVED.value, Event.EXPIRE): V.EXPIRED.value,
    (V.APPROVED.value, Event.SUPERSEDE): V.SUPERSEDED.value,
}

# The document row's legacy status for each version status (hr_documents.status is the HrDocumentStatus enum).
_DOC_STATUS = {
    V.PENDING_APPROVAL.value: "PENDING", V.APPROVED.value: "APPROVED", V.REJECTED.value: "REJECTED",
    V.REUPLOAD_REQUESTED.value: "REUPLOAD_REQUESTED", V.EXPIRED.value: "EXPIRED",
}
_AUDIT_ACTION = {
    Event.UPLOAD: "uploaded", Event.APPROVE: "approved", Event.REJECT: "rejected",
    Event.REQUEST_REUPLOAD: "reupload_requested", Event.EXPIRE: "expired", Event.SUPERSEDE: "superseded",
    Event.AUTO_APPROVE: "auto_approved",
}


class InvalidTransition(BadRequestException):
    def __init__(self, current: Optional[str], event: Event):
        super().__init__(f"A document in status '{current or 'new'}' cannot be {event.value.replace('_', ' ')}d.")
        self.current, self.event = current, event


def next_status(current: Optional[str], event: Event) -> str:
    try:
        return TRANSITIONS[(current, event)]
    except KeyError:
        raise InvalidTransition(current, event) from None


def _category_key(db: Session, document) -> Optional[str]:
    from app.modules.hr.documents.models import HrCompanyDocumentCategory, HrEmployeeDocumentCategory
    if document.employee_category_id:
        cat = db.get(HrEmployeeDocumentCategory, document.employee_category_id)
        return cat.key if cat else None
    if document.company_category_id:
        cat = db.get(HrCompanyDocumentCategory, document.company_category_id)
        return cat.key if cat else None
    return None


def _set_document_status(document, version_status: str) -> None:
    from app.modules.hr.models import HrDocumentStatus
    name = _DOC_STATUS.get(version_status)
    if name:
        document.status = HrDocumentStatus[name]


def apply_transition(db: Session, version, event: Event, actor=None, *, reason_code: Optional[str] = None,
                     note: Optional[str] = None, ctx: Optional[audit_service.RequestCtx] = None,
                     run_id: Optional[int] = None, rule_id: Optional[int] = None, auto_reason: Optional[str] = None,
                     emit_events: bool = True):
    """Move `version` along `event`; returns the version. Raises InvalidTransition for a move that does not exist."""
    from app.modules.hr.models import HrDocument, HrDocumentVersion

    document = version.document if version.document is not None else db.get(HrDocument, version.document_id)
    is_new = version.id is None
    current = None if is_new else version.status
    new = next_status(current, event)
    now = datetime.utcnow()
    before = {"status": current}

    version.status = new
    if version.organization_id is None:
        version.organization_id = document.organization_id
    if event in (Event.APPROVE, Event.AUTO_APPROVE, Event.REJECT, Event.REQUEST_REUPLOAD):
        version.decided_by = getattr(actor, "id", None)
        role = getattr(getattr(actor, "role", None), "value", getattr(actor, "role", None))
        version.decided_role = (role or ("system" if actor is None else None))
        version.decided_at = now
    if event in (Event.REJECT, Event.REQUEST_REUPLOAD):
        version.reason_code = reason_code
        version.rejection_reason = note
        document.reason_code = reason_code
        document.rejection_reason = note
    if is_new:
        db.add(version)
        db.flush()

    latest = (db.query(HrDocumentVersion.id)
              .filter(HrDocumentVersion.document_id == document.id)
              .order_by(HrDocumentVersion.version.desc()).first())
    is_latest = latest is None or latest[0] == version.id

    if new == V.APPROVED.value:
        previous_id = document.approved_version_id
        if previous_id and previous_id != version.id:
            previous = db.get(HrDocumentVersion, previous_id)
            if previous is not None and previous.status == V.APPROVED.value:
                apply_transition(db, previous, Event.SUPERSEDE, actor, ctx=ctx, run_id=run_id, rule_id=rule_id,
                                 emit_events=False)
        document.approved_version_id = version.id
        document.approved_by = getattr(actor, "id", None)
        document.approved_at = now
        document.current_version = version.version
        if version.storage_key:
            document.storage_key, document.is_encrypted, document.sha256 = version.storage_key, version.is_encrypted, version.sha256
        if version.file_path:
            document.file_path = version.file_path
        for attr in ("file_name", "file_size", "mime_type"):
            if getattr(version, attr, None):
                setattr(document, attr, getattr(version, attr))
        if version.expiry_date:
            document.expiry_date = version.expiry_date
    elif new == V.EXPIRED.value and document.approved_version_id == version.id:
        pass  # the expired version stays the one readers see, marked expired
    if is_latest or new == V.APPROVED.value:
        _set_document_status(document, new)

    audit_service.record(
        db, org_id=document.organization_id, actor=actor, action=_AUDIT_ACTION[event], target_type="version",
        target_id=version.id, document_id=document.id, employee_id=document.employee_id, before=before,
        after={"status": new, "reason_code": reason_code, "auto_reason": auto_reason} if (reason_code or auto_reason) else {"status": new},
        ctx=ctx, run_id=run_id, rule_id=rule_id)

    if emit_events:
        _emit(db, document, version, event, actor, reason_code)
    return version


def _emit(db: Session, document, version, event: Event, actor, reason_code: Optional[str]) -> None:
    from app.modules.hr.documents.automation import events as ev
    org = document.organization_id
    key = _category_key(db, document)
    scope = document.scope or "employee"
    if event == Event.UPLOAD:
        pre = (version.precheck or {}).get("status") if isinstance(version.precheck, dict) else None
        ev.emit(db, org, ev.DocumentUploaded(document_id=document.id, version_id=version.id, version=version.version,
                                             scope=scope, category_key=key, employee_id=document.employee_id,
                                             source=document.source or "employee", precheck=pre))
    elif event in (Event.APPROVE, Event.AUTO_APPROVE):
        role = getattr(getattr(actor, "role", None), "value", getattr(actor, "role", None))
        ev.emit(db, org, ev.DocumentApproved(document_id=document.id, version_id=version.id, scope=scope, category_key=key,
                                             employee_id=document.employee_id, decided_by=getattr(actor, "id", None),
                                             decided_role=role or "system", auto=event == Event.AUTO_APPROVE))
    elif event in (Event.REJECT, Event.REQUEST_REUPLOAD):
        ev.emit(db, org, ev.DocumentRejected(document_id=document.id, version_id=version.id, category_key=key,
                                             employee_id=document.employee_id, reason_code=reason_code,
                                             reupload=event == Event.REQUEST_REUPLOAD))
    elif event == Event.EXPIRE:
        ev.emit(db, org, ev.UploadedDocumentExpired(document_id=document.id, kind="uploaded", category_key=key,
                                                    employee_id=document.employee_id))
