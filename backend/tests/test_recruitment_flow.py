"""Recruitment end to end: requisition approval, candidate stages, interviews with invitations, offers paid in the right
currency (stipend for interns), and the emails each step sends."""
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db

FUTURE = (date.today() + timedelta(days=7)).isoformat()
LATER = (date.today() + timedelta(days=9)).isoformat()


@pytest.fixture
def env(monkeypatch):
    from app.main import app
    from app.core.dependencies import get_current_admin, get_current_user
    from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
    from app.modules.hr.models import Organization, OrganizationStatus

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add(Organization(id=1, name="Acme", organization_name="Acme", status=OrganizationStatus.ACTIVE, country="India", currency="INR"))
    s.commit()

    def emp(email, role, first):
        e = Employee(email=email, hashed_password="x", employee_code=f"C-{email}", role=role, first_name=first, last_name="T", job_title="t",
                     employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=1,
                     is_active=True)
        s.add(e)
        s.commit()
        return e

    hr = emp("hr@acme.com", UserRole.HR_ADMIN, "Hana")
    admin = emp("admin@acme.com", UserRole.ADMIN, "Alex")
    interviewer = emp("lead@acme.com", UserRole.MANAGER, "Lee")

    sent = []
    from app.services import email_service
    monkeypatch.setattr(email_service, "send_approval_email",
                        lambda email, template, context, **kw: sent.append({"to": email, "template": template, "ctx": context,
                                                                             "attachments": kw.get("attachments")}) or True)
    who = {"user": hr}
    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: who["user"]
    app.dependency_overrides[get_current_admin] = lambda: who["user"]
    c = TestClient(app, raise_server_exceptions=False)

    class Env:
        pass
    e = Env()
    e.c, e.db, e.sent, e.who, e.hr, e.admin, e.interviewer = c, s, sent, who, hr, admin, interviewer
    yield e
    for dep in (get_db, get_current_user, get_current_admin):
        app.dependency_overrides.pop(dep, None)
    s.close()
    engine.dispose()


def _ok(r):
    assert r.status_code in (200, 201), r.text
    return r.json()


def test_requisition_is_approved_before_it_opens_and_both_sides_are_emailed(env):
    req = _ok(env.c.post("/hr/recruitment/requisitions", json={"title": "Backend Engineer", "department": "Eng", "openings": 2,
                                                                "priority": "high", "requirements": "Python", "status": "pending"}))
    assert req["status"] == "pending" and req["requirements"] == "Python"
    assert [m["to"] for m in env.sent if m["template"] == "requisition_approval_request.html"] == ["admin@acme.com"]
    # status cannot be forced open through an edit
    r = env.c.put(f"/hr/recruitment/requisitions/{req['id']}", json={"status": "open"})
    assert _ok(r)["status"] == "pending"
    env.who["user"] = env.admin
    assert _ok(env.c.put(f"/hr/recruitment/requisitions/{req['id']}/approve"))["status"] == "open"
    assert [m["to"] for m in env.sent if m["template"] == "requisition_decision.html"] == ["hr@acme.com"]
    assert _ok(env.c.put(f"/hr/recruitment/requisitions/{req['id']}/hold"))["status"] == "on_hold"
    assert _ok(env.c.put(f"/hr/recruitment/requisitions/{req['id']}/resume"))["status"] == "open"
    assert env.c.put(f"/hr/recruitment/requisitions/{req['id']}/reject").status_code == 400      # open: close it instead


def test_candidate_stages_follow_the_rules_and_the_candidate_is_told(env):
    cand = _ok(env.c.post("/hr/recruitment/candidates", json={"name": "Sam Rivera", "email": "sam@mail.com", "position": "Dev", "location": "Pune, India"}))
    assert _ok(env.c.put(f"/hr/recruitment/candidates/{cand['id']}/status", json={"status": "screening"}))["status"] == "screening"
    assert any(m["template"] == "candidate_status_update.html" and m["to"] == "sam@mail.com" for m in env.sent)
    assert env.c.put(f"/hr/recruitment/candidates/{cand['id']}/status", json={"status": "hired"}).status_code == 400
    _ok(env.c.put(f"/hr/recruitment/candidates/{cand['id']}/status", json={"status": "rejected"}))
    assert env.c.put(f"/hr/recruitment/candidates/{cand['id']}/status", json={"status": "offer"}).status_code == 400


def test_interview_invites_candidate_and_interviewer_with_a_calendar_file_and_tracks_changes(env):
    cand = _ok(env.c.post("/hr/recruitment/candidates", json={"name": "Sam Rivera", "email": "sam@mail.com", "position": "Dev"}))
    iv = _ok(env.c.post("/hr/recruitment/interviews", json={
        "candidate_id": cand["id"], "interviewer_id": env.interviewer.id, "interview_type": "video", "interview_date": FUTURE,
        "start_time": "10:00", "end_time": "11:00", "timezone": "Asia/Kolkata", "meeting_link": "https://meet.example.com/x"}))
    assert iv["candidate_name"] == "Sam Rivera" and iv["interviewer"] == "Lee T" and iv["emails_sent"] == 2
    invites = [m for m in env.sent if m["template"] == "interview_scheduled.html"]
    assert {m["to"] for m in invites} == {"sam@mail.com", "lead@acme.com"}
    ics = invites[0]["attachments"][0][1]
    assert "BEGIN:VCALENDAR" in ics and "DTSTART;TZID=Asia/Kolkata:" in ics
    assert _ok(env.c.get(f"/hr/recruitment/candidates/{cand['id']}"))["status"] == "interview"

    moved = _ok(env.c.put(f"/hr/recruitment/interviews/{iv['id']}", json={"interview_date": LATER}))
    assert moved["emails_sent"] == 2 and sum(m["template"] == "interview_rescheduled.html" for m in env.sent) == 2
    _ok(env.c.put(f"/hr/recruitment/interviews/{iv['id']}", json={"status": "cancelled"}))
    cancels = [m for m in env.sent if m["template"] == "interview_cancelled.html"]
    assert len(cancels) == 2 and "METHOD:CANCEL" in cancels[0]["attachments"][0][1]


def test_interview_validation(env):
    base = {"candidate_name": "A", "position": "B", "interview_date": FUTURE}
    assert env.c.post("/hr/recruitment/interviews", json={**base, "start_time": "11:00", "end_time": "10:00"}).status_code == 422
    assert env.c.post("/hr/recruitment/interviews", json={**base, "meeting_link": "http://x.com"}).status_code == 422
    assert env.c.post("/hr/recruitment/interviews", json={**base, "timezone": "Mars/Base"}).status_code == 422
    assert env.c.post("/hr/recruitment/interviews", json={**base, "interview_date": "2020-01-01"}).status_code == 400
    assert env.c.post("/hr/recruitment/interviews", json={**base, "interviewer_id": 99999}).status_code == 400


def test_offer_currency_follows_the_region_and_internships_pay_a_stipend(env):
    cand = _ok(env.c.post("/hr/recruitment/candidates", json={"name": "Lena", "email": "lena@mail.com", "position": "Designer", "location": "Berlin, Germany"}))
    o = _ok(env.c.post("/hr/recruitment/offers", json={"candidate_id": cand["id"], "candidate_name": "Lena", "position": "Designer", "salary": 52000}))
    assert o["currency"] == "EUR" and o["work_country"] == "DE" and o["remuneration_type"] == "salary" and o["pay_period"] == "annual"

    # An explicitly selected cross-border currency is preserved without losing the
    # candidate's work-country jurisdiction for template-pack selection.
    cross_border = _ok(env.c.post("/hr/recruitment/offers", json={"candidate_id": cand["id"], "candidate_name": "Lena",
                                                                    "position": "Designer", "salary": 52000, "currency": "GBP"}))
    assert cross_border["currency"] == "GBP" and cross_border["work_country"] == "DE"

    plain = _ok(env.c.post("/hr/recruitment/offers", json={"candidate_name": "No Link", "position": "Ops", "salary": 1}))
    assert plain["currency"] == "INR"                                                  # organization default

    uk = _ok(env.c.post("/hr/recruitment/offers", json={"candidate_name": "X", "position": "Y", "work_country": "GB", "salary": 1}))
    assert uk["currency"] == "GBP"

    intern = _ok(env.c.post("/hr/recruitment/offers", json={"candidate_name": "I", "position": "Intern", "employment_type": "internship", "salary": 25000}))
    assert intern["remuneration_type"] == "stipend" and intern["pay_period"] == "monthly"
    r = env.c.post("/hr/recruitment/offers", json={"candidate_name": "I", "position": "Intern", "employment_type": "internship", "remuneration_type": "salary"})
    assert r.status_code == 400
    assert env.c.post("/hr/recruitment/offers", json={"candidate_name": "I", "position": "P", "currency": "XXX"}).status_code == 400


def test_legacy_offers_are_answered_by_hand_and_new_ones_go_through_documents(env):
    """Offer letters are engine documents now (tests/doc_templates/test_dt_recruitment.py covers that flow). The old plain-email
    /send is retired; an offer that was already sent before the engine (pending, no document) can still be recorded by hand."""
    cand = _ok(env.c.post("/hr/recruitment/candidates", json={"name": "Sam", "email": "sam@mail.com", "position": "Intern"}))
    o = _ok(env.c.post("/hr/recruitment/offers", json={"candidate_id": cand["id"], "candidate_name": "Sam", "position": "Intern",
                                                        "employment_type": "internship", "salary": 25000, "currency": "INR",
                                                        "entity_name": "Acme Pvt Ltd", "entity_tax_id": "27aapfu0939f1zv",
                                                        "entity_country": "IN", "entity_id_type": "gstin"}))
    assert o["entity_tax_id"] == "27AAPFU0939F1ZV"
    assert o["remuneration_type"] == "stipend" and o["pay_period"] == "monthly"
    assert env.c.put(f"/hr/recruitment/offers/{o['id']}/accept").status_code == 400          # not sent yet
    retired = env.c.put(f"/hr/recruitment/offers/{o['id']}/send")
    assert retired.status_code == 410 and not any(m["template"] == "offer_letter.html" for m in env.sent)
    _ok(env.c.put(f"/hr/recruitment/offers/{o['id']}", json={"status": "pending"}))         # sent before the engine existed

    assert _ok(env.c.put(f"/hr/recruitment/offers/{o['id']}/accept"))["status"] == "accepted"
    c = _ok(env.c.get(f"/hr/recruitment/candidates/{cand['id']}"))
    assert c["status"] == "hired" and c["hired_at"]
    assert {m["to"] for m in env.sent if m["template"] == "offer_outcome.html"} == {"hr@acme.com", "admin@acme.com"}
    assert env.c.put(f"/hr/recruitment/offers/{o['id']}", json={"salary": 1}).status_code == 400   # closed offers are final
    dash = _ok(env.c.get("/hr/recruitment/dashboard"))
    assert dash["offers_accepted"] == 1 and dash["time_to_hire"] is not None


def test_a_candidate_with_history_cannot_be_deleted(env):
    cand = _ok(env.c.post("/hr/recruitment/candidates", json={"name": "Sam", "email": "sam@mail.com", "position": "Dev"}))
    _ok(env.c.post("/hr/recruitment/interviews", json={"candidate_id": cand["id"], "interview_date": FUTURE, "notify": False}))
    r = env.c.delete(f"/hr/recruitment/candidates/{cand['id']}")
    assert r.status_code == 400 and "interview" in r.json()["message"]


def test_regions_reference(env):
    data = _ok(env.c.get("/hr/reference/regions"))
    assert data["organization"] == {"country_code": "IN", "currency": "INR"}
    assert {"code": "DE", "name": "Germany", "currency": "EUR"} in data["countries"]


def test_country_matching():
    from app.core.regions import country_code, currency_for
    assert country_code("Bengaluru, Karnataka, India") == "IN"
    assert country_code("London") == "GB" and country_code("USA") == "US" and country_code("de") == "DE"
    assert currency_for("Remote", "INR") == "INR" and currency_for("Dubai, UAE") == "AED"


def test_contracting_entity_follows_its_country(env):
    base = {"candidate_name": "F", "position": "Consultant", "employment_type": "freelance", "salary": 1}
    r = env.c.post("/hr/recruitment/offers", json={**base, "entity_name": "X", "entity_country": "IN", "entity_id_type": "gstin",
                                                    "entity_tax_id": "27AAPFU0939F1ZX"})
    assert r.status_code == 400 and "check digit" in r.json()["message"]
    r = env.c.post("/hr/recruitment/offers", json={**base, "entity_name": "X", "entity_country": "US", "entity_tax_id": "12-3456789",
                                                    "entity_postal_code": "9410"})
    assert r.status_code == 400 and "ZIP" in r.json()["message"]
    ok = _ok(env.c.post("/hr/recruitment/offers", json={**base, "entity_name": "X Inc", "entity_country": "US", "entity_tax_id": "12-3456789",
                                                         "entity_city": "San Francisco", "entity_region": "California", "entity_postal_code": "94105"}))
    assert ok["entity_id_type"] == "ein" and ok["entity_tax_id"] == "123456789" and ok["entity_region"] == "California"
    r = env.c.post("/hr/recruitment/offers", json={**base, "entity_name": "X", "entity_country": "AE", "entity_region": "Texas"})
    assert r.status_code == 400 and "Emirate" in r.json()["message"]
    # the entity country defaults to the work country
    au = _ok(env.c.post("/hr/recruitment/offers", json={**base, "work_country": "AU", "entity_name": "Y Pty", "entity_id_type": "abn",
                                                         "entity_tax_id": "51 824 753 556"}))
    assert au["entity_country"] == "AU" and au["entity_tax_id"] == "51824753556"
    fmts = _ok(env.c.get("/hr/reference/business-formats"))
    assert [i["key"] for i in fmts["countries"]["IN"]["ids"]][:2] == ["gstin", "cin"] and fmts["countries"]["IN"]["postal_label"] == "PIN code"
    assert "checksum" not in fmts["countries"]["AU"]["ids"][0]
