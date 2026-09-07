import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.modules.super_admin.models import EmailDeliveryLog
from app.services.email_service import (
    _load_template,
    _render_template,
    _log_email_delivery,
    send_approval_email,
    send_evaluation_started_email,
    send_evaluation_halfway_email,
    send_document_assigned_email,
    send_policy_acknowledgement_requested_email,
    send_performance_review_assigned_email,
    send_performance_review_submitted_email,
)

@pytest.fixture
def db():
    """Isolated in-memory SQLite session."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def test_load_templates_exist():
    """Verify that key generated templates are loadable and non-empty."""
    templates_to_check = [
        "welcome.html",
        "org_admin_password_changed.html",
        "evaluation_started.html",
        "evaluation_halfway.html",
        "document_assigned.html",
        "policy_acknowledgement_requested.html",
        "performance_review_assigned.html",
        "performance_review_submitted.html",
        "payment_received.html",
        "past_due_notice.html",
    ]
    for tmpl in templates_to_check:
        content = _load_template(tmpl)
        assert content != "", f"Template {tmpl} should exist and be non-empty"
        assert "Zoiko" in content, f"Template {tmpl} should contain brand string Zoiko"


def test_render_template_conditionals_and_vars():
    """Test string substitution and conditional blocks in _render_template."""
    template = "Hello {{first_name}}! {{#if action_url}}<a href='{{action_url}}'>Link</a>{{/if}}"
    res1 = _render_template(template, {"first_name": "Alice", "action_url": "https://example.com"})
    assert res1 == "Hello Alice! <a href='https://example.com'>Link</a>"

    res2 = _render_template(template, {"first_name": "Bob", "action_url": None})
    assert res2 == "Hello Bob! "


def test_log_email_delivery_persistence(db):
    """Verify _log_email_delivery creates records in super_admin_email_delivery_logs."""
    _log_email_delivery(
        email="testuser@example.com",
        template_name="welcome.html",
        subject="Welcome to Zoiko HR",
        status="sent",
        organization_id=42,
        context_data={"first_name": "Test"},
        db=db,
    )

    logs = db.query(EmailDeliveryLog).filter(EmailDeliveryLog.recipient_email == "testuser@example.com").all()
    assert len(logs) == 1
    assert logs[0].template_name == "welcome.html"
    assert logs[0].status == "sent"
    assert logs[0].organization_id == 42
    assert logs[0].context_data == {"first_name": "Test"}


def test_send_helper_functions_log_audit(db, monkeypatch):
    """Verify helper functions invoke sending flow and create audit log records."""
    import smtplib
    from unittest.mock import MagicMock
    mock_smtp = MagicMock()
    monkeypatch.setattr(smtplib, "SMTP_SSL", lambda *args, **kwargs: mock_smtp)
    monkeypatch.setattr(smtplib, "SMTP", lambda *args, **kwargs: mock_smtp)

    # Test document assigned email helper
    send_document_assigned_email(
        email="employee@example.com",
        first_name="Jane",
        document_name="Employment Agreement",
        due_at_local="2026-10-01",
        db=db,
        organization_id=10,
    )

    log = db.query(EmailDeliveryLog).filter(
        EmailDeliveryLog.recipient_email == "employee@example.com",
        EmailDeliveryLog.template_name == "document_assigned.html",
    ).first()
    assert log is not None
    assert log.status in ("sent", "failed")  # SMTP send recorded in log
    assert log.organization_id == 10

    # Test policy acknowledgement helper
    send_policy_acknowledgement_requested_email(
        email="policy_user@example.com",
        first_name="John",
        policy_display_name="Code of Conduct",
        due_at_local="2026-10-15",
        db=db,
        organization_id=10,
    )
    log_pol = db.query(EmailDeliveryLog).filter(
        EmailDeliveryLog.recipient_email == "policy_user@example.com",
        EmailDeliveryLog.template_name == "policy_acknowledgement_requested.html",
    ).first()
    assert log_pol is not None

    # Test performance review assigned helper
    send_performance_review_assigned_email(
        email="perf_user@example.com",
        first_name="Sarah",
        cycle_name="Q3 Performance Review",
        due_at_local="2026-11-01",
        db=db,
        organization_id=10,
    )
    log_perf = db.query(EmailDeliveryLog).filter(
        EmailDeliveryLog.recipient_email == "perf_user@example.com",
        EmailDeliveryLog.template_name == "performance_review_assigned.html",
    ).first()
    assert log_perf is not None
