"""Course progress comes from quizzes: progress_pct = passed quizzes / quizzes in the course x 100, and passing the last one
completes the enrollment. Real sign-in tokens and two organizations (the privacy `world`)."""
import importlib.util
import json
from pathlib import Path

from app.modules.hr.models import LearningEnrollment

L = "/hr/learning"
COURSE = {"description": "d", "course_type": "online", "category": "Compliance", "provider": "Internal", "duration_hours": 2}


def _course(w, name="Safety"):
    r = w.post("a_admin", f"{L}/courses", json={**COURSE, "course_name": name})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _quiz(w, cid, title, with_question=True, **extra):
    r = w.post("a_admin", f"{L}/assessments", json={"course_id": cid, "title": title, "description": "d", "passing_score": 50, **extra})
    assert r.status_code == 201, r.text
    aid = r.json()["id"]
    qid = None
    if with_question:
        q = w.post("a_admin", f"{L}/assessments/{aid}/questions",
                   json={"question_text": "Q?", "points": 1, "question_type": "multiple_choice", "options": ["a", "b"], "correct_answer": "a"})
        assert q.status_code == 201, q.text
        qid = q.json()["id"]
    return aid, qid


def _enroll(w, who, cid):
    r = w.post(who, f"{L}/enrollments", json={"course_id": cid, "employee_id": w.u[who].id})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _take(w, who, aid, qid, answer):
    start = w.post(who, f"{L}/assessments/start", json={"assessment_id": aid, "employee_id": w.u[who].id})
    assert start.status_code in (200, 201), start.text
    attempt = start.json()["id"]
    r = w.post(who, f"{L}/assessments/{aid}/attempts/{attempt}/submit", json={"answers": json.dumps([{"question_id": qid, "answer": answer}])})
    assert r.status_code == 200, r.text
    return r.json()


def _enrollment(w, eid):
    w.db.expire_all()
    return w.db.get(LearningEnrollment, eid)


def test_progress_is_the_share_of_quizzes_passed_and_the_last_pass_completes_the_course(world):
    cid = _course(world)
    quizzes = [_quiz(world, cid, f"Quiz {i}") for i in range(1, 5)]          # 4 quizzes: each pass is 25%
    eid = _enroll(world, "a_emp1", cid)
    assert (_enrollment(world, eid).progress_pct, _enrollment(world, eid).status) == (0, "enrolled")

    _take(world, "a_emp1", *quizzes[0], answer="a")
    e = _enrollment(world, eid)
    assert (e.progress_pct, e.status) == (25, "in_progress") and e.started_at is not None

    _take(world, "a_emp1", *quizzes[1], answer="b")                          # failed: no progress, still in progress
    assert _enrollment(world, eid).progress_pct == 25
    _take(world, "a_emp1", *quizzes[1], answer="a")                          # passed on the second try
    _take(world, "a_emp1", *quizzes[2], answer="a")
    assert (_enrollment(world, eid).progress_pct, _enrollment(world, eid).status) == (75, "in_progress")

    _take(world, "a_emp1", *quizzes[3], answer="a")
    e = _enrollment(world, eid)
    assert (e.progress_pct, e.status) == (100, "completed") and e.completed_at is not None


def test_opening_a_quiz_starts_the_course_and_passing_the_same_quiz_twice_counts_once(world):
    cid = _course(world)
    q1, q2 = _quiz(world, cid, "One"), _quiz(world, cid, "Two")
    eid = _enroll(world, "a_emp1", cid)
    world.post("a_emp1", f"{L}/assessments/start", json={"assessment_id": q1[0], "employee_id": world.u["a_emp1"].id})
    assert (_enrollment(world, eid).progress_pct, _enrollment(world, eid).status) == (0, "in_progress")
    _take(world, "a_emp1", *q1, answer="a")
    _take(world, "a_emp1", *q1, answer="a")
    assert _enrollment(world, eid).progress_pct == 50


def test_only_quizzes_a_learner_can_take_count_and_changing_them_recalculates(world):
    cid = _course(world)
    q1 = _quiz(world, cid, "One")
    _quiz(world, cid, "Draft", with_question=False)                          # no questions yet: does not count
    eid = _enroll(world, "a_emp1", cid)
    _take(world, "a_emp1", *q1, answer="a")
    assert (_enrollment(world, eid).progress_pct, _enrollment(world, eid).status) == (100, "completed")

    # an open enrollment is recalculated when a quiz is added; a completed one is never undone
    other = _enroll(world, "a_emp2", cid)
    q2 = _quiz(world, cid, "Two")
    _take(world, "a_emp2", *q1, answer="a")
    assert _enrollment(world, other).progress_pct == 50
    assert (_enrollment(world, eid).progress_pct, _enrollment(world, eid).status) == (100, "completed")

    off = world.put("a_admin", f"{L}/assessments/{q2[0]}", json={"is_active": False})    # switched off: no longer counts
    assert off.status_code == 200, off.text
    assert (_enrollment(world, other).progress_pct, _enrollment(world, other).status) == (100, "completed")


def test_quizzes_passed_before_enrolling_count_and_an_essay_counts_once_graded(world):
    cid = _course(world)
    q1 = _quiz(world, cid, "Auto")
    essay = world.post("a_admin", f"{L}/assessments", json={"course_id": cid, "title": "Essay", "description": "d", "passing_score": 50})
    eaid = essay.json()["id"]
    eq = world.post("a_admin", f"{L}/assessments/{eaid}/questions", json={"question_text": "Explain", "points": 4, "question_type": "essay"})
    assert eq.status_code == 201, eq.text

    _take(world, "a_emp1", *q1, answer="a")                                  # before enrolling
    eid = _enroll(world, "a_emp1", cid)
    assert (_enrollment(world, eid).progress_pct, _enrollment(world, eid).status) == (50, "in_progress")

    submitted = _take(world, "a_emp1", eaid, eq.json()["id"], answer="Because")
    assert submitted["status"] == "pending_review"
    assert _enrollment(world, eid).progress_pct == 50                        # waiting for a mark is not a pass
    graded = world.post("a_admin", f"{L}/assessments/attempts/{submitted['id']}/grade", json={"essay_points": {str(eq.json()["id"]): 3}})
    assert graded.status_code == 200, graded.text
    e = _enrollment(world, eid)
    assert (e.progress_pct, e.status) == (100, "completed")


def test_a_course_without_quizzes_stays_manual_and_reopening_goes_back_to_the_quizzes(world):
    manual = _course(world, name="Reading")
    eid = _enroll(world, "a_emp1", manual)
    assert world.put("a_admin", f"{L}/enrollments/{eid}", json={"status": "completed"}).json()["progress_pct"] == 100

    cid = _course(world, name="Quizzed")
    q1, _q2 = _quiz(world, cid, "One"), _quiz(world, cid, "Two")
    qe = _enroll(world, "a_emp1", cid)
    _take(world, "a_emp1", *q1, answer="a")
    assert world.put("a_admin", f"{L}/enrollments/{qe}", json={"status": "completed"}).json()["progress_pct"] == 100
    reopened = world.put("a_admin", f"{L}/enrollments/{qe}", json={"status": "in_progress"}).json()
    assert reopened["progress_pct"] == 50 and reopened["completed_at"] is None


def test_a_dropped_enrollment_is_left_alone(world):
    cid = _course(world)
    q1 = _quiz(world, cid, "One")
    eid = _enroll(world, "a_emp1", cid)
    assert world.put("a_admin", f"{L}/enrollments/{eid}", json={"status": "dropped"}).status_code == 200
    _take(world, "a_emp1", *q1, answer="a")
    assert (_enrollment(world, eid).progress_pct, _enrollment(world, eid).status) == (0, "dropped")


def test_the_backfill_migration_sets_existing_enrollments_from_their_quizzes(world, monkeypatch):
    cid = _course(world)
    q1, q2 = _quiz(world, cid, "One"), _quiz(world, cid, "Two")
    halfway = _enroll(world, "a_emp1", cid)
    done = _enroll(world, "a_emp2", cid)
    untouched = _enroll(world, "a_manager", cid)
    _take(world, "a_emp1", *q1, answer="a")
    _take(world, "a_emp2", *q1, answer="a")
    _take(world, "a_emp2", *q2, answer="a")
    # put them back the way the old code left them: 0% and enrolled
    world.db.query(LearningEnrollment).filter(LearningEnrollment.id.in_([halfway, done, untouched])).update(
        {"progress_pct": 0, "status": "enrolled", "started_at": None, "completed_at": None}, synchronize_session=False)
    world.db.commit()

    migration = importlib.import_module("alembic.versions.4c8e1f2a9b7d_learning_progress_from_quizzes") \
        if False else _load_migration()
    with world.db.get_bind().begin() as conn:
        monkeypatch.setattr(migration.op, "get_bind", lambda: conn)
        migration.upgrade()
    assert (_enrollment(world, halfway).progress_pct, _enrollment(world, halfway).status) == (50, "in_progress")
    d = _enrollment(world, done)
    assert (d.progress_pct, d.status) == (100, "completed") and d.completed_at is not None
    assert (_enrollment(world, untouched).progress_pct, _enrollment(world, untouched).status) == (0, "enrolled")


def _load_migration():
    path = Path(__file__).resolve().parents[2] / "alembic" / "versions" / "4c8e1f2a9b7d_learning_progress_from_quizzes.py"
    spec = importlib.util.spec_from_file_location("learning_progress_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
