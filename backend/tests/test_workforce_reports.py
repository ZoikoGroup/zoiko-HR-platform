"""Workforce report exports show department NAMES, never database numbers (ZHR-82), and always carry headings."""

import csv
import io
from datetime import date

import openpyxl
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.modules.hr.models import Department, Organization, OrganizationStatus, WfHeadcount, WfPlan, WfSuccession

BASE = "/hr/workforce/reports/export"


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

    def person(email, org, n, first, last):
        return Employee(email=email, hashed_password="x", employee_code=f"C{n}", role=UserRole.ADMIN, first_name=first, last_name=last, job_title="t",
                        employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=org)

    admin, ann, bob, other = person("a@x.com", 1, 1, "Priya", "Shah"), person("ann@x.com", 1, 2, "Ann", "Lee"), person("bob@x.com", 1, 3, "Bob", "Ray"), person("o@x.com", 2, 4, "Sam", "Other")
    mgmt = Department(id=66, name="Management", code="MGT", organization_id=1)       # a high database number, like the report that was filed
    theirs = Department(id=67, name="Elsewhere", code="ELS", organization_id=2)
    s.add_all([admin, ann, bob, other, mgmt, theirs])
    s.commit()
    s.add_all([
        WfHeadcount(organization_id=1, department_id=66, fiscal_year=2027, approved_positions=10, filled_positions=6, vacant_positions=4, planned_hires=3, projected_cost=120000),
        WfHeadcount(organization_id=2, department_id=67, fiscal_year=2027, approved_positions=99),
        WfPlan(organization_id=1, title="Grow sales", department_id=66, plan_year=2027, status="approved", budget=500000, target_headcount=40, current_headcount=30, created_by=admin.id),
        WfSuccession(organization_id=1, employee_id=ann.id, successor_employee_id=bob.id, readiness_level="not_ready", risk_level="high", target_position="Head of Sales"),
    ])
    s.commit()
    box = {"user": admin}
    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: box["user"]
    app.dependency_overrides[get_current_admin] = lambda: box["user"]
    c = TestClient(app, raise_server_exceptions=False)
    c.db, c.box, c.admin, c.other = s, box, admin, other
    yield c
    for dep in (get_db, get_current_user, get_current_admin):
        app.dependency_overrides.pop(dep, None)
    s.close()
    engine.dispose()


def _csv(env, report):
    r = env.get(f"{BASE}/csv", params={"report_type": report})
    assert r.status_code == 200, r.text
    return list(csv.reader(io.StringIO(r.text)))


def _excel(env, report):
    r = env.get(f"{BASE}/excel", params={"report_type": report})
    assert r.status_code == 200, r.text
    ws = openpyxl.load_workbook(io.BytesIO(r.content)).active
    return [[c.value for c in row] for row in ws.iter_rows()]


def test_the_headcount_export_names_the_department_not_its_database_number(env):
    for table in (_csv(env, "headcount_summary"), _excel(env, "headcount_summary")):
        assert table[0] == ["Department", "Fiscal Year", "Approved Positions", "Filled Positions", "Vacant Positions", "Planned Hires", "Projected Cost"]
        assert str(table[1][0]) == "Management"
        assert "66" not in [str(v) for v in table[1]] and "department_id" not in str(table[0])
        assert [str(v) for v in table[1][1:4]] == ["2027", "10", "6"]


def test_the_export_matches_what_the_headcount_page_shows(env):
    page = env.get("/hr/workforce/headcount").json()["items"]
    sheet = _excel(env, "headcount_summary")
    assert [p["department_name"] for p in page] == [row[0] for row in sheet[1:]] == ["Management"]


def test_other_organizations_rows_are_never_exported(env):
    flat = str(_excel(env, "headcount_summary"))
    assert "Elsewhere" not in flat and "99" not in flat
    env.box["user"] = env.other
    table = _excel(env, "headcount_summary")
    assert [row[0] for row in table[1:]] == ["Elsewhere"]


def test_the_other_reports_use_names_and_words_too(env):
    plans = _excel(env, "workforce_summary")
    assert plans[0][:2] == ["Plan", "Department"] and plans[1][:2] == ["Grow sales", "Management"] and plans[1][3] == "Approved"
    pipeline = _csv(env, "succession_pipeline")
    assert pipeline[0][:3] == ["Employee", "Successor", "Target Position"]
    assert pipeline[1][:5] == ["Ann Lee", "Bob Ray", "Head of Sales", "Not ready", "High"] or pipeline[1][:4] == ["Ann Lee", "Bob Ray", "Head of Sales", "Not ready"]


def test_an_empty_report_still_has_its_headings(env):
    env.box["user"] = env.other
    env.db.query(WfHeadcount).filter(WfHeadcount.organization_id == 2).delete()
    env.db.commit()
    assert _csv(env, "headcount_summary") == [["Department", "Fiscal Year", "Approved Positions", "Filled Positions", "Vacant Positions", "Planned Hires", "Projected Cost"]]
    assert _excel(env, "succession_pipeline")[0][0] == "Employee"


def test_the_pdf_export_works_and_a_headcount_row_without_a_department_says_so(env):
    env.db.add(WfHeadcount(organization_id=1, department_id=None, fiscal_year=2026, approved_positions=1))
    env.db.commit()
    assert "Unassigned" in str(_csv(env, "headcount_summary"))
    r = env.get(f"{BASE}/pdf", params={"report_type": "headcount_summary"})
    assert r.status_code == 200 and r.content.startswith(b"%PDF")


def test_an_unknown_report_type_is_refused_and_a_report_needs_a_name_and_a_known_type(env):
    assert env.get(f"{BASE}/csv", params={"report_type": "salaries"}).status_code == 400
    assert env.post("/hr/workforce/reports/generate", json={"report_name": " ", "report_type": "headcount_summary"}).status_code == 422
    assert env.post("/hr/workforce/reports/generate", json={"report_name": "Q1", "report_type": "nope"}).status_code == 422
    ok = env.post("/hr/workforce/reports/generate", json={"report_name": "  Q1   headcount ", "report_type": "headcount_summary"})
    assert ok.status_code == 201 and ok.json()["report_name"] == "Q1 headcount"
