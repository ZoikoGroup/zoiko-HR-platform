"""Attendance M8: the end-of-day close — final statuses for a finished day (absent, leave, remote, holiday, weekly off,
missed punch-out, recomputed complete days), safe to run again, catch-up, local time zones, pauses, people who joined or
left, HR-locked statuses, and an audit entry for every change. Organization 1 runs on Asia/Kolkata (UTC+05:30)."""
from datetime import date, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.modules.hr import work_settings
from app.modules.hr.attendance import day_close
from app.modules.hr.attendance.models import AttendanceAuditLog, AttendanceDayClosure
from app.modules.hr.models import (AttendanceCorrectionRequest, AttendanceRecord, AttendanceStatus as S, EmployeeLifecycle, Holiday,
                                   LeaveRequest, LeaveType, RequestStatus)

WED = date(2026, 11, 18)


def ist(h, m=0, day=WED):
    return datetime(day.year, day.month, day.day, h, m) - timedelta(hours=5, minutes=30)


AFTER = ist(1, 0, WED + timedelta(days=1))                  # 01:00 on Thursday: Wednesday is over


@pytest.fixture
def wednesday(api):
    """admin: no punch · hr: on leave · mgr: punched in, never out · emp: a complete day · emp2: working from home."""
    p = api.people
    api.db.add_all([
        LeaveRequest(employee_id=p["hr"].id, organization_id=1, leave_type=LeaveType.CASUAL, start_date=WED, end_date=WED, days=1,
                     status=RequestStatus.APPROVED),
        LeaveRequest(employee_id=p["emp2"].id, organization_id=1, leave_type=LeaveType.WORK_FROM_HOME, start_date=WED, end_date=WED,
                     days=1, status=RequestStatus.APPROVED),
        AttendanceRecord(employee_id=p["mgr"].id, organization_id=1, date=WED, status=S.PRESENT, source="web",
                         check_in_at=ist(9, 0), check_in=datetime(2026, 11, 18, 9, 0)),
        AttendanceRecord(employee_id=p["emp"].id, organization_id=1, date=WED, status=S.PRESENT, source="web",
                         check_in_at=ist(9, 0), check_in=datetime(2026, 11, 18, 9, 0),
                         check_out_at=ist(18, 30), check_out=datetime(2026, 11, 18, 18, 30)),
    ])
    api.db.commit()
    return api


def _status(api, who, day=WED):
    r = api.db.query(AttendanceRecord).filter_by(employee_id=api.people[who].id, date=day, is_deleted=False).one()
    return r.status


def _notified(api, who):
    from app.modules.super_admin.models import Notification, NotificationTarget
    return [n.title for n in api.db.query(Notification).join(NotificationTarget, NotificationTarget.notification_id == Notification.id)
            .filter(NotificationTarget.kind == "user", NotificationTarget.ref == str(api.people[who].id))]


def test_a_finished_day_gets_a_final_status_for_everyone(wednesday):
    api = wednesday
    results = day_close.close_due_days(api.db, 1, AFTER)
    api.db.commit()
    assert [r.work_date for r in results] == [WED]
    assert {who: _status(api, who) for who in ("admin", "hr", "mgr", "emp", "emp2")} == {
        "admin": S.ABSENT, "hr": S.ON_LEAVE, "mgr": S.MISSED_PUNCH, "emp": S.PRESENT, "emp2": S.REMOTE}
    absent = api.db.query(AttendanceRecord).filter_by(employee_id=api.people["admin"].id).one()
    assert (absent.source, absent.auto_marked) == ("system", True)
    complete = api.db.query(AttendanceRecord).filter_by(employee_id=api.people["emp"].id).one()
    assert complete.worked_minutes == 570 and float(complete.total_hours) == 9.5
    missed = api.db.query(AttendanceRecord).filter_by(employee_id=api.people["mgr"].id).one()
    assert (missed.worked_minutes, missed.auto_marked) == (0, True)
    assert "You did not punch out" in _notified(api, "mgr")
    trail = api.db.query(AttendanceAuditLog).filter_by(action="auto_marked").all()
    assert len(trail) == 5 and all(t.actor_type == "system" and t.reason.startswith("Day closed") for t in trail)
    closure = api.db.query(AttendanceDayClosure).one()
    assert (closure.work_date, closure.records_written, closure.missed_punches) == (WED, 3, 1)


def test_running_again_changes_nothing(wednesday):
    api = wednesday
    day_close.close_due_days(api.db, 1, AFTER)
    api.db.commit()
    before = api.db.query(AttendanceAuditLog).count()
    assert day_close.close_due_days(api.db, 1, AFTER + timedelta(minutes=30)) == []
    assert api.db.query(AttendanceAuditLog).count() == before and api.db.query(AttendanceDayClosure).count() == 1


def test_not_before_half_past_midnight_local(wednesday):
    # at 00:20 on Thursday, Wednesday is not over yet (Tuesday is, on a first run)
    closed = [r.work_date for r in day_close.close_due_days(wednesday.db, 1, ist(0, 20, WED + timedelta(days=1)))]
    assert WED not in closed and closed == [WED - timedelta(days=1)]


def test_first_run_closes_only_the_latest_day_then_gaps_are_caught_up(wednesday):
    api = wednesday
    day_close.close_due_days(api.db, 1, AFTER)                          # Wed 18
    api.db.commit()
    later = ist(2, 0, date(2026, 11, 22))                                # Sunday 22, 02:00: Thu 19, Fri 20, Sat 21 are over
    closed = [r.work_date for r in day_close.close_due_days(api.db, 1, later)]
    api.db.commit()
    assert closed == [date(2026, 11, 19), date(2026, 11, 20), date(2026, 11, 21)]
    assert _status(api, "admin", date(2026, 11, 20)) == S.ABSENT
    assert _status(api, "admin", date(2026, 11, 21)) == S.WEEKLY_OFF


def test_a_holiday(wednesday):
    api = wednesday
    api.db.add(Holiday(name="Founders", date=WED, organization_id=1))
    api.db.commit()
    day_close.close_due_days(api.db, 1, AFTER)
    api.db.commit()
    assert _status(api, "admin") == S.HOLIDAY and _status(api, "hr") == S.HOLIDAY
    assert _status(api, "emp") == S.PRESENT                              # worked on the holiday


def test_no_second_notice_when_a_correction_is_already_waiting(wednesday):
    api = wednesday
    api.db.add(AttendanceCorrectionRequest(organization_id=1, employee_id=api.people["mgr"].id, date=WED, reason="forgot",
                                           requested_by=api.people["mgr"].id, status="PENDING", kind="missed_punch",
                                           requested_check_in=datetime(2026, 11, 18, 9, 0), requested_check_out=datetime(2026, 11, 18, 18, 0)))
    api.db.commit()
    day_close.close_due_days(api.db, 1, AFTER)
    api.db.commit()
    assert _status(api, "mgr") == S.MISSED_PUNCH and "You did not punch out" not in _notified(api, "mgr")


def test_organizations_can_keep_missed_punches_open(wednesday):
    api = wednesday
    actor = SimpleNamespace(id=api.people["admin"].id, organization_id=1, role=api.people["admin"].role)
    work_settings.save(api.db, actor, {"auto_close_punch_out": False}, "attendance")
    day_close.close_due_days(api.db, 1, AFTER)
    api.db.commit()
    assert _status(api, "mgr") == S.PRESENT                              # left as it was


def test_an_hr_locked_status_is_kept(wednesday):
    api = wednesday
    rec = api.db.query(AttendanceRecord).filter_by(employee_id=api.people["emp"].id).one()
    rec.status, rec.status_locked = S.REMOTE, True
    api.db.commit()
    result = day_close.close_due_days(api.db, 1, AFTER)[0]
    api.db.commit()
    assert _status(api, "emp") == S.REMOTE and result.skipped_locked == 1


def test_people_who_joined_later_or_left_before_are_not_marked(wednesday):
    api = wednesday
    api.people["admin"].date_of_joining = WED + timedelta(days=1)
    api.people["emp2"].is_active = False
    api.db.add(EmployeeLifecycle(employee_id=api.people["emp2"].id, organization_id=1, event_type="exit", status="completed",
                                 event_date=WED - timedelta(days=2)))
    api.db.commit()
    day_close.close_due_days(api.db, 1, AFTER)
    api.db.commit()
    marked = {r.employee_id for r in api.db.query(AttendanceRecord).filter_by(date=WED)}
    assert api.people["admin"].id not in marked and api.people["emp2"].id not in marked


def test_an_organization_that_does_not_use_attendance_is_left_alone(api):
    assert day_close.close_due_days(api.db, 1, AFTER) == []
    assert day_close.close_due_days(api.db, 2, AFTER) == []
    assert api.db.query(AttendanceRecord).count() == 0


def test_a_paused_organization_is_skipped_by_the_job(wednesday):
    from app.modules.hr.attendance.jobs import close_org
    from app.modules.hr.documents.automation.jobs import _for_each_org
    from app.modules.hr.documents.automation.models import AutomationSettings
    api = wednesday
    api.db.add(AutomationSettings(organization_id=1, paused=True))
    api.db.commit()
    assert _for_each_org(api.db, None, close_org, AFTER) == 0
    assert api.db.query(AttendanceDayClosure).count() == 0
    api.db.query(AutomationSettings).delete()
    api.db.commit()
    assert _for_each_org(api.db, None, close_org, AFTER) == 1


def test_the_dashboard_shows_the_last_closed_day_and_the_job_is_registered(wednesday, monkeypatch):
    api = wednesday
    day_close.close_due_days(api.db, 1, AFTER)
    api.db.commit()
    monkeypatch.setattr("app.modules.hr.attendance.clock.utcnow", lambda: AFTER)
    api.as_("hr")
    assert api.get("/hr/attendance/dashboard/today").json()["last_closed"]["date"] == "2026-11-18"
    from app.modules.hr.attendance.jobs import register
    added = []
    register(SimpleNamespace(add_job=lambda fn, trigger, **kw: added.append((kw["id"], str(trigger)))))
    assert added[0][0] == "hr_attendance_end_of_day" and "*/30" in added[0][1]
