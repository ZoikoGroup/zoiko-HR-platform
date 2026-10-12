"""Page-load performance: compression, batched lookups and the new indexes."""

from datetime import date

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.compression import SelectiveGZipMiddleware
from app.database import Base
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import AttendanceRecord, Organization, OrganizationStatus, PerformanceReview


def _app():
    app = FastAPI()
    app.add_middleware(SelectiveGZipMiddleware, minimum_size=1000)

    @app.get("/big")
    def big():
        return {"rows": ["employee record " * 5] * 200}

    @app.get("/small")
    def small():
        return {"ok": True}

    @app.get("/assistant/stream")
    def stream():
        return {"rows": ["token " * 5] * 400}

    return TestClient(app)


def test_large_json_is_gzipped_and_small_or_streaming_routes_are_not():
    c = _app()
    big = c.get("/big", headers={"Accept-Encoding": "gzip"})
    assert big.headers["content-encoding"] == "gzip" and big.json()["rows"]
    assert "content-encoding" not in c.get("/small", headers={"Accept-Encoding": "gzip"}).headers
    assert "content-encoding" not in c.get("/assistant/stream", headers={"Accept-Encoding": "gzip"}).headers
    assert "content-encoding" not in c.get("/big", headers={"Accept-Encoding": "identity"}).headers


def test_the_real_app_compresses_big_responses():
    from app.main import app

    names = [m.cls.__name__ for m in app.user_middleware]
    assert "SelectiveGZipMiddleware" in names


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add(Organization(id=1, name="Acme", status=OrganizationStatus.ACTIVE))
    s.commit()
    for i in range(6):
        s.add(Employee(email=f"e{i}@example.com", hashed_password="x", employee_code=f"C-{i}", role=UserRole.EMPLOYEE, first_name=f"E{i}", last_name="U",
                       job_title="t", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=1))
    s.commit()
    yield s
    s.close()
    engine.dispose()


def test_rows_by_id_is_one_query_however_many_ids(db):
    from app.modules.hr.service import _rows_by_id

    statements = []
    event.listen(db.get_bind(), "before_cursor_execute", lambda *a: statements.append(a[2]))
    ids = [e.id for e in db.query(Employee).all()]
    statements.clear()
    found = _rows_by_id(db, Employee, ids + [None, None, ids[0]])
    assert len(statements) == 1 and set(found) == set(ids)
    assert _rows_by_id(db, Employee, [None]) == {} and len(statements) == 1  # nothing to look up, nothing queried
    assert set(_rows_by_id(db, Employee, ids, Employee.id == ids[0])) == {ids[0]}


def test_the_hot_query_indexes_exist():
    names = {i.name for t in (AttendanceRecord.__table__, PerformanceReview.__table__) for i in t.indexes}
    assert {"ix_attendance_org_date", "ix_attendance_employee_date", "ix_perf_reviews_org_employee"} <= names
