"""Documents Phase 4: Admin → Employee Documents (read-only drill-down, completion, reminders, ZIP, category settings)
and the end of admin uploads on an employee's behalf."""
import io
import zipfile
from datetime import datetime, timedelta

import pytest

from app.modules.hr.documents.category_service import employee_category_by_key
from app.modules.hr.documents.models import HrDocumentAuditLog, HrDocumentReminder
from test_docs_phase2_flows import _notified, _pdf, _upload, api  # noqa: F401


def _approve(api, body):
    api.as_("hr")
    api.post(f"/hr/documents/{body['id']}/decision/approve", json={})


def _all_required(api, who="emp"):
    for key, name in (("identity_proof", "p.pdf"), ("address_proof", "a.pdf"), ("education", "e.pdf"), ("bank_details", "b.pdf")):
        _approve(api, _upload(api, key=key, who=who, name=name).json())


def test_the_list_shows_completion_and_status(api):
    _all_required(api, "emp")
    _upload(api, who="emp2")
    api.as_("hr")
    page = api.get("/hr/documents/employees").json()
    rows = {r["name"]: r for r in page["items"]}
    assert rows["Emp User"]["completion"]["approved"] == rows["Emp User"]["completion"]["required"] == 4
    assert rows["Emp User"]["status"] == "complete" and rows["Emp User"]["completion"]["percent"] == 100
    assert rows["Emp2 User"]["status"] == "needs_review"
    assert rows["Mgr User"]["status"] == "pending" and rows["Mgr User"]["completion"]["approved"] == 0
    assert page["total"] == 5                                         # active people in organization 1, nobody from org 2
    counts = api.get("/hr/documents/employees/summary").json()
    assert counts["complete"] == 1 and counts["needs_review"] == 1


@pytest.mark.parametrize("params,names", [
    ({"search": "emp2"}, ["Emp2 User"]), ({"search": "C-1-hr"}, ["Hr User"]),
    ({"status": "complete"}, ["Emp User"]), ({"status": "needs_review"}, ["Emp2 User"]),
])
def test_search_and_status_filters(api, params, names):
    _all_required(api, "emp")
    _upload(api, who="emp2")
    api.as_("hr")
    assert [r["name"] for r in api.get("/hr/documents/employees", params=params).json()["items"]] == names


def test_drill_down_to_one_employee_and_one_container(api):
    body = _upload(api).json()
    api.as_("admin")
    detail = api.get(f"/hr/documents/employees/{api.people['emp'].id}").json()
    cats = {c["key"]: c for c in detail["categories"]}
    assert cats["identity_proof"]["status"] == "pending_approval" and cats["education"]["status"] == "not_uploaded"
    files = api.get(f"/hr/documents/employees/{api.people['emp'].id}/categories/{cats['identity_proof']['id']}/files").json()
    assert [f["id"] for f in files["files"]] == [body["id"]]
    assert api.get(f"/hr/documents/employees/{api.people['other'].id}").status_code == 404     # another organization


@pytest.mark.parametrize("who", ["emp", "mgr"])
def test_employee_documents_are_for_admins_only(api, who):
    api.as_(who)
    assert api.get("/hr/documents/employees").status_code == 403
    assert api.get(f"/hr/documents/employees/{api.people['emp2'].id}").status_code == 403
    assert api.post(f"/hr/documents/employees/{api.people['emp2'].id}/reminders", json={}).status_code == 403


def test_reminders_name_what_is_missing_and_wait_24_hours(api):
    api.as_("hr")
    r = api.post(f"/hr/documents/employees/{api.people['emp'].id}/reminders", json={"message": "Before Friday please"})
    assert r.status_code == 200 and sorted(r.json()["categories"]) == ["address_proof", "bank_details", "education", "identity_proof"]
    assert "Reminder: documents to upload" in _notified(api, "emp")
    again = api.post(f"/hr/documents/employees/{api.people['emp'].id}/reminders", json={})
    assert again.status_code == 429 and again.json()["error"] == "DOC_REMINDER_COOLDOWN"
    row = api.db.query(HrDocumentReminder).filter_by(employee_id=api.people["emp"].id, kind="upload_missing").one()
    row.sent_at = datetime.utcnow() - timedelta(hours=25)
    api.db.commit()
    assert api.post(f"/hr/documents/employees/{api.people['emp'].id}/reminders", json={}).status_code == 200
    assert api.db.query(HrDocumentAuditLog).filter_by(action="reminder_sent").count() == 2


def test_bulk_reminders_skip_people_with_nothing_missing(api):
    _all_required(api, "emp")
    api.as_("hr")
    r = api.post("/hr/documents/reminders/bulk", json={"employee_ids": [api.people["emp"].id, api.people["emp2"].id]})
    assert r.json() == {"sent": 1, "skipped": 1}


def test_zip_export_holds_approved_files_by_category_and_is_audited(api):
    _approve(api, _upload(api).json())
    _upload(api, key="education", name="degree.pdf")                  # pending: not in an approved-only export
    api.as_("admin")
    r = api.get(f"/hr/documents/employees/{api.people['emp'].id}/export.zip")
    assert r.status_code == 200 and "Emp-User-documents.zip" in r.headers["content-disposition"]
    names = zipfile.ZipFile(io.BytesIO(r.content)).namelist()
    assert names == ["Identity Proof/passport.pdf"]
    assert zipfile.ZipFile(io.BytesIO(r.content)).read(names[0]).startswith(b"%PDF")
    assert api.db.query(HrDocumentAuditLog).filter_by(action="exported", employee_id=api.people["emp"].id).count() == 1
    everything = api.get(f"/hr/documents/employees/{api.people['emp'].id}/export.zip", params={"approved_only": "false"})
    assert len(zipfile.ZipFile(io.BytesIO(everything.content)).namelist()) == 2


def test_category_settings(api):
    api.as_("hr")
    listing = api.get("/hr/documents/employee-categories").json()
    assert {c["key"] for c in listing["id_number_checks"]} >= {"in.aadhaar", "in.pan", "passport"}
    bank = next(c for c in listing["items"] if c["key"] == "bank_details")
    assert api.patch(f"/hr/documents/employee-categories/{bank['id']}", json={"is_required": False}).json()["is_required"] is False
    assert api.patch(f"/hr/documents/employee-categories/{bank['id']}", json={"id_number_field": "nope"}).status_code == 422
    assert api.patch(f"/hr/documents/employee-categories/{bank['id']}",
                     json={"escalation_ladder": [{"after_days": 3, "to": "assignee"}, {"after_days": 1, "to": "manager"}]}).status_code == 422
    assert api.delete(f"/hr/documents/employee-categories/{bank['id']}").status_code == 409            # built-in
    new = api.post("/hr/documents/employee-categories", json={"name": "Visa", "is_required": True, "requires_expiry": True}).json()
    assert new["key"] == "custom_visa" and new["uploader"] == "employee"
    _upload(api, key="custom_visa", name="visa.pdf", expiry_date="2031-01-01")
    api.as_("hr")
    assert api.delete(f"/hr/documents/employee-categories/{new['id']}").status_code == 204
    assert employee_category_by_key(api.db, 1, "custom_visa").is_active is False                       # held files: turned off


def test_category_settings_are_admin_only(api):
    api.as_("emp")
    assert api.post("/hr/documents/employee-categories", json={"name": "X"}).status_code == 403


# ── no more uploads on an employee's behalf ────────────────────────────────────────────────────────────────────────

def test_admins_cannot_upload_for_an_employee(api):
    api.as_("admin")
    files = {"file": ("p.pdf", _pdf(), "application/pdf")}
    r = api.post("/hr/documents/upload", data={"title": "Passport", "category": "employee", "employee_id": str(api.people["emp"].id)},
                 files=files)
    assert r.status_code == 403 and "My Files" in r.json()["detail"]
    r = api.post("/hr/documents/upload", data={"title": "Payslip", "category": "payslip"}, files={"file": ("p.pdf", _pdf(), "application/pdf")})
    assert r.status_code == 403


def test_a_company_upload_joins_the_new_model_admin_only(api):
    api.as_("admin")
    r = api.post("/hr/documents/upload", data={"title": "Leave policy", "category": "company"},
                 files={"file": ("policy.pdf", _pdf(), "application/pdf")})
    assert r.status_code == 201, r.text
    from app.modules.hr.documents.models import HrDocumentAccessRule
    from app.modules.hr.models import HrDocument
    doc = api.db.get(HrDocument, r.json()["id"])
    assert (doc.scope, doc.employee_id, doc.approved_version_id is not None) == ("company", None, True)
    rule = api.db.query(HrDocumentAccessRule).filter_by(target_type="document", target_id=doc.id).one()
    assert rule.visibility == "admin_only"
    api.as_("emp")
    assert api.get(f"/hr/documents/{doc.id}/file").status_code == 404      # not shared yet


def test_admins_cannot_replace_an_employees_file(api):
    body = _upload(api).json()
    api.as_("admin")
    r = api.post(f"/hr/documents/{body['id']}/versions", files={"file": ("p2.pdf", _pdf(), "application/pdf")})
    assert r.status_code == 403
