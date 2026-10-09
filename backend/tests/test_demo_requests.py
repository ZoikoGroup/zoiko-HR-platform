"""Book a Demo: saved, confirmed to the person, and every active super admin (plus the sales inbox) is e-mailed."""
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.rate_limiter import limiter
from app.database import Base, get_db
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.sales_leads.models import DemoRequest
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
    with Session() as db:
        for n, (email, role, active) in enumerate([
            ("sam@zoikohr.com", UserRole.SUPER_ADMIN, True), ("ops@zoikohr.com", UserRole.SUPER_ADMIN, True),
            ("gone@zoikohr.com", UserRole.SUPER_ADMIN, False), ("hr@acme-corp.com", UserRole.ADMIN, True),
        ]):
            db.add(Employee(email=email, hashed_password="x", employee_code=f"E{n}", role=role, first_name="A", last_name="B",
                            job_title="t", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE,
                            is_active=active, date_of_joining=date.today()))
        db.commit()

    def _db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    mails = []
    monkeypatch.setattr(email_service, "send_approval_email", lambda email, template, ctx, **kw: mails.append((email, template, ctx)) or True)
    monkeypatch.setattr("app.modules.sales_leads.service.settings.SALES_NOTIFY_EMAIL", "sales@zoikohr.com, SAM@zoikohr.com", raising=False)
    app.dependency_overrides[get_db] = _db
    yield type("Env", (), {"client": TestClient(app), "Session": Session, "mails": mails, "app": app, "admin": get_current_super_admin})
    app.dependency_overrides.clear()


def good(**over):
    return {"full_name": "Lee Park", "work_email": "Lee@acme-corp.com", "phone": "+91 98765 43210", "company": "Acme Corp",
            "job_title": "HR Director", "country": "India", "company_size": "51-200", "interests": ["core_hr", "leave"],
            "preferred_date": (date.today() + timedelta(days=3)).isoformat(), "preferred_time": "morning",
            "timezone": "Asia/Kolkata", "demo_format": "live", "message": "Leave policies please.", "consent": True, **over}


def test_a_demo_request_is_saved_and_every_super_admin_is_emailed(env):
    r = env.client.post("/public/demo-requests", json=good())
    assert r.status_code == 201, r.text
    assert r.json()["reference"].startswith("DM-") and r.json()["confirmation_email_sent"] is True
    by = {m[0].lower(): m for m in env.mails}
    assert by["lee@acme-corp.com"][1] == "demo_request_received.html"
    for admin in ("sam@zoikohr.com", "ops@zoikohr.com", "sales@zoikohr.com"):
        assert by[admin][1] == "demo_request_admin.html", admin
    assert "gone@zoikohr.com" not in by and "hr@acme-corp.com" not in by        # inactive super admin, org admin: not told
    assert len([m for m in env.mails if m[0].lower() == "sam@zoikohr.com"]) == 1  # listed twice, emailed once
    ctx = by["ops@zoikohr.com"][2]
    assert ctx["company"] == "Acme Corp" and "Leave Management" in ctx["interests"] and "Morning" in ctx["when"]
    assert ctx["requests_url"].endswith("/super-admin/demo-requests")
    with env.Session() as db:
        row = db.query(DemoRequest).one()
        assert row.confirmation_sent and row.admins_notified == 3 and row.status == "new"


@pytest.mark.parametrize("change,field", [
    ({"full_name": ""}, "full_name"), ({"work_email": "bad"}, "work_email"), ({"company_size": "huge"}, "company_size"),
    ({"preferred_date": (date.today() - timedelta(days=1)).isoformat()}, "preferred_date"),
    ({"preferred_date": (date.today() + timedelta(days=400)).isoformat()}, "preferred_date"),
    ({"preferred_time": "midnight"}, "preferred_time"), ({"interests": ["crypto"]}, "interests"), ({"consent": False}, "consent"),
    ({"phone": "xyz"}, "phone"),
])
def test_bad_input_is_refused(env, change, field):
    r = env.client.post("/public/demo-requests", json=good(**change))
    assert r.status_code == 422 and field in str(r.json())
    assert env.mails == []


def test_placeholder_email_refused(env, strict_emails):
    assert env.client.post("/public/demo-requests", json=good(work_email="me@example.com")).status_code == 422


def test_optional_time_and_mail_failure(env, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("smtp down")
    monkeypatch.setattr(email_service, "send_approval_email", boom)
    r = env.client.post("/public/demo-requests", json=good(preferred_date=None, preferred_time=None))
    assert r.status_code == 201 and r.json()["confirmation_email_sent"] is False
    with env.Session() as db:
        row = db.query(DemoRequest).one()
        assert row.admins_notified == 0 and row.preferred_date is None


def test_bot_honeypot(env):
    assert env.client.post("/public/demo-requests", json=good(website="x")).status_code == 201
    with env.Session() as db:
        assert db.query(DemoRequest).count() == 0


def test_super_admin_list_and_status(env):
    env.client.post("/public/demo-requests", json=good())
    assert env.client.get("/super-admin/demo-requests").status_code in (401, 403)
    env.app.dependency_overrides[env.admin] = lambda: object()
    items = env.client.get("/super-admin/demo-requests").json()["items"]
    assert items[0]["company"] == "Acme Corp" and items[0]["interests"] == ["core_hr", "leave"]
    assert env.client.patch(f"/super-admin/demo-requests/{items[0]['id']}", json={"status": "scheduled"}).json()["status"] == "scheduled"
    assert env.client.patch("/super-admin/demo-requests/999", json={"status": "closed"}).status_code == 404


def test_rate_limit(env):
    limiter.enabled = True
    limiter.reset()
    codes = [env.client.post("/public/demo-requests", json=good()).status_code for _ in range(6)]
    assert codes[5] == 429
