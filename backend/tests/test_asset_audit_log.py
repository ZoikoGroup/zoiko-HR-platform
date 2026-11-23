"""QA R1-19 / R1-20: creating, editing and deleting an asset each leave a row in the audit ledger.

Edit and delete themselves (validation, refusal while assigned, soft delete) are covered by the A12 asset work; this
file only checks that those changes are audit-logged, with the editor's diff and the actor recorded.
"""
from datetime import date
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.exceptions import ZoikoException
from app.database import Base
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr import asset_service
from app.modules.hr.models import Asset, AssetStatus, Organization, OrganizationStatus
from app.modules.hr.schemas import AssetCreate, AssetUpdate
from app.modules.super_admin.models import AuditLog


@pytest.fixture
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine)()
    yield s
    s.close()
    engine.dispose()


@pytest.fixture
def org(db):
    o = Organization(organization_name="Alpha", status=OrganizationStatus.ACTIVE)
    db.add(o)
    db.flush()
    admin = Employee(email="hr@a.example", hashed_password="x", employee_code="A001", role=UserRole.HR_ADMIN,
                     first_name="Ada", last_name="Admin", job_title="HR", employment_type=EmploymentType.FULL_TIME,
                     status=EmployeeStatus.ACTIVE, is_active=True, date_of_joining=date(2024, 1, 1), organization_id=o.id)
    db.add(admin)
    db.commit()
    return SimpleNamespace(id=o.id, admin=admin)


def _rows(db, action_type):
    return db.query(AuditLog).filter(AuditLog.action_type == action_type).all()


def test_create_edit_and_delete_are_audit_logged(db, org):
    asset = asset_service.create_asset(db, AssetCreate(name="Laptop", asset_tag="LT-1"), organization_id=org.id,
                                       created_by=org.admin.id)
    assert len(_rows(db, "asset.created")) == 1

    asset_service.update_asset(db, asset.id, AssetUpdate(name="Laptop Pro"), updated_by=org.admin.id,
                               organization_id=org.id)
    updated = _rows(db, "asset.updated")
    assert len(updated) == 1
    assert "Laptop Pro" in str(updated[0].changes)

    asset_service.delete_asset(db, asset.id, org.id, deleted_by=org.admin.id)
    deleted = _rows(db, "asset.deleted")
    assert len(deleted) == 1
    assert deleted[0].organization_id == org.id
    assert db.get(Asset, asset.id).deleted_at is not None          # soft delete: the row stays for its history


def test_an_edit_that_changes_nothing_writes_no_row(db, org):
    asset = asset_service.create_asset(db, AssetCreate(name="Laptop", asset_tag="LT-2"), organization_id=org.id,
                                       created_by=org.admin.id)
    asset_service.update_asset(db, asset.id, AssetUpdate(name="Laptop"), updated_by=org.admin.id, organization_id=org.id)
    assert _rows(db, "asset.updated") == []


def test_a_refused_delete_of_an_assigned_asset_is_not_logged(db, org):
    asset = asset_service.create_asset(db, AssetCreate(name="Phone", asset_tag="PH-1", employee_id=org.admin.id),
                                       organization_id=org.id, created_by=org.admin.id)
    assert asset.status == AssetStatus.ASSIGNED
    with pytest.raises(ZoikoException):
        asset_service.delete_asset(db, asset.id, org.id, deleted_by=org.admin.id)
    assert _rows(db, "asset.deleted") == []
    assert db.get(Asset, asset.id).deleted_at is None
