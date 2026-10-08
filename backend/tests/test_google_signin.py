"""ZHR-4: Sign in with Google. Only people who already have an account can use it, the browser is bound to the sign-in it
started, a one-time ticket (never the tokens) goes through the URL, and the same sign-in rules apply as for a password."""

import time
from datetime import date
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.core.rate_limiter import limiter
from app.database import Base, get_db
from app.modules.employee import google_auth
from app.modules.hr.models import Organization, OrganizationStatus


@pytest.fixture(autouse=True)
def _no_rate_limit():
    limiter.enabled = False
    yield
    limiter.enabled = True


@pytest.fixture
def env(monkeypatch):
    from app.main import app
    from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole

    monkeypatch.setattr("app.modules.billing.service.evaluation_access_block_reason", lambda db, org_id: None)
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "client-id.apps.googleusercontent.com")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "secret")
    monkeypatch.setattr(settings, "API_BASE_URL", "https://api.example.com")
    monkeypatch.setattr(settings, "FRONTEND_URL", "https://app.example.com")
    monkeypatch.setattr(settings, "GOOGLE_REDIRECT_URI", "")

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add(Organization(id=1, name="A", status=OrganizationStatus.ACTIVE))
    s.commit()

    def person(email, n, active=True):
        return Employee(email=email, hashed_password="x", employee_code=f"C{n}", role=UserRole.EMPLOYEE, first_name="Pat", last_name="Lee" if n == 1 else "Gone",
                        job_title="t", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, is_active=active, date_of_joining=date.today(), organization_id=1)

    ann, gone = person("ann@example.com", 1), person("gone@example.com", 2, active=False)
    s.add_all([ann, gone])
    s.commit()
    app.dependency_overrides[get_db] = lambda: s
    c = TestClient(app, raise_server_exceptions=False, follow_redirects=False)
    c.db, c.ann, c.app = s, ann, app
    yield c
    app.dependency_overrides.pop(get_db, None)
    s.close()
    engine.dispose()


def _start(c):
    r = c.get("/auth/google/login")
    assert r.status_code == 302, r.text
    return r, parse_qs(urlparse(r.headers["location"]).query)


def _call_back(c, monkeypatch, email="ann@example.com", problem=None):
    monkeypatch.setattr(google_auth, "verified_email_for_code", lambda code: (None, problem) if problem else (email, None))
    _, q = _start(c)
    return c.get("/auth/google/callback", params={"code": "abc", "state": q["state"][0]})


def _query(r):
    return parse_qs(urlparse(r.headers["location"]).query)


def test_status_says_whether_google_sign_in_is_set_up(env, monkeypatch):
    assert env.get("/auth/google/status").json() == {"enabled": True}
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "")
    assert env.get("/auth/google/status").json() == {"enabled": False}


def test_starting_sends_the_browser_to_google_with_the_right_details_and_a_cookie(env):
    r, q = _start(env)
    assert r.headers["location"].startswith("https://accounts.google.com/o/oauth2/v2/auth?")
    assert q["client_id"] == ["client-id.apps.googleusercontent.com"] and q["response_type"] == ["code"]
    assert q["redirect_uri"] == ["https://api.example.com/auth/google/callback"]
    assert "openid" in q["scope"][0] and "email" in q["scope"][0] and q["state"][0]
    cookie = r.headers["set-cookie"]
    assert google_auth.NONCE_COOKIE in cookie and "HttpOnly" in cookie and "samesite=lax" in cookie.lower()


def test_when_google_is_not_set_up_the_person_is_sent_back_with_a_clear_reason(env, monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "")
    r = env.get("/auth/google/login")
    assert r.status_code == 302 and r.headers["location"] == "https://app.example.com/login?google_error=not_configured"


def test_a_known_google_email_gets_a_ticket_and_the_ticket_becomes_real_tokens_once(env, monkeypatch):
    r = _call_back(env, monkeypatch)
    q = _query(r)
    assert r.headers["location"].startswith("https://app.example.com/login?") and "google_ticket" in q and "access_token" not in r.headers["location"]
    ticket = q["google_ticket"][0]
    done = env.post("/auth/google/exchange", json={"ticket": ticket})
    assert done.status_code == 200, done.text
    body = done.json()
    assert body["access_token"] and body["refresh_token"] and body["employee"]["email"] == "ann@example.com"
    again = env.post("/auth/google/exchange", json={"ticket": ticket})
    assert again.status_code == 401, "a ticket works once"
    me = env.get("/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200 and me.json()["email"] == "ann@example.com"


def test_the_email_match_ignores_capitals(env, monkeypatch):
    env.ann.email = "Ann@Example.com"
    env.db.commit()
    r = _call_back(env, monkeypatch, email="ann@example.com")
    assert "google_ticket" in _query(r)


def test_nobody_is_created_and_an_unknown_email_is_told_so(env, monkeypatch):
    from app.modules.employee.models import Employee
    before = env.db.query(Employee).count()
    r = _call_back(env, monkeypatch, email="stranger@example.com")
    assert _query(r) == {"google_error": ["no_account"]}
    assert env.db.query(Employee).count() == before


def test_an_unverified_or_failed_google_answer_is_refused(env, monkeypatch):
    assert _query(_call_back(env, monkeypatch, problem="unverified")) == {"google_error": ["unverified"]}
    assert _query(_call_back(env, monkeypatch, problem="failed")) == {"google_error": ["failed"]}


def test_a_deactivated_account_cannot_get_in_through_google(env, monkeypatch):
    r = _call_back(env, monkeypatch, email="gone@example.com")
    ticket = _query(r)["google_ticket"][0]
    refused = env.post("/auth/google/exchange", json={"ticket": ticket})
    assert refused.status_code == 401 and "deactivated" in refused.text


def test_a_callback_not_started_by_this_browser_or_with_a_forged_state_is_refused(env, monkeypatch):
    monkeypatch.setattr(google_auth, "verified_email_for_code", lambda code: ("ann@example.com", None))
    _, q = _start(env)
    other = TestClient(env.app, raise_server_exceptions=False, follow_redirects=False)      # a browser that never started a sign-in: no cookie
    r = other.get("/auth/google/callback", params={"code": "abc", "state": q["state"][0]})
    assert _query(r) == {"google_error": ["expired"]}
    forged = env.get("/auth/google/callback", params={"code": "abc", "state": q["state"][0][:-3] + "xyz"})
    assert _query(forged) == {"google_error": ["expired"]}
    assert _query(env.get("/auth/google/callback", params={"code": "abc"})) == {"google_error": ["expired"]}


def test_cancelling_at_google_comes_back_with_a_friendly_reason(env):
    _start(env)
    assert _query(env.get("/auth/google/callback", params={"error": "access_denied"})) == {"google_error": ["cancelled"]}


def test_tickets_cannot_be_forged_or_kept_past_their_minute_or_used_as_access_tokens(env, monkeypatch):
    assert env.post("/auth/google/exchange", json={"ticket": "garbage"}).status_code == 401
    forged = google_auth.make_ticket(env.ann.id)
    assert env.post("/auth/google/exchange", json={"ticket": forged[:-2] + "ab"}).status_code == 401
    old = google_auth.make_ticket(env.ann.id)
    real_time = time.time
    monkeypatch.setattr(google_auth.time, "time", lambda: real_time() + google_auth.TICKET_TTL_SECONDS + 5)
    assert env.post("/auth/google/exchange", json={"ticket": old}).status_code == 401
    monkeypatch.undo()
    fresh = google_auth.make_ticket(env.ann.id)
    assert env.get("/auth/me", headers={"Authorization": f"Bearer {fresh}"}).status_code == 401, "a ticket is not an access token"


def test_a_password_sign_in_still_works_after_the_refactor(env):
    from app.core.security import hash_password
    env.ann.hashed_password = hash_password("Passw0rd1")
    env.db.commit()
    ok = env.post("/auth/login", json={"email": "ann@example.com", "password": "Passw0rd1"})
    assert ok.status_code == 200 and ok.json()["access_token"]
    assert env.post("/auth/login", json={"email": "ann@example.com", "password": "wrong"}).status_code == 401
