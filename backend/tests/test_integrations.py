"""ZHR-24/25/26: Zoiko Connect channels, Hub webhooks and Workflow engine."""

import json
from datetime import datetime, timedelta

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.dependencies import get_current_super_admin
from app.core.exceptions import ZoikoException, zoiko_exception_handler
from app.core.rate_limiter import limiter
from app.database import Base, get_db
from app.modules.employee.models import (
    Employee, EmployeeStatus, EmploymentType, UserRole,
)
from app.modules.integrations import channels, delivery, engine
from app.modules.integrations.events import emit_event
from app.modules.integrations.models import (
    ConnectChannel, Webhook, WebhookDelivery, Workflow, WorkflowExecution,
)
from app.modules.integrations.router import connect_router, hub_router, workflow_router
from app.modules.integrations.ssrf import UnsafeURL, validate_webhook_url
from app.modules.super_admin.models import AuditLog

SLACK_URL = "https://hooks.slack.com/services/T000/B000/XXXXXXXX"
SID = "AC" + "a" * 32
TOKEN = "t" * 32


def _public_resolver(host, port, type=None):
    return [(2, 1, 6, "", ("93.184.216.34", port))]


@pytest.fixture(autouse=True)
def _no_rate_limit(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "DEBUG", False)  # production URL rules (https only)
    limiter.enabled = False
    yield
    limiter.enabled = True


@pytest.fixture
def world(monkeypatch):
    monkeypatch.setattr("app.modules.integrations.ssrf.socket.getaddrinfo", _public_resolver)
    eng = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(eng)
    db = sessionmaker(bind=eng)()
    sa = Employee(
        email="root@z.test", hashed_password="x", employee_code="C-1", role=UserRole.SUPER_ADMIN,
        first_name="Root", last_name="Admin", job_title="t", employment_type=EmploymentType.FULL_TIME,
        status=EmployeeStatus.ACTIVE, date_of_joining=datetime.utcnow().date(),
    )
    db.add(sa)
    db.commit()
    app = FastAPI()
    for r in (connect_router, hub_router, workflow_router):
        app.include_router(r)
    app.add_exception_handler(ZoikoException, zoiko_exception_handler)
    app.dependency_overrides[get_db] = lambda: db
    box = {"user": sa}

    def _admin():
        u = box["user"]
        if u.role != UserRole.SUPER_ADMIN:
            from app.core.exceptions import ForbiddenException
            raise ForbiddenException("Super admin only")
        return u

    app.dependency_overrides[get_current_super_admin] = _admin
    return {"db": db, "client": TestClient(app), "box": box, "sa": sa}


def _mock(handler):
    return httpx.MockTransport(handler)


# ───────────────────────── Zoiko Connect ─────────────────────────

def test_channels_not_configured_by_default(world):
    items = {c["key"]: c for c in world["client"].get("/super-admin/connect/channels").json()["channels"]}
    assert items["slack"]["status"] == "Not configured"
    assert items["twilio"]["status"] == "Not configured"
    assert items["smtp"]["editable"] is False


def test_save_slack_masks_secret_and_status_untested(world):
    r = world["client"].put("/super-admin/connect/channels/slack", json={"webhook_url": SLACK_URL})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "Configured (untested)"
    assert body["details"]["webhook_url"] == "••••XXXX"
    assert SLACK_URL not in json.dumps(world["client"].get("/super-admin/connect/channels").json())
    row = world["db"].query(ConnectChannel).one()
    assert SLACK_URL not in row.config_encrypted  # encrypted at rest


@pytest.mark.parametrize("payload", [
    {"webhook_url": "https://example.com/hook"},
    {"webhook_url": "http://hooks.slack.com/services/T/B/X"},
])
def test_slack_url_validation(world, payload):
    assert world["client"].put("/super-admin/connect/channels/slack", json=payload).status_code == 400


@pytest.mark.parametrize("payload", [
    {"account_sid": "bad", "auth_token": TOKEN, "from_number": "+14155552671"},
    {"account_sid": SID, "auth_token": TOKEN, "from_number": "4155552671"},
    {"account_sid": SID, "auth_token": TOKEN},
    {"account_sid": SID, "auth_token": TOKEN, "messaging_service_sid": "MGbad"},
])
def test_twilio_validation(world, payload):
    assert world["client"].put("/super-admin/connect/channels/twilio", json=payload).status_code == 400


def test_blank_secret_keeps_existing(world):
    c = world["client"]
    c.put("/super-admin/connect/channels/twilio",
          json={"account_sid": SID, "auth_token": TOKEN, "from_number": "+14155552671"})
    r = c.put("/super-admin/connect/channels/twilio", json={"from_number": "+14155552999", "auth_token": ""})
    assert r.status_code == 200
    cfg = channels.get_config(world["db"], "twilio")
    assert cfg["auth_token"] == TOKEN and cfg["from_number"] == "+14155552999"


def test_slack_test_success_sets_connected(world, monkeypatch):
    world["client"].put("/super-admin/connect/channels/slack", json={"webhook_url": SLACK_URL})
    seen = {}

    def handler(request):
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, text="ok")

    monkeypatch.setattr(channels, "HTTP_TIMEOUT", 5.0)
    orig = channels.send_slack
    monkeypatch.setattr(channels, "send_slack", lambda cfg, text, transport=None: orig(cfg, text, _mock(handler)))
    r = world["client"].post("/super-admin/connect/channels/slack/test", json={})
    assert r.status_code == 200 and r.json()["success"] is True
    assert "text" in seen["body"]
    status = {c["key"]: c for c in world["client"].get("/super-admin/connect/channels").json()["channels"]}
    assert status["slack"]["status"] == "Connected"
    assert status["slack"]["last_tested_at"].endswith("Z")


def test_slack_test_failure_shows_provider_error(world, monkeypatch):
    world["client"].put("/super-admin/connect/channels/slack", json={"webhook_url": SLACK_URL})
    orig = channels.send_slack
    monkeypatch.setattr(channels, "send_slack",
                        lambda cfg, text, transport=None: orig(cfg, text, _mock(lambda r: httpx.Response(404, text="no_service"))))
    r = world["client"].post("/super-admin/connect/channels/slack/test", json={})
    assert r.status_code == 400
    assert "disabled or was revoked" in r.json()["message"]
    slack = {c["key"]: c for c in world["client"].get("/super-admin/connect/channels").json()["channels"]}["slack"]
    assert slack["status"] == "Error" and "revoked" in slack["last_error"]


def test_twilio_test_sms_success_and_auth_error(world, monkeypatch):
    c = world["client"]
    c.put("/super-admin/connect/channels/twilio",
          json={"account_sid": SID, "auth_token": TOKEN, "from_number": "+14155552671"})
    orig = channels.send_sms
    calls = {}

    def ok(request):
        calls["auth"] = request.headers["authorization"]
        calls["body"] = request.content.decode()
        return httpx.Response(201, json={"sid": "SM1"})

    monkeypatch.setattr(channels, "send_sms", lambda cfg, to, text, transport=None: orig(cfg, to, text, _mock(ok)))
    r = c.post("/super-admin/connect/channels/twilio/test", json={"to": "+14155550100"})
    assert r.status_code == 200 and "+14155550100" in r.json()["message"]
    assert "To=%2B14155550100" in calls["body"]

    monkeypatch.setattr(channels, "send_sms", lambda cfg, to, text, transport=None: orig(
        cfg, to, text, _mock(lambda r: httpx.Response(401, json={"message": "Authenticate", "code": 20003}))))
    r = c.post("/super-admin/connect/channels/twilio/test", json={"to": "+14155550100"})
    assert r.status_code == 400 and "Invalid Twilio Account SID or Auth Token" in r.json()["message"]


def test_twilio_provider_5xx_maps_to_502_and_bad_number_is_400(world, monkeypatch):
    c = world["client"]
    c.put("/super-admin/connect/channels/twilio",
          json={"account_sid": SID, "auth_token": TOKEN, "from_number": "+14155552671"})
    orig = channels.send_sms
    monkeypatch.setattr(channels, "send_sms", lambda cfg, to, text, transport=None: orig(
        cfg, to, text, _mock(lambda r: httpx.Response(503, text="down"))))
    assert c.post("/super-admin/connect/channels/twilio/test", json={"to": "+14155550100"}).status_code == 502
    assert c.post("/super-admin/connect/channels/twilio/test", json={"to": "12345"}).status_code == 400


def test_test_requires_configuration_and_disconnect(world):
    c = world["client"]
    assert c.post("/super-admin/connect/channels/slack/test", json={}).status_code == 400
    c.put("/super-admin/connect/channels/slack", json={"webhook_url": SLACK_URL})
    assert c.delete("/super-admin/connect/channels/slack").status_code == 200
    assert world["db"].query(ConnectChannel).count() == 0
    assert c.delete("/super-admin/connect/channels/slack").status_code == 404


def test_connect_actions_audited_without_secrets(world):
    world["client"].put("/super-admin/connect/channels/slack", json={"webhook_url": SLACK_URL})
    logs = world["db"].query(AuditLog).all()
    assert logs and SLACK_URL not in json.dumps([l.details for l in logs])


def test_non_super_admin_forbidden(world):
    world["box"]["user"] = Employee(id=99, email="e@x.test", role=UserRole.EMPLOYEE)
    c = world["client"]
    assert c.get("/super-admin/connect/channels").status_code == 403
    assert c.get("/super-admin/hub/webhooks").status_code == 403
    assert c.get("/super-admin/workflow/workspaces").status_code == 403


# ───────────────────────── SSRF ─────────────────────────

@pytest.mark.parametrize("url", [
    "http://example.com/hook",
    "https://localhost/hook",
    "https://127.0.0.1/hook",
    "https://10.0.0.5/hook",
    "https://192.168.1.10/hook",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/hook",
    "https://user:pw@example.com/hook",
    "ftp://example.com/hook",
])
def test_ssrf_rejects_unsafe_urls(url):
    with pytest.raises(UnsafeURL):
        validate_webhook_url(url, resolver=_public_resolver)


def test_ssrf_rejects_host_resolving_to_private_ip():
    private = lambda host, port, type=None: [(2, 1, 6, "", ("10.1.2.3", port))]
    with pytest.raises(UnsafeURL):
        validate_webhook_url("https://evil.example.com/x", resolver=private)


def test_ssrf_accepts_public_https():
    assert validate_webhook_url("https://example.com/hook", resolver=_public_resolver)


# ───────────────────────── Zoiko Hub ─────────────────────────

def _create_hook(c, **kw):
    body = {"name": "CRM", "url": "https://example.com/hook", "events": ["user.created"], **kw}
    return c.post("/super-admin/hub/webhooks", json=body)


def test_create_webhook_returns_secret_once(world):
    c = world["client"]
    r = _create_hook(c)
    assert r.status_code == 201
    secret = r.json()["signing_secret"]
    assert secret.startswith("whsec_")
    listed = c.get("/super-admin/hub/webhooks").json()["webhooks"][0]
    assert "signing_secret" not in listed and listed["secret"] == "••••" + secret[-4:]
    row = world["db"].query(Webhook).one()
    assert secret not in row.secret_encrypted


def test_create_webhook_validation(world):
    c = world["client"]
    assert _create_hook(c, url="https://10.0.0.1/x").status_code == 400
    assert _create_hook(c, url="http://example.com/x").status_code == 400
    assert _create_hook(c, events=["nope.event"]).status_code == 400
    assert _create_hook(c, events=[]).status_code == 422


def test_webhook_crud_enable_disable_rotate(world):
    c = world["client"]
    wid = _create_hook(c).json()["id"]
    assert c.patch(f"/super-admin/hub/webhooks/{wid}", json={"name": "New"}).json()["name"] == "New"
    assert c.patch(f"/super-admin/hub/webhooks/{wid}", json={"url": "https://127.0.0.1/x"}).status_code == 400
    assert c.post(f"/super-admin/hub/webhooks/{wid}/disable").json()["is_active"] is False
    assert c.post(f"/super-admin/hub/webhooks/{wid}/enable").json()["is_active"] is True
    old = world["db"].query(Webhook).one().secret_encrypted
    new = c.post(f"/super-admin/hub/webhooks/{wid}/rotate-secret").json()
    assert new["signing_secret"].startswith("whsec_")
    world["db"].expire_all()
    assert world["db"].query(Webhook).one().secret_encrypted != old
    assert c.delete(f"/super-admin/hub/webhooks/{wid}").status_code == 200
    assert c.get(f"/super-admin/hub/webhooks/{wid}").status_code == 404
    events = [l.details.get("event") for l in world["db"].query(AuditLog).all()]
    assert {"hub.webhook_created", "hub.secret_rotated", "hub.webhook_deleted"} <= set(events)


def test_signature_is_verifiable():
    sig = delivery.sign("secret", "1700000000", '{"a":1}')
    import hashlib, hmac
    expected = hmac.new(b"secret", b'1700000000.{"a":1}', hashlib.sha256).hexdigest()
    assert sig == "v1=" + expected


def test_test_event_is_signed_and_logged(world, monkeypatch):
    c = world["client"]
    created = _create_hook(c).json()
    secret = created["signing_secret"]
    captured = {}

    def handler(request):
        captured["headers"] = request.headers
        captured["body"] = request.content.decode()
        return httpx.Response(200, text="received")

    orig = delivery.attempt_delivery
    monkeypatch.setattr(delivery, "attempt_delivery",
                        lambda db, d, transport=None, now=None: orig(db, d, transport=_mock(handler), now=now))
    r = c.post(f"/super-admin/hub/webhooks/{created['id']}/test")
    assert r.status_code == 200 and r.json()["status"] == "success"
    h = captured["headers"]
    assert h["x-zoiko-event"] == "webhook.test"
    assert h["x-zoiko-signature"] == delivery.sign(secret, h["x-zoiko-timestamp"], captured["body"])
    logs = c.get(f"/super-admin/hub/webhooks/{created['id']}/deliveries").json()
    assert logs["total"] == 1 and logs["deliveries"][0]["response_status"] == 200


def _webhook(db, url="https://example.com/hook", events=("user.created",)):
    w = Webhook(name="w", url=url, events=list(events), secret_encrypted="", is_active=True)
    delivery.set_secret(w, "whsec_test1234")
    db.add(w)
    db.commit()
    return w


def test_emit_event_creates_deliveries_only_for_subscribers(world):
    db = world["db"]
    sub = _webhook(db)
    other = _webhook(db, events=("refund.created",))
    emit_event(db, "user.created", {"id": 1}, 5)
    rows = db.query(WebhookDelivery).all()
    assert [r.webhook_id for r in rows] == [sub.id]
    assert rows[0].payload["type"] == "user.created" and rows[0].payload["organization_id"] == 5
    assert other.id not in [r.webhook_id for r in rows]


def test_emit_unknown_event_and_inactive_webhook_ignored(world):
    db = world["db"]
    w = _webhook(db)
    w.is_active = False
    db.commit()
    emit_event(db, "user.created", {}, None)
    emit_event(db, "made.up", {}, None)
    assert db.query(WebhookDelivery).count() == 0


def test_retry_backoff_then_failure(world):
    db = world["db"]
    w = _webhook(db)
    emit_event(db, "user.created", {"id": 1})
    d = db.query(WebhookDelivery).one()
    fail = _mock(lambda r: httpx.Response(500, text="boom"))
    now = datetime.utcnow()
    expected_waits = [30, 120, 600, 3600]
    for i in range(4):
        delivery.attempt_delivery(db, d, transport=fail, now=now)
        assert d.status == "pending" and d.attempt == i + 1
        assert d.next_attempt_at == now + timedelta(seconds=expected_waits[i])
        now = d.next_attempt_at
    delivery.attempt_delivery(db, d, transport=fail, now=now)
    assert d.status == "failed" and d.attempt == 5 and d.next_attempt_at is None
    assert d.response_status == 500 and d.error == "HTTP 500"


def test_worker_only_processes_due_deliveries_and_succeeds(world):
    db = world["db"]
    _webhook(db)
    emit_event(db, "user.created", {"id": 1})
    d = db.query(WebhookDelivery).one()
    d.next_attempt_at = datetime.utcnow() + timedelta(hours=1)
    db.commit()
    ok = _mock(lambda r: httpx.Response(200, text="ok"))
    assert delivery.process_due_deliveries(db, transport=ok) == 0
    d.next_attempt_at = datetime.utcnow() - timedelta(seconds=1)
    db.commit()
    assert delivery.process_due_deliveries(db, transport=ok) == 1
    db.refresh(d)
    assert d.status == "success" and d.webhook.last_delivery_status == "success"


def test_auto_disable_after_consecutive_failures(world):
    db = world["db"]
    w = _webhook(db)
    fail = _mock(lambda r: httpx.Response(500))
    for _ in range(delivery.AUTO_DISABLE_AFTER):
        d = WebhookDelivery(webhook_id=w.id, event_id="e", event_type="user.created", payload={}, status="pending")
        db.add(d)
        db.commit()
        delivery.attempt_delivery(db, d, transport=fail)
    db.refresh(w)
    assert w.is_active is False and w.auto_disabled is True
    listed = world["client"].get("/super-admin/hub/webhooks").json()["webhooks"][0]
    assert listed["auto_disabled"] is True
    assert world["client"].post(f"/super-admin/hub/webhooks/{w.id}/enable").json()["auto_disabled"] is False


def test_success_resets_failure_streak(world):
    db = world["db"]
    w = _webhook(db)
    d = WebhookDelivery(webhook_id=w.id, event_id="e", event_type="user.created", payload={}, status="pending")
    db.add(d)
    db.commit()
    delivery.attempt_delivery(db, d, transport=_mock(lambda r: httpx.Response(500)))
    assert w.consecutive_failures == 1
    delivery.attempt_delivery(db, d, transport=_mock(lambda r: httpx.Response(200)))
    assert w.consecutive_failures == 0 and d.status == "success"


def test_delivery_blocks_url_that_became_unsafe(world):
    db = world["db"]
    w = _webhook(db, url="https://10.0.0.9/x")
    d = WebhookDelivery(webhook_id=w.id, event_id="e", event_type="user.created", payload={}, status="pending")
    db.add(d)
    db.commit()
    delivery.attempt_delivery(db, d, transport=_mock(lambda r: httpx.Response(200)))
    assert d.status == "pending" and d.error.startswith("Blocked")


def test_manual_retry_endpoint(world):
    db = world["db"]
    w = _webhook(db)
    d = WebhookDelivery(webhook_id=w.id, event_id="e", event_type="user.created", payload={"x": 1}, status="failed", attempt=5)
    db.add(d)
    db.commit()
    orig = delivery.attempt_delivery
    import app.modules.integrations.router as r
    r.delivery.attempt_delivery = lambda db_, d_, transport=None, now=None: orig(db_, d_, transport=_mock(lambda q: httpx.Response(204)), now=now)
    try:
        res = world["client"].post(f"/super-admin/hub/deliveries/{d.id}/retry")
    finally:
        r.delivery.attempt_delivery = orig
    assert res.status_code == 200 and res.json()["status"] == "success"
    assert world["client"].post(f"/super-admin/hub/deliveries/{d.id}/retry").status_code == 400


def test_applications_reflect_real_state(world):
    c = world["client"]
    apps = {a["key"]: a for a in c.get("/super-admin/hub/applications").json()["applications"]}
    assert apps["slack"]["status"] == "Not connected" and apps["twilio"]["status"] == "Not connected"
    assert apps["google"]["status"] == "Not connected"
    assert "quickbooks" not in apps and "salesforce" not in apps
    c.put("/super-admin/connect/channels/slack", json={"webhook_url": SLACK_URL})
    apps = {a["key"]: a for a in c.get("/super-admin/hub/applications").json()["applications"]}
    assert apps["slack"]["status"] == "Configured (untested)"


def test_events_catalog_endpoint(world):
    keys = {e["key"] for e in world["client"].get("/super-admin/hub/events").json()["events"]}
    assert keys == {"organization.created", "organization.deleted", "user.created",
                    "subscription.converted", "refund.created"}


# ───────────────────────── Zoiko Workflow ─────────────────────────

def _workspace(c, name="Ops"):
    return c.post("/super-admin/workflow/workspaces", json={"name": name}).json()


def _workflow(c, ws_id, steps=None, trigger="user.created", name="Welcome"):
    if steps is None:
        steps = [{"type": "slack", "message": "New user {{data.email}}"}]
    return c.post("/super-admin/workflow/workflows",
                  json={"workspace_id": ws_id, "name": name, "trigger_event": trigger, "steps": steps})


def test_workspace_crud(world):
    c = world["client"]
    assert c.get("/super-admin/workflow/workspaces").json()["workspaces"] == []
    ws = _workspace(c)
    assert ws["name"] == "Ops" and ws["workflow_count"] == 0
    assert c.post("/super-admin/workflow/workspaces", json={"name": "Ops"}).status_code == 400
    assert len(c.get("/super-admin/workflow/workspaces").json()["workspaces"]) == 1
    wf = _workflow(c, ws["id"]).json()
    assert c.delete(f"/super-admin/workflow/workspaces/{ws['id']}").status_code == 400  # has workflows
    c.delete(f"/super-admin/workflow/workflows/{wf['id']}")
    assert c.delete(f"/super-admin/workflow/workspaces/{ws['id']}").status_code == 200


def test_workflow_crud_and_validation(world):
    c = world["client"]
    ws = _workspace(c)
    r = _workflow(c, ws["id"])
    assert r.status_code == 201
    wf = r.json()
    assert wf["is_active"] is False and wf["step_count"] == 1
    assert _workflow(c, 9999).status_code == 404
    assert _workflow(c, ws["id"], trigger="bad.event").status_code == 400
    assert _workflow(c, ws["id"], steps=[]).status_code == 400
    assert _workflow(c, ws["id"], steps=[{"type": "teleport"}]).status_code == 400
    assert _workflow(c, ws["id"], steps=[{"type": "email", "to": "a@b.c"}]).status_code == 400
    assert _workflow(c, ws["id"], steps=[{"type": "delay", "seconds": 10**9}]).status_code == 400
    p = c.patch(f"/super-admin/workflow/workflows/{wf['id']}", json={"name": "Renamed"})
    assert p.json()["name"] == "Renamed"
    assert c.post(f"/super-admin/workflow/workflows/{wf['id']}/activate").json()["is_active"] is True
    assert c.post(f"/super-admin/workflow/workflows/{wf['id']}/deactivate").json()["is_active"] is False


def test_trigger_matching_only_active_matching_workflows(world):
    db, c = world["db"], world["client"]
    ws = _workspace(c)
    a = _workflow(c, ws["id"], trigger="user.created", name="A").json()
    b = _workflow(c, ws["id"], trigger="refund.created", name="B").json()
    _workflow(c, ws["id"], trigger="user.created", name="Inactive")
    c.post(f"/super-admin/workflow/workflows/{a['id']}/activate")
    c.post(f"/super-admin/workflow/workflows/{b['id']}/activate")
    emit_event(db, "user.created", {"email": "x@y.z"}, 3)
    execs = db.query(WorkflowExecution).all()
    assert [e.workflow_id for e in execs] == [a["id"]]
    assert execs[0].status == "pending" and execs[0].triggered_by == "event"


def test_execution_success_records_step_results(world):
    db, c = world["db"], world["client"]
    c.put("/super-admin/connect/channels/slack", json={"webhook_url": SLACK_URL})
    ws = _workspace(c)
    wf = _workflow(c, ws["id"], steps=[
        {"type": "slack", "message": "Hello {{data.email}}"},
        {"type": "notification", "title": "T", "message": "M", "scope": "all"},
    ]).json()
    c.post(f"/super-admin/workflow/workflows/{wf['id']}/activate")
    emit_event(db, "user.created", {"email": "x@y.z"}, None)
    sent = {}
    ok = _mock(lambda r: (sent.setdefault("body", json.loads(r.content)), httpx.Response(200, text="ok"))[1])
    assert engine.process_due_executions(db, transport=ok) == 1
    ex = db.query(WorkflowExecution).one()
    assert ex.status == "succeeded" and [s["status"] for s in ex.step_results] == ["succeeded", "succeeded"]
    assert sent["body"]["text"] == "Hello x@y.z"
    db.refresh(db.query(Workflow).filter(Workflow.id == wf["id"]).one())
    got = c.get("/super-admin/workflow/workflows").json()["workflows"][0]
    assert got["last_run_status"] == "succeeded" and got["last_run_at"]
    detail = c.get(f"/super-admin/workflow/executions/{ex.id}").json()
    assert len(detail["step_results"]) == 2 and detail["trigger_payload"]["type"] == "user.created"


def test_execution_failure_records_real_error_and_stops(world):
    db, c = world["db"], world["client"]
    ws = _workspace(c)
    wf = _workflow(c, ws["id"], steps=[
        {"type": "slack", "message": "hi"},  # Slack not configured -> fails
        {"type": "notification", "title": "T", "message": "M", "scope": "all"},
    ]).json()
    ex = c.post(f"/super-admin/workflow/workflows/{wf['id']}/run").json()
    assert ex["status"] == "failed"
    assert len(ex["step_results"]) == 1  # second step never ran
    assert "not configured" in ex["step_results"][0]["error"]
    assert ex["error"].startswith("Step 1 (slack) failed")
    assert c.get("/super-admin/workflow/workflows").json()["workflows"][0]["last_run_status"] == "failed"


def test_delay_step_pauses_then_resumes(world):
    db, c = world["db"], world["client"]
    ws = _workspace(c)
    wf = _workflow(c, ws["id"], steps=[
        {"type": "delay", "seconds": 60},
        {"type": "notification", "title": "T", "message": "M", "scope": "all"},
    ]).json()
    ex = c.post(f"/super-admin/workflow/workflows/{wf['id']}/run").json()
    assert ex["status"] == "waiting"
    assert engine.process_due_executions(db) == 0
    later = datetime.utcnow() + timedelta(seconds=61)
    assert engine.process_due_executions(db, now=later) == 1
    row = db.query(WorkflowExecution).one()
    assert row.status == "succeeded" and len(row.step_results) == 2


def test_notification_step_requires_org_when_scoped(world):
    c = world["client"]
    ws = _workspace(c)
    wf = _workflow(c, ws["id"], steps=[{"type": "notification", "title": "T", "message": "M"}]).json()
    ex = c.post(f"/super-admin/workflow/workflows/{wf['id']}/run").json()
    assert ex["status"] == "failed" and "no organization" in ex["step_results"][0]["error"]


def test_webhook_step_delivers_signed_call(world, monkeypatch):
    db, c = world["db"], world["client"]
    w = _webhook(db, events=())
    ws = _workspace(c)
    wf = _workflow(c, ws["id"], steps=[{"type": "webhook", "webhook_id": w.id}]).json()
    orig = delivery.attempt_delivery
    monkeypatch.setattr(delivery, "attempt_delivery",
                        lambda db_, d, transport=None, now=None: orig(db_, d, transport=_mock(lambda r: httpx.Response(202)), now=now))
    ex = c.post(f"/super-admin/workflow/workflows/{wf['id']}/run").json()
    assert ex["status"] == "succeeded"
    assert "202" in ex["step_results"][0]["output"]


def test_delete_workflow_keeps_execution_history(world):
    db, c = world["db"], world["client"]
    ws = _workspace(c)
    wf = _workflow(c, ws["id"], steps=[{"type": "delay", "seconds": 1}]).json()
    c.post(f"/super-admin/workflow/workflows/{wf['id']}/run")
    assert c.delete(f"/super-admin/workflow/workflows/{wf['id']}").status_code == 200
    ex = c.get("/super-admin/workflow/executions").json()["executions"]
    assert len(ex) == 1 and ex[0]["workflow_id"] is None and ex[0]["workflow_name"] == "Welcome"


def test_execution_list_filters_and_pagination(world):
    db, c = world["db"], world["client"]
    ws = _workspace(c)
    a = _workflow(c, ws["id"], steps=[{"type": "slack", "message": "x"}], name="A").json()
    b = _workflow(c, ws["id"], steps=[{"type": "delay", "seconds": 60},
                                       {"type": "notification", "title": "T", "message": "M", "scope": "all"}], name="B").json()
    c.post(f"/super-admin/workflow/workflows/{a['id']}/run")
    c.post(f"/super-admin/workflow/workflows/{b['id']}/run")
    c.post(f"/super-admin/workflow/workflows/{b['id']}/run")
    assert c.get("/super-admin/workflow/executions").json()["total"] == 3
    assert c.get(f"/super-admin/workflow/executions?workflow_id={a['id']}").json()["total"] == 1
    assert c.get("/super-admin/workflow/executions?status=failed").json()["total"] == 1
    assert c.get("/super-admin/workflow/executions?status=waiting").json()["total"] == 2
    page = c.get("/super-admin/workflow/executions?page=2&page_size=2").json()
    assert page["total"] == 3 and len(page["executions"]) == 1
    future = (datetime.utcnow() + timedelta(days=1)).isoformat()
    assert c.get(f"/super-admin/workflow/executions?date_from={future}").json()["total"] == 0
    assert c.get("/super-admin/workflow/executions/9999").status_code == 404


def test_workflow_actions_are_audited(world):
    c = world["client"]
    ws = _workspace(c)
    wf = _workflow(c, ws["id"]).json()
    c.post(f"/super-admin/workflow/workflows/{wf['id']}/activate")
    events = {l.details.get("event") for l in world["db"].query(AuditLog).all()}
    assert {"workflow.workspace_created", "workflow.created", "workflow.activated"} <= events


def test_workflow_meta_only_lists_real_steps_and_triggers(world):
    meta = world["client"].get("/super-admin/workflow/meta").json()
    assert {s["key"] for s in meta["step_types"]} == {"notification", "email", "slack", "sms", "webhook", "delay"}
    assert {t["key"] for t in meta["triggers"]} == set(__import__("app.modules.integrations.events", fromlist=["x"]).EVENT_CATALOG)


def test_template_rendering():
    assert engine.render("Hi {{ data.name }} / {{missing.x}}!", {"data": {"name": "Ann"}}) == "Hi Ann / !"


# ───────────────────────── Event hooks in real services ─────────────────────────

def test_creating_a_user_emits_user_created_to_webhooks_and_workflows(world, monkeypatch):
    from app.modules.employee import service as emp_service
    from app.modules.employee.schema import UserCreateRequest
    from app.modules.hr.models import Organization, OrganizationStatus

    db, c = world["db"], world["client"]
    db.add(Organization(id=5, name="Acme", organization_name="Acme Ltd", status=OrganizationStatus.ACTIVE))
    db.commit()
    monkeypatch.setattr(emp_service, "_generate_employee_id", lambda db_, organization_id: "ACM0001")
    monkeypatch.setattr("app.core.code_generation.generate_employee_code", lambda db_, organization_id=None: "EC-0001")
    monkeypatch.setattr(emp_service, "_notify_email", lambda *a, **k: None)
    hook = _webhook(db, events=("user.created",))
    ws = _workspace(c)
    wf = _workflow(c, ws["id"], steps=[{"type": "notification", "title": "T", "message": "M", "scope": "all"}]).json()
    c.post(f"/super-admin/workflow/workflows/{wf['id']}/activate")

    user, _temp = emp_service.create_organization_user(
        db, UserCreateRequest(first_name="Nina", last_name="New", email="nina@example.com", role=UserRole.EMPLOYEE),
        organization_id=5, created_by_id=world["sa"].id,
    )
    d = db.query(WebhookDelivery).filter(WebhookDelivery.webhook_id == hook.id).one()
    assert d.event_type == "user.created" and d.payload["organization_id"] == 5
    assert d.payload["data"] == {"id": user.id, "email": "nina@example.com", "role": "employee"}
    ex = db.query(WorkflowExecution).filter(WorkflowExecution.trigger_event == "user.created").one()
    assert ex.workflow_id == wf["id"] and ex.status == "pending" and ex.trigger_payload["data"]["id"] == user.id


# ───────────────────────── Workflow: per-organization view ─────────────────────────

def _orgs(db):
    from app.modules.hr.models import Organization, OrganizationStatus

    db.add_all([Organization(id=1, name="Acme", organization_name="Acme Ltd", status=OrganizationStatus.ACTIVE),
                Organization(id=2, name="Globex", organization_name="Globex Inc", status=OrganizationStatus.ACTIVE)])
    db.commit()


def _ws(c, name, org=None):
    body = {"name": name}
    if org is not None:
        body["organization_id"] = org
    return c.post("/super-admin/workflow/workspaces", json=body)


NOTIFY = [{"type": "notification", "title": "T", "message": "M", "scope": "all"}]


def test_workspace_scope_is_validated_and_labelled(world):
    db, c = world["db"], world["client"]
    _orgs(db)
    assert _ws(c, "Bad", 999).status_code == 400
    acme = _ws(c, "Acme ops", 1).json()
    plat = _ws(c, "Platform ops").json()
    assert (acme["organization_id"], acme["organization_name"]) == (1, "Acme Ltd")
    assert (plat["organization_id"], plat["organization_name"]) == (None, "Platform-wide")
    names = {w["name"]: w["organization_name"] for w in c.get("/super-admin/workflow/workspaces").json()["workspaces"]}
    assert names == {"Acme ops": "Acme Ltd", "Platform ops": "Platform-wide"}
    only = lambda **k: [w["name"] for w in c.get("/super-admin/workflow/workspaces", params=k).json()["workspaces"]]
    assert only(organization_id=1) == ["Acme ops"] and only(organization_id=0) == ["Platform ops"]


def test_workflows_show_their_organization_and_filter_by_it(world):
    db, c = world["db"], world["client"]
    _orgs(db)
    a, g, p = _ws(c, "A", 1).json(), _ws(c, "G", 2).json(), _ws(c, "P").json()
    for ws, name in ((a, "Acme flow"), (g, "Globex flow"), (p, "Platform flow")):
        assert _workflow(c, ws["id"], steps=NOTIFY, name=name).status_code == 201
    allw = {w["name"]: w["organization_name"] for w in c.get("/super-admin/workflow/workflows").json()["workflows"]}
    assert allw == {"Acme flow": "Acme Ltd", "Globex flow": "Globex Inc", "Platform flow": "Platform-wide"}
    get = lambda **k: [w["name"] for w in c.get("/super-admin/workflow/workflows", params=k).json()["workflows"]]
    assert get(organization_id=2) == ["Globex flow"] and get(organization_id=0) == ["Platform flow"]
    assert get(organization_id=1, workspace_id=a["id"]) == ["Acme flow"] and get(organization_id=1, workspace_id=g["id"]) == []


def test_an_organization_workflow_only_reacts_to_that_organizations_events(world):
    db, c = world["db"], world["client"]
    _orgs(db)
    acme_ws, plat_ws = _ws(c, "A", 1).json(), _ws(c, "P").json()
    acme_wf = _workflow(c, acme_ws["id"], steps=NOTIFY, name="Acme only").json()
    plat_wf = _workflow(c, plat_ws["id"], steps=NOTIFY, name="Everyone").json()
    for wf in (acme_wf, plat_wf):
        c.post(f"/super-admin/workflow/workflows/{wf['id']}/activate")
    emit_event(db, "user.created", {"id": 1}, 2)  # Globex event
    ran = lambda: sorted(((e.workflow_name, e.organization_id) for e in db.query(WorkflowExecution).all()), key=lambda t: (t[0], t[1] or 0))
    assert ran() == [("Everyone", 2)]  # Acme's workflow ignored Globex's event
    emit_event(db, "user.created", {"id": 2}, 1)  # Acme event
    assert ran() == [("Acme only", 1), ("Everyone", 1), ("Everyone", 2)]
    emit_event(db, "user.created", {"id": 3}, None)  # platform-level event
    assert ("Everyone", None) in ran() and sum(1 for n, _ in ran() if n == "Acme only") == 1


def test_manual_run_is_attributed_to_the_workspace_organization(world):
    db, c = world["db"], world["client"]
    _orgs(db)
    wf = _workflow(c, _ws(c, "G", 2).json()["id"], steps=NOTIFY).json()
    ex = c.post(f"/super-admin/workflow/workflows/{wf['id']}/run").json()
    assert (ex["organization_id"], ex["organization_name"]) == (2, "Globex Inc")
    assert db.query(WorkflowExecution).one().organization_id == 2


def test_executions_filter_by_organization_and_show_it(world):
    db, c = world["db"], world["client"]
    _orgs(db)
    wa = _workflow(c, _ws(c, "A", 1).json()["id"], steps=NOTIFY, name="A").json()
    wp = _workflow(c, _ws(c, "P").json()["id"], steps=NOTIFY, name="P").json()
    for wf in (wa, wa, wp):
        c.post(f"/super-admin/workflow/workflows/{wf['id']}/run")
    get = lambda **k: c.get("/super-admin/workflow/executions", params=k).json()
    assert get()["total"] == 3 and get(organization_id=1)["total"] == 2 and get(organization_id=0)["total"] == 1
    assert get(organization_id=2)["total"] == 0
    assert {e["organization_name"] for e in get()["executions"]} == {"Acme Ltd", "Platform-wide"}


def test_workflow_stats_come_from_real_runs(world):
    db, c = world["db"], world["client"]
    _orgs(db)
    ok = _workflow(c, _ws(c, "A", 1).json()["id"], steps=NOTIFY, name="ok").json()
    bad = _workflow(c, _ws(c, "B", 1).json()["id"], steps=[{"type": "slack", "message": "x"}], name="bad").json()
    for _ in range(3):
        c.post(f"/super-admin/workflow/workflows/{ok['id']}/run")
    c.post(f"/super-admin/workflow/workflows/{bad['id']}/run")  # Slack not configured -> fails
    by_name = {w["name"]: w for w in c.get("/super-admin/workflow/workflows").json()["workflows"]}
    assert (by_name["ok"]["runs"], by_name["ok"]["succeeded"], by_name["ok"]["success_rate"]) == (3, 3, 100)
    assert (by_name["bad"]["runs"], by_name["bad"]["failed"], by_name["bad"]["success_rate"]) == (1, 1, 0)
    fresh = _workflow(c, _ws(c, "C", 1).json()["id"], steps=NOTIFY, name="fresh").json()
    assert fresh["runs"] == 0 and fresh["success_rate"] is None  # never faked


def test_overview_has_one_row_per_organization_plus_platform(world):
    db, c = world["db"], world["client"]
    _orgs(db)
    wa = _workflow(c, _ws(c, "A", 1).json()["id"], steps=NOTIFY, name="a1").json()
    c.post(f"/super-admin/workflow/workflows/{wa['id']}/activate")
    _workflow(c, _ws(c, "A2", 1).json()["id"], steps=NOTIFY, name="a2")
    bad = _workflow(c, _ws(c, "G", 2).json()["id"], steps=[{"type": "slack", "message": "x"}], name="g1").json()
    wp = _workflow(c, _ws(c, "P").json()["id"], steps=NOTIFY, name="p1").json()
    c.post(f"/super-admin/workflow/workflows/{bad['id']}/run")
    c.post(f"/super-admin/workflow/workflows/{wp['id']}/run")
    o = c.get("/super-admin/workflow/overview").json()
    rows = {r["organization_name"]: r for r in o["organizations"]}
    assert list(rows) == ["Acme Ltd", "Globex Inc", "Platform-wide"]  # organizations first, Platform-wide last
    assert (rows["Acme Ltd"]["workspaces"], rows["Acme Ltd"]["workflows"], rows["Acme Ltd"]["active_workflows"]) == (2, 2, 1)
    assert (rows["Globex Inc"]["runs_7d"], rows["Globex Inc"]["failed_7d"], rows["Globex Inc"]["last_run_status"]) == (1, 1, "failed")
    assert (rows["Platform-wide"]["runs_7d"], rows["Platform-wide"]["succeeded_7d"]) == (1, 1)
    assert o["totals"] == {"workspaces": 4, "workflows": 4, "active_workflows": 1, "runs_7d": 2, "failed_7d": 1}


def test_overview_is_empty_without_data_and_super_admin_only(world):
    c = world["client"]
    assert c.get("/super-admin/workflow/overview").json() == {
        "organizations": [], "totals": {"workspaces": 0, "workflows": 0, "active_workflows": 0, "runs_7d": 0, "failed_7d": 0}}
    world["box"]["user"] = Employee(id=99, email="e@x.test", role=UserRole.EMPLOYEE)
    assert c.get("/super-admin/workflow/overview").status_code == 403
