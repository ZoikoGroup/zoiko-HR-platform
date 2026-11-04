"""Fixtures for the tenant-privacy suite (ZHR-PRIV-001). Two synthetic tenants, TENANT-A and TENANT-B, every role, a platform
super admin, and canary strings planted in the sensitive fields so a leak anywhere is detectable by plain substring search.

No real people, emails or numbers appear anywhere in these tests."""
from __future__ import annotations

from datetime import date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import create_access_token, hash_password
from app.database import Base, get_db
from app.modules.billing.models import BillingSubscription  # noqa: F401 — register the entitlement middleware's table in Base.metadata
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import EmployeeProfile, Organization, OrganizationStatus
from app.modules.super_admin.models import AuditAction, AuditLog

from tests.privacy.support import CANARY, PW, _emp, all_canaries_in, token_for  # noqa: E402,F401


class World:
    """Everything a test needs, plus a client that always sends the right token."""

    def __init__(self, db, app):
        self.db, self.app = db, app
        self.client = TestClient(app, raise_server_exceptions=False)
        self.u: dict[str, Employee] = {}

    def get(self, who, url, **kw):
        return self.client.get(url, headers=token_for(self.u[who]), **kw)

    def post(self, who, url, **kw):
        return self.client.post(url, headers=token_for(self.u[who]), **kw)

    def put(self, who, url, **kw):
        return self.client.put(url, headers=token_for(self.u[who]), **kw)

    def delete(self, who, url, **kw):
        return self.client.delete(url, headers=token_for(self.u[who]), **kw)


@pytest.fixture(autouse=True)
def _no_rate_limit():
    """The login / enrolment limits are per client address and the suite is one client: they are tested on their own elsewhere."""
    from app.core.rate_limiter import limiter
    limiter.enabled = False
    yield
    limiter.enabled = True


@pytest.fixture
def world(monkeypatch):
    from app.main import app
    monkeypatch.setattr("app.modules.billing.service.evaluation_access_block_reason", lambda db, org_id: None)
    # Plans are not what this suite tests: every feature is entitled, so a 403 can only come from the privacy rules.
    from app.modules.billing import entitlement_middleware as _em
    monkeypatch.setattr(_em, "check_entitlement", lambda db, org_id, key: {"state": _em.ENTITLED_AVAILABLE, "mode": "test", "allowed": True, "reason_code": "TEST"})
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine, expire_on_commit=False)()
    # The entitlement ASGI middleware opens its own sessions, outside FastAPI dependency_overrides.
    # Keep those reads on the same isolated fixture database instead of the process-level DB URL.
    from app.modules.billing.entitlement_middleware import EntitlementMiddleware
    isolated_sessions = sessionmaker(bind=engine, expire_on_commit=False)
    for middleware in app.user_middleware:
        if middleware.cls is EntitlementMiddleware:
            middleware.kwargs["db_session_factory"] = isolated_sessions
    # FastAPI caches the built middleware chain after the first TestClient is
    # created; rebuild it so the isolated session factory takes effect.
    app.middleware_stack = None
    db.add_all([
        Organization(id=1, name="TENANT-A", organization_name="TENANT-A", status=OrganizationStatus.ACTIVE),
        Organization(id=2, name="TENANT-B", organization_name="TENANT-B", status=OrganizationStatus.ACTIVE),
    ])
    db.commit()
    w = World(db, app)
    w.u = {
        "platform": _emp(db, "platform.person@zoiko-ops.example.com", UserRole.SUPER_ADMIN, None, "Platform", "Operator"),
        "a_admin": _emp(db, "admin@tenant-a.example.com", UserRole.ADMIN, 1, "AdminAlpha", "ZZADMINA"),
        "a_hr": _emp(db, "hr@tenant-a.example.com", UserRole.HR_ADMIN, 1, "HrAlpha", "ZZHRA"),
        "a_manager": _emp(db, "manager@tenant-a.example.com", UserRole.MANAGER, 1, "MgrAlpha", "ZZMGRA"),
        "a_emp1": _emp(db, CANARY["email_a1"], UserRole.EMPLOYEE, 1, CANARY["name_a1"], CANARY["last_a1"], phone=CANARY["phone_a1"], basic_salary=CANARY["salary_a1"]),
        "a_emp2": _emp(db, "canary.a2@tenant-a.example.com", UserRole.EMPLOYEE, 1, CANARY["name_a2"], CANARY["last_a2"]),
        "b_admin": _emp(db, "admin@tenant-b.example.com", UserRole.ADMIN, 2, "AdminGamma", "ZZADMINB"),
        "b_emp1": _emp(db, CANARY["email_b1"], UserRole.EMPLOYEE, 2, CANARY["name_b1"], CANARY["last_b1"], basic_salary=CANARY["salary_b1"]),
    }
    db.add_all([
        EmployeeProfile(employee_id=w.u["a_emp1"].id, organization_id=1, bank_account=CANARY["iban_a1"], pan_number=CANARY["pan_a1"], blood_group="O+"),
        EmployeeProfile(employee_id=w.u["b_emp1"].id, organization_id=2, bank_account=CANARY["iban_b1"]),
    ])
    # tenant activity rows (what the Workflows / Audit Logs pages are built from)
    db.add_all([
        AuditLog(action=AuditAction.CREATE, entity_type="Employee", entity_id=w.u["a_emp1"].id, performed_by=w.u["a_admin"].id,
                 performed_by_email=w.u["a_admin"].email, organization_id=1, actor_name="AdminAlpha ZZADMINA", actor_role="admin",
                 action_type="employee.added", target_label=f"{CANARY['name_a1']} {CANARY['last_a1']} (C-1)", status="success",
                 changes=[{"field": "bank_account", "after": CANARY["iban_a1"]}], details={"counts": {"total": 1}, "organization_name": "TENANT-A"}),
        AuditLog(action=AuditAction.CREATE, entity_type="Employee", entity_id=None, performed_by=w.u["b_admin"].id,
                 performed_by_email=w.u["b_admin"].email, organization_id=2, actor_name="AdminGamma ZZADMINB", actor_role="admin",
                 action_type="employee.bulk_imported", target_label="rows.csv", status="failed", error_message=f"Row 3: duplicate email {CANARY['email_b1']}",
                 details={"counts": {"total": 50, "succeeded": 48, "failed": 2}, "organization_name": "TENANT-B"}),
        AuditLog(action=AuditAction.UPDATE, entity_type="Organization", entity_id=1, performed_by=w.u["platform"].id,
                 performed_by_email=w.u["platform"].email, organization_id=1, details={"status": "active", "admin_email": "admin@tenant-a.example.com"}),
    ])
    db.commit()
    app.dependency_overrides[get_db] = lambda: db
    yield w
    app.dependency_overrides.pop(get_db, None)
    db.close()
    engine.dispose()


