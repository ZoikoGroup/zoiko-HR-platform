"""
tests/test_refund_api.py
------------------------
ZHR-16 — Super Admin > Refunds & Credit Management over HTTP.

Regression: GET /billing/refunds imported Organization from a module that does
not exist (app.modules.organization), so the page's only load call raised
ModuleNotFoundError and surfaced as "Something went wrong on the server".

Covers list (data / empty / orphaned org), filters + pagination incl. inclusive
date boundaries, summary aggregates, amount validation, transactional balance +
audit, actor attribution, and RBAC.
"""

import pathlib
import sys
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from app.core.dependencies import get_current_user
from app.core.exceptions import ZoikoException, generic_exception_handler, zoiko_exception_handler
from app.database import Base, get_db
from app.modules.billing import refund_service
from app.modules.billing.models import (
    BillingAuditAction,
    BillingAuditLog,
    BillingClassification,
    BillingCycle,
    BillingInvoice,
    BillingMetric,
    BillingPlan,
    BillingRefundRequest,
    BillingSubscription,
    PlanCode,
    RefundRequestStatus,
    RefundRequestType,
    SubscriptionStatus,
    TaxCategory,
)
from app.modules.billing.router import billing_router
from app.modules.hr.models import Organization, OrganizationStatus


class _Caller:
    def __init__(self, email="root@zoiko.test", role="super_admin", org_id=None, uid=1):
        self.email = email
        self.organization_id = org_id
        self.role = role
        self.id = uid


@pytest.fixture
def client(monkeypatch):
    import app.modules.billing.stripe_client as stripe_client_mod
    monkeypatch.setattr(stripe_client_mod, "stripe_enabled", lambda: False)

    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine)()

    app = FastAPI()
    app.include_router(billing_router)
    app.add_exception_handler(ZoikoException, zoiko_exception_handler)
    app.add_exception_handler(Exception, generic_exception_handler)
    box = {"user": _Caller()}

    def _db():
        yield s

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_current_user] = lambda: box["user"]

    with TestClient(app, raise_server_exceptions=False) as c:
        c.db, c.box = s, box
        yield c
    s.close()
    engine.dispose()


def _org(db, org_id=1, name=None):
    db.add(Organization(id=org_id, name=name or f"Org {org_id}", status=OrganizationStatus.ACTIVE))
    plan = db.query(BillingPlan).first()
    if plan is None:
        plan = BillingPlan(
            code=PlanCode.CORE, name="Core", catalog_version="v1",
            billing_metric=BillingMetric.ACTIVE_WORKFORCE, is_active=True,
            is_contract_priced=False, monthly_price=10.0, annual_price=100.0,
            currency="USD", tax_category=TaxCategory.SAAS_SUBSCRIPTION,
        )
        db.add(plan)
        db.flush()
    db.add(BillingSubscription(
        organization_id=org_id, plan_id=plan.id, plan_code=PlanCode.CORE,
        billing_classification=BillingClassification.COMMERCIAL,
        status=SubscriptionStatus.ACTIVE, billing_cycle=BillingCycle.MONTHLY,
    ))
    db.commit()


def _invoice(db, org_id=1, paid=50_000, ident=None):
    db.add(BillingInvoice(
        organization_id=org_id, stripe_invoice_id=ident or f"in_{org_id}",
        amount_due_cents=paid, amount_paid_cents=paid, currency="USD", status="paid"))
    db.commit()


def _req(db, org_id=1, cents=1000, rtype=RefundRequestType.REFUND,
         status=RefundRequestStatus.PENDING_APPROVAL, created=None, by="a@z.test"):
    r = BillingRefundRequest(
        organization_id=org_id, request_type=rtype, amount_cents=cents, currency="USD",
        reason="because", status=status, requested_by=by,
        created_at=created or datetime.utcnow())
    db.add(r)
    db.commit()
    return r


# ── list ─────────────────────────────────────────────────────────────────────

class TestList:
    def test_page_loads_with_data_and_org_names(self, client):
        _org(client.db, 1, "Acme")
        _req(client.db, 1, 1500)
        r = client.get("/billing/refunds")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["total"] == 1
        assert body["list"][0]["organization_name"] == "Acme"
        assert body["list"][0]["amount_cents"] == 1500  # integer minor units

    def test_empty_state_is_200_with_zero_summary(self, client):
        r = client.get("/billing/refunds")
        assert r.status_code == 200, r.text
        assert r.json()["list"] == [] and r.json()["total"] == 0
        s = client.get("/billing/refunds/summary")
        assert s.status_code == 200, s.text
        body = s.json()
        assert (body["pending_count"], body["approved_total_cents"],
                body["credits_issued_cents"], body["processed_count"]) == (0, 0, 0, 0)

    def test_orphaned_organization_does_not_crash(self, client):
        _org(client.db, 1, "Gone Inc")
        _req(client.db, 1)
        client.db.query(Organization).delete()
        client.db.commit()
        r = client.get("/billing/refunds")
        assert r.status_code == 200, r.text
        assert r.json()["list"][0]["organization_name"] == "Deleted organization"

    def test_provider_warning_flag_when_stripe_unavailable(self, client):
        r = client.get("/billing/refunds")
        assert "Stripe is not configured" in r.json()["provider_warning"]

    def test_summary_aggregates(self, client):
        _org(client.db)
        _req(client.db, cents=1000)
        _req(client.db, cents=2000, status=RefundRequestStatus.APPROVED_AND_PROCESSED)
        _req(client.db, cents=500, rtype=RefundRequestType.CREDIT,
             status=RefundRequestStatus.APPROVED_AND_PROCESSED)
        body = client.get("/billing/refunds/summary").json()
        assert body["pending_count"] == 1
        assert body["approved_total_cents"] == 2500
        assert body["credits_issued_cents"] == 500
        assert body["processed_count"] == 2


class TestFilters:
    def _seed(self, db):
        _org(db, 1, "A")
        _org(db, 2, "B")
        now = datetime.utcnow()
        _req(db, 1, 1000, created=now - timedelta(days=10))
        _req(db, 1, 5000, rtype=RefundRequestType.CREDIT, created=now - timedelta(days=5),
             status=RefundRequestStatus.APPROVED_AND_PROCESSED)
        _req(db, 2, 9000, created=now - timedelta(days=1), status=RefundRequestStatus.REJECTED)

    def test_each_filter(self, client):
        self._seed(client.db)
        get = lambda q: client.get("/billing/refunds", params=q).json()
        assert get({"organization_id": 2})["total"] == 1
        assert get({"status": "rejected"})["total"] == 1
        assert get({"request_type": "credit"})["total"] == 1
        assert get({"min_amount_cents": 5000})["total"] == 2
        assert get({"max_amount_cents": 5000})["total"] == 2

    def test_combined_filters_are_anded(self, client):
        self._seed(client.db)
        body = client.get("/billing/refunds", params={
            "organization_id": 1, "min_amount_cents": 2000}).json()
        assert [x["amount_cents"] for x in body["list"]] == [5000]
        assert client.get("/billing/refunds", params={
            "organization_id": 2, "request_type": "credit"}).json()["total"] == 0

    def test_date_range_is_inclusive_of_first_and_last_day(self, client):
        _org(client.db)
        day = datetime(2026, 9, 10)
        _req(client.db, cents=1, created=day - timedelta(seconds=1))          # day before
        _req(client.db, cents=2, created=day)                                 # 00:00:00 first day
        _req(client.db, cents=3, created=day + timedelta(days=1) - timedelta(microseconds=1))  # 23:59:59.999999 last day
        _req(client.db, cents=4, created=day + timedelta(days=1))             # next day 00:00
        # viewer picked 10 Sep (single day), UTC: [10 Sep 00:00, 11 Sep 00:00)
        body = client.get("/billing/refunds", params={
            "created_from": "2026-09-10T00:00:00Z",
            "created_before": "2026-09-11T00:00:00Z"}).json()
        assert sorted(x["amount_cents"] for x in body["list"]) == [2, 3]

    def test_date_bounds_convert_from_other_timezones(self, client):
        _org(client.db)
        _req(client.db, cents=7, created=datetime(2026, 9, 10, 20, 0))  # 21:00 in UTC+1
        # A UTC+5:30 viewer's "10 Sep" is [09 Sep 18:30Z, 10 Sep 18:30Z) — excludes 20:00Z.
        body = client.get("/billing/refunds", params={
            "created_from": "2026-09-10T00:00:00+05:30",
            "created_before": "2026-09-11T00:00:00+05:30"}).json()
        assert body["total"] == 0
        # A UTC-5 viewer's "10 Sep" is [10 Sep 05:00Z, 11 Sep 05:00Z) — includes it.
        body = client.get("/billing/refunds", params={
            "created_from": "2026-09-10T00:00:00-05:00",
            "created_before": "2026-09-11T00:00:00-05:00"}).json()
        assert body["total"] == 1

    def test_pagination(self, client):
        _org(client.db)
        for i in range(7):
            _req(client.db, cents=100 + i, created=datetime.utcnow() - timedelta(minutes=i))
        p1 = client.get("/billing/refunds", params={"page": 1, "page_size": 3}).json()
        p3 = client.get("/billing/refunds", params={"page": 3, "page_size": 3}).json()
        assert p1["total"] == 7 and len(p1["list"]) == 3 and len(p3["list"]) == 1
        assert p1["page_size"] == 3 and p3["page"] == 3

    def test_invalid_status_is_422_not_500(self, client):
        assert client.get("/billing/refunds", params={"status": "pending"}).status_code == 422


# ── create / validation ─────────────────────────────────────────────────────

class TestRequestValidation:
    def _post(self, client, **body):
        payload = {"amount_cents": 1000, "reason": "dup charge", "request_type": "refund"}
        payload.update(body)
        return client.post("/billing/refunds/request", params={"org_id": 1}, json=payload)

    def test_creates_refund_and_records_actor(self, client):
        _org(client.db)
        _invoice(client.db)
        r = self._post(client)
        assert r.status_code == 200, r.text
        row = client.db.query(BillingRefundRequest).one()
        assert row.requested_by == "root@zoiko.test" and row.currency == "USD"
        log = client.db.query(BillingAuditLog).filter_by(
            action=BillingAuditAction.REFUND_REQUESTED).one()
        assert log.actor_email == "root@zoiko.test" and log.actor_id == 1
        assert log.before["refundable_balance_cents"] == 50_000
        assert log.after["refundable_balance_cents"] == 49_000

    @pytest.mark.parametrize("amount", [0, -5])
    def test_non_positive_amount_rejected(self, client, amount):
        _org(client.db)
        _invoice(client.db)
        r = self._post(client, amount_cents=amount)
        assert r.status_code == 400 and "greater than zero" in r.json()["message"]

    def test_refund_cannot_exceed_paid_amount(self, client):
        _org(client.db)
        _invoice(client.db, paid=5000)
        r = self._post(client, amount_cents=5001)
        assert r.status_code == 400 and "exceeds the refundable balance" in r.json()["message"]

    def test_pending_requests_count_against_the_balance(self, client):
        _org(client.db)
        _invoice(client.db, paid=5000)
        assert self._post(client, amount_cents=4000).status_code == 200
        assert self._post(client, amount_cents=2000).status_code == 400

    def test_refund_with_nothing_paid_rejected(self, client):
        _org(client.db)
        r = self._post(client)
        assert r.status_code == 400

    def test_invoice_must_belong_to_org(self, client):
        _org(client.db, 1)
        _org(client.db, 2)
        _invoice(client.db, org_id=2, ident="in_other")
        r = self._post(client, stripe_invoice_id="in_other")
        assert r.status_code == 400 and "not found for this organization" in r.json()["message"]

    def test_per_invoice_cap_and_currency(self, client):
        _org(client.db)
        client.db.add(BillingInvoice(organization_id=1, stripe_invoice_id="in_eur",
                                     amount_due_cents=3000, amount_paid_cents=3000,
                                     currency="eur", status="paid"))
        _invoice(client.db, paid=90_000)
        assert self._post(client, amount_cents=3001, stripe_invoice_id="in_eur").status_code == 400
        assert self._post(client, amount_cents=3000, stripe_invoice_id="in_eur").status_code == 200
        assert client.db.query(BillingRefundRequest).one().currency == "EUR"

    def test_blank_reason_and_absurd_amount_rejected(self, client):
        _org(client.db)
        _invoice(client.db)
        assert self._post(client, reason="   ").status_code == 400
        assert self._post(client, amount_cents=10**12, request_type="credit").status_code == 400

    def test_unknown_org_is_404_not_500(self, client):
        r = client.post("/billing/refunds/request", params={"org_id": 99},
                        json={"amount_cents": 100, "reason": "x"})
        assert r.status_code == 404


# ── transactional balance + audit ───────────────────────────────────────────

class TestTransactions:
    def test_credit_approval_updates_balance_and_audits_before_after(self, client):
        _org(client.db)
        r = client.post("/billing/refunds/request", params={"org_id": 1},
                        json={"amount_cents": 2500, "reason": "SLA credit", "request_type": "credit"})
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        client.box["user"] = _Caller(email="ops@zoiko.test", uid=2)
        a = client.post(f"/billing/refunds/{rid}/approve", json={})
        assert a.status_code == 200, a.text
        assert a.json()["status"] == "approved_and_processed"
        assert refund_service.get_balances(client.db, 1)["credit_balance_cents"] == 2500
        log = client.db.query(BillingAuditLog).filter_by(
            action=BillingAuditAction.CREDIT_APPROVED).one()
        assert log.actor_email == "ops@zoiko.test"
        assert log.before["credit_balance_cents"] == 0
        assert log.after["credit_balance_cents"] == 2500

    def test_same_actor_cannot_approve_own_request(self, client):
        _org(client.db)
        rid = client.post("/billing/refunds/request", params={"org_id": 1},
                          json={"amount_cents": 100, "reason": "x", "request_type": "credit"}).json()["id"]
        r = client.post(f"/billing/refunds/{rid}/approve", json={})
        assert r.status_code == 403

    def test_double_approval_is_a_400(self, client):
        _org(client.db)
        rid = client.post("/billing/refunds/request", params={"org_id": 1},
                          json={"amount_cents": 100, "reason": "x", "request_type": "credit"}).json()["id"]
        client.box["user"] = _Caller(email="ops@zoiko.test", uid=2)
        assert client.post(f"/billing/refunds/{rid}/approve", json={}).status_code == 200
        assert client.post(f"/billing/refunds/{rid}/approve", json={}).status_code == 400

    def test_reject_audits_with_reason(self, client):
        _org(client.db)
        _invoice(client.db)
        rid = client.post("/billing/refunds/request", params={"org_id": 1},
                          json={"amount_cents": 1000, "reason": "x"}).json()["id"]
        client.box["user"] = _Caller(email="ops@zoiko.test", uid=2)
        r = client.post(f"/billing/refunds/{rid}/reject", json={"rejection_reason": "no docs"})
        assert r.status_code == 200 and r.json()["status"] == "rejected"
        log = client.db.query(BillingAuditLog).filter_by(
            action=BillingAuditAction.REFUND_REJECTED).one()
        assert log.after["rejection_reason"] == "no docs"
        # rejecting releases the reserved refundable balance
        assert refund_service.get_balances(client.db, 1)["refundable_balance_cents"] == 50_000

    def test_audit_failure_rolls_back_the_whole_action(self, client, monkeypatch):
        _org(client.db)
        _invoice(client.db)
        from app.modules.billing import service

        def boom(*a, **k):
            raise RuntimeError("audit store down")
        monkeypatch.setattr(service, "log_billing_audit", boom)
        r = client.post("/billing/refunds/request", params={"org_id": 1},
                        json={"amount_cents": 1000, "reason": "x"})
        assert r.status_code == 500
        client.db.rollback()
        assert client.db.query(BillingRefundRequest).count() == 0

    def test_provider_failure_leaves_request_pending(self, client, monkeypatch):
        _org(client.db)
        rid = client.post("/billing/refunds/request", params={"org_id": 1},
                          json={"amount_cents": 100, "reason": "x", "request_type": "credit"}).json()["id"]
        from app.core.exceptions import BadRequestException

        def fail(*a, **k):
            raise BadRequestException("Stripe credit execution failed: boom")
        monkeypatch.setattr(refund_service, "_execute_stripe_credit", fail)
        client.box["user"] = _Caller(email="ops@zoiko.test", uid=2)
        r = client.post(f"/billing/refunds/{rid}/approve", json={})
        assert r.status_code == 400 and "boom" in r.json()["message"]
        client.db.expire_all()
        assert client.db.get(BillingRefundRequest, rid).status == RefundRequestStatus.PENDING_APPROVAL
        assert client.db.query(BillingAuditLog).filter_by(
            action=BillingAuditAction.CREDIT_APPROVED).count() == 0


# ── RBAC ────────────────────────────────────────────────────────────────────

class TestAccess:
    @pytest.mark.parametrize("role", ["employee", "manager"])
    def test_non_billing_roles_get_403(self, client, role):
        _org(client.db)
        client.box["user"] = _Caller(role=role, org_id=1)
        assert client.get("/billing/refunds").status_code == 403
        assert client.get("/billing/refunds/summary").status_code == 403
        assert client.post("/billing/refunds/request", params={"org_id": 1},
                           json={"amount_cents": 100, "reason": "x"}).status_code == 403
        assert client.post("/billing/refunds/1/approve", json={}).status_code == 403

    def test_org_admin_sees_only_their_own_org(self, client):
        _org(client.db, 1, "Mine")
        _org(client.db, 2, "Theirs")
        _req(client.db, 1)
        _req(client.db, 2)
        client.box["user"] = _Caller(role="admin", org_id=1)
        body = client.get("/billing/refunds").json()
        assert [x["organization_name"] for x in body["list"]] == ["Mine"]
        assert client.get("/billing/refunds/summary").json()["pending_count"] == 1
