"""Release gate R4: the six end-to-end journeys of ZHR-ELT-TPL-001 Prompt 4 §D, through real endpoints, on the synthetic tenants
TENANT-A and TENANT-B. Each step checks the document it should produce; generation never changes HR state."""
from datetime import date, timedelta
from decimal import Decimal

from app.modules.assistant import retrieval_service
from app.modules.assistant.models import KnowledgeSource, KnowledgeStatus
from app.modules.doc_templates import hooks, preflight, service
from app.modules.doc_templates.models import DecisionReceipt, GeneratedDocument, JurisdictionPack, TemplateVariant
from app.modules.employee.models import Employee, EmployeeStatus, UserRole
from app.modules.hr.models import (Asset, EmployeeCompensation, LeaveRequest, OnboardingNewHire, PerformanceImprovementPlan,
                                   RecruitmentCandidate, RecruitmentInterview, RecruitmentRequisition, SalaryStructure)
from tests.doc_templates.conftest import BASIC_CONTENT, BASIC_FIELDS, BASIC_RULES, gen, make_clause, make_pack, make_variant, ready
from tests.doc_templates.p2_support import code, gb_pack, set_recruitment_privacy, signatory
from tests.doc_templates.p3_support import activate, docs, fake_embeddings, new_version, policy_settings, publish, text_of
from tests.privacy.support import _emp


def _ids(world, cid):
    return [(d.status, d.subject_id) for d in docs(world.db, cid)]


def test_journey_1_hire_to_confirmation(world, monkeypatch):
    fake_embeddings(monkeypatch)
    for cid in ("HR-HIR-001", "HR-ORG-005", "HR-HIR-004", "HR-HIR-006", "HR-HIR-007", "HR-HIR-011", "HR-HIR-019", "HR-ONB-001",
                "HR-ONB-003", "HR-ONB-017", "HR-POL-001", "HR-POL-002", "HR-ONB-010", "HR-ONB-011", "HR-ONB-015", "HR-ONB-004",
                "HR-ONB-022", "HR-ONB-007", "HR-ONB-020", "HR-PRF-002", "HR-PRF-004"):
        activate(world.db, cid)
    signatory(world)
    set_recruitment_privacy(world)
    policy_settings(world)
    # requisition authorised (HIR-001) and job description (ORG-005)
    req = world.post("a_hr", "/hr/recruitment/requisitions", json={"title": "Analyst", "department": "Operations", "status": "pending",
                                                                    "reason": "growth", "justification": "Demand doubled."}).json()
    world.put("a_admin", f"/hr/recruitment/requisitions/{req['id']}/approve")
    jd = world.post("a_hr", "/hr/workforce/job-descriptions", json={"title": "Analyst", "purpose": "Reporting", "key_responsibilities": ["Reports"],
                                                                     "requirements_essential": ["SQL"]}).json()
    world.post("a_hr", f"/hr/workforce/job-descriptions/{jd['id']}/submit")
    world.post("a_admin", f"/hr/workforce/job-descriptions/{jd['id']}/decision", json={"approve": True})
    # candidate privacy notice (HIR-004), interview record and scorecard (HIR-006/007)
    cand = world.post("a_hr", "/hr/recruitment/candidates", json={"name": "Jordan Journey", "email": "jordan.journey@example.com",
                                                                   "position": "Analyst"}).json()
    r = world.db.get(RecruitmentRequisition, req["id"])
    r.scorecard_criteria = [{"key": "sql", "label": "SQL", "weight": 1}]
    c = world.db.get(RecruitmentCandidate, cand["id"])
    c.requisition_id = r.id
    iv = RecruitmentInterview(candidate_id=c.id, candidate_name=c.name, position="Analyst", interview_date=date.today(), organization_id=1,
                              interviewer_id=world.u["a_manager"].id, interview_type="video")
    world.db.add(iv)
    world.db.commit()
    world.post("a_manager", f"/hr/recruitment/interviews/{iv.id}/scorecard",
               json={"scores": [{"criterion_key": "sql", "score": 4, "evidence": "Correct join."}], "recommendation": "proceed"})
    # conditional offer approved by someone else, issued, signed by the candidate, acceptance acknowledged (HIR-011, HIR-019)
    o = world.post("a_hr", "/hr/recruitment/offers", json={
        "candidate_id": c.id, "candidate_name": c.name, "position": "Analyst", "salary": 42000, "currency": "GBP", "pay_period": "annual",
        "employment_type": "full_time", "work_country": "GB", "joining_date": date.today().isoformat(),
        "conditions": [{"type": "reference_check", "description": "Two references", "due_by": (date.today() + timedelta(days=5)).isoformat()}]}).json()
    world.post("a_admin", f"/hr/recruitment/offers/{o['id']}/approve", json={"comment": "ok"})
    world.post("a_hr", f"/hr/recruitment/offers/{o['id']}/letter")
    world.post("a_hr", f"/hr/recruitment/offers/{o['id']}/letter/issue")
    token = [x for (_, t, x) in world.mail if t == "candidate_document_sign.html"][-1]["action_url"].rsplit("/", 1)[1]
    view = world.client.get(f"/public/documents/sign/{token}").json()
    world.client.post(f"/public/documents/sign/{token}/otp")
    signed = world.client.post(f"/public/documents/sign/{token}/sign", json={"typed_name": "Jordan Journey",
                                                                            "consent_version": view["consent"]["version"], "otp_code": code(world)})
    assert signed.json()["status"] == "EXECUTED"
    # onboarding forms submitted in the portal and verified (ONB-001/003/017)
    hire = world.db.query(OnboardingNewHire).filter_by(email="jordan.journey@example.com").one()
    hire.manager_id = world.u["a_manager"].id
    world.db.commit()
    from app.modules.hr import onboarding_flow
    ptoken = onboarding_flow.issue_portal_link(world.db, hire, send=False)["url"].rsplit("/", 1)[1]
    personal = {"legal_first_name": "Jordan", "legal_last_name": "Journey", "date_of_birth": "1994-02-01", "personal_email": "jj@example.com",
                "mobile_phone": "+44 7700 900111", "address_line1": "1 Road", "city": "Leeds", "postal_code": "LS1 1AA", "country": "United Kingdom"}
    subs = [world.client.post(f"/public/onboarding/{ptoken}/forms/HR-ONB-001/submit", json={"values": personal, "declaration_accepted": True}).json(),
            world.client.post(f"/public/onboarding/{ptoken}/forms/HR-ONB-003/submit", json={"values": {"contact1_name": "Pat", "contact1_relationship": "Parent",
                                                                                              "contact1_phone": "+44 7700 900222"}, "declaration_accepted": True}).json(),
            world.client.post(f"/public/onboarding/{ptoken}/forms/HR-ONB-017/submit", json={"values": {
                "account_holder": "Jordan Journey", "bank_name": "Example Bank", "account_number": "GB29NWBK60161331926819", "routing_code": "601613"},
                "declaration_accepted": True}).json()]
    world.put("a_admin", "/hr/onboarding/finance-viewers", json={"employee_ids": [world.u["a_hr2"].id]})
    for s in subs[:2]:
        assert world.post("a_hr", f"/hr/onboarding/forms/{s['id']}/verify").json()["status"] == "VERIFIED"
    assert world.post("a_hr2", f"/hr/onboarding/forms/{subs[2]['id']}/verify").json()["status"] == "VERIFIED"
    # onboarding closed (ONB-004/022): the employee record now exists
    hire.status = "in_progress"
    world.db.commit()
    assert world.put("a_hr", f"/hr/onboarding/new-hires/{hire.id}", json={"status": "completed", "force_complete": True}).status_code == 200
    world.db.refresh(hire)
    emp = world.db.get(Employee, hire.employee_id)
    emp.is_active, emp.status, emp.date_of_joining = True, EmployeeStatus.ACTIVE, date.today()
    world.db.commit()
    world.u["new"] = emp
    # handbook and code of conduct published, acknowledgement letters (ONB-010/011)
    for cid in ("HR-POL-001", "HR-POL-002"):
        publish(world, cid, {"type": "employees", "ids": [emp.id]})
    # equipment (ONB-015), commencement (ONB-007), probation schedule (ONB-020)
    a = Asset(name="Laptop", asset_tag="AT-J1", serial_number="SNJ1", organization_id=1, category="IT")
    world.db.add(a)
    world.db.commit()
    from app.modules.hr import asset_service, onboarding_documents
    asset_service.assign_asset(world.db, a.id, emp.id, world.u["a_hr"].id, organization_id=1)
    onboarding_documents.commencement_job(world.db)
    world.post("a_hr", f"/hr/onboarding/probation/{emp.id}", json={"start_date": (date.today() - timedelta(days=150)).isoformat(),
                                                                   "end_date": (date.today() + timedelta(days=30)).isoformat(),
                                                                   "reviewer_id": world.u["a_manager"].id,
                                                                   "review_dates": [{"label": "Final review", "date": date.today().isoformat()}]})
    # probation review (PRF-002) and confirmation (PRF-004)
    rv = world.post("a_manager", "/hr/performance-documents/probation-reviews",
                    json={"employee_id": emp.id, "recommendation": "recommend_confirm", "strengths": "Reliable"}).json()
    world.post("new", f"/hr/me/performance/probation-reviews/{rv['id']}/comments", json={"comments": "Thank you."})
    ev = world.post("a_manager", f"/hr/performance-documents/probation/{emp.id}/outcome", json={"kind": "confirmation",
                                                                                                "review_id": rv["id"]}).json()
    world.post("a_hr", f"/hr/changes/{ev['id']}/decision", json={"approve": True})

    expected = ["HR-HIR-001", "HR-ORG-005", "HR-HIR-004", "HR-HIR-006", "HR-HIR-007", "HR-HIR-011", "HR-HIR-019", "HR-ONB-001",
                "HR-ONB-003", "HR-ONB-017", "HR-ONB-004", "HR-ONB-022", "HR-POL-001", "HR-POL-002", "HR-ONB-010", "HR-ONB-011",
                "HR-ONB-015", "HR-ONB-007", "HR-ONB-020", "HR-PRF-002", "HR-PRF-004"]
    produced = {d.canonical_id for d in world.db.query(GeneratedDocument).all()}
    assert set(expected) <= produced, sorted(set(expected) - produced)
    assert "Confirmation of your employment" in text_of(docs(world.db, "HR-PRF-004")[0])
    world.db.refresh(emp)
    assert emp.confirmation_date is None, "the letter communicates the decision; HR completes the change separately"


def test_journey_2_policy_rollout_to_500_with_reacknowledgement_and_mira(world, monkeypatch):
    fake_embeddings(monkeypatch)
    from app.modules.doc_templates import distribution
    monkeypatch.setattr(distribution, "BULK_INLINE", True)
    monkeypatch.setattr(distribution, "SESSION_FACTORY", lambda: world.db)
    policy_settings(world, leave_year_label="1 January to 31 December", annual_leave_notice_days=14)
    v1 = activate(world.db, "HR-POL-025")
    from app.modules.hr.models import Department
    dept = Department(name="Field", code="FLD", organization_id=1)
    world.db.add(dept)
    world.db.commit()
    rows = [Employee(email=f"field{i}@tenant-a.example.com", hashed_password="x", employee_code=f"F-{i}", role=UserRole.EMPLOYEE,
                     first_name="Field", last_name=str(i), job_title="t", employment_type="full_time", status=EmployeeStatus.ACTIVE,
                     date_of_joining=date.today(), organization_id=1, is_active=True, email_verified=True, work_country="GB",
                     employing_entity_id=1, department_id=dept.id) for i in range(500)]
    world.db.add_all(rows)
    world.db.commit()
    out = publish(world, "HR-POL-025", {"type": "departments", "ids": [dept.id]})
    assert out["published"] and out["ready"] == 500
    first = docs(world.db, "HR-POL-025")
    assert len(first) == 500 and all(d.status == "ISSUED" for d in first)
    for d in first[:3]:
        world.u[f"f{d.subject_id}"] = world.db.get(Employee, d.subject_id)
        assert world.post(f"f{d.subject_id}", f"/hr/me/generated-documents/{d.id}/acknowledge", json={"text_version": "ACK-1.0"}).status_code == 200
    v2 = new_version(world.db, v1, summary="Carry-over rules clarified.")
    hooks.send(world.db, "variant_released", world.u["a_admin"], v2, v1)
    from app.modules.doc_templates.models import PolicyDistribution
    draft = world.db.query(PolicyDistribution).filter_by(canonical_id="HR-POL-025", status="DRAFT").one()
    world.post("a_hr", f"/hr/policy-distributions/{draft.id}/publish", json={"confirm_partial": False})
    assert sum(1 for d in docs(world.db, "HR-POL-025") if d.variant_version == 2) == 500, "everyone re-acknowledges a material change"
    live = world.db.query(KnowledgeSource).filter_by(policy_canonical_id="HR-POL-025", status=KnowledgeStatus.PUBLISHED).all()
    assert [s.title for s in live] == ["Annual Leave Policy (version 2)"]
    eligible = set(retrieval_service.eligible_version_ids(world.db, 1, employee=rows[0]))
    assert {v.id for v in live[0].versions} <= eligible
    assert not eligible & {v.id for s in world.db.query(KnowledgeSource).filter_by(policy_canonical_id="HR-POL-025", policy_version=1) for v in s.versions}


def test_journey_3_promotion_with_pay_rise(world):
    for cid in ("HR-CMP-005", "HR-CHG-004"):
        activate(world.db, cid)
    s = SalaryStructure(name="Standard", organization_id=1)
    world.db.add(s)
    world.db.commit()
    world.db.add(EmployeeCompensation(employee_id=world.u["a_emp"].id, structure_id=s.id, effective_date=date.today() - timedelta(days=200),
                                      base_amount=Decimal("42000"), currency="GBP", pay_period="annual", organization_id=1))
    world.u["a_emp"].job_title = "Analyst"
    world.db.commit()
    rev = world.post("a_hr", "/hr/compensation-documents/revisions", json={"employee_id": world.u["a_emp"].id, "new_salary": "46000",
                                                                         "effective_date": date.today().isoformat(), "revision_type": "promotion"}).json()
    world.post("a_hr", f"/hr/compensation-documents/revisions/{rev['id']}/submit")
    world.post("a_admin", f"/hr/compensation-documents/revisions/{rev['id']}/decision", json={"approve": True})
    assert docs(world.db, "HR-CMP-005")[0].status == "ISSUED"
    ev = world.post("a_manager", "/hr/changes", json={"employee_id": world.u["a_emp"].id, "event_type": "promotion",
                                                      "effective_date": date.today().isoformat(), "new_value": {"title": "Senior Analyst"},
                                                      "linked_salary_revision_id": rev["id"]}).json()
    world.post("a_hr", f"/hr/changes/{ev['id']}/decision", json={"approve": True})
    letter = docs(world.db, "HR-CHG-004")[0]
    assert letter.sensitivity == "C3" and "46,000.00 GBP" in text_of(letter)
    assert world.get("a_manager", f"/hr/generated-documents/{letter.id}").status_code == 404
    assert world.get("b_hr", f"/hr/generated-documents/{letter.id}").status_code == 404, "never another tenant"


def test_journey_4_leave_and_time(world):
    for cid in ("HR-LEV-001", "HR-LEV-018", "HR-LEV-003", "HR-TIM-007", "HR-TIM-013", "HR-TIM-003", "HR-TIM-004"):
        activate(world.db, cid)
    start = date.today() + timedelta(days=10)
    a = world.post("a_emp", "/hr/leaves", json={"leave_type": "annual", "start_date": start.isoformat(), "end_date": start.isoformat(),
                                                "reason": "Family holiday booked"}).json()
    world.put("a_hr", f"/hr/leaves/{a['id']}/review", json={"status": "approved"})
    b = world.post("a_emp", "/hr/leaves", json={"leave_type": "annual", "start_date": (start + timedelta(days=7)).isoformat(),
                                                "end_date": (start + timedelta(days=7)).isoformat(), "reason": "Another short break"}).json()
    world.put("a_hr", f"/hr/leaves/{b['id']}/review", json={"status": "rejected", "decision_reason": "Cover"})
    world.post("a_emp", "/hr/leaves", json={"leave_type": "sick", "start_date": date.today().isoformat(), "end_date": date.today().isoformat(),
                                            "reason": "CANARY-J4-FLU"})
    assert all("CANARY-J4-FLU" not in text_of(d) for d in docs(world.db, "HR-LEV-003"))
    day = date.today() - timedelta(days=1)
    ot = world.post("a_emp", "/hr/time/overtime", json={"date": day.isoformat(), "start_time": "17:00", "end_time": "18:00", "reason": "Close"}).json()
    world.post("a_manager", f"/hr/time/overtime/{ot['id']}/decision", json={"approve": True})
    cr = world.post("a_emp", "/hr/time/corrections", json={"date": day.isoformat(), "requested_check_in": "09:00", "requested_check_out": "17:00",
                                                           "reason": "forgot", "confirm_accurate": True}).json()
    world.post("a_manager", f"/hr/time/corrections/{cr['id']}/decision", json={"approve": True})
    from app.modules.hr.models import Shift
    s1 = Shift(name="Early", start_time="06:00", end_time="14:00", organization_id=1)
    s2 = Shift(name="Late", start_time="14:00", end_time="22:00", organization_id=1)
    world.db.add_all([s1, s2])
    world.db.commit()
    world.post("a_hr", "/hr/time/rosters/publish", json={"shift_id": s1.id, "employee_ids": [world.u["a_emp"].id],
                                                         "start_date": (date.today() + timedelta(days=14)).isoformat()})
    world.post("a_hr", "/hr/time/rosters/change", json={"employee_id": world.u["a_emp"].id, "new_shift_id": s2.id,
                                                        "dates": [(date.today() + timedelta(days=15)).isoformat()], "reason": "Cover"})
    for cid in ("HR-LEV-001", "HR-LEV-018", "HR-LEV-003", "HR-TIM-007", "HR-TIM-013", "HR-TIM-003", "HR-TIM-004"):
        assert docs(world.db, cid), cid


def test_journey_5_fail_closed(world):
    pack, v = ready(world.db)
    world.u["b_emp"].work_country = "FR"
    world.db.commit()
    r = preflight.run_preflight(world.db, organization_id=2, actor=world.u["b_hr"], canonical_id="HR-ONB-007", subject_type="employee",
                                subject_id=world.u["b_emp"].id)
    assert "NO_ACTIVE_PACK" in r.reasons, "no pack for the work country: nothing can be generated"
    ie = make_pack(world.db, "IE")
    make_clause(world.db, ie)
    make_variant(world.db, "HR-ONB-007", ie)
    world.u["a_emp2"].work_country = "IE"
    world.db.commit()
    r = preflight.run_preflight(world.db, organization_id=1, actor=world.u["a_hr"], canonical_id="HR-ONB-007", subject_type="employee",
                                subject_id=world.u["a_emp2"].id)
    assert "CROSS_BORDER_UNRESOLVED" in r.reasons, "employer in GB, work in IE, no cross-border variant"
    issued = gen(world).json()
    world.post("a_hr", f"/hr/generated-documents/{issued['id']}/issue")
    before = world.db.get(GeneratedDocument, issued["id"]).pdf_sha256
    draft = gen(world).json()
    assert world.post("platform", f"/super-admin/doc-templates/variants/{v.id}/suspend", json={"reason": "Wording under review"}).status_code == 200
    assert world.post("a_hr", f"/hr/generated-documents/{draft['id']}/issue").status_code == 409, "suspended variant blocks drafts"
    assert gen(world).status_code == 422
    assert world.db.get(GeneratedDocument, issued["id"]).pdf_sha256 == before, "issued documents are unchanged"
    from app.modules.doc_templates.models import TemplateClause
    world.db.query(TemplateClause).delete()
    world.db.commit()
    make_variant(world.db, "HR-ONB-007", pack, version=2)
    assert "CLAUSE_UNRESOLVED:notice_and_termination" in gen(world).json()["detail"]["reasons"]


def test_journey_6_unsuccessful_probation(world):
    activate(world.db, "HR-PRF-005")
    signatory(world)
    from app.modules.hr.onboarding_documents import create_probation
    create_probation(world.db, world.u["a_hr"], world.u["a_emp"], {"start_date": date.today() - timedelta(days=90),
                                                                   "end_date": date.today() + timedelta(days=90)})
    world.post("a_manager", "/hr/performance-documents/probation-reviews", json={
        "employee_id": world.u["a_emp"].id, "recommendation": "recommend_end", "concerns": "Objectives not met", "support_agreed": "Coaching"})
    body = {"kind": "probation_end", "final_meeting_date": date.today().isoformat(), "decision_reasons": "The objectives were not met.",
            "checklist": {}}
    blocked = world.post("a_manager", f"/hr/performance-documents/probation/{world.u['a_emp'].id}/outcome", json=body).json()
    world.post("a_hr", f"/hr/changes/{blocked['id']}/decision", json={"approve": True})
    assert any(r.startswith("PROBATION_CHECKLIST_INCOMPLETE") for r in
               world.db.query(DecisionReceipt).filter_by(source_ref=f"employee_lifecycle:{blocked['id']}").one().reasons)
    body["checklist"] = {"response_opportunity_date": date.today().isoformat(), "adjustments": "yes", "hr_reviewed_by": world.u["a_hr"].id,
                         "hr_reviewed_on": date.today().isoformat()}
    ev = world.post("a_manager", f"/hr/performance-documents/probation/{world.u['a_emp'].id}/outcome", json=body).json()
    world.post("a_hr", f"/hr/changes/{ev['id']}/decision", json={"approve": True})
    doc = docs(world.db, "HR-PRF-005")[0]
    assert doc.status == "PENDING_APPROVAL"
    service.approve(world.db, doc, world.u["a_signer"], None)
    service.issue(world.db, doc, world.u["a_hr"])
    approvers = {world.u["a_manager"].id, world.u["a_hr"].id, world.u["a_signer"].id}
    assert doc.status == "ISSUED" and len(approvers) == 3 and doc.requested_by == world.u["a_manager"].id
    world.db.refresh(world.u["a_emp"])
    assert world.u["a_emp"].status == EmployeeStatus.ACTIVE and world.u["a_emp"].is_active
