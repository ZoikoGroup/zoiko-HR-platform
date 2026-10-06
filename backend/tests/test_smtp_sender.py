"""ZHR-2: mail goes out from the configured Zoiko HR address, never from a stale platform-setting row."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.modules.super_admin.models import PlatformSetting
from app.services import email_service as es


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine)()
    yield s
    s.close()
    engine.dispose()


def _env(monkeypatch, **vals):
    from app.config import settings
    for k, v in vals.items():
        monkeypatch.setattr(settings, k, v)


def _rows(db, **kv):
    for key, value in kv.items():
        db.add(PlatformSetting(key=key, value=value, category="email"))
    db.commit()


def test_a_stale_platform_setting_cannot_override_the_configured_sender(db, monkeypatch):
    _env(monkeypatch, SMTP_HOST="smtpout.secureserver.net", SMTP_USERNAME="info@zoikohr.com", SMTP_FROM_EMAIL="info@zoikohr.com", SMTP_PASSWORD="pw")
    _rows(db, smtp_from_email="hello@zoikoone.com", smtp_username="hello@zoikoone.com", smtp_host="smtp.zoikoone.com")
    got = es._get_smtp_settings(db=db)
    assert got["from_email"] == "info@zoikohr.com"
    assert got["username"] == "info@zoikohr.com" and got["host"] == "smtpout.secureserver.net" and got["password"] == "pw"


def test_a_platform_setting_fills_in_only_what_the_environment_leaves_empty(db, monkeypatch):
    _env(monkeypatch, SMTP_HOST="", SMTP_FROM_EMAIL="info@zoikohr.com")
    _rows(db, smtp_host="relay.example.com", smtp_from_email="other@example.com")
    got = es._get_smtp_settings(db=db)
    assert got["host"] == "relay.example.com"
    assert got["from_email"] == "info@zoikohr.com"


def test_the_registration_email_is_sent_from_the_zoiko_hr_address_and_name(db, monkeypatch):
    _env(monkeypatch, SMTP_HOST="h", SMTP_USERNAME="info@zoikohr.com", SMTP_FROM_EMAIL="info@zoikohr.com", SMTP_PASSWORD="pw")
    _rows(db, smtp_from_email="hello@zoikoone.com")
    sent = {}
    monkeypatch.setattr(es, "_deliver_via_smtp", lambda smtp, envelope_from, to, msg: (sent.update(envelope=envelope_from, header=msg["From"]), None)[1])
    assert es.send_registration_received("owner@acme.test", "Acme", db=db) is True
    assert sent["envelope"] == "info@zoikohr.com"
    assert sent["header"] == "Zoiko HR <info@zoikohr.com>"
    assert "zoikoone" not in sent["header"].lower()
