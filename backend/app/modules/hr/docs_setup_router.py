"""Routes for "Set up docs for your organisation" and the Word template import (admin and HR admin only).

    POST   /hr/onboarding/docs-setup/sessions                              create or resume the open session
    GET    /hr/onboarding/docs-setup/sessions/{id}                         status, files, progress, counts
    PUT    /hr/onboarding/docs-setup/sessions/{id}/step                    remember the step the admin is on
    POST   /hr/onboarding/docs-setup/sessions/{id}/files                   multipart upload (one file per call)
    DELETE /hr/onboarding/docs-setup/sessions/{id}/files/{file_id}
    GET    /hr/onboarding/docs-setup/sessions/{id}/files/{file_id}/view    short-lived link (page / paragraph anchor)
    POST   /hr/onboarding/docs-setup/sessions/{id}/analyse                 start or retry the analysis
    POST   /hr/onboarding/docs-setup/sessions/{id}/cancel
    GET    /hr/onboarding/docs-setup/sessions/{id}/proposals?target=…      grouped proposals with sources and conflicts
    PATCH  /hr/onboarding/docs-setup/sessions/{id}/proposals/{pid}         {decision, final_value}
    POST   /hr/onboarding/docs-setup/sessions/{id}/proposals/bulk          {target, min_confidence, decision}
    POST   /hr/onboarding/docs-setup/sessions/{id}/proposals/manual        a package / form / category change made in step 5
    PUT    /hr/onboarding/docs-setup/sessions/{id}/mapping/{file_id}       {action, canonical_id?, mode?, signers?, ...}
    GET    /hr/onboarding/docs-setup/sessions/{id}/mapping/{file_id}       the mapping preview (diff, warnings, samples)
    GET    /hr/onboarding/docs-setup/sessions/{id}/mapping/{file_id}/preview.pdf
    GET    /hr/onboarding/docs-setup/sessions/{id}/summary                 everything Apply will change
    POST   /hr/onboarding/docs-setup/sessions/{id}/apply                   Idempotency-Key header required
    POST   /hr/onboarding/docs-setup/sessions/{id}/undo
    GET    /hr/onboarding/docs-setup/file/{token}                          the signed file link (no login: the token is it)
    POST   /hr/onboarding/docs-setup/docx-import/check                     analyse a Word template (nothing saved)
    POST   /hr/onboarding/docs-setup/docx-import                           create the draft template from it
"""


import json
from typing import Optional

from fastapi import APIRouter, Body, Depends, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_admin
from app.core.rate_limiter import limiter
from app.database import get_db
from app.modules.hr import docs_setup as DS

router = APIRouter(prefix="/hr/onboarding/docs-setup", tags=["Set up docs for your organisation"])


def _s(db, user, session_id: int):
    DS.require_enabled(user)
    return DS._session(db, user, session_id)


@router.get("/status", summary="Whether the setup is available to this organisation, and its open or last session")
def status(db: Session = Depends(get_db), user=Depends(get_current_admin)):
    from app.modules.hr.docs_setup_models import DocsSetupSession
    on = DS.enabled(user.organization_id)
    last = None
    if on:
        s = (db.query(DocsSetupSession).filter(DocsSetupSession.organization_id == user.organization_id)
             .order_by(DocsSetupSession.id.desc()).first())
        last = {"id": s.id, "status": s.status, "step": s.step, "applied_at": s.applied_at} if s else None
    return {"enabled": on, "last_session": last}


@router.post("/sessions", summary="Create or resume the organisation's open setup session")
def create_session(db: Session = Depends(get_db), user=Depends(get_current_admin)):
    return DS.view(db, DS.open_session(db, user))


@router.get("/sessions/{session_id}")
def get_session(session_id: int, db: Session = Depends(get_db), user=Depends(get_current_admin)):
    return DS.view(db, _s(db, user, session_id))


@router.put("/sessions/{session_id}/step")
def put_step(session_id: int, data: dict = Body(...), db: Session = Depends(get_db), user=Depends(get_current_admin)):
    s = _s(db, user, session_id)
    return DS.view(db, DS.set_step(db, user, s, (data or {}).get("step") or 1))


@router.post("/sessions/{session_id}/files", summary="Upload one company document (PDF, DOCX or TXT)")
@limiter.limit("30/minute")
async def upload_file(request: Request, session_id: int, file: UploadFile = File(...), label: Optional[str] = Form(None),
                      db: Session = Depends(get_db), user=Depends(get_current_admin)):
    s = _s(db, user, session_id)
    data = await file.read(DS.MAX_FILE_BYTES + 1)
    DS.add_file(db, user, s, data, file.filename or "document", label or None)
    return DS.view(db, s)


@router.put("/sessions/{session_id}/files/{file_id}", summary="Change what an uploaded file is (template or other document)")
def set_file_label(session_id: int, file_id: int, data: dict = Body(...), db: Session = Depends(get_db),
                   user=Depends(get_current_admin)):
    s = _s(db, user, session_id)
    DS.set_file_label(db, user, s, file_id, (data or {}).get("label"))
    return DS.view(db, s)


@router.delete("/sessions/{session_id}/files/{file_id}")
def delete_file(session_id: int, file_id: int, db: Session = Depends(get_db), user=Depends(get_current_admin)):
    s = _s(db, user, session_id)
    DS.delete_file(db, user, s, file_id)
    return DS.view(db, s)


@router.get("/sessions/{session_id}/files/{file_id}/view", summary="A short-lived link to the file at the cited page")
def view_file(session_id: int, file_id: int, page: Optional[int] = None, chunk: Optional[str] = None,
              db: Session = Depends(get_db), user=Depends(get_current_admin)):
    return DS.view_link(db, user, _s(db, user, session_id), file_id, page, chunk)


@router.get("/file/{token}", summary="The file behind a short-lived link")
@limiter.limit("60/minute")
def file_by_token(request: Request, token: str, db: Session = Depends(get_db)):
    data, media, name = DS.file_for_token(db, token)
    safe = "".join(ch for ch in name if ch.isalnum() or ch in " ._-") or "document"
    return Response(content=data, media_type=media, headers={"Content-Disposition": f'inline; filename="{safe}"',
                                                             "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
                                                             "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'"})


@router.post("/sessions/{session_id}/analyse", summary="Start (or retry) the analysis")
def analyse(session_id: int, db: Session = Depends(get_db), user=Depends(get_current_admin)):
    s = _s(db, user, session_id)
    return DS.view(db, DS.start_analysis(db, user, s))


@router.post("/sessions/{session_id}/cancel")
def cancel(session_id: int, db: Session = Depends(get_db), user=Depends(get_current_admin)):
    return DS.view(db, DS.cancel(db, user, _s(db, user, session_id)))


@router.get("/sessions/{session_id}/proposals")
def proposals(session_id: int, target: Optional[str] = None, db: Session = Depends(get_db), user=Depends(get_current_admin)):
    if target and target not in DS.TARGETS:
        raise HTTPException(422, "Unknown target.")
    return DS.proposals_view(db, _s(db, user, session_id), target)


@router.patch("/sessions/{session_id}/proposals/{proposal_id}")
def decide(session_id: int, proposal_id: int, data: dict = Body(...), db: Session = Depends(get_db),
           user=Depends(get_current_admin)):
    s = _s(db, user, session_id)
    return DS.decide(db, user, s, proposal_id, (data or {}).get("decision"), (data or {}).get("final_value"))


@router.post("/sessions/{session_id}/proposals/bulk")
def bulk(session_id: int, data: dict = Body(...), db: Session = Depends(get_db), user=Depends(get_current_admin)):
    s = _s(db, user, session_id)
    if s.status != "review":
        raise HTTPException(409, "Proposals can be changed while the setup is being reviewed.")
    return DS.bulk_decide(db, user, s, (data or {}).get("target"), (data or {}).get("min_confidence") or DS.HIGH,
                          (data or {}).get("decision") or "accepted")


@router.post("/sessions/{session_id}/proposals/manual")
def manual(session_id: int, data: dict = Body(...), db: Session = Depends(get_db), user=Depends(get_current_admin)):
    s = _s(db, user, session_id)
    if s.status != "review":
        raise HTTPException(409, "Changes can be added while the setup is being reviewed.")
    return DS.add_manual_proposal(db, user, s, data or {})


@router.put("/sessions/{session_id}/mapping/{file_id}")
def put_mapping(session_id: int, file_id: int, data: dict = Body(...), db: Session = Depends(get_db),
                user=Depends(get_current_admin)):
    return DS.set_mapping(db, user, _s(db, user, session_id), file_id, data or {})


@router.get("/sessions/{session_id}/mapping-options",
            summary="What Map documents offers: the package documents, how a new hire uses a document, who signs, profiles")
def get_mapping_options(session_id: int, db: Session = Depends(get_db), user=Depends(get_current_admin)):
    _s(db, user, session_id)
    return DS.mapping_options(db, user.organization_id)


@router.get("/sessions/{session_id}/mapping/{file_id}")
def get_mapping(session_id: int, file_id: int, db: Session = Depends(get_db), user=Depends(get_current_admin)):
    from app.modules.hr.docs_setup_models import DocsSetupFile
    s = _s(db, user, session_id)
    f = db.get(DocsSetupFile, file_id)
    if f is None or f.session_id != s.id or f.organization_id != user.organization_id or f.deleted_at:
        raise HTTPException(404, "File not found.")
    return {"file": DS.ser_file(f), "preview": DS.mapping_preview(db, s, f)}


@router.get("/sessions/{session_id}/mapping/{file_id}/preview.pdf")
def mapping_pdf(session_id: int, file_id: int, db: Session = Depends(get_db), user=Depends(get_current_admin)):
    pdf = DS.preview_pdf(db, user, _s(db, user, session_id), file_id)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": 'inline; filename="draft-preview.pdf"', "Cache-Control": "no-store"})


@router.put("/sessions/{session_id}/options", summary="Apply options: send only the documents uploaded as templates")
def put_options(session_id: int, data: dict = Body(...), db: Session = Depends(get_db), user=Depends(get_current_admin)):
    s = _s(db, user, session_id)
    DS.set_only_uploaded(db, user, s, bool((data or {}).get("only_uploaded")))
    return DS.summary(db, s)


@router.get("/sessions/{session_id}/summary")
def get_summary(session_id: int, db: Session = Depends(get_db), user=Depends(get_current_admin)):
    return DS.summary(db, _s(db, user, session_id))


@router.post("/sessions/{session_id}/apply")
def apply(session_id: int, idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"), db: Session = Depends(get_db),
          user=Depends(get_current_admin)):
    return DS.apply(db, user, _s(db, user, session_id), idempotency_key)


@router.post("/sessions/{session_id}/approve-release",
             summary="An organisation admin approves and releases the templates this setup created")
def approve_release(session_id: int, request: Request, data: dict = Body(...), db: Session = Depends(get_db),
                    user=Depends(get_current_admin)):
    from app.core.client_ip import get_client_ip
    return DS.approve_and_release(db, user, _s(db, user, session_id), data, ip=get_client_ip(request))


@router.post("/sessions/{session_id}/undo")
def undo(session_id: int, db: Session = Depends(get_db), user=Depends(get_current_admin)):
    return DS.undo(db, user, _s(db, user, session_id))


# ── Word template import (capability 4) ──────────────────────────────────────────────────────────────────────────────
DOCX_MAX = 10 * 1024 * 1024


async def _docx(user, file: UploadFile) -> bytes:
    from app.modules.hr import docs_intake
    DS.require_enabled(user)
    data = await file.read(DOCX_MAX + 1)
    docs_intake.check(data, file.filename or "template.docx", max_bytes=DOCX_MAX, allowed=("docx",))
    return data


@router.post("/docx-import/check", summary="Read a Word template: blocks, fidelity warnings and placeholders (nothing saved)")
@limiter.limit("30/minute")
async def docx_check(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db),
                     user=Depends(get_current_admin)):
    from app.modules.hr import docx_import
    from app.modules.hr import onboarding_custom_fields as CF
    data = await _docx(user, file)
    res = docx_import.convert(data)
    placeholders = docx_import.check_placeholders(res["blocks"], CF.tokens(db, user.organization_id))
    return {"title": docx_import.title_from(res["blocks"], file.filename or ""), "block_count": len(res["blocks"]),
            "warnings": res["warnings"], "placeholders": placeholders,
            "unknown": [p["key"] for p in placeholders if not p["known"]]}


@router.post("/docx-import", summary="Create a draft template from a Word file (unknown placeholders must be mapped)")
@limiter.limit("20/minute")
async def docx_create(request: Request, file: UploadFile = File(...), title: str = Form(""), target: str = Form("new"),
                      mapping: str = Form("{}"), mode: str = Form("ACKNOWLEDGE"), db: Session = Depends(get_db),
                      user=Depends(get_current_admin)):
    from app.modules.doc_templates import content as CT
    from app.modules.doc_templates import package_templates as PT
    from app.modules.hr import docx_import
    from app.modules.hr import onboarding_package_content as C
    from app.modules.hr import onboarding_package_org as ORG
    from app.modules.hr import onboarding_custom_fields as CF
    data = await _docx(user, file)
    try:
        chosen = json.loads(mapping or "{}")
        assert isinstance(chosen, dict)
    except Exception:
        raise HTTPException(422, "mapping must be a JSON object of {unknown placeholder: known placeholder}.")
    extra = CF.tokens(db, user.organization_id)
    bad = {k: v for k, v in chosen.items() if not docx_import.known_key(str(v), extra)}
    if bad:
        raise HTTPException(422, {"code": "UNKNOWN_PLACEHOLDER_MAPPING", "message": "Map each placeholder to a known one.",
                                  "mapping": bad})
    res = docx_import.convert(data)
    blocks = docx_import.normalise_custom(docx_import.apply_mapping(res["blocks"], chosen), extra)
    unknown = [p for p in docx_import.check_placeholders(blocks, extra) if not p["known"]]
    if unknown:
        raise HTTPException(422, {"code": "UNKNOWN_PLACEHOLDERS", "message": "Fix or map every unknown placeholder first.",
                                  "placeholders": unknown})
    reason = f"Imported from {file.filename or 'a Word file'}."
    if target == "new":
        v = ORG.create_org_template(db, user, title=title or docx_import.title_from(blocks, file.filename or ""), content=blocks,
                                    change_reason=reason)
        from app.modules.hr import onboarding_docx_master as DM     # the Word file stays the layout of issued documents
        DM.attach(db, v, data, filename=file.filename or "")
        db.commit()
    else:
        if target not in C.DOCS:
            raise HTTPException(422, "target must be 'new' or one of the package documents.")
        starter = PT.starter_for(target)
        v = ORG.customise(db, user, target)
        if v.status != "IN_DRAFT":
            raise HTTPException(409, "A version of this document is already in legal review. Finish it first.")
        CT.update_variant(db, user, v, {"content": docx_import.merge_with_locked(starter["blocks"], blocks), "change_reason": reason})
    return {"variant_id": v.id, "canonical_id": v.canonical_id, "version": v.version, "status": v.status,
            "warnings": res["warnings"], "editor_path": f"/zoiko-hr/documents/templates/variants/{v.id}"}
