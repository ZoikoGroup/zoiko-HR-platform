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
    from app.modules.hr.models import OrganizationConfig
    env.db.add(OrganizationConfig(organization_id=1, key="recruitment.offer_letters_without_approval", value="false", category="recruitment"))
    env.db.commit()                                   # a legacy offer keeps its own lifecycle: no automatic approval here
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


def _completed_interview(env, name, email):
    cand = _ok(env.c.post("/hr/recruitment/candidates", json={"name": name, "email": email, "position": "Dev"}))
    iv = _ok(env.c.post("/hr/recruitment/interviews", json={"candidate_id": cand["id"], "interviewer_id": env.interviewer.id,
                                                            "interview_type": "video", "interview_date": FUTURE}))
    return cand, iv


def test_interview_cleared_emails_the_candidate_and_tells_hr_and_the_interviewer(env):
    cand, iv = _completed_interview(env, "Sam Rivera", "sam@mail.com")
    url = f"/hr/recruitment/interviews/{iv['id']}/feedback"
    assert env.c.put(url, json={"result": "cleared"}).status_code == 400, "only a completed interview has a result"
    env.sent.clear()
    r = _ok(env.c.put(url, json={"status": "completed", "rating": 4, "feedback": "Strong system design",
                                 "result": "cleared", "result_message": "We'll send the final round details tomorrow."}))
    assert (r["status"], r["result"], r["result_emailed"]) == ("completed", "cleared", True) and r["result_at"]
    to_candidate = [m for m in env.sent if m["template"] == "interview_cleared.html"]
    assert [m["to"] for m in to_candidate] == ["sam@mail.com"]
    assert to_candidate[0]["ctx"]["message"] == "We'll send the final round details tomorrow."
    assert "Strong system design" not in str(to_candidate[0]["ctx"]), "internal feedback never reaches the candidate"
    internal = [m for m in env.sent if m["template"] == "interview_result_recorded.html"]
    assert {m["to"] for m in internal} == {"admin@acme.com", "lead@acme.com"}, "everyone but the HR user who recorded it"
    assert internal[0]["ctx"]["result_label"] == "Cleared" and internal[0]["ctx"]["candidate_emailed"] is True
    assert r["emails_sent"] == 3
    assert _ok(env.c.get(f"/hr/recruitment/candidates/{cand['id']}"))["status"] == "interview", "a cleared round keeps the stage"

    # the result is final: the same result again sends nothing, a different one is refused
    env.sent.clear()
    again = _ok(env.c.put(url, json={"result": "cleared", "feedback": "Strong system design; good culture fit"}))
    assert again["feedback"].endswith("culture fit") and env.sent == []
    assert env.c.put(url, json={"result": "rejected"}).status_code == 400


def test_interview_rejected_emails_the_candidate_once_and_moves_them_to_rejected(env):
    cand, iv = _completed_interview(env, "Ria Das", "ria@mail.com")
    _ok(env.c.put(f"/hr/recruitment/interviews/{iv['id']}", json={"status": "completed"}))
    env.sent.clear()
    r = _ok(env.c.put(f"/hr/recruitment/interviews/{iv['id']}/feedback", json={"result": "rejected"}))
    assert r["result"] == "rejected" and r["result_emailed"] is True
    assert [m["to"] for m in env.sent if m["template"] == "interview_rejected.html"] == ["ria@mail.com"]
    assert not [m for m in env.sent if m["template"] in ("candidate_status_update.html", "interview_cleared.html")], \
        "no second rejection e-mail"
    assert _ok(env.c.get(f"/hr/recruitment/candidates/{cand['id']}"))["status"] == "rejected"


def test_hr_can_record_a_result_without_emailing_the_candidate(env):
    _cand, iv = _completed_interview(env, "Kai Lee", "kai@mail.com")
    env.sent.clear()
    r = _ok(env.c.put(f"/hr/recruitment/interviews/{iv['id']}/feedback",
                      json={"status": "completed", "result": "cleared", "notify_candidate": False}))
    assert r["result"] == "cleared" and r["result_emailed"] is False
    assert not [m for m in env.sent if m["to"] == "kai@mail.com"]
    internal = [m for m in env.sent if m["template"] == "interview_result_recorded.html"]
    assert internal and internal[0]["ctx"]["candidate_emailed"] is False


def test_interview_result_email_templates_render():
    """Rendered through the real renderer (strict: a missing variable fails) with exactly what the send functions pass."""
    from app.services import email_service
    base = {"candidate_name": "Sam Rivera", "position": "Dev", "organization_name": "Acme", "interview_type_label": "Video interview",
            "date_display": "Thu, Nov 19, 2026"}
    cleared = email_service.render_email("interview_cleared.html", {**base, "subject": "s", "message": "See you <soon>"})
    assert "cleared this interview" in cleared.html and "See you &lt;soon&gt;" in cleared.html, "the note is escaped"
    rejected = email_service.render_email("interview_rejected.html", {**base, "subject": "s", "message": None})
    assert "not to move forward" in rejected.text and "A note from the hiring team" not in rejected.text
    internal = email_service.render_email("interview_result_recorded.html", {
        **base, "subject": "s", "recipient_name": "Hana", "cleared": False, "result_label": "Not selected", "rating": 3,
        "recorded_by": "Alex T", "candidate_emailed": True, "review_url": "https://app.example.com/zoiko-hr/recruitment/interviews"})
    assert "Not selected" in internal.text and "3 / 5" in internal.text and "moved to Rejected" in internal.text
