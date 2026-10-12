"""ZHR-51: an organization admin can switch a department active / inactive, safely."""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.dependencies import get_current_user
from app.database import Base, get_db
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import Department, Organization, OrganizationStatus


@pytest.fixture
def client():
    from app.main import app

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add_all([Organization(id=1, name="Acme", status=OrganizationStatus.ACTIVE), Organization(id=2, name="Globex", status=OrganizationStatus.ACTIVE)])
    s.commit()
    people = {}
    for key, role, org in (("admin", UserRole.ADMIN, 1), ("hr", UserRole.HR_ADMIN, 1), ("emp", UserRole.EMPLOYEE, 1), ("other", UserRole.ADMIN, 2)):
        e = Employee(email=f"{key}@example.com", hashed_password="x", employee_code=f"C-{key}", role=role, first_name=key.title(), last_name="U",
                     job_title="t", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE,
                     date_of_joining=date.today(), organization_id=org)
        s.add(e)
        people[key] = e
    s.commit()
    box = {"user": people["admin"]}
    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: box["user"]
    c = TestClient(app, raise_server_exceptions=False)
    c.db, c.box, c.people = s, box, people
    yield c
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
    s.close()
    engine.dispose()


def _dept(db, name, code, org=1, parent=None, active=True):
    d = Department(name=name, code=code, organization_id=org, parent_id=parent, is_active=active)
    db.add(d)
    db.commit()
    return d


def _put(client, dept_id, **body):
    return client.put(f"/hr/departments/{dept_id}", json=body)


def test_admin_can_deactivate_and_reactivate(client):
    d = _dept(client.db, "Design", "DSN")
    r = _put(client, d.id, is_active=False)
    assert r.status_code == 200, r.text
    assert r.json()["is_active"] is False
    again = _put(client, d.id, is_active=True)
    assert again.status_code == 200 and again.json()["is_active"] is True


def test_inactive_departments_are_still_listed_when_asked(client):
    _dept(client.db, "Design", "DSN", active=False)
    _dept(client.db, "Sales", "SLS")
    shown = {x["name"] for x in client.get("/hr/departments", params={"include_inactive": True}).json()}
    hidden = {x["name"] for x in client.get("/hr/departments").json()}
    assert shown == {"Design", "Sales"} and hidden == {"Sales"}


def test_cannot_deactivate_a_department_with_active_employees(client):
    d = _dept(client.db, "Eng", "ENG")
    client.people["emp"].department_id = d.id
    client.db.commit()
    r = _put(client, d.id, is_active=False)
    assert r.status_code == 400
    assert "active employee" in str(r.json())
    client.db.refresh(d)
    assert d.is_active is True


def test_cannot_deactivate_a_department_with_active_sub_departments(client):
    parent = _dept(client.db, "Eng", "ENG")
    _dept(client.db, "Platform", "PLT", parent=parent.id)
    r = _put(client, parent.id, is_active=False)
    assert r.status_code == 400 and "sub-department" in str(r.json())


def test_cannot_activate_under_an_inactive_parent(client):
    parent = _dept(client.db, "Eng", "ENG", active=False)
    child = _dept(client.db, "Platform", "PLT", parent=parent.id, active=False)
    r = _put(client, child.id, is_active=True)
    assert r.status_code == 400 and "parent" in str(r.json()).lower()
    assert _put(client, parent.id, is_active=True).status_code == 200
    assert _put(client, child.id, is_active=True).status_code == 200


def test_editing_other_fields_does_not_touch_the_status(client):
    d = _dept(client.db, "Design", "DSN", active=False)
    r = _put(client, d.id, description="Brand and UX")
    assert r.status_code == 200 and r.json()["is_active"] is False
    r2 = _put(client, d.id, is_active=None)  # null never means "inactive"
    assert r2.json()["is_active"] is False


def test_other_organizations_and_employees_cannot_change_it(client):
    d = _dept(client.db, "Design", "DSN")
    client.box["user"] = client.people["other"]
    assert _put(client, d.id, is_active=False).status_code == 404
    client.box["user"] = client.people["emp"]
    assert _put(client, d.id, is_active=False).status_code == 403
    client.db.refresh(d)
    assert d.is_active is True
