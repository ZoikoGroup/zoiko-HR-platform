"""The new hire's pre-onboarding page, reached from the link in their welcome email (no account, no password).

    GET  /public/onboarding/{token}                        what the organization asked for, and what is uploaded
    POST /public/onboarding/{token}/documents/{doc_id}     upload a requested (or rejected) document
    PUT  /public/onboarding/{token}/details                address and emergency contact

The token is long, random, stored only hashed (plus encrypted so emails can repeat it), expires, and stops working when
onboarding completes or is cancelled. A wrong or dead token answers 404 like any unknown page.
"""
import os
import re
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
    from app.modules.hr.router import MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB, _validate_upload_file

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
    from app.modules.hr import onboarding_org_settings as OS
    OS.check_upload(db, hire.organization_id, doc.category, file.filename or "", len(contents))   # the category's own limits
    from app.modules.hr import onboarding_submissions
    if onboarding_submissions.kind_of(doc) == "form":
        raise HTTPException(status_code=400, detail="This form is filled in online, not uploaded.")
    from app.modules.doc_templates import storage
    ext = re.sub(r"[^A-Za-z0-9]", "", os.path.splitext(file.filename or "")[1])[:10]
    # filed in the document store under the tenant
    doc.file_path = storage.get_store().put(hire.organization_id, f"onbupload-{hire.id}-{uuid.uuid4().hex}{'.' + ext if ext else ''}", contents)
    doc.status, doc.rejection_reason = "pending", None
    onboarding_submissions.on_submitted(db, hire, "upload", doc)     # activity, HR digest, checklist, one commit
    return onboarding_flow.portal_view(db, hire)


@portal_router.get("/{token}/documents/{document_id}/file", summary="View or download an onboarding document")
@limiter.limit("60/minute")
def portal_download_document(request: Request, token: str, document_id: int, download: bool = False,
                             db: Session = Depends(get_db)):
    hire = onboarding_flow.hire_for_token(db, token)
    doc = db.query(OnboardingDocument).filter(
        OnboardingDocument.id == document_id,
        OnboardingDocument.onboarding_new_hire_id == hire.id,
        OnboardingDocument.is_deleted == False,
    ).first()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found or no file uploaded yet.")
    from app.modules.hr import onboarding_submissions
    return onboarding_submissions.file_response(db, doc, download=download)


@portal_router.post("/{token}/submit-signed-package", summary="The new hire submits their completed onboarding documents")
@limiter.limit("20/minute")
def submit_signed_package(request: Request, token: str, db: Session = Depends(get_db)):
    from app.modules.hr import onboarding_package
    hire = onboarding_flow.hire_for_token(db, token)
    result = onboarding_package.submit_package(db, hire)
    return {**result, "view": onboarding_flow.portal_view(db, hire)}


# ── "My documents": everything this new hire was asked for or handed back ───────────────────────────────────────────
@portal_router.get("/{token}/my-documents", summary="The new hire's own documents, with status and what they can do")
@limiter.limit("60/minute")
def portal_my_documents(request: Request, token: str, db: Session = Depends(get_db)):
    from app.modules.hr import onboarding_submissions
    return onboarding_submissions.my_documents(db, onboarding_flow.hire_for_token(db, token))


@portal_router.get("/{token}/my-documents.zip", summary="Every available file of the new hire, as one ZIP")
@limiter.limit("20/minute")
def portal_my_documents_zip(request: Request, token: str, db: Session = Depends(get_db)):
    from app.modules.hr import onboarding_submissions as S
    hire = onboarding_flow.hire_for_token(db, token)
    return S.zip_response(db, S.hire_documents(db, hire), S.hire_zip_name(hire))


@portal_router.get("/{token}/my-documents/{document_id}/file", summary="View or download one of the new hire's documents")
@limiter.limit("60/minute")
def portal_my_document_file(request: Request, token: str, document_id: int, download: bool = False, db: Session = Depends(get_db)):
    from app.modules.hr import onboarding_submissions as S
    hire = onboarding_flow.hire_for_token(db, token)
    return S.file_response(db, S.hire_document(db, hire, document_id), download=download)
