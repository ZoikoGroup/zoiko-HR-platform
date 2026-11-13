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
    assert not any("ZOIKO" in r["source"].upper() for r in C.dictionary())


def test_package_order_ids_and_modes():
    assert [d["title"] for d in C.documents()] == [
        "Offer Letter", "Job Description", "Daily Key Performance Indicators", "Non-Disclosure Agreement", "Employment Contract",
        "Affidavit of Employment Exclusivity", "Self-Disclosure Declaration", "Job Application Form", "Daily Work Report (DWR)",
        "Project Velocity Report"]
    assert C.DOCS["offer_letter"]["template_id"] == "HR-HIR-011" and C.DOCS["employment_contract"]["template_id"] == "HR-CON-001"
    assert (C.DOCS["self_disclosure"]["sensitivity"], C.DOCS["self_disclosure"]["mode"]) == ("C3", "COMPLETE")
    assert {c for c, d in C.DOCS.items() if d["mode"] == "SIGN"} == {"offer_letter", "nda", "employment_contract",
                                                                     "exclusivity_affidavit"}


# v2: Noto Sans (needed for the rupee sign) sets slightly wider than Helvetica; the offer letter's budget is the v2 target of
# 2–3 pages (onboarding package v2 spec §6.1)
@pytest.mark.parametrize("cat,low,high", [
    ("offer_letter", 1, 3), ("job_description", 1, 2), ("daily_kpi", 1, 2), ("nda", 3, 4), ("employment_contract", 6, 10),
    ("exclusivity_affidavit", 1, 2), ("self_disclosure", 1, 2), ("job_application", 3, 4), ("daily_work_report", 1, 2),
    ("velocity_report", 1, 2)])
def test_page_budget_and_running_header_footer(cat, low, high):
    pdf = R.render_pdf(cat, R.RenderContext(mode="template", org_label="EXAMPLE HOLDINGS", effective_date="10 November 2026"))
    n = _pages(pdf)
    assert low <= n <= high, f"{cat}: {n} pages"
    text = _text(pdf)
    d = C.DOCS[cat]
    assert "EXAMPLE HOLDINGS | HR" in text and f"{d['template_id']} | v{C.PACKAGE_VERSION}" in text and "Private and Confidential" in text
    assert f"Page {n} of {n}" in text and "insert approved asset" in text
    assert R.DRAFT_STATUS in text and "DRAFT – NOT FOR ISSUE" in text


def test_rupee_sign_renders_in_the_embedded_noto_sans_font():
    """Helvetica has no U+20B9 and printed a box; v2 renders with the bundled Noto Sans, embedded in the PDF."""
    from pypdf import PdfReader
    ctx = R.RenderContext(mode="issue", values={"employment.pay_statement": "₹12,000 per month (gross)"}, org_label="EXAMPLE",
                          effective_date="6 July 2026")
    pdf = R.render_pdf("offer_letter", ctx)
    assert "₹12,000 per month (gross)" in _text(pdf)
    reader = PdfReader(io.BytesIO(pdf))
    for page in reader.pages:
        fonts = {k: str(v.get_object()["/BaseFont"]) for k, v in (page["/Resources"].get("/Font") or {}).items()}
        assert any("NotoSans" in f for f in fonts.values()), fonts
        # ReportLab's page preamble and empty table cells name its base font, but no text is ever drawn in Helvetica
        helv = [k for k, v in fonts.items() if v.endswith("Helvetica")]
        if helv:
            import re as _re
            stream = page.get_contents().get_data().decode("latin-1")
            drawn = _re.findall(r"%s [\d.]+ Tf[^E]*?\((.*?)\) Tj" % _re.escape(helv[0]), stream)
            assert not [t for t in drawn if t.strip()], drawn


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
    assert "Do you work exclusively" in sd and "list every other business or employer" in sd
    assert "false documents or incorrect information" in sd and "HR / Management Use Only" in sd
    assert "{{worker.full_name}}" in sd
    offer = _text(R.render_pdf("offer_letter", R.RenderContext(mode="template")))
    assert "accept the terms of engagement set out in this letter" in offer
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
          "employment.employment_type": "Full-time", "employment.reports_to": "Morgan Manager"}


# v2: the terms the rebuilt documents print beyond the v1 settings, and the test hires' role (tenant A only — tenant B stays
# empty so the neutrality checks keep their meaning)
V2_PROFILE = {"jurisdiction_country": "GB", "jurisdiction_city": "Leeds", "notice_period_value": 4,
              "notice_period_unit": "weeks", "non_solicit_post_termination_months": 6, "nda_non_solicit_months": 6}
ANALYST = {"title": "Analyst", "about": ["The Analyst turns data into decisions for the team."],
           "responsibility_groups": [{"heading": "Analysis", "bullets": ["Prepare weekly reports."]}],
           "offer_responsibilities": ["Analysis: prepare weekly reports for the team."],
           "contract_duties": "The Analyst prepares analysis and reports for the team.",
           "required_skills": ["SQL", "Spreadsheets"],
           "kpi_areas": [{"title": "Delivery", "bullets": ["Reports on time."], "success": "Every report is on time."}]}


@pytest.fixture(autouse=True)
def _v2_terms(world):
    from types import SimpleNamespace
    from app.modules.hr import company_profile, onboarding_profiles
    actor = SimpleNamespace(id=world.u["a_admin"].id, organization_id=1)
    company_profile.save_profile(world.db, actor, V2_PROFILE)
    onboarding_profiles.save_role(world.db, actor, "analyst", ANALYST)


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
    assert issued == {"offer_letter", "job_description", "daily_kpi", "self_disclosure", "job_application",
                      "velocity_report"}
    held = {x["category"]: x for x in body["held"]}
    assert set(held) == {"nda", "employment_contract", "exclusivity_affidavit", "daily_work_report"}
    assert "worker.address_inline" in held["nda"]["missing_fields"]
    assert held["exclusivity_affidavit"]["missing_fields"] == ["worker.address_inline"], "Schedule A is completed at signing"
    assert body["email_sent"] is True
    again = world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/send-package").json()
    assert again["issued"] == [], "a live document is never issued twice"

    offer = world.db.query(GeneratedDocument).filter_by(subject_type="new_hire", subject_id=h.id, canonical_id="HR-HIR-011").one()
    pdf = _text(storage.get_store().get(offer.pdf_path))
    assert "Tenant A Ltd" in pdf and "GBP 42,000 per year, paid monthly" in pdf
    assert "Legal risk level" not in pdf and "insert approved asset" not in pdf, "no internal control block or logo box"
    assert "{{" not in pdf and "DRAFT – NOT FOR ISSUE" not in pdf

    # candidate: portal shows modes; address releases NDA + contract; declaration releases the affidavit
    portal = world.client.get(f"/public/onboarding/{token}").json()
    modes = {d["category"]: d["package_mode"] for d in portal["documents"]}
    assert modes["job_description"] == "ACKNOWLEDGE" and modes["self_disclosure"] == "COMPLETE"
    assert set(portal["package"]["needs"]) == {"address", "outside_activities"}
    r = world.client.put(f"/public/onboarding/{token}/details",
                         json={"address": "5 River Road", "city": "York", "postal_code": "YO1 1AA", "country": "United Kingdom"})
    assert r.status_code == 200, r.text
    docs_now = {d["category"]: d for d in r.json()["documents"]}
    assert {"nda", "employment_contract", "exclusivity_affidavit"} <= set(docs_now), "the address releases all three"
    assert docs_now["exclusivity_affidavit"]["needs_declaration"] and docs_now["exclusivity_affidavit"]["sign_url"],         "the affidavit can be opened for signing straight away; its page asks for Schedule A first"
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
    assert v["needs_declaration"] is True, "the signing page asks for Schedule A itself"
    assert world.client.post(f"/public/documents/sign/{raw}/declaration", json={"none": False, "rows": []}).status_code == 422
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
    # the success page offers the next document of the package that still needs the signature (never the one just signed)
    nx = world.client.get(f"/public/documents/sign/{sign_token}/next")
    assert nx.status_code == 200, nx.text
    nx = nx.json()
    assert nx["in_package"] and nx["remaining"] >= 1 and nx["next"], nx
    assert nx["next"]["title"] not in ("Non-Disclosure Agreement", "Affidavit of Employment Exclusivity")
    assert world.client.get(f"/public/documents/sign/{nx['next']['token']}").json()["can_sign"] is True

    # acknowledge the job description (receipt, not signature)
    jd = next(d for d in r.json()["documents"] if d["category"] == "job_description")
    assert world.client.post(f"/public/onboarding/{token}/documents/{jd['id']}/acknowledge",
                             json={"text_version": "old"}).status_code == 422
    a = world.client.post(f"/public/onboarding/{token}/documents/{jd['id']}/acknowledge",
                          json={"text_version": P.ACK_TEXT_VERSION})
    assert a.status_code == 200 and next(d for d in a.json()["documents"] if d["id"] == jd["id"])["acknowledged_at"]

    # The application form and numbered self-disclosure declaration are completed in the portal.
    f = world.client.get(f"/public/onboarding/{token}/package/job_application/file")
    assert f.status_code == 200 and "Job Application Form" in _text(f.content)
    states = _states(world, h)
    assert states["nda"]["state"] == "completed" and states["job_description"]["state"] == "completed"
    assert states["self_disclosure"]["state"] == "awaiting_upload" and states["job_application"]["state"] == "awaiting_upload"
    from app.modules.hr import onboarding_flow
    prog = onboarding_flow.progress(world.db, h)
    assert prog["documents_total"] == 8, "information documents are not counted"
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
    from pypdf import PdfReader
    assert len(PdfReader(_io.BytesIO(pdf)).pages[0].images) >= 1, "the logo is embedded as an image"
    assert world.client.delete("/hr/onboarding/package/logo", headers=world._h("a_admin")).json()["settings"]["has_logo"] is False
    pdf = world.get("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/offer_letter/preview.pdf").content
    assert "insert approved asset" not in _text(pdf), "no logo: no placeholder box on a document for a real employee"


def test_the_documents_list_api_carries_the_package_mode(world):
    """The Documents screen hides Approve/Reject and labels acknowledgements from this field (the response model must keep it)."""
    assert world.put("a_admin", "/hr/onboarding/package/settings", json={**SETTINGS, "clauses": _all_clauses()}).status_code == 200
    h, _token = _new_hire(world)
    world.put("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/inputs", json={"values": INPUTS})
    world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/send-package")
    body = world.get("a_admin", "/hr/onboarding/documents", params={"onboarding_record_id": h.id}).json()
    items = body if isinstance(body, list) else body["items"]
    modes = {d["category"]: d.get("package_mode") for d in items}
    assert modes["offer_letter"] == "SIGN" and modes["job_description"] == "ACKNOWLEDGE"
    assert "daily_work_report" not in modes, "the DWR is not issued while its required manager data is missing"


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
    from app.modules.hr import company_profile
    company_profile.save_profile(world.db, world.u["a_admin"], {"governing_law_text": "Old governing law wording."})
    world.put("a_admin", f"/hr/onboarding/new-hires/{first.id}/package/inputs", json={"values": INPUTS})
    world.post("a_admin", f"/hr/onboarding/new-hires/{first.id}/send-package")
    world.client.put(f"/public/onboarding/{token}/details", json={"address": "5 River Road", "city": "York", "country": "UK"})
    nda = next(d for d in world.client.get(f"/public/onboarding/{token}").json()["documents"] if d["category"] == "nda")
    tok = nda["sign_url"].rsplit("/", 1)[1]

    # the org admin edits the wording again; the hire's own details change too
    r = world.put("a_admin", "/hr/onboarding/company-profile", json={"governing_law_text": "New governing law wording."})
    assert r.status_code == 200 and r.json()["profile"]["governing_law_text"] == "New governing law wording."
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


def test_a_new_hire_who_became_an_employee_signs_the_package_from_self_service(world):
    """Package documents are candidate documents; once linked to the employee they are signed from self-service, and the
    affidavit's Schedule A can be declared there (the portal may be gone by then)."""
    assert world.put("a_admin", "/hr/onboarding/package/settings", json={**SETTINGS, "clauses": _all_clauses()}).status_code == 200
    h, token = _new_hire(world)
    assert world.put("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/inputs", json={"values": INPUTS}).status_code == 200
    world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/send-package")
    assert world.client.put(f"/public/onboarding/{token}/details", json={"address": "5 River Road", "city": "York",
                            "postal_code": "YO1 1AA", "country": "United Kingdom"}).status_code == 200
    world.db.expire_all()
    P.link_documents_to_employee(world.db, world.db.get(OnboardingNewHire, h.id), world.u["a_emp"])

    mine = {d["canonical_id"]: d for d in world.get("a_emp", "/hr/me/generated-documents?per_page=50").json()["items"]}
    aff = mine["HR-CON-101"]
    assert aff["my_action"] == "sign" and aff["needs_declaration"] is True, aff
    assert all(d["my_action"] == "sign" for d in mine.values() if d["execution_mode"] == "SIGN_CANDIDATE" and d["status"] == "ISSUED")

    base = f"/hr/me/generated-documents/{aff['id']}"
    consent = world.get("a_emp", "/hr/me/generated-documents/statements").json()["consent"]["version"]
    body = lambda: {"typed_name": "Nora Newstarter", "method": "TYPED", "consent_version": consent, "otp_code": code(world)}  # noqa: E731
    assert world.post("a_emp", f"{base}/sign/otp").status_code == 200
    refused = world.post("a_emp", f"{base}/sign", json=body())
    assert refused.status_code == 409 and "Schedule A" in refused.text
    d = world.post("a_emp", f"{base}/declaration", json={"none": True, "rows": []})
    assert d.status_code == 200 and d.json()["needs_declaration"] is False, d.text
    assert world.post("a_emp", f"{base}/sign/otp").status_code == 200
    signed = world.post("a_emp", f"{base}/sign", json=body())
    assert signed.status_code == 200, signed.text
    assert signed.json()["status"] == "EXECUTED" and signed.json()["my_action"] is None
    world.db.expire_all()
    row = world.db.query(OnboardingDocument).filter_by(document_id=aff["id"]).one()
    assert row.status == "approved"
    assert world.post("a_emp2", f"{base}/declaration", json={"none": True}).status_code == 404, "only the recipient"


def _png() -> str:
    import base64
    from PIL import Image, ImageDraw
    img = Image.new("RGBA", (300, 90), (255, 255, 255, 0))
    ImageDraw.Draw(img).line([(10, 70), (80, 20), (150, 65), (290, 15)], fill=(20, 40, 120, 255), width=5)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def test_admins_see_every_signed_document_with_the_signature_itself(world):
    """Org admins list each new hire's signed documents with the signatures (drawn image or typed name), and the executed
    PDF now shows the signatures on their own page before the evidence certificate."""
    assert world.put("a_admin", "/hr/onboarding/package/settings", json={**SETTINGS, "clauses": _all_clauses()}).status_code == 200
    h, token = _new_hire(world)
    world.put("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/inputs", json={"values": INPUTS})
    world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/send-package")
    view = world.client.put(f"/public/onboarding/{token}/details", json={"address": "5 River Road", "city": "York",
                            "postal_code": "YO1 1AA", "country": "United Kingdom"}).json()
    docs = {d["category"]: d for d in view["documents"]}

    def sign(cat, method):
        tok = docs[cat]["sign_url"].rsplit("/", 1)[1]
        v = world.client.get(f"/public/documents/sign/{tok}").json()
        world.client.post(f"/public/documents/sign/{tok}/otp")
        body = {"typed_name": "Nora Newstarter", "method": method, "consent_version": v["consent"]["version"], "otp_code": code(world)}
        if method == "DRAWN":
            body["drawn_signature"] = _png()
        r = world.client.post(f"/public/documents/sign/{tok}/sign", json=body)
        assert r.status_code == 200, r.text

    sign("nda", "DRAWN")
    sign("employment_contract", "TYPED")

    r = world.get("a_admin", "/hr/onboarding/signed-documents")
    assert r.status_code == 200, r.text
    group = next(g for g in r.json()["items"] if g["new_hire_id"] == h.id)
    by_title = {d["title"]: d for d in group["documents"]}
    nda, contract = by_title["Non-Disclosure Agreement"], by_title["Employment Contract"]
    assert [d["title"] for d in group["documents"]].index("Non-Disclosure Agreement") < \
        [d["title"] for d in group["documents"]].index("Employment Contract"), "package order"
    s_nda, s_con = nda["signatures"][0], contract["signatures"][0]
    assert (s_nda["party"], s_nda["name"], s_nda["method"], s_nda["has_image"]) == ("Employee", "Nora Newstarter", "DRAWN", True)
    assert (s_con["method"], s_con["has_image"]) == ("TYPED", False) and nda["fully_signed"] and s_nda["otp_verified"]
    assert "Job Description" not in by_title, "only signed documents are listed"

    img = world.get("a_admin", f"/hr/onboarding/signatures/{s_nda['id']}/image")
    assert img.status_code == 200 and img.content.startswith(b"\x89PNG")
    assert world.get("a_admin", f"/hr/onboarding/signatures/{s_con['id']}/image").status_code == 404, "typed: no image"
    assert world.get("b_admin", f"/hr/onboarding/signatures/{s_nda['id']}/image").status_code == 404, "other organisation"
    assert all(g["new_hire_id"] != h.id for g in world.get("b_admin", "/hr/onboarding/signed-documents").json()["items"])
    assert world.get("a_emp", "/hr/onboarding/signed-documents").status_code == 403
    only = world.get("a_admin", f"/hr/onboarding/signed-documents?new_hire_id={h.id}").json()["items"]
    assert [g["new_hire_id"] for g in only] == [h.id]

    # the executed PDF: original pages, then the signatures page, then the evidence certificate
    from pypdf import PdfReader
    gen = world.db.get(GeneratedDocument, nda["id"])
    executed = storage.get_store().get(gen.executed_pdf_path)
    pages = [" ".join((pg.extract_text() or "").split()) for pg in PdfReader(io.BytesIO(executed)).pages]
    sig_page = next(i for i, t in enumerate(pages) if t.startswith("Signatures"))
    cert_page = next(i for i, t in enumerate(pages) if "Electronic Signature Evidence Certificate" in t and not t.startswith("Signatures"))
    assert sig_page < cert_page and sig_page == _pages(storage.get_store().get(gen.pdf_path))
    assert "Nora Newstarter" in pages[sig_page] and "EMPLOYEE" in pages[sig_page] and "Drawn signature" in pages[sig_page]
    assert PdfReader(io.BytesIO(executed)).pages[sig_page].images, "the drawn signature image is on the page"
    typed_pdf = storage.get_store().get(world.db.get(GeneratedDocument, contract["id"]).executed_pdf_path)
    assert "Typed signature" in _text(typed_pdf)


def test_previews_show_the_document_as_sent_and_the_signed_copy_once_signed(world):
    """HR's Documents-page preview, the package panel's Preview and the new hire's portal download all serve the document
    from the document store: the issued original before signing, the signed copy (signatures page + certificate) after."""
    assert world.put("a_admin", "/hr/onboarding/package/settings", json={**SETTINGS, "clauses": _all_clauses()}).status_code == 200
    h, token = _new_hire(world)
    world.put("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/inputs", json={"values": INPUTS})
    world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/send-package")
    view = world.client.put(f"/public/onboarding/{token}/details", json={"address": "5 River Road", "city": "York",
                            "postal_code": "YO1 1AA", "country": "United Kingdom"}).json()
    nda = next(d for d in view["documents"] if d["category"] == "nda")
    listed = next(d for d in world.get("a_admin", f"/hr/onboarding/documents?onboarding_record_id={h.id}").json()
                  if d["id"] == nda["id"])
    assert listed["file_url"] == f"/hr/onboarding/documents/{nda['id']}/file"

    def views():
        return (world.get("a_admin", f"/hr/onboarding/documents/{nda['id']}/file"),
                world.get("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/nda/preview.pdf"),
                world.client.get(f"/public/onboarding/{token}/documents/{nda['id']}/file"))

    for r in views():                                       # sent, not signed yet: the issued original
        assert r.status_code == 200 and r.headers["content-type"] == "application/pdf", r.text[:200]
        assert "Non-Disclosure Agreement" in _text(r.content) and "Electronic Signature Evidence Certificate" not in _text(r.content)

    tok = nda["sign_url"].rsplit("/", 1)[1]
    v = world.client.get(f"/public/documents/sign/{tok}").json()
    world.client.post(f"/public/documents/sign/{tok}/otp")
    assert world.client.post(f"/public/documents/sign/{tok}/sign", json={"typed_name": "Nora Newstarter", "method": "TYPED",
                             "consent_version": v["consent"]["version"], "otp_code": code(world)}).status_code == 200

    for r in views():                                       # signed: the executed copy with the signatures
        assert r.status_code == 200, r.text[:200]
        text = _text(r.content)
        assert "Signatures" in text and "Nora Newstarter" in text and "Electronic Signature Evidence Certificate" in text
        assert "(signed).pdf" in r.headers["content-disposition"] or "preview" in r.headers["content-disposition"]
    assert world.get("b_admin", f"/hr/onboarding/documents/{nda['id']}/file").status_code == 404, "other organisation"


def test_only_the_onboarding_settings_supply_company_information(world):
    """Real hires: every employer detail comes from Onboarding › Settings › Offer package, never from the organisation
    record (here "Tenant A Ltd"); issued documents carry no template furniture (logo box, control block) and the forms
    have real empty tick boxes."""
    from pypdf import PdfReader
    h0, _t0 = _new_hire(world)
    held = P.readiness(P.render_context(world.db, h0, "offer_letter", final=True), "offer_letter")
    assert not held["ready"] and {"company.legal_name", "employer.signatory_name", "employer.hr_contact"} <= set(held["missing_fields"]), \
        "nothing saved yet: held, never filled from the organisation record"
    assert P.get_config(world.db, 1)["legal_name"] == "" and P.header_label(P.get_config(world.db, 1)) == ""

    company = {**SETTINGS, "legal_name": "Brightwave Analytics Ltd", "registered_address": "22 Market Street, Manchester M1 1AA",
               "hr_contact_email": "people@brightwave.example.com"}
    assert world.put("a_admin", "/hr/onboarding/package/settings", json={**company, "clauses": _all_clauses()}).status_code == 200
    h, token = _new_hire(world)
    world.put("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/inputs", json={"values": INPUTS})
    world.client.put(f"/public/onboarding/{token}/details", json={"address": "5 River Road", "city": "York",
                     "postal_code": "YO1 1AA", "country": "United Kingdom"})
    world.db.refresh(h)
    for cat in C.CATEGORIES:
        ctx = P.render_context(world.db, h, cat, final=True, secure_link="https://app.example.com/p", contract_id="HR-CON-001-2026-000001")
        assert not ctx.draft, (cat, P.readiness(ctx, cat))
        pdf = R.render_pdf(cat, ctx)
        text = " ".join(_text(pdf).split())
        html = R.render_html(cat, ctx)
        for out, what in ((text, "pdf"), (html, "html")):
            assert "BRIGHTWAVE ANALYTICS LTD | HR" in out, (cat, what)
            for banned in ("Tenant A", "TENANT A", "ZOIKO", "Zoiko Group", "ZG-ENG", "ZHR-1042", "insert approved asset",
                           "Legal risk level", "Sensitivity level", "{{"):
                assert banned not in out, (cat, what, banned)
        if cat in ("self_disclosure", "job_application", "velocity_report"):
            assert PdfReader(io.BytesIO(pdf)).pages[0].images, f"{cat}: tick boxes are drawn as empty squares"
            assert "ZapfDingbats" not in pdf.decode("latin-1"), f"{cat}: the old shadowed-box glyph printed as a black square"
    assert "Brightwave Analytics Ltd" in _text(R.render_pdf("offer_letter", P.render_context(world.db, h, "offer_letter", final=True)))


def test_a_revoked_link_cannot_reach_the_hires_other_documents(world):
    """HR re-issuing a link revokes the old one (marked used). The follow-up endpoints (next document, PDF, submit) accept a
    used link only when the candidate signed or declined with it, so a leaked old link gets nothing."""
    from app.modules.doc_templates import signing as _signing
    assert world.put("a_admin", "/hr/onboarding/package/settings", json={**SETTINGS, "clauses": _all_clauses()}).status_code == 200
    h, token = _new_hire(world)
    world.put("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/inputs", json={"values": INPUTS})
    world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/send-package")
    view = world.client.put(f"/public/onboarding/{token}/details", json={"address": "5 River Road", "city": "York",
                            "postal_code": "YO1 1AA", "country": "United Kingdom"}).json()
    nda = next(d for d in view["documents"] if d["category"] == "nda")
    leaked = nda["sign_url"].rsplit("/", 1)[1]
    gen = world.db.get(GeneratedDocument, nda["document_id"])
    _signing.issue_candidate_token(world.db, gen)          # HR re-issues: the old link is revoked
    world.db.commit()
    for path in ("next", "pdf"):
        assert world.client.get(f"/public/documents/sign/{leaked}/{path}").status_code == 404, path
    assert world.client.post(f"/public/documents/sign/{leaked}/submit-package").status_code == 404
    assert world.client.get(f"/public/documents/sign/{leaked}").status_code == 404


def test_the_hire_cannot_submit_while_documents_are_held_or_declined(world):
    # HR's settings lack wording only the contract uses: the contract is held (not the hire's doing)
    contract_only = {"working_time"}                       # a required clause only the Employment Contract uses
    clauses = {k: v for k, v in _all_clauses().items() if k not in contract_only}
    assert world.put("a_admin", "/hr/onboarding/package/settings", json={**SETTINGS, "clauses": clauses}).status_code == 200
    h, token = _new_hire(world)
    world.put("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/inputs", json={"values": INPUTS})
    world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/send-package")
    world.client.put(f"/public/onboarding/{token}/details", json={"address": "5 River Road", "city": "York",
                     "postal_code": "YO1 1AA", "country": "United Kingdom"})
    out = world.client.get(f"/public/onboarding/{token}").json()["submission"]["outstanding"]
    assert {"title": "Employment Contract", "action": "wait for HR to send"} in out, out
    assert world.client.post(f"/public/onboarding/{token}/submit-signed-package").status_code == 409

    # a declined agreement blocks the submission too
    nda = next(d for d in world.client.get(f"/public/onboarding/{token}").json()["documents"] if d["category"] == "nda")
    tok = nda["sign_url"].rsplit("/", 1)[1]
    assert world.client.post(f"/public/documents/sign/{tok}/decline", json={"reason": "Wrong address"}).status_code == 200
    out = world.client.get(f"/public/onboarding/{token}").json()["submission"]["outstanding"]
    assert {"title": "Non-Disclosure Agreement", "action": "contact HR about"} in out, out


def test_submit_details_treats_an_explicit_null_as_missing(world):
    _h, token = _new_hire(world)
    r = world.client.put(f"/public/onboarding/{token}/details", json={"phone": "+44 7700 900123", "address": None, "city": "York",
                         "country": "United Kingdom", "postal_code": "YO1 1AA", "submit": True})
    assert r.status_code == 422 and "address" in r.text, r.text
