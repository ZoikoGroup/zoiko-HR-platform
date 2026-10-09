"""Shared test setup.

The real-email and email-confirmation rules are ON in production. The older test suites build accounts with placeholder
addresses (name@example.com) and sign them in straight away, so they run with the rules off; the tests for the rules
themselves (tests/test_real_emails.py) switch them on with the `strict_emails` fixture.
"""
import pytest

from app.config import settings


@pytest.fixture(autouse=True)
def _relaxed_email_rules(request, monkeypatch):
    if "strict_emails" in request.fixturenames:
        monkeypatch.setattr(settings, "EMAIL_REAL_ONLY", True)
        monkeypatch.setattr(settings, "EMAIL_DNS_CHECK", False)          # no network in tests; the DNS part is tested on its own
        monkeypatch.setattr(settings, "REQUIRE_EMAIL_VERIFICATION", True)
    else:
        monkeypatch.setattr(settings, "EMAIL_REAL_ONLY", False)
        monkeypatch.setattr(settings, "EMAIL_DNS_CHECK", False)
        monkeypatch.setattr(settings, "REQUIRE_EMAIL_VERIFICATION", False)
    yield


@pytest.fixture
def strict_emails():
    """Marker fixture: the test runs with the real-email and confirmation rules on."""
    return True
