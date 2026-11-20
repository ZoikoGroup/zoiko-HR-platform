"""Learning fix batch 2 of the Assets / Learning / Travel audit. Real sign-in tokens and two organizations (the privacy `world`).

  - L5  a course or program that other records point at is refused with a 400 naming what holds it (never a 500)
  - L7  essays are not auto-marked: a quiz with an essay waits for review, and an admin grades it
  - L8  opening a quiz again resumes the unsubmitted attempt; an abandoned attempt does not use up a try
  - L9  course and program lists page on the server past 100 rows and search on the server
  - L10 the certification report (and its exports) name every holder, whatever their role
"""
import csv
import io
import json
from datetime import date, timedelta

from app.modules.hr.models import (
    LearningCertification, LearningCourse, LearningEnrollment, LearningQuizAttempt, LearningTrainingProgram,
)

L = "/hr/learning"
COURSE = {"description": "d", "course_type": "online", "category": "Compliance", "provider": "Internal", "duration_hours": 2}


def _course(w, name="Safety", **extra):
    r = w.post("a_admin", f"{L}/courses", json={**COURSE, "course_name": name, **extra})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _program(w, name="Bootcamp"):
    start = date.today() + timedelta(days=5)
    r = w.post("a_admin", f"{L}/programs", json={"name": name, "description": "d", "instructor_id": w.u["a_admin"].id,
                                                 "start_date": str(start), "end_date": str(start + timedelta(days=2)), "max_participants": 5})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _assessment(w, cid, title="Quiz", max_attempts=None, passing=50):
    body = {"course_id": cid, "title": title, "description": "d", "passing_score": passing}
    if max_attempts:
        body["max_attempts"] = max_attempts
    r = w.post("a_admin", f"{L}/assessments", json=body)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _question(w, aid, **q):
    r = w.post("a_admin", f"{L}/assessments/{aid}/questions", json={"question_text": "Q?", "points": 1, **q})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _start(w, who, aid):
    r = w.post(who, f"{L}/assessments/start", json={"assessment_id": aid, "employee_id": w.u[who].id})
    return r


def _submit(w, who, aid, attempt_id, answers):
    return w.post(who, f"{L}/assessments/{aid}/attempts/{attempt_id}/submit", json={"answers": json.dumps(answers)})


# ── L5 ────────────────────────────────────────────────────────────────────────

def test_a_course_with_an_assessment_or_event_is_refused_clearly_and_kept(world):
    cid = _course(world)
    _assessment(world, cid)
    ev = world.post("a_admin", f"{L}/calendar", json={"title": "Kick-off", "event_date": str(date.today()), "course_id": cid})
    assert ev.status_code == 201, ev.text
    r = world.delete("a_admin", f"{L}/courses/{cid}")
    assert r.status_code == 400, r.text
    assert "1 assessment" in r.text and "1 calendar event" in r.text and "Inactive" in r.text
    assert world.db.query(LearningCourse).filter_by(id=cid).count() == 1

    world.db.add(LearningEnrollment(course_id=cid, employee_id=world.u["a_emp1"].id, organization_id=1, status="enrolled"))
    world.db.commit()
    r = world.delete("a_admin", f"{L}/courses/{cid}")
    assert r.status_code == 400 and "1 enrollment, 1 assessment and 1 calendar event" in r.text

    free = _course(world, name="Unused")
    assert world.delete("a_admin", f"{L}/courses/{free}").status_code == 200


def test_a_program_with_a_calendar_event_is_refused_clearly_and_kept(world):
    pid = _program(world)
    from app.modules.hr.models import LearningCalendarEvent
    world.db.add(LearningCalendarEvent(title="Day 1", event_date=date.today(), program_id=pid, organization_id=1))
    world.db.commit()
    r = world.delete("a_admin", f"{L}/programs/{pid}")
    assert r.status_code == 400, r.text
    assert "1 calendar event" in r.text and "Cancelled" in r.text
    assert world.db.query(LearningTrainingProgram).filter_by(id=pid).count() == 1
    free = _program(world, name="Free")
    assert world.delete("a_admin", f"{L}/programs/{free}").status_code == 200


# ── L7 ────────────────────────────────────────────────────────────────────────

def _essay_quiz(w):
    cid = _course(w, name="Essay course")
    aid = _assessment(w, cid, passing=60)
    mc = _question(w, aid, question_type="multiple_choice", options=["3", "4"], correct_answer="4", points=2)
    essay = _question(w, aid, question_type="essay", question_text="Explain.", points=3)
    return aid, mc, essay


def test_an_essay_quiz_waits_for_review_and_an_admin_grades_it(world):
    aid, mc, essay = _essay_quiz(world)
    att = _start(world, "a_emp1", aid).json()
    # a learner cannot award themselves points for the essay
    done = _submit(world, "a_emp1", aid, att["id"], [{"question_id": mc, "answer": "4"},
                                                      {"question_id": essay, "answer": "Because.", "awarded_points": 3}])
    assert done.status_code == 200, done.text
    body = done.json()
    assert body["status"] == "pending_review" and body["score"] is None and body["passed"] is None
    # submitted once is submitted: it cannot be sent again while it waits
    assert _submit(world, "a_emp1", aid, att["id"], [{"question_id": mc, "answer": "4"}]).status_code == 400

    grade = f"{L}/assessments/attempts/{att['id']}/grade"
    # only an admin of the same organization grades
    assert world.post("a_emp1", grade, json={"essay_points": {str(essay): 3}}).status_code == 403
    assert world.post("a_manager", grade, json={"essay_points": {str(essay): 3}}).status_code == 403
    assert world.post("b_admin", grade, json={"essay_points": {str(essay): 3}}).status_code == 404
    # the points must be within the question's maximum, and only for essay questions
    assert world.post("a_admin", grade, json={"essay_points": {str(essay): 4}}).status_code == 400
    assert world.post("a_admin", grade, json={"essay_points": {str(mc): 1, str(essay): 1}}).status_code == 400
    assert world.post("a_admin", grade, json={"essay_points": {}}).status_code == 400

    r = world.post("a_hr", grade, json={"essay_points": {str(essay): 1}})
    assert r.status_code == 200, r.text
    graded = r.json()
    assert graded["status"] == "completed" and graded["score"] == 60 and graded["passed"] is True   # (2 + 1) / 5
    stored = json.loads(graded["answers"])
    assert {e["question_id"]: e.get("awarded_points") for e in stored}[essay] == 1
    # graded once: a second grading is refused
    assert world.post("a_admin", grade, json={"essay_points": {str(essay): 3}}).status_code == 400


def test_a_quiz_without_essays_is_still_scored_at_once(world):
    cid = _course(world, name="Plain")
    aid = _assessment(world, cid, passing=50)
    q1 = _question(world, aid, question_type="multiple_choice", options=["a", "b"], correct_answer="a", points=1)
    q2 = _question(world, aid, question_type="true_false", correct_answer="True", points=1)
    att = _start(world, "a_emp1", aid).json()
    done = _submit(world, "a_emp1", aid, att["id"], [{"question_id": q1, "answer": "a"}, {"question_id": q2, "answer": "False"}]).json()
    assert (done["status"], done["score"], done["passed"]) == ("completed", 50, True)
    # a completed attempt cannot be "graded"
    assert world.post("a_admin", f"{L}/assessments/attempts/{att['id']}/grade", json={"essay_points": {}}).status_code == 400


# ── L8 ────────────────────────────────────────────────────────────────────────

def test_opening_a_quiz_twice_resumes_the_same_attempt_and_abandoned_ones_do_not_use_a_try(world):
    cid = _course(world, name="Resume")
    aid = _assessment(world, cid, max_attempts=1)
    q = _question(world, aid, question_type="multiple_choice", options=["a", "b"], correct_answer="a")
    first = _start(world, "a_emp1", aid)
    second = _start(world, "a_emp1", aid)                         # a reload / StrictMode's second effect
    assert first.status_code == 201 and second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    assert world.db.query(LearningQuizAttempt).filter_by(assessment_id=aid, employee_id=world.u["a_emp1"].id).count() == 1
    # another learner gets their own attempt
    assert _start(world, "a_emp2", aid).json()["id"] != first.json()["id"]

    # the one allowed try is used only when it is submitted
    assert _submit(world, "a_emp1", aid, first.json()["id"], [{"question_id": q, "answer": "b"}]).status_code == 200
    again = _start(world, "a_emp1", aid)
    assert again.status_code == 400 and "Maximum number of attempts" in again.text


def test_old_abandoned_attempts_do_not_count_against_the_limit(world):
    cid = _course(world, name="Legacy")
    aid = _assessment(world, cid, max_attempts=2)
    _question(world, aid, question_type="multiple_choice", options=["a", "b"], correct_answer="a")
    emp = world.u["a_emp1"].id
    # two never-submitted attempts left behind before this fix (e.g. StrictMode)
    world.db.add_all([LearningQuizAttempt(assessment_id=aid, employee_id=emp, organization_id=1, attempt_number=n, status="in_progress")
                      for n in (1, 2)])
    world.db.commit()
    resumed = _start(world, "a_emp1", aid).json()
    assert resumed["attempt_number"] == 2                         # the latest open attempt is resumed, no third is made
    assert world.db.query(LearningQuizAttempt).filter_by(assessment_id=aid, employee_id=emp).count() == 2


# ── L9 ────────────────────────────────────────────────────────────────────────

def test_course_and_program_lists_page_past_100_on_the_server(world):
    world.db.add_all([LearningCourse(course_name=f"Course {i:03d}", organization_id=1, status="active", category="Cat" + str(i % 3),
                                     description="d", provider="p", course_type="online", duration_hours=1) for i in range(130)])
    world.db.add(LearningCourse(course_name="Half done", organization_id=1, status="active"))
    world.db.add(LearningCourse(course_name="Other org", organization_id=2, status="active", category="Secret"))
    world.db.commit()
    page = world.get("a_admin", f"{L}/courses", params={"per_page": 200}).json()
    assert page["total"] == 131 and len(page["items"]) == 131                # no silent cut at 100
    assert page["catalog_total"] == 131 and page["incomplete"] == 1
    assert page["categories"] == ["Cat0", "Cat1", "Cat2"]                   # another organization's never leak in
    p2 = world.get("a_admin", f"{L}/courses", params={"per_page": 50, "page": 3}).json()
    assert (p2["total"], len(p2["items"]), p2["page"]) == (131, 31, 3)
    found = world.get("a_admin", f"{L}/courses", params={"search": "course 12"}).json()
    assert sorted(c["course_name"] for c in found["items"]) == [f"Course {i}" for i in range(120, 130)]
    assert world.get("a_admin", f"{L}/courses", params={"search": "cat1", "per_page": 200}).json()["total"] == 43

    start = date.today() + timedelta(days=3)
    world.db.add_all([LearningTrainingProgram(name=f"Program {i:03d}", organization_id=1, status="planned", start_date=start,
                                              end_date=start, description="d", instructor_id=world.u["a_hr"].id, max_participants=3)
                      for i in range(110)])
    world.db.commit()
    progs = world.get("a_admin", f"{L}/programs", params={"per_page": 200}).json()
    assert progs["total"] == 110 and len(progs["items"]) == 110
    assert progs["summary"]["planned"] == 110 and progs["summary"]["incomplete"] == 0
    by_instructor = world.get("a_admin", f"{L}/programs", params={"search": "HrAlpha", "per_page": 5}).json()
    assert by_instructor["total"] == 110 and len(by_instructor["items"]) == 5


# ── L10 ───────────────────────────────────────────────────────────────────────

def test_the_certification_report_names_every_holder_of_any_role(world):
    for who in ("a_admin", "a_hr", "a_manager", "a_emp1"):
        world.db.add(LearningCertification(employee_id=world.u[who].id, organization_id=1, certification_name=f"Cert-{who}", issue_date=date.today()))
    world.db.add(LearningCertification(employee_id=world.u["b_emp1"].id, organization_id=2, certification_name="Cert-b", issue_date=date.today()))
    world.db.commit()
    rows = world.get("a_hr", f"{L}/reports/certifications").json()
    names = {r["certification_name"]: r["employee_name"] for r in rows}
    assert names == {"Cert-a_admin": "AdminAlpha ZZADMINA", "Cert-a_hr": "HrAlpha ZZHRA", "Cert-a_manager": "MgrAlpha ZZMGRA",
                     "Cert-a_emp1": f"{world.u['a_emp1'].first_name} {world.u['a_emp1'].last_name}"}
    # the paged list carries the name too, and the exports have a name column
    paged = world.get("a_admin", f"{L}/certifications", params={"page": 1, "per_page": 2}).json()
    assert paged["total"] == 4 and all(r["employee_name"] for r in paged["items"])
    exported = list(csv.reader(io.StringIO(world.get("a_admin", f"{L}/reports/certifications/csv").text)))
    assert exported[0][-1] == "Employee Name"                            # appended, existing columns keep their place
    assert "MgrAlpha ZZMGRA" in {r[-1] for r in exported[1:]}
    assert world.get("a_admin", f"{L}/reports/certifications/excel").status_code == 200
    # still admin only
    assert world.get("a_manager", f"{L}/reports/certifications").status_code == 403
