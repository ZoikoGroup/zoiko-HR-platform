"""Documents Phase 2: employee uploads, the approval workflow (separation of duties, lock, re-upload, bulk), the system
automation rules (onboarding checklist, decision notices, expiry) and the scheduled jobs."""
import io
from datetime import date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.dependencies import get_current_user
from app.database import get_db
from app.modules.hr.documents import storage_service
from app.modules.hr.documents.automation import jobs, runner
from app.modules.hr.documents.automation.models import AutomationRun, DocumentTask, RuleStatus
from app.modules.hr.documents.automation.seeds import seed_org
from app.modules.hr.documents.category_service import employee_category_by_key
from app.modules.hr.documents.models import HrDocumentAuditLog, HrDocumentReminder
from app.modules.hr.models import DocumentApprovalStep, HrDocument, HrDocumentStatus, HrDocumentVersion
from app.modules.super_admin.models import Notification


def _pdf() -> bytes:
    from pypdf import PdfWriter
    w = PdfWriter()
    w.add_blank_page(width=100, height=100)
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


@pytest.fixture
def api(world, tmp_store, monkeypatch):
    from app.main import app
    monkeypatch.setattr("app.services.email_service.send_approval_email", lambda *a, **k: True)
    seed_org(world.db, 1, status=RuleStatus.ACTIVE.value)
    world.db.commit()
    box = {"user": world.people["emp"]}
    app.dependency_overrides[get_db] = lambda: world.db
    app.dependency_overrides[get_current_user] = lambda: box["user"]
    client = TestClient(app, raise_server_exceptions=False)
    client.box, client.world, client.db, client.people = box, world, world.db, world.people
    client.as_ = lambda who: box.__setitem__("user", world.people[who])
    yield client
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)


def _cat(api, key):
    return employee_category_by_key(api.db, 1, key)


def _upload(api, key="identity_proof", who="emp", data=None, name="passport.pdf", **form):
    api.as_(who)
    fields = {"category_id": str(_cat(api, key).id), **{k: str(v) for k, v in form.items()}}
    if key == "identity_proof" and "expiry_date" not in fields:
        fields["expiry_date"] = (date.today() + timedelta(days=400)).isoformat()
    return api.post("/hr/me/documents", data=fields, files={"file": (name, data if data is not None else _pdf(), "application/pdf")})


def _titles_for(db, person_id) -> list[str]:
    from app.modules.super_admin.models import NotificationTarget
    return [n.title for n in db.query(Notification).join(NotificationTarget, NotificationTarget.notification_id == Notification.id)
            .filter(NotificationTarget.kind == "user", NotificationTarget.ref == str(person_id))]


def _notified(api, who) -> list[str]:
    return _titles_for(api.db, api.people[who].id)


def _drain(api, now=None):
    runner.process_due_runs(api.db, now or datetime.utcnow())


# ── upload ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def test_an_employee_uploads_and_hr_is_told(api):
    r = _upload(api)
    assert r.status_code == 201, r.text
    body = r.json()
    assert (body["status"], body["version"], body["source"]) == ("pending_approval", 1, "employee")
    doc = api.db.get(HrDocument, body["id"])
    v = api.db.get(HrDocumentVersion, body["version_id"])
    assert doc.employee_id == api.people["emp"].id and doc.scope == "employee" and v.is_encrypted and v.storage_key
    assert storage_service.read_key(v.storage_key).startswith(b"%PDF")
    steps = api.db.query(DocumentApprovalStep).filter_by(version_id=v.id).order_by(DocumentApprovalStep.step_order).all()
    assert [s.required_role for s in steps] == ["hr_admin", "admin"]
    _drain(api)
    assert "Document to review" in _notified(api, "hr")
    assert "Document to review" not in _notified(api, "emp")


def test_my_categories_show_required_flags_and_status(api):
    _upload(api)
    api.as_("emp")
    cats = {c["key"]: c for c in api.get("/hr/me/documents/categories").json()}
    assert cats["identity_proof"]["status"] == "pending_approval" and cats["identity_proof"]["is_required"]
    assert cats["education"]["status"] == "not_uploaded"
    assert cats["payslips"]["can_upload"] is False


@pytest.mark.parametrize("kwargs,code", [
    (dict(key="payslips"), "DOC_CATEGORY_CLOSED"),
    (dict(data=b"MZ not a pdf"), "DOC_PRECHECK_FAILED"),
    (dict(expiry_date=""), "DOC_INVALID"),
    (dict(expiry_date="2020-01-01"), "DOC_INVALID"),
])
def test_bad_uploads_are_refused(api, kwargs, code):
    r = _upload(api, **kwargs)
    assert r.status_code == 422 and r.json()["error"] == code, r.text


def test_someone_elses_document_cannot_be_replaced(api):
    doc_id = _upload(api).json()["id"]
    r = _upload(api, who="emp2", replaces_document_id=doc_id)
    assert r.status_code == 404


# ── decisions ───────────────────────────────────────────────────────────────────────────────────────────────────────

def test_hr_approves_and_the_employee_is_told(api):
    body = _upload(api).json()
    api.as_("hr")
    r = api.post(f"/hr/documents/{body['id']}/decision/approve", json={"version_id": body["version_id"]})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved"
    steps = {s.required_role: s.status.value for s in api.db.query(DocumentApprovalStep).filter_by(document_id=body["id"])}
    assert steps == {"hr_admin": "approved", "admin": "skipped"}       # either approver completes the document
    _drain(api)
    assert "Document approved" in _notified(api, "emp")


@pytest.mark.parametrize("who,status", [("emp", 403), ("mgr", 403), ("emp2", 403)])
def test_only_approvers_decide(api, who, status):
    body = _upload(api).json()
    api.as_(who)
    assert api.post(f"/hr/documents/{body['id']}/decision/approve", json={}).status_code == status


def test_nobody_approves_their_own_upload(api):
    body = _upload(api, who="hr").json()
    api.as_("hr")
    r = api.post(f"/hr/documents/{body['id']}/decision/approve", json={})
    assert r.status_code == 409 and r.json()["error"] == "DOC_SELF_APPROVAL"
    api.as_("admin")
    assert api.post(f"/hr/documents/{body['id']}/decision/approve", json={}).status_code == 200


def test_an_org_admin_may_self_approve_only_when_nobody_else_can(api):
    db = api.db
    body = _upload(api, who="admin").json()
    api.as_("admin")
    assert api.post(f"/hr/documents/{body['id']}/decision/approve", json={}).json()["error"] == "DOC_SELF_APPROVAL"
    api.people["hr"].is_active = False                                  # the only other approver leaves
    db.commit()
    r = api.post(f"/hr/documents/{body['id']}/decision/approve", json={})
    assert r.status_code == 200, r.text
    row = db.query(HrDocumentAuditLog).filter_by(document_id=body["id"], action="approved").one()
    assert row.after["auto_reason"] == "self_approved_no_other_approver"


def test_reject_needs_a_reason_then_the_employee_reuploads(api):
    body = _upload(api).json()
    api.as_("hr")
    bad = api.post(f"/hr/documents/{body['id']}/decision/reject", json={"reason_code": "illegible", "note": "no"})
    assert bad.status_code == 422
    r = api.post(f"/hr/documents/{body['id']}/decision/reject", json={"reason_code": "illegible", "note": "Too blurry to read"})
    assert r.status_code == 200 and r.json()["status"] == "rejected"
    _drain(api)
    assert "Document not approved" in _notified(api, "emp")
    task = api.db.query(DocumentTask).filter_by(employee_id=api.people["emp"].id, kind="reupload", status="open").one()
    v2 = _upload(api, replaces_document_id=body["id"]).json()
    assert (v2["version"], v2["status"]) == (2, "pending_approval")
    api.db.refresh(task)
    assert task.status == "done"
    assert _upload(api, replaces_document_id=body["id"]).json()["error"] == "DOC_PENDING_EXISTS"
    versions = api.db.query(HrDocumentVersion).filter_by(document_id=body["id"]).order_by(HrDocumentVersion.version).all()
    assert [v.status for v in versions] == ["rejected", "pending_approval"]     # rejected history is kept


def test_asking_for_a_new_copy_keeps_the_approved_one_visible(api):
    body = _upload(api).json()
    api.as_("hr")
    api.post(f"/hr/documents/{body['id']}/decision/approve", json={})
    r = api.post(f"/hr/documents/{body['id']}/request-reupload", json={"reason_code": "expired", "note": "Please send the renewed one"})
    assert r.status_code == 200, r.text
    doc = api.db.get(HrDocument, body["id"])
    assert doc.status == HrDocumentStatus.REUPLOAD_REQUESTED and doc.approved_version_id == body["version_id"]
    assert api.db.get(HrDocumentVersion, body["version_id"]).status == "approved"


def test_the_review_lock_keeps_others_out(api):
    body = _upload(api).json()
    api.as_("hr")
    assert api.post(f"/hr/documents/{body['id']}/review-lock").status_code == 200
    api.as_("admin")
    r = api.post(f"/hr/documents/{body['id']}/decision/approve", json={})
    assert r.status_code == 409 and r.json()["error"] == "DOC_LOCKED" and r.json()["locked_by_name"] == "Hr User"
    api.as_("hr")
    assert api.delete(f"/hr/documents/{body['id']}/review-lock").status_code == 204
    api.as_("admin")
    assert api.post(f"/hr/documents/{body['id']}/decision/approve", json={}).status_code == 200


def test_a_decided_or_stale_version_cannot_be_decided_again(api):
    body = _upload(api).json()
    api.as_("hr")
    api.post(f"/hr/documents/{body['id']}/decision/approve", json={})
    api.as_("admin")
    r = api.post(f"/hr/documents/{body['id']}/decision/approve", json={"version_id": body["version_id"]})
    assert r.json()["error"] == "DOC_ALREADY_DECIDED"
    api.as_("hr")
    api.post(f"/hr/documents/{body['id']}/request-reupload", json={"reason_code": "expired", "note": "Please renew it"})
    _upload(api, replaces_document_id=body["id"])
    api.as_("admin")
    r = api.post(f"/hr/documents/{body['id']}/decision/approve", json={"version_id": body["version_id"]})
    assert r.json()["error"] == "DOC_STALE_VERSION"


def test_bulk_approve_reports_each_item(api):
    a = _upload(api).json()
    b = _upload(api, key="education", who="hr", name="degree.pdf").json()
    api.as_("hr")
    r = api.post("/hr/documents/approvals/bulk-approve", json={"items": [{"document_id": a["id"]}, {"document_id": b["id"]}]})
    results = {x["document_id"]: x for x in r.json()["results"]}
    assert results[a["id"]]["ok"] is True
    assert results[b["id"]] == {"document_id": b["id"], "ok": False, "code": "DOC_SELF_APPROVAL", "detail": results[b["id"]]["detail"]}


def test_the_legacy_approve_route_uses_the_new_workflow(api):
    body = _upload(api, who="hr").json()
    api.as_("hr")
    assert api.post(f"/hr/documents/{body['id']}/approve", json={}).status_code == 409   # same separation of duties


def test_a_pending_upload_can_be_withdrawn(api):
    body = _upload(api).json()
    api.as_("emp")
    assert api.delete(f"/hr/me/documents/{body['id']}").status_code == 204
    assert api.db.get(HrDocument, body["id"]).is_deleted
    api.as_("emp2")
    second = _upload(api, who="emp2").json()
    api.as_("emp")
    assert api.delete(f"/hr/me/documents/{second['id']}").status_code == 404


def test_another_organization_never_sees_the_files(api):
    _upload(api)
    api.as_("other")
    cats = api.get("/hr/me/documents/categories").json()
    assert all(c["file_count"] == 0 for c in cats)


# ── onboarding checklist ────────────────────────────────────────────────────────────────────────────────────────────

def test_a_new_employee_gets_an_upload_checklist(api):
    from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
    from app.modules.hr.documents.hooks import on_employee_created
    db = api.db
    new = Employee(email="new@org1.example.com", hashed_password="x", employee_code="C-1-new", role=UserRole.EMPLOYEE,
                   first_name="New", last_name="Joiner", job_title="t", employment_type=EmploymentType.FULL_TIME,
                   status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=1)
    db.add(new)
    db.commit()
    on_employee_created(db, new)
    _drain(api)
    tasks = db.query(DocumentTask).filter_by(employee_id=new.id, kind="upload_required").all()
    from app.modules.hr.documents.models import HrEmployeeDocumentCategory
    names = sorted(db.get(HrEmployeeDocumentCategory, t.employee_category_id).key for t in tasks)
    assert names == ["address_proof", "bank_details", "education", "identity_proof"]
    assert "Documents to upload" in _titles_for(db, new.id)
    on_employee_created(db, new)                    # the same event twice opens nothing twice
    _drain(api)
    assert db.query(DocumentTask).filter_by(employee_id=new.id, kind="upload_required").count() == 4


def test_paused_system_rules_do_nothing(world, tmp_store):
    from app.modules.hr.documents.hooks import on_employee_created
    seed_org(world.db, 1, status=RuleStatus.PAUSED.value)
    world.db.commit()
    on_employee_created(world.db, world.people["emp2"])
    assert world.db.query(AutomationRun).count() == 0


# ── jobs ────────────────────────────────────────────────────────────────────────────────────────────────────────────

def _approved_doc(api, days_to_expiry):
    body = _upload(api, expiry_date=(date.today() + timedelta(days=60)).isoformat()).json()
    api.as_("hr")
    api.post(f"/hr/documents/{body['id']}/decision/approve", json={})
    doc = api.db.get(HrDocument, body["id"])
    doc.expiry_date = date.today() + timedelta(days=days_to_expiry)
    api.db.commit()
    return doc


def test_expired_documents_expire_and_ask_for_a_new_copy(api):
    doc = _approved_doc(api, -1)
    now = datetime.utcnow()
    assert jobs.expire_documents(api.db, 1, now) == 1
    api.db.commit()
    assert jobs.expire_documents(api.db, 1, now) == 0                      # idempotent
    assert api.db.get(HrDocumentVersion, doc.approved_version_id).status == "expired"
    _drain(api)
    assert api.db.query(DocumentTask).filter_by(document_id=doc.id, kind="renew", status="open").count() == 1
    assert "Document expired" in _notified(api, "emp")


@pytest.mark.parametrize("days,kind", [(29, "expiry_30"), (14, "expiry_15"), (3, "expiry_7")])
def test_expiry_alerts_go_once_per_threshold(api, days, kind):
    doc = _approved_doc(api, days)
    now = datetime.utcnow()
    assert jobs.expiry_alerts(api.db, 1, now) == 1
    api.db.commit()
    assert jobs.expiry_alerts(api.db, 1, now) == 0
    rows = api.db.query(HrDocumentReminder).filter_by(document_id=doc.id).all()
    assert [r.kind for r in rows] == [kind]


def test_the_escalation_ladder_reminds_then_escalates(api):
    db = api.db
    from app.modules.hr.documents.automation.tasks import open_task
    api.people["emp"].reporting_manager_id = api.people["mgr"].id
    db.commit()
    start = datetime(2026, 11, 1, 9, 0)
    task, _ = open_task(db, 1, "upload_required", employee_id=api.people["emp"].id,
                        employee_category_id=_cat(api, "education").id, now=start)
    db.commit()
    assert jobs.escalate_tasks(db, 1, start) == 1                         # step 0: the person
    assert jobs.escalate_tasks(db, 1, start + timedelta(days=1)) == 0
    assert jobs.escalate_tasks(db, 1, start + timedelta(days=3)) == 1     # step 1: the person again
    assert jobs.escalate_tasks(db, 1, start + timedelta(days=7)) == 1     # step 2: their manager
    assert "Overdue document task" in _notified(api, "mgr")
    assert jobs.escalate_tasks(db, 1, start + timedelta(days=14)) == 1    # step 3: HR, task overdue
    db.refresh(task)
    assert task.status == "overdue" and task.escalation_level == 4
    assert jobs.escalate_tasks(db, 1, start + timedelta(days=30)) == 0


# ── P30: reading files ──────────────────────────────────────────────────────────────────────────────────────────────

def test_nobody_else_can_open_someone_elses_document(api):
    body = _upload(api).json()
    for who, expected in (("emp", 200), ("hr", 200), ("admin", 200), ("emp2", 404), ("mgr", 404), ("other", 404)):
        api.as_(who)
        r = api.get(f"/hr/documents/{body['id']}/file")
        assert r.status_code == expected, (who, r.status_code)
        if expected == 200:
            assert r.content.startswith(b"%PDF") and r.headers["cache-control"] == "private, no-store"
        assert api.get(f"/hr/documents/{body['id']}").status_code == expected
        assert api.post(f"/hr/documents/{body['id']}/download-link").status_code == expected
    api.as_("emp2")
    assert api.get(f"/hr/documents/{body['id']}/versions").status_code == 404
    assert api.get(f"/hr/documents/{body['id']}/versions/{body['version_id']}/file").status_code == 404


def test_opening_a_file_is_audited_once_per_window(api):
    body = _upload(api).json()
    api.as_("hr")
    api.get(f"/hr/documents/{body['id']}/file")
    api.get(f"/hr/documents/{body['id']}/file")
    api.get(f"/hr/documents/{body['id']}/file", params={"download": "true"})
    actions = [r.action for r in api.db.query(HrDocumentAuditLog).filter_by(document_id=body["id"], actor_id=api.people["hr"].id)]
    assert actions.count("viewed") == 1 and actions.count("downloaded") == 1


def test_a_signed_link_serves_the_approved_encrypted_file(api):
    body = _upload(api).json()
    api.as_("hr")
    api.post(f"/hr/documents/{body['id']}/decision/approve", json={})
    api.as_("emp")
    url = api.post(f"/hr/documents/{body['id']}/download-link").json()["url"]
    r = api.get(url)
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
