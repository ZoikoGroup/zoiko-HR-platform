"""Attendance M7: the approvals queue — corrections and overtime together, oldest waiting first, counts per type and
status, who may see and decide what, and overtime approval recorded in the attendance trail."""
from datetime import date, datetime, timedelta

import pytest

from app.modules.hr.attendance.models import AttendanceAuditLog
from app.modules.hr.models import AttendanceCorrectionRequest, AttendanceRecord, AttendanceStatus, OvertimeRequest

DAY = date(2026, 11, 17)


@pytest.fixture(autouse=True)
def frozen(monkeypatch):
    monkeypatch.setattr("app.modules.hr.attendance.clock.utcnow", lambda: datetime(2026, 11, 18, 5, 0))


def _correction(api, who, created, status="PENDING", **kw):
    c = AttendanceCorrectionRequest(organization_id=1, employee_id=api.people[who].id, date=DAY, kind=kw.pop("kind", "missed_punch"),
                                    requested_check_in=datetime(2026, 11, 17, 9, 0), requested_check_out=datetime(2026, 11, 17, 18, 0),
                                    reason="forgot", requested_by=api.people[who].id, status=status, created_at=created, **kw)
    api.db.add(c)
    api.db.commit()
    return c


def _overtime(api, who, created, status="PENDING"):
    o = OvertimeRequest(organization_id=1, employee_id=api.people[who].id, date=DAY, start_time="18:00", end_time="20:00", hours=2,
                        reason="Release", requested_by=api.people[who].id, status=status, created_at=created)
    api.db.add(o)
    api.db.commit()
    return o


@pytest.fixture
def requests(api):
    now = datetime.utcnow()
    return {
        "c_emp_old": _correction(api, "emp", now - timedelta(hours=30)),
        "o_emp": _overtime(api, "emp", now - timedelta(hours=5)),
        "c_emp2": _correction(api, "emp2", now - timedelta(hours=10), kind="wrong_status", requested_status="remote"),
        "c_mgr": _correction(api, "mgr", now - timedelta(hours=2)),
        "o_done": _overtime(api, "emp", now - timedelta(days=3), status="APPROVED"),
    }


def test_hr_sees_everything_pending_oldest_first_with_counts(api, requests):
    api.as_("hr")
    body = api.get("/hr/attendance/approvals").json()
    assert [(i["type"], i["id"]) for i in body["items"]] == [
        ("correction", requests["c_emp_old"].id), ("correction", requests["c_emp2"].id), ("overtime", requests["o_emp"].id),
        ("correction", requests["c_mgr"].id)]
    assert body["pending_total"] == 4
    assert body["counts"]["overtime"] == {"pending": 1, "approved": 1, "rejected": 0}
    first = body["items"][0]
    assert first["employee_name"] == "Emp Person" and first["department"] == "Engineering" and first["waiting_hours"] >= 29
    assert first["requested_check_in"] == "09:00" and first["kind"] == "missed_punch" and first["can_decide"] is True
    assert body["items"][1]["requested_status"] == "remote"


def test_filters_by_type_and_status(api, requests):
    api.as_("hr")
    over = api.get("/hr/attendance/approvals", params={"type": "overtime", "status": "all"}).json()["items"]
    assert {i["id"] for i in over} == {requests["o_emp"].id, requests["o_done"].id}
    assert all(i["type"] == "overtime" for i in over)
    approved = api.get("/hr/attendance/approvals", params={"status": "approved"}).json()["items"]
    assert [i["id"] for i in approved] == [requests["o_done"].id] and approved[0]["can_decide"] is False
    assert api.get("/hr/attendance/approvals", params={"type": "leave"}).status_code == 422


def test_a_manager_sees_their_team_and_cannot_decide_their_own(api, requests):
    api.as_("mgr")
    items = api.get("/hr/attendance/approvals").json()["items"]
    by = {(i["type"], i["id"]): i for i in items}
    assert ("correction", requests["c_emp2"].id) not in by                  # emp2 does not report to the manager
    assert by[("correction", requests["c_mgr"].id)]["can_decide"] is False and by[("correction", requests["c_mgr"].id)]["own"] is True
    assert by[("correction", requests["c_emp_old"].id)]["can_decide"] is True


def test_employees_cannot_open_the_queue(api, requests):
    api.as_("emp")
    assert api.get("/hr/attendance/approvals").status_code == 403


def test_deciding_moves_the_request_out_of_pending_and_overtime_is_in_the_attendance_trail(api, requests):
    rec = AttendanceRecord(employee_id=api.people["emp"].id, organization_id=1, date=DAY, status=AttendanceStatus.PRESENT)
    api.db.add(rec)
    api.db.commit()
    api.as_("mgr")
    r = api.post(f"/hr/time/overtime/{requests['o_emp'].id}/decision", json={"approve": True})
    assert r.status_code == 200, r.text
    pending = api.get("/hr/attendance/approvals").json()
    assert requests["o_emp"].id not in [i["id"] for i in pending["items"] if i["type"] == "overtime"]
    done = [i for i in api.get("/hr/attendance/approvals", params={"status": "approved", "type": "overtime"}).json()["items"]
            if i["id"] == requests["o_emp"].id][0]
    assert done["decided_by_name"] == "Mgr Person"
    trail = api.db.query(AttendanceAuditLog).filter_by(action="overtime_approved").one()
    assert trail.attendance_id == rec.id and trail.after == {"overtime_authorized_hours": 2.0} and trail.actor_id == api.people["mgr"].id


def test_paging(api, requests):
    api.as_("hr")
    page = api.get("/hr/attendance/approvals", params={"per_page": 3, "page": 2}).json()
    assert (page["total"], len(page["items"])) == (4, 1)
