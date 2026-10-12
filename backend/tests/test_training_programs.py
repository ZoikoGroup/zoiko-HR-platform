"""Training programs: nothing a learner relies on can be left blank, on adding or editing; update and delete work."""

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.modules.hr.models import LearningTrainingProgramAssignment, Organization, OrganizationStatus


def _person(email, role, org, n):
    from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType
    return Employee(email=email, hashed_password="x", employee_code=f"C{n}", role=role, first_name="Pat", last_name=str(n), job_title="t",
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


URL = "/hr/learning/programs"


def good(env, **over):
    start = date.today() + timedelta(days=7)
    base = {"name": "Leadership Workshop", "description": "Two days on leading teams.", "instructor_id": env.admin.id,
            "start_date": start.isoformat(), "end_date": (start + timedelta(days=1)).isoformat(), "max_participants": 20}
    base.update(over)
    return base


def _fields(r):
    assert r.status_code == 422, r.text
    return {e["loc"][-1]: e["msg"] for e in r.json()["detail"]}


def test_a_complete_program_is_saved_and_shows_the_instructor_by_name(env):
    r = env.post(URL, json=good(env, department=" HR ", resource_link="https://example.com/p"))
    assert r.status_code == 201, r.text
    b = r.json()
    assert (b["department"], b["resource_link"], b["status"], b["instructor_name"]) == ("HR", "https://example.com/p", "planned", f"Pat {env.admin.last_name}")
    assert env.get(f"{URL}/{b['id']}").json()["instructor_name"] == b["instructor_name"]


def test_every_detail_a_learner_relies_on_is_required(env):
    f = _fields(env.post(URL, json={"name": "Only a name"}))
    assert {"description", "instructor_id", "start_date", "end_date", "max_participants"} <= set(f)
    f = _fields(env.post(URL, json=good(env, name=" ", description="  ", instructor_id=None, start_date="", end_date=None, max_participants=0)))
    assert {"name", "description", "instructor_id", "start_date", "end_date", "max_participants"} <= set(f)
    assert "Field required" not in str(f.values())


def test_dates_and_capacity_are_checked(env):
    r = env.post(URL, json=good(env, end_date=(date.today() - timedelta(days=30)).isoformat()))
    assert r.status_code == 422 and "cannot be before the start date" in r.text
    assert "max_participants" in _fields(env.post(URL, json=good(env, max_participants=10001)))
    assert "start_date" in _fields(env.post(URL, json=good(env, start_date="1999-01-01", end_date="1999-02-01")))
    assert env.post(URL, json=good(env, instructor_id=env.other.id)).status_code == 400    # not in this organization
    assert env.post(URL, json=good(env, resource_link="nope")).status_code == 422


def test_an_edit_can_never_blank_those_details_and_updating_works_at_all(env):
    pid = env.post(URL, json=good(env)).json()["id"]
    for blank in ({"description": ""}, {"instructor_id": None}, {"start_date": None}, {"end_date": ""}, {"max_participants": None}, {"name": " "}):
        assert env.put(f"{URL}/{pid}", json=blank).status_code == 422, blank
    ok = env.put(f"{URL}/{pid}", json={"max_participants": 30, "description": "Updated text", "status": "active"})
    assert ok.status_code == 200, ok.text
    assert (ok.json()["max_participants"], ok.json()["description"], ok.json()["status"]) == (30, "Updated text", "active")
    bad = env.put(f"{URL}/{pid}", json={"end_date": (date.today() - timedelta(days=60)).isoformat()})
    assert bad.status_code == 400 and "cannot be before" in bad.text      # checked against the stored start date


def test_status_moves_forward_only(env):
    pid = env.post(URL, json=good(env)).json()["id"]
    assert env.put(f"{URL}/{pid}", json={"status": "completed"}).status_code == 200
    for target in ("cancelled", "planned", "active"):
        assert env.put(f"{URL}/{pid}", json={"status": target}).status_code == 400
    other = env.post(URL, json=good(env, name="Second")).json()["id"]
    assert env.put(f"{URL}/{other}", json={"status": "cancelled"}).status_code == 200
    assert env.put(f"{URL}/{other}", json={"status": "completed"}).status_code == 400
    assert env.put(f"{URL}/{other}", json={"status": "planned"}).status_code == 200


def test_names_are_unique_per_organization_and_other_organizations_cannot_touch_a_program(env):
    pid = env.post(URL, json=good(env)).json()["id"]
    assert env.post(URL, json=good(env, name=" leadership  workshop ")).status_code == 400
    env.box["user"] = env.other
    assert env.get(f"{URL}/{pid}").status_code == 404
    assert env.put(f"{URL}/{pid}", json={"status": "cancelled"}).status_code == 404
    assert env.delete(f"{URL}/{pid}").status_code == 404
    assert env.get(URL).json()["items"] == []


def test_delete_works_but_not_for_a_program_with_participants_and_capacity_cannot_drop_below_them(env):
    keep = env.post(URL, json=good(env)).json()["id"]
    gone = env.post(URL, json=good(env, name="Unused")).json()["id"]
    assert env.delete(f"{URL}/{gone}").status_code == 200
    assert env.get(f"{URL}/{gone}").status_code == 404
    env.db.add(LearningTrainingProgramAssignment(program_id=keep, employee_id=env.learner.id, status="assigned", organization_id=1))
    env.db.add(LearningTrainingProgramAssignment(program_id=keep, employee_id=env.admin.id, status="assigned", organization_id=1))
    env.db.commit()
    r = env.delete(f"{URL}/{keep}")
    assert r.status_code == 400 and "Cancelled" in r.text
    assert env.put(f"{URL}/{keep}", json={"max_participants": 1}).status_code == 400


def test_learners_do_not_see_cancelled_programs(env):
    live = env.post(URL, json=good(env)).json()["id"]
    gone = env.post(URL, json=good(env, name="Cancelled one")).json()["id"]
    env.put(f"{URL}/{gone}", json={"status": "cancelled"})
    env.box["user"] = env.learner
    assert [p["name"] for p in env.get(URL).json()["items"]] == ["Leadership Workshop"]
    assert env.get(f"{URL}/{live}").status_code == 200
    assert env.get(f"{URL}/{gone}").status_code == 404
