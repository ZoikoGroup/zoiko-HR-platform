"""Prompt 4 employment changes and training records: approval by someone other than the initiator, letters after approval,
HR state changed only at completion, contract variations refused, promotion pay sections upgraded to C3, ESS transfer requests
with two decisions, bulk manager changes, mandatory training and certification records with expiry reminders."""
from datetime import date, timedelta
from decimal import Decimal

from app.modules.doc_templates.models import DecisionReceipt, DocumentExpiryItem, GeneratedDocument
from app.modules.employee.models import UserRole
from app.modules.hr.models import (Department, EmployeeHistory, EmployeeLifecycle, LearningCertification, LearningCourse,
                                   LearningEnrollment, SalaryRevision)
from tests.doc_templates.p3_support import activate, docs, text_of
from tests.privacy.support import _emp


def _dept(world, name, code):
    d = Department(name=name, code=code, organization_id=1)
    world.db.add(d)
    world.db.commit()
    return d


def test_promotion_letter_after_approval_with_a_c3_pay_section_and_state_only_on_completion(world):
    activate(world.db, "HR-CHG-004")
    world.u["a_emp"].job_title = "Analyst"
    world.db.commit()
    rev = SalaryRevision(employee_compensation_id=1, employee_id=world.u["a_emp"].id, old_salary=Decimal("42000"), new_salary=Decimal("46000"),
                         currency="GBP", effective_date=date.today(), status="PENDING_APPROVAL", organization_id=1)
    world.db.add(rev)
    world.db.commit()
    body = {"employee_id": world.u["a_emp"].id, "event_type": "promotion", "effective_date": date.today().isoformat(),
            "new_value": {"title": "Senior Analyst"}, "new_responsibilities": ["Lead the monthly reporting cycle"],
            "linked_salary_revision_id": rev.id}
    ev = world.post("a_manager", "/hr/changes", json=body).json()
    assert world.post("a_manager", f"/hr/changes/{ev['id']}/decision", json={"approve": True}).status_code == 403
    assert world.post("a_emp", f"/hr/changes/{ev['id']}/decision", json={"approve": True}).status_code == 403
    world.post("a_hr", f"/hr/changes/{ev['id']}/decision", json={"approve": True})
    assert "LINKED_COMPENSATION_NOT_APPROVED" in world.db.query(DecisionReceipt).filter_by(source_ref=f"employee_lifecycle:{ev['id']}").one().reasons
    world.db.refresh(world.u["a_emp"])
    assert world.u["a_emp"].job_title == "Analyst", "approval and letters never change the record"

    rev.status = "APPROVED"
    world.db.commit()
    ev2 = world.post("a_manager", "/hr/changes", json=body).json()
    world.post("a_hr", f"/hr/changes/{ev2['id']}/decision", json={"approve": True})
    doc = docs(world.db, "HR-CHG-004")[-1]
    assert doc.status == "ISSUED" and doc.sensitivity == "C3" and doc.files_encrypted
    t = text_of(doc)
    assert "Congratulations on your promotion" in t and "Analyst to Senior Analyst" in t and "46,000.00 GBP" in t
    assert "All other terms and conditions of your employment remain unchanged." in t
    assert world.get("a_manager", f"/hr/generated-documents/{doc.id}").status_code == 404, "pay section: managers need permission"
    world.db.refresh(world.u["a_emp"])
    assert world.u["a_emp"].job_title == "Analyst"
    out = world.post("a_hr", f"/hr/changes/{ev2['id']}/complete").json()
    world.db.refresh(world.u["a_emp"])
    assert out["status"] == "completed" and world.u["a_emp"].job_title == "Senior Analyst"
    assert world.db.query(EmployeeHistory).filter_by(employee_id=world.u["a_emp"].id, field_name="job_title").count() == 1


def test_a_change_of_country_or_hours_needs_a_terms_variation(world):
    activate(world.db, "HR-CHG-007")
    ops = _dept(world, "Operations", "OPSC")
    ev = world.post("a_hr", "/hr/changes", json={"employee_id": world.u["a_emp"].id, "event_type": "department_change",
                                                 "effective_date": date.today().isoformat(),
                                                 "new_value": {"department_id": ops.id, "work_country": "IE"}}).json()
    world.post("a_admin", f"/hr/changes/{ev['id']}/decision", json={"approve": True})
    assert "CONTRACT_VARIATION_REQUIRED" in world.db.query(DecisionReceipt).filter_by(source_ref=f"employee_lifecycle:{ev['id']}").one().reasons


def test_ess_transfer_request_needs_the_receiving_manager_and_hr(world):
    for cid in ("HR-CHG-001", "HR-CHG-002", "HR-CHG-007"):
        activate(world.db, cid)
    ops = _dept(world, "Operations", "OPST")
    world.u["a_emp"].department_id = _dept(world, "Finance", "FINT").id
    world.db.commit()
    receiving = _emp(world.db, "receiving@tenant-a.example.com", UserRole.MANAGER, 1, "Rae", "Receiving", department_id=ops.id)
    world.u["receiving"] = receiving
    r = world.post("a_emp", "/hr/me/transfer-requests", json={"requested_department_id": ops.id, "reason": "Closer to my skills",
                                                              "manager_informed": False})
    assert r.status_code == 201, r.text
    ev = r.json()
    request_record = docs(world.db, "HR-CHG-001")[0]
    assert request_record.status == "ISSUED" and "will not affect how you are treated" in text_of(request_record)
    assert world.post("a_manager", f"/hr/changes/{ev['id']}/decision", json={"approve": True}).status_code == 403, "not the receiving manager"
    first = world.post("receiving", f"/hr/changes/{ev['id']}/decision", json={"approve": True}).json()
    assert first["status"] == "pending" and first["needs_second_approval"]
    assert world.post("receiving", f"/hr/changes/{ev['id']}/decision", json={"approve": True}).status_code == 403
    done = world.post("a_hr", f"/hr/changes/{ev['id']}/decision", json={"approve": True}).json()
    assert done["status"] == "approved"
    decision = docs(world.db, "HR-CHG-002")[0]
    assert decision.audience == "HR_INTERNAL" and "Internal Transfer Decision" in text_of(decision)
    letter = docs(world.db, "HR-CHG-007")[0]
    assert letter.status == "ISSUED" and "Your transfer to Operations" in text_of(letter)
    world.db.refresh(world.u["a_emp"])
    assert world.u["a_emp"].department_id != ops.id


def test_bulk_manager_change_preview_then_requests(world):
    activate(world.db, "HR-CHG-008")
    pv = world.post("a_hr", "/hr/changes/bulk-manager-change", json={"employee_ids": [world.u["a_emp"].id, world.u["a_emp2"].id],
                                                                     "new_manager_id": world.u["a_manager"].id,
                                                                     "effective_date": date.today().isoformat(), "preview": True}).json()
    assert pv["preview"] and all(x["outcome"] == "ALLOW" for x in pv["results"])
    made = world.post("a_hr", "/hr/changes/bulk-manager-change", json={"employee_ids": [world.u["a_emp2"].id],
                                                                       "new_manager_id": world.u["a_manager"].id,
                                                                       "effective_date": date.today().isoformat(), "preview": False}).json()
    world.post("a_admin", f"/hr/changes/{made['change_ids'][0]}/decision", json={"approve": True})
    t = text_of(docs(world.db, "HR-CHG-008")[0])
    assert "Your new manager" in t and "Morgan Lead" in t
    assert any(tpl == "reporting_line_changed.html" for (_, tpl, _c) in world.mail)


def test_mandatory_training_and_certification_records_and_expiry(world):
    for cid in ("HR-PRF-018", "HR-PRF-020"):
        activate(world.db, cid)
    from app.modules.hr import learning_documents
    course = LearningCourse(course_name="Information security", organization_id=1, is_mandatory=True, renewal_months=12, version="2026.1",
                            provider="Example Learning")
    world.db.add(course)
    world.db.commit()
    e = LearningEnrollment(course_id=course.id, employee_id=world.u["a_emp"].id, organization_id=1, status="completed", score=92)
    world.db.add(e)
    world.db.commit()
    learning_documents.on_enrollment_updated(world.db, e, world.u["a_hr"])
    world.db.refresh(e)
    t = text_of(world.db.get(GeneratedDocument, e.document_id))
    assert "Training Completion Record" in t and "Information security" in t and "92%" in t and e.expires_on
    cert = LearningCertification(employee_id=world.u["a_emp"].id, certification_name="First aid", issuing_organization="Example Council",
                                 issue_date=date.today() - timedelta(days=700), expiry_date=date.today() + timedelta(days=25),
                                 certificate_number="FA-99881234", organization_id=1)
    world.db.add(cert)
    world.db.commit()
    learning_documents.on_certification_saved(world.db, cert, world.u["a_hr"])
    world.db.refresh(cert)
    ct = text_of(world.db.get(GeneratedDocument, cert.document_id))
    assert "Certification Record — First aid" in ct and "••••1234" in ct and "FA-9988" not in ct
    res = learning_documents.expiry_job(world.db)
    assert res["reminders_sent"] == 1
    assert world.db.query(DocumentExpiryItem).filter_by(item_type="certification", ref_id=cert.id).count() == 1
    assert learning_documents.expiry_job(world.db)["reminders_sent"] == 0, "one reminder per threshold"
    old = cert.expiry_date
    cert.expiry_date = date.today() + timedelta(days=1100)
    world.db.commit()
    learning_documents.on_certification_saved(world.db, cert, world.u["a_hr"], renewed_from=old)
    world.db.refresh(cert)
    assert len(cert.renewal_history) == 1
