"""QA bug 29: Organization › "View audit log" shows what happened inside the admin's own organisation, newest first, and
nothing of any other organisation. Organisation admins only."""
from datetime import date
from types import SimpleNamespace

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
def ctx():
    from app.main import app
    from app.modules.super_admin import activity_service
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add_all([Organization(id=1, name="Acme", status=OrganizationStatus.ACTIVE),
               Organization(id=2, name="Other", status=OrganizationStatus.ACTIVE)])
    s.commit()

    def add(key, role, org=1):
        e = Employee(email=f"{key}@example.com", hashed_password="x", employee_code=f"C-{key}", role=role,
                     first_name=key.title(), last_name="User", job_title="t", employment_type=EmploymentType.FULL_TIME,
                     status=EmployeeStatus.ACTIVE, is_active=True, date_of_joining=date.today(), organization_id=org)
        s.add(e)
        s.commit()
        return e

    people = {"admin": add("admin", UserRole.ADMIN), "hr": add("hr", UserRole.HR_ADMIN), "emp": add("emp", UserRole.EMPLOYEE),
              "other": add("other", UserRole.ADMIN, org=2)}
    activity_service.record_activity(s, action_type="employee.added", actor=people["admin"], organization_id=1,
                                     target_name="Emp User", entity_type="Employee")
    activity_service.record_activity(s, action_type="employee.updated", actor=people["hr"], organization_id=1,
                                     target_name="Emp User", entity_type="Employee")
    activity_service.record_activity(s, action_type="employee.added", actor=people["other"], organization_id=2,
                                     target_name="Secret Person", entity_type="Employee")
    s.commit()
    box = {"user": people["admin"]}
    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: box["user"]
    yield SimpleNamespace(client=TestClient(app, raise_server_exceptions=False), people=people, box=box)
    for dep in (get_db, get_current_user):
        app.dependency_overrides.pop(dep, None)
    s.close()
    engine.dispose()


def test_the_admin_sees_their_own_organisations_log_newest_first(ctx):
    r = ctx.client.get("/hr/organization/audit-log")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 2, "nothing from the other organisation"
    assert [e["action_type"] for e in body["events"]] == ["employee.updated", "employee.added"]
    first = body["events"][0]
    assert first["sentence"] and first["actor_name"] and "ip_address" not in first and "details" not in first
    assert "Secret Person" not in r.text
    assert "Employee" in body["areas"]


def test_filters_and_search(ctx):
    r = ctx.client.get("/hr/organization/audit-log", params={"q": "Hr"}).json()
    assert [e["action_type"] for e in r["events"]] == ["employee.updated"]
    assert ctx.client.get("/hr/organization/audit-log", params={"action_group": "Leave"}).json()["total"] == 0
    assert ctx.client.get("/hr/organization/audit-log", params={"action_group": "Nonsense"}).status_code == 400
    page = ctx.client.get("/hr/organization/audit-log", params={"page_size": 1, "page": 2}).json()
    assert page["total"] == 2 and len(page["events"]) == 1


def test_only_organisation_admins_can_read_it(ctx):
    for who in ("hr", "emp"):
        ctx.box["user"] = ctx.people[who]
        assert ctx.client.get("/hr/organization/audit-log").status_code == 403, who
