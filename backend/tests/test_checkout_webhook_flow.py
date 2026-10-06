"""ZHR-48: a completed Stripe payment must upgrade the plan and send the confirmation,
even when Stripe's subscription read fails or the invoice events arrive first."""

from unittest.mock import patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.modules.billing.models import (
    BillingChannel, BillingClassification, BillingMetric, BillingPlan, BillingSubscription,
    PlanCode, ProviderRef, SubscriptionStatus, TaxCategory,
)
from app.modules.billing.webhook_service import process_webhook_event
from app.modules.hr.models import Organization, OrganizationStatus


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine)()
    yield s
    s.close()
    engine.dispose()


def _plan(db, code, monthly_price_id, price=10.0):
    p = BillingPlan(code=code, name=code.value.title(), catalog_version="v1", billing_metric=BillingMetric.ACTIVE_WORKFORCE,
                    is_active=True, is_contract_priced=False, monthly_price=price, annual_price=price * 10, currency="USD",
                    tax_category=TaxCategory.SAAS_SUBSCRIPTION, stripe_monthly_price_id=monthly_price_id,
                    stripe_annual_price_id=monthly_price_id + "_y")
    db.add(p)
    db.commit()
    return p


@pytest.fixture
def world(db):
    db.add(Organization(id=1, name="Acme", status=OrganizationStatus.ACTIVE))
    db.flush()
    core = _plan(db, PlanCode.CORE, "price_core", 10)
    advanced = _plan(db, PlanCode.ADVANCED, "price_adv", 25)
    sub = BillingSubscription(organization_id=1, plan_id=core.id, plan_code=PlanCode.CORE,
                              billing_classification=BillingClassification.EVALUATION, status=SubscriptionStatus.EVALUATION)
    db.add(sub)
    db.commit()
    return {"core": core, "advanced": advanced, "sub": sub}


def _checkout_event(plan_id, event_id="evt_checkout_1"):
    return {"id": event_id, "type": "checkout.session.completed", "data": {"object": {
        "id": "cs_test_1", "customer": "cus_1", "subscription": "sub_1", "payment_status": "paid", "status": "complete",
        "metadata": {"organization_id": "1", "plan_id": str(plan_id), "billing_cycle": "monthly"}}}}


def _invoice_paid(event_id="evt_invoice_1", with_metadata=True):
    obj = {"id": "in_1", "customer": "cus_1", "subscription": "sub_1", "amount_paid": 2500, "amount_due": 2500, "currency": "usd",
           "status": "paid", "number": "INV-1", "created": 1790000000}
    if with_metadata:
        obj["subscription_details"] = {"metadata": {"organization_id": "1"}}
    return {"id": event_id, "type": "invoice.paid", "data": {"object": obj}}


def _stripe_unreadable(*a, **k):
    # What stripe-python 15 does when the code reads a field that moved: AttributeError, not a StripeError.
    raise AttributeError("current_period_start")


def test_upgrade_is_applied_even_when_the_subscription_cannot_be_read_back(db, world):
    with patch("app.modules.billing.webhook_service.retrieve_subscription", _stripe_unreadable):
        out = process_webhook_event(db, _checkout_event(world["advanced"].id))
    assert out["status"] == "ok"
    db.refresh(world["sub"])
    assert world["sub"].plan_id == world["advanced"].id and world["sub"].plan_code == PlanCode.ADVANCED
    assert world["sub"].status == SubscriptionStatus.ACTIVE
    assert world["sub"].billing_channel == BillingChannel.WEB_STRIPE
    ref = db.query(ProviderRef).filter(ProviderRef.organization_id == 1).one()
    assert (ref.stripe_customer_id, ref.stripe_subscription_id) == ("cus_1", "sub_1")


def test_the_stripe_price_wins_when_it_can_be_read(db, world):
    stripe_sub = {"id": "sub_1", "status": "active", "items": [{"price_id": "price_adv", "quantity": 4}]}
    with patch("app.modules.billing.webhook_service.retrieve_subscription", lambda _id: stripe_sub):
        process_webhook_event(db, _checkout_event(world["core"].id))  # metadata says Core, Stripe says Advanced
    db.refresh(world["sub"])
    assert world["sub"].plan_id == world["advanced"].id and world["sub"].quantity == 4


def test_confirmation_email_is_sent_once_for_an_upgrade(db, world):
    sent = []
    with patch("app.modules.billing.webhook_service.retrieve_subscription", _stripe_unreadable), \
         patch("app.modules.billing.webhook_service._send_to_billing_recipients", lambda _db, org_id, fn: sent.append(org_id)):
        process_webhook_event(db, _checkout_event(world["advanced"].id, "evt_a"))
        process_webhook_event(db, _checkout_event(world["advanced"].id, "evt_b"))  # Stripe retries / a second event
    assert sent == [1], "one plan-upgrade confirmation, not zero and not one per event"


def test_invoice_paid_arriving_before_checkout_completed_still_reaches_the_org(db, world):
    receipts = []
    with patch("app.modules.billing.webhook_service._send_payment_receipt_emails", lambda _db, org_id, data: receipts.append(org_id)), \
         patch("app.modules.billing.webhook_service._send_subscription_renewed_emails", lambda *a, **k: None):
        out = process_webhook_event(db, _invoice_paid())
    assert out["message"] != "no matching org", out
    assert receipts == [1]  # resolved from the subscription metadata; no ProviderRef exists yet
    assert db.query(ProviderRef).filter(ProviderRef.organization_id == 1).count() == 1


def test_invoice_paid_for_a_known_customer_resolves_without_metadata(db, world):
    db.add(ProviderRef(organization_id=1, stripe_customer_id="cus_1"))
    db.commit()
    receipts = []
    with patch("app.modules.billing.webhook_service._send_payment_receipt_emails", lambda _db, org_id, data: receipts.append(org_id)), \
         patch("app.modules.billing.webhook_service._send_subscription_renewed_emails", lambda *a, **k: None):
        process_webhook_event(db, _invoice_paid(with_metadata=False))
    assert receipts == [1]


def test_an_unknown_customer_is_ignored_not_attributed_to_another_org(db, world):
    obj = _invoice_paid(with_metadata=False)
    obj["data"]["object"]["customer"] = "cus_stranger"
    out = process_webhook_event(db, obj)
    assert out["message"] == "no matching org"


def test_replaying_the_same_event_is_a_noop(db, world):
    with patch("app.modules.billing.webhook_service.retrieve_subscription", _stripe_unreadable):
        process_webhook_event(db, _checkout_event(world["advanced"].id))
        again = process_webhook_event(db, _checkout_event(world["advanced"].id))
    assert again["status"] == "skipped"


def test_in_place_plan_change_uses_a_payment_behavior_stripe_accepts():
    """Real Stripe rejected 'error_incomplete' (ZHR-48): the valid values are fixed by the API."""
    import inspect

    from app.modules.billing import stripe_client

    default = inspect.signature(stripe_client.modify_subscription_price).parameters["payment_behavior"].default
    assert default in {"allow_incomplete", "error_if_incomplete", "pending_if_incomplete", "default_incomplete"}
    assert default == "error_if_incomplete"  # all-or-nothing: an unpaid proration must not leave the plan changed
