"""Build prompt §13, end to end through the HTTP API with the synthetic fixtures (the AI is off; OCR is stubbed because the
test machine has no Tesseract).

1. Upload an offer letter (DOCX), a contract (PDF), a scanned NDA and a handbook.
2. Step 3: legal name, CIN, signatory, notice periods (with a conflict), pay frequency, leave, confidentiality, clause wording.
3. Step 4: the offer letter becomes "our version of Offer Letter", sample values become placeholders, signatures stay locked.
4. Step 5: no Velocity Report for interns, a "Driving licence" upload category, a "T-shirt size" question.
5. Apply: settings show the values, the offer letter is a draft in review, nothing is sent, the audit log has the events.
6. After legal approval and release, a new intern gets the organisation's offer letter, no Velocity Report, the extra question
   and the new category; a hire who received documents before keeps them unchanged.
7. Undo before any hire used the setup restores the earlier settings (separate test).
"""
import json
from types import SimpleNamespace

import pytest

from app.modules.doc_templates import renderer, storage
from app.modules.doc_templates.models import GeneratedDocument, TemplateVariant
from app.modules.hr import docs_setup as DS
from app.modules.hr import onboarding_package as P
from app.modules.hr import onboarding_package_org as ORG
from app.modules.hr.models import OnboardingDocument
from tests.doc_templates.test_dt_docs_setup import _fixture
from tests.doc_templates.test_dt_package_org import _hire, _ready, _release, _v2_terms  # noqa: F401 (autouse profile)

OCR_TEXT = ("NON-DISCLOSURE AGREEMENT\n\nBetween Acme Analytics Private Limited and the Recipient.\n\n"
            "The Recipient shall keep the Confidential Information secret for a period of two years after the engagement ends.")


@pytest.fixture(autouse=True)
def _setup(monkeypatch, world):
    from app.config import settings
    from app.modules.hr import onboarding_profiles
    monkeypatch.setattr(settings, "ONBOARDING_DOCS_SETUP", True)
    monkeypatch.setattr(settings, "ONBOARDING_DOCS_SETUP_ORGS", "")
    monkeypatch.setattr(settings, "DOCS_SETUP_FILE_TYPES", "docx,pdf,txt")   # the synthetic fixtures include PDFs
    monkeypatch.setattr(DS, "ai_status", lambda db, org: {"on": False, "reason": "AI is switched off for your organisation."})
    monkeypatch.setattr(DS, "ocr_image", lambda img: OCR_TEXT)
    DS._RATE.clear()
    actor = SimpleNamespace(id=world.u["a_admin"].id, organization_id=1)
    onboarding_profiles.save_engagement(world.db, actor, "internship", {
        "name": "Internship", "employment_type": "internship", "party_term": "Intern", "engagement_term": "internship",
        "assessment_label": "Assessment", "assessment_months": 3, "remuneration_label": "Stipend",
        "working_days": ["MON", "TUE", "WED", "THU", "FRI"]})


def _text(pdf: bytes) -> str:
    return " ".join(renderer.pdf_text(pdf).split())


def _patch(world, url, body):
    return world.client.patch(url, json=body, headers=world._h("a_hr"))


def _wizard(world):
    base = "/hr/onboarding/docs-setup"
    s = world.post("a_hr", f"{base}/sessions").json()
    sid = s["id"]
    for name, label in (("offer_letter.docx", "offer_letter"), ("contract.pdf", "contract"), ("nda_scanned.pdf", None),
                        ("handbook.pdf", "handbook")):
        r = world.post("a_hr", f"{base}/sessions/{sid}/files", files={"file": (name, _fixture(name))},
                       data={"label": label} if label else {})
        assert r.status_code == 200, r.text
    s = world.post("a_hr", f"{base}/sessions/{sid}/analyse").json()
    assert s["status"] == "review", s
    assert any(w["code"] == "ocr_used" for f in s["files"] for w in f["warnings"]), "the scanned NDA was read with OCR"
    return base, sid


def _decide_all(world, base, sid):
    items = world.get("a_hr", f"{base}/sessions/{sid}/proposals").json()["items"]
    by = {}
    for p in items:
        by.setdefault((p["target"], p["target_key"]), []).append(p)
    # §13.2: every proposal the acceptance scenario expects, each with a clickable source
    for key in [("company_profile", "legal_name"), ("company_profile", "cin"), ("company_profile", "signatory_name"),
                ("company_profile", "employee_notice"), ("company_profile", "pay_frequency"), ("offer_setting", "leave_entitlement"),
                ("company_profile", "nda_confidentiality_duration"), ("clause", "probation"), ("clause", "notice_and_termination"),
                ("clause", "confidentiality_and_ip")]:
        if key not in by and key[0] == "company_profile":    # already the organisation's value: never proposed again
            assert world.get("a_hr", "/hr/onboarding/company-profile").json()["profile"].get(key[1]), f"missing proposal {key}"
            continue
        assert key in by, f"missing proposal {key}"
        assert by[key][0]["sources"] and by[key][0]["sources"][0]["quote"]
    notice = by[("company_profile", "employee_notice")]
    assert {p["proposed_value"]["value"] for p in notice} == {30, 60} and notice[0]["conflict_group"], "contract vs handbook"
    link = world.get("a_hr", f"{base}/sessions/{sid}/files/{notice[0]['sources'][0]['file_id']}/view",
                     params={"page": notice[0]["sources"][0]["page"]}).json()
    assert world.client.get(link["url"].split("#")[0]).status_code == 200, "the source opens"
    # accept everything that has no problem; settle every conflict (the notice period: the contract's 30 days)
    for p in items:
        if p["conflict_group"] or p["problem"]:
            continue
        assert _patch(world, f"{base}/sessions/{sid}/proposals/{p['id']}", {"decision": "accepted"}).status_code == 200
    groups = {}
    for p in items:
        if p["conflict_group"]:
            groups.setdefault(p["conflict_group"], []).append(p)
    for g, ps in groups.items():
        pick = next((p for p in ps if p["proposed_value"] == {"value": 30, "unit": "calendar_days"}), ps[0])
        assert _patch(world, f"{base}/sessions/{sid}/proposals/{pick['id']}", {"decision": "accepted"}).status_code == 200
    assert world.get("a_hr", f"{base}/sessions/{sid}").json()["unresolved_conflicts"] == []


def _map_and_extras(world, base, sid):
    files = {f["filename"]: f for f in world.get("a_hr", f"{base}/sessions/{sid}").json()["files"]}
    offer = files["offer_letter.docx"]
    samples = world.get("a_hr", f"{base}/sessions/{sid}/mapping/{offer['id']}").json()["preview"]["samples"]
    want = {"worker.full_name": "Priya Sharma", "employment.start_date_long": "1 March 2026"}
    for key, text in want.items():
        assert any(x["key"] == key and x["text"] == text for x in samples), (key, samples)
    assert any(x["key"] == "employment.pay_statement" and "6,00,000" in x["text"] for x in samples)
    r = world.put("a_hr", f"{base}/sessions/{sid}/mapping/{offer['id']}", json={
        "action": "variant_of", "canonical_id": "HR-HIR-011",
        "placeholders": [{**x, "confirmed": x["key"] in ("worker.full_name", "employment.start_date_long", "employment.pay_statement")}
                         for x in samples]})
    assert r.status_code == 200, r.text
    assert r.json()["preview"]["locked_count"] >= 2, "signature blocks stay locked"
    for name in ("contract.pdf", "nda_scanned.pdf", "handbook.pdf"):
        world.put("a_hr", f"{base}/sessions/{sid}/mapping/{files[name]['id']}", json={"action": "source_only"})
    for change in ({"target": "package_document", "value": {"category": "velocity_report", "excluded_engagement_slugs": ["internship"]}},
                   {"target": "request_category", "value": {"label": "Driving licence", "description": "Both sides"}},
                   {"target": "form_field", "value": {"form": "HR-ONB-001", "label": "T-shirt size", "type": "select",
                                                      "options": ["S", "M", "L", "XL"]}}):
        r = world.post("a_hr", f"{base}/sessions/{sid}/proposals/manual", json=change)
        assert r.status_code == 200, r.text


def test_section_13_acceptance(world):
    _ready(world)
    before_hire, _ = _hire(world, email="early.bird@example.com")
    sent = world.post("a_admin", f"/hr/onboarding/new-hires/{before_hire.id}/send-package").json()
    assert "offer_letter" in {i["category"] for i in sent["issued"]}
    world.db.expire_all()
    early = world.db.query(OnboardingDocument).filter_by(onboarding_new_hire_id=before_hire.id, category="offer_letter").one()
    early_pdf = storage.get_store().get(world.db.get(GeneratedDocument, early.document_id).pdf_path)
    mail_before = len(world.mail)

    base, sid = _wizard(world)
    _decide_all(world, base, sid)
    _map_and_extras(world, base, sid)
    summary = world.get("a_hr", f"{base}/sessions/{sid}/summary").json()
    assert summary["draft_templates"] == 1 and summary["categories"] >= 1 and summary["form_fields"] == 1
    r = world.post("a_hr", f"{base}/sessions/{sid}/apply", headers={"Idempotency-Key": "acceptance"})
    assert r.status_code == 200, r.text

    # §13.5 the settings, the draft, nothing sent, the audit log
    profile = world.get("a_admin", "/hr/onboarding/company-profile").json()["profile"]
    assert profile["cin"] == "U72900KA2015PTC082345" and profile["legal_name"] == "Acme Analytics Private Limited"
    assert profile["notice_period_value"] == 30 and profile["pay_frequency"] == "monthly"
    docs = {d["category"]: d for d in world.get("a_admin", "/hr/onboarding/package/documents").json()["documents"]}
    assert "draft" in docs["offer_letter"]["template_state"]["label"]
    assert docs["velocity_report"]["excluded_engagement_slugs"] == ["internship"]
    assert len(world.mail) == mail_before, "nothing was sent to anyone"
    from app.modules.super_admin.models import AuditLog
    actions = {a.action_type for a in world.db.query(AuditLog).filter(AuditLog.organization_id == 1).all()}
    assert {"settings.docs_setup_applied", "settings.docs_setup_applied.company_profile"} <= actions

    # §13.6 legal approval and release, then a new intern
    v = world.db.query(TemplateVariant).filter_by(canonical_id="PKG-HR-HIR-011", owner_organization_id=1, status="IN_DRAFT").one()
    _release(world, v.id)
    intern, token = _hire(world, employment_type="internship", email="ivy.intern@example.com")
    world.put("a_admin", f"/hr/onboarding/new-hires/{intern.id}/package/inputs", json={"values": {"engagement_profile_slug": "internship"}})
    world.db.expire_all()
    cats = {d["category"] for d in ORG.documents_for_hire(world.db, intern)}
    assert "velocity_report" not in cats
    body = world.post("a_admin", f"/hr/onboarding/new-hires/{intern.id}/send-package").json()
    assert "offer_letter" in {i["category"] for i in body["issued"]}, body.get("held")
    world.db.expire_all()
    row = world.db.query(OnboardingDocument).filter_by(onboarding_new_hire_id=intern.id, category="offer_letter").one()
    gen = world.db.get(GeneratedDocument, row.document_id)
    assert gen.variant_id == v.id
    text = _text(storage.get_store().get(gen.pdf_path))
    assert "Your annual cost to company will be" in text and "Dear Nora Newstarter," in text and "Priya Sharma" not in text
    assert not world.db.query(OnboardingDocument).filter_by(onboarding_new_hire_id=intern.id, category="velocity_report").count()
    form = next(f for f in world.client.get(f"/public/onboarding/{token}/forms").json()["items"] if f["canonical_id"] == "HR-ONB-001")
    assert any(f["key"] == "custom_t_shirt_size" for f in form["fields"])
    r = world.post("a_admin", f"/hr/onboarding/new-hires/{intern.id}/document-requests", json={"categories": ["driving_licence"]})
    assert r.status_code in (200, 201) and r.json()[0]["title"] == "Driving licence"
    # the earlier hire's document never changed
    world.db.expire_all()
    assert storage.get_store().get(world.db.get(GeneratedDocument, early.document_id).pdf_path) == early_pdf
    assert P.issued_meta(early)["source"]["kind"] == "starter"
    # the setup was used by a hire now: undo explains it cannot be undone
    r = world.post("a_admin", f"{base}/sessions/{sid}/undo").json()
    assert r["undone"] is False and "already received" in r["message"]


def test_section_13_undo_before_use_restores_the_settings(world):
    before = world.get("a_admin", "/hr/onboarding/company-profile").json()["profile"]
    base, sid = _wizard(world)
    _decide_all(world, base, sid)
    _map_and_extras(world, base, sid)
    assert world.post("a_admin", f"{base}/sessions/{sid}/apply", headers={"Idempotency-Key": "u1"}).status_code == 200
    r = world.post("a_admin", f"{base}/sessions/{sid}/undo").json()
    assert r["undone"] is True, r
    after = world.get("a_admin", "/hr/onboarding/company-profile").json()["profile"]
    assert after.get("cin") == before.get("cin") and after.get("notice_period_value") == before.get("notice_period_value")
    cats = [c["key"] for c in world.get("a_admin", "/hr/onboarding/request-categories").json()["categories"]]
    assert "driving_licence" not in cats
    docs = {d["category"]: d for d in world.get("a_admin", "/hr/onboarding/package/documents").json()["documents"]}
    assert docs["velocity_report"]["excluded_engagement_slugs"] == [] and "standard template" in docs["offer_letter"]["template_state"]["label"]
