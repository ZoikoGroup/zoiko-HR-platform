"""
tests/test_super_admin_org_delete.py
------------------------------------
Hard-delete of an organization from the Super Admin surface.

Regression coverage for two bugs:
  1. Only `rejected` organizations could be deleted. Any org status is now
     permanently deletable by a Super Admin (with a confirmation token).
  2. The delete only cleared a handful of billing tables, so leftover rows
     (approval history, attendance, departments, notifications, ...) held
     NOT NULL / nullable FKs on `organizations.id` and the hard delete blew
     up with an IntegrityError. `_teardown_organization` now walks the whole
     FK graph and purges org + members + every dependent row.
"""

from datetime import date, datetime

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.core.exceptions import BadRequestException
from app.database import Base

# Register every model module so `create_all` builds the complete schema.
import app.modules.hr.models  # noqa: F401
import app.modules.employee.models  # noqa: F401
import app.modules.billing.models  # noqa: F401
import app.modules.assistant.models  # noqa: F401
from app.modules.super_admin import models as SAM  # noqa: F401
from app.modules.super_admin import command_center_models  # noqa: F401

from app.modules.billing.delinquency_service import mint_confirmation_token
from app.modules.billing.models import ConfirmationTokenPurpose
from app.modules.employee.models import Employee, UserRole
from app.modules.hr.models import (
    AttendanceRecord,
    Department,
    Organization,
    OrganizationStatus,
)
from app.modules.super_admin.router import delete_organization


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_conn, _record):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()
    engine.dispose()


def _fill(model, **overrides):
    """Instantiate a model, satisfying every NOT NULL column without a default."""
    obj = model()
    for column in model.__table__.columns:
        if (
            column.name in overrides
            or column.primary_key
            or column.nullable
            or column.default is not None
            or column.server_default is not None
        ):
            continue
        py = column.type.python_type
        if py is str:
            value = "x"
        elif py is int:
            value = 1
        elif py is float:
            value = 1.0
        elif py is bool:
            value = True
        elif py is datetime:
            value = datetime.utcnow()
        elif py is date:
            value = date.today()
        else:
            value = "x"
        setattr(obj, column.name, value)
    for key, value in overrides.items():
        setattr(obj, key, value)
    return obj


def _employee(code, email, role, org_id=None, dept_id=None):
    return _fill(
        Employee,
        email=email,
        hashed_password="x",
        first_name="F",
        last_name="L",
        job_title="Engineer",
        employee_code=code,
        role=role,
        organization_id=org_id,
        department_id=dept_id,
    )


def _seed(db):
    super_admin = _employee("SA1", "sa@example.com", UserRole.SUPER_ADMIN)
    db.add(super_admin)
    db.flush()

    target = _fill(
        Organization,
        organization_name="Target Org",
        organization_code="TGT",
        status=OrganizationStatus.ACTIVE,
        is_active=True,
    )
    other = _fill(
        Organization,
        organization_name="Other Org",
        organization_code="OTH",
        status=OrganizationStatus.ACTIVE,
        is_active=True,
    )
    db.add_all([target, other])
    db.flush()

    tgt_dept = _fill(Department, organization_id=target.id, name="Eng", code="ENG")
    other_dept = _fill(Department, organization_id=other.id, name="Ops", code="OPS")
    db.add_all([tgt_dept, other_dept])
    db.flush()

    member = _employee("M1", "m1@example.com", UserRole.ADMIN, target.id, tgt_dept.id)
    keeper = _employee("M2", "m2@example.com", UserRole.EMPLOYEE, other.id, other_dept.id)
    db.add_all([member, keeper])
    db.flush()

    # Close the departments/employees/organizations FK cycle on purpose.
    tgt_dept.head = member.id
    target.approved_by = member.id
    db.flush()

    db.add_all(
        [
            _fill(AttendanceRecord, organization_id=target.id, employee_id=member.id, date=date(2026, 1, 1)),
            _fill(AttendanceRecord, organization_id=other.id, employee_id=keeper.id, date=date(2026, 1, 1)),
            SAM.ApprovalHistory(organization_id=target.id, action="status_change", performed_by=member.id),
            SAM.ApprovalHistory(organization_id=other.id, action="status_change", performed_by=keeper.id),
            SAM.Notification(title="n", message="m", target_org_id=target.id),
        ]
    )
    db.commit()
    return super_admin, target, other, member, keeper, tgt_dept, other_dept


def _delete(db, super_admin, org_id):
    token, raw = mint_confirmation_token(
        db,
        organization_id=org_id,
        purpose=ConfirmationTokenPurpose.DELETE_ORGANIZATION,
        actor_id=super_admin.id,
        actor_email=super_admin.email,
    )
    return delete_organization(
        org_id,
        x_confirmation_id=str(token.id),
        x_confirmation_token=raw,
        db=db,
        current_user=super_admin,
    )


def test_delete_active_org_purges_org_members_and_dependents(db):
    super_admin, target, other, member, keeper, tgt_dept, other_dept = _seed(db)
    super_admin_id = super_admin.id
    target_id, other_id = target.id, other.id
    member_id, keeper_id = member.id, keeper.id
    tgt_dept_id, other_dept_id = tgt_dept.id, other_dept.id

    result = _delete(db, super_admin, target_id)

    assert "permanently deleted" in result["message"].lower()

    # Target org and everything scoped to it is gone.
    assert db.query(Organization).filter_by(id=target_id).first() is None
    assert db.query(Employee).filter_by(id=member_id).first() is None
    assert db.query(Department).filter_by(id=tgt_dept_id).first() is None
    assert db.query(SAM.ApprovalHistory).filter_by(organization_id=target_id).count() == 0
    assert (
        db.query(AttendanceRecord).filter(AttendanceRecord.organization_id == target_id).count() == 0
    )
    assert db.query(SAM.Notification).filter(SAM.Notification.target_org_id == target_id).count() == 0

    # Unrelated org, its member, department and rows survive untouched.
    assert db.query(Organization).filter_by(id=other_id).first() is not None
    assert db.query(Employee).filter_by(id=keeper_id).first() is not None
    assert db.query(Department).filter_by(id=other_dept_id).first() is not None
    assert db.query(SAM.ApprovalHistory).filter_by(organization_id=other_id).count() == 1
    assert db.query(Employee).filter_by(id=super_admin_id).first() is not None


def test_delete_requires_confirmation_token(db):
    super_admin, target, *_ = _seed(db)

    with pytest.raises(BadRequestException):
        delete_organization(
            target.id,
            x_confirmation_id=None,
            x_confirmation_token=None,
            db=db,
            current_user=super_admin,
        )
