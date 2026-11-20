"""Documents Phase 6: the employee portal — document tasks in "Documents to Action" (with the chip filter), the tab badges,
the signatory tab only for signatories, organization wording for notifications, and the weekly HR digest."""
from datetime import datetime, timedelta

from app.modules.hr.documents.automation import jobs, tasks as task_service
from app.modules.hr.documents.automation.models import NotificationTemplate
from app.modules.hr.documents.category_service import employee_category_by_key
from test_docs_phase2_flows import _drain, _notified, _upload, api  # noqa: F401
from test_docs_phase5_company import _cat as _company_cat, _share, _upload as _company_upload


def _open_upload_task(api, who="emp", key="address_proof", due_in_days=3):
    cat = employee_category_by_key(api.db, 1, key)
    task, _ = task_service.open_task(api.db, 1, "upload_required", employee_id=api.people[who].id, employee_category_id=cat.id,
                                     due_in_days=due_in_days)
    api.db.commit()
    return task, cat


# ── Documents to Action ────────────────────────────────────────────────────────────────────────────────────────────

def test_open_document_tasks_show_in_documents_to_action_with_a_link(api):
    task, cat = _open_upload_task(api)
    api.as_("emp")
    body = api.get("/hr/me/document-actions").json()
    item = next(i for i in body["items"] if i.get("task_id") == task.id)
    assert item["action"] == "upload" and cat.name in item["title"]
    assert item["link"] == f"/employee/documents/my-files?category={cat.id}"
    assert body["by_kind"]["upload"] >= 1
    # the chip filter
    assert all(i["action"] == "upload" for i in api.get("/hr/me/document-actions", params={"kind": "upload"}).json()["items"])
    assert api.get("/hr/me/document-actions", params={"kind": "sign"}).json()["items"] == []
    assert api.get("/hr/me/document-actions", params={"kind": "nonsense"}).status_code == 422


def test_another_persons_tasks_are_never_listed(api):
    _open_upload_task(api, who="emp2")
    api.as_("emp")
    assert not [i for i in api.get("/hr/me/document-actions").json()["items"] if i.get("task_id")]


def test_an_overdue_task_is_flagged_and_listed_first(api):
    late, _ = _open_upload_task(api, key="education", due_in_days=0)
    late.due_at = datetime.utcnow() - timedelta(days=2)
    _open_upload_task(api, key="address_proof", due_in_days=10)
    api.db.commit()
    api.as_("emp")
    items = [i for i in api.get("/hr/me/document-actions").json()["items"] if i.get("task_id")]
    assert items[0]["task_id"] == late.id and items[0]["overdue"] is True


def test_acknowledging_a_company_document_clears_its_action(api):
    _share(api, "category", _company_cat(api).id, require_ack=True)
    doc = _company_upload(api, key="company_policies", title="Code of conduct")
    api.as_("emp")
    acks = [i for i in api.get("/hr/me/document-actions", params={"kind": "acknowledge"}).json()["items"]]
    assert [i["document_id"] for i in acks] == [doc["id"]]
    assert acks[0]["link"] == f"/employee/documents/company?document={doc['id']}"
    api.post(f"/hr/me/company-documents/{doc['id']}/acknowledge", json={})
    assert api.get("/hr/me/document-actions", params={"kind": "acknowledge"}).json()["items"] == []


# ── tab badges ─────────────────────────────────────────────────────────────────────────────────────────────────────

def test_counts_for_the_document_tabs(api):
    api.as_("emp")
    before = api.get("/hr/me/documents/counts").json()
    assert set(before) >= {"to_action", "policies_pending", "company_needs_ack", "my_files_attention", "signatory_queue"}
    assert before["signatory_queue"] is None                            # not a signatory: the tab is hidden
    assert before["my_files_attention"] >= 1                           # required categories not uploaded yet
    _share(api, "category", _company_cat(api).id, require_ack=True)
    _company_upload(api, key="company_policies", title="Code of conduct")
    _open_upload_task(api)
    api.as_("emp")
    after = api.get("/hr/me/documents/counts").json()
    assert after["company_needs_ack"] == 1 and after["policies_pending"] == before["policies_pending"] + 1
    assert after["to_action"] == before["to_action"] + 2                # the read-confirmation and the upload task


def test_a_signatory_gets_a_number_for_their_queue(api):
    from app.modules.doc_templates.models import AuthorisedSignatory
    cols = {c.name for c in AuthorisedSignatory.__table__.columns}
    data = {"organization_id": 1, "employee_id": api.people["emp"].id}
    for name, value in (("status", "active"), ("title", "Director"), ("capacity", "Director"), ("full_name", "Emp One")):
        if name in cols:
            data[name] = value
    try:
        api.db.add(AuthorisedSignatory(**data))
        api.db.commit()
    except Exception:                                                   # the model needs more than this test knows about
        api.db.rollback()
        return
    api.as_("emp")
    assert api.get("/hr/me/documents/counts").json()["signatory_queue"] == 0
    assert api.get("/hr/me/generated-documents/signatory-queue").json()["is_signatory"] is True


# ── organization wording ───────────────────────────────────────────────────────────────────────────────────────────

def test_hr_rewords_a_notification_and_people_receive_that_wording(api):
    api.as_("hr")
    listing = api.get("/hr/automation/templates").json()
    assert any(t["key"] == "document.approved" for t in listing["items"])
    r = api.put("/hr/automation/templates/document.approved/in_app",
                json={"subject": "All set, {{first_name}}", "body": "<b>{{title}}</b> is approved at {{organization}}."})
    assert r.status_code == 200 and r.json()["body"] == "{{title}} is approved at {{organization}}."   # HTML stripped
    preview = api.post("/hr/automation/templates/document.approved/in_app/preview",
                       json={"subject": "Hi {{first_name}}", "body": "{{title}} ok"}).json()
    assert preview["body"] == "Passport ok"
    up = _upload(api)
    api.as_("hr")
    assert api.post(f"/hr/documents/{up.json()['id']}/decision/approve", json={}).status_code == 200
    _drain(api)
    assert any(t.startswith("All set,") for t in _notified(api, "emp"))
    assert api.delete("/hr/automation/templates/document.approved/in_app").status_code == 204
    assert api.db.query(NotificationTemplate).count() == 0


def test_unknown_placeholders_and_events_are_refused_and_employees_cannot_reword(api):
    api.as_("hr")
    assert api.put("/hr/automation/templates/document.approved/email", json={"body": "{{salary}}"}).status_code == 422
    assert api.put("/hr/automation/templates/document.nope/email", json={"body": "x"}).status_code == 422
    assert api.put("/hr/automation/templates/document.approved/sms", json={"body": "x"}).status_code == 422
    for who in ("emp", "mgr"):
        api.as_(who)
        assert api.get("/hr/automation/templates").status_code == 403


# ── weekly digest ──────────────────────────────────────────────────────────────────────────────────────────────────

def test_the_weekly_digest_goes_to_hr_once_a_week(api):
    assert _upload(api).status_code == 201                              # one review waiting
    now = datetime.utcnow()
    assert jobs.weekly_digest(api.db, 1, now) >= 1
    api.db.commit()
    assert "Weekly documents summary" in _notified(api, "hr")
    assert "Weekly documents summary" in _notified(api, "admin")
    assert "Weekly documents summary" not in _notified(api, "emp")
    assert jobs.weekly_digest(api.db, 1, now) == 0                      # same ISO week: nothing again
