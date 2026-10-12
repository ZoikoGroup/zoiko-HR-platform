"""
tests/test_checkout_api.py
---------------------------
ZHR-48 — POST /billing/checkout-session and POST /billing/checkout-session/confirm.

Two payment paths must both land the org on the plan the customer paid for:

  1. No live Stripe subscription → open a Checkout Session (redirect, then
     confirm when the browser returns).
  2. Live Stripe subscription    → reprice THAT subscription in place.

The bug under test: an org already on a plan used to be sent through a second
Checkout Session (a second subscription, double billing) or — when the
subscription read raised on a missing field — the completion handler aborted
after payment and the app never changed, no email ever went out.

Stripe is mocked at the router/webhook_service boundary: no network.

Why the confirm endpoint exists: Stripe cannot deliver webhooks to localhost,
so the browser return is the only channel guaranteed to apply a completed
payment while verifying locally.
"""

from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import sys, pathlib

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from app.database import Base, get_db
from app.core.dependencies import get_current_user
from app.modules.billing.router import _with_session_id, billing_router
from app.modules.billing.models import (
    BillingAuditAction,
    BillingMetric,
    BillingPlan,
    BillingSubscription,
    PlanCode,
    ProviderRef,
    SubscriptionStatus,
    TaxCategory,
)
from app.modules.hr.models import Organization, OrganizationStatus

from fixtures import tenants


class _Caller:
    def __init__(self, email, org_id, role):
        self.email = email
        self.organization_id = org_id
        self.role = role
        self.id = None


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
    app.include_router(billing_router)

    def _override_db():
        yield db

    app.dependency_overrides[get_db] = _override_db

    user_box = {}

    def _override_current_user():
        return user_box["user"]

    app.dependency_overrides[get_current_user] = _override_current_user

    with TestClient(app) as c:
        c.user_box = user_box
        yield c


def _as(client, email, org_id, role="admin"):
    client.user_box["user"] = _Caller(email=email, org_id=org_id, role=role)


def _create_plan(db, code=PlanCode.ADVANCED, name="Advanced", monthly=20.0, annual=200.0):
    from datetime import datetime

    plan = BillingPlan(
        code=code,
        name=name,
        catalog_version="ZHR-COM-BILL-001-v1",
        billing_metric=BillingMetric.ACTIVE_WORKFORCE,
        is_active=True,
        is_contract_priced=False,
        monthly_price=monthly,
        annual_price=annual,
        currency="USD",
        tax_category=TaxCategory.SAAS_SUBSCRIPTION,
        stripe_product_id=f"prod_{code.value}",
        stripe_monthly_price_id=f"price_{code.value}_monthly",
        stripe_annual_price_id=f"price_{code.value}_annual",
        published_at=datetime.utcnow(),
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def _subscribe(db, fx, *, status=SubscriptionStatus.ACTIVE, stripe_sub="sub_live_1",
               stripe_customer="cus_live_1", plan=None, quantity=1):
    """Put the fixture org on a live Stripe subscription + provider refs."""
    fx.sub.status = status
    if plan is not None:
        fx.sub.plan_id = plan.id
        fx.sub.plan_code = plan.code
        fx.sub.billing_cycle = fx.sub.billing_cycle or None
    fx.sub.quantity = quantity
    ref = db.query(ProviderRef).filter(ProviderRef.organization_id == fx.org.id).first()
    if ref is None:
        ref = ProviderRef(organization_id=fx.org.id)
        db.add(ref)
    ref.stripe_customer_id = stripe_customer
    ref.stripe_subscription_id = stripe_sub
    db.commit()
    return fx.sub


def _post_checkout(client, payload):
    return client.post(
        "/billing/checkout-session",
        json=payload,
        headers={"Idempotency-Key": f"ik-{payload['organization_id']}-{payload['plan_id']}"},
    )


_STRIPE_ON = patch("app.modules.billing.router.stripe_enabled", return_value=True)
_NO_DRIFT = patch("app.modules.billing.stripe_sync_service.has_drift", return_value=False)


# ═══════════════════════════════════════════════════════════════════════════
# POST /billing/checkout-session
# ═══════════════════════════════════════════════════════════════════════════

class TestCreateCheckout:
    def test_live_subscription_is_repriced_in_place(self, db, client):
        """An org already subscribed must NOT get a second Checkout Session."""
        fx = tenants.core_tenant(db)
        old = _create_plan(db, code=PlanCode.CORE, name="Core")
        new = _create_plan(db, code=PlanCode.ADVANCED, name="Advanced")
        _subscribe(db, fx, plan=old)
        fx.org.registered_email = "owner@example.com"
        db.commit()
        _as(client, "owner@z", fx.org.id, role="super_admin")

        changed = {
            "status": "active",
            "items": [{"price_id": "price_ADVANCED_monthly", "quantity": 3}],
            "unchanged": False,
        }

        with _STRIPE_ON, _NO_DRIFT, patch(
            "app.modules.billing.router.modify_subscription_price",
            return_value=changed,
        ) as modify, patch(
            "app.modules.billing.router.create_checkout_session"
        ) as create_session, patch(
            "app.services.email_service.send_plan_upgraded_email"
        ) as send_email:
            r = _post_checkout(client, {
                "plan_id": new.id,
                "organization_id": fx.org.id,
                "billing_cycle": "monthly",
                "success_url": "http://localhost/billing",
                "cancel_url": "http://localhost/billing",
            })

        assert r.status_code == 200, r.text
        body = r.json()
        # No redirect: the existing subscription was modified, not duplicated.
        assert body["checkout_url"] is None
        assert body["updated"] is True
        assert body["unchanged"] is False
        modify.assert_called_once()
        assert modify.call_args.kwargs["subscription_id"] == "sub_live_1"
        assert modify.call_args.kwargs["new_price_id"] == f"price_{new.code.value}_monthly"
        create_session.assert_not_called()

        db.refresh(fx.sub)
        assert fx.sub.plan_id == new.id
        assert str(fx.sub.plan_code.value) == "advanced"

        # Confirmation email actually went out.
        assert send_email.call_count >= 1

    def test_a_lower_tier_is_not_repriced_immediately(self, db, client):
        """Downgrades are scheduled for renewal after the blocker check, never an instant repricing."""
        fx = tenants.core_tenant(db)
        current = _create_plan(db, code=PlanCode.ADVANCED, name="Advanced")
        lower = _create_plan(db, code=PlanCode.CORE, name="Core")
        _subscribe(db, fx, plan=current)
        _as(client, "owner@z", fx.org.id, role="super_admin")
        with _STRIPE_ON, _NO_DRIFT, patch("app.modules.billing.router.modify_subscription_price") as modify:
            r = _post_checkout(client, {
                "plan_id": lower.id, "organization_id": fx.org.id, "billing_cycle": "monthly",
                "success_url": "http://localhost/billing", "cancel_url": "http://localhost/billing",
            })
        assert r.status_code == 400
        assert "downgrade" in str(r.json()).lower()
        modify.assert_not_called()
        db.refresh(fx.sub)
        assert fx.sub.plan_id == current.id

    def test_already_on_that_plan_is_a_noop(self, db, client):
        """Same price again must not create a duplicate invoice."""
        fx = tenants.core_tenant(db)
        plan = _create_plan(db, code=PlanCode.CORE, name="Core")
        _subscribe(db, fx, plan=plan)
        _as(client, "owner@z", fx.org.id, role="super_admin")

        with _STRIPE_ON, _NO_DRIFT, patch(
            "app.modules.billing.router.modify_subscription_price",
            return_value={"status": "active", "unchanged": True},
        ) as modify, patch(
            "app.modules.billing.router.create_checkout_session"
        ) as create_session:
            r = _post_checkout(client, {
                "plan_id": plan.id,
                "organization_id": fx.org.id,
                "billing_cycle": "monthly",
                "success_url": "http://localhost/billing",
                "cancel_url": "http://localhost/billing",
            })

        assert r.status_code == 200, r.text
        assert r.json()["unchanged"] is True
        assert r.json()["checkout_url"] is None
        create_session.assert_not_called()
        # A no-op still never opens a second subscription.
        modify.assert_called_once()

    def test_past_due_subscription_is_blocked(self, db, client):
        fx = tenants.core_tenant(db)
        old = _create_plan(db, code=PlanCode.CORE, name="Core")
        new = _create_plan(db, code=PlanCode.ADVANCED, name="Advanced")
        _subscribe(db, fx, plan=old, status=SubscriptionStatus.PAST_DUE)
        _as(client, "owner@z", fx.org.id, role="super_admin")

        with _STRIPE_ON, _NO_DRIFT, patch(
            "app.modules.billing.router.modify_subscription_price"
        ) as modify, patch(
            "app.modules.billing.router.create_checkout_session"
        ) as create_session:
            r = _post_checkout(client, {
                "plan_id": new.id,
                "organization_id": fx.org.id,
                "billing_cycle": "monthly",
                "success_url": "http://localhost/billing",
                "cancel_url": "http://localhost/billing",
            })

        assert r.status_code == 400, r.text
        assert "past due" in r.json()["detail"].lower()
        modify.assert_not_called()
        create_session.assert_not_called()

    def test_new_subscription_opens_checkout_and_saves_customer_first(self, db, client):
        fx = tenants.evaluation_tenant(db)
        plan = _create_plan(db, code=PlanCode.CORE, name="Core")
        _as(client, "owner@z", fx.org.id, role="super_admin")

        with _STRIPE_ON, _NO_DRIFT, patch(
            "app.modules.billing.router.ensure_customer",
            return_value="cus_brand_new",
        ) as ensure_customer, patch(
            "app.modules.billing.router.create_checkout_session",
            return_value={
                "checkout_session_id": "cs_test_1",
                "checkout_url": "https://checkout.stripe.com/c/pay/cs_test_1",
                "status": "open",
                "payment_status": "unpaid",
            },
        ) as create_session, patch(
            "app.services.email_service.send_plan_upgraded_email"
        ):
            r = _post_checkout(client, {
                "plan_id": plan.id,
                "organization_id": fx.org.id,
                "billing_cycle": "monthly",
                "success_url": "http://localhost/organization-admin/billing-and-plan?payment=success",
                "cancel_url": "http://localhost/organization-admin/billing-and-plan?payment=cancelled",
            })

        assert r.status_code == 200, r.text
        body = r.json()
        assert body["checkout_url"].startswith("https://checkout.stripe.com/")
        assert body["checkout_session_id"] == "cs_test_1"

        # Customer exists BEFORE checkout so invoice.created can resolve its org.
        ensure_customer.assert_called_once()
        ref = db.query(ProviderRef).filter(ProviderRef.organization_id == fx.org.id).first()
        assert ref is not None and ref.stripe_customer_id == "cus_brand_new"

        kwargs = create_session.call_args.kwargs
        # The redirect carries the session id back so the browser can confirm.
        assert "{CHECKOUT_SESSION_ID}" in kwargs["success_url"]
        # Subscription + invoice metadata carries plan context without a read.
        assert kwargs["subscription_metadata"]["plan_id"] == str(plan.id)
        assert kwargs["client_reference_id"] == str(fx.org.id)

    def test_admin_cannot_open_checkout_for_another_org(self, db, client):
        fx1 = tenants.core_tenant(db, org_id=1)
        fx2 = tenants.advanced_tenant(db, org_id=2)
        plan = _create_plan(db)
        _as(client, "admin@z", fx1.org.id, role="admin")

        with _STRIPE_ON, _NO_DRIFT:
            r = _post_checkout(client, {
                "plan_id": plan.id,
                "organization_id": fx2.org.id,
                "billing_cycle": "monthly",
                "success_url": "http://localhost/billing",
                "cancel_url": "http://localhost/billing",
            })

        assert r.status_code in (401, 403), r.text


# ═══════════════════════════════════════════════════════════════════════════
# POST /billing/checkout-session/confirm
# ═══════════════════════════════════════════════════════════════════════════

def _completed_session(org_id, *, session_id="cs_done_1", status="complete",
                       payment_status="paid", metadata=None, plan_id=None,
                       billing_cycle="monthly"):
    meta = {"organization_id": str(org_id), "billing_cycle": billing_cycle}
    if plan_id is not None:
        meta["plan_id"] = str(plan_id)
    meta.update(metadata or {})
    return {
        "id": session_id,
        "status": status,
        "payment_status": payment_status,
        "subscription_id": "sub_new_9",
        "customer_id": "cus_new_9",
        "customer_email": "billing@example.com",
        "amount_total": 2000,
        "currency": "usd",
        "metadata": meta,
    }


def _stripe_sub(price_id="price_advanced_monthly", status="active"):
    return {
        "id": "sub_new_9",
        "status": status,
        "current_period_start": 1_700_000_000,
        "current_period_end": 1_703_000_000,
        "quantity": 3,
        "items": [{"price_id": price_id, "quantity": 3}],
    }


class TestConfirmCheckout:
    def test_paid_session_applies_the_plan(self, db, client):
        fx = tenants.evaluation_tenant(db)
        plan = _create_plan(db, code=PlanCode.ADVANCED, name="Advanced")
        fx.org.registered_email = "owner@example.com"
        db.commit()
        _as(client, "owner@z", fx.org.id, role="super_admin")

        with _STRIPE_ON, patch(
            "app.modules.billing.router.retrieve_checkout_session",
            return_value=_completed_session(fx.org.id, plan_id=plan.id),
        ), patch(
            "app.modules.billing.webhook_service.retrieve_subscription",
            return_value=_stripe_sub(),
        ), patch(
            "app.services.email_service.send_plan_upgraded_email"
        ) as send_email:
            r = client.post("/billing/checkout-session/confirm", json={
                "organization_id": fx.org.id,
                "checkout_session_id": "cs_done_1",
            })

        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "confirmed"
        assert body["plan_code"] == "advanced"
        assert body["subscription_status"] == "active"

        db.refresh(fx.sub)
        assert fx.sub.plan_id == plan.id
        assert fx.sub.status == SubscriptionStatus.ACTIVE
        # Provider refs written, so later invoice events resolve their org.
        ref = db.query(ProviderRef).filter(ProviderRef.organization_id == fx.org.id).first()
        assert ref.stripe_subscription_id == "sub_new_9"
        assert send_email.call_count == 1

    def test_confirm_is_idempotent(self, db, client):
        """Browser retry and Stripe's webhook must not both mail the customer."""
        fx = tenants.evaluation_tenant(db)
        plan = _create_plan(db, code=PlanCode.ADVANCED, name="Advanced")
        fx.org.registered_email = "owner@example.com"
        db.commit()
        _as(client, "owner@z", fx.org.id, role="super_admin")

        payload = {"organization_id": fx.org.id, "checkout_session_id": "cs_done_1"}
        with _STRIPE_ON, patch(
            "app.modules.billing.router.retrieve_checkout_session",
            return_value=_completed_session(fx.org.id, plan_id=plan.id),
        ), patch(
            "app.modules.billing.webhook_service.retrieve_subscription",
            return_value=_stripe_sub(),
        ), patch(
            "app.services.email_service.send_plan_upgraded_email"
        ) as send_email:
            first = client.post("/billing/checkout-session/confirm", json=payload)
            second = client.post("/billing/checkout-session/confirm", json=payload)

        assert first.status_code == 200 and second.status_code == 200
        assert first.json()["status"] == "confirmed"
        assert second.json()["status"] == "confirmed"
        # Exactly one confirmation email across both calls.
        assert send_email.call_count == 1

    def test_open_session_is_pending_not_confirmed(self, db, client):
        fx = tenants.evaluation_tenant(db)
        _as(client, "owner@z", fx.org.id, role="super_admin")

        with _STRIPE_ON, patch(
            "app.modules.billing.router.retrieve_checkout_session",
            return_value=_completed_session(
                fx.org.id, session_id="cs_open_1", status="open",
                payment_status="unpaid",
            ),
        ):
            r = client.post("/billing/checkout-session/confirm", json={
                "organization_id": fx.org.id,
                "checkout_session_id": "cs_open_1",
            })

        assert r.status_code == 200, r.text
        assert r.json()["status"] == "pending"
        db.refresh(fx.sub)
        assert fx.sub.status == SubscriptionStatus.EVALUATION

    def test_session_of_another_org_is_rejected(self, db, client):
        fx1 = tenants.core_tenant(db, org_id=1)
        tenants.advanced_tenant(db, org_id=2)
        _as(client, "owner@z", fx1.org.id, role="super_admin")

        with _STRIPE_ON, patch(
            "app.modules.billing.router.retrieve_checkout_session",
            return_value=_completed_session(2),
        ):
            r = client.post("/billing/checkout-session/confirm", json={
                "organization_id": fx1.org.id,
                "checkout_session_id": "cs_done_1",
            })

        assert r.status_code == 403, r.text


# ═══════════════════════════════════════════════════════════════════════════
# Redirect plumbing
# ═══════════════════════════════════════════════════════════════════════════

class TestSessionIdOnRedirect:
    def test_placeholder_appended_to_query(self):
        out = _with_session_id("http://localhost/billing?payment=success")
        assert out == "http://localhost/billing?payment=success&session_id={CHECKOUT_SESSION_ID}"

    def test_placeholder_appended_with_path_only(self):
        out = _with_session_id("http://localhost/billing")
        assert out == "http://localhost/billing?session_id={CHECKOUT_SESSION_ID}"

    def test_not_duplicated_when_already_present(self):
        url = "http://localhost/billing?session_id={CHECKOUT_SESSION_ID}"
        assert _with_session_id(url) == url


# ═══════════════════════════════════════════════════════════════════════════
# ZHR-100: a settled payment is reflected in the current plan
# ═══════════════════════════════════════════════════════════════════════════

class TestPaymentShowsInCurrentPlan:
    def _confirm(self, client, fx, plan, session_id="cs_done_1"):
        with _STRIPE_ON, patch(
            "app.modules.billing.router.retrieve_checkout_session",
            return_value=_completed_session(fx.org.id, session_id=session_id, plan_id=plan.id),
        ), patch("app.modules.billing.webhook_service.retrieve_subscription", return_value=_stripe_sub()), patch(
            "app.services.email_service.send_plan_upgraded_email"
        ):
            return client.post("/billing/checkout-session/confirm", json={"organization_id": fx.org.id, "checkout_session_id": session_id})

    def test_the_current_plan_endpoint_shows_the_new_plan_right_after_confirm(self, db, client):
        fx = tenants.evaluation_tenant(db)
        plan = _create_plan(db, code=PlanCode.ADVANCED, name="Advanced")
        _as(client, "owner@z", fx.org.id, role="super_admin")
        before = client.get("/billing/me/subscription").json()
        assert before["status"] == "evaluation" and before["plan_name"] != "Advanced"
        assert self._confirm(client, fx, plan).json()["status"] == "confirmed"
        after = client.get("/billing/me/subscription").json()
        assert (after["status"], after["plan_code"], after["plan_name"], after["plan_id"]) == ("active", "advanced", "Advanced", plan.id)

    def test_an_extra_payment_that_was_refunded_is_not_reported_as_a_plan_update(self, db, client):
        fx = tenants.evaluation_tenant(db)
        plan = _create_plan(db, code=PlanCode.ADVANCED, name="Advanced")
        _subscribe(db, fx, stripe_sub="sub_kept_1")
        _as(client, "owner@z", fx.org.id, role="super_admin")
        with _STRIPE_ON, patch(
            "app.modules.billing.router.retrieve_checkout_session", return_value=_completed_session(fx.org.id, plan_id=plan.id),
        ), patch("app.modules.billing.webhook_service.retrieve_subscription", return_value={"id": "sub_kept_1", "status": "active", "items": []}), patch(
            "app.modules.billing.webhook_service.cancel_and_refund_duplicate_subscription", return_value={"refund_id": "re_1"},
        ):
            r = client.post("/billing/checkout-session/confirm", json={"organization_id": fx.org.id, "checkout_session_id": "cs_done_1"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "failed" and "refunded" in r.json()["message"]

    def test_plan_state_is_never_served_from_the_response_cache(self):
        from app.core.cache_middleware import _should_cache_path
        for path in ("/billing/me/subscription", "/billing/me/entitlements", "/billing/organizations/3/overview", "/billing/subscriptions/3"):
            assert _should_cache_path(path) is False, path
        assert _should_cache_path("/hr/leaves") is True
