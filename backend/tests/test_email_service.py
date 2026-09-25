import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.modules.super_admin.models import EmailDeliveryLog
from app.services.email_service import (
    _log_email_delivery,
    render_email,
    send_approval_email,
    send_evaluation_started_email,
    send_evaluation_halfway_email,
    send_document_assigned_email,
    send_approved,
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


def test_key_templates_render_with_zoiko_hr_brand():
    """Key templates render through the shared layout with the Zoiko HR brand."""
    context = {
        "subject": "s", "first_name": "Jane", "workspace_name": "Acme", "login_url": "https://app.zoikohr.com/login",
        "event_time_local": "Sep 25, 2026", "timezone": "UTC", "action_url": "https://app.zoikohr.com/x",
        "organization_name": "Acme", "evaluation_end_date": "Oct 1", "document_name": "Doc", "due_at_local": "Oct 1",
        "cycle_name": "Q3",
    }
    for tmpl in (
        "welcome.html",
        "org_admin_password_changed.html",
        "evaluation_started.html",
        "evaluation_halfway.html",
        "document_assigned.html",
        "approved.html",
        "suspended.html",
        "performance_review_assigned.html",
        "performance_review_submitted.html",
    ):
        html = render_email(tmpl, context).html
        assert 'alt="Zoiko HR"' in html, tmpl
        assert "Zoiko Tech Inc." in html, tmpl


def test_login_url_follows_frontend_url(monkeypatch):
    from app.config import settings
    from app.services import email_service

    monkeypatch.setattr(settings, "FRONTEND_URL", "https://app.zoikohr.com/")
    assert email_service._login_url() == "https://app.zoikohr.com/login"


def test_subject_rendering_is_strict_and_single_line():
    from app.services.email_service import _render_subject

    assert _render_subject("Welcome to {{company_name}}\n now", {"company_name": "Acme"}) == "Welcome to Acme now"
    with pytest.raises(Exception):
        _render_subject("Hi {{missing}}", {})


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

    # Test organization approval lifecycle helper (approved template)
    send_approved(
        email="org_admin@example.com",
        org_name="Acme Corp",
        recipient_first_name="John",
        db=db,
        organization_id=10,
    )
    log_approval = db.query(EmailDeliveryLog).filter(
        EmailDeliveryLog.recipient_email == "org_admin@example.com",
        EmailDeliveryLog.template_name == "approved.html",
    ).first()
    assert log_approval is not None
    assert log_approval.status in ("sent", "failed")  # SMTP send recorded in log

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
