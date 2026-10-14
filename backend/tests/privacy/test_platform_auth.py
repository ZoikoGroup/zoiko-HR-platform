"""Platform account hardening (ZHR-PRIV-001 B01, B02, B04, B06).

B01  accounts belong to named people (generic / shared addresses refused)
B02  second factor at sign-in; a code works once; step-up for sensitive actions
B04  a leaver or a changed role ends every session at once; platform sessions are short
B06  platform administrators are added and removed by request, approved by a DIFFERENT administrator
"""
import time

import pyotp
import pytest

from app.config import settings
from app.core.privacy import accounts, approvals, mfa
from app.core.security import decode_access_token
from app.modules.employee.models import Employee, UserRole
from app.modules.super_admin.models import ApprovalRequest
from tests.privacy.conftest import _emp
from tests.privacy.support import PW, token_for


# ── B01 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("email,generic", [
    ("admin@zoiko.com", True), ("Admin01@zoiko.com", True), ("support@zoiko.com", True), ("super_admin@zoiko.com", True), ("superadmin2@zoiko.com", True),
    ("support.team@zoiko.com", True), ("root@zoiko.com", True), ("it@zoiko.com", True), ("noreply@zoiko.com", True),
    ("priya.shah@zoiko.com", False), ("rahul@zoiko.com", False), ("a.mehta@zoiko.com", False), ("administrative.officer@zoiko.com", False),
])
def test_B01_generic_and_shared_addresses_are_recognised(email, generic):
    assert accounts.is_generic_account(email) is generic


def test_B01_a_generic_platform_account_cannot_be_requested_and_the_bootstrap_refuses_one(world, monkeypatch):
    r = world.post("platform", "/super-admin/platform-accounts", json={"email": "support@zoiko-ops.example.com", "first_name": "Sup", "last_name": "Port"})
    assert r.status_code == 400 and "named person" in r.text
    monkeypatch.setattr(settings, "SUPER_ADMIN_SETUP_KEY", "k")
    boot = world.client.post("/super-admin/bootstrap", json={"setup_key": "k", "email": "admin@zoiko-ops.example.com", "password": "Passw0rd1x", "first_name": "A", "last_name": "B"})
    assert boot.status_code == 400 and "named person" in boot.text


# ── B02 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
def _enroll(world, who="platform"):
    user = world.u[who]
    start = world.client.post("/auth/mfa/enroll/start", json={"email": user.email, "password": PW})
    assert start.status_code == 200, start.text
    return start.json()["secret"]


def _code(secret, offset=0):
    return pyotp.TOTP(secret).at(time.time() + 30 * offset)


def test_B02_enrolment_returns_the_secret_once_stores_it_encrypted_and_signs_in(world):
    secret = _enroll(world)
    user = world.db.get(Employee, world.u["platform"].id)
    assert user.mfa_secret and secret not in user.mfa_secret and not user.mfa_enabled, "stored encrypted and not active yet"
    wrong = world.client.post("/auth/mfa/enroll/confirm", json={"email": user.email, "password": PW, "code": "000000"})
    assert wrong.status_code == 401 and wrong.json()["error"] == mfa.MFA_INVALID_CODE
    ok = world.client.post("/auth/mfa/enroll/confirm", json={"email": user.email, "password": PW, "code": _code(secret)})
    assert ok.status_code == 200, ok.text
    token = ok.json()["access_token"]
    assert decode_access_token(token)["mfa_at"] >= int(time.time()) - 5
    world.db.refresh(user)
    assert user.mfa_enabled and user.mfa_enrolled_at
    again = world.client.post("/auth/mfa/enroll/start", json={"email": user.email, "password": PW})
    assert again.status_code == 400, "an active factor is never replaced from the sign-in screen"


def test_B02_once_enrolled_every_sign_in_needs_a_fresh_code_and_a_code_works_once(world):
    secret = _enroll(world)
    user = world.u["platform"]
    world.client.post("/auth/mfa/enroll/confirm", json={"email": user.email, "password": PW, "code": _code(secret)})
    login = lambda **kw: world.client.post("/auth/login", json={"email": user.email, "password": PW, **kw})
    no_code = login()
    assert no_code.status_code == 401 and no_code.json()["error"] == mfa.MFA_REQUIRED_CODE
    assert login(mfa_code="123456").status_code == 401
    # the enrolment code is spent: replaying it fails even though it is still inside its time window
    assert login(mfa_code=_code(secret)).status_code == 401
    good = login(mfa_code=_code(secret, offset=1))
    assert good.status_code == 200, good.text
    assert login(mfa_code=_code(secret, offset=1)).status_code == 401, "the same code cannot be used twice"
    claims = decode_access_token(good.json()["access_token"])
    assert claims["role"] == "super_admin" and claims["aud"] == "zoiko-hr" and claims["mfa_at"]


def test_B02_when_required_an_account_without_a_factor_is_told_to_enrol(world, monkeypatch):
    monkeypatch.setattr(settings, "PLATFORM_MFA_REQUIRED", True)
    r = world.client.post("/auth/login", json={"email": world.u["platform"].email, "password": PW})
    assert r.status_code == 403 and r.json()["error"] == mfa.MFA_ENROLLMENT_REQUIRED_CODE
    tenant = world.client.post("/auth/login", json={"email": world.u["a_admin"].email, "password": PW})
    assert tenant.status_code == 200, "tenant accounts are not asked"
    monkeypatch.setattr(settings, "PLATFORM_MFA_REQUIRED", False)
    assert world.client.post("/auth/login", json={"email": world.u["platform"].email, "password": PW}).status_code == 200


def test_B02_the_enrolment_endpoints_do_not_reveal_which_accounts_exist_or_are_platform(world):
    for who in ("a_admin", "a_emp1"):
        r = world.client.post("/auth/mfa/enroll/start", json={"email": world.u[who].email, "password": PW})
        assert r.status_code == 401 and "Invalid email or password" in r.text, who
    assert world.client.post("/auth/mfa/enroll/start", json={"email": "nobody@nowhere.example.com", "password": PW}).status_code == 401
    assert world.client.post("/auth/mfa/enroll/start", json={"email": world.u["platform"].email, "password": "wrong"}).status_code == 401


def test_B07_step_up_gives_a_token_with_a_fresh_check_and_the_dependency_demands_one(world):
    from fastapi import Depends, FastAPI
    from fastapi.testclient import TestClient
    secret = _enroll(world)
    user = world.u["platform"]
    world.client.post("/auth/mfa/enroll/confirm", json={"email": user.email, "password": PW, "code": _code(secret)})
    plain = token_for(user)                                                   # a session token with no MFA check in it
    assert world.client.post("/auth/mfa/step-up", json={"code": "000000"}, headers=plain).status_code == 401
    up = world.client.post("/auth/mfa/step-up", json={"code": _code(secret, offset=1)}, headers=plain)
    assert up.status_code == 200, up.text
    fresh = {"Authorization": f"Bearer {up.json()['access_token']}"}
    mini = FastAPI()

    @mini.get("/sensitive", dependencies=[Depends(mfa.require_fresh_mfa(300))])
    def sensitive():
        return {"ok": True}

    c = TestClient(mini)
    assert c.get("/sensitive", headers=plain).status_code == 403 and c.get("/sensitive", headers=plain).json()["error"] == mfa.MFA_STEP_UP_REQUIRED if "error" in c.get("/sensitive", headers=plain).json() else True
    assert c.get("/sensitive", headers=plain).status_code == 403
    assert c.get("/sensitive", headers=fresh).status_code == 200
    assert c.get("/sensitive").status_code == 403


# ── B04 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
def test_B04_platform_access_tokens_are_short_and_refresh_tokens_cannot_be_used_as_access_tokens(world):
    r = world.client.post("/auth/login", json={"email": world.u["platform"].email, "password": PW}).json()
    access, refresh = decode_access_token(r["access_token"]), decode_access_token(r["refresh_token"])
    assert access["exp"] - access["iat"] <= settings.PLATFORM_IDLE_TIMEOUT_MINUTES * 60 + 5
    assert refresh["exp"] - refresh["iat"] <= settings.PLATFORM_SESSION_MAX_HOURS * 3600 + 5 and refresh["typ"] == "refresh"
    assert world.client.get("/auth/me", headers={"Authorization": f"Bearer {r['refresh_token']}"}).status_code == 401, "a refresh token is not an access token"
    assert world.client.post("/auth/refresh", json={"refresh_token": r["access_token"]}).status_code == 401, "an access token is not a refresh token"
    renewed = world.client.post("/auth/refresh", json={"refresh_token": r["refresh_token"]})
    assert renewed.status_code == 200
    again = decode_access_token(renewed.json()["access_token"])
    assert again["exp"] - again["iat"] <= settings.PLATFORM_IDLE_TIMEOUT_MINUTES * 60 + 5


def test_B04_a_tenant_users_tokens_keep_their_normal_lifetime(world):
    r = world.client.post("/auth/login", json={"email": world.u["a_admin"].email, "password": PW}).json()
    access = decode_access_token(r["access_token"])
    assert access["exp"] - access["iat"] > settings.PLATFORM_IDLE_TIMEOUT_MINUTES * 60


def test_B04_deactivating_an_account_ends_its_sessions_at_once(world):
    login = world.client.post("/auth/login", json={"email": world.u["a_hr"].email, "password": PW}).json()
    headers = {"Authorization": f"Bearer {login['access_token']}"}
    assert world.client.get("/auth/me", headers=headers).status_code == 200
    r = world.post("a_admin", f"/hr/admin/users/{world.u['a_hr'].id}/suspend")
    assert r.status_code == 200, r.text
    assert world.client.get("/auth/me", headers=headers).status_code == 401
    assert world.client.post("/auth/refresh", json={"refresh_token": login["refresh_token"]}).status_code == 401


def test_B04_changing_a_role_ends_the_old_sessions(world):
    login = world.client.post("/auth/login", json={"email": world.u["a_emp2"].email, "password": PW}).json()
    old = {"Authorization": f"Bearer {login['access_token']}"}
    time.sleep(1.1)                                   # tokens have whole-second resolution
    r = world.put("a_admin", f"/hr/admin/users/{world.u['a_emp2'].id}", json={"role": "manager"})
    assert r.status_code == 200, r.text
    assert world.client.get("/auth/me", headers=old).status_code == 401, "the token that said 'employee' no longer works"
    again = world.client.post("/auth/login", json={"email": world.u["a_emp2"].email, "password": PW})
    assert again.status_code == 200 and decode_access_token(again.json()["access_token"])["role"] == "manager"


def test_B04_an_inactive_account_is_refused_on_every_request_even_with_a_valid_token(world):
    token = token_for(world.u["a_hr"])
    world.db.get(Employee, world.u["a_hr"].id).is_active = False
    world.db.commit()
    assert world.client.get("/auth/me", headers=token).status_code == 401


# ── B06 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
@pytest.fixture
def second_admin(world):
    world.u["platform2"] = _emp(world.db, "second.person@zoiko-ops.example.com", UserRole.SUPER_ADMIN, None, "Second", "Operator")
    world.u["platform3"] = _emp(world.db, "third.person@zoiko-ops.example.com", UserRole.SUPER_ADMIN, None, "Third", "Operator")
    return world


def test_B06_a_new_platform_administrator_needs_a_different_administrators_approval(second_admin, monkeypatch):
    w = second_admin
    monkeypatch.setattr("app.modules.employee.service._notify_email_async", lambda *a, **k: None)
    monkeypatch.setattr("app.modules.employee.service._notify_email", lambda *a, **k: True)
    asked = w.post("platform", "/super-admin/platform-accounts", json={"email": "new.person@zoiko-ops.example.com", "first_name": "New", "last_name": "Person"})
    assert asked.status_code == 202, asked.text
    rid = asked.json()["id"]
    assert w.db.query(Employee).filter(Employee.email == "new.person@zoiko-ops.example.com").count() == 0, "nothing exists until it is approved"
    own = w.post("platform", f"/super-admin/platform-accounts/requests/{rid}/approve")
    assert own.status_code == 403 and "own request" in own.text, "nobody approves their own request"
    assert w.get("platform2", "/super-admin/platform-accounts/requests").json()["requests"][0]["can_decide"] is True
    assert w.get("platform", "/super-admin/platform-accounts/requests").json()["requests"][0]["can_decide"] is False
    tenant_try = w.post("a_admin", f"/super-admin/platform-accounts/requests/{rid}/approve")
    assert tenant_try.status_code in (401, 403)
    done = w.post("platform2", f"/super-admin/platform-accounts/requests/{rid}/approve")
    assert done.status_code == 200, done.text
    created = w.db.query(Employee).filter(Employee.email == "new.person@zoiko-ops.example.com").one()
    assert created.role == UserRole.SUPER_ADMIN and created.organization_id is None
    again = w.post("platform3", f"/super-admin/platform-accounts/requests/{rid}/approve")
    assert again.status_code == 400, "an approval runs once"


def test_B06_rejecting_or_letting_a_request_expire_creates_nothing(second_admin):
    w = second_admin
    rid = w.post("platform", "/super-admin/platform-accounts", json={"email": "never.person@zoiko-ops.example.com", "first_name": "N", "last_name": "P"}).json()["id"]
    assert w.post("platform2", f"/super-admin/platform-accounts/requests/{rid}/reject").status_code == 200
    assert w.post("platform3", f"/super-admin/platform-accounts/requests/{rid}/approve").status_code == 400
    rid2 = w.post("platform", "/super-admin/platform-accounts", json={"email": "late.person@zoiko-ops.example.com", "first_name": "L", "last_name": "P"}).json()["id"]
    from datetime import datetime, timedelta
    req = w.db.get(ApprovalRequest, rid2)
    req.expires_at = datetime.utcnow() - timedelta(minutes=1)
    w.db.commit()
    assert w.post("platform2", f"/super-admin/platform-accounts/requests/{rid2}/approve").status_code == 400
    assert w.db.query(Employee).filter(Employee.email.like("%never.person%") | Employee.email.like("%late.person%")).count() == 0


def test_B06_removing_a_platform_administrator_is_a_request_too_and_ends_their_sessions(second_admin):
    w = second_admin
    victim_login = w.client.post("/auth/login", json={"email": w.u["platform3"].email, "password": PW}).json()
    victim = {"Authorization": f"Bearer {victim_login['access_token']}"}
    assert w.client.get("/auth/me", headers=victim).status_code == 200
    self_ask = w.post("platform", f"/super-admin/platform-accounts/{w.u['platform'].id}/deactivation-request")
    assert self_ask.status_code == 400
    rid = w.post("platform", f"/super-admin/platform-accounts/{w.u['platform3'].id}/deactivation-request").json()["id"]
    time.sleep(1.1)
    assert w.post("platform", f"/super-admin/platform-accounts/requests/{rid}/approve").status_code == 403
    assert w.post("platform2", f"/super-admin/platform-accounts/requests/{rid}/approve").status_code == 200
    assert w.client.get("/auth/me", headers=victim).status_code == 401
    rid2 = w.post("platform", f"/super-admin/platform-accounts/{w.u['platform2'].id}/deactivation-request")
    assert rid2.status_code == 400 and "at least two" in rid2.text, "the platform can never be left with one administrator"


def test_B06_a_tenant_user_cannot_reach_the_platform_account_routes(world):
    for who in ("a_admin", "a_hr", "a_emp1"):
        assert world.get(who, "/super-admin/platform-accounts").status_code == 403, who


# ── the generic-account report ───────────────────────────────────────────────────────────────────────────────────────
def test_B01_the_report_script_flags_generic_accounts_and_refuses_to_strand_the_platform(world, monkeypatch, capsys):
    from scripts import privacy_flag_generic_accounts as script
    _emp(world.db, "admin@zoiko-ops.example.com", UserRole.SUPER_ADMIN, None, "Shared", "Account")
    monkeypatch.setattr(script, "SessionLocal", lambda: world.db)
    monkeypatch.setattr(world.db, "close", lambda: None)
    assert script.main([]) == 0
    out = capsys.readouterr().out
    assert "GENERIC" in out and "admin@zoiko-ops.example.com" in out and "report only" in out
    assert script.main(["--disable"]) == 1, "only one named active administrator: refuses"
    assert world.db.query(Employee).filter(Employee.email == "admin@zoiko-ops.example.com").one().is_active is True
