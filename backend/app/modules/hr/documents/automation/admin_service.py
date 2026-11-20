"""Rules engine administration (ZHR-DOCS-ARCH-001 §15.2 / §15.3, Phase 8): the catalog, rule CRUD, dry runs against real
recent events, shadow mode, run history with dead-letter retry, and the organization's automation settings.

Rules are data (rules.validate_definition); forbidden actions are refused; system rules can be paused and parameterised
but never deleted, and their trigger cannot change. Org-wide switches (pause, quiet hours, rate limits) are the Org
Admin's alone (`automation.global`).
"""
import re
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.core.pagination import Page
from app.modules.hr.documents import audit_service, errors
from app.modules.hr.documents.automation import events as ev, ladder as ladder_mod, limits, runner
from app.modules.hr.documents.automation.actions import ACTIONS
from app.modules.hr.documents.automation.models import (AutomationRule, AutomationRun, AutomationSettings, RuleStatus,
                                                        RunStatus)
from app.modules.hr.documents.automation.rules import (FORBIDDEN_ACTIONS, MAX_ACTIONS, MAX_CONDITIONS, OPERATORS, RuleInvalid,
                                                       validate_definition)
from app.modules.hr.documents.permissions import ORG_ADMIN, role_of

CONDITION_FIELDS = {
    "employee.role": "Role", "employee.department_id": "Department", "employee.designation_id": "Designation",
    "employee.employment_type": "Employment type", "employee.location_id": "Location", "employee.status": "Employee status",
    "employee.days_since_joining": "Days since joining", "category.key": "Document category",
    "category.is_required": "Category is required",
}
ACTION_HELP = {
    "notify": "Send a notification (in-app / email) to the person, their manager, HR admins or Org Admins",
    "create_task": "Open a task for the person, with reminders",
    "cancel_tasks": "Close the person's open tasks of a kind",
    "create_upload_tasks": "Ask the person to upload every required document they are missing",
    "reassess_requirements": "Re-check which documents the person must provide",
    "notify_upload_for_review": "Tell HR admins a document is waiting for review",
    "notify_document_decision": "Tell the person about an approval or rejection",
    "open_renew_task": "Ask the person for a new copy of an expired document",
    "delay": "Wait before the next action (at most 7 days)",
    "log": "Write a line to the run history",
}
SETTINGS_GLOBAL_FIELDS = ("paused", "quiet_hours", "rate_limits")
_HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def _iso(v):
    return v.isoformat() if v else None


# ── catalog ────────────────────────────────────────────────────────────────────────────────────────────────────────

def catalog() -> dict:
    events = []
    for t, model in ev.EVENT_MODELS.items():
        fields = [f for f in model.model_fields if f not in ("type", "description")]
        events.append({"type": t, "description": model.description, "fields": [f"data.{f}" for f in fields]})
    from app.modules.hr.documents.automation.templates import catalog as template_catalog
    return {
        "events": sorted(events, key=lambda e: e["type"]),
        "fields": [{"field": k, "label": v} for k, v in CONDITION_FIELDS.items()],
        "operators": list(OPERATORS),
        "actions": [{"type": k, "description": ACTION_HELP.get(k, "")} for k in sorted(ACTIONS) if k not in FORBIDDEN_ACTIONS],
        "templates": [t["key"] for t in template_catalog()],
        "limits": {"conditions": MAX_CONDITIONS, "actions": MAX_ACTIONS},
    }


# ── rules ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def _stats(db: Session, rule_ids: list[int]) -> dict:
    from datetime import timedelta
    from sqlalchemy import func
    if not rule_ids:
        return {}
    since = datetime.utcnow() - timedelta(days=7)
    rows = (db.query(AutomationRun.rule_id, AutomationRun.status, func.count(), func.max(AutomationRun.created_at))
            .filter(AutomationRun.rule_id.in_(rule_ids), AutomationRun.created_at >= since)
            .group_by(AutomationRun.rule_id, AutomationRun.status).all())
    last = dict(db.query(AutomationRun.rule_id, func.max(AutomationRun.created_at))
                .filter(AutomationRun.rule_id.in_(rule_ids)).group_by(AutomationRun.rule_id).all())
    out: dict = {}
    for rid, status, n, _ in rows:
        s = out.setdefault(rid, {"runs_7d": 0, "succeeded_7d": 0, "failed_7d": 0})
        s["runs_7d"] += n
        if status == RunStatus.SUCCEEDED.value:
            s["succeeded_7d"] += n
        elif status in (RunStatus.FAILED.value, RunStatus.DEAD.value):
            s["failed_7d"] += n
    for rid in rule_ids:
        s = out.setdefault(rid, {"runs_7d": 0, "succeeded_7d": 0, "failed_7d": 0})
        s["success_rate_7d"] = round(100 * s["succeeded_7d"] / s["runs_7d"]) if s["runs_7d"] else None
        s["last_run_at"] = _iso(last.get(rid))
    return out


def serialize_rule(rule: AutomationRule, stats: Optional[dict] = None) -> dict:
    return {"id": rule.id, "key": rule.key, "name": rule.name, "description": rule.description,
            "trigger_event": rule.trigger_event, "definition": rule.definition, "status": rule.status,
            "is_system": bool(rule.is_system), "version": rule.version, "created_at": _iso(rule.created_at),
            "updated_at": _iso(rule.updated_at), **(stats or {})}


def list_rules(db: Session, actor, *, event: Optional[str] = None, status: Optional[str] = None,
               system: Optional[bool] = None) -> list[dict]:
    q = db.query(AutomationRule).filter(AutomationRule.organization_id == actor.organization_id)
    if event:
        q = q.filter(AutomationRule.trigger_event == event)
    if status:
        q = q.filter(AutomationRule.status == status)
    if system is not None:
        q = q.filter(AutomationRule.is_system.is_(system))
    rules = q.order_by(AutomationRule.is_system.desc(), AutomationRule.name).all()
    stats = _stats(db, [r.id for r in rules])
    return [serialize_rule(r, stats.get(r.id)) for r in rules]


def _rule(db: Session, actor, rule_id: int) -> AutomationRule:
    rule = db.query(AutomationRule).filter(AutomationRule.id == rule_id,
                                           AutomationRule.organization_id == actor.organization_id).first()
    if rule is None:
        raise errors.not_found("Rule")
    return rule


def get_rule(db: Session, actor, rule_id: int) -> dict:
    rule = _rule(db, actor, rule_id)
    return serialize_rule(rule, _stats(db, [rule.id]).get(rule.id))


def _validated(definition: dict) -> dict:
    try:
        clean = validate_definition(definition)
    except RuleInvalid as exc:
        raise errors.DocError(422, "DOC_RULE_INVALID", "This rule can't be saved.", {"problems": exc.errors})
    for spec in clean["actions"]:
        if spec.get("type") == "delay" and int(spec.get("seconds") or 0) > 7 * 86400:
            raise errors.DocError(422, "DOC_RULE_INVALID", "This rule can't be saved.", {"problems": ["a delay is at most 7 days"]})
    extra = {k: v for k, v in definition.items() if k in ("feature",)}
    return {**extra, **clean}


def _check_event(event: str) -> None:
    if event not in ev.EVENT_MODELS:
        raise errors.invalid("Choose an event from the list.", field="trigger_event")


def create_rule(db: Session, actor, *, name: str, trigger_event: str, definition: dict, description: Optional[str] = None,
                status: str = RuleStatus.PAUSED.value) -> dict:
    _check_event(trigger_event)
    if status not in (s.value for s in RuleStatus):
        raise errors.invalid("Unknown status.", field="status")
    rule = AutomationRule(organization_id=actor.organization_id, name=name.strip()[:120], description=description,
                          trigger_event=trigger_event, definition=_validated(definition), status=status, is_system=False,
                          version=1, created_by=actor.id, updated_by=actor.id)
    db.add(rule)
    db.flush()
    audit_service.record(db, org_id=actor.organization_id, actor=actor, action="rule_created", target_type="automation_rule",
                         target_id=rule.id, rule_id=rule.id, after={"name": rule.name, "event": trigger_event, "status": status})
    db.commit()
    return serialize_rule(rule)


def update_rule(db: Session, actor, rule_id: int, changes: dict) -> dict:
    rule = _rule(db, actor, rule_id)
    before = {"name": rule.name, "trigger_event": rule.trigger_event, "version": rule.version}
    if "trigger_event" in changes and changes["trigger_event"] != rule.trigger_event:
        if rule.is_system:
            raise errors.forbidden("A system rule's trigger can't be changed. Pause it and create your own rule instead.")
        _check_event(changes["trigger_event"])
        rule.trigger_event = changes["trigger_event"]
    if changes.get("name"):
        rule.name = changes["name"].strip()[:120]
    if "description" in changes:
        rule.description = changes["description"]
    if "definition" in changes and changes["definition"] is not None:
        rule.definition = _validated(changes["definition"])
        rule.version = (rule.version or 1) + 1
    rule.updated_by, rule.updated_at = actor.id, datetime.utcnow()
    audit_service.record(db, org_id=actor.organization_id, actor=actor, action="rule_updated", target_type="automation_rule",
                         target_id=rule.id, rule_id=rule.id, before=before, after={"name": rule.name, "version": rule.version})
    db.commit()
    return serialize_rule(rule)


def set_status(db: Session, actor, rule_id: int, status: str) -> dict:
    rule = _rule(db, actor, rule_id)
    if status not in (s.value for s in RuleStatus):
        raise errors.invalid("Status must be active, paused or shadow.", field="status")
    before = rule.status
    rule.status, rule.updated_by, rule.updated_at = status, actor.id, datetime.utcnow()
    audit_service.record(db, org_id=actor.organization_id, actor=actor, action="rule_status", target_type="automation_rule",
                         target_id=rule.id, rule_id=rule.id, before={"status": before}, after={"status": status})
    db.commit()
    return serialize_rule(rule)


def delete_rule(db: Session, actor, rule_id: int) -> None:
    rule = _rule(db, actor, rule_id)
    if rule.is_system:
        raise errors.forbidden("System rules can be paused but not deleted.")
    audit_service.record(db, org_id=actor.organization_id, actor=actor, action="rule_deleted", target_type="automation_rule",
                         target_id=rule.id, rule_id=rule.id, before={"name": rule.name})
    db.delete(rule)
    db.commit()


# ── dry run ────────────────────────────────────────────────────────────────────────────────────────────────────────

def recent_events(db: Session, organization_id: int, event_type: str, limit: int = 20) -> list[dict]:
    """Real recent events of this type in the organization (from earlier automation runs), newest first."""
    seen, out = set(), []
    for (payload,) in (db.query(AutomationRun.trigger_payload)
                       .filter(AutomationRun.organization_id == organization_id, AutomationRun.event_type == event_type)
                       .order_by(AutomationRun.id.desc()).limit(limit * 5)):
        if not isinstance(payload, dict) or payload.get("id") in seen:
            continue
        seen.add(payload.get("id"))
        out.append(payload)
        if len(out) >= limit:
            break
    return out


def dry_run(db: Session, actor, rule_id: Optional[int], *, definition: Optional[dict] = None, trigger_event: Optional[str] = None,
            sample: Optional[dict] = None, last_n: int = 20) -> dict:
    """What the rule (saved, or the unsaved `definition` being edited) would do. Sends and changes nothing."""
    org = actor.organization_id
    if rule_id is not None:
        rule = _rule(db, actor, rule_id)
        event = rule.trigger_event
        defn = _validated(definition) if definition is not None else rule.definition
    else:
        _check_event(trigger_event or "")
        event, defn = trigger_event, _validated(definition or {})
    probe = AutomationRule(organization_id=org, name="dry run", trigger_event=event, definition=defn)
    if sample is not None:
        envelopes = [{"id": "sample", "type": event, "organization_id": org, "created_at": _iso(datetime.utcnow()),
                      "data": {k: v for k, v in sample.items() if isinstance(k, str)}}]
        source = "sample"
    else:
        envelopes = recent_events(db, org, event, max(1, min(last_n, 50)))
        source = "recent"
    results = runner.dry_run(db, probe, envelopes) if envelopes else []
    audit_service.record(db, org_id=org, actor=actor, action="rule_dry_run", target_type="automation_rule",
                         target_id=rule_id or 0, rule_id=rule_id, after={"events": len(envelopes), "source": source})
    db.commit()
    return {"source": source, "events": len(envelopes), "matched": sum(1 for r in results if r["matched"]), "results": results}


# ── runs ───────────────────────────────────────────────────────────────────────────────────────────────────────────

def serialize_run(run: AutomationRun, rules: dict, detail: bool = False) -> dict:
    out = {"id": run.id, "rule_id": run.rule_id, "rule_name": getattr(rules.get(run.rule_id), "name", None),
           "event_type": run.event_type, "event_id": run.event_id, "mode": run.mode, "status": run.status,
           "skip_reason": run.skip_reason, "attempt": run.attempt, "error": run.error, "created_at": _iso(run.created_at),
           "started_at": _iso(run.started_at), "finished_at": _iso(run.finished_at),
           "next_attempt_at": _iso(run.next_attempt_at), "can_retry": run.status in (RunStatus.FAILED.value, RunStatus.DEAD.value)}
    if detail:
        snap = dict(run.definition_snapshot or {})
        snap.pop("_context", None)
        out.update({"steps": run.step_results or [], "definition": snap,
                    "payload": (run.trigger_payload or {}).get("data") if isinstance(run.trigger_payload, dict) else None})
    return out


def list_runs(db: Session, actor, *, rule_id=None, status=None, event=None, date_from=None, date_to=None,
              page: int = 1, per_page: int = 50) -> dict:
    q = db.query(AutomationRun).filter(AutomationRun.organization_id == actor.organization_id)
    if rule_id:
        q = q.filter(AutomationRun.rule_id == rule_id)
    if status:
        q = q.filter(AutomationRun.status == status)
    if event:
        q = q.filter(AutomationRun.event_type == event)
    if date_from:
        q = q.filter(AutomationRun.created_at >= date_from)
    if date_to:
        q = q.filter(AutomationRun.created_at <= date_to)
    total = q.count()
    runs = q.order_by(AutomationRun.id.desc()).offset((page - 1) * per_page).limit(per_page).all()
    rules = {r.id: r for r in db.query(AutomationRule).filter(AutomationRule.id.in_({r.rule_id for r in runs if r.rule_id} or {-1}))}
    return Page(items=[serialize_run(r, rules) for r in runs], total=total, page=page, per_page=per_page).model_dump()


def _run(db: Session, actor, run_id: int) -> AutomationRun:
    run = db.query(AutomationRun).filter(AutomationRun.id == run_id,
                                         AutomationRun.organization_id == actor.organization_id).first()
    if run is None:
        raise errors.not_found("Run")
    return run


def get_run(db: Session, actor, run_id: int) -> dict:
    run = _run(db, actor, run_id)
    rules = {run.rule_id: db.get(AutomationRule, run.rule_id)} if run.rule_id else {}
    return serialize_run(run, rules, detail=True)


def retry_run(db: Session, actor, run_id: int) -> dict:
    run = _run(db, actor, run_id)
    try:
        runner.retry(db, run)
    except ValueError:
        raise errors.DocError(409, "DOC_RUN_NOT_RETRYABLE", "Only a failed run can be retried.")
    audit_service.record(db, org_id=actor.organization_id, actor=actor, action="run_retried", target_type="automation_run",
                         target_id=run.id, rule_id=run.rule_id)
    db.commit()
    return get_run(db, actor, run_id)


# ── settings ───────────────────────────────────────────────────────────────────────────────────────────────────────

def serialize_settings(s: Optional[AutomationSettings], actor) -> dict:
    features = {f: limits.feature_enabled(s, f) for f in limits.FEATURES}
    return {"paused": bool(s.paused) if s else False, "globally_paused": None, "features": features,
            "quiet_hours": (s.quiet_hours if s else None) or None, "rate_limits": (s.rate_limits if s else None) or {},
            "approval_sla_hours": s.approval_sla_hours if s and s.approval_sla_hours else 72,
            "default_ladder": (s.default_ladder if s else None) or [dict(x) for x in ladder_mod.DEFAULT_LADDER],
            "lock_after_exit_days": s.lock_after_exit_days if s and s.lock_after_exit_days else 30,
            "can_change_global": role_of(actor) == ORG_ADMIN}


def get_settings(db: Session, actor) -> dict:
    out = serialize_settings(limits.org_settings(db, actor.organization_id), actor)
    out["globally_paused"] = limits.globally_paused(db)
    return out


def put_settings(db: Session, actor, changes: dict) -> dict:
    org = actor.organization_id
    touched_global = [f for f in SETTINGS_GLOBAL_FIELDS if f in changes]
    if touched_global and role_of(actor) != ORG_ADMIN:
        raise errors.forbidden("Only the Org Admin can pause automation or change quiet hours and sending limits.")
    s = limits.org_settings(db, org)
    if s is None:
        s = AutomationSettings(organization_id=org)
        db.add(s)
    before = serialize_settings(s, actor)
    if "paused" in changes:
        s.paused = bool(changes["paused"])
    if "features" in changes:
        unknown = set(changes["features"] or {}) - set(limits.FEATURES)
        if unknown:
            raise errors.invalid(f"Unknown feature: {', '.join(sorted(unknown))}.", field="features")
        s.features = {**(s.features or {}), **{k: bool(v) for k, v in (changes["features"] or {}).items()}}
    if "quiet_hours" in changes:
        qh = changes["quiet_hours"]
        if qh:
            if not (_HHMM.match(str(qh.get("start", ""))) and _HHMM.match(str(qh.get("end", "")))):
                raise errors.invalid("Quiet hours need a start and end like 20:00.", field="quiet_hours")
            try:
                from zoneinfo import ZoneInfo
                ZoneInfo(qh.get("tz") or "UTC")
            except Exception:
                raise errors.invalid("Unknown time zone.", field="quiet_hours")
            qh = {"start": qh["start"], "end": qh["end"], "tz": qh.get("tz") or "UTC"}
        s.quiet_hours = qh or None
    if "rate_limits" in changes:
        rl = changes["rate_limits"] or {}
        clean = {}
        for k, lo, hi in (("reminders_per_employee_per_day", 1, 50), ("emails_per_hour", 10, 10000)):
            if rl.get(k) is not None:
                v = int(rl[k])
                if not lo <= v <= hi:
                    raise errors.invalid(f"{k.replace('_', ' ')} must be {lo}–{hi}.", field="rate_limits")
                clean[k] = v
        s.rate_limits = clean
    if "approval_sla_hours" in changes:
        v = int(changes["approval_sla_hours"])
        if not 4 <= v <= 720:
            raise errors.invalid("The review target is 4–720 hours.", field="approval_sla_hours")
        s.approval_sla_hours = v
    if "lock_after_exit_days" in changes:
        v = int(changes["lock_after_exit_days"])
        if not 0 <= v <= 365:
            raise errors.invalid("Archive files 0–365 days after someone leaves.", field="lock_after_exit_days")
        s.lock_after_exit_days = v
    if "default_ladder" in changes:
        try:
            s.default_ladder = ladder_mod.validate_ladder(changes["default_ladder"]) if changes["default_ladder"] else None
        except ValueError as exc:
            raise errors.invalid(str(exc), field="default_ladder")
    s.updated_by, s.updated_at = actor.id, datetime.utcnow()
    db.flush()
    audit_service.record(db, org_id=org, actor=actor, action="automation_settings", target_type="automation_settings",
                         target_id=org, before={k: before[k] for k in ("paused", "approval_sla_hours")},
                         after={"changed": sorted(changes)})
    db.commit()
    return get_settings(db, actor)
