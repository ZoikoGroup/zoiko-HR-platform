"""Egress, telemetry and logs (ZHR-PRIV-001 C10, D04, D07, D08, F03).

The leakage canary: synthetic sensitive values are planted in the data, the main flows run, and none of them may appear in
anything the system emits: log records, error-tracker events, outbound mail/webhook payloads built for the platform.
"""
import logging

import pytest

from app.core.privacy import redact
from tests.privacy.support import CANARY, all_canaries_in, token_for


def test_redact_text_scrubs_the_usual_identifiers_and_leaves_plain_text_alone():
    out = redact.redact_text(
        "user alice@corp.example paid GB82WEST12345698765432 card 4111 1111 1111 1111 call +44 7700 900123 on 2026-10-14 09:06:49,466 "
        "id 123456789012 password=hunter2 Authorization: Bearer abcdefghijklmnop PAN ABCDE1234F CANARY-IBAN-A1-000111")
    for raw in ("alice@corp.example", "GB82WEST12345698765432", "4111 1111 1111 1111", "7700 900123", "hunter2", "abcdefghijklmnop", "ABCDE1234F", "CANARY-IBAN"):
        assert raw not in out, raw
    assert "2026-10-14 09:06:49,466" in out and "123456789012" in out, "dates and plain numbers are not mistaken for personal data"
    assert redact.redact_text("employee list loaded in 120 ms for organization 7") == "employee list loaded in 120 ms for organization 7"


def test_redact_value_scrubs_structured_data_by_key_and_by_pattern():
    data = {"first_name": "Canary", "email": "x@y.example", "basic_salary": 5, "plan": "core", "note": "mail a@b.example", "nested": {"bank_account": "123", "status": "ok"}, "items": [{"phone": "1"}]}
    out = redact.redact_value(data)
    assert out["first_name"] == out["email"] == out["basic_salary"] == redact.REDACTED
    assert out["plan"] == "core" and out["nested"]["status"] == "ok" and out["nested"]["bank_account"] == redact.REDACTED
    assert out["note"] == "mail [EMAIL]" and out["items"][0]["phone"] == redact.REDACTED


def test_C10_the_logging_filter_redacts_message_arguments_and_tracebacks():
    records = []
    class Grab(logging.Handler):
        def emit(self, record):
            records.append(record.getMessage() + (record.exc_text or ""))
    log = logging.getLogger("privacy.egress.test")
    log.setLevel(logging.DEBUG)
    h = Grab()
    h.addFilter(redact.RedactingFilter())
    log.addHandler(h)
    try:
        log.info("sign-in for %s with token=%s", "alice@corp.example", "abc123secret")
        try:
            raise ValueError("bad value for CANARY-IBAN-A1-000111")
        except ValueError:
            log.exception("failed")
    finally:
        log.removeHandler(h)
    text = " ".join(records)
    assert "alice@corp.example" not in text and "abc123secret" not in text and "CANARY-IBAN" not in text


def test_the_filter_is_installed_on_the_applications_log_handlers():
    import app.main  # noqa: F401
    root = logging.getLogger()
    assert any(isinstance(f, redact.RedactingFilter) for h in root.handlers for f in h.filters) or any(isinstance(f, redact.RedactingFilter) for f in root.filters)


def test_D07_the_error_tracker_hook_removes_bodies_headers_user_and_local_variables():
    event = {"request": {"url": "/hr/x", "data": {"salary": 5}, "headers": {"authorization": "Bearer abcdefghijkl"}, "cookies": "s=1", "query_string": "email=a@b.example"},
             "user": {"email": "a@b.example"}, "message": "failed for a@b.example",
             "exception": {"values": [{"value": "bad CANARY-IBAN-A1-000111", "stacktrace": {"frames": [{"vars": {"password": "x"}, "function": "f"}]}}]},
             "breadcrumbs": {"values": [{"message": "ctx a@b.example", "data": {"x": 1}}]}}
    out = redact.scrub_error_event(event)
    assert out["request"] == {"url": "/hr/x"} and "user" not in out
    assert "a@b.example" not in str(out) and "CANARY-IBAN" not in str(out) and "vars" not in str(out) and "password" not in str(out)
    assert redact.scrub_error_event(None) is None, "a hook that cannot scrub sends nothing"


def test_F03_the_leakage_canary_none_of_the_main_flows_logs_a_sensitive_value(world, caplog):
    """Run the flows with planted canaries and a log handler that has NO redaction: the code itself must not emit them."""
    caplog.set_level(logging.DEBUG)
    handler = caplog.handler
    for f in list(handler.filters):
        handler.removeFilter(f)
    world.get("a_admin", "/hr/employee-management/employees")
    world.get("a_admin", f"/hr/employee-management/employees/{world.u['a_emp1'].id}")
    world.get("a_admin", f"/hr/employee-management/employees/{world.u['a_emp1'].id}/profile")
    world.get("b_admin", f"/hr/employee-management/employees/{world.u['a_emp1'].id}")          # cross-tenant guess
    world.get("platform", "/hr/employee-management/employees")
    world.get("platform", "/super-admin/organizations/1")
    world.get("platform", "/super-admin/activity")
    world.get("platform", "/super-admin/audit-logs")
    world.get("platform", "/super-admin/users")
    world.client.post("/auth/login", json={"email": CANARY["email_a1"], "password": "wrong-password-CANARY"})
    world.client.post("/auth/forgot-password", json={"email": CANARY["email_a1"]})
    logged = "\n".join(r.getMessage() for r in caplog.records)
    assert not all_canaries_in(logged), [c for c in all_canaries_in(logged)]
    assert "wrong-password-CANARY" not in logged


def test_D08_a_client_error_never_carries_a_stack_trace_or_sql(world):
    r = world.get("a_admin", "/hr/employee-management/employees/not-a-number")
    assert r.status_code in (404, 422)
    for needle in ("Traceback", "sqlalchemy", "SELECT ", "psycopg", "File \"", "site-packages"):
        assert needle not in r.text
    boom = world.get("a_admin", "/hr/employee-management/employees/99999999999999999999")
    for needle in ("Traceback", "sqlalchemy", "SELECT ", "psycopg", "site-packages"):
        assert needle not in boom.text
