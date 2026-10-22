"""Tenant isolation, injection safety, the state machine as the only status writer, AI cannot issue, no contents in logs."""
import ast
import logging
import pathlib

import pytest

from app.modules.doc_templates import blocks, conditions, renderer, resolver
from app.modules.doc_templates.models import AppendOnlyViolation, DocumentEvent, GeneratedDocument
from tests.doc_templates.conftest import CANARY_CLAUSE, CANARY_NAME, gen, ready

MODULE = pathlib.Path(__file__).resolve().parents[2] / "app" / "modules" / "doc_templates"


# ── tenant isolation ─────────────────────────────────────────────────────────────────────────────────────────────────

def test_another_tenant_cannot_list_preview_download_act_on_or_sign_a_document(world):
    ready(world.db)
    doc = gen(world).json()
    world.post("a_hr", f"/hr/generated-documents/{doc['id']}/issue")
    i = doc["id"]
    assert world.get("b_hr", "/hr/generated-documents").json()["total"] == 0
    for url in (f"/hr/generated-documents/{i}", f"/hr/generated-documents/{i}/preview", f"/hr/generated-documents/{i}/timeline",
                f"/hr/generated-documents/governance/generation-instructions/{i}", f"/hr/me/generated-documents/{i}"):
        r = world.get("b_hr", url)
        assert r.status_code == 404, (url, r.status_code)
        assert CANARY_NAME not in r.text
    for url in (f"/hr/generated-documents/{i}/download-link", f"/hr/generated-documents/{i}/issue",
                f"/hr/generated-documents/{i}/approve", f"/hr/me/generated-documents/{i}/sign/otp"):
        assert world.post("b_hr", url, json={}).status_code in (404, 422), url
    assert world.post("b_emp", f"/hr/me/generated-documents/{i}/acknowledge", json={"text_version": "ACK-1.0"}).status_code == 404


def test_platform_super_admin_gets_nothing(world):
    ready(world.db)
    doc = gen(world).json()
    for url in ("/hr/generated-documents", f"/hr/generated-documents/{doc['id']}", "/hr/templates", "/hr/legal-entities",
                "/hr/me/generated-documents", "/hr/policy-distributions"):
        r = world.get("platform", url)
        assert r.status_code == 404 and r.json() == {"detail": "Not Found"}, url


def test_employees_see_only_their_own_issued_non_internal_documents(world):
    ready(world.db)
    doc = gen(world).json()
    assert world.get("a_emp", "/hr/generated-documents").status_code == 403
    world.post("a_hr", f"/hr/generated-documents/{doc['id']}/issue")
    assert world.get("a_emp2", "/hr/me/generated-documents").json()["total"] == 0
    assert world.get("a_emp2", f"/hr/me/generated-documents/{doc['id']}").status_code == 404


def test_managers_see_reports_only_in_manager_families(world):
    ready(world.db)
    doc = gen(world).json()
    assert world.get("a_manager", f"/hr/generated-documents/{doc['id']}").status_code == 404, "onboarding is not a manager family"
    assert world.get("a_manager", "/hr/generated-documents").json()["total"] == 0


# ── injection ────────────────────────────────────────────────────────────────────────────────────────────────────────

HOSTILE = ["{{ ''.__class__.__mro__ }}", "{% for x in y %}{% endfor %}", "<script>alert(1)</script>", "{{ config }}",
           "{{worker.full_name.__class__}}", "${7*7}", "{{7*7}}"]


@pytest.mark.parametrize("text", HOSTILE)
def test_template_syntax_and_markup_in_template_text_stay_literal(text):
    runs = resolver.resolve(text, lambda k: "X", lambda k: None, [])
    assert resolver.plain(runs) == text
    inp = renderer.RenderInput(blocks=[{"type": "paragraph", "text": text}], value_of=lambda k: "", raw_values={},
                               clause_text=lambda k: None, required_clause_keys=[])
    html = renderer.render_html(inp)
    assert "<script>" not in html and "__class__" in html or "<script>" not in html
    assert renderer.render_pdf(inp).startswith(b"%PDF")


def test_markup_in_field_values_is_escaped(world):
    ready(world.db)
    world.u["a_emp"].first_name = '<img src=x onerror=alert(1)>{{ 7*7 }}'
    world.db.commit()
    doc = gen(world).json()
    html = world.get("a_hr", f"/hr/generated-documents/{doc['id']}/preview").json()["html"]
    assert "<img" not in html and "&lt;img src=x" in html and "{{ 7*7 }}" in html


def test_clauses_never_expand_other_clauses():
    runs = resolver.resolve("{{clause:a}}", lambda k: "V", lambda k: {"a": "A {{clause:b}} {{required_clause_block}} {{worker.first_name}}"}.get(k), [])
    assert resolver.plain(runs) == "A {{clause:b}} {{required_clause_block}} V"


def test_condition_grammar_is_data_not_code():
    known = lambda k: k == "employment.employment_type"  # noqa: E731
    assert conditions.validate({"field": "employment.employment_type", "op": "in", "value": ["part_time"]}, known) == []
    assert conditions.validate({"field": "__import__('os')", "op": "eq", "value": 1}, known)
    assert conditions.validate({"all": [{"any": [{"all": [{"field": "employment.employment_type", "op": "present"}]}]}]}, known)
    assert conditions.evaluate({"any": [{"field": "a", "op": "eq", "value": 1}, {"field": "b", "op": "present"}]}, {"a": 2, "b": "x"})


def test_unknown_block_keys_and_system_fields_are_rejected():
    rules = {"mandatory": [], "optional": [], "prohibited": []}
    assert blocks.validate_content([{"type": "paragraph", "text": "x", "literal": True}], {"required": [], "optional": []}, rules)
    assert blocks.validate_content([{"type": "paragraph", "text": "{{review.reviewer_name}}"}],
                                   {"required": ["review.reviewer_name"], "optional": []}, rules)


# ── status writer ────────────────────────────────────────────────────────────────────────────────────────────────────

def test_only_the_state_machine_assigns_document_status():
    offenders = []
    for path in MODULE.glob("*.py"):
        if path.name == "state.py":
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target] if isinstance(node, (ast.AugAssign, ast.AnnAssign)) else []
            for t in targets:
                for el in (t.elts if isinstance(t, ast.Tuple) else [t]):
                    if isinstance(el, ast.Attribute) and el.attr == "status" and isinstance(el.value, ast.Name) and el.value.id in ("doc", "document", "old", "new", "gd"):
                        offenders.append(f"{path.name}:{node.lineno}")
    assert offenders == []


def test_direct_status_assignment_is_refused_at_runtime(world):
    ready(world.db)
    doc = world.db.get(GeneratedDocument, gen(world).json()["id"])
    with pytest.raises(RuntimeError):
        doc.status = "ISSUED"


def test_evidence_rows_are_append_only(world):
    ready(world.db)
    gen(world)
    ev = world.db.query(DocumentEvent).first()
    ev.event_type = "tampered"
    with pytest.raises(AppendOnlyViolation):
        world.db.commit()
    world.db.rollback()


# ── AI cannot issue ──────────────────────────────────────────────────────────────────────────────────────────────────

def test_the_assistant_has_no_tool_that_approves_issues_signs_or_sends_a_document():
    from app.modules.assistant import tool_registry as reg
    doc_tables = {"generated_documents", "document_signatures", "document_acknowledgements", "template_variants",
                  "generated_document_approvals", "policy_distributions", "decision_receipts"}
    for name, tool in reg.TOOLS.items():
        if tool.resource in doc_tables:
            # the only permitted one (Prompt 4 §C7): the caller's own pending documents, read-only, metadata fields only
            assert name == "document_actions" and tool.action == "read", name
            assert set(tool.fields) <= {"document_number", "title", "status", "due_by"}, name
        assert not any(w in name for w in ("approve", "issue", "sign", "send_document", "release", "acknowledge")), name
    src = (pathlib.Path(reg.__file__).parent).glob("*.py")
    for path in src:
        text = path.read_text(encoding="utf-8")
        assert "doc_templates" not in text, f"{path.name} must not import the document engine"


# ── logs ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

def test_no_document_contents_reach_the_logs(world, caplog):
    caplog.set_level(logging.DEBUG)
    ready(world.db)
    doc = gen(world).json()
    world.post("a_hr", f"/hr/generated-documents/{doc['id']}/issue")
    world.post("a_emp", f"/hr/me/generated-documents/{doc['id']}/acknowledge", json={"text_version": "ACK-1.0"})
    assert CANARY_CLAUSE not in caplog.text
