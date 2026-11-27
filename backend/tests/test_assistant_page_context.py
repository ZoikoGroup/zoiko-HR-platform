"""
tests/test_assistant_page_context.py
-------------------------------------
M1-13: the chat widget sends the app route the person has open, so "What does this page do?" answers about that
screen. The route is a hint only: it is validated, mapped to a screen, and used only when that screen is in the
asker's own menu — it can never reveal a screen outside it.
"""
from types import SimpleNamespace

import pytest

from app.modules.assistant import orchestration_service as orch, platform_guide
from app.modules.assistant.schemas import TurnCreate


@pytest.mark.parametrize("raw,clean", [
    ("/zoiko-hr/offboarding/cases", "/zoiko-hr/offboarding/cases"),
    ("/zoiko-hr/offboarding/cases?tab=open#top", "/zoiko-hr/offboarding/cases"),
    ("javascript:alert(1)", None),
    ("https://evil.example/zoiko-hr", None),
    ("/employee/<script>", None),
    ("", None),
    (None, None),
])
def test_only_a_plain_app_path_is_kept(raw, clean):
    assert TurnCreate(text="What does this page do?", page_route=raw).page_route == clean


@pytest.mark.parametrize("route,role,href", [
    ("/zoiko-hr/offboarding/cases", "hr_admin", "/zoiko-hr/offboarding/cases"),
    ("/zoiko-hr/offboarding/cases/12", "hr_admin", "/zoiko-hr/offboarding/cases"),      # a record on that screen
    ("/zoiko-hr/offboarding/new", "hr_admin", "/zoiko-hr/offboarding/new"),
    ("/employee/leaves/apply", "employee", "/employee/leaves/apply"),
    ("/zoiko-hr/offboarding/cases", "employee", None),                                  # not in an employee's menu
    ("/zoiko-hr/does-not-exist", "manager", None),                                      # not the Zoiko HR dashboard
    ("/", "employee", None),
    (None, "employee", None),
])
def test_a_route_maps_to_a_screen_in_the_askers_menu_only(route, role, href):
    screen = platform_guide.screen_for_route(route, role)
    assert (screen["href"] if screen else None) == href


@pytest.mark.parametrize("text", ["What does this page do?", "What can I do here?", "How do I use this screen?",
                                  "What is this page for?", "Explain the current page", "What is this?"])
def test_this_page_questions_are_recognised(text):
    assert orch._THIS_PAGE_RE.search(text)


@pytest.mark.parametrize("text", ["What is the annual leave policy?", "Where is the dashboard?",
                                  "How do I apply for leave?", "Where do I approve leave requests?"])
def test_ordinary_questions_are_not_about_this_page(text):
    assert not orch._THIS_PAGE_RE.search(text)


def test_the_open_screen_is_rechecked_against_the_askers_role():
    turn = SimpleNamespace(page_route="/zoiko-hr/compensation/salary-structures")
    assert orch._current_page(turn, SimpleNamespace(role=SimpleNamespace(value="employee"))) is None
    assert orch._current_page(turn, SimpleNamespace(role=SimpleNamespace(value="hr_admin")))["path"][-1] == "Salary Structures"


def test_the_guide_is_told_how_to_use_the_open_screen():
    assert "<current_page>" in orch.PLATFORM_GUIDE_PROMPT
    line = platform_guide.page_line(platform_guide.screen_for_route("/zoiko-hr/offboarding/cases", "hr_admin"))
    assert line.startswith("- Zoiko HR → Offboarding → Exit Cases (/zoiko-hr/offboarding/cases)")


def test_without_a_usable_page_the_answer_asks_for_the_screen_by_name():
    assert "can't tell which screen" in orch._NO_PAGE_MESSAGE


def test_general_guidance_always_carries_its_label():
    bare = "The notice period depends on your contract and local law."
    assert orch._with_general_label(bare) == f"{orch.GENERAL_GUIDANCE_LABEL} {bare}"
    labelled = f"{orch.GENERAL_GUIDANCE_LABEL} It depends on your contract."
    assert orch._with_general_label(labelled) == labelled                    # never twice
    assert orch._with_general_label("Your organization hasn’t published a policy on this, so…").count("published") == 1
