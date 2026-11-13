"""Routes for the offer package (see onboarding_package).

HR (org admin / HR admin):
  GET/PUT /hr/onboarding/company-profile                     the organisation's Company Profile (employer particulars)
  POST /hr/onboarding/company-profile/prefill               proposed values from the organisation record (never saved)
  GET  /hr/onboarding/package/settings                      employer particulars, branding, clause library, documents
  PUT  /hr/onboarding/package/settings
  POST/GET/DELETE /hr/onboarding/package/logo             the company logo printed in headers and the letterhead
  GET  /hr/onboarding/package/template.pdf                  cover sheet + 10 templates + Placeholder Dictionary
  GET  /hr/onboarding/new-hires/{id}/package                each document's readiness and state for one new hire
  PUT  /hr/onboarding/new-hires/{id}/package/inputs         HR-entered values for missing data
  GET  /hr/onboarding/new-hires/{id}/package/{category}/preview.pdf
  (sending is POST /hr/onboarding/new-hires/{id}/send-package in hr/router.py)
Public (the pre-onboarding link token is the credential):
  POST /public/onboarding/{token}/documents/{document_id}/acknowledge
  POST /public/onboarding/{token}/outside-activities
  GET  /public/onboarding/{token}/package/{category}/file   the issued package file (e.g. the blank application form)
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Body, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_admin
from app.core.rate_limiter import limiter
from app.database import get_db
from app.modules.doc_templates import storage
from app.modules.hr import onboarding_flow, onboarding_package, service
from app.modules.hr import onboarding_package_content as C
from app.modules.hr.models import OnboardingDocument

router = APIRouter(prefix="/hr/onboarding", tags=["Onboarding offer package"])
portal_router = APIRouter(prefix="/public/onboarding", tags=["Pre-onboarding (new hire)"])


def _pdf(data: bytes, name: str, inline: bool = True) -> Response:
    disp = "inline" if inline else "attachment"
    return Response(content=data, media_type="application/pdf",
                    headers={"Content-Disposition": f'{disp}; filename="{name}"', "Cache-Control": "no-store"})


def _hire(db, user, new_hire_id: int):
    return service.get_new_hire_by_id(db, new_hire_id, organization_id=user.organization_id)


@router.get("/signed-documents", summary="Onboarding documents signed by new hires, with each signature")
def signed_documents(new_hire_id: Optional[int] = None, db: Session = Depends(get_db), user=Depends(get_current_admin)):
    return {"items": onboarding_package.signed_documents(db, user.organization_id, new_hire_id)}


@router.get("/signatures/{signature_id}/image", summary="The drawn signature image (PNG)")
def signature_image(signature_id: int, db: Session = Depends(get_db), user=Depends(get_current_admin)):
    png = onboarding_package.signature_image(db, user.organization_id, signature_id)
    return Response(content=png, media_type="image/png", headers={"Cache-Control": "private, no-store"})


@router.get("/package/settings", summary="Offer package settings, clause library and documents")
def get_settings(db: Session = Depends(get_db), user=Depends(get_current_admin)):
    return onboarding_package.settings_view(db, user.organization_id)


@router.put("/package/settings", summary="Save offer package settings and counsel clause wording")
def put_settings(data: dict = Body(...), db: Session = Depends(get_db), user=Depends(get_current_admin)):
    # applies to documents generated from now on; documents already sent are final and never change
    onboarding_package.save_config(db, user, data)
    return onboarding_package.settings_view(db, user.organization_id)


@router.get("/company-profile", summary="The organisation's Company Profile and how complete it is")
def get_company_profile(db: Session = Depends(get_db), user=Depends(get_current_admin)):
    from app.modules.hr import company_profile
    return company_profile.profile_view(db, user.organization_id)


@router.put("/company-profile", summary="Save the organisation's Company Profile (validated; 422 lists each field's problem)")
def put_company_profile(data: dict = Body(...), db: Session = Depends(get_db), user=Depends(get_current_admin)):
    from app.modules.hr import company_profile
    company_profile.save_profile(db, user, data)
    return company_profile.profile_view(db, user.organization_id)


@router.post("/company-profile/prefill", summary="Propose Company Profile values from the organisation record (not saved)")
def prefill_company_profile(db: Session = Depends(get_db), user=Depends(get_current_admin)):
    from app.modules.hr import company_profile
    return company_profile.prefill(db, user.organization_id)


@router.get("/profiles", summary="Engagement Profiles and Role Profiles")
def get_profiles(db: Session = Depends(get_db), user=Depends(get_current_admin)):
    from app.modules.hr import onboarding_profiles
    return onboarding_profiles.view(db, user.organization_id)


@router.put("/profiles/engagement/{slug}", summary="Create or update an Engagement Profile")
def put_engagement_profile(slug: str, data: dict = Body(...), db: Session = Depends(get_db), user=Depends(get_current_admin)):
    from app.modules.hr import onboarding_profiles
    onboarding_profiles.save_engagement(db, user, slug, data)
    return onboarding_profiles.view(db, user.organization_id)


@router.delete("/profiles/engagement/{slug}", summary="Delete an Engagement Profile (not while an unsent hire uses it)")
def delete_engagement_profile(slug: str, db: Session = Depends(get_db), user=Depends(get_current_admin)):
    from app.modules.hr import onboarding_profiles
    onboarding_profiles.delete_engagement(db, user, slug)
    return onboarding_profiles.view(db, user.organization_id)


@router.put("/profiles/role/{slug}", summary="Create or update a Role Profile")
def put_role_profile(slug: str, data: dict = Body(...), db: Session = Depends(get_db), user=Depends(get_current_admin)):
    from app.modules.hr import onboarding_profiles
    onboarding_profiles.save_role(db, user, slug, data)
    return onboarding_profiles.view(db, user.organization_id)


@router.delete("/profiles/role/{slug}", summary="Delete a Role Profile (not while an unsent hire uses it)")
def delete_role_profile(slug: str, db: Session = Depends(get_db), user=Depends(get_current_admin)):
    from app.modules.hr import onboarding_profiles
    onboarding_profiles.delete_role(db, user, slug)
    return onboarding_profiles.view(db, user.organization_id)


@router.post("/package/logo", summary="Upload the company logo printed on every package document")
async def upload_logo(file: UploadFile = File(...), db: Session = Depends(get_db), user=Depends(get_current_admin)):
    data = await file.read(onboarding_package.LOGO_MAX_BYTES + 1)
    return onboarding_package.save_logo(db, user, data)


@router.get("/package/logo", summary="The company logo used on package documents")
def get_logo(db: Session = Depends(get_db), user=Depends(get_current_admin)):
    data = onboarding_package.logo_bytes(db, user.organization_id)
    if not data:
        raise HTTPException(404, "No logo has been uploaded.")
    return Response(content=data, media_type="image/png", headers={"Cache-Control": "no-store"})


@router.delete("/package/logo", summary="Remove the company logo (documents show the logo placeholder again)")
def delete_logo(db: Session = Depends(get_db), user=Depends(get_current_admin)):
    return onboarding_package.remove_logo(db, user)


@router.get("/package/template.pdf", summary="The full template set: cover sheet, 10 templates, Placeholder Dictionary")
def template_set(db: Session = Depends(get_db), user=Depends(get_current_admin)):
    return _pdf(onboarding_package.template_set_pdf(db, user.organization_id), "offer-package-template-set.pdf", inline=False)


@router.get("/new-hires/{new_hire_id}/package", summary="Readiness and state of each package document for a new hire")
def hire_package(new_hire_id: int, db: Session = Depends(get_db), user=Depends(get_current_admin)):
    return onboarding_package.package_view(db, _hire(db, user, new_hire_id))


@router.put("/new-hires/{new_hire_id}/package/inputs", summary="Values HR enters for a new hire's missing package data")
def hire_package_inputs(new_hire_id: int, data: dict = Body(...), db: Session = Depends(get_db), user=Depends(get_current_admin)):
    hire = _hire(db, user, new_hire_id)
    onboarding_package.save_hire_inputs(db, hire, (data or {}).get("values") or {})
    return onboarding_package.package_view(db, hire)


@router.get("/new-hires/{new_hire_id}/package/{category}/preview.pdf", summary="Preview one package document for a new hire")
def hire_package_preview(new_hire_id: int, category: str, db: Session = Depends(get_db), user=Depends(get_current_admin)):
    hire = _hire(db, user, new_hire_id)
    if category not in C.DOCS:
        raise HTTPException(404, "Unknown package document.")
    return _pdf(onboarding_package.preview_pdf(db, hire, category), f"{C.DOCS[category]['template_id']}-preview.pdf")


def _attachment(data: bytes, name: str, media_type: str) -> Response:
    """Download response with an RFC 5987 file name (the names are ASCII already; filename* keeps any client happy)."""
    from urllib.parse import quote
    return Response(content=data, media_type=media_type,
                    headers={"Content-Disposition": f"attachment; filename=\"{name}\"; filename*=UTF-8''{quote(name)}",
                             "Cache-Control": "no-store"})


DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


@router.get("/new-hires/{new_hire_id}/package/download.zip", summary="Download all package documents for a new hire (ZIP)")
def hire_package_zip(new_hire_id: int, format: str = "pdf", db: Session = Depends(get_db), user=Depends(get_current_admin)):
    data, name = onboarding_package.package_zip(db, _hire(db, user, new_hire_id), format)
    return _attachment(data, name, "application/zip")


@router.get("/new-hires/{new_hire_id}/package/{category}/download", summary="Download one package document (PDF or DOCX)")
def hire_package_download(new_hire_id: int, category: str, format: str = "pdf", db: Session = Depends(get_db),
                          user=Depends(get_current_admin)):
    hire = _hire(db, user, new_hire_id)
    if format == "docx":
        data, name = onboarding_package.document_docx(db, hire, category)
        return _attachment(data, name, DOCX_TYPE)
    if format != "pdf":
        raise HTTPException(422, "format must be pdf or docx.")
    data, name, _state = onboarding_package.document_file(db, hire, category)
    return _attachment(data, name, "application/pdf")


@router.post("/package/bulk-generate", summary="Generate the package documents of up to 50 new hires into one ZIP (nothing is sent)")
def bulk_generate(data: dict = Body(...), db: Session = Depends(get_db), user=Depends(get_current_admin)):
    from app.modules.hr import onboarding_package_bulk
    return onboarding_package_bulk.start(db, user, (data or {}).get("new_hire_ids"))


@router.get("/package/jobs/{job_id}", summary="Progress of a bulk generation job")
def bulk_job(job_id: str, db: Session = Depends(get_db), user=Depends(get_current_admin)):
    from app.modules.hr import onboarding_package_bulk
    return onboarding_package_bulk.job_view(db, user.organization_id, job_id)


@router.get("/package/jobs/{job_id}/download.zip", summary="Download a finished bulk generation job")
def bulk_job_zip(job_id: str, db: Session = Depends(get_db), user=Depends(get_current_admin)):
    from app.modules.hr import onboarding_package_bulk
    data = onboarding_package_bulk.job_zip(db, user.organization_id, job_id)
    return _attachment(data, f"ONBOARDING_PACKAGES_{job_id}.zip", "application/zip")


# ── public portal ───────────────────────────────────────────────────────────────────────────────────────────────────
@portal_router.post("/{token}/documents/{document_id}/acknowledge", summary="Acknowledge receipt of a package document")
@limiter.limit("20/minute")
def portal_acknowledge(request: Request, token: str, document_id: int, data: Optional[dict] = Body(default=None),
                       db: Session = Depends(get_db)):
    hire = onboarding_flow.hire_for_token(db, token)
    doc = db.query(OnboardingDocument).filter(OnboardingDocument.id == document_id,
                                              OnboardingDocument.onboarding_new_hire_id == hire.id,
                                              OnboardingDocument.is_deleted == False).first()  # noqa: E712
    if doc is None:
        raise HTTPException(404, "Document not found.")
    onboarding_package.acknowledge(db, hire, doc, text_version=(data or {}).get("text_version") or "",
                                   ip=request.client.host if request.client else None,
                                   user_agent=request.headers.get("user-agent"))
    return onboarding_flow.portal_view(db, hire)


@portal_router.post("/{token}/outside-activities", summary="Declare outside activities for the exclusivity affidavit")
@limiter.limit("20/minute")
def portal_outside_activities(request: Request, token: str, data: dict = Body(...), db: Session = Depends(get_db)):
    hire = onboarding_flow.hire_for_token(db, token)
    onboarding_package.save_outside_activities(db, hire, data)
    onboarding_package.release_held(db, hire)
    return onboarding_flow.portal_view(db, hire)


@portal_router.get("/{token}/package/{category}/file", summary="Download an issued package document")
@limiter.limit("60/minute")
def portal_package_file(request: Request, token: str, category: str, db: Session = Depends(get_db)):
    hire = onboarding_flow.hire_for_token(db, token)
    if category not in C.DOCS:
        raise HTTPException(404, "Document not found.")
    issued = db.query(OnboardingDocument).filter(OnboardingDocument.onboarding_new_hire_id == hire.id,
                                                 OnboardingDocument.category == category,
                                                 OnboardingDocument.is_deleted == False).first()  # noqa: E712
    key = onboarding_package.package_file_key(hire, category)
    if issued is None or not key:
        raise HTTPException(404, "This document has not been issued to you.")
    try:
        data = storage.get_store().get(key)
    except (FileNotFoundError, ValueError):
        raise HTTPException(410, "The file for this document is not available.")
    return _pdf(data, f"{C.DOCS[category]['template_id']} {C.DOCS[category]['title']}.pdf", inline=False)
