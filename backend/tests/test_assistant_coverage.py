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
                        lambda messages, **kw: iter([("delta", "Hel"), ("delta", "lo"), ("done", "Hello", {"answer_type": "partial"}, run)]))
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


# ── Live production test, 06 Nov (second batch) ──────────────────────────────

@pytest.mark.parametrize("question,intent", [
    ("how many leavs do i hav left", "leave_balance"),          # typos
    ("wher is my payslp", "navigation_help"),
    ("what can you help me with?", "chitchat:capabilities"),
    ("What can you do", "chitchat:capabilities"),
    ("Where can I see attendance reports?", "navigation_help"),  # a screen, not my attendance record
    ("Have I clocked in today?", "attendance_status"),
])
def test_live_batch_routing(question, intent):
    assert orch.classify_intent(question) == intent


def test_capabilities_reply_exists_and_needs_no_data():
    assert "Zoiko HR Assistant" in orch._CHITCHAT_REPLIES["capabilities"]
    assert "chitchat:capabilities" in tool_registry.NO_DATA_INTENTS


def test_entitlement_follow_up_is_not_sent_to_the_balance():
    # "how many days is that?" after a paternity question asks about the entitlement
    assert not orch._OWN_BALANCE_RE.search("how many days is that?")
    assert orch._OWN_BALANCE_RE.search("how many do I have left?")


def test_engineering_never_lists_are_not_turned_into_employee_rules():
    assert "Those are rules the SYSTEM follows, not rules for" in orch.BASE_SYSTEM_PROMPT
    assert "Those are rules the SYSTEM follows" in orch.GENERAL_GUIDANCE_PROMPT
    assert "planned screens" in orch.BASE_SYSTEM_PROMPT


def test_answer_clean_up_fixes_brand_and_citation_markers():
    text = "Paternity leave is in Zozo HR's policy 【85】. See Zoho HR and Zoiko HR."
    assert orch._plain_identifiers(text) == "Paternity leave is in Zoiko HR's policy. See Zoiko HR and Zoiko HR."


def test_protected_questions_get_more_reasoning(monkeypatch):
    from app.config import settings
    from app.modules.assistant import llm_client
    monkeypatch.setattr(settings, "GROQ_REASONING_EFFORT", "low")
    assert llm_client._model_kwargs("openai/gpt-oss-120b", "medium") == {"reasoning_effort": "medium"}
    assert llm_client._model_kwargs("openai/gpt-oss-120b") == {"reasoning_effort": "low"}


@pytest.mark.parametrize("question", [
    "Can I discuss my salary with my colleagues?",
    "Am I allowed to share my pay with coworkers?",
    "Is it ok to talk about my CTC with friends?",
])
def test_pay_discussion_gets_the_fixed_protected_answer(question):
    from app.modules.assistant import policy_domains as pd
    a = pd.assess(question)
    assert a.tier == pd.PERSONAL
    assert "doesn't prohibit employees from discussing their own pay" in a.personal_answer


def test_other_pay_questions_still_reach_the_policy_answer():
    from app.modules.assistant import policy_domains as pd
    assert pd.assess("How are bonuses calculated?").tier != pd.PERSONAL
    assert orch.classify_intent("What is Priya's salary?") == "policy_qa"  # hard-blocked before routing


# ── Platform guide from the software itself (live feedback, 19 Nov) ──────────

def test_every_screen_carries_its_own_page_text():
    screens = guide.screens()
    assert all(s.get("about") for s in screens)
    # the text comes from the page itself: whatever the page's first phrase is, it's in the page's source today
    import pathlib
    settings_page = next(s for s in screens if s["href"] == "/zoiko-hr/onboarding/settings")
    first_phrase = settings_page["about"].split(" · ")[0]
    page_src = pathlib.Path(__file__).resolve().parents[2] / "frontend" / "src" / "modules" / "zoiko-hr" / "onboarding"
    assert any(first_phrase in f.read_text(encoding="utf-8") for f in page_src.rglob("*.jsx")), first_phrase


def test_adding_an_employee_is_the_new_hires_workflow_for_admins():
    # no instant answer: "Employees" is a manager screen and New Hires matches only through the task expansion,
    # so the guided answer decides — and New Hires is what it sees first
    screen, visible = guide.find_screen("How do I add a new employee?", "admin")
    assert not (screen and visible and screen["href"] != "/zoiko-hr/onboarding/new-hires")
    assert guide.catalog_for("How do I add a new employee?", "admin").splitlines()[0].startswith("- Zoiko HR → Onboarding → New Hires")


@pytest.mark.parametrize("question", ["I'm just starting to set up. Where do I go first?", "how do I get started",
                                      "What should I do first?", "Where do I set up my profile"])
def test_setup_and_workflow_questions_go_to_the_platform_guide(question):
    assert orch.classify_intent(question) == "navigation_help"
    assert orch._SETUP_RE.search(question) or not guide.find_screen(question, "admin")[1]


def test_catalog_lists_only_the_askers_screens_with_page_text():
    catalog = guide.catalog_for("add a new hire", "employee")
    assert "/zoiko-hr/onboarding/new-hires" not in catalog      # an employee's menu doesn't have it
    assert "/employee/leaves/apply" in catalog and ": " in catalog
    first = catalog.splitlines()[0]
    assert guide.catalog_for("apply for leave", "employee").splitlines()[0].startswith("- Leaves")


def test_other_roles_only_when_nothing_in_the_menu_fits():
    assert guide.other_roles_for("How do I add a new employee?", "admin") == []
    assert any("New Hires" in o for o in guide.other_roles_for("add a new hire", "employee"))


def test_platform_guide_prompt_rules():
    p = orch.PLATFORM_GUIDE_PROMPT
    assert "[TRUST AND AUTHORITY]" in p and "[OUTPUT]" in p and "[GROUNDING]" not in p
    assert "Never tell the user to ask someone else for access" in p
    assert "Never invent" in p and "cited_fragment_ids must be []" in p
    assert "navigation_guide" in tool_registry.NO_DATA_INTENTS
    assert guardrails.check_output_disclosure("[PLATFORM GUIDE MODE] x") == "prompt_leak"



# ── Features the software doesn't have (live feedback, 24 Nov) ───────────────

def test_missing_features_never_get_a_nearest_screen():
    # "terminate" appears nowhere in the platform: no instant nearest-screen answer, the platform guide answers
    q = "how do I terminate an employee"
    assert guide.find_screen(q, "admin") == (None, False)
    assert guide.unknown_terms(q) == {"terminate"}
    assert orch.classify_intent(q) == "navigation_help"


@pytest.mark.parametrize("question", ["Where do I go to offboard an employee", "How do I offboard an employee?"])
def test_offboarding_questions_reach_the_offboarding_module_not_new_hires(question):
    # 24 Nov: production answered "Onboarding → New Hires" for offboarding. Main has since added an Offboarding
    # module (plan-gated): offboarding questions rank it first and are never answered with New Hires.
    screen, _ = guide.find_screen(question, "admin")
    assert not screen or "/onboarding/" not in screen["href"]
    top = guide.catalog_for(question, "admin").splitlines()[:3]
    assert any("/zoiko-hr/offboarding" in line for line in top)       # the model sees the Offboarding screens first
    assert "/onboarding/new-hires" not in top[0]
    assert orch.classify_intent(question) == "navigation_help"


def test_plan_gated_screens_say_when_the_plan_lacks_them():
    gated = [s for s in guide.screens() if s.get("plan_feature") == "hr.lifecycle.offboarding"]
    assert gated and all("current plan does not include" not in s["about"] for s in gated)  # the page, not the gate
    screen = next(s for s in gated if s["href"] == "/zoiko-hr/offboarding/cases")
    text = guide.describe(screen, True, {"hr.lifecycle.offboarding": "Advanced"})
    assert "plan doesn't include it" in text and "Advanced" in text and "Billing & Plan" in text
    assert guide.describe(screen, True, {}).startswith("You'll find that under")
    assert "[not included in your organization's plan" in guide.catalog_for("exit cases", "admin",
                                                                          plan_states={"hr.lifecycle.offboarding": ""})
    assert "Billing & Plan" in orch.PLATFORM_GUIDE_PROMPT


def test_an_exact_answer_covers_the_whole_ask():
    # "resign" is the task — Company Documents only matched "company"
    assert guide.find_screen("How do I resign from the company?", "employee") == (None, False)
    assert orch.classify_intent("How do I resign from the company?") == "policy_qa"


@pytest.mark.parametrize("question,href", [
    ("Where do I apply for leave?", "/employee/leaves/apply"),
    ("I need to see my payslip", "/employee/documents/payslips"),
    ("where do I submit a travel expense", "/employee/travel/expenses"),
])
def test_existing_features_still_get_instant_answers(question, href):
    screen, visible = guide.find_screen(question, "employee")
    assert screen["href"] == href and visible and not guide.unknown_terms(question)


def test_guide_says_when_a_feature_doesnt_exist():
    p = orch.PLATFORM_GUIDE_PROMPT
    assert "COMPLETE list of what this user can do" in p
    assert "doesn't currently have that feature" in p
    assert "does not prove Zoiko HR has a feature" in orch.BASE_SYSTEM_PROMPT


def test_personal_process_questions_stay_with_policy_answers():
    for q in ("How do I resign?", "How do I change my address in the system?"):
        assert orch.classify_intent(q) == "policy_qa", q


def test_screen_map_is_current_with_the_app():
    # the same check CI runs: regenerating the map from the menu and pages changes nothing
    import json, pathlib, shutil, subprocess
    root = pathlib.Path(__file__).resolve().parents[2]
    node = shutil.which("node")
    if not node or not (root / "frontend" / "node_modules").exists():
        pytest.skip("node / frontend dependencies not installed")
    nav = root / "backend" / "app" / "modules" / "assistant" / "platform_nav.json"
    before = json.loads(nav.read_text(encoding="utf-8"))
    subprocess.run([node, str(root / "backend" / "scripts" / "export_platform_nav.mjs")], check=True, capture_output=True)
    assert json.loads(nav.read_text(encoding="utf-8")) == before, "run node backend/scripts/export_platform_nav.mjs"


# ── Engineering specs are not app guides (live feedback, 25 Nov) ──────────────

def test_spec_documents_are_never_evidence(monkeypatch):
    # "31.3 HR — Offboarding Control Center" was a section heading in a spec document, repeated as a menu
    from app.config import settings
    from app.modules.assistant import retrieval_service as rs

    class _Q:
        def __init__(self, rows): self.rows = rows
        def __getattr__(self, _): return lambda *a, **k: self
        def all(self): return self.rows

    rows = [(1, None, 2, "Onboarding & Offboarding Procedures", None),           # spec doc on the platform org
            (2, None, 37, "Exit Policy (version 1)", "HR-POL-050")]             # a company's published policy
    monkeypatch.setattr(settings, "PLATFORM_KNOWLEDGE_ORG_ID", 2)
    monkeypatch.setattr(settings, "ASSISTANT_USE_SPEC_DOCS", False)
    db = SimpleNamespace(query=lambda *a, **k: _Q(rows))
    assert rs.eligible_version_ids(db, 37) == [2]
    monkeypatch.setattr(settings, "ASSISTANT_USE_SPEC_DOCS", True)
    assert rs.eligible_version_ids(db, 37) == [1, 2]


def test_every_seeded_spec_title_is_excluded():
    import ast, pathlib
    from app.modules.assistant.retrieval_service import SPEC_DOC_TITLES
    src = (pathlib.Path(__file__).resolve().parents[1] / "scripts" / "seed_real_policy_docs.py").read_text(encoding="utf-8")
    node = next(n for n in ast.parse(src).body if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "REAL_DOCUMENTS")
    assert {d["title"] for d in ast.literal_eval(node.value)} == set(SPEC_DOC_TITLES)
    assert "--force" in src                       # the seed script no longer reloads them by accident


@pytest.mark.parametrize("question", ["How does offboarding work?", "What is the exit process?",
                                      "How does the appraisal process work?", "What are the steps to hire someone?"])
def test_how_a_feature_works_is_answered_from_the_platform(question):
    assert orch.classify_intent(question) == "navigation_help"


@pytest.mark.parametrize("question", ["How does maternity leave work?", "What is the offboarding policy?",
                                      "How do I resign?", "How do leave requests work?"])
def test_policy_process_questions_stay_policy(question):
    assert orch.classify_intent(question) == "policy_qa"


def test_document_section_references_are_removed():
    t = orch._plain_identifiers
    assert t("Open it (listed under “31.3 HR — Offboarding Control Center”) now.") == "Open it now."
    assert t("Start an exit. See 31.3 HR — Offboarding Control Center for details. Then track it.") == \
        "Start an exit. Then track it."
    assert t("You may take 1.5 days of leave, and version 2.0 applies.") == \
        "You may take 1.5 days of leave, and version 2.0 applies."
    assert t("31.3 HR — Offboarding Control Center")            # never an empty answer
    assert "Never mention document section numbers or headings" in orch.BASE_SYSTEM_PROMPT
