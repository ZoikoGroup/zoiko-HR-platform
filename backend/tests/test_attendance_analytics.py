"""ZHR-59: Overtime Trajectory (and the other analytics) report real figures: 0 when there is no overtime."""

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

D = date(2026, 3, 10)


def _at(day, h, m=0):
    return datetime(day.year, day.month, day.day, h, m)


@pytest.fixture
def client():
    from app.main import app

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add_all([Organization(id=1, name="Acme", status=OrganizationStatus.ACTIVE), Organization(id=2, name="Globex", status=OrganizationStatus.ACTIVE)])
    s.add(Department(id=1, name="Eng", code="ENG", organization_id=1))
    s.commit()
    people = {}
    for key, org, dept in (("admin", 1, 1), ("ann", 1, 1), ("bob", 1, None), ("other", 2, None)):
        e = Employee(email=f"{key}@example.com", hashed_password="x", employee_code=f"C-{key}", role=UserRole.ADMIN if key in ("admin", "other") else UserRole.EMPLOYEE,
                     first_name=key.title(), last_name="U", job_title="t", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE,
                     date_of_joining=D, organization_id=org, department_id=dept)
        s.add(e)
        s.commit()
        people[key] = e
    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: people["admin"]
    c = TestClient(app, raise_server_exceptions=False)
    c.db, c.people = s, people
    yield c
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
    s.close()
    engine.dispose()


def rec(c, who, status=AttendanceStatus.PRESENT, day=D, hours=None, cin=None, cout=None, org=1, deleted=False):
    c.db.add(AttendanceRecord(employee_id=c.people[who].id, date=day, status=status, check_in=cin, check_out=cout, total_hours=hours,
                              organization_id=org, is_deleted=deleted))
    c.db.commit()


def get(c, path, **params):
    r = c.get(f"/hr/attendance/analytics/{path}", params=params)
    assert r.status_code == 200, r.text
    return r.json()


RANGE = {"date_from": "2026-01-01", "date_to": "2026-03-31"}


def test_no_overtime_data_means_zero_hours_in_every_month_never_a_made_up_number(client):
    rec(client, "ann", cin=_at(D, 9), cout=_at(D, 17))  # 8h, no overtime
    rows = get(client, "overtime", **RANGE)["monthly_breakdown"]
    assert [(r["month"], r["hours"], r["employees"]) for r in rows] == [("2026-01", 0.0, 0), ("2026-02", 0.0, 0), ("2026-03", 0.0, 0)]


def test_an_empty_organization_returns_the_months_with_zero(client):
    body = get(client, "overtime", **RANGE)
    assert body["total_hours"] == 0.0 and len(body["monthly_breakdown"]) == 3


def test_overtime_is_summed_from_real_hours_per_month_and_person(client):
    rec(client, "ann", hours=10, cin=_at(D, 9), cout=_at(D, 19))
    rec(client, "bob", cin=_at(D, 9), cout=_at(D, 20, 30))  # 11.5h from timestamps
    rec(client, "ann", day=date(2026, 2, 3), cin=_at(date(2026, 2, 3), 9), cout=_at(date(2026, 2, 3), 18))  # 9h
    body = get(client, "overtime", **RANGE)
    by = {r["month"]: r for r in body["monthly_breakdown"]}
    assert (by["2026-03"]["hours"], by["2026-03"]["employees"]) == (5.5, 2)
    assert (by["2026-02"]["hours"], by["2026-02"]["employees"]) == (1.0, 1)
    assert body["total_hours"] == 6.5
    assert by["2026-03"]["label"] == "Mar 2026"


def test_duplicates_deleted_rows_and_other_organizations_do_not_inflate_overtime(client):
    rec(client, "ann", hours=10, cin=_at(D, 9), cout=_at(D, 19))
    rec(client, "ann", hours=10, cin=_at(D, 9), cout=_at(D, 19))
    rec(client, "bob", hours=12, cin=_at(D, 9), cout=_at(D, 21), deleted=True)
    rec(client, "other", hours=12, cin=_at(D, 9), cout=_at(D, 21), org=2)
    assert get(client, "overtime", **RANGE)["total_hours"] == 2.0


def test_the_default_range_is_the_last_six_months(client):
    rows = get(client, "overtime")["monthly_breakdown"]
    assert len(rows) == 6 and rows[-1]["month"] == date.today().strftime("%Y-%m")


def test_trends_count_people_per_day_and_label_the_days(client):
    rec(client, "ann")
    rec(client, "bob", status=AttendanceStatus.LATE)
    rec(client, "admin", status=AttendanceStatus.ABSENT)
    rec(client, "ann", day=date(2026, 3, 11))
    t = get(client, "trends", **RANGE)["trends"]
    assert [(x["label"], x["present"], x["absent"]) for x in t] == [("10 Mar", 2, 1), ("11 Mar", 1, 0)]


def test_department_rows_include_people_without_a_department_and_late_counts(client):
    rec(client, "ann")
    rec(client, "bob", status=AttendanceStatus.LATE)
    rec(client, "admin", status=AttendanceStatus.ABSENT)
    rec(client, "ann", day=date(2026, 3, 11), status=AttendanceStatus.ON_LEAVE)  # not a working day
    rows = {r["department"]: r for r in get(client, "department", **RANGE)["department_breakdown"]}
    assert (rows["Eng"]["present"], rows["Eng"]["absent"], rows["Eng"]["attendance_rate"]) == (1, 1, 50.0)
    assert (rows["Unassigned"]["late"], rows["Unassigned"]["present"], rows["Unassigned"]["attendance_rate"]) == (1, 1, 100.0)


def test_shift_efficiency_counts_rostered_people_who_came_in(client):
    shift = Shift(name="Day", start_time="09:00", end_time="18:00", organization_id=1)
    client.db.add(shift)
    client.db.commit()
    for who in ("ann", "bob"):
        client.db.add(ShiftRoster(employee_id=client.people[who].id, shift_id=shift.id, date=D))
    client.db.commit()
    rec(client, "ann")
    row = get(client, "shift-efficiency", **RANGE)["shift_efficiency"]
    assert row == [{"shift": "Day", "total_assigned": 2, "total_present": 1, "efficiency": 50.0}]


def test_summary_kpis_are_real_and_none_when_there_is_nothing_behind_them(client):
    empty = get(client, "summary", **RANGE)
    assert (empty["attendance_rate"], empty["avg_work_hours"], empty["shift_efficiency"], empty["total_overtime"]) == (None, None, None, 0.0)
    assert set(empty["changes"].values()) == {None}
    rec(client, "ann", hours=10, cin=_at(D, 9), cout=_at(D, 19))
    rec(client, "bob", status=AttendanceStatus.ABSENT)
    k = get(client, "summary", **RANGE)
    assert (k["attendance_rate"], k["avg_work_hours"], k["total_overtime"]) == (50.0, 10.0, 2.0)


def test_summary_compares_with_the_period_before(client):
    prev = date(2025, 12, 10)
    rec(client, "ann", day=prev, hours=9, cin=_at(prev, 9), cout=_at(prev, 18))
    rec(client, "ann", hours=10, cin=_at(D, 9), cout=_at(D, 19))
    k = get(client, "summary", date_from="2026-01-01", date_to="2026-03-31")
    assert k["changes"]["avg_work_hours"] == 11.1  # 9h -> 10h
