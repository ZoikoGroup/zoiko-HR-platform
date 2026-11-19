"""Super Admin can create an organization (with its first admin) from User Management."""

import pathlib
import sys
from datetime import date
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from app.core.dependencies import get_current_user
from app.core.security import verify_password
from app.database import Base, get_db
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import Organization
from app.modules.super_admin.models import AuditLog


def _person(db, role, email):
    e = Employee(email=email, hashed_password="x", employee_code=email[:6], role=role, first_name="Some", last_name="One",
                 job_title="t", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE,
                 date_of_joining=date.today(), organization_id=None)
    db.add(e)
    db.commit()
    return e


@pytest.fixture
def client():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    from app.main import app

    box = {"user": _person(s, UserRole.SUPER_ADMIN, "root@example.com")}
    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: box["user"]
    n = iter(range(1, 1000))
    with patch("app.core.code_generation.generate_employee_code", lambda db, organization_id=None: f"EMP-{next(n):04d}"), \
         patch("app.services.email_service.send_registration_received"), \
         patch("app.services.email_service.send_new_organization_created"), \
         patch("app.modules.billing.quotation_service.create_and_send_quotation"):
        c = TestClient(app, raise_server_exceptions=False)
        c.db, c.box = s, box
        yield c
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
    s.close()
    engine.dispose()


BODY = {"organization": "Initech Corp", "admin_name": "Olivia Owner", "admin_email": "olivia@example.com", "plan_code": "core"}


def test_creates_org_and_first_admin_with_one_time_temp_password(client):
    r = client.post("/super-admin/organizations", json=BODY)
    assert r.status_code == 201, r.text
    out = r.json()
    assert out["organization_name"] == "Initech Corp" and out["admin_email"] == "olivia@example.com"
    temp = out["temporary_password"]
    assert len(temp) >= 8
    org = client.db.query(Organization).filter(Organization.id == out["organization_id"]).one()
    admin = client.db.query(Employee).filter(Employee.email == "olivia@example.com").one()
    assert admin.organization_id == org.id and admin.role == UserRole.ADMIN
    assert admin.must_change_password is True
    assert verify_password(temp, admin.hashed_password)
    assert temp not in str([a.details for a in client.db.query(AuditLog).all()])  # never written to the audit trail
    event = [a for a in client.db.query(AuditLog).all() if (a.details or {}).get("event") == "organization.created_by_super_admin"]
    assert len(event) == 1 and event[0].performed_by_email == "root@example.com"


def test_duplicate_name_is_rejected_and_bad_input_too(client):
    assert client.post("/super-admin/organizations", json=BODY).status_code == 201
    dup_name = client.post("/super-admin/organizations", json={**BODY, "organization": "initech corp", "admin_email": "x@example.com"})
    assert dup_name.status_code == 400 and "already exists" in dup_name.json()["message"]
    bad = client.post("/super-admin/organizations", json={**BODY, "organization": "Third", "admin_email": "not-an-email"})
    assert bad.status_code == 400
    assert client.db.query(Organization).count() == 1


def test_an_admin_email_already_used_in_another_organization_gets_its_own_account(client):
    """E-mail identity is per organization: the same address becomes a separate admin account in the new organization."""
    first = client.post("/super-admin/organizations", json=BODY)
    second = client.post("/super-admin/organizations", json={**BODY, "organization": "Other Co", "admin_email": "  OLIVIA@example.com "})
    assert first.status_code == 201 and second.status_code == 201, second.text
    admins = client.db.query(Employee).filter(Employee.email == "olivia@example.com").order_by(Employee.id).all()
    assert [a.organization_id for a in admins] == [first.json()["organization_id"], second.json()["organization_id"]]
    assert all(a.must_change_password for a in admins), "each organization's admin got its own one-time password"
    assert verify_password(second.json()["temporary_password"], admins[1].hashed_password)
    assert not verify_password(second.json()["temporary_password"], admins[0].hashed_password), "the first account is untouched"


def test_a_platform_account_address_cannot_become_an_organization_admin(client):
    r = client.post("/super-admin/organizations", json={**BODY, "admin_email": "root@example.com"})
    assert r.status_code == 409 and "platform account" in r.json()["message"]
    assert client.db.query(Organization).count() == 0, "refused before the organization was written"


@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.HR_ADMIN, UserRole.EMPLOYEE])
def test_only_super_admin_can_create(client, role):
    client.box["user"] = _person(client.db, role, f"{role.value}@example.com")
    assert client.post("/super-admin/organizations", json=BODY).status_code == 403
    assert client.db.query(Organization).count() == 0
