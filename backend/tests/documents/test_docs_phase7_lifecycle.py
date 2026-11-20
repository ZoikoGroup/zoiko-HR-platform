"""Documents Phase 7: generated documents filed into the employee's containers (and the signed copy after e-sign), exit and
role-change automations, offboarding archive, retention policies and the sweep, and the OCR pre-check (off by default)."""
from datetime import date, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.modules.hr.documents import filing, hooks, ocr
from app.modules.hr.documents.automation import jobs, tasks as task_service
from app.modules.hr.documents.automation.models import DocumentTask, RetentionPolicy
from app.modules.hr.documents.category_service import employee_category_by_key
from app.modules.hr.documents.models import HrDocumentAuditLog
from app.modules.hr.models import EmployeeLifecycle, HrDocument, HrDocumentVersion
from test_docs_phase2_flows import _drain, _notified, _pdf, _upload, api  # noqa: F401


def _gdoc(api, **kw):
    base = dict(id=900, organization_id=1, recipient_employee_id=api.people["emp"].id, hr_document_id=None, kind="AGREEMENT",
                title="Employment contract", canonical_id="HR-HIR-012", document_number="DOC-2026-0001",
                executed_pdf_path=None, pdf_path="t1/doc.pdf", files_encrypted=True, execution_mode="SIGN_BOTH")
    base.update(kw)
    return SimpleNamespace(**base)


@pytest.fixture
def pdf_store(monkeypatch):
    files = {"pdf": _pdf(), "signed": _pdf() + b"%signed"}
    monkeypatch.setattr("app.modules.doc_templates.service.file_bytes",
                        lambda doc, which="pdf": files["signed"] if (which == "pdf" and doc.executed_pdf_path) else files["pdf"])
    return files


# ── auto-filing ────────────────────────────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("kind,title,key", [("AGREEMENT", "Employment contract", "offer_contracts"),
                                            ("LETTER_NOTICE", "Offer letter", "offer_contracts"),
                                            ("RECORD", "Annual tax statement", "tax_compliance"),
                                            ("POLICY", "Leave policy", None)])
def test_generated_documents_map_to_a_container(kind, title, key):
    assert filing.category_key_for(SimpleNamespace(kind=kind, title=title, canonical_id="X")) == key


def test_an_issued_contract_is_filed_approved_in_offer_and_contracts(api, pdf_store):
    g = _gdoc(api)
    doc = filing.file_generated(api.db, g, api.people["hr"])
    api.db.commit()
    assert g.hr_document_id == doc.id
    assert doc.employee_category_id == employee_category_by_key(api.db, 1, "offer_contracts").id
    assert doc.source == "template" and doc.scope == "employee"
    v = api.db.query(HrDocumentVersion).filter_by(document_id=doc.id).one()
    assert v.status == "approved" and v.is_encrypted and doc.approved_version_id == v.id
    assert filing.file_generated(api.db, g, api.people["hr"]).id == doc.id          # idempotent
    api.as_("emp")
    cats = {c["key"]: c for c in api.get("/hr/me/documents/categories").json()}
    assert cats["offer_contracts"]["files"][0]["status"] == "approved"


def test_when_everyone_signed_the_signed_copy_is_added_and_the_person_told(api, pdf_store):
    g = _gdoc(api)
    filing.file_generated(api.db, g, api.people["hr"])
    task_service.open_task(api.db, 1, "sign", employee_id=g.recipient_employee_id, generated_document_id=g.id)
    api.db.commit()
    g.executed_pdf_path = "t1/doc-executed.pdf"
    filing.on_executed(api.db, g)
    versions = api.db.query(HrDocumentVersion).filter_by(document_id=g.hr_document_id).order_by(HrDocumentVersion.version).all()
    assert [(v.version, v.status, v.change_notes) for v in versions] == [(1, "superseded", "Issued"), (2, "approved", "Signed copy")]
    assert api.db.query(DocumentTask).filter_by(kind="sign", status="open").count() == 0
    assert "Signed copy saved" in _notified(api, "emp")
    filing.on_executed(api.db, g)                                                   # a repeated event adds nothing
    assert api.db.query(HrDocumentVersion).filter_by(document_id=g.hr_document_id).count() == 2


def test_a_document_signed_before_it_was_ever_filed_is_filed_once_as_the_signed_copy(api, pdf_store):
    g = _gdoc(api, executed_pdf_path="t1/doc-executed.pdf")
    filing.on_executed(api.db, g)
    versions = api.db.query(HrDocumentVersion).filter_by(document_id=g.hr_document_id).all()
    assert [(v.version, v.change_notes) for v in versions] == [(1, "Signed copy")]


# ── exit and role change ───────────────────────────────────────────────────────────────────────────────────────────

def test_an_exit_cancels_open_tasks_and_releases_review_locks_immediately(api):
    emp, hr = api.people["emp"], api.people["hr"]
    task_service.open_task(api.db, 1, "upload_required", employee_id=emp.id,
                           employee_category_id=employee_category_by_key(api.db, 1, "education").id)
    up = _upload(api, who="emp2").json()
    locked = api.db.get(HrDocument, up["id"])
    locked.review_locked_by, locked.review_locked_until = emp.id, datetime.utcnow() + timedelta(minutes=5)
    api.db.commit()
    hooks.on_employee_exited(api.db, emp, exit_date=date.today(), exit_type="resignation")
    assert api.db.query(DocumentTask).filter_by(employee_id=emp.id, status="open").count() == 0
    assert api.db.get(HrDocument, up["id"]).review_locked_by is None
    assert api.db.query(HrDocumentAuditLog).filter_by(action="employee_exited", employee_id=emp.id).count() == 1


def test_a_department_change_stops_asking_for_documents_that_no_longer_apply(api):
    from app.modules.hr.documents.automation.models import AutomationRule
    from app.modules.hr.models import Department
    emp = api.people["emp"]
    eng = Department(name="Engineering", code="ENG", organization_id=1)
    api.db.add(eng)
    api.db.commit()
    edu = employee_category_by_key(api.db, 1, "education")
    edu.applies_to = {"department_ids": [eng.id]}
    emp.department_id = eng.id
    task_service.open_task(api.db, 1, "upload_required", employee_id=emp.id, employee_category_id=edu.id)
    api.db.commit()
    assert api.db.query(AutomationRule).filter_by(organization_id=1, key="sys.role_change_reassign").count() == 1
    old = emp.department_id
    emp.department_id = None
    api.db.commit()
    hooks.on_employee_role_changed(api.db, emp, from_department_id=old)
    _drain(api)
    t = api.db.query(DocumentTask).filter_by(employee_id=emp.id, employee_category_id=edu.id).one()
    assert t.status == "cancelled" and t.close_reason == "no_longer_required"


def test_losing_the_hr_role_releases_review_locks(api):
    hr = api.people["hr"]
    up = _upload(api).json()
    doc = api.db.get(HrDocument, up["id"])
    doc.review_locked_by, doc.review_locked_until = hr.id, datetime.utcnow() + timedelta(minutes=5)
    api.db.commit()
    hooks.on_employee_role_changed(api.db, hr, from_role="hr_admin", to_role="employee")
    assert api.db.get(HrDocument, up["id"]).review_locked_by is None


# ── offboarding archive and retention ──────────────────────────────────────────────────────────────────────────────

def _left(api, who, days_ago):
    emp = api.people[who]
    emp.is_active = False
    api.db.add(EmployeeLifecycle(employee_id=emp.id, organization_id=1, event_type="exit", status="completed",
                                 event_date=date.today() - timedelta(days=days_ago)))
    api.db.commit()
    return emp


def test_files_of_people_who_left_are_archived_after_the_lock_period(api):
    up = _upload(api).json()
    api.db.add(RetentionPolicy(organization_id=1, scope="employee", category_key="identity_proof", retain_years=6, clock="from_exit"))
    _left(api, "emp", days_ago=5)
    assert jobs.offboarding_finalize(api.db, 1, datetime.utcnow()) == 0                 # still inside the lock period
    api.db.query(EmployeeLifecycle).filter_by(employee_id=api.people["emp"].id).one().event_date = date.today() - timedelta(days=40)
    api.db.commit()
    assert jobs.offboarding_finalize(api.db, 1, datetime.utcnow()) == 1
    doc = api.db.get(HrDocument, up["id"])
    assert doc.is_archived and doc.retention_until.year == (date.today() - timedelta(days=40)).year + 6
    assert jobs.offboarding_finalize(api.db, 1, datetime.utcnow()) == 0                 # once


def test_retention_archives_or_deletes_after_the_review_window_and_respects_legal_hold(api):
    keep = _upload(api).json()
    held = _upload(api, key="education", name="degree.pdf").json()
    for d in (keep, held):
        api.db.get(HrDocument, d["id"]).created_at = datetime.utcnow() - timedelta(days=4 * 366)
    api.db.get(HrDocument, held["id"]).legal_hold = True
    api.db.add_all([RetentionPolicy(organization_id=1, scope="employee", category_key="identity_proof", retain_years=3,
                                    clock="from_upload", action="delete", review_days=30),
                    RetentionPolicy(organization_id=1, scope="employee", category_key="education", retain_years=3,
                                    clock="from_upload", action="delete", review_days=30)])
    api.db.commit()
    now = datetime.utcnow()
    jobs.retention_sweep(api.db, 1, now)
    api.db.commit()
    assert api.db.get(HrDocument, keep["id"]).is_deleted is False                       # HR told first
    assert "Retention period ended" in _notified(api, "hr")
    jobs.retention_sweep(api.db, 1, now + timedelta(days=31))
    api.db.commit()
    assert api.db.get(HrDocument, keep["id"]).is_deleted is True
    assert api.db.get(HrDocument, held["id"]).is_deleted is False                       # legal hold wins


def test_retention_policies_api_and_only_the_org_admin_may_choose_delete(api):
    api.as_("hr")
    listing = api.get("/hr/automation/retention-policies").json()
    assert any(i["key"] == "identity_proof" and i["policy"] is None for i in listing["items"]) and listing["can_delete"] is False
    ok = api.put("/hr/automation/retention-policies/employee/identity_proof", json={"retain_years": 7, "clock": "from_exit"})
    assert ok.status_code == 200 and ok.json()["action"] == "archive"
    assert api.put("/hr/automation/retention-policies/employee/identity_proof",
                   json={"retain_years": 7, "clock": "from_exit", "action": "delete"}).status_code == 403
    assert api.put("/hr/automation/retention-policies/company/company_policies",
                   json={"retain_years": 7, "clock": "from_exit"}).status_code == 422
    api.as_("admin")
    assert api.put("/hr/automation/retention-policies/employee/identity_proof",
                   json={"retain_years": 7, "clock": "from_exit", "action": "delete"}).status_code == 200
    api.as_("hr")
    assert api.delete("/hr/automation/retention-policies/employee/identity_proof").status_code == 403
    api.as_("emp")
    assert api.get("/hr/automation/retention-policies").status_code == 403


# ── OCR pre-check (off by default) ─────────────────────────────────────────────────────────────────────────────────

def test_name_matching_and_dates():
    assert ocr.name_score("REPUBLIC PASSPORT  Surname RAO  Given names ASHA  Date of expiry 12/05/2031", "Asha Rao") >= 0.85
    assert ocr.name_score("Surname KUMAR Given names RAVI", "Asha Rao") < 0.85
    assert date(2031, 5, 12) in ocr.dates_in("expires 12/05/2031 issued 2021-05-12")


def test_ocr_is_off_unless_the_organization_turns_it_on(api, monkeypatch):
    from app.modules.hr.documents.automation.models import AutomationSettings
    from app.modules.hr.documents.precheck import PrecheckResult
    monkeypatch.setattr(ocr, "extract_text", lambda data, mime: "Surname KUMAR Given names RAVI")
    person = SimpleNamespace(first_name="Asha", last_name="Rao")
    off = ocr.add_ocr_checks(PrecheckResult(), api.db, organization_id=1, data=b"x", mime="image/png", person=person)
    assert off.checks == []
    api.db.add(AutomationSettings(organization_id=1, features={"ocr": True}))
    api.db.commit()
    on = ocr.add_ocr_checks(PrecheckResult(), api.db, organization_id=1, data=b"x", mime="image/png", person=person)
    assert [(c.code, c.status) for c in on.checks] == [("ocr_name", "warn")]
    assert "KUMAR" not in str([c.as_dict() for c in on.checks])                          # no extracted text kept
