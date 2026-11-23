"""Company Documents P3: category settings for every category. Built-in categories can be renamed and hidden but never
deleted; custom ones can be deleted once empty (no files, no folders). A hidden category keeps everything but employees
stop seeing its files (list, open, download) and its open read-confirmation tasks are cancelled; showing it again gives
the round back. Category names are unique (any letter case)."""
from app.modules.hr.documents.automation.models import DocumentTask
from app.modules.hr.documents.models import HrDocumentAuditLog
from test_docs_phase2_flows import api  # noqa: F401
from test_docs_phase5_company import _cat, _share, _upload, _visible_titles


def _patch(api, cat_id, **body):
    api.as_("hr")
    return api.patch(f"/hr/documents/company-categories/{cat_id}", json=body)


def test_built_in_categories_can_be_renamed_but_not_deleted(api):
    cat = _cat(api, "payslip_templates")
    r = _patch(api, cat.id, name="  Salary   slips ")
    assert r.status_code == 200 and r.json()["name"] == "Salary slips" and r.json()["is_system"] is True
    assert api.delete(f"/hr/documents/company-categories/{cat.id}").status_code == 409


def test_category_names_are_unique_in_any_letter_case(api):
    assert _patch(api, _cat(api, "forms_templates").id, name="company policies").status_code == 409
    api.as_("hr")
    r = api.post("/hr/documents/company-categories", json={"name": "COMPANY POLICIES"})
    assert r.status_code == 409 and r.json()["error"] == "DOC_CATEGORY_EXISTS"
    assert _patch(api, _cat(api, "company_policies").id, name="Company Policies").status_code == 200   # its own name is fine


def test_hidden_categories_leave_the_overview_unless_asked_for(api):
    cat = _cat(api, "training")
    assert _patch(api, cat.id, is_hidden=True).json()["is_hidden"] is True
    names = [c["name"] for c in api.get("/hr/documents/company-categories").json()]
    assert cat.name not in names
    every = api.get("/hr/documents/company-categories", params={"include_hidden": "true"}).json()
    assert next(c for c in every if c["id"] == cat.id)["is_hidden"] is True
    assert api.db.query(HrDocumentAuditLog).filter_by(action="category_hidden", target_id=cat.id).count() == 1
    _patch(api, cat.id, is_hidden=False)
    assert api.db.query(HrDocumentAuditLog).filter_by(action="category_shown", target_id=cat.id).count() == 1


def test_employees_cannot_see_open_or_download_files_of_a_hidden_category(api):
    cat = _cat(api, "forms_templates")
    _share(api, "category", cat.id, permission="download")
    doc = _upload(api, title="Leave form")
    assert _visible_titles(api, "emp") == ["Leave form"]
    _patch(api, cat.id, is_hidden=True)
    assert _visible_titles(api, "emp") == []
    api.as_("emp")
    assert api.get(f"/hr/documents/{doc['id']}/file").status_code in (403, 404)
    assert _visible_titles(api, "hr") == ["Leave form"]                       # admins still see it
    _patch(api, cat.id, is_hidden=False)
    assert _visible_titles(api, "emp") == ["Leave form"]


def test_hiding_cancels_read_confirmations_and_showing_gives_them_back(api):
    cat = _cat(api, "company_policies")
    _share(api, "category", cat.id, require_ack=True)
    doc = _upload(api, key="company_policies", title="Code of conduct")
    open_ = lambda: api.db.query(DocumentTask).filter_by(document_id=doc["id"], kind="acknowledge", status="open").count()  # noqa: E731
    before = open_()
    assert before > 0
    _patch(api, cat.id, is_hidden=True)
    assert open_() == 0
    _patch(api, cat.id, is_hidden=False)
    assert open_() == before


def test_publishing_into_a_hidden_category_asks_no_one(api):
    cat = _cat(api, "company_policies")
    _share(api, "category", cat.id, require_ack=True)
    _patch(api, cat.id, is_hidden=True)
    doc = _upload(api, key="company_policies", title="Quiet policy")
    assert api.db.query(DocumentTask).filter_by(document_id=doc["id"], kind="acknowledge").count() == 0


def test_a_custom_category_is_deleted_only_when_it_has_no_files_or_folders(api):
    api.as_("hr")
    cat = api.post("/hr/documents/company-categories", json={"name": "IT policies"}).json()
    folder = api.post("/hr/document-folders", data={"name": "Laptops", "company_category_id": str(cat["id"])}).json()
    r = api.delete(f"/hr/documents/company-categories/{cat['id']}")
    assert r.status_code == 409 and "folders" in r.json()["message"]
    assert api.delete(f"/hr/document-folders/{folder['id']}").status_code == 200
    assert api.delete(f"/hr/documents/company-categories/{cat['id']}").status_code == 204
    assert cat["id"] not in [c["id"] for c in api.get("/hr/documents/company-categories", params={"include_hidden": "true"}).json()]


def test_only_admins_change_category_settings(api):
    api.as_("emp")
    assert api.patch(f"/hr/documents/company-categories/{_cat(api).id}", json={"is_hidden": True}).status_code == 403
