"""Attendance M4: corrections through Time Requests — missed punch, wrong times, wrong status and breaks; who may decide;
what an approval writes (local and UTC times, breaks, locked status, recomputed totals, an audit entry with the before and
after values); refusals change nothing. Organization 1 runs on Asia/Kolkata (UTC+05:30)."""
from datetime import date, datetime, timedelta

import pytest

from app.modules.hr.attendance.models import AttendanceAuditLog, AttendanceBreak
from app.modules.hr.models import AttendanceCorrectionRequest, AttendanceRecord, AttendanceStatus, EmployeeHistory

DAY = date(2026, 11, 17)                     # Tuesday; "today" is Wednesday 18 Nov


def ist(h, m=0, day=DAY):
    return datetime(day.year, day.month, day.day, h, m) - timedelta(hours=5, minutes=30)


@pytest.fixture(autouse=True)
def today_is_wednesday(monkeypatch):
    monkeypatch.setattr("app.modules.hr.attendance.clock.utcnow", lambda: ist(10, 0, date(2026, 11, 18)))


def _record(api, who="emp", **kw):
    r = AttendanceRecord(employee_id=api.people[who].id, organization_id=1, date=kw.pop("day", DAY),
                         status=kw.pop("status", AttendanceStatus.PRESENT), source="web", **kw)
    api.db.add(r)
    api.db.commit()
    return r


def _ask(api, who="emp", **body):
    api.as_(who)
    payload = {"date": DAY.isoformat(), "reason": "forgot", "confirm_accurate": True, **body}
    return api.post("/hr/time/corrections", json=payload)


def _decide(api, cid, who="mgr", approve=True, reason=None):
    api.as_(who)
    return api.post(f"/hr/time/corrections/{cid}/decision", json={"approve": approve, "reason": reason})


def test_a_missed_punch_out_is_completed_by_an_approved_correction(api):
    rec = _record(api, status=AttendanceStatus.MISSED_PUNCH, check_in=datetime(2026, 11, 17, 9, 0), check_in_at=ist(9, 0))
    r = _ask(api, kind="missed_punch", requested_check_out="18:30")
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["kind"] == "missed_punch" and body["status"] == "PENDING"
    assert body["requested_check_in"].startswith("2026-11-17T09:00")          # taken from the existing punch-in
    d = _decide(api, body["id"])
    assert d.status_code == 200, d.text
    api.db.refresh(rec)
    assert (rec.check_out, rec.check_out_at) == (datetime(2026, 11, 17, 18, 30), ist(18, 30))
    assert (rec.status, rec.worked_minutes, float(rec.total_hours)) == (AttendanceStatus.PRESENT, 570, 9.5)
    entry = api.db.query(AttendanceAuditLog).filter_by(action="corrected").one()
    assert entry.actor_id == api.people["mgr"].id and entry.before["status"] == "missed_punch" and entry.after["status"] == "present"
    assert "Forgot to check in/out" in entry.reason
    assert api.db.query(EmployeeHistory).filter_by(field_name="attendance.check_out").count() == 1


def test_a_day_with_no_record_gets_one_from_the_correction(api):
    cid = _ask(api, kind="missed_punch", requested_check_in="09:10", requested_check_out="17:40").json()["id"]
    _decide(api, cid, who="hr")
    rec = api.db.query(AttendanceRecord).one()
    assert (rec.source, rec.check_in_at, rec.status) == ("correction", ist(9, 10), AttendanceStatus.PRESENT)
    assert api.db.get(AttendanceCorrectionRequest, cid).attendance_record_id == rec.id


def test_wrong_times_across_midnight(api):
    _record(api, check_in=datetime(2026, 11, 17, 22, 0), check_in_at=ist(22, 0), check_out=datetime(2026, 11, 17, 23, 0),
            check_out_at=ist(23, 0))
    cid = _ask(api, kind="time_change", requested_check_in="22:00", requested_check_out="06:00").json()["id"]
    _decide(api, cid)
    rec = api.db.query(AttendanceRecord).one()
    assert rec.check_out == datetime(2026, 11, 18, 6, 0) and rec.worked_minutes == 480


def test_a_wrong_status_is_set_and_locked(api):
    rec = _record(api, status=AttendanceStatus.ABSENT)
    assert _ask(api, kind="wrong_status", requested_status="on_leave").status_code == 422      # leave goes through Leave
    cid = _ask(api, kind="wrong_status", requested_status="remote", reason="off_site").json()["id"]
    _decide(api, cid)
    api.db.refresh(rec)
    assert (rec.status, rec.status_locked) == (AttendanceStatus.REMOTE, True)


def test_breaks_are_replaced_and_hours_recomputed(api):
    rec = _record(api, check_in=datetime(2026, 11, 17, 9, 0), check_in_at=ist(9, 0), check_out=datetime(2026, 11, 17, 18, 0),
                  check_out_at=ist(18, 0), worked_minutes=540)
    api.db.add(AttendanceBreak(organization_id=1, attendance_id=rec.id, start_at=ist(12, 0), end_at=ist(14, 0)))
    api.db.commit()
    cid = _ask(api, kind="break", requested_breaks=[{"start": "13:00", "end": "13:30"}, {"start": "16:00", "end": "16:15"}]).json()["id"]
    _decide(api, cid)
    breaks = api.db.query(AttendanceBreak).filter_by(attendance_id=rec.id).order_by(AttendanceBreak.start_at).all()
    assert [(b.start_at, b.end_at, b.source) for b in breaks] == [(ist(13, 0), ist(13, 30), "correction"), (ist(16, 0), ist(16, 15), "correction")]
    api.db.refresh(rec)
    assert (rec.break_minutes, rec.worked_minutes) == (45, 495)


def test_requests_that_cannot_be_made(api):
    assert _ask(api, kind="missed_punch", requested_check_out="18:00").status_code == 422           # no punch-in to keep
    assert _ask(api, kind="break", requested_breaks=[{"start": "13:00", "end": "13:30"}]).status_code == 422   # no punch on that day
    assert _ask(api, kind="missed_punch", requested_check_in="09:00", requested_check_out="18:00",
                date=(DAY + timedelta(days=5)).isoformat()).status_code == 422                       # the future
    assert _ask(api, kind="time_change", requested_check_in="09:00", requested_check_out="18:00", confirm_accurate=False).status_code == 422
    assert _ask(api, kind="missed_punch", requested_check_in="09:00", requested_check_out="18:00").status_code == 201
    dup = _ask(api, kind="wrong_status", requested_status="present")
    assert dup.status_code == 409                                                                   # one pending request per day


def test_today_can_be_corrected(api):
    assert _ask(api, kind="missed_punch", requested_check_in="09:00", requested_check_out="09:30",
                date="2026-11-18").status_code == 201


def test_who_may_decide_and_a_refusal_changes_nothing(api):
    rec = _record(api, status=AttendanceStatus.ABSENT)
    cid = _ask(api, kind="wrong_status", requested_status="present").json()["id"]
    assert _decide(api, cid, who="emp").status_code == 403                 # never one's own request
    assert _decide(api, cid, who="emp2").status_code in (403, 404)         # not their manager
    assert _decide(api, cid, approve=False).status_code == 422             # a refusal needs a reason
    r = _decide(api, cid, approve=False, reason="You were on leave that day")
    assert r.status_code == 200 and r.json()["status"] == "REJECTED"
    api.db.refresh(rec)
    assert rec.status == AttendanceStatus.ABSENT and not rec.status_locked
    assert api.db.query(AttendanceAuditLog).filter_by(action="corrected").count() == 0
    assert _decide(api, cid).status_code == 409                            # already decided


def test_hr_can_ask_on_someones_behalf_and_the_employee_sees_it(api):
    r = _ask(api, who="hr", employee_id=api.people["emp"].id, kind="missed_punch", requested_check_in="09:00", requested_check_out="18:00")
    assert r.status_code == 201
    api.as_("emp")
    mine = api.get("/hr/time/corrections").json()["items"]
    assert [c["kind"] for c in mine] == ["missed_punch"]
