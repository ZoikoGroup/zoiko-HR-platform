"""E-mail identity is scoped PER ORGANIZATION.

The same address may have one account in each organization (own password, role and status) and must stay unique inside an
organization. Sign-in only offers accounts whose own password matches, and asks the person to choose when more than one does.
Security links (reset, verify, invite) are bound to ONE account: address + organization.

Real endpoints (auth router) on an in-memory SQLite database, as in test_registration_activation.py.
"""
import pathlib
import sys
from unittest.mock import patch

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

from app.core.exceptions import ZoikoException, generic_exception_handler, zoiko_exception_handler
from app.core.security import decode_access_token, hash_password, verify_password
from app.database import Base, get_db
from app.modules.employee import identity
from app.modules.employee import service as employee_service
from app.modules.employee.models import Employee, EmployeeStatus, UserRole
from app.modules.employee.router import auth_router
from app.modules.employee.schema import EmployeeCreate, RegisterRequest, UserCreateRequest
from app.modules.hr.models import OnboardingNewHire

EMAIL = "sam@acme-corp.com"
PASS_A, PASS_B = "AlphaPass1", "BravoPass2"


@pytest.fixture
def db(monkeypatch):
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, expire_on_commit=False)()
    ids = iter(range(1, 10000))
    monkeypatch.setattr(employee_service, "_generate_employee_id", lambda db_, organization_id=None: f"ID{next(ids):04d}")
    yield session
    session.close()
    engine.dispose()


@pytest.fixture
def client(db):
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
    c = TestClient(app, raise_server_exceptions=False)
    c.db = db
    return c


def _register(db, email, password, organization):
    return employee_service.register_enterprise(db, RegisterRequest(
        name="Sam Person", email=email, password=password, organization=organization, plan_code="core"))["organization_id"]


def _employee(db, org_id, email, password, role=UserRole.EMPLOYEE, **kw):
    e = Employee(email=email, hashed_password=hash_password(password), employee_code=f"EC{db.query(Employee).count() + 1:05d}",
                 role=role, first_name="Sam", last_name="Person", job_title="Analyst", employment_type="full_time",
                 status=kw.pop("status", EmployeeStatus.ACTIVE), date_of_joining=__import__("datetime").date(2026, 1, 1),
                 organization_id=org_id, **kw)
    db.add(e)
    db.commit()
    return e


@pytest.fixture
def two_orgs(db):
    """Org A where EMAIL is the admin, and org B (another admin) where EMAIL is a plain employee."""
    a = _register(db, EMAIL, PASS_A, "Acme Org")
    b = _register(db, "boss@beta-corp.com", "BossPass9", "Beta Org")
    return a, b


# ── Uniqueness: per organization ───────────────────────────────────────────────────────────────────────────────────

def test_registering_a_new_org_with_an_address_used_in_another_org_succeeds(client):
    a = _register(client.db, EMAIL, PASS_A, "Acme Org")
    r = client.post("/auth/register", json={"name": "Sam Person", "email": "  SAM@Acme-Corp.com ", "password": PASS_B,
                                            "organization": "Beta Org", "plan_code": "core"})
    assert r.status_code == 200, r.text
    rows = client.db.query(Employee).filter(Employee.email == EMAIL).order_by(Employee.id).all()
    assert [e.organization_id for e in rows] == [a, r.json()["organization_id"]]
    assert verify_password(PASS_A, rows[0].hashed_password) and verify_password(PASS_B, rows[1].hashed_password)


def test_a_platform_account_address_cannot_register_an_org_and_nothing_is_left_behind(client):
    from app.modules.hr.models import Organization
    _employee(client.db, None, "root@zoiko-platform.com", "RootPass1", role=UserRole.SUPER_ADMIN)
    r = client.post("/auth/register", json={"name": "Root", "email": "root@zoiko-platform.com", "password": PASS_A,
                                            "organization": "Sneaky Org", "plan_code": "core"})
    assert r.status_code == 409
    assert client.db.query(Organization).count() == 0, "no orphan organization"


def test_adding_a_user_whose_address_is_in_another_org_succeeds(db, two_orgs):
    a, b = two_orgs
    user, _ = employee_service.create_organization_user(
        db, UserCreateRequest(first_name="Sam", last_name="Person", email=EMAIL, role="employee"), b, created_by_id=1)
    assert user.organization_id == b and user.email == EMAIL
    assert db.query(Employee).filter(Employee.email == EMAIL).count() == 2


@pytest.mark.parametrize("typed", [EMAIL, "SAM@ACME-CORP.COM", "  Sam@Acme-Corp.com  "])
def test_adding_a_user_twice_in_the_same_org_is_refused_whatever_the_case(db, two_orgs, typed):
    a, _ = two_orgs
    with pytest.raises(ZoikoException) as ei:
        employee_service.create_organization_user(
            db, UserCreateRequest(first_name="Sam", last_name="Twice", email=typed, role="employee"), a, created_by_id=1)
    assert ei.value.status_code == 409
    assert ei.value.message == "An employee with this email already exists in this organization."


def test_adding_an_employee_follows_the_same_rule(db, two_orgs):
    a, b = two_orgs
    data = dict(email=EMAIL.upper(), first_name="Sam", last_name="Person", job_title="Analyst", date_of_joining="2026-01-01")
    created = employee_service.create_employee(db, EmployeeCreate(**data), organization_id=b)
    assert created.organization_id == b and created.email == EMAIL, "stored lower-cased"
    with pytest.raises(ZoikoException) as ei:
        employee_service.create_employee(db, EmployeeCreate(**data), organization_id=b)
    assert ei.value.status_code == 409 and "in this organization" in ei.value.message


def test_onboarding_a_hire_whose_address_is_in_another_org_creates_an_account_here(db, two_orgs):
    from app.modules.hr import service as hr_service
    a, b = two_orgs
    hire = OnboardingNewHire(candidate_name="Sam Person", email="Sam@Acme-Corp.com", position="Analyst",
                             status="offer_accepted", organization_id=b)
    db.add(hire)
    db.commit()
    emp = hr_service.create_pending_employee_for_hire(db, hire, b)
    assert emp is not None and emp.organization_id == b and emp.email == EMAIL
    assert emp.status == EmployeeStatus.PENDING and not emp.is_active


def test_no_cross_org_uniqueness_helper_is_left():
    import app.modules.employee.service as es
    import app.modules.hr.service as hs
    assert not hasattr(es, "_identity_query") and not hasattr(hs, "_identity_query")
    assert not hasattr(es, "pick_sign_in_account"), "sign-in never silently chooses an organization"


# ── Sign-in ─────────────────────────────────────────────────────────────────────────────────────────────────────────

def _login(client, password, **extra):
    return client.post("/auth/login", json={"email": EMAIL, "password": password, **extra})


def test_two_orgs_different_passwords_sign_in_to_the_matching_one(client, two_orgs):
    a, b = two_orgs
    _employee(client.db, b, EMAIL, PASS_B)
    ra, rb = _login(client, PASS_A), _login(client, PASS_B)
    assert ra.status_code == 200 and rb.status_code == 200, (ra.text, rb.text)
    assert decode_access_token(ra.json()["access_token"])["organization_id"] == a
    assert decode_access_token(rb.json()["access_token"])["organization_id"] == b
    bad = _login(client, "WrongPass1")
    assert bad.status_code == 401 and bad.json()["detail"] == "Invalid email or password."


def test_same_password_in_two_orgs_asks_which_one_then_signs_in_only_there(client, two_orgs):
    a, b = two_orgs
    _employee(client.db, b, EMAIL, PASS_A)
    r = _login(client, PASS_A)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["requires_org_selection"] is True and "access_token" not in body
    assert {o["id"] for o in body["organizations"]} == {a, b}
    assert {o["role"] for o in body["organizations"]} == {"admin", "employee"}
    assert all(o["name"] for o in body["organizations"])
    tok = body["selection_token"]
    assert decode_access_token(tok).get("sub") is None, "the selection token is not an access token"

    other = client.post("/auth/login/select-organization", json={"selection_token": tok, "organization_id": 999})
    assert other.status_code == 400, "only a listed organization can be chosen"
    forged = client.post("/auth/login/select-organization", json={"selection_token": "x.y.z", "organization_id": b})
    assert forged.status_code == 401

    chosen = client.post("/auth/login/select-organization", json={"selection_token": tok, "organization_id": b})
    assert chosen.status_code == 200, chosen.text
    claims = decode_access_token(chosen.json()["access_token"])
    in_b = client.db.query(Employee).filter(Employee.email == EMAIL, Employee.organization_id == b).one()
    assert claims["organization_id"] == b and claims["id"] == in_b.id
    replay = client.post("/auth/login/select-organization", json={"selection_token": tok, "organization_id": a})
    assert replay.status_code == 401, "single use: spent by the successful sign-in"


def test_naming_the_organization_in_the_login_skips_the_choice(client, two_orgs):
    a, b = two_orgs
    _employee(client.db, b, EMAIL, PASS_A)
    r = _login(client, PASS_A, organization_id=a)
    assert r.status_code == 200 and decode_access_token(r.json()["access_token"])["organization_id"] == a
    assert _login(client, PASS_A, organization_id=12345).status_code == 401, "no account there: the generic answer"


def test_an_inactive_account_is_not_offered(client, two_orgs):
    a, b = two_orgs
    _employee(client.db, b, EMAIL, PASS_A, is_active=False)
    r = _login(client, PASS_A)
    assert r.status_code == 200 and "access_token" in r.json(), "only one usable account: signed straight in"
    assert decode_access_token(r.json()["access_token"])["organization_id"] == a


def test_google_sign_in_with_accounts_in_two_orgs_asks_which_one(client, two_orgs):
    from app.modules.employee import google_auth
    a, b = two_orgs
    in_b = _employee(client.db, b, EMAIL, PASS_B)
    in_a = client.db.query(Employee).filter(Employee.email == EMAIL, Employee.organization_id == a).one()
    ticket = google_auth.make_ticket([in_a.id, in_b.id])
    r = client.post("/auth/google/exchange", json={"ticket": ticket})
    assert r.status_code == 200, r.text
    assert r.json()["requires_org_selection"] is True and {o["id"] for o in r.json()["organizations"]} == {a, b}
    assert client.post("/auth/google/exchange", json={"ticket": ticket}).status_code == 401, "the ticket is single-use"
    chosen = client.post("/auth/login/select-organization", json={"selection_token": r.json()["selection_token"], "organization_id": a})
    assert chosen.status_code == 200 and decode_access_token(chosen.json()["access_token"])["id"] == in_a.id
    # a single-account ticket still signs straight in
    one = client.post("/auth/google/exchange", json={"ticket": google_auth.make_ticket(in_b.id)})
    assert one.status_code == 200 and decode_access_token(one.json()["access_token"])["organization_id"] == b


def test_a_token_for_org_a_resolves_to_the_org_a_account_only(client, two_orgs):
    from app.core.dependencies import get_current_user
    a, b = two_orgs
    in_b = _employee(client.db, b, EMAIL, PASS_B)
    token = _login(client, PASS_A).json()["access_token"]
    user = get_current_user(request=None, token=token, db=client.db)
    assert user.organization_id == a and user.id != in_b.id
    # a refresh token minted for the org A account cannot be replayed as the org B account
    refresh = _login(client, PASS_A).json()["refresh_token"]
    r = client.post("/auth/refresh", json={"refresh_token": refresh})
    assert r.status_code == 200 and decode_access_token(r.json()["access_token"])["organization_id"] == a


# ── Security links: one account each ───────────────────────────────────────────────────────────────────────────────

def test_forgot_password_with_a_multi_org_address_resets_only_the_chosen_account(client, two_orgs):
    a, b = two_orgs
    in_b = _employee(client.db, b, EMAIL, PASS_B)
    sent = []
    with patch.object(employee_service, "_notify_email_async", lambda name, **kw: sent.append(kw)):
        assert client.post("/auth/forgot-password", json={"email": EMAIL.upper()}).status_code == 200
    assert sorted(m["organization_id"] for m in sent) == sorted([a, b]), "one e-mail per account"
    assert all(m["workspace_name"] for m in sent), "each e-mail names its organization"

    link_for_b = next(m["action_url"] for m in sent if m["organization_id"] == b)
    token = link_for_b.split("token=", 1)[1]
    r = client.post("/auth/reset-password", json={"token": token, "password": "NewPass77"})
    assert r.status_code == 200, r.text
    client.db.expire_all()
    rows = {e.organization_id: e for e in client.db.query(Employee).filter(Employee.email == EMAIL)}
    assert verify_password("NewPass77", rows[b].hashed_password)
    assert verify_password(PASS_A, rows[a].hashed_password), "org A's password is untouched"

    link_for_a = next(m["action_url"] for m in sent if m["organization_id"] == a)
    r = client.post("/auth/reset-password", json={"token": link_for_a.split("token=", 1)[1], "password": "NewPass88"})
    assert r.status_code == 200, "issuing org B's link did not cancel org A's"
    client.db.expire_all()
    assert verify_password("NewPass88", client.db.get(Employee, rows[a].id).hashed_password)
    assert verify_password("NewPass77", client.db.get(Employee, in_b.id).hashed_password)


def test_a_reset_link_is_bound_to_its_organization(db, two_orgs):
    a, b = two_orgs
    _employee(db, b, EMAIL, PASS_B)
    raw, _ = employee_service._issue_action_token(db, EMAIL, b, employee_service.SecurityActionPurpose.RESET)
    db.commit()
    employee_service.complete_action_token(db, raw, employee_service.SecurityActionPurpose.RESET, "Changed123")
    db.expire_all()
    rows = {e.organization_id: e for e in db.query(Employee).filter(Employee.email == EMAIL)}
    assert verify_password("Changed123", rows[b].hashed_password) and verify_password(PASS_A, rows[a].hashed_password)


# ── Every path that sets an address ────────────────────────────────────────────────────────────────────────────────

def _xlsx(rows):
    import io
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["First Name", "Last Name", "Email", "Job Title", "Date of Joining", "Status", "Employment Type"])
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_bulk_import_per_organization_and_case_insensitive(db, two_orgs):
    a, b = two_orgs
    rows = [
        ["Sam", "Person", "SAM@ACME-CORP.COM", "Analyst", "2026-09-01", "Active", "Full Time"],     # in org A only: new here
        ["Lee", "Park", "lee@beta-corp.com", "Analyst", "2026-09-01", "Active", "Full Time"],
        ["Lee", "Again", "  LEE@Beta-Corp.com ", "Analyst", "2026-09-01", "Active", "Full Time"],  # same file, other case
    ]
    with patch.object(employee_service, "_notify_email"):
        result = employee_service.import_employees_from_file(db=db, file_bytes=_xlsx(rows), filename="p.xlsx",
                                                             organization_id=b, current_user_id=None)
    assert result["created"] == 2, result
    assert any("Duplicate email within import file" in e["error"] for e in result["errors"])
    assert db.query(Employee).filter(Employee.email == EMAIL).count() == 2, "org A's account untouched, org B got its own"
    assert db.query(Employee).filter(Employee.email == "lee@beta-corp.com", Employee.organization_id == b).count() == 1
    # re-importing the same address in the same organization (any case) updates that person, never a second account
    with patch.object(employee_service, "_notify_email"):
        again = employee_service.import_employees_from_file(db=db, file_bytes=_xlsx([rows[0]]), filename="p.xlsx",
                                                            organization_id=b, current_user_id=None)
    assert again["created"] == 0 and db.query(Employee).filter(Employee.email == EMAIL, Employee.organization_id == b).count() == 1


def test_google_sign_up_with_an_address_used_in_another_org_registers_a_new_account(client):
    from app.modules.employee import google_auth
    a = _register(client.db, EMAIL, PASS_A, "Acme Org")
    r = client.post("/auth/register", json={"name": "Sam Person", "email": EMAIL, "password": PASS_B, "organization": "Google Org",
                                            "plan_code": "core", "google_proof": google_auth.make_signup_proof(EMAIL)})
    assert r.status_code == 200, r.text
    new = client.db.query(Employee).filter(Employee.email == EMAIL, Employee.organization_id == r.json()["organization_id"]).one()
    assert new.email_verified and new.organization_id != a


def test_an_archived_account_still_holds_its_address_and_the_message_says_how_to_bring_it_back(db, two_orgs):
    a, b = two_orgs
    gone = _employee(db, b, "gone@beta-corp.com", PASS_B, status=EmployeeStatus.ARCHIVED, is_active=False)
    with pytest.raises(ZoikoException) as ei:
        employee_service.create_organization_user(
            db, UserCreateRequest(first_name="Gone", last_name="Again", email="GONE@beta-corp.com", role="employee"), b, created_by_id=1)
    assert ei.value.status_code == 409
    assert ei.value.message.startswith("An employee with this email already exists in this organization.")
    assert "reactivate" in ei.value.message
    assert db.query(Employee).filter(Employee.email == "gone@beta-corp.com").count() == 1 and gone.id


# ── The database is the guarantee ──────────────────────────────────────────────────────────────────────────────────

def test_the_database_refuses_a_same_org_duplicate_in_any_case_but_allows_other_orgs(db, two_orgs):
    from sqlalchemy import text
    from sqlalchemy.exc import IntegrityError
    a, b = two_orgs
    insert = text("INSERT INTO employees (email, hashed_password, employee_code, role, first_name, last_name, job_title, "
                  "employment_type, status, date_of_joining, organization_id, is_active) VALUES "
                  "(:email, 'x', :code, 'EMPLOYEE', 'Raw', 'Insert', 't', 'FULL_TIME', 'ACTIVE', '2026-01-01', :org, 1)")
    with pytest.raises(IntegrityError) as ei:        # raw SQL bypasses every app check: only the index stands in the way
        db.execute(insert, {"email": "SAM@acme-corp.com", "code": "RAW1", "org": a})
    db.rollback()
    assert identity.is_duplicate_email_error(ei.value)
    db.execute(insert, {"email": "SAM@acme-corp.com", "code": "RAW2", "org": b})       # another organization: allowed
    db.commit()
    db.execute(insert, {"email": "Root@Zoiko-Platform.com", "code": "RAW3", "org": None})
    db.commit()
    with pytest.raises(IntegrityError):                # two platform accounts with one address: refused
        db.execute(insert, {"email": "root@zoiko-platform.com", "code": "RAW4", "org": None})
    db.rollback()


def test_two_simultaneous_adds_of_one_address_in_one_org_one_wins_the_other_gets_the_friendly_error(tmp_path, monkeypatch):
    """Real concurrency: two threads, two sessions, one file database. Both pass the app check at the same moment (a barrier
    holds them there), both insert; the unique index lets exactly one through and the loser gets the friendly 409."""
    import threading
    from sqlalchemy.orm import sessionmaker as _sm
    engine = create_engine(f"sqlite:///{tmp_path / 'race.db'}", connect_args={"check_same_thread": False, "timeout": 30})
    Base.metadata.create_all(engine)
    Session_ = _sm(bind=engine, expire_on_commit=False)
    setup = Session_()
    org = _register(setup, "boss@race-corp.com", "BossPass9", "Race Org")
    setup.close()

    barrier = threading.Barrier(2, timeout=20)
    real_lookup = identity.account_in_organization
    first_call = threading.local()

    def lookup_then_wait(db_, email, organization_id, **kw):
        found = real_lookup(db_, email, organization_id, **kw)
        if not getattr(first_call, "done", False):
            first_call.done = True
            barrier.wait()                                    # both requests have seen "free" before either writes
        return found

    monkeypatch.setattr(identity, "account_in_organization", lookup_then_wait)
    codes = iter(range(1, 100))
    monkeypatch.setattr("app.core.code_generation.generate_employee_code", lambda db_, organization_id=None: f"RACE{next(codes):03d}")
    outcomes, lock = [], threading.Lock()

    def add(last):
        s = Session_()
        try:
            e = employee_service.create_employee(s, EmployeeCreate(email="Racer@Race-Corp.com", first_name="Ray", last_name=last,
                                                                   job_title="Analyst", date_of_joining="2026-01-01"), organization_id=org)
            with lock:
                outcomes.append(("ok", e.id))
        except ZoikoException as exc:
            with lock:
                outcomes.append((exc.status_code, exc.message))
        except Exception as exc:                              # anything else is a failure of this test
            with lock:
                outcomes.append(("raw", repr(exc)))
        finally:
            s.close()

    threads = [threading.Thread(target=add, args=(n,)) for n in ("One", "Two")]
    for t in threads:
        t.start()
    for t in threads:
        t.join(60)
    assert sorted(o[0] for o in outcomes if o[0] == "ok") == ["ok"], outcomes
    assert [o for o in outcomes if o[0] != "ok"] == [(409, identity.DUPLICATE_EMAIL_MESSAGE)], outcomes
    check = Session_()
    assert check.query(Employee).filter(Employee.email == "racer@race-corp.com", Employee.organization_id == org).count() == 1
    check.close()
    engine.dispose()


def test_identity_helpers():
    assert identity.normalize_email("  Sam@Acme-Corp.COM ") == EMAIL
    assert identity.DUPLICATE_EMAIL_MESSAGE == "An employee with this email already exists in this organization."
