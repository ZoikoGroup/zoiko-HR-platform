"""The offer-accepted welcome e-mail: one e-mail on acceptance (no separate invite), the organisation's welcome message rendered
by one shared renderer for the e-mail and the portal, placeholders filled and escaped, defaults and backfill, the
auto-invite-off variant, tenant isolation, the Settings preview / test e-mail endpoints."""
import email as email_lib
import importlib.util
import os
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.modules.hr import welcome_message as WM

JOIN = date.today() + timedelta(days=14)

SPEC_DEFAULT = """## Welcome to the Team!
We're delighted to welcome you and excited to have you join us.

Your appointment marks the beginning of an important new chapter, and we look forward to the experience, ideas, and perspectives you'll bring. We believe that great achievements begin with great people, and we're committed to helping you feel welcomed, valued, and supported from your very first day.

## Your Journey Starts Here
To help you get off to a smooth and confident start, we've prepared a personalised pre-onboarding experience.

Please take a few moments to complete the steps outlined below. These may include confirming your personal information, submitting required documents, reviewing important policies, and completing essential onboarding tasks.

We encourage you to complete all required steps before your start date, or by any specific deadlines provided.

## We're Here to Support You
Your privacy and the security of your information are important to us. Please submit sensitive documents through your secure onboarding portal.

If you have questions, require assistance, or need an accessible alternative, our HR team is here to help.

We look forward to welcoming you, celebrating your achievements, and building a successful future together.

Once again, congratulations and welcome aboard!"""


@pytest.fixture
def env(monkeypatch, tmp_path):
    from app.main import app
    from app.core.dependencies import get_current_admin, get_current_user
    from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
    from app.modules.hr.models import Department, Organization, OrganizationStatus

    monkeypatch.setattr("app.modules.hr.router._ONBOARDING_DOC_UPLOAD_DIR", str(tmp_path))
    from app.core import entitlements as _ent
    monkeypatch.setattr(_ent, "check_entitlement", lambda db, org_id, key: {"state": _ent.ENTITLED_AVAILABLE})
    monkeypatch.setattr("app.core.code_generation.generate_employee_code", lambda db, organization_id=None: f"ACM-{organization_id}-{id(db) % 9999}")
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add(Organization(id=1, name="Acme", organization_name="Acme", status=OrganizationStatus.ACTIVE, country="India", currency="INR"))
    s.add(Organization(id=2, name="Globex", organization_name="Globex", status=OrganizationStatus.ACTIVE))
    s.commit()
    s.add(Department(id=1, name="Design", code="DES", organization_id=1))
    s.commit()

    def emp(mail, role, first, org=1):
        e = Employee(email=mail, hashed_password="x", employee_code=f"C-{mail}", role=role, first_name=first, last_name="T", job_title="t",
                     employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(),
                     organization_id=org, is_active=True)
        s.add(e)
        s.commit()
        return e

    hr = emp("hr@acme.com", UserRole.HR_ADMIN, "Hana")
    sent = []
    from app.services import email_service
    monkeypatch.setattr(email_service, "send_approval_email",
                        lambda email, template, context, **kw: sent.append({"to": email, "template": template, "ctx": context,
                                                                           "kw": kw}) or True)
    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: hr
    app.dependency_overrides[get_current_admin] = lambda: hr
    from app.core.rate_limiter import limiter
    limiter.enabled = False

    class Env:
        pass
    e = Env()
    e.c, e.db, e.sent, e.hr = TestClient(app, raise_server_exceptions=False), s, sent, hr
    yield e
    limiter.enabled = True
    for dep in (get_db, get_current_user, get_current_admin):
        app.dependency_overrides.pop(dep, None)
    s.close()
    engine.dispose()


def _ok(r):
    assert r.status_code in (200, 201), r.text
    return r.json()


def _accept(env, name="Sam Rivera", mail="sam@mail.com"):
    req = _ok(env.c.post("/hr/recruitment/requisitions", json={"title": "Designer", "department": "Design", "status": "pending"}))
    _ok(env.c.put(f"/hr/recruitment/requisitions/{req['id']}/approve"))
    cand = _ok(env.c.post("/hr/recruitment/candidates", json={"name": name, "email": mail, "position": "Designer",
                                                              "requisition_id": req["id"]}))
    offer = _ok(env.c.post("/hr/recruitment/offers", json={"candidate_id": cand["id"], "candidate_name": name, "position": "Designer",
                                                            "employment_type": "full_time", "salary": 20000,
                                                            "joining_date": JOIN.isoformat()}))
    _ok(env.c.put(f"/hr/recruitment/offers/{offer['id']}", json={"status": "pending"}))
    _ok(env.c.put(f"/hr/recruitment/offers/{offer['id']}/accept"))
    return offer


def _welcome_mails(env):
    return [m for m in env.sent if m["template"] == "offer_accepted_welcome.html"]


def _render(env, mail):
    from app.services import email_service
    return email_service.render_email(mail["template"], mail["ctx"], organization_id=1, db=env.db)


# ── default text, settings, backfill ─────────────────────────────────────────────────────────────────────────────────
def test_default_message_is_the_agreed_text():
    assert WM.DEFAULT_WELCOME_MESSAGE == SPEC_DEFAULT
    assert len(WM.DEFAULT_WELCOME_MESSAGE) < 2000
    assert "zoiko" not in WM.DEFAULT_WELCOME_MESSAGE.lower()
    assert WM.DEFAULT_WELCOME_SIGNATURE == "Your People & Culture Team"


def test_new_organisation_gets_the_default_message_and_signature(env):
    s = _ok(env.c.get("/hr/onboarding/settings"))
    assert s["welcome_message"] == SPEC_DEFAULT and s["welcome_signature"] == "Your People & Culture Team"
    assert s["default_welcome_message"] == SPEC_DEFAULT
    assert [p["token"] for p in s["welcome_placeholders"]] == [
        "{{company_name}}", "{{employee_first_name}}", "{{start_date}}", "{{position}}", "{{manager_name}}"]
    # an emptied message reads as the default again; a custom one is kept
    assert _ok(env.c.put("/hr/onboarding/settings", json={"welcome_message": "  "}))["welcome_message"] == SPEC_DEFAULT
    out = _ok(env.c.put("/hr/onboarding/settings", json={"welcome_message": "Hi {{employee_first_name}}!", "welcome_signature": "The Acme crew"}))
    assert out["welcome_message"] == "Hi {{employee_first_name}}!" and out["welcome_signature"] == "The Acme crew"


def test_unknown_placeholder_is_refused_with_422(env):
    r = env.c.put("/hr/onboarding/settings", json={"welcome_message": "Hi {{first_name}}, your salary is {{salary}}"})
    assert r.status_code == 422 and "{{first_name}}" in r.text and "{{salary}}" in r.text
    assert env.c.put("/hr/onboarding/settings", json={"welcome_signature": "x" * 121}).status_code == 422
    assert env.c.put("/hr/onboarding/settings", json={"welcome_message": "x" * 2001}).status_code == 422
    assert env.c.post("/hr/onboarding/settings/welcome-preview", json={"welcome_message": "{{nope}}"}).status_code == 422


def _migration():
    path = os.path.join(os.path.dirname(__file__), "..", "alembic", "versions", "e7f8a9b0c1d3_offer_accepted_welcome.py")
    spec = importlib.util.spec_from_file_location("offer_accepted_welcome_migration", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_backfill_fills_only_missing_messages():
    from sqlalchemy import text
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        for org_id, msg in ((1, None), (2, "   "), (3, "Our own custom welcome.")):
            conn.execute(text("INSERT INTO onboarding_settings (organization_id, auto_send_portal_invite, portal_link_days, reminder_days, "
                              "require_checklists_complete, require_documents_approved, welcome_message, updated_at) "
                              "VALUES (:o, 1, 30, 3, 1, 1, :m, CURRENT_TIMESTAMP)"), {"o": org_id, "m": msg})
        assert _migration().backfill(conn, WM.DEFAULT_WELCOME_MESSAGE) == 2
        rows = dict(conn.execute(text("SELECT organization_id, welcome_message FROM onboarding_settings")).all())
    assert rows[1] == SPEC_DEFAULT and rows[2] == SPEC_DEFAULT and rows[3] == "Our own custom welcome."


# ── rendering ────────────────────────────────────────────────────────────────────────────────────────────────────────
def test_headings_paragraphs_and_line_breaks():
    out = WM.render("## Hello {{employee_first_name}}\nLine one\nLine two\n\n\nNext paragraph\n## Second", {"employee_first_name": "Sam"})
    assert out["blocks"] == [{"type": "heading", "text": "Hello Sam"},
                             {"type": "paragraph", "lines": ["Line one", "Line two"]},
                             {"type": "paragraph", "lines": ["Next paragraph"]},
                             {"type": "heading", "text": "Second"}]
    assert out["html"] == "<h2>Hello Sam</h2>\n<p>Line one<br>Line two</p>\n<p>Next paragraph</p>\n<h2>Second</h2>"
    # fallbacks when a value is unknown
    assert WM.fill("Hi {{employee_first_name}}, see you on {{start_date}}", {}) == "Hi there, see you on your start date"


def test_values_and_raw_html_are_escaped_everywhere(env):
    from app.services import email_service
    out = WM.render("Hi {{employee_first_name}} <b>bold</b>", {"employee_first_name": "<script>alert(1)</script>"})
    assert "<script>" not in out["html"] and "&lt;script&gt;" in out["html"] and "&lt;b&gt;bold&lt;/b&gt;" in out["html"]
    html = email_service.render_email("offer_accepted_welcome.html", {
        "subject": "s", "first_name": "<script>alert(1)</script>", "organization_name": "Acme", "position": "Designer",
        "start_date_display": None, "manager_name": None, "accepted_on_display": None, "portal_url": None, "expires_display": None,
        "signed_letter_in_portal": False, "documents": [], "welcome_blocks": out["blocks"], "welcome_signature": "x",
        "next_steps": [], "hr_contact_name": "", "hr_contact_email": ""}, organization_id=1, db=env.db).html
    assert "<script>alert(1)</script>" not in html and "<b>bold</b>" not in html
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html


# ── the flow ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def test_one_email_on_acceptance_with_link_steps_and_html_and_text_parts(env, monkeypatch):
    from app.modules.hr import company_profile as CP
    from app.modules.hr import onboarding_flow
    from app.modules.hr.models import OnboardingActivity, RecruitmentOffer
    from app.services import email_service
    real_profile = CP.get_profile
    monkeypatch.setattr(CP, "get_profile", lambda db, org: {**real_profile(db, org), "hr_contact_name": "Priya Shah",
                                                          "hr_contact_email": "people@acme.test"})
    offer = _accept(env)
    welcome = _welcome_mails(env)
    assert len(welcome) == 1, [m["template"] for m in env.sent]
    assert not [m for m in env.sent if m["template"] in ("onboarding_invite.html", "candidate_document_available.html")]
    m = welcome[0]
    assert m["to"] == "sam@mail.com"
    assert m["ctx"]["subject"] == "Offer accepted — welcome to Acme, Sam"
    assert m["ctx"]["portal_url"] and m["ctx"]["expires_display"]
    titles = [s["title"] for s in m["ctx"]["next_steps"]]
    assert titles[0] == "Confirm your personal details" and "Upload 2 documents" in titles
    assert m["ctx"]["hr_contact_email"] == "people@acme.test" and m["ctx"]["support_email"] == "people@acme.test"

    rendered = _render(env, m)
    long_start = f"{JOIN:%A}, {JOIN.day} {JOIN:%B %Y}"
    for expected in ("Offer accepted", "Your next steps", "Start pre-onboarding", "Link valid until",
                     "Never send ID documents by email; upload them only in the secure portal.", "Priya Shah",
                     "people@acme.test", "accessible alternative", "Your People &amp; Culture Team", long_start,
                     "<h2 class=\"dm-text-strong\"", "Welcome to the Team!"):
        assert expected in rendered.html, expected
    assert f"Your next steps before {long_start}." in rendered.html     # preheader
    # the text/plain alternative carries the same wording
    for expected in ("Welcome to the Team!", "Your next steps", "Upload 2 documents",
                     "Never send ID documents by email; upload them only in the secure portal.", "Your People & Culture Team"):
        assert expected in rendered.text, expected
    msg = email_lib.message_from_string(email_service._build_message(rendered).as_string())
    parts = [p.get_content_type() for p in msg.walk()]
    assert "text/plain" in parts and "text/html" in parts

    # idempotent: a second attempt sends nothing; the time is stored and the activity logged
    row = env.db.get(RecruitmentOffer, offer["id"])
    assert row.welcome_email_sent_at is not None
    assert onboarding_flow.send_offer_accepted_welcome(env.db, row) is False
    assert len(_welcome_mails(env)) == 1
    assert env.db.query(OnboardingActivity).filter(OnboardingActivity.action == "Offer accepted email sent").count() == 1

    # admins: the outcome e-mail names the organisation, not Zoiko HR
    outcome = [x for x in env.sent if x["template"] == "offer_outcome.html"]
    assert outcome and all(x["ctx"]["subject"].endswith("| Acme") for x in outcome)


def test_portal_shows_the_same_rendered_message_as_the_email(env):
    _ok(env.c.put("/hr/onboarding/settings", json={"welcome_message": "## Hello {{employee_first_name}}\nStart: {{start_date}}\n\nAt {{company_name}}"}))
    _accept(env)
    m = _welcome_mails(env)[0]
    token = m["ctx"]["portal_url"].rsplit("/", 1)[1]
    page = _ok(env.c.get(f"/public/onboarding/{token}"))
    assert page["welcome_blocks"] == m["ctx"]["welcome_blocks"]
    assert page["welcome_blocks"][0] == {"type": "heading", "text": "Hello Sam"}
    assert page["welcome_signature"] == m["ctx"]["welcome_signature"]
    assert "{{" not in page["welcome_message"] and "At Acme" in page["welcome_message"]
    # the signed offer letter row is only there for an e-signed letter: a hand-recorded acceptance has none
    assert m["ctx"]["signed_letter_in_portal"] is False


def test_auto_invite_off_sends_the_welcome_without_a_link(env):
    _ok(env.c.put("/hr/onboarding/settings", json={"auto_send_portal_invite": False}))
    _accept(env)
    welcome = _welcome_mails(env)
    assert len(welcome) == 1 and welcome[0]["ctx"]["portal_url"] is None
    html = _render(env, welcome[0]).html
    assert "Start pre-onboarding" not in html and 'class="btn-link"' not in html
    assert "will send you a separate email with the link to your secure pre-onboarding portal" in html
    assert not [m for m in env.sent if m["template"] == "onboarding_invite.html"]


def test_one_organisations_message_never_reaches_another(env):
    from app.modules.hr import onboarding_flow
    from app.modules.hr.models import OnboardingNewHire
    _ok(env.c.put("/hr/onboarding/settings", json={"welcome_message": "ACME-ONLY welcome from {{company_name}}"}))
    hire = OnboardingNewHire(candidate_name="Gina Globex", email="gina@globex.test", position="Analyst", joining_date=JOIN,
                             status="offer_accepted", organization_id=2)
    env.db.add(hire)
    env.db.commit()
    ctx = onboarding_flow.welcome_context(env.db, hire)
    view = onboarding_flow.portal_view(env.db, hire)
    for text in (str(ctx), str(view)):
        assert "ACME-ONLY" not in text and "Acme" not in text
    assert ctx["welcome_blocks"] == WM.blocks(SPEC_DEFAULT, {})
    assert ctx["company_name"] == "Globex"


def test_resend_uses_the_same_sections(env):
    from app.modules.hr.models import OnboardingNewHire
    _accept(env)
    hire = env.db.query(OnboardingNewHire).filter(OnboardingNewHire.organization_id == 1).one()
    _ok(env.c.post(f"/hr/onboarding/new-hires/{hire.id}/portal-invite"))
    invite = [m for m in env.sent if m["template"] == "onboarding_invite.html"][-1]
    assert invite["ctx"]["welcome_blocks"] == _welcome_mails(env)[0]["ctx"]["welcome_blocks"]
    html = _render(env, invite).html
    for expected in ("Your next steps", "Start pre-onboarding", "Never send ID documents by email", "Your People &amp; Culture Team"):
        assert expected in html, expected


def test_settings_preview_and_test_email(env):
    out = _ok(env.c.post("/hr/onboarding/settings/welcome-preview",
                         json={"welcome_message": "## Hi {{employee_first_name}}\nWelcome to {{company_name}}", "welcome_signature": "HR"}))
    assert out["subject"] == "Offer accepted — welcome to Acme, Sam"
    assert out["blocks"][0] == {"type": "heading", "text": "Hi Sam"} and "Welcome to Acme" in out["email_html"]
    assert "Start pre-onboarding" in out["email_html"] and "Welcome to Acme" in out["email_text"]
    off = _ok(env.c.post("/hr/onboarding/settings/welcome-preview", json={"welcome_message": "Hi", "auto_send_portal_invite": False}))
    assert "Start pre-onboarding" not in off["email_html"]
    sent = _ok(env.c.post("/hr/onboarding/settings/welcome-test", json={"welcome_message": "Hello {{employee_first_name}}"}))
    assert sent == {"sent": True, "to": "hr@acme.com"}
    test_mail = _welcome_mails(env)[-1]
    assert test_mail["to"] == "hr@acme.com" and test_mail["ctx"]["welcome_blocks"] == [{"type": "paragraph", "lines": ["Hello Sam"]}]
