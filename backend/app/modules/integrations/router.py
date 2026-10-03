"""Super-admin APIs for Zoiko Connect, Hub and Workflow (ZHR-24/25/26).

Every route is super-admin-only; every mutating action writes an AuditLog row.
Existing AuditAction values are reused, with the specific event in `details`."""

from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import case, func
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
def list_events(db: Session = Depends(get_db)):
    """Catalog plus the real delivery history for each event: how many
    subscriptions exist, how many deliveries have been attempted, and when the
    last one landed. An event nobody has ever emitted says so."""
    rows = (
        db.query(
            WebhookDelivery.event_type,
            func.count(WebhookDelivery.id),
            func.max(WebhookDelivery.created_at),
        )
        .group_by(WebhookDelivery.event_type)
        .all()
    )
    stats = {r[0]: {"deliveries": r[1], "last_delivery_at": _iso(r[2])} for r in rows}
    subs = {k: 0 for k in EVENT_CATALOG}
    for w in db.query(Webhook).all():
        for ev in (w.events or []):
            if ev in subs:
                subs[ev] += 1
    return {
        "events": [
            {
                "key": k, "description": v,
                "subscribed_webhooks": subs.get(k, 0),
                "deliveries": stats.get(k, {}).get("deliveries", 0),
                "last_delivery_at": stats.get(k, {}).get("last_delivery_at"),
            }
            for k, v in EVENT_CATALOG.items()
        ]
    }


@hub_router.get("/applications")
def list_applications(db: Session = Depends(get_db)):
    """Integrated applications, every field derived from live config + real
    evidence rows. No status is asserted from a literal."""
    from app.modules.integrations import hub_apps
    from app.modules.super_admin.router import compute_identity_providers

    paths = hub_apps.registered_auth_paths()
    apps = [hub_apps.smtp_app(db)]
    for key in ("slack", "twilio"):
        apps.append(hub_apps.channel_app(db, key, channels.CHANNEL_NAMES[key], "/shared/connect"))
    for p in compute_identity_providers(paths=paths):
        if p["key"] != "email":
            apps.append({
                "key": p["key"], "name": p["name"], "status": p["status"], "href": "/shared/id",
                "details": {"login_routes": p.get("login_routes", [])},
                "metrics": {}, "last_activity_at": None, "last_activity": None,
                "last_checked_at": None, "last_error": None,
            })
    apps.append(hub_apps.stripe_app(db))

    total = db.query(Webhook).count()
    active = db.query(Webhook).filter(Webhook.is_active.is_(True)).count()
    delivered = db.query(WebhookDelivery).filter(WebhookDelivery.status == "success").count()
    attempted = db.query(WebhookDelivery).count()
    last_delivery = db.query(WebhookDelivery).order_by(WebhookDelivery.id.desc()).first()
    apps.append({
        "key": "webhooks", "name": "Outbound Webhooks",
        "status": f"{active} active" if active else "Not connected",
        "href": None,
        "details": {"registered": total, "auto_disabled": db.query(Webhook).filter(Webhook.auto_disabled.is_(True)).count()},
        "metrics": {"deliveries_attempted": attempted, "deliveries_succeeded": delivered},
        "last_activity_at": _iso(last_delivery.created_at if last_delivery else None),
        "last_activity": None,
        "last_checked_at": None,
        "last_error": None,
    })
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
    organization_id: Optional[int] = Field(default=None, description="Omit for a platform-wide workspace")


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


def _org_names(db: Session, ids) -> dict:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    from app.modules.hr.models import Organization

    return {o.id: (o.organization_name or o.display_name or o.name) for o in db.query(Organization).filter(Organization.id.in_(ids)).all()}


def _all_orgs(db: Session) -> tuple:
    """Every live organization as {id: display name} plus {id: {code, status}}."""
    from app.modules.hr.models import Organization

    rows = db.query(Organization.id, Organization.organization_name, Organization.display_name,
                    Organization.organization_code, Organization.status).all()
    names = {oid: (nm or dn or "") for oid, nm, dn, _c, _s in rows}
    meta = {oid: {"organization_code": code, "organization_status": str(getattr(st, "value", st) or "")}
            for oid, _n, _d, code, st in rows}
    return names, meta


def _scope_label(org_id, names) -> str:
    return "Platform-wide" if not org_id else (names.get(org_id) or f"Organization {org_id}")


def _workspace_view(w: WorkflowWorkspace, count: int = 0, names=None) -> dict:
    names = names or {}
    return {"id": w.id, "name": w.name, "description": w.description, "organization_id": w.organization_id,
            "organization_name": _scope_label(w.organization_id, names), "workflow_count": count,
            "created_at": _iso(w.created_at)}


def _run_stats(db: Session, workflow_ids) -> dict:
    """workflow_id -> {runs, succeeded, failed} from the real execution history."""
    if not workflow_ids:
        return {}
    rows = (
        db.query(WorkflowExecution.workflow_id, WorkflowExecution.status, func.count(WorkflowExecution.id))
        .filter(WorkflowExecution.workflow_id.in_(set(workflow_ids)))
        .group_by(WorkflowExecution.workflow_id, WorkflowExecution.status).all()
    )
    out: dict = {}
    for wid, status, n in rows:
        s = out.setdefault(wid, {"runs": 0, "succeeded": 0, "failed": 0})
        s["runs"] += n
        if status == "succeeded":
            s["succeeded"] += n
        elif status == "failed":
            s["failed"] += n
    return out


def _wf_org_id(w: Workflow):
    """The workflow's organization via its workspace; None if it has no
    workspace row (orphaned) or the workspace is platform-wide."""
    return w.workspace.organization_id if w.workspace is not None else None


def _wf_names(db: Session, rows) -> dict:
    return _org_names(db, [_wf_org_id(w) for w in rows])


def _workflow_view(w: Workflow, names=None, stats=None) -> dict:
    names = names or {}
    org_id = _wf_org_id(w)
    s = (stats or {}).get(w.id) or {"runs": 0, "succeeded": 0, "failed": 0}
    return {"id": w.id, "workspace_id": w.workspace_id, "workspace_name": w.workspace.name if w.workspace else None,
            "organization_id": org_id, "organization_name": _scope_label(org_id, names),
            "name": w.name, "description": w.description, "trigger_event": w.trigger_event,
            "steps": w.steps or [], "step_count": len(w.steps or []), "is_active": w.is_active,
            "last_run_at": _iso(w.last_run_at), "last_run_status": w.last_run_status,
            "runs": s["runs"], "succeeded": s["succeeded"], "failed": s["failed"],
            "success_rate": round(100 * s["succeeded"] / s["runs"]) if s["runs"] else None,
            "created_at": _iso(w.created_at)}


def _execution_view(e: WorkflowExecution, detail: bool = False, names=None) -> dict:
    names = names or {}
    out = {"id": e.id, "workflow_id": e.workflow_id, "workflow_name": e.workflow_name,
           "organization_id": e.organization_id, "organization_name": _scope_label(e.organization_id, names),
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


def _org_filter(query, column, organization_id):
    """organization_id: None = all, 0 = platform-wide only, N = that organization."""
    if organization_id is None:
        return query
    return query.filter(column.is_(None)) if organization_id == 0 else query.filter(column == organization_id)


@workflow_router.get("/meta")
def workflow_meta():
    return {"triggers": [{"key": k, "description": v} for k, v in EVENT_CATALOG.items()],
            "step_types": [{"key": k, "label": v["label"], "fields": v["fields"]}
                           for k, v in engine.STEP_TYPES.items()]}


@workflow_router.get("/workspaces")
def list_workspaces(organization_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = _org_filter(db.query(WorkflowWorkspace), WorkflowWorkspace.organization_id, organization_id)
    rows = q.order_by(WorkflowWorkspace.id.desc()).all()
    counts = dict(db.query(Workflow.workspace_id, func.count(Workflow.id)).group_by(Workflow.workspace_id).all())
    names = _org_names(db, [w.organization_id for w in rows])
    return {"workspaces": [_workspace_view(w, counts.get(w.id, 0), names) for w in rows]}


@workflow_router.post("/workspaces", status_code=201)
def create_workspace(body: WorkspaceIn, db: Session = Depends(get_db), user=Depends(get_current_super_admin)):
    name = body.name.strip()
    if not name:
        raise BadRequestException("Workspace name is required.")
    if db.query(WorkflowWorkspace).filter(WorkflowWorkspace.name == name).first():
        raise BadRequestException("A workspace with this name already exists.")
    names = {}
    if body.organization_id:
        names = _org_names(db, [body.organization_id])
        if body.organization_id not in names:
            raise BadRequestException("The selected organization does not exist.")
    w = WorkflowWorkspace(name=name, description=body.description, organization_id=body.organization_id or None,
                          created_by=user.id)
    db.add(w)
    db.flush()
    _audit(db, user, AuditAction.CREATE, "WorkflowWorkspace", w.id,
           {"event": "workflow.workspace_created", "name": name, "organization_id": w.organization_id})
    db.commit()
    return _workspace_view(w, 0, names)


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


@workflow_router.get("/overview")
def workflow_overview(db: Session = Depends(get_db)):
    """One row per organization (plus Platform-wide) so every organization's
    automation is visible at a glance: workspaces, workflows, how many are on,
    and how its last 7 days of runs went.

    Every live organization gets a row, including the ones with no automation
    yet (all zeros). Building the rows only from workspaces/workflows/runs would
    hide exactly the organizations that need attention.
    """
    since = datetime.utcnow() - timedelta(days=7)
    buckets: dict = {}

    def bucket(org_id):
        return buckets.setdefault(org_id or 0, {
            "organization_id": org_id or None, "workspaces": 0, "workflows": 0, "active_workflows": 0,
            "runs_7d": 0, "succeeded_7d": 0, "failed_7d": 0, "last_run_at": None, "last_run_status": None})

    # Seed one bucket per live organization (soft-deleted ones are already
    # filtered out by the global Organization criteria in app/database.py).
    names, meta = _all_orgs(db)
    for oid in names:
        bucket(oid)

    for org_id, n in (
        db.query(WorkflowWorkspace.organization_id, func.count(WorkflowWorkspace.id))
        .group_by(WorkflowWorkspace.organization_id).all()
    ):
        bucket(org_id)["workspaces"] += n

    # Workflows counted in SQL, grouped by their workspace's organization. A
    # workflow whose workspace row is missing still counts (as platform-wide)
    # so a broken link cannot make automation disappear from the totals.
    for org_id, n, active in (
        db.query(WorkflowWorkspace.organization_id,
                 func.count(Workflow.id),
                 func.coalesce(func.sum(case((Workflow.is_active.is_(True), 1), else_=0)), 0))
        .select_from(Workflow)
        .join(WorkflowWorkspace, WorkflowWorkspace.id == Workflow.workspace_id, isouter=True)
        .group_by(WorkflowWorkspace.organization_id).all()
    ):
        b = bucket(org_id)
        b["workflows"] += n
        b["active_workflows"] += active

    # Last 7 days of runs, per organization, aggregated in SQL.
    for org_id, status, n in (
        db.query(WorkflowExecution.organization_id, WorkflowExecution.status, func.count(WorkflowExecution.id))
        .filter(WorkflowExecution.created_at >= since)
        .group_by(WorkflowExecution.organization_id, WorkflowExecution.status).all()
    ):
        b = bucket(org_id)
        b["runs_7d"] += n
        b["succeeded_7d"] += n if status == "succeeded" else 0
        b["failed_7d"] += n if status == "failed" else 0

    # Most recent run per organization. One row per organization via row_number
    # instead of loading every execution into memory.
    _rn = func.row_number().over(
        partition_by=WorkflowExecution.organization_id,
        order_by=(WorkflowExecution.created_at.desc(), WorkflowExecution.id.desc())).label("rn")
    latest = db.query(
        _rn.label("rn"), WorkflowExecution.organization_id,
        WorkflowExecution.created_at.label("created_at"), WorkflowExecution.status.label("status")).subquery()
    for row in db.query(latest).filter(latest.c.rn == 1).all():
        b = bucket(row.organization_id)
        b["last_run_at"], b["last_run_status"] = _iso(row.created_at), row.status

    # A workspace/execution can point at an organization that was deleted since;
    # keep those rows (labelled by id) so no automation silently disappears.
    names.update(_org_names(db, [k for k in buckets if k and k not in names]))

    rows = []
    for key, b in buckets.items():
        rows.append({**b, "organization_name": _scope_label(key or None, names), **meta.get(key, {})})
    rows.sort(key=lambda r: (r["organization_id"] is None, (r["organization_name"] or "").lower()))
    totals = {k: sum(r[k] for r in rows) for k in ("workspaces", "workflows", "active_workflows", "runs_7d", "failed_7d")}
    return {"organizations": rows, "totals": totals}


@workflow_router.get("/workflows")
def list_workflows(workspace_id: Optional[int] = None, organization_id: Optional[int] = None,
                   db: Session = Depends(get_db)):
    # outerjoin, not join: a workflow whose workspace row went missing must still
    # be listed (as platform-wide) instead of silently disappearing from the page.
    q = db.query(Workflow).outerjoin(WorkflowWorkspace, WorkflowWorkspace.id == Workflow.workspace_id)
    if workspace_id:
        q = q.filter(Workflow.workspace_id == workspace_id)
    q = _org_filter(q, WorkflowWorkspace.organization_id, organization_id)
    rows = q.order_by(Workflow.id.desc()).all()
    names = _wf_names(db, rows)
    stats = _run_stats(db, [w.id for w in rows])
    return {"workflows": [_workflow_view(w, names, stats) for w in rows]}


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
    return _workflow_view(w, _wf_names(db, [w]))


@workflow_router.get("/workflows/{workflow_id}")
def get_workflow(workflow_id: int, db: Session = Depends(get_db)):
    w = _get_workflow(db, workflow_id)
    return _workflow_view(w, _wf_names(db, [w]), _run_stats(db, [w.id]))


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
    return _workflow_view(w, _wf_names(db, [w]), _run_stats(db, [w.id]))


@workflow_router.delete("/workflows/{workflow_id}")
def delete_workflow(workflow_id: int, db: Session = Depends(get_db), user=Depends(get_current_super_admin)):
    w = _get_workflow(db, workflow_id)
    # Execution history is kept (workflow_id becomes NULL, name is snapshotted).
    db.query(WorkflowExecution).filter(WorkflowExecution.workflow_id == w.id).update({"workflow_id": None})
    _audit(db, user, AuditAction.DELETE, "Workflow", w.id, {"event": "workflow.deleted", "name": w.name})
    db.delete(w)
    db.commit()
    return {"message": "Workflow deleted. Its execution history was kept."}


def _set_active(db: Session, workflow_id: int, user, active: bool) -> dict:
    w = _get_workflow(db, workflow_id)
    w.is_active = active
    _audit(db, user, AuditAction.ENABLE if active else AuditAction.DISABLE, "Workflow", w.id,
           {"event": "workflow.activated" if active else "workflow.deactivated"})
    db.commit()
    return _workflow_view(w, _wf_names(db, [w]), _run_stats(db, [w.id]))


@workflow_router.post("/workflows/{workflow_id}/activate")
def activate_workflow(workflow_id: int, db: Session = Depends(get_db), user=Depends(get_current_super_admin)):
    return _set_active(db, workflow_id, user, True)


@workflow_router.post("/workflows/{workflow_id}/deactivate")
def deactivate_workflow(workflow_id: int, db: Session = Depends(get_db), user=Depends(get_current_super_admin)):
    return _set_active(db, workflow_id, user, False)


@workflow_router.post("/workflows/{workflow_id}/run", status_code=202)
@limiter.limit("20/minute")
def run_workflow(request: Request, workflow_id: int, db: Session = Depends(get_db),
                 user=Depends(get_current_super_admin)):
    """Manual test run. Executes immediately so the result is visible right away."""
    w = _get_workflow(db, workflow_id)
    scope = _wf_org_id(w)
    ex = WorkflowExecution(
        workflow_id=w.id, workflow_name=w.name, trigger_event=w.trigger_event, organization_id=scope,
        trigger_payload={"id": None, "type": w.trigger_event, "manual": True, "organization_id": scope,
                         "data": {"note": "Manual run"}},
        triggered_by="manual", steps_snapshot=w.steps or [], status="pending",
    )
    db.add(ex)
    db.flush()
    _audit(db, user, AuditAction.UPDATE, "Workflow", w.id, {"event": "workflow.run_now", "execution_id": ex.id})
    db.commit()
    engine.run_execution(db, ex)
    return _execution_view(ex, detail=True, names=_org_names(db, [ex.organization_id]))


@workflow_router.get("/executions")
def list_executions(
    workflow_id: Optional[int] = None, status: Optional[str] = None, organization_id: Optional[int] = None,
    date_from: Optional[datetime] = None, date_to: Optional[datetime] = None,
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), db: Session = Depends(get_db),
):
    q = _org_filter(db.query(WorkflowExecution), WorkflowExecution.organization_id, organization_id)
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
    names = _org_names(db, [e.organization_id for e in rows])
    return {"total": total, "page": page, "page_size": page_size,
            "executions": [_execution_view(e, names=names) for e in rows]}


@workflow_router.get("/executions/{execution_id}")
def get_execution(execution_id: int, db: Session = Depends(get_db)):
    e = db.query(WorkflowExecution).filter(WorkflowExecution.id == execution_id).first()
    if e is None:
        raise NotFoundException("Execution", execution_id)
    return _execution_view(e, detail=True, names=_org_names(db, [e.organization_id]))
