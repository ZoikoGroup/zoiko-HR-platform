"""Routes that let every organisation run its onboarding documents its own way (organisation admins and HR admins).

  GET/PUT  /hr/onboarding/custom-fields                       the organisation's own document fields ({{custom.<key>}})
  POST     /hr/onboarding/custom-fields                       add one field (e.g. from an unknown placeholder in an upload)
  GET/PUT  /hr/onboarding/package/automation                  prepare-and-review or send-automatically
  POST     /hr/onboarding/new-hires/{id}/package/send-prepared  send the documents automation prepared (one click)
  GET      /hr/onboarding/package/test                        check the whole package for a sample hire (nothing saved)
  GET      /hr/onboarding/package/test/{category}/preview.pdf   watermarked preview of one document for the sample hire
  GET      /hr/onboarding/setup-status                        the setup score shown on the dashboard and in Settings
  GET      /hr/onboarding/package/starter-sets                the starter sets and the one this organisation uses
  POST     /hr/onboarding/package/starter-sets/{key}/apply    switch the platform documents to a starter set
  GET/POST /hr/onboarding/package/countersigners              who signs onboarding documents for the employer
  DELETE   /hr/onboarding/package/countersigners/{id}
  GET      /hr/onboarding/package/word-layout                 whether issued documents can keep uploaded Word layouts
Every route acts on the caller's own organisation only.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_admin
from app.database import get_db
from app.modules.hr import service

router = APIRouter(prefix="/hr/onboarding", tags=["Onboarding documents for every organisation"])


@router.get("/custom-fields", summary="The organisation's own document fields")
def get_custom_fields(db: Session = Depends(get_db), user=Depends(get_current_admin)):
    from app.modules.hr import onboarding_custom_fields as CF
    return CF.view(db, user.organization_id)


@router.put("/custom-fields", summary="Save the organisation's own document fields (the whole list)")
def put_custom_fields(data: dict = Body(...), db: Session = Depends(get_db), user=Depends(get_current_admin)):
    from app.modules.hr import onboarding_custom_fields as CF
    return CF.save(db, user, (data or {}).get("fields"))


@router.post("/custom-fields", summary="Add one document field (an existing key is left unchanged)")
def post_custom_field(data: dict = Body(...), db: Session = Depends(get_db), user=Depends(get_current_admin)):
    from app.modules.hr import onboarding_custom_fields as CF
    return CF.add(db, user, data)


@router.get("/package/automation", summary="How documents with a trigger are handled: prepared for review or sent")
def get_automation(db: Session = Depends(get_db), user=Depends(get_current_admin)):
    from app.modules.hr import onboarding_doc_automation as AUTO
    return AUTO.settings(db, user.organization_id)


@router.put("/package/automation", summary="Choose prepare-and-review or send-automatically")
def put_automation(data: dict = Body(...), db: Session = Depends(get_db), user=Depends(get_current_admin)):
    from app.modules.hr import onboarding_doc_automation as AUTO
    return AUTO.save_settings(db, user, data)


@router.post("/new-hires/{new_hire_id}/package/send-prepared", summary="Send the documents prepared automatically")
def send_prepared(new_hire_id: int, data: Optional[dict] = Body(None), db: Session = Depends(get_db),
                  user=Depends(get_current_admin)):
    from app.modules.hr import onboarding_doc_automation as AUTO
    from app.modules.hr import onboarding_package as P
    hire = service.get_new_hire_by_id(db, new_hire_id, organization_id=user.organization_id)
    cats = (data or {}).get("categories")
    if cats is not None and (not isinstance(cats, list) or not all(isinstance(c, str) for c in cats)):
        raise HTTPException(422, "categories must be a list of package documents.")
    res = AUTO.send_queued(db, hire, user, cats)
    n = len(res.get("issued") or [])
    res["message"] = f"{n} prepared document{'' if n == 1 else 's'} sent." if n else "Nothing was sent."
    res["package"] = P.package_view(db, hire)
    return res


@router.get("/package/test", summary="Check every package document for a sample new hire (nothing is saved or sent)")
def test_package(engagement: Optional[str] = Query(None, max_length=60), role: Optional[str] = Query(None, max_length=60),
                 db: Session = Depends(get_db), user=Depends(get_current_admin)):
    from app.modules.hr import onboarding_setup_check as SC
    return SC.test_package(db, user.organization_id, engagement or None, role or None)


@router.get("/package/test/{category}/preview.pdf", summary="Watermarked preview of one document for the sample new hire")
def test_preview(category: str, engagement: Optional[str] = Query(None, max_length=60),
                 role: Optional[str] = Query(None, max_length=60), db: Session = Depends(get_db),
                 user=Depends(get_current_admin)):
    from app.modules.hr import onboarding_setup_check as SC
    pdf = SC.test_preview_pdf(db, user.organization_id, category, engagement or None, role or None)
    safe = "".join(ch for ch in category if ch.isalnum() or ch in "-_") or "document"
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="sample-{safe}.pdf"', "Cache-Control": "no-store"})


@router.get("/setup-status", summary="How ready the organisation is to generate its onboarding documents")
def setup_status(fresh: bool = Query(False), db: Session = Depends(get_db), user=Depends(get_current_admin)):
    from app.modules.hr import onboarding_setup_check as SC
    return SC.setup_status(db, user.organization_id, fresh=fresh)


@router.get("/package/starter-sets", summary="Starter sets of platform documents, and the one in use")
def starter_sets(db: Session = Depends(get_db), user=Depends(get_current_admin)):
    from app.modules.hr import onboarding_starter_sets as SS
    return SS.options(db, user.organization_id)


@router.post("/package/starter-sets/{key}/apply", summary="Switch the platform documents to a starter set")
def apply_starter_set(key: str, data: Optional[dict] = Body(None), db: Session = Depends(get_db),
                      user=Depends(get_current_admin)):
    from app.modules.hr import onboarding_starter_sets as SS
    return SS.apply(db, user, key, send_when=(data or {}).get("send_when", SS.DEFAULT_TRIGGER))


@router.get("/package/countersigners", summary="Who signs onboarding documents for the employer")
def get_countersigners(db: Session = Depends(get_db), user=Depends(get_current_admin)):
    from app.modules.hr import onboarding_countersign as CS
    return {**CS.summary(db, user.organization_id), "people": CS.candidates(db, user.organization_id)}


@router.post("/package/countersigners", summary="Add a countersigner (one of the organisation's admins or HR admins)")
def add_countersigner(data: dict = Body(...), db: Session = Depends(get_db), user=Depends(get_current_admin)):
    from app.modules.hr import onboarding_countersign as CS
    try:
        employee_id = int((data or {}).get("employee_id"))
    except (TypeError, ValueError):
        raise HTTPException(422, "Choose who countersigns.")
    out = CS.add(db, user, employee_id, (data or {}).get("title") or "")
    return {**out, "people": CS.candidates(db, user.organization_id)}


@router.delete("/package/countersigners/{signatory_id}", summary="Stop someone countersigning onboarding documents")
def remove_countersigner(signatory_id: int, db: Session = Depends(get_db), user=Depends(get_current_admin)):
    from app.modules.hr import onboarding_countersign as CS
    out = CS.remove(db, user, signatory_id)
    return {**out, "people": CS.candidates(db, user.organization_id)}


@router.get("/package/word-layout", summary="Whether issued documents keep the layout of uploaded Word templates")
def word_layout(db: Session = Depends(get_db), user=Depends(get_current_admin)):
    from app.modules.hr import onboarding_docx_master as DM
    return DM.status(db, user.organization_id)
