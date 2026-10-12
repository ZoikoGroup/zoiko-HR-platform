"""Travel settings: every approval workflow saves (ZHR-78), values are checked, and only an admin can change them."""

import importlib.util
import pathlib
from datetime import date

import pytest
import sqlalchemy as sa
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.modules.hr.models import Organization, OrganizationStatus, TravelSetting

URL = "/hr/travel/settings"
WORKFLOWS = ("manager", "manager+director", "manager+director+finance")


def test_the_column_is_wide_enough_for_the_longest_workflow_name():
    """The longest option is 24 characters; the column was 20, which Postgres refuses with 'value too long'."""
    assert max(len(w) for w in WORKFLOWS) == 24
    assert TravelSetting.__table__.c.approval_workflow.type.length >= 24


def test_the_migration_widens_an_existing_column_and_keeps_the_data():
    path = pathlib.Path(__file__).resolve().parents[1] / "alembic" / "versions" / "u1a2b3c4d5e7_travel_workflow_width.py"
    spec = importlib.util.spec_from_file_location("travel_width_migration", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    engine = create_engine("sqlite:///:memory:", poolclass=StaticPool)
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE travel_settings (id INTEGER PRIMARY KEY, organization_id INTEGER, approval_workflow VARCHAR(20), max_trip_duration INTEGER)"))
        conn.execute(sa.text("INSERT INTO travel_settings (organization_id, approval_workflow, max_trip_duration) VALUES (1, 'manager', 30)"))
    for _ in range(2):                          # the second run changes nothing
        with engine.begin() as conn:
            with Operations.context(MigrationContext.configure(conn)):
                mod.upgrade()
    cols = {c["name"]: c for c in sa.inspect(engine).get_columns("travel_settings")}
    assert cols["approval_workflow"]["type"].length == 50
    with engine.begin() as conn:
        assert conn.execute(sa.text("SELECT approval_workflow, max_trip_duration FROM travel_settings")).one() == ("manager", 30)
    engine.dispose()


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

    def person(email, role, org, n):
        return Employee(email=email, hashed_password="x", employee_code=f"C{n}", role=role, first_name="P", last_name=str(n), job_title="t",
                        employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=org)

    admin, worker, other = person("a@x.com", UserRole.ADMIN, 1, 1), person("w@x.com", UserRole.EMPLOYEE, 1, 2), person("o@x.com", UserRole.ADMIN, 2, 3)
    s.add_all([admin, worker, other])
    s.commit()
    box = {"user": admin}

    def only_admins():
        if box["user"].role == UserRole.EMPLOYEE:
            raise HTTPException(403, "This action requires admin privileges.")
        return box["user"]

    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: box["user"]
    app.dependency_overrides[get_current_admin] = only_admins
    c = TestClient(app, raise_server_exceptions=False)
    c.db, c.box, c.admin, c.worker, c.other = s, box, admin, worker, other
    yield c
    for dep in (get_db, get_current_user, get_current_admin):
        app.dependency_overrides.pop(dep, None)
    s.close()
    engine.dispose()


def test_every_approval_workflow_saves_and_is_read_back(env):
    assert env.get(URL).json()["approval_workflow"] == "manager"
    for workflow in WORKFLOWS:
        r = env.put(URL, json={"approval_workflow": workflow})
        assert r.status_code == 200, (workflow, r.text)
        assert r.json()["approval_workflow"] == workflow
        assert env.get(URL).json()["approval_workflow"] == workflow


def test_the_whole_page_saves_in_one_go(env):
    page = {"approval_workflow": "manager+director+finance", "expense_limit_per_day": 750.5, "max_trip_duration": 14,
            "auto_approve_threshold": 2000, "reimbursement_deadline": 45, "notification_enabled": False}
    r = env.put(URL, json=page)
    assert r.status_code == 200, r.text
    got = env.get(URL).json()
    assert (got["approval_workflow"], float(got["expense_limit_per_day"]), got["max_trip_duration"], got["auto_approve_threshold"], got["reimbursement_deadline"], got["notification_enabled"]) == \
        ("manager+director+finance", 750.5, 14, 2000, 45, False)


def test_values_are_checked_with_plain_messages(env):
    def fields(body):
        r = env.put(URL, json=body)
        assert r.status_code == 422, (body, r.text)
        return {e["loc"][-1]: e["msg"] for e in r.json()["detail"]}
    assert "Choose Manager Only" in fields({"approval_workflow": "ceo"})["approval_workflow"]
    assert "approval_workflow" in fields({"approval_workflow": ""})
    assert "between 1 and 365" in fields({"max_trip_duration": 0})["max_trip_duration"]
    assert "whole number" in fields({"max_trip_duration": 2.5})["max_trip_duration"]
    assert "between 1 and 365" in fields({"reimbursement_deadline": 400})["reimbursement_deadline"]
    assert "between 0 and 1000000" in fields({"expense_limit_per_day": -1})["expense_limit_per_day"]
    assert "2 decimal" in fields({"expense_limit_per_day": 10.123})["expense_limit_per_day"]
    assert "auto_approve_threshold" in fields({"auto_approve_threshold": -5})
    assert env.get(URL).json()["max_trip_duration"] == 30, "a refused save changes nothing"


def test_a_workflow_typed_with_spaces_or_capitals_is_stored_in_its_standard_form(env):
    assert env.put(URL, json={"approval_workflow": " Manager+Director "}).json()["approval_workflow"] == "manager+director"


def test_only_an_admin_can_change_the_settings_but_everyone_in_the_organization_can_read_them(env):
    env.put(URL, json={"approval_workflow": "manager+director"})
    env.box["user"] = env.worker
    assert env.get(URL).json()["approval_workflow"] == "manager+director"
    r = env.put(URL, json={"approval_workflow": "manager"})
    assert r.status_code == 403
    env.box["user"] = env.admin
    assert env.get(URL).json()["approval_workflow"] == "manager+director"


def test_each_organization_has_its_own_settings(env):
    env.put(URL, json={"approval_workflow": "manager+director+finance"})
    env.box["user"] = env.other
    assert env.get(URL).json()["approval_workflow"] == "manager"
    env.put(URL, json={"max_trip_duration": 7})
    env.box["user"] = env.admin
    assert env.get(URL).json()["max_trip_duration"] == 30
