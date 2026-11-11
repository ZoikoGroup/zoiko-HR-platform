"""A5 (QA report 10 Nov 2026): leave events produce in-app notifications for the right person, and only for them.

- approved / rejected  -> the requester sees it on /notifications (with a link to the request), the unread count goes up
- a new request        -> the approver (reporting manager) sees it
- withdrawn            -> the approver sees it
- another employee never sees any of it
- no leave reason / decision reason ever appears in notification text
"""
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.rate_limiter import limiter
from app.database import Base, get_db
from app.modules.hr.models import Organization, OrganizationStatus

SECRET_REASON = "Hospital appointment for my condition"
DECISION_REASON = "Team is short staffed that week"


@pytest.fixture(autouse=True)
def _no_rate_limit():
    """These tests post many leave requests; the per-minute limit would otherwise spill into later test files."""
    limiter.enabled = False
    yield
    limiter.enabled = True


@pytest.fixture
def env(monkeypatch):
    from app.main import app
    from app.core.dependencies import get_current_admin, get_current_user
    from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole

    for name in ("send_leave_request_submitted", "send_leave_approved", "send_leave_rejected"):
        monkeypatch.setattr(f"app.services.email_service.{name}", lambda *a, **k: True, raising=False)

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add_all([Organization(id=1, name="A", status=OrganizationStatus.ACTIVE), Organization(id=2, name="B", status=OrganizationStatus.ACTIVE)])
    s.commit()

    def person(code, role, org=1, manager=None, active=True):
        e = Employee(email=f"{code.lower()}@x.com", hashed_password="x", employee_code=code, role=role, first_name=code, last_name="Person",
                     job_title="t", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(),
                     organization_id=org, reporting_manager_id=manager, is_active=active)
        s.add(e)
        s.commit()
        return e

    admin = person("ADM", UserRole.ADMIN)
    manager = person("MGR", UserRole.MANAGER)
    emp = person("EMP", UserRole.EMPLOYEE, manager=manager.id)
    other = person("OTH", UserRole.EMPLOYEE, manager=manager.id)
    foreign_admin = person("FOR", UserRole.ADMIN, org=2)

    box = {"user": emp}
    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: box["user"]
    app.dependency_overrides[get_current_admin] = lambda: box["user"]
    c = TestClient(app, raise_server_exceptions=False)
    c.db, c.box = s, box
    c.admin, c.manager, c.emp, c.other, c.foreign_admin = admin, manager, emp, other, foreign_admin
    yield c
    for dep in (get_db, get_current_user, get_current_admin):
        app.dependency_overrides.pop(dep, None)
    s.close()
    engine.dispose()


def as_(env, who):
    env.box["user"] = who
    return env


def inbox(env, who):
    as_(env, who)
    r = env.get("/notifications")
    assert r.status_code == 200, r.text
    return r.json()


def apply(env, start=None, days=2):
    start = start or (date.today() + timedelta(days=7))
    as_(env, env.emp)
    r = env.post("/hr/leaves", json={"leave_type": "casual", "start_date": start.isoformat(),
                                     "end_date": (start + timedelta(days=days)).isoformat(), "reason": SECRET_REASON})
    assert r.status_code in (200, 201), r.text
    return r.json()


def review(env, leave_id, status):
    as_(env, env.admin)
    r = env.put(f"/hr/leaves/{leave_id}/review", json={"status": status, "decision_reason": DECISION_REASON})
    assert r.status_code == 200, r.text
    return r.json()


def _texts(box):
    return " ".join(f"{i['title']} {i['preview']}" for i in box["items"])


def test_A5_new_request_notifies_the_reporting_manager_only(env):
    leave = apply(env)
    mgr = inbox(env, env.manager)
    assert mgr["unread_count"] == 1
    item = mgr["items"][0]
    assert "New leave request from EMP Person awaiting your approval." in item["preview"]
    assert item["link"] == f"/zoiko-hr/leave/requests?request={leave['id']}"
    assert inbox(env, env.other)["items"] == []
    assert inbox(env, env.emp)["items"] == [], "the requester is not told about their own request"
    assert inbox(env, env.foreign_admin)["items"] == []


def test_A5_approval_notifies_the_requester_with_a_link_and_bumps_the_count(env):
    leave = apply(env, start=date(2031, 11, 12), days=2)
    before = inbox(env, env.emp)["unread_count"]
    review(env, leave["id"], "approved")
    box = inbox(env, env.emp)
    assert box["unread_count"] == before + 1
    item = box["items"][0]
    assert item["preview"] == "Your leave request for 12–14 Nov has been approved."
    assert item["notification_type"] == "leave"
    assert item["link"] == f"/employee/leaves?request={leave['id']}"
    as_(env, env.emp)
    assert env.get("/notifications/unread-count").json()["unread_count"] == before + 1


def test_A5_rejection_notifies_the_requester_without_any_reason(env):
    leave = apply(env, start=date(2031, 11, 12), days=2)
    review(env, leave["id"], "rejected")
    box = inbox(env, env.emp)
    assert box["items"][0]["preview"] == "Your leave request for 12–14 Nov was not approved."
    as_(env, env.emp)
    detail = env.get(f"/notifications/{box['items'][0]['id']}").json()
    blob = f"{_texts(box)} {detail}"
    assert SECRET_REASON not in blob and DECISION_REASON not in blob


def test_A5_other_employees_never_see_someone_elses_leave_notifications(env):
    leave = apply(env)
    review(env, leave["id"], "approved")
    assert inbox(env, env.other)["items"] == []
    assert inbox(env, env.foreign_admin)["items"] == []
    as_(env, env.other)
    mine = inbox(env, env.emp)["items"][0]["id"]
    as_(env, env.other)
    assert env.get(f"/notifications/{mine}").status_code == 404


def test_A5_withdrawing_a_request_notifies_the_approver(env):
    leave = apply(env)
    as_(env, env.emp)
    r = env.put(f"/hr/leaves/{leave['id']}", json={"status": "cancelled"})
    assert r.status_code == 200, r.text
    texts = _texts(inbox(env, env.manager))
    assert "EMP Person cancelled their leave request" in texts


def test_A5_no_leave_reason_appears_in_any_notification(env):
    leave = apply(env)
    review(env, leave["id"], "rejected")
    from app.modules.super_admin.models import Notification
    for n in env.db.query(Notification).all():
        assert SECRET_REASON not in (n.message or "") + (n.title or "")
        assert DECISION_REASON not in (n.message or "") + (n.title or "")


def test_A5_without_a_manager_hr_admins_are_the_approvers(env):
    env.emp.reporting_manager_id = None
    env.db.commit()
    apply(env)
    assert inbox(env, env.admin)["unread_count"] >= 1
    assert inbox(env, env.manager)["items"] == []


def test_A5_an_inactive_recipient_is_skipped_and_the_action_still_succeeds(env):
    env.manager.is_active = False
    env.db.commit()
    apply(env)                                          # no crash, no notification for the inactive manager
    from app.modules.super_admin.models import NotificationTarget
    assert not env.db.query(NotificationTarget).filter_by(kind="user", ref=str(env.manager.id)).count()


def test_A5_a_notification_failure_never_breaks_the_leave_action(env, monkeypatch):
    from app.modules.super_admin import admin_notifications

    def boom(*a, **k):
        raise RuntimeError("notification store down")
    monkeypatch.setattr(admin_notifications, "notify_users", boom)
    leave = apply(env)
    review(env, leave["id"], "approved")                # still 200


def test_A5_period_label_formats():
    from app.modules.hr.leave_notifications import period_label
    assert period_label(date(2026, 11, 12), date(2026, 11, 14)) == "12–14 Nov"
    assert period_label(date(2026, 11, 12), date(2026, 11, 12)) == "12 Nov"
    assert period_label(date(2026, 11, 30), date(2026, 12, 2)) == "30 Nov – 2 Dec"
    assert period_label(date(2026, 12, 30), date(2027, 1, 2)) == "30 Dec 2026 – 2 Jan 2027"
