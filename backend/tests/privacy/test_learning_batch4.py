"""Learning fix batch 4 of the Assets / Learning / Travel audit (real sign-in tokens, two organizations: the privacy `world`).

  - L12 the course completion report and its exports can be limited to enrollments made in a period; the CSV is quoted
        properly and formula-like cells stay neutralised; the Excel export is a real workbook
  - L13 the dashboard counts attempts awaiting review apart from attempts still in progress
  - L15 Learning text and number fields are held to their database column sizes (a 422 instead of a PostgreSQL 500)
"""
import csv
import io
from datetime import date, datetime, timedelta

import pytest

from app.modules.hr.models import LearningCourse, LearningEnrollment, LearningQuizAttempt

L = "/hr/learning"
COURSE = {"description": "d", "course_type": "online", "category": "Compliance", "provider": "Internal", "duration_hours": 2}


def _course(w, name="Safety", **extra):
    r = w.post("a_admin", f"{L}/courses", json={**COURSE, "course_name": name, **extra})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _enroll(w, cid, who, when, status="enrolled"):
    w.db.add(LearningEnrollment(course_id=cid, employee_id=w.u[who].id, organization_id=1, status=status, enrolled_at=when))
    w.db.commit()


# ── L12 ─────────────────────────────────────────────────────────────────────────────

def test_the_completion_report_and_its_exports_follow_the_chosen_period(world):
    cid = _course(world, name='Safety, Level "1"')
    risky = _course(world, name="=HYPERLINK(1)")
    today = datetime.utcnow().replace(hour=12)
    _enroll(world, cid, "a_emp1", today - timedelta(days=400), status="completed")
    _enroll(world, cid, "a_emp2", today - timedelta(days=3), status="completed")
    _enroll(world, cid, "a_manager", today - timedelta(days=1))
    _enroll(world, risky, "a_emp1", today - timedelta(days=2))

    rows = {r["course_name"]: r for r in world.get("a_admin", f"{L}/reports/course-completion").json()}
    assert (rows['Safety, Level "1"']["total_enrollments"], rows['Safety, Level "1"']["completed"]) == (3, 2)
    since = str((today - timedelta(days=30)).date())
    recent = {r["course_name"]: r for r in world.get("a_admin", f"{L}/reports/course-completion", params={"start_date": since}).json()}
    assert (recent['Safety, Level "1"']["total_enrollments"], recent['Safety, Level "1"']["completed"]) == (2, 1)
    assert recent['Safety, Level "1"']["completion_rate"] == 50.0
    only_old = world.get("a_admin", f"{L}/reports/course-completion",
                         params={"end_date": str((today - timedelta(days=100)).date())}).json()
    assert {r["course_name"]: r["total_enrollments"] for r in only_old} == {'Safety, Level "1"': 1, "=HYPERLINK(1)": 0}
    # the end day itself is included
    one_day = world.get("a_admin", f"{L}/reports/course-completion",
                        params={"start_date": str((today - timedelta(days=1)).date()), "end_date": str((today - timedelta(days=1)).date())}).json()
    assert {r["course_name"]: r["total_enrollments"] for r in one_day}['Safety, Level "1"'] == 1
    bad = world.get("a_admin", f"{L}/reports/course-completion", params={"start_date": str(today.date()), "end_date": since})
    assert bad.status_code == 400 and "end date" in bad.text

    exported = world.get("a_admin", f"{L}/reports/course-completion/csv", params={"start_date": since})
    assert exported.status_code == 200
    parsed = list(csv.reader(io.StringIO(exported.text)))
    assert parsed[0] == ["Course ID", "Course Name", "Total Enrollments", "Completed Enrollments", "Completion Rate"]
    by_name = {r[1]: r for r in parsed[1:]}
    assert by_name['Safety, Level "1"'][2:] == ["2", "1", "50.0%"]                # a comma and quotes stay inside one cell
    assert '"Safety, Level ""1"""' in exported.text
    assert "'=HYPERLINK(1)" in by_name                                          # a formula-looking name is neutralised

    from openpyxl import load_workbook
    xlsx = world.get("a_admin", f"{L}/reports/course-completion/excel", params={"start_date": since})
    assert xlsx.status_code == 200 and "spreadsheetml" in xlsx.headers["content-type"]
    sheet = load_workbook(io.BytesIO(xlsx.content)).active
    cells = {r[1]: r for r in sheet.iter_rows(min_row=2, values_only=True)}
    assert cells['Safety, Level "1"'][2:4] == (2, 1)
    assert "'=HYPERLINK(1)" in cells
    assert world.get("a_manager", f"{L}/reports/course-completion/csv", params={"start_date": since}).status_code == 403


# ── L13 ─────────────────────────────────────────────────────────────────────────────

def test_the_dashboard_counts_attempts_awaiting_review_apart_from_those_in_progress(world):
    cid = _course(world)
    aid = world.post("a_admin", f"{L}/assessments", json={"course_id": cid, "title": "Q", "description": "d", "passing_score": 50}).json()["id"]
    emp = world.u["a_emp1"].id
    world.db.add_all([
        LearningQuizAttempt(assessment_id=aid, employee_id=emp, organization_id=1, attempt_number=1, status="pending_review"),
        LearningQuizAttempt(assessment_id=aid, employee_id=emp, organization_id=1, attempt_number=2, status="pending_review"),
        LearningQuizAttempt(assessment_id=aid, employee_id=world.u["a_emp2"].id, organization_id=1, attempt_number=1, status="in_progress"),
        LearningQuizAttempt(assessment_id=aid, employee_id=world.u["a_emp2"].id, organization_id=1, attempt_number=2, status="completed"),
    ])
    world.db.commit()
    body = world.get("a_hr", f"{L}/dashboard").json()
    assert (body["awaiting_review"], body["in_progress_attempts"], body["pending_assessments"]) == (2, 1, 2)
    assert world.get("b_admin", f"{L}/dashboard").json()["awaiting_review"] == 0


# ── L15 ─────────────────────────────────────────────────────────────────────────────

def _errors(r):
    assert r.status_code == 422, r.text
    return r.text


def test_course_cost_fits_its_numeric_column(world):
    assert "8 digits before the decimal point" in _errors(world.post("a_admin", f"{L}/courses", json={**COURSE, "course_name": "Big", "cost": "123456789.00"}))
    assert "decimal" in _errors(world.post("a_admin", f"{L}/courses", json={**COURSE, "course_name": "Odd", "cost": "1.234"}))
    cid = _course(world, name="Fine", cost="99999999.99")
    _errors(world.put("a_admin", f"{L}/courses/{cid}", json={"cost": "100000000"}))
    _errors(world.put("a_admin", f"{L}/courses/{cid}", json={"version": "v" * 41}))
    assert world.put("a_admin", f"{L}/courses/{cid}", json={"cost": "10.50", "version": "2026.1"}).status_code == 200


def test_question_answers_and_options_fit_their_column(world):
    cid = _course(world)
    aid = world.post("a_admin", f"{L}/assessments", json={"course_id": cid, "title": "Q", "description": "d", "passing_score": 50}).json()["id"]
    url = f"{L}/assessments/{aid}/questions"
    assert "at most 500" in _errors(world.post("a_admin", url, json={"question_text": "Q?", "question_type": "short_answer", "points": 1, "correct_answer": "a" * 501}))
    assert "at most 500" in _errors(world.post("a_admin", url, json={"question_text": "Q?", "question_type": "multiple_choice", "points": 1,
                                                                    "options": ["x" * 501, "y"], "correct_answer": "y"}))
    ok = world.post("a_admin", url, json={"question_text": "Q?", "question_type": "short_answer", "points": 1, "correct_answer": "a" * 500})
    assert ok.status_code == 201, ok.text
    edited = world.put("a_admin", f"{url}/{ok.json()['id']}", json={"correct_answer": "b" * 501})
    assert edited.status_code == 400 and "at most 500" in edited.text                  # the service re-checks a merged edit


def test_record_statuses_and_texts_fit_their_columns(world):
    cid = _course(world)
    emp = world.u["a_emp1"].id
    _errors(world.post("a_admin", f"{L}/enrollments", json={"course_id": cid, "employee_id": emp, "notes": "n" * 2001}))
    eid = world.post("a_admin", f"{L}/enrollments", json={"course_id": cid, "employee_id": emp}).json()["id"]
    _errors(world.put("a_admin", f"{L}/enrollments/{eid}", json={"notes": "n" * 2001}))

    _errors(world.post("a_admin", f"{L}/certifications", json={"employee_id": emp, "certification_name": "C", "issue_date": str(date.today()), "status": "x" * 30}))
    cert = world.post("a_admin", f"{L}/certifications", json={"employee_id": emp, "certification_name": "C", "issue_date": str(date.today()), "status": "Expired"})
    assert cert.status_code == 201 and cert.json()["status"] == "expired"
    for field, value in (("issuing_organization", "o" * 201), ("credential_url", "https://x/" + "u" * 500), ("status", "pending")):
        _errors(world.put("a_admin", f"{L}/certifications/{cert.json()['id']}", json={field: value}))

    skill = world.post("a_admin", f"{L}/skills", json={"employee_id": emp, "skill_name": "Excel"}).json()["id"]
    _errors(world.put("a_admin", f"{L}/skills/{skill}", json={"category": "c" * 101}))

    start = date.today() + timedelta(days=5)
    pid = world.post("a_admin", f"{L}/programs", json={"name": "P", "description": "d", "instructor_id": world.u["a_admin"].id,
                                                       "start_date": str(start), "end_date": str(start), "max_participants": 3}).json()["id"]
    part = world.post("a_admin", f"{L}/programs/{pid}/assignments", json={"employee_id": emp}).json()["id"]
    _errors(world.put("a_admin", f"{L}/programs/{pid}/assignments/{part}", json={"status": "s" * 30}))
    done = world.put("a_admin", f"{L}/programs/{pid}/assignments/{part}", json={"status": "Attended"})
    assert done.status_code == 200 and done.json()["status"] == "attended"

    _errors(world.post("a_admin", f"{L}/calendar", json={"title": "T", "event_date": str(date.today()), "event_type": "e" * 51}))
    _errors(world.post("a_admin", f"{L}/calendar", json={"title": "T", "event_date": str(date.today()), "description": "d" * 5001}))
    ev = world.post("a_admin", f"{L}/calendar", json={"title": "T", "event_date": str(date.today())})
    assert ev.status_code == 201, ev.text
    _errors(world.put("a_admin", f"{L}/calendar/{ev.json()['id']}", json={"location": "l" * 201}))

    _errors(world.post("a_admin", f"{L}/paths", json={"name": "Path", "description": "d" * 5001}))
