"""QA reports of 6 / 10 Nov 2026: B7-B13 (registration) and B16-B38 (Add / Edit User) are enforced by the API even when the
form is bypassed, with one message per field; the international examples are accepted; a legacy record whose stored values
predate the rules can still be edited."""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.dependencies import get_current_user
from app.core.rate_limiter import limiter
from app.database import Base, get_db
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import Organization, OrganizationStatus


@pytest.fixture
def client(monkeypatch):
    from app.main import app
    import app.core.code_generation as cg
    import app.modules.employee.service as svc

    codes = iter(range(1, 10_000))
    monkeypatch.setattr(svc, "_notify_email", lambda *a, **k: None)
    monkeypatch.setattr(cg, "generate_employee_code", lambda db, organization_id=None: f"EMP-{next(codes):04d}")
    ids = iter(range(1, 10_000))
    monkeypatch.setattr(svc, "_generate_employee_id", lambda db, organization_id=None: f"ID-{next(ids):04d}")
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add(Organization(id=1, name="Acme", status=OrganizationStatus.ACTIVE))
    s.commit()
    admin = Employee(email="admin@acme-corp.com", hashed_password="x", employee_code="C-1", role=UserRole.ADMIN, first_name="Ad",
                     last_name="Min", job_title="t", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE,
                     date_of_joining=date.today(), organization_id=1)
    # stored before the rules: digits in the name, a junk city, a 7-digit phone
    legacy = Employee(email="old@acme-corp.com", hashed_password="x", employee_code="C-2", role=UserRole.EMPLOYEE, first_name="Old2",
                      last_name="Timer", job_title="t", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE,
                      date_of_joining=date.today(), organization_id=1, phone="5550100", city="City123", country="India")
    s.add_all([admin, legacy])
    s.commit()
    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: admin
    limiter.enabled = False
    c = TestClient(app, raise_server_exceptions=False)
    c.db, c.legacy_id = s, legacy.id
    yield c
    limiter.enabled = True
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
    s.close()
    engine.dispose()


def _user(**over):
    base = {"first_name": "Rahul", "last_name": "Mehta", "email": "rahul@acme-corp.com", "role": "employee", "job_title": "Engineer",
            "date_of_joining": "2026-10-01", "country": "India"}
    base.update(over)
    return base


def _errors(r):
    assert r.status_code == 422, r.text
    return {e["loc"][-1]: e["msg"] for e in r.json()["detail"]}


# ── B16-B38: Add User, form bypassed ─────────────────────────────────────────────────────────────────────────────────
QA_BAD_USER = {
    "first_name": "John123",              # B16
    "last_name": "@@@",                   # B17
    "job_title": "$$$",                   # B19
    "department_name": "1234",            # B20
    "designation_name": "!!!",            # B21
    "company": "#$%",                     # B22
    "business_unit": "+++",               # B23
    "division": "999",                    # B24
    "team": "@team!",                     # B25
    "work_email": "abc@",                 # B26
    "personal_email": "not-an-email",     # B27
    "current_address": "abc",             # B28
    "permanent_address": "!!!!!",         # B29
    "city": "Pune123",                    # B30
    "state": "Bangalore",                 # B31 (not an Indian state)
    "pincode": "56A001",                  # B33
    "pan_number": "ABC123",               # B34
    "uan_number": "12AB",                 # B35
    "bank_account": "12345ABC9012",       # B36 / B37
    "bank_ifsc": "HDFC1001234",           # B38
    "phone": "98765abc10",                # (B8 rule, Add User phone)
}


def test_B16_to_B38_every_qa_input_is_refused_by_the_api_with_its_own_message(client):
    errors = _errors(client.post("/hr/admin/users", json=_user(**QA_BAD_USER)))
    assert set(QA_BAD_USER) <= set(errors), set(QA_BAD_USER) - set(errors)
    assert errors["first_name"].startswith("Use letters only")
    assert errors["pincode"] == "Enter a valid postal code for India (for example 560001)."
    assert errors["bank_account"] == "Enter a valid bank account number (digits only, 9–18 for India)."
    assert errors["bank_ifsc"] == "Enter a valid IFSC code (for example SBIN0001234)."
    assert client.db.query(Employee).filter(Employee.email == "rahul@acme-corp.com").count() == 0


def test_B18_B26_B27_malformed_and_disposable_emails_are_refused(client, strict_emails):
    errors = _errors(client.post("/hr/admin/users", json=_user(email="rahul@example.com", work_email="a..b@acme-corp.com",
                                                                 personal_email="me@yopmail.com")))
    assert {"email", "work_email", "personal_email"} <= set(errors)


def test_B18_a_domain_that_cannot_receive_mail_is_refused(client, strict_emails, monkeypatch):
    from app.config import settings
    from app.core import email_quality
    monkeypatch.setattr(settings, "EMAIL_DNS_CHECK", True)
    monkeypatch.setattr(email_quality, "_domain_receives_mail", lambda d: False if d == "no-mail-here.com" else True)
    errors = _errors(client.post("/hr/admin/users", json=_user(work_email="jo@no-mail-here.com")))
    assert errors["work_email"] == "This email domain can't receive email. Check the address."


B32_COUNTRY = "Narnia"


def test_B32_country_must_be_a_real_country(client):
    assert _errors(client.post("/hr/admin/users", json=_user(country=B32_COUNTRY)))["country"] == "Select a country."


def test_B16_to_B38_international_examples_are_accepted_and_normalised(client):
    r = client.post("/hr/admin/users", json=_user(
        first_name="José", last_name="O'Brien", email="jose@acme-corp.com", job_title="C++ Developer", company="AT&T",
        department_name="R&D", designation_name="Engineer II", business_unit="Sales - North", division="Platform", team="Team 7",
        current_address="12 MG Road, Indiranagar", permanent_address="#4, 3rd Cross, Koramangala", city="Bengaluru",
        state="KA", country="IN", pincode="560001", phone="98765 43210", pan_number="abcde1234f", uan_number="1012 3456 7890",
        bank_account="1234 5678 9012", bank_ifsc="hdfc0001234"))
    assert r.status_code == 201, r.text
    e = client.db.query(Employee).filter(Employee.email == "jose@acme-corp.com").one()
    assert (e.first_name, e.state, e.country, e.phone) == ("José", "Karnataka", "India", "+919876543210")


@pytest.mark.parametrize("first, last", [("王", "伟"), ("अनिल", "कुमार"), ("Jean-Luc", "D’Souza"), ("Mary Ann", "St. John")])
def test_B16_B17_names_in_any_script_are_accepted(client, first, last):
    r = client.post("/hr/admin/users", json=_user(first_name=first, last_name=last, email=f"p{abs(hash(first)) % 10**6}@acme-corp.com"))
    assert r.status_code == 201, r.text


def test_statutory_numbers_need_a_country(client):
    body = _user(pan_number="ABCDE1234F")
    body.pop("country")
    assert _errors(client.post("/hr/admin/users", json=body))["pan_number"] == "Select the employee's country first so this number can be checked."


def test_US_statutory_rules(client):
    errors = _errors(client.post("/hr/admin/users", json=_user(country="United States", state="NY", pincode="1001", pan_number="000-12-3456",
                                                               bank_ifsc="021000022", bank_account="12AB")))
    assert errors["pan_number"] == "Enter a valid SSN (for example 123-45-6789)."
    assert errors["bank_ifsc"] == "Enter a valid Routing number (for example 021000021)."
    assert "state" not in errors


# ── Edit User: only changed values are checked ───────────────────────────────────────────────────────────────────────
def test_edit_user_legacy_values_survive_other_edits_but_new_junk_is_refused(client):
    uid = client.legacy_id
    ok = client.put(f"/hr/admin/users/{uid}", json={"first_name": "Old2", "city": "City123", "phone": "5550100", "job_title": "Lead"})
    assert ok.status_code == 200, ok.text
    assert client.db.get(Employee, uid).job_title == "Lead"
    errors = _errors(client.put(f"/hr/admin/users/{uid}", json={"city": "Pune9", "team": "!!!"}))
    assert set(errors) == {"city", "team"}


# ── B7-B13: registration, form bypassed ──────────────────────────────────────────────────────────────────────────────
def _registration(**over):
    body = {"name": "Priya Sharma", "email": "priya@acme-corp.com", "password": "Passw0rd!x", "organization": "Acme Pvt. Ltd.",
            "plan_code": "core", "phone": "+91 98765 43210", "address": "12 MG Road, Indiranagar", "city": "Bengaluru",
            "state": "Karnataka", "country": "India", "industry": "Software", "tax_number": "27AAPFU0939F1ZV", "tax_id_type": "gstin",
            "registered_email": "hr@acme-corp.com", "otp": "123456"}
    body.update(over)
    return body


def test_B7_to_B13_registration_refuses_every_qa_input(client):
    errors = _errors(client.post("/auth/register", json=_registration(
        organization="@#$%",            # B7
        phone="98765abcde",             # B8
        tax_number="hello!!",           # B9
        industry="1234",                # B10
        address="abc",                  # B11
        city="Mumbai12",                # B12
        name="Priya 123",               # B13
    )))
    assert {"organization", "phone", "tax_number", "industry", "address", "city", "name"} <= set(errors)
    assert errors["organization"] == "Use letters, numbers, spaces and & . , ' - ( ) / only. Include at least one letter."
    assert errors["industry"] == "Select an industry."
    assert "GSTIN" in errors["tax_number"]


def test_B9_a_gstin_with_a_wrong_check_digit_is_refused(client):
    errors = _errors(client.post("/auth/register", json=_registration(tax_number="27AAPFU0939F1ZA")))
    assert errors["tax_number"] == "That GSTIN fails its check digit. Please re-check the number."


@pytest.mark.parametrize("org", ["3M", "7-Eleven", "AT&T", "H&M"])
def test_B7_real_organization_names_with_digits_and_symbols_pass_validation(client, org):
    r = client.post("/auth/register", json=_registration(organization=org))
    # the field rules accept the name; whatever happens next (OTP, plan) is not a field error on "organization"
    if r.status_code == 422:
        assert "organization" not in {e["loc"][-1] for e in r.json()["detail"]}, r.text
