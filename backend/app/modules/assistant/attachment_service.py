"""
modules/assistant/attachment_service.py
-------------------------------------------
Attachment upload, a validation-only "scan" stub, and best-effort text
extraction (AI Guardrail spec Section 16; UI/UX P1). Scope is deliberately
narrow: text extraction only works for PDF and plain text; anything else
uploads fine but is honestly reported as not extractable rather than
guessed at.

No real malware/AV scanning is integrated — "scan_status" reflects file
type/size validation only. That's a genuine gap, not something to pretend
is more than it is; the docstring on `_run_scan` says so explicitly.
"""

import os
import uuid

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException, NotFoundException
from app.modules.assistant.models import (
    ChatAttachment, ChatAttachmentProcessing, AttachmentScanStatus,
)

MAX_FILE_SIZE_MB = 10
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".txt", ".doc", ".docx", ".png", ".jpg", ".jpeg"}
TEXT_EXTRACTABLE_EXTENSIONS = {".pdf", ".txt"}
MAX_EXTRACTED_CHARS = 20_000  # bounds how much attachment text ever reaches the model

UPLOAD_DIR = os.environ.get(
    "ASSISTANT_ATTACHMENT_UPLOAD_DIR",
    os.path.join(os.environ.get("UPLOAD_BASE_DIR", "/tmp/uploads"), "assistant_attachments"),
)


def _validate(file: UploadFile) -> str:
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise BadRequestException(f"File type '{ext}' is not allowed. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}")
    return ext


async def upload_attachment(db: Session, conversation_id: int, organization_id: int, employee_id: int, file: UploadFile) -> ChatAttachment:
    ext = _validate(file)
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE_BYTES:
        raise BadRequestException(f"File too large. Maximum size is {MAX_FILE_SIZE_MB}MB.")

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_name)
    with open(file_path, "wb") as fh:
        fh.write(contents)

    attachment = ChatAttachment(
        conversation_id=conversation_id, uploaded_by=employee_id, file_path=file_path,
        file_name=file.filename or unique_name, mime_type=file.content_type,
        size_bytes=len(contents), scan_status=AttachmentScanStatus.PENDING,
    )
    db.add(attachment)
    db.flush()

    _run_scan(db, attachment)
    _run_extraction(db, attachment, contents, ext)

    db.commit()
    db.refresh(attachment)
    return attachment


def _run_scan(db: Session, attachment: ChatAttachment) -> None:
    """Validation-only stub, NOT a real malware scan — extension and size
    were already checked before the file was written. No AV engine is
    integrated in this build; treat scan_status=CLEAN accordingly."""
    attachment.scan_status = AttachmentScanStatus.CLEAN
    db.add(ChatAttachmentProcessing(
        attachment_id=attachment.id, stage="scan", status="completed",
        detail="Extension/size validation only — no malware scanner integrated.",
    ))


def _run_extraction(db: Session, attachment: ChatAttachment, contents: bytes, ext: str) -> None:
    if ext not in TEXT_EXTRACTABLE_EXTENSIONS:
        db.add(ChatAttachmentProcessing(
            attachment_id=attachment.id, stage="extract", status="unsupported",
            detail=f"Text extraction is not supported for '{ext}' files in this build.",
        ))
        return

    try:
        text = _extract_text(contents, ext)
        truncated = text[:MAX_EXTRACTED_CHARS]
        db.add(ChatAttachmentProcessing(
            attachment_id=attachment.id, stage="extract", status="completed", detail=truncated,
        ))
    except Exception as e:
        db.add(ChatAttachmentProcessing(
            attachment_id=attachment.id, stage="extract", status="failed", detail=str(e),
        ))


def _extract_text(contents: bytes, ext: str) -> str:
    if ext == ".txt":
        return contents.decode("utf-8", errors="replace")
    if ext == ".pdf":
        import io
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(contents))
        return "\n\n".join(page.extract_text() or "" for page in reader.pages)
    raise ValueError(f"No extractor for '{ext}'")


def get_extracted_text(db: Session, attachment_id: int) -> str | None:
    """Returns the extracted text for an attachment if extraction
    succeeded, else None (caller must treat that as 'not usable as
    evidence', never guess at the content)."""
    processing = (
        db.query(ChatAttachmentProcessing)
        .filter(ChatAttachmentProcessing.attachment_id == attachment_id, ChatAttachmentProcessing.stage == "extract")
        .order_by(ChatAttachmentProcessing.id.desc())
        .first()
    )
    if not processing or processing.status != "completed":
        return None
    return processing.detail


def get_attachment(db: Session, organization_id: int, attachment_id: int) -> ChatAttachment:
    from app.modules.assistant.models import ChatConversation
    attachment = (
        db.query(ChatAttachment)
        .join(ChatConversation, ChatConversation.id == ChatAttachment.conversation_id)
        .filter(ChatAttachment.id == attachment_id, ChatConversation.organization_id == organization_id)
        .first()
    )
    if not attachment:
        raise NotFoundException("Attachment", attachment_id)
    return attachment


def delete_attachment(db: Session, organization_id: int, employee_id: int, attachment_id: int) -> None:
    attachment = get_attachment(db, organization_id, attachment_id)
    if attachment.uploaded_by != employee_id:
        raise NotFoundException("Attachment", attachment_id)
    db.query(ChatAttachmentProcessing).filter(ChatAttachmentProcessing.attachment_id == attachment.id).delete(synchronize_session=False)
    db.delete(attachment)
    db.commit()
    try:
        os.remove(attachment.file_path)
    except OSError:
        pass
