"""Attendance M1: the status rules and minute totals (pure, no database)."""
from datetime import date, datetime, timedelta

import pytest

from app.modules.hr.attendance.status_engine import DayContext, LeaveInfo, ShiftInfo, compute_minutes, resolve
from app.modules.hr.models import AttendanceStatus as S

DAY = date(2026, 11, 18)                    # a Wednesday
SHIFT = ShiftInfo(shift_id=1, name="General", start=(9, 0), end=(18, 0), grace_minutes=10, standard_minutes=480)
NIGHT = ShiftInfo(shift_id=2, name="Night", start=(22, 0), end=(6, 0), grace_minutes=5, standard_minutes=420)


def at(h, m=0, day=DAY):
    return datetime(day.year, day.month, day.day, h, m)


def ctx(cin=None, cout=None, breaks=(), shift=SHIFT, **kw):
    # local == UTC in these tests (the time-zone conversion is tested in test_clock_policy)
    return DayContext(work_date=kw.pop("work_date", DAY), shift=shift, check_in_local=cin, check_out_local=cout,
                      check_in_utc=cin, check_out_utc=cout, breaks_utc=list(breaks), **kw)


# ── minutes ────────────────────────────────────────────────────────────────────────────────────────────────────────

def test_net_minutes_subtract_breaks():
    assert compute_minutes(at(9), at(18), [(at(13), at(13, 45))]) == (540 - 45, 45)


def test_breaks_are_clipped_to_the_worked_span_and_never_go_negative():
    assert compute_minutes(at(9), at(10), [(at(8), at(9, 30)), (at(9, 50), at(12))]) == (60 - 40, 40)
    assert compute_minutes(at(9), at(10), [(at(8), at(11))]) == (0, 60)


def test_a_running_day_and_a_running_break_count_up_to_now():
    assert compute_minutes(at(9), None, [(at(12), None)], now_utc=at(12, 30)) == (180, 30)
    assert compute_minutes(at(9), None, []) == (0, 0)


# ── statuses ───────────────────────────────────────────────────────────────────────────────────────────────────────

def test_on_time_within_grace_is_present_and_one_minute_past_grace_is_late():
    assert resolve(ctx(at(9, 10), at(18))).status == S.PRESENT
    r = resolve(ctx(at(9, 11), at(18)))
    assert (r.status, r.late_minutes) == (S.LATE, 1)


def test_short_day_is_a_half_day_even_when_late():
    r = resolve(ctx(at(10), at(13, 30)))
    assert (r.status, r.worked_minutes) == (S.HALF_DAY, 210)


# QA R1-24: below the minimum worked time (default 60 min) a completed day is absent, not a half day
@pytest.mark.parametrize("worked,expected", [
    (1, S.ABSENT), (13, S.ABSENT), (59, S.ABSENT),          # min - 1
    (60, S.HALF_DAY),                                       # exactly the minimum
    (239, S.HALF_DAY), (240, S.PRESENT),                    # exactly the half-day threshold counts in full
])
def test_minimum_worked_time_before_a_day_counts(worked, expected):
    r = resolve(ctx(at(9), at(9) + timedelta(minutes=worked)))
    assert (r.status, r.worked_minutes) == (expected, worked)
    if expected == S.ABSENT:
        assert r.late_minutes == 0


def test_a_shift_can_override_the_minimum_worked_time_and_it_never_exceeds_the_half_day_threshold():
    short = ShiftInfo(shift_id=3, name="Short", start=(9, 0), end=(18, 0), standard_minutes=480, min_present_minutes=15)
    assert resolve(ctx(at(9), at(9, 14), shift=short)).status == S.ABSENT
    assert resolve(ctx(at(9), at(9, 15), shift=short)).status == S.HALF_DAY
    assert resolve(ctx(at(9), at(9, 20), shift=None, min_present_minutes=30)).status == S.ABSENT
    # a minimum above the half-day threshold is capped at the threshold
    assert resolve(ctx(at(9), at(10), half_day_min_minutes=30, min_present_minutes=90, shift=None)).status == S.PRESENT


def test_the_minimum_does_not_apply_while_the_day_is_running():
    assert resolve(ctx(at(9), None, now_utc=at(9, 1))).status == S.PRESENT

def test_overtime_is_net_minutes_beyond_the_standard_day():
    r = resolve(ctx(at(9), at(19, 30), breaks=[(at(13), at(13, 30))]))
    assert (r.status, r.worked_minutes, r.overtime_minutes) == (S.PRESENT, 600, 120)


def test_no_punch_is_absent_only_once_the_day_is_closed():
    assert resolve(ctx(day_closed=False)).status is None
    assert resolve(ctx(day_closed=True)).status == S.ABSENT


def test_a_forgotten_punch_out_is_a_missed_punch_with_zero_hours():
    r = resolve(ctx(at(9), None, day_closed=True))
    assert (r.status, r.worked_minutes, r.overtime_minutes) == (S.MISSED_PUNCH, 0, 0)


def test_a_running_day_is_provisionally_present_or_late():
    assert resolve(ctx(at(9, 5), None, now_utc=at(11))).status == S.PRESENT
    r = resolve(ctx(at(9, 30), None, now_utc=at(11)))
    assert (r.status, r.worked_minutes) == (S.LATE, 90)


@pytest.mark.parametrize("holiday,working,expected", [(True, True, S.HOLIDAY), (False, False, S.WEEKLY_OFF)])
def test_holidays_and_weekly_offs_without_punches(holiday, working, expected):
    assert resolve(ctx(holiday=holiday, working_day=working, day_closed=True)).status == expected


def test_working_on_a_day_off_is_present_and_all_of_it_is_extra():
    r = resolve(ctx(at(10), at(14), holiday=True))
    assert (r.status, r.worked_on_off_day, r.overtime_minutes, r.late_minutes) == (S.PRESENT, True, 240, 0)


def test_approved_leave_wins_over_absence_and_work_from_home_is_remote():
    assert resolve(ctx(leave=LeaveInfo("casual"), day_closed=True)).status == S.ON_LEAVE
    assert resolve(ctx(leave=LeaveInfo("work_from_home"), day_closed=True)).status == S.REMOTE
    assert resolve(ctx(at(9), at(13), leave=LeaveInfo("casual", half_day=True))).status == S.HALF_DAY


def test_holiday_beats_leave():
    assert resolve(ctx(holiday=True, leave=LeaveInfo("casual"), day_closed=True)).status == S.HOLIDAY


def test_an_admin_locked_status_is_kept_but_totals_are_recomputed():
    r = resolve(ctx(at(9, 40), at(18), locked_status=S.PRESENT))
    assert (r.status, r.late_minutes, r.worked_minutes) == (S.PRESENT, 30, 500)


def test_not_employed_yet_has_no_status():
    assert resolve(ctx(employed=False, day_closed=True)).status is None


def test_without_a_shift_nobody_is_late_and_the_default_standard_day_applies():
    r = resolve(ctx(at(11), at(20), shift=None, standard_minutes=480))
    assert (r.status, r.late_minutes, r.overtime_minutes) == (S.PRESENT, 0, 60)


def test_night_shift_crossing_midnight():
    nxt = DAY + timedelta(days=1)
    r = resolve(ctx(at(22, 3), at(6, 0, day=nxt), shift=NIGHT))
    assert (r.status, r.worked_minutes, r.late_minutes, r.overtime_minutes) == (S.PRESENT, 477, 0, 57)
    assert resolve(ctx(at(22, 30), at(6, 0, day=nxt), shift=NIGHT)).late_minutes == 25
    assert NIGHT.end_on(DAY) == at(6, 0, day=nxt)


def test_a_shift_specific_half_day_threshold():
    short = ShiftInfo(shift_id=3, name="Part", start=(9, 0), end=(13, 0), grace_minutes=10, standard_minutes=240,
                      half_day_min_minutes=120)
    assert resolve(ctx(at(9), at(12), shift=short)).status == S.PRESENT
    assert resolve(ctx(at(9), at(10, 30), shift=short)).status == S.HALF_DAY
