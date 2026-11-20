"""Documents automation core (Phase 1): rules, matching, the runner's retries / dead-letter / pause / delay, quiet hours."""
from datetime import datetime, timedelta

import pytest

from app.modules.hr.documents.automation import actions, limits, runner
from app.modules.hr.documents.automation.models import AutomationRule, AutomationRun, AutomationSettings
from app.modules.hr.documents.automation.rules import RuleInvalid, evaluate, validate_definition
from app.modules.integrations.events import emit_event

NOW = datetime(2026, 11, 19, 10, 0, 0)


def _rule(db, event="document.uploaded", actions_=None, conditions=None, status="active", org=1, feature=None):
    definition = {"conditions": conditions or {"all": []}, "actions": actions_ or [{"type": "log", "message": "ok"}]}
    if feature:
        definition["feature"] = feature
    r = AutomationRule(organization_id=org, name="rule", trigger_event=event, status=status, definition=definition)
    db.add(r)
    db.commit()
    return r


def _emit(db, data=None, org=1, event="document.uploaded"):
    payload = {"document_id": 1, "version_id": 1, "version": 1, "scope": "employee", "source": "employee"}
    payload.update(data or {})
    event_id = emit_event(db, event, payload, org, in_tx=True)
    db.commit()
    return event_id


@pytest.fixture
def flaky():
    """An action that fails N times, then succeeds."""
    state = {"fail": 0, "calls": 0, "permanent": False}

    @actions.action("test_flaky")
    def _flaky(db, params, ctx, run, *, dry, now):
        state["calls"] += 1
        if state["permanent"]:
            raise actions.PermanentError("will never work")
        if state["fail"] > 0:
            state["fail"] -= 1
            raise actions.RetryableError("try again")
        return actions.StepResult(detail={"done": True})
    yield state
    actions.ACTIONS.pop("test_flaky", None)


# ── rules ───────────────────────────────────────────────────────────────────────────────────────────────────────────

def test_conditions_select_matching_events(world):
    db = world.db
    _rule(db, conditions={"all": [{"field": "data.category_key", "op": "in", "value": ["identity_proof", "education"]},
                                  {"field": "employee.role", "op": "eq", "value": "employee"}]})
    _emit(db, {"category_key": "identity_proof", "employee_id": world.people["emp"].id})
    _emit(db, {"category_key": "bank_details", "employee_id": world.people["emp"].id})
    _emit(db, {"category_key": "identity_proof", "employee_id": world.people["hr"].id})
    assert db.query(AutomationRun).count() == 1


def test_paused_rules_and_other_orgs_rules_do_not_match(world):
    db = world.db
    _rule(db, status="paused")
    _rule(db, org=2)
    _emit(db)
    assert db.query(AutomationRun).count() == 0


def test_shadow_rules_run_dry(world):
    db = world.db
    _rule(db, status="shadow")
    _emit(db)
    run = db.query(AutomationRun).one()
    assert run.mode == "shadow"
    runner.process_due_runs(db, NOW)
    db.refresh(run)
    assert run.status == "succeeded" and run.step_results[0]["dry"] is True


@pytest.mark.parametrize("definition,problem", [
    ({"actions": [{"type": "approve_document"}]}, "not allowed"),
    ({"actions": [{"type": "no_such_action"}]}, "unknown action"),
    ({"actions": []}, "at least one action"),
    ({"conditions": {"all": [{"field": "password", "op": "eq", "value": 1}]}, "actions": [{"type": "log"}]}, "unknown field"),
    ({"conditions": {"all": [{"field": "data.x", "op": "regex", "value": 1}]}, "actions": [{"type": "log"}]}, "unknown operator"),
    ({"conditions": {"all": [{"all": [{"all": [{"field": "data.x", "op": "eq", "value": 1}]}]}]}, "actions": [{"type": "log"}]}, "nest"),
])
def test_invalid_definitions_are_refused(definition, problem):
    with pytest.raises(RuleInvalid) as exc:
        validate_definition(definition)
    assert any(problem in e for e in exc.value.errors), exc.value.errors


@pytest.mark.parametrize("cond,expected", [
    ({"field": "data.n", "op": "gt", "value": 3}, True),
    ({"field": "data.n", "op": "lte", "value": 3}, False),
    ({"field": "data.tags", "op": "contains", "value": "a"}, True),
    ({"field": "data.missing", "op": "exists"}, False),
    ({"field": "data.missing", "op": "ne", "value": 1}, True),
    ({"any": [{"field": "data.n", "op": "eq", "value": 1}, {"field": "data.n", "op": "eq", "value": 5}]}, True),
    ({"field": "data.n", "op": "gt", "value": "x"}, False),       # incomparable types never match (no crash)
])
def test_condition_operators(cond, expected):
    assert evaluate(cond, {"data": {"n": 5, "tags": ["a", "b"]}}) is expected


# ── runner ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def test_the_same_event_never_runs_the_same_rule_twice(world):
    db = world.db
    rule = _rule(db)
    envelope = {"id": "evt-1", "type": "document.uploaded", "organization_id": 1, "data": {}}
    db.add_all(runner.build_runs(db, envelope))
    db.commit()
    assert runner.build_runs(db, envelope) == []
    assert db.query(AutomationRun).filter_by(rule_id=rule.id).count() == 1


def test_a_successful_run(world):
    db = world.db
    _rule(db)
    _emit(db)
    assert runner.process_due_runs(db, NOW) == 1
    run = db.query(AutomationRun).one()
    assert run.status == "succeeded" and run.step_results[0]["detail"] == {"message": "ok"}


def test_retries_with_backoff_then_succeeds(world, flaky):
    db = world.db
    flaky["fail"] = 2
    _rule(db, actions_=[{"type": "test_flaky"}])
    _emit(db)
    run = db.query(AutomationRun).one()
    runner.process_due_runs(db, NOW)
    db.refresh(run)
    assert (run.status, run.attempt, run.next_attempt_at) == ("pending", 1, NOW + timedelta(seconds=60))
    assert runner.process_due_runs(db, NOW + timedelta(seconds=30)) == 0          # not due yet
    runner.process_due_runs(db, NOW + timedelta(seconds=61))
    db.refresh(run)
    assert (run.attempt, run.next_attempt_at) == (2, NOW + timedelta(seconds=61 + 300))
    runner.process_due_runs(db, NOW + timedelta(seconds=400))
    db.refresh(run)
    assert run.status == "succeeded" and flaky["calls"] == 3


def test_a_run_is_dead_after_five_failures_and_can_be_replayed(world, flaky):
    db = world.db
    flaky["fail"] = 99
    _rule(db, actions_=[{"type": "test_flaky"}])
    _emit(db)
    run = db.query(AutomationRun).one()
    t = NOW
    for _ in range(runner.MAX_ATTEMPTS):
        runner.process_due_runs(db, t)
        t += timedelta(hours=3)
    db.refresh(run)
    assert run.status == "dead" and run.attempt == runner.MAX_ATTEMPTS
    flaky["fail"] = 0
    runner.retry(db, run)
    runner.process_due_runs(db, t)
    db.refresh(run)
    assert run.status == "succeeded"


def test_permanent_errors_are_not_retried(world, flaky):
    db = world.db
    flaky["permanent"] = True
    _rule(db, actions_=[{"type": "test_flaky"}])
    _emit(db)
    runner.process_due_runs(db, NOW)
    run = db.query(AutomationRun).one()
    assert run.status == "failed" and "never work" in run.error and flaky["calls"] == 1


def test_completed_steps_are_not_repeated_on_retry(world, flaky):
    db = world.db
    flaky["fail"] = 1
    _rule(db, actions_=[{"type": "log", "message": "first"}, {"type": "test_flaky"}])
    _emit(db)
    runner.process_due_runs(db, NOW)
    runner.process_due_runs(db, NOW + timedelta(minutes=2))
    run = db.query(AutomationRun).one()
    assert run.status == "succeeded"
    assert [s["type"] for s in run.step_results] == ["log", "test_flaky"]


def test_delay_waits_and_resumes(world):
    db = world.db
    _rule(db, actions_=[{"type": "log", "message": "a"}, {"type": "delay", "seconds": 3600}, {"type": "log", "message": "b"}])
    _emit(db)
    runner.process_due_runs(db, NOW)
    run = db.query(AutomationRun).one()
    assert run.status == "waiting" and run.resume_at == NOW + timedelta(hours=1)
    assert runner.process_due_runs(db, NOW + timedelta(minutes=30)) == 0
    runner.process_due_runs(db, NOW + timedelta(hours=1, seconds=1))
    db.refresh(run)
    assert run.status == "succeeded" and [s["detail"].get("message") for s in run.step_results] == ["a", None, "b"]


def test_global_pause_keeps_runs_queued(world, monkeypatch):
    db = world.db
    _rule(db)
    _emit(db)
    monkeypatch.setenv("HR_AUTOMATION_PAUSED", "1")
    assert runner.process_due_runs(db, NOW) == 0
    assert db.query(AutomationRun).one().status == "pending"
    monkeypatch.delenv("HR_AUTOMATION_PAUSED")
    runner.process_due_runs(db, NOW)
    assert db.query(AutomationRun).one().status == "succeeded"


def test_org_pause_keeps_runs_queued(world):
    db = world.db
    db.add(AutomationSettings(organization_id=1, paused=True))
    _rule(db)
    _emit(db)
    runner.process_due_runs(db, NOW)
    run = db.query(AutomationRun).one()
    assert run.status == "pending" and run.next_attempt_at > NOW


def test_a_feature_switched_off_skips_the_run(world):
    db = world.db
    db.add(AutomationSettings(organization_id=1, features={"reminders": False}))
    _rule(db, feature="reminders")
    _emit(db)
    runner.process_due_runs(db, NOW)
    run = db.query(AutomationRun).one()
    assert (run.status, run.skip_reason) == ("skipped", "feature_off:reminders")


def test_dry_run_changes_nothing(world):
    db = world.db
    rule = _rule(db, actions_=[{"type": "delay", "seconds": 60}, {"type": "log", "message": "x"}])
    out = runner.dry_run(db, rule, [{"id": "e1", "type": "document.uploaded", "organization_id": 1, "data": {}}])
    assert out[0]["matched"] and [a["type"] for a in out[0]["actions"]] == ["delay", "log"]
    assert db.query(AutomationRun).count() == 0


def test_unknown_events_are_ignored(world):
    assert emit_event(world.db, "no.such.event", {}, 1, in_tx=True) is None


# ── quiet hours ─────────────────────────────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("now,channel,expected", [
    (datetime(2026, 11, 19, 21, 0), "email", datetime(2026, 11, 20, 8, 0)),      # inside a window that crosses midnight
    (datetime(2026, 11, 20, 7, 30), "sms", datetime(2026, 11, 20, 8, 0)),
    (datetime(2026, 11, 19, 12, 0), "email", None),                              # outside
    (datetime(2026, 11, 19, 21, 0), "in_app", None),                             # in-app is never held
])
def test_quiet_hours(now, channel, expected):
    settings = AutomationSettings(organization_id=1, quiet_hours={"start": "20:00", "end": "08:00", "tz": "UTC"})
    assert limits.quiet_defer_until(settings, channel, now) == expected


def test_quiet_hours_use_the_org_timezone():
    settings = AutomationSettings(organization_id=1, quiet_hours={"start": "20:00", "end": "08:00", "tz": "Asia/Kolkata"})
    # 15:00 UTC = 20:30 IST: inside; ends 08:00 IST = 02:30 UTC next day
    assert limits.quiet_defer_until(settings, "email", datetime(2026, 11, 19, 15, 0)) == datetime(2026, 11, 20, 2, 30)
