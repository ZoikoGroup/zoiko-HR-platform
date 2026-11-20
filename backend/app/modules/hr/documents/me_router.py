"""Employee portal endpoints for the person's own documents (ZHR-DOCS-ARCH-001 §7.4)."""
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.modules.hr.documents import me_service, portal_service
from app.modules.hr.documents.audit_service import RequestCtx, request_ctx
from app.modules.hr.documents.permissions import DocAction, require_doc_permission
from app.modules.hr.documents.precheck import MAX_BYTES

router = APIRouter(prefix="/hr/me/documents", tags=["📄 HR Documents · Me"])


@router.get("/counts", summary="Badges for my Documents tabs")
def my_counts(db: Session = Depends(get_db), user=Depends(require_doc_permission(DocAction.ME_VIEW))):
    return portal_service.counts(db, user)


@router.get("/categories", summary="My document containers, with each file's status")
def my_categories(db: Session = Depends(get_db), user=Depends(require_doc_permission(DocAction.ME_VIEW))):
    return me_service.my_categories(db, user)


@router.get("", summary="My uploaded documents")
def my_files(category_id: Optional[int] = Query(None), db: Session = Depends(get_db),
             user=Depends(require_doc_permission(DocAction.ME_VIEW))):
    return me_service.my_files(db, user, category_id)


@router.post("", status_code=201, summary="Upload one of my documents (it goes to HR for approval)")
def upload_my_file(
    category_id: int = Form(...),
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    expiry_date: Optional[str] = Form(None),
    replaces_document_id: Optional[int] = Form(None),
    id_number: Optional[str] = Form(None, max_length=40),
    db: Session = Depends(get_db),
    user=Depends(require_doc_permission(DocAction.ME_UPLOAD)),
    ctx: RequestCtx = Depends(request_ctx),
):
    data = file.file.read(MAX_BYTES + 1)          # one byte over the limit is enough to refuse it
    return me_service.upload_my_file(db, user, category_id=category_id, data=data, filename=file.filename or "",
                                     title=title, expiry_date=expiry_date, replaces_document_id=replaces_document_id,
                                     id_number=id_number, ctx=ctx)


@router.delete("/{document_id}", status_code=204, summary="Remove my upload while it is still waiting for review")
def withdraw(document_id: int, db: Session = Depends(get_db), user=Depends(require_doc_permission(DocAction.ME_UPLOAD)),
             ctx: RequestCtx = Depends(request_ctx)):
    me_service.withdraw_pending(db, user, document_id, ctx)
