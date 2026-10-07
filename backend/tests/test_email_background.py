"""Requests must not wait on SMTP: emails are queued and sent in order by a background worker."""

import threading
import time

import pytest

from app.services import email_service as es


@pytest.fixture
def slow_smtp(monkeypatch):
    sent = []
    gate = threading.Event()

    def deliver(smtp, envelope_from, to_email, msg):
        gate.wait(2)
        time.sleep(0.05)
        sent.append((to_email, str(msg["Subject"])))
        return None

    monkeypatch.setattr(es, "_async_enabled", lambda: True)
    monkeypatch.setattr(es, "_deliver_via_smtp", deliver)
    monkeypatch.setattr(es, "_get_smtp_settings", lambda db=None: {"host": "h", "port": "465", "username": "u", "password": "p", "from_email": "info@zoikohr.com", "use_tls": "true"})
    monkeypatch.setattr(es, "_log_email_delivery", lambda *a, **k: None)
    monkeypatch.setattr(es, "_get_org_branding", lambda organization_id=None, db=None: dict(es._BRANDING_DEFAULTS))
    es.flush_email_queue(5)
    return sent, gate


def test_the_caller_is_not_held_up_by_a_slow_mail_server(slow_smtp):
    sent, gate = slow_smtp
    start = time.monotonic()
    for i in range(3):
        assert es.send_registration_received(f"user{i}@example.test", f"Org {i}") is True
    assert time.monotonic() - start < 0.5, "queueing must not wait for SMTP"
    assert sent == []          # nothing has been delivered yet: the server is still "slow"
    gate.set()
    assert es.flush_email_queue(5) is True
    assert [to for to, _ in sent] == ["user0@example.test", "user1@example.test", "user2@example.test"], "sent in the order queued"


def test_a_later_change_to_the_callers_context_does_not_change_the_queued_email(slow_smtp):
    sent, gate = slow_smtp
    ctx = {"subject": "Original", "organization_name": "Acme", "action_url": "https://app.zoikohr.com/login"}
    es.send_approval_email("a@example.test", "registration_received.html", ctx)
    ctx["subject"] = "Changed afterwards"
    gate.set()
    es.flush_email_queue(5)
    assert sent[0][1] == "Original"


def test_wait_true_and_error_out_still_send_before_returning(slow_smtp):
    sent, gate = slow_smtp
    gate.set()
    ctx = {"subject": "Now", "organization_name": "Acme", "action_url": "https://app.zoikohr.com/login"}
    assert es.send_approval_email("a@example.test", "registration_received.html", ctx, wait=True) is True
    assert len(sent) == 1, "delivered by the time the call returned"
    errors = []
    assert es.send_approval_email("b@example.test", "registration_received.html", ctx, error_out=errors) is True
    assert len(sent) == 2 and errors == []


def test_one_failing_message_does_not_stop_the_queue(slow_smtp, monkeypatch):
    sent, gate = slow_smtp
    real = es._send_approval_email_now
    calls = []

    def flaky(email, *a, **k):
        calls.append(email)
        if email.startswith("bad"):
            raise RuntimeError("boom")
        return real(email, *a, **k)

    monkeypatch.setattr(es, "_send_approval_email_now", flaky)
    ctx = {"subject": "s", "organization_name": "Acme", "action_url": "https://app.zoikohr.com/login"}
    for who in ("bad@example.test", "good@example.test"):
        es.send_approval_email(who, "registration_received.html", ctx)
    gate.set()
    es.flush_email_queue(5)
    assert calls == ["bad@example.test", "good@example.test"] and [to for to, _ in sent] == ["good@example.test"]


def test_under_pytest_sending_stays_inline_by_default():
    import sys

    assert "pytest" in sys.modules
    es_async = es._async_enabled.__wrapped__ if hasattr(es._async_enabled, "__wrapped__") else es._async_enabled
    assert es_async() is False
