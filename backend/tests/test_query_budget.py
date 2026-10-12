"""
N+1 safety net: the main list endpoints must run the same number of queries for 5 rows as for 50.

Each endpoint is called at a small and a large page size on seeded data (several departments, designations and managers,
so lazy loads would show up as extra queries per distinct related row). A list whose query count grows with its rows
fails here, before it reaches a page that is slow in production.
"""
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import (
    Asset, AttendanceRecord, AttendanceStatus, Department, Designation, LeaveRequest, LeaveType, Organization,
    OrganizationStatus, RequestStatus,
)

SMALL, LARGE = 5, 50


@pytest.fixture
def env():
    from app.main import app
    from app.core.dependencies import get_current_admin, get_current_user

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False)
    db = Session()
    org = Organization(organization_name="Budget Co", status=OrganizationStatus.ACTIVE)
    db.add(org)
    db.flush()
    depts = [Department(name=f"D{i}", code=f"D{i}", organization_id=org.id) for i in range(6)]
    desigs = [Designation(title=f"R{i}", designation_code=f"BR{i}", organization_id=org.id, status="active", employees_count=0) for i in range(7)]
    db.add_all(depts + desigs)
    db.flush()
    admin = Employee(email="hr@budget.example", hashed_password="x", employee_code="B000", role=UserRole.HR_ADMIN, first_name="H",
                     last_name="R", job_title="HR", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE,
                     is_active=True, date_of_joining=date(2024, 1, 1), organization_id=org.id)
    db.add(admin)
    db.flush()
    managers = []
    people = []
    for k in range(80):
        e = Employee(email=f"p{k}@budget.example", hashed_password="x", employee_code=f"B{k + 1:03d}",
                     role=UserRole.MANAGER if k < 8 else UserRole.EMPLOYEE, first_name=f"P{k}", last_name="X", job_title="t",
                     employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, is_active=True,
                     date_of_joining=date(2024, 1, 1), organization_id=org.id, department_id=depts[k % 6].id,
                     designation_id=desigs[k % 7].id)
        db.add(e)
        db.flush()
        if k < 8:
            managers.append(e)
        else:
            e.reporting_manager_id = managers[k % 8].id
        people.append(e)
    today = date.today()
    for n, e in enumerate(people):
        db.add(AttendanceRecord(employee_id=e.id, organization_id=org.id, date=today - timedelta(days=n % 3), status=AttendanceStatus.PRESENT))
        db.add(LeaveRequest(employee_id=e.id, organization_id=org.id, leave_type=LeaveType.ANNUAL, start_date=today, end_date=today,
                            days=1, status=RequestStatus.PENDING))
        db.add(Asset(name=f"Laptop {n}", asset_tag=f"AT{n}", organization_id=org.id, employee_id=e.id))
    db.commit()
    admin_id = admin.id

    def _db():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    def _user():
        with Session() as s:
            u = s.get(Employee, admin_id)
            s.expunge(u)
            return u

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_current_user] = _user
    app.dependency_overrides[get_current_admin] = _user
    counter = {"n": 0}
    event.listen(engine, "before_cursor_execute", lambda *a: counter.__setitem__("n", counter["n"] + 1))
    yield TestClient(app), counter
    app.dependency_overrides.clear()
    db.close()
    engine.dispose()


def _queries(client, counter, path, params):
    counter["n"] = 0
    r = client.get(path, params=params)
    assert r.status_code == 200, (path, r.status_code, r.text[:300])
    return counter["n"]


@pytest.mark.parametrize("path,size_param,extra", [
    ("/hr/employee-management/employees", "per_page", {"include_all_roles": "true"}),
    ("/hr/employees", "per_page", {"include_all_roles": "true"}),
    ("/hr/admin/users", "per_page", {}),
    ("/hr/attendance/records", "per_page", {}),
    ("/hr/attendance/leaves", "per_page", {}),
    ("/hr/assets", "per_page", {}),
])
def test_list_query_count_does_not_grow_with_rows(env, path, size_param, extra):
    client, counter = env
    small = _queries(client, counter, path, {**extra, "page": 1, size_param: SMALL})
    large = _queries(client, counter, path, {**extra, "page": 1, size_param: LARGE})
    assert large - small <= 1, f"{path}: {small} queries for {SMALL} rows but {large} for {LARGE} (N+1)"


def test_departments_list_counts_headcount_in_one_query(env):
    client, counter = env
    n = _queries(client, counter, "/hr/departments", {"include_inactive": "true"})
    assert n <= 3, f"/hr/departments ran {n} queries for 6 departments"
