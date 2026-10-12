"""Courses: nothing a learner relies on can be left blank, on adding or on editing, and learners see only active courses."""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.modules.hr.models import LearningCourse, LearningEnrollment, Organization, OrganizationStatus


def _person(email, role, org, n):
    from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType
    return Employee(email=email, hashed_password="x", employee_code=f"C{n}", role=role, first_name="P", last_name=str(n), job_title="t",
                    employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=org)


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
    admin, learner, other = _person("a@x.com", UserRole.ADMIN, 1, 1), _person("l@x.com", UserRole.EMPLOYEE, 1, 2), _person("o@x.com", UserRole.ADMIN, 2, 3)
    s.add_all([admin, learner, other])
    s.commit()
    box = {"user": admin}
    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: box["user"]
    app.dependency_overrides[get_current_admin] = lambda: box["user"]
    c = TestClient(app, raise_server_exceptions=False)
    c.db, c.box, c.admin, c.learner, c.other = s, box, admin, learner, other
    yield c
    for dep in (get_db, get_current_user, get_current_admin):
        app.dependency_overrides.pop(dep, None)
    s.close()
    engine.dispose()


URL = "/hr/learning/courses"
GOOD = {"course_name": "Fire Safety", "description": "How to react to a fire.", "course_type": "online", "category": "Compliance", "provider": "Internal", "duration_hours": 2}


def _fields(r):
    assert r.status_code == 422, r.text
    return {e["loc"][-1]: e["msg"] for e in r.json()["detail"]}


def test_a_complete_course_is_saved_with_its_department_and_link(env):
    r = env.post(URL, json={**GOOD, "department": " HR ", "resource_link": "https://example.com/fire"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert (body["department"], body["resource_link"], body["status"]) == ("HR", "https://example.com/fire", "active")
    assert env.get(f"{URL}/{body['id']}").json()["department"] == "HR"


def test_the_details_learners_rely_on_are_required_on_create(env):
    f = _fields(env.post(URL, json={"course_name": "Only a name"}))
    assert {"description", "course_type", "category", "provider", "duration_hours"} <= set(f)
    f = _fields(env.post(URL, json={**GOOD, "description": "  ", "category": "", "provider": " ", "course_type": "", "duration_hours": 0}))
    assert {"description", "category", "provider", "course_type", "duration_hours"} <= set(f)
    assert "Field required" not in str(f.values())


def test_an_edit_can_never_blank_those_details(env):
    cid = env.post(URL, json=GOOD).json()["id"]
    for blank in ({"description": ""}, {"category": "  "}, {"provider": ""}, {"course_type": ""}, {"duration_hours": None}, {"course_name": " "}):
        r = env.put(f"{URL}/{cid}", json=blank)
        assert r.status_code == 422, (blank, r.text)
    row = env.get(f"{URL}/{cid}").json()
    assert (row["description"], row["category"], row["provider"], row["course_type"], row["duration_hours"]) == (GOOD["description"], "Compliance", "Internal", "online", 2)


def test_edits_that_keep_the_details_work_and_unsent_fields_stay(env):
    cid = env.post(URL, json=GOOD).json()["id"]
    r = env.put(f"{URL}/{cid}", json={"duration_hours": 5, "status": "inactive"})
    assert r.status_code == 200 and (r.json()["duration_hours"], r.json()["status"], r.json()["description"]) == (5, "inactive", GOOD["description"])
    assert env.put(f"{URL}/{cid}", json={"status": "draft"}).status_code == 422
    assert env.put(f"{URL}/{cid}", json={"duration_hours": 1001}).status_code == 422
    assert env.put(f"{URL}/{cid}", json={"resource_link": "not a link"}).status_code == 422


def test_names_are_unique_within_an_organization_only(env):
    assert env.post(URL, json=GOOD).status_code == 201
    dup = env.post(URL, json={**GOOD, "course_name": " fire  safety "})
    assert dup.status_code == 400 and "already exists" in dup.text
    env.box["user"] = env.other
    assert env.post(URL, json=GOOD).status_code == 201


def test_another_organizations_course_cannot_be_read_changed_or_deleted(env):
    cid = env.post(URL, json=GOOD).json()["id"]
    env.box["user"] = env.other
    assert env.get(f"{URL}/{cid}").status_code == 404
    assert env.put(f"{URL}/{cid}", json={"status": "inactive"}).status_code == 404
    assert env.delete(f"{URL}/{cid}").status_code == 404
    assert env.get(URL).json()["items"] == []


def test_learners_see_only_active_courses(env):
    live = env.post(URL, json=GOOD).json()["id"]
    hidden = env.post(URL, json={**GOOD, "course_name": "Draft course"}).json()["id"]
    env.put(f"{URL}/{hidden}", json={"status": "inactive"})
    env.box["user"] = env.learner
    names = [c["course_name"] for c in env.get(URL).json()["items"]]
    assert names == ["Fire Safety"]
    assert env.get(f"{URL}/{live}").status_code == 200
    assert env.get(f"{URL}/{hidden}").status_code == 404
    assert [c["course_name"] for c in env.get(URL, params={"status": "inactive"}).json()["items"]] == ["Fire Safety"]


def test_a_course_with_enrollments_is_not_deleted_but_deactivated(env):
    cid = env.post(URL, json=GOOD).json()["id"]
    env.db.add(LearningEnrollment(course_id=cid, employee_id=env.learner.id, status="enrolled", organization_id=1))
    env.db.commit()
    r = env.delete(f"{URL}/{cid}")
    assert r.status_code == 400 and "Inactive" in r.text
    other = env.post(URL, json={**GOOD, "course_name": "Unused"}).json()["id"]
    assert env.delete(f"{URL}/{other}").status_code == 200
