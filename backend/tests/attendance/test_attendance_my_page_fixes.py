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
