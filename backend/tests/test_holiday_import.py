"""ZHR-57: holiday import accepts the shapes the page sends, reports every row, and is per organization."""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.dependencies import get_current_user
from app.database import Base, get_db
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import Holiday, Organization, OrganizationStatus


@pytest.fixture
def client():
    from app.main import app

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add_all([Organization(id=1, name="Acme", status=OrganizationStatus.ACTIVE), Organization(id=2, name="Globex", status=OrganizationStatus.ACTIVE)])
    s.commit()
    people = {}
    for key, role, org in (("admin", UserRole.ADMIN, 1), ("emp", UserRole.EMPLOYEE, 1), ("other", UserRole.ADMIN, 2)):
        e = Employee(email=f"{key}@example.com", hashed_password="x", employee_code=f"C-{key}", role=role, first_name=key.title(), last_name="U",
                     job_title="t", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=org)
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


URL = "/hr/attendance/holidays/import"
ROWS = [
    {"name": "New Year", "date": "2027-01-01", "type": "Public"},
    {"name": "Founders Day", "date": "2027-03-10", "type": "company", "description": "Office closed", "is_recurring": True},
]


def _names(client, org=1):
    return sorted(h.name for h in client.db.query(Holiday).filter(Holiday.organization_id == org))


def test_the_page_s_wrapped_body_is_accepted(client):
    r = client.post(URL, json={"holidays": ROWS})
    assert r.status_code == 201, r.text
    assert r.json() == {"total": 2, "imported": 2, "duplicates": 0, "errors": []}
    assert _names(client) == ["Founders Day", "New Year"]


def test_a_bare_array_still_works(client):
    r = client.post(URL, json=ROWS)
    assert r.status_code == 201 and r.json()["imported"] == 2


def test_types_are_normalised_and_fields_kept(client):
    client.post(URL, json=ROWS)
    founders = client.db.query(Holiday).filter(Holiday.name == "Founders Day").one()
    assert (founders.type, founders.is_recurring, founders.description, founders.organization_id) == ("Company", True, "Office closed", 1)
    assert client.db.query(Holiday).filter(Holiday.name == "New Year").one().type == "Public"


def test_every_bad_row_is_reported_and_the_good_rows_are_still_saved(client):
    r = client.post(URL, json={"holidays": [
        {"name": "Good Day", "date": "2027-05-01"},
        {"name": "", "date": "2027-05-02"},
        {"name": "No Date"},
        {"name": "Bad Date", "date": "31/31/2027"},
        {"name": "Weird Type", "date": "2027-05-03", "type": "Fancy"},
        "not an object",
    ]})
    body = r.json()
    assert r.status_code == 201 and body["imported"] == 1 and len(body["errors"]) == 5
    by_row = {e["row"]: e["error"] for e in body["errors"]}
    assert "Name is required" in by_row[2] and "valid date" in by_row[3] and "valid date" in by_row[4] and "Public, Company or Optional" in by_row[5]
    assert "object" in by_row[6]
    assert _names(client) == ["Good Day"]


def test_day_first_dates_from_spreadsheets_are_understood(client):
    client.post(URL, json=[{"name": "Diwali", "date": "12/11/2027"}])
    assert client.db.query(Holiday).one().date == date(2027, 11, 12)


def test_duplicates_are_counted_not_failed_and_only_within_the_organization(client):
    client.post(URL, json=ROWS)
    again = client.post(URL, json=[{"name": "new year", "date": "2027-01-01"}, {"name": "Brand New", "date": "2027-06-01"}]).json()
    assert (again["imported"], again["duplicates"]) == (1, 1)
    inside_file = client.post(URL, json=[{"name": "Twice", "date": "2027-07-01"}, {"name": "TWICE", "date": "2027-07-01"}]).json()
    assert (inside_file["imported"], inside_file["duplicates"]) == (1, 1)
    # another organization with the same holiday must not block this one (it used to)
    client.box["user"] = client.people["other"]
    other = client.post(URL, json=[{"name": "New Year", "date": "2027-01-01"}]).json()
    assert other["imported"] == 1
    assert _names(client, org=2) == ["New Year"]


def test_adding_a_single_holiday_is_not_blocked_by_another_organizations_copy(client):
    client.box["user"] = client.people["other"]
    client.post(URL, json=[{"name": "New Year", "date": "2027-01-01"}])
    client.box["user"] = client.people["admin"]
    r = client.post("/hr/attendance/holidays", json={"name": "New Year", "date": "2027-01-01", "type": "Public"})
    assert r.status_code == 201, r.text
    again = client.post("/hr/attendance/holidays", json={"name": "New Year", "date": "2027-01-01", "type": "Public"})
    assert again.status_code == 400 and "already exists" in str(again.json())


@pytest.mark.parametrize("body", [[], {"holidays": []}, {"holidays": "nope"}, {"other": 1}])
def test_empty_or_malformed_requests_get_a_clear_400(client, body):
    r = client.post(URL, json=body)
    assert r.status_code == 400, r.text
    assert "holiday" in str(r.json()).lower()


def test_too_many_rows_are_refused(client):
    r = client.post(URL, json=[{"name": f"H{i}", "date": "2027-01-01"} for i in range(1001)])
    assert r.status_code == 400 and "1000" in str(r.json())


def test_only_admins_can_import(client):
    client.box["user"] = client.people["emp"]
    assert client.post(URL, json=ROWS).status_code == 403
    assert client.db.query(Holiday).count() == 0
