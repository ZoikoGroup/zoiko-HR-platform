"""
tests/test_super_admin_user_delete.py
-------------------------------------
Super Admin User Management lists users platform-wide (GET /super-admin/users)
but deletes them through the org-scoped /hr/admin/users/{id}/hard-delete
endpoint. With a Super Admin's organization_id = NULL the org filter became
`organization_id IS NULL`, so deleting any real org user failed with
"User with id '<id>' not found".

Super Admin must now bypass the org filter (platform-wide), while org admins
keep strict tenant isolation.
"""

from datetime import date, datetime

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.core.exceptions import NotFoundException
from app.database import Base

import app.modules.hr.models  # noqa: F401
import app.modules.employee.models  # noqa: F401
import app.modules.billing.models  # noqa: F401
import app.modules.assistant.models  # noqa: F401
from app.modules.super_admin import models as SAM  # noqa: F401
from app.modules.super_admin import command_center_models  # noqa: F401

from app.modules.billing.models import BillingAuditAction, BillingAuditLog
from app.modules.employee import router as employee_router
from app.modules.employee.models import Employee, UserRole
from app.modules.hr.models import Organization, OrganizationStatus


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
        try:
            py = column.type.python_type
        except NotImplementedError:
            py = str
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


def _employee(code, email, role, org_id=None):
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
    )


def _org(code, name="Org"):
    return _fill(
        Organization,
        organization_name=name,
        organization_code=code,
        status=OrganizationStatus.ACTIVE,
        is_active=True,
    )


@pytest.fixture
def seeded(db):
    super_admin = _employee("SA1", "sa@example.com", UserRole.SUPER_ADMIN)
    org_a, org_b = _org("OA", "Org A"), _org("OB", "Org B")
    db.add_all([super_admin, org_a, org_b])
    db.flush()

    admin_a = _employee("AA1", "admin.a@example.com", UserRole.ADMIN, org_a.id)
    admin_b = _employee("AB1", "admin.b@example.com", UserRole.ADMIN, org_b.id)
    member_a = _employee("MA1", "member.a@example.com", UserRole.EMPLOYEE, org_a.id)
    db.add_all([admin_a, admin_b, member_a])
    db.flush()

    # References from modules outside the HR cleanup list — these are what made
    # the old hard-delete blow up with a FK violation.
    db.add_all([
        _fill(
            BillingAuditLog,
            actor_id=admin_b.id,
            action=BillingAuditAction.CONFIRMATION_TOKEN_CREATED,
        ),
        _fill(SAM.ApprovalHistory, organization_id=org_b.id, action="x", performed_by=admin_b.id),
    ])
    db.commit()
    return super_admin, org_a, org_b, admin_a, admin_b, member_a


def test_super_admin_can_delete_org_user(db, seeded):
    super_admin, org_a, org_b, admin_a, admin_b, _member_a = seeded
    admin_b_id, org_b_id = admin_b.id, org_b.id

    result = employee_router.hard_delete_user(
        admin_b_id, db=db, current_user=super_admin,
    )

    assert "permanently deleted" in result["message"].lower()
    assert db.query(Employee).filter_by(id=admin_b_id).first() is None
    assert db.query(Employee).filter_by(email="admin.a@example.com").first() is not None
    assert db.query(Employee).filter_by(email="sa@example.com").first() is not None
    assert db.query(Organization).filter_by(id=org_b_id).first() is not None
    assert db.query(BillingAuditLog).filter_by(actor_id=admin_b_id).count() == 0
    assert db.query(SAM.ApprovalHistory).filter_by(performed_by=admin_b_id).count() == 0


def test_org_admin_delete_stays_tenant_scoped(db, seeded):
    _super_admin, org_a, org_b, admin_a, admin_b, _member_a = seeded
    admin_b_id = admin_b.id

    # Org A admin must not be able to reach Org B's user.
    with pytest.raises(NotFoundException):
        employee_router.hard_delete_user(
            admin_b_id, db=db, current_user=admin_a,
        )
    assert db.query(Employee).filter_by(id=admin_b_id).first() is not None


def test_org_admin_can_delete_own_org_user(db, seeded):
    _super_admin, org_a, org_b, admin_a, admin_b, member_a = seeded
    member_a_id = member_a.id

    employee_router.hard_delete_user(member_a_id, db=db, current_user=admin_a)
    assert db.query(Employee).filter_by(id=member_a_id).first() is None
