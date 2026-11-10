"""Offer package (10 onboarding documents): content standards, readiness, issuing, candidate actions, completion gate."""
import io
from datetime import date, timedelta

import pytest

from app.modules.doc_templates import renderer, storage
from app.modules.doc_templates.models import GeneratedDocument
from app.modules.hr import onboarding_package as P
from app.modules.hr import onboarding_package_content as C
from app.modules.hr import onboarding_package_render as R
from app.modules.hr.models import OnboardingDocument, OnboardingNewHire
from tests.doc_templates.p2_support import code

GOVERNING_LAW = "This Agreement is governed by the law of the jurisdiction confirmed by counsel (test wording)."


def _pages(pdf: bytes) -> int:
    from pypdf import PdfReader
    return len(PdfReader(io.BytesIO(pdf)).pages)


def _text(pdf: bytes) -> str:
    return " ".join(renderer.pdf_text(pdf).split())


# ── content and format standards ─────────────────────────────────────────────────────────────────────────────────────

def test_every_placeholder_is_in_the_dictionary_and_every_hook_has_a_drafting_note():
    for cat in C.CATEGORIES:
        for tok in C.tokens_in(cat):
            ck = C.clause_key(tok)
            if ck:
                assert ck in C.CLAUSES and C.CLAUSES[ck][1], tok
            else:
                assert tok in C.FIELDS, f"{tok} used in {cat} is missing from the Placeholder Dictionary"
    listed = {r["placeholder"] for r in C.dictionary()}
    used = {"{{%s}}" % t for c in C.CATEGORIES for t in C.tokens_in(c)}
    assert listed == used
    assert {r["source"] for r in C.dictionary()} <= {"Zoiko HR", "ZoikoTime", "Payroll", "Counsel"}


def test_package_order_ids_and_modes():
    assert [d["title"] for d in C.documents()] == [
        "Offer Letter", "Job Description", "Daily Key Performance Indicators", "Non-Disclosure Agreement", "Employment Contract",
        "Affidavit of Employment Exclusivity", "Voluntary Self-Disclosure Form", "Job Application Form", "Daily Work Report (DWR)",
        "Project Velocity Report"]
    assert C.DOCS["offer_letter"]["template_id"] == "HR-HIR-011" and C.DOCS["employment_contract"]["template_id"] == "HR-CON-001"
    assert (C.DOCS["self_disclosure"]["sensitivity"], C.DOCS["self_disclosure"]["mode"]) == ("C4", "VOLUNTARY")
    assert {c for c, d in C.DOCS.items() if d["mode"] == "SIGN"} == {"offer_letter", "nda", "employment_contract",
                                                                     "exclusivity_affidavit"}


@pytest.mark.parametrize("cat,low,high", [
    ("offer_letter", 1, 2), ("job_description", 1, 2), ("daily_kpi", 1, 2), ("nda", 3, 4), ("employment_contract", 6, 10),
    ("exclusivity_affidavit", 1, 2), ("self_disclosure", 1, 2), ("job_application", 3, 4), ("daily_work_report", 1, 1),
    ("velocity_report", 2, 3)])
def test_page_budget_and_running_header_footer(cat, low, high):
    pdf = R.render_pdf(cat, R.RenderContext(mode="template", effective_date="10 November 2026"))
    n = _pages(pdf)
    assert low <= n <= high, f"{cat}: {n} pages"
    text = _text(pdf)
    d = C.DOCS[cat]
    assert "ZOIKO GROUP | HR" in text and f"{d['template_id']} | v1.0" in text and "Private and Confidential" in text
    assert f"Page {n} of {n}" in text and "LOGO – insert approved asset" in text
    assert R.DRAFT_STATUS in text and "DRAFT – NOT FOR ISSUE" in text


def test_template_set_has_cover_documents_and_dictionary_and_no_invented_law():
    pdf = R.render_template_set(R.RenderContext(mode="template"))
    text = _text(pdf)
    assert "Offer Package – Template Set" in text and "Appendix – Placeholder Dictionary" in text
    for d in C.documents():
        assert d["template_id"] in text
    for banned in ("E-SIGN", "Electronic Signatures in Global", "GDPR", "eIDAS", " v. ", "Act 19", "Act 20"):
        assert banned not in text, banned
    assert "{{clause:protected_disclosure_and_whistleblowing}}" in text, "whistleblowing carve-out hook in the NDA"
    assert "Include only if counsel confirms enforceability" in text


def test_forms_ask_nothing_unlawful_and_keep_ack_signature_and_consent_apart():
    app_text = _text(R.render_pdf("job_application", R.RenderContext(mode="template")))
    for banned in ("Date of birth", "Marital status", "Nationality", "Photo"):
        assert banned not in app_text
    assert "Do you have the right to work in" in app_text
    sd = _text(R.render_pdf("self_disclosure", R.RenderContext(mode="template")))
    assert "entirely voluntary" in sd and sd.count("Prefer not to say") >= 8 and "withdraw consent" in sd
    assert "{{worker.full_name}}" not in sd, "the monitoring form is not tied to a name"
    offer = _text(R.render_pdf("offer_letter", R.RenderContext(mode="template")))
    assert "Signing confirms acceptance of the offer only" in offer
    assert "disciplin" not in _text(R.render_pdf("daily_work_report", R.RenderContext(mode="template"))).lower()


def test_supplied_clause_replaces_hook_and_us_spelling():
    ctx = R.RenderContext(mode="issue", clauses={"governing_law": {"text": GOVERNING_LAW}}, spelling="US", draft=False,
                          status_text="ISSUED")
    html = R.render_html("nda", ctx)
    assert GOVERNING_LAW in html and "{{clause:governing_law}}" not in html and "{{clause:remedies}}" in html
    assert "DRAFT – NOT FOR ISSUE" not in html
    jd = R.render_html("job_description", ctx)
    assert "prioritize" in jd and "prioritise" not in jd and "Licenses" in jd


# ── the flow ─────────────────────────────────────────────────────────────────────────────────────────────────────────

SETTINGS = {"legal_name": "Tenant A Ltd", "registered_address": "1 Sample Street, Leeds LS1 1AA", "signatory_name": "Dana Director",
            "signatory_title": "Managing Director", "hr_contact_name": "Harper People", "hr_contact_email": "hr@tenant-a.example.com",
            "leave_entitlement": "25 days plus public holidays", "post_employment_period": "two years", "pay_frequency": "monthly"}
INPUTS = {"employment.work_location": "Leeds office", "employment.working_hours": "37.5 hours per week",
          "employment.base_pay": "GBP 42,000 per year", "job.role_purpose": "The Analyst turns data into decisions for the team.",
          "employment.employment_type": "Full-time"}


def _all_clauses():
    return {k: {"text": f"Counsel wording for {k}.\nSecond line."} for k, (_t, _n, req) in C.CLAUSES.items() if req}


def _new_hire(world):
    h = OnboardingNewHire(organization_id=1, candidate_name="Nora Newstarter", email="nora.newstarter@example.com", position="Analyst",
                          joining_date=date.today() + timedelta(days=14), status="offer_accepted", work_country="GB",
                          manager_id=world.u["a_manager"].id)
    world.db.add(h)
    world.db.commit()
    from app.modules.hr import onboarding_flow
    url = onboarding_flow.issue_portal_link(world.db, h, send=False)["url"]
    return h, url.rsplit("/", 1)[1]


def _states(world, h):
    return {d["category"]: d for d in world.get("a_admin", f"/hr/onboarding/new-hires/{h.id}/package").json()["documents"]}


def test_without_clauses_only_hook_free_documents_are_sent(world):
    h, token = _new_hire(world)
    docs = _states(world, h)
    assert not docs["nda"]["ready"] and {"governing_law", "remedies"} <= {c["key"] for c in docs["nda"]["missing_clauses"]}
    r = world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/send-package")
    assert r.status_code == 200, r.text
    body = r.json()
    assert {i["category"] for i in body["issued"]} == {"daily_kpi", "daily_work_report", "velocity_report"}, \
        "documents without clause hooks go out; the rest wait for counsel wording"
    assert {x["category"] for x in body["held"]} >= {"offer_letter", "nda", "employment_contract"}
    rows = {r.category: r.status for r in world.db.query(OnboardingDocument).filter_by(onboarding_new_hire_id=h.id)}
    assert rows == {"daily_kpi": "requested", "daily_work_report": "available", "velocity_report": "available"}
    from app.modules.hr import onboarding_flow
    assert onboarding_flow.progress(world.db, h)["documents_total"] == 1, "information documents never block completion"
    preview = world.get("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/nda/preview.pdf")
    assert preview.status_code == 200 and "DRAFT – NOT FOR ISSUE" in _text(preview.content)


def test_settings_validation_and_tenant_isolation(world):
    assert world.put("a_admin", "/hr/onboarding/package/settings", json={"brand_primary": "blue"}).status_code == 422
    assert world.put("a_admin", "/hr/onboarding/package/settings", json={"clauses": {"made_up": {"text": "x"}}}).status_code == 422
    assert world.put("a_admin", "/hr/onboarding/package/settings", json={"paper": "A3"}).status_code == 422
    r = world.put("a_admin", "/hr/onboarding/package/settings", json={**SETTINGS, "clauses": {"probation": {"text": "Six months."}}})
    assert r.status_code == 200
    assert next(c for c in r.json()["clauses"] if c["key"] == "probation")["text"] == "Six months."
    h, _ = _new_hire(world)
    assert world.get("b_admin", f"/hr/onboarding/new-hires/{h.id}/package").status_code == 404
    other = world.get("b_admin", "/hr/onboarding/package/settings").json()
    assert next(c for c in other["clauses"] if c["key"] == "probation")["text"] is None
    t = world.get("a_admin", "/hr/onboarding/package/template.pdf")
    assert t.status_code == 200 and "Placeholder Dictionary" in _text(t.content)


def test_full_package_journey(world):
    assert world.put("a_admin", "/hr/onboarding/package/settings", json={**SETTINGS, "clauses": {
        **_all_clauses(), "governing_law": {"text": GOVERNING_LAW}}}).status_code == 200
    h, token = _new_hire(world)
    r = world.put("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/inputs", json={"values": INPUTS})
    assert r.status_code == 200, r.text
    assert world.put("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/inputs",
                     json={"values": {"employer.legal_name": "x"}}).status_code == 422

    body = world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/send-package").json()
    issued = {i["category"] for i in body["issued"]}
    assert issued == {"offer_letter", "job_description", "daily_kpi", "self_disclosure", "job_application", "daily_work_report",
                      "velocity_report"}
    held = {x["category"]: x for x in body["held"]}
    assert set(held) == {"nda", "employment_contract", "exclusivity_affidavit"}
    assert "worker.postal_address" in held["nda"]["missing_fields"]
    assert held["exclusivity_affidavit"]["missing_fields"] == ["worker.postal_address"], "Schedule A is completed at signing"
    assert body["email_sent"] is True
    again = world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/send-package").json()
    assert again["issued"] == [], "a live document is never issued twice"

    offer = world.db.query(GeneratedDocument).filter_by(subject_type="new_hire", subject_id=h.id, canonical_id="HR-HIR-011").one()
    pdf = _text(storage.get_store().get(offer.pdf_path))
    assert "Tenant A Ltd" in pdf and "GBP 42,000 per year, paid monthly" in pdf and "ISSUED" in pdf
    assert "{{" not in pdf and "DRAFT – NOT FOR ISSUE" not in pdf

    # candidate: portal shows modes; address releases NDA + contract; declaration releases the affidavit
    portal = world.client.get(f"/public/onboarding/{token}").json()
    modes = {d["category"]: d["package_mode"] for d in portal["documents"]}
    assert modes["job_description"] == "ACKNOWLEDGE" and modes["self_disclosure"] == "VOLUNTARY"
    assert set(portal["package"]["needs"]) == {"address", "outside_activities"}
    r = world.client.put(f"/public/onboarding/{token}/details",
                         json={"address": "5 River Road", "city": "York", "postal_code": "YO1 1AA", "country": "United Kingdom"})
    assert r.status_code == 200, r.text
    docs_now = {d["category"]: d for d in r.json()["documents"]}
    assert {"nda", "employment_contract", "exclusivity_affidavit"} <= set(docs_now), "the address releases all three"
    assert docs_now["exclusivity_affidavit"]["needs_declaration"] and not docs_now["exclusivity_affidavit"]["sign_url"]
    aff = world.db.query(GeneratedDocument).filter_by(subject_id=h.id, canonical_id="HR-CON-101").one()
    world.db.refresh(aff)
    assert aff.status == "ISSUED" and "Schedule A" in _text(storage.get_store().get(aff.pdf_path))
    # signing is refused until Schedule A is declared
    from app.modules.doc_templates import signing as _signing
    raw, _ = _signing.issue_candidate_token(world.db, aff)
    world.db.commit()
    v = world.client.get(f"/public/documents/sign/{raw}").json()
    world.client.post(f"/public/documents/sign/{raw}/otp")
    refused = world.client.post(f"/public/documents/sign/{raw}/sign", json={"typed_name": "Nora Newstarter",
                                "consent_version": v["consent"]["version"], "otp_code": code(world)})
    assert refused.status_code == 409 and "Schedule A" in refused.text
    assert world.client.post(f"/public/onboarding/{token}/outside-activities", json={"none": False, "rows": []}).status_code == 422
    r = world.client.post(f"/public/onboarding/{token}/outside-activities",
                          json={"rows": [{"organisation": "Chess Club", "role": "Treasurer", "hours": 2, "paid": "unpaid"}]})
    assert r.status_code == 200, r.text
    aff_row = next(d for d in r.json()["documents"] if d["category"] == "exclusivity_affidavit")
    assert aff_row["sign_url"] and not aff_row["needs_declaration"]
    aff_tok = aff_row["sign_url"].rsplit("/", 1)[1]
    v = world.client.get(f"/public/documents/sign/{aff_tok}").json()
    world.client.post(f"/public/documents/sign/{aff_tok}/otp")
    assert world.client.post(f"/public/documents/sign/{aff_tok}/sign", json={"typed_name": "Nora Newstarter",
                             "consent_version": v["consent"]["version"], "otp_code": code(world)}).status_code == 200
    world.db.refresh(aff)
    executed = _text(storage.get_store().get(aff.executed_pdf_path))
    assert aff.status == "EXECUTED" and "Chess Club" in executed and "Schedule A" in executed, "the declaration is part of the signed affidavit"
    assert "Chess Club" not in _text(storage.get_store().get(aff.pdf_path)), "the sent document itself is unchanged"

    # sign the NDA: the signing page shows the real document, with counsel's wording
    nda_row = next(d for d in r.json()["documents"] if d["category"] == "nda")
    sign_token = nda_row["sign_url"].rsplit("/", 1)[1]
    view = world.client.get(f"/public/documents/sign/{sign_token}").json()
    assert "Non-Disclosure Agreement" in view["html"] and GOVERNING_LAW in view["html"] and "5 River Road" in view["html"]
    world.client.post(f"/public/documents/sign/{sign_token}/otp")
    s = world.client.post(f"/public/documents/sign/{sign_token}/sign",
                          json={"typed_name": "Nora Newstarter", "consent_version": view["consent"]["version"], "otp_code": code(world)})
    assert s.status_code == 200, s.text
    world.db.expire_all()
    assert world.db.get(OnboardingDocument, nda_row["id"]).status == "approved"

    # acknowledge the job description (receipt, not signature)
    jd = next(d for d in r.json()["documents"] if d["category"] == "job_description")
    assert world.client.post(f"/public/onboarding/{token}/documents/{jd['id']}/acknowledge",
                             json={"text_version": "old"}).status_code == 422
    a = world.client.post(f"/public/onboarding/{token}/documents/{jd['id']}/acknowledge",
                          json={"text_version": P.ACK_TEXT_VERSION})
    assert a.status_code == 200 and next(d for d in a.json()["documents"] if d["id"] == jd["id"])["acknowledged_at"]

    # the blank application form is downloadable; voluntary/information documents never block completion
    f = world.client.get(f"/public/onboarding/{token}/package/job_application/file")
    assert f.status_code == 200 and "Job Application Form" in _text(f.content)
    states = _states(world, h)
    assert states["nda"]["state"] == "completed" and states["job_description"]["state"] == "completed"
    assert states["self_disclosure"]["state"] == "available" and states["job_application"]["state"] == "awaiting_upload"
    from app.modules.hr import onboarding_flow
    prog = onboarding_flow.progress(world.db, h)
    assert prog["documents_total"] == 7, "voluntary and information documents are not counted"
    items = [i.title for c in h.checklists for i in c.items if not i.is_deleted]
    assert "Sign Non-Disclosure Agreement" in items and not any("Self-Disclosure" in t or "Velocity" in t for t in items)


def test_old_upload_requests_are_replaced_and_deleting_revokes_the_signing_link(world):
    from app.modules.hr import onboarding_flow
    assert world.put("a_admin", "/hr/onboarding/package/settings", json={**SETTINGS, "clauses": _all_clauses()}).status_code == 200
    h, token = _new_hire(world)
    assert onboarding_flow.request_documents(world.db, h, ["offer_letter", "id_proof"], notify=False)[0].category == "id_proof", \
        "package categories are never created as upload requests"
    stale = OnboardingDocument(organization_id=1, onboarding_new_hire_id=h.id, title="Offer Letter", category="offer_letter",
                               status="requested")
    world.db.add(stale)
    world.db.commit()
    world.put("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/inputs", json={"values": INPUTS})
    issued = {i["category"] for i in world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/send-package").json()["issued"]}
    assert "offer_letter" in issued, "a pre-package upload request is issued over, not mistaken for a sent document"
    world.db.refresh(stale)
    assert stale.document_id, "the old row now carries the issued offer letter"
    sign_url = next(d for d in world.client.get(f"/public/onboarding/{token}").json()["documents"] if d["id"] == stale.id)["sign_url"]
    sign_token = sign_url.rsplit("/", 1)[1]
    assert world.client.get(f"/public/documents/sign/{sign_token}").status_code == 200
    assert world.client.delete(f"/hr/onboarding/documents/{stale.id}", headers=world._h("a_admin")).status_code in (200, 204)
    assert world.client.get(f"/public/documents/sign/{sign_token}").status_code == 404, "the deleted letter can no longer be signed"
    again = world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/send-package").json()
    assert "offer_letter" in {i["category"] for i in again["issued"]}, "HR can reissue after deleting"


def test_a_signing_code_that_could_not_be_emailed_is_reported_not_claimed(world, monkeypatch):
    from app.services import email_service
    assert world.put("a_admin", "/hr/onboarding/package/settings", json={**SETTINGS, "clauses": _all_clauses()}).status_code == 200
    h, token = _new_hire(world)
    world.put("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/inputs", json={"values": INPUTS})
    world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/send-package")
    offer = next(d for d in world.client.get(f"/public/onboarding/{token}").json()["documents"] if d["category"] == "offer_letter")
    sign_token = offer["sign_url"].rsplit("/", 1)[1]
    monkeypatch.setattr(email_service, "send_document_sign_code_email", lambda *a, **k: False)
    r = world.client.post(f"/public/documents/sign/{sign_token}/otp")
    assert r.status_code == 503 and "could not e-mail" in r.text, r.text
    from app.modules.doc_templates.models import DocumentSignOtp
    assert all(o.consumed_at for o in world.db.query(DocumentSignOtp).all()), "the undelivered code cannot be used"


def test_company_logo_upload_validation_and_rendering(world):
    import io as _io
    from PIL import Image
    buf = _io.BytesIO()
    Image.new("RGB", (1800, 600), (11, 61, 145)).save(buf, "PNG")
    assert world.client.post("/hr/onboarding/package/logo", headers=world._h("a_admin"),
                             files={"file": ("logo.txt", b"not an image", "text/plain")}).status_code == 422
    assert world.client.post("/hr/onboarding/package/logo", headers=world._h("a_emp"),
                             files={"file": ("logo.png", buf.getvalue(), "image/png")}).status_code == 403
    r = world.client.post("/hr/onboarding/package/logo", headers=world._h("a_admin"),
                          files={"file": ("logo.png", buf.getvalue(), "image/png")})
    assert r.status_code == 200 and r.json()["settings"]["has_logo"] is True, r.text
    stored = world.get("a_admin", "/hr/onboarding/package/logo")
    assert stored.status_code == 200 and stored.headers["content-type"] == "image/png"
    assert Image.open(_io.BytesIO(stored.content)).size[0] <= 900, "scaled down"
    assert world.get("b_admin", "/hr/onboarding/package/logo").status_code == 404, "another tenant has no logo"
    # every generated document carries it instead of the placeholder box
    h, _token = _new_hire(world)
    pdf = world.get("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/offer_letter/preview.pdf").content
    assert "insert approved asset" not in _text(pdf)
    import fitz
    assert len(fitz.open(stream=pdf)[0].get_images()) >= 1
    assert world.client.delete("/hr/onboarding/package/logo", headers=world._h("a_admin")).json()["settings"]["has_logo"] is False
    pdf = world.get("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/offer_letter/preview.pdf").content
    assert "insert approved asset" in _text(pdf), "placeholder comes back"


def test_the_documents_list_api_carries_the_package_mode(world):
    """The Documents screen hides Approve/Reject and labels acknowledgements from this field (the response model must keep it)."""
    assert world.put("a_admin", "/hr/onboarding/package/settings", json={**SETTINGS, "clauses": _all_clauses()}).status_code == 200
    h, _token = _new_hire(world)
    world.put("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/inputs", json={"values": INPUTS})
    world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/send-package")
    body = world.get("a_admin", "/hr/onboarding/documents", params={"onboarding_record_id": h.id}).json()
    items = body if isinstance(body, list) else body["items"]
    modes = {d["category"]: d.get("package_mode") for d in items}
    assert modes["offer_letter"] == "SIGN" and modes["job_description"] == "ACKNOWLEDGE" and modes["daily_work_report"] == "INFO"


def test_a_completion_that_cannot_create_the_employee_leaves_the_hire_as_it_was(world, monkeypatch):
    from app.core.exceptions import BadRequestException
    from app.modules.hr import service
    h, token = _new_hire(world)
    world.put("a_admin", f"/hr/onboarding/new-hires/{h.id}", json={"status": "in_progress"})

    def refuse(*a, **k):
        raise BadRequestException("Your plan has no free seats.")
    monkeypatch.setattr(service, "_create_employee_from_onboarding", refuse)
    r = world.put("a_admin", f"/hr/onboarding/new-hires/{h.id}", json={"status": "completed", "force_complete": True})
    assert r.status_code == 400 and "seats" in r.text
    world.db.expire_all()
    hire = world.db.get(OnboardingNewHire, h.id)
    assert hire.status == "in_progress" and hire.completed_at is None and hire.employee_id is None, "not stranded as completed"
    assert world.client.get(f"/public/onboarding/{token}").status_code == 200, "the portal link still works"
    monkeypatch.undo()
    r = world.put("a_admin", f"/hr/onboarding/new-hires/{h.id}", json={"status": "completed", "force_complete": True})
    assert r.status_code == 200 and r.json()["status"] == "completed", "HR can complete once the cause is fixed"


def test_settings_changes_apply_to_new_documents_only_sent_ones_are_final(world):
    assert world.put("a_admin", "/hr/onboarding/package/settings", json={**SETTINGS, "clauses": {
        **_all_clauses(), "governing_law": {"text": "Old governing law wording."}}}).status_code == 200
    first, token = _new_hire(world)
    world.put("a_admin", f"/hr/onboarding/new-hires/{first.id}/package/inputs", json={"values": INPUTS})
    world.post("a_admin", f"/hr/onboarding/new-hires/{first.id}/send-package")
    world.client.put(f"/public/onboarding/{token}/details", json={"address": "5 River Road", "city": "York", "country": "UK"})
    nda = next(d for d in world.client.get(f"/public/onboarding/{token}").json()["documents"] if d["category"] == "nda")
    tok = nda["sign_url"].rsplit("/", 1)[1]

    # the org admin edits the wording again; the hire's own details change too
    r = world.put("a_admin", "/hr/onboarding/package/settings", json={"clauses": {"governing_law": {"text": "New governing law wording."}}})
    assert r.status_code == 200 and next(c for c in r.json()["clauses"] if c["key"] == "governing_law")["text"] == "New governing law wording."
    world.put("a_admin", f"/hr/onboarding/new-hires/{first.id}", json={"position": "Senior Analyst"})
    html = world.client.get(f"/public/documents/sign/{tok}").json()["html"]
    assert "Old governing law wording." in html and "New governing law wording." not in html, "a sent document never changes"
    assert "Senior Analyst" not in html
    assert "reissue" not in world.client.get("/openapi.json").text, "there is no way to regenerate a sent document"

    # a new employee gets the new wording
    second = OnboardingNewHire(organization_id=1, candidate_name="Sam Second", email="sam.second@example.com", position="Analyst",
                               joining_date=date.today() + timedelta(days=20), status="offer_accepted", work_country="GB")
    world.db.add(second)
    world.db.commit()
    world.put("a_admin", f"/hr/onboarding/new-hires/{second.id}/package/inputs", json={"values": INPUTS})
    preview = world.get("a_admin", f"/hr/onboarding/new-hires/{second.id}/package/nda/preview.pdf").content
    assert "New governing law wording." in _text(preview)


def test_documents_left_by_the_earlier_generator_count_as_not_sent_until_hr_presses_send(world):
    """The pre-package generator created all 10 by itself. They must not show as sent: HR's Send replaces them (a signed one stays)."""
    assert world.put("a_admin", "/hr/onboarding/package/settings", json={**SETTINGS, "clauses": _all_clauses()}).status_code == 200
    h, token = _new_hire(world)
    world.put("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/inputs", json={"values": {**INPUTS, "worker.postal_address": "1 Lane, York"}})
    from app.modules.doc_templates.models import TemplateDefinition
    from app.modules.doc_templates import state as _state
    legacy_nda = GeneratedDocument(document_number="ONB-NDA-OLD-1", organization_id=1, canonical_id="HR-CON-017", family_id="HR-CON",
                                   title="Non-Disclosure Agreement (NDA)", kind="AGREEMENT", legal_risk="L1", sensitivity="C2",
                                   output_mode="DOCUMENT", execution_mode="SIGN_EMPLOYEE", audience="COUNTERPARTY", approval_policy="L1",
                                   subject_type="new_hire", subject_id=h.id, recipient_name=h.candidate_name, recipient_email=h.email,
                                   requested_by=world.u["a_admin"].id, pdf_path="x")
    _state._set(legacy_nda, "ISSUED")
    world.db.add(legacy_nda)
    world.db.flush()
    for cat in C.CATEGORIES:                      # what the old generator left behind
        world.db.add(OnboardingDocument(organization_id=1, onboarding_new_hire_id=h.id, title=cat, category=cat, created_by="system",
                                        file_path="old.pdf", status="requested" if cat == "nda" else "approved",
                                        document_id=legacy_nda.id if cat == "nda" else None))
    world.db.commit()
    pkg = world.get("a_admin", f"/hr/onboarding/new-hires/{h.id}/package").json()
    assert all(d["state"] == "not_sent" for d in pkg["documents"]), [(d["category"], d["state"]) for d in pkg["documents"]]
    assert len(pkg["ready_to_send"]) == 10
    sent = world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/send-package").json()
    assert len(sent["issued"]) == 10 and sent["held"] == []
    world.db.refresh(legacy_nda)
    assert legacy_nda.status == "SUPERSEDED", "the old document is replaced, its link revoked"
    pkg = world.get("a_admin", f"/hr/onboarding/new-hires/{h.id}/package").json()
    assert not any(d["state"] == "not_sent" for d in pkg["documents"])
