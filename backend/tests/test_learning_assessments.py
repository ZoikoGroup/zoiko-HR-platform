"""Assessments: the passing score is never filled in for the person (ZHR-73), required details cannot be blank,
questions hang together, everything is scoped to the organization, and learners never see the answer key."""

import json
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.modules.hr.models import LearningCourse, Organization, OrganizationStatus


def _person(email, role, org, n):
    from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType
    return Employee(email=email, hashed_password="x", employee_code=f"C{n}", role=role, first_name="Pat", last_name=str(n), job_title="t",
                    employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=org)


@pytest.fixture
def env():
    from app.main import app
    from app.core.dependencies import get_current_admin, get_current_user
    from app.modules.employee.models import UserRole

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add_all([Organization(id=1, name="A", status=OrganizationStatus.ACTIVE), Organization(id=2, name="B", status=OrganizationStatus.ACTIVE)])
    s.commit()
    admin, learner, other = _person("a@x.com", UserRole.ADMIN, 1, 1), _person("l@x.com", UserRole.EMPLOYEE, 1, 2), _person("o@x.com", UserRole.ADMIN, 2, 3)
    s.add_all([admin, learner, other])
    s.commit()
    mine = LearningCourse(course_name="Fire Safety", organization_id=1, status="active")
    theirs = LearningCourse(course_name="Other course", organization_id=2, status="active")
    s.add_all([mine, theirs])
    s.commit()
    box = {"user": admin}
    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: box["user"]
    app.dependency_overrides[get_current_admin] = lambda: box["user"]
    c = TestClient(app, raise_server_exceptions=False)
    c.db, c.box, c.admin, c.learner, c.other, c.course, c.their_course = s, box, admin, learner, other, mine, theirs
    yield c
    for dep in (get_db, get_current_user, get_current_admin):
        app.dependency_overrides.pop(dep, None)
    s.close()
    engine.dispose()


URL = "/hr/learning/assessments"


def good(env, **over):
    base = {"course_id": env.course.id, "title": "Fire quiz", "description": "Checks the basics.", "passing_score": 60}
    base.update(over)
    return base


def _fields(r):
    assert r.status_code == 422, r.text
    return {e["loc"][-1]: e["msg"] for e in r.json()["detail"]}


def _question(**over):
    base = {"question_text": "Which colour is a fire extinguisher?", "question_type": "multiple_choice", "options": ["Red", "Blue", "Green"], "correct_answer": "Red", "points": 2}
    base.update(over)
    return base


# ── ZHR-73
def test_the_passing_score_is_never_filled_in_for_the_person(env):
    f = _fields(env.post(URL, json={k: v for k, v in good(env).items() if k != "passing_score"}))
    assert "required" in f["passing_score"].lower()
    for blank in ("", None, "  "):
        assert "Passing score is required" in _fields(env.post(URL, json=good(env, passing_score=blank)))["passing_score"]
    assert env.get(URL).json() == [], "nothing was saved with a made-up score"


def test_the_passing_score_must_be_a_sensible_percentage_and_is_kept_as_entered(env):
    for bad in (0, -5, 101, 2.5, "abc"):
        assert "passing_score" in _fields(env.post(URL, json=good(env, passing_score=bad))), bad
    for value in (1, 70, 100, "55"):
        r = env.post(URL, json=good(env, title=f"Quiz {value}", passing_score=value))
        assert r.status_code == 201 and r.json()["passing_score"] == int(value), (value, r.text)
    aid = env.post(URL, json=good(env, title="Edit me", passing_score=45)).json()["id"]
    assert env.put(f"{URL}/{aid}", json={"title": "Edit me too"}).json()["passing_score"] == 45     # an edit that omits it keeps it
    assert "passing_score" in _fields(env.put(f"{URL}/{aid}", json={"passing_score": ""}))          # an edit cannot blank it or reset it
    assert env.put(f"{URL}/{aid}", json={"passing_score": 80}).json()["passing_score"] == 80


# ── the rest of the page
def test_required_details_and_the_response_carries_what_the_page_shows(env):
    f = _fields(env.post(URL, json={"course_id": env.course.id}))
    assert {"title", "description", "passing_score"} <= set(f)
    assert {"title", "description"} <= set(_fields(env.post(URL, json=good(env, title=" ", description=" "))))
    r = env.post(URL, json=good(env, max_attempts=3, duration_minutes=30, resource_link=" https://example.com/m.pdf "))
    assert r.status_code == 201, r.text
    b = r.json()
    assert (b["course_name"], b["max_attempts"], b["duration_minutes"], b["resource_link"], b["questions_count"], b["is_active"]) == ("Fire Safety", 3, 30, "https://example.com/m.pdf", 0, True)
    for bad in ({"max_attempts": 0}, {"duration_minutes": 0}, {"duration_minutes": 601}, {"resource_link": "nope"}):
        assert env.post(URL, json=good(env, title="x" + str(bad), **bad)).status_code == 422, bad
    aid = b["id"]
    for blank in ({"title": " "}, {"description": ""}):
        assert env.put(f"{URL}/{aid}", json=blank).status_code == 422
    assert env.put(f"{URL}/{aid}", json={"max_attempts": None}).json()["max_attempts"] is None     # optional ones may be cleared


def test_titles_are_unique_within_a_course(env):
    assert env.post(URL, json=good(env)).status_code == 201
    assert env.post(URL, json=good(env, title=" FIRE   quiz ")).status_code == 400


def test_questions_must_hang_together(env):
    aid = env.post(URL, json=good(env)).json()["id"]
    q = f"{URL}/{aid}/questions"
    assert "points" in _fields(env.post(q, json={k: v for k, v in _question().items() if k != "points"}))
    for bad in (_question(options=["Red"]), _question(correct_answer="Purple"), _question(correct_answer=""), _question(points=0),
                _question(question_type="true_false", correct_answer="maybe"), _question(question_type="short_answer", correct_answer=""), _question(question_text=" ")):
        assert env.post(q, json=bad).status_code == 422, bad
    ok = env.post(q, json=_question(options="Red, Blue", correct_answer="blue"))     # a comma list still works
    assert ok.status_code == 201 and ok.json()["options"] == ["Red", "Blue"] and ok.json()["correct_answer"] == "Blue"
    tf = env.post(q, json=_question(question_type="true_false", options=None, correct_answer="true")).json()
    assert (tf["options"], tf["correct_answer"]) == (None, "True")
    essay = env.post(q, json=_question(question_type="essay", options=None, correct_answer=None))
    assert essay.status_code == 201 and essay.json()["correct_answer"] is None
    listed = env.get(q).json()
    assert [x["sort_order"] for x in listed] == [1, 2, 3], "questions are numbered in the order they were added"
    assert env.get(f"{URL}/{aid}").json()["questions_count"] == 3


def test_editing_a_question_is_checked_against_the_whole_question(env):
    aid = env.post(URL, json=good(env)).json()["id"]
    qid = env.post(f"{URL}/{aid}/questions", json=_question()).json()["id"]
    url = f"{URL}/{aid}/questions/{qid}"
    assert env.put(url, json={"options": ["Red", "Blue"]}).status_code == 200       # the answer is still one of the options
    r = env.put(url, json={"options": ["Yellow", "Blue"]})
    assert r.status_code == 400 and "one of the options" in r.text
    assert env.put(url, json={"points": 5}).json()["points"] == 5
    assert env.put(url, json={"points": 0}).status_code == 422
    assert env.put(url, json={"question_type": "true_false", "correct_answer": "False"}).json()["options"] is None
    assert env.put(f"{URL}/{aid}/questions/9999", json={"points": 1}).status_code == 404


def test_other_organizations_cannot_see_use_or_change_anything(env):
    aid = env.post(URL, json=good(env)).json()["id"]
    qid = env.post(f"{URL}/{aid}/questions", json=_question()).json()["id"]
    env.box["user"] = env.other
    assert env.post(URL, json=good(env, title="Sneaky")).status_code == 404            # my course, their login
    assert env.post(URL, json={**good(env), "course_id": env.their_course.id}).status_code == 201   # their own course is fine
    assert all(a["course_id"] == env.their_course.id for a in env.get(URL).json())
    for method, path, body in (("get", f"{URL}/{aid}", None), ("put", f"{URL}/{aid}", {"title": "x"}), ("delete", f"{URL}/{aid}", None),
                               ("get", f"{URL}/{aid}/questions", None), ("post", f"{URL}/{aid}/questions", _question()),
                               ("put", f"{URL}/{aid}/questions/{qid}", {"points": 3}), ("delete", f"{URL}/{aid}/questions/{qid}", None),
                               ("get", f"{URL}/{aid}/attempts", None)):
        r = getattr(env, method)(path, **({"json": body} if body is not None else {}))
        assert r.status_code == 404, (method, path, r.status_code)


def test_delete_removes_the_questions_but_not_an_assessment_with_attempts(env):
    keep = env.post(URL, json=good(env)).json()["id"]
    gone = env.post(URL, json=good(env, title="Unused")).json()["id"]
    env.post(f"{URL}/{gone}/questions", json=_question())
    assert env.delete(f"{URL}/{gone}").status_code == 200
    assert env.get(f"{URL}/{gone}").status_code == 404
    env.post(f"{URL}/{keep}/questions", json=_question())
    start = env.post(f"{URL}/start", json={"assessment_id": keep, "employee_id": env.learner.id})
    assert start.status_code == 201, start.text
    r = env.delete(f"{URL}/{keep}")
    assert r.status_code == 400 and "Inactive" in r.text


def test_quiz_marking_uses_the_entered_passing_score_and_the_attempt_list_names_people(env):
    aid = env.post(URL, json=good(env, passing_score=50)).json()["id"]
    q1 = env.post(f"{URL}/{aid}/questions", json=_question(points=1)).json()["id"]
    q2 = env.post(f"{URL}/{aid}/questions", json=_question(question_text="Second?", options=["Yes", "No"], correct_answer="Yes", points=1)).json()["id"]
    env.box["user"] = env.learner
    attempt = env.post(f"{URL}/start", json={"assessment_id": aid, "employee_id": env.learner.id}).json()
    done = env.post(f"{URL}/{aid}/attempts/{attempt['id']}/submit", json={"answers": json.dumps([{"question_id": q1, "answer": "red"}, {"question_id": q2, "answer": "No"}])}).json()
    assert (done["score"], done["passed"], done["status"]) == (50, True, "completed")     # 1 of 2 points = 50 and the bar is 50
    listed = env.get(f"{URL}/{aid}/attempts").json()
    assert listed[0]["employee_name"] == f"Pat {env.learner.last_name}"


def test_learners_see_only_active_assessments_never_the_answer_key_and_only_their_own_attempts(env):
    live = env.post(URL, json=good(env)).json()["id"]
    hidden = env.post(URL, json=good(env, title="Draft quiz")).json()["id"]
    env.put(f"{URL}/{hidden}", json={"is_active": False})
    env.post(f"{URL}/{live}/questions", json=_question())
    env.box["user"] = env.learner
    assert [a["title"] for a in env.get(URL).json()] == ["Fire quiz"]
    assert env.get(f"{URL}/{hidden}").status_code == 404
    questions = env.get(f"{URL}/{live}/questions").json()
    assert questions[0]["correct_answer"] is None and questions[0]["options"] == ["Red", "Blue", "Green"]
    env.box["user"] = env.admin
    assert env.get(f"{URL}/{live}/questions").json()[0]["correct_answer"] == "Red"


# ── ZHR-88: a learner takes the quiz through the server, which marks it
def test_a_learner_takes_a_quiz_for_themselves_and_the_server_marks_it(env):
    from app.modules.employee.models import UserRole
    aid = env.post(URL, json=good(env, passing_score=50)).json()["id"]
    q1 = env.post(f"{URL}/{aid}/questions", json=_question()).json()
    q2 = env.post(f"{URL}/{aid}/questions", json=_question(question_text="Is water ok on electrical fires?", question_type="true_false", options=["True", "False"], correct_answer="False")).json()
    env.box["user"] = env.learner
    shown = env.get(f"{URL}/{aid}/questions").json()
    assert all(q["correct_answer"] is None for q in shown)
    # the learner cannot start a quiz in someone else's name
    att = env.post(f"{URL}/start", json={"assessment_id": aid, "employee_id": env.admin.id}).json()
    assert att["employee_id"] == env.learner.id
    answers = json.dumps([{"question_id": q1["id"], "answer": "Red"}, {"question_id": q2["id"], "answer": "True"}])
    done = env.post(f"{URL}/{aid}/attempts/{att['id']}/submit", json={"answers": answers}).json()
    assert (done["score"], done["passed"], done["status"]) == (50, True, "completed")      # one of two right, pass mark 50
    # someone else's attempt is not theirs to open or submit
    other = _person("l2@x.com", UserRole.EMPLOYEE, 1, 9)
    env.db.add(other); env.db.commit()
    env.box["user"] = other
    assert env.get(f"{URL}/attempts/{att['id']}").status_code == 404
    assert env.post(f"{URL}/{aid}/attempts/{att['id']}/submit", json={"answers": "[]"}).status_code == 404
