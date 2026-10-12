"""ZHR-31 (password reset) and ZHR-32 (role list / user creation)."""

from datetime import date, datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.exceptions import ZoikoException, zoiko_exception_handler
from app.core.rate_limiter import limiter
from app.core.security import create_access_token, hash_password, verify_password
from app.database import Base, get_db
from app.modules.employee import router as emp_router
from app.modules.employee import service as emp_service
from app.modules.employee.models import (
    Employee, EmployeeStatus, EmploymentType, SecurityActionPurpose, SecurityActionToken, UserRole,
)
from app.modules.hr.models import Organization, OrganizationStatus, Department, Designation, EmployeeProfile
from app.modules.super_admin.models import AuditAction, AuditLog, EmailDeliveryLog

PW = "Passw0rd1"


@pytest.fixture(autouse=True)
def _no_rate_limit():
    limiter.enabled = False
    yield
    limiter.enabled = True


def _emp(db, email, role, org_id, first="Test", last=None):
    e = Employee(
        email=email, hashed_password=hash_password(PW), employee_code=f"C-{email}", role=role,
        first_name=first, last_name=last or role.value, job_title="t", is_active=True,
        employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE,
        date_of_joining=date.today(), organization_id=org_id,
    )
    db.add(e)
    db.commit()
    return e


def _token(user, iat=None):
    data = {"sub": user.email, "role": user.role.value, "id": user.id, "organization_id": user.organization_id}
    if iat is not None:
        data["iat"] = iat
    return {"Authorization": f"Bearer {create_access_token(data)}"}


@pytest.fixture
def world(monkeypatch):
    # Postgres-only advisory lock / code generators and the evaluation gate are
    # stubbed; everything else (roles, tokens, hashing, audit) is the real code.
    monkeypatch.setattr(emp_service, "_generate_employee_id", lambda db, organization_id: f"ID{organization_id or 0}{datetime.utcnow().microsecond}")
    counter = iter(range(1, 10_000))
    monkeypatch.setattr("app.core.code_generation.generate_employee_code", lambda db, organization_id=None: f"EC-{next(counter)}")
    monkeypatch.setattr("app.modules.billing.service.evaluation_access_block_reason", lambda db, org_id: None)
    sent = {"emails": [], "fail": None}

    def fake_reset_email(email, first_name, expires_at_local, timezone, action_url, organization_id=None, db=None):
        if sent["fail"]:
            db.add(EmailDeliveryLog(recipient_email=email, template_name="org_admin_password_reset.html",
                                    status="failed", error_message=sent["fail"]))
            db.commit()
            return False
        sent["emails"].append({"email": email, "url": action_url})
        return True

    monkeypatch.setattr("app.services.email_service.send_org_admin_password_reset_email", fake_reset_email)
    monkeypatch.setattr(emp_service, "_notify_email", lambda *a, **k: True)
    monkeypatch.setattr(emp_service, "_notify_email_async", lambda *a, **k: None)

    eng = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(eng)
    db = sessionmaker(bind=eng)()
    db.add_all([Organization(id=1, name="Acme", organization_name="Acme Ltd", status=OrganizationStatus.ACTIVE),
                Organization(id=2, name="Globex", organization_name="Globex Inc", status=OrganizationStatus.ACTIVE)])
    db.commit()
    users = {
        "sa": _emp(db, "root@example.com", UserRole.SUPER_ADMIN, None),
        "admin1": _emp(db, "admin1@example.com", UserRole.ADMIN, 1),
        "hr1": _emp(db, "hr1@example.com", UserRole.HR_ADMIN, 1),
        "emp1": _emp(db, "emp1@example.com", UserRole.EMPLOYEE, 1),
        "admin2": _emp(db, "admin2@example.com", UserRole.ADMIN, 2),
        "emp2": _emp(db, "emp2@example.com", UserRole.EMPLOYEE, 2),
    }
    app = FastAPI()
    app.include_router(emp_router.auth_router)
    app.include_router(emp_router.employee_router)
    app.add_exception_handler(ZoikoException, zoiko_exception_handler)
    app.dependency_overrides[get_db] = lambda: db
    return {"db": db, "c": TestClient(app), "u": users, "sent": sent}


def _audit(db, event):
    return [l for l in db.query(AuditLog).all() if (l.details or {}).get("event") == event]


# ═════════════════════════════ ZHR-32: roles & creation ═════════════════════════════

def test_roles_endpoint_is_role_aware_and_described(world):
    c, u = world["c"], world["u"]
    sa = c.get("/hr/admin/roles", headers=_token(u["sa"])).json()["roles"]
    assert [r["value"] for r in sa] == ["super_admin", "admin", "hr_admin", "billing_admin", "manager", "employee"]
    assert all(r["label"] and r["description"] and r["scope"] in ("platform", "organization") for r in sa)
    assert {r["value"]: r["scope"] for r in sa}["super_admin"] == "platform"
    assert {r["value"]: r["label"] for r in sa}["admin"] == "Organization Admin"
    org = [r["value"] for r in c.get("/hr/admin/roles", headers=_token(u["admin1"])).json()["roles"]]
    assert "super_admin" not in org and set(org) == {"admin", "hr_admin", "billing_admin", "manager", "employee"}
    assert [r["value"] for r in c.get("/hr/admin/roles", headers=_token(u["hr1"])).json()["roles"]] == ["employee"]
    assert c.get("/hr/admin/roles", headers=_token(u["emp1"])).status_code == 403
    assert c.get("/hr/admin/roles").status_code == 401


ORG_ROLES = ["admin", "hr_admin", "billing_admin", "manager", "employee"]


@pytest.mark.parametrize("role", ORG_ROLES)
def test_super_admin_creates_user_with_each_org_role(world, role):
    c, db, u = world["c"], world["db"], world["u"]
    r = c.post("/hr/admin/users", headers=_token(u["sa"]), json={
        "first_name": "New", "last_name": "User", "email": f"new-{role}@example.com", "role": role, "organization_id": 2})
    assert r.status_code == 201, r.text
    created = db.query(Employee).filter(Employee.email == f"new-{role}@example.com").one()
    assert created.role.value == role and created.organization_id == 2
    body = r.json()
    if role == "admin":
        assert body["temporary_password"] is None  # invited via secure link
    else:
        assert body["temporary_password"]
        # the new user can sign in and lands with the right role
        login = c.post("/auth/login", json={"email": created.email, "password": body["temporary_password"]})
        assert login.status_code == 200 and login.json()["employee"]["role"] == role
    log = _audit(db, "user.created")[-1]
    assert log.details["role"] == role and log.details["organization_id"] == 2 and log.performed_by == u["sa"].id
    assert "password" not in str(log.details).lower().replace("target_email", "")


def test_super_admin_can_create_super_admin_only_with_confirmation_and_no_org(world):
    c, db, u = world["c"], world["db"], world["u"]
    base = {"first_name": "Sue", "last_name": "Super", "email": "sue@example.com", "role": "super_admin"}
    r = c.post("/hr/admin/users", headers=_token(u["sa"]), json=base)
    assert r.status_code == 400 and "Confirm explicitly" in r.json()["message"]
    r = c.post("/hr/admin/users", headers=_token(u["sa"]), json={**base, "confirm_super_admin": True, "organization_id": 1})
    assert r.status_code == 400 and "cannot belong to an organization" in r.json()["message"]
    assert db.query(Employee).filter(Employee.email == "sue@example.com").count() == 0
    r = c.post("/hr/admin/users", headers=_token(u["sa"]), json={**base, "confirm_super_admin": True})
    assert r.status_code == 201, r.text
    sue = db.query(Employee).filter(Employee.email == "sue@example.com").one()
    assert sue.role == UserRole.SUPER_ADMIN and sue.organization_id is None
    assert r.json()["temporary_password"] is None
    assert _audit(db, "user.created")[-1].details["confirmed_super_admin"] is True


def test_invalid_role_and_organization_combinations(world):
    c, db, u = world["c"], world["db"], world["u"]
    sa = _token(u["sa"])
    mk = lambda **k: c.post("/hr/admin/users", headers=sa, json={
        "first_name": "A", "last_name": "B", "email": k.pop("email", "x@example.com"), **k})
    r = mk(role="employee")
    assert r.status_code == 400 and "Select an organization" in r.json()["message"]
    r = mk(role="employee", organization_id=999)
    assert r.status_code == 400 and "does not exist" in r.json()["message"]
    assert mk(role="wizard", organization_id=1).status_code == 422
    r = mk(role="employee", organization_id=1, email="root@example.com")
    assert r.status_code == 409 or "already" in r.text.lower()
    assert db.query(Employee).filter(Employee.email == "x@example.com").count() == 0


def test_role_creation_authorization(world):
    c, u = world["c"], world["u"]
    post = lambda who, **k: c.post("/hr/admin/users", headers=_token(u[who]), json={
        "first_name": "A", "last_name": "B", "email": k.pop("email", "y@example.com"), **k})
    assert post("admin1", role="super_admin", confirm_super_admin=True).status_code == 403
    assert post("admin1", role="manager").status_code == 201  # org admin: own org, no org id needed
    assert post("admin1", role="employee", organization_id=2, email="z@example.com").status_code == 403  # other org
    assert post("hr1", role="admin", email="h@example.com").status_code == 403
    assert post("hr1", role="employee", email="h2@example.com").status_code == 201
    assert post("emp1", role="employee", email="e@example.com").status_code == 403


def test_role_change_uses_same_rules_and_is_audited(world):
    c, db, u = world["c"], world["db"], world["u"]
    r = c.put(f"/hr/admin/users/{u['emp1'].id}", headers=_token(u["sa"]), json={"role": "manager"})
    assert r.status_code == 200 and r.json()["role"] == "manager"
    ev = _audit(db, "user.role_changed")[-1]
    assert (ev.details["from"], ev.details["to"]) == ("employee", "manager")
    assert c.put(f"/hr/admin/users/{u['emp1'].id}", headers=_token(u["sa"]), json={"role": "super_admin", "confirm_super_admin": True}).status_code == 400
    assert c.put(f"/hr/admin/users/{u['emp1'].id}", headers=_token(u["admin1"]), json={"role": "super_admin"}).status_code == 403
    assert c.put(f"/hr/admin/users/{u['sa'].id}", headers=_token(u["sa"]), json={"role": "employee"}).status_code == 403  # self
    assert c.put(f"/hr/admin/users/{u['hr1'].id}", headers=_token(u["hr1"]), json={"first_name": "Renamed"}).status_code == 200  # non-role edit still fine
    assert c.put(f"/hr/admin/users/{u['emp2'].id}", headers=_token(u["admin1"]), json={"role": "manager"}).status_code == 404  # other org


def test_role_catalog_matches_backend_enum():
    from app.modules.employee.roles import ROLE_CATALOG
    assert {r["value"] for r in ROLE_CATALOG} == {r.value for r in UserRole}


# ═════════════════════════════ ZHR-31: password reset ═════════════════════════════

def _reset(world, who, target, method=None):
    body = {"method": method} if method else None
    return world["c"].post(f"/hr/admin/users/{world['u'][target].id}/reset-password",
                           headers=_token(world["u"][who]), json=body)


def _raw_token(world):
    return world["sent"]["emails"][-1]["url"].split("token=")[1]


def test_link_reset_sends_email_stores_only_hash_and_audits(world):
    db = world["db"]
    r = _reset(world, "sa", "admin1")
    assert r.status_code == 200 and r.json()["method"] == "link" and r.json()["temporary_password"] is None
    assert "admin1@example.com" in r.json()["message"]
    raw = _raw_token(world)
    row = db.query(SecurityActionToken).one()
    assert row.token_hash != raw and raw not in row.token_hash and len(row.token_hash) == 64
    ttl = row.expires_at - datetime.utcnow()
    assert timedelta(minutes=55) < ttl <= timedelta(minutes=60)
    log = _audit(db, "user.password_reset")[0]
    assert log.details["method"] == "link" and log.performed_by == world["u"]["sa"].id
    assert raw not in str(log.details) and "password" not in str([k for k in log.details])


def test_link_reset_end_to_end_then_login_and_single_use(world):
    c, u = world["c"], world["u"]
    _reset(world, "sa", "emp1")
    raw = _raw_token(world)
    assert c.get("/auth/reset-password", params={"token": raw}).status_code == 200  # form renders
    assert c.post("/auth/reset-password", json={"token": raw, "password": "short"}).status_code == 422  # too short
    weak = c.post("/auth/reset-password", json={"token": raw, "password": "lettersonly"})
    assert weak.status_code == 400 and "letter and a number" in weak.json()["message"]  # policy, token not burned
    r = c.post("/auth/reset-password", json={"token": raw, "password": "BrandNew123"})
    assert r.status_code == 200, r.text
    assert c.post("/auth/login", json={"email": u["emp1"].email, "password": "BrandNew123"}).status_code == 200
    assert c.post("/auth/login", json={"email": u["emp1"].email, "password": PW}).status_code == 401
    again = c.post("/auth/reset-password", json={"token": raw, "password": "Another123"})
    assert again.status_code == 400 and "invalid or has expired" in again.json()["message"]
    assert c.get("/auth/reset-password", params={"token": raw}).status_code == 400  # link now dead


def test_expired_tampered_and_superseded_tokens_are_rejected(world):
    c, db = world["c"], world["db"]
    _reset(world, "sa", "emp1")
    first = _raw_token(world)
    _reset(world, "sa", "emp1")  # supersedes the first link
    second = _raw_token(world)
    bad = c.post("/auth/reset-password", json={"token": first, "password": "BrandNew123"})
    assert bad.status_code == 400 and "invalid or has expired" in bad.json()["message"]
    assert c.post("/auth/reset-password", json={"token": second + "x", "password": "BrandNew123"}).status_code == 400
    assert c.post("/auth/reset-password", json={"token": "garbage", "password": "BrandNew123"}).status_code == 400
    row = db.query(SecurityActionToken).filter(SecurityActionToken.used_at.is_(None)).one()
    row.expires_at = datetime.utcnow() - timedelta(seconds=1)
    db.commit()
    assert c.post("/auth/reset-password", json={"token": second, "password": "BrandNew123"}).status_code == 400
    assert verify_password(PW, world["u"]["emp1"].hashed_password)  # password never changed


def test_reset_invalidates_existing_sessions_and_refresh_tokens(world):
    c, db, u = world["c"], world["db"], world["u"]
    old_iat = int((datetime.utcnow() - timedelta(minutes=10)).timestamp())
    old_access = _token(u["emp1"], iat=old_iat)
    old_refresh = create_access_token({"sub": u["emp1"].email, "id": u["emp1"].id, "iat": old_iat})
    assert c.get("/auth/me", headers=old_access).status_code == 200
    _reset(world, "sa", "emp1")
    r = c.get("/auth/me", headers=old_access)
    assert r.status_code == 401 and "password was changed" in r.json()["message"]
    assert c.post("/auth/refresh", json={"refresh_token": old_refresh}).status_code == 401
    # a token issued after the reset works
    fresh = _token(u["emp1"])  # issued now, i.e. after the reset
    assert c.get("/auth/me", headers=fresh).status_code == 200
    # completing the emailed link also signs out sessions
    db.refresh(u["emp1"])
    assert u["emp1"].password_changed_at is not None


def test_email_failure_returns_clear_error_and_leaves_no_valid_token(world):
    c, db, u = world["c"], world["db"], world["u"]
    world["sent"]["fail"] = "SMTP authentication rejected"
    r = _reset(world, "sa", "admin1")
    assert r.status_code == 502
    assert r.json()["message"] == "Email could not be sent: SMTP authentication rejected"
    assert db.query(SecurityActionToken).filter(SecurityActionToken.used_at.is_(None)).count() == 0
    db.refresh(u["admin1"])
    assert u["admin1"].password_changed_at is None  # sessions untouched: nothing was reset
    assert _audit(db, "user.password_reset") == []
    assert c.get("/auth/me", headers=_token(u["admin1"])).status_code == 200


def test_temporary_password_shown_once_and_forces_change(world):
    c, db, u = world["c"], world["db"], world["u"]
    r = _reset(world, "sa", "emp1", "temporary")
    assert r.status_code == 200 and r.json()["method"] == "temporary"
    temp = r.json()["temporary_password"]
    assert len(temp) >= 12 and world["sent"]["emails"] == []
    log = _audit(db, "user.password_reset")[0]
    assert temp not in str(log.details)
    db.refresh(u["emp1"])
    assert u["emp1"].must_change_password is True and verify_password(temp, u["emp1"].hashed_password)
    login = c.post("/auth/login", json={"email": u["emp1"].email, "password": temp})
    assert login.status_code == 200 and login.json()["employee"]["mustChangePassword"] is True
    h = {"Authorization": f"Bearer {login.json()['access_token']}"}
    blocked = c.get("/hr/admin/roles", headers=h)
    assert blocked.status_code == 403 and blocked.json()["error"] == "PASSWORD_CHANGE_REQUIRED"
    assert c.get("/auth/me", headers=h).status_code == 200  # allowed while pending
    same = c.post("/auth/change-password", headers=h, json={"current_password": temp, "new_password": temp})
    assert same.status_code == 400
    ok = c.post("/auth/change-password", headers=h, json={"current_password": temp, "new_password": "MyOwnPass9"})
    assert ok.status_code == 200, ok.text
    db.refresh(u["emp1"])
    assert u["emp1"].must_change_password is False
    assert c.get("/auth/me", headers=h).status_code == 200


def test_temporary_reset_invalidates_old_sessions_and_revokes_links(world):
    c, u = world["c"], world["u"]
    old = _token(u["emp1"], iat=int((datetime.utcnow() - timedelta(minutes=5)).timestamp()))
    _reset(world, "sa", "emp1")  # link outstanding
    raw = _raw_token(world)
    _reset(world, "sa", "emp1", "temporary")
    assert c.get("/auth/me", headers=old).status_code == 401
    assert c.post("/auth/reset-password", json={"token": raw, "password": "BrandNew123"}).status_code == 400


def test_cannot_reset_own_password(world):
    r = _reset(world, "sa", "sa")
    assert r.status_code == 400 and "your own password" in r.json()["message"]
    assert world["sent"]["emails"] == []
    assert _reset(world, "admin1", "admin1").status_code == 400


def test_reset_is_rate_limited_per_user(world):
    for _ in range(emp_service.RESET_RATE_LIMIT_PER_HOUR):
        assert _reset(world, "sa", "emp1", "temporary").status_code == 200
    r = _reset(world, "sa", "emp1", "temporary")
    assert r.status_code == 429 and "Too many" in r.json()["message"]
    assert _reset(world, "sa", "emp2", "temporary").status_code == 200  # other users unaffected


def test_reset_authorization_and_tenancy(world):
    assert _reset(world, "emp1", "emp2").status_code == 403
    assert _reset(world, "hr1", "admin1").status_code == 403  # hr cannot reset an org admin
    assert _reset(world, "admin1", "sa").status_code in (403, 404)  # a super admin is out of an org admin's reach
    assert _reset(world, "admin1", "emp2").status_code == 404 # other organization
    assert _reset(world, "admin1", "emp1").status_code == 200 # own organization
    assert _reset(world, "sa", "emp2").status_code == 200     # super admin: any organization
    r = world["c"].post(f"/hr/admin/users/{world['u']['emp1'].id}/reset-password")
    assert r.status_code == 401
    r = _reset(world, "sa", "emp1", "bogus")
    assert r.status_code == 422


def test_deactivated_user_cannot_be_reset(world):
    world["u"]["emp1"].is_active = False
    world["db"].commit()
    r = _reset(world, "sa", "emp1")
    assert r.status_code == 400 and "deactivated" in r.json()["message"]


def test_password_policy_helper():
    for bad in ("", "short1", "onlyletters", "12345678"):
        with pytest.raises(Exception):
            emp_service.validate_password_policy(bad)
    emp_service.validate_password_policy("GoodPass1")


def test_reset_link_opens_the_apps_own_page_not_the_api_address(monkeypatch):
    from app.config import settings
    from app.modules.employee import service

    monkeypatch.setattr(settings, "FRONTEND_URL", "https://app.example.com/")
    monkeypatch.setattr(settings, "API_BASE_URL", "http://localhost:8000")          # the default nobody changed: the link must not use it
    url = service._action_link(service.SecurityActionPurpose.RESET, "tok123")
    assert url == "https://app.example.com/reset-password?token=tok123"


def test_an_invitation_link_still_goes_through_the_api_address(monkeypatch):
    from app.config import settings
    from app.modules.employee import service

    monkeypatch.setattr(settings, "API_BASE_URL", "https://api.example.com/")
    assert service._action_link(service.SecurityActionPurpose.INVITE, "tok9") == "https://api.example.com/auth/accept-invite?token=tok9"


def test_the_temporary_password_message_names_someone_with_no_name_by_email(world):
    db, u = world["db"], world["u"]
    u["emp1"].first_name, u["emp1"].last_name = "", ""
    db.commit()
    r = _reset(world, "sa", "emp1", "temporary")
    assert r.status_code == 200, r.text
    assert "emp1@example.com" in r.json()["message"] and "for ." not in r.json()["message"]

# ── ZHR-3: the Sign in button in emails opens Zoiko HR
def test_the_sign_in_link_in_the_registration_email_opens_the_hr_app(monkeypatch):
    from app.config import settings
    from app.services import email_service as es

    monkeypatch.setattr(settings, "FRONTEND_URL", "https://app.zoikohr.com/")
    assert es._login_url() == "https://app.zoikohr.com/login"
    html = es.render_email("registration_received.html", {"subject": "Welcome", "organization_name": "Acme", "action_url": es._login_url()}).html
    assert 'href="https://app.zoikohr.com/login"' in html and "Sign in to Zoiko HR" in html


def test_a_frontend_url_that_points_at_zoikoone_is_not_used_for_the_sign_in_link(monkeypatch):
    from app.config import settings
    from app.services import email_service as es

    for wrong in ("https://zoikoone.com", "https://app.zoikoone.com/", "https://www.zoikoone.com"):
        monkeypatch.setattr(settings, "FRONTEND_URL", wrong)
        assert es._login_url() == "https://app.zoikohr.com/login", wrong
        assert any("ZoikoOne" in p for p in es.link_config_problems()), wrong
    monkeypatch.setattr(settings, "FRONTEND_URL", "https://hr.client-company.com")
    assert es._login_url() == "https://hr.client-company.com/login" and es.link_config_problems() == []


def test_a_missing_or_local_frontend_url_is_reported(monkeypatch):
    from app.config import settings
    from app.services import email_service as es

    monkeypatch.setattr(settings, "FRONTEND_URL", "")
    assert es._login_url() == "https://app.zoikohr.com/login" and "not set" in es.link_config_problems()[0]
    monkeypatch.setattr(settings, "FRONTEND_URL", "http://localhost:5173")
    assert "server itself" in es.link_config_problems()[0]


# ═════════════════════════════ ZHR-7: public forgot-password (any active account) ═════════════════════════════

GENERIC_FORGOT_MESSAGE = "If an account exists for that email, a password reset link has been sent."


def _capture_forgot_emails(world, monkeypatch):
    """Record the async email the forgot-password endpoint queues instead of sending it."""
    calls = []
    monkeypatch.setattr(emp_service, "_notify_email_async", lambda sender, **kw: calls.append((sender, kw)))
    return calls


def test_forgot_password_issues_a_link_for_an_ordinary_employee(world, monkeypatch):
    calls = _capture_forgot_emails(world, monkeypatch)
    r = world["c"].post("/auth/forgot-password", json={"email": world["u"]["emp1"].email})
    assert r.status_code == 200 and r.json()["message"] == GENERIC_FORGOT_MESSAGE
    assert len(calls) == 1, "an ordinary employee must get a reset link, not a silent no-op"
    sender, kw = calls[0]
    assert sender == "send_org_admin_password_reset_email" and kw["email"] == "emp1@example.com"
    assert "reset-password?token=" in kw["action_url"]
    rows = world["db"].query(SecurityActionToken).filter(
        SecurityActionToken.email == "emp1@example.com",
        SecurityActionToken.purpose == SecurityActionPurpose.RESET,
        SecurityActionToken.used_at.is_(None),
    ).all()
    assert len(rows) == 1
    assert rows[0].token_hash == emp_service._token_hash(kw["action_url"].split("token=")[1])
    assert kw["action_url"].split("token=")[1] not in rows[0].token_hash


def test_forgot_password_works_for_admin_class_accounts_too(world, monkeypatch):
    calls = _capture_forgot_emails(world, monkeypatch)
    for who in ("sa", "admin1", "hr1"):
        r = world["c"].post("/auth/forgot-password", json={"email": world["u"][who].email})
        assert r.status_code == 200 and r.json()["message"] == GENERIC_FORGOT_MESSAGE
    assert [kw["email"] for _, kw in calls] == ["root@example.com", "admin1@example.com", "hr1@example.com"]


def test_forgot_password_reveals_nothing_for_unknown_or_inactive_accounts(world, monkeypatch):
    calls = _capture_forgot_emails(world, monkeypatch)
    world["u"]["emp2"].is_active = False
    world["db"].commit()
    for email in ("nobody@example.com", "emp2@example.com"):
        r = world["c"].post("/auth/forgot-password", json={"email": email})
        assert r.status_code == 200 and r.json()["message"] == GENERIC_FORGOT_MESSAGE
        assert world["db"].query(SecurityActionToken).filter(SecurityActionToken.email == email).count() == 0
    assert calls == []


def test_reset_link_from_public_forgot_password_ends_to_end(world, monkeypatch):
    calls = _capture_forgot_emails(world, monkeypatch)
    c, u = world["c"], world["u"]
    r = c.post("/auth/forgot-password", json={"email": u["emp1"].email})
    assert r.status_code == 200
    raw = calls[0][1]["action_url"].split("token=")[1]
    assert c.get("/auth/reset-password", params={"token": raw}).status_code == 200  # form renders
    done = c.post("/auth/reset-password", json={"token": raw, "password": "BrandNew123"})
    assert done.status_code == 200, done.text
    assert c.post("/auth/login", json={"email": u["emp1"].email, "password": "BrandNew123"}).status_code == 200


def test_a_reset_link_never_points_at_another_product_or_a_blank_address(monkeypatch):
    from app.config import settings
    from app.modules.employee import service

    for wrong in ("https://zoikoone.com", "https://app.zoikoone.com/", ""):
        monkeypatch.setattr(settings, "FRONTEND_URL", wrong)
        assert service._action_link(service.SecurityActionPurpose.RESET, "tok1") == "https://app.zoikohr.com/reset-password?token=tok1", wrong
    monkeypatch.setattr(settings, "FRONTEND_URL", "https://hr.client-company.com/")
    assert service._action_link(service.SecurityActionPurpose.RESET, "tok1") == "https://hr.client-company.com/reset-password?token=tok1"


def test_admin_can_edit_the_complete_employee_details(world):
    """The org-admin Edit form captures everything Add User / the import captures."""
    c, u, db = world["c"], world["u"], world["db"]
    target = u["emp1"].id
    payload = {
        "first_name": "Emp", "last_name": "One", "job_title": "Staff Engineer",
        "department_name": "Platform", "designation_name": "Senior Engineer",
        "employment_type": "contract", "status": "active",
        "work_email": "emp1.work@example.com", "personal_email": "emp1.personal@gmail.com",
        "company": "ZoikoOne", "business_unit": "Enterprise", "division": "Engineering", "team": "Core",
        "city": "Pune", "state": "MH", "country": "India", "pincode": "411001",
        "current_address": "1 Main St", "permanent_address": "2 Oak Ave",
        "basic_salary": "50000", "ctc": "1200000",
        "pan_number": "ABCDE1234F", "uan_number": "123456789012",
        "bank_account": "000111222", "bank_ifsc": "HDFC0001234",
    }
    r = c.put(f"/hr/admin/users/{target}", json=payload, headers=_token(u["admin1"]))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["job_title"] == "Staff Engineer"
    assert body["department"] == "Platform"
    assert body["designation"] == "Senior Engineer"
    assert body["employment_type"] == "contract"
    assert body["status"] == "active"
    assert body["pan_number"] == "ABCDE1234F"
    assert body["bank_ifsc"] == "HDFC0001234"
    assert body["city"] == "Pune"

    # the detail endpoint returns the same complete record for the view/edit form
    detail = c.get(f"/hr/admin/users/{target}", headers=_token(u["admin1"])).json()
    assert detail["department"] == "Platform"
    assert detail["designation"] == "Senior Engineer"
    assert detail["work_email"] == "emp1.work@example.com"
    assert detail["bank_account"] == "000111222"

    db.expire_all()
    emp = db.query(Employee).filter(Employee.id == target).first()
    assert emp.job_title == "Staff Engineer"
    assert emp.employment_type == EmploymentType.CONTRACT
    assert emp.department is not None and emp.department.name == "Platform"
    assert emp.designation is not None and emp.designation.title == "Senior Engineer"
    profile = db.query(EmployeeProfile).filter(EmployeeProfile.employee_id == target).first()
    assert profile is not None
    assert profile.pan_number == "ABCDE1234F" and profile.bank_ifsc == "HDFC0001234"
    # department/designation were created once, not duplicated per save
    assert db.query(Department).filter(Department.name == "Platform").count() == 1
    assert db.query(Designation).filter(Designation.title == "Senior Engineer").count() == 1
