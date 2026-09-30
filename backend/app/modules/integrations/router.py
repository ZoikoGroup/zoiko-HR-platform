"""Super-admin APIs for Zoiko Connect, Hub and Workflow (ZHR-24/25/26).

Every route is super-admin-only; every mutating action writes an AuditLog row.
Existing AuditAction values are reused, with the specific event in `details`."""

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.crypto import decrypt_secret
from app.core.dependencies import get_current_super_admin
from app.core.exceptions import BadRequestException, NotFoundException, ZoikoException
from app.core.rate_limiter import limiter
from app.database import get_db
from app.modules.integrations import channels, delivery, engine
from app.modules.integrations.events import EVENT_CATALOG
from app.modules.integrations.models import (
    ConnectChannel, Webhook, WebhookDelivery, Workflow, WorkflowExecution, WorkflowWorkspace,
)
from app.modules.integrations.ssrf import UnsafeURL, validate_webhook_url
from app.modules.super_admin.models import AuditAction, AuditLog


def _audit(db: Session, user, action: AuditAction, entity_type: str, entity_id, details: dict) -> None:
    db.add(AuditLog(
        action=action, entity_type=entity_type, entity_id=entity_id,
        performed_by=user.id, performed_by_email=user.email, details=details,
    ))


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() + "Z" if dt else None


# ═══════════════════════════════ ZOIKO CONNECT ═══════════════════════════════

connect_router = APIRouter(
    prefix="/super-admin/connect", tags=["Zoiko Connect"], dependencies=[Depends(get_current_super_admin)]
)


class ChannelConfigIn(BaseModel):
    webhook_url: Optional[str] = Field(default=None, max_length=500)
    channel_label: Optional[str] = Field(default=None, max_length=80)
    account_sid: Optional[str] = Field(default=None, max_length=64)
    auth_token: Optional[str] = Field(default=None, max_length=128)
    from_number: Optional[str] = Field(default=None, max_length=20)
    messaging_service_sid: Optional[str] = Field(default=None, max_length=64)


class ChannelTestIn(BaseModel):
    to: Optional[str] = Field(default=None, max_length=20)
    message: Optional[str] = Field(default=None, max_length=500)


def _channel_or_400(channel: str) -> str:
    if channel not in channels.FIELDS:
        raise NotFoundException("Channel", channel)
    return channel


@connect_router.get("/channels")
def list_channels(db: Session = Depends(get_db)):
    rows = {r.channel: r for r in db.query(ConnectChannel).all()}
    items = [channels.channel_view(c, rows.get(c)) for c in ("slack", "twilio")]
    items.insert(0, channels.smtp_view(db))
    return {"channels": items}


@connect_router.put("/channels/{channel}")
def save_channel(channel: str, body: ChannelConfigIn, db: Session = Depends(get_db),
                 user=Depends(get_current_super_admin)):
    _channel_or_400(channel)
    existed = db.query(ConnectChannel).filter(ConnectChannel.channel == channel).first() is not None
    row = channels.save_config(db, channel, body.model_dump(exclude_none=True), user.id)
    # Never log config values, only which fields were supplied.
    _audit(db, user, AuditAction.UPDATE if existed else AuditAction.CREATE, "ConnectChannel", row.id,
           {"event": "connect.channel_saved", "channel": channel,
            "fields_changed": sorted(k for k, v in body.model_dump(exclude_none=True).items() if str(v).strip())})
    db.commit()
    return channels.channel_view(channel, row)


@connect_router.delete("/channels/{channel}")
def remove_channel(channel: str, db: Session = Depends(get_db), user=Depends(get_current_super_admin)):
    _channel_or_400(channel)
    row = db.query(ConnectChannel).filter(ConnectChannel.channel == channel).first()
    if row is None:
        raise NotFoundException("Channel configuration", channel)
    _audit(db, user, AuditAction.DELETE, "ConnectChannel", row.id,
           {"event": "connect.channel_removed", "channel": channel})
    db.delete(row)
    db.commit()
    return {"message": f"{channels.CHANNEL_NAMES[channel]} disconnected."}


@connect_router.post("/channels/{channel}/test")
@limiter.limit("5/minute")
def test_channel(request: Request, channel: str, body: ChannelTestIn, db: Session = Depends(get_db),
                 user=Depends(get_current_super_admin)):
    _channel_or_400(channel)
    row = db.query(ConnectChannel).filter(ConnectChannel.channel == channel).first()
    try:
        message = channels.send_test(db, channel, body.to, body.message)
    except ZoikoException as e:
        if row is not None:
            _audit(db, user, AuditAction.UPDATE, "ConnectChannel", row.id,
                   {"event": "connect.test_failed", "channel": channel, "error": e.message[:200]})
        db.commit()  # persists the recorded failure + audit row
        raise
    _audit(db, user, AuditAction.UPDATE, "ConnectChannel", row.id,
           {"event": "connect.test_sent", "channel": channel})
    db.commit()
    return {"success": True, "message": message}


# ═════════════════════════════════ ZOIKO HUB ═════════════════════════════════

hub_router = APIRouter(
    prefix="/super-admin/hub", tags=["Zoiko Hub"], dependencies=[Depends(get_current_super_admin)]
)


class WebhookIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    url: str = Field(min_length=1, max_length=1000)
    events: List[str] = Field(min_length=1)


class WebhookPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    url: Optional[str] = Field(default=None, min_length=1, max_length=1000)
    events: Optional[List[str]] = Field(default=None, min_length=1)


def _check_url(url: str) -> str:
    try:
        return validate_webhook_url(url)
    except UnsafeURL as e:
        raise BadRequestException(str(e))


def _check_events(events: List[str]) -> List[str]:
    bad = [e for e in events if e not in EVENT_CATALOG]
    if bad:
        raise BadRequestException(f"Unknown event(s): {', '.join(bad)}.")
    return sorted(set(events))


def _webhook_view(w: Webhook) -> dict:
    return {
        "id": w.id, "name": w.name, "url": w.url, "events": w.events or [],
        "secret": ("••••" + w.secret_hint) if w.secret_hint else None,
        "is_active": w.is_active, "auto_disabled": w.auto_disabled,
        "consecutive_failures": w.consecutive_failures, "total_failures": w.total_failures,
        "last_delivery_at": _iso(w.last_delivery_at), "last_delivery_status": w.last_delivery_status,
        "created_at": _iso(w.created_at),
    }


def _delivery_view(d: WebhookDelivery) -> dict:
    return {
        "id": d.id, "webhook_id": d.webhook_id, "event_type": d.event_type, "event_id": d.event_id,
        "status": d.status, "attempt": d.attempt, "response_status": d.response_status,
        "response_body": d.response_body, "error": d.error, "duration_ms": d.duration_ms,
        "payload": d.payload, "next_attempt_at": _iso(d.next_attempt_at),
        "last_attempt_at": _iso(d.last_attempt_at), "created_at": _iso(d.created_at),
    }


def _get_webhook(db: Session, webhook_id: int) -> Webhook:
    w = db.query(Webhook).filter(Webhook.id == webhook_id).first()
    if w is None:
        raise NotFoundException("Webhook", webhook_id)
    return w


@hub_router.get("/events")
def list_events():
    return {"events": [{"key": k, "description": v} for k, v in EVENT_CATALOG.items()]}


@hub_router.get("/applications")
def list_applications(db: Session = Depends(get_db)):
    """Integrated applications, derived only from real stored/config state."""
    from app.config import settings
    from app.modules.super_admin.router import compute_identity_providers

    def norm(status: str) -> str:
        return "Not connected" if status == "Not configured" else status

    apps = [
        {"key": "smtp", "name": "SMTP Email Server", "status": norm(channels.smtp_view(db)["status"]),
         "href": "/shared/connect"},
    ]
    rows = {r.channel: r for r in db.query(ConnectChannel).all()}
    for key in ("slack", "twilio"):
        apps.append({"key": key, "name": channels.CHANNEL_NAMES[key],
                     "status": norm(channels.compute_status(rows.get(key))), "href": "/shared/connect"})
    for p in compute_identity_providers():
        if p["key"] != "email":
            apps.append({"key": p["key"], "name": p["name"], "status": norm(p["status"]), "href": "/shared/id"})
    apps.append({"key": "stripe", "name": "Stripe Billing",
                 "status": "Configured (untested)" if settings.STRIPE_SECRET_KEY else "Not connected",
                 "href": "/super-admin/billing"})
    active = db.query(Webhook).filter(Webhook.is_active.is_(True)).count()
    apps.append({"key": "webhooks", "name": "Outbound Webhooks",
                 "status": f"{active} active" if active else "Not connected", "href": None})
    return {"applications": apps}


@hub_router.get("/webhooks")
def list_webhooks(db: Session = Depends(get_db)):
    return {"webhooks": [_webhook_view(w) for w in db.query(Webhook).order_by(Webhook.id.desc()).all()]}


@hub_router.post("/webhooks", status_code=201)
def create_webhook(body: WebhookIn, db: Session = Depends(get_db), user=Depends(get_current_super_admin)):
    url = _check_url(body.url)
    events = _check_events(body.events)
    w = Webhook(name=body.name.strip(), url=url, events=events, created_by=user.id, is_active=True)
    secret = delivery.new_secret()
    delivery.set_secret(w, secret)
    db.add(w)
    db.flush()
    _audit(db, user, AuditAction.CREATE, "Webhook", w.id,
           {"event": "hub.webhook_created", "name": w.name, "url": w.url, "events": events})
    db.commit()
    return {**_webhook_view(w), "signing_secret": secret}  # shown exactly once


@hub_router.get("/webhooks/{webhook_id}")
def get_webhook(webhook_id: int, db: Session = Depends(get_db)):
    return _webhook_view(_get_webhook(db, webhook_id))


@hub_router.patch("/webhooks/{webhook_id}")
def update_webhook(webhook_id: int, body: WebhookPatch, db: Session = Depends(get_db),
                   user=Depends(get_current_super_admin)):
    w = _get_webhook(db, webhook_id)
    changed = []
    if body.name is not None:
        w.name = body.name.strip()
        changed.append("name")
    if body.url is not None:
        w.url = _check_url(body.url)
        changed.append("url")
    if body.events is not None:
        w.events = _check_events(body.events)
        changed.append("events")
    _audit(db, user, AuditAction.UPDATE, "Webhook", w.id, {"event": "hub.webhook_updated", "fields": changed})
    db.commit()
    return _webhook_view(w)


@hub_router.delete("/webhooks/{webhook_id}")
def delete_webhook(webhook_id: int, db: Session = Depends(get_db), user=Depends(get_current_super_admin)):
    w = _get_webhook(db, webhook_id)
    used_by = [wf.name for wf in db.query(Workflow).filter(Workflow.is_active.is_(True)).all()
               if any(s.get("type") == "webhook" and s.get("webhook_id") == w.id for s in (wf.steps or []))]
    if used_by:
        raise BadRequestException(f"Webhook is used by active workflow(s): {', '.join(used_by)}.")
    _audit(db, user, AuditAction.DELETE, "Webhook", w.id, {"event": "hub.webhook_deleted", "name": w.name})
    db.delete(w)
    db.commit()
    return {"message": "Webhook deleted."}


@hub_router.post("/webhooks/{webhook_id}/enable")
def enable_webhook(webhook_id: int, db: Session = Depends(get_db), user=Depends(get_current_super_admin)):
    w = _get_webhook(db, webhook_id)
    _check_url(w.url)
    w.is_active, w.auto_disabled, w.consecutive_failures = True, False, 0
    _audit(db, user, AuditAction.ENABLE, "Webhook", w.id, {"event": "hub.webhook_enabled"})
    db.commit()
    return _webhook_view(w)


@hub_router.post("/webhooks/{webhook_id}/disable")
def disable_webhook(webhook_id: int, db: Session = Depends(get_db), user=Depends(get_current_super_admin)):
    w = _get_webhook(db, webhook_id)
    w.is_active = False
    _audit(db, user, AuditAction.DISABLE, "Webhook", w.id, {"event": "hub.webhook_disabled"})
    db.commit()
    return _webhook_view(w)


@hub_router.post("/webhooks/{webhook_id}/rotate-secret")
def rotate_secret(webhook_id: int, db: Session = Depends(get_db), user=Depends(get_current_super_admin)):
    w = _get_webhook(db, webhook_id)
    secret = delivery.new_secret()
    delivery.set_secret(w, secret)
    _audit(db, user, AuditAction.CONFIG_CHANGE, "Webhook", w.id, {"event": "hub.secret_rotated"})
    db.commit()
    return {**_webhook_view(w), "signing_secret": secret}


@hub_router.post("/webhooks/{webhook_id}/test")
@limiter.limit("10/minute")
def test_webhook(request: Request, webhook_id: int, db: Session = Depends(get_db),
                 user=Depends(get_current_super_admin)):
    w = _get_webhook(db, webhook_id)
    d = delivery.enqueue_test(db, w)
    db.commit()
    delivery.attempt_delivery(db, d)
    _audit(db, user, AuditAction.UPDATE, "Webhook", w.id,
           {"event": "hub.test_sent", "delivery_id": d.id, "status": d.status})
    db.commit()
    return _delivery_view(d)


@hub_router.get("/webhooks/{webhook_id}/deliveries")
def list_deliveries(webhook_id: int, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                    db: Session = Depends(get_db)):
    _get_webhook(db, webhook_id)
    q = db.query(WebhookDelivery).filter(WebhookDelivery.webhook_id == webhook_id)
    total = q.count()
    rows = q.order_by(WebhookDelivery.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"total": total, "page": page, "page_size": page_size, "deliveries": [_delivery_view(d) for d in rows]}


@hub_router.post("/deliveries/{delivery_id}/retry")
@limiter.limit("20/minute")
def retry_delivery(request: Request, delivery_id: int, db: Session = Depends(get_db),
                   user=Depends(get_current_super_admin)):
    d = db.query(WebhookDelivery).filter(WebhookDelivery.id == delivery_id).first()
    if d is None:
        raise NotFoundException("Delivery", delivery_id)
    if d.status == "success":
        raise BadRequestException("This delivery already succeeded.")
    d.attempt = 0
    delivery.attempt_delivery(db, d)
    _audit(db, user, AuditAction.UPDATE, "Webhook", d.webhook_id,
           {"event": "hub.delivery_retried", "delivery_id": d.id, "status": d.status})
    db.commit()
    return _delivery_view(d)


# ═══════════════════════════════ ZOIKO WORKFLOW ══════════════════════════════

workflow_router = APIRouter(
    prefix="/super-admin/workflow", tags=["Zoiko Workflow"], dependencies=[Depends(get_current_super_admin)]
)


class WorkspaceIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=1000)
    organization_id: Optional[int] = None


class WorkflowIn(BaseModel):
    workspace_id: int
    name: str = Field(min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=1000)
    trigger_event: str
    steps: List[dict]


class WorkflowPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=1000)
    trigger_event: Optional[str] = None
    steps: Optional[List[dict]] = None


def _workspace_view(w: WorkflowWorkspace, count: int = 0) -> dict:
    return {"id": w.id, "name": w.name, "description": w.description, "organization_id": w.organization_id,
            "workflow_count": count, "created_at": _iso(w.created_at)}


def _workflow_view(w: Workflow) -> dict:
    return {"id": w.id, "workspace_id": w.workspace_id, "workspace_name": w.workspace.name if w.workspace else None,
            "name": w.name, "description": w.description, "trigger_event": w.trigger_event,
            "steps": w.steps or [], "step_count": len(w.steps or []), "is_active": w.is_active,
            "last_run_at": _iso(w.last_run_at), "last_run_status": w.last_run_status,
            "created_at": _iso(w.created_at)}


def _execution_view(e: WorkflowExecution, detail: bool = False) -> dict:
    out = {"id": e.id, "workflow_id": e.workflow_id, "workflow_name": e.workflow_name,
           "trigger_event": e.trigger_event, "triggered_by": e.triggered_by, "status": e.status,
           "step_count": len(e.steps_snapshot or []), "error": e.error,
           "created_at": _iso(e.created_at), "started_at": _iso(e.started_at), "finished_at": _iso(e.finished_at)}
    if detail:
        out.update(step_results=e.step_results or [], steps=e.steps_snapshot or [],
                   trigger_payload=e.trigger_payload, resume_at=_iso(e.resume_at))
    return out


def _get_workflow(db: Session, workflow_id: int) -> Workflow:
    w = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if w is None:
        raise NotFoundException("Workflow", workflow_id)
    return w


def _check_trigger(trigger: str) -> str:
    if trigger not in EVENT_CATALOG:
        raise BadRequestException(f"Unknown trigger event '{trigger}'.")
    return trigger


@workflow_router.get("/meta")
def workflow_meta():
    return {"triggers": [{"key": k, "description": v} for k, v in EVENT_CATALOG.items()],
            "step_types": [{"key": k, "label": v["label"], "fields": v["fields"]}
                           for k, v in engine.STEP_TYPES.items()]}


@workflow_router.get("/workspaces")
def list_workspaces(db: Session = Depends(get_db)):
    out = []
    for w in db.query(WorkflowWorkspace).order_by(WorkflowWorkspace.id.desc()).all():
        out.append(_workspace_view(w, db.query(Workflow).filter(Workflow.workspace_id == w.id).count()))
    return {"workspaces": out}


@workflow_router.post("/workspaces", status_code=201)
def create_workspace(body: WorkspaceIn, db: Session = Depends(get_db), user=Depends(get_current_super_admin)):
    name = body.name.strip()
    if not name:
        raise BadRequestException("Workspace name is required.")
    if db.query(WorkflowWorkspace).filter(WorkflowWorkspace.name == name).first():
        raise BadRequestException("A workspace with this name already exists.")
    w = WorkflowWorkspace(name=name, description=body.description, organization_id=body.organization_id,
                          created_by=user.id)
    db.add(w)
    db.flush()
    _audit(db, user, AuditAction.CREATE, "WorkflowWorkspace", w.id, {"event": "workflow.workspace_created", "name": name})
    db.commit()
    return _workspace_view(w)


@workflow_router.delete("/workspaces/{workspace_id}")
def delete_workspace(workspace_id: int, db: Session = Depends(get_db), user=Depends(get_current_super_admin)):
    w = db.query(WorkflowWorkspace).filter(WorkflowWorkspace.id == workspace_id).first()
    if w is None:
        raise NotFoundException("Workspace", workspace_id)
    if db.query(Workflow).filter(Workflow.workspace_id == w.id).count():
        raise BadRequestException("Delete or move this workspace's workflows first.")
    _audit(db, user, AuditAction.DELETE, "WorkflowWorkspace", w.id, {"event": "workflow.workspace_deleted", "name": w.name})
    db.delete(w)
    db.commit()
    return {"message": "Workspace deleted."}


@workflow_router.get("/workflows")
def list_workflows(workspace_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(Workflow)
    if workspace_id:
        q = q.filter(Workflow.workspace_id == workspace_id)
    return {"workflows": [_workflow_view(w) for w in q.order_by(Workflow.id.desc()).all()]}


@workflow_router.post("/workflows", status_code=201)
def create_workflow(body: WorkflowIn, db: Session = Depends(get_db), user=Depends(get_current_super_admin)):
    if db.query(WorkflowWorkspace).filter(WorkflowWorkspace.id == body.workspace_id).first() is None:
        raise NotFoundException("Workspace", body.workspace_id)
    w = Workflow(workspace_id=body.workspace_id, name=body.name.strip(), description=body.description,
                 trigger_event=_check_trigger(body.trigger_event), steps=engine.validate_steps(body.steps),
                 is_active=False, created_by=user.id)
    db.add(w)
    db.flush()
    _audit(db, user, AuditAction.CREATE, "Workflow", w.id,
           {"event": "workflow.created", "name": w.name, "trigger": w.trigger_event})
    db.commit()
    return _workflow_view(w)


@workflow_router.get("/workflows/{workflow_id}")
def get_workflow(workflow_id: int, db: Session = Depends(get_db)):
    return _workflow_view(_get_workflow(db, workflow_id))


@workflow_router.patch("/workflows/{workflow_id}")
def update_workflow(workflow_id: int, body: WorkflowPatch, db: Session = Depends(get_db),
                    user=Depends(get_current_super_admin)):
    w = _get_workflow(db, workflow_id)
    changed = []
    if body.name is not None:
        w.name = body.name.strip()
        changed.append("name")
    if body.description is not None:
        w.description = body.description
        changed.append("description")
    if body.trigger_event is not None:
        w.trigger_event = _check_trigger(body.trigger_event)
        changed.append("trigger_event")
    if body.steps is not None:
        w.steps = engine.validate_steps(body.steps)
        changed.append("steps")
    _audit(db, user, AuditAction.UPDATE, "Workflow", w.id, {"event": "workflow.updated", "fields": changed})
    db.commit()
    return _workflow_view(w)


@workflow_router.delete("/workflows/{workflow_id}")
def delete_workflow(workflow_id: int, db: Session = Depends(get_db), user=Depends(get_current_super_admin)):
    w = _get_workflow(db, workflow_id)
    # Execution history is kept (workflow_id becomes NULL, name is snapshotted).
    db.query(WorkflowExecution).filter(WorkflowExecution.workflow_id == w.id).update({"workflow_id": None})
    _audit(db, user, AuditAction.DELETE, "Workflow", w.id, {"event": "workflow.deleted", "name": w.name})
    db.delete(w)
    db.commit()
    return {"message": "Workflow deleted. Its execution history was kept."}


@workflow_router.post("/workflows/{workflow_id}/activate")
def activate_workflow(workflow_id: int, db: Session = Depends(get_db), user=Depends(get_current_super_admin)):
    w = _get_workflow(db, workflow_id)
    w.is_active = True
    _audit(db, user, AuditAction.ENABLE, "Workflow", w.id, {"event": "workflow.activated"})
    db.commit()
    return _workflow_view(w)


@workflow_router.post("/workflows/{workflow_id}/deactivate")
def deactivate_workflow(workflow_id: int, db: Session = Depends(get_db), user=Depends(get_current_super_admin)):
    w = _get_workflow(db, workflow_id)
    w.is_active = False
    _audit(db, user, AuditAction.DISABLE, "Workflow", w.id, {"event": "workflow.deactivated"})
    db.commit()
    return _workflow_view(w)


@workflow_router.post("/workflows/{workflow_id}/run", status_code=202)
@limiter.limit("20/minute")
def run_workflow(request: Request, workflow_id: int, db: Session = Depends(get_db),
                 user=Depends(get_current_super_admin)):
    """Manual test run. Executes immediately so the result is visible right away."""
    w = _get_workflow(db, workflow_id)
    ex = WorkflowExecution(
        workflow_id=w.id, workflow_name=w.name, trigger_event=w.trigger_event,
        trigger_payload={"id": None, "type": w.trigger_event, "manual": True, "organization_id": None,
                         "data": {"note": "Manual run"}},
        triggered_by="manual", steps_snapshot=w.steps or [], status="pending",
    )
    db.add(ex)
    db.flush()
    _audit(db, user, AuditAction.UPDATE, "Workflow", w.id, {"event": "workflow.run_now", "execution_id": ex.id})
    db.commit()
    engine.run_execution(db, ex)
    return _execution_view(ex, detail=True)


@workflow_router.get("/executions")
def list_executions(
    workflow_id: Optional[int] = None, status: Optional[str] = None,
    date_from: Optional[datetime] = None, date_to: Optional[datetime] = None,
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), db: Session = Depends(get_db),
):
    q = db.query(WorkflowExecution)
    if workflow_id:
        q = q.filter(WorkflowExecution.workflow_id == workflow_id)
    if status:
        q = q.filter(WorkflowExecution.status == status)
    if date_from:
        q = q.filter(WorkflowExecution.created_at >= date_from.replace(tzinfo=None))
    if date_to:
        q = q.filter(WorkflowExecution.created_at <= date_to.replace(tzinfo=None))
    total = q.count()
    rows = q.order_by(WorkflowExecution.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"total": total, "page": page, "page_size": page_size, "executions": [_execution_view(e) for e in rows]}


@workflow_router.get("/executions/{execution_id}")
def get_execution(execution_id: int, db: Session = Depends(get_db)):
    e = db.query(WorkflowExecution).filter(WorkflowExecution.id == execution_id).first()
    if e is None:
        raise NotFoundException("Execution", execution_id)
    return _execution_view(e, detail=True)
