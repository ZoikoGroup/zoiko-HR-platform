"""Prompt 2 recruitment: offer letters through the engine end to end, template selection, amendment, withdrawal, records,
privacy notices, rejections, scorecards."""
import pathlib
import re
from datetime import date, timedelta

import pytest

from app.modules.doc_templates import renderer, storage
from app.modules.doc_templates.models import DecisionReceipt, DocumentSignature, GeneratedDocument
from app.modules.hr.models import (OfferStatus, OnboardingNewHire, RecruitmentCandidate, RecruitmentInterview, RecruitmentOffer,
                                   RecruitmentRequisition)
from tests.doc_templates.p2_support import activate, code, set_recruitment_privacy, signatory

FRONTEND = pathlib.Path(__file__).resolve().parents[3] / "frontend" / "src"
BACKEND = pathlib.Path(__file__).resolve().parents[2] / "app"


def _candidate(world, name="Casey Candidate", email="casey.candidate@example.com"):
    c = RecruitmentCandidate(name=name, email=email, position="Analyst", organization_id=1)
    world.db.add(c)
    world.db.commit()
    return c


def _offer(world, cand, **kw):
    body = {"candidate_id": cand.id, "candidate_name": cand.name, "position": "Analyst", "salary": 42000, "currency": "GBP",
            "pay_period": "annual", "employment_type": "full_time", "work_country": "GB", "joining_date": (date.today() + timedelta(days=30)).isoformat(),
            "conditions": [{"type": "reference_check", "description": "Two satisfactory references", "due_by": (date.today() + timedelta(days=20)).isoformat()}],
            **kw}
    r = world.post("a_hr", "/hr/recruitment/offers", json=body)
    assert r.status_code in (200, 201), r.text
    return r.json()


def _ready_offer(world, template="HR-HIR-011", **kw):
    signatory(world)
    activate(world.db, template)
    activate(world.db, "HR-HIR-019")
    cand = _candidate(world)
    o = _offer(world, cand, **kw)
    return cand, o


def _issue(world, o):
    assert world.post("a_hr", f"/hr/recruitment/offers/{o['id']}/approve", json={}).status_code == 403, "the author cannot approve"
    assert world.post("a_admin", f"/hr/recruitment/offers/{o['id']}/approve", json={"comment": "ok"}).status_code == 200
    r = world.post("a_hr", f"/hr/recruitment/offers/{o['id']}/letter")
    assert r.status_code == 201, r.text
    letter = r.json()["letter"]
    assert letter["status"] == "HUMAN_APPROVED", "the offer approval (by someone else) satisfies the engine's L2 step"
    r = world.post("a_hr", f"/hr/recruitment/offers/{o['id']}/letter/issue")
    assert r.status_code == 200, r.text
    view = r.json()
    assert view["status"] == "pending" and view["letter"]["status"] == "ISSUED"
    token = [c for (_, t, c) in world.mail if t == "candidate_document_sign.html"][-1]["action_url"].rsplit("/", 1)[1]
    return view["letter"], token


def _sign(world, token, name="Casey Candidate"):
    view = world.client.get(f"/public/documents/sign/{token}").json()
    world.client.post(f"/public/documents/sign/{token}/otp")
    r = world.client.post(f"/public/documents/sign/{token}/sign",
                          json={"typed_name": name, "consent_version": view["consent"]["version"], "otp_code": code(world)})
    assert r.status_code == 200, r.text
    return r.json()


# ── template selection ───────────────────────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("kind,conditions,expected", [
    ("internship", None, "HR-HIR-014"), ("contract", None, "HR-HIR-015"), ("part_time", None, "HR-HIR-016"),
    ("full_time", [{"type": "other", "description": "x"}], "HR-HIR-011"), ("full_time", None, "HR-HIR-012"),
    ("full_time", [{"type": "other", "description": "x", "status": "cleared"}], "HR-HIR-012"), ("freelance", None, None)])
def test_template_selection_rule(kind, conditions, expected):
    from app.modules.hr.recruitment_documents import select_offer_template
    o = RecruitmentOffer(employment_type=kind, conditions=conditions)
    cid, blocked = select_offer_template(o)
    assert cid == expected
    if kind == "freelance":
        assert blocked == "Contractor engagement letters are not available yet."
    assert select_offer_template(RecruitmentOffer(employment_type="full_time", amends_offer_id=3))[0] == "HR-HIR-017"


def test_legacy_stipend_offer_uses_the_internship_template():
    from app.modules.hr.recruitment_documents import select_offer_template
    cid, blocked = select_offer_template(RecruitmentOffer(employment_type=None, remuneration_type="stipend"))
    assert (cid, blocked) == ("HR-HIR-014", None)


# ── the offer flow ───────────────────────────────────────────────────────────────────────────────────────────────────

def test_offer_end_to_end_generate_approve_issue_sign_accept_onboard(world):
    cand, o = _ready_offer(world)
    pre = world.get("a_hr", f"/hr/recruitment/offers/{o['id']}/letter/preflight").json()
    assert pre["canonical_id"] == "HR-HIR-011" and pre["preflight"]["outcome"] == "ALLOW"
    assert world.post("a_hr", f"/hr/recruitment/offers/{o['id']}/letter").status_code == 409, "must be approved first"
    letter, token = _issue(world, o)
    row = world.db.get(GeneratedDocument, letter["id"])
    text = " ".join(renderer.pdf_text(storage.get_store().get(row.pdf_path)).split())
    for expected in ("Conditional offer of employment", "Dear Casey", "Two satisfactory references", "GBP", "42,000.00",
                     "Dana Director, Director - authorised signatory for Tenant A Employer Ltd",
                     "Each condition must be satisfied before your employment starts"):
        assert expected in text, expected
    assert world.put("a_hr", f"/hr/recruitment/offers/{o['id']}", json={"salary": 1}).status_code == 400, "issued: amend, don't edit"
    assert world.put("a_hr", f"/hr/recruitment/offers/{o['id']}/accept").status_code == 400, "the candidate accepts by signing"

    assert _sign(world, token)["status"] == "EXECUTED"
    world.db.expire_all()
    offer = world.db.get(RecruitmentOffer, o["id"])
    assert offer.status == OfferStatus.ACCEPTED and offer.accepted_at
    assert world.db.get(RecruitmentCandidate, cand.id).status.value == "hired"
    hire = world.db.query(OnboardingNewHire).filter_by(email=cand.email).one()
    assert hire.work_country == "GB", "the onboarding record carries the offer's jurisdiction"
    ack = world.db.query(GeneratedDocument).filter_by(canonical_id="HR-HIR-019").one()
    assert ack.status == "ISSUED" and ack.source_ref == f"recruitment_offer:{o['id']}"


def test_generating_an_unconfigured_cross_border_offer_provisions_starters_automatically(world):
    from app.modules.doc_templates.models import JurisdictionPack, TemplateApprovalRecord, TemplateVariant
    signatory(world)
    cand = _candidate(world, "Jordan Crossborder", "jordan.crossborder@example.com")
    o = _offer(world, cand, work_country="US", currency="USD", conditions=None)
    assert world.put("a_admin", "/hr/recruitment/privacy-settings", json={"offer_letters_without_approval": True}).status_code == 200
    readiness = world.get("a_admin", f"/hr/recruitment/offers/{o['id']}/letter/readiness").json()
    assert readiness["auto_setup_available"] is True
    assert all(step["automatic"] for step in readiness["steps"] if step["key"] in ("pack", "template", "clauses"))
    assert next(step for step in readiness["steps"] if step["key"] == "approval")["automatic"] is True

    r = world.post("a_admin", f"/hr/recruitment/offers/{o['id']}/letter")
    assert r.status_code == 201, r.text
    letter = r.json()["letter"]
    world.db.expire_all()
    assert world.db.get(RecruitmentOffer, o["id"]).status == OfferStatus.APPROVED
    pack = world.db.query(JurisdictionPack).filter_by(owner_organization_id=1, country="US", status="ACTIVE").one()
    variant = world.db.query(TemplateVariant).filter_by(pack_id=pack.id, canonical_id="HR-HIR-012", status="ACTIVE").one()
    assert "GB" in variant.applicability["cross_border_from"]
    approval = world.db.query(TemplateApprovalRecord).filter_by(variant_id=variant.id).one()
    assert approval.signed_name_typed is None
    assert approval.review["attestation_method"] == "offer_generation_request"
    assert letter["canonical_id"] == "HR-HIR-012" and letter["status"] in ("RENDERED_DRAFT", "HUMAN_APPROVED", "PENDING_APPROVAL")
    issued = world.post("a_admin", f"/hr/recruitment/offers/{o['id']}/letter/issue")
    assert issued.status_code == 200 and issued.json()["letter"]["status"] == "ISSUED"


def test_decline_and_expiry_drive_the_offer(world):
    cand, o = _ready_offer(world)
    _, token = _issue(world, o)
    r = world.client.post(f"/public/documents/sign/{token}/decline", json={"reason": "accepted another role"})
    assert r.status_code == 200
    world.db.expire_all()
    offer = world.db.get(RecruitmentOffer, o["id"])
    assert offer.status == OfferStatus.REJECTED and offer.decline_reason == "accepted another role"

    cand2 = _candidate(world, "Riley Second", "riley.second@example.com")
    o2 = _offer(world, cand2)
    letter, _ = _issue(world, o2)
    from app.modules.doc_templates import jobs
    row = world.db.get(GeneratedDocument, letter["id"])
    assert jobs.expire_documents(world.db, now=row.expires_at + timedelta(minutes=1)) >= 1
    world.db.expire_all()
    assert world.db.get(RecruitmentOffer, o2["id"]).status == OfferStatus.EXPIRED


def test_amendment_supersedes_the_original_letter(world):
    cand, o = _ready_offer(world)
    activate(world.db, "HR-HIR-017")
    first, _ = _issue(world, o)
    r = world.post("a_hr", f"/hr/recruitment/offers/{o['id']}/amend", json={"changes": {"salary": 45000}})
    assert r.status_code == 201, r.text
    new_id = r.json()["offer_id"]
    assert r.json()["template"] == "HR-HIR-017"
    world.post("a_admin", f"/hr/recruitment/offers/{new_id}/approve", json={})
    assert world.post("a_hr", f"/hr/recruitment/offers/{new_id}/letter").status_code == 201
    r = world.post("a_hr", f"/hr/recruitment/offers/{new_id}/letter/issue")
    assert r.status_code == 200, r.text
    world.db.expire_all()
    assert world.db.get(GeneratedDocument, first["id"]).status == "SUPERSEDED"
    amend = world.db.get(GeneratedDocument, r.json()["letter"]["id"])
    text = " ".join(renderer.pdf_text(storage.get_store().get(amend.pdf_path)).split())
    assert "Amendment to your offer of employment" in text and "42,000.00" in text and "45,000.00" in text


def test_withdrawal_needs_reason_and_approval_and_an_accepted_offer_needs_an_admin(world):
    cand, o = _ready_offer(world)
    activate(world.db, "HR-HIR-018")
    _issue(world, o)
    assert world.post("a_hr", f"/hr/recruitment/offers/{o['id']}/withdrawal", json={"category": "role_cancelled", "statement": " "}).status_code == 422
    assert world.put("a_hr", f"/hr/recruitment/offers/{o['id']}/withdraw").status_code == 400, "an issued offer needs a notice"
    r = world.post("a_hr", f"/hr/recruitment/offers/{o['id']}/withdrawal",
                   json={"category": "role_cancelled", "statement": "We are sorry that the role is no longer available."})
    assert r.status_code == 201, r.text
    wd = r.json()["withdrawal_document"]
    assert wd["status"] == "PENDING_APPROVAL"
    world.db.expire_all()
    assert world.db.get(RecruitmentOffer, o["id"]).status == OfferStatus.PENDING, "nothing changes until a human issues the notice"
    assert world.post("a_hr", f"/hr/generated-documents/{wd['id']}/approve", json={}).status_code == 403
    assert world.post("a_hr2", f"/hr/generated-documents/{wd['id']}/approve", json={}).json()["status"] == "HUMAN_APPROVED"
    assert world.post("a_hr", f"/hr/generated-documents/{wd['id']}/issue").json()["status"] == "ISSUED"
    notice = world.db.get(GeneratedDocument, wd["id"])
    t = " ".join(renderer.pdf_text(storage.get_store().get(notice.pdf_path)).split())
    assert "Withdrawal of offer of employment" in t and "The role has been cancelled" in t and "within 10 days" in t
    assert "Our offer was conditional on" not in t, "only the paragraph for the chosen reason is included"
    world.db.expire_all()
    assert world.db.get(RecruitmentOffer, o["id"]).status == OfferStatus.WITHDRAWN
    assert world.db.get(GeneratedDocument, o.get("document_id") or world.db.get(RecruitmentOffer, o["id"]).document_id).status == "CANCELLED"


def test_withdrawing_an_accepted_offer_is_approved_only_by_an_admin(world):
    cand, o = _ready_offer(world)
    activate(world.db, "HR-HIR-018")
    _, token = _issue(world, o)
    _sign(world, token)
    body = {"category": "condition_not_met", "statement": "The reference check could not be completed.", "condition": "two references"}
    r = world.post("a_hr", f"/hr/recruitment/offers/{o['id']}/withdrawal", json=body)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "LEGAL_REVIEW_NOTE_REQUIRED"
    wd = world.post("a_hr", f"/hr/recruitment/offers/{o['id']}/withdrawal", json={**body, "legal_review_completed": True}).json()["withdrawal_document"]
    assert world.post("a_hr2", f"/hr/generated-documents/{wd['id']}/approve", json={}).status_code == 403, "hr_admin is not enough"
    assert world.post("a_admin", f"/hr/generated-documents/{wd['id']}/approve", json={}).json()["status"] == "HUMAN_APPROVED"


def test_freelance_offers_are_blocked_with_a_clear_message(world):
    cand = _candidate(world)
    o = _offer(world, cand, employment_type="freelance", conditions=None)
    world.post("a_admin", f"/hr/recruitment/offers/{o['id']}/approve", json={})
    r = world.post("a_hr", f"/hr/recruitment/offers/{o['id']}/letter")
    assert r.status_code == 409 and r.json()["detail"]["message"] == "Contractor engagement letters are not available yet."


def test_the_candidate_link_opens_only_its_own_document(world):
    cand, o = _ready_offer(world)
    _, token = _issue(world, o)
    other = _candidate(world, "Other Person", "other.person@example.com")
    o2 = _offer(world, other)
    letter2, token2 = _issue(world, o2)
    assert world.client.get(f"/public/documents/sign/{token}").json()["document_number"] != letter2["document_number"]
    assert world.client.get(f"/public/documents/sign/{token}x").status_code == 404


def test_no_browser_pdf_generation_remains_in_recruitment():
    for path in list((FRONTEND / "modules" / "zoiko-hr" / "recruitment").glob("*")) + [BACKEND / "modules" / "hr" / "recruitment_router.py",
                                                                                     BACKEND / "modules" / "hr" / "recruitment_notify.py"]:
        text = path.read_text(encoding="utf-8")
        for banned in ("jspdf", "html2pdf", "generatePdfBlob", "generatePdfBase64", "pdfMake", "send-with-pdf", "sendOfferWithPDF"):
            assert banned not in text, f"{path.name} still contains {banned}"


# ── records, notices and letters triggered by recruitment events ─────────────────────────────────────────────────────

def test_requisition_decision_produces_the_authorization_record(world):
    activate(world.db, "HR-HIR-001")
    r = world.post("a_hr", "/hr/recruitment/requisitions", json={"title": "Analyst", "department": "Operations", "status": "pending",
                                                                  "reason": "growth", "justification": "Demand doubled."})
    assert r.status_code in (200, 201), r.text
    req_id = r.json()["id"]
    assert world.put("a_admin", f"/hr/recruitment/requisitions/{req_id}/approve").status_code == 200
    auth = world.get("a_hr", f"/hr/recruitment/requisitions/{req_id}/authorization").json()
    docs = [d for d in auth["documents"] if d["canonical_id"] == "HR-HIR-001"]
    assert docs and docs[0]["status"] == "ISSUED", auth
    row = world.db.get(GeneratedDocument, docs[0]["id"])
    text = " ".join(renderer.pdf_text(storage.get_store().get(row.pdf_path)).split())
    assert f"REQ-{req_id:05d}" in text and "Approved" in text and "It does not approve any individual candidate or offer" in text


def test_privacy_notice_is_sent_when_a_candidate_is_created_or_its_absence_is_explained(world):
    r = world.post("a_hr", "/hr/recruitment/candidates", json={"name": "Nina Notice", "email": "nina.notice@example.com", "position": "Analyst"})
    cid = r.json()["id"]
    status = world.get("a_hr", f"/hr/recruitment/candidates/{cid}/documents-status").json()
    assert status["privacy_notice_sent_at"] is None and status["privacy_notice_blocked"]["reasons"] == ["NOT_IMPLEMENTED"] or \
        status["privacy_notice_blocked"] is not None
    set_recruitment_privacy(world)
    activate(world.db, "HR-HIR-004", skip_clauses=("privacy_lawful_basis_recruitment",))
    r = world.post("a_hr", "/hr/recruitment/candidates", json={"name": "Omar Optin", "email": "omar.optin@example.com", "position": "Analyst"})
    blocked = world.get("a_hr", f"/hr/recruitment/candidates/{r.json()['id']}/documents-status").json()["privacy_notice_blocked"]
    assert blocked["reasons"] == ["CLAUSE_UNRESOLVED:privacy_lawful_basis_recruitment"], "no starter text: fails closed until written"
    from tests.doc_templates.p2_support import gb_pack, release_clause
    release_clause(world.db, gb_pack(world.db), "privacy_lawful_basis_recruitment", "We rely on steps taken at your request before a contract.")
    r = world.post("a_hr", "/hr/recruitment/candidates", json={"name": "Pia Privacy", "email": "pia.privacy@example.com", "position": "Analyst"})
    status = world.get("a_hr", f"/hr/recruitment/candidates/{r.json()['id']}/documents-status").json()
    assert status["privacy_notice_sent_at"] and any(t == "candidate_document_available.html" for _, t, _ in world.mail)


def test_rejection_letter_replaces_the_generic_email_and_falls_back_when_unavailable(world):
    r = world.post("a_hr", "/hr/recruitment/candidates", json={"name": "Una Fallback", "email": "una.fallback@example.com", "position": "Analyst"})
    world.put("a_hr", f"/hr/recruitment/candidates/{r.json()['id']}/status", json={"status": "rejected"})
    assert any(t == "candidate_status_update.html" for _, t, _ in world.mail), "without a released letter the candidate is still told"
    activate(world.db, "HR-HIR-020")
    world.mail.clear()
    r = world.post("a_hr", "/hr/recruitment/candidates", json={"name": "Rae Reject", "email": "rae.reject@example.com", "position": "Analyst"})
    preview = world.post("a_hr", "/hr/recruitment/candidates/bulk-reject", json={"candidate_ids": [r.json()["id"]]}).json()
    assert preview["preview"] and preview["results"][0]["outcome"] == "ALLOW"
    out = world.post("a_hr", "/hr/recruitment/candidates/bulk-reject", json={"candidate_ids": [r.json()["id"]], "preview": False}).json()
    assert out["results"][0]["letter"]
    assert not any(t == "candidate_status_update.html" for _, t, _ in world.mail)
    doc = world.db.query(GeneratedDocument).filter_by(canonical_id="HR-HIR-020").one()
    text = " ".join(renderer.pdf_text(storage.get_store().get(doc.pdf_path)).split())
    assert "decided not to progress your application" in text and "reason" not in text.lower().replace("reasons", "")


def test_scorecard_requires_evidence_and_produces_both_records(world):
    activate(world.db, "HR-HIR-006")
    activate(world.db, "HR-HIR-007")
    req = RecruitmentRequisition(title="Analyst", department="Operations", organization_id=1,
                                 scorecard_criteria=[{"key": "sql", "label": "SQL", "weight": 2}, {"key": "comms", "label": "Communication", "weight": 1}])
    world.db.add(req)
    world.db.commit()
    cand = RecruitmentCandidate(name="Sam Score", email="sam.score@example.com", position="Analyst", organization_id=1, requisition_id=req.id)
    world.db.add(cand)
    world.db.commit()
    iv = RecruitmentInterview(candidate_id=cand.id, candidate_name=cand.name, position="Analyst", interview_date=date.today(), organization_id=1,
                              interviewer_id=world.u["a_manager"].id, interview_type="video")
    world.db.add(iv)
    world.db.commit()
    base = {"scores": [{"criterion_key": "sql", "score": 4, "evidence": "Wrote a correct join."}], "recommendation": "proceed"}
    assert world.post("a_emp", f"/hr/recruitment/interviews/{iv.id}/scorecard", json=base).status_code == 403
    r = world.post("a_manager", f"/hr/recruitment/interviews/{iv.id}/scorecard", json=base)
    assert r.json()["detail"]["code"] == "CRITERIA_MISSING"
    full = {**base, "scores": base["scores"] + [{"criterion_key": "comms", "score": 3, "evidence": " "}]}
    assert world.post("a_manager", f"/hr/recruitment/interviews/{iv.id}/scorecard", json=full).json()["detail"]["code"] == "EVIDENCE_REQUIRED"
    full["scores"][1]["evidence"] = "Explained trade-offs clearly."
    assert world.post("a_manager", f"/hr/recruitment/interviews/{iv.id}/scorecard", json={**full, "recommendation": "hold"}).status_code == 422
    r = world.post("a_manager", f"/hr/recruitment/interviews/{iv.id}/scorecard", json={**full, "questions": ["Tell us about a join."]})
    assert r.status_code == 201, r.text
    assert r.json()["weighted_total"] == pytest.approx(3.67, abs=0.01)
    kinds = {d["canonical_id"]: d["status"] for d in r.json()["documents"]}
    assert kinds == {"HR-HIR-006": "ISSUED", "HR-HIR-007": "ISSUED"}
    comparison = world.get("a_hr", f"/hr/recruitment/requisitions/{req.id}/scorecards").json()
    assert comparison["candidates"][0]["scorecards"][0]["scores"][0]["evidence"] == "Wrote a correct join."


def test_offer_letter_snapshot_text(world):
    cand, o = _ready_offer(world, template="HR-HIR-011", components=[{"label": "Travel allowance", "amount": 1200, "frequency": "annual"}],
                           benefits_summary="Pension scheme", work_arrangement="hybrid", work_pattern="Monday to Friday, 09:00 to 17:30")
    letter, _ = _issue(world, o)
    row = world.db.get(GeneratedDocument, letter["id"])
    text = " ".join(renderer.pdf_text(storage.get_store().get(row.pdf_path)).split())
    for expected in ("Private and confidential", f"OFR-{o['id']:05d}", "Travel allowance", "1,200.00", "Benefits: Pension scheme", "Hybrid",
                     "Monday to Friday, 09:00 to 17:30", "Please review this offer and accept or decline it using the secure link",
                     "This letter sets out the main terms of our offer"):
        assert expected in text, expected
