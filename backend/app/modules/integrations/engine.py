"""Zoiko Workflow execution engine.

Steps are limited to actions the platform can genuinely perform. A workflow's
steps are snapshotted onto each execution, so editing a workflow never changes
a run that is already in flight."""

import logging
import re
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.core.exceptions import ZoikoException
from app.modules.integrations.models import Webhook, Workflow, WorkflowExecution

logger = logging.getLogger("zoiko.integrations")

MAX_STEPS = 20
MAX_DELAY_SECONDS = 7 * 24 * 3600

# type -> required string fields (webhook_id / seconds are validated separately)
STEP_TYPES = {
    "notification": {"label": "Send in-app notification", "fields": ["title", "message"]},
    "email": {"label": "Send email", "fields": ["to", "subject", "body"]},
    "slack": {"label": "Send Slack message", "fields": ["message"]},
    "sms": {"label": "Send SMS", "fields": ["to", "message"]},
    "webhook": {"label": "Call a webhook", "fields": ["webhook_id"]},
    "delay": {"label": "Wait", "fields": ["seconds"]},
}

_TEMPLATE_RE = re.compile(r"\{\{\s*([\w.]+)\s*\}\}")


class StepError(Exception):
    pass


def validate_steps(steps: list) -> list:
    from app.core.exceptions import BadRequestException

    if not isinstance(steps, list) or not steps:
        raise BadRequestException("A workflow needs at least one step.")
    if len(steps) > MAX_STEPS:
        raise BadRequestException(f"A workflow can have at most {MAX_STEPS} steps.")
    clean = []
    for i, step in enumerate(steps, start=1):
        stype = (step or {}).get("type")
        if stype not in STEP_TYPES:
            raise BadRequestException(f"Step {i}: unknown step type '{stype}'.")
        item = {"type": stype}
        for f in STEP_TYPES[stype]["fields"]:
            value = step.get(f)
            if value is None or str(value).strip() == "":
                raise BadRequestException(f"Step {i} ({stype}): '{f}' is required.")
            item[f] = value if f in ("webhook_id", "seconds") else str(value).strip()
        if stype == "delay":
            try:
                item["seconds"] = int(item["seconds"])
            except (TypeError, ValueError):
                raise BadRequestException(f"Step {i}: delay must be a whole number of seconds.")
            if not 1 <= item["seconds"] <= MAX_DELAY_SECONDS:
                raise BadRequestException(f"Step {i}: delay must be between 1 second and 7 days.")
        if stype == "webhook":
            try:
                item["webhook_id"] = int(item["webhook_id"])
            except (TypeError, ValueError):
                raise BadRequestException(f"Step {i}: choose a registered webhook.")
        if stype == "notification":
            item["scope"] = "all" if step.get("scope") == "all" else "trigger_org"
        clean.append(item)
    return clean


def render(text: str, context: dict) -> str:
    def repl(m):
        cur = context
        for part in m.group(1).split("."):
            if isinstance(cur, dict) and part in cur:
                cur = cur[part]
            else:
                return ""
        return "" if cur is None else str(cur)

    return _TEMPLATE_RE.sub(repl, text or "")


def _step_notification(db, step, ctx, transport):
    from app.modules.super_admin import notification_service

    data = {"title": render(step["title"], ctx)[:300], "message": render(step["message"], ctx),
            "notification_type": "workflow", "audience": "org_admins"}
    org_id = (ctx or {}).get("organization_id")
    if step.get("scope") != "all":
        if not org_id:
            raise StepError("The trigger has no organization to notify; set the step scope to 'all organizations'.")
        data["target_org_ids"] = [org_id]
    notification_service.create_notification(db, data, None)
    return "Notification sent."


def _step_email(db, step, ctx, transport):
    from app.services.email_service import send_plain_email

    to = render(step["to"], ctx).strip()
    if "@" not in to:
        raise StepError(f"Invalid recipient email: '{to}'.")
    ok, err = send_plain_email(to, render(step["subject"], ctx), render(step["body"], ctx), db=db)
    if not ok:
        raise StepError(f"Email failed: {err}")
    return f"Email sent to {to}."


def _step_slack(db, step, ctx, transport):
    from app.modules.integrations import channels

    channels.deliver(db, "slack", None, render(step["message"], ctx), transport)
    return "Slack message sent."


def _step_sms(db, step, ctx, transport):
    from app.modules.integrations import channels

    to = render(step["to"], ctx).strip()
    channels.deliver(db, "twilio", to, render(step["message"], ctx), transport)
    return f"SMS sent to {to}."


def _step_webhook(db, step, ctx, transport):
    from app.modules.integrations import delivery
    from app.modules.integrations.models import WebhookDelivery
    import uuid

    wh = db.query(Webhook).filter(Webhook.id == step["webhook_id"]).first()
    if wh is None:
        raise StepError("The webhook for this step no longer exists.")
    event_id = uuid.uuid4().hex
    d = WebhookDelivery(
        webhook_id=wh.id, event_id=event_id, event_type="workflow.step",
        payload={"id": event_id, "type": "workflow.step",
                 "created_at": datetime.utcnow().isoformat() + "Z", "data": ctx or {}},
        status="pending", attempt=0,
    )
    db.add(d)
    db.flush()
    delivery.attempt_delivery(db, d, transport=transport)
    if d.status != "success":
        raise StepError(f"Webhook call failed: {d.error or 'no response'}")
    return f"Webhook '{wh.name}' responded {d.response_status}."


HANDLERS = {
    "notification": _step_notification,
    "email": _step_email,
    "slack": _step_slack,
    "sms": _step_sms,
    "webhook": _step_webhook,
}


def _finish(db: Session, ex: WorkflowExecution, status: str, error: Optional[str], now: datetime) -> None:
    ex.status = status
    ex.error = (error or None) and error[:500]
    ex.finished_at = now
    ex.resume_at = None
    if ex.workflow_id:
        wf = db.query(Workflow).filter(Workflow.id == ex.workflow_id).first()
        if wf:
            wf.last_run_at = now
            wf.last_run_status = status
    db.commit()


def run_execution(db: Session, ex: WorkflowExecution, now: Optional[datetime] = None, transport=None) -> WorkflowExecution:
    """Run (or resume) an execution until it finishes, fails, or hits a delay."""
    now = now or datetime.utcnow()
    ex.status = "running"
    ex.started_at = ex.started_at or now
    db.commit()
    steps = ex.steps_snapshot or []
    results = list(ex.step_results or [])
    ctx = ex.trigger_payload or {}
    while ex.current_step < len(steps):
        idx = ex.current_step
        step = steps[idx]
        started = datetime.utcnow()
        entry = {"index": idx, "type": step["type"], "started_at": started.isoformat() + "Z"}
        try:
            if step["type"] == "delay":
                ex.current_step = idx + 1
                entry.update(status="succeeded", output=f"Waiting {step['seconds']}s before the next step.",
                             finished_at=datetime.utcnow().isoformat() + "Z")
                results.append(entry)
                ex.step_results = results
                if ex.current_step >= len(steps):
                    return _done(db, ex, now)
                ex.status = "waiting"
                ex.resume_at = now + timedelta(seconds=step["seconds"])
                db.commit()
                return ex
            output = HANDLERS[step["type"]](db, step, ctx, transport)
            entry.update(status="succeeded", output=output)
        except (StepError, ZoikoException) as e:
            db.rollback()
            msg = getattr(e, "message", None) or str(e)
            entry.update(status="failed", error=msg[:500])
        except Exception as e:  # unexpected: record the real error, never swallow
            db.rollback()
            logger.exception("workflow step crashed")
            entry.update(status="failed", error=f"{type(e).__name__}: {str(e)[:300]}")
        entry["finished_at"] = datetime.utcnow().isoformat() + "Z"
        results.append(entry)
        ex.step_results = results
        if entry["status"] == "failed":
            _finish(db, ex, "failed", f"Step {idx + 1} ({step['type']}) failed: {entry['error']}", datetime.utcnow())
            return ex
        ex.current_step = idx + 1
        db.commit()
    return _done(db, ex, now)


def _done(db, ex, now):
    _finish(db, ex, "succeeded", None, datetime.utcnow())
    return ex


def process_due_executions(db: Session, now: Optional[datetime] = None, transport=None, limit: int = 20) -> int:
    now = now or datetime.utcnow()
    due = (
        db.query(WorkflowExecution)
        .filter((WorkflowExecution.status == "pending")
                | ((WorkflowExecution.status == "waiting") & (WorkflowExecution.resume_at <= now)))
        .order_by(WorkflowExecution.id)
        .limit(limit)
        .all()
    )
    for ex in due:
        try:
            run_execution(db, ex, now=now, transport=transport)
        except Exception:
            db.rollback()
            logger.exception("execution %s crashed", ex.id)
    return len(due)
