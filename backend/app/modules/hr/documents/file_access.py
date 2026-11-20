"""Who may open which document file (ZHR-DOCS-ARCH-001 §5, security requirement 4). Fixes P30: the file routes used to
check only the organization, so any employee could open another employee's identity document by its id.

* Admins / HR admins: every document of their organization, any version.
* The person a document is about (or who uploaded it, for documents about nobody): their own document, any version.
* Everyone else: company documents shared with them (access rules, legacy assignments), approved and published versions
  only. Employee documents of other people: never — answered as 404 so existence is not revealed.

Every successful open is audited (views de-duplicated over 5 minutes).
"""
from typing import Optional

from fastapi import Response
from sqlalchemy.orm import Session

from app.modules.hr.documents import audit_service, errors, storage_service
from app.modules.hr.documents.permissions import is_document_admin


def _models():
    from app.modules.hr.models import DocumentAssignment, HrDocument, HrDocumentVersion
    return DocumentAssignment, HrDocument, HrDocumentVersion


def is_owner(user, doc) -> bool:
    return doc.employee_id == user.id or (doc.employee_id is None and doc.uploaded_by == user.id)


def company_visible(db: Session, user, doc) -> bool:
    """Company documents a non-admin may read. Delegates to the access-rule resolver when present (Phase 5);
    falls back to legacy assignments."""
    if doc.scope != "company" or (doc.publish_state or "published") != "published":
        return False
    try:
        from app.modules.hr.documents import access_resolver
        return access_resolver.can_view(db, access_resolver.viewer_for(user), doc)
    except ImportError:
        DocumentAssignment, _, _ = _models()
        return db.query(DocumentAssignment.id).filter(DocumentAssignment.document_id == doc.id,
                                                      DocumentAssignment.employee_id == user.id).first() is not None


def get_readable_document(db: Session, user, document_id: int):
    _, HrDocument, _ = _models()
    doc = (db.query(HrDocument)
           .filter(HrDocument.id == document_id, HrDocument.organization_id == user.organization_id,
                   HrDocument.is_deleted.is_(False)).first())
    if doc is None:
        raise errors.not_found()
    if is_document_admin(user) or is_owner(user, doc):
        return doc
    if doc.scope == "company" and company_visible(db, user, doc):
        return doc
    if doc.scope != "company" and doc.employee_id is None and doc.uploaded_by != user.id:
        # legacy rows predating scope: only readable through an explicit assignment
        DocumentAssignment, _, _ = _models()
        if db.query(DocumentAssignment.id).filter(DocumentAssignment.document_id == doc.id,
                                                  DocumentAssignment.employee_id == user.id).first():
            return doc
    raise errors.not_found()


def readable_version(db: Session, user, doc, version_id: Optional[int] = None):
    """The version `user` may open: a specific one (admins and owners only), else the latest for admins / owners and the
    approved one for everyone else. None when the document has no version rows (legacy single-file documents)."""
    _, _, HrDocumentVersion = _models()
    privileged = is_document_admin(user) or is_owner(user, doc)
    if version_id is not None:
        if not privileged and version_id != doc.approved_version_id:
            raise errors.not_found("Version")
        v = (db.query(HrDocumentVersion).filter(HrDocumentVersion.id == version_id, HrDocumentVersion.document_id == doc.id)
             .first())
        if v is None:
            raise errors.not_found("Version")
        return v
    if privileged:
        return (db.query(HrDocumentVersion).filter(HrDocumentVersion.document_id == doc.id)
                .order_by(HrDocumentVersion.version.desc()).first())
    if doc.approved_version_id:
        return db.get(HrDocumentVersion, doc.approved_version_id)
    if doc.scope == "company":
        raise errors.not_found()            # nothing approved yet: not visible to readers
    return None


def serve(db: Session, user, doc, version=None, *, disposition: str = "inline", ctx=None) -> Response:
    """The file's bytes as a response, audited. 410 when the record exists but the bytes are gone."""
    from app.modules.hr import file_storage
    source = version if version is not None and (version.storage_key or version.file_path) else doc
    data = storage_service.open_for_read(source)
    if data is None and source is not doc:
        source = doc
        data = storage_service.open_for_read(doc)
    if data is None:
        raise errors.DocError(410, "DOC_FILE_MISSING", "The file for this document is not available on the server. "
                                                       "Ask an administrator to upload it again.")
    name = (getattr(source, "file_name", None) or doc.file_name or f"document-{doc.id}").replace('"', "")
    media = file_storage.effective_media_type(name, getattr(source, "mime_type", None) or doc.mime_type)
    if disposition == "attachment" and doc.scope == "company" and not (is_document_admin(user) or is_owner(user, doc)):
        from app.modules.hr.documents import access_resolver
        if not access_resolver.can_download(db, access_resolver.viewer_for(user), doc):
            raise errors.forbidden("This document can be viewed but not downloaded.")
    action = "downloaded" if disposition == "attachment" else "viewed"
    if action == "downloaded" or audit_service.should_log_view(db, getattr(user, "id", None), doc.id):
        audit_service.record(db, org_id=doc.organization_id, actor=user, action=action, target_type="document", target_id=doc.id,
                             document_id=doc.id, employee_id=doc.employee_id, ctx=ctx,
                             after={"version_id": getattr(version, "id", None)})
        db.commit()
    return Response(content=data, media_type=media,
                    headers={"Content-Disposition": f'{disposition}; filename="{name}"', "Cache-Control": "private, no-store"})
