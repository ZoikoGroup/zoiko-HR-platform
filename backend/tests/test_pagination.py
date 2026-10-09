"""
Part D: list endpoints page on request and stay backward compatible without paging params.

  * no page/per_page  -> the same plain list as before (callers that expect an array keep working), capped at
                         LEGACY_LIST_CAP with a warning;
  * page/per_page     -> {"items", "total", "page", "per_page"} (HR) or the billing {"list", "total"} shape.
"""
from datetime import date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import pagination
from app.database import Base, get_db
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import (
    AttendanceRecord, AttendanceStatus, LeaveRequest, LeaveType, Organization, OrganizationStatus,
    PerformanceGoal, RequestStatus,
)

N = 30


@pytest.fixture
def env():
    from app.main import app
    from app.core.dependencies import get_current_admin, get_current_user

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False)
    db = Session()
    org = Organization(organization_name="Paging Co", status=OrganizationStatus.ACTIVE)
    other = Organization(organization_name="Other Co", status=OrganizationStatus.ACTIVE)
    db.add_all([org, other])
    db.flush()
    admin = Employee(email="hr@paging.example", hashed_password="x", employee_code="PG000", role=UserRole.HR_ADMIN, first_name="H",
                     last_name="R", job_title="HR", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE,
                     is_active=True, date_of_joining=date(2024, 1, 1), organization_id=org.id)
    outsider = Employee(email="x@other.example", hashed_password="x", employee_code="OT000", role=UserRole.EMPLOYEE, first_name="O",
                        last_name="T", job_title="t", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE,
                        is_active=True, date_of_joining=date(2024, 1, 1), organization_id=other.id)
    db.add_all([admin, outsider])
    db.flush()
    base = datetime(2026, 9, 1)
    for k in range(N):
        db.add(LeaveRequest(employee_id=admin.id, organization_id=org.id, leave_type=LeaveType.ANNUAL,
                            start_date=date(2026, 9, 1) + timedelta(days=k), end_date=date(2026, 9, 1) + timedelta(days=k),
                            days=1, status=RequestStatus.PENDING, created_at=base + timedelta(minutes=k)))
        db.add(AttendanceRecord(employee_id=admin.id, organization_id=org.id, date=date(2026, 9, 1) + timedelta(days=k % 10),
                                status=AttendanceStatus.PRESENT))
        db.add(PerformanceGoal(employee_id=admin.id, organization_id=org.id, title=f"Goal {k}", created_at=base + timedelta(minutes=k)))
    # another org's rows must never appear
    db.add(LeaveRequest(employee_id=outsider.id, organization_id=other.id, leave_type=LeaveType.SICK, start_date=date(2026, 9, 1),
                        end_date=date(2026, 9, 1), days=1, status=RequestStatus.PENDING))
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
    yield TestClient(app)
    app.dependency_overrides.clear()
    db.close()
    engine.dispose()


@pytest.mark.parametrize("path,id_key", [
    ("/hr/leaves", "id"),
    ("/hr/attendance", "id"),
    ("/hr/performance/goals", "id"),
])
def test_without_paging_params_the_plain_list_is_unchanged(env, path, id_key):
    r = env.get(path)
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    assert isinstance(body, list) and len(body) == N


@pytest.mark.parametrize("path", ["/hr/leaves", "/hr/attendance", "/hr/performance/goals"])
def test_paging_returns_items_total_page_per_page_and_walks_every_row_once(env, path):
    full = env.get(path).json()
    seen = []
    for page in (1, 2, 3, 4):
        r = env.get(path, params={"page": page, "per_page": 8})
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert set(body) >= {"items", "total", "page", "per_page"}
        assert body["total"] == N and body["page"] == page and body["per_page"] == 8
        seen += [row["id"] for row in body["items"]]
    assert sorted(seen) == sorted(row["id"] for row in full)       # no row skipped or repeated across pages
    assert len(seen) == len(set(seen))


def test_leaves_page_is_newest_first_and_org_scoped(env):
    body = env.get("/hr/leaves", params={"page": 1, "per_page": 5}).json()
    created = [row["created_at"] for row in body["items"]]
    assert created == sorted(created, reverse=True)
    assert all(row["organization_id"] == body["items"][0]["organization_id"] for row in body["items"])
    assert body["total"] == N                                          # the other org's request is not counted


def test_per_page_is_bounded(env):
    assert env.get("/hr/leaves", params={"page": 1, "per_page": 500}).status_code == 422


def test_legacy_list_is_capped_with_a_warning(env, monkeypatch, caplog):
    monkeypatch.setattr(pagination, "LEGACY_LIST_CAP", 12)
    monkeypatch.setattr(pagination.legacy_list, "__defaults__", (12,))
    with caplog.at_level("WARNING", logger="zoiko.pagination"):
        body = env.get("/hr/performance/goals").json()
    assert len(body) == 12
    assert any("row cap" in r.message for r in caplog.records)
