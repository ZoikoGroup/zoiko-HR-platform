"""Documents Phase 5: company documents — the access-rule engine, categories, upload / approval / scheduled publishing,
view-only vs download, acknowledgement rounds (material vs minor versions, new audience, periodic) and the employee's view."""
from datetime import datetime, timedelta

import pytest

from app.modules.hr.documents import access_resolver
from app.modules.hr.documents.automation import jobs
from app.modules.hr.documents.automation.models import DocumentTask
from app.modules.hr.documents.category_service import company_category_by_key
from app.modules.hr.documents.models import HrDocumentAckRound, HrDocumentAuditLog
from app.modules.hr.models import HrDocument
from test_docs_phase2_flows import _notified, _pdf, api  # noqa: F401


@pytest.fixture
def depts(api):
    from app.modules.hr.models import Department
    eng = Department(name="Engineering", code="ENG", organization_id=1)
    sales = Department(name="Sales", code="SAL", organization_id=1)
    other = Department(name="Elsewhere", code="ELS", organization_id=2)
    api.db.add_all([eng, sales, other])
    api.db.commit()
    api.people["emp"].department_id = eng.id
    api.people["emp2"].department_id = sales.id
    api.db.commit()
    return {"eng": eng.id, "sales": sales.id, "other": other.id}


def _cat(api, key="company_policies"):
    return company_category_by_key(api.db, 1, key)


def _share(api, target_type, target_id, **rule):
    api.as_("hr")
    r = api.put(f"/hr/documents/access/{target_type}/{target_id}", json={"visibility": "all_employees", **rule})
    assert r.status_code == 200, r.text
    return r.json()


def _upload(api, key="forms_templates", title="Leave form", who="hr", **form):
    api.as_(who)
    data = {"title": title, **{k: str(v).lower() if isinstance(v, bool) else str(v) for k, v in form.items()}}
    r = api.post(f"/hr/documents/company-categories/{_cat(api, key).id}/files", data=data,
                 files={"file": ("form.pdf", _pdf(), "application/pdf")})
    assert r.status_code == 201, r.text
    return r.json()


def _visible_titles(api, who):
    api.as_(who)
    return sorted(i["title"] for g in api.get("/hr/me/company-documents").json()["groups"] for i in g["items"])


# ── categories ─────────────────────────────────────────────────────────────────────────────────────────────────────

def test_category_cards_are_never_empty_and_start_admin_only(api):
    api.as_("hr")
    cards = api.get("/hr/documents/company-categories").json()
    assert {c["key"] for c in cards} >= {"company_policies", "employee_handbook", "forms_templates", "training"}
    assert all(c["access"]["visibility"] == "admin_only" for c in cards)
    _share(api, "category", _cat(api).id)
    assert [c["key"] for c in api.get("/hr/documents/company-categories", params={"access": "all"}).json()] == ["company_policies"]


def test_only_the_org_admin_locks_a_category_and_hr_then_cannot_widen_it(api):
    cat = _cat(api, "compliance_legal")
    api.as_("hr")
    assert api.patch(f"/hr/documents/company-categories/{cat.id}", json={"locked_by_org_admin": True}).status_code == 403
    api.as_("admin")
    assert api.patch(f"/hr/documents/company-categories/{cat.id}", json={"locked_by_org_admin": True}).status_code == 200
    api.as_("hr")
    r = api.put(f"/hr/documents/access/category/{cat.id}", json={"visibility": "all_employees"})
    assert r.status_code == 403


@pytest.mark.parametrize("who", ["emp", "mgr"])
def test_company_documents_are_managed_by_admins_only(api, who):
    api.as_(who)
    assert api.get("/hr/documents/company-categories").status_code == 403
    assert api.put(f"/hr/documents/access/category/{_cat(api).id}", json={"visibility": "all_employees"}).status_code == 403


# ── the access engine ──────────────────────────────────────────────────────────────────────────────────────────────

def test_a_new_file_is_admin_only_until_shared(api):
    _upload(api, title="Leave form")
    assert _visible_titles(api, "emp") == []
    assert _visible_titles(api, "hr") == ["Leave form"]                   # admins see everything


def test_category_rule_reaches_its_files_and_a_document_rule_overrides_it(api, depts):
    a = _upload(api, title="Leave form")
    b = _upload(api, title="Board memo")
    _share(api, "category", _cat(api, "forms_templates").id, visibility="departments", department_ids=[depts["eng"]])
    assert _visible_titles(api, "emp") == ["Board memo", "Leave form"]
    assert _visible_titles(api, "emp2") == []
    _share(api, "document", b["id"], visibility="admin_only", inherit=False)
    assert _visible_titles(api, "emp") == ["Leave form"]
    _share(api, "document", b["id"], visibility="employees", employee_ids=[api.people["emp2"].id])
    assert _visible_titles(api, "emp2") == ["Board memo"]


def test_a_folder_rule_applies_to_the_files_inside_it(api, depts):
    api.as_("hr")
    folder = api.post("/hr/document-folders", data={"name": "Sales kit", "company_category_id": str(_cat(api, "training").id)}).json()
    _upload(api, key="training", title="Pitch deck", folder_id=folder["id"])
    _share(api, "folder", folder["id"], visibility="departments", department_ids=[depts["sales"]])
    assert _visible_titles(api, "emp2") == ["Pitch deck"] and _visible_titles(api, "emp") == []


def test_roles_rule(api):
    _upload(api, title="Manager guide")
    doc_id = api.db.query(HrDocument).filter_by(title="Manager guide").one().id
    _share(api, "document", doc_id, visibility="roles", roles=["manager"])
    assert _visible_titles(api, "mgr") == ["Manager guide"] and _visible_titles(api, "emp") == []


def test_another_organizations_people_and_departments_cannot_be_named(api, depts):
    api.as_("hr")
    cat = _cat(api).id
    assert api.put(f"/hr/documents/access/category/{cat}", json={"visibility": "departments", "department_ids": [depts["other"]]}).status_code == 404
    assert api.put(f"/hr/documents/access/category/{cat}", json={"visibility": "employees", "employee_ids": [api.people["other"].id]}).status_code == 404
    assert api.put(f"/hr/documents/access/category/{cat}", json={"visibility": "departments", "department_ids": []}).status_code == 422


def test_preview_counts_the_audience_and_changes_are_audited(api, depts):
    api.as_("hr")
    r = api.post("/hr/documents/access/preview", json={"visibility": "departments", "department_ids": [depts["eng"]]}).json()
    assert r["audience_count"] == 1 and r["sample"][0]["name"] == "Emp User"
    _share(api, "category", _cat(api).id, visibility="departments", department_ids=[depts["eng"]])
    row = api.db.query(HrDocumentAuditLog).filter_by(action="access_changed").one()
    assert row.before["visibility"] == "admin_only" and row.after == {"visibility": "departments", "permission": "view",
                                                                      "require_ack": False, "audience_count": 1}


def test_view_only_documents_open_but_do_not_download(api):
    doc = _upload(api, title="Leave form")
    _share(api, "document", doc["id"], permission="view")
    api.as_("emp")
    assert api.get(f"/hr/documents/{doc['id']}/file").status_code == 200
    assert api.get(f"/hr/documents/{doc['id']}/file", params={"download": "true"}).status_code == 403
    _share(api, "document", doc["id"], permission="download")
    api.as_("emp")
    assert api.get(f"/hr/documents/{doc['id']}/file", params={"download": "true"}).status_code == 200
    item = next(i for g in api.get("/hr/me/company-documents").json()["groups"] for i in g["items"])
    assert item["can_download"] is True


# ── approval and publishing ────────────────────────────────────────────────────────────────────────────────────────

def test_a_category_that_requires_approval_holds_files_until_approved(api):
    cat = _cat(api, "compliance_legal")
    api.as_("admin")
    api.patch(f"/hr/documents/company-categories/{cat.id}", json={"requires_approval": True})
    _share(api, "category", cat.id)
    doc = _upload(api, key="compliance_legal", title="Data policy", who="hr")
    assert doc["status"] == "pending_approval" and _visible_titles(api, "emp") == []
    api.as_("hr")
    assert api.post(f"/hr/documents/{doc['id']}/decision/approve", json={}).json()["error"] == "DOC_SELF_APPROVAL"
    api.as_("admin")
    assert api.post(f"/hr/documents/{doc['id']}/decision/approve", json={}).status_code == 200
    assert _visible_titles(api, "emp") == ["Data policy"]


def test_scheduled_publishing(api):
    _share(api, "category", _cat(api, "holiday_announcements").id)
    when = (datetime.utcnow() + timedelta(days=1)).isoformat()
    doc = _upload(api, key="holiday_announcements", title="Holidays 2027", publish_at=when)
    assert doc["publish_state"] == "scheduled" and _visible_titles(api, "emp") == []
    assert jobs.scheduled_publish(api.db, 1, datetime.utcnow()) == 0
    assert jobs.scheduled_publish(api.db, 1, datetime.utcnow() + timedelta(days=2)) == 1
    api.db.commit()
    assert _visible_titles(api, "emp") == ["Holidays 2027"]
    api.as_("hr")
    api.post(f"/hr/documents/company/{doc['id']}/unpublish")
    assert _visible_titles(api, "emp") == []


def test_new_versions_are_kept(api):
    doc = _upload(api)
    api.as_("hr")
    r = api.post(f"/hr/documents/company/{doc['id']}/versions", data={"change_notes": "Typo fixed", "material_change": "false"},
                 files={"file": ("v2.pdf", _pdf(), "application/pdf")})
    assert r.status_code == 201 and r.json()["version"] == 2
    versions = api.get(f"/hr/documents/company/{doc['id']}/versions").json()
    assert [(v["version"], v["status"], v["is_current"]) for v in versions] == [(2, "approved", True), (1, "superseded", False)]


# ── acknowledgements ───────────────────────────────────────────────────────────────────────────────────────────────

def test_a_policy_needing_acknowledgement_opens_a_round_for_its_audience(api, depts):
    cat = _cat(api)                                                     # company_policies: acknowledgement on by default
    _share(api, "category", cat.id, require_ack=True)
    doc = _upload(api, key="company_policies", title="Code of conduct")
    tasks = api.db.query(DocumentTask).filter_by(document_id=doc["id"], kind="acknowledge", status="open").all()
    assert {t.employee_id for t in tasks} == {p.id for k, p in api.people.items() if k != "other"}
    assert "Document to acknowledge" in _notified(api, "emp")
    api.as_("emp")
    item = next(i for g in api.get("/hr/me/company-documents").json()["groups"] for i in g["items"])
    assert item["needs_ack"] is True
    r = api.post(f"/hr/me/company-documents/{doc['id']}/acknowledge", json={"version_id": item["version_id"]})
    assert r.status_code == 200 and r.json()["round"] == 1
    assert api.post(f"/hr/me/company-documents/{doc['id']}/acknowledge", json={}).json()["round"] == 1     # idempotent
    api.as_("hr")
    tracking = api.get(f"/hr/documents/company/{doc['id']}/acknowledgements").json()
    assert tracking["acknowledged"] == 1 and tracking["pending"] == 4
    assert api.post(f"/hr/documents/company/{doc['id']}/acknowledgements/remind", json={}).json()["sent"] == 4


def test_a_material_new_version_needs_acknowledging_again_a_minor_one_does_not(api):
    _share(api, "category", _cat(api).id, require_ack=True)
    doc = _upload(api, key="company_policies", title="Code of conduct")
    api.as_("emp")
    api.post(f"/hr/me/company-documents/{doc['id']}/acknowledge", json={})
    api.as_("hr")
    api.post(f"/hr/documents/company/{doc['id']}/versions", data={"material_change": "false"}, files={"file": ("v2.pdf", _pdf(), "application/pdf")})
    assert api.db.query(HrDocumentAckRound).filter_by(document_id=doc["id"]).count() == 1
    api.post(f"/hr/documents/company/{doc['id']}/versions", data={"material_change": "true"}, files={"file": ("v3.pdf", _pdf(), "application/pdf")})
    assert api.db.query(HrDocumentAckRound).filter_by(document_id=doc["id"]).count() == 2
    api.as_("emp")
    item = next(i for g in api.get("/hr/me/company-documents").json()["groups"] for i in g["items"])
    assert item["needs_ack"] is True                                    # round 2: read it again


def test_people_who_join_the_audience_later_get_the_task(api, depts):
    _share(api, "category", _cat(api).id, visibility="departments", department_ids=[depts["eng"]], require_ack=True)
    doc = _upload(api, key="company_policies", title="Security policy")
    assert api.db.query(DocumentTask).filter_by(document_id=doc["id"], employee_id=api.people["emp2"].id).count() == 0
    api.people["emp2"].department_id = depts["eng"]                   # moved to Engineering
    api.db.commit()
    assert jobs.ack_new_audience(api.db, 1, datetime.utcnow()) == 1
    assert jobs.ack_new_audience(api.db, 1, datetime.utcnow()) == 0


def test_periodic_re_acknowledgement(api):
    cat = _cat(api)
    api.as_("hr")
    api.patch(f"/hr/documents/company-categories/{cat.id}", json={"reack_interval_months": 12})
    _share(api, "category", cat.id, require_ack=True)
    doc = _upload(api, key="company_policies", title="Code of conduct")
    assert jobs.periodic_reack(api.db, 1, datetime.utcnow() + timedelta(days=100)) == 0
    assert jobs.periodic_reack(api.db, 1, datetime.utcnow() + timedelta(days=370)) == 1
    rounds = api.db.query(HrDocumentAckRound).filter_by(document_id=doc["id"]).order_by(HrDocumentAckRound.round_no).all()
    assert [r.reason for r in rounds] == ["initial", "periodic"]


def test_expired_files_can_unpublish_themselves(api):
    cat = _cat(api, "training")
    api.as_("hr")
    api.patch(f"/hr/documents/company-categories/{cat.id}", json={"auto_unpublish_on_expiry": True})
    _share(api, "category", cat.id)
    _upload(api, key="training", title="Old course", expiry_date="2026-01-01")
    assert jobs.auto_unpublish(api.db, 1, datetime.utcnow()) == 1
    api.db.commit()
    assert _visible_titles(api, "emp") == []


def test_expiry_filters(api):
    _upload(api, title="Expired one", expiry_date="2026-01-01")
    _upload(api, title="Soon", expiry_date=(datetime.utcnow() + timedelta(days=10)).date().isoformat())
    _upload(api, title="Fine")
    api.as_("hr")
    titles = lambda e: [f["title"] for f in api.get("/hr/documents/company/files", params={"expiry": e}).json()["items"]]
    assert titles("expired") == ["Expired one"] and titles("expiring_soon") == ["Soon"]


def test_resolver_effective_rule_falls_back_to_admin_only(api):
    doc = api.db.get(HrDocument, _upload(api)["id"])
    rule = access_resolver.effective_rule(api.db, 1, doc)
    assert rule.visibility == "admin_only" and rule.source[0] in ("default", "category")
