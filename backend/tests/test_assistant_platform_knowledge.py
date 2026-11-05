"""
tests/test_assistant_platform_knowledge.py
----------------------------------------------
Platform-wide knowledge: the docs/new_docs HR standard is loaded once into
HR_PLATFORM_KNOWLEDGE_ORG_ID and every organization's assistant reads it,
unless that organization has published its own policy for the topic.
"""

from types import SimpleNamespace

from app.config import settings
from app.modules.assistant import retrieval_service as rs
from app.modules.hr.policy_documents import LEGACY_KB_TITLES

PLATFORM, TENANT, OTHER = 2, 37, 99


class _FakeQuery:
    """Stands in for the eligibility query: returns fixed rows, ignores filters."""

    def __init__(self, rows):
        self.rows = rows

    def __getattr__(self, _name):
        return lambda *a, **k: self

    def all(self):
        return self.rows


def _eligible(monkeypatch, rows, platform_org=PLATFORM, tenant=TENANT):
    monkeypatch.setattr(settings, "PLATFORM_KNOWLEDGE_ORG_ID", platform_org)
    db = SimpleNamespace(query=lambda *a, **k: _FakeQuery(rows))
    return rs.eligible_version_ids(db, tenant)


# (version_id, policy_audience, source organization_id, title, policy_canonical_id)
PLATFORM_LEAVE = (1, None, PLATFORM, "Attendance & Leave Policy", None)
PLATFORM_REMOTE = (2, None, PLATFORM, "Remote Work & WFH Policy", None)
TENANT_ANNUAL = (3, {"type": "all"}, TENANT, "Annual Leave Policy (version 1)", "HR-POL-025")


def test_every_org_gets_the_platform_documents(monkeypatch):
    assert _eligible(monkeypatch, [PLATFORM_LEAVE, PLATFORM_REMOTE]) == [1, 2]


def test_own_published_policy_replaces_the_platform_document_for_that_topic_only(monkeypatch):
    assert _eligible(monkeypatch, [PLATFORM_LEAVE, PLATFORM_REMOTE, TENANT_ANNUAL]) == [2, 3]


def test_another_orgs_policy_never_hides_the_platform_document(monkeypatch):
    other_annual = (4, {"type": "all"}, OTHER, "Annual Leave Policy (version 1)", "HR-POL-025")
    assert 1 in _eligible(monkeypatch, [PLATFORM_LEAVE, other_annual])


def test_the_platform_org_itself_keeps_its_documents(monkeypatch):
    own = (5, {"type": "all"}, PLATFORM, "Annual Leave Policy (version 1)", "HR-POL-025")
    assert _eligible(monkeypatch, [PLATFORM_LEAVE, own], tenant=PLATFORM) == [1, 5]


def test_platform_knowledge_off_by_default_setting(monkeypatch):
    # With the setting at 0 nothing is replaced and no extra organization is added.
    assert _eligible(monkeypatch, [TENANT_ANNUAL], platform_org=0) == [3]


def test_every_seeded_title_has_a_replacement_rule_where_one_exists():
    from scripts.seed_real_policy_docs import REAL_DOCUMENTS
    seeded = {d["title"] for d in REAL_DOCUMENTS}
    assert set(LEGACY_KB_TITLES) <= seeded
    assert all(d["path"].startswith("docs/new_docs/") for d in REAL_DOCUMENTS)


def test_knowledge_lookups_bypass_the_automatic_tenant_scope():
    # Live test 05 Nov: inside a signed-in request the session-wide tenant scope added organization_id = <tenant> to the
    # eligibility query, hiding every platform-wide AND public source ("What is Zoiko HR?" found nothing).
    import inspect
    from app.core.privacy import tenant_scope
    assert "app.modules.assistant.retrieval_service".startswith(tenant_scope.ALLOWED_SYSTEM_MODULES)
    assert "unscoped_for_system(" in inspect.getsource(rs.eligible_version_ids)
    assert "unscoped_for_system(" in inspect.getsource(rs._titles)


def test_live_test_routing_regressions():
    from app.modules.assistant import orchestration_service as orch, risk_classification as risk
    # a screen question, not a booking
    assert orch.classify_intent("Where do I apply for leave?") == "navigation_help"
    assert orch.classify_intent("I want to apply for leave next week") == "book_leave"
    # asks what is allowed, not for the balance
    assert orch.classify_intent("I have no sick days left, can I still take time off?") == "policy_qa"
    assert orch.classify_intent("How many sick days do I have?") == "leave_balance"
    # a question about what someone else can do is not a booking, even with "take ... leave" in it
    assert orch.classify_intent("Can my manager see my medical diagnosis when I take sick leave?") == "policy_qa"
    assert orch.classify_intent("I want to take sick leave tomorrow") == "book_leave"
    # the employee's own privacy question is not third-party medical inference
    assert risk.classify("Can my manager see my medical diagnosis when I take sick leave?") is None
    assert risk.classify("What is John's diagnosis?").category == "medical_inference"
    assert risk.classify("Can you diagnose her from her absences?").category == "medical_inference"


def test_platform_documents_stay_off_the_public_website_assistant():
    import inspect
    src = inspect.getsource(rs.retrieve_public)
    assert "is_public.is_(True)" in src and "PLATFORM_KNOWLEDGE_ORG_ID" not in src
