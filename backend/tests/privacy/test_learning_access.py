"""Learning: who sees whose records, and who may be named in one (fix batch 1 of the Assets / Learning / Travel audit).

Real sign-in tokens and two organizations (the privacy `world`).
  - L1  organization-wide reports, their CSV / Excel exports and the dashboard are admin only (ADMIN, HR_ADMIN); enrollments,
        certifications, skills, quiz attempts and program participants: admins see everyone, a manager their own and their
        direct reports', an employee their own
  - L2  an employee or manager enrolls only themselves; the course and the person must belong to the organization
  - L3  program participants come from the program's organization, use the program in the URL, no duplicates, capacity
  - L6  certifications and quiz attempts only for this organization's people
  - L14 exported cells that start with = + - @ are neutralised
"""
import csv
import io
from datetime import date, timedelta

import pytest

from app.modules.hr.models import (
    LearningCertification, LearningEnrollment, LearningQuizAttempt, LearningSkill, LearningTrainingProgramAssignment,
)

L = "/hr/learning"
COURSE = {"description": "d", "course_type": "online", "category": "Compliance", "provider": "Internal", "duration_hours": 2}

REPORTS = ["/dashboard", "/reports/course-completion", "/reports/certifications", "/reports/skill-gap",
           "/reports/course-completion/csv", "/reports/course-completion/excel", "/reports/certifications/csv",
           "/reports/certifications/excel", "/reports/skill-gap/csv", "/reports/skill-gap/excel"]


def _course(w, who="a_admin", name="Safety"):
    r = w.post(who, f"{L}/courses", json={**COURSE, "course_name": name})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _program(w, who="a_admin", name="Bootcamp", capacity=5):
    start = date.today() + timedelta(days=5)
    r = w.post(who, f"{L}/programs", json={"name": name, "description": "d", "instructor_id": w.u["a_admin" if who == "a_admin" else "b_admin"].id,
                                          "start_date": str(start), "end_date": str(start + timedelta(days=2)), "max_participants": capacity})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _quiz(w):
    cid = _course(w, name="Quiz course")
    aid = w.post("a_admin", f"{L}/assessments", json={"course_id": cid, "title": "Quiz", "description": "d", "passing_score": 50,
                                                      "max_attempts": 5}).json()["id"]
    q = w.post("a_admin", f"{L}/assessments/{aid}/questions", json={"question_text": "2+2?", "question_type": "multiple_choice",
                                                                   "options": ["3", "4"], "correct_answer": "4", "points": 1})
    assert q.status_code == 201, q.text
    return cid, aid


def _team(w):
    """a_emp1 reports to a_manager; a_emp2 does not."""
    w.u["a_emp1"].reporting_manager_id = w.u["a_manager"].id
    w.db.commit()


def _records(w):
    """One enrollment, certification, skill and program place each for a_emp1, a_emp2 and a_manager; one in org B."""
    _team(w)
    cid = _course(w)
    pid = _program(w)
    for who in ("a_emp1", "a_emp2", "a_manager"):
        e = w.u[who]
        w.db.add_all([
            LearningEnrollment(course_id=cid, employee_id=e.id, organization_id=1, status="enrolled"),
            LearningCertification(employee_id=e.id, organization_id=1, certification_name=f"Cert-{who}", issue_date=date.today()),
            LearningSkill(employee_id=e.id, organization_id=1, skill_name=f"Skill-{who}"),
            LearningTrainingProgramAssignment(program_id=pid, employee_id=e.id, organization_id=1),
        ])
    w.db.add(LearningCertification(employee_id=w.u["b_emp1"].id, organization_id=2, certification_name="Cert-b", issue_date=date.today()))
    w.db.commit()
    return cid, pid


def _people(rows):
    return sorted(r["employee_id"] for r in rows)


def _items(body):
    return body["items"] if isinstance(body, dict) else body


# ── L1: reports, exports and the dashboard ───────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("who", ["a_emp1", "a_manager"])
def test_reports_exports_and_dashboard_are_refused_to_employees_and_managers(world, who):
    for path in REPORTS:
        assert world.get(who, L + path).status_code == 403, path


@pytest.mark.parametrize("who", ["a_admin", "a_hr"])
def test_admins_keep_every_report_and_export(world, who):
    for path in REPORTS:
        assert world.get(who, L + path).status_code == 200, path


# ── L1: who sees whose records ───────────────────────────────────────────────────────────────────────────────────────

LISTS = ["/enrollments", "/certifications", "/skills"]


def test_an_employee_sees_only_their_own_learning_records(world):
    _cid, pid = _records(world)
    me = world.u["a_emp2"].id
    for path in LISTS:
        assert _people(_items(world.get("a_emp2", L + path).json())) == [me], path
        # asking for someone else returns nothing rather than their records
        assert _items(world.get("a_emp2", f"{L}{path}?employee_id={world.u['a_emp1'].id}").json()) == [], path
    assert _people(world.get("a_emp2", f"{L}/programs/{pid}/assignments").json()) == [me]


def test_a_manager_sees_their_own_and_their_direct_reports_records_only(world):
    _cid, pid = _records(world)
    expected = sorted([world.u["a_manager"].id, world.u["a_emp1"].id])
    for path in LISTS:
        assert _people(_items(world.get("a_manager", L + path).json())) == expected, path
        assert _items(world.get("a_manager", f"{L}{path}?employee_id={world.u['a_emp2'].id}").json()) == [], path
    assert _people(world.get("a_manager", f"{L}/programs/{pid}/assignments").json()) == expected


@pytest.mark.parametrize("who", ["a_admin", "a_hr"])
def test_admins_see_everyone_in_their_organization_and_nobody_else(world, who):
    _cid, pid = _records(world)
    everyone = sorted(world.u[k].id for k in ("a_emp1", "a_emp2", "a_manager"))
    for path in LISTS:
        assert _people(_items(world.get(who, L + path).json())) == everyone, path
    assert _people(world.get(who, f"{L}/programs/{pid}/assignments").json()) == everyone


def test_one_record_by_id_follows_the_same_rule(world):
    _records(world)
    report_cert = world.db.query(LearningCertification).filter_by(employee_id=world.u["a_emp1"].id).one()
    other_cert = world.db.query(LearningCertification).filter_by(employee_id=world.u["a_emp2"].id).one()
    other_enrol = world.db.query(LearningEnrollment).filter_by(employee_id=world.u["a_emp2"].id).one()
    other_skill = world.db.query(LearningSkill).filter_by(employee_id=world.u["a_emp2"].id).one()
    assert world.get("a_manager", f"{L}/certifications/{report_cert.id}").status_code == 200
    for who in ("a_manager", "a_emp1"):
        assert world.get(who, f"{L}/certifications/{other_cert.id}").status_code == 404, who
        assert world.get(who, f"{L}/enrollments/{other_enrol.id}").status_code == 404, who
        assert world.get(who, f"{L}/skills/{other_skill.id}").status_code == 404, who
    assert world.get("b_admin", f"{L}/certifications/{other_cert.id}").status_code == 404
    assert world.get("a_hr", f"{L}/enrollments/{other_enrol.id}").status_code == 200


def test_quiz_attempts_a_manager_sees_a_reports_attempt_but_not_anyone_elses(world):
    _team(world)
    _cid, aid = _quiz(world)
    mine = world.post("a_emp1", f"{L}/assessments/start", json={"assessment_id": aid, "employee_id": world.u["a_emp1"].id}).json()
    other = world.post("a_emp2", f"{L}/assessments/start", json={"assessment_id": aid, "employee_id": world.u["a_emp2"].id}).json()
    assert _people(world.get("a_manager", f"{L}/assessments/{aid}/attempts").json()) == [world.u["a_emp1"].id]
    assert world.get("a_manager", f"{L}/assessments/attempts/{mine['id']}").status_code == 200
    assert world.get("a_manager", f"{L}/assessments/attempts/{other['id']}").status_code == 404
    assert _people(world.get("a_emp2", f"{L}/assessments/{aid}/attempts").json()) == [world.u["a_emp2"].id]
    assert len(world.get("a_hr", f"{L}/assessments/{aid}/attempts").json()) == 2
    # a manager can read a report's attempt, but cannot submit it for them
    sub = world.post("a_manager", f"{L}/assessments/{aid}/attempts/{mine['id']}/submit", json={"answers": "{}"})
    assert sub.status_code == 404


# ── L2: enrollments ──────────────────────────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("who", ["a_emp1", "a_manager"])
def test_employees_and_managers_can_enroll_only_themselves(world, who):
    _team(world)
    cid = _course(world)
    for other in ("a_emp2", "b_emp1"):
        r = world.post(who, f"{L}/enrollments", json={"course_id": cid, "employee_id": world.u[other].id})
        assert r.status_code == 403, (other, r.text)
    if who == "a_manager":                                         # not even their own direct report
        assert world.post(who, f"{L}/enrollments", json={"course_id": cid, "employee_id": world.u["a_emp1"].id}).status_code == 403
    me = world.post(who, f"{L}/enrollments", json={"course_id": cid, "employee_id": world.u[who].id})
    assert me.status_code == 201 and me.json()["employee_id"] == world.u[who].id
    assert world.db.query(LearningEnrollment).count() == 1


def test_an_admin_enrolls_only_people_and_courses_of_their_own_organization(world):
    cid = _course(world)
    b_course = _course(world, who="b_admin", name="B only")
    for emp in (world.u["b_emp1"].id, 999999):
        assert world.post("a_admin", f"{L}/enrollments", json={"course_id": cid, "employee_id": emp}).status_code == 404, emp
    assert world.post("a_admin", f"{L}/enrollments", json={"course_id": b_course, "employee_id": world.u["a_emp1"].id}).status_code == 404
    assert world.post("a_hr", f"{L}/enrollments", json={"course_id": cid, "employee_id": world.u["a_emp2"].id}).status_code == 201


# ── L3: program participants ─────────────────────────────────────────────────────────────────────────────────────────

def test_program_participants_must_belong_to_the_programs_organization(world):
    pid = _program(world)
    for emp in (world.u["b_emp1"].id, 999999):
        r = world.post("a_admin", f"{L}/programs/{pid}/assignments", json={"program_id": pid, "employee_id": emp})
        assert r.status_code == 404, emp
    assert world.db.query(LearningTrainingProgramAssignment).count() == 0


def test_the_program_in_the_url_is_used_not_the_one_in_the_body(world):
    first = _program(world, name="First")
    second = _program(world, name="Second")
    r = world.post("a_admin", f"{L}/programs/{second}/assignments", json={"program_id": first, "employee_id": world.u["a_emp1"].id})
    assert r.status_code == 201 and r.json()["program_id"] == second
    body_free = world.post("a_admin", f"{L}/programs/{first}/assignments", json={"employee_id": world.u["a_emp1"].id})
    assert body_free.status_code == 201 and body_free.json()["program_id"] == first


def test_a_participant_cannot_be_added_twice_or_past_capacity(world):
    pid = _program(world, capacity=1)
    ok = world.post("a_admin", f"{L}/programs/{pid}/assignments", json={"employee_id": world.u["a_emp1"].id})
    assert ok.status_code == 201
    dup = world.post("a_admin", f"{L}/programs/{pid}/assignments", json={"employee_id": world.u["a_emp1"].id})
    assert dup.status_code == 409 and "already a participant" in dup.json()["message"]
    full = world.post("a_admin", f"{L}/programs/{pid}/assignments", json={"employee_id": world.u["a_emp2"].id})
    assert full.status_code == 409 and "full" in full.json()["message"]


def test_another_organizations_admin_cannot_add_to_or_list_a_program(world):
    pid = _program(world)
    assert world.post("b_admin", f"{L}/programs/{pid}/assignments", json={"employee_id": world.u["b_emp1"].id}).status_code == 404
    assert world.get("b_admin", f"{L}/programs/{pid}/assignments").status_code == 404


# ── L6: certifications and quiz attempts ─────────────────────────────────────────────────────────────────────────────

def test_a_certification_is_only_recorded_for_this_organizations_people(world):
    for emp in (world.u["b_emp1"].id, 999999):
        r = world.post("a_admin", f"{L}/certifications", json={"employee_id": emp, "certification_name": "X", "issue_date": str(date.today())})
        assert r.status_code == 404, emp
    ok = world.post("a_admin", f"{L}/certifications", json={"employee_id": world.u["a_emp1"].id, "certification_name": "X",
                                                           "issue_date": str(date.today())})
    assert ok.status_code == 201
    csv_text = world.get("a_admin", f"{L}/reports/certifications/csv").text
    assert str(world.u["b_emp1"].id) not in [row[1] for row in csv.reader(io.StringIO(csv_text))][1:]


def test_an_admin_cannot_start_a_quiz_for_another_organizations_employee(world):
    _cid, aid = _quiz(world)
    for emp in (world.u["b_emp1"].id, 999999):
        r = world.post("a_admin", f"{L}/assessments/start", json={"assessment_id": aid, "employee_id": emp})
        assert r.status_code == 404, emp
    assert world.db.query(LearningQuizAttempt).count() == 0


def test_a_quiz_attempt_cannot_point_at_someone_elses_enrollment(world):
    cid, aid = _quiz(world)
    theirs = LearningEnrollment(course_id=cid, employee_id=world.u["a_emp2"].id, organization_id=1, status="enrolled")
    world.db.add(theirs)
    world.db.commit()
    r = world.post("a_emp1", f"{L}/assessments/start", json={"assessment_id": aid, "employee_id": world.u["a_emp1"].id,
                                                             "enrollment_id": theirs.id})
    assert r.status_code == 404


# ── L14: exports ─────────────────────────────────────────────────────────────────────────────────────────────────────

def test_exported_cells_that_start_with_a_formula_character_are_neutralised(world):
    from openpyxl import load_workbook
    for name in ("=HYPERLINK(\"http://x\",\"y\")", "+1+1", "-2+3", "@SUM(A1)"):
        world.db.add(LearningCertification(employee_id=world.u["a_emp1"].id, organization_id=1, certification_name=name,
                                           issue_date=date.today()))
    world.db.commit()
    rows = list(csv.reader(io.StringIO(world.get("a_admin", f"{L}/reports/certifications/csv").text)))
    names = sorted(r[2] for r in rows[1:])
    assert names == sorted(["'=HYPERLINK(\"http://x\",\"y\")", "'+1+1", "'-2+3", "'@SUM(A1)"])
    wb = load_workbook(io.BytesIO(world.get("a_admin", f"{L}/reports/certifications/excel").content))
    cells = sorted(r[2] for r in wb.active.iter_rows(min_row=2, values_only=True))
    assert all(c.startswith("'") for c in cells), cells
    # numbers are left alone so totals still work
    assert all(isinstance(r[0], int) for r in wb.active.iter_rows(min_row=2, values_only=True))
