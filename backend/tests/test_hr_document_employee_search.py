"""
tests/test_hr_document_employee_search.py
------------------------------------------
Regression coverage for ZHR 43: the Employee ID filter on HR documents never
matched anything in practice because it was an exact, case-sensitive comparison
against `Employee.employee_id`, and that column is NULL for 75 of 81 employees
in the production database — `employee_code` is the populated identifier.

Covered:
  - search by employee_code (the column users actually see and type)
  - search by the sparse employee_id column
  - search by legacy_code
  - search by the numeric employee primary key
  - case-insensitivity, substring matching and whitespace trimming
  - organization isolation (a code from another org must not leak documents)
  - `search=` also resolving employee codes
  - response enrichment: employee_id_str falls back to employee_code and the
    new employee_code / legacy_code fields are populated
"""

import sys
import pathlib
from datetime import date, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from app.database import Base
from app.modules.hr import service
from app.modules.hr.models import (
    Organization,
    OrganizationStatus,
)
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    engine.dispose()


def _make_org(db, org_id: int, name: str) -> Organization:
    org = Organization(id=org_id, name=name, status=OrganizationStatus.ACTIVE, timezone="UTC")
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


_next = [0]


def _make_employee(
    db,
    *,
    org_id: int,
    employee_code: str,
    employee_id: str | None = None,
    legacy_code: str | None = None,
    role: UserRole = UserRole.EMPLOYEE,
) -> Employee:
    _next[0] += 1
    n = _next[0]
    emp = Employee(
        email=f"u{n}@z.test",
        hashed_password="hashed",
        employee_id=employee_id,
        employee_code=employee_code,
        legacy_code=legacy_code,
        role=role,
        first_name="First",
        last_name=f"Last{n}",
        job_title="Engineer",
        employment_type=EmploymentType.FULL_TIME,
        status=EmployeeStatus.ACTIVE,
        date_of_joining=date.today() - timedelta(days=10),
        organization_id=org_id,
    )
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return emp


def _upload(db, *, org_id: int, employee, uploaded_by, category: str = "payslip") -> dict:
    return service.upload_hr_document(
        db,
        title="Payslip March",
        category=category,
        file_path="/tmp/p.pdf",
        file_name="p.pdf",
        file_size=10,
        mime_type="application/pdf",
        organization_id=org_id,
        employee_id=employee.id,
        uploaded_by=uploaded_by.id,
    )


@pytest.fixture
def env(db):
    org1 = _make_org(db, 1, "Org One")
    org2 = _make_org(db, 2, "Org Two")
    admin1 = _make_employee(db, org_id=1, employee_code="ADM00001", role=UserRole.ADMIN)
    target = _make_employee(db, org_id=1, employee_code="TEE00024")
    other = _make_employee(db, org_id=1, employee_code="NIE00006")
    sparse = _make_employee(db, org_id=1, employee_code="SCE00002", employee_id="SC0002")
    legacy = _make_employee(db, org_id=1, employee_code="NEE00007", legacy_code="OLD0007")
    foreign = _make_employee(db, org_id=2, employee_code="FORE001")
    _upload(db, org_id=1, employee=target, uploaded_by=admin1)
    _upload(db, org_id=1, employee=other, uploaded_by=admin1)
    _upload(db, org_id=1, employee=sparse, uploaded_by=admin1)
    _upload(db, org_id=1, employee=legacy, uploaded_by=admin1)
    _upload(db, org_id=2, employee=foreign, uploaded_by=admin1)
    return {
        "db": db,
        "org1": org1,
        "org2": org2,
        "admin1": admin1,
        "target": target,
        "other": other,
        "sparse": sparse,
        "legacy": legacy,
        "foreign": foreign,
    }


def _ids(docs) -> set:
    return {d["id"] for d in docs}


# ── The bug: employee_code search used to return nothing ─────────────────────

def test_employee_code_filter_matches(env):
    db, org1 = env["db"], env["org1"]
    admin, target = env["admin1"], env["target"]
    expected = _upload(db, org_id=org1.id, employee=target, uploaded_by=admin)

    docs = service.get_hr_documents(
        db, organization_id=org1.id, current_user=admin, employee_id_str="TEE00024"
    )
    assert expected["id"] in _ids(docs)


def test_sparse_employee_id_still_matches(env):
    db, org1 = env["db"], env["org1"]
    admin, sparse = env["admin1"], env["sparse"]
    expected = _upload(db, org_id=org1.id, employee=sparse, uploaded_by=admin)

    docs = service.get_hr_documents(
        db, organization_id=org1.id, current_user=admin, employee_id_str="SC0002"
    )
    assert expected["id"] in _ids(docs)


def test_legacy_code_matches(env):
    db, org1 = env["db"], env["org1"]
    admin, legacy = env["admin1"], env["legacy"]
    expected = _upload(db, org_id=org1.id, employee=legacy, uploaded_by=admin)

    docs = service.get_hr_documents(
        db, organization_id=org1.id, current_user=admin, employee_id_str="OLD0007"
    )
    assert expected["id"] in _ids(docs)


def test_numeric_database_id_matches(env):
    db, org1 = env["db"], env["org1"]
    admin, target = env["admin1"], env["target"]
    expected = _upload(db, org_id=org1.id, employee=target, uploaded_by=admin)

    docs = service.get_hr_documents(
        db, organization_id=org1.id, current_user=admin, employee_id_str=str(target.id)
    )
    assert expected["id"] in _ids(docs)


@pytest.mark.parametrize(
    "typed",
    ["tee00024", "Tee00024", "  TEE00024  ", "TEE000", "24"],
)
def test_case_whitespace_and_partial_matches(env, typed):
    db, org1 = env["db"], env["org1"]
    admin, target = env["admin1"], env["target"]
    expected = _upload(db, org_id=org1.id, employee=target, uploaded_by=admin)

    docs = service.get_hr_documents(
        db, organization_id=org1.id, current_user=admin, employee_id_str=typed
    )
    assert expected["id"] in _ids(docs), f"typing {typed!r} should find the document"


def test_unknown_identifier_returns_no_documents(env):
    db, org1 = env["db"], env["org1"]
    admin = env["admin1"]
    docs = service.get_hr_documents(
        db, organization_id=org1.id, current_user=admin, employee_id_str="ZZZ99999"
    )
    assert docs == []


def test_employee_filter_is_organization_scoped(env):
    db, org1, admin = env["db"], env["org1"], env["admin1"]
    docs = service.get_hr_documents(
        db, organization_id=org1.id, current_user=admin, employee_id_str="FORE001"
    )
    assert docs == [], "another organization's employee code must not leak documents"


def test_general_search_resolves_employee_code(env):
    db, org1 = env["db"], env["org1"]
    admin, target = env["admin1"], env["target"]
    expected = _upload(db, org_id=org1.id, employee=target, uploaded_by=admin)

    docs = service.get_hr_documents(
        db, organization_id=org1.id, current_user=admin, search="TEE00024"
    )
    assert expected["id"] in _ids(docs)


def test_general_search_still_matches_title(env):
    db, org1 = env["db"], env["org1"]
    admin, target = env["admin1"], env["target"]
    expected = _upload(db, org_id=org1.id, employee=target, uploaded_by=admin)

    docs = service.get_hr_documents(
        db, organization_id=org1.id, current_user=admin, search="march"
    )
    assert expected["id"] in _ids(docs)


def test_response_exposes_identifier_fields(env):
    db, org1 = env["db"], env["org1"]
    admin, target, sparse, legacy = (
        env["admin1"], env["target"], env["sparse"], env["legacy"],
    )
    expected = _upload(db, org_id=org1.id, employee=target, uploaded_by=admin)

    docs = {d["id"]: d for d in service.get_hr_documents(
        db, organization_id=org1.id, current_user=admin
    )}

    row = docs[expected["id"]]
    # employee_id is NULL for most employees, so employee_id_str must fall back
    assert row["employee_id_str"] == target.employee_code == "TEE00024"
    assert row["employee_code"] == "TEE00024"
    assert row["employee_name"]

    sparse_row = [r for r in docs.values() if r["employee_code"] == "SCE00002"][0]
    assert sparse_row["employee_id_str"] == "SC0002"

    legacy_row = [r for r in docs.values() if r["employee_code"] == "NEE00007"][0]
    assert legacy_row["legacy_code"] == "OLD0007"


def test_unassigned_document_has_no_identifier(env):
    db, org1 = env["db"], env["org1"]
    admin = env["admin1"]
    doc = service.upload_hr_document(
        db,
        title="Policy",
        category="other",
        file_path="/tmp/x.pdf",
        file_name="x.pdf",
        file_size=1,
        mime_type="application/pdf",
        organization_id=org1.id,
        employee_id=None,
        uploaded_by=admin.id,
    )
    row = service.get_hr_documents(
        db, organization_id=org1.id, current_user=admin, employee_id=doc["employee_id"]
    ) if doc.get("employee_id") else [d for d in service.get_hr_documents(
        db, organization_id=org1.id, current_user=admin, search="Policy"
    )]
    assert row
    assert row[0]["employee_id_str"] is None
    assert row[0]["employee_code"] is None


def test_resolve_helper_skips_blank_and_missing(db):
    assert service.resolve_employee_ids_by_identifier(db, None) == []
    assert service.resolve_employee_ids_by_identifier(db, "   ") == []
    assert service.resolve_employee_ids_by_identifier(db, "NOBODY") == []