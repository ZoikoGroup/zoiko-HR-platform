"""
tests/test_assistant_coverage.py
------------------------------------
Answering every HR / Zoiko HR question: platform screens from the real menu,
personal-record intents (holidays, leave status, work profile), and labelled
general HR guidance when the organization has no approved content.
"""

from types import SimpleNamespace

import pytest

from app.modules.assistant import guardrails, platform_guide as guide, tool_registry
from app.modules.assistant import orchestration_service as orch


# ── Platform screens ──────────────────────────────────────────────────────────

@pytest.mark.parametrize("role,question,href", [
    ("employee", "Where do I apply for leave?", "/employee/leaves/apply"),
    ("employee", "where can I see my payslip", "/employee/documents/payslips"),
    ("employee", "how do I change my password", "/employee/profile/settings"),
    ("employee", "where do I submit a travel expense", "/employee/travel/expenses"),
    ("employee", "where do I raise a travel request", "/employee/travel/requests"),
    ("employee", "where do I update my bank account", "/employee/profile/bank-details"),
    ("manager", "where do I approve leave requests", "/zoiko-hr/leave/requests"),
    ("hr_admin", "where do I add a new hire", "/zoiko-hr/onboarding/new-hires"),
])
def test_screens_come_from_the_real_menu(role, question, href):
    screen, visible = guide.find_screen(question, role)
    assert screen["href"] == href and visible


def test_screens_outside_the_askers_menu_are_named_but_not_offered():
    screen, visible = guide.find_screen("where do I approve leave requests", "employee")
    assert screen and not visible
    text = guide.describe(screen, visible)
    assert "isn't in your menu" in text and "managers" in text


@pytest.mark.parametrize("question", ["How do I report harassment?", "how do I resign", "how do I calculate gratuity",
                                      "what is the meaning of life"])
def test_policy_questions_are_not_mistaken_for_screens(question):
    assert guide.find_screen(question, "employee") == (None, False)


def test_every_screen_in_the_map_has_roles_and_a_route():
    screens = guide.screens()
    assert len(screens) > 100
    assert all(s["roles"] and s["href"].startswith("/") for s in screens)
    assert not any(s["href"].startswith("/super-admin") for s in screens)


def test_platform_guide_document_covers_every_screen():
    text = guide.guide_text()
    assert all(s["href"] in text for s in guide.screens())
    assert "Leave" in text and "Recruitment" in text


# ── Personal-record intents ───────────────────────────────────────────────────

@pytest.mark.parametrize("question,intent", [
    ("Is my leave approved?", "leave_status"),
    ("What's the status of my leave request?", "leave_status"),
    ("Show my pending leaves", "leave_status"),
    ("Who is my manager?", "my_profile"),
    ("What is my employee code?", "my_profile"),
    ("When did I join?", "my_profile"),
    ("What are the upcoming holidays?", "holidays"),
    ("When is the next holiday?", "holidays"),
    ("What is the holiday policy?", "policy_qa"),
    ("How many leave days do I have left?", "leave_balance"),
    ("Book 2 days of annual leave", "book_leave"),
])
def test_personal_intents(question, intent):
    assert orch.classify_intent(question) == intent


@pytest.mark.parametrize("intent", ["leave_status", "my_profile", "holidays"])
def test_new_intents_have_a_registered_tool(intent):
    assert tool_registry.tool_for(intent) is not None


def test_follow_ups_can_reach_the_new_personal_intents():
    assert {"leave_status", "my_profile", "holidays"} <= orch._CONTEXT_REROUTABLE_INTENTS


# ── General guidance ──────────────────────────────────────────────────────────

def test_general_guidance_prompt_keeps_the_safety_contract():
    p = orch.GENERAL_GUIDANCE_PROMPT
    assert "[TRUST AND AUTHORITY]" in p and "[CONFIDENTIALITY]" in p and "[OUTPUT]" in p
    assert "[GROUNDING]" not in p                     # evidence-only rule is what this mode replaces
    assert "hasn't published a policy on this" in p   # always labelled
    assert "Never present anything as this organization's rule" in p
    assert "cited_fragment_ids must be []" in p
    assert 'answer_type="no_answer"' in p             # off-topic questions are declined
    assert "Name Zoiko HR screens only from the <screens> block" in p


def test_grounded_prompt_labels_any_general_addition():
    assert "**General guidance:**" in orch.BASE_SYSTEM_PROMPT


def test_general_guidance_header_counts_as_a_prompt_leak():
    assert guardrails.check_output_disclosure("[GENERAL GUIDANCE MODE] ...") == "prompt_leak"


def test_stream_answer_relays_deltas_and_returns_the_result(monkeypatch):
    from app.modules.assistant import llm_client
    run = SimpleNamespace(model="m")
    monkeypatch.setattr(llm_client, "stream_text_and_metadata",
                        lambda messages: iter([("delta", "Hel"), ("delta", "lo"), ("done", "Hello", {"answer_type": "partial"}, run)]))
    gen = orch._stream_answer([])
    events = []
    try:
        while True:
            events.append(next(gen))
    except StopIteration as stop:
        result = stop.value
    assert events == [("delta", "Hel"), ("delta", "lo")]
    assert result == ("Hello", {"answer_type": "partial"}, run)


def test_code_identifiers_from_specs_become_plain_words():
    text = "The **notice_given_at** field marks it; see /employee/leaves/apply and snake_case_x."
    assert orch._plain_identifiers(text) == "The **notice given at** field marks it; see /employee/leaves/apply and snake case x."
    assert orch._plain_identifiers("Plain text stays.") == "Plain text stays."


def test_payslip_question_does_not_land_on_salary_structures():
    screen, _ = guide.find_screen("Where can I see my payslip?", "admin")
    assert screen["href"] == "/employee/documents/payslips"


def test_every_answer_gets_role_aware_screens():
    block = orch._screens_block("Does Zoiko HR have a learning module?", "admin")
    assert "Learning" in block and block.startswith("<screens>")


def test_prompt_screens_are_only_ones_the_user_can_open():
    lines = guide.screens_for_prompt("how do I claim travel expenses", "employee")
    assert lines and all("/zoiko-hr/" not in line for line in lines)
