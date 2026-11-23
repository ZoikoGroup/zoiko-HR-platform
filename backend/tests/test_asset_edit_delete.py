"""QA R1-19 / R1-20: editing and deleting assets.

Edit shares the create rules (name and tag required and trimmed, tag unique per organization among assets that are not
deleted, employee in the organization) and never changes who holds an asset. Delete is a soft delete, refused while the
asset is assigned, and both are written to the audit ledger.
"""
from datetime import date
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.exceptions import BadRequestException, NotFoundException, ZoikoException
from app.database import Base
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr import asset_service
from app.modules.hr.models import (Asset, AssetMaintenanceRequest, AssetStatus, MaintenanceStatus, Organization,
                                   OrganizationStatus)
from app.modules.hr.schemas import AssetCreate, AssetUpdate
from app.modules.super_admin.models import AuditAction, AuditLog


@pytest.fixture
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine)()
    yield s
    s.close()
    engine.dispose()


@pytest.fixture
def orgs(db):
    a = Organization(organization_name="Alpha", status=OrganizationStatus.ACTIVE)
    b = Organization(organization_name="Beta", status=OrganizationStatus.ACTIVE)
    db.add_all([a, b])
    db.flush()
    people = {}
    for org, tag in ((a, "a"), (b, "b")):
        e = Employee(email=f"hr@{tag}.example", hashed_password="x", employee_code=f"{tag.upper()}001", role=UserRole.HR_ADMIN,
                     first_name=tag, last_name="Admin", job_title="HR", employment_type=EmploymentType.FULL_TIME,
                     status=EmployeeStatus.ACTIVE, is_active=True, date_of_joining=date(2024, 1, 1), organization_id=org.id)
        db.add(e)
        db.flush()
        people[tag] = e
    db.commit()
    return SimpleNamespace(a=a.id, b=b.id, admin_a=people["a"], admin_b=people["b"])


def _make(db, orgs, tag="LT-1", name="Laptop", org=None, **kw):
    return asset_service.create_asset(db, AssetCreate(name=name, asset_tag=tag, **kw), organization_id=org or orgs.a,
                                      actor=orgs.admin_a)


def _audit(db, action_type):
    return db.query(AuditLog).filter(AuditLog.action_type == action_type).all()


# ── R1-20 edit ──────────────────────────────────────────────────────────────

def test_edit_changes_name_tag_category_and_other_fields_and_is_audited(db, orgs):
    asset = _make(db, orgs, category="Laptops")
    updated = asset_service.update_asset(
        db, asset.id, AssetUpdate(name="  Laptop Pro ", asset_tag=" LT-9 ", category="Monitors", serial_number="SN1",
                                  condition="good", status="maintenance", purchase_cost=10, notes="n"),
        organization_id=orgs.a, actor=orgs.admin_a)
    assert (updated.name, updated.asset_tag, updated.category, updated.serial_number) == ("Laptop Pro", "LT-9", "Monitors", "SN1")
    assert updated.status == AssetStatus.MAINTENANCE
    rows = _audit(db, "asset.updated")
    assert len(rows) == 1 and rows[0].action == AuditAction.UPDATE and rows[0].entity_type == "Asset"
    assert rows[0].organization_id == orgs.a and rows[0].entity_id == asset.id
    changed = {c["field"]: (c["before"], c["after"]) for c in rows[0].changes}
    assert changed["name"] == ("Laptop", "Laptop Pro") and changed["asset_tag"] == ("LT-1", "LT-9")


def test_edit_uses_the_create_rules(db, orgs):
    _make(db, orgs, tag="LT-1")
    other = _make(db, orgs, tag="LT-2")
    with pytest.raises(ZoikoException) as exc:
        asset_service.update_asset(db, other.id, AssetUpdate(asset_tag="LT-1"), organization_id=orgs.a)
    assert exc.value.status_code == 409
    with pytest.raises(ZoikoException):
        asset_service.update_asset(db, other.id, AssetUpdate(asset_tag=" LT-1 "), organization_id=orgs.a)   # trimmed first
    for blank in (AssetUpdate(name="   "), AssetUpdate(asset_tag="   ")):
        with pytest.raises(BadRequestException):
            asset_service.update_asset(db, other.id, blank, organization_id=orgs.a)
    # the same tag in another organization is fine, and keeping your own tag is fine
    _make(db, orgs, tag="LT-1", org=orgs.b)
    assert asset_service.update_asset(db, other.id, AssetUpdate(asset_tag="LT-2", name="X"), organization_id=orgs.a).name == "X"


def test_create_trims_and_refuses_assigned_without_an_employee(db, orgs):
    asset = _make(db, orgs, tag="  LT-7 ", name=" Phone ")
    assert (asset.asset_tag, asset.name) == ("LT-7", "Phone")
    with pytest.raises(ZoikoException):
        _make(db, orgs, tag="LT-7 ")
    with pytest.raises(BadRequestException):
        _make(db, orgs, tag="LT-8", status="assigned")
    assert len(_audit(db, "asset.created")) == 1


def test_edit_does_not_change_who_holds_the_asset(db, orgs):
    asset = _make(db, orgs)
    with pytest.raises(BadRequestException):
        asset_service.update_asset(db, asset.id, AssetUpdate(status="assigned"), organization_id=orgs.a)
    with pytest.raises(BadRequestException):
        asset_service.update_asset(db, asset.id, AssetUpdate(employee_id=orgs.admin_a.id), organization_id=orgs.a)
    asset_service.assign_asset(db, asset.id, orgs.admin_a.id, assigned_by=orgs.admin_a.id, organization_id=orgs.a)
    for change in (AssetUpdate(employee_id=None), AssetUpdate(status="available")):
        with pytest.raises(BadRequestException):
            asset_service.update_asset(db, asset.id, change, organization_id=orgs.a)
    # editing what the asset is, while sending its current holder and status back, is fine
    ok = asset_service.update_asset(db, asset.id, AssetUpdate(name="Renamed", status="assigned", employee_id=orgs.admin_a.id),
                                    organization_id=orgs.a)
    assert ok.name == "Renamed" and ok.employee_id == orgs.admin_a.id


def test_edit_and_delete_stay_inside_the_organization(db, orgs):
    theirs = _make(db, orgs, org=orgs.b)
    with pytest.raises(NotFoundException):
        asset_service.update_asset(db, theirs.id, AssetUpdate(name="Hacked"), organization_id=orgs.a)
    with pytest.raises(NotFoundException):
        asset_service.delete_asset(db, theirs.id, organization_id=orgs.a)
    db.refresh(theirs)
    assert theirs.name == "Laptop" and theirs.deleted_at is None


# ── R1-19 delete ────────────────────────────────────────────────────────────

def test_delete_is_soft_hidden_from_lists_and_counts_frees_the_tag_and_is_audited(db, orgs):
    keep = _make(db, orgs, tag="LT-1")
    gone = _make(db, orgs, tag="LT-2")
    db.add(AssetMaintenanceRequest(asset_id=gone.id, issue="x", reported_on=date(2026, 1, 1), status=MaintenanceStatus.OPEN,
                                   organization_id=orgs.a))
    db.commit()
    assert asset_service.get_asset_dashboard(db, orgs.a)["open_maintenance"] == 1

    asset_service.delete_asset(db, gone.id, organization_id=orgs.a, actor=orgs.admin_a)

    row = db.get(Asset, gone.id)
    assert row is not None and row.deleted_at is not None                     # history kept
    listed = asset_service.get_assets(db, organization_id=orgs.a)
    assert [i["id"] for i in listed["items"]] == [keep.id] and listed["total"] == 1
    dash = asset_service.get_asset_dashboard(db, orgs.a)
    assert dash["total_assets"] == 1 and dash["available_count"] == 1 and dash["open_maintenance"] == 0
    with pytest.raises(NotFoundException):
        asset_service.get_asset_by_id(db, gone.id, orgs.a)
    assert "LT-2" not in asset_service.export_assets_csv(db, organization_id=orgs.a)
    _make(db, orgs, tag="LT-2")                                               # the tag can be used again
    rows = _audit(db, "asset.deleted")
    assert len(rows) == 1 and rows[0].action == AuditAction.DELETE and rows[0].entity_id == gone.id
    assert rows[0].performed_by == orgs.admin_a.id and "LT-2" in rows[0].target_label


def test_an_assigned_asset_cannot_be_deleted_until_it_is_returned(db, orgs):
    asset = _make(db, orgs)
    asset_service.assign_asset(db, asset.id, orgs.admin_a.id, assigned_by=orgs.admin_a.id, organization_id=orgs.a)
    with pytest.raises(ZoikoException) as exc:
        asset_service.delete_asset(db, asset.id, organization_id=orgs.a, actor=orgs.admin_a)
    assert exc.value.status_code == 409 and exc.value.error_code == "ASSET_ASSIGNED"
    db.refresh(asset)
    assert asset.deleted_at is None and not _audit(db, "asset.deleted")
    asset_service.return_asset(db, asset.id, "done", organization_id=orgs.a)
    asset_service.delete_asset(db, asset.id, organization_id=orgs.a, actor=orgs.admin_a)
    assert db.get(Asset, asset.id).deleted_at is not None
