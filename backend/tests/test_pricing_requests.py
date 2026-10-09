"""The public Request Pricing form: saved, confirmed to the person by e-mail, and the sales team notified."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.rate_limiter import limiter
from app.database import Base, get_db
from app.modules.sales_leads.models import PricingRequest
from app.services import email_service


@pytest.fixture(autouse=True)
def _no_rate_limit():
    limiter.enabled = False
    yield
    limiter.enabled = True


@pytest.fixture
def env(monkeypatch):
    from app.main import app
    from app.core.dependencies import get_current_super_admin

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def _db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    mails = []
    monkeypatch.setattr(email_service, "send_approval_email", lambda email, template, ctx, **kw: mails.append((email, template, ctx)) or True)
    monkeypatch.setattr("app.modules.sales_leads.service.settings.SALES_NOTIFY_EMAIL", "sales@zoikohr.com, owner@zoikohr.com", raising=False)
    app.dependency_overrides[get_db] = _db
    client = TestClient(app)
    yield type("Env", (), {"client": client, "Session": Session, "mails": mails, "app": app, "admin": get_current_super_admin})
    app.dependency_overrides.clear()


GOOD = {
    "full_name": "Lee Park", "work_email": "Lee.Park@acme-corp.com", "phone": "+1 555 010 0100", "company": "Acme Corp",
    "job_title": "HR Director", "country": "United States", "company_size": "51-200", "plan_interest": "advanced",
    "products": ["core_hr", "leave"], "billing_preference": "annual", "timeline": "1-3-months",
    "message": "We need multi-entity leave.", "consent": True,
}


def test_a_request_is_saved_and_both_emails_go_out(env):
    r = env.client.post("/public/pricing-requests", json=GOOD)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["reference"].startswith("PR-") and body["confirmation_email_sent"] is True
    with env.Session() as db:
        row = db.query(PricingRequest).one()
        assert row.work_email == "lee.park@acme-corp.com" and row.products == "core_hr,leave"
        assert row.status == "new" and row.confirmation_sent and row.team_notified
    to = {m[0]: m[1] for m in env.mails}
    assert to["lee.park@acme-corp.com"] == "pricing_request_received.html"
    assert to["sales@zoikohr.com"] == "pricing_request_sales.html" and to["owner@zoikohr.com"] == "pricing_request_sales.html"
    sales_ctx = next(m[2] for m in env.mails if m[0] == "sales@zoikohr.com")
    assert sales_ctx["company"] == "Acme Corp" and sales_ctx["plan_label"] == "Advanced" and "Leave Management" in sales_ctx["products"]


def test_a_failing_mail_server_does_not_lose_the_request(env, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("smtp down")
    monkeypatch.setattr(email_service, "send_approval_email", boom)
    r = env.client.post("/public/pricing-requests", json=GOOD)
    assert r.status_code == 201 and r.json()["confirmation_email_sent"] is False
    with env.Session() as db:
        row = db.query(PricingRequest).one()
        assert not row.confirmation_sent and not row.team_notified


@pytest.mark.parametrize("change,field", [
    ({"full_name": ""}, "full_name"), ({"company": " "}, "company"), ({"work_email": "nope"}, "work_email"),
    ({"phone": "abc"}, "phone"), ({"company_size": "lots"}, "company_size"), ({"plan_interest": "gold"}, "plan_interest"),
    ({"consent": False}, "consent"), ({"products": ["payroll"]}, "products"),
])
def test_bad_input_is_refused_with_the_field_named(env, change, field):
    r = env.client.post("/public/pricing-requests", json={**GOOD, **change})
    assert r.status_code == 422
    assert field in str(r.json())
    with env.Session() as db:
        assert db.query(PricingRequest).count() == 0


def test_placeholder_and_disposable_emails_are_refused(env, strict_emails):
    for addr in ("someone@example.com", "x@mailinator.com"):
        r = env.client.post("/public/pricing-requests", json={**GOOD, "work_email": addr})
        assert r.status_code == 422, addr
    assert env.mails == []


def test_a_bot_that_fills_the_hidden_field_is_ignored(env):
    r = env.client.post("/public/pricing-requests", json={**GOOD, "website": "http://spam.test"})
    assert r.status_code == 201
    with env.Session() as db:
        assert db.query(PricingRequest).count() == 0
    assert env.mails == []


def test_references_are_unique(env):
    a = env.client.post("/public/pricing-requests", json=GOOD).json()["reference"]
    b = env.client.post("/public/pricing-requests", json=GOOD).json()["reference"]
    assert a != b


def test_only_a_super_admin_can_read_or_update_requests(env):
    env.client.post("/public/pricing-requests", json=GOOD)
    assert env.client.get("/super-admin/pricing-requests").status_code in (401, 403)
    env.app.dependency_overrides[env.admin] = lambda: object()
    listing = env.client.get("/super-admin/pricing-requests").json()
    assert listing["total"] == 1 and listing["items"][0]["company"] == "Acme Corp"
    rid = listing["items"][0]["id"]
    assert env.client.patch(f"/super-admin/pricing-requests/{rid}", json={"status": "contacted"}).json()["status"] == "contacted"
    assert env.client.get("/super-admin/pricing-requests?status=new").json()["total"] == 0
    assert env.client.patch("/super-admin/pricing-requests/999", json={"status": "closed"}).status_code == 404


def test_the_rate_limit_applies(env):
    limiter.enabled = True
    limiter.reset()
    codes = [env.client.post("/public/pricing-requests", json=GOOD).status_code for _ in range(6)]
    assert codes[:5] == [201] * 5 and codes[5] == 429
