"""
Tests for Organization Registration OTP Flow
--------------------------------------------
Covers:
  1. Sending registration OTP to organization's registered email.
  2. Rejecting invalid or disposable email addresses.
  3. Verifying registration OTP endpoint (/auth/verify-registration-otp).
  4. Enforcing OTP when registered_email is provided in /auth/register.
  5. Rejecting invalid or expired OTP during registration.
  6. Successfully registering organization and admin with valid OTP.
  7. Preventing replay/reuse of consumed OTP.
  8. Superseding earlier OTPs upon resending.
"""
from datetime import datetime
import pathlib
import sys
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from app.database import Base, get_db
from app.core.exceptions import ZoikoException, zoiko_exception_handler, generic_exception_handler
from app.modules.employee.router import auth_router
from app.modules.employee import service as employee_service
from app.modules.employee.models import SecurityActionPurpose, SecurityActionToken
from app.modules.hr.models import Organization


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    engine.dispose()


@pytest.fixture
def client(db, monkeypatch):
    app = FastAPI()
    app.include_router(auth_router)

    def _override_db():
        yield db

    app.dependency_overrides[get_db] = _override_db

    from app.core.rate_limiter import limiter
    limiter.enabled = False
    app.state.limiter = limiter
    app.add_middleware(SlowAPIMiddleware)
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_exception_handler(ZoikoException, zoiko_exception_handler)
    app.add_exception_handler(Exception, generic_exception_handler)

    # Monkeypatch email delivery so no real SMTP connections are attempted
    monkeypatch.setattr("app.services.email_service.send_org_registration_otp_email", lambda *a, **k: True)
    monkeypatch.setattr("app.services.email_service.send_approval_email", lambda *a, **k: True)
    monkeypatch.setattr("app.services.email_service.send_registration_received", lambda *a, **k: True)
    monkeypatch.setattr("app.services.email_service.send_new_organization_created", lambda *a, **k: True)

    return TestClient(app, raise_server_exceptions=False)


def test_send_registration_otp_success(client, db):
    email = "contact@validcorp.com"
    r = client.post("/auth/send-registration-otp", json={
        "registered_email": email,
        "org_name": "Valid Corp Inc",
    })
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["success"] is True
    assert "Verification code sent" in data["message"]
    assert data["expires_in_seconds"] == 600

    token = db.query(SecurityActionToken).filter(
        SecurityActionToken.email == email,
        SecurityActionToken.purpose == SecurityActionPurpose.ORG_REGISTRATION_OTP,
    ).first()
    assert token is not None
    assert token.used_at is None
    assert token.expires_at > datetime.utcnow()


def test_send_registration_otp_rejects_disposable_email(client, strict_emails):
    r = client.post("/auth/send-registration-otp", json={
        "registered_email": "fake@mailinator.com",
        "org_name": "Fake Org",
    })
    assert r.status_code == 422


def test_verify_registration_otp_valid_and_invalid(client, db):
    email = "admin@testingcorp.com"
    res = employee_service.generate_and_send_registration_otp(db, email, "Testing Corp")
    assert res["success"] is True

    # Retrieve generated token
    token = db.query(SecurityActionToken).filter(
        SecurityActionToken.email == email,
        SecurityActionToken.purpose == SecurityActionPurpose.ORG_REGISTRATION_OTP,
    ).first()
    assert token is not None

    # Test invalid OTP
    r_bad = client.post("/auth/verify-registration-otp", json={
        "registered_email": email,
        "otp": "000000",
    })
    assert r_bad.status_code == 400
    assert "Invalid or expired" in r_bad.text


def test_register_enforces_otp_for_registered_email(client, db):
    payload = {
        "name": "Jane Admin",
        "email": "jane@acmecorp.com",
        "password": "Password123!",
        "organization": "Acme Corp International",
        "plan_code": "core",
        "billing_cycle": "monthly",
        "registered_email": "info@acmecorp.com",
    }
    # Calling register with registered_email but without OTP
    r = client.post("/auth/register", json=payload)
    assert r.status_code == 400
    assert "Verification code (OTP) is required" in r.text


def test_register_end_to_end_with_otp(client, db):
    reg_email = "corporate@apexsolutions.com"
    org_name = "Apex Solutions Ltd"

    # 1. Send OTP
    send_res = client.post("/auth/send-registration-otp", json={
        "registered_email": reg_email,
        "org_name": org_name,
    })
    assert send_res.status_code == 200

    # 2. Extract valid token from db to find matching 6-digit OTP
    token_row = db.query(SecurityActionToken).filter(
        SecurityActionToken.email == reg_email,
        SecurityActionToken.purpose == SecurityActionPurpose.ORG_REGISTRATION_OTP,
        SecurityActionToken.used_at.is_(None),
    ).first()
    assert token_row is not None

    # Find the matching 6-digit OTP from the hash
    found_otp = None
    for candidate in range(100000, 1000000):
        c_str = str(candidate)
        if employee_service._token_hash(f"{reg_email}:{c_str}") == token_row.token_hash:
            found_otp = c_str
            break
    assert found_otp is not None, "Generated OTP not found"

    # 3. Verify OTP via verify endpoint
    v_res = client.post("/auth/verify-registration-otp", json={
        "registered_email": reg_email,
        "otp": found_otp,
    })
    assert v_res.status_code == 200
    assert v_res.json()["valid"] is True

    # 4. Attempt registration with wrong OTP first
    reg_payload = {
        "name": "Alice Apex",
        "email": "alice@apexsolutions.com",
        "password": "SecurePass987!",
        "organization": org_name,
        "plan_code": "advanced",
        "billing_cycle": "monthly",
        "registered_email": reg_email,
        "otp": "999999",
    }
    r_bad = client.post("/auth/register", json=reg_payload)
    assert r_bad.status_code == 400
    assert "Invalid or expired" in r_bad.text

    # 5. Complete registration with correct OTP
    reg_payload["otp"] = found_otp
    r_ok = client.post("/auth/register", json=reg_payload)
    assert r_ok.status_code == 200, r_ok.text
    res_data = r_ok.json()
    assert "organization_id" in res_data

    # Verify organization in DB
    org = db.query(Organization).filter(Organization.id == res_data["organization_id"]).first()
    assert org is not None
    assert org.registered_email == reg_email

    # Verify token is now marked as used
    db.refresh(token_row)
    assert token_row.used_at is not None

    # 6. Attempt replay of the same OTP -> should fail
    r_replay = client.post("/auth/register", json={
        **reg_payload,
        "email": "another.admin@apexsolutions.com",
        "organization": "Apex Duplicate",
    })
    assert r_replay.status_code == 400
    assert "Invalid or expired" in r_replay.text


def test_resending_otp_invalidates_previous_otp(db):
    email = "security@cloudtech.com"
    # Send first OTP
    employee_service.generate_and_send_registration_otp(db, email, "Cloud Tech")
    first_token = db.query(SecurityActionToken).filter(
        SecurityActionToken.email == email,
        SecurityActionToken.purpose == SecurityActionPurpose.ORG_REGISTRATION_OTP,
    ).order_by(SecurityActionToken.id.desc()).first()
    assert first_token is not None

    # Send second OTP
    employee_service.generate_and_send_registration_otp(db, email, "Cloud Tech")
    db.refresh(first_token)
    # The first token is now revoked / used_at is populated
    assert first_token.used_at is not None

    # And a new unconsumed token exists
    second_token = db.query(SecurityActionToken).filter(
        SecurityActionToken.email == email,
        SecurityActionToken.purpose == SecurityActionPurpose.ORG_REGISTRATION_OTP,
        SecurityActionToken.used_at.is_(None),
    ).first()
    assert second_token is not None
    assert second_token.id != first_token.id

