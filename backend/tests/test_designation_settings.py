"""ZHR-52: Designation Settings are saved per organization, survive a reload, and drive the module."""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.dependencies import get_current_admin, get_current_user
from app.database import Base, get_db
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import Designation, DesignationSettings, Organization, OrganizationStatus

URL = "/hr/designations/settings"


@pytest.fixture
def client():
    from fastapi import HTTPException
    from app.main import app

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add_all([Organization(id=1, name="Acme", status=OrganizationStatus.ACTIVE, organization_code="ACM"),
               Organization(id=2, name="Globex", status=OrganizationStatus.ACTIVE, organization_code="GLB")])
    s.commit()
    people = {}
    for key, role, org in (("admin", UserRole.ADMIN, 1), ("emp", UserRole.EMPLOYEE, 1), ("other", UserRole.ADMIN, 2)):
        e = Employee(email=f"{key}@example.com", hashed_password="x", employee_code=f"C-{key}", role=role, first_name=key.title(), last_name="U",
                     job_title="t", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=org)
        s.add(e)
        s.commit()
        people[key] = e
    box = {"user": people["admin"]}

    def admin_only():
        if box["user"].role == UserRole.EMPLOYEE:
            raise HTTPException(403, "This action requires admin privileges.")
        return box["user"]

    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: box["user"]
    app.dependency_overrides[get_current_admin] = admin_only
    c = TestClient(app, raise_server_exceptions=False)
    c.db, c.box, c.people = s, box, people
    yield c
    for dep in (get_db, get_current_user, get_current_admin):
        app.dependency_overrides.pop(dep, None)
    s.close()
    engine.dispose()


def test_a_new_organization_gets_the_defaults(client):
    d = client.get(URL).json()
    assert (d["code_prefix"], d["default_status"], d["auto_generate_codes"], d["max_hierarchy_depth"], d["items_per_page"]) == ("DES", "active", True, 10, 10)
    assert d["require_parent"] is False and d["compact_mode"] is False
    assert set(d["notifications"].values()) == {True} and len(d["notifications"]) == 7


def test_what_is_turned_off_and_saved_stays_off_after_reload(client):
    d = client.get(URL).json()
    d.update(auto_generate_codes=False, enforce_single_parent=False, show_salary_range=False, compact_mode=True, items_per_page=25,
             default_sort_field="level", default_sort_direction="desc", code_prefix="pos")
    d["notifications"]["created"] = False
    d["notifications"]["deletion_requested"] = False
    r = client.put(URL, json=d)
    assert r.status_code == 200, r.text
    again = client.get(URL).json()   # "refresh the page"
    assert again == r.json()
    assert (again["auto_generate_codes"], again["enforce_single_parent"], again["show_salary_range"], again["compact_mode"]) == (False, False, False, True)
    assert (again["items_per_page"], again["default_sort_field"], again["default_sort_direction"], again["code_prefix"]) == (25, "level", "desc", "POS")
    assert again["notifications"]["created"] is False and again["notifications"]["updated"] is True


def test_saving_twice_updates_the_one_row(client):
    for depth in (4, 6):
        d = client.get(URL).json()
        d["max_hierarchy_depth"] = depth
        assert client.put(URL, json=d).status_code == 200
    assert client.db.query(DesignationSettings).count() == 1
    assert client.get(URL).json()["max_hierarchy_depth"] == 6


@pytest.mark.parametrize("change", [
    {"code_prefix": "X"}, {"code_prefix": "TOOLONG1"}, {"code_prefix": "A-B"}, {"max_hierarchy_depth": 0}, {"max_hierarchy_depth": 11},
    {"items_per_page": 7}, {"default_sort_field": "name"}, {"default_sort_direction": "up"}, {"default_status": "archived"}, {"surprise": True},
])
def test_invalid_settings_are_rejected(client, change):
    d = client.get(URL).json()
    d.update(change)
    assert client.put(URL, json=d).status_code == 422
    assert client.db.query(DesignationSettings).count() == 0


def test_settings_are_per_organization_and_only_admins_can_save(client):
    d = client.get(URL).json()
    d["compact_mode"] = True
    assert client.put(URL, json=d).status_code == 200
    client.box["user"] = client.people["other"]
    assert client.get(URL).json()["compact_mode"] is False
    client.box["user"] = client.people["emp"]
    assert client.get(URL).status_code == 200   # everyone can read how the list should look
    assert client.put(URL, json=d).status_code == 403


def test_settings_route_is_not_mistaken_for_a_designation_id(client):
    assert client.get(URL).status_code == 200
    assert client.get("/hr/designations/99").status_code == 404


def _new(**over):
    base = {"title": "Engineer", "department_name": "Eng", "level": "L2"}
    base.update(over)
    return base


def test_the_code_prefix_and_default_status_are_applied_to_new_designations(client):
    d = client.get(URL).json()
    d.update(code_prefix="POS", default_status="inactive")
    client.put(URL, json=d)
    r = client.post("/hr/designations", json=_new())
    assert r.status_code == 201, r.text
    assert r.json()["designation_code"].startswith("ACMPOS") and r.json()["status"] == "inactive"
    r2 = client.post("/hr/designations", json=_new(title="Lead", status="active"))
    assert r2.json()["status"] == "active"   # an explicit choice still wins


def test_levels_deeper_than_the_maximum_depth_are_refused(client):
    d = client.get(URL).json()
    d["max_hierarchy_depth"] = 3
    client.put(URL, json=d)
    assert client.post("/hr/designations", json=_new(level="L3")).status_code == 201
    r = client.post("/hr/designations", json=_new(title="Deep", level="L4"))
    assert r.status_code == 400 and "maximum hierarchy depth of 3" in r.text
    did = client.post("/hr/designations", json=_new(title="Mid", level="L2")).json()["id"]
    assert client.put(f"/hr/designations/{did}", json={"level": "L9"}).status_code == 400
    assert client.put(f"/hr/designations/{did}", json={"description": "x"}).status_code == 200


def test_with_auto_codes_off_a_manual_code_is_required_and_unique(client):
    d = client.get(URL).json()
    d["auto_generate_codes"] = False
    client.put(URL, json=d)
    assert client.post("/hr/designations", json=_new()).status_code == 400
    ok = client.post("/hr/designations", json=_new(designation_code="eng-01"))
    assert ok.status_code == 201 and ok.json()["designation_code"] == "ENG-01"
    dup = client.post("/hr/designations", json=_new(title="Other", designation_code="ENG-01"))
    assert dup.status_code == 409 or dup.status_code == 400, dup.text
    assert client.db.query(Designation).count() == 1


def test_a_manual_code_is_ignored_while_auto_generation_is_on(client):
    r = client.post("/hr/designations", json=_new(designation_code="HACK1"))
    assert r.status_code == 201 and r.json()["designation_code"].startswith("ACMDES")
