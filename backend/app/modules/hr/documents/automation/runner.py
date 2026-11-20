"""Turns events into automation runs and executes them (ZHR-DOCS-ARCH-001 §15.2, §16).

* build_runs (called by integrations.emit_event, inside the business transaction): matches the organization's active and
  shadow rules for the event, evaluates their conditions against a snapshot of the context, and returns one run per match.
  idempotency_key = sha256(rule_id:event_id): the same event never runs the same rule twice.
* process_due_runs (called by the integrations worker tick on the background leader): claims due runs and executes their
  steps under the run's tenant context. Temporary failures are retried with backoff; after MAX_ATTEMPTS a run is dead
  (dead-letter, retried only by hand). Permanent failures stop at once. Paused automation leaves runs queued.
"""
import hashlib
import logging
from datetime import datetime, timedelta
from typing import Iterable, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.modules.hr.documents.automation import limits
from app.modules.hr.documents.automation.actions import PermanentError, RetryableError, run_action
from app.modules.hr.documents.automation.context import build_context
from app.modules.hr.documents.automation.models import AutomationRule, AutomationRun, RuleStatus, RunMode, RunStatus
from app.modules.hr.documents.automation.rules import evaluate

logger = logging.getLogger("zoiko.documents.automation")

MAX_ATTEMPTS = 5
BACKOFF_SECONDS = (60, 300, 1800, 7200)     # wait before attempts 2..5
PAUSED_RECHECK_SECONDS = 300
DUE_STATUSES = (RunStatus.PENDING.value, RunStatus.WAITING.value)


def idempotency_key(rule_id: int, event_id: str) -> str:
    return hashlib.sha256(f"{rule_id}:{event_id}".encode()).hexdigest()


def backoff_for(attempt: int) -> timedelta:
    """Wait after the `attempt`-th failure (1-based)."""
    return timedelta(seconds=BACKOFF_SECONDS[min(max(attempt, 1), len(BACKOFF_SECONDS)) - 1])


def build_runs(db: Session, envelope: dict) -> list[AutomationRun]:
    org = envelope.get("organization_id")
    event_type, event_id = envelope.get("type"), envelope.get("id")
    if org is None or not event_type or not event_id:
        return []
    rules = (db.query(AutomationRule)
             .filter(AutomationRule.organization_id == org, AutomationRule.trigger_event == event_type,
                     AutomationRule.status.in_((RuleStatus.ACTIVE.value, RuleStatus.SHADOW.value)))
             .order_by(AutomationRule.id).all())
    if not rules:
        return []
    ctx = build_context(db, envelope)
    runs = []
    for rule in rules:
        definition = rule.definition or {}
        try:
            matched = evaluate(definition.get("conditions"), ctx)
        except Exception:
            logger.exception("automation rule %s: condition evaluation failed", rule.id)
            matched = False
        if not matched:
            continue
        key = idempotency_key(rule.id, event_id)
        if db.query(AutomationRun.id).filter(AutomationRun.idempotency_key == key).first():
            continue
        runs.append(AutomationRun(
            organization_id=org, rule_id=rule.id, rule_version=rule.version, event_id=event_id, event_type=event_type,
            trigger_payload=envelope, definition_snapshot={**definition, "_context": ctx},
            mode=RunMode.SHADOW.value if rule.status == RuleStatus.SHADOW.value else RunMode.LIVE.value,
            status=RunStatus.PENDING.value, attempt=0, idempotency_key=key))
    return runs


def _due_query(db: Session, now: datetime):
    q = (db.query(AutomationRun)
         .filter(AutomationRun.status.in_(DUE_STATUSES),
                 or_(AutomationRun.next_attempt_at.is_(None), AutomationRun.next_attempt_at <= now),
                 or_(AutomationRun.resume_at.is_(None), AutomationRun.resume_at <= now))
         .order_by(AutomationRun.id))
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        q = q.with_for_update(skip_locked=True)      # two workers never execute the same run
    return q


def process_due_runs(db: Session, now: Optional[datetime] = None, limit: int = 50) -> int:
    now = now or datetime.utcnow()
    if limits.globally_paused(db):
        return 0
    done = 0
    for run in _due_query(db, now).limit(limit).all():
        try:
            run_one(db, run, now)
            done += 1
        except Exception:
            db.rollback()
            logger.exception("automation run %s crashed", getattr(run, "id", "?"))
    return done


def _finish(run: AutomationRun, status: str, now: datetime, error: Optional[str] = None) -> None:
    run.status = status
    run.finished_at = now
    run.error = (error or None) and str(error)[:500]


def run_one(db: Session, run: AutomationRun, now: Optional[datetime] = None) -> AutomationRun:
    from app.core.privacy import context as privacy_ctx
    from app.core.privacy.jobs import JobNotAuthorized, recheck

    now = now or datetime.utcnow()
    settings = limits.org_settings(db, run.organization_id)
    if settings is not None and settings.paused:
        run.next_attempt_at = now + timedelta(seconds=PAUSED_RECHECK_SECONDS)     # stays queued until resumed
        db.commit()
        return run
    definition = run.definition_snapshot or {}
    feature = definition.get("feature")
    if feature and not limits.feature_enabled(settings, feature):
        _finish(run, RunStatus.SKIPPED.value, now)
        run.skip_reason = f"feature_off:{feature}"[:40]
        db.commit()
        return run

    run.status = RunStatus.RUNNING.value
    run.started_at = run.started_at or now
    db.commit()

    ctx = dict(definition.get("_context") or {})
    actions = definition.get("actions") or []
    results = list(run.step_results or [])
    dry = run.mode in (RunMode.SHADOW.value, RunMode.DRY_RUN.value)
    try:
        recheck(db, run.organization_id, None, require_actor=False)
        with privacy_ctx.tenant_context(run.organization_id, None):
            for index in range(run.current_step, len(actions)):
                result = run_action(db, actions[index], ctx, run, dry=dry, now=now)
                if result.defer_until is not None and not dry:
                    run.status = RunStatus.WAITING.value          # quiet hours: the same step runs again later
                    run.resume_at = result.defer_until
                    run.step_results = list(results)
                    db.commit()
                    return run
                results.append({"step": index, "type": actions[index].get("type"), "ok": result.ok,
                                "detail": result.detail, "dry": dry})
                run.current_step = index + 1
                run.step_results = list(results)
                if result.resume_at is not None and index + 1 < len(actions):
                    run.status = RunStatus.WAITING.value
                    run.resume_at = result.resume_at
                    db.commit()
                    return run
                db.commit()                        # a step's effects and its progress land together; a retry resumes after it
        run.resume_at = None
        _finish(run, RunStatus.SUCCEEDED.value, now)
    except JobNotAuthorized as exc:
        db.rollback()
        run = db.merge(run)
        _finish(run, RunStatus.SKIPPED.value, now, str(exc))
        run.skip_reason = "tenant_inactive"
    except PermanentError as exc:
        db.rollback()
        run = db.merge(run)
        run.step_results = results
        _finish(run, RunStatus.FAILED.value, now, str(exc))
    except Exception as exc:                       # RetryableError and anything unexpected: retry with backoff
        db.rollback()
        run = db.merge(run)
        run.step_results = results
        run.attempt = (run.attempt or 0) + 1
        run.error = str(exc)[:500]
        if run.attempt >= MAX_ATTEMPTS:
            _finish(run, RunStatus.DEAD.value, now, str(exc))
            logger.warning("automation run %s is dead after %s attempts", run.id, run.attempt)
        else:
            run.status = RunStatus.PENDING.value
            run.next_attempt_at = now + backoff_for(run.attempt)
        if not isinstance(exc, RetryableError):
            logger.exception("automation run %s: unexpected error (will retry)", run.id)
    db.commit()
    return run


def retry(db: Session, run: AutomationRun) -> AutomationRun:
    """Put a failed or dead run back in the queue (manual dead-letter replay). Steps already done are not repeated."""
    if run.status not in (RunStatus.FAILED.value, RunStatus.DEAD.value):
        raise ValueError("only a failed or dead run can be retried")
    run.status = RunStatus.PENDING.value
    run.attempt = 0
    run.next_attempt_at = None
    run.error = None
    run.finished_at = None
    db.commit()
    return run


def dry_run(db: Session, rule: AutomationRule, envelopes: Iterable[dict]) -> list[dict]:
    """What `rule` would do for each event. Sends and changes nothing."""
    from app.modules.hr.documents.automation.rules import validate_definition
    definition = validate_definition(rule.definition)
    out = []
    now = datetime.utcnow()
    for envelope in envelopes:
        ctx = build_context(db, envelope)
        matched = evaluate(definition.get("conditions"), ctx)
        steps = []
        if matched:
            for spec in definition["actions"]:
                try:
                    res = run_action(db, spec, ctx, None, dry=True, now=now)
                    steps.append({"type": spec.get("type"), "ok": res.ok, "detail": res.detail})
                except (PermanentError, RetryableError) as exc:
                    steps.append({"type": spec.get("type"), "ok": False, "detail": {"error": str(exc)}})
        out.append({"event_id": envelope.get("id"), "matched": matched, "actions": steps})
    db.rollback()                                   # a dry run never leaves anything behind
    return out
