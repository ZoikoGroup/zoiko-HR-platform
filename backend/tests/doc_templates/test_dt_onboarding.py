"""Prompt 2 onboarding: structured new-starter forms (encryption, masking, finance permission), checklists with exceptions,
manager tasks, probation schedule, equipment form, commencement and completion records."""
import json
import logging
from datetime import date, datetime, timedelta

from sqlalchemy import text

from app.modules.doc_templates import renderer, storage
from app.modules.doc_templates.models import GeneratedDocument
from app.modules.hr.models import (Asset, EmployeeLifecycle, OnboardingChecklist, OnboardingChecklistItem, OnboardingFormSubmission,
                                   OnboardingNewHire)
from tests.doc_templates.p2_support import activate, gb_pack

BANK = "GB29NWBK60161331926819"


def _hire(world, **kw):
    h = OnboardingNewHire(organization_id=1, candidate_name="Nora Newstarter", email="nora.newstarter@example.com", position="Analyst",
                          joining_date=date.today() + timedelta(days=14), status="offer_accepted", work_country="GB",
                          manager_id=world.u["a_manager"].id, **kw)
    world.db.add(h)
    world.db.commit()
    from app.modules.hr import onboarding_flow
    url = onboarding_flow.issue_portal_link(world.db, h, send=False)["url"]
    return h, url.rsplit("/", 1)[1]


def _finance(world, who="a_hr2"):
    r = world.put("a_admin", "/hr/onboarding/finance-viewers", json={"employee_ids": [world.u[who].id]})
    assert r.status_code == 200, r.text


BANK_VALUES = {"account_holder": "Nora Newstarter", "bank_name": "Example Bank", "account_number": BANK, "routing_code": "601613"}


def test_bank_details_are_encrypted_masked_and_verified_only_with_finance_permission(world, caplog):
    caplog.set_level(logging.DEBUG)
    activate(world.db, "HR-ONB-017")
    h, token = _hire(world)
    forms = {f["canonical_id"]: f for f in world.client.get(f"/public/onboarding/{token}/forms").json()["items"]}
    assert set(forms) == {"HR-ONB-001", "HR-ONB-003", "HR-ONB-017"}
    assert next(f for f in forms["HR-ONB-017"]["fields"] if f["key"] == "routing_code")["label"] == "Sort code"
    assert not any(f["key"] in ("tax_identifier", "social_security_number") for f in forms["HR-ONB-017"]["fields"]), \
        "not collected unless the jurisdiction pack requires it"
    r = world.client.post(f"/public/onboarding/{token}/forms/HR-ONB-017/submit", json={"values": BANK_VALUES})
    assert r.status_code == 422, "the declaration must be confirmed"
    r = world.client.post(f"/public/onboarding/{token}/forms/HR-ONB-017/submit", json={"values": BANK_VALUES, "declaration_accepted": True})
    assert r.status_code == 200, r.text
    assert r.json()["values"]["account_number"] == "•••• 6819" and BANK not in r.text

    raw = world.db.execute(text("SELECT data, data_encrypted FROM onboarding_form_submissions")).fetchone()
    assert BANK not in str(raw[0]) and BANK not in str(raw[1]), "encrypted at rest"
    sub_id = r.json()["id"]
    hr_view = world.get("a_hr", f"/hr/onboarding/new-hires/{h.id}/forms").text
    assert BANK not in hr_view and "•••• 6819" in hr_view
    assert world.get("a_hr", f"/hr/onboarding/forms/{sub_id}/reveal").status_code == 403
    assert world.post("a_hr", f"/hr/onboarding/forms/{sub_id}/verify").json()["detail"]["code"] == "FINANCE_PERMISSION_REQUIRED"
    _finance(world)
    assert world.get("a_hr2", f"/hr/onboarding/forms/{sub_id}/reveal").json()["values"]["account_number"] == BANK
    r = world.post("a_hr2", f"/hr/onboarding/forms/{sub_id}/verify")
    assert r.status_code == 200 and r.json()["status"] == "VERIFIED"
    doc = world.db.query(GeneratedDocument).filter_by(canonical_id="HR-ONB-017").one()
    pdf_text = " ".join(renderer.pdf_text(storage.get_store().get(doc.pdf_path)).split())
    assert "Bank and Payroll Details" in pdf_text and "6819" in pdf_text and BANK not in pdf_text
    assert "Never send bank details by email or chat" in pdf_text
    from app.modules.integrations.models import WebhookDelivery  # noqa: F401  (event queued only when webhooks exist)
    assert BANK not in repr(world.mail) and BANK not in caplog.text


def test_pack_requirements_reveal_optional_identifiers(world):
    pack = gb_pack(world.db)
    pack.requirements = {"collect_national_identifier": True}
    world.db.commit()
    h, token = _hire(world)
    forms = {f["canonical_id"]: f for f in world.client.get(f"/public/onboarding/{token}/forms").json()["items"]}
    keys = {f["key"] for f in forms["HR-ONB-001"]["fields"]}
    assert "national_identifier" in keys and "nationality" not in keys


def test_personal_and_emergency_forms_update_the_record_in_the_ess_shape(world):
    activate(world.db, "HR-ONB-001")
    activate(world.db, "HR-ONB-003")
    h, token = _hire(world)
    personal = {"legal_first_name": "Nora", "legal_last_name": "Newstarter", "date_of_birth": "1995-04-03", "personal_email": "nora@example.com",
                "mobile_phone": "+44 7700 900123", "address_line1": "4 Sample Road", "city": "Leeds", "postal_code": "LS2 2AA", "country": "United Kingdom"}
    s1 = world.client.post(f"/public/onboarding/{token}/forms/HR-ONB-001/submit", json={"values": personal, "declaration_accepted": True}).json()
    s3 = world.client.post(f"/public/onboarding/{token}/forms/HR-ONB-003/submit",
                           json={"values": {"contact1_name": "Pat Parent", "contact1_relationship": "Parent", "contact1_phone": "+44 7700 900456"},
                                 "declaration_accepted": True}).json()
    assert world.post("a_hr", f"/hr/onboarding/forms/{s3['id']}/return", json={"reason": "Add a second contact"}).json()["status"] == "RETURNED"
    world.client.post(f"/public/onboarding/{token}/forms/HR-ONB-003/submit", json={"values": {}, "declaration_accepted": True})
    for sid in (s1["id"], s3["id"]):
        assert world.post("a_hr", f"/hr/onboarding/forms/{sid}/verify").json()["status"] == "VERIFIED"
    world.db.refresh(h)
    from app.modules.hr.service import _profile_fields
    fields = _profile_fields(h)
    assert fields["emergency_contacts"][0] == {"name": "Pat Parent", "relationship": "Parent", "primaryPhone": "+44 7700 900456",
                                               "alternatePhone": "", "address": "", "isPrimary": True}
    assert fields["date_of_birth"] == date(1995, 4, 3) and fields["personal_email"] == "nora@example.com"
    assert {d.canonical_id for d in world.db.query(GeneratedDocument).all()} >= {"HR-ONB-001", "HR-ONB-003"}


def test_checklist_exceptions_gate_completion_and_managers_see_their_tasks(world):
    activate(world.db, "HR-ONB-005")
    h, _ = _hire(world)
    from app.modules.hr import onboarding_flow
    onboarding_flow.start_onboarding(world.db, h)
    tasks = world.get("a_manager", "/hr/onboarding/my-tasks").json()
    assert tasks["total"] >= 10 and tasks["open"] == tasks["total"]
    assert any(d.canonical_id == "HR-ONB-005" and d.recipient_employee_id == world.u["a_manager"].id
               for d in world.db.query(GeneratedDocument).all()), "the manager checklist is issued to the manager"
    blockers = onboarding_flow.completion_blockers(world.db, h)
    assert any("mandatory item" in b for b in blockers)
    for t in tasks["items"]:
        world.put("a_manager", f"/hr/onboarding/my-tasks/{t['id']}", json={"completed": True})
    assert not [b for b in onboarding_flow.completion_blockers(world.db, h) if "mandatory item" in b]
    item = world.db.query(OnboardingChecklistItem).first()
    item.completed = False
    world.db.commit()
    assert world.put("a_emp", f"/hr/onboarding/checklist-items/{item.id}/exception", json={}).status_code in (403, 422)
    r = world.put("a_hr", f"/hr/onboarding/checklist-items/{item.id}/exception",
                  json={"reason": "Laptop delayed", "owner_id": world.u["a_hr"].id, "due_date": date.today().isoformat(), "blocked_action": "System access"})
    assert r.status_code == 200
    assert not [b for b in onboarding_flow.completion_blockers(world.db, h) if "mandatory item" in b]
    assert world.put("a_emp", f"/hr/onboarding/my-tasks/{item.id}", json={"completed": True}).status_code == 404


def test_probation_schedule_creates_the_event_reviews_and_letter(world):
    activate(world.db, "HR-ONB-020")
    emp = world.u["a_emp"]
    body = {"start_date": "2026-11-02", "end_date": "2027-05-02", "objectives_summary": "Learn the reporting stack",
            "review_dates": [{"label": "First review", "date": "2026-12-02"}], "reviewer_id": world.u["a_manager"].id}
    assert world.post("a_hr", f"/hr/onboarding/probation/{emp.id}", json={**body, "end_date": "2026-10-01"}).status_code == 422
    r = world.post("a_hr", f"/hr/onboarding/probation/{emp.id}", json=body)
    assert r.status_code == 201, r.text
    ev = world.db.query(EmployeeLifecycle).filter_by(event_type="probation_start").one()
    assert ev.new_value["end_date"] == "2027-05-02"
    doc = world.db.query(GeneratedDocument).filter_by(canonical_id="HR-ONB-020").one()
    assert doc.status == "ISSUED" and doc.execution_mode == "ACKNOWLEDGE"
    t = " ".join(renderer.pdf_text(storage.get_store().get(doc.pdf_path)).split())
    assert "Your probation period" in t and "First review" in t and "Morgan Lead" in t and "Probation Policy" in t


def test_assigning_equipment_issues_the_issuance_form_for_signature(world):
    activate(world.db, "HR-ONB-015")
    a = Asset(name="Laptop", asset_tag="AT-0001", serial_number="SN123", organization_id=1, category="IT")
    world.db.add(a)
    world.db.commit()
    from app.modules.hr import asset_service
    asset_service.assign_asset(world.db, a.id, world.u["a_emp"].id, world.u["a_hr"].id, organization_id=1)
    doc = world.db.query(GeneratedDocument).filter_by(canonical_id="HR-ONB-015").one()
    assert doc.status == "ISSUED" and doc.execution_mode == "SIGN_EMPLOYEE"
    t = " ".join(renderer.pdf_text(storage.get_store().get(doc.pdf_path)).split())
    assert "AT-0001" in t and "This form does not authorise any deduction from your pay" in t
    mine = world.get("a_emp", f"/hr/me/generated-documents/{doc.id}").json()
    assert mine["my_action"] == "sign" and mine["needs_otp"] is False, "a simple typed signature, no code"


def test_commencement_job_confirms_start_once(world):
    activate(world.db, "HR-ONB-007")
    emp = world.u["a_emp2"]
    emp.date_of_joining = date.today()
    world.db.commit()
    from app.modules.hr import onboarding_documents
    assert onboarding_documents.commencement_job(world.db) >= 1
    n = world.db.query(GeneratedDocument).filter_by(canonical_id="HR-ONB-007", subject_id=emp.id).count()
    assert onboarding_documents.commencement_job(world.db) == 0 and n == 1


def test_bank_change_after_onboarding_notifies_the_employee_and_needs_re_verification(world):
    emp = world.u["a_emp"]
    r = world.put("a_emp", f"/hr/employee-management/employees/{emp.id}/profile",
                  json={"bank_name": "State Bank of India", "bank_account": "123456789012", "bank_ifsc": "SBIN0001234"})
    assert r.status_code == 200, r.text
    assert any(t == "bank_details_changed.html" for _, t, _ in world.mail)
    sub = world.db.query(OnboardingFormSubmission).filter_by(employee_id=emp.id, canonical_id="HR-ONB-017").one()
    assert sub.status == "SUBMITTED" and "123456789012" not in str(sub.data) and "123456789012" not in (sub.data_encrypted or "")
    assert "123456789012" not in repr([c for (_, t, c) in world.mail if t == "bank_details_changed.html"])
    queue = world.get("a_hr", "/hr/onboarding/payroll-verifications")
    assert queue.status_code == 403, "only finance-permitted people see the re-verification queue"


def test_completion_produces_the_checklist_and_completion_records(world):
    activate(world.db, "HR-ONB-004")
    activate(world.db, "HR-ONB-022")
    h, _ = _hire(world, work_region="England")
    h.employment_type = "full_time"
    h.status = "in_progress"
    world.db.commit()
    r = world.put("a_hr", f"/hr/onboarding/new-hires/{h.id}", json={"status": "completed", "force_complete": True})
    assert r.status_code == 200, r.text
    world.db.refresh(h)
    assert h.employee_id
    from app.modules.doc_templates.models import EmployerEntity
    from app.modules.employee.models import Employee
    employee = world.db.get(Employee, h.employee_id)
    default_entity = world.db.query(EmployerEntity).filter_by(organization_id=1, is_default=True).one()
    assert employee.work_country == "GB"
    assert employee.work_region == "England"
    assert employee.employing_entity_id == default_entity.id
    docs = {d.canonical_id: d for d in world.db.query(GeneratedDocument).filter(GeneratedDocument.canonical_id.in_(["HR-ONB-004", "HR-ONB-022"]))}
    assert set(docs) == {"HR-ONB-004", "HR-ONB-022"} and all(d.audience == "HR_INTERNAL" for d in docs.values())
    t = " ".join(renderer.pdf_text(storage.get_store().get(docs["HR-ONB-004"].pdf_path)).split())
    assert "Onboarding Checklist — Nora Newstarter" in t and "Legal onboarding items not configured for United Kingdom" in t
    assert "Right-to-work or eligibility check where required" in t
    t = " ".join(renderer.pdf_text(storage.get_store().get(docs["HR-ONB-022"].pdf_path)).split())
    assert "Onboarding Completion Record — Nora Newstarter" in t and "Harper People" in t
