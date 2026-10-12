"""Super Admin document repository (ZHR-27 / ZHR-28).

Cross-organization view over the existing HrDocument table. Every document is
attributed to exactly one organization (HrDocument.organization_id is NOT
NULL), so uploads must name one. Deletes are soft (is_deleted), matching the
rest of the product; the stored file is kept for retention/recovery."""

import hashlib
import logging
import os
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import String, cast, func, or_
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_super_admin
from app.core.exceptions import BadRequestException, NotFoundException, ZoikoException
from app.database import get_db
from app.modules.employee.models import Employee
from app.modules.hr.models import (
    HrDocument, HrDocumentCategory, HrDocumentStatus, Organization,
)
from app.modules.super_admin.models import AuditAction, AuditLog

logger = logging.getLogger("zoiko.super_admin.documents")

router = APIRouter(
    prefix="/super-admin/documents", tags=["Super Admin Documents"],
    dependencies=[Depends(get_current_super_admin)],
)

MAX_FILE_SIZE_MB = 10
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
CHUNK = 1024 * 1024

# extension -> (allowed MIME types, magic-number check)
_ZIP = (b"PK\x03\x04",)
_OLE = (b"\xd0\xcf\x11\xe0",)
ALLOWED_TYPES = {
    ".pdf": ({"application/pdf"}, (b"%PDF",)),
    ".png": ({"image/png"}, (b"\x89PNG\r\n\x1a\n",)),
    ".jpg": ({"image/jpeg"}, (b"\xff\xd8\xff",)),
    ".jpeg": ({"image/jpeg"}, (b"\xff\xd8\xff",)),
    ".gif": ({"image/gif"}, (b"GIF87a", b"GIF89a")),
    ".docx": ({"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}, _ZIP),
    ".xlsx": ({"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}, _ZIP),
    ".odt": ({"application/vnd.oasis.opendocument.text"}, _ZIP),
    ".doc": ({"application/msword"}, _OLE),
    ".xls": ({"application/vnd.ms-excel"}, _OLE),
    ".rtf": ({"application/rtf", "text/rtf"}, (b"{\\rtf",)),
    ".txt": ({"text/plain"}, None),
    ".csv": ({"text/csv", "application/vnd.ms-excel", "text/plain"}, None),
}
GENERIC_MIME = {"application/octet-stream", ""}


def _upload_dir() -> str:
    from app.modules.hr.router import _DOCUMENT_UPLOAD_DIR

    return _DOCUMENT_UPLOAD_DIR


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() + "Z" if dt else None


def _cat(doc: HrDocument) -> str:
    return doc.category.value if hasattr(doc.category, "value") else str(doc.category)


def _checksum(doc: HrDocument) -> Optional[str]:
    for t in doc.tags or []:
        if isinstance(t, str) and t.startswith("sha256:"):
            return t[7:]
    return None


def _view(doc: HrDocument, org_name: Optional[str], uploader_name: Optional[str]) -> dict:
    return {
        "id": doc.id, "title": doc.title, "description": doc.description, "category": _cat(doc),
        "document_type": doc.document_type, "file_name": doc.file_name, "file_size": doc.file_size,
        "mime_type": doc.mime_type, "checksum": _checksum(doc),
        "status": doc.status.value if hasattr(doc.status, "value") else str(doc.status),
        "organization_id": doc.organization_id, "organization_name": org_name,
        "uploaded_by": doc.uploaded_by, "uploader_name": uploader_name,
        "created_at": _iso(doc.created_at),
    }


def _org_name(o: Optional[Organization]) -> Optional[str]:
    if o is None:
        return None
    return o.organization_name or o.display_name or getattr(o, "name", None)


def _audit(db: Session, user, action: AuditAction, doc_id, details: dict) -> None:
    db.add(AuditLog(action=action, entity_type="HrDocument", entity_id=doc_id,
                    performed_by=user.id, performed_by_email=user.email, details=details))


def _stored_mime(ext: str, content_type: Optional[str]) -> str:
    ct = (content_type or "").split(";")[0].strip().lower()
    return ct if ct not in GENERIC_MIME else sorted(ALLOWED_TYPES[ext][0])[0]


def _validate_and_detect(filename: str, content_type: Optional[str], head: bytes) -> str:
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in ALLOWED_TYPES:
        allowed = ", ".join(sorted(e.lstrip(".") for e in ALLOWED_TYPES))
        raise BadRequestException(f"File type '{ext or 'unknown'}' is not allowed. Allowed types: {allowed}.")
    mimes, magics = ALLOWED_TYPES[ext]
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct not in GENERIC_MIME and ct not in mimes:
        raise BadRequestException(f"The file's type ({ct}) does not match its extension ({ext}).")
    if magics is not None and not any(head.startswith(m) for m in magics):
        raise BadRequestException(f"The file's contents are not a valid {ext.lstrip('.').upper()} file.")
    if magics is None and b"\x00" in head:
        raise BadRequestException(f"The file's contents are not valid text for {ext}.")
    return ext


@router.get("/organizations")
def list_organizations(db: Session = Depends(get_db)):
    """Id + display name of every organization, for the upload/filter selectors."""
    rows = db.query(Organization).order_by(Organization.id).all()
    return {"organizations": [{"id": o.id, "name": _org_name(o) or f"Organization {o.id}"} for o in rows]}


@router.get("")
def list_documents(
    q: Optional[str] = Query(None, max_length=200),
    organization_id: Optional[int] = None,
    category: Optional[str] = None,
    file_type: Optional[str] = Query(None, max_length=10),
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = (
        db.query(HrDocument, Organization, Employee)
        .join(Organization, Organization.id == HrDocument.organization_id)
        .outerjoin(Employee, Employee.id == HrDocument.uploaded_by)
        .filter(HrDocument.is_deleted.is_(False))
    )
    if organization_id:
        query = query.filter(HrDocument.organization_id == organization_id)
    if category:
        try:
            query = query.filter(HrDocument.category == HrDocumentCategory(category))
        except ValueError:
            raise BadRequestException(f"Unknown category '{category}'.")
    if file_type:
        ext = "." + file_type.lower().lstrip(".")
        query = query.filter(func.lower(HrDocument.file_name).like(f"%{ext}"))
    if date_from:
        query = query.filter(HrDocument.created_at >= date_from.replace(tzinfo=None))
    if date_to:
        query = query.filter(HrDocument.created_at <= date_to.replace(tzinfo=None))
    term = (q or "").strip()
    if term:
        like = f"%{term.lower()}%"
        query = query.filter(or_(
            func.lower(HrDocument.title).like(like),
            func.lower(HrDocument.file_name).like(like),
            func.lower(func.coalesce(HrDocument.description, "")).like(like),
            func.lower(cast(HrDocument.category, String)).like(like),
            func.lower(func.coalesce(Organization.organization_name, "")).like(like),
            func.lower(func.coalesce(Organization.display_name, "")).like(like),
        ))
    total = query.count()
    rows = (query.order_by(HrDocument.created_at.desc(), HrDocument.id.desc())
            .offset((page - 1) * page_size).limit(page_size).all())
    items = [
        _view(d, _org_name(o), f"{u.first_name} {u.last_name}".strip() if u else None) for d, o, u in rows
    ]
    return {"total": total, "page": page, "page_size": page_size, "documents": items}


@router.post("", status_code=201)
async def upload_document(
    db: Session = Depends(get_db),
    user=Depends(get_current_super_admin),
    file: UploadFile = File(...),
    organization_id: int = Form(...),
    title: Optional[str] = Form(None, max_length=200),
    description: Optional[str] = Form(None, max_length=2000),
    category: str = Form("other"),
):
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    if org is None:
        raise BadRequestException("Choose a valid organization for this document.")
    try:
        cat = HrDocumentCategory(category)
    except ValueError:
        raise BadRequestException(f"Unknown category '{category}'.")

    original = os.path.basename((file.filename or "").replace("\\", "/"))[:255]
    head = await file.read(2048)
    if not head:
        raise BadRequestException("The file is empty.")
    ext = _validate_and_detect(original, file.content_type, head)

    directory = _upload_dir()
    os.makedirs(directory, exist_ok=True)
    key = f"{uuid.uuid4().hex}{ext}"  # generated key: no user-controlled path
    path = os.path.join(directory, key)
    sha, size = hashlib.sha256(), 0
    try:
        with open(path, "wb") as fh:
            chunk = head
            while chunk:
                size += len(chunk)
                if size > MAX_FILE_SIZE_BYTES:
                    raise BadRequestException(f"File too large. Maximum size is {MAX_FILE_SIZE_MB} MB.")
                sha.update(chunk)
                fh.write(chunk)
                chunk = await file.read(CHUNK)
    except BaseException:
        if os.path.exists(path):
            os.remove(path)
        raise

    doc = HrDocument(
        title=(title or "").strip() or original or "Untitled Document",
        description=(description or "").strip() or None,
        category=cat, file_path=path, file_name=original, file_size=size,
        mime_type=_stored_mime(ext, file.content_type),
        status=HrDocumentStatus.APPROVED, approved_by=user.id, approved_at=datetime.utcnow(),
        uploaded_by=user.id, organization_id=org.id, tags=[f"sha256:{sha.hexdigest()}"],
    )
    db.add(doc)
    try:
        db.flush()
        _audit(db, user, AuditAction.CREATE, doc.id, {
            "event": "document.uploaded", "file_name": original, "size": size,
            "sha256": sha.hexdigest(), "organization_id": org.id, "category": cat.value,
        })
        db.commit()
    except Exception:
        db.rollback()
        if os.path.exists(path):
            os.remove(path)
        raise
    return _view(doc, _org_name(org), f"{user.first_name} {user.last_name}".strip())


def _get_doc(db: Session, document_id: int, include_deleted: bool = False) -> HrDocument:
    q = db.query(HrDocument).filter(HrDocument.id == document_id)
    if not include_deleted:
        q = q.filter(HrDocument.is_deleted.is_(False))
    doc = q.first()
    if doc is None:
        raise NotFoundException("Document", document_id)
    return doc


@router.get("/{document_id}/download")
def download_document(document_id: int, db: Session = Depends(get_db), user=Depends(get_current_super_admin)):
    doc = _get_doc(db, document_id)
    if not doc.file_path or not os.path.isfile(doc.file_path):
        raise ZoikoException(404, "FILE_MISSING", "The stored file could not be found.")
    _audit(db, user, AuditAction.UPDATE, doc.id, {"event": "document.downloaded", "file_name": doc.file_name})
    db.commit()
    # FileResponse streams from disk and emits Content-Disposition: attachment
    # with an RFC 5987-encoded filename (safe for non-ASCII / quotes).
    return FileResponse(
        doc.file_path, media_type=doc.mime_type or "application/octet-stream",
        filename=doc.file_name or f"document-{doc.id}",
        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store"},
    )


@router.delete("/{document_id}")
def delete_document(document_id: int, db: Session = Depends(get_db), user=Depends(get_current_super_admin)):
    doc = _get_doc(db, document_id, include_deleted=True)
    if doc.is_deleted:
        return {"message": "Document was already deleted.", "already_deleted": True}
    doc.is_deleted = True
    _audit(db, user, AuditAction.DELETE, doc.id, {
        "event": "document.deleted", "file_name": doc.file_name, "organization_id": doc.organization_id,
    })
    db.commit()
    return {"message": f"'{doc.title}' was deleted.", "already_deleted": False}
