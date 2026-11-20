"""Attendance M1: time zones and work dates, the organization policy, shift precedence, holidays and leave, the data
backfill (duplicates merged, UTC instants filled, rosters scoped) and the migrations on SQLite."""
from datetime import date, datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import inspect, text

from app.modules.hr import work_settings
from app.modules.hr.attendance import backfill, clock, policy
from app.modules.hr.attendance.models import AttendanceAuditLog, EmployeeShift
from app.modules.hr.models import (AttendanceRecord, AttendanceStatus, Holiday, LeaveRequest, LeaveSetting, LeaveType,
                                   RequestStatus, Shift, ShiftRoster, ShiftType)

DAY = date(2026, 11, 18)


# ── clock ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def test_time_zone_falls_back_from_employee_to_organization_to_utc():
    assert clock.tz_for(SimpleNamespace(timezone="Europe/London"), SimpleNamespace(timezone="Asia/Kolkata")).key == "Europe/London"
    assert clock.tz_for(SimpleNamespace(timezone=None), SimpleNamespace(timezone="Asia/Kolkata")).key == "Asia/Kolkata"
    assert clock.tz_for(SimpleNamespace(timezone="Not/AZone"), SimpleNamespace(timezone="")).key == "UTC"


def test_work_date_is_the_local_date_of_the_punch():
    kolkata = clock.zone("Asia/Kolkata")
    late_utc = datetime(2026, 11, 18, 20, 0)           # 01:30 on the 19th in Kolkata
    assert clock.work_date_for(late_utc, kolkata) == date(2026, 11, 19)
    assert clock.to_local(late_utc, kolkata) == datetime(2026, 11, 19, 1, 30)
    assert clock.to_utc(datetime(2026, 11, 19, 1, 30), kolkata) == late_utc


def test_durations_across_a_daylight_saving_change_use_real_elapsed_time():
    london = clock.zone("Europe/London")
    # clocks go back at 02:00 on 25 Oct 2026: 00:00 -> 06:00 local is 7 real hours
    start, end = clock.to_utc(datetime(2026, 10, 25, 0, 0), london), clock.to_utc(datetime(2026, 10, 25, 6, 0), london)
    assert (end - start) == timedelta(hours=7)
    assert clock.iso_utc(start) == "2026-10-24T23:00:00Z"


def test_parse_hhmm():
    assert clock.parse_hhmm("09:30") == (9, 30)
    assert clock.parse_hhmm("24:00") is None and clock.parse_hhmm(None) is None and clock.parse_hhmm("x") is None


# ── policy ─────────────────────────────────────────────────────────────────────────────────────────────────────────

def test_policy_defaults_and_organization_settings(db, people):
    p = policy.get_policy(db, 1)
    assert (p.grace_minutes, p.half_day_min_minutes, p.standard_minutes, p.working_days) == (10, 240, 480, policy.DEFAULT_WORKING_DAYS)
    assert p.overtime_requires_approval and p.allow_web_punch and p.edit_lock_days is None
    actor = SimpleNamespace(id=people["hr"].id, organization_id=1, role=people["hr"].role)
    work_settings.save(db, actor, {"grace_minutes": 5, "half_day_min_hours": "4.5", "standard_workday_hours": "7.5"}, "attendance")
    db.add(LeaveSetting(organization_id=1, working_days=["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"]))
    db.commit()
    p = policy.get_policy(db, 1)
    assert (p.grace_minutes, p.half_day_min_minutes, p.standard_minutes) == (5, 270, 450)
    assert p.working_days == ("mon", "tue", "wed", "thu", "sun")
    assert policy.is_working_day(p, None, date(2026, 11, 22)) is True       # Sunday
    assert policy.is_working_day(p, None, date(2026, 11, 20)) is False      # Friday


def _shift(db, name, start="09:00", end="18:00", org=1, **kw):
    s = Shift(name=name, shift_type=ShiftType.GENERAL, start_time=start, end_time=end, organization_id=org, **kw)
    db.add(s)
    db.commit()
    return s


def test_shift_precedence_roster_then_assignment_then_default(db, people):
    emp = people["emp"].id
    default, assigned, rostered = _shift(db, "Default"), _shift(db, "Assigned", "08:00", "17:00"), _shift(db, "Rostered", "14:00", "23:00")
    actor = SimpleNamespace(id=people["hr"].id, organization_id=1, role=people["hr"].role)
    work_settings.save(db, actor, {"default_shift_id": default.id}, "attendance")
    p = policy.get_policy(db, 1)
    assert policy.shift_for(db, 1, emp, DAY, p).name == "Default"
    db.add(EmployeeShift(organization_id=1, employee_id=emp, shift_id=assigned.id, effective_from=DAY - timedelta(days=10),
                         effective_to=DAY + timedelta(days=10)))
    db.commit()
    assert policy.shift_for(db, 1, emp, DAY, p).name == "Assigned"
    assert policy.shift_for(db, 1, emp, DAY + timedelta(days=11), p).name == "Default"     # assignment ended
    db.add(ShiftRoster(employee_id=emp, shift_id=rostered.id, date=DAY, organization_id=1))
    db.commit()
    info = policy.shift_for(db, 1, emp, DAY, p)
    assert (info.name, info.start, info.end) == ("Rostered", (14, 0), (23, 0))
    assert policy.shift_for(db, 1, people["emp2"].id, DAY, p).name == "Default"


def test_a_shift_with_no_grace_uses_the_organization_grace_and_standard_hours_override(db, people):
    s = _shift(db, "Short", grace_time_minutes=0, standard_hours=6, working_days=["Mon", "Tue"])
    info = policy.shift_info(s, policy.get_policy(db, 1))
    assert (info.grace_minutes, info.standard_minutes, info.working_days) == (10, 360, ("mon", "tue"))
    assert policy.is_working_day(policy.get_policy(db, 1), info, DAY) is False             # Wednesday


def test_holidays_including_recurring_ones(db, people):
    db.add_all([Holiday(name="Founders", date=DAY, organization_id=1),
                Holiday(name="New Year", date=date(2020, 1, 1), is_recurring=True, organization_id=1),
                Holiday(name="Elsewhere", date=DAY + timedelta(days=1), organization_id=2),
                Holiday(name="Cancelled", date=DAY + timedelta(days=2), organization_id=1, is_active=False)])
    db.commit()
    assert policy.is_holiday(db, 1, DAY)
    assert policy.is_holiday(db, 1, date(2027, 1, 1))
    assert not policy.is_holiday(db, 1, DAY + timedelta(days=1))
    assert not policy.is_holiday(db, 1, DAY + timedelta(days=2))


def test_only_approved_leave_counts(db, people):
    emp = people["emp"].id
    db.add_all([LeaveRequest(employee_id=emp, organization_id=1, leave_type=LeaveType.CASUAL, start_date=DAY, end_date=DAY,
                             days=1, status=RequestStatus.PENDING),
                LeaveRequest(employee_id=emp, organization_id=1, leave_type=LeaveType.WORK_FROM_HOME, start_date=DAY + timedelta(days=1),
                             end_date=DAY + timedelta(days=2), days=2, status=RequestStatus.APPROVED)])
    db.commit()
    assert policy.approved_leave_on(db, 1, emp, DAY) is None
    assert policy.approved_leave_on(db, 1, emp, DAY + timedelta(days=2)).leave_type == "work_from_home"


def test_employment_window():
    person = SimpleNamespace(date_of_joining=date(2026, 11, 10))
    assert not policy.employed_on(person, date(2026, 11, 9))
    assert policy.employed_on(person, date(2026, 11, 10))
    assert not policy.employed_on(person, date(2026, 11, 30), exit_date=date(2026, 11, 20))


# ── backfill ───────────────────────────────────────────────────────────────────────────────────────────────────────

def test_backfill_merges_duplicates_fills_utc_and_scopes_rosters(db, people):
    emp, emp2 = people["emp"], people["emp2"]
    emp2.timezone = "Europe/London"
    old = AttendanceRecord(employee_id=emp.id, organization_id=1, date=DAY, status=AttendanceStatus.PRESENT,
                           check_in=datetime(2026, 11, 18, 9, 0), check_out=datetime(2026, 11, 18, 18, 0),
                           created_at=datetime(2026, 11, 18, 9, 0))
    new = AttendanceRecord(employee_id=emp.id, organization_id=1, date=DAY, status=AttendanceStatus.LATE,
                           check_in=datetime(2026, 11, 18, 9, 30), check_out=datetime(2026, 11, 18, 18, 0),
                           created_at=datetime(2026, 11, 18, 10, 0))
    london = AttendanceRecord(employee_id=emp2.id, organization_id=1, date=DAY, status=AttendanceStatus.PRESENT,
                              check_in=datetime(2026, 11, 18, 9, 0), check_out=datetime(2026, 11, 18, 17, 0))
    s = _shift(db, "Day")
    db.add_all([old, new, london, ShiftRoster(employee_id=emp.id, shift_id=s.id, date=DAY)])
    db.commit()
    out = backfill.run_all(db.connection())
    db.commit()
    assert out["merged"] == 1
    db.expire_all()
    assert db.get(AttendanceRecord, old.id).is_deleted is True and db.get(AttendanceRecord, new.id).is_deleted in (False, None)
    trail = db.query(AttendanceAuditLog).filter_by(attendance_id=old.id, action="merged").one()
    assert trail.after == {"kept_record_id": new.id}
    kept = db.get(AttendanceRecord, new.id)
    assert (kept.check_in_at, kept.work_date_tz, kept.worked_minutes) == (datetime(2026, 11, 18, 4, 0), "Asia/Kolkata", 510)
    assert db.get(AttendanceRecord, london.id).check_in_at == datetime(2026, 11, 18, 9, 0)        # London = UTC in November
    assert db.query(ShiftRoster).one().organization_id == 1
    assert backfill.run_all(db.connection()) == {"merged": 0, "instants": 0, "rosters": 0}     # runs again harmlessly


# ── migrations (SQLite: guarded, reversible, re-runnable) ─────────────────────────────────────────────────────────

def _run(db, module, step):
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    mod = _load(module)
    ctx = MigrationContext.configure(db.connection())
    with Operations.context(ctx):
        getattr(mod, step)()
    db.commit()


def _load(name):
    import importlib.util
    import pathlib
    path = pathlib.Path(__file__).resolve().parents[2] / "alembic" / "versions" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_migrations_downgrade_and_upgrade_cleanly_and_enforce_one_record_per_day(db, people):
    names = ("a7c1d2e3f4a0_attendance_engine_schema", "a7c1d2e3f4a1_attendance_engine_backfill",
             "a7c1d2e3f4a2_attendance_engine_constraints", "a7c1d2e3f4a3_attendance_day_closures")
    for n in reversed(names):
        _run(db, n, "downgrade")
    insp = inspect(db.get_bind())
    assert "attendance_audit_log" not in insp.get_table_names() and "attendance_day_closures" not in insp.get_table_names()
    assert "check_in_at" not in {c["name"] for c in insp.get_columns("attendance_records")}
    db.execute(text("INSERT INTO attendance_records (employee_id, organization_id, date, status, is_deleted) "
                    "VALUES (:e, 1, :d, 'PRESENT', 0), (:e, 1, :d, 'LATE', 0)"), {"e": people["emp"].id, "d": DAY})
    db.commit()
    for n in names:
        _run(db, n, "upgrade")
    for n in names:                                              # idempotent
        _run(db, n, "upgrade")
    insp = inspect(db.get_bind())
    assert "uq_attendance_emp_day" in {i["name"] for i in insp.get_indexes("attendance_records")}
    live = db.execute(text("SELECT COUNT(*) FROM attendance_records WHERE is_deleted = 0")).scalar()
    assert live == 1
    with pytest.raises(Exception):
        db.execute(text("INSERT INTO attendance_records (employee_id, organization_id, date, status, is_deleted) "
                        "VALUES (:e, 1, :d, 'PRESENT', 0)"), {"e": people["emp"].id, "d": DAY})
        db.commit()
    db.rollback()
