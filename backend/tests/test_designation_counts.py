"""ZHR-52: the designations list (which feeds the dashboard) reports live employee counts."""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.dependencies import get_current_user
from app.database import Base, get_db
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import Designation, Organization, OrganizationStatus


@pytest.fixture
def client():
    from app.main import app

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add_all([Organization(id=1, name="Acme", status=OrganizationStatus.ACTIVE), Organization(id=2, name="Globex", status=OrganizationStatus.ACTIVE)])
    s.commit()
    admin = Employee(email="a@example.com", hashed_password="x", employee_code="C-a", role=UserRole.ADMIN, first_name="A", last_name="U",
                     job_title="t", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=1)
    s.add(admin)
    s.commit()
    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: admin
    c = TestClient(app, raise_server_exceptions=False)
    c.db = s
    yield c
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
    s.close()
    engine.dispose()


def _desig(db, title, org=1, level="L3", stored=0):
    d = Designation(title=title, organization_id=org, level=level, status="active", employees_count=stored, department_name="Eng")
    db.add(d)
    db.commit()
    return d


def _emp(db, n, desig, status=EmployeeStatus.ACTIVE, org=1):
    e = Employee(email=f"e{n}@example.com", hashed_password="x", employee_code=f"E-{n}", role=UserRole.EMPLOYEE, first_name="E", last_name=str(n),
                 job_title="t", employment_type=EmploymentType.FULL_TIME, status=status, date_of_joining=date.today(),
                 organization_id=org, designation_id=desig.id)
    db.add(e)
    db.commit()


def test_counts_are_live_not_the_stored_column(client):
    eng = _desig(client.db, "Engineer", stored=99)  # a stale stored number must not leak through
    _desig(client.db, "Designer")
    for n in range(3):
        _emp(client.db, n, eng)
    _emp(client.db, 10, eng, status=EmployeeStatus.INACTIVE)  # inactive people are not counted
    rows = {r["title"]: r for r in client.get("/hr/designations").json()}
    assert rows["Engineer"]["employees_count"] == 3
    assert rows["Designer"]["employees_count"] == 0


def test_only_this_organizations_designations_are_listed(client):
    _desig(client.db, "Mine")
    _desig(client.db, "Theirs", org=2)
    assert [r["title"] for r in client.get("/hr/designations").json()] == ["Mine"]


def test_empty_list_is_fine(client):
    r = client.get("/hr/designations")
    assert r.status_code == 200 and r.json() == []


# ── ZHR-53: provenance, delete guard, duplicate guard, cache invalidation ──────

def test_created_designation_records_who_and_how(client):
    r = client.post("/hr/designations", json={"title": "Staff Engineer", "department_name": "Eng", "level": "L6"})
    assert r.status_code == 201, r.text
    row = next(d for d in client.get("/hr/designations").json() if d["title"] == "Staff Engineer")
    assert row["source"] == "manual" and row["created_by_name"] == "A U"


def test_designations_made_by_import_and_the_add_user_form_say_so(client):
    import io
    import openpyxl
    from unittest.mock import patch

    from app.modules.employee import service as emp_service

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["First Name", "Last Name", "Email", "Job Title", "Date of Joining", "Designation"])
    ws.append(["Ann", "A", "ann@example.com", "Dev", "2026-09-01", "Principal Engineer"])
    admin = client.db.query(Employee).first()
    with patch("app.modules.employee.service._notify_email"), patch("app.core.code_generation.generate_employee_code", lambda db, organization_id=None: "EMP-9"):
        buf = io.BytesIO()
        wb.save(buf)
        emp_service.import_employees_from_file(db=client.db, file_bytes=buf.getvalue(), filename="p.xlsx", organization_id=1, current_user_id=admin.id)
    row = next(d for d in client.get("/hr/designations").json() if d["title"] == "Principal Engineer")
    assert row["source"] == "import" and row["created_by"] == admin.id


def test_duplicate_titles_are_rejected_case_insensitively(client):
    assert client.post("/hr/designations", json={"title": "Analyst"}).status_code == 201
    assert client.post("/hr/designations", json={"title": "  analyst "}).status_code in (400, 409)
    assert len([d for d in client.get("/hr/designations").json() if d["title"].lower() == "analyst"]) == 1


def test_cannot_delete_a_designation_that_employees_hold(client):
    d = _desig(client.db, "Engineer")
    _emp(client.db, 1, d)
    r = client.delete(f"/hr/designations/{d.id}")
    assert r.status_code == 400 and "employee" in str(r.json()).lower()
    assert any(x["id"] == d.id for x in client.get("/hr/designations").json())
    unused = _desig(client.db, "Unused")
    assert client.delete(f"/hr/designations/{unused.id}").status_code == 200


def test_the_response_cache_is_dropped_by_designation_and_employee_writes():
    from app.core.cache_middleware import _get_invalidation_prefixes

    assert "/hr/designations" in _get_invalidation_prefixes("/hr/designations")
    assert "/hr/designations" in _get_invalidation_prefixes("/hr/designations/5")
    assert "/hr/designations" in _get_invalidation_prefixes("/hr/employee-management/employees/import")
    assert "/hr/designations" in _get_invalidation_prefixes("/hr/employee-management/employees/3")


def test_a_refresh_request_gets_its_own_cache_key():
    from app.core.cache_middleware import _build_key

    plain = _build_key(1, "u", "GET", "/hr/designations", "")
    fresh = _build_key(1, "u", "GET", "/hr/designations", "_=1759999999999")
    assert plain != fresh
    assert _build_key(1, "u", "GET", "/hr/designations", "_=1759999999999") == fresh


def test_provenance_migration_is_idempotent_and_reversible():
    import importlib.util
    import pathlib

    import sqlalchemy as sa
    from alembic.operations import Operations
    from alembic.runtime.migration import MigrationContext

    path = pathlib.Path(__file__).parent.parent / "alembic" / "versions" / "q1e2f3a4b5c3_zhr53_designation_provenance.py"
    spec = importlib.util.spec_from_file_location("zhr53_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE employees (id INTEGER PRIMARY KEY)"))
        conn.execute(sa.text("CREATE TABLE designations (id INTEGER PRIMARY KEY, title VARCHAR(150))"))
        conn.execute(sa.text("INSERT INTO designations (title) VALUES ('Old row')"))
        with Operations.context(MigrationContext.configure(conn)):
            mod.upgrade()
            mod.upgrade()  # a second run is a no-op
            cols = {c["name"] for c in sa.inspect(conn).get_columns("designations")}
            assert {"source", "created_by"} <= cols
            assert conn.execute(sa.text("SELECT source FROM designations")).scalar() is None  # old rows stay valid
            mod.downgrade()
            mod.downgrade()
            assert not ({"source", "created_by"} & {c["name"] for c in sa.inspect(conn).get_columns("designations")})


# ── ZHR-54: Designation Reports are computed from the organization's data ───────

def _joined(db, n, desig, when, status=EmployeeStatus.ACTIVE, org=1):
    e = Employee(email=f"j{n}@example.com", hashed_password="x", employee_code=f"J-{n}", role=UserRole.EMPLOYEE, first_name="J", last_name=str(n),
                 job_title="t", employment_type=EmploymentType.FULL_TIME, status=status, date_of_joining=when,
                 organization_id=org, designation_id=desig.id)
    db.add(e)
    db.commit()


def test_report_totals_and_department_table_use_live_data(client):
    from datetime import datetime, timedelta

    eng = Designation(title="Engineer", department_name="Engineering", level="L3", status="active", min_salary=50000, max_salary=80000, organization_id=1)
    lead = Designation(title="Lead", department_name="Engineering", level="L5", status="active", min_salary=90000, max_salary=120000, organization_id=1)
    hr = Designation(title="HR Partner", department_name="People", level="L3", status="inactive", organization_id=1)
    other_org = Designation(title="Spy", department_name="Engineering", level="L3", status="active", organization_id=2)
    client.db.add_all([eng, lead, hr, other_org])
    client.db.commit()
    today = datetime.utcnow().date()
    _joined(client.db, 1, eng, today - timedelta(days=200))
    _joined(client.db, 2, eng, today - timedelta(days=10))
    _joined(client.db, 3, lead, today - timedelta(days=5))
    _joined(client.db, 4, eng, today - timedelta(days=5), status=EmployeeStatus.INACTIVE)  # not counted
    _joined(client.db, 5, other_org, today, org=2)  # another organization's people never leak in

    r = client.get("/hr/designations/report")
    assert r.status_code == 200, r.text
    rep = r.json()
    t = rep["totals"]
    assert (t["designations"], t["active"], t["inactive"], t["employees"], t["departments"]) == (3, 2, 1, 3, 2)
    assert t["unfilled"] == 1 and t["without_salary_range"] == 1
    assert t["salary_min_total"] == 2 * 50000 + 90000 and t["salary_max_total"] == 2 * 80000 + 120000

    depts = {d["department"]: d for d in rep["by_department"]}
    assert (depts["Engineering"]["designations"], depts["Engineering"]["employees"]) == (2, 3)  # the table that showed 0
    assert (depts["People"]["designations"], depts["People"]["employees"]) == (1, 0)
    assert "Spy" not in [x["title"] for x in rep["designations"]]


def test_report_trends_come_from_real_dates(client):
    from datetime import datetime, timedelta

    d = Designation(title="Engineer", department_name="Eng", level="L3", status="active", organization_id=1, created_at=datetime.utcnow())
    client.db.add(d)
    client.db.commit()
    today = datetime.utcnow().date()
    _joined(client.db, 1, d, today - timedelta(days=100))
    _joined(client.db, 2, d, today)
    rep = client.get("/hr/designations/report", params={"months": 6}).json()
    trend = rep["headcount_trend"]
    assert len(trend) == 6 and trend[-1]["month"] == today.strftime("%Y-%m")
    assert trend[-1]["count"] == 2 and trend[0]["count"] <= trend[-1]["count"]  # cumulative, never decreasing
    assert sum(m["joined"] for m in trend) == 2
    assert [m["count"] for m in trend] == sorted(m["count"] for m in trend)
    growth = rep["designation_growth"]
    assert growth[-1]["new"] == 1 and growth[-1]["total"] == 1


def test_report_for_an_empty_organization_is_all_zeros_not_demo_data(client):
    rep = client.get("/hr/designations/report").json()
    assert rep["totals"]["designations"] == 0 and rep["totals"]["employees"] == 0
    assert rep["by_department"] == [] and rep["designation_growth"] == [] and rep["designations"] == []
    assert len(rep["headcount_trend"]) == 12 and all(m["count"] == 0 for m in rep["headcount_trend"])


def test_report_route_is_not_swallowed_by_the_id_route(client):
    assert client.get("/hr/designations/report").status_code == 200
    assert client.get("/hr/designations/999999").status_code == 404
