"""ZHR-49: the document approval chain has no Manager stage; only an HR Admin or the
Organization Admin approves or rejects."""

from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.exceptions import ForbiddenException
from app.database import Base
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr import service
from app.modules.hr.models import (
    ApprovalStepStatus, DocumentApprovalStep, HrDocument, HrDocumentCategory, HrDocumentStatus, Organization, OrganizationStatus,
)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add(Organization(id=1, name="Acme", status=OrganizationStatus.ACTIVE))
    s.commit()
    yield s
    s.close()
    engine.dispose()


def _person(db, key, role):
    e = Employee(email=f"{key}@example.com", hashed_password="x", employee_code=f"C-{key}", role=role, first_name=key.title(), last_name="U",
                 job_title="t", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE,
                 date_of_joining=date.today(), organization_id=1)
    db.add(e)
    db.commit()
    return e


def _doc(db, owner):
    d = HrDocument(title="Policy", category=HrDocumentCategory.OTHER, file_path="x", file_name="x.pdf", status=HrDocumentStatus.PENDING,
                   employee_id=owner.id, uploaded_by=owner.id, organization_id=1)
    db.add(d)
    db.commit()
    return d


def _roles(db, doc):
    return [s.required_role for s in db.query(DocumentApprovalStep).filter_by(document_id=doc.id).order_by(DocumentApprovalStep.step_order)]


def test_new_chain_is_hr_admin_then_org_admin_with_no_manager_stage(db):
    emp = _person(db, "emp", UserRole.EMPLOYEE)
    doc = _doc(db, emp)
    service.create_default_approval_steps(db, doc.id, "employee")
    assert _roles(db, doc) == ["hr_admin", "admin"]


@pytest.mark.parametrize("role", [UserRole.EMPLOYEE, UserRole.MANAGER])
def test_employees_and_managers_cannot_approve_or_reject(db, role):
    emp = _person(db, "emp", UserRole.EMPLOYEE)
    actor = _person(db, "actor", role)
    doc = _doc(db, emp)
    service.create_default_approval_steps(db, doc.id, "employee")
    with pytest.raises(ForbiddenException):
        service.approve_document(db, doc.id, actor)
    with pytest.raises(ForbiddenException):
        service.reject_document(db, doc.id, actor)
    assert service.get_pending_approvals(db, actor) == []
    db.refresh(doc)
    assert doc.status == HrDocumentStatus.PENDING


@pytest.mark.parametrize("role", [UserRole.HR_ADMIN, UserRole.ADMIN])
def test_hr_admin_and_org_admin_see_and_approve(db, role):
    emp = _person(db, "emp", UserRole.EMPLOYEE)
    actor = _person(db, "actor", role)
    doc = _doc(db, emp)
    service.create_default_approval_steps(db, doc.id, "employee")
    assert {p["document_id"] for p in service.get_pending_approvals(db, actor)} == {doc.id}
    assert service.approve_document(db, doc.id, actor)["status"] == "approved"
    db.refresh(doc)
    assert doc.status == HrDocumentStatus.APPROVED
    assert service.get_pending_approvals(db, actor) == []  # remaining steps were skipped


def test_hr_admin_can_reject(db):
    emp = _person(db, "emp", UserRole.EMPLOYEE)
    hr = _person(db, "hr", UserRole.HR_ADMIN)
    doc = _doc(db, emp)
    service.create_default_approval_steps(db, doc.id, "employee")
    service.reject_document(db, doc.id, hr, "wrong file")
    db.refresh(doc)
    assert doc.status == HrDocumentStatus.REJECTED


def test_a_legacy_manager_step_is_owned_by_hr_admin_not_stranded(db):
    emp = _person(db, "emp", UserRole.EMPLOYEE)
    mgr = _person(db, "mgr", UserRole.MANAGER)
    hr = _person(db, "hr", UserRole.HR_ADMIN)
    doc = _doc(db, emp)
    db.add_all([DocumentApprovalStep(document_id=doc.id, step_order=1, required_role="manager", status=ApprovalStepStatus.PENDING),
                DocumentApprovalStep(document_id=doc.id, step_order=2, required_role="hr_admin", status=ApprovalStepStatus.PENDING),
                DocumentApprovalStep(document_id=doc.id, step_order=3, required_role="admin", status=ApprovalStepStatus.PENDING)])
    db.commit()
    assert service.get_pending_approvals(db, mgr) == []  # a manager no longer sees it
    rows = service.get_pending_approvals(db, hr)
    assert rows and rows[0]["required_role"] == "hr_admin"  # shown as the HR Admin stage
    assert service.approve_document(db, doc.id, hr)["status"] == "approved"
    db.refresh(doc)
    assert doc.status == HrDocumentStatus.APPROVED


def test_admin_uploads_stay_auto_approved(db):
    admin = _person(db, "admin", UserRole.ADMIN)
    doc = _doc(db, admin)
    assert service.create_default_approval_steps(db, doc.id, "admin") == []
    db.refresh(doc)
    assert doc.status == HrDocumentStatus.APPROVED
