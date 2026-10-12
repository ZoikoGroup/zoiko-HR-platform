"""ZHR-55: Work From Home is a real, requestable arrangement, and the Leave Dashboard counts it correctly."""

from datetime import date, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr import service
from app.modules.hr.models import LeaveBalance, LeaveType, Organization, OrganizationStatus, RequestStatus
from app.modules.hr.schemas import LeaveRequestCreate, LeaveRequestUpdate


@pytest.fixture(autouse=True)
def _no_email(monkeypatch):
    """Reviewing a request e-mails the employee; the real SMTP call would stall the test."""
    from app.services import email_service

    for name in ("send_leave_request_submitted", "send_leave_approved", "send_leave_rejected"):
        monkeypatch.setattr(email_service, name, lambda *a, **k: True)


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


def _emp(db, n, role=UserRole.EMPLOYEE):
    e = Employee(email=f"e{n}@example.com", hashed_password="x", employee_code=f"E-{n}", role=role, first_name="E", last_name=str(n), job_title="t",
                 employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=1)
    db.add(e)
    db.commit()
    return e


def _request(db, emp, kind, start=None, end=None, approve=True):
    start = start or date.today()
    end = end or start
    rec = service.create_leave_request(db, LeaveRequestCreate(employee_id=emp.id, leave_type=kind, start_date=start, end_date=end,
                                                              reason="because the reason is long enough"), org_id=1)
    if approve:
        service.review_leave_request(db, rec.id, LeaveRequestUpdate(status=RequestStatus.APPROVED), org_id=1, reviewer_id=emp.id)
    return rec


@pytest.mark.parametrize("label", ["Work From Home", "work from home", "work_from_home", "WORK FROM HOME"])
def test_every_spelling_the_forms_send_is_accepted(label):
    req = LeaveRequestCreate(employee_id=1, leave_type=label, start_date=date.today(), end_date=date.today(), reason="x" * 12)
    assert req.leave_type == LeaveType.WORK_FROM_HOME


def test_wfh_is_counted_on_its_own_not_as_leave(db):
    a, b, c = _emp(db, 1), _emp(db, 2), _emp(db, 3)
    _request(db, a, "work_from_home")
    _request(db, b, "annual")
    stats = service.get_leave_dashboard(db, 1)
    assert stats.wfh == 1
    assert stats.on_leave_today == 1  # only the annual leave
    assert stats.employee_count == 3


def test_wfh_days_are_not_leave_days(db):
    emp = _emp(db, 1)
    _request(db, emp, "work_from_home", end=date.today() + timedelta(days=4))  # 5 WFH days
    _request(db, emp, "annual", start=date.today() + timedelta(days=30), end=date.today() + timedelta(days=31))
    stats = service.get_leave_dashboard(db, 1)
    assert stats.total_days_taken == 2 and stats.approved_days_taken == 2
    assert stats.wfh == 1  # the annual leave is in the future, the WFH covers today


def test_people_are_counted_once_not_requests(db):
    emp = _emp(db, 1)
    _request(db, emp, "work_from_home")
    _request(db, emp, "work_from_home")
    _request(db, emp, "annual")
    _request(db, emp, "sick")
    stats = service.get_leave_dashboard(db, 1)
    assert stats.wfh == 1 and stats.on_leave_today == 1


def test_only_approved_wfh_covering_today_counts(db):
    emp1, emp2, emp3 = _emp(db, 1), _emp(db, 2), _emp(db, 3)
    _request(db, emp1, "work_from_home", approve=False)  # still pending
    _request(db, emp2, "work_from_home", start=date.today() + timedelta(days=3))  # not today
    _request(db, emp3, "work_from_home", start=date.today() - timedelta(days=1), end=date.today() + timedelta(days=1))
    assert service.get_leave_dashboard(db, 1).wfh == 1
    assert service.get_leave_dashboard(db, 1).pending_requests == 1


def test_a_wfh_request_never_touches_leave_balances(db):
    emp = _emp(db, 1)
    db.add(LeaveBalance(employee_id=emp.id, organization_id=1, leave_type=LeaveType.ANNUAL, year=date.today().year,
                        total_days=20, used_days=0, pending_days=0))
    db.commit()
    _request(db, emp, "work_from_home", end=date.today() + timedelta(days=2))
    bal = db.query(LeaveBalance).one()
    assert (bal.used_days, bal.pending_days) == (0, 0)


def test_other_organizations_are_not_counted(db):
    db.add(Organization(id=2, name="Globex", status=OrganizationStatus.ACTIVE))
    db.commit()
    other = Employee(email="o@example.com", hashed_password="x", employee_code="O-1", role=UserRole.EMPLOYEE, first_name="O", last_name="1", job_title="t",
                     employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=2)
    db.add(other)
    db.commit()
    rec = service.create_leave_request(db, LeaveRequestCreate(employee_id=other.id, leave_type="work_from_home", start_date=date.today(),
                                                              end_date=date.today(), reason="x" * 12), org_id=2)
    service.review_leave_request(db, rec.id, LeaveRequestUpdate(status=RequestStatus.APPROVED), org_id=2, reviewer_id=other.id)
    assert service.get_leave_dashboard(db, 1).wfh == 0
