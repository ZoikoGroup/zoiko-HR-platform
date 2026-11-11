"""A5: the other HR decisions employees expect to hear about reach them in-app, scoped to them, without amounts or reasons."""
from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.modules.hr.models import Organization, OrganizationStatus


@pytest.fixture
def db():
    import app.main  # noqa: F401  (registers every model)
    from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add_all([Organization(id=1, name="A", status=OrganizationStatus.ACTIVE), Organization(id=2, name="B", status=OrganizationStatus.ACTIVE)])
    s.commit()
    people = {}
    for code, role, org in (("EMP", UserRole.EMPLOYEE, 1), ("OTH", UserRole.EMPLOYEE, 1), ("ADM", UserRole.ADMIN, 1), ("FOR", UserRole.EMPLOYEE, 2)):
        e = Employee(email=f"{code.lower()}@x.com", hashed_password="x", employee_code=code, role=role, first_name=code, last_name="P",
                     job_title="t", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(),
                     organization_id=org)
        s.add(e)
        s.commit()
        people[code] = e
    s.people = people
    yield s
    s.close()
    engine.dispose()


def inbox(db, who):
    from app.modules.super_admin import notification_service as svc
    rows, _ = svc.list_for_user(db, who)
    return [n for n, _read in rows]


def test_A5_notify_employee_reaches_only_that_employee(db):
    from app.modules.hr.hr_notifications import notify_employee
    p = db.people
    notify_employee(db, 1, p["EMP"].id, "overtime.approved", date=date(2026, 11, 12), link="/employee/ess/time-requests")
    mine = inbox(db, p["EMP"])
    assert [n.message for n in mine] == ["Your overtime request for 12 Nov 2026 has been approved."]
    assert mine[0].link == "/employee/ess/time-requests"
    assert inbox(db, p["OTH"]) == [] and inbox(db, p["ADM"]) == [] and inbox(db, p["FOR"]) == []


def test_A5_an_employee_of_another_org_is_never_a_recipient(db):
    from app.modules.hr.hr_notifications import notify_employee
    notify_employee(db, 1, db.people["FOR"].id, "expense.approved")
    assert inbox(db, db.people["FOR"]) == []


def test_A5_external_links_are_dropped(db):
    from app.modules.super_admin.admin_notifications import notify_users
    n = notify_users(db, org_id=1, user_ids=[db.people["EMP"].id], title="t", message="m", link="https://evil.example/x")
    assert n.link is None


def test_A5_travel_expense_reimbursed_notifies_without_amount(db):
    from app.modules.hr import service
    from app.modules.hr.models import RequestStatus, TravelExpense
    e = TravelExpense(organization_id=1, employee_id=db.people["EMP"].id, expense_type="Taxi", amount=Decimal("1234.56"),
                      status=RequestStatus.APPROVED)
    db.add(e)
    db.commit()
    service.review_travel_expense(db, e.id, 1, RequestStatus.COMPLETED, db.people["ADM"].id)
    [n] = inbox(db, db.people["EMP"])
    assert n.title == "Expense claim reimbursed" and "1234" not in n.message and n.link == "/employee/travel/expenses"


def test_A5_travel_request_decision_notifies_the_traveller(db):
    from app.modules.hr import service
    from app.modules.hr.models import RequestStatus, TravelRequest
    from app.modules.hr.schemas import TravelRequestUpdate
    t = TravelRequest(organization_id=1, employee_id=db.people["EMP"].id, destination="Pune", purpose="Client",
                      start_date=date.today() + timedelta(days=5), end_date=date.today() + timedelta(days=6), status=RequestStatus.PENDING)
    db.add(t)
    db.commit()
    service.update_travel_request(db, t.id, TravelRequestUpdate(status=RequestStatus.REJECTED), organization_id=1)
    [n] = inbox(db, db.people["EMP"])
    assert n.message == "Your travel request was not approved." and n.link == "/employee/travel/requests"
    assert inbox(db, db.people["OTH"]) == []


def test_A5_onboarding_task_assignees_are_notified_in_app(db, monkeypatch):
    from app.modules.hr import onboarding_flow
    from app.modules.hr.models import OnboardingChecklistItem, OnboardingNewHire
    monkeypatch.setattr("app.services.email_service.send_onboarding_task_assigned", lambda *a, **k: True, raising=False)
    hire = OnboardingNewHire(id=7, organization_id=1, candidate_name="Ann", email="ann@a.com", position="Dev")
    db.add(hire)
    db.commit()
    item = OnboardingChecklistItem(title="Prepare laptop", assignee_employee_id=db.people["OTH"].id, organization_id=1)
    onboarding_flow.notify_task_assignees(db, hire, [item])
    [n] = inbox(db, db.people["OTH"])
    assert n.title == "Onboarding tasks assigned" and n.link == "/zoiko-hr/onboarding/checklists"
    assert inbox(db, db.people["EMP"]) == []


def test_A5_issued_document_notice_links_to_it_and_names_only_the_number(db):
    from types import SimpleNamespace
    from app.modules.doc_templates.golive import notify_in_app
    doc = SimpleNamespace(id=42, organization_id=1, document_number="ZHR-2026-0042", execution_mode="NONE",
                          title="Salary revision letter - INR 12,00,000")
    notify_in_app(db, doc, db.people["EMP"])
    [n] = inbox(db, db.people["EMP"])
    assert n.title == "New document available"
    assert "ZHR-2026-0042" in n.message and "Salary" not in n.message and "12,00,000" not in n.message
    assert n.link == "/employee/documents/company?generated=42"
    sign = SimpleNamespace(id=43, organization_id=1, document_number="ZHR-2026-0043", execution_mode="SIGN_EMPLOYEE", title="x")
    notify_in_app(db, sign, db.people["EMP"])
    assert any(n.title == "Document to sign" for n in inbox(db, db.people["EMP"]))


def test_A5_a_failing_store_never_raises(db, monkeypatch):
    from app.modules.hr import hr_notifications
    from app.modules.super_admin import admin_notifications
    monkeypatch.setattr(admin_notifications, "notify_users", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("down")))
    hr_notifications.notify_employee(db, 1, db.people["EMP"].id, "travel.approved")   # logged, not raised


def test_A5_messages_never_carry_reasons_or_amounts():
    from app.modules.hr.hr_notifications import EVENTS
    for kind, title, message in EVENTS.values():
        assert "{reason" not in message and "{amount" not in message
