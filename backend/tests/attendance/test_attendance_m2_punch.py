"""Attendance M2: punching in and out, breaks, double clicks, night shifts, the month view with KPIs over working days, one
day's detail, and an audit entry for every change. Organization 1 runs on Asia/Kolkata (UTC+05:30)."""
from datetime import date, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.modules.hr import work_settings
from app.modules.hr.attendance.models import AttendanceAuditLog, AttendanceBreak, EmployeeShift
from app.modules.hr.models import (AttendanceRecord, AttendanceStatus, Holiday, LeaveRequest, LeaveType, RequestStatus, Shift,
                                   ShiftType)

WED = date(2026, 11, 18)


def ist(h, m=0, day=WED):
    """A Kolkata wall-clock time as the naive UTC instant the server stores."""
    return datetime(day.year, day.month, day.day, h, m) - timedelta(hours=5, minutes=30)


@pytest.fixture
def clock_at(monkeypatch):
    box = {"now": ist(9, 0)}
    monkeypatch.setattr("app.modules.hr.attendance.clock.utcnow", lambda: box["now"])

    def set_(when):
        box["now"] = when
    return set_


@pytest.fixture
def shift(api):
    s = Shift(name="General", shift_type=ShiftType.GENERAL, start_time="09:00", end_time="18:00", grace_time_minutes=10,
              organization_id=1)
    api.db.add(s)
    api.db.commit()
    for who in ("emp", "emp2", "mgr", "hr"):
        api.db.add(EmployeeShift(organization_id=1, employee_id=api.people[who].id, shift_id=s.id, effective_from=date(2025, 1, 1)))
    api.db.commit()
    return s


def _audit(api, action):
    return api.db.query(AttendanceAuditLog).filter_by(action=action).all()


def test_punch_in_on_time_records_the_utc_instant_and_the_local_work_date(api, shift, clock_at):
    api.as_("emp")
    clock_at(ist(9, 5))
    r = api.post("/hr/me/attendance/punch-in")
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["date"], body["timezone"], body["status"]) == ("2026-11-18", "Asia/Kolkata", "present")
    assert body["check_in_at"] == "2026-11-18T03:35:00Z"
    assert body["shift"]["name"] == "General" and body["shift"]["expected_end"] == "2026-11-18T12:30:00Z"
    assert body["can_punch_out"] and body["can_start_break"] and not body["can_punch_in"]
    rec = api.db.query(AttendanceRecord).one()
    assert (rec.check_in, rec.source, rec.work_date_tz) == (datetime(2026, 11, 18, 9, 5), "web", "Asia/Kolkata")
    entry = _audit(api, "punch_in")[0]
    assert entry.actor_id == api.people["emp"].id and entry.after["status"] == "present"


def test_after_the_grace_period_the_day_is_late(api, shift, clock_at):
    api.as_("emp")
    clock_at(ist(9, 25))
    body = api.post("/hr/me/attendance/punch-in").json()
    assert (body["status"], body["late_minutes"]) == ("late", 15)


def test_a_double_click_returns_the_day_but_a_later_second_punch_in_is_refused(api, shift, clock_at):
    api.as_("emp")
    api.post("/hr/me/attendance/punch-in")
    clock_at(ist(9, 1))
    again = api.post("/hr/me/attendance/punch-in")
    assert again.status_code == 200 and again.json()["already"] is True
    clock_at(ist(9, 30))
    late = api.post("/hr/me/attendance/punch-in")
    assert late.status_code == 409 and late.json()["error"] == "ATT_ALREADY_IN"
    assert api.db.query(AttendanceRecord).count() == 1


def test_a_full_day_with_a_break(api, shift, clock_at):
    api.as_("emp")
    api.post("/hr/me/attendance/punch-in")
    clock_at(ist(13, 0))
    assert api.post("/hr/me/attendance/break/start").json()["on_break"] is True
    clock_at(ist(13, 10))
    running = api.get("/hr/me/attendance/today").json()
    assert (running["worked_minutes"], running["break_minutes"], running["can_end_break"]) == (240, 10, True)
    assert api.post("/hr/me/attendance/break/start").json()["error"] == "ATT_ON_BREAK"
    clock_at(ist(13, 45))
    assert api.post("/hr/me/attendance/break/end").json()["break_minutes"] == 45
    clock_at(ist(19, 0))
    out = api.post("/hr/me/attendance/punch-out", json={"note": "Release done"})
    assert out.status_code == 200, out.text
    body = out.json()
    assert (body["status"], body["worked_minutes"], body["break_minutes"], body["overtime_minutes"]) == ("present", 555, 45, 75)
    assert body["check_out_at"] == "2026-11-18T13:30:00Z" and not body["can_punch_out"]
    rec = api.db.query(AttendanceRecord).one()
    assert float(rec.total_hours) == 9.25 and rec.check_out == datetime(2026, 11, 18, 19, 0) and "Release done" in rec.notes
    assert [a.action for a in api.db.query(AttendanceAuditLog).order_by(AttendanceAuditLog.id)] == \
        ["punch_in", "break_start", "break_end", "punch_out"]


@pytest.mark.parametrize("minutes,status", [(1, "absent"), (13, "absent"), (60, "half_day")])
def test_a_punch_out_minutes_after_the_punch_in_does_not_count_as_a_half_day(api, shift, clock_at, minutes, status):
    """QA R1-24: below attendance.min_present_hours (default 1 h) the finished day is absent, the punches kept."""
    api.as_("emp")
    api.post("/hr/me/attendance/punch-in")
    clock_at(ist(9, 0) + timedelta(minutes=minutes))
    body = api.post("/hr/me/attendance/punch-out").json()
    assert (body["status"], body["worked_minutes"]) == (status, minutes)
    assert body["check_in_at"] and body["check_out_at"]


def test_the_today_answer_says_when_its_live_totals_were_taken(api, shift, clock_at):
    """QA R1-25: the second-by-second timer starts from the server's `as_of` instant."""
    api.as_("emp")
    api.post("/hr/me/attendance/punch-in")
    clock_at(ist(10, 5))
    body = api.get("/hr/me/attendance/today").json()
    assert (body["as_of"], body["worked_minutes"], body["running"]) == ("2026-11-18T04:35:00Z", 65, True)

def test_punching_out_ends_a_running_break(api, shift, clock_at):
    api.as_("emp")
    api.post("/hr/me/attendance/punch-in")
    clock_at(ist(17, 0))
    api.post("/hr/me/attendance/break/start")
    clock_at(ist(17, 30))
    body = api.post("/hr/me/attendance/punch-out").json()
    assert body["break_minutes"] == 30 and body["worked_minutes"] == 510 - 30 and not body["on_break"]
    assert api.db.query(AttendanceBreak).one().end_at == ist(17, 30)


def test_the_error_cases(api, shift, clock_at):
    api.as_("emp")
    assert api.post("/hr/me/attendance/punch-out").json()["error"] == "ATT_NOT_IN"
    assert api.post("/hr/me/attendance/break/start").json()["error"] == "ATT_NOT_IN"
    assert api.post("/hr/me/attendance/break/end").json()["error"] == "ATT_NOT_ON_BREAK"
    api.post("/hr/me/attendance/punch-in")
    clock_at(ist(18, 0))
    api.post("/hr/me/attendance/punch-out")
    assert api.post("/hr/me/attendance/punch-out").json()["error"] == "ATT_ALREADY_OUT"
    clock_at(ist(18, 30))
    again = api.post("/hr/me/attendance/punch-in")
    assert again.status_code == 409 and again.json()["error"] == "ATT_DAY_CLOSED"


def test_a_night_shift_punch_out_after_midnight_closes_the_day_it_started(api, clock_at):
    night = Shift(name="Night", shift_type=ShiftType.NIGHT, start_time="22:00", end_time="06:00", grace_time_minutes=5, organization_id=1)
    api.db.add(night)
    api.db.commit()
    api.db.add(EmployeeShift(organization_id=1, employee_id=api.people["emp"].id, shift_id=night.id, effective_from=date(2025, 1, 1)))
    api.db.commit()
    api.as_("emp")
    clock_at(ist(22, 2))
    assert api.post("/hr/me/attendance/punch-in").json()["status"] == "present"
    clock_at(ist(6, 5, day=WED + timedelta(days=1)))
    assert api.get("/hr/me/attendance/today").json()["date"] == "2026-11-18"
    body = api.post("/hr/me/attendance/punch-out").json()
    assert (body["date"], body["worked_minutes"]) == ("2026-11-18", 483)
    assert api.db.query(AttendanceRecord).one().date == WED


def test_web_punching_can_be_turned_off(api, shift, clock_at):
    actor = SimpleNamespace(id=api.people["hr"].id, organization_id=1, role=api.people["hr"].role)
    work_settings.save(api.db, actor, {"allow_web_punch": False}, "attendance")
    api.as_("emp")
    r = api.post("/hr/me/attendance/punch-in")
    assert r.status_code == 403 and r.json()["error"] == "ATT_PUNCH_DISABLED"
    assert api.get("/hr/me/attendance/today").json()["punch_enabled"] is False


def test_no_punching_before_the_joining_date(api, shift, clock_at):
    api.people["emp"].date_of_joining = WED + timedelta(days=5)
    api.db.commit()
    api.as_("emp")
    assert api.post("/hr/me/attendance/punch-in").status_code == 422


def test_a_day_hr_has_locked_cannot_be_punched(api, shift, clock_at):
    api.db.add(AttendanceRecord(employee_id=api.people["emp"].id, organization_id=1, date=WED, status=AttendanceStatus.ON_LEAVE,
                                status_locked=True))
    api.db.commit()
    api.as_("emp")
    r = api.post("/hr/me/attendance/punch-in")
    assert r.status_code == 409 and r.json()["error"] == "ATT_LOCKED"


def test_an_admin_created_day_without_times_is_completed_by_the_punch(api, shift, clock_at):
    api.db.add(AttendanceRecord(employee_id=api.people["emp"].id, organization_id=1, date=WED, status=AttendanceStatus.ABSENT))
    api.db.commit()
    api.as_("emp")
    body = api.post("/hr/me/attendance/punch-in").json()
    assert body["status"] == "present" and api.db.query(AttendanceRecord).count() == 1
    assert _audit(api, "punch_in")[0].before["status"] == "absent"


def test_everyone_punches_for_themselves_only(api, shift, clock_at):
    for who in ("emp", "hr"):
        api.as_(who)
        assert api.post("/hr/me/attendance/punch-in").status_code == 200
    rows = {r.employee_id for r in api.db.query(AttendanceRecord)}
    assert rows == {api.people["emp"].id, api.people["hr"].id}


# ── month view ─────────────────────────────────────────────────────────────────────────────────────────────────────

def test_the_month_view_fills_every_day_and_counts_working_days_only(api, shift, clock_at):
    emp = api.people["emp"]
    api.db.add_all([
        Holiday(name="Festival", date=date(2026, 11, 4), organization_id=1),
        LeaveRequest(employee_id=emp.id, organization_id=1, leave_type=LeaveType.CASUAL, start_date=date(2026, 11, 5),
                     end_date=date(2026, 11, 6), days=2, status=RequestStatus.APPROVED),
        AttendanceRecord(employee_id=emp.id, organization_id=1, date=date(2026, 11, 2), status=AttendanceStatus.PRESENT,
                         check_in_at=ist(9, 0, date(2026, 11, 2)), check_out_at=ist(18, 0, date(2026, 11, 2)), worked_minutes=540),
        AttendanceRecord(employee_id=emp.id, organization_id=1, date=date(2026, 11, 3), status=AttendanceStatus.LATE,
                         check_in_at=ist(9, 40, date(2026, 11, 3)), check_out_at=ist(18, 40, date(2026, 11, 3)), worked_minutes=540,
                         late_minutes=30, overtime_authorized_hours=1),
        AttendanceRecord(employee_id=emp.id, organization_id=1, date=date(2026, 11, 9), status=AttendanceStatus.HALF_DAY,
                         check_in_at=ist(9, 0, date(2026, 11, 9)), check_out_at=ist(12, 0, date(2026, 11, 9)), worked_minutes=180),
    ])
    api.db.commit()
    clock_at(ist(10, 0))                                  # Wed 18 Nov
    api.as_("emp")
    body = api.get("/hr/me/attendance", params={"month": "2026-11"}).json()
    by = {d["date"]: d for d in body["days"]}
    assert len(body["days"]) == 30
    assert by["2026-11-01"]["status"] == "weekly_off"            # Sunday
    assert by["2026-11-04"]["status"] == "holiday" and by["2026-11-05"]["status"] == "on_leave"
    assert by["2026-11-10"]["status"] == "absent"                 # a past working day with no punch
    assert by["2026-11-18"]["status"] is None                     # today, not punched yet
    assert by["2026-11-19"]["future"] and by["2026-11-19"]["status"] is None
    k = body["kpis"]
    # working days 1–18 Nov: 13 weekdays, minus the holiday on the 4th = 12 (today counts as a working day)
    assert k["working_days"] == 12
    assert (k["present"], k["late"], k["half_day"], k["on_leave"], k["holiday"]) == (1, 1, 1, 2, 1)
    assert k["absent"] == 12 - 2 - 1 - 2 - 1                       # the rest of the past working days (not today)
    assert k["attended_days"] == 2.5 and k["punctuality_rate"] == 50 and k["approved_overtime_minutes"] == 60
    assert k["avg_worked_minutes"] == (540 + 540 + 180) // 3


def test_month_parameter_is_validated(api, clock_at):
    api.as_("emp")
    assert api.get("/hr/me/attendance", params={"month": "2026-13"}).status_code == 422
    assert api.get("/hr/me/attendance", params={"month": "nov"}).status_code == 422


def test_days_before_joining_have_no_status(api, shift, clock_at):
    api.people["emp"].date_of_joining = date(2026, 11, 10)
    api.db.commit()
    clock_at(ist(10, 0))
    api.as_("emp")
    body = api.get("/hr/me/attendance").json()
    by = {d["date"]: d for d in body["days"]}
    assert by["2026-11-09"]["status"] is None and by["2026-11-10"]["status"] == "absent"
    assert body["kpis"]["working_days"] == 7                       # 10–18 Nov weekdays


def test_one_days_detail_shows_breaks_and_history(api, shift, clock_at):
    api.as_("emp")
    api.post("/hr/me/attendance/punch-in")
    clock_at(ist(13, 0))
    api.post("/hr/me/attendance/break/start")
    clock_at(ist(13, 30))
    api.post("/hr/me/attendance/break/end")
    body = api.get("/hr/me/attendance/days/2026-11-18").json()
    assert len(body["breaks"]) == 1 and body["breaks"][0]["end_at"] == "2026-11-18T08:00:00Z"
    assert [h["action"] for h in body["history"]] == ["punch_in", "break_start", "break_end"]
    assert all(h["by_self"] for h in body["history"])
    api.as_("emp2")                                                # someone else sees only their own (empty) day
    other = api.get("/hr/me/attendance/days/2026-11-18").json()
    assert other["record_id"] is None and other["history"] == []
