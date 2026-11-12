"""The new hire's pre-onboarding page, reached from the link in their welcome email (no account, no password).

    GET  /public/onboarding/{token}                        what the organization asked for, and what is uploaded
    POST /public/onboarding/{token}/documents/{doc_id}     upload a requested (or rejected) document
    PUT  /public/onboarding/{token}/details                address and emergency contact

The token is long, random, stored only hashed (plus encrypted so emails can repeat it), expires, and stops working when
onboarding completes or is cancelled. A wrong or dead token answers 404 like any unknown page.
"""
import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from app.core.rate_limiter import limiter
from app.database import get_db
from app.modules.hr import onboarding_flow
from app.modules.hr.models import OnboardingDocument
from app.modules.hr.schemas import OnboardingPortalDetails

portal_router = APIRouter(prefix="/public/onboarding", tags=["Pre-onboarding (new hire)"])


@portal_router.get("/{token}", summary="The new hire's pre-onboarding page")
@limiter.limit("60/minute")
def portal_view(request: Request, token: str, db: Session = Depends(get_db)):
    return onboarding_flow.portal_view(db, onboarding_flow.hire_for_token(db, token))


@portal_router.put("/{token}/details", summary="Save the new hire's address and emergency contact")
@limiter.limit("20/minute")
def portal_details(request: Request, token: str, data: OnboardingPortalDetails, db: Session = Depends(get_db)):
    hire = onboarding_flow.hire_for_token(db, token)
    return onboarding_flow.save_portal_details(db, hire, data.model_dump(exclude_unset=True))


@portal_router.post("/{token}/documents/{document_id}", summary="Upload a requested document")
@limiter.limit("20/minute")
async def portal_upload(request: Request, token: str, document_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    from app.modules.hr.router import MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB, _ONBOARDING_DOC_UPLOAD_DIR, _validate_upload_file
    from app.core.privacy.files import tenant_upload_path
    from app.modules.hr.service import log_onboarding_activity

    hire = onboarding_flow.hire_for_token(db, token)
    doc = db.query(OnboardingDocument).filter(
        OnboardingDocument.id == document_id, OnboardingDocument.onboarding_new_hire_id == hire.id,
        OnboardingDocument.is_deleted == False).first()  # noqa: E712
    if doc is None:
        raise HTTPException(status_code=404, detail="Not Found")
    if doc.status == "approved":
        raise HTTPException(status_code=400, detail="This document is already approved.")
    _validate_upload_file(file)
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="The selected file is empty.")
    if len(contents) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail=f"File too large. Maximum size is {MAX_FILE_SIZE_MB}MB.")
    os.makedirs(_ONBOARDING_DOC_UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1][:10]
    path = tenant_upload_path(_ONBOARDING_DOC_UPLOAD_DIR, hire.organization_id, f"{uuid.uuid4().hex}{ext}")
    with open(path, "wb") as fh:
        fh.write(contents)
    doc.file_path, doc.status, doc.rejection_reason = path, "pending", None
    if hire.status in ("offer_sent", "offer_accepted"):
        hire.status = "pre_joining"                        # the new hire has started their part
    db.commit()
    log_onboarding_activity(db, hire.id, "Document Submitted", f"{hire.candidate_name} uploaded '{doc.title}' for review.", hire.organization_id)
    from app.modules.hr import onboarding_package
    onboarding_package.sync_onboarding_document_checklist(db, hire)
    return onboarding_flow.portal_view(db, hire)


@portal_router.get("/{token}/documents/{document_id}/file", summary="View or download an onboarding document")
@limiter.limit("60/minute")
def portal_download_document(request: Request, token: str, document_id: int, db: Session = Depends(get_db)):
    from fastapi.responses import FileResponse
    from app.modules.hr import file_storage
    from app.core.privacy.files import belongs_to_tenant

    hire = onboarding_flow.hire_for_token(db, token)
    doc = db.query(OnboardingDocument).filter(
        OnboardingDocument.id == document_id,
        OnboardingDocument.onboarding_new_hire_id == hire.id,
        OnboardingDocument.is_deleted == False,
    ).first()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found or no file uploaded yet.")
    from app.modules.hr import onboarding_package
    stored = onboarding_package.stored_document_pdf(db, doc.document_id, hire.organization_id)
    if stored is not None:                     # an issued / signed document lives in the document store, not on disk
        from fastapi.responses import Response
        data, fname = stored
        return Response(content=data, media_type="application/pdf",
                        headers={"Content-Disposition": f'inline; filename="{fname}"', "Cache-Control": "no-store"})
    if not doc.file_path:
        raise HTTPException(status_code=404, detail="Document not found or no file uploaded yet.")

    resolved = file_storage.resolve_stored_file(doc.file_path) if belongs_to_tenant(doc.file_path, hire.organization_id) else None
    if not resolved:
        raise HTTPException(status_code=410, detail="The file for this document is not available.")

    name = os.path.basename(resolved)
    ext = os.path.splitext(name)[1]
    download_name = f"{doc.title or 'document'}{ext}"
    return FileResponse(
        path=resolved,
        media_type=file_storage.effective_media_type(download_name, None),
        filename=download_name.replace("/", "-").replace("\\", "-"),
    )


@portal_router.post("/{token}/submit-signed-package", summary="The new hire submits their completed onboarding documents")
@limiter.limit("20/minute")
def submit_signed_package(request: Request, token: str, db: Session = Depends(get_db)):
    from app.modules.hr import onboarding_package
    hire = onboarding_flow.hire_for_token(db, token)
    result = onboarding_package.submit_package(db, hire)
    return {**result, "view": onboarding_flow.portal_view(db, hire)}