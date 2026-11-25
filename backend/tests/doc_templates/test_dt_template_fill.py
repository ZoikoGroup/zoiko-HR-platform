"""Template filling of the onboarding documents (QA rounds R1/R2): every placeholder an offer letter or NDA uses is filled from
the hire, the offer, the Company Profile and the signatory — {{tokens}}, template [Brackets] and "Name: ____" lines — and what
is still missing is named in words, never printed as a raw placeholder."""
import io
import re
from datetime import date, timedelta
from types import SimpleNamespace

from app.modules.doc_templates import package_blocks as PB
from app.modules.doc_templates import renderer
from app.modules.hr import company_profile as CP
from app.modules.hr import docs_setup as DS
from app.modules.hr import docx_import
from app.modules.hr import onboarding_package as P
from app.modules.hr import onboarding_package_content as C
from app.modules.hr import onboarding_package_render as R
from app.modules.hr import onboarding_profiles
from app.modules.hr.models import OnboardingNewHire

PLACEHOLDER = re.compile(r"\{\{|\}\}|\[[A-Za-z][^\]\n]{0,400}\]")


def _png(w=240, h=80) -> bytes:
    from PIL import Image, ImageDraw
    im = Image.new("RGBA", (w, h), (255, 255, 255, 0))
    ImageDraw.Draw(im).line((10, h - 20, w - 10, 15), fill=(10, 30, 120, 255), width=4)
    out = io.BytesIO()
    im.save(out, "PNG")
    return out.getvalue()


def _text(pdf: bytes) -> str:
    return " ".join(renderer.pdf_text(pdf).split())


def _leftovers(text: str) -> list:
    return [text[max(0, m.start() - 40):m.end() + 40] for m in PLACEHOLDER.finditer(text)]


# ── 1. the platform offer letter and NDA, filled from complete records ─────────────────────────────────────────────

PROFILE = {
    "legal_name": "Zoiko Test Industries Private Limited", "short_name": "Zoiko Test Industries",
    "address_line1": "17, 2nd Floor, 7th Main Road", "address_line2": "II Stage, Indiranagar", "city": "Bengaluru",
    "state": "Karnataka", "postal_code": "560038", "country": "IN", "website": "https://zoiko-test.example.com",
    "hr_contact_name": "Harper People", "hr_contact_email": "hr@tenant-a.example.com",
    "signatory_name": "Dana Director", "signatory_title": "Managing Director",
    "jurisdiction_country": "IN", "jurisdiction_city": "Bengaluru",
    "notice_period_value": 30, "notice_period_unit": "calendar_days", "employer_notice_value": 30,
    "employer_notice_unit": "calendar_days", "non_solicit_post_termination_months": 12, "nda_non_solicit_months": 12,
    "reports_email": "reports@tenant-a.example.com", "onboarding_return_email": "hr@tenant-a.example.com",
}
ROLE = {"title": "Software Developer", "about": ["Builds and runs the product."],
        "responsibility_groups": [{"heading": "Delivery", "bullets": ["Ship tested code."]}],
        "offer_responsibilities": ["Delivery: ship tested code every week."],
        "contract_duties": "The Software Developer designs, builds and tests the product.",
        "required_skills": ["Python"], "kpi_areas": [{"title": "Delivery", "bullets": ["Weekly releases."],
                                                       "success": "Every release ships on time."}]}


def _complete_hire(world):
    db = world.db
    actor = SimpleNamespace(id=world.u["a_admin"].id, organization_id=1)
    CP.save_profile(db, actor, PROFILE)
    clauses = {k: {"text": f"Counsel wording for {k}.", "counsel_reference": "Test counsel"}
               for k, (_t, _n, req) in C.CLAUSES.items()}
    P.save_config(db, actor, {"leave_entitlement": "18 days plus public holidays", "post_employment_period": "two years",
                              "pay_frequency": "monthly", "benefits_reference": "the benefits guide", "clauses": clauses})
    onboarding_profiles.save_role(db, actor, "software-developer", ROLE)
    h = OnboardingNewHire(organization_id=1, candidate_name="Siddartha Rao", email="siddartha@example.com",
                          position="Software Developer", joining_date=date.today() + timedelta(days=10),
                          status="offer_accepted", work_country="IN", manager_id=world.u["a_manager"].id,
                          employment_type="full_time",
                          profile_details={"address": "12 Lake Road", "city": "Hyderabad", "state": "Telangana",
                                           "postal_code": "500001", "country": "IN"})
    db.add(h)
    db.commit()
    P.save_hire_inputs(db, h, {"employment.work_location": "Remote (India)", "employment.working_hours": "45 hours per week",
                               "employment.base_pay": "600000", "job.role_purpose": "Builds the product.",
                               "employment.reports_to": "Morgan Lead", "role_profile_slug": "software-developer",
                               "worker.degree": "B.Tech Computer Science", "worker.institution": "Osmania University",
                               "employment.next_stage_title": "Associate Engineer"})
    return h


def test_offer_letter_and_nda_with_complete_data_have_no_placeholders_left(world):
    h = _complete_hire(world)
    for cat in ("offer_letter", "nda"):
        ctx = P.render_context(world.db, h, cat, final=True, secure_link="https://app.example.com/portal/t0k3n",
                               contract_id="CON-1")
        gaps = P.readiness(ctx, cat)
        assert gaps["ready"], (cat, gaps)
        html = R.render_html(cat, ctx)
        body = re.sub(r"<[^>]+>", " ", html.split("<body>", 1)[1])
        assert not _leftovers(body), (cat, _leftovers(body))
        text = _text(R.render_pdf(cat, ctx))
        assert not _leftovers(text) and "Missing:" not in text, (cat, _leftovers(text))
        assert "Dana Director" in text and "Zoiko Test Industries Private Limited" in text
    nda = _text(R.render_pdf("nda", P.render_context(world.db, h, "nda", final=True)))
    assert "17, 2nd Floor, 7th Main Road" in nda, "company.address_inline is filled from the Company Profile (R2-7)"
    assert "12 Lake Road" in nda, "worker.address_inline is filled from the hire's address (R2-7)"


def test_a_missing_value_is_named_never_printed_as_a_raw_token(world):
    ctx = R.RenderContext(mode="issue", values={"worker.full_name": "Siddartha Rao"})
    import html as _h
    markup, _ = R.inline("Dear {{worker.full_name}}, you live at {{worker.address_inline}}. {{clause:remedies}}", ctx, "html")
    markup = _h.unescape(markup)
    assert "{{" not in markup and "Siddartha Rao" in markup
    assert f"Missing: {C.FIELDS['worker.address_inline'][0]}" in markup
    assert f"Missing: {C.CLAUSES['remedies'][0]}" in markup
    tpl, _ = R.inline("{{worker.address_inline}}", R.RenderContext(mode="template"))
    assert "{{worker.address_inline}}" in tpl, "the blank template set still shows the placeholder itself"


META = {"category": "x", "title": "T", "template_id": "T", "orientation": "portrait", "doc_type": "", "risk": "", "sensitivity": ""}


def test_table_header_cells_are_filled_like_any_other_cell():
    """An imported table's first row is printed as the header row: "Position | {{…}}" there was never filled (R1-6, R1-8)."""
    content = [{"t": "table", "headers": ["Position", "{{employment.position_title}}"],
                "rows": [["Start Date", "{{employment.start_date_long}}"]]},
               {"t": "table", "headers": ["{{employer.signatory_name}} Name:", "Recipient"], "rows": [["", ""]]}]
    ctx = R.RenderContext(mode="issue", content=content, meta=META,
                          values={"employment.position_title": "Software Developer",
                                  "employment.start_date_long": "Friday, 20 November 2026", "employer.signatory_name": "Dana Director"})
    html = R.render_html("x", ctx)
    assert "Software Developer" in html and "Friday, 20 November 2026" in html and "Dana Director" in html
    assert "{{" not in html.split("<body>", 1)[1]
    text = _text(R.render_pdf("x", ctx))
    assert "Software Developer" in text and "Dana Director" in text and "{{" not in text


def test_the_signatory_signature_is_printed_in_the_employer_cell_and_under_the_sign_off():
    from pypdf import PdfReader
    sig = _png()
    content = [{"t": "p", "text": "Warm regards,"}, {"t": "p", "text": "{{employer.signature}}"},
               {"t": "signature", "rows": [["For {{company.legal_name}}", "{{employer.signatory_name}}", "Director", "1 May 2026"],
                                           ["Employee", "{{worker.full_name}}", "", ""]]}]
    meta = META
    values = {"company.legal_name": "Zoiko Test Industries", "employer.signatory_name": "Dana Director",
              "worker.full_name": "Siddartha Rao"}
    with_sig = R.RenderContext(mode="issue", content=content, meta=meta, values=values, signature_png=sig)
    without = R.RenderContext(mode="issue", content=content, meta=meta, values=values)

    def images(pdf):
        return sum(len(p.images) for p in PdfReader(io.BytesIO(pdf)).pages)
    for part in (content[:2], content[2:]):          # under the sign-off, and in the employer's signature cell
        assert images(R.render_pdf("x", R.RenderContext(mode="issue", content=part, meta=meta, values=values,
                                                        signature_png=sig))) == 1
    assert images(R.render_pdf("x", without)) == 0
    html = R.render_html("x", with_sig)
    assert html.count('alt="Signature"') == 2 and "{{employer.signature}}" not in html
    assert "____________________" in R.render_html("x", without), "no signature uploaded: a line to sign on"
    from docx import Document
    from app.modules.hr import onboarding_package_docx as D
    assert len(Document(io.BytesIO(D.render_docx("x", with_sig))).inline_shapes) == 2


def test_signature_upload_is_stored_and_reaches_the_render_context(world):
    r = world.client.post("/hr/onboarding/package/signature", files={"file": ("sig.png", _png(), "image/png")},
                          headers=world._h("a_admin"))
    assert r.status_code == 200, r.text
    assert r.json()["settings"]["has_signature"] is True and "signature_key" not in r.json()["settings"]
    got = world.get("a_admin", "/hr/onboarding/package/signature")
    assert got.status_code == 200 and got.headers["content-type"] == "image/png"
    assert world.get("b_admin", "/hr/onboarding/package/signature").status_code == 404, "another tenant has no signature"
    h = _complete_hire(world)
    assert P.render_context(world.db, h, "nda", final=True).signature_png
    assert world.delete("a_admin", "/hr/onboarding/package/signature").json()["settings"]["has_signature"] is False


def test_a_label_is_never_taken_for_the_signatory_name(world):
    """R2-6: "Candidate Signature" (a label from a template's signature block) was saved as the signatory's name."""
    for label in ("Candidate Signature", "Name", "Recipient", "Authorised Signatory Name"):
        assert P.real_person_name(label) is None, label
    assert P.real_person_name("Dana Director") == "Dana Director"
    r = world.put("a_admin", "/hr/onboarding/company-profile", json={"signatory_name": "Candidate Signature"})
    assert r.status_code == 422 and "signatory_name" in r.text
    # a label already stored is treated as missing (the document is held), never printed
    h = _complete_hire(world)
    from app.modules.hr.models import OrganizationConfig
    import json
    row = world.db.query(OrganizationConfig).filter_by(organization_id=1, key=CP.PROFILE_KEY).first()
    stored = json.loads(row.value)
    stored["signatory_name"] = "Candidate Signature"
    row.value = json.dumps(stored)
    world.db.commit()
    ctx = P.render_context(world.db, h, "nda", final=True)
    assert "employer.signatory_name" in P.readiness(ctx, "nda")["missing_fields"]
    assert "Candidate Signature" not in _text(R.render_pdf("nda", ctx))


def test_template_blank_values_come_from_the_hire_offer_and_engagement(world):
    h = _complete_hire(world)
    values = P.build_values(world.db, h, P.get_config(world.db, 1))
    assert values["worker.degree"] == "B.Tech Computer Science" and values["worker.institution"] == "Osmania University"
    assert values["worker.place"] == "Hyderabad" and values["employment.next_stage_title"] == "Associate Engineer"
    assert P._add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)
    # the assessment's end: HR's date for this hire wins over the engagement profile's length
    P.save_hire_inputs(world.db, h, {**P.hire_inputs(h), "employment.assessment_end_date": "2026-12-19"})
    assert "19 December 2026" in P.build_values(world.db, h, P.get_config(world.db, 1))["employment.assessment_end_date"]


# ── 2. an organisation's own Word template through Set up docs: every blank becomes its placeholder ──────────────────

def _zoiko_style_offer_docx() -> bytes:
    from docx import Document
    d = Document()
    d.add_paragraph("Dear [Associate Full Name],")
    p = d.add_paragraph()
    p.add_run("Following your recent profile review, we are pleased to move forward with your onboarding into the Zoiko "
              "Ascend Program with ")
    p.add_run("Zoiko Test Industries Private Limited").bold = True
    p.add_run(" as an [Role].")
    p = d.add_paragraph()
    p.add_run("Your engagement will begin with a practical ")
    p.add_run("30-Day Live-Fire Assessment").bold = True
    p.add_run(" starting on [Start Date].")
    d.add_paragraph("Associateship Details")
    t = d.add_table(rows=3, cols=2)
    for r, (k, v) in enumerate((("Position", "[Role]"), ("Start Date", "[Start Date]"), ("Program", "Zoiko Ascend Program"))):
        t.rows[r].cells[0].text, t.rows[r].cells[1].text = k, v
    t = d.add_table(rows=2, cols=2)
    for r, (k, v) in enumerate((("Degree", "[Degree]"), ("Institution", "[Institution]"))):
        t.rows[r].cells[0].text, t.rows[r].cells[1].text = k, v
    d.add_paragraph("Phase 1: 30-Day Live-Fire Assessment")
    d.add_paragraph("Period: [Start Date] - [End Date]")
    d.add_paragraph("Focus: [Role-specific focus areas, e.g. test execution, test case design, defect reporting, operational fit]")
    d.add_paragraph("Phase 2: [Phase 2 Title] Full-Time Associateship")
    d.add_paragraph("Warm regards,")
    d.add_paragraph("____________________")
    d.add_paragraph("Human Resources")
    t = d.add_table(rows=1, cols=2)
    t.rows[0].cells[0].text = "For Zoiko Test Industries\nName: __________\nDate: __________"
    t.rows[0].cells[1].text = "Recipient\nName: __________\nPlace: __________"
    out = io.BytesIO()
    d.save(out)
    return out.getvalue()


def _through_set_up_docs(data: bytes, signed=True) -> list:
    chunks = [{**c, "id": f"c{i}"} for i, c in enumerate(DS._docx_chunks(data), 1)]
    placeholders = DS.blank_placeholders(chunks)
    blocks = docx_import.convert(data)["blocks"]
    blocks = DS._apply_placeholders(blocks, placeholders)
    blocks = DS._party_line_blanks(blocks, signed=signed)
    blocks = DS._unknown_placeholders_cleared(blocks)
    blocks = DS._blanks_as_lines(blocks)
    return blocks


def test_an_uploaded_offer_letter_maps_every_blank_to_the_hires_data():
    blocks = _through_set_up_docs(_zoiko_style_offer_docx())
    flat = repr(blocks)
    for token in ("worker.full_name", "employment.position_title", "employment.start_date_long", "worker.degree",
                  "worker.institution", "employment.assessment_end_date", "employment.next_stage_title",
                  "employer.signature", "employer.signatory_name", "worker.place"):
        assert "{{%s}}" % token in flat, token
    def strings(o):
        if isinstance(o, str):
            yield o
        elif isinstance(o, list):
            for x in o:
                yield from strings(x)
        elif isinstance(o, dict):
            for x in o.values():
                yield from strings(x)
    assert not any(DS._BRACKET.search(t) or DS._LONG_BRACKET.search(t) for t in strings(blocks)), \
        "no template bracket is left (the long Focus instruction became a line to fill)"
    table = next(b for b in blocks if b["type"] == "table")
    assert table["columns"] == ["Position", "{{employment.position_title}}"], "the label in the cell to the left finds its blank"
    assert "as an {{employment.position_title}}" in flat, "a bold label before the blank still finds it"
    assert "starting on {{employment.start_date_long}}" in flat
    assert "Period: {{employment.start_date_long}} - {{employment.assessment_end_date}}" in flat

    values = {"worker.full_name": "Siddartha Rao", "employment.position_title": "Software Developer",
              "employment.start_date_long": "Friday, 20 November 2026", "worker.degree": "B.Tech",
              "worker.institution": "Osmania University", "employment.assessment_end_date": "Saturday, 19 December 2026",
              "employment.next_stage_title": "Associate Engineer", "employer.signatory_name": "Dana Director",
              "worker.place": "Hyderabad", "employer.signature": ""}
    ctx = R.RenderContext(mode="issue", content=PB.to_package(blocks), values=values, signature_png=_png(),
                          meta={**META, "category": "org:1", "title": "Offer", "template_id": "ORG1-DOC-001"})
    text = _text(R.render_pdf("org:1", ctx))
    assert not _leftovers(text) and "Missing:" not in text, _leftovers(text)
    for v in ("Software Developer", "Friday, 20 November 2026", "Osmania University", "Associate Engineer", "Dana Director",
              "Hyderabad", "Saturday, 19 December 2026"):
        assert v in text, v


def test_party_lines_follow_the_party_above_them():
    blocks = DS._party_line_blanks([
        {"type": "paragraph", "text": "For Zoiko Industries Name: _____ Date: _____ Place: _____"},
        {"type": "heading", "text": "Recipient", "level": 3},
        {"type": "paragraph", "text": "Name: ______"},
        {"type": "paragraph", "text": "Place: ______ Date: ______"},
    ])
    assert blocks[0]["text"] == "For Zoiko Industries Name: {{employer.signatory_name}} Date: _____ Place: _____"
    assert blocks[2]["text"] == "Name: {{worker.full_name}}"
    assert blocks[3]["text"] == "Place: {{worker.place}} Date: ______", "the date stays a line for the day it is signed"
    acknowledged = DS._party_line_blanks([{"type": "paragraph", "text": "Employee Name: ___ Place: ___"}], signed=False)
    assert acknowledged[0]["text"] == "Employee Name: {{worker.full_name}} Place: ___"


def test_a_template_uploaded_as_a_hires_offer_letter_is_refused(world):
    """R2-3/R2-5: a blank template uploaded as one hire's NDA reached them with "[DD Month YYYY]", "[Address]" unfilled."""
    from docx import Document
    d = Document()
    d.sections[0].header.paragraphs[0].text = "[Registered Office Address] | [Website]"
    d.add_paragraph("This NDA is made on [DD Month YYYY] between the Company and [Associate Full Name], residing at [Address].")
    d.add_paragraph("Received: [Yes / No]  [x]")
    buf = io.BytesIO()
    d.save(buf)
    blanks = DS.unfilled_template_blanks(buf.getvalue(), "nda.docx")
    assert {"[DD Month YYYY]", "[Associate Full Name]", "[Address]", "[Registered Office Address]", "[Website]"} <= set(blanks)
    assert not any("Yes" in b for b in blanks) and "[x]" not in blanks
    h = OnboardingNewHire(organization_id=1, candidate_name="Siddartha Rao", email="s@example.com", position="Dev",
                          joining_date=date.today(), status="offer_accepted", work_country="IN")
    world.db.add(h)
    world.db.commit()
    r = world.client.post("/hr/onboarding/documents", data={"title": "NDA", "category": "nda", "onboarding_record_id": str(h.id)},
                          files={"file": ("nda.docx", buf.getvalue(),
                                          "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
                          headers=world._h("a_admin"))
    assert r.status_code == 422 and "[DD Month YYYY]" in r.text, r.text
    filled = Document()
    filled.add_paragraph("This NDA is made on 20 November 2026 between the Company and Siddartha Rao.")
    ok = io.BytesIO()
    filled.save(ok)
    assert DS.unfilled_template_blanks(ok.getvalue(), "nda.docx") == []


def test_signing_page_shows_the_company_profile_name_and_logo(world):
    actor = SimpleNamespace(id=world.u["a_admin"].id, organization_id=1)
    CP.save_profile(world.db, actor, {"legal_name": "Zoiko Test Industries Private Limited"})
    assert P.public_branding(world.db, 1) == ("Zoiko Test Industries Private Limited", None)
    assert world.client.post("/hr/onboarding/package/logo", files={"file": ("l.png", _png(), "image/png")},
                             headers=world._h("a_admin")).status_code == 200
    name, logo = P.public_branding(world.db, 1)
    assert name == "Zoiko Test Industries Private Limited" and logo.startswith("data:image/png;base64,")
    assert P.public_branding(world.db, 2) == ("", None), "another tenant's branding is its own"


def test_an_uploaded_nda_fills_company_and_recipient_details():
    """R2-3, R2-5, R2-7: the NDA's date, company address and website, the recipient's name and address, and the recipient's
    name and place in the signature block come from the records."""
    from docx import Document
    d = Document()
    d.add_paragraph("[Registered Office Address] | [Website]")
    p = d.add_paragraph()
    p.add_run("This Non-Disclosure Agreement is made on ")
    p.add_run("[DD Month YYYY]").bold = True
    p.add_run(" between ")
    p.add_run("Zoiko Test Industries Private Limited").bold = True
    p.add_run(', having its registered office at [Address] (the "Company"), and [Associate Full Name], residing at [Address] '
              '(the "Recipient").')
    d.add_paragraph("The obligations continue for [3] years after the engagement ends.")
    t = d.add_table(rows=1, cols=2)
    t.rows[0].cells[0].text = "For Zoiko Test Industries\nName: __________\nDate: __________\nPlace: __________"
    t.rows[0].cells[1].text = "Recipient\nName: __________\nDate: __________\nPlace: __________"
    buf = io.BytesIO()
    d.save(buf)
    blocks = _through_set_up_docs(buf.getvalue())
    values = {"company.address_inline": "17, 7th Main Road, Bengaluru-560038, India", "company.website": "https://zoiko.example.com",
              "document.issue_date": "20 November 2026", "worker.full_name": "Siddartha Rao",
              "worker.address_inline": "12 Lake Road, Hyderabad", "employer.signatory_name": "Dana Director",
              "worker.place": "Hyderabad"}
    ctx = R.RenderContext(mode="issue", content=PB.to_package(blocks), values=values,
                          meta={**META, "category": "org:2", "title": "NDA", "template_id": "ORG1-DOC-002"})
    text = _text(R.render_pdf("org:2", ctx))
    assert not _leftovers(text) and "Missing:" not in text, _leftovers(text)
    for v in values.values():
        assert v in text, v
    assert "for 3 years" in text
    assert text.count("Name: Dana Director") == 1 and text.count("Name: Siddartha Rao") == 1
    assert text.count("Place: Hyderabad") == 1, "the company's place of signing is not the hire's"
