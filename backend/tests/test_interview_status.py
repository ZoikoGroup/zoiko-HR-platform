"""An interview's status can only move forward: it can never flip between completed and cancelled."""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.modules.hr.models import InterviewStatus as S
from app.modules.hr.recruitment_service import INTERVIEW_TRANSITIONS


def test_the_rules_have_no_way_between_completed_and_cancelled():
    assert INTERVIEW_TRANSITIONS[S.COMPLETED] == set()
    assert S.COMPLETED not in INTERVIEW_TRANSITIONS[S.CANCELLED]
    assert S.CANCELLED not in INTERVIEW_TRANSITIONS[S.COMPLETED]
    assert INTERVIEW_TRANSITIONS[S.CANCELLED] == {S.SCHEDULED}


@pytest.fixture
def client():
    from app.main import app
    from app.core.dependencies import get_current_admin, get_current_user
    from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
    from app.modules.hr.models import Organization, OrganizationStatus

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add(Organization(id=1, name="A", status=OrganizationStatus.ACTIVE))
    s.commit()
    admin = Employee(email="a@x.com", hashed_password="x", employee_code="C1", role=UserRole.ADMIN, first_name="A", last_name="D", job_title="t",
                     employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=1)
    s.add(admin)
    s.commit()
    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: admin
    app.dependency_overrides[get_current_admin] = lambda: admin
    c = TestClient(app, raise_server_exceptions=False)
    yield c
    for dep in (get_db, get_current_user, get_current_admin):
        app.dependency_overrides.pop(dep, None)
    s.close()
    engine.dispose()


def _new(client):
    r = client.post("/hr/recruitment/interviews", json={"candidate_name": "Ann", "position": "Dev", "interview_date": "2026-11-01"})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _set(client, iid, status):
    return client.put(f"/hr/recruitment/interviews/{iid}", json={"status": status})


def test_completed_is_final_and_cannot_become_cancelled(client):
    iid = _new(client)
    assert _set(client, iid, "completed").status_code == 200
    for target in ("cancelled", "scheduled", "in_progress"):
        r = _set(client, iid, target)
        assert r.status_code == 400 and "completed" in r.text, (target, r.text)
    assert client.get("/hr/recruitment/interviews").json()["items"][0]["status"] == "completed"
    assert _set(client, iid, "completed").status_code == 200       # saving the same status is harmless


def test_cancelled_cannot_become_completed_but_can_be_rescheduled(client):
    iid = _new(client)
    assert _set(client, iid, "cancelled").status_code == 200
    r = _set(client, iid, "completed")
    assert r.status_code == 400 and "Reschedule" in r.text
    assert _set(client, iid, "in_progress").status_code == 400
    assert _set(client, iid, "scheduled").status_code == 200
    assert _set(client, iid, "in_progress").status_code == 200
    assert _set(client, iid, "completed").status_code == 200


def test_details_of_a_finished_interview_can_still_be_corrected_without_touching_the_status(client):
    iid = _new(client)
    _set(client, iid, "completed")
    r = client.put(f"/hr/recruitment/interviews/{iid}", json={"interviewer": "Bob", "feedback": "Strong"})
    assert r.status_code == 200 and r.json()["status"] == "completed" and r.json()["interviewer"] == "Bob"


def test_feedback_follows_the_same_rules(client):
    iid = _new(client)
    ok = client.put(f"/hr/recruitment/interviews/{iid}/feedback", json={"feedback": "Good", "status": "completed"})
    assert ok.status_code == 200 and ok.json()["status"] == "completed"
    assert client.put(f"/hr/recruitment/interviews/{iid}/feedback", json={"feedback": "x", "status": "cancelled"}).status_code == 400
    other = _new(client)
    _set(client, other, "cancelled")
    assert client.put(f"/hr/recruitment/interviews/{other}/feedback", json={"feedback": "x"}).status_code == 400
