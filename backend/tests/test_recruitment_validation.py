"""QA report #13 (10 Nov 2026), BUG-1…BUG-28: Recruitment and Onboarding › New hires refuse junk in every free-text field,
numbers have real limits, dropdowns are strict, text is stored as typed (no "&amp;"), and stored junk can be reported."""
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db

PERSON = "Use letters only. Spaces, hyphens (-), apostrophes (') and full stops are allowed."
JOB_TITLE = "Use letters, numbers, spaces and & - / , . ( ) + # only. Include at least one letter."
ORG_UNIT = "Use letters, numbers, spaces and & - / , . ( ) only. Include at least one letter."
LOCATION = ("Enter a real place, for example Bengaluru, India or Floor 3, Room 4B. Use letters, numbers, spaces and "
            ", . - / # ' ( ) & only.")
WORK_PATTERN = ("Describe the working pattern, for example Mon–Fri, 9:30–18:30. Use letters, numbers, spaces and "
                ", . - : / ( ) & + only.")
WHOLE = "Enter a whole amount with no decimals, for example 600000."
EQUITY = "Enter a percentage between 0 and 100, for example 0.25."
CURRENCY = "Choose a currency from the list."
DEPARTMENT = "Choose a department from the list."
FUTURE = (date.today() + timedelta(days=7)).isoformat()


@pytest.fixture
def env(monkeypatch, strict_emails):                  # strict_emails (conftest.py): the real-email rules are on
    from app.main import app
    from app.core.dependencies import get_current_admin, get_current_user
    from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
    from app.modules.hr.models import Department, Organization, OrganizationStatus

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add_all([Organization(id=1, name="Acme", organization_name="Acme", status=OrganizationStatus.ACTIVE, country="India", currency="INR"),
               Organization(id=2, name="Other", organization_name="Other", status=OrganizationStatus.ACTIVE, country="India")])
    s.commit()
    s.add_all([Department(name="Engineering", code="ENG", organization_id=1, is_active=True),
               Department(name="Old Team", code="OLD", organization_id=1, is_active=False),
               Department(name="Finance", code="FIN2", organization_id=2, is_active=True)])
    admin = Employee(email="hr@acme.com", hashed_password="x", employee_code="C1", role=UserRole.HR_ADMIN, first_name="Hana",
                     last_name="T", job_title="HR", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE,
                     date_of_joining=date.today(), organization_id=1, is_active=True)
    s.add(admin)
    s.commit()
    from app.services import email_service
    monkeypatch.setattr(email_service, "send_approval_email", lambda *a, **k: True)
    from app.core import entitlements as _ent                     # the plan gate is tested elsewhere
    monkeypatch.setattr(_ent, "check_entitlement", lambda db, org_id, key: {"state": _ent.ENTITLED_AVAILABLE})
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


def _msg(r, field):
    """The message the API gave for one field (FastAPI 422 list)."""
    assert r.status_code == 422, r.text
    for e in r.json()["detail"]:
        if e["loc"][-1] == field:
            return e["msg"].replace("Value error, ", "")
    raise AssertionError(f"no error for {field}: {r.text}")


def _ok(r):
    assert r.status_code in (200, 201), r.text
    return r.json()


REQ = {"title": "Backend Engineer", "department": "Engineering"}
CAND = {"name": "Anil Kumar", "email": "anil.kumar@gmail.com", "position": "Senior Engineer II"}
IV = {"candidate_name": "Priya Sharma", "position": "QA Analyst", "interview_type": "video", "interviewer": "Rahul Mehta",
      "interview_date": FUTURE, "notify": False}
OFFER = {"candidate_name": "Priya Sharma", "position": "Product Designer", "salary": 1200000}
HIRE = {"candidate_name": "Neha Verma", "email": "neha.verma@gmail.com", "position": "HR Executive", "start_onboarding": False}


# ── requisitions: BUG-1 … BUG-5 (and the title) ──────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("field,value,message", [
    ("title", "*&^%$45^&87", JOB_TITLE),
    ("department", "765$%^&*", ORG_UNIT),                     # BUG-1
    ("location", "@#$Main", LOCATION),                        # BUG-2
    ("budget_min", "0.30", WHOLE),                            # BUG-3
    ("budget_max", "0.50", WHOLE),                            # BUG-4
    ("budget_min", -5, WHOLE),
    ("currency", "ABC", CURRENCY),                            # BUG-5
    ("currency", "XYZ", CURRENCY),
])
def test_requisition_junk_is_refused(env, field, value, message):
    assert _msg(env.post("/hr/recruitment/requisitions", json={**REQ, "currency": "INR", field: value}), field) == message


def test_requisition_good_values_are_saved_as_typed(env):
    r = _ok(env.post("/hr/recruitment/requisitions", json={**REQ, "title": "R&D Engineer", "department": "  engineering ",
                                                            "location": "Bengaluru, India", "budget_min": 600000, "budget_max": "900000",
                                                            "currency": "inr"}))
    assert (r["title"], r["department"], r["location"], r["currency"]) == ("R&D Engineer", "Engineering", "Bengaluru, India", "INR")
    assert r["department_id"] and float(r["budget_min"]) == 600000
    from app.modules.hr.models import RecruitmentRequisition
    assert env.db.get(RecruitmentRequisition, r["id"]).title == "R&D Engineer"        # stored without "&amp;"


def test_requisition_budget_order_and_department_belongs_to_the_organization(env):
    r = env.post("/hr/recruitment/requisitions", json={**REQ, "budget_min": 10, "budget_max": 5, "currency": "INR"})
    assert r.status_code == 422 and "cannot be below the minimum" in r.text
    assert _msg(env.post("/hr/recruitment/requisitions", json={**REQ, "department": "Marketing"}), "department") == DEPARTMENT
    assert _msg(env.post("/hr/recruitment/requisitions", json={**REQ, "department": "Finance"}), "department") == DEPARTMENT  # org 2's
    assert _msg(env.post("/hr/recruitment/requisitions", json={**REQ, "department": "Old Team"}), "department") == DEPARTMENT  # inactive
    req = _ok(env.post("/hr/recruitment/requisitions", json=REQ))
    assert _msg(env.put(f"/hr/recruitment/requisitions/{req['id']}", json={"department": "Finance"}), "department") == DEPARTMENT


# ── candidates: BUG-7 … BUG-10 ───────────────────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("field,value,message", [
    ("name", "%$##$%$TR$%$", PERSON),                         # BUG-7
    ("position", "#$%$#TRF", JOB_TITLE),                      # BUG-9
    ("location", "uytresdfty#$%$#@", LOCATION),               # BUG-10
    ("email", "a@mailinator.com", "Temporary or disposable email addresses are not accepted. Use your real work or personal email address."),
    ("email", "noreply@gmail.com", "Enter the person's own email address. System addresses such as noreply@ or postmaster@ are not accepted."),
])
def test_candidate_junk_is_refused_on_add_and_edit(env, field, value, message):
    assert _msg(env.post("/hr/recruitment/candidates", json={**CAND, field: value}), field) == message
    cand = _ok(env.post("/hr/recruitment/candidates", json={**CAND, "email": f"{field}.ok@gmail.com"}))
    assert _msg(env.put(f"/hr/recruitment/candidates/{cand['id']}", json={field: value}), field) == message


@pytest.mark.parametrize("name", ["José Álvarez", "अनिल कुमार", "Seán O'Brien", "Jean-Luc Picard"])
def test_real_names_in_any_script_are_accepted(env, name):
    assert _ok(env.post("/hr/recruitment/candidates", json={**CAND, "name": name, "email": f"x{abs(hash(name)) % 10000}@gmail.com"}))["name"] == name


def test_candidate_phone_is_checked_for_its_country_and_stored_in_e164(env):
    assert "valid phone number" in _msg(env.post("/hr/recruitment/candidates", json={**CAND, "phone": "(*&^$%^&^%%^"}), "phone")
    assert _ok(env.post("/hr/recruitment/candidates", json={**CAND, "phone": "+91 98765 43210"}))["phone"] == "+919876543210"


# ── interviews: BUG-12 … BUG-16 ─────────────────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("field,value,message", [
    ("position", "#$%#", JOB_TITLE),                          # BUG-12
    ("candidate_name", "%$#@", PERSON),                       # BUG-13
    ("interviewer", "%$#@#%$", PERSON),                       # BUG-16
])
def test_interview_junk_is_refused(env, field, value, message):
    assert _msg(env.post("/hr/recruitment/interviews", json={**IV, field: value}), field) == message


def test_in_person_interviews_need_a_real_place_and_someone_runs_every_interview(env):
    r = env.post("/hr/recruitment/interviews", json={**IV, "interview_type": "in_person"})
    assert r.status_code == 422 and "Enter where the in-person interview takes place." in r.text
    assert _msg(env.post("/hr/recruitment/interviews", json={**IV, "interview_type": "in_person", "location": "@#$#^%$#$"}), "location") == LOCATION   # BUG-14
    r = env.post("/hr/recruitment/interviews", json={**IV, "interviewer": None})
    assert r.status_code == 422 and "Choose an interviewer" in r.text
    iv = _ok(env.post("/hr/recruitment/interviews", json={**IV, "interview_type": "in_person", "location": "Floor 3, Room 4B, Bengaluru"}))
    r = env.put(f"/hr/recruitment/interviews/{iv['id']}", json={"location": "", "notify": False})
    assert r.status_code in (400, 422) and "in-person" in r.text


def test_a_linked_candidate_names_the_interview(env):
    cand = _ok(env.post("/hr/recruitment/candidates", json=CAND))
    iv = _ok(env.post("/hr/recruitment/interviews", json={**IV, "candidate_id": cand["id"], "candidate_name": None, "position": None}))
    assert (iv["candidate_name"], iv["position"]) == ("Anil Kumar", "Senior Engineer II")


# ── offers: BUG-18 … BUG-23 ──────────────────────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("field,value,message", [
    ("candidate_name", "%$#", PERSON),                        # BUG-18
    ("position", "*&^%", JOB_TITLE),                          # BUG-19
    ("work_location", "*&^%$%^&88", LOCATION),                # BUG-21
    ("work_pattern", "*&^%$#%^&*9gh&", WORK_PATTERN),         # BUG-22
    ("equity", "-20000", EQUITY),                             # BUG-23
    ("equity", 150, EQUITY),
    ("equity", "abc", EQUITY),
])
def test_offer_junk_is_refused(env, field, value, message):
    assert _msg(env.post("/hr/recruitment/offers", json={**OFFER, field: value}), field) == message


def test_offer_good_values_and_a_salary_above_zero(env):
    o = _ok(env.post("/hr/recruitment/offers", json={**OFFER, "work_location": "Pune, India", "work_pattern": "Mon–Fri, 9:30–18:30",
                                                      "equity": "0.25"}))
    assert (o["work_location"], o["work_pattern"], float(o["equity"])) == ("Pune, India", "Mon–Fri, 9:30–18:30", 0.25)
    assert _msg(env.post("/hr/recruitment/offers", json={**OFFER, "salary": 0}), "salary") == "Enter an amount greater than 0."


# ── new hires: BUG-24 … BUG-27 ───────────────────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("field,value,message", [
    ("candidate_name", "U^%$#$%^&*876", PERSON),              # BUG-24
    ("phone", "(*&^$%^&^%%^", "Enter a valid phone number for India."),   # BUG-26
    ("position", "*&^%^&*876", JOB_TITLE),                    # BUG-27
])
def test_new_hire_junk_is_refused_on_add_and_edit(env, field, value, message):
    assert _msg(env.post("/hr/onboarding/new-hires", json={**HIRE, field: value}), field) == message
    hire = _ok(env.post("/hr/onboarding/new-hires", json={**HIRE, "email": f"{field}.ok@gmail.com"}))
    assert _msg(env.put(f"/hr/onboarding/new-hires/{hire['id']}", json={field: value}), field) == message


def test_new_hire_good_values(env):
    h = _ok(env.post("/hr/onboarding/new-hires", json={**HIRE, "phone": "+91 98765 43210"}))
    assert (h["candidate_name"], h["position"], h["phone"]) == ("Neha Verma", "HR Executive", "+919876543210")


# ── departments: the junk that showed up in every department list (BUG-20, BUG-28) ─────────────────────────────────────
def test_department_names_follow_the_org_unit_rule(env):
    assert _msg(env.post("/hr/departments", json={"name": "8765$%^&*(8", "code": "JNK"}), "name") == ORG_UNIT
    assert _ok(env.post("/hr/departments", json={"name": "Design & Research", "code": "DSR"}))["name"] == "Design & Research"


# ── stored as typed, escaped on output (root cause F) ─────────────────────────────────────────────────────────────────
def test_text_is_stored_plain_and_emails_escape_it_once():
    from app.services.email_service import render_email
    out = render_email("requisition_approval_request.html", {
        "subject": "Requisition awaiting approval", "admin_name": "Alex", "requester_name": "Hana", "title_text": "R&D Engineer",
        "department": "Engineering", "openings": 1, "priority": "high", "location": None, "organization_name": "Acme",
        "requisitions_url": "https://app.zoikohr.com/zoiko-hr/recruitment/job-requisitions"})
    assert "R&amp;D Engineer" in out.html and "R&amp;amp;D" not in out.html and "R&D Engineer" in out.text


def test_old_escaped_text_is_repaired_once(env):
    from app.modules.hr.models import RecruitmentRequisition
    from app.modules.hr.recruitment_text_repair import repair
    env.db.add(RecruitmentRequisition(title="*&amp;^%$45^&amp;87", department="R&amp;D", organization_id=1, location="Pune"))
    env.db.commit()
    bind = env.db.connection()
    assert repair(bind, dry_run=True) == [("recruitment_requisitions", 1, "title"), ("recruitment_requisitions", 1, "department")]
    repair(bind, dry_run=False)
    env.db.commit()
    env.db.expire_all()
    row = env.db.get(RecruitmentRequisition, 1)
    assert (row.title, row.department) == ("*&^%$45^&87", "R&D")
    assert repair(env.db.connection(), dry_run=True) == []


# ── a refused address is marked on the person's profile (BUG-8, BUG-25) ────────────────────────────────────────────────
def test_a_permanently_refused_address_marks_the_candidate_and_new_hire_bounced(env):
    from app.modules.hr import email_status
    cand = _ok(env.post("/hr/recruitment/candidates", json=CAND))
    hire = _ok(env.post("/hr/onboarding/new-hires", json={**HIRE, "email": CAND["email"]}))
    assert not email_status.is_recipient_bounce("SMTPRecipientsRefused | SMTP 450 | try later")
    assert email_status.is_recipient_bounce("SMTPRecipientsRefused | SMTP 550 | 5.1.1 user unknown")
    assert email_status.mark_bounced(env.db, 1, "Anil.Kumar@gmail.com") == 2
    assert _ok(env.get(f"/hr/recruitment/candidates/{cand['id']}"))["email_status"] == "bounced"
    assert _ok(env.get(f"/hr/onboarding/new-hires/{hire['id']}"))["email_status"] == "bounced"
    edited = _ok(env.put(f"/hr/recruitment/candidates/{cand['id']}", json={"email": "anil.k@gmail.com"}))
    assert edited["email_status"] is None                      # a new address starts clean


def test_email_typos_are_suggested_not_refused():
    from app.core.email_quality import suggest_email
    assert suggest_email("yash@gmial.com") == "yash@gmail.com"
    assert suggest_email("a@hotmial.com") == "a@hotmail.com"
    assert suggest_email("a@gmail.com") is None


# ── the stored-junk report (root cause E) ────────────────────────────────────────────────────────────────────────────
def test_the_report_finds_stored_junk_and_never_deletes_in_production(env, monkeypatch):
    import importlib.util
    import pathlib
    spec = importlib.util.spec_from_file_location("report_invalid_records",
                                                  pathlib.Path(__file__).resolve().parents[1] / "scripts" / "report_invalid_records.py")
    report = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(report)
    from app.modules.hr.models import Department, OnboardingNewHire, RecruitmentCandidate
    env.db.add_all([RecruitmentCandidate(name="%$##$%$TR$%$", email="j@gmail.com", position="Dev", organization_id=1),
                    Department(name="8765$%^&*(8", code="JUNK", organization_id=1, is_active=True),
                    OnboardingNewHire(candidate_name="U^%$#$%^&*876", email="u@gmail.com", position="HR Executive", organization_id=1)])
    env.db.commit()
    found = report.find(env.db, 1)
    hits = {(f["table"], f["field"], f["value"]) for f in found}
    assert ("recruitment_candidates", "name", "%$##$%$TR$%$") in hits
    assert ("departments", "name", "8765$%^&*(8") in hits
    assert ("onboarding_new_hires", "candidate_name", "U^%$#$%^&*876") in hits
    assert all(f["organization_id"] == 1 for f in found)
    from app.config import settings
    monkeypatch.setattr(settings, "DEBUG", False)
    with pytest.raises(SystemExit, match="Refusing to delete"):
        report.delete_test_records(env.db, 1, found)
    monkeypatch.setattr(settings, "DEBUG", True)
    removed = report.delete_test_records(env.db, 1, found)
    assert removed.get("recruitment_candidates") == 1 and removed.get("departments (deactivated)") == 1
    assert report.find(env.db, 1) == []
