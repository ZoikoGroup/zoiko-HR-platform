"""Headcount planning: the department's name comes back with every record (ZHR-81), and the numbers are checked."""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.modules.hr.models import Department, Organization, OrganizationStatus

URL = "/hr/workforce/headcount"


@pytest.fixture
def env():
    from app.main import app
    from app.core.dependencies import get_current_admin, get_current_user
    from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add_all([Organization(id=1, name="A", status=OrganizationStatus.ACTIVE), Organization(id=2, name="B", status=OrganizationStatus.ACTIVE)])
    s.commit()

    def person(email, org, n):
        return Employee(email=email, hashed_password="x", employee_code=f"C{n}", role=UserRole.ADMIN, first_name="P", last_name=str(n), job_title="t",
                        employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=org)

    admin, other = person("a@x.com", 1, 1), person("o@x.com", 2, 2)
    mgmt = Department(name="Management", code="MGT", organization_id=1)
    eng = Department(name="Engineering", code="ENG", organization_id=1)
    theirs = Department(name="Elsewhere", code="ELS", organization_id=2)
    s.add_all([admin, other, mgmt, eng, theirs])
    s.commit()
    box = {"user": admin}
    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: box["user"]
    app.dependency_overrides[get_current_admin] = lambda: box["user"]
    c = TestClient(app, raise_server_exceptions=False)
    c.db, c.box, c.admin, c.other, c.mgmt, c.eng, c.theirs = s, box, admin, other, mgmt, eng, theirs
    yield c
    for dep in (get_db, get_current_user, get_current_admin):
        app.dependency_overrides.pop(dep, None)
    s.close()
    engine.dispose()


def good(env, **over):
    base = {"department_id": env.mgmt.id, "fiscal_year": 2027, "approved_positions": 10, "filled_positions": 6, "vacant_positions": 4, "planned_hires": 3, "projected_cost": 120000.5}
    base.update(over)
    return base


def _fields(r):
    assert r.status_code == 422, r.text
    return {e["loc"][-1]: e["msg"] for e in r.json()["detail"]}


def test_the_department_name_is_in_the_created_record_the_list_and_a_single_fetch(env):
    r = env.post(URL, json=good(env))
    assert r.status_code == 201, r.text
    assert r.json()["department_name"] == "Management"
    assert env.get(URL).json()["items"][0]["department_name"] == "Management"
    assert env.get(f"{URL}/{r.json()['id']}").json()["department_name"] == "Management"
    assert env.put(f"{URL}/{r.json()['id']}", json={"planned_hires": 5}).json()["department_name"] == "Management"


def test_changing_the_department_changes_the_name_shown(env):
    hid = env.post(URL, json=good(env)).json()["id"]
    r = env.put(f"{URL}/{hid}", json={"department_id": env.eng.id})
    assert r.status_code == 200 and r.json()["department_name"] == "Engineering"
    assert env.get(URL).json()["items"][0]["department_name"] == "Engineering"


def test_the_department_must_be_chosen_and_must_be_in_the_organization(env):
    for blank in (None, "", 0):
        assert "department_id" in _fields(env.post(URL, json=good(env, department_id=blank))), blank
    for bad in (9999, env.theirs.id):
        r = env.post(URL, json=good(env, department_id=bad))
        assert r.status_code == 400 and "not found in this organization" in r.text
    assert env.get(URL).json()["items"] == []


def test_the_position_numbers_have_to_add_up(env):
    assert "approved_positions" in _fields(env.post(URL, json=good(env, approved_positions=-1)))
    assert "filled_positions" in _fields(env.post(URL, json=good(env, filled_positions=2.5)))
    for body, word in ((good(env, filled_positions=11, vacant_positions=0), "Filled positions cannot"),
                       (good(env, filled_positions=0, vacant_positions=11), "Vacant positions cannot"),
                       (good(env, filled_positions=6, vacant_positions=5), "Filled plus vacant")):
        r = env.post(URL, json=body)
        assert r.status_code == 422 and word in r.text, (body, r.text)
    assert env.post(URL, json=good(env, filled_positions=2, vacant_positions=0, department_id=env.eng.id)).status_code == 201   # not every approved seat has to be opened


def test_fiscal_year_and_cost_are_checked(env):
    assert "fiscal_year" in _fields(env.post(URL, json=good(env, fiscal_year=1999)))
    assert "fiscal_year" in _fields(env.post(URL, json=good(env, fiscal_year="abc")))
    assert "projected_cost" in _fields(env.post(URL, json=good(env, projected_cost=-5)))
    assert "projected_cost" in _fields(env.post(URL, json=good(env, projected_cost=1.234)))


def test_a_department_has_one_record_per_year(env):
    assert env.post(URL, json=good(env)).status_code == 201
    dup = env.post(URL, json=good(env))
    assert dup.status_code == 400 and "already has a headcount record for 2027" in dup.text
    assert env.post(URL, json=good(env, fiscal_year=2028)).status_code == 201
    other = env.post(URL, json=good(env, department_id=env.eng.id)).json()["id"]
    clash = env.put(f"{URL}/{other}", json={"department_id": env.mgmt.id})
    assert clash.status_code == 400 and "already has" in clash.text


def test_editing_rechecks_the_totals_with_the_saved_values_and_cannot_blank_the_essentials(env):
    hid = env.post(URL, json=good(env)).json()["id"]
    assert env.put(f"{URL}/{hid}", json={"approved_positions": 8}).status_code == 400          # 6 filled + 4 vacant no longer fit
    assert env.put(f"{URL}/{hid}", json={"approved_positions": 12, "vacant_positions": 6}).status_code == 200
    assert env.put(f"{URL}/{hid}", json={"department_id": None}).status_code == 422
    assert env.put(f"{URL}/{hid}", json={"fiscal_year": ""}).status_code == 422


def test_other_organizations_see_and_change_nothing(env):
    hid = env.post(URL, json=good(env)).json()["id"]
    env.box["user"] = env.other
    assert env.get(URL).json()["items"] == []
    assert env.put(f"{URL}/{hid}", json={"planned_hires": 1}).status_code == 404
    assert env.delete(f"{URL}/{hid}").status_code == 404
