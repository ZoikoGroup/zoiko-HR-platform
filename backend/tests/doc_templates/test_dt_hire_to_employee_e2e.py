"""End to end, through the API the screens call: requisition → candidate → offer → signed offer letter → new hire →
offer package → candidate portal (details, declaration, signatures, acknowledgements, upload) → HR review → employee."""
from datetime import date, timedelta

from app.modules.doc_templates.models import GeneratedDocument
from app.modules.hr import onboarding_package_content as C
from app.modules.hr.models import (OfferStatus, OnboardingDocument, OnboardingNewHire, RecruitmentCandidate, RecruitmentOffer,
                                   RecruitmentRequisition)
from tests.doc_templates.p2_support import code

START = (date.today() + timedelta(days=30)).isoformat()
SETUP = lambda w: {"country": "IN", "entity": {"legal_name": "Tenant A India Pvt Ltd", "country": "IN", "region": "Telangana",  # noqa: E731
                                                "city": "Hyderabad", "postal_code": "500001", "address": "Plot 1\nHitech City",
                                                "tax_id": "TESTTAX01"},
                   "signatory_employee_id": w.u["a_admin"].id, "signatory_title": "Director", "offers_without_approval": True,
                   "attestation_accepted": True, "signed_name": "Avery Admin"}


def _ok(r, *codes):
    assert r.status_code in (codes or (200, 201)), f"{r.request.method} {r.request.url.path}: {r.status_code} {r.text[:400]}"
    return r.json() if r.content and r.headers.get("content-type", "").startswith("application/json") else r


def _sign(world, sign_url, name):
    tok = sign_url.rsplit("/", 1)[1]
    view = _ok(world.client.get(f"/public/documents/sign/{tok}"))
    _ok(world.client.post(f"/public/documents/sign/{tok}/otp"))
    _ok(world.client.post(f"/public/documents/sign/{tok}/sign",
                          json={"typed_name": name, "consent_version": view["consent"]["version"], "otp_code": code(world)}))
    return view


# v2: the Company Profile terms and the Role Profile the rebuilt documents print (Onboarding > Settings)
V2_PROFILE = {"jurisdiction_country": "IN", "jurisdiction_city": "Hyderabad", "notice_period_value": 4,
              "notice_period_unit": "weeks", "non_solicit_post_termination_months": 12, "nda_non_solicit_months": 12,
              "reports_email": "reports@tenant-a.example.com"}


def _v2_terms(world, title):
    from types import SimpleNamespace
    from app.modules.hr import company_profile, onboarding_profiles
    actor = SimpleNamespace(id=world.u["a_admin"].id, organization_id=1)
    company_profile.save_profile(world.db, actor, V2_PROFILE)
    onboarding_profiles.save_role(world.db, actor, title.lower().replace(" ", "-"), {
        "title": title, "about": [f"The {title} keeps our products reliable."],
        "responsibility_groups": [{"heading": "Delivery", "bullets": ["Ship reliable work every week."]}],
        "offer_responsibilities": ["Delivery: ship reliable work every week."],
        "contract_duties": f"The {title} designs, builds and tests the team's software.",
        "kpi_areas": [{"title": "Delivery", "bullets": ["Work shipped on time."], "success": "Every release is on time."}]})


def test_requisition_to_employee(world):
    name, email = "Ishaan Candidate", "ishaan.candidate@example.com"

    # ── recruitment ──
    req = _ok(world.post("a_hr", "/hr/recruitment/requisitions", json={
        "title": "Backend Engineer", "department": "Engineering", "location": "Hyderabad", "openings": 1, "priority": "high",
        "employment_type": "full_time", "currency": "INR", "status": "pending",
        "description": "Builds and runs the payroll APIs that thousands of employees rely on every month."}))
    assert _ok(world.put("a_admin", f"/hr/recruitment/requisitions/{req['id']}/approve", json={"comment": "ok"}))["status"] == "open"
    cand = _ok(world.post("a_hr", "/hr/recruitment/candidates", json={"name": name, "email": email, "phone": "+91 90000 00000",
                                                                       "position": "Backend Engineer", "requisition_id": req["id"]}))
    for st in ("screening", "interview"):
        _ok(world.put("a_hr", f"/hr/recruitment/candidates/{cand['id']}/status", json={"status": st}))
    _ok(world.post("a_admin", "/hr/recruitment/offer-letter-setup", json=SETUP(world)))
    offer = _ok(world.post("a_admin", "/hr/recruitment/offers", json={
        "candidate_id": cand["id"], "candidate_name": name, "position": "Backend Engineer", "salary": 1500000, "currency": "INR",
        "pay_period": "annual", "employment_type": "full_time", "work_country": "IN", "joining_date": START,
        "work_location": "Hyderabad office", "work_arrangement": "hybrid", "hours_per_week": 40,
        "reporting_manager_id": world.u["a_manager"].id}))
    world.db.expire_all()
    o = world.db.get(RecruitmentOffer, offer["id"])
    assert o.status == OfferStatus.APPROVED and o.document_id, "letter prepared after the response (background task)"
    _ok(world.post("a_admin", f"/hr/recruitment/offers/{o.id}/letter/issue"))
    letter_url = [c for (_, t, c) in world.mail if t == "candidate_document_sign.html"][-1]["action_url"]
    _sign(world, letter_url, name)
    world.db.expire_all()
    assert world.db.get(RecruitmentOffer, o.id).status == OfferStatus.ACCEPTED
    c = world.db.get(RecruitmentCandidate, cand["id"])
    assert c.status.value == "hired" and c.onboarding_new_hire_id, "accepting the offer hires the candidate and starts onboarding"
    assert world.db.get(RecruitmentRequisition, req["id"]).filled == 1

    # ── the new hire carries the offer's terms ──
    hire = world.db.get(OnboardingNewHire, c.onboarding_new_hire_id)
    assert (hire.position, hire.work_country, hire.manager_id) == ("Backend Engineer", "IN", world.u["a_manager"].id)
    assert hire.joining_date.isoformat() == START and hire.status == "offer_accepted"

    # ── offer package ──
    clauses = {k: {"text": f"Counsel wording – {t}."} for k, (t, _n, req_) in C.CLAUSES.items() if req_}
    _ok(world.put("a_admin", "/hr/onboarding/package/settings", json={
        "legal_name": "Tenant A India Pvt Ltd", "registered_address": "Plot 1, Hitech City, Hyderabad 500001",
        "signatory_name": "Avery Admin", "signatory_title": "Director", "hr_contact_name": "People Team",
        "hr_contact_email": "people@tenant-a.example.com", "leave_entitlement": "18 days plus public holidays",
        "post_employment_period": "two years", "pay_frequency": "monthly", "clauses": clauses}))
    _v2_terms(world, "Backend Engineer")
    pkg = _ok(world.get("a_admin", f"/hr/onboarding/new-hires/{hire.id}/package"))
    states = {d["category"]: d for d in pkg["documents"]}
    missing = {f["key"] for d in pkg["documents"] for f in d["missing_fields"] if not f["candidate_provides"]}
    assert not missing, f"the offer and settings should supply all HR data, still missing: {missing}"
    sent = _ok(world.post("a_admin", f"/hr/onboarding/new-hires/{hire.id}/send-package"))
    assert "offer_letter" not in {i["category"] for i in sent["issued"]}, "the signed recruitment letter is reused"
    states = {d["category"]: d for d in _ok(world.get("a_admin", f"/hr/onboarding/new-hires/{hire.id}/package"))["documents"]}
    assert states["offer_letter"]["state"] == "completed"
    assert {h["category"] for h in sent["held"]} == {"nda", "employment_contract", "exclusivity_affidavit"}

    # ── candidate portal ──
    from app.modules.hr import onboarding_flow
    token = onboarding_flow.current_portal_url(world.db, hire).rsplit("/", 1)[1]
    early = world.client.post(f"/public/onboarding/{token}/submit-signed-package")
    assert early.status_code == 409 and early.json()["detail"]["outstanding"], "nothing can be submitted before it is done"
    view = _ok(world.client.put(f"/public/onboarding/{token}/details", json={
        "address": "4 Lake View Road", "city": "Hyderabad", "state": "Telangana", "postal_code": "500032", "country": "India"}))
    view = _ok(world.client.post(f"/public/onboarding/{token}/outside-activities", json={"none": True}))
    docs = {d["category"]: d for d in view["documents"]}
    assert view["package"]["needs"] == []
    for cat in ("nda", "employment_contract", "exclusivity_affidavit"):
        assert docs[cat]["sign_url"], cat
        _sign(world, docs[cat]["sign_url"], name)
    for cat in ("job_description", "daily_kpi"):
        view = _ok(world.client.post(f"/public/onboarding/{token}/documents/{docs[cat]['id']}/acknowledge",
                                     json={"text_version": view["package"]["ack_text_version"]}))
    for cat in ("job_application", "self_disclosure"):             # v2: both forms are completed and returned
        blank = _ok(world.client.get(f"/public/onboarding/{token}/package/{cat}/file"))
        _ok(world.client.post(f"/public/onboarding/{token}/documents/{docs[cat]['id']}",
                              files={"file": (f"{cat}.pdf", blank.content, "application/pdf")}))
    # the organisation's standard uploads (onboarding settings), e.g. ID proof
    for d in _ok(world.client.get(f"/public/onboarding/{token}"))["documents"]:
        if d["status"] == "requested" and not d["package_mode"]:
            _ok(world.client.post(f"/public/onboarding/{token}/documents/{d['id']}",
                                  files={"file": (f"{d['category']}.pdf", b"%PDF-1.4 test", "application/pdf")}))

    # ── the new hire submits: everything they owe is done ──
    portal = _ok(world.client.get(f"/public/onboarding/{token}"))
    assert portal["submission"]["can_submit"] and portal["submission"]["submitted_at"] is None, portal["submission"]
    sub = _ok(world.client.post(f"/public/onboarding/{token}/submit-signed-package"))
    assert sub["submitted_at"] and sub["first_submission"] and sub["view"]["submission"]["submitted_at"]
    again = _ok(world.client.post(f"/public/onboarding/{token}/submit-signed-package"))
    assert again["first_submission"] is False and again["submitted_at"] == sub["submitted_at"]

    # contract text carries the offer terms and counsel's wording
    world.db.expire_all()
    contract = world.db.get(GeneratedDocument, docs["employment_contract"]["document_id"])
    assert contract.status == "EXECUTED"
    from app.modules.doc_templates import renderer, storage
    text = " ".join(renderer.pdf_text(storage.get_store().get(contract.pdf_path)).split())
    for expected in ("Tenant A India Pvt Ltd", name, "Backend Engineer", "₹1,500,000 per year", "Hyderabad office",
                     "Monday to Friday", "4 Lake View Road", "Counsel wording – Probation.",
                     "The Backend Engineer designs, builds and tests the team's software."):
        assert expected in text, expected
    assert "{{" not in text and "DRAFT – NOT FOR ISSUE" not in text

    # ── HR reviews and completes ──
    rows = {d.category: d for d in world.db.query(OnboardingDocument).filter_by(onboarding_new_hire_id=hire.id, is_deleted=False)}
    assert rows["job_application"].status == "pending"
    for d in rows.values():
        if d.status == "pending":
            _ok(world.put("a_admin", f"/hr/onboarding/documents/{d.id}", json={"status": "approved"}))
    prog = _ok(world.get("a_admin", f"/hr/onboarding/new-hires/{hire.id}/progress"))
    doc_blockers = [b for b in prog["blockers"] if "document" in b]
    allrows = [(d.id, d.category, d.status, d.document_id) for d in world.db.query(OnboardingDocument).filter_by(onboarding_new_hire_id=hire.id, is_deleted=False)]
    assert not doc_blockers, (prog, allrows)
    checklists = _ok(world.get("a_admin", "/hr/onboarding/checklist-assignments", params={"onboarding_record_id": hire.id}))
    checklists = checklists["items"] if isinstance(checklists, dict) else checklists
    docs_cl = [cl for cl in checklists if cl["name"] == "Onboarding Documents & Agreements"]
    assert docs_cl and docs_cl[0]["status"] == "completed", "signed / acknowledged / approved documents tick themselves off"
    for cl in checklists:                     # the manual HR tasks (IT set-up, induction ...) are ticked by HR
        if cl["name"] == "Onboarding Documents & Agreements" or all(it.get("completed") for it in cl.get("items", [])):
            continue
        items = [{"id": it["id"], "title": it["title"], "description": it.get("description"), "completed": True,
                  "due_date": it.get("due_date"), "assignee_employee_id": it.get("assignee_employee_id")} for it in cl["items"]]
        _ok(world.put("a_admin", f"/hr/onboarding/checklist-assignments/{cl['id']}", json={"items": items}))
    prog = _ok(world.get("a_admin", f"/hr/onboarding/new-hires/{hire.id}/progress"))
    assert prog["blockers"] == [], prog["blockers"]
    _ok(world.put("a_admin", f"/hr/onboarding/new-hires/{hire.id}", json={"status": "in_progress"}))   # "Start onboarding"
    r = world.put("a_admin", f"/hr/onboarding/new-hires/{hire.id}", json={"status": "completed"})          # "Complete onboarding"
    done = _ok(r)
    assert done["status"] == "completed"
    from app.modules.employee.models import Employee
    emp = world.db.query(Employee).filter(Employee.email == email).one()
    assert emp.organization_id == 1
    # ── the new employee sees their own signed documents in self-service ──
    from tests.privacy.support import token_for
    mine = world.client.get("/hr/me/generated-documents", headers=token_for(emp))
    assert mine.status_code == 200, mine.text
    body = mine.json()
    items = body["items"] if isinstance(body, dict) else body
    have = {d["canonical_id"] for d in items if d["status"] == "EXECUTED"}
    assert {"HR-CON-017", "HR-CON-001", "HR-CON-101"} <= have and any(cid.startswith("HR-HIR-") for cid in have), have


def test_a_newly_hired_employee_gets_the_package_in_one_send(world):
    """Hire through Recruitment with a complete offer; HR types the address; ONE Send covers all 10 documents. The affidavit's
    Schedule A (outside activities) is the new hire's own declaration, made in the portal before they sign it."""
    name, email = "Meera Joshi", "meera.joshi@example.com"
    cand = _ok(world.post("a_hr", "/hr/recruitment/candidates", json={"name": name, "email": email, "phone": "+91 98000 00000",
                                                                       "position": "QA Engineer"}))
    _ok(world.post("a_admin", "/hr/recruitment/offer-letter-setup", json=SETUP(world)))
    offer = _ok(world.post("a_admin", "/hr/recruitment/offers", json={
        "candidate_id": cand["id"], "candidate_name": name, "position": "QA Engineer", "salary": 900000, "currency": "INR",
        "pay_period": "annual", "employment_type": "full_time", "work_country": "IN", "joining_date": START,
        "work_location": "Pune office", "work_arrangement": "hybrid", "hours_per_week": 40}))
    _ok(world.post("a_admin", f"/hr/recruitment/offers/{offer['id']}/letter/issue"))
    _sign(world, [c for (_, t, c) in world.mail if t == "candidate_document_sign.html"][-1]["action_url"], name)
    world.db.expire_all()
    hire_id = world.db.get(RecruitmentCandidate, cand["id"]).onboarding_new_hire_id
    clauses = {k: {"text": f"Counsel wording – {t}."} for k, (t, _n, req_) in C.CLAUSES.items() if req_}
    _ok(world.put("a_admin", "/hr/onboarding/package/settings", json={
        "legal_name": "Tenant A India Pvt Ltd", "registered_address": "Plot 1, Hitech City, Hyderabad", "signatory_name": "Avery Admin",
        "signatory_title": "Director", "hr_contact_email": "people@tenant-a.example.com", "leave_entitlement": "18 days",
        "post_employment_period": "two years", "pay_frequency": "monthly", "clauses": clauses}))
    _v2_terms(world, "QA Engineer")
    pkg = _ok(world.get("a_admin", f"/hr/onboarding/new-hires/{hire_id}/package"))
    asks = {f["key"] for d in pkg["documents"] for f in d["missing_fields"] if f["editable"] and (not f["candidate_provides"] or f["hr_may_enter"])}
    assert asks == {"worker.postal_address"}, asks      # v2: the role's wording comes from its Role Profile
    _ok(world.put("a_admin", f"/hr/onboarding/new-hires/{hire_id}/package/inputs", json={"values": {
        "worker.postal_address": "22 FC Road, Pune 411004", "job.role_purpose": "Keeps releases reliable through automated testing."}}))
    sent = _ok(world.post("a_admin", f"/hr/onboarding/new-hires/{hire_id}/send-package"))
    assert sent["held"] == [], sent["held"]
    assert {i["category"] for i in sent["issued"]} == set(C.CATEGORIES) - {"offer_letter"}, "all 10: 9 sent + the signed offer letter"
    assert [u["state"] for u in sent["unchanged"] if u["category"] == "offer_letter"] == ["completed"]
    contract = world.db.query(GeneratedDocument).filter_by(subject_type="new_hire", subject_id=hire_id, canonical_id="HR-CON-001").one()
    from app.modules.doc_templates import renderer, storage
    text = " ".join(renderer.pdf_text(storage.get_store().get(contract.pdf_path)).split())
    for expected in (name, "QA Engineer", "₹900,000 per year", "Pune office", "Monday to Friday", "22 FC Road, Pune 411004",
                     "Tenant A India Pvt Ltd", "Counsel wording – Holidays and leave."):
        assert expected in text, expected
    # the declaration releases the affidavit straight away
    from app.modules.hr import onboarding_flow
    token = onboarding_flow.current_portal_url(world.db, world.db.get(OnboardingNewHire, hire_id)).rsplit("/", 1)[1]
    view = _ok(world.client.post(f"/public/onboarding/{token}/outside-activities", json={"none": True}))
    assert next(d for d in view["documents"] if d["category"] == "exclusivity_affidavit")["sign_url"]
