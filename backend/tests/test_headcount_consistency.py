"""Headcount agreement: after the org admin creates one employee, the dashboards and the
My Organization section agree (2 total, 2 active) instead of showing 1 active vs 2 total."""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.dependencies import get_current_user
from app.database import Base, get_db
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import Organization, OrganizationStatus


@pytest.fixture
def client():
    from app.main import app

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add(Organization(id=1, name="Acme", status=OrganizationStatus.ACTIVE))
    s.commit()

    def add(key, role, status=EmployeeStatus.ACTIVE, active=True):
        e = Employee(email=f"{key}@example.com", hashed_password="x", employee_code=f"C-{key}", role=role,
                     first_name=key.title(), last_name="U", job_title="t",
                     employment_type=EmploymentType.FULL_TIME, status=status, is_active=active,
                     date_of_joining=date.today(), organization_id=1)
        s.add(e)
        s.commit()
        return e

    admin = add("admin", UserRole.ADMIN)
    add("emp", UserRole.EMPLOYEE)
    add("gone", UserRole.EMPLOYEE, status=EmployeeStatus.TERMINATED, active=False)
    box = {"user": admin}
    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: box["user"]
    c = TestClient(app, raise_server_exceptions=False)
    yield c
    for dep in (get_db, get_current_user):
        app.dependency_overrides.pop(dep, None)
    s.close()
    engine.dispose()


def test_dashboards_and_organization_section_agree_on_headcount(client):
    hr = client.get("/hr/dashboard/stats").json()
    assert (hr["total_employees"], hr["active_employees"]) == (2, 2)

    org_dash = client.get("/hr/organization/dashboard").json()
    assert (org_dash["total_employees"], org_dash["active_employees"]) == (2, 2)

    org = client.get("/hr/organization").json()
    assert (org["total_employees"], org["active_employees"]) == (2, 2)
