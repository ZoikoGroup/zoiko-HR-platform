"""
tests/test_hr_document_visibility.py
-------------------------------------
Regression coverage for the HR document access-control bug: `get_hr_documents`
used to OR `organization_id == org_id` together with the uploader/employee
scoping, so organization membership *alone* satisfied the whole filter and
every employee could see every other employee's payslips, offer/contract
letters, and tax documents. The fix makes organization membership a
*necessary* condition, ANDed with (uploaded_by == self OR employee_id == self)
for non-admin users.

Covers:
  - the actual leak: employee B must not see employee A's documents
  - admin/hr_admin/super_admin still see every document in their org
  - per-category isolation for payslip / employee / tax (the three
    employee-facing tabs)
  - the self-upload path (Employee_UploadRequest.jsx -> POST /hr/documents/upload)
  - the still-open gap: get_hr_documents does not consult DocumentAssignment,
    so a genuine company-wide doc (employee_id=None) is only reachable via
    the separate /documents/assigned-to-me (get_my_assigned_documents) path,
    not via get_hr_documents itself. This is documented, not fixed, here.
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
    HrDocumentCategory,
    DocumentAssignment,
    AssignmentStatus,
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


def _make_org(db, org_id: int = 1) -> Organization:
    org = Organization(id=org_id, name="Test Org", status=OrganizationStatus.ACTIVE, timezone="UTC")
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


_next_code = [0]


def _make_employee(db, *, org_id: int, role: UserRole = UserRole.EMPLOYEE) -> Employee:
    _next_code[0] += 1
    n = _next_code[0]
    emp = Employee(
        email=f"user{n}@z.test",
        hashed_password="hashed-not-important-for-fixtures",
        employee_code=f"E-{n:04d}",
        role=role,
        first_name="First",
        last_name=f"Last{n}",
        job_title="Engineer",
        employment_type=EmploymentType.FULL_TIME,
        status=EmployeeStatus.ACTIVE,
        date_of_joining=date.today() - timedelta(days=30),
        organization_id=org_id,
    )
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return emp


def _upload(db, *, org_id: int, category: str, employee_id, uploaded_by) -> dict:
    return service.upload_hr_document(
        db,
        title="Doc",
        category=category,
        file_path="/tmp/f.pdf",
        file_name="f.pdf",
        file_size=100,
        mime_type="application/pdf",
        organization_id=org_id,
        employee_id=employee_id,
        uploaded_by=uploaded_by,
    )


def _ids(docs: list[dict]) -> set:
    return {d["id"] for d in docs}


# ── The regression test that would have caught this bug ─────────────────────

def test_employee_cannot_see_other_employees_documents(db):
    org = _make_org(db)
    admin = _make_employee(db, org_id=org.id, role=UserRole.ADMIN)
    emp_a = _make_employee(db, org_id=org.id)
    emp_b = _make_employee(db, org_id=org.id)

    doc = _upload(db, org_id=org.id, category="payslip", employee_id=emp_a.id, uploaded_by=admin.id)

    docs_for_b = service.get_hr_documents(db, current_user=emp_b)
    assert doc["id"] not in _ids(docs_for_b), (
        "employee B must not see employee A's payslip through GET /hr/documents"
    )

    docs_for_a = service.get_hr_documents(db, current_user=emp_a)
    assert doc["id"] in _ids(docs_for_a)


# ── Admin branch must stay unrestricted ──────────────────────────────────────

@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.HR_ADMIN, UserRole.SUPER_ADMIN])
def test_admin_roles_see_all_org_documents(db, role):
    org = _make_org(db)
    admin_uploader = _make_employee(db, org_id=org.id, role=UserRole.ADMIN)
    emp_a = _make_employee(db, org_id=org.id)
    emp_b = _make_employee(db, org_id=org.id)
    viewer = _make_employee(db, org_id=org.id, role=role)

    doc_a = _upload(db, org_id=org.id, category="payslip", employee_id=emp_a.id, uploaded_by=admin_uploader.id)
    doc_b = _upload(db, org_id=org.id, category="tax", employee_id=emp_b.id, uploaded_by=admin_uploader.id)

    docs = service.get_hr_documents(db, current_user=viewer)
    assert {doc_a["id"], doc_b["id"]}.issubset(_ids(docs)), (
        f"{role.value} must still see every document in the organization after the Step 1 fix"
    )


# ── Per-category isolation for the three employee-facing tabs ───────────────

@pytest.mark.parametrize("category", ["payslip", "employee", "tax"])
def test_per_category_isolation(db, category):
    org = _make_org(db)
    admin = _make_employee(db, org_id=org.id, role=UserRole.ADMIN)
    emp_a = _make_employee(db, org_id=org.id)
    emp_b = _make_employee(db, org_id=org.id)

    doc = _upload(db, org_id=org.id, category=category, employee_id=emp_a.id, uploaded_by=admin.id)

    docs_for_a = service.get_hr_documents(db, current_user=emp_a, category=category)
    assert doc["id"] in _ids(docs_for_a)

    docs_for_b = service.get_hr_documents(db, current_user=emp_b, category=category)
    assert doc["id"] not in _ids(docs_for_b)


# ── Self-upload path (Employee_UploadRequest.jsx) ────────────────────────────

def test_self_uploaded_document_visible_to_uploader(db):
    """POST /hr/documents/upload resolves employee_id = form value or
    current_user.id (router.py: `resolved_employee_id = employee_id or
    current_user.id`), and Employee_UploadRequest.jsx explicitly sends
    `employee_id=user.id` too — so a self-upload sets BOTH employee_id and
    uploaded_by to the uploader's own id."""
    org = _make_org(db)
    emp_a = _make_employee(db, org_id=org.id)

    doc = _upload(db, org_id=org.id, category="employee", employee_id=emp_a.id, uploaded_by=emp_a.id)

    docs = service.get_hr_documents(db, current_user=emp_a)
    assert doc["id"] in _ids(docs)


def test_uploaded_by_alone_grants_visibility_without_employee_id(db):
    """Defensive edge case for the OR clause: even if employee_id ends up
    None/different, uploaded_by == self must still be sufficient on its own
    (proves the fix ORs the two conditions rather than requiring both)."""
    org = _make_org(db)
    emp_a = _make_employee(db, org_id=org.id)
    emp_b = _make_employee(db, org_id=org.id)

    doc = _upload(db, org_id=org.id, category="other", employee_id=None, uploaded_by=emp_a.id)

    docs_for_a = service.get_hr_documents(db, current_user=emp_a)
    assert doc["id"] in _ids(docs_for_a)

    docs_for_b = service.get_hr_documents(db, current_user=emp_b)
    assert doc["id"] not in _ids(docs_for_b)


# ── Company-wide docs: documents the known, separate gap ─────────────────────

def test_company_wide_doc_not_reachable_via_get_hr_documents_without_assignment(db):
    """A genuine company-wide policy doc (employee_id=None, category=company)
    uploaded by an admin is NOT visible to a plain employee through
    get_hr_documents, because that function only checks uploaded_by/employee_id
    and never consults DocumentAssignment. This is a pre-existing, separate gap
    (not introduced by the Step 1 fix) — see PR description. The only endpoint
    that surfaces org-wide docs to employees today is GET
    /hr/documents/assigned-to-me (get_my_assigned_documents), which is
    DocumentAssignment-driven, exercised below."""
    org = _make_org(db)
    admin = _make_employee(db, org_id=org.id, role=UserRole.ADMIN)
    emp_b = _make_employee(db, org_id=org.id)

    doc = _upload(db, org_id=org.id, category="company", employee_id=None, uploaded_by=admin.id)

    docs_for_b = service.get_hr_documents(db, current_user=emp_b)
    assert doc["id"] not in _ids(docs_for_b)

    # The legitimate distribution mechanism for org-wide docs: an explicit
    # DocumentAssignment row, read via get_my_assigned_documents.
    db.add(DocumentAssignment(
        document_id=doc["id"],
        employee_id=emp_b.id,
        assigned_by=admin.id,
        status=AssignmentStatus.PENDING,
    ))
    db.commit()

    assigned = service.get_my_assigned_documents(db, employee_id=emp_b.id, organization_id=org.id)
    assert doc["id"] in {row["document_id"] for row in assigned}
