"""ZHR-58: the attendance dashboard counts distinct, current, same-organization people (never 2/1 or 2/0)."""

from datetime import date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.dependencies import get_current_user
from app.database import Base, get_db
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import AttendanceRecord, AttendanceStatus, Department, Organization, OrganizationStatus, Shift, ShiftRoster

TODAY = date.today()


def _at(day, h, m=0):
    return datetime(day.year, day.month, day.day, h, m)


@pytest.fixture
def client():
    from app.main import app

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add_all([Organization(id=1, name="Acme", status=OrganizationStatus.ACTIVE), Organization(id=2, name="Globex", status=OrganizationStatus.ACTIVE)])
    s.add_all([Department(id=1, name="Eng", code="ENG", organization_id=1), Department(id=2, name="Ops", code="OPS", organization_id=1)])
    s.commit()
    people = {}

    def add(key, role, org, dept=None, status=EmployeeStatus.ACTIVE, active=True):
        e = Employee(email=f"{key}@example.com", hashed_password="x", employee_code=f"C-{key}", role=role, first_name=key.title(), last_name="U",
                     job_title="t", employment_type=EmploymentType.FULL_TIME, status=status, is_active=active,
                     date_of_joining=TODAY, organization_id=org, department_id=dept)
        s.add(e)
        s.commit()
        people[key] = e

    add("admin", UserRole.ADMIN, 1, 1)
    add("ann", UserRole.EMPLOYEE, 1, 1)
    add("bob", UserRole.EMPLOYEE, 1, 2)
    add("cat", UserRole.EMPLOYEE, 1, 2)
    add("gone", UserRole.EMPLOYEE, 1, 2, status=EmployeeStatus.TERMINATED, active=False)
    add("other", UserRole.ADMIN, 2, 1)
    box = {"user": people["admin"]}
    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: box["user"]
    c = TestClient(app, raise_server_exceptions=False)
    c.db, c.people = s, people
    yield c
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
    s.close()
    engine.dispose()


def rec(client, who, status, day=TODAY, cin=None, cout=None, org=1, hours=None, deleted=False):
    client.db.add(AttendanceRecord(employee_id=client.people[who].id, date=day, status=status, check_in=cin, check_out=cout,
                                   total_hours=hours, organization_id=org, is_deleted=deleted))
    client.db.commit()


def dash(client, **params):
    r = client.get("/hr/attendance/dashboard", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def test_the_admin_who_checks_in_is_counted_in_the_workforce(client):
    # used to be 2/1: the denominator only counted role=employee, the numerator counted everybody
    rec(client, "admin", AttendanceStatus.PRESENT)
    rec(client, "ann", AttendanceStatus.PRESENT)
    d = dash(client)
    assert (d["present_today"], d["total_employees"]) == (2, 4)  # admin, ann, bob, cat; the inactive one and the other org are out


def test_a_one_person_organization_with_no_check_ins_is_0_of_1(client):
    from app.main import app

    app.dependency_overrides[get_current_user] = lambda: client.people["other"]
    d = dash(client)
    assert (d["present_today"], d["total_employees"], d["attendance_percentage"]) == (0, 1, 0.0)


def test_duplicate_records_for_one_person_count_once(client):
    rec(client, "ann", AttendanceStatus.PRESENT, cin=_at(TODAY, 9), cout=_at(TODAY, 19), hours=10)
    rec(client, "ann", AttendanceStatus.PRESENT, cin=_at(TODAY, 9), cout=_at(TODAY, 19), hours=10)
    d = dash(client)
    assert d["present_today"] == 1
    assert d["overtime"] == 2.0  # not 4: the duplicate must not double the hours


def test_present_never_exceeds_the_workforce_even_for_former_employees(client):
    rec(client, "gone", AttendanceStatus.PRESENT)
    rec(client, "ann", AttendanceStatus.PRESENT)
    d = dash(client)
    assert d["present_today"] == 1 and d["present_today"] <= d["total_employees"]


def test_deleted_and_other_organization_records_are_ignored(client):
    rec(client, "ann", AttendanceStatus.PRESENT, deleted=True)
    rec(client, "other", AttendanceStatus.PRESENT, org=2)
    assert dash(client)["present_today"] == 0


def test_late_and_remote_people_are_present_and_also_counted_in_their_own_cards(client):
    rec(client, "ann", AttendanceStatus.LATE)
    rec(client, "bob", AttendanceStatus.REMOTE)
    rec(client, "cat", AttendanceStatus.ON_LEAVE)
    rec(client, "admin", AttendanceStatus.ABSENT)
    d = dash(client)
    assert (d["present_today"], d["late_arrivals"], d["remote"], d["on_leave"], d["absent_today"]) == (2, 1, 1, 1, 1)
    assert d["attendance_percentage"] == 50.0


def test_hours_overtime_and_early_departures_are_computed(client):
    rec(client, "ann", AttendanceStatus.PRESENT, cin=_at(TODAY, 9), cout=_at(TODAY, 19), hours=10)  # 2h overtime
    rec(client, "bob", AttendanceStatus.PRESENT, cin=_at(TODAY, 9), cout=_at(TODAY, 15))  # 6h, left early
    shift = Shift(name="Day", start_time="09:00", end_time="18:00", organization_id=1)
    client.db.add(shift)
    client.db.commit()
    for who in ("ann", "bob"):
        client.db.add(ShiftRoster(employee_id=client.people[who].id, shift_id=shift.id, date=TODAY))
    client.db.commit()
    d = dash(client)
    assert d["avg_working_hours"] == 8.0
    assert d["overtime"] == 2.0
    assert d["early_departures"] == 1
    assert d["shift_distribution"] == [{"shift": "Day", "count": 2}]


def test_trend_covers_seven_real_days_and_changes_compare_with_yesterday(client):
    y = TODAY - timedelta(days=1)
    rec(client, "ann", AttendanceStatus.PRESENT, day=y)
    rec(client, "bob", AttendanceStatus.PRESENT, day=y)
    rec(client, "ann", AttendanceStatus.PRESENT)
    d = dash(client)
    assert len(d["attendance_trend"]) == 7
    assert d["attendance_trend"][-1]["present"] == 1 and d["attendance_trend"][-2]["present"] == 2
    assert d["changes"]["present_today"] == -50.0
    assert d["changes"]["absent_today"] is None  # nothing yesterday to compare with, so no invented figure


def test_department_rows_show_present_out_of_total_and_the_filter_narrows_everything(client):
    rec(client, "admin", AttendanceStatus.PRESENT)
    rec(client, "bob", AttendanceStatus.PRESENT)
    d = dash(client)
    assert {r["department"]: (r["present"], r["total"]) for r in d["department_attendance"]} == {"Eng": (1, 2), "Ops": (1, 2)}
    assert d["departments"] == ["Eng", "Ops"]
    ops = dash(client, department="Ops")
    assert (ops["present_today"], ops["total_employees"]) == (1, 2)
    assert [r["department"] for r in ops["department_attendance"]] == ["Ops"]
