"""My Attendance plan step 6 (admin Shifts & Work Policy): creating a shift works (it used to fail on a missing
created_by column) and carries the policy fields the engine reads; shift types are the backend's; a shift in use is
deactivated, not deleted; shift assignments (employee_shifts) are listed, created with clean overlap handling and
ended, each audited and notified; roster changes notify the person too."""
from datetime import date

from app.modules.hr.attendance.models import AttendanceAuditLog, EmployeeShift
from app.modules.hr.models import AttendanceRecord, AttendanceStatus, Shift, ShiftType

BODY = {"name": "Early", "shift_type": "morning", "start_time": "07:00", "end_time": "15:30", "grace_time_minutes": 5,
        "break_duration_minutes": 30}


def _notified(api, who):
    from app.modules.super_admin.models import Notification, NotificationTarget
    return [n.title for n in api.db.query(Notification).join(NotificationTarget, NotificationTarget.notification_id == Notification.id)
            .filter(NotificationTarget.kind == "user", NotificationTarget.ref == str(api.people[who].id))]


def _shift(api, name="General", start="09:00", end="18:00"):
    s = Shift(name=name, shift_type=ShiftType.GENERAL, start_time=start, end_time=end, organization_id=1)
    api.db.add(s)
    api.db.commit()
    return s


def test_creating_a_shift_works_and_keeps_the_policy_fields(api):
    api.as_("hr")
    r = api.post("/hr/attendance/shifts", json={**BODY, "standard_hours": 7.5, "working_days": ["Mon", "tue", "WED", "thu", "fri", "sat"],
                                                "half_day_min_minutes": 210, "min_present_minutes": 60})
    assert r.status_code == 201, r.text
    body = r.json()
    assert (body["standard_hours"], body["working_days"], body["half_day_min_minutes"], body["min_present_minutes"]) == (
        7.5, ["mon", "tue", "wed", "thu", "fri", "sat"], 210, 60)
    r = api.put(f"/hr/attendance/shifts/{body['id']}", json={"working_days": ["sun", "mon"], "standard_hours": 8})
    assert r.status_code == 200 and r.json()["working_days"] == ["mon", "sun"] and r.json()["standard_hours"] == 8


def test_shift_types_and_days_are_checked(api):
    api.as_("hr")
    assert api.post("/hr/attendance/shifts", json={**BODY, "shift_type": "rotational"}).status_code == 422
    assert api.post("/hr/attendance/shifts", json={**BODY, "shift_type": "flexi"}).status_code == 201
    assert api.post("/hr/attendance/shifts", json={**BODY, "working_days": ["funday"]}).status_code == 422
    assert api.post("/hr/attendance/shifts", json={**BODY, "standard_hours": 30}).status_code == 422


def test_a_shift_in_use_is_deactivated_not_deleted(api):
    used, unused = _shift(api, "Used"), _shift(api, "Unused")
    api.db.add(AttendanceRecord(employee_id=api.people["emp"].id, organization_id=1, date=date(2026, 11, 2),
                                status=AttendanceStatus.PRESENT, shift_id=used.id))
    api.db.commit()
    api.as_("hr")
    r = api.delete(f"/hr/attendance/shifts/{used.id}")
    assert r.status_code == 409 and "Deactivate it instead" in r.json()["message"]
    assert api.put(f"/hr/attendance/shifts/{used.id}", json={"is_active": False}).json()["is_active"] is False
    assert api.delete(f"/hr/attendance/shifts/{unused.id}").status_code == 200


def test_assigning_a_shift_to_people_and_a_department(api):
    s = _shift(api)
    api.as_("hr")
    r = api.post("/hr/attendance/shift-assignments", json={"shift_id": s.id, "effective_from": "2026-12-01",
                                                          "employee_ids": [api.people["emp"].id], "department_id": 1})
    assert r.status_code == 201, r.text
    people = {i["employee"]["id"] for i in r.json()["items"]}
    assert api.people["emp"].id in people and api.people["emp2"].id in people          # emp2 via the department
    assert all(i["effective_from"] == "2026-12-01" and i["effective_to"] is None for i in r.json()["items"])
    assert "Your shift" in _notified(api, "emp")
    assert api.db.query(AttendanceAuditLog).filter_by(action="shift_assigned", employee_id=api.people["emp"].id).count() == 1
    listed = api.get("/hr/attendance/shift-assignments", params={"active_on": "2026-12-15"}).json()
    assert listed["total"] == len(people)
    assert api.get("/hr/attendance/shift-assignments", params={"active_on": "2026-11-15"}).json()["total"] == 0


def test_a_new_assignment_ends_the_running_one_and_its_remainder_continues(api):
    day, night = _shift(api, "Day"), _shift(api, "Night", "21:00", "06:00")
    emp = api.people["emp"]
    api.db.add(EmployeeShift(organization_id=1, employee_id=emp.id, shift_id=day.id, effective_from=date(2026, 1, 1)))
    api.db.commit()
    api.as_("hr")
    r = api.post("/hr/attendance/shift-assignments", json={"shift_id": night.id, "effective_from": "2026-12-07",
                                                          "effective_to": "2026-12-13", "employee_ids": [emp.id]})
    assert r.status_code == 201, r.text
    rows = sorted(((x.effective_from, x.effective_to, x.shift_id) for x in api.db.query(EmployeeShift).filter_by(employee_id=emp.id)),
                  key=lambda t: t[0])
    assert rows == [(date(2026, 1, 1), date(2026, 12, 6), day.id), (date(2026, 12, 7), date(2026, 12, 13), night.id),
                    (date(2026, 12, 14), None, day.id)]


def test_an_assignment_that_starts_inside_the_new_period_is_not_overwritten(api):
    day, night = _shift(api, "Day"), _shift(api, "Night", "21:00", "06:00")
    emp = api.people["emp"]
    api.db.add(EmployeeShift(organization_id=1, employee_id=emp.id, shift_id=day.id, effective_from=date(2026, 12, 10)))
    api.db.commit()
    api.as_("hr")
    r = api.post("/hr/attendance/shift-assignments", json={"shift_id": night.id, "effective_from": "2026-12-01", "employee_ids": [emp.id]})
    assert r.status_code == 409 and "already has a shift from 2026-12-10" in r.json()["message"]
    assert api.db.query(EmployeeShift).filter_by(employee_id=emp.id).count() == 1     # nothing half-done


def test_ending_an_assignment(api):
    s = _shift(api)
    emp = api.people["emp"]
    row = EmployeeShift(organization_id=1, employee_id=emp.id, shift_id=s.id, effective_from=date(2026, 12, 1))
    api.db.add(row)
    api.db.commit()
    api.as_("hr")
    assert api.post(f"/hr/attendance/shift-assignments/{row.id}/end", json={"effective_to": "2026-11-30"}).status_code == 400
    r = api.post(f"/hr/attendance/shift-assignments/{row.id}/end", json={"effective_to": "2026-12-31"})
    assert r.status_code == 200 and r.json()["effective_to"] == "2026-12-31"
    assert "Your shift is changing" in _notified(api, "emp")
    assert api.db.query(AttendanceAuditLog).filter_by(action="shift_ended", employee_id=emp.id).count() == 1


def test_only_admins_manage_assignments_and_other_organizations_are_invisible(api):
    s = _shift(api)
    api.as_("emp")
    assert api.get("/hr/attendance/shift-assignments").status_code == 403
    assert api.post("/hr/attendance/shift-assignments", json={"shift_id": s.id, "effective_from": "2026-12-01",
                                                             "employee_ids": [api.people["emp"].id]}).status_code == 403
    api.as_("hr")
    r = api.post("/hr/attendance/shift-assignments", json={"shift_id": s.id, "effective_from": "2026-12-01",
                                                          "employee_ids": [api.people["other"].id]})
    assert r.status_code == 400 and "not active employees of this organization" in r.json()["message"]


def test_a_roster_change_notifies_the_person(api, monkeypatch):
    from app.modules.hr import time_documents
    day, night = _shift(api, "Day"), _shift(api, "Night", "21:00", "06:00")
    monkeypatch.setattr(time_documents, "_try_generate", lambda *a, **k: None)          # no HR-TIM template released
    api.as_("hr")
    r = api.post("/hr/time/rosters/change", json={"employee_id": api.people["emp"].id, "new_shift_id": night.id,
                                                  "dates": ["2027-01-10"], "reason": "Cover the night desk"})
    assert r.status_code in (200, 201), r.text
    assert "Your shift is changing" in _notified(api, "emp")
