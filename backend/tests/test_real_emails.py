"""Only real e-mail addresses can be used, and a new account can sign in only after its owner confirms the address."""

from datetime import date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import email_quality as q
from app.core.rate_limiter import limiter
from app.database import Base, get_db
from app.modules.hr.models import Organization, OrganizationStatus


@pytest.fixture(autouse=True)
def _no_rate_limit():
    limiter.enabled = False
    yield
    limiter.enabled = True


# ── the check itself
@pytest.mark.parametrize("address", [
    "name@example.com", "name@EXAMPLE.org", "x@test.com", "x@sub.example.com", "x@localhost", "x@company.test", "x@mail.invalid", "x@host.local",
    "x@domain.com", "x@yourcompany.com", "x@fake.com", "x@abc.com",
])
def test_placeholder_addresses_are_refused(strict_emails, address):
    with pytest.raises(ValueError) as e:
        q.check_real_email(address)
    assert "real email" in str(e.value).lower()


@pytest.mark.parametrize("address", ["a@mailinator.com", "a@guerrillamail.com", "a@sub.mailinator.com", "a@10minutemail.com", "a@yopmail.com", "a@temp-mail.org", "a@trashmail.com"])
def test_disposable_addresses_are_refused(strict_emails, address):
    with pytest.raises(ValueError) as e:
        q.check_real_email(address)
    assert "disposable" in str(e.value).lower()


@pytest.mark.parametrize("address", ["priya@gmail.com", "Priya.Shah@Outlook.com", "ops@zoikohr.com", "hr@acme-industries.co.in", "x@yahoo.co.uk"])
def test_real_addresses_pass_and_keep_their_spelling(strict_emails, address):
    assert q.check_real_email(address) == address


def test_blank_is_nothing_and_the_whole_check_can_be_switched_off(strict_emails, monkeypatch):
    assert q.check_real_email("") is None and q.check_real_email(None) is None and q.check_real_email("   ") is None
    monkeypatch.setattr(q.settings, "EMAIL_REAL_ONLY", False)
    assert q.check_real_email("x@example.com") == "x@example.com"


def test_a_domain_that_cannot_receive_mail_is_refused_but_an_inconclusive_lookup_is_not(strict_emails, monkeypatch):
    monkeypatch.setattr(q.settings, "EMAIL_DNS_CHECK", True)
    monkeypatch.setattr(q, "_domain_receives_mail", lambda d: False)
    with pytest.raises(ValueError) as e:
        q.check_real_email("x@thisdomaindoesnotexist-zz9.com")
    assert "cannot receive email" in str(e.value)
    monkeypatch.setattr(q, "_domain_receives_mail", lambda d: None)          # no network, slow resolver: never lock real people out
    assert q.check_real_email("x@gmail.com") == "x@gmail.com"
    monkeypatch.setattr(q, "_domain_receives_mail", lambda d: True)
    assert q.check_real_email("x@gmail.com") == "x@gmail.com"


# ── through the real endpoints
@pytest.fixture
def env(strict_emails, monkeypatch):
    from app.main import app
    from app.core.dependencies import get_current_admin, get_current_user
    from app.modules.employee import service
    from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole

    mails = []
    monkeypatch.setattr(service, "_notify_email_async", lambda name, **kw: mails.append((name, kw)))
    monkeypatch.setattr(service, "_notify_email", lambda name, **kw: mails.append((name, kw)))
    monkeypatch.setattr("app.modules.billing.service.evaluation_access_block_reason", lambda db, org_id: None)

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add(Organization(id=1, name="A", status=OrganizationStatus.ACTIVE))
    s.commit()
    admin = Employee(email="admin@gmail.com", hashed_password="x", employee_code="A1", role=UserRole.ADMIN, first_name="Ada", last_name="Admin", job_title="t",
                     employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=1)
    s.add(admin)
    s.commit()
    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: admin
    app.dependency_overrides[get_current_admin] = lambda: admin
    c = TestClient(app, raise_server_exceptions=False)
    c.db, c.mails, c.admin = s, mails, admin
    yield c
    for dep in (get_db, get_current_user, get_current_admin):
        app.dependency_overrides.pop(dep, None)
    s.close()
    engine.dispose()


def _new(**over):
    body = {"email": "new.hire@gmail.com", "password": "Passw0rd1", "first_name": "New", "last_name": "Hire", "job_title": "Analyst",
            "date_of_joining": date.today().isoformat()}
    body.update(over)
    return body


ADD = "/hr/employee-management/employees"


def _verification_mails(env):
    return [kw for name, kw in env.mails if name == "send_email_verification"]


def _token(kw):
    return kw["action_url"].split("token=")[1]


def test_a_dummy_or_disposable_address_cannot_be_used_to_add_a_person(env):
    for bad in ("someone@example.com", "someone@mailinator.com", "x@test.com"):
        r = env.post(ADD, json=_new(email=bad))
        assert r.status_code == 422 and "email" in r.text.lower(), (bad, r.text)
    assert env.post(ADD, json=_new(work_email="boss@mailinator.com")).status_code == 422
    assert env.post(ADD, json=_new(personal_email="me@example.org")).status_code == 422
    from app.modules.employee.models import Employee
    assert env.db.query(Employee).count() == 1, "nobody was created"


def test_a_new_person_is_unconfirmed_gets_a_confirmation_email_and_cannot_sign_in_yet(env):
    r = env.post(ADD, json=_new())
    assert r.status_code == 201, r.text
    mails = _verification_mails(env)
    assert len(mails) == 1 and mails[0]["email"] == "new.hire@gmail.com" and "/verify-email?token=" in mails[0]["action_url"]
    from app.modules.employee.models import Employee
    person = env.db.query(Employee).filter_by(email="new.hire@gmail.com").one()
    assert person.email_verified is False
    refused = env.post("/auth/login", json={"email": "new.hire@gmail.com", "password": "Passw0rd1"})
    assert refused.status_code == 403, refused.text
    assert refused.json()["error"] == "EMAIL_NOT_VERIFIED" and "confirm your email" in refused.json()["message"].lower()
    assert "access_token" not in refused.text


def test_the_confirmation_link_lets_them_in_once(env):
    env.post(ADD, json=_new())
    token = _token(_verification_mails(env)[0])
    done = env.post("/auth/verify-email", json={"token": token})
    assert done.status_code == 200 and "confirmed" in done.json()["message"].lower()
    ok = env.post("/auth/login", json={"email": "new.hire@gmail.com", "password": "Passw0rd1"})
    assert ok.status_code == 200 and ok.json()["access_token"]
    again = env.post("/auth/verify-email", json={"token": token})
    assert again.status_code == 400 and "invalid or has expired" in again.text
    assert env.post("/auth/verify-email", json={"token": "garbage"}).status_code == 400


def test_an_expired_link_is_refused_and_a_new_one_replaces_the_old(env):
    from app.modules.employee.models import SecurityActionToken
    env.post(ADD, json=_new())
    old = _token(_verification_mails(env)[0])
    row = env.db.query(SecurityActionToken).one()
    row.expires_at = datetime.utcnow() - timedelta(minutes=1)
    env.db.commit()
    assert env.post("/auth/verify-email", json={"token": old}).status_code == 400
    env.mails.clear()
    assert env.post("/auth/resend-verification", json={"email": "new.hire@gmail.com"}).status_code == 200
    fresh = _token(_verification_mails(env)[0])
    assert fresh != old
    assert env.post("/auth/verify-email", json={"token": fresh}).status_code == 200


def test_resending_does_not_reveal_who_has_an_account(env):
    env.post(ADD, json=_new())
    env.mails.clear()
    known = env.post("/auth/resend-verification", json={"email": "new.hire@gmail.com"})
    unknown = env.post("/auth/resend-verification", json={"email": "nobody@gmail.com"})
    confirmed = env.post("/auth/resend-verification", json={"email": "admin@gmail.com"})      # already confirmed (an older account)
    assert known.status_code == unknown.status_code == confirmed.status_code == 200
    assert known.json() == unknown.json() == confirmed.json()
    assert len(_verification_mails(env)) == 1 and _verification_mails(env)[0]["email"] == "new.hire@gmail.com"


def test_sign_in_ignores_capitals_in_the_address(env):
    env.post(ADD, json=_new(email="Mixed.Case@gmail.com"))
    env.post("/auth/verify-email", json={"token": _token(_verification_mails(env)[0])})
    assert env.post("/auth/login", json={"email": "mixed.case@gmail.com", "password": "Passw0rd1"}).status_code == 200
    assert env.post("/auth/login", json={"email": "MIXED.CASE@GMAIL.COM", "password": "Passw0rd1"}).status_code == 200


def test_using_a_password_reset_link_also_proves_the_address(env):
    from app.modules.employee import service
    from app.modules.employee.models import Employee, SecurityActionPurpose
    env.post(ADD, json=_new())
    person = env.db.query(Employee).filter_by(email="new.hire@gmail.com").one()
    raw, _ = service._issue_action_token(env.db, person.email, person.organization_id, SecurityActionPurpose.RESET)
    env.db.commit()
    assert env.post("/auth/reset-password", json={"token": raw, "password": "BrandNew123"}).status_code == 200
    env.db.refresh(person)
    assert person.email_verified is True and person.email_verified_at is not None
    assert env.post("/auth/login", json={"email": "new.hire@gmail.com", "password": "BrandNew123"}).status_code == 200


def test_accounts_that_existed_before_are_not_locked_out(env):
    from app.core.security import hash_password
    env.admin.hashed_password = hash_password("Passw0rd1")
    env.db.commit()
    assert env.admin.email_verified is True
    assert env.post("/auth/login", json={"email": "admin@gmail.com", "password": "Passw0rd1"}).status_code == 200


def test_google_sign_in_confirms_the_address_because_google_already_has(env, monkeypatch):
    from app.config import settings
    from app.modules.employee import google_auth
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "id.apps.googleusercontent.com")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "secret")
    monkeypatch.setattr(settings, "API_BASE_URL", "https://api.example.com")
    monkeypatch.setattr(settings, "FRONTEND_URL", "https://app.example.com")
    env.post(ADD, json=_new())
    monkeypatch.setattr(google_auth, "verified_profile_for_code", lambda code: {"email": "new.hire@gmail.com", "name": "New Hire", "error": None})
    c = TestClient(env.app if hasattr(env, "app") else __import__("app.main", fromlist=["app"]).app, raise_server_exceptions=False, follow_redirects=False)
    start = c.get("/auth/google/login")
    from urllib.parse import parse_qs, urlparse
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    back = c.get("/auth/google/callback", params={"code": "abc", "state": state})
    assert "google_ticket" in back.headers["location"]
    from app.modules.employee.models import Employee
    env.db.expire_all()
    assert env.db.query(Employee).filter_by(email="new.hire@gmail.com").one().email_verified is True


def test_a_person_changing_their_own_contact_email_cannot_use_a_throwaway(env):
    from app.core.dependencies import get_current_user
    from app.modules.employee.models import Employee
    me = env.admin
    r = env.put("/hr/employees/me", json={"personal_email": "me@mailinator.com"})
    assert r.status_code == 422 and "disposable" in r.text.lower()
    ok = env.put("/hr/employees/me", json={"personal_email": "me@gmail.com"})
    assert ok.status_code == 200, ok.text


def test_the_confirmation_requirement_can_be_switched_off(env, monkeypatch):
    from app.modules.employee.models import Employee
    monkeypatch.setattr("app.config.settings.REQUIRE_EMAIL_VERIFICATION", False)
    env.mails.clear()
    assert env.post(ADD, json=_new(email="easy@gmail.com")).status_code == 201
    assert env.db.query(Employee).filter_by(email="easy@gmail.com").one().email_verified is True
    assert not _verification_mails(env)
    assert env.post("/auth/login", json={"email": "easy@gmail.com", "password": "Passw0rd1"}).status_code == 200


REGISTER = {"name": "Priya Shah", "email": "priya.shah@gmail.com", "password": "Passw0rd1", "organization": "Acme Industries", "plan_code": "core"}


def test_registering_an_organization_needs_a_real_address_and_a_confirmed_one_to_sign_in(env, monkeypatch):
    monkeypatch.setattr("app.services.email_service.send_registration_received", lambda *a, **k: True)
    monkeypatch.setattr("app.services.email_service.send_new_organization_created", lambda *a, **k: True)
    for bad in ("owner@example.com", "owner@mailinator.com"):
        r = env.post("/auth/register", json={**REGISTER, "email": bad, "organization": f"Org {bad}"})
        assert r.status_code == 422 and "email" in r.text.lower(), (bad, r.text)
    bad_company = env.post("/auth/register", json={**REGISTER, "registered_email": "ops@mailinator.com"})
    assert bad_company.status_code == 422
    ok = env.post("/auth/register", json=REGISTER)
    assert ok.status_code in (200, 201), ok.text
    mails = _verification_mails(env)
    assert len(mails) == 1 and mails[0]["email"] == "priya.shah@gmail.com"
    refused = env.post("/auth/login", json={"email": "priya.shah@gmail.com", "password": "Passw0rd1"})
    assert refused.status_code == 403 and refused.json()["error"] == "EMAIL_NOT_VERIFIED"
    assert env.post("/auth/verify-email", json={"token": _token(mails[0])}).status_code == 200
    assert env.post("/auth/login", json={"email": "priya.shah@gmail.com", "password": "Passw0rd1"}).status_code == 200


def test_the_audit_script_lists_old_accounts_with_unusable_addresses_and_can_require_confirmation(env, monkeypatch):
    from scripts import audit_emails
    from app.core.security import hash_password
    from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole

    def person(email, n):
        return Employee(email=email, hashed_password=hash_password("Passw0rd1"), employee_code=f"Z{n}", role=UserRole.EMPLOYEE, first_name="Old", last_name=str(n), job_title="t",
                        employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=1)

    old = [person("dummy@example.com", 1), person("burner@mailinator.com", 2), person("real@gmail.com", 3)]
    env.db.add_all(old)
    env.db.commit()
    monkeypatch.setattr(audit_emails, "SessionLocal", lambda: env.db)
    monkeypatch.setattr(env.db, "close", lambda: None)
    assert audit_emails.main(["--no-dns"]) == 0
    env.db.refresh(old[0])
    assert old[0].email_verified is True, "listing only: nothing changed"
    env.mails.clear()
    assert audit_emails.main(["--no-dns", "--require-confirmation"]) == 0
    for p in old:
        env.db.refresh(p)
    assert [p.email_verified for p in old] == [False, False, True]
    assert sorted(kw["email"] for kw in _verification_mails(env)) == ["burner@mailinator.com", "dummy@example.com"]
    assert env.post("/auth/login", json={"email": "dummy@example.com", "password": "Passw0rd1"}).status_code == 403
    assert env.post("/auth/login", json={"email": "real@gmail.com", "password": "Passw0rd1"}).status_code == 200


def test_a_super_admin_cannot_create_an_organization_for_a_dummy_admin_address(env, monkeypatch):
    from app.core.dependencies import get_current_super_admin
    from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
    sa = Employee(email="boss@gmail.com", hashed_password="x", employee_code="SA", role=UserRole.SUPER_ADMIN, first_name="S", last_name="A", job_title="t",
                  employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=None)
    env.db.add(sa)
    env.db.commit()
    env.app.dependency_overrides[get_current_super_admin] = lambda: sa
    monkeypatch.setattr("app.services.email_service.send_registration_received", lambda *a, **k: True)
    monkeypatch.setattr("app.services.email_service.send_new_organization_created", lambda *a, **k: True)
    try:
        for bad in ("owner@example.com", "owner@mailinator.com"):
            r = env.post("/super-admin/organizations", json={"organization": f"Org {bad}", "admin_name": "Owner", "admin_email": bad})
            assert r.status_code == 400 and ("real email" in r.text.lower() or "disposable" in r.text.lower()), (bad, r.text)
        ok = env.post("/super-admin/organizations", json={"organization": "Acme Corp", "admin_name": "Owner", "admin_email": "owner@gmail.com"})
        assert ok.status_code == 201, ok.text
        from app.modules.employee.models import Employee as E
        assert env.db.query(E).filter_by(email="owner@gmail.com").one().email_verified is False
        assert [kw["email"] for kw in _verification_mails(env)][-1] == "owner@gmail.com"
    finally:
        env.app.dependency_overrides.pop(get_current_super_admin, None)


def test_candidates_and_new_hires_need_real_addresses_too(strict_emails):
    from pydantic import ValidationError
    from app.modules.hr.schemas import CandidateCreate, OnboardingNewHireCreate
    with pytest.raises(ValidationError) as e:
        OnboardingNewHireCreate(candidate_name="Sam Rao", email="sam@mailinator.com", position="Analyst")
    assert "disposable" in str(e.value).lower()
    with pytest.raises(ValidationError):
        OnboardingNewHireCreate(candidate_name="Sam Rao", email="sam@example.com", position="Analyst")
    assert OnboardingNewHireCreate(candidate_name="Sam Rao", email="sam@gmail.com", position="Analyst").email == "sam@gmail.com"
    fields = CandidateCreate.model_fields
    assert "email" in fields
    for bad in ("sam@mailinator.com", "sam@example.com"):
        with pytest.raises(ValidationError):
            CandidateCreate(first_name="Sam", last_name="Rao", email=bad, phone="9876543210", position="Analyst", stage="applied")


def test_registering_after_google_sign_in_starts_confirmed_and_a_wrong_proof_does_not(env, monkeypatch):
    from app.modules.employee import google_auth
    from app.modules.employee.models import Employee
    monkeypatch.setattr("app.services.email_service.send_registration_received", lambda *a, **k: True)
    monkeypatch.setattr("app.services.email_service.send_new_organization_created", lambda *a, **k: True)
    proof = google_auth.make_signup_proof("via.google@gmail.com")
    ok = env.post("/auth/register", json={**REGISTER, "email": "via.google@gmail.com", "organization": "Google Co", "google_proof": proof})
    assert ok.status_code in (200, 201), ok.text
    person = env.db.query(Employee).filter_by(email="via.google@gmail.com").one()
    assert person.email_verified is True and person.email_verified_at is not None
    assert not [m for m in _verification_mails(env) if m["email"] == "via.google@gmail.com"], "no confirmation email: Google already did that"
    assert env.post("/auth/login", json={"email": "via.google@gmail.com", "password": "Passw0rd1"}).status_code == 200
    # a proof for another address, or none, still needs the confirmation link
    other = env.post("/auth/register", json={**REGISTER, "email": "someone.else@gmail.com", "organization": "Else Co", "google_proof": proof})
    assert other.status_code in (200, 201)
    assert env.db.query(Employee).filter_by(email="someone.else@gmail.com").one().email_verified is False
    assert any(m["email"] == "someone.else@gmail.com" for m in _verification_mails(env))
