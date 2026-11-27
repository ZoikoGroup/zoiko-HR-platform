"""
tests/test_copilot_analytics.py
--------------------------------
M1-16: copilot_events — one row per answer with no message text and no person — and the weekly summary.
"""
import datetime as dt
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.main  # noqa: F401  (every model registered)
from app.database import Base
from app.modules.assistant import analytics_service as an
from app.modules.assistant.models import AnswerType, ChatModelRun, CopilotEvent
from app.modules.hr.models import Organization, OrganizationStatus

ORG, OTHER = 1, 2


@pytest.fixture
def db(monkeypatch):
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    session.add_all([Organization(id=i, name=f"Org{i}", organization_name=f"Org{i}", status=OrganizationStatus.ACTIVE)
                     for i in (ORG, OTHER)])
    session.commit()
    roles = {11: "employee", 12: "hr_admin"}
    monkeypatch.setattr(an, "_role_of", lambda db_, employee_id: roles.get(employee_id))
    yield session
    session.close()
    engine.dispose()


def _turn(turn_id, employee_id=11, intent="policy_qa", page_route=None, org=ORG, seconds_ago=2):
    return SimpleNamespace(id=turn_id, organization_id=org, employee_id=employee_id, intent=intent,
                           page_route=page_route, created_at=dt.datetime.utcnow() - dt.timedelta(seconds=seconds_ago))


def test_an_event_holds_no_text_and_no_person():
    columns = set(CopilotEvent.__table__.columns.keys())
    for forbidden in ("employee_id", "user_input_text", "answer_text", "question", "answer", "comment", "text",
                      "email", "name", "page_route"):
        assert forbidden not in columns, forbidden


@pytest.mark.parametrize("answer_type,text,outcome", [
    (AnswerType.GROUNDED, "Open Leaves → Apply Leave.", "answered"),
    (AnswerType.PARTIAL, "Your organization hasn’t published a policy on this, so here's general guidance: …", "general_guidance"),
    (AnswerType.PARTIAL, "Part of it is covered …", "answered"),
    (AnswerType.NO_ANSWER, "I can't tell which screen you have open.", "no_answer"),
    (AnswerType.RESTRICTED, "I can't recommend that.", "refused"),
    (AnswerType.ACTION, "I've drafted a leave request.", "action"),
])
def test_outcomes(answer_type, text, outcome):
    assert an.outcome_for(answer_type, text) == outcome


def test_an_answer_is_recorded_with_screen_model_and_latency(db):
    db.add(ChatModelRun(turn_id=5, provider="groq", model_name="openai/gpt-oss-120b", purpose="generate", latency_ms=900))
    db.commit()
    an.record(db, _turn(5, employee_id=12, intent="navigation_guide", page_route="/zoiko-hr/offboarding/cases/42"),
              an.ANSWERED, AnswerType.GROUNDED)
    db.commit()
    e = db.query(CopilotEvent).one()
    assert (e.organization_id, e.turn_id, e.asker_role, e.intent, e.outcome) == (ORG, 5, "hr_admin", "navigation_guide", "answered")
    assert e.page_screen == "/zoiko-hr/offboarding/cases"          # the menu screen, never the record id in the route
    assert (e.provider, e.model) == ("groq", "openai/gpt-oss-120b")
    assert 1000 <= e.latency_ms < 60000


def test_a_screen_outside_the_askers_menu_is_not_recorded(db):
    an.record(db, _turn(6, employee_id=11, page_route="/zoiko-hr/compensation/salary-structures"), an.NO_ANSWER)
    db.commit()
    assert db.query(CopilotEvent).one().page_screen is None


def test_recording_never_breaks_the_answer(db, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("analytics down")
    monkeypatch.setattr(an.platform_guide, "screen_for_route", boom)
    db.add(ChatModelRun(turn_id=7, provider="groq", model_name="m", purpose="generate"))
    an.record(db, _turn(7), an.ANSWERED)                          # swallowed
    db.commit()                                                   # the caller's own work still commits
    assert db.query(ChatModelRun).filter_by(turn_id=7).count() == 1
    assert db.query(CopilotEvent).count() == 0


def test_feedback_and_handoff_land_on_the_answers_event(db):
    an.record(db, _turn(8), an.NO_ANSWER)
    db.commit()
    an.mark_feedback(db, ORG, 8, "down", "not_enough_detail")
    an.mark_handoff(db, ORG, 8)
    an.mark_feedback(db, OTHER, 8, "up", None)                    # another organization's id never touches it
    db.commit()
    e = db.query(CopilotEvent).one()
    assert (e.feedback, e.feedback_code, e.handed_off) == ("down", "not_enough_detail", True)


def test_the_weekly_summary(db):
    rows = [  # (turn, outcome, intent, screen, feedback, latency, org, days_ago)
        (1, "answered", "navigation_guide", "/employee/leaves/apply", "up", 800, ORG, 1),
        (2, "general_guidance", "policy_qa:leave_attendance", None, "down", 3000, ORG, 2),
        (3, "general_guidance", "policy_qa:leave_attendance", None, None, 2500, ORG, 3),
        (4, "no_answer", "navigation_help", "/employee/ess", "down", 400, ORG, 4),
        (5, "refused", "restricted:self_harm", None, None, 50, ORG, 5),
        (6, "answered", "policy_qa", None, None, 900, OTHER, 1),           # another organization
        (7, "no_answer", "policy_qa", None, None, 900, ORG, 9),            # older than the week
    ]
    now = dt.datetime.utcnow()
    for t, outcome, intent, screen, fb, ms, org, ago in rows:
        db.add(CopilotEvent(organization_id=org, turn_id=t, outcome=outcome, intent=intent, page_screen=screen,
                            feedback=fb, latency_ms=ms, created_at=now - dt.timedelta(days=ago), handed_off=(t == 4),
                            provider="groq", model="openai/gpt-oss-120b"))
    db.commit()
    s = an.weekly_summary(db, ORG, now=now)
    assert s["answers"] == 5
    assert s["answered_rate"] == 20.0 and s["unanswered_rate"] == 60.0 and s["handoff_rate"] == 20.0
    assert s["feedback"]["rated"] == 3 and s["feedback"]["down"] == 2 and s["feedback"]["thumbs_down_rate"] == 66.7
    assert s["top_unanswered"][0] == {"intent": "policy_qa:leave_attendance", "screen": "-", "count": 2}
    assert s["latency_ms"]["p95"] == 3000
    assert an.weekly_summary(db, None, now=now)["answers"] == 6       # platform view: every organization


def test_the_table_is_classified_and_isolated_per_tenant():
    from app.core.privacy import classification as c, rls
    assert c.TABLES["copilot_events"] == c.Level.PLATFORM_META
    plan = {p["table"]: p for p in rls.policy_plan(Base.metadata)}
    assert "organization_id" in plan["copilot_events"]["using"]


def test_a_drafted_booking_is_recorded_as_book_leave(db):
    an.record(db, _turn(9, intent=None), an.ACTION, AnswerType.ACTION)
    db.commit()
    assert db.query(CopilotEvent).one().intent == "book_leave"
