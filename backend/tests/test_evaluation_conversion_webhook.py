"""
tests/test_evaluation_conversion_webhook.py
--------------------------------------------
G1 (ZHR-COM-ENT-001 §8 steps 7-8): a self-serve Stripe checkout completing
against a trialing org must close the linked OrganizationEvaluation (→
CONVERTED), write a BillingConversion row, and log a commercial audit event —
and must be safe to run twice (idempotent) without a second conversion.

Follows the same in-memory-sqlite + direct process_webhook_event() pattern as
tests/test_stripe_webhook.py.
"""

from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.modules.billing.models import (
    BillingAuditAction,
    BillingAuditLog,
    BillingClassification,
    BillingConversion,
    BillingCycle,
    BillingMetric,
    BillingPlan,
    BillingSubscription,
    EvaluationStatus,
    OrganizationEvaluation,
    PlanCode,
    SubscriptionStatus,
    TaxCategory,
)
from app.modules.billing import service as billing_service
from app.modules.billing.webhook_service import _handle_checkout_completed, process_webhook_event


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    engine.dispose()


def _trialing_org_with_active_evaluation(db, org_id: int = 1) -> tuple[BillingSubscription, OrganizationEvaluation, BillingPlan]:
    from app.modules.hr.models import Organization, OrganizationStatus

    org = Organization(id=org_id, name=f"Trialing Org {org_id}", status=OrganizationStatus.APPROVED)
    db.add(org)
    db.flush()

    evaluation = billing_service.start_evaluation(
        db,
        organization_id=org_id,
        evaluation_ends_at=datetime.utcnow() + timedelta(days=10),
        conversion_owner=f"owner-{org_id}@z.test",
    )

    plan = BillingPlan(
        code=PlanCode.CORE,
        name="Core",
        catalog_version="ZHR-COM-BILL-001-v1",
        billing_metric=BillingMetric.ACTIVE_WORKFORCE,
        is_active=True,
        is_contract_priced=False,
        monthly_price=10.00,
        annual_price=100.00,
        currency="USD",
        tax_category=TaxCategory.SAAS_SUBSCRIPTION,
        stripe_product_id="prod_test_core",
        stripe_monthly_price_id="price_test_monthly",
        stripe_annual_price_id="price_test_annual",
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)

    sub = db.query(BillingSubscription).filter(BillingSubscription.organization_id == org_id).first()
    return sub, evaluation, plan


def _checkout_event(event_id: str, org_id: int, plan_id: int, billing_cycle: str = "monthly") -> dict:
    return {
        "id": event_id,
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_test_session",
                "customer": "cus_test",
                "subscription": "sub_test",
                "payment_status": "paid",
                "status": "complete",
                "metadata": {
                    "organization_id": str(org_id),
                    "plan_id": str(plan_id),
                    "billing_cycle": billing_cycle,
                },
            }
        },
    }


class TestEvaluationConversionOnCheckoutCompleted:
    def test_checkout_completed_converts_active_evaluation(self, db, monkeypatch):
        sub, evaluation, plan = _trialing_org_with_active_evaluation(db, org_id=1)

        def _fake_retrieve_subscription(subscription_id):
            return {
                "id": "sub_test",
                "status": "active",
                "items": [{"price_id": "price_test_monthly", "quantity": 5}],
            }

        monkeypatch.setattr(
            "app.modules.billing.webhook_service.retrieve_subscription", _fake_retrieve_subscription
        )

        event = _checkout_event("evt_convert_001", org_id=1, plan_id=plan.id)
        result = process_webhook_event(db, event)
        assert result["status"] == "ok"

        db.refresh(evaluation)
        assert evaluation.status == EvaluationStatus.CONVERTED

        conversion = db.query(BillingConversion).filter(
            BillingConversion.evaluation_id == evaluation.id
        ).first()
        assert conversion is not None
        assert conversion.organization_id == 1
        assert conversion.quantity_basis == "self_serve_checkout"

        db.refresh(sub)
        assert sub.status == SubscriptionStatus.ACTIVE
        assert sub.billing_classification == BillingClassification.COMMERCIAL
        assert sub.plan_code == PlanCode.CORE

        audit = db.query(BillingAuditLog).filter(
            BillingAuditLog.organization_id == 1,
            BillingAuditLog.action == BillingAuditAction.EVALUATION_CONVERTED,
        ).first()
        assert audit is not None
        assert audit.source == "stripe_webhook"
        assert audit.stripe_event_id == "evt_convert_001"

    def test_replaying_same_event_id_does_not_convert_twice(self, db, monkeypatch):
        """The pre-existing BillingWebhookEvent.stripe_event_id dedup guard
        already blocks exact event-id replays before the handler even runs —
        confirm it still holds and no second conversion is possible."""
        sub, evaluation, plan = _trialing_org_with_active_evaluation(db, org_id=1)

        monkeypatch.setattr(
            "app.modules.billing.webhook_service.retrieve_subscription",
            lambda subscription_id: {
                "id": "sub_test", "status": "active",
                "items": [{"price_id": "price_test_monthly", "quantity": 5}],
            },
        )

        event = _checkout_event("evt_convert_002", org_id=1, plan_id=plan.id)
        result1 = process_webhook_event(db, event)
        assert result1["status"] == "ok"

        result2 = process_webhook_event(db, event)
        assert result2["status"] == "skipped"

        conversions = db.query(BillingConversion).filter(
            BillingConversion.evaluation_id == evaluation.id
        ).all()
        assert len(conversions) == 1

    def test_second_checkout_completed_call_after_conversion_is_a_noop(self, db, monkeypatch):
        """Calls the handler directly with two DIFFERENT event ids (simulating
        a legitimate retry/duplicate delivery that bypasses the event-id dedup
        layer) to prove idempotency comes from get_active_evaluation() itself,
        not just the outer dedup guard."""
        sub, evaluation, plan = _trialing_org_with_active_evaluation(db, org_id=1)

        monkeypatch.setattr(
            "app.modules.billing.webhook_service.retrieve_subscription",
            lambda subscription_id: {
                "id": "sub_test", "status": "active",
                "items": [{"price_id": "price_test_monthly", "quantity": 5}],
            },
        )

        event1 = _checkout_event("evt_direct_a", org_id=1, plan_id=plan.id)
        data1 = event1["data"]["object"]
        result1 = _handle_checkout_completed(db, "evt_direct_a", data1, event1)
        assert result1["status"] == "ok"
        db.commit()

        event2 = _checkout_event("evt_direct_b", org_id=1, plan_id=plan.id)
        data2 = event2["data"]["object"]
        # Must not raise, must not create a second conversion.
        result2 = _handle_checkout_completed(db, "evt_direct_b", data2, event2)
        assert result2["status"] == "ok"
        db.commit()

        conversions = db.query(BillingConversion).filter(
            BillingConversion.evaluation_id == evaluation.id
        ).all()
        assert len(conversions) == 1

    def test_checkout_completed_with_no_active_evaluation_is_a_noop(self, db, monkeypatch):
        """An org with no evaluation at all (e.g. a direct commercial signup,
        or an evaluation already converted/expired) must not crash and must
        not write a BillingConversion row."""
        from app.modules.hr.models import Organization, OrganizationStatus

        org = Organization(id=2, name="Direct Org", status=OrganizationStatus.ACTIVE)
        db.add(org)
        db.flush()
        sub = BillingSubscription(
            organization_id=2,
            billing_classification=BillingClassification.INTERNAL,
            status=SubscriptionStatus.EVALUATION,
        )
        db.add(sub)
        db.commit()

        monkeypatch.setattr(
            "app.modules.billing.webhook_service.retrieve_subscription",
            lambda subscription_id: {
                "id": "sub_test", "status": "active",
                "items": [{"price_id": "price_test_monthly", "quantity": 5}],
            },
        )

        event = _checkout_event("evt_no_eval_001", org_id=2, plan_id=999999)
        result = process_webhook_event(db, event)
        assert result["status"] == "ok"

        assert db.query(BillingConversion).filter(
            BillingConversion.organization_id == 2
        ).count() == 0
