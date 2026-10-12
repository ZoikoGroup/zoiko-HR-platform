"""Stripe retries an event only when it gets a non-2xx answer, and the retry must actually be processed."""

import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.modules.billing import webhook_service as ws
from app.modules.billing.models import BillingWebhookEvent


@pytest.fixture
def env(monkeypatch):
    from app.main import app
    import app.modules.billing.router as router

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    app.dependency_overrides[get_db] = lambda: s
    monkeypatch.setattr(router, "verify_webhook_signature", lambda body, sig: sig == "good")
    yield TestClient(app, raise_server_exceptions=False), s
    app.dependency_overrides.pop(get_db, None)
    s.close()
    engine.dispose()


def post(client, event, sig="good"):
    return client.post("/billing/webhooks/stripe", content=json.dumps(event), headers={"stripe-signature": sig, "content-type": "application/json"})


EVENT = {"id": "evt_1", "type": "invoice.paid", "data": {"object": {"id": "in_1"}}}


def test_a_bad_signature_gets_a_real_400_not_a_200(env):
    client, _ = env
    r = post(client, EVENT, sig="forged")
    assert r.status_code == 400 and r.json()["message"] == "invalid signature"


def test_malformed_json_gets_a_real_400(env):
    client, _ = env
    r = client.post("/billing/webhooks/stripe", content=b"{not json", headers={"stripe-signature": "good"})
    assert r.status_code == 400


def test_a_handler_failure_returns_500_so_stripe_retries_and_the_retry_is_processed(env, monkeypatch):
    client, s = env
    calls = []

    def flaky(db, event_id, data, full_event):
        calls.append(event_id)
        if len(calls) == 1:
            raise RuntimeError("database hiccup")
        return {"status": "ok"}

    monkeypatch.setitem(ws._HANDLERS, "invoice.paid", flaky)
    first = post(client, EVENT)
    assert first.status_code == 500
    row = s.query(BillingWebhookEvent).one()
    assert row.processed is False and "database hiccup" in row.error_message

    second = post(client, EVENT)          # Stripe's retry
    assert second.status_code == 200 and second.json()["status"] == "ok"
    assert calls == ["evt_1", "evt_1"], "the retry was processed, not skipped as a duplicate"
    row = s.query(BillingWebhookEvent).one()
    assert row.processed is True and row.error_message is None

    third = post(client, EVENT)           # a later duplicate delivery is still ignored
    assert third.status_code == 200 and third.json()["status"] == "skipped"
    assert len(calls) == 2


def test_a_successful_event_is_acknowledged_with_200(env, monkeypatch):
    client, _ = env
    monkeypatch.setitem(ws._HANDLERS, "invoice.paid", lambda db, eid, data, full: {"status": "ok"})
    assert post(client, EVENT).status_code == 200
