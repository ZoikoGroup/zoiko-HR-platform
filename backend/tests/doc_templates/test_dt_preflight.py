"""Fail closed: the minimum negative acceptance suite of ZHR-ELT-TPL-001 §8.1 and every preflight denial reason."""
from datetime import date, timedelta

from app.modules.doc_templates.models import DecisionReceipt, GeneratedDocument
from tests.doc_templates.conftest import (BASIC_CONTENT, BASIC_FIELDS, BASIC_RULES, implement, make_clause, make_pack, make_variant,
                                          ready)


def pre(w, who="a_hr", canonical_id="HR-ONB-007", subject="a_emp", **extra):
    body = {"canonical_id": canonical_id, "subject_type": "employee", "subject_id": w.u[subject].id, **extra}
    r = w.post(who, "/hr/generated-documents/preflight", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_no_active_pack_means_no_document(world):
    implement(world.db, "HR-ONB-007")
    out = pre(world)
    assert out["outcome"] == "DENY" and out["reasons"] == ["NO_ACTIVE_PACK"]
    r = world.post("a_hr", "/hr/generated-documents/generate", json={"canonical_id": "HR-ONB-007", "subject_type": "employee",
                                                                       "subject_id": world.u["a_emp"].id})
    assert r.status_code == 422 and r.json()["detail"]["reasons"] == ["NO_ACTIVE_PACK"]
    assert world.db.query(GeneratedDocument).count() == 0
    receipt = world.db.query(DecisionReceipt).one()
    assert receipt.outcome == "DENY" and receipt.document_id is None


def test_the_suspended_research_packs_never_make_a_template_available(world):
    implement(world.db, "HR-ONB-007")
    out = pre(world)
    assert out["reasons"] == ["NO_ACTIVE_PACK"]


def test_a_region_pack_does_not_cover_another_region_or_an_unknown_one(world):
    implement(world.db, "HR-ONB-007")
    pack = make_pack(world.db, "GB", region="England")
    make_clause(world.db, pack)
    make_variant(world.db, "HR-ONB-007", pack)
    emp = world.u["a_emp"]
    emp.work_region = "Scotland"
    world.db.commit()
    assert pre(world)["reasons"] == ["NO_ACTIVE_PACK"]
    emp.work_region = None
    world.db.commit()
    assert pre(world)["reasons"] == ["NO_ACTIVE_PACK"], "a worker with no known region is not covered by a region pack"
    emp.work_region = "England"
    world.db.commit()
    assert pre(world)["outcome"] == "ALLOW"


def test_unknown_work_country_needs_legal_review(world):
    ready(world.db)
    world.u["a_emp"].work_country = None
    world.db.commit()
    out = pre(world)
    assert out["outcome"] == "NEEDS_LEGAL_REVIEW" and out["reasons"] == ["WORK_COUNTRY_UNKNOWN"]


def test_cross_border_worker_is_blocked_unless_a_variant_covers_the_combination(world):
    implement(world.db, "HR-ONB-007")
    world.u["a_emp"].work_country = "IE"
    world.db.commit()
    pack = make_pack(world.db, "IE")
    make_clause(world.db, pack)
    v = make_variant(world.db, "HR-ONB-007", pack)
    out = pre(world)
    assert out["outcome"] == "NEEDS_LEGAL_REVIEW" and out["reasons"] == ["CROSS_BORDER_UNRESOLVED"]
    v.applicability = {"cross_border_from": ["GB"]}
    world.db.commit()
    assert pre(world)["outcome"] == "ALLOW"


def test_missing_mandatory_clause_blocks(world):
    implement(world.db, "HR-ONB-007")
    pack = make_pack(world.db, "GB")
    make_variant(world.db, "HR-ONB-007", pack)
    out = pre(world)
    assert out["reasons"] == ["CLAUSE_UNRESOLVED:notice_and_termination"]


def test_a_draft_or_suspended_clause_does_not_resolve(world):
    implement(world.db, "HR-ONB-007")
    pack = make_pack(world.db, "GB")
    make_clause(world.db, pack, status="IN_DRAFT")
    make_clause(world.db, pack, status="SUSPENDED", version=2)
    make_variant(world.db, "HR-ONB-007", pack)
    assert pre(world)["reasons"] == ["CLAUSE_UNRESOLVED:notice_and_termination"]


def test_expired_variant_blocks(world):
    implement(world.db, "HR-ONB-007")
    pack = make_pack(world.db, "GB")
    make_clause(world.db, pack)
    make_variant(world.db, "HR-ONB-007", pack, effective_to=date.today() - timedelta(days=1))
    assert pre(world)["reasons"] == ["VARIANT_EXPIRED"]


def test_two_matching_active_variants_are_ambiguous(world):
    implement(world.db, "HR-ONB-007")
    pack = make_pack(world.db, "GB")
    make_clause(world.db, pack)
    make_variant(world.db, "HR-ONB-007", pack)
    make_variant(world.db, "HR-ONB-007", pack, version=2)
    assert pre(world)["reasons"] == ["AMBIGUOUS_VARIANT"]


def test_applicability_filters_variants(world):
    implement(world.db, "HR-ONB-007")
    pack = make_pack(world.db, "GB")
    make_clause(world.db, pack)
    make_variant(world.db, "HR-ONB-007", pack, applicability={"employment_types": ["part_time"]})
    assert pre(world)["reasons"] == ["NO_ACTIVE_VARIANT"]


def test_missing_required_field_lists_exactly_what_to_fix(world):
    ready(world.db)
    world.u["a_emp"].job_title = ""
    world.db.commit()
    out = pre(world)
    assert out["outcome"] == "DENY" and out["missing_fields"] == ["employment.position_title"]
    assert out["reasons"] == ["MISSING_FIELD:employment.position_title"]


def test_language_must_be_an_approved_variant_language(world):
    ready(world.db)
    assert pre(world, language="fr")["reasons"] == ["NO_ACTIVE_VARIANT"]


def test_not_implemented_and_engine_records_cannot_be_generated(world):
    assert pre(world, canonical_id="HR-CON-001")["reasons"] == ["NOT_IMPLEMENTED"]
    assert pre(world, canonical_id="HR-DOC-001")["reasons"] == ["ENGINE_RECORD_ONLY"]
    assert pre(world, canonical_id="HR-XXX-999")["reasons"] == ["UNKNOWN_TEMPLATE"]


def test_missing_or_incomplete_employer_entity_blocks(world):
    ready(world.db)
    from app.modules.doc_templates.models import EmployerEntity
    e = world.db.get(EmployerEntity, 1)
    e.legal_name = None
    world.db.commit()
    assert pre(world)["reasons"] == ["EMPLOYER_ENTITY_INCOMPLETE"]


def test_role_matrix_and_subject_authorisation(world):
    ready(world.db)
    implement(world.db, "HR-PRF-004")
    pack = world.db.query(__import__("app.modules.doc_templates.models", fromlist=["x"]).JurisdictionPack).filter_by(status="ACTIVE").first()
    make_variant(world.db, "HR-PRF-004", pack)
    # employees request nothing; managers only their reports and only manager families
    assert pre(world, who="a_emp")["reasons"] == ["ROLE_NOT_ALLOWED"]
    assert pre(world, who="a_manager")["reasons"] == ["ROLE_NOT_ALLOWED"]                 # HR-ONB is not a manager family
    # a_emp reports to a_manager: the role matrix and subject check pass (HR-PRF-004 then still needs its approved confirmation)
    out = pre(world, who="a_manager", canonical_id="HR-PRF-004")
    assert out["steps"][0] == {"step": "actor", "outcome": "PASS"}
    assert out["reasons"] == ["PROBATION_SOURCE_MISMATCH"]
    assert pre(world, who="a_manager", canonical_id="HR-PRF-004", subject="a_emp2")["reasons"] == ["SUBJECT_NOT_AUTHORISED"]


def test_another_tenants_subject_looks_missing(world):
    ready(world.db)
    assert pre(world, subject="b_emp")["reasons"] == ["SUBJECT_NOT_FOUND"]


def test_the_dry_run_persists_nothing(world):
    ready(world.db)
    pre(world)
    assert world.db.query(DecisionReceipt).count() == 0 and world.db.query(GeneratedDocument).count() == 0


def test_prohibited_clause_in_clause_rules_is_refused_at_save(world):
    from app.modules.doc_templates import blocks
    content = BASIC_CONTENT + [{"type": "clause", "key": "post_termination_restrictions"}]
    problems = blocks.validate_content(content, BASIC_FIELDS, BASIC_RULES)
    assert any("prohibited clause" in p for p in problems)


def test_tenant_variants_need_attestation_to_be_allowed(world, monkeypatch):
    implement(world.db, "HR-ONB-007")
    pack = make_pack(world.db, "GB", owner=1)
    make_clause(world.db, pack, owner=1)
    make_variant(world.db, "HR-ONB-007", pack, owner=1)
    assert pre(world)["outcome"] == "ALLOW"
    from app.config import settings
    monkeypatch.setattr(settings, "TEMPLATES_TENANT_ATTESTATION_ENABLED", False)
    assert pre(world)["reasons"] == ["TENANT_VARIANTS_DISABLED"]
