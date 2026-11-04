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
    return onboarding_flow.portal_view(db, hire)
