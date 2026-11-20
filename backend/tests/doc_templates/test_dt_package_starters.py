"""Onboarding package documents as templates (phase 1): one block vocabulary, one renderer, platform starters.

Golden parity: for each of the 10 documents and a fixed hire, the PDF rendered from the platform starter has the same text and
the same number of pages as the PDF rendered from the old Python builder.
"""
import io
import json

import pytest

from app.modules.doc_templates import blocks as B
from app.modules.doc_templates import package_blocks as PB
from app.modules.doc_templates import package_templates as PT
from app.modules.doc_templates import renderer, starters
from app.modules.hr import onboarding_package as P
from app.modules.hr import onboarding_package_content as C
from app.modules.hr import onboarding_package_render as R
from tests.doc_templates.test_dt_offer_package import GOVERNING_LAW, INPUTS, SETTINGS, _all_clauses, _new_hire


def _text(pdf: bytes) -> str:
    return " ".join(renderer.pdf_text(pdf).split())


def _pages(pdf: bytes) -> int:
    from pypdf import PdfReader
    return len(PdfReader(io.BytesIO(pdf)).pages)


def test_every_package_document_has_a_valid_starter_with_the_same_ids():
    assert set(PT.starter_files()) == set(C.CATEGORIES)
    for cat, s in PT.starter_files().items():
        d = C.DOCS[cat]
        assert s["template_id"] == d["template_id"] and s["canonical_id"] == "PKG-" + d["template_id"]
        assert B.validate_package_content(s["blocks"]) == [], cat
        assert all(b.get("id") for b in s["blocks"])
    assert not any(cid.startswith("PKG-") for cid in starters.STARTERS), "package starters stay out of the 566 catalogue"


def test_the_seed_files_match_the_generator():
    import subprocess
    import sys
    r = subprocess.run([sys.executable, "scripts/package_starters_generate.py", "--check"], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr


@pytest.mark.parametrize("cat", C.CATEGORIES)
def test_round_trip_is_exact(cat):
    assert PB.normalise(PB.to_package(PT.starter_for(cat)["blocks"])) == PB.normalise(C.builder_blocks(cat))


@pytest.mark.parametrize("cat", C.CATEGORIES)
def test_template_set_parity(cat):
    a = R.render_pdf(cat, R.RenderContext(mode="template", content=C.builder_blocks(cat)))
    b = R.render_pdf(cat, R.RenderContext(mode="template"))
    assert _text(a) == _text(b) and _pages(a) == _pages(b)


def test_issued_documents_render_the_same_text_from_the_starter_as_from_the_builder(world):
    assert world.put("a_admin", "/hr/onboarding/package/settings", json={**SETTINGS, "clauses": {
        **_all_clauses(), "governing_law": {"text": GOVERNING_LAW}}}).status_code == 200
    h, _ = _new_hire(world)
    assert world.put("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/inputs", json={"values": INPUTS}).status_code == 200
    world.db.refresh(h)
    for cat in C.CATEGORIES:
        ctx = P.render_context(world.db, h, cat, final=True)
        ctx_old = P.render_context(world.db, h, cat, final=True)
        ctx_old.content = C.builder_blocks(cat)
        new, old = R.render_pdf(cat, ctx), R.render_pdf(cat, ctx_old)
        assert _text(new) == _text(old), cat
        assert _pages(new) == _pages(old), cat
        assert P.readiness(ctx, cat) == P.readiness(ctx_old, cat), cat


def test_signatures_consents_and_legal_statements_are_locked_in_the_starters():
    for cat, s in PT.starter_files().items():
        for b in s["blocks"]:
            if b["type"] in ("signature_block", "consent"):
                assert b.get("locked"), (cat, b["id"])
    sd = PT.starter_for("self_disclosure")["blocks"]
    assert all(b.get("locked") for b in sd if b["type"] in ("checks", "textbox"))
    aff = PT.starter_for("exclusivity_affidavit")["blocks"]
    assert any(b.get("locked") and b["type"] == "list" for b in aff), "the affidavit attestation"
    app = PT.starter_for("job_application")["blocks"]
    assert any(b.get("locked") and b.get("key") == "applicant_privacy_notice" for b in app), "the privacy notice"


def test_package_content_validation_refuses_unknown_types_fields_and_clauses():
    good = [{"type": "paragraph", "text": "Dear {{worker.full_name}},"}]
    assert B.validate_package_content(good) == []
    assert any("unknown block type" in p for p in B.validate_package_content([{"type": "video"}]))
    assert any("unknown field" in p for p in B.validate_package_content([{"type": "paragraph", "text": "{{worker.shoe_size}}"}]))
    assert any("unknown clause" in p for p in B.validate_package_content([{"type": "clause", "key": "made_up"}]))
    assert any("unknown keys" in p for p in B.validate_package_content([{"type": "kv", "rows": [], "colour": "red"}]))


def test_package_starters_load_as_versioned_starter_rows(world):
    from app.modules.doc_templates.models import TemplateDefinition, TemplateStarter
    added = PT.load_starters(world.db)
    world.db.commit()
    assert len(added) == 10 and PT.load_starters(world.db) == []
    d = world.db.get(TemplateDefinition, "PKG-HR-CON-101")
    assert d.family_id == "HR-PKG" and d.implemented
    row = world.db.query(TemplateStarter).filter_by(canonical_id="PKG-HR-HIR-011").one()
    assert row.revision == 1 and PT.starter_revision(world.db, "offer_letter") == 1
    assert json.dumps(row.payload["content"]) == json.dumps(PT.starter_for("offer_letter")["blocks"])
    # the catalogue API still lists the 566 register templates only
    assert world.get("a_hr", "/hr/templates", params={"per_page": 600}).json()["total"] == 566
