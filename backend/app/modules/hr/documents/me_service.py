"""The signed-in person's own documents (ZHR-DOCS-ARCH-001 §7.4, Module D "My Files").

Employees upload their own files into the category containers; every upload goes to Approval Workflow (never auto-approved).
Admins and HR admins are employees too and use the same endpoints for their own files; nobody uploads for someone else here.
"""
from datetime import date, datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.modules.hr.documents import approval_service, errors, id_validators, lifecycle, storage_service
from app.modules.hr.documents.automation import tasks as task_service
from app.modules.hr.documents.category_service import seed_org_categories
from app.modules.hr.documents.models import HrEmployeeDocumentCategory, VersionStatus

V = VersionStatus
ATTENTION = (V.REJECTED.value, V.REUPLOAD_REQUESTED.value, V.EXPIRED.value)


def _models():
    from app.modules.hr.models import HrDocument, HrDocumentCategory, HrDocumentStatus, HrDocumentVersion
    return HrDocument, HrDocumentCategory, HrDocumentStatus, HrDocumentVersion


def ensure_categories(db: Session, organization_id: int) -> None:
    if not db.query(HrEmployeeDocumentCategory.id).filter(HrEmployeeDocumentCategory.organization_id == organization_id).first():
        seed_org_categories(db, organization_id)
        db.commit()


def _iso(value) -> Optional[str]:
    if value is None:
        return None
    return value.isoformat() + ("Z" if isinstance(value, datetime) else "")


def _person_name(db: Session, person_id: Optional[int]) -> Optional[str]:
    if not person_id:
        return None
    from app.modules.employee.models import Employee
    p = db.get(Employee, person_id)
    return f"{p.first_name or ''} {p.last_name or ''}".strip() if p else None


def serialize_file(db: Session, doc, version=None) -> dict:
    """One file as the employee portal and the admin drill-down show it (the latest version's state)."""
    _, _, _, HrDocumentVersion = _models()
    if version is None:
        version = (db.query(HrDocumentVersion).filter(HrDocumentVersion.document_id == doc.id)
                   .order_by(HrDocumentVersion.version.desc()).first())
    status = version.status if version is not None else V.APPROVED.value
    if status == V.APPROVED.value and doc.expiry_date and doc.expiry_date < date.today():
        status = V.EXPIRED.value
    if doc.status is not None and getattr(doc.status, "value", doc.status) == "reupload_requested":
        status = V.REUPLOAD_REQUESTED.value
    precheck = version.precheck if version is not None else None
    return {
        "id": doc.id, "title": doc.title, "file_name": (version.file_name if version is not None else None) or doc.file_name,
        "mime_type": (version.mime_type if version is not None else None) or doc.mime_type,
        "size": (version.file_size if version is not None else None) or doc.file_size,
        "version": version.version if version is not None else doc.current_version,
        "version_id": version.id if version is not None else None, "status": status,
        "uploaded_at": _iso(version.created_at if version is not None else doc.created_at),
        "expiry_date": _iso((version.expiry_date if version is not None else None) or doc.expiry_date),
        "rejection_reason": doc.rejection_reason if status in ATTENTION else None,
        "reason_code": doc.reason_code if status in ATTENTION else None,
        "decided_by": ({"name": _person_name(db, version.decided_by), "role": version.decided_role}
                       if version is not None and version.decided_by else None),
        "decided_at": _iso(version.decided_at) if version is not None else None,
        "source": doc.source, "category_id": doc.employee_category_id,
        "approved_version_id": doc.approved_version_id,
        "precheck": {"status": precheck.get("status"), "checks": [c for c in precheck.get("checks", []) if c.get("status") != "pass"]}
                    if isinstance(precheck, dict) else None,
    }


def latest_versions(db: Session, document_ids) -> dict:
    """{document_id: latest HrDocumentVersion} for many files in one query (instead of one per file)."""
    _, _, _, HrDocumentVersion = _models()
    ids = list(document_ids)
    if not ids:
        return {}
    out = {}
    for v in (db.query(HrDocumentVersion).filter(HrDocumentVersion.document_id.in_(ids))
              .order_by(HrDocumentVersion.document_id, HrDocumentVersion.version)):
        out[v.document_id] = v                          # ordered by version: the last one per file wins
    return out


def _serialize_many(db: Session, docs: list) -> list[dict]:
    versions = latest_versions(db, [d.id for d in docs])
    return [serialize_file(db, d, versions.get(d.id)) for d in docs]


def _docs_query(db: Session, organization_id: int, employee_id: int):
    HrDocument, _, _, _ = _models()
    return (db.query(HrDocument)
            .filter(HrDocument.organization_id == organization_id, HrDocument.employee_id == employee_id,
                    HrDocument.scope == "employee", HrDocument.is_deleted.is_(False)))


def _my_docs_query(db: Session, user):
    return _docs_query(db, user.organization_id, user.id)


def container_status(files: list[dict], is_required: bool) -> str:
    if not files:
        return "not_uploaded"
    states = {f["status"] for f in files}
    for s in (V.EXPIRED.value, V.REJECTED.value, V.REUPLOAD_REQUESTED.value, V.PENDING_APPROVAL.value):
        if s in states:
            return s
    return V.APPROVED.value


def containers_for(db: Session, organization_id: int, employee_id: int) -> list[dict]:
    """Every active category with this person's files in it (shared by My Files and the admin drill-down)."""
    ensure_categories(db, organization_id)
    cats = (db.query(HrEmployeeDocumentCategory)
            .filter(HrEmployeeDocumentCategory.organization_id == organization_id, HrEmployeeDocumentCategory.is_active.is_(True))
            .order_by(HrEmployeeDocumentCategory.sort_order, HrEmployeeDocumentCategory.id).all())
    by_cat: dict = {}
    docs = _docs_query(db, organization_id, employee_id).all()
    for d, f in zip(docs, _serialize_many(db, docs)):
        by_cat.setdefault(d.employee_category_id, []).append(f)
    out = []
    for c in cats:
        files = sorted(by_cat.get(c.id, []), key=lambda f: f["uploaded_at"] or "", reverse=True)
        out.append({"id": c.id, "key": c.key, "name": c.name, "description": c.description, "is_required": bool(c.is_required),
                    "uploader": c.uploader, "requires_expiry": bool(c.requires_expiry), "max_files": c.max_files,
                    "id_number_field": c.id_number_field,
                    "id_number_label": (id_validators.REGISTRY.get(c.id_number_field) or (None,))[0] if c.id_number_field else None,
                    "can_upload": c.uploader == "employee", "file_count": len(files),
                    "status": container_status(files, bool(c.is_required)), "files": files})
    return out


def my_categories(db: Session, user) -> list[dict]:
    return containers_for(db, user.organization_id, user.id)


def my_files(db: Session, user, category_id: Optional[int] = None) -> list[dict]:
    HrDocument, _, _, _ = _models()
    q = _my_docs_query(db, user)
    if category_id is not None:
        q = q.filter(HrDocument.employee_category_id == category_id)
    return _serialize_many(db, q.order_by(HrDocument.updated_at.desc()).all())


def _parse_expiry(value) -> Optional[date]:
    if value in (None, ""):
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        raise errors.invalid("Enter the expiry date as YYYY-MM-DD.", "expiry_date") from None


def upload_my_file(db: Session, user, *, category_id: int, data: bytes, filename: str, title: Optional[str] = None,
                   expiry_date=None, replaces_document_id: Optional[int] = None, id_number: Optional[str] = None,
                   ctx: Optional[object] = None) -> dict:
    HrDocument, HrDocumentCategory, HrDocumentStatus, HrDocumentVersion = _models()
    if not getattr(user, "is_active", True):
        raise errors.forbidden("Your account is not active.")
    cat = (db.query(HrEmployeeDocumentCategory)
           .filter(HrEmployeeDocumentCategory.id == category_id, HrEmployeeDocumentCategory.organization_id == user.organization_id,
                   HrEmployeeDocumentCategory.is_active.is_(True)).first())
    if cat is None:
        raise errors.not_found("Category")
    if cat.uploader != "employee":
        raise errors.category_closed("HR issues the documents in this category. You can view them here once they are available.")
    expiry = _parse_expiry(expiry_date)
    if cat.requires_expiry and expiry is None:
        raise errors.invalid("Enter the document's expiry date.", "expiry_date")
    if expiry is not None and expiry < date.today():
        raise errors.invalid("This document has already expired. Upload a valid one.", "expiry_date")

    doc = None
    if replaces_document_id is not None:
        doc = (_my_docs_query(db, user).filter(HrDocument.id == replaces_document_id).first())
        if doc is None:
            raise errors.not_found()
        if doc.employee_category_id != cat.id:
            raise errors.invalid("A new copy must stay in the same category.", "category_id")
        latest = (db.query(HrDocumentVersion).filter(HrDocumentVersion.document_id == doc.id)
                  .order_by(HrDocumentVersion.version.desc()).first())
        if latest is not None and latest.status == V.PENDING_APPROVAL.value:
            raise errors.pending_exists()
    elif cat.max_files and _my_docs_query(db, user).filter(HrDocument.employee_category_id == cat.id).count() >= cat.max_files:
        raise errors.invalid(f"{cat.name} holds at most {cat.max_files} file(s). Upload a new copy of an existing one instead.")

    stored = storage_service.store_upload(user.organization_id, data, filename)   # raises UploadRejected (422) first
    from app.modules.hr.documents.precheck import add_context_checks
    add_context_checks(stored.precheck, db, organization_id=user.organization_id, employee_id=user.id, sha256=stored.sha256,
                       category=cat, id_number=id_number, expiry_date=expiry)
    from app.modules.hr.documents.ocr import add_ocr_checks           # pre-check 6: only when the org turned on "ocr"
    add_ocr_checks(stored.precheck, db, organization_id=user.organization_id, data=data, mime=stored.mime_type, person=user,
                   expiry_date=expiry)
    now = datetime.utcnow()
    if doc is None:
        doc = HrDocument(title=(title or cat.name).strip()[:255] or cat.name, category=HrDocumentCategory.EMPLOYEE,
                         status=HrDocumentStatus.PENDING, employee_id=user.id, uploaded_by=user.id,
                         organization_id=user.organization_id, scope="employee", employee_category_id=cat.id,
                         source="employee", current_version=0, file_name=stored.file_name, file_size=stored.size,
                         mime_type=stored.mime_type, expiry_date=expiry, created_at=now, updated_at=now)
        db.add(doc)
        db.flush()
    number = (db.query(HrDocumentVersion.version).filter(HrDocumentVersion.document_id == doc.id)
              .order_by(HrDocumentVersion.version.desc()).first())
    version = HrDocumentVersion(
        document_id=doc.id, organization_id=doc.organization_id, version=(number[0] if number else 0) + 1,
        file_name=stored.file_name, file_size=stored.size, mime_type=stored.mime_type, uploaded_by=user.id,
        storage_key=stored.storage_key, is_encrypted=True, sha256=stored.sha256, scan_status=stored.precheck.scan_status,
        precheck=stored.precheck.as_dict(), expiry_date=expiry, created_at=now)
    version.document = doc
    if title and title.strip():
        doc.title = title.strip()[:255]
    lifecycle.apply_transition(db, version, lifecycle.Event.UPLOAD, user, ctx=ctx)
    approval_service.create_steps_for_version(db, doc, version)
    task_service.close_tasks(db, user.organization_id, kinds=["upload_required", "reupload", "renew"], employee_id=user.id,
                             employee_category_id=cat.id, reason="uploaded", now=now)
    db.commit()
    return serialize_file(db, doc, version)


def withdraw_pending(db: Session, user, document_id: int, ctx: Optional[object] = None) -> None:
    """Remove a pending upload nobody has decided on yet. A first upload removes the file; a newer copy removes only itself."""
    HrDocument, _, HrDocumentStatus, HrDocumentVersion = _models()
    from app.modules.hr.documents import audit_service
    from app.modules.hr.models import DocumentApprovalStep
    doc = _my_docs_query(db, user).filter(HrDocument.id == document_id).first()
    if doc is None:
        raise errors.not_found()
    versions = (db.query(HrDocumentVersion).filter(HrDocumentVersion.document_id == doc.id)
                .order_by(HrDocumentVersion.version.desc()).all())
    latest = versions[0] if versions else None
    if latest is None or latest.status != V.PENDING_APPROVAL.value or latest.decided_by:
        raise errors.invalid("Only a copy that is still waiting for review can be removed.")
    db.query(DocumentApprovalStep).filter(DocumentApprovalStep.version_id == latest.id).delete(synchronize_session=False)
    audit_service.record(db, org_id=doc.organization_id, actor=user, action="deleted", target_type="version",
                         target_id=latest.id, document_id=doc.id, employee_id=user.id, ctx=ctx,
                         before={"version": latest.version, "status": latest.status})
    if len(versions) == 1:
        doc.is_deleted = True
    else:
        previous = versions[1]
        status_name = {"approved": "APPROVED", "rejected": "REJECTED", "expired": "EXPIRED",
                       "reupload_requested": "REUPLOAD_REQUESTED", "superseded": "APPROVED"}.get(previous.status, "APPROVED")
        doc.status = HrDocumentStatus[status_name]
        db.delete(latest)
    db.commit()
