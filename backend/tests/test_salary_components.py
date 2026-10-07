"""Salary components: the default amount is required (ZHR-75), and the rest of the form is checked."""

from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.modules.hr.models import Organization, OrganizationStatus, SalaryComponent, SalaryStructure, StructureComponent


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
    s.add_all([admin, other])
    s.commit()
    box = {"user": admin}
    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: box["user"]
    app.dependency_overrides[get_current_admin] = lambda: box["user"]
    c = TestClient(app, raise_server_exceptions=False)
    c.db, c.box, c.admin, c.other = s, box, admin, other
    yield c
    for dep in (get_db, get_current_user, get_current_admin):
        app.dependency_overrides.pop(dep, None)
    s.close()
    engine.dispose()


URL = "/hr/compensation/salary-components"


def good(**over):
    base = {"name": "Basic Pay", "component_type": "earning", "is_taxable": True, "default_amount": 5000}
    base.update(over)
    return base


def _fields(r):
    assert r.status_code == 422, r.text
    return {e["loc"][-1]: e["msg"] for e in r.json()["detail"]}


def test_a_component_cannot_be_created_without_a_default_amount(env):
    f = _fields(env.post(URL, json={k: v for k, v in good().items() if k != "default_amount"}))
    assert "required" in f["default_amount"].lower()
    for blank in (None, "", "   "):
        assert "Default amount is required" in _fields(env.post(URL, json=good(default_amount=blank)))["default_amount"], blank
    assert env.get(URL).json() == [], "nothing was saved with a blank amount"


def test_the_amount_must_be_a_sensible_positive_number(env):
    for bad, word in ((0, "greater than 0"), (-5, "greater than 0"), ("abc", "number"), (100000000, "too large"), (12.345, "2 decimal")):
        assert word in _fields(env.post(URL, json=good(name=f"x{bad}", default_amount=bad)))["default_amount"], bad
    ok = env.post(URL, json=good(default_amount="1234.50"))
    assert ok.status_code == 200 and Decimal(str(ok.json()["default_amount"])) == Decimal("1234.50")


def test_other_details_are_checked_and_trimmed(env):
    assert "name" in _fields(env.post(URL, json=good(name="  ")))
    assert "component_type" in _fields(env.post(URL, json=good(component_type="bonus")))
    r = env.post(URL, json=good(name="  Housing   Allowance ", component_type="EARNING", description="  "))
    assert r.status_code == 200
    assert (r.json()["name"], r.json()["component_type"], r.json()["description"]) == ("Housing Allowance", "earning", None)
    assert env.post(URL, json=good(name=" housing allowance")).status_code == 400          # unique within the organization
    env.box["user"] = env.other
    assert env.post(URL, json=good(name="Housing Allowance")).status_code == 200            # another organization may reuse the name


def test_editing_cannot_blank_the_amount_or_the_name(env):
    cid = env.post(URL, json=good()).json()["id"]
    for blank in ({"default_amount": None}, {"default_amount": ""}, {"default_amount": 0}, {"name": " "}):
        assert env.put(f"{URL}/{cid}", json=blank).status_code == 422, blank
    assert env.put(f"{URL}/{cid}", json={"description": "Monthly"}).json()["default_amount"] is not None     # an edit that omits it keeps it
    r = env.put(f"{URL}/{cid}", json={"default_amount": 7500})
    assert r.status_code == 200 and Decimal(str(r.json()["default_amount"])) == Decimal("7500")


def test_an_old_component_with_no_amount_is_still_listed_and_can_be_completed(env):
    env.db.add(SalaryComponent(name="Legacy", component_type="earning", organization_id=1))
    env.db.commit()
    listed = env.get(URL)
    assert listed.status_code == 200 and listed.json()[0]["default_amount"] is None
    cid = listed.json()[0]["id"]
    assert env.put(f"{URL}/{cid}", json={"description": "x"}).status_code == 200          # other edits still work
    assert env.put(f"{URL}/{cid}", json={"default_amount": 100}).status_code == 200


def test_other_organizations_cannot_touch_it_and_a_used_component_cannot_be_deleted(env):
    cid = env.post(URL, json=good()).json()["id"]
    env.box["user"] = env.other
    assert env.put(f"{URL}/{cid}", json={"description": "x"}).status_code == 404
    assert env.delete(f"{URL}/{cid}").status_code == 404
    env.box["user"] = env.admin
    structure = SalaryStructure(name="Standard", organization_id=1)
    env.db.add(structure)
    env.db.commit()
    env.db.add(StructureComponent(structure_id=structure.id, component_id=cid, amount_or_formula="5000"))
    env.db.commit()
    r = env.delete(f"{URL}/{cid}")
    assert r.status_code == 400 and "salary structure" in r.text
    free = env.post(URL, json=good(name="Unused")).json()["id"]
    assert env.delete(f"{URL}/{free}").status_code == 200
