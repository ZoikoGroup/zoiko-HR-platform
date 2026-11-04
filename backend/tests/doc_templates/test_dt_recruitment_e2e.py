"""The whole recruitment flow through the API, as one organization admin would run it for India on any plan:
requisition → approval → candidate → interview → offer letter setup (one-step starter attestation) → offer → letter generated
automatically → sent → candidate signs → offer accepted. Plus the setup's own rules."""
from datetime import date, timedelta

from app.modules.doc_templates import renderer, storage
from app.modules.doc_templates.models import (AuthorisedSignatory, GeneratedDocument, JurisdictionPack, TemplateApprovalRecord,
                                              TemplateVariant)
from app.modules.hr.models import OfferStatus, RecruitmentOffer
from tests.doc_templates.p2_support import code

SOON = (date.today() + timedelta(days=3)).isoformat()
START = (date.today() + timedelta(days=30)).isoformat()


def _setup_body(world, **kw):
    return {"country": "IN", "entity": {"legal_name": "Tenant A India Pvt Ltd", "country": "IN", "region": "Telangana",
                                        "city": "Hyderabad", "postal_code": "500001", "address": "Plot 1\nHitech City",
                                        "tax_id": "TESTTAX01"},
            "signatory_employee_id": world.u["a_admin"].id, "signatory_title": "Director",
            "offers_without_approval": True, "attestation_accepted": True, "signed_name": "Avery Admin", **kw}


def test_setup_overview_reports_what_is_missing_and_prefills_the_employer(world):
    r = world.get("a_admin", "/hr/recruitment/offer-letter-setup", params={"country": "IN"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["pack"] is None and d["can_attest"] is True and d["plan_missing"] == []
    states = {t["canonical_id"]: t["state"] for t in d["templates"]}
    assert states["HR-HIR-012"] == "ready_from_starter" and states["HR-HIR-011"] == "ready_from_starter"
    assert states["HR-HIR-014"] == "needs_wording" and states["HR-HIR-015"] == "needs_wording" and states["HR-HIR-018"] == "needs_wording"
    assert d["entity_prefill"]["country"] == "GB"            # from the organization profile
    assert any(p["id"] == world.u["a_admin"].id for p in d["people"])


def test_setup_needs_an_org_admin_and_the_typed_name(world):
    assert world.post("a_hr", "/hr/recruitment/offer-letter-setup", json=_setup_body(world)).status_code == 403
    r = world.post("a_admin", "/hr/recruitment/offer-letter-setup", json=_setup_body(world, signed_name="Someone Else"))
    assert r.status_code == 422 and r.json()["detail"]["code"] == "NAME_MISMATCH"
    r = world.post("a_admin", "/hr/recruitment/offer-letter-setup", json=_setup_body(world, attestation_accepted=False))
    assert r.status_code == 422
    assert world.db.query(JurisdictionPack).filter_by(country="IN").count() == 0, "nothing is set up without the attestation"


def test_the_whole_recruitment_flow_for_india_with_one_admin(world):
    # 1. requisition, approved by someone other than its author
    r = world.post("a_hr", "/hr/recruitment/requisitions", json={"title": "Backend Engineer", "department": "Engineering",
                                                                  "location": "Hyderabad", "openings": 2, "priority": "high",
                                                                  "employment_type": "full_time", "budget_min": 1200000,
                                                                  "budget_max": 1800000, "currency": "INR", "status": "pending"})
    assert r.status_code in (200, 201), r.text
    req = r.json()
    r = world.put("a_admin", f"/hr/recruitment/requisitions/{req['id']}/approve", json={"comment": "Budgeted"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "open"

    # 2. candidate for it, moved to screening and interview
    r = world.post("a_hr", "/hr/recruitment/candidates", json={"name": "Ishaan Candidate", "email": "ishaan.candidate@example.com",
                                                                "position": "Backend Engineer", "requisition_id": req["id"],
                                                                "source": "referral", "location": "Hyderabad", "experience": 4})
    assert r.status_code in (200, 201), r.text
    cand = r.json()
    for st in ("screening", "interview"):
        r = world.put("a_hr", f"/hr/recruitment/candidates/{cand['id']}/status", json={"status": st})
        assert r.status_code == 200, r.text

    # 3. interview scheduled; the candidate and the interviewer are invited
    r = world.post("a_hr", "/hr/recruitment/interviews", json={"candidate_id": cand["id"], "interview_type": "video",
                                                                "interview_date": SOON, "start_time": "10:00", "end_time": "11:00",
                                                                "timezone": "Asia/Kolkata", "interviewer_id": world.u["a_manager"].id,
                                                                "meeting_link": "https://meet.example.com/abc"})
    assert r.status_code in (200, 201), r.text
    assert any("ishaan.candidate@example.com" == to for (to, _, _) in world.mail), "the candidate is invited"

    # 4. offer letters set up for India by one admin (starter wording attested in one step)
    r = world.post("a_admin", "/hr/recruitment/offer-letter-setup", json=_setup_body(world))
    assert r.status_code == 200, r.text
    setup = r.json()
    assert {"HR-HIR-011", "HR-HIR-012", "HR-HIR-016", "HR-HIR-017", "HR-HIR-019"} <= set(setup["released"])
    assert {t["canonical_id"] for t in setup["skipped"]} == {"HR-HIR-014", "HR-HIR-015", "HR-HIR-018"}
    pack = world.db.query(JurisdictionPack).filter_by(country="IN", owner_organization_id=1).one()
    assert pack.status == "ACTIVE" and pack.attested_by == world.u["a_admin"].id
    v = world.db.query(TemplateVariant).filter_by(pack_id=pack.id, canonical_id="HR-HIR-012", status="ACTIVE").one()
    assert v.released_by == v.reviewed_by == world.u["a_admin"].id and v.authored_by is None
    assert v.legal_review["mode"] == "STARTER_SINGLE_ADMIN_ATTESTATION"
    assert world.db.query(TemplateApprovalRecord).filter_by(variant_id=v.id).one().record_pdf_sha256
    assert world.db.query(AuthorisedSignatory).filter_by(employee_id=world.u["a_admin"].id, status="active").count() >= 1
    # running it again changes nothing
    again = world.post("a_admin", "/hr/recruitment/offer-letter-setup", json=_setup_body(world)).json()
    assert again["released"] == []

    # 5. the offer: saved by the admin, approved by the organization setting, letter generated at once
    r = world.post("a_admin", "/hr/recruitment/offers", json={
        "candidate_id": cand["id"], "candidate_name": cand["name"], "position": "Backend Engineer", "salary": 1500000,
        "currency": "INR", "pay_period": "annual", "employment_type": "full_time", "work_country": "IN",
        "joining_date": START})
    assert r.status_code in (200, 201), r.text
    offer = world.db.get(RecruitmentOffer, r.json()["id"])
    world.db.refresh(offer)
    assert offer.status == OfferStatus.APPROVED and offer.document_id, "letter generated with the offer"
    ready = world.get("a_admin", f"/hr/recruitment/offers/{offer.id}/letter/readiness").json()
    assert all(s["ok"] for s in ready["steps"]), [s for s in ready["steps"] if not s["ok"]]
    doc = world.db.get(GeneratedDocument, offer.document_id)
    assert doc.canonical_id == "HR-HIR-012" and doc.pack_id == pack.id
    text = " ".join(renderer.pdf_text(storage.get_store().get(doc.pdf_path)).split())
    for expected in ("Tenant A India Pvt Ltd", "Ishaan", "Backend Engineer", "INR"):
        assert expected in text, expected

    # 6. sent, signed by the candidate, accepted
    r = world.post("a_admin", f"/hr/recruitment/offers/{offer.id}/letter/issue")
    assert r.status_code == 200, r.text
    token = [c for (_, t, c) in world.mail if t == "candidate_document_sign.html"][-1]["action_url"].rsplit("/", 1)[1]
    view = world.client.get(f"/public/documents/sign/{token}").json()
    world.client.post(f"/public/documents/sign/{token}/otp")
    r = world.client.post(f"/public/documents/sign/{token}/sign",
                          json={"typed_name": "Ishaan Candidate", "consent_version": view["consent"]["version"], "otp_code": code(world)})
    assert r.status_code == 200, r.text
    world.db.expire_all()
    assert world.db.get(RecruitmentOffer, offer.id).status == OfferStatus.ACCEPTED

    # 7. the screens' figures follow
    ins = world.get("a_admin", "/hr/recruitment/insights", params={"section": "offers"}).json()
    assert ins["kpis"]["accepted"]["value"] == 1 and ins["kpis"]["sent"]["value"] == 1


def test_one_standing_attestation_activates_every_work_country_for_offers_saved_by_hr(world):
    r = world.post("a_admin", "/hr/recruitment/offer-letter-setup", json=_setup_body(world, all_countries=True))
    assert r.status_code == 200, r.text
    assert r.json()["all_countries"]["by"] == world.u["a_admin"].id
    cand = world.post("a_hr", "/hr/recruitment/candidates", json={"name": "Fleur Candidate", "email": "fleur.candidate@example.com",
                                                                   "position": "Designer"}).json()
    # France was never set up: HR saves an offer there, no approval, the letter is generated (employer in India: cross-border)
    r = world.post("a_hr", "/hr/recruitment/offers", json={
        "candidate_id": cand["id"], "candidate_name": cand["name"], "position": "Designer", "salary": 52000, "currency": "EUR",
        "pay_period": "annual", "employment_type": "full_time", "work_country": "FR", "joining_date": START})
    assert r.status_code in (200, 201), r.text
    world.db.expire_all()
    offer = world.db.get(RecruitmentOffer, r.json()["id"])
    assert offer.status == OfferStatus.APPROVED and offer.document_id, "letter generated with the offer"
    pack = world.db.query(JurisdictionPack).filter_by(country="FR", owner_organization_id=1).one()
    v = world.db.query(TemplateVariant).filter_by(pack_id=pack.id, canonical_id="HR-HIR-012", status="ACTIVE").one()
    assert pack.attested_by == world.u["a_admin"].id and v.released_by == world.u["a_admin"].id, "recorded under the attesting admin"
    assert "IN" in (v.applicability or {}).get("cross_border_from", [])
    assert world.db.get(GeneratedDocument, offer.document_id).pack_id == pack.id


def test_without_a_standing_attestation_hr_cannot_activate_a_new_country(world):
    assert world.post("a_admin", "/hr/recruitment/offer-letter-setup", json=_setup_body(world)).status_code == 200
    cand = world.post("a_hr", "/hr/recruitment/candidates", json={"name": "Hugo Candidate", "email": "hugo.candidate@example.com",
                                                                   "position": "Designer"}).json()
    r = world.post("a_hr", "/hr/recruitment/offers", json={
        "candidate_id": cand["id"], "candidate_name": cand["name"], "position": "Designer", "salary": 52000, "currency": "EUR",
        "pay_period": "annual", "employment_type": "full_time", "work_country": "FR", "joining_date": START})
    assert r.status_code in (200, 201), r.text
    world.db.expire_all()
    assert world.db.get(RecruitmentOffer, r.json()["id"]).document_id is None
    assert world.db.query(JurisdictionPack).filter_by(country="FR", owner_organization_id=1).count() == 0
