"""Attendance M5: the admin attendance log — server-side filters, date presets, paging and sorting; add / edit with a
required reason and a full audit trail; soft delete; the edit lock; exports that follow the filters; managers see their
team only. Organization 1 runs on Asia/Kolkata (UTC+05:30); "today" is Wednesday 18 Nov 2026."""
import csv
import io
from datetime import date, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.modules.hr import work_settings
from app.modules.hr.attendance.models import AttendanceAuditLog, AttendanceBreak
from app.modules.hr.models import AttendanceRecord, AttendanceStatus, Department

TODAY = date(2026, 11, 18)


def ist(h, m=0, day=TODAY):
    return datetime(day.year, day.month, day.day, h, m) - timedelta(hours=5, minutes=30)


@pytest.fixture(autouse=True)
def frozen(monkeypatch):
    monkeypatch.setattr("app.modules.hr.attendance.clock.utcnow", lambda: ist(20, 0))


def _rec(api, who, day, status=AttendanceStatus.PRESENT, source="web", cin=None, cout=None, worked=0):
    r = AttendanceRecord(employee_id=api.people[who].id, organization_id=1, date=day, status=status, source=source,
                         check_in=cin, check_out=cout, worked_minutes=worked)
    api.db.add(r)
    api.db.commit()
    return r


@pytest.fixture
def log(api):
    api.people["emp2"].department_id = 2              # Sales
    api.db.commit()
    rows = [
        _rec(api, "emp", TODAY, AttendanceStatus.LATE, cin=datetime(2026, 11, 18, 9, 40), cout=datetime(2026, 11, 18, 18, 0), worked=500),
        _rec(api, "emp2", TODAY, AttendanceStatus.PRESENT, source="manual"),
        _rec(api, "emp", TODAY - timedelta(days=1), AttendanceStatus.ABSENT, source="system"),
        _rec(api, "mgr", TODAY - timedelta(days=8)),
        _rec(api, "other", TODAY),                       # the other organization
    ]
    rows[4].organization_id = 2
    api.db.commit()
    return rows


def _ids(body):
    return sorted(i["id"] for i in body["items"])


# ── the log ────────────────────────────────────────────────────────────────────────────────────────────────────────

def test_rows_carry_department_hours_and_source(api, log):
    api.as_("hr")
    body = api.get("/hr/attendance/records", params={"preset": "today"}).json()
    assert body["total"] == 2
    late = next(i for i in body["items"] if i["status"] == "late")
    assert (late["department"], late["check_in_time"], late["check_out_time"], late["worked_minutes"], late["source"]) == \
        ("Engineering", "09:40", "18:00", 500, "web")
    assert late["employee_code"] == "C-emp"


@pytest.mark.parametrize("params,expected", [
    ({"preset": "yesterday"}, [2]),
    ({"preset": "this_week"}, [0, 1, 2]),                   # Mon 16 – Wed 18
    ({"preset": "this_month"}, [0, 1, 2, 3]),
    ({"date_from": "2026-11-10", "date_to": "2026-11-17"}, [2, 3]),
    ({"status": "late"}, [0]),
    ({"source": "manual"}, [1]),
    ({"department_id": 2}, [1]),
    ({"department": "Engineering"}, [0, 2, 3]),
    ({"search": "Sales"}, [1]),                             # department name
    ({"search": "C-emp2"}, [1]),                            # employee code
    ({"search": "Emp", "department": "Engineering"}, [0, 2]),   # search and department together
    # QA bug 11: a full name matches (word by word, any letter case, any order)
    ({"search": "emp2 person"}, [1]),
    ({"search": "PERSON EMP2"}, [1]),
    ({"search": "emp2 sales"}, [1]),                        # a word of the name and the department
    ({"search": "emp2 nobody"}, []),                        # every word has to match
    ({"search": "%"}, []),                                  # typed wildcards are taken literally
])
def test_filters(api, log, params, expected):
    api.as_("hr")
    assert _ids(api.get("/hr/attendance/records", params=params).json()) == sorted(log[i].id for i in expected)


def test_paging_sorting_and_bad_input(api, log):
    api.as_("hr")
    page = api.get("/hr/attendance/records", params={"per_page": 2, "page": 2, "sort_by": "date", "sort_order": "desc"}).json()
    assert (page["total"], len(page["items"]), page["page"]) == (4, 2, 2)
    assert page["items"][-1]["id"] == log[3].id
    assert api.get("/hr/attendance/records", params={"status": "nope"}).status_code == 422
    assert api.get("/hr/attendance/records", params={"date_from": "2026-11-18", "date_to": "2026-11-01"}).status_code == 422
    assert api.get("/hr/attendance/records", params={"preset": "someday"}).status_code == 422


def test_a_manager_sees_only_their_team(api, log):
    api.as_("mgr")
    assert _ids(api.get("/hr/attendance/records").json()) == sorted([log[0].id, log[2].id, log[3].id])


# ── add ────────────────────────────────────────────────────────────────────────────────────────────────────────────

def test_adding_needs_a_reason_and_writes_an_audit_entry(api):
    api.as_("hr")
    body = {"employee_id": api.people["emp"].id, "date": "2026-11-17", "check_in": "09:05", "check_out": "18:15",
            "breaks": [{"start": "13:00", "end": "13:45"}], "notes": "Paper sheet"}
    assert api.post("/hr/attendance/records", json=body).status_code == 422
    r = api.post("/hr/attendance/records", json={**body, "reason": "Badge reader was down"})
    assert r.status_code == 201, r.text
    out = r.json()
    assert (out["status"], out["check_in_at"], out["worked_minutes"], out["break_minutes"], out["source"]) == \
        ("present", "2026-11-17T03:35:00Z", 505, 45, "manual")
    assert out["breaks"] == [{"start": "13:00", "end": "13:45", "start_at": "2026-11-17T07:30:00Z", "end_at": "2026-11-17T08:15:00Z"}]
    entry = api.db.query(AttendanceAuditLog).filter_by(action="created").one()
    assert (entry.actor_id, entry.reason, entry.after["status"]) == (api.people["hr"].id, "Badge reader was down", "present")
    dup = api.post("/hr/attendance/records", json={**body, "reason": "again"})
    assert dup.status_code == 409 and dup.json()["error"] == "ATT_EXISTS" and dup.json()["record_id"] == out["id"]


def test_an_admin_set_status_is_locked_and_carries_no_times(api):
    api.as_("hr")
    out = api.post("/hr/attendance/records", json={"employee_id": api.people["emp"].id, "date": "2026-11-16", "status": "on_leave",
                                                   "check_in": "09:00", "reason": "Leave approved on paper"}).json()
    assert (out["status"], out["status_locked"], out["check_in"]) == ("on_leave", True, None)


def test_adding_is_refused_for_the_future_before_joining_and_outside_the_organization(api):
    api.as_("hr")
    base = {"reason": "test reason", "status": "present"}
    assert api.post("/hr/attendance/records", json={**base, "employee_id": api.people["emp"].id, "date": "2026-11-25"}).status_code == 422
    assert api.post("/hr/attendance/records", json={**base, "employee_id": api.people["emp"].id, "date": "2024-06-01"}).status_code == 422
    assert api.post("/hr/attendance/records", json={**base, "employee_id": api.people["other"].id, "date": "2026-11-17"}).status_code == 404
    api.as_("mgr")
    assert api.post("/hr/attendance/records", json={**base, "employee_id": api.people["emp"].id, "date": "2026-11-17"}).status_code == 403


# ── edit, delete, audit ────────────────────────────────────────────────────────────────────────────────────────────

def test_editing_records_only_the_changes_and_the_reason(api, log):
    rec = log[0]
    api.as_("hr")
    assert api.patch(f"/hr/attendance/records/{rec.id}", json={"check_in": "09:00"}).status_code == 422          # no reason
    r = api.patch(f"/hr/attendance/records/{rec.id}", json={"check_in": "09:00", "reason": "Was on time; reader lag"})
    assert r.status_code == 200, r.text
    out = r.json()
    assert (out["status"], out["late_minutes"], out["check_in_time"]) == ("present", 0, "09:00")
    entry = api.db.query(AttendanceAuditLog).filter_by(action="updated").one()
    assert entry.before["status"] == "late" and entry.after["status"] == "present"
    assert "notes" not in entry.after                                                                           # unchanged fields left out
    # PUT is the same as PATCH
    assert api.put(f"/hr/attendance/records/{rec.id}", json={"notes": "checked", "reason": "Added a note"}).json()["notes"] == "checked"


def test_unlocking_returns_to_the_computed_status(api, log):
    from app.modules.hr.attendance.models import EmployeeShift
    from app.modules.hr.models import Shift, ShiftType
    shift = Shift(name="General", shift_type=ShiftType.GENERAL, start_time="09:00", end_time="18:00", grace_time_minutes=10, organization_id=1)
    api.db.add(shift)
    api.db.commit()
    api.db.add(EmployeeShift(organization_id=1, employee_id=api.people["emp"].id, shift_id=shift.id, effective_from=date(2025, 1, 1)))
    api.db.commit()
    rec = log[0]                                                   # 09:40 against a 09:00 shift with 10 min grace
    api.as_("hr")
    api.patch(f"/hr/attendance/records/{rec.id}", json={"status": "present", "reason": "Manager confirmed"})
    out = api.patch(f"/hr/attendance/records/{rec.id}", json={"unlock_status": True, "reason": "Back to the punches"}).json()
    assert (out["status"], out["status_locked"]) == ("late", False)


def test_deleting_is_soft_needs_a_reason_and_is_audited(api, log):
    rec = log[1]
    api.as_("hr")
    assert api.delete(f"/hr/attendance/records/{rec.id}").status_code == 422
    assert api.delete(f"/hr/attendance/records/{rec.id}", params={"reason": "Entered twice"}).status_code == 200
    api.db.refresh(rec)
    assert rec.is_deleted is True
    assert api.get(f"/hr/attendance/records/{rec.id}").status_code == 404
    assert rec.id not in _ids(api.get("/hr/attendance/records").json())
    assert api.db.query(AttendanceAuditLog).filter_by(action="deleted", attendance_id=rec.id).one().reason == "Entered twice"


def test_the_audit_trail_names_who_did_what(api, log):
    rec = log[0]
    api.as_("hr")
    api.patch(f"/hr/attendance/records/{rec.id}", json={"notes": "x", "reason": "Note added"})
    trail = api.get(f"/hr/attendance/records/{rec.id}/audit").json()["items"]
    assert [(t["action"], t["actor_name"], t["reason"]) for t in trail] == [("updated", "Hr Person", "Note added")]
    api.as_("emp")
    assert api.get(f"/hr/attendance/records/{rec.id}/audit").status_code == 403


def test_the_edit_lock_blocks_old_changes(api, log):
    actor = SimpleNamespace(id=api.people["admin"].id, organization_id=1, role=api.people["admin"].role)
    work_settings.save(api.db, actor, {"edit_lock_days": 5}, "attendance")
    api.as_("hr")
    old = log[3]                                                    # 8 days ago
    r = api.patch(f"/hr/attendance/records/{old.id}", json={"notes": "late fix", "reason": "Fixing"})
    assert r.status_code == 409 and r.json()["error"] == "ATT_LOCKED"
    assert api.patch(f"/hr/attendance/records/{log[2].id}", json={"notes": "ok", "reason": "Fixing"}).status_code == 200


def test_breaks_can_be_replaced_from_the_log(api, log):
    rec = log[0]
    api.db.add(AttendanceBreak(organization_id=1, attendance_id=rec.id, start_at=ist(12, 0), end_at=ist(13, 0)))
    api.db.commit()
    api.as_("hr")
    out = api.patch(f"/hr/attendance/records/{rec.id}", json={"breaks": [{"start": "13:00", "end": "13:20"}], "reason": "Right break"}).json()
    assert out["break_minutes"] == 20 and len(out["breaks"]) == 1


# ── exports follow the filters ─────────────────────────────────────────────────────────────────────────────────────

def test_exports_follow_the_log_filters(api, log):
    api.as_("hr")
    rows = list(csv.reader(io.StringIO(api.get("/hr/attendance/export/csv", params={"status": "late"}).content.decode("utf-8-sig"))))
    assert len(rows) == 2 and rows[1][6] == "late"
    every = list(csv.reader(io.StringIO(api.get("/hr/attendance/export/csv").content.decode("utf-8-sig"))))
    assert len(every) == 5                                          # header + this organization's 4 records
    xlsx = api.get("/hr/attendance/export/excel", params={"preset": "today", "department_id": 2})
    assert xlsx.status_code == 200 and xlsx.content[:2] == b"PK"
