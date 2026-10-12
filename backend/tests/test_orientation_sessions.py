"""Orientation sessions can be moved to another valid future date (ZHR-70), and the form fields are checked."""

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.modules.hr.models import Organization, OrganizationStatus
from app.modules.hr.schemas import HolidayUpdate, OnboardingOrientationUpdate, ViolationCreate


def test_a_field_called_date_still_accepts_a_date_in_every_update_schema():
    """The schemas used to read `date: Optional[date] = None` as 'only None is allowed', so a date could never be changed."""
    assert OnboardingOrientationUpdate(date="2027-03-01").date == date(2027, 3, 1)
    assert HolidayUpdate(date="2027-03-01").date == date(2027, 3, 1)
    assert ViolationCreate(title="x", date="2027-03-01").date == date(2027, 3, 1)
    with pytest.raises(ValidationError):
        OnboardingOrientationUpdate(date="not a date")


@pytest.fixture
def client():
    from app.main import app
    from app.core.dependencies import get_current_admin, get_current_user
    from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add(Organization(id=1, name="A", status=OrganizationStatus.ACTIVE))
    s.commit()
    admin = Employee(email="a@x.com", hashed_password="x", employee_code="C1", role=UserRole.ADMIN, first_name="A", last_name="D", job_title="t",
                     employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=1)
    s.add(admin)
    s.commit()
    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: admin
    app.dependency_overrides[get_current_admin] = lambda: admin
    c = TestClient(app, raise_server_exceptions=False)
    yield c
    for dep in (get_db, get_current_user, get_current_admin):
        app.dependency_overrides.pop(dep, None)
    s.close()
    engine.dispose()


URL = "/hr/onboarding/orientation-sessions"
FUTURE = (date.today() + timedelta(days=10)).isoformat()
LATER = (date.today() + timedelta(days=40)).isoformat()


def _create(client, **over):
    r = client.post(URL, json={"title": "Welcome", "date": FUTURE, "time": "10:30", **over})
    assert r.status_code == 201, r.text
    return r.json()


def test_the_session_date_can_be_moved_to_another_future_date(client):
    sid = _create(client)["id"]
    r = client.put(f"{URL}/{sid}", json={"title": "Welcome", "date": LATER, "time": "11:00", "location": "Room A", "meeting_link": "", "presenter": ""})
    assert r.status_code == 200, r.text
    assert (r.json()["date"], r.json()["time"], r.json()["location"], r.json()["meeting_link"]) == (LATER, "11:00", "Room A", None)
    assert client.get(f"{URL}/{sid}").json()["date"] == LATER


def test_each_problem_is_named_by_field(client):
    def fields(r):
        assert r.status_code == 422, r.text
        return {e["loc"][-1]: e["msg"] for e in r.json()["detail"]}
    f = fields(client.post(URL, json={"title": " ", "date": FUTURE}))
    assert "Title is required" in f["title"]
    assert "date" in fields(client.post(URL, json={"title": "x"}))
    assert "Choose today or a later date" in fields(client.post(URL, json={"title": "x", "date": "2020-01-01"}))["date"]
    f = fields(client.post(URL, json={"title": "x", "date": FUTURE, "time": "25:61", "meeting_link": "abc", "status": "weird"}))
    assert {"time", "meeting_link", "status"} <= set(f)


def test_a_past_session_can_still_be_edited_but_not_moved_to_another_past_day(client):
    from app.modules.hr.models import OnboardingOrientation
    sid = _create(client)["id"]
    # age the session directly, as if it had been created long ago
    session = client.app.dependency_overrides[get_db]()
    row = session.get(OnboardingOrientation, sid)
    row.date = date.today() - timedelta(days=30)
    session.commit()
    ok = client.put(f"{URL}/{sid}", json={"presenter": "Sarah", "status": "completed"})
    assert ok.status_code == 200 and ok.json()["status"] == "completed" and ok.json()["presenter"] == "Sarah"
    same = client.put(f"{URL}/{sid}", json={"date": (date.today() - timedelta(days=30)).isoformat(), "title": "Renamed"})
    assert same.status_code == 200
    other_past = client.put(f"{URL}/{sid}", json={"date": (date.today() - timedelta(days=5)).isoformat()})
    assert other_past.status_code == 422
    assert client.put(f"{URL}/{sid}", json={"date": LATER}).status_code == 200


def test_holiday_dates_can_be_changed_too(client):
    # the same schema fault used to stop holiday dates being edited
    assert HolidayUpdate(name="Diwali", date="2027-11-01").date == date(2027, 11, 1)
