""""Set up with AI" end to end: an organisation with empty onboarding settings uploads its own Word templates and a company
reference document, applies the setup, approves and releases it, fills every remaining gap in Settings › Missing details,
and a new hire then receives every document fully filled in – no {{placeholder}} and no [blank] left anywhere.

The AI is off here (the deterministic detectors do the analysis), exactly as for a tenant without AI on its plan."""
import re

import pytest

from app.modules.doc_templates import renderer, storage
from app.modules.doc_templates.models import GeneratedDocument
from app.modules.hr import docs_setup as DS
from app.modules.hr import onboarding_package as P
from app.modules.hr.models import OnboardingDocument
from tests.doc_templates.test_dt_docs_setup import _docx
from tests.doc_templates.test_dt_offer_package import _new_hire

BASE = "/hr/onboarding/docs-setup"
BLANK = re.compile(r"\[[A-Za-z][^\]]{0,40}\]")


@pytest.fixture(autouse=True)
def _on(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "ONBOARDING_DOCS_SETUP", True)
    monkeypatch.setattr(settings, "ONBOARDING_DOCS_SETUP_ORGS", "")
    # the employment agreement (L3) only becomes the organisation's version when the platform allows organisation-approved
    # high-risk templates; the default is off (CI has no .env), so set it here rather than depend on the local .env
    monkeypatch.setattr(settings, "TEMPLATES_TENANT_ATTESTATION_L3_ENABLED", True)
    monkeypatch.setattr(DS, "ai_status", lambda db, org: {"on": False, "reason": "off in tests"})
    DS._RATE.clear()


def _text(pdf: bytes) -> str:
    return " ".join(renderer.pdf_text(pdf).split())


# ── helpers shared with the local real-file run ──────────────────────────────────────────────────────────────────────
SAMPLE = {"email": "people@acme-example.com", "url": "https://acme-example.com", "int": 3, "bool": True,
          "country": "GB", "currency": "GBP"}


def sample_for(inp: dict):
    """A valid value for one Missing details input, chosen by its kind (what an admin would type)."""
    kind, key = inp.get("kind"), inp.get("key")
    if inp.get("options"):
        return inp["options"][0]
    if kind == "list":
        return ["Proof of identity", "Bank details"]
    if key in ("country", "jurisdiction_country"):
        return "United Kingdom"
    if kind in SAMPLE:
        return SAMPLE[kind]
    return {"legal_name": "Acme Example Ltd", "postal_code": "LS1 1AA", "city": "Leeds", "state": "West Yorkshire",
            "address_line1": "1 Sample Street", "signatory_name": "Avery Admin", "signatory_title": "Director",
            "hr_contact_name": "Harper People", "jurisdiction_city": "Leeds"}.get(key, f"Sample {inp.get('label', key)}")


def fill_missing_details(world, who="a_admin") -> dict:
    """Fill every gap Settings › Missing details asks for, as an admin would, until nothing is missing."""
    for _round in range(3):
        gaps = world.get(who, "/hr/onboarding/settings-gaps").json()
        if gaps["complete"]:
            return gaps
        payload = {"profile": {}, "package": {}, "clause_tokens": {}, "clauses": {}}
        for item in gaps["fields"] + gaps["hire_defaults"]:
            for inp in item["inputs"]:
                target = "clause_tokens" if inp["target"] == "clause_token" else inp["target"]
                payload[target][inp["key"]] = sample_for(inp)
        for c in gaps["clauses"]:
            payload["clauses"][c["key"]] = f"Approved wording for {c['title']}."
        r = world.put(who, "/hr/onboarding/settings-gaps", json=payload)
        assert r.status_code == 200, r.text
    return world.get(who, "/hr/onboarding/settings-gaps").json()


def fill_hire_values(world, hire, who="a_admin") -> None:
    """What HR types for one new hire in the documents panel (values only the hire's own offer could give)."""
    pkg = world.get(who, f"/hr/onboarding/new-hires/{hire.id}/package").json()
    values = {}
    for d in pkg["documents"]:
        for f in d["missing_fields"]:
            if f.get("editable") or f.get("hr_may_enter"):
                values[f["key"]] = {"employment.base_pay": "42000", "worker.postal_address": "12 Lake View Road, Leeds LS2 2BB",
                                    "employment.start_date": "2026-12-01", "employment.probation_months": "6",
                                    "document.issue_date": "2026-11-26"}.get(f["key"], f"Sample {f['meaning']}")
    if values:
        r = world.put(who, f"/hr/onboarding/new-hires/{hire.id}/package/inputs", json={"values": values})
        assert r.status_code == 200, r.text


def assert_all_issued_clean(world, hire, expected: int, who="a_admin") -> list:
    sent = world.post(who, f"/hr/onboarding/new-hires/{hire.id}/send-package").json()
    assert len(sent.get("issued", [])) == expected, sent
    world.db.expire_all()
    texts = []
    for row in world.db.query(OnboardingDocument).filter_by(onboarding_new_hire_id=hire.id).all():
        key = (world.db.get(GeneratedDocument, row.document_id).pdf_path if row.document_id else row.file_path)
        if not key:
            continue
        text = _text(storage.get_store().get(key))
        assert "{{" not in text and "}}" not in text, (row.category, re.findall(r".{0,40}\{\{.{0,40}", text))
        assert not BLANK.search(text), (row.category, BLANK.findall(text))
        assert "br /" not in text and "<br" not in text, (row.category, "a line break printed as text")
        assert not re.search(r"(?i)template\s*\d+\s*\||placeholders before issuing", text), (row.category, "template note printed")
        texts.append((row.category, text))
    return texts


# ── the journey ──────────────────────────────────────────────────────────────────────────────────────────────────────
OFFER = [(1, "Offer of Employment"), "Dear [Candidate Name],",
         "We are pleased to offer you the position of [Job Title], starting on [Start Date].",
         "Please sign and return this letter to confirm your acceptance.", "Yours sincerely,", "[Signatory Name]", "[Signatory Title]"]
CONTRACT = [(1, "Employment Agreement"), "This agreement is made between the Company and [Employee Name].",
            "The Employee will work as [Job Title] from [Start Date].",
            "Either party may end this agreement by giving 30 days of written notice.", "Signed: [Employee Name]"]
WELCOME = [(1, "Welcome Pack Acknowledgement"), "I, [Employee Name], confirm I have read the welcome pack.",
           "My manager is {{employment.reports_to}}."]
PROFILE = [(1, "Organisation Profile"), "Acme Example Ltd is registered in England.",
           "Registered office: 1 Sample Street, Leeds, West Yorkshire, LS1 1AA, United Kingdom.",
           "HR contact: Harper People, people@acme-example.com."]


def test_set_up_with_ai_then_missing_details_then_every_document_generates(world):
    s = world.post("a_admin", f"{BASE}/sessions").json()
    sid = s["id"]
    for name, paras in (("offer_letter_template.docx", OFFER), ("employment_agreement_template.docx", CONTRACT),
                        ("welcome_pack_acknowledgement_template.docx", WELCOME)):
        r = world.client.post(f"{BASE}/sessions/{sid}/files", data={"label": "tpl:auto"},
                              files={"file": (name, _docx(paras), "application/octet-stream")}, headers=world._h("a_admin"))
        assert r.status_code == 200, (name, r.text)
    r = world.client.post(f"{BASE}/sessions/{sid}/files", files={"file": ("organisation_profile.docx", _docx(PROFILE),
                                                                         "application/octet-stream")}, headers=world._h("a_admin"))
    assert r.status_code == 200, r.text
    s = world.post("a_admin", f"{BASE}/sessions/{sid}/analyse").json()
    roles = {f["filename"]: (f.get("mapping") or {}).get("action") for f in s["files"]}
    assert roles["organisation_profile.docx"] == "source_only"
    assert sum(1 for a in roles.values() if a in ("variant_of", "new_document")) == 3, roles
    props = world.get("a_admin", f"{BASE}/sessions/{sid}/proposals").json()
    for g in props.get("unresolved_conflicts") or []:
        first = next(p for p in props["items"] if p.get("conflict_group") == g)
        world.post("a_admin", f"{BASE}/sessions/{sid}/proposals/{first['id']}/decision", json={"decision": "accept"})
    r = world.post("a_admin", f"{BASE}/sessions/{sid}/apply", headers={"Idempotency-Key": "e2e"})
    assert r.status_code == 200, r.text
    rel = world.post("a_admin", f"{BASE}/sessions/{sid}/approve-release", json={"attestation_accepted": True}).json()
    assert rel["released"] == rel["total"] == 3, rel

    # the setup filled the company details from the uploaded reference document
    profile = world.get("a_admin", "/hr/onboarding/company-profile").json()["profile"]
    assert profile.get("legal_name"), profile
    gaps = fill_missing_details(world)                    # whatever the setup could not find is asked for in Settings
    assert gaps["complete"] and gaps["documents_ready"] == gaps["documents_total"] == 3, gaps

    # a detail goes missing later (the signatory is cleared): Settings › Missing details asks for it, by name
    from types import SimpleNamespace
    from app.modules.hr import company_profile as CP
    CP.save_profile(world.db, SimpleNamespace(id=world.u["a_admin"].id, organization_id=1),
                    {"signatory_name": None}, partial_keys={"signatory_name"})
    gaps = world.get("a_admin", "/hr/onboarding/settings-gaps").json()
    assert not gaps["complete"] and gaps["documents_ready"] < gaps["documents_total"], gaps
    asked = {i["key"]: item for item in gaps["fields"] for i in item["inputs"]}
    assert "signatory_name" in asked and "Offer Letter" in asked["signatory_name"]["documents"], gaps
    status = world.get("a_admin", "/hr/onboarding/setup-status?fresh=true").json()
    wording = {x["key"]: x for x in status["steps"]}["wording"]
    assert not wording["done"] and wording["path"].endswith("#missing-details")
    gaps = fill_missing_details(world)
    assert gaps["complete"], gaps
    status = world.get("a_admin", "/hr/onboarding/setup-status?fresh=true").json()
    assert {x["key"]: x for x in status["steps"]}["wording"]["done"], status

    # a new hire: only what HR types for this person in the documents panel, then every document goes out complete
    hire, _ = _new_hire(world, email="e2e.hire@example.com")
    fill_hire_values(world, hire)
    texts = dict(assert_all_issued_clean(world, hire, expected=3))
    assert any("Nora Newstarter" in t for t in texts.values())
    assert any("Avery Admin" in t or "Acme Example Ltd" in t or "Tenant A" in t for t in texts.values()), texts


def test_missing_details_validates_like_the_company_profile(world):
    r = world.put("a_admin", "/hr/onboarding/settings-gaps", json={"profile": {"hr_contact_email": "not-an-email"}})
    assert r.status_code == 422 and "hr_contact_email" in r.json()["detail"]["errors"]
    r = world.put("a_admin", "/hr/onboarding/settings-gaps", json={"clauses": {"made_up_clause": "x"}})
    assert r.status_code == 422
    assert world.put("a_manager", "/hr/onboarding/settings-gaps", json={}).status_code in (401, 403)
    assert world.get("b_admin", "/hr/onboarding/settings-gaps").status_code == 200   # its own organisation only


def test_default_work_location_and_engagement_type_fill_hire_values(world):
    from types import SimpleNamespace
    from app.modules.hr import company_profile as CP
    actor = SimpleNamespace(id=world.u["a_admin"].id, organization_id=1)
    CP.save_profile(world.db, actor, {"default_work_location": "Leeds office"}, partial_keys={"default_work_location"})
    hire, _ = _new_hire(world, email="defaults@example.com")
    with P.values_cache(world.db):
        values = P.build_values(world.db, hire, P.get_config(world.db, 1))
    assert values["employment.work_location"] == "Leeds office"
    assert not values.get("employment.employment_type"), "no type anywhere: HR is asked"
    CP.save_profile(world.db, actor, {"default_employment_type": "Full-time"}, partial_keys={"default_employment_type"})
    with P.values_cache(world.db):
        values = P.build_values(world.db, hire, P.get_config(world.db, 1))
    assert values["employment.employment_type"] == "Full-time", "the Settings default is used when the hire has none"
    world.put("a_admin", f"/hr/onboarding/new-hires/{hire.id}/package/inputs", json={"values": {"employment.work_location": "Remote"}})
    world.db.expire_all()
    with P.values_cache(world.db):
        values = P.build_values(world.db, hire, P.get_config(world.db, 1))
    assert values["employment.work_location"] == "Remote", "HR's entry for the hire wins over the default"
