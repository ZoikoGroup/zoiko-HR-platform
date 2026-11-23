"""Learning fix batch 3 of the Assets / Learning / Travel audit: the record management screens (L4) and the essay review queue.

Real sign-in tokens and two organizations (the privacy `world`).
  - enrolling: one enrollment per person and course (409), a learner enrolls only themselves and only in an active course,
    status changes are checked and stamp the dates, and an enrollment with quiz attempts is kept
  - editing or removing an enrollment, certification or program participant stays inside the caller's organization
    (and, for participants, under the program in the URL)
  - skills name their holder
  - the review queue lists attempts waiting for essay grading, admin only, this organization only
"""
import json
from datetime import date, timedelta

from app.modules.hr.models import LearningCertification, LearningEnrollment, LearningQuizAttempt, LearningSkill

L = "/hr/learning"
COURSE = {"description": "d", "course_type": "online", "category": "Compliance", "provider": "Internal", "duration_hours": 2}


def _course(w, name="Safety", who="a_admin"):
    r = w.post(who, f"{L}/courses", json={**COURSE, "course_name": name})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _program(w, name="Bootcamp", who="a_admin", instructor="a_admin", capacity=5):
    start = date.today() + timedelta(days=5)
    r = w.post(who, f"{L}/programs", json={"name": name, "description": "d", "instructor_id": w.u[instructor].id,
                                          "start_date": str(start), "end_date": str(start + timedelta(days=2)), "max_participants": capacity})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_a_learner_enrolls_themselves_once_and_only_in_an_active_course(world):
    cid = _course(world)
    me = world.u["a_emp1"].id
    assert world.post("a_emp1", f"{L}/enrollments", json={"course_id": cid, "employee_id": world.u["a_emp2"].id}).status_code == 403
    r = world.post("a_emp1", f"{L}/enrollments", json={"course_id": cid, "employee_id": me})
    assert r.status_code == 201, r.text
    assert r.json()["employee_id"] == me
    again = world.post("a_emp1", f"{L}/enrollments", json={"course_id": cid, "employee_id": me})
    assert again.status_code == 409 and "already enrolled" in again.text

    hidden = _course(world, name="Draft")
    assert world.put("a_admin", f"{L}/courses/{hidden}", json={"status": "inactive"}).status_code == 200
    closed = world.post("a_emp1", f"{L}/enrollments", json={"course_id": hidden, "employee_id": me})
    assert closed.status_code == 400 and "not open for enrollment" in closed.text
    # an admin may still enroll people in it, once
    assert world.post("a_hr", f"{L}/enrollments", json={"course_id": hidden, "employee_id": world.u["a_emp2"].id}).status_code == 201
    assert world.post("a_admin", f"{L}/enrollments", json={"course_id": hidden, "employee_id": world.u["a_emp2"].id}).status_code == 409
    # another organization's person cannot be enrolled
    assert world.post("a_admin", f"{L}/enrollments", json={"course_id": cid, "employee_id": world.u["b_emp1"].id}).status_code == 404


def test_enrollment_status_changes_are_checked_stamped_and_stay_in_the_organization(world):
    cid = _course(world)
    eid = world.post("a_admin", f"{L}/enrollments", json={"course_id": cid, "employee_id": world.u["a_emp1"].id}).json()["id"]
    assert world.put("a_admin", f"{L}/enrollments/{eid}", json={"status": "finished"}).status_code == 422
    done = world.put("a_admin", f"{L}/enrollments/{eid}", json={"status": "Completed"})
    assert done.status_code == 200, done.text
    body = done.json()
    assert body["status"] == "completed" and body["progress_pct"] == 100 and body["completed_at"] and body["started_at"]
    back = world.put("a_admin", f"{L}/enrollments/{eid}", json={"status": "in_progress", "progress_pct": 40}).json()
    assert back["completed_at"] is None and back["progress_pct"] == 40

    # another organization's admin can neither change nor remove it
    assert world.put("b_admin", f"{L}/enrollments/{eid}", json={"status": "dropped"}).status_code == 404
    assert world.delete("b_admin", f"{L}/enrollments/{eid}").status_code == 404
    assert world.put("a_emp1", f"{L}/enrollments/{eid}", json={"status": "dropped"}).status_code == 403
    assert world.db.get(LearningEnrollment, eid).status == "in_progress"

    # an enrollment with quiz attempts is kept (it is marked dropped instead); one without is removed
    aid = world.post("a_admin", f"{L}/assessments", json={"course_id": cid, "title": "Q", "description": "d", "passing_score": 50}).json()["id"]
    world.db.add(LearningQuizAttempt(assessment_id=aid, employee_id=world.u["a_emp1"].id, enrollment_id=eid, organization_id=1,
                                     attempt_number=1, status="in_progress"))
    world.db.commit()
    kept = world.delete("a_admin", f"{L}/enrollments/{eid}")
    assert kept.status_code == 400 and "Dropped" in kept.text
    other = world.post("a_admin", f"{L}/enrollments", json={"course_id": cid, "employee_id": world.u["a_emp2"].id}).json()["id"]
    assert world.delete("a_admin", f"{L}/enrollments/{other}").status_code == 200


def test_certifications_are_managed_only_inside_the_organization(world):
    emp = world.u["a_emp1"].id
    r = world.post("a_hr", f"{L}/certifications", json={"employee_id": emp, "certification_name": "First Aid", "issue_date": str(date.today())})
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    bad = world.post("a_admin", f"{L}/certifications", json={"employee_id": emp, "certification_name": "X", "issue_date": str(date.today()),
                                                            "expiry_date": str(date.today() - timedelta(days=1))})
    assert bad.status_code == 400 and "expiry date" in bad.text
    assert world.put("a_admin", f"{L}/certifications/{cid}", json={"expiry_date": str(date.today() - timedelta(days=3))}).status_code == 400

    assert world.put("b_admin", f"{L}/certifications/{cid}", json={"certification_name": "Hijack"}).status_code == 404
    assert world.delete("b_admin", f"{L}/certifications/{cid}").status_code == 404
    assert world.db.get(LearningCertification, cid).certification_name == "First Aid"

    ok = world.put("a_admin", f"{L}/certifications/{cid}", json={"certification_name": "First Aid Level 2"})
    assert ok.status_code == 200 and ok.json()["certification_name"] == "First Aid Level 2"
    listed = world.get("a_admin", f"{L}/certifications", params={"employee_id": emp}).json()
    assert [c["employee_name"] for c in listed] == [f"{world.u['a_emp1'].first_name} {world.u['a_emp1'].last_name}"]
    assert world.delete("a_admin", f"{L}/certifications/{cid}").status_code == 200


def test_skills_name_their_holder(world):
    for who, name in (("a_manager", "Coaching"), ("a_emp2", "Excel")):
        r = world.post("a_admin", f"{L}/skills", json={"employee_id": world.u[who].id, "skill_name": name, "proficiency_level": 4})
        assert r.status_code == 201, r.text
    rows = world.get("a_hr", f"{L}/skills").json()
    assert {r["skill_name"]: r["employee_name"] for r in rows} == {"Coaching": "MgrAlpha ZZMGRA",
                                                                    "Excel": f"{world.u['a_emp2'].first_name} {world.u['a_emp2'].last_name}"}
    paged = world.get("a_admin", f"{L}/skills", params={"page": 1, "per_page": 1}).json()
    assert paged["total"] == 2 and paged["items"][0]["employee_name"]
    sid = rows[0]["id"]
    assert world.put("b_admin", f"{L}/skills/{sid}", json={"proficiency_level": 1}).status_code == 404
    assert world.db.get(LearningSkill, sid).proficiency_level == 4


def test_program_participants_change_only_under_their_own_program_and_organization(world):
    pid = _program(world, capacity=1)
    other = _program(world, name="Other")
    r = world.post("a_admin", f"{L}/programs/{pid}/assignments", json={"employee_id": world.u["a_emp1"].id})
    assert r.status_code == 201, r.text
    aid = r.json()["id"]
    dup = world.post("a_admin", f"{L}/programs/{pid}/assignments", json={"employee_id": world.u["a_emp1"].id})
    assert dup.status_code == 409 and "already a participant" in dup.text
    full = world.post("a_admin", f"{L}/programs/{pid}/assignments", json={"employee_id": world.u["a_emp2"].id})
    assert full.status_code == 409 and "full" in full.text

    b_prog = _program(world, name="B prog", who="b_admin", instructor="b_admin")
    assert world.delete("b_admin", f"{L}/programs/{b_prog}/assignments/{aid}").status_code == 404
    assert world.put("b_admin", f"{L}/programs/{b_prog}/assignments/{aid}", json={"status": "attended"}).status_code == 404
    assert world.delete("a_admin", f"{L}/programs/{other}/assignments/{aid}").status_code == 404    # wrong program in the URL
    names = [p["employee_name"] for p in world.get("a_admin", f"{L}/programs/{pid}/assignments").json()]
    assert names == [f"{world.u['a_emp1'].first_name} {world.u['a_emp1'].last_name}"]
    assert world.delete("a_admin", f"{L}/programs/{pid}/assignments/{aid}").status_code == 200


def test_the_review_queue_lists_essay_attempts_waiting_for_a_mark(world):
    cid = _course(world, name="Essays")
    aid = world.post("a_admin", f"{L}/assessments", json={"course_id": cid, "title": "Write-up", "description": "d", "passing_score": 50}).json()["id"]
    essay = world.post("a_admin", f"{L}/assessments/{aid}/questions", json={"question_text": "Explain.", "question_type": "essay", "points": 2}).json()["id"]
    att = world.post("a_emp1", f"{L}/assessments/start", json={"assessment_id": aid, "employee_id": world.u["a_emp1"].id}).json()
    sub = world.post("a_emp1", f"{L}/assessments/{aid}/attempts/{att['id']}/submit", json={"answers": json.dumps([{"question_id": essay, "answer": "Because."}])})
    assert sub.json()["status"] == "pending_review"

    queue = world.get("a_hr", f"{L}/assessments/review-queue")
    assert queue.status_code == 200, queue.text
    rows = queue.json()
    assert [(r["id"], r["assessment_title"], r["course_name"]) for r in rows] == [(att["id"], "Write-up", "Essays")]
    assert rows[0]["employee_name"]
    assert world.get("a_admin", f"{L}/assessments/review-queue", params={"assessment_id": aid + 999}).json() == []
    assert world.get("a_manager", f"{L}/assessments/review-queue").status_code == 403
    assert world.get("a_emp1", f"{L}/assessments/review-queue").status_code == 403
    assert world.get("b_admin", f"{L}/assessments/review-queue").json() == []

    graded = world.post("a_admin", f"{L}/assessments/attempts/{att['id']}/grade", json={"essay_points": {str(essay): 2}})
    assert graded.status_code == 200 and graded.json()["score"] == 100
    assert world.get("a_admin", f"{L}/assessments/review-queue").json() == []
