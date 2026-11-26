"""Onboarding documents for every organisation: its own fields, rules, automatic preparation, starter sets, countersignature,
the test package / setup score and Word-layout templates – each organisation strictly on its own data."""
import json
from datetime import date, timedelta
from types import SimpleNamespace

import pytest

from app.modules.doc_templates import renderer, storage
from app.modules.doc_templates.models import GeneratedDocument, TemplateVariant
from app.modules.hr import onboarding_custom_fields as CF
from app.modules.hr import onboarding_doc_automation as AUTO
from app.modules.hr import onboarding_package as P
from app.modules.hr import onboarding_package_content as C
from app.modules.hr import onboarding_package_org as ORG
from app.modules.hr import onboarding_starter_sets as SS
from app.modules.hr.models import OnboardingDocument, OnboardingNewHire, OrganizationConfig
from tests.doc_templates.test_dt_docs_setup import _docx
from tests.doc_templates.test_dt_offer_package import ANALYST, V2_PROFILE, _new_hire
from tests.doc_templates.test_dt_package_org import _hire, _own_template, _ready, _release

SHIFT = {"key": "shift_allowance", "label": "Shift allowance", "type": "money", "source": "hr", "required": True}
PENSION = {"key": "pension_scheme", "label": "Pension scheme", "type": "choice", "source": "fixed", "required": True,
           "options": ["Workplace pension", "None"], "value": "Workplace pension"}
BADGE = {"key": "badge_name", "label": "Name on the badge", "type": "text", "source": "candidate", "required": True}
NOTE = {"key": "extra_note", "label": "Extra note", "type": "text", "source": "hr", "required": False}


@pytest.fixture(autouse=True)
def _v2_terms(world):
    from app.modules.hr import company_profile, onboarding_profiles
    actor = SimpleNamespace(id=world.u["a_admin"].id, organization_id=1)
    company_profile.save_profile(world.db, actor, V2_PROFILE)
    onboarding_profiles.save_role(world.db, actor, "analyst", ANALYST)


def _text(pdf: bytes) -> str:
    return " ".join(renderer.pdf_text(pdf).split())


def _fields(world, items, who="a_admin"):
    r = world.put(who, "/hr/onboarding/custom-fields", json={"fields": items})
    assert r.status_code == 200, r.text
    return r.json()


def _own_doc(world, text, *, title="Shift Agreement", mode="ACKNOWLEDGE", **row):
    t = _own_template(world, title=title, text=text)
    world.put("a_hr", f"/hr/templates/variants/{t['variant_id']}", json={"change_reason": "First version"})
    _release(world, t["variant_id"])
    r = world.post("a_admin", "/hr/onboarding/package/documents", json={"canonical_id": t["canonical_id"], "mode": mode, **row})
    assert r.status_code == 200, r.text
    return "org:" + t["canonical_id"], t


def _pkg(world, h):
    r = world.get("a_admin", f"/hr/onboarding/new-hires/{h.id}/package")
    assert r.status_code == 200, r.text
    return r.json()


def _docs(world, h):
    return {d["category"]: d for d in _pkg(world, h)["documents"]}


def _only(world, keep):
    """Switch off every platform document not in `keep` (mandatory ones stay on)."""
    items = [{"category": c, "enabled": c in keep} for c in C.CATEGORIES if c not in ORG.MANDATORY]
    assert world.put("a_admin", "/hr/onboarding/package/documents", json={"documents": items}).status_code == 200


# ── the organisation's own fields ────────────────────────────────────────────────────────────────────────────────────

def test_custom_fields_are_validated_and_scoped_to_one_organisation(world):
    body = _fields(world, [SHIFT, PENSION])
    assert [f["token"] for f in body["fields"]] == ["{{custom.shift_allowance}}", "{{custom.pension_scheme}}"]
    bad = world.put("a_admin", "/hr/onboarding/custom-fields", json={"fields": [{**SHIFT, "key": "Shift Allowance"}]})
    assert bad.status_code == 422 and "field name" in bad.text
    bad = world.put("a_admin", "/hr/onboarding/custom-fields", json={"fields": [{**PENSION, "options": []}]})
    assert bad.status_code == 422
    bad = world.put("a_admin", "/hr/onboarding/custom-fields", json={"fields": [{**PENSION, "value": "Gold plan"}]})
    assert bad.status_code == 422 and "must be one of" in bad.text
    assert world.get("b_admin", "/hr/onboarding/custom-fields").json()["fields"] == [], "another organisation sees none"
    assert world.get("a_manager", "/hr/onboarding/custom-fields").status_code in (401, 403)
    # a placeholder written in an upload becomes a field in one click
    r = world.post("a_admin", "/hr/onboarding/custom-fields", json={"placeholder": "RelocationBonus", "type": "money"})
    assert r.status_code == 200, r.text
    assert any(f["key"] == "relocation_bonus" and f["label"] == "Relocation bonus" for f in r.json()["fields"])


def test_a_custom_field_holds_the_document_until_hr_types_it_then_prints_formatted(world):
    _ready(world)
    _fields(world, [SHIFT, PENSION, NOTE])
    cat, _t = _own_doc(world, "Shift allowance {{custom.shift_allowance}}; pension {{custom.pension_scheme}}.{{custom.extra_note}}")
    h, _ = _hire(world)
    doc = _docs(world, h)[cat]
    assert not doc["ready"]
    missing = {f["key"]: f for f in doc["missing_fields"]}
    assert set(missing) == {"custom.shift_allowance"}, "the fixed field has its value; the optional one prints nothing"
    assert missing["custom.shift_allowance"]["editable"] and missing["custom.shift_allowance"]["input_type"] == "money"
    inputs = {f["key"]: f for f in _pkg(world, h)["input_fields"] if f.get("custom")}
    assert set(inputs) == {"custom.shift_allowance", "custom.extra_note"}, "fixed fields are not typed per hire"

    r = world.put("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/inputs", json={"values": {"custom.shift_allowance": "lots"}})
    assert r.status_code == 422 and "number" in r.text
    r = world.put("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/inputs", json={"values": {"custom.pension_scheme": "None"}})
    assert r.status_code == 422, "a fixed field is not typed per hire"
    r = world.put("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/inputs", json={"values": {"custom.shift_allowance": "1250"}})
    assert r.status_code == 200, r.text
    assert _docs(world, h)[cat]["ready"]
    body = world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/send-package", json={"categories": [cat]}).json()
    assert cat in {i["category"] for i in body["issued"]}, body
    world.db.expire_all()
    row = world.db.query(OnboardingDocument).filter_by(onboarding_new_hire_id=h.id, category=cat).one()
    text = _text(storage.get_store().get(row.file_path))
    assert "Shift allowance £1,250.00; pension Workplace pension." in text, text
    assert "{{" not in text and "custom." not in text


def test_an_undefined_field_in_another_organisations_template_never_prints(world):
    """Organisation B's template asks for {{custom.shift_allowance}}, which only organisation A defines."""
    _fields(world, [SHIFT])
    actor = SimpleNamespace(id=world.u["b_admin"].id, organization_id=2)
    b_hire = OnboardingNewHire(organization_id=2, candidate_name="Bo Bee", email="bo@tenant-b.example.com", position="Analyst",
                               joining_date=date.today() + timedelta(days=10), status="offer_accepted", work_country="GB")
    world.db.add(b_hire)
    world.db.commit()
    assert CF.values_for_hire(world.db, b_hire) == {}
    info = P._missing_field(world.db, 2, "custom.shift_allowance")
    assert info["editable"] is False and "Not defined" in info["source"]
    with pytest.raises(Exception):
        CF.check_hire_input(world.db, actor.organization_id, "custom.shift_allowance", "10")


def test_candidate_fields_come_from_the_portal(world):
    _ready(world)
    _fields(world, [BADGE])
    cat, _t = _own_doc(world, "Your badge reads {{custom.badge_name}}.")
    h, _ = _hire(world)
    miss = {f["key"]: f for f in _docs(world, h)[cat]["missing_fields"]}
    assert miss["custom.badge_name"]["candidate_provides"] and not miss["custom.badge_name"]["editable"]
    details = dict(h.profile_details or {})
    details["custom_fields"] = {"custom_badge_name": "Nora N."}
    h.profile_details = details
    world.db.commit()
    # written straight to the database here; the portal saves through /public/onboarding, which drops HR's cached reads
    from app.core.cache_middleware import invalidate_org_reads
    invalidate_org_reads(h.organization_id, "/hr/onboarding")
    assert _docs(world, h)[cat]["ready"]


# ── include-when rules ───────────────────────────────────────────────────────────────────────────────────────────────

def test_include_when_rules_choose_who_receives_a_document(world):
    _ready(world)
    _fields(world, [SHIFT])
    cat, _t = _own_doc(world, "Night work rules for {{worker.full_name}}.")
    rule = [{"field": "country", "op": "is", "value": "India"}]
    r = world.put("a_admin", "/hr/onboarding/package/documents", json={"documents": [{"category": cat, "conditions": rule}]})
    assert r.status_code == 200, r.text
    row = {d["category"]: d for d in r.json()["documents"]}[cat]
    assert row["conditions"] == [{"field": "country", "op": "is", "value": "IN"}] and "Work country is IN" in row["conditions_text"]
    h, _ = _hire(world)                                  # works in GB
    assert cat not in {d["category"] for d in ORG.documents_for_hire(world.db, h)}
    rule = [{"field": "custom.shift_allowance", "op": "gt", "value": "1000"}]
    world.put("a_admin", "/hr/onboarding/package/documents", json={"documents": [{"category": cat, "conditions": rule}]})
    world.put("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/inputs", json={"values": {"custom.shift_allowance": "1500"}})
    world.db.expire_all()
    assert cat in {d["category"] for d in ORG.documents_for_hire(world.db, h)}, "a rule on the organisation's own field"
    # bad rules are refused with a clear reason; the mandatory documents always go to everyone
    for bad in ([{"field": "shoe_size", "op": "is", "value": "9"}], [{"field": "country", "op": "gt", "value": "GB"}],
                [{"field": "department", "op": "is", "value": ""}], [{"field": "country", "op": "is", "value": "Atlantis"}]):
        assert world.put("a_admin", "/hr/onboarding/package/documents",
                         json={"documents": [{"category": cat, "conditions": bad}]}).status_code == 422, bad
    r = world.put("a_admin", "/hr/onboarding/package/documents",
                  json={"documents": [{"category": "employment_contract", "conditions": [{"field": "country", "op": "is", "value": "GB"}]}]})
    assert r.status_code == 422 and "every new hire" in r.text


# ── automatic preparation ────────────────────────────────────────────────────────────────────────────────────────────

def _trigger(world, cats, when="hire_created", days=None):
    items = [{"category": c, "send_when": when, **({"send_days_before": days} if days is not None else {})} for c in cats]
    r = world.put("a_admin", "/hr/onboarding/package/documents", json={"documents": items})
    assert r.status_code == 200, r.text


def _start(world, **kw):
    from app.modules.hr import onboarding_flow
    h, token = _hire(world, **kw)
    onboarding_flow.start_onboarding(world.db, h)
    world.db.expire_all()
    return world.db.get(OnboardingNewHire, h.id), token


def test_review_mode_prepares_documents_and_hr_sends_them_in_one_click(world):
    _ready(world)
    _only(world, {"daily_kpi"})
    _trigger(world, ["daily_kpi", "offer_letter"])
    assert world.get("a_admin", "/hr/onboarding/package/automation").json()["mode"] == "review"
    h, _ = _start(world)
    pkg = _pkg(world, h)
    assert set(pkg["automation"]["queued"]) >= {"daily_kpi"}, pkg["automation"]
    assert world.db.query(OnboardingDocument).filter_by(onboarding_new_hire_id=h.id, kind="package").count() == 0, \
        "review mode never sends by itself"
    r = world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/send-prepared", json={})
    assert r.status_code == 200, r.text
    assert "daily_kpi" in {i["category"] for i in r.json()["issued"]}
    assert "daily_kpi" not in r.json()["package"]["automation"]["queued"]
    assert world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/send-prepared", json={}).status_code == 409 or \
        not r.json()["package"]["automation"]["queued"]


def test_auto_mode_sends_ready_documents_and_holds_the_rest(world):
    _ready(world)
    _fields(world, [SHIFT])
    cat, _t = _own_doc(world, "Allowance {{custom.shift_allowance}}.")
    _only(world, {"daily_kpi"})
    _trigger(world, ["daily_kpi", cat])
    assert world.put("a_admin", "/hr/onboarding/package/automation", json={"mode": "auto"}).json()["mode"] == "auto"
    assert world.put("a_admin", "/hr/onboarding/package/automation", json={"mode": "yolo"}).status_code == 422
    h, _ = _start(world)
    rows = {r.category: r for r in world.db.query(OnboardingDocument).filter_by(onboarding_new_hire_id=h.id)}
    assert "daily_kpi" in rows and cat not in rows
    pkg = _pkg(world, h)
    assert cat in pkg["automation"]["held"]
    # HR types the missing value; the morning check sends it
    world.put("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/inputs", json={"values": {"custom.shift_allowance": "900"}})
    world.db.expire_all()
    assert AUTO.run_daily(world.db) >= 1
    world.db.expire_all()
    assert world.db.query(OnboardingDocument).filter_by(onboarding_new_hire_id=h.id, category=cat).count() == 1
    assert cat not in _pkg(world, h)["automation"]["held"]


def test_days_before_start_and_manual_documents(world):
    _ready(world)
    _only(world, {"daily_kpi"})
    _trigger(world, ["daily_kpi"], when="days_before_start", days=7)
    h, _ = _start(world)                                 # starts in 14 days
    assert not _pkg(world, h)["automation"]["queued"]
    assert AUTO.run_daily(world.db, today=date.today()) == 0, "not due yet"
    assert AUTO.run_daily(world.db, today=date.today() + timedelta(days=8)) >= 1
    world.db.expire_all()
    assert "daily_kpi" in _pkg(world, h)["automation"]["queued"]
    r = world.put("a_admin", "/hr/onboarding/package/documents",
                  json={"documents": [{"category": "daily_kpi", "send_when": "days_before_start", "send_days_before": 400}]})
    assert r.status_code == 422


def test_an_organisation_without_triggers_behaves_exactly_as_before(world):
    _ready(world)
    h, _ = _start(world)
    assert not world.db.query(OnboardingDocument).filter_by(onboarding_new_hire_id=h.id, kind="package").count()
    pkg = _pkg(world, h)
    assert pkg["automation"]["queued"] == [] and pkg["automation"]["last_run"] is None
    assert all(d["send_when"] == "manual" for d in world.get("a_admin", "/hr/onboarding/package/documents").json()["documents"])


# ── starter sets ─────────────────────────────────────────────────────────────────────────────────────────────────────

def test_new_organisations_start_from_their_countrys_set_and_existing_ones_are_unchanged(world):
    docs = {d["category"]: d for d in world.get("b_admin", "/hr/onboarding/package/documents").json()["documents"]}
    assert all(d["enabled"] for d in docs.values()) and all(d["send_when"] == "manual" for d in docs.values()), \
        "an existing organisation (no starter marker) keeps every document, sent by HR"
    SS.mark_new_organisation(world.db, 2, "United Kingdom")
    world.db.query(ORG.OrgPackageDocument).filter_by(organization_id=2).delete()
    world.db.commit()
    docs = {d["category"]: d for d in world.get("b_admin", "/hr/onboarding/package/documents").json()["documents"]}
    on = {c for c, d in docs.items() if d["enabled"]}
    assert on == {"offer_letter", "job_description", "nda", "employment_contract"}
    assert all(docs[c]["send_when"] == "hire_created" for c in on)
    assert docs["exclusivity_affidavit"]["enabled"] is False and docs["velocity_report"]["enabled"] is False
    SS.mark_new_organisation(world.db, 2, "India")          # never overwrites an existing marker
    assert SS.marker(world.db, 2)["set"] == "standard"
    opts = world.get("b_admin", "/hr/onboarding/package/starter-sets").json()
    assert opts["current"] == "standard" and {s["key"] for s in opts["sets"]} == {"standard", "india", "full"}
    r = world.post("b_admin", "/hr/onboarding/package/starter-sets/india/apply", json={"send_when": "manual"})
    assert r.status_code == 200, r.text
    docs = {d["category"]: d for d in r.json()["documents"]}
    assert docs["exclusivity_affidavit"]["enabled"] and docs["job_application"]["enabled"] and not docs["daily_kpi"]["enabled"]
    # organisation 1 was never touched
    assert all(d["enabled"] for d in world.get("a_admin", "/hr/onboarding/package/documents").json()["documents"])
    assert world.db.query(OrganizationConfig).filter_by(organization_id=1, key=SS.MARKER_KEY).first() is None


def test_registering_an_organisation_records_its_starter_set(world, monkeypatch):
    from app.modules.employee import service as ES
    src = open(ES.__file__, encoding="utf-8").read()
    assert "onboarding_starter_sets.mark_new_organisation(db, org.id" in src


# ── employer countersignature ────────────────────────────────────────────────────────────────────────────────────────

def test_a_document_the_employer_countersigns_waits_for_a_countersigner(world):
    _ready(world)
    cat, _t = _own_doc(world, "Agreed by {{worker.full_name}}.", mode="SIGN", signers=["candidate", "employer"])
    h, _ = _hire(world)
    doc = _docs(world, h)[cat]
    assert doc["employer_signs"] and not doc["ready"]
    assert "employer.countersigner" in {f["key"] for f in doc["missing_fields"]}
    people = world.get("a_admin", "/hr/onboarding/package/countersigners").json()["people"]
    assert world.u["a_admin2"].id in {p["id"] for p in people}
    assert world.post("a_admin", "/hr/onboarding/package/countersigners",
                      json={"employee_id": world.u["a_emp"].id, "title": "Boss"}).status_code == 422, "admins and HR admins only"
    r = world.post("a_admin", "/hr/onboarding/package/countersigners", json={"employee_id": world.u["a_admin2"].id,
                                                                            "title": "Operations Director"})
    assert r.status_code == 200, r.text
    assert r.json()["signatories"][0]["title"] == "Operations Director"
    world.db.expire_all()
    assert _docs(world, h)[cat]["ready"]
    body = world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/send-package", json={"categories": [cat]}).json()
    assert cat in {i["category"] for i in body["issued"]}, body
    world.db.expire_all()
    row = world.db.query(OnboardingDocument).filter_by(onboarding_new_hire_id=h.id, category=cat).one()
    gen = world.db.get(GeneratedDocument, row.document_id)
    from app.modules.doc_templates import signing
    assert gen.execution_mode == "SIGN_BOTH" and gen.entity_id is not None
    assert signing.required_parties(gen) == ["candidate", "employer"]
    sid = r.json()["signatories"][0]["id"]
    assert world.delete("b_admin", f"/hr/onboarding/package/countersigners/{sid}").status_code == 404, "another organisation"
    assert world.delete("a_admin", f"/hr/onboarding/package/countersigners/{sid}").status_code == 200


def test_platform_documents_can_ask_the_employer_to_countersign(world):
    r = world.put("a_admin", "/hr/onboarding/package/documents",
                  json={"documents": [{"category": "employment_contract", "signers": ["candidate", "employer"]}]})
    assert r.status_code == 200, r.text
    assert ORG.meta(world.db, 1, "employment_contract")["party_signers"] == ["candidate", "employer"]
    r = world.put("a_admin", "/hr/onboarding/package/documents",
                  json={"documents": [{"category": "employment_contract", "signers": ["employer"]}]})
    assert r.status_code == 422, "the new hire always signs their contract"


# ── test package and setup score ─────────────────────────────────────────────────────────────────────────────────────

def test_the_test_package_checks_every_document_without_saving_or_sending_anything(world):
    hires_before = world.db.query(OnboardingNewHire).count()
    docs_before = world.db.query(OnboardingDocument).count()
    r = world.get("a_admin", "/hr/onboarding/package/test")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 10 and body["ready"] < 10, "no clause wording yet"
    nda = {d["category"]: d for d in body["documents"]}["nda"]
    assert nda["missing_clauses"] and not nda["ready"]
    _ready(world)
    body = world.get("a_admin", "/hr/onboarding/package/test?engagement=standard-employee&role=analyst").json()
    by = {d["category"]: d for d in body["documents"]}
    assert by["offer_letter"]["ready"], by["offer_letter"]
    assert all(not g["editable"] or g.get("org_wide") for d in body["documents"] for g in d["settings_gaps"]), \
        "per-hire values are not reported as settings problems"
    pdf = world.get("a_admin", "/hr/onboarding/package/test/offer_letter/preview.pdf?role=analyst")
    assert pdf.status_code == 200 and pdf.headers["content-type"] == "application/pdf"
    assert "Sample New Hire" in _text(pdf.content)
    assert world.get("a_admin", "/hr/onboarding/package/test?role=ghost").status_code == 422
    assert world.db.query(OnboardingNewHire).count() == hires_before and world.db.query(OnboardingDocument).count() == docs_before
    assert world.mail == [], "nothing is e-mailed"


def test_setup_status_scores_the_organisations_readiness(world):
    s = world.get("a_admin", "/hr/onboarding/setup-status").json()
    keys = [x["key"] for x in s["steps"]]
    assert keys[:4] == ["company", "profiles", "documents", "wording"] and "countersign" in keys and "automation" in keys
    wording = {x["key"]: x for x in s["steps"]}["wording"]
    assert not wording["done"] and wording["path"].endswith("#test-package")
    _ready(world)
    s2 = world.get("a_admin", "/hr/onboarding/setup-status?fresh=true").json()
    assert s2["done"] >= s["done"]
    b = world.get("b_admin", "/hr/onboarding/setup-status").json()
    assert {x["key"]: x for x in b["steps"]}["company"]["done"] is False, "organisation B has its own (empty) profile"


# ── Word-layout templates ────────────────────────────────────────────────────────────────────────────────────────────

def test_word_import_proposes_fields_for_unknown_placeholders(world):
    data = _docx([(1, "Night Shift Letter"), "Dear {{worker.full_name}},", "Your allowance is {{Shift Allowance}}."])
    body = world.post("a_admin", "/hr/onboarding/docs-setup/docx-import/check", files={"file": ("night.docx", data)}).json()
    ph = {p["key"]: p for p in body["placeholders"]}
    assert ph["Shift Allowance"]["custom_key"] == "shift_allowance" and ph["Shift Allowance"]["custom_label"] == "Shift allowance"
    _fields(world, [SHIFT])
    body = world.post("a_admin", "/hr/onboarding/docs-setup/docx-import/check", files={"file": ("night.docx", data)}).json()
    assert body["unknown"] == [], "the organisation's own field is now known"
    r = world.post("a_admin", "/hr/onboarding/docs-setup/docx-import", files={"file": ("night.docx", data)},
                   data={"title": "Night Shift Letter"})
    assert r.status_code == 200, r.text
    v = world.db.get(TemplateVariant, r.json()["variant_id"])
    assert "{{custom.shift_allowance}}" in json.dumps(v.content)
    assert (v.options or {}).get("docx_master", {}).get("key"), "the Word file is kept as the layout"


def test_issued_documents_keep_the_word_layout_when_the_converter_is_available(world, monkeypatch):
    from app.modules.hr import onboarding_docx_master as DM
    _ready(world)
    _fields(world, [SHIFT])
    data = _docx([(1, "Night Shift Letter"), "Dear {{worker.full_name}},", "Your allowance is {{custom.shift_allowance}}."],
                 header="ACME LETTERHEAD")
    r = world.post("a_admin", "/hr/onboarding/docs-setup/docx-import", files={"file": ("night.docx", data)},
                   data={"title": "Night Shift Letter"})
    assert r.status_code == 200, r.text
    vid, cid = r.json()["variant_id"], r.json()["canonical_id"]
    _release(world, vid)
    assert world.post("a_admin", "/hr/onboarding/package/documents", json={"canonical_id": cid, "mode": "ACKNOWLEDGE"}).status_code == 200
    h, _ = _hire(world)
    world.put("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/inputs", json={"values": {"custom.shift_allowance": "75"}})

    seen = {}

    def fake_pdf(filled):
        import docx, io
        seen["text"] = "\n".join(p.text for p in docx.Document(io.BytesIO(filled)).paragraphs)
        seen["header"] = docx.Document(io.BytesIO(filled)).sections[0].header.paragraphs[0].text
        from reportlab.pdfgen import canvas
        buf = io.BytesIO()
        c = canvas.Canvas(buf)
        c.drawString(72, 720, "WORD LAYOUT " + seen["text"].replace("\n", " "))
        c.save()
        return buf.getvalue()
    monkeypatch.setattr(DM, "available", lambda: True)
    monkeypatch.setattr(DM, "to_pdf", fake_pdf)
    cat = "org:" + cid
    body = world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/send-package", json={"categories": [cat]}).json()
    assert cat in {i["category"] for i in body["issued"]}, body
    assert "Dear Nora Newstarter," in seen["text"] and "£75.00" in seen["text"] and seen["header"] == "ACME LETTERHEAD"
    world.db.expire_all()
    row = world.db.query(OnboardingDocument).filter_by(onboarding_new_hire_id=h.id, category=cat).one()
    assert _text(storage.get_store().get(row.file_path)).startswith("WORD LAYOUT")
    assert P.issued_meta(row)["layout"] == "word"
    word, name = P.document_docx(world.db, h, cat)
    import docx, io
    assert "Dear Nora Newstarter," in "\n".join(p.text for p in docx.Document(io.BytesIO(word)).paragraphs)
    assert name.endswith(".docx")


def test_without_the_converter_the_block_renderer_is_used(world, monkeypatch):
    from app.modules.hr import onboarding_docx_master as DM
    _ready(world)
    data = _docx([(1, "Welcome"), "Dear {{worker.full_name}}, welcome aboard."])
    r = world.post("a_admin", "/hr/onboarding/docs-setup/docx-import", files={"file": ("w.docx", data)}, data={"title": "Welcome"})
    vid, cid = r.json()["variant_id"], r.json()["canonical_id"]
    _release(world, vid)
    world.post("a_admin", "/hr/onboarding/package/documents", json={"canonical_id": cid, "mode": "ACKNOWLEDGE"})
    monkeypatch.setattr(DM, "available", lambda: False)
    h, _ = _hire(world)
    cat = "org:" + cid
    body = world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/send-package", json={"categories": [cat]}).json()
    assert cat in {i["category"] for i in body["issued"]}
    world.db.expire_all()
    row = world.db.query(OnboardingDocument).filter_by(onboarding_new_hire_id=h.id, category=cat).one()
    assert P.issued_meta(row)["layout"] == "blocks"
    assert "Dear Nora Newstarter, welcome aboard." in _text(storage.get_store().get(row.file_path))
    assert world.get("a_admin", "/hr/onboarding/package/word-layout").json()["templates_with_word_layout"] == [cid]


def test_word_fill_replaces_placeholders_in_tables_headers_and_reports_leftovers():
    from app.modules.hr import onboarding_docx_master as DM
    import docx, io
    d = docx.Document()
    d.sections[0].header.paragraphs[0].text = "Ref {{contract.id}}"
    d.add_paragraph("Hello {{worker.full_name}}")
    t = d.add_table(rows=1, cols=2)
    t.cell(0, 0).text = "Position"
    t.cell(0, 1).text = "[Role]"
    buf = io.BytesIO()
    d.save(buf)
    values = {"worker.full_name": "Ana", "contract.id": "C-1", "employment.position_title": "Analyst"}
    filled, left = DM.fill(buf.getvalue(), values.get,
                           # the mapping step reads a table row as its cells joined by " | " (docs_setup.blank_placeholders)
                           [{"text": "[Role]", "key": "employment.position_title", "before": "Position | ", "confirmed": True}])
    out = docx.Document(io.BytesIO(filled))
    assert out.paragraphs[0].text == "Hello Ana" and out.sections[0].header.paragraphs[0].text == "Ref C-1"
    assert out.tables[0].cell(0, 1).text == "Analyst" and left == []
    _filled, left = DM.fill(buf.getvalue(), {}.get)
    assert set(left) == {"worker.full_name", "contract.id"} and DM.leftover_blanks(_filled) == ["[Role]"]


def test_placeholder_names_may_contain_digits():
    assert C.TOKEN_RE.findall("x {{custom.allowance_2}} y") == ["custom.allowance_2"]
    assert CF.is_custom_token("custom.allowance_2") and not CF.is_custom_token("custom.2x")
    from app.modules.doc_templates import blocks as B
    assert B.validate_package_content([{"type": "paragraph", "text": "{{custom.allowance_2}}", "style": "normal"}]) == []
