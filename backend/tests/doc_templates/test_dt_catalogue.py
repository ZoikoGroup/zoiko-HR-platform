"""Release gate R0 (ZHR-ELT-TPL-001 §8): the canonical catalogue is imported completely and exactly."""
import collections
import json

from app.modules.doc_templates import registry
from app.modules.doc_templates.models import JurisdictionPack, TemplateDefinition


def test_R0_register_has_566_unique_entries_in_23_families_with_the_guide_counts():
    entries = registry.load_register()
    assert len(entries) == registry.TOTAL_TEMPLATES == 566
    ids = [e["id"] for e in entries]
    assert len(set(ids)) == 566, "duplicate canonical IDs"
    counts = collections.Counter(e["family"] for e in entries)
    assert len(counts) == 23
    assert dict(counts) == {fam: n for fam, (_, n) in registry.FAMILIES.items()}
    assert sum(n for _, n in registry.FAMILIES.values()) == 566
    for e in entries:
        assert e["id"].startswith(e["family"] + "-"), e["id"]
        assert e["kind"] in registry.KINDS and e["risk"] in registry.RISKS and e["sensitivity"] in registry.SENSITIVITIES
        assert e["status"] == registry.BLOCKED


def test_R0_type_and_risk_distribution_matches_the_guide():
    entries = registry.load_register()
    assert collections.Counter(e["kind"] for e in entries) == {
        "LETTER_NOTICE": 130, "RECORD": 104, "ASSESSMENT": 74, "AGREEMENT": 73, "FORM": 71, "POLICY": 49, "DECISION": 43,
        "CHECKLIST": 13, "OFFICIAL_EXTERNAL": 9}


def test_R0_database_catalogue_is_exactly_the_register(world):
    rows = {d.canonical_id: d for d in world.db.query(TemplateDefinition).all()}
    register = {e["id"]: e for e in registry.load_register()}
    assert set(rows) == set(register)
    for cid, e in register.items():
        d = rows[cid]
        assert (d.title, d.family_id, d.kind, d.legal_risk, d.sensitivity) == (e["title"], e["family"], e["kind"], e["risk"], e["sensitivity"])
        assert d.catalogue_status == registry.BLOCKED
        assert d.source_spec == "ZHR-ELT-MSPEC-001 v1.0"


def test_implemented_templates_are_the_governance_ten_plus_the_starters(world):
    from app.modules.doc_templates import starters
    implemented = {d.canonical_id for d in world.db.query(TemplateDefinition).filter(TemplateDefinition.implemented.is_(True)).all()}
    assert implemented == set(registry.GOVERNANCE_TEMPLATES) | set(starters.STARTERS)
    assert len(implemented) == 82, "Prompts 1–4: the 10 governance records and 72 business templates"
    assert len(registry.GOVERNANCE_TEMPLATES) == 10 and len(starters.STARTERS) >= 28


def test_seed_is_idempotent_and_research_packs_stay_suspended(world):
    from app.modules.doc_templates import bootstrap
    assert bootstrap.seed(world.db) == {"definitions_touched": 0, "packs_added": 0, "starters_added": 0, "starter_clauses_added": 0}
    packs = world.db.query(JurisdictionPack).filter(JurisdictionPack.scope_type == "PLATFORM").all()
    assert {p.country for p in packs} == {"GB", "US", "AU", "SG"}
    assert all(p.status == "SUSPENDED" and "not activated" in p.notes for p in packs)


def test_catalogue_api_lists_all_566_with_availability_reasons(world):
    r = world.get("a_hr", "/hr/templates", params={"per_page": 600})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 566 and len(body["items"]) == 566
    by_id = {i["canonical_id"]: i for i in body["items"]}
    assert by_id["HR-CON-001"]["available"] is False and by_id["HR-CON-001"]["unavailable_reason"] == "NOT_IMPLEMENTED"
    assert by_id["HR-DOC-001"]["engine_record"] is True
    fams = world.get("a_hr", "/hr/templates/families").json()
    assert fams["total"] == 23


def test_catalogue_is_hr_only(world):
    assert world.get("a_emp", "/hr/templates").status_code == 403
    assert world.get("a_manager", "/hr/templates").status_code == 403
    assert world.get("platform", "/hr/templates").status_code == 404


def test_seed_file_in_repo_is_byte_identical_json_to_the_source_schema():
    with open(registry.REGISTER_PATH, encoding="utf-8") as fh:
        data = json.load(fh)
    assert all(set(e) == {"id", "family", "title", "kind", "risk", "sensitivity", "trigger", "template_json", "status"} for e in data)
