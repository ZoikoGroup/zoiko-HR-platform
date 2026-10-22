"""Prompt 3 working time: overtime authorization (approver ≠ requester, authorised vs unauthorised analytics), attendance
corrections (applied only after approval, originals kept), shift pattern notices in bulk and short-notice shift changes."""
from datetime import date, datetime, timedelta

from app.modules.hr import attendance_service
from app.modules.hr.models import AttendanceCorrectionRequest, AttendanceRecord, AttendanceStatus, EmployeeHistory, Shift, ShiftRoster
from tests.doc_templates.p3_support import activate, docs, text_of


def _record(world, day, cin="09:00", cout="19:00", who="a_emp"):
    rec = AttendanceRecord(employee_id=world.u[who].id, organization_id=1, date=day, status=AttendanceStatus.PRESENT,
                           check_in=datetime.combine(day, datetime.strptime(cin, "%H:%M").time()),
                           check_out=datetime.combine(day, datetime.strptime(cout, "%H:%M").time()))
    world.db.add(rec)
    world.db.commit()
    return rec


def test_overtime_needs_a_different_decider_and_feeds_authorised_analytics(world):
    activate(world.db, "HR-TIM-007")
    day = date.today() - timedelta(days=1)
    rec = _record(world, day)                                   # 10 hours worked: 2 over the standard day
    r = world.post("a_emp", "/hr/time/overtime", json={"date": day.isoformat(), "start_time": "17:00", "end_time": "18:00",
                                                       "reason": "Month-end close"})
    assert r.status_code == 201, r.text
    ot = r.json()
    assert ot["pre_approved"] is False and ot["hours"] == 1.0, "recorded afterwards: retrospective"
    assert world.post("a_emp", f"/hr/time/overtime/{ot['id']}/decision", json={"approve": True}).status_code == 403
    assert world.post("a_emp2", f"/hr/time/overtime/{ot['id']}/decision", json={"approve": True}).status_code == 404
    assert world.post("a_manager", f"/hr/time/overtime/{ot['id']}/decision", json={"approve": False}).status_code == 422
    r = world.post("a_manager", f"/hr/time/overtime/{ot['id']}/decision", json={"approve": True, "compensation_method": "time_off"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "APPROVED"
    world.db.refresh(rec)
    assert float(rec.overtime_authorized_hours) == 1.0
    t = text_of(docs(world.db, "HR-TIM-007")[0])
    assert "Overtime Authorization" in t and "Retrospective" in t and "Time off in lieu" in t and "does not change pay" in t
    stats = attendance_service.get_overtime_analytics(world.db, day, day, organization_id=1)
    assert (stats["total_hours"], stats["authorized_hours"], stats["unauthorized_hours"]) == (2.0, 1.0, 1.0)


def test_standard_workday_is_an_organization_setting(world):
    day = date.today() - timedelta(days=1)
    _record(world, day)
    assert attendance_service.get_overtime_analytics(world.db, day, day, organization_id=1)["total_hours"] == 2.0
    assert world.put("a_hr", "/hr/time/settings", json={"standard_workday_hours": 7.5}).status_code == 200
    stats = attendance_service.get_overtime_analytics(world.db, day, day, organization_id=1)
    assert stats["total_hours"] == 2.5 and stats["standard_workday_hours"] == 7.5


def test_correction_is_applied_only_after_approval_and_keeps_the_originals(world):
    activate(world.db, "HR-TIM-013")
    day = date.today() - timedelta(days=2)
    rec = _record(world, day, "09:30", "17:00")
    body = {"date": day.isoformat(), "requested_check_in": "08:30", "requested_check_out": "17:00", "reason": "forgot"}
    assert world.post("a_emp", "/hr/time/corrections", json=body).status_code == 422, "the declaration is required"
    c = world.post("a_emp", "/hr/time/corrections", json={**body, "confirm_accurate": True}).json()
    world.db.refresh(rec)
    assert rec.check_in.strftime("%H:%M") == "09:30", "nothing changes before approval"
    assert world.post("a_emp", f"/hr/time/corrections/{c['id']}/decision", json={"approve": True}).status_code == 403
    r = world.post("a_manager", f"/hr/time/corrections/{c['id']}/decision", json={"approve": True})
    assert r.status_code == 200, r.text
    world.db.refresh(rec)
    row = world.db.get(AttendanceCorrectionRequest, c["id"])
    assert rec.check_in.strftime("%H:%M") == "08:30" and row.original_check_in.strftime("%H:%M") == "09:30" and row.applied_at
    assert world.db.query(EmployeeHistory).filter_by(employee_id=world.u["a_emp"].id, field_name="attendance.check_in").count() == 1
    t = text_of(docs(world.db, "HR-TIM-013")[0])
    assert "Attendance Correction Request" in t and "09:30" in t and "08:30" in t and "original record is kept" in t


def _shift(world, name, start, end):
    s = Shift(name=name, start_time=start, end_time=end, break_duration_minutes=30, organization_id=1)
    world.db.add(s)
    world.db.commit()
    return s


def test_roster_publish_sends_one_pattern_notice_per_person_after_a_preview(world):
    activate(world.db, "HR-TIM-003")
    early = _shift(world, "Early", "06:00", "14:00")
    start = date.today() + timedelta(days=7)
    body = {"shift_id": early.id, "employee_ids": [world.u["a_emp"].id, world.u["a_emp2"].id], "start_date": start.isoformat(),
            "end_date": (start + timedelta(days=13)).isoformat(), "weekdays": [0, 1, 2, 3, 4], "location": "Leeds depot"}
    pv = world.post("a_hr", "/hr/time/rosters/publish", json={**body, "preview": True}).json()
    assert pv["preview"] and pv["blocked"] == 0 and not world.db.query(ShiftRoster).count()
    out = world.post("a_hr", "/hr/time/rosters/publish", json=body).json()["results"]
    assert len(out) == 2 and all(x["document_status"] == "ISSUED" for x in out) and out[0]["rostered_days"] == 10
    rows = world.db.query(ShiftRoster).filter_by(employee_id=world.u["a_emp"].id).all()
    assert rows and all(r.document_id and r.notified_at for r in rows)
    t = text_of(docs(world.db, "HR-TIM-003")[0])
    assert "Your shift pattern" in t and "Early" in t and "Monday" in t and "7.5" in t and "caring responsibilities" in t
    assert world.post("a_emp", "/hr/time/rosters/publish", json=body).status_code == 404


def test_short_notice_shift_change_needs_a_reason_and_an_approver(world):
    activate(world.db, "HR-TIM-004")
    early, late = _shift(world, "Early", "06:00", "14:00"), _shift(world, "Late", "14:00", "22:00")
    day = date.today() + timedelta(days=2)
    world.db.add(ShiftRoster(employee_id=world.u["a_emp"].id, shift_id=early.id, date=day, is_active=True))
    world.db.commit()
    world.put("a_hr", "/hr/time/settings", json={"shift_change_notice_days": 7})
    body = {"employee_id": world.u["a_emp"].id, "new_shift_id": late.id, "dates": [day.isoformat()], "reason": "Cover for a vacancy"}
    r = world.post("a_manager", "/hr/time/rosters/change", json=body)
    assert r.status_code == 422 and "notice" in r.text
    out = world.post("a_manager", "/hr/time/rosters/change", json={**body, "short_notice_reason": "a colleague is unexpectedly off"}).json()
    assert out["short_notice"] and out["needs_approval"], "short notice makes the notice L2"
    doc = docs(world.db, "HR-TIM-004")[0]
    assert doc.approval_policy == "L2" and doc.status == "PENDING_APPROVAL"
    t = text_of(doc)
    assert "Change to your shift" in t and "Early (06:00–14:00)" in t and "Late (14:00–22:00)" in t and "unexpectedly off" in t
