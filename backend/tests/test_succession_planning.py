"""Succession planning: both people must be real employees of the organization (ZHR-80), and the rest is checked."""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.modules.hr.models import Organization, OrganizationStatus

URL = "/hr/workforce/succession"


def _person(email, org, n, first, last, role=None):
    from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
    return Employee(email=email, hashed_password="x", employee_code=f"C{n}", role=role or UserRole.EMPLOYEE, first_name=first, last_name=last,
                    job_title="t", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=org)


@pytest.fixture
def env():
    from app.main import app
    from app.core.dependencies import get_current_admin, get_current_user
    from app.modules.employee.models import UserRole

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add_all([Organization(id=1, name="A", status=OrganizationStatus.ACTIVE), Organization(id=2, name="B", status=OrganizationStatus.ACTIVE)])
    s.commit()
    admin = _person("a@x.com", 1, 1, "Priya", "Shah", UserRole.ADMIN)
    ann, bob = _person("ann@x.com", 1, 2, "Ann", "Lee"), _person("bob@x.com", 1, 3, "Bob", "Ray")
    stranger = _person("s@x.com", 2, 4, "Sam", "Other", UserRole.ADMIN)
    s.add_all([admin, ann, bob, stranger])
    s.commit()
    box = {"user": admin}
    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: box["user"]
    app.dependency_overrides[get_current_admin] = lambda: box["user"]
    c = TestClient(app, raise_server_exceptions=False)
    c.db, c.box, c.admin, c.ann, c.bob, c.stranger = s, box, admin, ann, bob, stranger
    yield c
    for dep in (get_db, get_current_user, get_current_admin):
        app.dependency_overrides.pop(dep, None)
    s.close()
    engine.dispose()


def good(env, **over):
    base = {"employee_id": env.ann.id, "successor_employee_id": env.bob.id, "readiness_level": "ready", "risk_level": "high", "target_position": "Head of Sales"}
    base.update(over)
    return base


def _fields(r):
    assert r.status_code == 422, r.text
    return {e["loc"][-1]: e["msg"] for e in r.json()["detail"]}


def test_an_employee_or_successor_that_matches_nobody_is_refused(env):
    for body in (good(env, employee_id=999), good(env, successor_employee_id=999)):
        r = env.post(URL, json=body)
        assert r.status_code == 400 and "not found in this organization" in r.text, r.text
    assert env.get(URL).json()["items"] == []


def test_people_from_another_organization_are_refused(env):
    assert env.post(URL, json=good(env, employee_id=env.stranger.id)).status_code == 400
    assert env.post(URL, json=good(env, successor_employee_id=env.stranger.id)).status_code == 400
    assert env.get(URL).json()["items"] == []


def test_nobody_is_their_own_successor(env):
    r = env.post(URL, json=good(env, successor_employee_id=env.ann.id))
    assert r.status_code == 400 and "own successor" in r.text


def test_a_valid_record_is_created_and_shows_both_names_everywhere(env):
    r = env.post(URL, json=good(env))
    assert r.status_code == 201, r.text
    b = r.json()
    assert (b["employee_name"], b["successor_name"]) == ("Ann Lee", "Bob Ray")
    listed = env.get(URL).json()["items"][0]
    assert (listed["employee_name"], listed["successor_name"]) == ("Ann Lee", "Bob Ray")
    one = env.get(f"{URL}/{b['id']}").json()
    assert (one["employee_name"], one["successor_name"]) == ("Ann Lee", "Bob Ray")


def test_a_successor_is_optional_but_the_employee_is_not(env):
    ok = env.post(URL, json=good(env, successor_employee_id=None, target_position="CFO"))
    assert ok.status_code == 201 and ok.json()["successor_name"] is None
    for blank in (None, "", 0):
        assert "employee_id" in _fields(env.post(URL, json=good(env, employee_id=blank)))
    assert "successor_employee_id" in _fields(env.post(URL, json=good(env, successor_employee_id="abc")))


def test_levels_dates_and_text_are_checked(env):
    assert "readiness_level" in _fields(env.post(URL, json=good(env, readiness_level="soon")))
    assert "risk_level" in _fields(env.post(URL, json=good(env, risk_level="extreme")))
    assert "review_date" in _fields(env.post(URL, json=good(env, review_date="1999-01-01")))
    assert "target_position" in _fields(env.post(URL, json=good(env, target_position="x" * 151)))


def test_the_same_plan_is_not_added_twice(env):
    assert env.post(URL, json=good(env)).status_code == 201
    dup = env.post(URL, json=good(env, target_position=" head  of sales ".replace("  ", " ")))
    assert dup.status_code == 400 and "already exists" in dup.text
    assert env.post(URL, json=good(env, target_position="Head of Marketing")).status_code == 201


def test_editing_can_change_the_employee_and_successor_and_cannot_blank_the_required_parts(env):
    sid = env.post(URL, json=good(env)).json()["id"]
    swapped = env.put(f"{URL}/{sid}", json={"employee_id": env.bob.id, "successor_employee_id": env.ann.id})
    assert swapped.status_code == 200, swapped.text
    assert (swapped.json()["employee_name"], swapped.json()["successor_name"]) == ("Bob Ray", "Ann Lee")
    assert env.put(f"{URL}/{sid}", json={"employee_id": 999}).status_code == 400
    assert env.put(f"{URL}/{sid}", json={"successor_employee_id": env.bob.id}).status_code == 400      # bob is now the employee
    assert env.put(f"{URL}/{sid}", json={"employee_id": None}).status_code == 422
    assert env.put(f"{URL}/{sid}", json={"readiness_level": ""}).status_code == 422
    cleared = env.put(f"{URL}/{sid}", json={"successor_employee_id": None})
    assert cleared.status_code == 200 and cleared.json()["successor_name"] is None


def test_other_organizations_see_nothing_and_only_admins_write(env):
    sid = env.post(URL, json=good(env)).json()["id"]
    env.box["user"] = env.stranger
    assert env.get(URL).json()["items"] == []
    assert env.put(f"{URL}/{sid}", json={"risk_level": "low"}).status_code == 404
    assert env.delete(f"{URL}/{sid}").status_code == 404
