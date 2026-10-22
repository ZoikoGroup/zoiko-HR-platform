"""Starter content (Prompts 2–4): every starter is valid, renders with synthetic data, locks what must be locked, loads
idempotently with revisions, and templates whose clauses have no starter text fail closed until a clause is released."""
import json

import pytest

from app.modules.doc_templates import blocks, fields, renderer, starters
from app.modules.doc_templates.models import TemplateStarter, TemplateStarterClause, TemplateVariant
from app.modules.doc_templates.seeds import load_starters
from tests.doc_templates.p2_support import activate

PROMPT2 = {"HR-HIR-001", "HR-HIR-004", "HR-HIR-006", "HR-HIR-007", "HR-HIR-011", "HR-HIR-012", "HR-HIR-014", "HR-HIR-015", "HR-HIR-016",
           "HR-HIR-017", "HR-HIR-018", "HR-HIR-019", "HR-HIR-020", "HR-ORG-003", "HR-ORG-004", "HR-ORG-005", "HR-ORG-015", "HR-ONB-001",
           "HR-ONB-003", "HR-ONB-004", "HR-ONB-005", "HR-ONB-007", "HR-ONB-010", "HR-ONB-011", "HR-ONB-015", "HR-ONB-017", "HR-ONB-020",
           "HR-ONB-022"}


PROMPT3 = {"HR-POL-001", "HR-POL-002", "HR-POL-004", "HR-POL-005", "HR-POL-019", "HR-POL-021", "HR-POL-025", "HR-POL-026", "HR-POL-027",
           "HR-POL-030", "HR-POL-031", "HR-POL-041", "HR-POL-042", "HR-POL-043", "HR-LEV-001", "HR-LEV-003", "HR-LEV-007", "HR-LEV-013",
           "HR-LEV-018", "HR-TIM-003", "HR-TIM-004", "HR-TIM-007", "HR-TIM-013", "HR-CMP-001", "HR-CMP-002", "HR-CMP-005", "HR-CMP-010",
           "HR-CMP-024"}


def test_all_28_prompt2_starters_exist():
    assert PROMPT2 <= set(starters.STARTERS) and len(PROMPT2) == 28


def test_all_28_prompt3_starters_exist_and_every_policy_carries_the_locked_rights_blocks():
    assert PROMPT3 <= set(starters.STARTERS) and len(PROMPT3) == 28
    for cid in (c for c in PROMPT3 if c.startswith("HR-POL")):
        ids = {b.get("id"): b for b in starters.STARTERS[cid]["content"]}
        assert ids["rights_policy_status"]["locked"] and ids["rights_speak_up"]["locked"], cid
        assert starters.STARTERS[cid]["meta"]["output_mode"] == "POLICY"


PROMPT4 = {"HR-PRF-002", "HR-PRF-003", "HR-PRF-004", "HR-PRF-005", "HR-PRF-007", "HR-PRF-010", "HR-PRF-011", "HR-PRF-013", "HR-PRF-018",
           "HR-PRF-020", "HR-CHG-001", "HR-CHG-002", "HR-CHG-004", "HR-CHG-006", "HR-CHG-007", "HR-CHG-008"}


def test_all_16_prompt4_starters_exist_and_all_82_are_covered():
    assert PROMPT4 <= set(starters.STARTERS) and len(PROMPT4) == 16
    assert len(PROMPT2 | PROMPT3 | PROMPT4) == 72 and set(starters.STARTERS) == PROMPT2 | PROMPT3 | PROMPT4


@pytest.mark.parametrize("cid,clause", [("HR-PRF-003", "probation_extension_rules"), ("HR-PRF-005", "probation_termination_notice"),
                                        ("HR-PRF-005", "appeal_rights"), ("HR-PRF-013", "pip_outcomes")])
def test_prompt4_templates_without_jurisdiction_text_fail_closed(world, cid, clause):
    activate(world.db, cid, skip_clauses=(clause,))
    from app.modules.doc_templates import preflight
    r = preflight.run_preflight(world.db, organization_id=1, actor=world.u["a_hr"], canonical_id=cid, subject_type="employee",
                                subject_id=world.u["a_emp"].id)
    assert f"CLAUSE_UNRESOLVED:{clause}" in r.reasons


@pytest.mark.parametrize("cid", sorted(PROMPT2 | PROMPT3 | PROMPT4))
def test_starter_is_valid_locked_and_renders_with_synthetic_data(cid):
    s = starters.STARTERS[cid]
    assert blocks.validate_content(s["content"], s["field_contract"], s["clause_rules"]) == []
    for b in s["content"]:
        if b["type"] in ("letterhead", "signature_block", "declaration") or str(b.get("id", "")).startswith(("rights_", "privacy_")):
            assert b.get("locked") is True, (cid, b.get("id"))
    from app.modules.hr.models import Organization
    from app.modules.doc_templates.service import build_input
    ctx = fields.FieldContext(db=None, organization=Organization(id=0, organization_name="Example Organisation", currency="GBP"), sample=True)
    clauses = {k: type("C", (), {"text": f"Clause {k}."})() for k in s["clause_rules"]["mandatory"] + s["clause_rules"]["optional"]}
    inp = build_input(ctx, blocks=s["content"], clauses=clauses, required_clause_keys=s["clause_rules"]["mandatory"], number="SAMPLE-1",
                      title=cid, sensitivity="C2", letterhead_info={"legal_name": "Example Employer Ltd"}, author="Example Employer Ltd")
    assert renderer.render_pdf(inp).startswith(b"%PDF")
    assert "Example" in renderer.render_html(inp) or cid
    assert s["note"] == starters.STARTER_NOTE


def test_starters_never_invent_terms_where_the_law_decides():
    texts = json.dumps({cid: s["content"] for cid, s in starters.STARTERS.items()}).lower()
    for invented in ("weeks' notice", "days' notice", "statutory minimum", "probation of 3 months", "probation of six months"):
        assert invented not in texts
    assert set(starters.NO_STARTER_TEXT) >= {"privacy_lawful_basis_recruitment", "internship_status_statement", "fixed_term_statement",
                                             "offer_withdrawal_rights", "probation_summary"}
    assert not set(starters.NO_STARTER_TEXT) & set(starters.STARTER_CLAUSES)
    assert set(starters.NO_STARTER_TEXT) >= {"probation_legal_limits", "rest_breaks", "overtime_pay_or_time_off", "maximum_working_time",
                                             "statutory_annual_leave", "annual_leave_carry_over", "leave_on_termination",
                                             "sickness_evidence_rules", "sick_pay", "family_leave_entitlements", "family_leave_pay",
                                             "monitoring_notice", "family_leave_notice_requirements"}


@pytest.mark.parametrize("cid,clause", [("HR-POL-005", "probation_legal_limits"), ("HR-POL-019", "maximum_working_time"),
                                        ("HR-POL-025", "statutory_annual_leave"), ("HR-POL-026", "sick_pay"),
                                        ("HR-POL-027", "family_leave_pay"), ("HR-POL-031", "monitoring_notice")])
def test_prompt3_policies_without_jurisdiction_text_fail_closed(world, cid, clause):
    activate(world.db, cid, skip_clauses=(clause,))
    from app.modules.doc_templates import preflight
    r = preflight.run_preflight(world.db, organization_id=1, actor=world.u["a_hr"], canonical_id=cid, subject_type="employee",
                                subject_id=world.u["a_emp"].id)
    assert f"CLAUSE_UNRESOLVED:{clause}" in r.reasons


@pytest.mark.parametrize("cid,clause", [("HR-HIR-014", "internship_status_statement"), ("HR-HIR-015", "fixed_term_statement"),
                                        ("HR-HIR-018", "offer_withdrawal_rights"), ("HR-HIR-004", "privacy_lawful_basis_recruitment")])
def test_clauses_without_starter_text_fail_closed_until_released(world, cid, clause):
    activate(world.db, cid, skip_clauses=(clause,))
    from app.modules.doc_templates import preflight
    from app.modules.hr.models import RecruitmentCandidate, RecruitmentOffer
    cand = RecruitmentCandidate(name="Casey Candidate", email="casey@example.com", position="Analyst", organization_id=1)
    world.db.add(cand)
    world.db.commit()
    offer = RecruitmentOffer(candidate_id=cand.id, candidate_name=cand.name, position="Analyst", organization_id=1, work_country="GB")
    world.db.add(offer)
    world.db.commit()
    r = preflight.run_preflight(world.db, organization_id=1, actor=world.u["a_hr"], canonical_id=cid, subject_type="candidate",
                                subject_id=cand.id, source_ref=f"recruitment_offer:{offer.id}")
    assert f"CLAUSE_UNRESOLVED:{clause}" in r.reasons


def test_loader_is_idempotent_and_versioned_and_never_touches_variants(world, monkeypatch):
    assert load_starters.load(world.db) == {"starters_added": [], "clauses_added": []}
    v = activate(world.db, "HR-ONB-007")
    before = (v.content, v.checksum)
    original = starters.load_files

    def changed():
        files = original()
        files["HR-ONB-007"] = {**files["HR-ONB-007"], "content": files["HR-ONB-007"]["content"] + [{"type": "page_break", "id": "extra"}]}
        return files
    monkeypatch.setattr(starters, "load_files", changed)
    assert load_starters.load(world.db)["starters_added"] == ["HR-ONB-007"]
    revs = [r.revision for r in world.db.query(TemplateStarter).filter_by(canonical_id="HR-ONB-007").order_by(TemplateStarter.revision)]
    assert revs == [1, 2]
    world.db.refresh(v)
    assert (v.content, v.checksum) == before
    assert starters.latest(world.db, "HR-ONB-007")["revision"] == 2
    assert world.db.query(TemplateStarterClause).count() == len(starters.STARTER_CLAUSES)
