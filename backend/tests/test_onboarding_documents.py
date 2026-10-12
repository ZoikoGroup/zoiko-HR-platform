"""Onboarding documents: a real multipart upload works, each problem is named by field, and the file can be downloaded."""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.modules.hr import router as hr_router_module
from app.modules.hr.models import OnboardingNewHire, Organization, OrganizationStatus


@pytest.fixture
def client(tmp_path, monkeypatch):
    from app.main import app
    from app.core.dependencies import get_current_admin, get_current_user
    from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole

    monkeypatch.setattr(hr_router_module, "_ONBOARDING_DOC_UPLOAD_DIR", str(tmp_path / "onb"))
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add_all([Organization(id=1, name="A", status=OrganizationStatus.ACTIVE), Organization(id=2, name="B", status=OrganizationStatus.ACTIVE)])
    s.commit()
    admin = Employee(email="a@x.com", hashed_password="x", employee_code="C1", role=UserRole.ADMIN, first_name="A", last_name="D", job_title="t",
                     employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=1)
    s.add(admin)
    s.add_all([OnboardingNewHire(id=1, organization_id=1, candidate_name="Ann", email="a@a.com", position="Dev"),
               OnboardingNewHire(id=2, organization_id=2, candidate_name="Other", email="o@o.com", position="Dev")])
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


def _post(client, data=None, files="default"):
    if files == "default":
        files = {"file": ("policy.pdf", b"%PDF-1.4 hello", "application/pdf")}
    return client.post("/hr/onboarding/documents", data=data if data is not None else {"title": "Offer", "category": "offer_letter"}, files=files or None)


def _fields(r):
    return {e["loc"][-1]: e["msg"] for e in r.json()["detail"]}


def test_a_filled_form_with_a_file_uploads(client):
    r = _post(client, {"title": "  Signed   offer ", "category": "offer_letter", "onboarding_record_id": "1"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert (body["title"], body["category"], body["status"], body["onboarding_new_hire_id"]) == ("Signed offer", "offer_letter", "pending", 1)
    assert body["file_url"] == f"/hr/onboarding/documents/{body['id']}/file"


def test_every_missing_field_is_named_not_reported_as_a_bare_field_required(client):
    r = _post(client, {"title": "", "category": ""}, files=None)
    assert r.status_code == 422
    f = _fields(r)
    assert set(f) == {"title", "category", "file"}
    assert "Title is required" in f["title"] and "Category is required" in f["category"] and "Choose a file" in f["file"]
    assert "Field required" not in r.text


def test_bad_values_are_refused_per_field(client):
    assert "category" in _fields(_post(client, {"title": "x", "category": "weird"}))
    exe = _post(client, files={"file": ("run.exe", b"MZ", "application/octet-stream")})
    assert "file" in _fields(exe) and ".exe" in _fields(exe)["file"]
    assert "empty" in _fields(_post(client, files={"file": ("a.pdf", b"", "application/pdf")}))["file"]
    assert "onboarding_record_id" in _fields(_post(client, {"title": "x", "category": "nda", "onboarding_record_id": "2"}))   # another organization's
    assert "onboarding_record_id" in _fields(_post(client, {"title": "x", "category": "nda", "onboarding_record_id": "abc"}))
    assert "title" in _fields(_post(client, {"title": "x" * 201, "category": "nda"}))


def test_the_file_can_be_downloaded_with_its_title_and_listed_documents_point_to_it(client):
    doc = _post(client).json()
    listed = client.get("/hr/onboarding/documents").json()
    assert listed[0]["file_url"].endswith(f"/{doc['id']}/file")
    r = client.get(f"/hr/onboarding/documents/{doc['id']}/file")
    assert r.status_code == 200 and r.content == b"%PDF-1.4 hello"
    assert "Offer.pdf" in r.headers["content-disposition"]
    assert client.get("/hr/onboarding/documents/9999/file").status_code == 404


def test_approve_reject_rules(client):
    doc = _post(client).json()
    url = f"/hr/onboarding/documents/{doc['id']}"
    assert client.put(url, json={"status": "bogus"}).status_code == 422
    assert client.put(url, json={"status": "rejected"}).status_code == 400            # a reason is needed
    ok = client.put(url, json={"status": "rejected", "rejection_reason": "  Blurry scan "})
    assert ok.status_code == 200 and ok.json()["rejection_reason"] == "Blurry scan"
    back = client.put(url, json={"status": "approved"}).json()
    assert back["status"] == "approved" and back["rejection_reason"] is None
    assert client.put(url, json={"title": "  "}).status_code == 422
