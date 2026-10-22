"""Onboarding end to end: offer accepted -> new hire with settings applied (checklists, document requests, invite) ->
the new hire's pre-onboarding page (upload, details) -> HR review (rejection asks again) -> checklists with owners and
dates from the joining date -> orientation invites and attendance -> completion only when the work is done ->
employee account (with the offer's employment type and the details the new hire entered) and emails."""
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db

JOIN = date.today() + timedelta(days=14)


@pytest.fixture
def env(monkeypatch, tmp_path):
    from app.main import app
    from app.core.dependencies import get_current_admin, get_current_user
    from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
    from app.modules.hr.models import Department, Organization, OrganizationStatus

    monkeypatch.setattr("app.modules.hr.router._ONBOARDING_DOC_UPLOAD_DIR", str(tmp_path))
    # plans are not what this suite tests
    from app.core import entitlements as _ent
    monkeypatch.setattr(_ent, "check_entitlement", lambda db, org_id, key: {"state": _ent.ENTITLED_AVAILABLE})
    monkeypatch.setattr("app.core.code_generation.generate_employee_code", lambda db, organization_id=None: f"ACM-{organization_id}-{id(db) % 9999}")
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add(Organization(id=1, name="Acme", organization_name="Acme", status=OrganizationStatus.ACTIVE, country="India", currency="INR"))
    s.add(Organization(id=2, name="Other", organization_name="Other", status=OrganizationStatus.ACTIVE))
    s.commit()
    s.add(Department(id=1, name="Engineering", code="ENG", organization_id=1))
    s.commit()

    def emp(email, role, first, org=1):
        e = Employee(email=email, hashed_password="x", employee_code=f"C-{email}", role=role, first_name=first, last_name="T", job_title="t",
                     employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=org,
                     is_active=True)
        s.add(e)
        s.commit()
        return e

    hr = emp("hr@acme.com", UserRole.HR_ADMIN, "Hana")
    it = emp("it@acme.com", UserRole.EMPLOYEE, "Ivan")
    mgr = emp("mgr@acme.com", UserRole.MANAGER, "Mona")
    stranger = emp("x@other.com", UserRole.EMPLOYEE, "Xavi", org=2)

    sent = []
    from app.services import email_service
    monkeypatch.setattr(email_service, "send_approval_email",
                        lambda email, template, context, **kw: sent.append({"to": email, "template": template, "ctx": context}) or True)
    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: hr
    app.dependency_overrides[get_current_admin] = lambda: hr
    from app.core.rate_limiter import limiter
    limiter.enabled = False
    c = TestClient(app, raise_server_exceptions=False)

    class Env:
        pass
    e = Env()
    e.c, e.db, e.sent, e.hr, e.it, e.mgr, e.stranger = c, s, sent, hr, it, mgr, stranger
    yield e
    limiter.enabled = True
    for dep in (get_db, get_current_user, get_current_admin):
        app.dependency_overrides.pop(dep, None)
    s.close()
    engine.dispose()


def _ok(r):
    assert r.status_code in (200, 201), r.text
    return r.json()


def _token(env):
    invite = [m for m in env.sent if m["template"] in ("onboarding_invite.html", "onboarding_document_request.html")][-1]
    url = invite["ctx"]["portal_url"]
    return url.rsplit("/", 1)[1]


def _setup_template_and_settings(env):
    tpl = _ok(env.c.post("/hr/onboarding/checklist-templates", json={"name": "IT setup", "category": "IT", "items": [
        {"title": "Laptop", "due_offset_days": -2, "assignee_employee_id": env.it.id},
        {"title": "Email account", "due_offset_days": 0},
    ]}))
    _ok(env.c.put("/hr/onboarding/settings", json={"auto_template_ids": [tpl["id"]], "required_document_categories": ["id_proof", "bank_details"],
                                                    "auto_send_portal_invite": True, "welcome_message": "See you soon!"}))
    return tpl


def test_full_onboarding_flow_from_offer_to_employee(env):
    tpl = _setup_template_and_settings(env)
    # the template edit keeps its items (they used to be dropped)
    tpl2 = _ok(env.c.put(f"/hr/onboarding/checklist-templates/{tpl['id']}", json={"items": [
        {"id": tpl["items"][0]["id"], "title": "Laptop", "due_offset_days": -2, "assignee_employee_id": env.it.id},
        {"id": tpl["items"][1]["id"], "title": "Email account + Slack", "due_offset_days": 0}]}))
    assert [i["title"] for i in tpl2["items"]] == ["Laptop", "Email account + Slack"]

    # recruitment: offer accepted -> onboarding starts on its own
    req = _ok(env.c.post("/hr/recruitment/requisitions", json={"title": "Intern", "department": "Engineering", "status": "pending"}))
    _ok(env.c.put(f"/hr/recruitment/requisitions/{req['id']}/approve"))
    cand = _ok(env.c.post("/hr/recruitment/candidates", json={"name": "Sam Rivera", "email": "sam@mail.com", "position": "Intern", "requisition_id": req["id"]}))
    offer = _ok(env.c.post("/hr/recruitment/offers", json={"candidate_id": cand["id"], "candidate_name": "Sam Rivera", "position": "Intern",
                                                            "employment_type": "internship", "salary": 20000, "joining_date": JOIN.isoformat()}))
    _ok(env.c.put(f"/hr/recruitment/offers/{offer['id']}", json={"status": "pending"}))     # a pre-engine offer, answered by hand
    _ok(env.c.put(f"/hr/recruitment/offers/{offer['id']}/accept"))

    hires = _ok(env.c.get("/hr/onboarding/new-hires"))
    assert len(hires) == 1
    hire = hires[0]
    assert hire["employment_type"] == "internship" and hire["department_id"] == 1 and hire["joining_date"] == JOIN.isoformat()
    assert hire["status"] == "offer_accepted" and hire["portal_invited_at"]

    checklist = _ok(env.c.get(f"/hr/onboarding/checklist-assignments?onboarding_record_id={hire['id']}"))[0]
    laptop = next(i for i in checklist["items"] if i["title"] == "Laptop")
    assert laptop["due_date"] == (JOIN - timedelta(days=2)).isoformat() and laptop["assignee_name"] == "Ivan T"
    assert any(m["template"] == "onboarding_task_assigned.html" and m["to"] == "it@acme.com" for m in env.sent)
    invite = next(m for m in env.sent if m["template"] == "onboarding_invite.html")
    assert invite["to"] == "sam@mail.com" and invite["ctx"]["documents_requested"] == 2

    # the new hire's page: no account needed
    token = _token(env)
    page = _ok(env.c.get(f"/public/onboarding/{token}"))
    assert page["organization_name"] == "Acme" and {d["category"] for d in page["documents"]} == {"id_proof", "bank_details"}
    assert env.c.get("/public/onboarding/not-a-real-token-at-all-xxxxxxxx").status_code == 404
    _ok(env.c.put(f"/public/onboarding/{token}/details", json={"address": "12 MG Road", "city": "Pune", "emergency_contact_name": "Ana",
                                                                "emergency_contact_phone": "+91 9876543210"}))
    for d in page["documents"]:
        _ok(env.c.post(f"/public/onboarding/{token}/documents/{d['id']}", files={"file": ("id.pdf", b"%PDF-1.4 test", "application/pdf")}))
    assert _ok(env.c.get(f"/hr/onboarding/new-hires/{hire['id']}"))["status"] == "pre_joining"

    # HR review: one approved, one rejected -> the new hire is asked again with the same link
    docs = _ok(env.c.get(f"/hr/onboarding/documents?onboarding_record_id={hire['id']}"))
    assert all(d["status"] == "pending" for d in docs)
    _ok(env.c.put(f"/hr/onboarding/documents/{docs[0]['id']}", json={"status": "approved"}))
    _ok(env.c.put(f"/hr/onboarding/documents/{docs[1]['id']}", json={"status": "rejected", "rejection_reason": "Blurry"}))
    ask = [m for m in env.sent if m["template"] == "onboarding_document_request.html"][-1]
    assert ask["to"] == "sam@mail.com" and ask["ctx"]["portal_url"].endswith(token)          # earlier links keep working

    # completion is blocked while work is open
    _ok(env.c.put(f"/hr/onboarding/new-hires/{hire['id']}", json={"status": "in_progress"}))
    r = env.c.put(f"/hr/onboarding/new-hires/{hire['id']}", json={"status": "completed"})
    assert r.status_code == 400 and "checklist" in r.json()["message"] and "document" in r.json()["message"]
    prog = _ok(env.c.get(f"/hr/onboarding/new-hires/{hire['id']}/progress"))
    assert prog["checklist_total"] == 2 and prog["documents_approved"] == 1 and prog["blockers"]

    # the new hire re-uploads, HR approves, the checklist is done (items keep their ids; status follows)
    _ok(env.c.post(f"/public/onboarding/{token}/documents/{docs[1]['id']}", files={"file": ("bank.pdf", b"%PDF-1.4 again", "application/pdf")}))
    _ok(env.c.put(f"/hr/onboarding/documents/{docs[1]['id']}", json={"status": "approved"}))
    ids_before = sorted(i["id"] for i in checklist["items"])
    done = _ok(env.c.put(f"/hr/onboarding/checklist-assignments/{checklist['id']}", json={"items": [
        {"id": i["id"], "title": i["title"], "completed": True, "due_offset_days": i["due_offset_days"], "assignee_employee_id": i["assignee_employee_id"]}
        for i in checklist["items"]]}))
    assert sorted(i["id"] for i in done["items"]) == ids_before and done["status"] == "completed"

    # orientation: invite on add, attendance only on/after the day
    sess = _ok(env.c.post("/hr/onboarding/orientation-sessions", json={"title": "Welcome day", "date": JOIN.isoformat(), "time": "10:00"}))
    att = _ok(env.c.post("/hr/onboarding/orientation-attendees", json={"session_id": sess["id"], "onboarding_record_id": hire["id"]}))
    assert any(m["template"] == "orientation_invite.html" and m["ctx"]["kind_label"] == "Invitation" for m in env.sent)
    assert env.c.put(f"/hr/onboarding/orientation-attendees/{att['id']}", json={"status": "attended"}).status_code == 400
    _ok(env.c.put(f"/hr/onboarding/orientation-sessions/{sess['id']}", json={"time": "11:00"}))
    assert any(m["template"] == "orientation_invite.html" and m["ctx"]["kind_label"] == "Updated" for m in env.sent)

    # complete -> employee account with the offer's type and the new hire's details; admins + manager told
    _ok(env.c.put(f"/hr/onboarding/new-hires/{hire['id']}", json={"manager_id": env.mgr.id}))
    finished = _ok(env.c.put(f"/hr/onboarding/new-hires/{hire['id']}", json={"status": "completed"}))
    assert finished["status"] == "completed" and finished["joining_status"] == "joined" and finished["completed_at"]
    assert "temp_password" not in finished
    from app.modules.employee.models import Employee, EmploymentType
    emp = env.db.query(Employee).filter(Employee.email == "sam@mail.com").one()
    assert emp.employment_type == EmploymentType.INTERN                      # an internship offer stays an intern
    assert emp.current_address == "12 MG Road" and emp.emergency_contacts[0]["name"] == "Ana"
    # pay arrives the way an employee import fills it: country (decides the currency shown) and annual CTC
    assert emp.country == "India" and float(emp.ctc) == 240000.0                 # INR 20,000 stipend per month
    assert {m["to"] for m in env.sent if m["template"] == "onboarding_completed.html"} >= {"hr@acme.com", "mgr@acme.com"}
    assert env.c.get(f"/public/onboarding/{token}").status_code == 404                     # the link dies with completion
    assert env.c.put(f"/hr/onboarding/new-hires/{hire['id']}", json={"status": "in_progress"}).status_code == 400
    assert env.c.delete(f"/hr/onboarding/new-hires/{hire['id']}").status_code == 400


def test_rules_and_tenant_boundaries(env):
    hire = _ok(env.c.post("/hr/onboarding/new-hires", json={"candidate_name": "Lee Park", "email": "lee@mail.com", "position": "Dev",
                                                             "start_onboarding": False}))
    assert env.c.post("/hr/onboarding/new-hires", json={"candidate_name": "Lee", "email": "LEE@mail.com", "position": "Dev"}).status_code == 400
    assert env.c.put(f"/hr/onboarding/new-hires/{hire['id']}", json={"status": "bogus"}).status_code == 422
    assert env.c.put(f"/hr/onboarding/new-hires/{hire['id']}", json={"manager_id": env.stranger.id}).status_code == 400
    # forced completion is possible when HR decides so
    _ok(env.c.put(f"/hr/onboarding/new-hires/{hire['id']}", json={"status": "in_progress"}))
    _ok(env.c.post(f"/hr/onboarding/new-hires/{hire['id']}/document-requests", json={"categories": ["nda"]}))
    assert env.c.put(f"/hr/onboarding/new-hires/{hire['id']}", json={"status": "completed"}).status_code == 400
    assert _ok(env.c.put(f"/hr/onboarding/new-hires/{hire['id']}", json={"status": "completed", "force_complete": True}))["status"] == "completed"
    # tasks belong to a new hire of this organization
    assert env.c.post("/hr/onboarding/preboarding-tasks", json={"title": "x", "onboarding_new_hire_id": 99999}).status_code == 404


def test_dashboard_and_report_numbers(env):
    _setup_template_and_settings(env)
    _ok(env.c.post("/hr/onboarding/new-hires", json={"candidate_name": "A B", "email": "a@mail.com", "position": "P", "joining_date": JOIN.isoformat()}))
    dash = _ok(env.c.get("/hr/onboarding/dashboard"))
    assert dash["documentsPending"] == 2 and dash["checklistsPending"] == 2 and dash["upcomingJoinersTotal"] == 1
    rep = _ok(env.c.get("/hr/onboarding/reports/joining"))
    assert rep["totalJoiners"] == 1 and rep["monthlyTrend"][0]["count"] == 1


def test_reminders_go_to_new_hires_who_still_owe_documents(env):
    from app.modules.hr import onboarding_flow
    from app.modules.hr.models import OnboardingNewHire
    _setup_template_and_settings(env)
    hire = _ok(env.c.post("/hr/onboarding/new-hires", json={"candidate_name": "R M", "email": "r@mail.com", "position": "P"}))
    row = env.db.get(OnboardingNewHire, hire["id"])
    before = len(env.sent)
    assert onboarding_flow.run_document_reminders(env.db, today=row.portal_invited_at.date() + timedelta(days=3)) == 1
    reminder = env.sent[before]
    assert reminder["template"] == "onboarding_document_request.html" and reminder["ctx"]["is_reminder"] is True


def test_an_imported_employee_is_linked_to_their_onboarding_and_not_duplicated(env):
    from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
    from app.modules.employee.service import _link_imported_to_onboarding
    hire = _ok(env.c.post("/hr/onboarding/new-hires", json={"candidate_name": "Lee Park", "email": "lee@mail.com", "position": "Dev",
                                                             "start_onboarding": False}))
    imported = Employee(email="lee@mail.com", hashed_password="x", employee_code="IMP-1", role=UserRole.EMPLOYEE, first_name="Lee",
                        last_name="Park", job_title="Dev", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE,
                        date_of_joining=date.today(), organization_id=1, is_active=True, country="United Kingdom", ctc=50000)
    env.db.add(imported)
    env.db.commit()
    # raw rows as the file parser returns them: keyed by the file's own headings
    assert _link_imported_to_onboarding(env.db, 1, [{"Email": "LEE@mail.com", "__row": 2}, {"E-mail": "nobody@mail.com", "__row": 3}]) == 1
    assert _ok(env.c.get(f"/hr/onboarding/new-hires/{hire['id']}"))["employee_id"] == imported.id
    _ok(env.c.put(f"/hr/onboarding/new-hires/{hire['id']}", json={"status": "in_progress"}))
    _ok(env.c.put(f"/hr/onboarding/new-hires/{hire['id']}", json={"status": "completed"}))
    assert env.db.query(Employee).filter(Employee.email == "lee@mail.com").count() == 1      # no second account
    env.db.refresh(imported)
    assert imported.country == "United Kingdom" and float(imported.ctc) == 50000            # the import's values are kept
