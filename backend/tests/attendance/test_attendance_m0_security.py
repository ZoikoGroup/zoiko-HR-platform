"""Attendance M0: who may create and read attendance records, shift rosters stay inside the organization, approvals
under /hr/time refresh the cached attendance pages, and the leave routes return what they really produce."""
from datetime import date, datetime, timedelta

import pytest

from app.modules.hr.models import AttendanceRecord, AttendanceStatus, Shift, ShiftType


def _record(api, who, day=None, status=AttendanceStatus.PRESENT, org=1):
    r = AttendanceRecord(employee_id=api.people[who].id, organization_id=org, date=day or date.today(), status=status)
    api.db.add(r)
    api.db.commit()
    return r


# ── creating records ───────────────────────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("who", ["emp", "mgr"])
def test_the_legacy_create_route_is_for_admins_only(api, who):
    api.as_(who)
    r = api.post("/hr/attendance", json={"employee_id": api.people["emp2"].id, "date": date.today().isoformat(), "status": "present"})
    assert r.status_code == 403
    assert api.db.query(AttendanceRecord).count() == 0


@pytest.mark.parametrize("path", ["/hr/attendance", "/hr/attendance/records"])
def test_admins_cannot_create_records_for_someone_in_another_organization(api, path):
    api.as_("hr")
    why = {"reason": "Badge reader was down"}                    # /records requires a reason since M5
    r = api.post(path, json={"employee_id": api.people["other"].id, "date": date.today().isoformat(), "status": "present", **why})
    assert r.status_code == 404
    ok = api.post(path, json={"employee_id": api.people["emp"].id, "date": date.today().isoformat(), "status": "present", **why})
    assert ok.status_code in (200, 201), ok.text


def test_an_edit_cannot_move_a_record_to_another_organizations_employee(api):
    rec = _record(api, "emp")
    api.as_("hr")
    api.put(f"/hr/attendance/records/{rec.id}", json={"employee_id": api.people["other"].id})
    api.db.refresh(rec)
    assert rec.employee_id == api.people["emp"].id and rec.organization_id == 1


# ── reading records ────────────────────────────────────────────────────────────────────────────────────────────────

def test_an_employee_reads_only_their_own_record_by_id(api):
    mine, theirs = _record(api, "emp"), _record(api, "emp2")
    api.as_("emp")
    assert api.get(f"/hr/attendance/records/{mine.id}").status_code == 200
    assert api.get(f"/hr/attendance/records/{theirs.id}").status_code == 404


def test_a_manager_sees_themselves_and_their_reports_only(api):
    for who in ("mgr", "emp", "emp2"):
        _record(api, who)
    api.as_("mgr")
    listed = {i["employee_id"] for i in api.get("/hr/attendance/records").json()["items"]}
    assert listed == {api.people["mgr"].id, api.people["emp"].id}
    plain = {i["employee_id"] for i in api.get("/hr/attendance").json()}
    assert plain == listed
    # asking for someone outside the team returns nothing, not their rows
    other = api.get("/hr/attendance/records", params={"employee_id": api.people["emp2"].id}).json()
    assert other["total"] == 0 and other["items"] == []
    own = api.get("/hr/attendance/records", params={"employee_id": api.people["mgr"].id}).json()
    assert {i["employee_id"] for i in own["items"]} == {api.people["mgr"].id}


def test_employees_get_only_their_own_rows_and_hr_gets_the_organization(api):
    for who in ("emp", "emp2", "mgr"):
        _record(api, who)
    _record(api, "other", org=2)
    api.as_("emp")
    assert {i["employee_id"] for i in api.get("/hr/attendance/records").json()["items"]} == {api.people["emp"].id}
    api.as_("hr")
    assert len(api.get("/hr/attendance/records", params={"per_page": 200}).json()["items"]) == 3


def test_a_page_of_up_to_200_records_is_returned(api):
    for i in range(130):
        _record(api, "emp", day=date.today() - timedelta(days=i))
    api.as_("emp")
    body = api.get("/hr/attendance/records", params={"employee_id": api.people["emp"].id, "per_page": 200}).json()
    assert body["total"] == 130 and len(body["items"]) == 130


# ── shift rosters ──────────────────────────────────────────────────────────────────────────────────────────────────

def test_a_roster_names_only_this_organizations_people_and_shifts(api):
    mine = Shift(name="Day", shift_type=ShiftType.GENERAL, start_time="09:00", end_time="18:00", organization_id=1)
    theirs = Shift(name="Night", shift_type=ShiftType.NIGHT, start_time="22:00", end_time="06:00", organization_id=2)
    api.db.add_all([mine, theirs])
    api.db.commit()
    api.as_("hr")
    day = date.today().isoformat()
    assert api.post("/hr/attendance/shifts/rosters", json={"employee_id": api.people["other"].id, "shift_id": mine.id, "date": day}).status_code == 404
    assert api.post("/hr/attendance/shifts/rosters", json={"employee_id": api.people["emp"].id, "shift_id": theirs.id, "date": day}).status_code == 404
    assert api.post("/hr/attendance/shifts/rosters", json={"employee_id": api.people["emp"].id, "shift_id": mine.id, "date": day}).status_code == 201


# ── cache ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def test_time_request_and_self_service_writes_refresh_cached_attendance():
    from app.core.cache_middleware import _get_invalidation_prefixes
    assert "/hr/attendance" in _get_invalidation_prefixes("/hr/time/corrections/5/decision")
    assert "/hr/attendance" in _get_invalidation_prefixes("/hr/time/overtime/5/decision")
    assert "/hr/attendance" in _get_invalidation_prefixes("/hr/me/attendance/punch-in")


# ── leave routes return the real object (they declared a {message} response and failed with 500) ──────────────────

def test_leave_create_and_read_return_the_leave(api):
    api.as_("hr")
    start = date.today() + timedelta(days=10)
    r = api.post("/hr/attendance/leaves", json={"employee_id": api.people["emp"].id, "leave_type": "casual",
                                                "start_date": start.isoformat(), "end_date": start.isoformat(), "reason": "family"})
    assert r.status_code == 201, r.text
    leave_id = r.json().get("id")
    assert leave_id
    got = api.get(f"/hr/attendance/leaves/{leave_id}")
    assert got.status_code == 200 and got.json()["id"] == leave_id
