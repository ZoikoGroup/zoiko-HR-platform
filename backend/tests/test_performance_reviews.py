"""ZHR-60: creating and editing performance reviews works, is validated, and is per organization."""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.dependencies import get_current_user
from app.database import Base, get_db
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import Organization, OrganizationStatus, PerformanceGoal, PerformanceReview


@pytest.fixture
def client(monkeypatch):
    from app.main import app
    import app.services.email_service as emails

    sent = []
    monkeypatch.setattr(emails, "send_performance_review_assigned_email", lambda **kw: sent.append(("assigned", kw["cycle_name"])))
    monkeypatch.setattr(emails, "send_performance_review_submitted_email", lambda **kw: sent.append(("submitted", kw["cycle_name"])))

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add_all([Organization(id=1, name="Acme", status=OrganizationStatus.ACTIVE), Organization(id=2, name="Globex", status=OrganizationStatus.ACTIVE)])
    s.commit()
    people = {}
    for key, role, org in (("admin", UserRole.ADMIN, 1), ("ann", UserRole.EMPLOYEE, 1), ("bob", UserRole.EMPLOYEE, 1), ("hr", UserRole.HR_ADMIN, 1), ("other", UserRole.ADMIN, 2)):
        e = Employee(email=f"{key}@example.com", hashed_password="x", employee_code=f"C-{key}", role=role, first_name=key.title(), last_name="U",
                     job_title="t", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=org)
        s.add(e)
        s.commit()
        people[key] = e
    box = {"user": people["admin"]}
    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: box["user"]
    from app.core.dependencies import get_current_admin
    app.dependency_overrides[get_current_admin] = lambda: box["user"] if box["user"].role != UserRole.EMPLOYEE else (_ for _ in ()).throw(__import__("fastapi").HTTPException(403, "This action requires admin privileges."))
    c = TestClient(app, raise_server_exceptions=False)
    c.db, c.box, c.people, c.sent = s, box, people, sent
    yield c
    for dep in (get_db, get_current_user, get_current_admin):
        app.dependency_overrides.pop(dep, None)
    s.close()
    engine.dispose()


def body(c, **over):
    base = {"employee_id": c.people["ann"].id, "reviewer_id": c.people["bob"].id, "hr_reviewer_id": c.people["hr"].id,
            "admin_reviewer_id": c.people["admin"].id, "cycle": "Q1 2026", "rating": 4, "comments": "Solid quarter"}
    base.update(over)
    return base


def test_create_then_edit_a_review(client):
    r = client.post("/hr/performance", json=body(client))
    assert r.status_code == 200 or r.status_code == 201, r.text
    created = r.json()
    assert created["status"] == "pending" and created["cycle"] == "Q1 2026"
    r = client.put(f"/hr/performance/{created['id']}", json={"rating": 5, "comments": "Exceptional", "cycle": "Q1 2026 final"})
    assert r.status_code == 200, r.text
    assert (r.json()["rating"], r.json()["comments"], r.json()["cycle"]) == (5, "Exceptional", "Q1 2026 final")


def test_the_status_buttons_work_and_completion_is_stamped(client):
    rid = client.post("/hr/performance", json=body(client)).json()["id"]
    for status in ("in_progress", "completed", "approved"):
        r = client.put(f"/hr/performance/{rid}", json={"status": status})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == status
    assert r.json()["reviewed_at"] is not None
    assert client.put(f"/hr/performance/{rid}", json={"status": "pending"}).json()["reviewed_at"] is None


def test_an_unknown_status_is_rejected_not_stored(client):
    rid = client.post("/hr/performance", json=body(client)).json()["id"]
    assert client.put(f"/hr/performance/{rid}", json={"status": "whatever"}).status_code == 422


def test_bad_input_is_rejected_with_a_readable_reason(client):
    assert client.post("/hr/performance", json=body(client, cycle="   ")).status_code == 422
    assert client.post("/hr/performance", json=body(client, rating=9)).status_code == 422
    assert client.post("/hr/performance", json=body(client, cycle="x" * 51)).status_code == 422
    r = client.post("/hr/performance", json=body(client, reviewer_id=client.people["ann"].id))
    assert r.status_code == 400 and "own manager reviewer" in r.text


def test_people_from_another_organization_cannot_be_used(client):
    r = client.post("/hr/performance", json=body(client, employee_id=client.people["other"].id))
    assert r.status_code == 400 and "not an employee of this organization" in r.text
    r = client.post("/hr/performance", json=body(client, reviewer_id=client.people["other"].id))
    assert r.status_code == 400


def test_one_review_per_employee_per_cycle(client):
    assert client.post("/hr/performance", json=body(client)).status_code in (200, 201)
    r = client.post("/hr/performance", json=body(client, cycle="q1 2026"))
    assert r.status_code == 400 and "already has a review" in r.text
    other = client.post("/hr/performance", json=body(client, cycle="Q2 2026"))
    assert other.status_code in (200, 201)
    # renaming into a clash is refused too, but saving a review unchanged is fine
    assert client.put(f"/hr/performance/{other.json()['id']}", json={"cycle": "Q1 2026"}).status_code == 400
    assert client.put(f"/hr/performance/{other.json()['id']}", json={"cycle": "Q2 2026", "rating": 2}).status_code == 200


def test_reviews_are_listed_per_organization_and_employees_only_see_their_own(client):
    mine = client.post("/hr/performance", json=body(client)).json()["id"]
    client.post("/hr/performance", json=body(client, employee_id=client.people["bob"].id, reviewer_id=client.people["hr"].id, cycle="Q1 2026"))
    assert len(client.get("/hr/performance").json()) == 2
    client.box["user"] = client.people["ann"]
    ids = [r["id"] for r in client.get("/hr/performance").json()]
    assert ids == [mine]
    client.box["user"] = client.people["other"]
    assert client.get("/hr/performance").json() == []
    assert client.get(f"/hr/performance/{mine}").status_code == 404


def test_employees_cannot_edit_or_delete_reviews(client):
    rid = client.post("/hr/performance", json=body(client)).json()["id"]
    client.box["user"] = client.people["ann"]
    assert client.put(f"/hr/performance/{rid}", json={"rating": 5}).status_code == 403
    assert client.delete(f"/hr/performance/{rid}").status_code == 403
    assert client.get(f"/hr/performance/{rid}").status_code == 200
    client.box["user"] = client.people["bob"]  # a reviewer may read it, an unrelated employee may not
    assert client.get(f"/hr/performance/{rid}").status_code == 200
    client.box["user"] = client.people["hr"]
    client.box["user"] = client.people["admin"]
    assert client.delete(f"/hr/performance/{rid}").status_code == 200


def test_default_reviewers_only_resolve_inside_the_organization(client):
    assert client.get("/hr/performance/default-reviewers", params={"employee_id": client.people["ann"].id}).status_code == 200
    assert client.get("/hr/performance/default-reviewers", params={"employee_id": client.people["other"].id}).status_code == 404


def test_the_dashboard_invents_nothing_when_the_organization_has_no_data(client):
    d = client.get("/hr/performance/dashboard").json()
    assert (d["total_reviews"], d["total_goals"], d["total_appraisals"]) == (0, 0, 0)
    assert client.db.query(PerformanceGoal).count() == 0           # used to be seeded with ten fake goals
    assert client.db.query(Employee).filter(Employee.email == "demo.employee@zoiko.com").count() == 0
    a = client.get("/hr/performance/analytics").json()
    assert (a["total_reviews"], a["avg_rating"]) == (0, 0)


def test_dashboard_pending_in_progress_and_completed_add_up(client):
    ids = [client.post("/hr/performance", json=body(client, cycle=f"C{i}")).json()["id"] for i in range(4)]
    client.put(f"/hr/performance/{ids[1]}", json={"status": "in_progress"})
    client.put(f"/hr/performance/{ids[2]}", json={"status": "completed"})
    client.put(f"/hr/performance/{ids[3]}", json={"status": "approved"})
    d = client.get("/hr/performance/dashboard").json()
    assert (d["pending_reviews"], d["in_progress_reviews"], d["completed_reviews"], d["total_reviews"]) == (1, 1, 2, 4)
    assert client.get("/hr/performance/analytics").json()["review_completion_rate"] == 50.0


def test_emails_name_the_cycle_and_the_completion_mail_goes_out_once(client):
    rid = client.post("/hr/performance", json=body(client)).json()["id"]
    client.put(f"/hr/performance/{rid}", json={"rating": 3})            # a plain edit sends nothing
    client.put(f"/hr/performance/{rid}", json={"status": "in_progress"})
    client.put(f"/hr/performance/{rid}", json={"status": "completed"})
    client.put(f"/hr/performance/{rid}", json={"comments": "edited after completion"})
    assert client.sent == [("assigned", "Q1 2026"), ("submitted", "Q1 2026")]
