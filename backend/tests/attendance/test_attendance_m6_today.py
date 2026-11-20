"""Attendance M6: the live "Today" panel — counts for working, late, on a break, on leave, remote, off and not checked in,
by department, the list of people expected who have not punched in (overdue first), and who may see it.
Organization 1 runs on Asia/Kolkata; now is Wednesday 18 Nov 2026, 10:00 local."""
from datetime import date, datetime, timedelta

import pytest

from app.modules.hr.attendance.models import AttendanceBreak, EmployeeShift
from app.modules.hr.models import (AttendanceRecord, AttendanceStatus, Holiday, LeaveRequest, LeaveType, RequestStatus, Shift,
                                   ShiftType)

TODAY = date(2026, 11, 18)


def ist(h, m=0, day=TODAY):
    return datetime(day.year, day.month, day.day, h, m) - timedelta(hours=5, minutes=30)


@pytest.fixture(autouse=True)
def ten_am(monkeypatch):
    monkeypatch.setattr("app.modules.hr.attendance.clock.utcnow", lambda: ist(10, 0))


@pytest.fixture
def day(api):
    """admin: present · hr: late, on a break · mgr: on leave · emp: not checked in (09:00 shift, overdue) · emp2 (Sales): remote."""
    p = api.people
    p["emp2"].department_id = 2
    early = Shift(name="General", shift_type=ShiftType.GENERAL, start_time="09:00", end_time="18:00", grace_time_minutes=10, organization_id=1)
    late = Shift(name="Late", shift_type=ShiftType.GENERAL, start_time="12:00", end_time="21:00", grace_time_minutes=10, organization_id=1)
    api.db.add_all([early, late])
    api.db.commit()
    api.db.add(EmployeeShift(organization_id=1, employee_id=p["emp"].id, shift_id=early.id, effective_from=date(2025, 1, 1)))
    hr_rec = AttendanceRecord(employee_id=p["hr"].id, organization_id=1, date=TODAY, status=AttendanceStatus.LATE,
                              check_in_at=ist(9, 30), check_in=datetime(2026, 11, 18, 9, 30))
    api.db.add_all([
        AttendanceRecord(employee_id=p["admin"].id, organization_id=1, date=TODAY, status=AttendanceStatus.PRESENT,
                         check_in_at=ist(8, 55), check_in=datetime(2026, 11, 18, 8, 55)),
        hr_rec,
        LeaveRequest(employee_id=p["mgr"].id, organization_id=1, leave_type=LeaveType.CASUAL, start_date=TODAY, end_date=TODAY,
                     days=1, status=RequestStatus.APPROVED),
        LeaveRequest(employee_id=p["emp2"].id, organization_id=1, leave_type=LeaveType.WORK_FROM_HOME, start_date=TODAY, end_date=TODAY,
                     days=1, status=RequestStatus.APPROVED),
    ])
    api.db.commit()
    api.db.add(AttendanceBreak(organization_id=1, attendance_id=hr_rec.id, start_at=ist(9, 50)))
    api.db.commit()
    return {"early": early, "late": late}


def test_todays_counts(api, day):
    api.as_("hr")
    t = api.get("/hr/attendance/dashboard/today").json()
    assert (t["date"], t["timezone"], t["holiday"]) == ("2026-11-18", "Asia/Kolkata", False)
    picked = {k: t[k] for k in ("total", "present", "late", "remote", "on_leave", "not_checked_in", "on_break", "working_now", "off")}
    assert picked == {"total": 5, "present": 1, "late": 1, "remote": 1, "on_leave": 1, "not_checked_in": 1, "on_break": 1,
                      "working_now": 1, "off": 0}
    assert t["expected"] == 4 and t["attendance_rate"] == 75                      # 3 of the 4 expected (one on leave)


def test_by_department_and_who_has_not_checked_in(api, day):
    api.as_("hr")
    t = api.get("/hr/attendance/dashboard/today").json()
    depts = {d["department"]: d for d in t["by_department"]}
    assert (depts["Engineering"]["total"], depts["Engineering"]["late"], depts["Engineering"]["on_leave"],
            depts["Engineering"]["not_checked_in"]) == (4, 1, 1, 1)
    assert (depts["Sales"]["total"], depts["Sales"]["attended"]) == (1, 1)
    assert t["not_checked_in_list"] == [{"employee_id": api.people["emp"].id, "name": "Emp Person", "employee_code": "C-emp",
                                         "department": "Engineering", "shift": "General", "shift_start": "09:00", "overdue": True}]


def test_someone_whose_shift_has_not_started_is_waiting_but_not_overdue(api, day):
    api.db.query(EmployeeShift).filter_by(employee_id=api.people["emp"].id).update({"shift_id": day["late"].id})
    api.db.commit()
    api.as_("hr")
    waiting = api.get("/hr/attendance/dashboard/today").json()["not_checked_in_list"]
    assert waiting[0]["overdue"] is False and waiting[0]["shift_start"] == "12:00"


def test_a_holiday_puts_everyone_without_a_punch_off(api, day):
    api.db.add(Holiday(name="Founders", date=TODAY, organization_id=1))
    api.db.commit()
    api.as_("hr")
    t = api.get("/hr/attendance/dashboard/today").json()
    assert t["holiday"] is True and t["not_checked_in"] == 0 and t["off"] == 1     # emp is off; mgr / emp2 stay on leave / remote


def test_the_department_filter(api, day):
    api.as_("hr")
    t = api.get("/hr/attendance/dashboard/today", params={"department_id": 2}).json()
    assert (t["total"], t["remote"]) == (1, 1)


def test_people_who_joined_later_or_left_are_not_counted(api, day):
    api.people["emp"].date_of_joining = TODAY + timedelta(days=3)
    api.people["emp2"].is_active = False
    api.db.commit()
    api.as_("hr")
    assert api.get("/hr/attendance/dashboard/today").json()["total"] == 3


def test_a_manager_sees_their_team_and_employees_see_nothing(api, day):
    api.as_("mgr")
    t = api.get("/hr/attendance/dashboard/today").json()
    assert t["total"] == 2 and t["not_checked_in"] == 1                           # themselves (on leave) and emp
    api.as_("emp")
    assert api.get("/hr/attendance/dashboard/today").status_code == 403


def test_punching_in_moves_someone_out_of_the_waiting_list(api, day):
    api.as_("emp")
    assert api.post("/hr/me/attendance/punch-in").status_code == 200
    api.as_("hr")
    t = api.get("/hr/attendance/dashboard/today").json()
    assert t["not_checked_in"] == 0 and t["late"] == 2 and t["not_checked_in_list"] == []
