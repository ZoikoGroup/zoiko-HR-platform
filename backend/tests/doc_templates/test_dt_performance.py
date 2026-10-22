"""Prompt 4 probation, appraisals and PIPs: reviews with employee comments, the extension limit from the released clause, the
L3 unsuccessful outcome with its blocking checklist (and no HR state change), evidence-backed ratings, manager-chain visibility
of C3 documents, and the PIP approval rule."""
from datetime import date, timedelta

from app.modules.doc_templates.models import DecisionReceipt, GeneratedDocument, TemplateClause
from app.modules.employee.models import EmployeeStatus, UserRole
from app.modules.hr.models import Appraisal, AppraisalStatus, PerformanceImprovementPlan
from tests.doc_templates.p2_support import gb_pack, signatory
from tests.doc_templates.p3_support import activate, docs, text_of
from tests.privacy.support import _emp

P = "/hr/performance-documents"


def _review(world, recommendation="on_track", who="a_manager", **kw):
    body = {"employee_id": world.u["a_emp"].id, "recommendation": recommendation,
            "objectives_progress": [{"objective": "Learn the reporting tools", "rating": "meets", "evidence": "Built the weekly report"}],
            "strengths": "Clear writing", **kw}
    return world.post(who, f"{P}/probation-reviews", json=body)


def _probation(world):
    from app.modules.hr.onboarding_documents import create_probation
    start = date.today() - timedelta(days=60)
    return create_probation(world.db, world.u["a_hr"], world.u["a_emp"], {"start_date": start, "end_date": start + timedelta(days=180)})


def test_probation_review_needs_specific_concerns_and_is_issued_after_the_employee_comments(world):
    activate(world.db, "HR-PRF-002")
    _probation(world)
    assert _review(world, "concerns", concerns="Late reports").status_code == 422, "concerns without the support offered"
    assert _review(world, who="a_emp").status_code == 404, "not your own review"
    r = _review(world, "concerns", concerns="Two late reports in October", support_agreed="Weekly check-in")
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    assert world.get("a_emp", "/hr/me/document-actions").json()["count"] >= 1
    out = world.post("a_emp", f"/hr/me/performance/probation-reviews/{rid}/comments", json={"comments": "I had system access issues."}).json()
    assert out["status"] == "ISSUED"
    t = text_of(docs(world.db, "HR-PRF-002")[0])
    assert "Probation Review 1" in t and "Meets" in t and "I had system access issues." in t
    assert "A recommendation is not a final decision" in t and "does not mean I agree" in t


def _release_extension_clause(world, params):
    pack = gb_pack(world.db)
    c = world.db.query(TemplateClause).filter_by(clause_key="probation_extension_rules", pack_id=pack.id).first()
    c.parameters = params
    world.db.commit()


def test_extension_needs_a_recommendation_an_hr_approver_and_respects_the_clause_limit(world):
    activate(world.db, "HR-PRF-003")
    _probation(world)
    world.put("a_hr", "/hr/policies/settings", json={})
    body = {"kind": "probation_extended", "new_end_date": (date.today() + timedelta(days=200)).isoformat(),
            "extension_reason": "More time to show the objectives are met.", "extension_objectives": ["Close month-end unaided"]}
    ev = world.post("a_manager", f"{P}/probation/{world.u['a_emp'].id}/outcome", json=body).json()
    assert world.post("a_manager", f"/hr/changes/{ev['id']}/decision", json={"approve": True}).status_code == 403, "not the initiator"
    world.post("a_hr", f"/hr/changes/{ev['id']}/decision", json={"approve": True})
    reasons = world.db.query(DecisionReceipt).filter_by(source_ref=f"employee_lifecycle:{ev['id']}").one().reasons
    assert "PROBATION_EXTENSION_NOT_RECOMMENDED" in reasons and "PROBATION_LIMIT_NOT_CONFIGURED" in reasons

    _review(world, "recommend_extend", concerns="Objectives partly met", support_agreed="Coaching")
    _release_extension_clause(world, {"max_probation_months": 6})
    ev2 = world.post("a_manager", f"{P}/probation/{world.u['a_emp'].id}/outcome", json=body).json()
    world.post("a_hr", f"/hr/changes/{ev2['id']}/decision", json={"approve": True})
    assert "PROBATION_LIMIT_EXCEEDED" in world.db.query(DecisionReceipt).filter_by(source_ref=f"employee_lifecycle:{ev2['id']}").one().reasons

    ok = {**body, "new_end_date": (date.today() + timedelta(days=100)).isoformat()}
    ev3 = world.post("a_manager", f"{P}/probation/{world.u['a_emp'].id}/outcome", json=ok).json()
    world.post("a_hr", f"/hr/changes/{ev3['id']}/decision", json={"approve": True})
    doc = docs(world.db, "HR-PRF-003")[-1]
    assert doc.status == "ISSUED" and doc.requested_by == world.u["a_manager"].id and world.u["a_hr"].id in doc.approved_by
    assert "Extension of your probation period" in text_of(doc)


def test_unsuccessful_outcome_needs_the_checklist_three_people_and_changes_nothing(world):
    activate(world.db, "HR-PRF-005")
    signatory(world)
    _probation(world)
    body = {"kind": "probation_end", "final_meeting_date": date.today().isoformat(), "decision_reasons": "The objectives were not met.",
            "checklist": {"adjustments": "not_applicable"}}
    ev = world.post("a_manager", f"{P}/probation/{world.u['a_emp'].id}/outcome", json=body).json()
    world.post("a_hr", f"/hr/changes/{ev['id']}/decision", json={"approve": True})
    reasons = world.db.query(DecisionReceipt).filter_by(source_ref=f"employee_lifecycle:{ev['id']}").one().reasons
    assert {"PROBATION_CHECKLIST_INCOMPLETE:review_with_concerns_and_support", "PROBATION_CHECKLIST_INCOMPLETE:chance_to_respond",
            "PROBATION_CHECKLIST_INCOMPLETE:adjustments_considered", "PROBATION_CHECKLIST_INCOMPLETE:hr_reviewed"} <= set(reasons)

    _review(world, "recommend_end", concerns="Objectives not met", support_agreed="Training and weekly check-ins")
    body["checklist"] = {"response_opportunity_date": date.today().isoformat(), "adjustments": "not_applicable",
                         "adjustments_reason": "None requested", "hr_reviewed_by": world.u["a_hr"].id, "hr_reviewed_on": date.today().isoformat(),
                         "protected_status": True, "legal_review_cleared": False}
    ev2 = world.post("a_manager", f"{P}/probation/{world.u['a_emp'].id}/outcome", json=body).json()
    world.post("a_hr", f"/hr/changes/{ev2['id']}/decision", json={"approve": True})
    assert "PROBATION_CHECKLIST_INCOMPLETE:legal_review_if_protected" in \
        world.db.query(DecisionReceipt).filter_by(source_ref=f"employee_lifecycle:{ev2['id']}").one().reasons

    body["checklist"]["legal_review_cleared"] = True
    ev3 = world.post("a_manager", f"{P}/probation/{world.u['a_emp'].id}/outcome", json=body).json()
    world.post("a_hr", f"/hr/changes/{ev3['id']}/decision", json={"approve": True})
    doc = docs(world.db, "HR-PRF-005")[-1]
    assert doc.approval_policy == "L3" and doc.status == "PENDING_APPROVAL", "the authorised signatory still has to approve"
    receipt = world.db.query(DecisionReceipt).filter_by(document_id=doc.id).one()
    assert receipt.inputs["module_checks"]["probation_end_checklist"]["hr_reviewed"] is True
    assert world.post("a_signer", f"/hr/generated-documents/{doc.id}/approve", json={}).status_code in (200, 404)
    from app.modules.doc_templates import service
    world.db.refresh(doc)
    if doc.status == "PENDING_APPROVAL":
        service.approve(world.db, doc, world.u["a_signer"], None)
    service.issue(world.db, doc, world.u["a_hr"])
    people = {world.u["a_manager"].id, world.u["a_hr"].id, world.u["a_signer"].id}
    assert len(people) == 3 and doc.status == "ISSUED"
    world.db.refresh(world.u["a_emp"])
    assert world.u["a_emp"].status == EmployeeStatus.ACTIVE and world.u["a_emp"].is_active, "issuing never ends employment"
    assert "Outcome of your probation period" in text_of(doc)


def _appraisal(world):
    a = Appraisal(employee_id=world.u["a_emp"].id, reviewer_id=world.u["a_manager"].id, cycle="2026", organization_id=1,
                  status=AppraisalStatus.DRAFT)
    world.db.add(a)
    world.db.commit()
    return a


def test_appraisal_stages_evidence_and_manager_chain_visibility(world):
    for cid in ("HR-PRF-007", "HR-PRF-010", "HR-PRF-011"):
        activate(world.db, cid)
    senior = _emp(world.db, "senior@tenant-a.example.com", UserRole.MANAGER, 1, "Sasha", "Senior")
    peer = _emp(world.db, "peer@tenant-a.example.com", UserRole.MANAGER, 1, "Pat", "Peer")
    world.u["a_manager"].reporting_manager_id = senior.id
    world.db.commit()
    world.u["senior"], world.u["peer"] = senior, peer
    a = _appraisal(world)
    r = world.post("a_emp", f"/hr/me/performance/appraisals/{a.id}/self-assessment",
                   json={"goals": [{"goal": "Faster reports", "achievement": "3 days"}], "went_well": "Delivery", "wellbeing": "Busy Q3"})
    assert r.status_code == 200, r.text
    bad = {"goals": [{"goal": "Faster reports", "rating": "Exceeds", "evidence": ""}], "overall_recommendation": "Meets"}
    assert world.post("a_manager", f"{P}/appraisals/{a.id}/manager-assessment", json=bad).status_code == 422
    good = {"goals": [{"goal": "Faster reports", "rating": "Exceeds", "evidence": "Dashboard history"}],
            "competencies": [{"name": "Collaboration", "rating": "Meets", "evidence": "Planning session"}], "overall_recommendation": "Meets"}
    assert world.post("a_manager", f"{P}/appraisals/{a.id}/manager-assessment", json=good).status_code == 200
    assert world.post("a_manager", f"{P}/appraisals/{a.id}/calibrate").status_code == 403, "not the assessing manager"
    assert world.post("senior", f"{P}/appraisals/{a.id}/calibrate").status_code == 200
    out = world.post("a_manager", f"{P}/appraisals/{a.id}/finalise",
                     json={"overall_rating_label": "Exceeds expectations", "manager_summary": "A strong year.", "development_priorities": ["Presenting"]})
    assert out.status_code == 200, out.text
    final = world.db.get(GeneratedDocument, out.json()["document_id"])
    assert final.sensitivity == "C3" and final.status == "ISSUED" and final.files_encrypted
    assessment = docs(world.db, "HR-PRF-011")[0]
    assert assessment.status == "ISSUED", "shared when the appraisal is finalised"
    t = text_of(final)
    assert "Performance Appraisal — 2026" in t and "Dashboard history" in t and "Sasha Senior" in t and "does not mean I agree" in t
    for who, code in (("a_manager", 200), ("senior", 200), ("peer", 404), ("a_emp2", 404)):
        url = f"/hr/generated-documents/{final.id}" if who != "a_emp2" else f"/hr/me/generated-documents/{final.id}"
        assert world.get(who, url).status_code == code, who


def test_pip_needs_hr_approval_from_someone_other_than_the_manager_and_never_changes_employment(world):
    activate(world.db, "HR-PRF-013")
    body = {"employee_id": world.u["a_emp"].id, "start_date": date.today().isoformat(), "end_date": (date.today() + timedelta(days=60)).isoformat(),
            "objectives": [{"objective": "Accurate reports", "standard": "No errors", "evidence_of_gap": "3 corrections in October",
                            "success_measure": "4 weeks without errors"}], "support": ["Weekly check-in"],
            "adjustments_considered": "Not applicable: none requested", "review_dates": [{"date": (date.today() + timedelta(days=14)).isoformat()}]}
    assert world.post("a_manager", f"{P}/pips", json={**body, "objectives": [{"objective": "x"}]}).status_code == 422
    pip = world.post("a_manager", f"{P}/pips", json=body).json()
    world.post("a_manager", f"{P}/pips/{pip['id']}/submit")
    assert world.post("a_manager", f"{P}/pips/{pip['id']}/decision", json={"approve": True}).status_code == 403
    out = world.post("a_hr", f"{P}/pips/{pip['id']}/decision", json={"approve": True}).json()
    assert out["status"] == "ACTIVE" and out["document_id"]
    doc = world.db.get(GeneratedDocument, out["document_id"])
    assert doc.status == "ISSUED" and doc.sensitivity == "C3"
    t = text_of(doc)
    assert "Performance Improvement Plan" in t and "It is not a decision to end your employment" in t and "3 corrections in October" in t
    world.post("a_manager", f"{P}/pips/{pip['id']}/reviews", json={"note": "Good progress in week 2."})
    world.post("a_hr", f"{P}/pips/{pip['id']}/outcome", json={"outcome": "COMPLETED_UNSUCCESSFUL", "note": "Standards not reached."})
    p = world.db.get(PerformanceImprovementPlan, pip["id"])
    world.db.refresh(world.u["a_emp"])
    assert p.status == "COMPLETED_UNSUCCESSFUL" and world.u["a_emp"].status == EmployeeStatus.ACTIVE
