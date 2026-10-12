"""ZHR-91/ZHR-93: applying leave stores the right type, and every applied request shows up in the history list."""

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.modules.hr.models import Organization, OrganizationStatus

URL = "/hr/leaves"


@pytest.fixture
def env(tmp_path, monkeypatch):
    from app.main import app
    from app.core.dependencies import get_current_admin, get_current_user
    from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole

    monkeypatch.setattr("app.services.email_service.send_leave_request_submitted", lambda *a, **k: True, raising=False)

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add(Organization(id=1, name="A", status=OrganizationStatus.ACTIVE))
    s.commit()

    emp = Employee(email="e@x.com", hashed_password="x", employee_code="E1", role=UserRole.EMPLOYEE,
                   first_name="E", last_name="1", job_title="t", employment_type=EmploymentType.FULL_TIME,
                   status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=1)
    admin = Employee(email="a@x.com", hashed_password="x", employee_code="A1", role=UserRole.ADMIN,
                     first_name="A", last_name="1", job_title="t", employment_type=EmploymentType.FULL_TIME,
                     status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=1)
    s.add_all([emp, admin])
    s.commit()

    box = {"user": emp}
    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: box["user"]
    app.dependency_overrides[get_current_admin] = lambda: box["user"]
    c = TestClient(app, raise_server_exceptions=False)
    c.db, c.box, c.emp, c.admin = s, box, emp, admin
    yield c
    for dep in (get_db, get_current_user, get_current_admin):
        app.dependency_overrides.pop(dep, None)
    s.close()
    engine.dispose()


def apply(env, kind, start, end=None, reason="Reason long enough for the form"):
    return env.post(URL, json={"leave_type": kind, "start_date": start.isoformat(),
                               "end_date": (end or start).isoformat(), "reason": reason})


def test_two_applied_leaves_both_appear_in_history(env):
    assert apply(env, "Sick Leave", date.today()).status_code in (200, 201)
    assert apply(env, "Casual Leave", date.today() + timedelta(days=10)).status_code in (200, 201)

    rows = env.get(f"{URL}?employee_id={env.emp.id}").json()
    assert len(rows) == 2, rows
    assert {r["leave_type"] for r in rows} == {"sick", "casual"}


def test_every_application_is_stored_with_the_type_the_form_sent(env):
    for n, (label, key) in enumerate((("Sick Leave", "sick"), ("Casual Leave", "casual"), ("Annual Leave", "annual"))):
        r = apply(env, label, date.today() + timedelta(days=20 + n * 3))
        assert r.status_code in (200, 201), r.text
        assert r.json()["leave_type"] == key

    rows = env.get(f"{URL}?employee_id={env.emp.id}").json()
    assert [r["leave_type"] for r in rows] == ["annual", "casual", "sick"]  # newest first


def test_history_is_newest_first_and_carries_the_fields_the_pages_render(env):
    first = apply(env, "sick", date.today()).json()
    second = apply(env, "casual", date.today() + timedelta(days=5)).json()
    rows = env.get(f"{URL}?employee_id={env.emp.id}").json()
    assert [r["id"] for r in rows] == [second["id"], first["id"]]
    for row in rows:
        for field in ("id", "leave_type", "start_date", "end_date", "days", "status", "created_at"):
            assert row[field] is not None, field


def test_an_employee_only_sees_their_own_requests(env):
    other = env.db.query(type(env.emp)).filter_by(email="other@x.com").first()
    if other is None:
        from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole

        other = Employee(email="other@x.com", hashed_password="x", employee_code="E2", role=UserRole.EMPLOYEE,
                         first_name="O", last_name="2", job_title="t", employment_type=EmploymentType.FULL_TIME,
                         status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=1)
        env.db.add(other)
        env.db.commit()

    apply(env, "sick", date.today())
    env.box["user"] = other
    assert apply(env, "casual", date.today() + timedelta(days=3)).status_code in (200, 201)

    rows = env.get(URL).json()  # employee role forces the filter to the caller
    assert len(rows) == 1 and rows[0]["employee_id"] == other.id


# ── the application itself is checked
def _msg(r):
    assert r.status_code == 400, r.text
    return r.text


def test_bad_applications_are_refused_with_a_clear_message(env):
    t = date.today()
    assert "before the start date" in _msg(apply(env, "sick", t + timedelta(days=3), t + timedelta(days=1)))
    assert "in the past" in _msg(apply(env, "sick", t - timedelta(days=2)))
    assert "at least 10 characters" in _msg(apply(env, "sick", t + timedelta(days=1), reason="flu"))
    assert env.get(f"{URL}?employee_id={env.emp.id}").json() == []


def test_overlapping_requests_are_refused_but_back_to_back_ones_are_fine(env):
    t = date.today()
    assert apply(env, "sick", t + timedelta(days=5), t + timedelta(days=7)).status_code == 201
    assert "overlaps" in _msg(apply(env, "casual", t + timedelta(days=7), t + timedelta(days=9)))
    assert apply(env, "casual", t + timedelta(days=8), t + timedelta(days=9)).status_code == 201
    assert len(env.get(f"{URL}?employee_id={env.emp.id}").json()) == 2


def test_more_days_than_the_balance_is_refused_and_a_rejected_request_frees_the_dates(env):
    from app.modules.hr.models import LeaveBalance, LeaveType
    t = date.today()
    env.db.add(LeaveBalance(employee_id=env.emp.id, organization_id=1, leave_type=LeaveType.SICK, total_days=2, used_days=0, pending_days=0, year=(t + timedelta(days=10)).year))
    env.db.commit()
    assert "only 2 day(s) are left" in _msg(apply(env, "sick", t + timedelta(days=10), t + timedelta(days=12)))
    first = apply(env, "sick", t + timedelta(days=10), t + timedelta(days=11))
    assert first.status_code == 201
    assert "only 0 day(s) are left" in _msg(apply(env, "sick", t + timedelta(days=20)))
    assert apply(env, "unpaid", t + timedelta(days=20)).status_code == 201        # unpaid leave has no balance to run out of


def test_an_employee_cannot_apply_in_someone_elses_name(env):
    t = date.today()
    r = env.post(URL, json={"employee_id": env.admin.id, "leave_type": "sick", "start_date": t.isoformat(), "end_date": t.isoformat(), "reason": "A proper reason here"})
    assert r.status_code == 201 and r.json()["employee_id"] == env.emp.id


# ── ZHR-97: an approval shows up for the employee
def _approve(env, leave_id, status="approved"):
    who = env.box["user"]
    env.box["user"] = env.admin
    r = env.put(f"{URL}/{leave_id}/review", json={"status": status})
    env.box["user"] = who
    return r


def test_after_approval_the_employee_sees_approved_and_the_balance_moves(env):
    from app.modules.hr.models import LeaveBalance, LeaveType
    t = date.today() + timedelta(days=4)
    env.db.add(LeaveBalance(employee_id=env.emp.id, organization_id=1, leave_type=LeaveType.SICK, total_days=10, used_days=0, pending_days=0, year=t.year))
    env.db.commit()
    made = apply(env, "sick", t, t + timedelta(days=1)).json()
    bal = env.db.query(LeaveBalance).one()
    assert (bal.pending_days, bal.used_days) == (2, 0)
    assert _approve(env, made["id"]).status_code == 200
    rows = env.get(f"{URL}?employee_id={env.emp.id}").json()
    assert [(r["id"], r["status"]) for r in rows] == [(made["id"], "approved")]
    assert rows[0]["approval_date"] is not None
    env.db.refresh(bal)
    assert (bal.pending_days, bal.used_days) == (0, 2)


def test_a_decided_request_cannot_be_decided_again(env):
    from app.modules.hr.models import LeaveBalance, LeaveType
    t = date.today() + timedelta(days=4)
    env.db.add(LeaveBalance(employee_id=env.emp.id, organization_id=1, leave_type=LeaveType.SICK, total_days=10, used_days=0, pending_days=0, year=t.year))
    env.db.commit()
    made = apply(env, "sick", t).json()
    assert _approve(env, made["id"]).status_code == 200
    again = _approve(env, made["id"])
    assert again.status_code == 400 and "already approved" in again.text
    assert _approve(env, made["id"], "rejected").status_code == 400
    assert _approve(env, apply(env, "casual", date.today() + timedelta(days=30)).json()["id"], "pending").status_code == 400      # a review decides
    bal = env.db.query(LeaveBalance).one()
    assert (bal.pending_days, bal.used_days) == (0, 1)               # counted once, not twice


def test_an_employee_cannot_approve_edit_or_delete_other_peoples_leave(env):
    from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
    other = Employee(email="o2@x.com", hashed_password="x", employee_code="E7", role=UserRole.EMPLOYEE, first_name="O", last_name="7", job_title="t",
                     employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=1)
    env.db.add(other)
    env.db.commit()
    t = date.today() + timedelta(days=6)
    mine = apply(env, "sick", t).json()
    env.box["user"] = other
    theirs = apply(env, "casual", t + timedelta(days=10)).json()
    # the other employee reaches for my request, and for their own approval
    assert env.put(f"{URL}/{mine['id']}", json={"status": "approved"}).status_code == 404
    assert env.delete(f"{URL}/{mine['id']}").status_code == 404
    assert env.put(f"{URL}/{theirs['id']}", json={"status": "approved"}).status_code == 400
    assert env.get(f"{URL}/{mine['id']}").status_code == 404


def test_withdrawing_a_pending_request_frees_the_balance_and_a_decided_one_is_locked(env):
    from app.modules.hr.models import LeaveBalance, LeaveType
    t = date.today() + timedelta(days=4)
    env.db.add(LeaveBalance(employee_id=env.emp.id, organization_id=1, leave_type=LeaveType.SICK, total_days=10, used_days=0, pending_days=0, year=t.year))
    env.db.commit()
    first = apply(env, "sick", t, t + timedelta(days=1)).json()
    assert env.put(f"{URL}/{first['id']}", json={"status": "cancelled"}).status_code == 200
    bal = env.db.query(LeaveBalance).one()
    assert bal.pending_days == 0
    second = apply(env, "sick", t).json()
    _approve(env, second["id"])
    assert env.delete(f"{URL}/{second['id']}").status_code == 400
    assert env.put(f"{URL}/{second['id']}", json={"status": "cancelled"}).status_code == 400


# ── ZHR-99: the approver's name is shown
def test_an_approved_request_carries_the_approvers_name_and_date(env):
    t = date.today() + timedelta(days=4)
    made = apply(env, "sick", t).json()
    pending = env.get(f"{URL}?employee_id={env.emp.id}").json()[0]
    assert pending["approved_by"] in ("-", None)                 # nobody has decided yet
    _approve(env, made["id"])
    row = env.get(f"{URL}?employee_id={env.emp.id}").json()[0]
    assert row["reviewed_by"] == env.admin.id
    assert row["approved_by"] == "A 1", row                      # the reviewer's first and last name
    assert row["reviewer_name"] == "A 1" and row["approval_date"] is not None


def test_a_reviewer_with_no_last_name_still_shows_a_name(env):
    env.admin.last_name = ""
    env.db.commit()
    made = apply(env, "sick", date.today() + timedelta(days=4)).json()
    _approve(env, made["id"])
    row = env.get(f"{URL}?employee_id={env.emp.id}").json()[0]
    assert row["reviewer_name"] == "A"
    env.admin.first_name, env.admin.last_name = "", ""
    env.db.commit()
    row = env.get(f"{URL}?employee_id={env.emp.id}").json()[0]
    assert row["reviewer_name"] == "a@x.com"                     # falls back to the email, never "-"


def test_a_decision_made_through_the_generic_update_records_who_decided(env):
    made = apply(env, "sick", date.today() + timedelta(days=4)).json()
    env.box["user"] = env.admin
    assert env.put(f"{URL}/{made['id']}", json={"status": "approved"}).status_code == 200
    env.box["user"] = env.emp
    row = env.get(f"{URL}?employee_id={env.emp.id}").json()[0]
    assert row["reviewed_by"] == env.admin.id and row["reviewer_name"] == "A 1"


def test_a_decided_request_with_no_reviewer_on_file_is_not_shown_as_a_dash(env):
    from app.modules.hr.models import LeaveRequest, RequestStatus
    made = apply(env, "sick", date.today() + timedelta(days=4)).json()
    row = env.db.query(LeaveRequest).get(made["id"])
    row.status, row.reviewed_by = RequestStatus.APPROVED, None            # an old or automatic approval
    env.db.commit()
    shown = env.get(f"{URL}?employee_id={env.emp.id}").json()[0]
    assert shown["approved_by"] == "HR team" and shown["reviewer_name"] == "HR team"
