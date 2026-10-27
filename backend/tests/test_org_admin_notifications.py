"""
tests/test_org_admin_notifications.py
-------------------------------------
Unit tests verifying that:
1. Action notifications sent via notify_org_admins target org_admins of the specific organization.
2. Employee admin / HR admin / Org admin can see the notification in their inbox.
3. Regular employees do NOT see org_admin-audience notifications.
4. Admins of different organizations do NOT see each other's notifications.
5. Unread count and mark-as-read behavior works as expected.
"""
from datetime import date, datetime, timezone
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.modules.employee.models import Employee, UserRole
from app.modules.hr.models import Organization
from app.modules.super_admin import notification_service as svc
from app.modules.super_admin.admin_notifications import notify_org_admins


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


def test_notify_org_admins_creates_and_scopes_correctly(db_session):
    now = datetime.now(timezone.utc)
    today = date.today()

    # 1. Create two test organizations
    org1 = Organization(id=1, name="Acme Corp")
    org2 = Organization(id=2, name="Beta Inc")
    db_session.add_all([org1, org2])
    db_session.commit()

    # 2. Create users:
    # - Org1 Admin (admin)
    # - Org1 HR Admin (hr_admin)
    # - Org1 Regular Employee (employee)
    # - Org2 Admin (admin)
    org1_admin = Employee(
        id=101, organization_id=1, email="admin@acme.com", hashed_password="pwd",
        employee_code="EMP101", first_name="Alice", last_name="Admin",
        job_title="Administrator", date_of_joining=today,
        role=UserRole.ADMIN, is_active=True, created_at=now
    )
    org1_hr = Employee(
        id=102, organization_id=1, email="hr@acme.com", hashed_password="pwd",
        employee_code="EMP102", first_name="Bob", last_name="HR",
        job_title="HR Admin", date_of_joining=today,
        role=UserRole.HR_ADMIN, is_active=True, created_at=now
    )
    org1_employee = Employee(
        id=103, organization_id=1, email="emp@acme.com", hashed_password="pwd",
        employee_code="EMP103", first_name="Charlie", last_name="Emp",
        job_title="Software Engineer", date_of_joining=today,
        role=UserRole.EMPLOYEE, is_active=True, created_at=now
    )
    org2_admin = Employee(
        id=201, organization_id=2, email="admin@beta.com", hashed_password="pwd",
        employee_code="EMP201", first_name="David", last_name="Admin",
        job_title="Administrator", date_of_joining=today,
        role=UserRole.ADMIN, is_active=True, created_at=now
    )
    db_session.add_all([org1_admin, org1_hr, org1_employee, org2_admin])
    db_session.commit()

    # Initially, all have 0 unread
    assert svc.unread_count(db_session, org1_admin) == 0
    assert svc.unread_count(db_session, org1_hr) == 0
    assert svc.unread_count(db_session, org1_employee) == 0
    assert svc.unread_count(db_session, org2_admin) == 0

    # 3. Trigger notify_org_admins for org 1
    n = notify_org_admins(
        db_session,
        org_id=1,
        title="Leave Request Approved",
        message="Charlie's leave request has been approved by Alice Admin.",
        notification_type="leave",
    )
    db_session.commit()

    # 4. Verify unread count:
    # Both org1_admin and org1_hr are org-admin roles in Org 1 -> should be 1
    assert svc.unread_count(db_session, org1_admin) == 1
    assert svc.unread_count(db_session, org1_hr) == 1

    # org1_employee is regular employee -> audience is org_admins -> should be 0
    assert svc.unread_count(db_session, org1_employee) == 0

    # org2_admin belongs to a different org -> should be 0
    assert svc.unread_count(db_session, org2_admin) == 0

    # 5. Verify list_for_user contents
    items, total = svc.list_for_user(db_session, org1_hr)
    assert total == 1
    assert items[0][0].title == "Leave Request Approved"
    assert items[0][0].notification_type == "leave"
    assert items[0][1] is False  # unread

    # 6. Mark read for org1_hr
    svc.set_read(db_session, org1_hr, n.id, True)
    assert svc.unread_count(db_session, org1_hr) == 0
    # org1_admin is independent recipient: still unread for org1_admin
    assert svc.unread_count(db_session, org1_admin) == 1

