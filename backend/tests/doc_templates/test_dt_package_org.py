"""The organisation's own onboarding package (phases 2 and 3).

Resolution order, locked blocks, "Customise this document", version safety, switching documents on and off per engagement
profile, and the organisation's own documents in the package.
"""
import copy
import hashlib

import pytest

from app.modules.doc_templates import package_blocks as PB
from app.modules.doc_templates import renderer, storage
from app.modules.doc_templates.models import GeneratedDocument, TemplateVariant
from app.modules.hr import onboarding_package as P
from app.modules.hr import onboarding_package_org as ORG
from app.modules.hr import onboarding_package_render as R
from app.modules.hr.models import OnboardingDocument
from tests.doc_templates.test_dt_offer_package import (ANALYST, GOVERNING_LAW, INPUTS, SETTINGS, V2_PROFILE, _all_clauses,
                                                      _new_hire)


@pytest.fixture(autouse=True)
def _v2_terms(world):
    from types import SimpleNamespace
    from app.modules.hr import company_profile, onboarding_profiles
    actor = SimpleNamespace(id=world.u["a_admin"].id, organization_id=1)
    company_profile.save_profile(world.db, actor, V2_PROFILE)
    onboarding_profiles.save_role(world.db, actor, "analyst", ANALYST)


def _text(pdf: bytes) -> str:
    return " ".join(renderer.pdf_text(pdf).split())


def _ready(world):
    assert world.put("a_admin", "/hr/onboarding/package/settings", json={**SETTINGS, "clauses": {
        **_all_clauses(), "governing_law": {"text": GOVERNING_LAW}}}).status_code == 200


def _hire(world, **kw):
    h, token = _new_hire(world, **kw)
    assert world.put("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/inputs", json={"values": INPUTS}).status_code == 200
    world.db.refresh(h)
    return h, token


def _customise(world, category="offer_letter", who="a_hr"):
    r = world.post(who, f"/hr/onboarding/package/documents/{category}/customise")
    assert r.status_code == 200, r.text
    return r.json()["variant_id"]


def _edit(world, vid, change, who="a_hr", reason="Our own wording"):
    v = world.get(who, f"/hr/templates/variants/{vid}").json()
    content = copy.deepcopy(v["content"])
    change(content)
    return world.put(who, f"/hr/templates/variants/{vid}", json={"content": content, "change_reason": reason})


def _release(world, vid):
    """Review → legal approval → release, by three different people (the existing flow, no shortcuts)."""
    v = world.db.get(TemplateVariant, vid)
    world.db.refresh(v)
    from app.modules.doc_templates.models import JurisdictionPack
    pack = world.db.get(JurisdictionPack, v.pack_id)
    if pack.status == "DRAFT":
        assert world.post("a_hr", f"/hr/templates/packs/{pack.id}/submit").status_code == 200
        r = world.post("a_admin2", f"/hr/templates/packs/{pack.id}/activate", json={"accepted": True})
        assert r.status_code == 200, r.text
    r = world.post("a_hr", f"/hr/templates/variants/{vid}/submit-review")
    assert r.status_code == 200, r.text
    r = world.post("a_admin", f"/hr/templates/variants/{vid}/approve-legal",
                   json={"attestation_accepted": True, "signed_name": "Avery Admin"})
    assert r.status_code == 200, r.text
    r = world.post("a_admin2", f"/hr/templates/variants/{vid}/release")
    assert r.status_code == 200, r.text
    world.db.expire_all()


def _set_first_paragraph(text):
    def change(content):
        for b in content:
            if b["type"] == "paragraph" and not b.get("locked") and "{{document.issue_date}}" not in b["text"]:
                b["text"] = text
                return
    return change


# ── phase 2: resolution order, locked blocks, customise, version safety ─────────────────────────────────────────────

def test_customise_creates_a_draft_that_is_never_used_for_a_hire_until_released(world):
    _ready(world)
    h, _ = _hire(world)
    vid = _customise(world)
    rows = {d["category"]: d for d in world.get("a_admin", "/hr/onboarding/package/documents").json()["documents"]}
    assert "draft" in rows["offer_letter"]["template_state"]["label"] and "standard template" in rows["offer_letter"]["template_state"]["label"]
    assert _edit(world, vid, _set_first_paragraph("**ACME OWN WORDING** for {{worker.full_name}}.")).status_code == 200
    world.db.expire_all()
    _content, source = ORG.resolve(world.db, h, "offer_letter")
    assert source["kind"] == "starter", "an IN_DRAFT version is never used for a real hire"
    preview = world.post("a_hr", f"/hr/templates/variants/{vid}/preview").json()
    assert "ACME OWN WORDING" in preview["html"] and "DRAFT – NOT FOR ISSUE" in preview["html"]

    _release(world, vid)
    _content, source = ORG.resolve(world.db, h, "offer_letter")
    assert source["kind"] == "variant" and source["variant_id"] == vid
    pdf = world.get("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/offer_letter/preview.pdf").content
    assert "ACME OWN WORDING" in _text(pdf) and "organisation v1" in _text(pdf)
    rows = {d["category"]: d for d in world.get("a_admin", "/hr/onboarding/package/documents").json()["documents"]}
    assert rows["offer_letter"]["template_state"]["label"].startswith("Your version v1 – released")


def test_a_pinned_released_version_wins_and_suspended_versions_are_skipped(world):
    _ready(world)
    h, _ = _hire(world)
    v1 = _customise(world)
    _edit(world, v1, _set_first_paragraph("VERSION ONE TEXT."))
    _release(world, v1)
    v2 = _customise(world)
    assert v2 != v1
    _edit(world, v2, _set_first_paragraph("VERSION TWO TEXT."))
    _release(world, v2)                                   # releasing v2 retires v1 (existing supersession rules)
    assert world.db.get(TemplateVariant, v1).status == "RETIRED"
    _c, src = ORG.resolve(world.db, h, "offer_letter")
    assert src["variant_id"] == v2
    row = ORG.row_for(world.db, 1, "offer_letter")
    row.variant_id = v1                                   # pinned to a retired version: not usable, resolution falls through
    world.db.commit()
    _c, src = ORG.resolve(world.db, h, "offer_letter")
    assert src["variant_id"] == v2
    assert world.post("a_hr", f"/hr/templates/variants/{v2}/suspend", json={"reason": "Counsel asked"}).status_code == 200
    world.db.expire_all()
    _c, src = ORG.resolve(world.db, h, "offer_letter")
    assert src["kind"] == "starter", "suspended versions are never used; the platform default applies"


def test_locked_blocks_cannot_be_edited_removed_or_moved(world):
    vid = _customise(world, "offer_letter")
    v = world.get("a_hr", f"/hr/templates/variants/{vid}").json()
    locked = [i for i, b in enumerate(v["content"]) if b.get("locked")]
    assert locked, "the signature blocks are locked"

    def edit_locked(content):
        content[locked[0]]["statement"] = "I agree to anything."

    def remove_locked(content):
        del content[locked[-1]]

    def move_locked(content):
        b = content.pop(locked[-1])
        content.insert(0, b)

    for change in (edit_locked, remove_locked, move_locked):
        r = _edit(world, vid, change)
        assert r.status_code == 422, change.__name__
        assert any("locked" in p and "b" in p for p in r.json()["detail"]["problems"]), r.json()
    assert _edit(world, vid, _set_first_paragraph("Fine to change.")).status_code == 200


def test_an_issued_document_never_changes_when_a_new_version_is_released(world):
    _ready(world)
    h, _ = _hire(world)
    v1 = _customise(world)
    _edit(world, v1, _set_first_paragraph("ORIGINAL WORDING V1."))
    _release(world, v1)
    body = world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/send-package").json()
    assert "offer_letter" in {i["category"] for i in body["issued"]}, body.get("held")
    world.db.expire_all()
    row = world.db.query(OnboardingDocument).filter_by(onboarding_new_hire_id=h.id, category="offer_letter").one()
    meta = P.issued_meta(row)
    gen = world.db.get(GeneratedDocument, row.document_id)
    original = storage.get_store().get(gen.pdf_path)
    assert meta["variant_id"] == v1 and meta["variant_version"] == 1 and meta["variant_checksum"]
    assert meta["rendered_sha256"] == hashlib.sha256(original).hexdigest() == gen.pdf_sha256
    assert gen.variant_id == v1 and gen.variant_version == 1

    v2 = _customise(world)
    _edit(world, v2, _set_first_paragraph("CHANGED WORDING V2."))
    _release(world, v2)
    world.db.expire_all()
    gen = world.db.get(GeneratedDocument, row.document_id)
    assert storage.get_store().get(gen.pdf_path) == original, "the issued PDF is byte-identical"
    preview = world.get("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/offer_letter/preview.pdf").content
    assert preview == original
    ctx = P.render_context(world.db, h, "offer_letter", final=True)
    assert "ORIGINAL WORDING V1." in _text(R.render_pdf("offer_letter", ctx)), "re-rendering uses the issued version"
    assert ctx.source["variant_id"] == v1


# ── phase 3: on/off, engagement profiles, the organisation's own documents ───────────────────────────────────────────

def _docs(world, who="a_admin"):
    return {d["category"]: d for d in world.get(who, "/hr/onboarding/package/documents").json()["documents"]}


def test_the_package_is_seeded_with_todays_ten_documents_and_mandatory_ones_stay_on(world):
    docs = _docs(world)
    assert len(docs) == 10 and all(d["enabled"] for d in docs.values())
    assert {c for c, d in docs.items() if d["mandatory"]} == {"offer_letter", "employment_contract"}
    r = world.put("a_admin", "/hr/onboarding/package/documents", json={"documents": [{"category": "offer_letter", "enabled": False}]})
    assert r.status_code == 422 and "cannot be switched off" in r.text
    r = world.put("a_admin", "/hr/onboarding/package/documents",
                  json={"documents": [{"category": "employment_contract", "excluded_engagement_slugs": ["standard-employee"]}]})
    assert r.status_code == 422
    assert world.put("a_admin", "/hr/onboarding/package/documents",
                     json={"documents": [{"category": "nda", "mode": "TELEPATHY"}]}).status_code == 422
    assert world.get("b_admin", "/hr/onboarding/package/documents").json()["documents"][0]["enabled"] is True


def test_a_switched_off_document_is_never_sent_listed_or_outstanding(world):
    _ready(world)
    r = world.put("a_admin", "/hr/onboarding/package/documents",
                  json={"documents": [{"category": "velocity_report", "enabled": False},
                                      {"category": "daily_kpi", "enabled": False}]})
    assert r.status_code == 200, r.text
    h, _ = _hire(world)
    view = world.get("a_admin", f"/hr/onboarding/new-hires/{h.id}/package").json()
    cats = {d["category"] for d in view["documents"]}
    assert "velocity_report" not in cats and "daily_kpi" not in cats and "offer_letter" in cats
    body = world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/send-package").json()
    sent = {i["category"] for i in body["issued"]}
    assert "velocity_report" not in sent and "daily_kpi" not in sent
    assert not world.db.query(OnboardingDocument).filter_by(onboarding_new_hire_id=h.id, category="daily_kpi").count()
    assert not any("Velocity" in o["title"] or "Key Performance" in o["title"] for o in P.outstanding_for_hire(world.db, h))
    # switching a document off later never takes back what was already sent
    world.put("a_admin", "/hr/onboarding/package/documents", json={"documents": [{"category": "job_description", "enabled": False}]})
    world.db.expire_all()
    view = world.get("a_admin", f"/hr/onboarding/new-hires/{h.id}/package").json()
    jd = next(d for d in view["documents"] if d["category"] == "job_description")
    assert jd["state"] != "not_sent" and jd["in_package"] is False


def test_documents_can_be_limited_to_some_engagement_profiles(world):
    _ready(world)
    from types import SimpleNamespace
    from app.modules.hr import onboarding_profiles
    actor = SimpleNamespace(id=world.u["a_admin"].id, organization_id=1)
    onboarding_profiles.save_engagement(world.db, actor, "internship", {
        "name": "Internship", "employment_type": "internship", "party_term": "Intern", "engagement_term": "internship",
        "assessment_label": "Assessment", "assessment_months": 3, "remuneration_label": "Stipend",
        "working_days": ["MON", "TUE", "WED", "THU", "FRI"]})
    r = world.put("a_admin", "/hr/onboarding/package/documents",
                  json={"documents": [{"category": "velocity_report", "excluded_engagement_slugs": ["internship"]}]})
    assert r.status_code == 200, r.text
    assert world.put("a_admin", "/hr/onboarding/package/documents",
                     json={"documents": [{"category": "nda", "applies_to_engagement_slugs": ["nope"]}]}).status_code == 422
    intern, _ = _hire(world, employment_type="internship", email="ivy.intern@example.com")
    world.put("a_admin", f"/hr/onboarding/new-hires/{intern.id}/package/inputs",
              json={"values": {"engagement_profile_slug": "internship"}})
    staff, _ = _hire(world, email="sam.staff@example.com")
    world.db.expire_all()
    assert "velocity_report" not in {d["category"] for d in ORG.documents_for_hire(world.db, intern)}
    assert "velocity_report" in {d["category"] for d in ORG.documents_for_hire(world.db, staff)}
    board = world.get("a_admin", "/hr/onboarding/package/status").json()
    by = {x["new_hire_id"]: x for x in board["hires"]}
    assert by[intern.id]["documents"]["velocity_report"]["state"] == "not_included"
    assert by[staff.id]["documents"]["velocity_report"]["state"] == "not_sent"


def _own_template(world, title="Hybrid Working Agreement", text="I agree to the hybrid working rules, {{worker.full_name}}."):
    r = world.post("a_hr", "/hr/onboarding/package/org-templates", json={
        "title": title, "content": [{"type": "heading", "text": title, "level": 1}, {"type": "paragraph", "text": text},
                                    {"type": "signature_block", "rows": [["{{engagement.party_term}}", "{{worker.full_name}}", "", ""]],
                                     "locked": True}]})
    assert r.status_code == 200, r.text
    return r.json()


def test_the_organisations_own_document_is_sent_signed_and_counted_like_a_platform_one(world):
    _ready(world)
    t = _own_template(world)
    assert t["canonical_id"] == "ORG1-DOC-001"
    r = world.post("a_admin", "/hr/onboarding/package/documents", json={"canonical_id": t["canonical_id"], "mode": "SIGN"})
    assert r.status_code == 409, "only released templates can be added"
    world.put("a_hr", f"/hr/templates/variants/{t['variant_id']}", json={"change_reason": "First version"})
    _release(world, t["variant_id"])
    r = world.post("a_admin", "/hr/onboarding/package/documents",
                   json={"canonical_id": t["canonical_id"], "mode": "SIGN", "signers": ["candidate"]})
    assert r.status_code == 200, r.text
    cat = "org:ORG1-DOC-001"
    assert cat in _docs(world)
    assert world.get("b_admin", "/hr/templates/ORG1-DOC-001").status_code == 404, "another organisation never sees it"

    h, _ = _hire(world)
    body = world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/send-package").json()
    assert "issued" in body, body
    assert cat in {i["category"] for i in body["issued"]}, body
    world.db.expire_all()
    row = world.db.query(OnboardingDocument).filter_by(onboarding_new_hire_id=h.id, category=cat).one()
    gen = world.db.get(GeneratedDocument, row.document_id)
    assert gen.status == "ISSUED" and gen.title == "Hybrid Working Agreement" and gen.variant_id == t["variant_id"]
    assert "I agree to the hybrid working rules, Nora Newstarter." in _text(storage.get_store().get(gen.pdf_path))
    assert any(o["title"] == "Hybrid Working Agreement" and o["action"] == "sign" for o in P.outstanding_for_hire(world.db, h))

    # a withdrawn template is skipped for new sends, and the package card warns HR
    assert world.post("a_hr", f"/hr/templates/variants/{t['variant_id']}/suspend", json={"reason": "Rewrite"}).status_code == 200
    world.db.expire_all()
    assert _docs(world)[cat]["warning"]
    other, _ = _hire(world, email="olly.other@example.com")
    assert cat not in {d["category"] for d in ORG.documents_for_hire(world.db, other)}
    body = world.post("a_admin", f"/hr/onboarding/new-hires/{other.id}/send-package").json()
    assert "issued" in body, body
    assert cat not in {i["category"] for i in body["issued"]}
