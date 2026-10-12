"""A phone number typed in user management must be a 10-digit number (optional country code)."""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.dependencies import get_current_user
from app.core.phone import normalize_phone
from app.database import Base, get_db
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import Organization, OrganizationStatus


@pytest.mark.parametrize("raw, expected", [
    (None, None), ("", None), ("   ", None), ("9876543210", "9876543210"), ("+91 98765 43210", "+919876543210"),
    ("+91-9876543210", "+919876543210"), ("(555) 010-0100", "5550100100"), (9876543210.0, "9876543210"), (9876543210, "9876543210"),
])
def test_valid_numbers_are_cleaned(raw, expected):
    assert normalize_phone(raw) == expected


@pytest.mark.parametrize("raw", ["98765432101", "123456789", "987654321012345", "+91 9876543", "abcdefghij", "98765 4321x", "12-34", 98765432101])
def test_wrong_length_or_characters_are_rejected(raw):
    with pytest.raises(ValueError, match="10-digit"):
        normalize_phone(raw)


@pytest.fixture
def client(monkeypatch):
    from app.main import app
    import app.modules.employee.service as svc

    import app.core.code_generation as cg

    codes = iter(range(1, 10_000))
    monkeypatch.setattr(svc, "_notify_email", lambda *a, **k: None)
    # the Postgres advisory lock used for numbering does not exist on SQLite
    monkeypatch.setattr(cg, "generate_employee_code", lambda db, organization_id=None: f"EMP-{next(codes):04d}")
    ids = iter(range(1, 10_000))
    monkeypatch.setattr(svc, "_generate_employee_id", lambda db, organization_id=None: f"ID-{next(ids):04d}")
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add(Organization(id=1, name="Acme", status=OrganizationStatus.ACTIVE))
    s.commit()
    admin = Employee(email="admin@example.com", hashed_password="x", employee_code="C-1", role=UserRole.ADMIN, first_name="Ad", last_name="Min", job_title="t",
                     employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=1)
    legacy = Employee(email="old@example.com", hashed_password="x", employee_code="C-2", role=UserRole.EMPLOYEE, first_name="Old", last_name="Timer", job_title="t",
                      employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=1, phone="+1-555-0100")
    s.add_all([admin, legacy])
    s.commit()
    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: admin
    c = TestClient(app, raise_server_exceptions=False)
    c.db, c.legacy_id = s, legacy.id
    yield c
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
    s.close()
    engine.dispose()


def _new(**over):
    base = {"first_name": "Rahul", "last_name": "Mehta", "email": "rahul@example.com", "role": "employee", "job_title": "Engineer", "date_of_joining": "2026-10-01"}
    base.update(over)
    return base


def test_add_user_rejects_an_11_digit_phone(client):
    r = client.post("/hr/admin/users", json=_new(phone="98765432101"))
    assert r.status_code == 422, r.text
    assert "10-digit" in r.text
    assert client.db.query(Employee).filter(Employee.email == "rahul@example.com").count() == 0


def test_add_user_stores_a_clean_valid_phone(client):
    r = client.post("/hr/admin/users", json=_new(phone="+91 98765 43210"))
    assert r.status_code == 201, r.text
    assert client.db.query(Employee).filter(Employee.email == "rahul@example.com").one().phone == "+919876543210"


def test_add_user_without_a_phone_still_works(client):
    assert client.post("/hr/admin/users", json=_new()).status_code == 201


def test_editing_a_phone_to_an_invalid_number_is_refused_but_a_legacy_number_survives_other_edits(client):
    uid = client.legacy_id
    assert client.put(f"/hr/admin/users/{uid}", json={"phone": "123456789012"}).status_code == 400
    ok = client.put(f"/hr/admin/users/{uid}", json={"phone": "+1-555-0100", "job_title": "Lead"})  # unchanged legacy number
    assert ok.status_code == 200, ok.text
    assert client.db.get(Employee, uid).job_title == "Lead"
    assert client.put(f"/hr/admin/users/{uid}", json={"phone": "9876543210"}).status_code == 200
    assert client.db.get(Employee, uid).phone == "9876543210"


def test_a_user_created_with_a_generated_password_must_change_it_at_first_sign_in(client):
    r = client.post("/hr/admin/users", json=_new(email="fresh@example.com"))
    assert r.status_code == 201, r.text
    created = client.db.query(Employee).filter(Employee.email == "fresh@example.com").one()
    assert created.must_change_password is True
