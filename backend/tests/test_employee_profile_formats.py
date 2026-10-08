"""My Profile: banking and identity details are checked for their format (ZHR-84), and a profile belongs to its owner."""

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import identity_formats as f
from app.database import Base, get_db
from app.modules.hr.models import Organization, OrganizationStatus


# ── the formats themselves
@pytest.mark.parametrize("fn,good,expected", [
    (f.pan_number, " abcde 1234-f ", "ABCDE1234F"), (f.aadhar_number, "2345 6789 0123", "234567890123"), (f.ifsc_code, "hdfc0001234", "HDFC0001234"),
    (f.bank_account, "1234 5678 9012", "123456789012"), (f.uan_number, "1001 2345 6789", "100123456789"), (f.esic_number, "1234567890", "1234567890"),
    (f.passport_number, "k 1234567", "K1234567"), (f.pf_number, "mh/ban/1234567/000/0001234", "MH/BAN/1234567/000/0001234"), (f.visa_number, "ab12345", "AB12345"),
])
def test_valid_values_are_cleaned_up(fn, good, expected):
    assert fn(good) == expected
    assert fn("") is None and fn("   ") is None and fn(None) is None          # a blank box clears the value


@pytest.mark.parametrize("fn,bad", [
    (f.pan_number, "ABCDE12345"), (f.pan_number, "ABCD1234E"), (f.pan_number, "12345ABCDE"), (f.pan_number, "ABC<script>"),
    (f.aadhar_number, "12345678901"), (f.aadhar_number, "1234567890123"), (f.aadhar_number, "023456789012"), (f.aadhar_number, "ABCD56789012"),
    (f.ifsc_code, "HDFC1001234"), (f.ifsc_code, "HDF0001234"), (f.ifsc_code, "HDFC000123"), (f.ifsc_code, "1234A001234"),
    (f.bank_account, "12345678"), (f.bank_account, "1234567890123456789"), (f.bank_account, "12345ABC6789"), (f.bank_account, "000000000000"),
    (f.uan_number, "12345678901"), (f.uan_number, "ABCDEFGHIJKL"), (f.esic_number, "12345678901"), (f.esic_number, "12AB"),
    (f.passport_number, "12345"), (f.passport_number, "ABCDEFGH"), (f.passport_number, "K12345678901"), (f.visa_number, "AB1"), (f.pf_number, "A#B"),
])
def test_wrong_formats_are_refused_with_a_message_saying_what_is_expected(fn, bad):
    with pytest.raises(ValueError) as e:
        fn(bad)
    assert len(str(e.value)) > 20


def test_names_and_lists():
    assert f.bank_name("  State  Bank of India ") == "State Bank of India"
    with pytest.raises(ValueError):
        f.bank_name("123 Bank")
    assert f.blood_group("ab+") == "AB+" and f.marital_status("Married") == "married"
    with pytest.raises(ValueError):
        f.blood_group("Z+")
    with pytest.raises(ValueError):
        f.marital_status("complicated")
    assert f.person_text("Anne-Marie O'Neil", "Name") == "Anne-Marie O'Neil"
    with pytest.raises(ValueError):
        f.person_text("R2D2", "Name")


# ── through the real endpoints
@pytest.fixture
def env():
    from app.main import app
    from app.core.dependencies import get_current_admin, get_current_user
    from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add_all([Organization(id=1, name="A", status=OrganizationStatus.ACTIVE), Organization(id=2, name="B", status=OrganizationStatus.ACTIVE)])
    s.commit()

    def person(email, org, n, role=UserRole.EMPLOYEE):
        return Employee(email=email, hashed_password="x", employee_code=f"C{n}", role=role, first_name="Pat", last_name=f"P{n}".replace("1", "a").replace("2", "b").replace("3", "c"),
                        job_title="t", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=org,
                        basic_salary=1000, ctc=12000)

    me, colleague, admin = person("me@x.com", 1, 1), person("col@x.com", 1, 2), person("adm@x.com", 1, 3, UserRole.ADMIN)
    s.add_all([me, colleague, admin])
    s.commit()
    box = {"user": me}
    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: box["user"]
    app.dependency_overrides[get_current_admin] = lambda: box["user"]
    c = TestClient(app, raise_server_exceptions=False)
    c.db, c.box, c.me, c.colleague, c.admin = s, box, me, colleague, admin
    yield c
    for dep in (get_db, get_current_user, get_current_admin):
        app.dependency_overrides.pop(dep, None)
    s.close()
    engine.dispose()


def _profile_url(emp):
    return f"/hr/employee-management/employees/{emp.id}/profile"


def _saved_pan(env):
    """The saved PAN, or None when nothing has been saved yet (the profile then does not exist)."""
    r = env.get(_profile_url(env.me))
    return r.json().get("pan_number") if r.status_code == 200 else None


def _fields(r):
    assert r.status_code == 422, r.text
    return {e["loc"][-1]: e["msg"] for e in r.json()["detail"]}


GOOD = {"pan_number": "abcde1234f", "aadhar_number": "2345 6789 0123", "bank_name": "State Bank of India", "bank_account": "123456789012", "bank_ifsc": "sbin0001234",
        "uan_number": "100123456789", "passport_number": "k1234567", "passport_expiry": "2032-05-01", "blood_group": "o+", "marital_status": "single"}


def test_valid_banking_and_identity_details_save_in_their_clean_form(env):
    r = env.put(_profile_url(env.me), json=GOOD)
    assert r.status_code == 200, r.text
    b = r.json()
    assert (b["pan_number"], b["aadhar_number"], b["bank_ifsc"], b["bank_account"], b["passport_number"], b["blood_group"]) == \
        ("ABCDE1234F", "234567890123", "SBIN0001234", "123456789012", "K1234567", "O+")
    assert env.get(_profile_url(env.me)).json()["pan_number"] == "ABCDE1234F"


def test_every_invalid_value_is_refused_and_nothing_is_saved(env):
    bad = {"pan_number": "ABCDE12345", "aadhar_number": "12345", "bank_account": "12AB", "bank_ifsc": "HDFC1001234", "uan_number": "123", "esic_number": "12",
           "passport_number": "123", "visa_number": "A", "pf_number": "#", "bank_name": "123", "blood_group": "Z", "emergency_contact_phone": "12345",
           "passport_expiry": "1980-01-01"}
    f_ = _fields(env.put(_profile_url(env.me), json=bad))
    assert set(bad) <= set(f_), set(bad) - set(f_)
    assert "PAN" in f_["pan_number"] and "IFSC" in f_["bank_ifsc"] and "Aadhar" in f_["aadhar_number"]
    assert _saved_pan(env) is None


def test_one_bad_value_blocks_the_whole_save(env):
    r = env.put(_profile_url(env.me), json={"pan_number": "ABCDE1234F", "bank_ifsc": "BAD"})
    assert r.status_code == 422
    assert _saved_pan(env) is None


def test_a_blank_value_clears_what_was_saved(env):
    env.put(_profile_url(env.me), json={"pan_number": "ABCDE1234F", "bank_name": "Axis Bank"})
    r = env.put(_profile_url(env.me), json={"pan_number": "", "bank_name": None})
    assert r.status_code == 200 and r.json()["pan_number"] is None and r.json()["bank_name"] is None


def test_only_the_owner_or_an_admin_can_open_or_change_a_profile(env):
    assert env.get(_profile_url(env.colleague)).status_code == 403             # a colleague's bank details are not mine to read
    assert env.put(_profile_url(env.colleague), json={"bank_account": "123456789012"}).status_code == 403
    env.box["user"] = env.admin
    assert env.put(_profile_url(env.colleague), json={"bank_account": "123456789012"}).status_code == 200
    assert env.get(_profile_url(env.colleague)).json()["bank_account"] == "123456789012"


def test_my_personal_details_are_checked_too(env):
    ok = env.put("/hr/employees/me", json={"first_name": " Anne ", "last_name": "Lee", "phone": "+91 98765 43210", "personal_email": "ANNE@Example.com",
                                           "date_of_birth": "1990-05-04", "pincode": "560 001", "city": "Pune"})
    assert ok.status_code == 200, ok.text
    assert ok.json()["firstName"] == "Anne" if "firstName" in ok.json() else ok.json()["first_name"] == "Anne"
    f_ = _fields(env.put("/hr/employees/me", json={"phone": "123", "personal_email": "nope", "date_of_birth": "2999-01-01", "pincode": "!!", "first_name": ""}))
    assert {"phone", "personal_email", "date_of_birth", "pincode", "first_name"} <= set(f_)
    recent = (date.today() - timedelta(days=365 * 5)).isoformat()
    assert "date_of_birth" in _fields(env.put("/hr/employees/me", json={"date_of_birth": recent}))


def test_an_employee_cannot_change_their_own_pay_role_or_status(env):
    for field, value in (("basic_salary", 999999), ("ctc", 9999999), ("status", "inactive"), ("department_id", 1), ("reporting_manager_id", 1), ("job_title", "CEO"), ("employment_type", "contract")):
        r = env.put("/hr/employees/me", json={field: value})
        assert r.status_code == 422, (field, r.status_code)
    env.db.refresh(env.me)
    assert (float(env.me.basic_salary), float(env.me.ctc), env.me.job_title) == (1000.0, 12000.0, "t")


# ── ZHR-86: emergency contacts
def _contact(name="Jane Doe", rel="Spouse", phone="9876543210", alt="", addr="12 Park Road, Pune", primary=False):
    return {"id": name, "name": name, "relationship": rel, "primaryPhone": phone, "alternatePhone": alt, "address": addr, "isPrimary": primary}


def _msg(r):
    assert r.status_code == 422, r.text
    return r.json()["detail"][0]["msg"]


def test_emergency_contacts_save_and_are_cleaned(env):
    r = env.put("/hr/employees/me", json={"emergency_contacts": [_contact(phone="+91 98765 43210", primary=True), _contact("Raj Kumar", "Parent", "9123456789")]})
    assert r.status_code == 200, r.text
    got = env.get("/hr/employees/me").json()["emergencyContacts"]
    assert [c["primaryPhone"] for c in got] == ["+919876543210", "9123456789"]


def test_the_same_person_or_phone_cannot_be_added_twice(env):
    url = "/hr/employees/me"
    assert "already in your emergency contacts" in _msg(env.put(url, json={"emergency_contacts": [_contact(), _contact("  jane   DOE ", "spouse", "9111111112")]}))
    assert "already used" in _msg(env.put(url, json={"emergency_contacts": [_contact(), _contact("Raj", "Parent", "+91 98765 43210")]}))
    assert "already used" in _msg(env.put(url, json={"emergency_contacts": [_contact(), _contact("Raj", "Parent", "9123456789", alt="9876543210")]}))
    assert "alternate phone cannot be the same" in _msg(env.put(url, json={"emergency_contacts": [_contact(alt="98765 43210")]}))
    assert not env.get(url).json().get("emergencyContacts")


def test_emergency_contact_details_are_required_and_checked(env):
    url = "/hr/employees/me"
    for bad, word in ((_contact(name=""), "name is required"), (_contact(phone="123"), "valid 10-digit"), (_contact(addr=""), "address is required"),
                      (_contact(name="R2D2"), "Contact name")):
        assert word in _msg(env.put(url, json={"emergency_contacts": [bad]})), word
    assert "only one" in _msg(env.put(url, json={"emergency_contacts": [_contact(primary=True), _contact("Raj", "Parent", "9123456789", primary=True)]})).lower()
    many = [_contact(f"Person{chr(97 + i)}", "Friend", f"91234567{i:02d}") for i in range(6)]
    assert "at most 5" in _msg(env.put(url, json={"emergency_contacts": many}))


# ── ZHR-87: forgot the current password
def test_a_signed_in_employee_can_email_themselves_a_reset_link(env, monkeypatch):
    from app.modules.employee import service
    sent = []
    monkeypatch.setattr(service, "_notify_email_async", lambda name, **kw: sent.append(kw))
    r = env.post("/auth/me/forgot-password")
    assert r.status_code == 200, r.text
    assert r.json()["email"].startswith("me") and "@x.com" in r.json()["email"] and "me@x.com" != r.json()["email"]
    assert len(sent) == 1 and sent[0]["email"] == "me@x.com" and "reset-password?token=" in sent[0]["action_url"]


# ── ZHR-89: settings are really saved
def test_notification_language_and_timezone_settings_are_saved_and_come_back(env):
    prefs = {"email": False, "sms": True, "push": False}
    r = env.put("/hr/employees/me", json={"notification_preferences": prefs, "language": "Hindi", "timezone": "UTC"})
    assert r.status_code == 200, r.text
    again = env.get("/hr/employees/me").json()
    assert again["notificationPreferences"] == prefs and again["language"] == "Hindi" and again["timezone"] == "UTC"
    # switching only one thing keeps the rest
    env.put("/hr/employees/me", json={"notification_preferences": {**prefs, "email": True}})
    assert env.get("/hr/employees/me").json()["notificationPreferences"] == {"email": True, "sms": True, "push": False}


def test_settings_that_are_not_valid_are_refused(env):
    for body in ({"notification_preferences": {"email": "no", "sms": False, "push": False}}, {"notification_preferences": {"email": True}},
                 {"notification_preferences": {"email": True, "sms": True, "push": True, "fax": True}}, {"language": "Klingon"}, {"timezone": "Mars/Base"}):
        assert env.put("/hr/employees/me", json=body).status_code == 422, body


# ── ZHR-90: Contact HR
def test_an_employee_can_message_hr_and_hr_gets_an_email_with_who_it_is_from(env, monkeypatch):
    from app.modules.employee import service
    from app.modules.employee.models import UserRole
    sent = []
    monkeypatch.setattr(service, "_notify_email_async", lambda name, **kw: sent.append((name, kw)))
    hr = env.admin
    hr.role = UserRole.HR_ADMIN
    env.db.commit()
    r = env.post("/hr/employees/me/contact-hr", json={"topic": "Leave balance not set up", "message": "My leave balance has not been set up yet, please add it."})
    assert r.status_code == 200, r.text
    assert r.json()["sent_to"] == 1
    name, kw = sent[0]
    assert kw["to_email"] == "adm@x.com" and "me@x.com" in kw["body"] and "Leave balance not set up" in kw["body"] and "has not been set up" in kw["body"]


def test_contact_hr_refuses_bad_requests_and_says_when_there_is_nobody_to_send_to(env, monkeypatch):
    from app.modules.employee import service
    monkeypatch.setattr(service, "_notify_email_async", lambda name, **kw: None)
    ok = {"topic": "Other", "message": "Please call me back about my leave."}
    for bad in ({**ok, "topic": "Spam"}, {**ok, "message": "hi"}, {**ok, "message": "x" * 1001}, {**ok, "to": "evil@x.com"}):
        assert env.post("/hr/employees/me/contact-hr", json=bad).status_code == 422, bad
    env.db.query(type(env.admin)).filter(type(env.admin).id == env.admin.id).delete()
    env.db.commit()
    r = env.post("/hr/employees/me/contact-hr", json=ok)
    assert r.status_code == 400 and "No HR contact" in r.text


# ── ZHR-96: personal travel settings are really saved
def test_travel_preferences_are_saved_and_come_back(env):
    prefs = {"currency": "usd", "per_diem": "1500.50", "auto_notify": True}
    r = env.put("/hr/employees/me", json={"travel_preferences": prefs})
    assert r.status_code == 200, r.text
    assert env.get("/hr/employees/me").json()["travelPreferences"] == {"currency": "USD", "per_diem": 1500.5, "auto_notify": True}


def test_empty_or_wrong_travel_preferences_are_refused(env):
    base = {"currency": "INR", "per_diem": 1000, "auto_notify": False}
    for bad, word in (({**base, "per_diem": ""}, "daily per diem"), ({**base, "per_diem": None}, "daily per diem"), ({**base, "per_diem": 0}, "more than zero"),
                      ({**base, "per_diem": "abc"}, "as a number"), ({**base, "per_diem": 12.345}, "2 decimal"), ({**base, "per_diem": 99999999}, "too large"),
                      ({**base, "currency": "XYZ"}, "currency"), ({**base, "currency": ""}, "currency"), ({**base, "auto_notify": "yes"}, "on or off"),
                      ({"currency": "INR"}, "per diem"), ({**base, "extra": 1}, "must set")):
        r = env.put("/hr/employees/me", json={"travel_preferences": bad})
        assert r.status_code == 422 and word in r.text, (bad, r.text)
    assert not env.get("/hr/employees/me").json().get("travelPreferences")


# ── ZHR-102: adding an employee without typing a password
def _new_employee(**over):
    body = {"email": "new.hire@example.com", "first_name": "New", "last_name": "Hire", "job_title": "Analyst",
            "date_of_joining": date.today().isoformat(), "employment_type": "full_time"}
    body.update(over)
    return body


def test_an_admin_can_add_an_employee_without_a_password_and_gets_a_temporary_one(env, monkeypatch):
    from app.modules.employee import service
    from app.modules.employee.models import Employee, UserRole
    mails = []
    monkeypatch.setattr(service, "_notify_email", lambda name, **kw: mails.append((name, kw)))
    env.box["user"] = env.admin
    env.admin.role = UserRole.ADMIN
    r = env.post("/hr/employee-management/employees", json=_new_employee())
    assert r.status_code == 201, r.text
    body = r.json()
    temp = body["temporaryPassword"] if "temporaryPassword" in body else body["temporary_password"]
    assert len(temp) >= 10 and body["mustChangePassword" if "mustChangePassword" in body else "must_change_password"] is True
    assert mails and mails[0][1]["temporary_password"] == temp               # the same one is e-mailed
    assert env.db.query(Employee).filter_by(email="new.hire@example.com").one().must_change_password is True
    again = env.get(f"/hr/employee-management/employees/{body['id']}").json()
    assert not (again.get("temporaryPassword") or again.get("temporary_password")), "the temporary password is shown once, never again"


def test_a_password_that_is_given_is_used_and_not_echoed_back(env, monkeypatch):
    from app.modules.employee import service
    from app.modules.employee.models import UserRole
    monkeypatch.setattr(service, "_notify_email", lambda name, **kw: None)
    env.box["user"] = env.admin
    env.admin.role = UserRole.ADMIN
    r = env.post("/hr/employee-management/employees", json=_new_employee(email="p@example.com", password="Chosen#Pass1"))
    assert r.status_code == 201, r.text
    assert not (r.json().get("temporaryPassword") or r.json().get("temporary_password"))
    assert env.post("/hr/employee-management/employees", json=_new_employee(email="q@example.com", password="short")).status_code == 422


def test_an_organization_admin_cannot_create_a_super_admin_through_add_employee(env, monkeypatch):
    from app.modules.employee import service
    from app.modules.employee.models import UserRole
    monkeypatch.setattr(service, "_notify_email", lambda name, **kw: None)
    env.box["user"] = env.admin
    env.admin.role = UserRole.ADMIN
    for path in ("/hr/employee-management/employees", "/hr/employees"):
        r = env.post(path, json=_new_employee(email="boss@example.com", role="super_admin"))
        assert r.status_code in (400, 403), (path, r.status_code, r.text)
    assert env.post("/hr/employees", json=_new_employee(email="mgr@example.com", role="manager")).status_code == 201
