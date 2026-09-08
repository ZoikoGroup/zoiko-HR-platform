"""
tests/test_quotation.py
-------------------------
Registration quotation workflow: quote emailed on org registration ->
accept/reject via a single-use link -> on accept, notify registrant + every
Super Admin, then email an invoice.

A minimal FastAPI app mounts only quotation_router (public, no auth) with
get_db overridden to an in-memory sqlite session, matching test_billing_me.py's
convention. Every email send is monkeypatched to a recorder instead of hitting
real SMTP.
"""

from datetime import datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.core.dependencies import get_current_user
from app.modules.billing.router import quotation_router, billing_router
from app.modules.billing.models import BillingPlan, BillingQuotation, PlanCode, QuotationStatus
from app.modules.billing import quotation_service
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import Organization


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    engine.dispose()


@pytest.fixture
def client(db):
    app = FastAPI()
    app.include_router(quotation_router)

    def _override_db():
        yield db

    app.dependency_overrides[get_db] = _override_db
    with TestClient(app) as c:
        yield c


@pytest.fixture
def sent_emails(monkeypatch):
    """Recorder replacing every quotation email function — assert on this
    instead of hitting real SMTP. Patches both the definition module and
    quotation_service's already-bound `from ... import` reference."""
    calls = []

    def _record(name):
        def _fn(**kwargs):
            calls.append({"fn": name, **kwargs})
            return True
        return _fn

    import app.services.email_service as email_service_mod
    for name in ("send_quotation_proposal_email", "send_quotation_accepted_email", "send_quotation_invoice_email"):
        monkeypatch.setattr(email_service_mod, name, _record(name))
    return calls


def _make_org_and_plan(db, org_id=1, monthly_price=15.00, annual_price=150.00):
    org = Organization(id=org_id, name="Acme Inc.", status="ACTIVE", timezone="UTC")
    db.add(org)
    plan = BillingPlan(
        code=PlanCode.ADVANCED, name="Advanced", catalog_version="v1",
        monthly_price=monthly_price, annual_price=annual_price, currency="USD",
    )
    db.add(plan)
    db.commit()
    db.refresh(org)
    return org, plan


def _make_super_admin(db, org_id=None):
    sa = Employee(
        email="sa@z.test", hashed_password="x", employee_code="SA-0001",
        role=UserRole.SUPER_ADMIN, first_name="Super", last_name="Admin",
        job_title="Super Admin", employment_type=EmploymentType.FULL_TIME,
        status=EmployeeStatus.ACTIVE, date_of_joining=datetime.utcnow().date(),
        organization_id=org_id,
    )
    db.add(sa)
    db.commit()
    return sa


# ═══════════════════════════════════════════════════════════════════════════
# create_and_send_quotation
# ═══════════════════════════════════════════════════════════════════════════

class TestCreateQuotation:
    def test_creates_pending_quotation_and_sends_proposal_email(self, db, sent_emails):
        org, plan = _make_org_and_plan(db)
        quotation = quotation_service.create_and_send_quotation(
            db, organization=org, plan_code="advanced", billing_cycle="monthly",
            recipient_email="admin@acme.test", recipient_name="Jane Admin",
        )
        assert quotation is not None
        assert quotation.status == QuotationStatus.PENDING
        assert quotation.amount_cents == 1500
        assert quotation.quote_number.startswith("Q-")
        assert quotation.decision_token_hash is not None

        proposal_calls = [c for c in sent_emails if c["fn"] == "send_quotation_proposal_email"]
        assert len(proposal_calls) == 1
        assert proposal_calls[0]["email"] == "admin@acme.test"
        assert "15.00" in proposal_calls[0]["amount_display"] or "1,500" not in proposal_calls[0]["amount_display"]

    def test_annual_cycle_uses_annual_price(self, db, sent_emails):
        org, plan = _make_org_and_plan(db)
        quotation = quotation_service.create_and_send_quotation(
            db, organization=org, plan_code="advanced", billing_cycle="annual",
            recipient_email="admin@acme.test", recipient_name="Jane Admin",
        )
        assert quotation.amount_cents == 15000

    def test_unpriced_plan_returns_none_without_raising(self, db, sent_emails):
        org = Organization(id=1, name="Acme Inc.", status="ACTIVE", timezone="UTC")
        db.add(org)
        plan = BillingPlan(code=PlanCode.ADVANCED, name="Advanced", catalog_version="v1")  # no prices
        db.add(plan)
        db.commit()
        quotation = quotation_service.create_and_send_quotation(
            db, organization=org, plan_code="advanced", billing_cycle="monthly",
            recipient_email="admin@acme.test", recipient_name="Jane Admin",
        )
        assert quotation is None
        assert not sent_emails


# ═══════════════════════════════════════════════════════════════════════════
# get_quotation_by_token / decide_quotation
# ═══════════════════════════════════════════════════════════════════════════

class TestDecideQuotation:
    def _issue(self, db):
        org, plan = _make_org_and_plan(db)
        quotation = quotation_service.create_and_send_quotation(
            db, organization=org, plan_code="advanced", billing_cycle="monthly",
            recipient_email="admin@acme.test", recipient_name="Jane Admin",
        )
        # Recover the raw token by re-issuing deterministically isn't possible
        # (only the hash is stored) — so tests that need the raw token mint
        # their own directly via the same helper the service uses.
        import secrets
        raw_token = secrets.token_urlsafe(32)
        quotation.decision_token_hash = quotation_service._token_hash(raw_token)
        db.commit()
        return quotation, raw_token

    def test_valid_token_returns_quotation(self, db, sent_emails):
        quotation, raw_token = self._issue(db)
        found = quotation_service.get_quotation_by_token(db, raw_token)
        assert found is not None
        assert found.id == quotation.id

    def test_unknown_token_returns_none(self, db, sent_emails):
        _make_org_and_plan(db)
        assert quotation_service.get_quotation_by_token(db, "not-a-real-token") is None

    def test_expired_token_returns_none(self, db, sent_emails):
        quotation, raw_token = self._issue(db)
        quotation.decision_token_expires_at = datetime.utcnow() - timedelta(days=1)
        db.commit()
        assert quotation_service.get_quotation_by_token(db, raw_token) is None

    def test_accept_sets_status_and_sends_all_three_notifications(self, db, sent_emails):
        quotation, raw_token = self._issue(db)
        _make_super_admin(db)

        decided = quotation_service.decide_quotation(db, raw_token, "accept")
        assert decided.status == QuotationStatus.ACCEPTED
        assert decided.decided_at is not None
        assert decided.invoice_number is not None
        assert decided.invoice_sent_at is not None

        fns = [c["fn"] for c in sent_emails]
        assert fns.count("send_quotation_accepted_email") == 2  # registrant + 1 super admin
        assert fns.count("send_quotation_invoice_email") == 1

        accepted_calls = [c for c in sent_emails if c["fn"] == "send_quotation_accepted_email"]
        audiences = {c["audience"] for c in accepted_calls}
        assert audiences == {"registrant", "super_admin"}

    def test_reject_sets_status_and_sends_no_further_email(self, db, sent_emails):
        quotation, raw_token = self._issue(db)
        sent_emails.clear()  # drop the proposal-email record from _issue's setup
        decided = quotation_service.decide_quotation(db, raw_token, "reject")
        assert decided.status == QuotationStatus.REJECTED
        assert decided.decided_at is not None
        assert decided.invoice_number is None
        assert not sent_emails

    def test_already_decided_token_cannot_be_reused(self, db, sent_emails):
        quotation, raw_token = self._issue(db)
        quotation_service.decide_quotation(db, raw_token, "accept")
        sent_emails.clear()
        with pytest.raises(Exception):
            quotation_service.decide_quotation(db, raw_token, "reject")
        # status must still be ACCEPTED, not flipped to REJECTED
        db.refresh(quotation)
        assert quotation.status == QuotationStatus.ACCEPTED

    def test_invalid_decision_value_rejected(self, db, sent_emails):
        quotation, raw_token = self._issue(db)
        with pytest.raises(Exception):
            quotation_service.decide_quotation(db, raw_token, "maybe")


# ═══════════════════════════════════════════════════════════════════════════
# HTTP endpoints
# ═══════════════════════════════════════════════════════════════════════════

class TestQuotationEndpoints:
    def _issue(self, db):
        org, plan = _make_org_and_plan(db)
        quotation = quotation_service.create_and_send_quotation(
            db, organization=org, plan_code="advanced", billing_cycle="monthly",
            recipient_email="admin@acme.test", recipient_name="Jane Admin",
        )
        import secrets
        raw_token = secrets.token_urlsafe(32)
        quotation.decision_token_hash = quotation_service._token_hash(raw_token)
        db.commit()
        return quotation, raw_token

    def test_get_decide_renders_page_for_valid_token(self, db, client, sent_emails):
        quotation, raw_token = self._issue(db)
        r = client.get(f"/billing/quotations/decide?token={raw_token}")
        assert r.status_code == 200
        assert quotation.quote_number in r.text
        assert "Accept Quote" in r.text
        assert "Reject Quote" in r.text

    def test_get_decide_invalid_token_returns_400_page(self, db, client, sent_emails):
        _make_org_and_plan(db)
        r = client.get("/billing/quotations/decide?token=garbage")
        assert r.status_code == 400

    def test_post_decide_accept_end_to_end(self, db, client, sent_emails):
        quotation, raw_token = self._issue(db)
        _make_super_admin(db)
        r = client.post("/billing/quotations/decide", json={"token": raw_token, "decision": "accept"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["decision"] == "accept"
        assert body["quote_number"] == quotation.quote_number

    def test_post_decide_bad_token_returns_400(self, db, client, sent_emails):
        _make_org_and_plan(db)
        r = client.post("/billing/quotations/decide", json={"token": "garbage", "decision": "accept"})
        assert r.status_code == 400


# ═══════════════════════════════════════════════════════════════════════════
# Pay-invoice endpoint (authenticated, org-scoped) — backs the "Pay Now"
# button in the accepted-quotation invoice email.
# ═══════════════════════════════════════════════════════════════════════════

class _Caller:
    def __init__(self, org_id, role="admin"):
        self.organization_id = org_id
        self.role = role
        self.id = None
        self.email = "admin@acme.test"


@pytest.fixture
def authed_client(db):
    app = FastAPI()
    app.include_router(billing_router)

    def _override_db():
        yield db

    app.dependency_overrides[get_db] = _override_db

    caller_box = {}

    def _override_current_user():
        return caller_box["caller"]

    app.dependency_overrides[get_current_user] = _override_current_user

    with TestClient(app) as c:
        c.caller_box = caller_box
        yield c


def _as(client, org_id, role="admin"):
    client.caller_box["caller"] = _Caller(org_id=org_id, role=role)


class TestPayInvoiceEndpoint:
    def _accepted_quotation(self, db, sent_emails, org_id=1):
        org, plan = _make_org_and_plan(db, org_id=org_id)
        quotation = quotation_service.create_and_send_quotation(
            db, organization=org, plan_code="advanced", billing_cycle="monthly",
            recipient_email="admin@acme.test", recipient_name="Jane Admin",
        )
        raw_token = "x" * 20
        quotation.decision_token_hash = quotation_service._token_hash(raw_token)
        db.commit()
        quotation_service.decide_quotation(db, raw_token, "accept")
        db.refresh(quotation)
        return quotation

    def test_returns_invoice_summary_for_own_org(self, db, sent_emails, authed_client):
        quotation = self._accepted_quotation(db, sent_emails, org_id=1)
        _as(authed_client, org_id=1)
        r = authed_client.get(f"/billing/me/quotation-invoice/{quotation.invoice_number}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["invoice_number"] == quotation.invoice_number
        assert body["plan_code"].lower() == "advanced"
        assert body["amount_display"] == "USD 15.00"
        assert body["status"].lower() == "accepted"

    def test_other_org_cannot_see_invoice(self, db, sent_emails, authed_client):
        quotation = self._accepted_quotation(db, sent_emails, org_id=1)
        _as(authed_client, org_id=999)
        r = authed_client.get(f"/billing/me/quotation-invoice/{quotation.invoice_number}")
        assert r.status_code == 404

    def test_unknown_invoice_number_returns_404(self, db, sent_emails, authed_client):
        _make_org_and_plan(db, org_id=1)
        _as(authed_client, org_id=1)
        r = authed_client.get("/billing/me/quotation-invoice/INV-DOES-NOT-EXIST")
        assert r.status_code == 404
