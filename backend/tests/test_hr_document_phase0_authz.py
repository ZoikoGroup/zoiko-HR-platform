"""Documents Phase 0 (ZHR-DOCS-ARCH-001 §1.6): authorization holes in the legacy document routes.

P18  PUT /hr/documents/{id} was open to any user and could move a document to another owner or an invalid category.
P19  PATCH /hr/documents/{id}/status bypassed the approval chain (no steps closed, no log, no approved_by).
P20  The approval audit log was readable by every user in the organization.
P21  Assignment checks only applied when uploaded_by was empty; assigned employee ids were never checked.
P22  The folder breadcrumb was not scoped to the organization; folder rename was open to any user.
P28  exit_employee looked the employee up without the caller's organization.
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.dependencies import get_current_user
from app.core.exceptions import NotFoundException
from app.database import Base, get_db
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import (
    DocumentApprovalLog, DocumentApprovalStep, ApprovalStepStatus, HrDocument, HrDocumentCategory, HrDocumentFolder,
    HrDocumentStatus, Organization, OrganizationStatus,
)


def _person(org_id, key, role):
    return Employee(email=f"{key}@org{org_id}.example.com", hashed_password="x", employee_code=f"C-{org_id}-{key}", role=role,
                    first_name=key.title(), last_name="User", job_title="t", employment_type=EmploymentType.FULL_TIME,
                    status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=org_id)


@pytest.fixture
def world():
    from app.main import app

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    for oid in (1, 2):
        s.add(Organization(id=oid, name=f"Org{oid}", organization_name=f"Org{oid}", status=OrganizationStatus.ACTIVE))
    s.commit()
    people = {}
    for key, role in (("admin", UserRole.ADMIN), ("hr", UserRole.HR_ADMIN), ("emp", UserRole.EMPLOYEE), ("mgr", UserRole.MANAGER)):
        people[key] = _person(1, key, role)
        s.add(people[key])
    people["other"] = _person(2, "other", UserRole.EMPLOYEE)
    s.add(people["other"])
    s.commit()

    doc = HrDocument(title="ID proof", category=HrDocumentCategory.EMPLOYEE, status=HrDocumentStatus.PENDING,
                     employee_id=people["emp"].id, uploaded_by=people["emp"].id, organization_id=1)
    foreign_doc = HrDocument(title="Other org", category=HrDocumentCategory.COMPANY, status=HrDocumentStatus.APPROVED,
                             uploaded_by=people["other"].id, organization_id=2)
    s.add_all([doc, foreign_doc])
    s.commit()
    s.add_all([
        DocumentApprovalStep(document_id=doc.id, step_order=1, required_role="hr_admin", status=ApprovalStepStatus.PENDING),
        DocumentApprovalStep(document_id=doc.id, step_order=2, required_role="admin", status=ApprovalStepStatus.PENDING),
    ])
    root = HrDocumentFolder(name="Root", organization_id=1)
    foreign_folder = HrDocumentFolder(name="Theirs", organization_id=2)
    s.add_all([root, foreign_folder])
    s.commit()

    box = {"user": people["admin"]}
    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: box["user"]
    c = TestClient(app, raise_server_exceptions=False)
    c.box, c.people, c.db = box, people, s
    c.doc, c.foreign_doc, c.root, c.foreign_folder = doc, foreign_doc, root, foreign_folder
    yield c
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
    s.close()
    engine.dispose()


# ── P18 ──────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("who", ["emp", "mgr"])
def test_non_admins_cannot_edit_document_metadata(world, who):
    world.box["user"] = world.people[who]
    r = world.put(f"/hr/documents/{world.doc.id}", json={"employee_id": world.people[who].id})
    assert r.status_code == 403
    world.db.refresh(world.doc)
    assert world.doc.employee_id == world.people["emp"].id


def test_admin_cannot_move_document_to_another_orgs_employee(world):
    r = world.put(f"/hr/documents/{world.doc.id}", json={"employee_id": world.people["other"].id})
    assert r.status_code == 404
    world.db.refresh(world.doc)
    assert world.doc.employee_id == world.people["emp"].id


def test_admin_cannot_set_an_invalid_category(world):
    r = world.put(f"/hr/documents/{world.doc.id}", json={"category": "not-a-category"})
    assert r.status_code == 400


def test_admin_can_edit_title(world):
    r = world.put(f"/hr/documents/{world.doc.id}", json={"title": "Passport"})
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "Passport"


# ── P19 ──────────────────────────────────────────────────────────────────────

def test_status_approve_runs_the_approval_chain(world):
    world.box["user"] = world.people["hr"]
    r = world.patch(f"/hr/documents/{world.doc.id}/status", json={"status": "approved"})
    assert r.status_code == 200, r.text
    world.db.refresh(world.doc)
    assert world.doc.status == HrDocumentStatus.APPROVED
    assert world.doc.approved_by == world.people["hr"].id
    steps = world.db.query(DocumentApprovalStep).filter_by(document_id=world.doc.id).all()
    assert all(st.status != ApprovalStepStatus.PENDING for st in steps)
    assert world.db.query(DocumentApprovalLog).filter_by(document_id=world.doc.id, action="approved").count() >= 1


def test_status_reject_requires_a_reason(world):
    r = world.patch(f"/hr/documents/{world.doc.id}/status", json={"status": "rejected"})
    assert r.status_code == 400
    world.db.refresh(world.doc)
    assert world.doc.status == HrDocumentStatus.PENDING


def test_status_reject_with_reason_closes_the_chain(world):
    r = world.patch(f"/hr/documents/{world.doc.id}/status", json={"status": "rejected", "rejection_reason": "Blurry scan"})
    assert r.status_code == 200, r.text
    world.db.refresh(world.doc)
    assert world.doc.status == HrDocumentStatus.REJECTED
    assert world.doc.rejection_reason == "Blurry scan"
    assert world.db.query(DocumentApprovalLog).filter_by(document_id=world.doc.id, action="rejected").count() == 1


def test_status_expired_is_logged(world):
    r = world.patch(f"/hr/documents/{world.doc.id}/status", json={"status": "expired"})
    assert r.status_code == 200, r.text
    assert world.db.query(DocumentApprovalLog).filter_by(document_id=world.doc.id, action="status_expired").count() == 1


# ── P20 ──────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("who,code", [("emp", 403), ("mgr", 403), ("hr", 200), ("admin", 200)])
def test_audit_log_is_for_approvers_only(world, who, code):
    world.box["user"] = world.people[who]
    assert world.get("/hr/documents/approvals/audit-log").status_code == code


# ── P21 ──────────────────────────────────────────────────────────────────────

# The assign routes sit behind the bulk-distribution plan feature, so the service is exercised directly.

def test_cannot_assign_another_orgs_document(world):
    from app.modules.hr import service as hr_service
    with pytest.raises(NotFoundException):
        hr_service.assign_document_to_employees(world.db, world.foreign_doc.id, [world.people["emp"].id],
                                                assigned_by=world.people["admin"].id, organization_id=1)


def test_cannot_assign_to_another_orgs_employee(world):
    from app.modules.hr import service as hr_service
    with pytest.raises(NotFoundException):
        hr_service.assign_document_to_employees(world.db, world.doc.id, [world.people["other"].id],
                                                assigned_by=world.people["admin"].id, organization_id=1)


def test_cannot_assign_folder_to_another_orgs_employee(world):
    from app.modules.hr import service as hr_service
    with pytest.raises(NotFoundException):
        hr_service.assign_folder_to_employees(world.db, world.root.id, [world.people["other"].id],
                                              assigned_by=world.people["admin"].id, organization_id=1)


def test_assign_within_org_still_works(world):
    from app.modules.hr import service as hr_service
    rows = hr_service.assign_document_to_employees(world.db, world.doc.id, [world.people["hr"].id],
                                                   assigned_by=world.people["admin"].id, organization_id=1)
    assert [r["employee_id"] for r in rows] == [world.people["hr"].id]


def test_cannot_list_assignments_of_another_orgs_document(world):
    assert world.get(f"/hr/documents/{world.foreign_doc.id}/assignments").status_code == 404


# ── P22 ──────────────────────────────────────────────────────────────────────

def test_breadcrumb_of_another_orgs_folder_is_not_found(world):
    assert world.get(f"/hr/document-folders/{world.foreign_folder.id}/breadcrumb").status_code == 404


def test_breadcrumb_of_own_folder(world):
    r = world.get(f"/hr/document-folders/{world.root.id}/breadcrumb")
    assert r.status_code == 200
    assert r.json() == [{"id": world.root.id, "name": "Root"}]


@pytest.mark.parametrize("who", ["emp", "mgr"])
def test_non_admins_cannot_rename_folders(world, who):
    world.box["user"] = world.people[who]
    assert world.patch(f"/hr/document-folders/{world.root.id}", data={"name": "Mine"}).status_code == 403


def test_cannot_create_folder_under_another_orgs_parent(world):
    r = world.post("/hr/document-folders", data={"name": "Sneaky", "parent_id": str(world.foreign_folder.id)})
    assert r.status_code == 404


# ── P28 ──────────────────────────────────────────────────────────────────────

def test_exit_employee_is_scoped_to_the_callers_organization(world):
    from app.modules.employee.schema import ExitEmployeeRequest
    from app.modules.hr import service as hr_service

    data = ExitEmployeeRequest(employee_id=world.people["other"].id, exit_date=date.today(), exit_type="resigned",
                               final_settlement_date=date.today(), reason="x")
    with pytest.raises(NotFoundException):
        hr_service.exit_employee(world.db, data, organization_id=1)
    world.db.refresh(world.people["other"])
    assert world.people["other"].status == EmployeeStatus.ACTIVE


# ── P17: the employee-portal tabs list only the caller's own files, whatever their role ──────────────────────

def test_mine_limits_an_admin_to_their_own_files(world):
    own = HrDocument(title="Admin's passport", category=HrDocumentCategory.EMPLOYEE, status=HrDocumentStatus.APPROVED,
                     employee_id=world.people["admin"].id, uploaded_by=world.people["admin"].id, organization_id=1)
    uploaded_for_other = HrDocument(title="Uploaded for emp", category=HrDocumentCategory.EMPLOYEE,
                                    status=HrDocumentStatus.APPROVED, employee_id=world.people["emp"].id,
                                    uploaded_by=world.people["admin"].id, organization_id=1)
    world.db.add_all([own, uploaded_for_other])
    world.db.commit()

    everything = {d["title"] for d in world.get("/hr/documents", params={"category": "employee"}).json()}
    assert {"ID proof", "Admin's passport", "Uploaded for emp"} <= everything

    mine = {d["title"] for d in world.get("/hr/documents", params={"category": "employee", "mine": "true"}).json()}
    assert mine == {"Admin's passport"}


def test_mine_for_an_employee_matches_their_scope(world):
    world.box["user"] = world.people["emp"]
    titles = {d["title"] for d in world.get("/hr/documents", params={"category": "employee", "mine": "true"}).json()}
    assert titles == {"ID proof"}


# ── P6: pending approval items carry the employee ID so the queue can be searched by it ─────────────────────

def test_pending_items_carry_the_employee_id(world):
    world.people["emp"].employee_id = "EMP-0042"
    world.db.commit()
    world.box["user"] = world.people["hr"]
    items = world.get("/hr/documents/approvals/pending").json()
    assert items and items[0]["employee_id_str"] == "EMP-0042"
