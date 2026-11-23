"""My Attendance plan, step 3 (no formula changes): the day drawer shows the same status as the calendar (B1), an old
open day never shows ever-growing live hours (B2), and a day the end-of-day job closed as a missed punch-out is no longer
"working" on the punch card nor closable by a late punch-out (B3). Organization 1 runs on Asia/Kolkata (UTC+05:30)."""
from datetime import date, timedelta

from app.modules.hr.models import AttendanceRecord, AttendanceStatus, Holiday, LeaveRequest, LeaveType, RequestStatus
from test_attendance_m2_punch import WED, clock_at, ist, shift  # noqa: F401  (fixtures)


def _day(api, d):
    return api.get(f"/hr/me/attendance/days/{d.isoformat()}").json()


def _month_status(api, d):
    month = api.get("/hr/me/attendance", params={"month": d.strftime("%Y-%m")}).json()
    return next(x["status"] for x in month["days"] if x["date"] == d.isoformat())


def test_b1_the_drawer_shows_the_calendar_status_for_days_without_a_record(api, shift, clock_at):
    mon, tue = WED - timedelta(days=2), WED - timedelta(days=1)
    sat = WED + timedelta(days=3)
    api.db.add(Holiday(name="Founders day", date=tue, organization_id=1))
    api.db.add(LeaveRequest(employee_id=api.people["emp"].id, organization_id=1, leave_type=LeaveType.CASUAL,
                            start_date=WED - timedelta(days=7), end_date=WED - timedelta(days=7), days=1,
                            status=RequestStatus.APPROVED))
    api.db.commit()
    clock_at(ist(12, 0, day=sat))
    api.as_("emp")
    for d, expected in ((mon, "absent"), (tue, "holiday"), (WED - timedelta(days=7), "on_leave"),
                        (sat, "weekly_off"), (sat + timedelta(days=3), None)):
        assert _month_status(api, d) == expected, d
        assert _day(api, d)["status"] == expected, d


def test_b2_an_old_open_day_keeps_its_stored_hours(api, shift, clock_at):
    clock_at(ist(9, 0))
    api.as_("emp")
    api.post("/hr/me/attendance/punch-in")
    clock_at(ist(10, 0))
    assert _day(api, WED)["running"] is True                              # still today: live totals
    clock_at(ist(12, 0, day=WED + timedelta(days=3)))                     # 3 days later, never punched out
    day = _day(api, WED)
    assert day["running"] is False and day["worked_minutes"] == 0
    assert day["can_punch_out"] is False


def test_b3_a_missed_punch_out_is_not_working_and_cannot_be_punched_out(api, shift, clock_at):
    clock_at(ist(22, 0))                                                 # a late start: still inside the 20 h window tomorrow
    api.as_("emp")
    api.post("/hr/me/attendance/punch-in")
    rec = api.db.query(AttendanceRecord).one()
    rec.status = AttendanceStatus.MISSED_PUNCH                           # what the end-of-day job writes at 00:30
    api.db.commit()
    clock_at(ist(8, 0, day=WED + timedelta(days=1)))
    today = api.get("/hr/me/attendance/today").json()
    assert today["date"] == (WED + timedelta(days=1)).isoformat()        # today, not yesterday's closed day
    assert today["running"] is False and today["can_punch_in"] is True
    r = api.post("/hr/me/attendance/punch-out")
    assert r.status_code in (409, 422) and r.json().get("error") == "ATT_NOT_IN"
    assert _day(api, WED)["status"] == "missed_punch" and _day(api, WED)["running"] is False
    assert api.post("/hr/me/attendance/punch-in").status_code == 200    # the new day starts normally


def test_b4_weekend_work_is_not_attendance_so_the_rate_never_exceeds_100(api, shift, clock_at):
    emp = api.people["emp"]
    sat, mon, tue = date(2026, 11, 14), date(2026, 11, 16), date(2026, 11, 17)
    for d in (sat, mon, tue):
        api.db.add(AttendanceRecord(employee_id=emp.id, organization_id=1, date=d, status=AttendanceStatus.PRESENT,
                                    check_in_at=ist(9, 0, d), check_out_at=ist(18, 0, d), worked_minutes=540))
    api.db.commit()
    clock_at(ist(8, 0))                                                   # Wed 18 Nov, not punched in yet
    api.as_("emp")
    month = api.get("/hr/me/attendance", params={"month": "2026-11"}).json()
    # 16 and 17 Nov count as attended; the other past weekdays are absent; Saturday the 14th is a weekly off
    k = month["kpis"]
    assert k["attended_days"] == 2 and k["attendance_rate"] <= 100       # Saturday's work is not attendance
    before = k["working_days"]
    clock_at(ist(9, 5))
    api.post("/hr/me/attendance/punch-in")                                # today becomes due once punched in
    k2 = api.get("/hr/me/attendance", params={"month": "2026-11"}).json()["kpis"]
    assert k2["working_days"] == before + 1 and k2["attended_days"] == 3 and k2["punched_days"] == 3


# ── B7 (approved): the end-of-day close waits until the day is over in every person's own time zone ─────────────────

def test_b7_a_person_in_a_later_time_zone_is_not_closed_mid_shift(api, clock_at):
    from datetime import datetime
    from app.modules.hr.attendance import day_close
    emp = api.people["emp"]
    emp.timezone = "Asia/Dubai"                                           # UTC+4, 1h30 behind the organization (Kolkata)
    # a Dubai day: in at 15:00 Dubai (11:00 UTC), still working at 23:30 Dubai, out at 00:10 Dubai next day
    api.db.add(AttendanceRecord(employee_id=emp.id, organization_id=1, date=WED, status=AttendanceStatus.PRESENT, source="web",
                                check_in_at=datetime(2026, 11, 18, 11, 0), check_in=datetime(2026, 11, 18, 15, 0)))
    api.db.commit()
    at_0045_ist = ist(0, 45, day=WED + timedelta(days=1))                 # = 23:15 Dubai on Wednesday: not over for emp
    assert WED not in day_close.closable_days(api.db, 1, at_0045_ist)
    at_0205_ist = ist(2, 5, day=WED + timedelta(days=1))                  # = 00:35 Dubai on Thursday: over for everyone
    assert day_close.closable_days(api.db, 1, at_0205_ist)[-1] == WED
    day_close.close_day(api.db, 1, WED, now_utc=at_0205_ist)
    rec = api.db.query(AttendanceRecord).filter_by(employee_id=emp.id, date=WED).one()
    assert rec.status == AttendanceStatus.MISSED_PUNCH and rec.work_date_tz == "Asia/Dubai"


def test_b7_an_organization_without_personal_time_zones_closes_as_before(api):
    from app.modules.hr.attendance import day_close
    api.db.add(AttendanceRecord(employee_id=api.people["emp"].id, organization_id=1, date=WED, status=AttendanceStatus.PRESENT))
    api.db.commit()
    assert day_close.closable_days(api.db, 1, ist(0, 45, day=WED + timedelta(days=1))) == [WED]


# ── B6 (approved): a leave decision recalculates days that were already closed ───────────────────────────────────────

def test_b6_leave_approved_after_the_day_closed_turns_absent_into_on_leave_and_back(api, clock_at):
    from app.modules.hr.attendance import day_close
    from app.modules.hr.attendance.models import AttendanceAuditLog
    emp = api.people["emp"]
    clock_at(ist(1, 0, day=WED + timedelta(days=1)))                     # Thursday 01:00: Wednesday is over
    api.db.add(AttendanceRecord(employee_id=api.people["emp2"].id, organization_id=1, date=WED - timedelta(days=1),
                                status=AttendanceStatus.PRESENT))         # the organization uses attendance
    api.db.commit()
    day_close.close_day(api.db, 1, WED, now_utc=ist(1, 0, day=WED + timedelta(days=1)))
    api.db.commit()
    assert api.db.query(AttendanceRecord).filter_by(employee_id=emp.id, date=WED).one().status == AttendanceStatus.ABSENT
    leave = LeaveRequest(employee_id=emp.id, organization_id=1, leave_type=LeaveType.CASUAL, start_date=WED, end_date=WED,
                         days=1, status=RequestStatus.PENDING)
    api.db.add(leave)
    api.db.commit()
    api.as_("hr")
    r = api.put(f"/hr/leaves/{leave.id}/review", json={"status": "approved"})
    assert r.status_code == 200, r.text
    rec = api.db.query(AttendanceRecord).filter_by(employee_id=emp.id, date=WED).one()
    api.db.refresh(rec)
    assert rec.status == AttendanceStatus.ON_LEAVE
    assert api.db.query(AttendanceAuditLog).filter_by(employee_id=emp.id, work_date=WED, action="auto_marked",
                                                      reason="Leave approved: day recalculated.").count() == 1
    r = api.put(f"/hr/leaves/{leave.id}", json={"status": "cancelled"})   # cancelled: the day is absent again
    assert r.status_code == 200, r.text
    api.db.refresh(rec)
    assert rec.status == AttendanceStatus.ABSENT


def test_b6_an_hr_locked_day_is_not_changed_by_a_leave_decision(api, clock_at):
    emp = api.people["emp"]
    clock_at(ist(12, 0, day=WED + timedelta(days=2)))
    rec = AttendanceRecord(employee_id=emp.id, organization_id=1, date=WED, status=AttendanceStatus.REMOTE, status_locked=True)
    leave = LeaveRequest(employee_id=emp.id, organization_id=1, leave_type=LeaveType.CASUAL, start_date=WED, end_date=WED,
                         days=1, status=RequestStatus.PENDING)
    api.db.add_all([rec, leave])
    api.db.commit()
    api.as_("hr")
    assert api.put(f"/hr/leaves/{leave.id}/review", json={"status": "approved"}).status_code == 200
    api.db.refresh(rec)
    assert rec.status == AttendanceStatus.REMOTE
