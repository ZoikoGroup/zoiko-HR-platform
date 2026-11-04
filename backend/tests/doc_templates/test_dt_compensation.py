"""Prompt 3 compensation (C3): approver ≠ requester, decreases blocked on the increase letter, managers 404 by default,
e-mails without amounts, encryption at rest, allowance awards, expense decisions and total reward statements."""
from datetime import date, timedelta
from decimal import Decimal

from app.modules.doc_templates import storage
from app.modules.doc_templates.models import DecisionReceipt, GeneratedDocument
from app.modules.hr.models import (EmployeeCompensation, RequestStatus, SalaryRevision, SalaryStructure, TravelExpense)
from tests.doc_templates.p3_support import activate, all_mail_text, docs, text_of

AMOUNT_CANARY = "44,100.00"


def _comp(world, who="a_emp", base=42000):
    s = SalaryStructure(name="Standard", organization_id=1)
    world.db.add(s)
    world.db.commit()
    c = EmployeeCompensation(employee_id=world.u[who].id, structure_id=s.id, effective_date=date.today() - timedelta(days=90),
                             base_amount=Decimal(base), currency="GBP", pay_period="annual", pay_frequency="monthly", organization_id=1)
    world.db.add(c)
    world.db.commit()
    return c


def _revision(world, new="44100", who="a_emp", by="a_hr", rtype="annual_review"):
    r = world.post(by, "/hr/compensation-documents/revisions", json={
        "employee_id": world.u[who].id, "new_salary": new, "effective_date": (date.today() + timedelta(days=30)).isoformat(),
        "revision_type": rtype, "reason_statement": "Your objectives were all met."})
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    assert world.post(by, f"/hr/compensation-documents/revisions/{rid}/submit").json()["status"] == "PENDING_APPROVAL"
    return rid


def test_salary_increase_needs_a_different_approver_and_is_communicated(world):
    activate(world.db, "HR-CMP-005")
    _comp(world)
    rid = _revision(world)
    assert world.post("a_hr", f"/hr/compensation-documents/revisions/{rid}/decision", json={"approve": True}).status_code == 403
    r = world.post("a_admin", f"/hr/compensation-documents/revisions/{rid}/decision", json={"approve": True})
    assert r.status_code == 200, r.text
    rev = world.db.get(SalaryRevision, rid)
    doc = docs(world.db, "HR-CMP-005")[0]
    assert rev.status == "COMMUNICATED" and rev.communicated_document_id == doc.id and float(rev.percentage_change) == 5.0
    assert doc.status == "ISSUED" and doc.sensitivity == "C3" and doc.requested_by == world.u["a_hr"].id
    assert world.u["a_admin"].id in doc.approved_by
    t = text_of(doc)
    assert "Your salary increase" in t and "42,000.00 GBP" in t and "44,100.00 GBP" in t and "+5.00%" in t
    assert "Your objectives were all met." in t
    # encrypted at rest: the stored file and the snapshot are not readable without the key
    assert doc.files_encrypted and doc.snapshot_encrypted and AMOUNT_CANARY not in (doc.field_snapshot or "")
    assert doc.pdf_path.endswith(".enc")
    with open(storage.get_store()._path(doc.pdf_path), "rb") as fh:
        assert not fh.read().startswith(b"%PDF")
    # e-mails never carry amounts or the letter type
    mail = all_mail_text(world)
    assert "compensation_document_available.html" in mail and AMOUNT_CANARY not in mail and "increase" not in mail.lower()


def test_managers_get_a_404_unless_the_organization_allows_it(world):
    activate(world.db, "HR-CMP-005")
    _comp(world)
    rid = _revision(world)
    world.post("a_admin", f"/hr/compensation-documents/revisions/{rid}/decision", json={"approve": True})
    doc = docs(world.db, "HR-CMP-005")[0]
    assert world.get("a_manager", f"/hr/generated-documents/{doc.id}").status_code == 404
    assert world.get("a_emp2", f"/hr/me/generated-documents/{doc.id}").status_code == 404
    assert world.get("a_emp", f"/hr/me/generated-documents/{doc.id}").status_code == 200
    assert world.put("a_hr", "/hr/compensation-documents/settings", json={"managers_see_reports": True}).status_code == 403
    assert world.put("a_admin", "/hr/compensation-documents/settings", json={"managers_see_reports": True}).status_code == 200
    assert world.get("a_manager", f"/hr/generated-documents/{doc.id}").status_code == 200
    assert world.get("platform", f"/hr/generated-documents/{doc.id}").status_code == 404


def test_a_decrease_is_never_an_increase_letter_and_corrections_send_none(world):
    activate(world.db, "HR-CMP-005")
    _comp(world)
    rid = _revision(world, new="40000")
    world.post("a_admin", f"/hr/compensation-documents/revisions/{rid}/decision", json={"approve": True})
    assert world.db.get(SalaryRevision, rid).status == "APPROVED" and not docs(world.db, "HR-CMP-005")
    receipt = world.db.query(DecisionReceipt).filter_by(source_ref=f"salary_revision:{rid}").one()
    assert "SALARY_DECREASE_NOT_ALLOWED" in receipt.reasons
    cid = _revision(world, new="42500", rtype="correction")
    world.post("a_admin", f"/hr/compensation-documents/revisions/{cid}/decision", json={"approve": True})
    assert not docs(world.db, "HR-CMP-005")


def test_nobody_approves_their_own_or_their_own_pay(world):
    _comp(world, who="a_admin2")
    rid = _revision(world, who="a_admin2", by="a_admin")
    assert world.post("a_admin", f"/hr/compensation-documents/revisions/{rid}/decision", json={"approve": True}).status_code == 403
    assert world.post("a_admin2", f"/hr/compensation-documents/revisions/{rid}/decision", json={"approve": True}).status_code == 403
    assert world.post("a_emp", f"/hr/compensation-documents/revisions/{rid}/decision", json={"approve": True}).status_code == 403


def test_allowance_award_letter(world):
    activate(world.db, "HR-CMP-010")
    r = world.post("a_hr", "/hr/compensation-documents/allowance-awards", json={
        "employee_id": world.u["a_emp"].id, "allowance_type": "Travel allowance", "amount": "100", "currency": "GBP", "frequency": "monthly",
        "effective_date": date.today().isoformat(), "review_date": (date.today() + timedelta(days=365)).isoformat(),
        "eligibility_reason": "Regular travel between sites", "conditions": "you travel between sites at least weekly"})
    assert r.status_code == 201, r.text
    aid = r.json()["id"]
    assert world.post("a_admin", f"/hr/compensation-documents/allowance-awards/{aid}/decision", json={"approve": True}).json()["status"] == "COMMUNICATED"
    t = text_of(docs(world.db, "HR-CMP-010")[0])
    assert "Allowance award — Travel allowance" in t and "100.00 GBP" in t and "at least weekly" in t and "before changing or ending it" in t


def test_initial_salary_confirmation_waits_for_a_second_person(world):
    activate(world.db, "HR-CMP-001")
    s = SalaryStructure(name="Standard", organization_id=1)
    world.db.add(s)
    world.db.commit()
    r = world.post("a_hr", "/hr/compensation/employee-compensation", json={
        "employee_id": world.u["a_emp"].id, "structure_id": s.id, "effective_date": date.today().isoformat(), "base_amount": "42000",
        "currency": "GBP", "pay_period": "annual", "pay_frequency": "monthly"})
    assert r.status_code == 200, r.text
    doc = docs(world.db, "HR-CMP-001")[0]
    assert doc.status == "PENDING_APPROVAL"
    assert world.post("a_hr", f"/hr/generated-documents/{doc.id}/approve", json={}).status_code == 403
    assert world.post("a_admin", f"/hr/generated-documents/{doc.id}/approve", json={}).status_code == 200
    assert world.post("a_hr", f"/hr/generated-documents/{doc.id}/issue").status_code == 200
    t = text_of(world.db.get(GeneratedDocument, doc.id))
    assert "Confirmation of your salary" in t and "42,000.00 GBP per year" in t and "deductions required by law" in t


def _claim(world, amount="300.00", who="a_emp"):
    e = TravelExpense(organization_id=1, employee_id=world.u[who].id, expense_type="Hotel", amount=Decimal(amount), currency="GBP",
                      description="Two nights, Leeds", status=RequestStatus.PENDING)
    world.db.add(e)
    world.db.commit()
    return e


def test_expense_claims_need_a_non_claimant_and_a_second_approver_above_the_threshold(world):
    activate(world.db, "HR-CMP-024")
    world.put("a_hr", "/hr/policies/settings", json={"claim_dispute_days": 14})
    world.put("a_admin", "/hr/compensation-documents/settings", json={"expense_second_approval_threshold": 200})
    e = _claim(world)
    assert world.post("a_emp", f"/hr/compensation-documents/expenses/{e.id}/decision", json={"approve": True}).status_code == 403
    first = world.post("a_manager", f"/hr/compensation-documents/expenses/{e.id}/decision", json={"approve": True}).json()
    assert first["status"] == "in_progress" and not docs(world.db, "HR-CMP-024")
    assert world.post("a_manager", f"/hr/compensation-documents/expenses/{e.id}/decision", json={"approve": True}).status_code == 403
    done = world.post("a_hr", f"/hr/compensation-documents/expenses/{e.id}/decision",
                      json={"approve": True, "approved_amount": "250", "reason": "Second night over the hotel limit"}).json()
    assert done["status"] == "approved" and done["approved_amount"] == 250.0
    t = text_of(docs(world.db, "HR-CMP-024")[0])
    assert "Expense Claim Decision — EXP-" in t and "300.00 GBP" in t and "250.00 GBP" in t and "Partly approved" in t
    assert "Morgan Lead" in t and "Harper People" in t and "within 14 days" in t
    own = _claim(world, who="a_hr")
    assert world.put("a_hr", f"/hr/travel-expenses/{own.id}", json={"status": "approved"}).status_code == 403


def test_employee_downloads_a_total_reward_statement(world):
    activate(world.db, "HR-CMP-002")
    _comp(world)
    r = world.post("a_emp", "/hr/me/compensation/statement", json={"period_label": "2026"})
    assert r.status_code == 200, r.text
    doc = world.db.get(GeneratedDocument, r.json()["document_id"])
    assert doc.status == "ISSUED" and doc.subject_id == world.u["a_emp"].id
    t = text_of(doc)
    assert "Your total reward statement — 2026" in t and "42,000.00 GBP" in t and "does not change your contract" in t
    mine = world.get("a_emp", "/hr/me/compensation").json()
    assert mine["documents"][0]["id"] == doc.id and mine["components"][0]["label"] == "Base salary"
    preview = world.post("a_hr", "/hr/compensation-documents/statements/run",
                         json={"employee_ids": [world.u["a_emp"].id], "period_label": "2026", "preview": True}).json()
    assert preview["results"][0]["outcome"] == "ALLOW"
