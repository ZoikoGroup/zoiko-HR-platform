"""
tests/test_copilot_limits.py
-----------------------------
M1-10: rate limits per signed-in user and per organization (not per IP), kept in Redis when configured, and a daily
model-token budget per organization that answers "try again tomorrow" — never calling the model — once used up.
"""
import datetime as dt
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.main  # noqa: F401  (every model registered)
from app.config import settings
from app.core import rate_limiter as rl
from app.core.security import create_access_token
from app.database import Base
from app.modules.assistant import analytics_service as an, conversation_service, llm_client, orchestration_service
from app.modules.assistant.models import ChatConversation, ChatResponse, CopilotEvent
from app.modules.hr.models import Organization, OrganizationStatus

ORG, OTHER = 1, 2


def _request(token=None, ip="203.0.113.9"):
    headers = {"authorization": f"Bearer {token}"} if token else {}
    return SimpleNamespace(headers=headers, client=SimpleNamespace(host=ip))


# ── who a limit counts ───────────────────────────────────────────────────────────────────────────────────────────────
def test_limits_count_per_signed_in_user_not_per_ip():
    a = create_access_token({"sub": "a@x.com", "id": 11, "organization_id": ORG, "aud": "zoiko-hr"})
    b = create_access_token({"sub": "b@x.com", "id": 12, "organization_id": ORG, "aud": "zoiko-hr"})
    office = "198.51.100.7"                              # two colleagues behind one office address
    assert rl.rate_limit_key(_request(a, office)) == "user:11"
    assert rl.rate_limit_key(_request(b, office)) == "user:12"


def test_no_or_bad_token_counts_per_client_ip():
    assert rl.rate_limit_key(_request(None, "203.0.113.9")) == "ip:203.0.113.9"
    assert rl.rate_limit_key(_request("not-a-token", "203.0.113.9")) == "ip:203.0.113.9"


def test_the_organization_limit_counts_per_organization():
    a = create_access_token({"sub": "a@x.com", "id": 11, "organization_id": ORG, "aud": "zoiko-hr"})
    b = create_access_token({"sub": "b@x.com", "id": 12, "organization_id": ORG, "aud": "zoiko-hr"})
    assert rl.tenant_key(_request(a)) == rl.tenant_key(_request(b)) == f"org:{ORG}"
    platform = create_access_token({"sub": "p@x.com", "id": 1, "organization_id": None, "aud": "zoiko-hr"})
    assert rl.tenant_key(_request(platform)) == "user:1"


def test_counters_live_in_redis_when_configured(monkeypatch):
    monkeypatch.setattr(settings, "REDIS_URL", "redis://cache.internal:6379/0")
    assert rl._storage_options() == {"storage_uri": "redis://cache.internal:6379/0", "in_memory_fallback_enabled": True}
    monkeypatch.setattr(settings, "REDIS_URL", "")
    assert rl._storage_options() == {"storage_uri": "memory://"}
    assert rl.limiter._key_prefix == "zhr" and rl.limiter._swallow_errors is True


def test_the_chat_endpoint_has_a_user_and_an_organization_limit():
    import inspect
    from app.modules.assistant import conversation_router
    src = inspect.getsource(conversation_router)
    assert "COPILOT_USER_RATE_LIMIT" in src and "COPILOT_ORG_RATE_LIMIT, key_func=tenant_key" in src


# ── the daily token budget ───────────────────────────────────────────────────────────────────────────────────────────
@pytest.fixture
def db(monkeypatch):
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    session.add_all([Organization(id=i, name=f"Org{i}", organization_name=f"Org{i}", status=OrganizationStatus.ACTIVE)
                     for i in (ORG, OTHER)])
    session.commit()
    monkeypatch.setattr(an, "_role_of", lambda db_, employee_id: "employee")
    monkeypatch.setattr(settings, "COPILOT_DAILY_TOKEN_BUDGET_PER_ORG", 10_000)
    yield session
    session.close()
    engine.dispose()


def _spend(db, tokens, org=ORG, when=None):
    db.add(CopilotEvent(organization_id=org, turn_id=None, outcome="answered", prompt_tokens=tokens,
                        completion_tokens=0, created_at=when or dt.datetime.utcnow()))
    db.commit()


def test_budget_counts_todays_tokens_for_this_organization_only(db):
    _spend(db, 4_000)
    _spend(db, 3_000)
    _spend(db, 9_000, org=OTHER)                                          # another organization
    _spend(db, 9_000, when=dt.datetime.utcnow() - dt.timedelta(days=1))   # yesterday
    s = an.budget_status(db, ORG)
    assert (s["tokens_used"], s["budget"], s["percent_used"], s["exhausted"]) == (7_000, 10_000, 70.0, False)
    assert s["resets_at"].endswith("T00:00:00Z")
    _spend(db, 3_000)
    assert an.budget_status(db, ORG)["exhausted"] is True


def test_no_budget_means_no_cap(db, monkeypatch):
    monkeypatch.setattr(settings, "COPILOT_DAILY_TOKEN_BUDGET_PER_ORG", 0)
    _spend(db, 50_000_000)
    s = an.budget_status(db, ORG)
    assert s["exhausted"] is False and s["budget"] is None


def _ask(db, text):
    conv = ChatConversation(organization_id=ORG, employee_id=11, title="t")
    db.add(conv)
    db.commit()
    employee = SimpleNamespace(id=11, organization_id=ORG, role=SimpleNamespace(value="employee"))
    return conversation_service.create_and_process_turn(db, conv, employee, text)


def test_a_used_up_budget_answers_try_again_tomorrow_without_calling_the_model(db, monkeypatch):
    _spend(db, 10_000)
    def no_model(*a, **k):
        raise AssertionError("the model must not be called once the budget is used up")
    monkeypatch.setattr(llm_client, "generate", no_model)
    monkeypatch.setattr(llm_client, "stream_text_and_metadata", no_model)
    turn = _ask(db, "What is the annual leave policy?")
    answer = db.query(ChatResponse).filter_by(turn_id=turn.id).one()
    assert answer.answer_text == orchestration_service.DAILY_CAP_MESSAGE and "midnight UTC" in answer.answer_text
    assert db.query(CopilotEvent).filter_by(turn_id=turn.id).one().outcome == "capped"
    assert an.budget_status(db, ORG)["capped_answers"] == 1


def test_safety_answers_are_still_given_when_the_budget_is_used_up(db):
    _spend(db, 10_000)
    turn = _ask(db, "I feel like ending my life")
    answer = db.query(ChatResponse).filter_by(turn_id=turn.id).one()
    assert turn.intent.startswith("restricted:self_harm")
    assert answer.answer_text != orchestration_service.DAILY_CAP_MESSAGE


def test_admins_can_see_todays_usage():
    import inspect
    from app.modules.assistant import operations_router
    src = inspect.getsource(operations_router.copilot_usage)
    assert "get_current_admin" in src and "budget_status" in src


def test_a_settings_limit_is_enforced_per_user(monkeypatch):
    """The real slowapi mechanism with the same decorator pattern as the chat endpoint: two users each get their own
    allowance, the third request from one user is refused with 429, and the other user is unaffected."""
    from fastapi import FastAPI, Request
    from fastapi.testclient import TestClient
    from slowapi import Limiter
    from slowapi.errors import RateLimitExceeded
    from slowapi.middleware import SlowAPIMiddleware
    from slowapi import _rate_limit_exceeded_handler

    monkeypatch.setattr(settings, "COPILOT_USER_RATE_LIMIT", "2/minute")
    lim = Limiter(key_func=rl.rate_limit_key, storage_uri="memory://", key_prefix="zhr-test")
    api = FastAPI()
    api.state.limiter = lim
    api.add_middleware(SlowAPIMiddleware)
    api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    @api.post("/ask")
    @lim.limit(lambda: settings.COPILOT_USER_RATE_LIMIT)
    def ask(request: Request):
        return {"ok": True}

    client = TestClient(api)
    hdr = lambda uid: {"Authorization": "Bearer " + create_access_token(  # noqa: E731
        {"sub": f"{uid}@x.com", "id": uid, "organization_id": ORG, "aud": "zoiko-hr"})}
    assert [client.post("/ask", headers=hdr(11)).status_code for _ in range(3)] == [200, 200, 429]
    assert client.post("/ask", headers=hdr(12)).status_code == 200      # a colleague on the same address: own count


def test_answers_from_the_database_keep_working_when_the_budget_is_used_up(db, monkeypatch):
    _spend(db, 10_000)
    def no_model(*a, **k):
        raise AssertionError("no model call expected")
    monkeypatch.setattr(llm_client, "generate", no_model)
    monkeypatch.setattr(llm_client, "stream_text_and_metadata", no_model)
    turn = _ask(db, "hi")                                    # a greeting needs no model: answered normally
    answer = db.query(ChatResponse).filter_by(turn_id=turn.id).one()
    assert turn.intent.startswith("chitchat") and answer.answer_text != orchestration_service.DAILY_CAP_MESSAGE
    from app.modules.assistant import conversation_service as cs
    for intent in ("leave_balance", "holidays", "chitchat:greeting", "book_leave"):
        assert cs._answered_without_model(intent), intent
    for intent in ("policy_qa", "navigation_help"):
        assert not cs._answered_without_model(intent), intent
