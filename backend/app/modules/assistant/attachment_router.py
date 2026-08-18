from fastapi import APIRouter, Depends, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_user, get_organization_id
from app.core.rate_limiter import limiter
from fastapi import Request

from app.modules.assistant import attachment_service, conversation_service, audit_service
from app.modules.assistant.schemas import AttachmentResponse, SuccessResponse

attachment_router = APIRouter(prefix="/assistant/attachments", tags=["Assistant Attachments"])


def _serialize(db: Session, attachment) -> dict:
    return {
        "id": attachment.id,
        "conversation_id": attachment.conversation_id,
        "file_name": attachment.file_name,
        "mime_type": attachment.mime_type,
        "size_bytes": attachment.size_bytes,
        "scan_status": attachment.scan_status.value if hasattr(attachment.scan_status, "value") else attachment.scan_status,
        "extraction_available": attachment_service.get_extracted_text(db, attachment.id) is not None,
        "created_at": attachment.created_at,
    }


@attachment_router.post("", response_model=AttachmentResponse)
@limiter.limit("20/hour")
async def upload_attachment(
    request: Request,
    conversation_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    organization_id: int = Depends(get_organization_id),
):
    # 404s if the conversation isn't the caller's own — org + owner scoped.
    conversation_service.get_conversation(db, organization_id, current_user.id, conversation_id)
    attachment = await attachment_service.upload_attachment(db, conversation_id, organization_id, current_user.id, file)
    audit_service.record(db, organization_id, "attachment_uploaded", "chat_attachment", attachment.id, current_user.id)
    db.commit()
    return _serialize(db, attachment)


@attachment_router.get("/{attachment_id}", response_model=AttachmentResponse)
def get_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    organization_id: int = Depends(get_organization_id),
):
    attachment = attachment_service.get_attachment(db, organization_id, attachment_id)
    return _serialize(db, attachment)


@attachment_router.delete("/{attachment_id}", response_model=SuccessResponse)
def delete_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    organization_id: int = Depends(get_organization_id),
):
    attachment_service.delete_attachment(db, organization_id, current_user.id, attachment_id)
    return SuccessResponse(message="Attachment deleted.")
