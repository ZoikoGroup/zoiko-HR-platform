"""SMTP delivery hardening (Zoiko Hub "SMTP Email Server: Connection unexpectedly
closed").

Bulk scheduled sends used to open one TLS connection per message with no
spacing and no retry. Shared-host relays answer that burst by dropping the
connection mid-session, which was recorded as a failed send. These tests pin
the fix: one connection at a time, transient drops retried with backoff, and
permanent rejections (bad credentials) failed immediately instead of being
hammered — hammering auth is what gets a sending IP blocked."""

import smtplib
import threading
import time
from unittest.mock import patch

import pytest

from app.services.email_service import (
    _deliver_via_smtp, _is_permanent_smtp_error, _smtp_error_text,
)

SMTP = {
    "host": "smtp.example.test", "port": 465, "username": "u", "password": "p",
    "from_email": "info@example.test", "use_tls": "true",
}


@pytest.fixture(autouse=True)
def _no_real_waiting():
    from app.services import email_service as es

    es._SMTP_MIN_GAP_SECONDS = 0
    es._SMTP_BACKOFF_SECONDS = (0, 0)
    es._last_smtp_connect_at = 0.0
    yield
    es._SMTP_MIN_GAP_SECONDS = 0.5
    es._SMTP_BACKOFF_SECONDS = (2, 7)


def _msg():
    from email.mime.text import MIMEText

    return MIMEText("hello", "plain", "utf-8")


class TestRetryBehaviour:
    def test_dropped_connection_is_retried_and_succeeds(self):
        calls = []

        def fake_once(smtp, envelope_from, to_email, message):
            calls.append(to_email)
            if len(calls) < 3:
                raise smtplib.SMTPServerDisconnected("Connection unexpectedly closed")

        with patch("app.services.email_service._smtp_send_once", fake_once):
            assert _deliver_via_smtp(SMTP, "info@example.test", "a@example.test", _msg()) == ""
        assert len(calls) == 3

    def test_retries_are_bounded(self):
        calls = []

        def fake_once(*_):
            calls.append(1)
            raise smtplib.SMTPServerDisconnected("Connection unexpectedly closed")

        with patch("app.services.email_service._smtp_send_once", fake_once):
            err = _deliver_via_smtp(SMTP, "info@example.test", "a@example.test", _msg())
        assert len(calls) == 3
        assert "SMTPServerDisconnected" in err

    def test_bad_credentials_are_not_retried(self):
        calls = []

        def fake_once(*_):
            calls.append(1)
            raise smtplib.SMTPAuthenticationError(535, b"authentication rejected")

        with patch("app.services.email_service._smtp_send_once", fake_once):
            err = _deliver_via_smtp(SMTP, "info@example.test", "a@example.test", _msg())
        assert len(calls) == 1, "retrying bad credentials is what gets an IP blocked"
        assert "535" in err

    def test_timeout_is_retried(self):
        calls = []

        def fake_once(*_):
            calls.append(1)
            if len(calls) == 1:
                raise TimeoutError("timed out")
            return None

        with patch("app.services.email_service._smtp_send_once", fake_once):
            assert _deliver_via_smtp(SMTP, "info@example.test", "a@example.test", _msg()) == ""
        assert len(calls) == 2


class TestConcurrency:
    def test_sends_are_serialized(self):
        """No two connections may be open at once — that burst is what the
        relay drops."""
        active = 0
        peak = 0
        guard = threading.Lock()

        def fake_once(*_):
            nonlocal active, peak
            with guard:
                active += 1
                peak = max(peak, active)
            time.sleep(0.02)
            with guard:
                active -= 1

        threads = [
            threading.Thread(target=lambda: _deliver_via_smtp(SMTP, "info@example.test", f"{i}@example.test", _msg()))
            for i in range(8)
        ]
        with patch("app.services.email_service._smtp_send_once", fake_once):
            for t in threads:
                t.start()
            for t in threads:
                t.join()
        assert peak == 1


class TestErrorClassification:
    def test_permanent(self):
        assert _is_permanent_smtp_error(smtplib.SMTPAuthenticationError(535, b"no"))
        assert _is_permanent_smtp_error(smtplib.SMTPRecipientsRefused({}))
        assert _is_permanent_smtp_error(smtplib.SMTPResponseException(550, b"no"))

    def test_transient(self):
        assert not _is_permanent_smtp_error(smtplib.SMTPServerDisconnected())
        assert not _is_permanent_smtp_error(smtplib.SMTPConnectError(421, b"busy"))
        assert not _is_permanent_smtp_error(TimeoutError())
        assert not _is_permanent_smtp_error(ConnectionResetError())

    def test_error_text_is_actionable(self):
        assert "535" in _smtp_error_text(smtplib.SMTPAuthenticationError(535, b"authentication rejected"))
        assert "SMTPServerDisconnected" in _smtp_error_text(smtplib.SMTPServerDisconnected())


class TestDeliveryLoop:
    def test_send_approval_email_records_success(self, monkeypatch):
        from app.services import email_service as es

        seen = []

        def fake_once(smtp, envelope_from, to_email, message):
            seen.append((smtp["host"], envelope_from, to_email))
            _log = []

            return None

        logged = []
        monkeypatch.setattr(es, "_smtp_send_once", fake_once)
        monkeypatch.setattr(es, "_log_email_delivery", lambda *a, **k: logged.append((a, k)))
        monkeypatch.setattr(es, "render_email", lambda *a, **k: es.RenderedEmail(
            subject="Subject", html="<p>hi</p>", text="hi", branding={}))
        monkeypatch.setattr(es, "_get_smtp_settings", lambda db=None: dict(SMTP))

        assert es.send_approval_email("a@example.test", "welcome.html", {"subject": "Subject"}) is True
        assert seen == [("smtp.example.test", "info@example.test", "a@example.test")]
        assert logged[0][1]["status"] == "sent"

    def test_send_approval_email_records_permanent_failure(self, monkeypatch):
        from app.services import email_service as es

        def fake_once(*_):
            raise smtplib.SMTPAuthenticationError(535, b"authentication rejected")

        logged = []
        monkeypatch.setattr(es, "_smtp_send_once", fake_once)
        monkeypatch.setattr(es, "_log_email_delivery", lambda *a, **k: logged.append((a, k)))
        monkeypatch.setattr(es, "render_email", lambda *a, **k: es.RenderedEmail(
            subject="Subject", html="<p>hi</p>", text="hi", branding={}))
        monkeypatch.setattr(es, "_get_smtp_settings", lambda db=None: dict(SMTP))

        assert es.send_approval_email("a@example.test", "welcome.html", {"subject": "Subject"}) is False
        assert logged[0][1]["status"] == "failed"
        assert "535" in logged[0][1]["error_message"]

    def test_send_plain_email_reports_error(self, monkeypatch):
        from app.services import email_service as es

        def fake_once(*_):
            raise smtplib.SMTPServerDisconnected("Connection unexpectedly closed")

        monkeypatch.setattr(es, "_smtp_send_once", fake_once)
        monkeypatch.setattr(es, "_log_email_delivery", lambda *a, **k: None)
        monkeypatch.setattr(es, "_get_smtp_settings", lambda db=None: dict(SMTP))

        ok, err = es.send_plain_email("a@example.test", "s", "b")
        assert ok is False and "SMTPServerDisconnected" in err