"""Adding a candidate with missing or bad details gives short, field-level messages, never framework text."""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.modules.hr.schemas import CandidateCreate, CandidateUpdate


def _errors(**data):
    with pytest.raises(ValidationError) as e:
        CandidateCreate(**data)
    return {err["loc"][-1]: err["msg"] for err in e.value.errors()}


def test_blank_required_fields_are_named_in_plain_words():
    out = _errors(name="  ", email="", position="")
    assert out["name"].endswith("Name is required.")
    assert out["email"].endswith("Email is required.")
    assert out["position"].endswith("Position is required.")


def test_bad_values_get_specific_messages():
    out = _errors(name="A", email="not-an-email", position="Dev", phone="123", resume_link="cv", experience=99)
    assert "valid email" in out["email"]
    assert "valid phone number for India" in out["phone"]          # QA #13: the country-aware phone rule
    assert "http" in out["resume_link"]
    assert "60" in out["experience"]


def test_good_input_is_cleaned():
    c = CandidateCreate(name="  Ann   Lee ", email=" Ann@X.com ", position=" Dev ", phone="+91 98765 43210", resume_link="")
    assert (c.name, c.email, c.position, c.phone, c.resume_link) == ("Ann Lee", "ann@x.com", "Dev", "+919876543210", None)


def test_an_edit_may_leave_fields_out_but_not_blank_them():
    assert CandidateUpdate(phone="").phone is None
    assert CandidateUpdate().model_dump(exclude_unset=True) == {}
    with pytest.raises(ValidationError):
        CandidateUpdate(email="bad")


# ── through the real endpoints
@pytest.fixture
def client():
    from app.main import app
    from app.core.dependencies import get_current_admin, get_current_user
    from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
    from app.modules.hr.models import Organization, OrganizationStatus
    from datetime import date

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    from sqlalchemy import event
    # enforce foreign keys like Postgres does, so a delete in the wrong order fails here too
    event.listen(engine, "connect", lambda conn, _rec: conn.execute("PRAGMA foreign_keys=ON"))
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add_all([Organization(id=1, name="A", status=OrganizationStatus.ACTIVE), Organization(id=2, name="B", status=OrganizationStatus.ACTIVE)])
    s.commit()
    admin = Employee(email="a@x.com", hashed_password="x", employee_code="C1", role=UserRole.ADMIN, first_name="A", last_name="D", job_title="t",
                     employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=1)
    s.add(admin)
    s.commit()
    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: admin
    app.dependency_overrides[get_current_admin] = lambda: admin
    c = TestClient(app, raise_server_exceptions=False)
    c.db = s
    yield c
    for dep in (get_db, get_current_user, get_current_admin):
        app.dependency_overrides.pop(dep, None)
    s.close()
    engine.dispose()


GOOD = {"name": "Ann Lee", "email": "ann@x.com", "position": "Engineer"}


def test_an_empty_submission_returns_a_422_the_page_can_map_to_fields(client):
    r = client.post("/hr/recruitment/candidates", json={})
    assert r.status_code == 422
    assert {e["loc"][-1] for e in r.json()["detail"]} == {"name", "email", "position"}
    r = client.post("/hr/recruitment/candidates", json={"name": "", "email": "", "position": ""})
    assert r.status_code == 422
    assert all(e["msg"].endswith("is required.") for e in r.json()["detail"])


def test_the_same_person_cannot_apply_twice_for_one_position_and_an_unknown_requisition_is_refused(client):
    assert client.post("/hr/recruitment/candidates", json=GOOD).status_code == 201
    dup = client.post("/hr/recruitment/candidates", json={**GOOD, "email": "ANN@x.com", "position": "engineer"})
    assert dup.status_code == 400 and "already applied" in dup.text
    assert client.post("/hr/recruitment/candidates", json={**GOOD, "position": "Designer"}).status_code == 201
    assert client.post("/hr/recruitment/candidates", json={**GOOD, "email": "b@x.com", "requisition_id": 999}).status_code == 400


def test_editing_keeps_required_fields_and_checks_duplicates(client):
    a = client.post("/hr/recruitment/candidates", json=GOOD).json()
    b = client.post("/hr/recruitment/candidates", json={**GOOD, "position": "Designer"}).json()
    ok = client.put(f"/hr/recruitment/candidates/{a['id']}", json={"notes": "strong", "phone": "9876543210"})
    assert ok.status_code == 200, ok.text
    assert ok.json()["phone"] == "+919876543210"              # QA #13: stored in E.164 like every other phone
    assert client.put(f"/hr/recruitment/candidates/{b['id']}", json={"position": "Engineer"}).status_code == 400
    assert client.put(f"/hr/recruitment/candidates/{a['id']}", json={"name": ""}).status_code == 422



def _with_everything(db, cand_id, admin_id):
    """Give a candidate an interview with feedback, an amended offer with an approval, a document and an application."""
    from datetime import date
    from app.modules.hr.models import (RecruitmentApplication, RecruitmentDocument, RecruitmentInterview,
                                       RecruitmentInterviewFeedback, RecruitmentOffer, RecruitmentOfferApproval,
                                       RecruitmentRequisition)
    req = RecruitmentRequisition(title="Engineer", department="Tech", organization_id=1)
    iv = RecruitmentInterview(candidate_id=cand_id, candidate_name="Ann Lee", position="Engineer", interview_date=date.today(),
                              organization_id=1)
    first = RecruitmentOffer(candidate_id=cand_id, candidate_name="Ann Lee", position="Engineer", organization_id=1)
    db.add_all([req, iv, first])
    db.flush()
    second = RecruitmentOffer(candidate_id=cand_id, candidate_name="Ann Lee", position="Engineer", organization_id=1,
                              amends_offer_id=first.id)
    db.add_all([second,
                RecruitmentInterviewFeedback(interview_id=iv.id, interviewer_id=admin_id, rating=4, organization_id=1),
                RecruitmentOfferApproval(offer_id=first.id, approver_id=admin_id, organization_id=1),
                RecruitmentDocument(candidate_id=cand_id, document_type="cv", file_path="x/cv.pdf", file_name="cv.pdf", organization_id=1),
                RecruitmentApplication(candidate_id=cand_id, requisition_id=req.id, organization_id=1)])
    db.commit()


def test_a_candidate_with_interviews_offers_documents_and_applications_can_be_deleted(client):
    from app.modules.hr.models import (RecruitmentApplication, RecruitmentCandidate, RecruitmentDocument, RecruitmentInterview,
                                       RecruitmentInterviewFeedback, RecruitmentOffer, RecruitmentOfferApproval)
    from app.modules.employee.models import Employee
    cand = client.post("/hr/recruitment/candidates", json=GOOD).json()
    other = client.post("/hr/recruitment/candidates", json={**GOOD, "email": "bob@x.com"}).json()
    admin = client.db.query(Employee).first()
    _with_everything(client.db, cand["id"], admin.id)
    r = client.delete(f"/hr/recruitment/candidates/{cand['id']}")
    assert r.status_code == 200, r.text
    db = client.db
    assert db.get(RecruitmentCandidate, cand["id"]) is None
    for model in (RecruitmentInterview, RecruitmentInterviewFeedback, RecruitmentOffer, RecruitmentOfferApproval,
                  RecruitmentDocument, RecruitmentApplication):
        assert db.query(model).count() == 0, model.__name__
    assert db.get(RecruitmentCandidate, other["id"]) is not None          # nobody else is touched
    assert client.delete(f"/hr/recruitment/candidates/{cand['id']}").status_code == 404


def test_a_candidate_in_onboarding_is_kept_until_the_new_hire_is_deleted(client):
    from app.modules.hr.models import OnboardingNewHire, RecruitmentCandidate
    cand = client.post("/hr/recruitment/candidates", json=GOOD).json()
    hire = OnboardingNewHire(candidate_name="Ann Lee", email="ann@x.com", position="Engineer", organization_id=1)
    client.db.add(hire)
    client.db.commit()
    row = client.db.get(RecruitmentCandidate, cand["id"])
    row.onboarding_new_hire_id = hire.id
    client.db.commit()
    r = client.delete(f"/hr/recruitment/candidates/{cand['id']}")
    assert r.status_code == 400 and "New Hires" in r.text
    hire.is_deleted = True
    client.db.commit()
    assert client.delete(f"/hr/recruitment/candidates/{cand['id']}").status_code == 200


def test_an_interview_with_feedback_can_be_deleted(client):
    from app.modules.hr.models import RecruitmentInterview, RecruitmentInterviewFeedback
    from app.modules.employee.models import Employee
    cand = client.post("/hr/recruitment/candidates", json=GOOD).json()
    _with_everything(client.db, cand["id"], client.db.query(Employee).first().id)
    iv = client.db.query(RecruitmentInterview).first()
    r = client.delete(f"/hr/recruitment/interviews/{iv.id}")
    assert r.status_code in (200, 204), r.text
    assert client.db.query(RecruitmentInterviewFeedback).count() == 0
