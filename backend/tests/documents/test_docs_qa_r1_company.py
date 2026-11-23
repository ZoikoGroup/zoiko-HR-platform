"""QA round 1, company documents:

* R1-22: a company file whose bytes are gone is flagged in the category list and uploading a new version brings it back.
* R1-18: New Folder creates the folder in the open category (blank and duplicate names are refused).
* R1-21: several company documents are shared in one action.
"""
import os

from app.modules.hr.documents import storage_service
from app.modules.hr.documents.category_service import company_category_by_key
from app.modules.hr.documents.models import HrDocumentAuditLog
from app.modules.hr.models import HrDocument, HrDocumentFolder, HrDocumentVersion
from test_docs_phase2_flows import _pdf, _upload as _employee_upload, api  # noqa: F401


def _cat(api, key="onboarding"):
    return company_category_by_key(api.db, 1, key)


def _company_upload(api, title="Job Description", key="onboarding"):
    api.as_("hr")
    r = api.post(f"/hr/documents/company-categories/{_cat(api, key).id}/files", data={"title": title},
                 files={"file": ("jd.pdf", _pdf(), "application/pdf")})
    assert r.status_code == 201, r.text
    return r.json()


def _lose_file(api, document_id):
    """What a redeploy does to a file on the container's disk: the record stays, the bytes are gone."""
    store = storage_service.get_store()
    for v in api.db.query(HrDocumentVersion).filter(HrDocumentVersion.document_id == document_id):
        if v.storage_key and store.exists(v.storage_key):
            os.remove(store._path(v.storage_key))


def _items(api, key="onboarding", **params):
    api.as_("hr")
    return api.get(f"/hr/documents/company-categories/{_cat(api, key).id}/items", params=params).json()


# ── R1-22: file missing on the server ──────────────────────────────────────────────────────────────────────────────

def test_a_company_document_whose_file_is_gone_is_flagged_and_explains_how_to_recover(api):
    doc = _company_upload(api)
    assert _items(api)["files"]["items"][0]["file_available"] is True
    assert api.get(f"/hr/documents/{doc['id']}/file").status_code == 200
    _lose_file(api, doc["id"])
    assert _items(api)["files"]["items"][0]["file_available"] is False
    r = api.get(f"/hr/documents/{doc['id']}/file")
    assert r.status_code == 410
    body = r.json()
    assert body["error"] == "DOC_FILE_MISSING" and body["recovery"] == "upload_version" and body["scope"] == "company"
    assert "Upload it again" in body["message"]
    # the admin uploads it again as a new version: the preview works again
    up = api.post(f"/hr/documents/company/{doc['id']}/versions", files={"file": ("jd.pdf", _pdf(), "application/pdf")})
    assert up.status_code == 201, up.text
    assert api.get(f"/hr/documents/{doc['id']}/file").status_code == 200
    assert _items(api)["files"]["items"][0]["file_available"] is True


# ── R1-18: New Folder ────────────────────────────────────────────────────────────────────────────────────────────────

def test_new_folder_is_created_in_the_open_category_and_listed(api):
    cat = _cat(api)
    api.as_("hr")
    r = api.post("/hr/document-folders", data={"name": "  Offer   letters ", "company_category_id": str(cat.id)})
    assert r.status_code == 201, r.text
    assert r.json()["name"] == "Offer letters"
    assert [f["name"] for f in _items(api)["folders"]] == ["Offer letters"]
    # a sub-folder inherits the category from its parent
    sub = api.post("/hr/document-folders", data={"name": "2026", "parent_id": str(r.json()["id"])})
    assert sub.status_code == 201
    assert api.db.get(HrDocumentFolder, sub.json()["id"]).company_category_id == cat.id


def test_new_folder_refuses_a_blank_or_duplicate_name(api):
    cat = _cat(api)
    api.as_("hr")
    assert api.post("/hr/document-folders", data={"name": "   ", "company_category_id": str(cat.id)}).status_code in (400, 422)
    assert api.post("/hr/document-folders", data={"name": "Policies", "company_category_id": str(cat.id)}).status_code == 201
    dup = api.post("/hr/document-folders", data={"name": "policies", "company_category_id": str(cat.id)})
    assert dup.status_code == 409
    # the same name in another category is fine
    other = _cat(api, "forms_templates")
    assert api.post("/hr/document-folders", data={"name": "Policies", "company_category_id": str(other.id)}).status_code == 201
    api.as_("emp")
    assert api.post("/hr/document-folders", data={"name": "Mine", "company_category_id": str(cat.id)}).status_code == 403


# ── R1-21: share several documents in one action ─────────────────────────────────────────────────────────────────────

def test_several_documents_are_shared_in_one_action(api):
    a, b, c = (_company_upload(api, t) for t in ("Job Description", "Offer Letter", "Welcome pack"))
    api.as_("hr")
    r = api.put("/hr/documents/access/bulk", json={"document_ids": [a["id"], b["id"]], "visibility": "all_employees",
                                                   "permission": "download"})
    assert r.status_code == 200, r.text
    assert r.json()["updated"] == 2
    rows = {i["title"]: i["access"]["visibility"] for i in _items(api)["files"]["items"]}
    assert rows == {"Job Description": "all_employees", "Offer Letter": "all_employees", "Welcome pack": "admin_only"}
    assert api.db.query(HrDocumentAuditLog).filter_by(action="access_changed").count() == 2
    api.as_("emp")
    titles = sorted(i["title"] for g in api.get("/hr/me/company-documents").json()["groups"] for i in g["items"])
    assert titles == ["Job Description", "Offer Letter"]


def test_bulk_share_is_all_or_nothing_and_tenant_scoped(api):
    a = _company_upload(api)
    from app.modules.hr.models import HrDocumentCategory
    foreign = HrDocument(title="Other org", organization_id=2, scope="company", file_name="x.pdf", category=HrDocumentCategory.COMPANY)
    api.db.add(foreign)
    api.db.commit()
    api.as_("hr")
    r = api.put("/hr/documents/access/bulk", json={"document_ids": [a["id"], foreign.id], "visibility": "all_employees"})
    assert r.status_code == 404
    assert _items(api)["files"]["items"][0]["access"]["visibility"] == "admin_only", "nothing changed"
    assert api.put("/hr/documents/access/bulk", json={"document_ids": [], "visibility": "all_employees"}).status_code == 422
    api.as_("emp")
    assert api.put("/hr/documents/access/bulk", json={"document_ids": [a["id"]], "visibility": "all_employees"}).status_code == 403
