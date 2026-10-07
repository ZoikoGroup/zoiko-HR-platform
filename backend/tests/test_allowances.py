"""Allowances: the employee must really exist in the organization (ZHR-76), and the rest of the form is checked."""

from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.modules.hr.models import Allowance, Organization, OrganizationStatus


def _person(email, org, n, role=None):
    from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
    return Employee(email=email, hashed_password="x", employee_code=f"C{n}", role=role or UserRole.EMPLOYEE, first_name="Pat", last_name=str(n), job_title="t",
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
    admin, worker, outsider = _person("a@x.com", 1, 1, UserRole.ADMIN), _person("w@x.com", 1, 2), _person("o@x.com", 2, 3)
    s.add_all([admin, worker, outsider])
    s.commit()
    box = {"user": admin}
    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: box["user"]
    app.dependency_overrides[get_current_admin] = lambda: box["user"]
    c = TestClient(app, raise_server_exceptions=False)
    c.db, c.box, c.admin, c.worker, c.outsider = s, box, admin, worker, outsider
    yield c
    for dep in (get_db, get_current_user, get_current_admin):
        app.dependency_overrides.pop(dep, None)
    s.close()
    engine.dispose()


URL = "/hr/compensation/allowances"


def good(env, **over):
    base = {"employee_id": env.worker.id, "allowance_type": "Housing", "amount": 1500, "effective_date": "2026-11-01"}
    base.update(over)
    return base


def _fields(r):
    assert r.status_code == 422, r.text
    return {e["loc"][-1]: e["msg"] for e in r.json()["detail"]}


def test_an_employee_id_that_matches_nobody_is_refused(env):
    for fake in (999, 4242, 1000000):
        r = env.post(URL, json=good(env, employee_id=fake))
        assert r.status_code == 400 and "not found in this organization" in r.text, (fake, r.text)
    assert env.get(URL).json() == [], "no allowance was created for a person who does not exist"


def test_an_employee_of_another_organization_is_refused_too(env):
    r = env.post(URL, json=good(env, employee_id=env.outsider.id))
    assert r.status_code == 400 and "not found in this organization" in r.text
    assert env.get(URL).json() == []


def test_a_real_employee_works_and_the_list_shows_their_name(env):
    r = env.post(URL, json=good(env))
    assert r.status_code == 200, r.text
    b = r.json()
    assert (b["employee_id"], b["employee_name"], b["allowance_type"]) == (env.worker.id, f"Pat {env.worker.last_name}", "Housing")
    assert Decimal(str(b["amount"])) == Decimal("1500")
    assert env.get(URL).json()[0]["employee_name"] == f"Pat {env.worker.last_name}"


def test_the_employee_must_be_chosen(env):
    for blank in (None, "", 0, -3):
        assert "employee_id" in _fields(env.post(URL, json=good(env, employee_id=blank))), blank
    assert "employee_id" in _fields(env.post(URL, json={k: v for k, v in good(env).items() if k != "employee_id"}))


def test_the_other_details_are_checked(env):
    assert "allowance_type" in _fields(env.post(URL, json=good(env, allowance_type=" ")))
    for bad, word in ((0, "greater than 0"), (-1, "greater than 0"), ("x", "number"), (123456789, "too large"), (1.234, "2 decimal")):
        assert word in _fields(env.post(URL, json=good(env, amount=bad)))["amount"], bad
    assert "effective_date" in _fields(env.post(URL, json=good(env, effective_date="")))
    assert "effective_date" in _fields(env.post(URL, json=good(env, effective_date="1999-01-01")))
    r = env.post(URL, json=good(env, allowance_type="  Travel   Allowance "))
    assert r.status_code == 200 and r.json()["allowance_type"] == "Travel Allowance"


def test_the_same_allowance_is_not_added_twice(env):
    assert env.post(URL, json=good(env)).status_code == 200
    dup = env.post(URL, json=good(env, allowance_type=" housing "))
    assert dup.status_code == 400 and "already has" in dup.text
    assert env.post(URL, json=good(env, effective_date="2026-12-01")).status_code == 200      # another date is fine


def test_editing_checks_the_employee_and_cannot_blank_anything(env):
    aid = env.post(URL, json=good(env)).json()["id"]
    for blank in ({"employee_id": None}, {"allowance_type": " "}, {"amount": None}, {"amount": 0}, {"effective_date": ""}):
        assert env.put(f"{URL}/{aid}", json=blank).status_code == 422, blank
    assert env.put(f"{URL}/{aid}", json={"employee_id": 777}).status_code == 400
    assert env.put(f"{URL}/{aid}", json={"employee_id": env.outsider.id}).status_code == 400
    ok = env.put(f"{URL}/{aid}", json={"amount": 2000})
    assert ok.status_code == 200 and Decimal(str(ok.json()["amount"])) == Decimal("2000")
    assert ok.json()["employee_name"]


def test_other_organizations_cannot_see_or_change_it(env):
    aid = env.post(URL, json=good(env)).json()["id"]
    env.box["user"] = env.outsider
    assert env.get(URL).json() == []
    assert env.put(f"{URL}/{aid}", json={"amount": 5}).status_code == 404
    assert env.delete(f"{URL}/{aid}").status_code == 404


def test_old_records_still_list(env):
    env.db.add(Allowance(employee_id=env.worker.id, allowance_type="Old", amount=Decimal("10"), effective_date=date(2024, 1, 1), organization_id=1))
    env.db.commit()
    assert env.get(URL).json()[0]["allowance_type"] == "Old"


def test_the_employee_of_an_allowance_can_be_changed_to_another_real_employee(env):
    """ZHR-77: the update used to ignore the employee field, so only the other fields changed."""
    from app.modules.employee.models import UserRole
    second = _person("s@x.com", 1, 4)
    env.db.add(second)
    env.db.commit()
    aid = env.post(URL, json=good(env)).json()["id"]
    r = env.put(f"{URL}/{aid}", json={"employee_id": second.id, "amount": 1800})
    assert r.status_code == 200, r.text
    assert (r.json()["employee_id"], r.json()["employee_name"]) == (second.id, f"Pat {second.last_name}")
    assert Decimal(str(r.json()["amount"])) == Decimal("1800")
    stored = env.get(URL).json()
    assert [(a["employee_id"], a["employee_name"]) for a in stored] == [(second.id, f"Pat {second.last_name}")]
    # only the employee changes, everything else stays
    back = env.put(f"{URL}/{aid}", json={"employee_id": env.worker.id})
    assert back.status_code == 200 and back.json()["employee_id"] == env.worker.id and Decimal(str(back.json()["amount"])) == Decimal("1800")
    # moving it onto an employee who already has the same allowance that day is refused, not silently merged
    other_id = env.post(URL, json=good(env, employee_id=second.id)).json()["id"]
    clash = env.put(f"{URL}/{other_id}", json={"employee_id": env.worker.id})
    assert clash.status_code == 400 and "already has" in clash.text
