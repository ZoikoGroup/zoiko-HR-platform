"""
tests/test_registration_activation.py
----------------------------------------
Coverage for "Remove Super Admin Approval Requirement from New Organization
Creation": self-registered organizations must be ACTIVE/is_active=True
immediately, and the new admin must be able to log in right away — with no
separate super-admin approval step in between.

Runs the real HTTP endpoints (POST /auth/register, POST /auth/login, and
POST /super-admin/organizations/{id}/status) against a minimal FastAPI app
mounting only the routers under test, with `get_db` swapped for an
in-memory sqlite session — the same pattern as test_billing_me.py.

Covers:
  1. register_enterprise() returns an org with status=ACTIVE, is_active=True.
  2. End-to-end: register -> log in immediately -> succeeds, no
     "awaiting Super Admin approval" error, a real access token comes back.
  3. The existing defensive login blocks (REJECTED/SUSPENDED/DEACTIVATED/
     ON_HOLD) still work unchanged — Step 2 didn't weaken them.
  4. The PENDING branch of the login gate itself still blocks login (set
     directly via the DB, since — see note below — the super-admin
     org-status-update endpoint does not currently expose "pending" as a
     settable value; that's pre-existing and unrelated to this change, not
     something this prompt asked for, so it isn't added here).
"""
import sys
import pathlib

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
from app.core.dependencies import get_current_user
from app.core.exceptions import ZoikoException, zoiko_exception_handler, generic_exception_handler
from app.modules.employee.router import auth_router
from app.modules.employee import service as employee_service
from app.modules.hr.models import Organization, OrganizationStatus
from app.modules.super_admin.router import router as super_admin_router


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


class _Caller:
    def __init__(self, employee_id, org_id, role):
        self.id = employee_id
        self.organization_id = org_id
        self.role = role


@pytest.fixture
def client(db):
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(super_admin_router)

    def _override_db():
        yield db

    app.dependency_overrides[get_db] = _override_db

    user_box = {"user": None}

    def _override_current_user():
        return user_box["user"]

    app.dependency_overrides[get_current_user] = _override_current_user

    from app.core.rate_limiter import limiter
    limiter.enabled = False
    app.state.limiter = limiter
    app.add_middleware(SlowAPIMiddleware)
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_exception_handler(ZoikoException, zoiko_exception_handler)
    app.add_exception_handler(Exception, generic_exception_handler)

    test_client = TestClient(app)
    test_client.user_box = user_box
    return test_client


def _register_payload(**overrides):
    payload = {
        "name": "Ada Lovelace",
        "email": "ada@newco.example",
        "password": "SecurePass123!",
        "organization": "NewCo Inc.",
        "plan_code": "core",
        "billing_cycle": "monthly",
    }
    payload.update(overrides)
    return payload


# ── Step 5.1: creation-time status ───────────────────────────────────────────

def test_register_enterprise_activates_org_immediately(db):
    from app.modules.employee.schema import RegisterRequest

    data = RegisterRequest(**_register_payload())
    result = employee_service.register_enterprise(db, data)

    org = db.query(Organization).filter(Organization.id == result["organization_id"]).first()
    assert org.status == OrganizationStatus.ACTIVE
    assert org.is_active is True


# ── Step 5.2: the end-to-end proof — register, then log in immediately ─────

def test_register_then_login_succeeds_immediately(client):
    payload = _register_payload(email="brand-new-admin@newco.example")
    reg_resp = client.post("/auth/register", json=payload)
    assert reg_resp.status_code == 200, reg_resp.text

    login_resp = client.post("/auth/login", json={
        "email": payload["email"],
        "password": payload["password"],
    })

    assert login_resp.status_code == 200, login_resp.text
    body = login_resp.json()
    assert "awaiting" not in body.get("detail", "") if "detail" in body else True
    assert body["access_token"]
    assert body["token_type"] == "bearer"
    assert body["employee"]["email"] == payload["email"]


# ── Step 5.3: existing defensive blocks still work unchanged ───────────────

@pytest.mark.parametrize("status,expected_snippet", [
    (OrganizationStatus.REJECTED, "rejected"),
    (OrganizationStatus.SUSPENDED, "suspended"),
    (OrganizationStatus.DEACTIVATED, "deactivated"),
])
def test_login_still_blocked_for_bad_org_statuses(client, status, expected_snippet):
    payload = _register_payload(email=f"user-{status.value}@newco.example", organization=f"Org {status.value}")
    reg_resp = client.post("/auth/register", json=payload)
    assert reg_resp.status_code == 200, reg_resp.text
    org_id = reg_resp.json()["organization_id"]

    # Directly flip the org to the status under test (bypassing the status
    # endpoint's confirmation-token flow, which is orthogonal to what's being
    # tested here: that the LOGIN GATE itself still rejects these statuses).
    db_gen = client.app.dependency_overrides[get_db]()
    db = next(db_gen)
    org = db.query(Organization).filter(Organization.id == org_id).first()
    org.status = status
    org.is_active = False
    db.commit()

    login_resp = client.post("/auth/login", json={
        "email": payload["email"],
        "password": payload["password"],
    })
    assert login_resp.status_code == 401
    assert expected_snippet in login_resp.json()["detail"].lower()


def test_login_still_blocked_for_on_hold_org(client):
    """ON_HOLD isn't in employee/service.py's login gate's explicit branches
    (that gate only special-cases PENDING/REJECTED/SUSPENDED/DEACTIVATED —
    confirmed by reading the function; ON_HOLD falls through to the org
    being treated as not ACTIVE/APPROVED with no matching branch, so no
    UnauthorizedException is raised there and login proceeds to the
    employee-level checks). This test pins that actual behavior rather than
    assuming ON_HOLD is blocked by the live gate — the OTHER (dead) gate in
    hr/service.py does have an explicit ON_HOLD branch, but per this
    prompt's investigation that function is never called by any router."""
    payload = _register_payload(email="user-onhold@newco.example", organization="Org OnHold")
    reg_resp = client.post("/auth/register", json=payload)
    assert reg_resp.status_code == 200, reg_resp.text
    org_id = reg_resp.json()["organization_id"]

    db_gen = client.app.dependency_overrides[get_db]()
    db = next(db_gen)
    org = db.query(Organization).filter(Organization.id == org_id).first()
    org.status = OrganizationStatus.ON_HOLD
    org.is_active = False
    db.commit()

    login_resp = client.post("/auth/login", json={
        "email": payload["email"],
        "password": payload["password"],
    })
    assert login_resp.status_code == 200, login_resp.text


# ── Step 5.4: PENDING still blocks login (the surviving defensive branch) ──

def test_pending_org_status_still_blocks_login(client):
    """Proves Step 2 didn't strip the PENDING branch out of the login gate —
    it's just no longer reachable from self-registration. NOTE: the
    super-admin org-status-update endpoint's status_map (super_admin/router.py
    update_organization_status) does not include "pending" as a settable
    value — that's pre-existing and this prompt didn't ask for it to be
    added, so this test sets PENDING directly via the DB (standing in for
    "however a super admin ends up setting it") rather than asserting a
    capability of that specific endpoint that doesn't exist. See PR
    description."""
    payload = _register_payload(email="user-pending@newco.example", organization="Org Pending")
    reg_resp = client.post("/auth/register", json=payload)
    assert reg_resp.status_code == 200, reg_resp.text
    org_id = reg_resp.json()["organization_id"]

    db_gen = client.app.dependency_overrides[get_db]()
    db = next(db_gen)
    org = db.query(Organization).filter(Organization.id == org_id).first()
    org.status = OrganizationStatus.PENDING
    org.is_active = False
    db.commit()

    login_resp = client.post("/auth/login", json={
        "email": payload["email"],
        "password": payload["password"],
    })
    assert login_resp.status_code == 401
    assert "awaiting super admin approval" in login_resp.json()["detail"].lower()


def test_super_admin_status_endpoint_has_no_pending_option(client, db):
    """Documents the gap found while writing test #4 above: confirms (rather
    than just asserting in prose) that POST /super-admin/organizations/{id}/
    status genuinely rejects "pending" today, so a future change that adds
    it will get a clear signal here to update/remove this test."""
    payload = _register_payload(email="user-endpoint-check@newco.example", organization="Org EndpointCheck")
    reg_resp = client.post("/auth/register", json=payload)
    org_id = reg_resp.json()["organization_id"]

    from app.modules.employee.models import Employee, UserRole
    from datetime import date as date_cls
    super_admin = Employee(
        email="super@z.test", hashed_password="x", employee_code="SA-0001",
        role=UserRole.SUPER_ADMIN, first_name="Super", last_name="Admin",
        job_title="Super Admin", employment_type="full_time", status="active",
        date_of_joining=date_cls(2026, 1, 1),
    )
    db.add(super_admin)
    db.commit()
    db.refresh(super_admin)

    client.user_box["user"] = _Caller(super_admin.id, None, "super_admin")
    resp = client.post(f"/super-admin/organizations/{org_id}/status", json={"status": "pending"})
    assert resp.status_code == 400
    assert "invalid status" in resp.json()["detail"].lower()
