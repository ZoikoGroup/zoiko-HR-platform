"""
tests/test_stripe_webhook.py
-----------------------------
Full webhook-handler suite covering:
  - Signature verification (valid/invalid/missing secret)
  - Event inbox replay protection (same event ID twice → exactly one state transition)
  - All 5 handled event types: checkout.completed, subscription.updated,
    subscription.deleted, invoice.paid, invoice.payment_failed
  - Unhandled event type → logged, not dropped
  - Idempotency key replay: same body → stored result; different body → 409
  - Reconciliation mismatch → opens case, does not auto-fix

Fixtures under tests/fixtures/stripe/ use Stripe's documented test event
payload shapes. Stripe SDK is mocked at the stripe_client.py boundary —
no real network in CI.
"""

import hashlib
import hmac
import json
import time
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.modules.billing.models import (
    BillingAuditAction,
    BillingAuditLog,
    BillingInvoice,
    BillingIdempotencyKey,
    BillingSubscription,
    BillingWebhookEvent,
    BillingReconciliationCase,
    BillingPlan,
    OrganizationEvaluation,
    ProviderRef,
    SubscriptionStatus,
    BillingClassification,
    PlanCode,
    BillingMetric,
    TaxCategory,
    BillingCycle,
    ReconciliationCaseReason,
    ReconciliationCaseStatus,
)
from app.modules.billing.idempotency import execute_idempotent, _hash_body
from app.modules.billing.stripe_client import verify_webhook_signature
from app.modules.billing.webhook_service import process_webhook_event
from app.modules.billing.reconciliation_service import reconcile_org


# ── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def db():
    """In-memory SQLite session with the full billing schema."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    engine.dispose()


def _load_fixture(name: str) -> dict:
    """Load a Stripe test event fixture."""
    import pathlib
    fixture_dir = pathlib.Path(__file__).parent / "fixtures" / "stripe"
    with open(fixture_dir / f"{name}.json") as f:
        return json.load(f)


def _create_org_and_subscription(db, org_id: int = 1) -> BillingSubscription:
    """Create a minimal organization evaluation + subscription for testing."""
    from app.modules.hr.models import Organization, OrganizationStatus
    org = Organization(
        id=org_id,
        name=f"Test Org {org_id}",
        status=OrganizationStatus.ACTIVE,
    )
    db.add(org)
    db.flush()

    sub = BillingSubscription(
        organization_id=org_id,
        billing_classification=BillingClassification.EVALUATION,
        status=SubscriptionStatus.EVALUATION,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def _create_plan(db, code=PlanCode.CORE) -> BillingPlan:
    plan = BillingPlan(
        code=code,
        name=str(code.value),
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
    return plan


# ═════════════════════════════════════════════════════════════════════════════
# Signature Verification Tests
# ═════════════════════════════════════════════════════════════════════════════

class TestSignatureVerification:
    def test_valid_signature_passes(self):
        secret = "whsec_test_secret_123"
        payload = b'{"id":"evt_123","type":"test"}'
        timestamp = str(int(time.time()))
        signed_payload = f"{timestamp}.{payload.decode('utf-8')}"
        sig = hmac.new(secret.encode("utf-8"), signed_payload.encode("utf-8"), hashlib.sha256).hexdigest()
        sig_header = f"t={timestamp},v1={sig}"

        with patch("app.modules.billing.stripe_client.settings") as mock_settings:
            mock_settings.STRIPE_WEBHOOK_SECRET = secret
            assert verify_webhook_signature(payload, sig_header) is True

    def test_invalid_signature_rejects(self):
        payload = b'{"id":"evt_123"}'
        sig_header = "t=12345,v1=invalid_signature_here"

        with patch("app.modules.billing.stripe_client.settings") as mock_settings:
            mock_settings.STRIPE_WEBHOOK_SECRET = "whsec_test"
            assert verify_webhook_signature(payload, sig_header) is False

    def test_missing_secret_rejects(self):
        payload = b'{"id":"evt_123"}'
        with patch("app.modules.billing.stripe_client.settings") as mock_settings:
            mock_settings.STRIPE_WEBHOOK_SECRET = ""
            assert verify_webhook_signature(payload, "t=1,v1=x") is False

    def test_missing_sig_header_rejects(self):
        payload = b'{"id":"evt_123"}'
        with patch("app.modules.billing.stripe_client.settings") as mock_settings:
            mock_settings.STRIPE_WEBHOOK_SECRET = "whsec_test"
            assert verify_webhook_signature(payload, "") is False

    def test_old_timestamp_rejects(self):
        secret = "whsec_test"
        payload = b'{"id":"evt_123"}'
        old_timestamp = str(int(time.time()) - 600)  # 10 minutes ago
        signed_payload = f"{old_timestamp}.{payload.decode('utf-8')}"
        sig = hmac.new(secret.encode("utf-8"), signed_payload.encode("utf-8"), hashlib.sha256).hexdigest()
        sig_header = f"t={old_timestamp},v1={sig}"

        with patch("app.modules.billing.stripe_client.settings") as mock_settings:
            mock_settings.STRIPE_WEBHOOK_SECRET = secret
            assert verify_webhook_signature(payload, sig_header) is False


# ═════════════════════════════════════════════════════════════════════════════
# Event Inbox Replay Protection
# ═════════════════════════════════════════════════════════════════════════════

class TestEventInboxReplay:
    def test_first_event_processed_second_is_skipped(self, db):
        """Same event ID sent twice → exactly one state transition."""
        _create_org_and_subscription(db, org_id=1)
        _create_plan(db)

        event = {
            "id": "evt_replay_test_001",
            "type": "invoice.payment_failed",
            "data": {
                "object": {
                    "id": "inv_x",
                    "customer": None,
                    "subscription": None,
                    "amount_due": 1000,
                    "amount_paid": 0,
                    "currency": "usd",
                    "status": "open",
                }
            },
        }

        with patch("app.modules.billing.webhook_service.retrieve_subscription", side_effect=Exception("should not be called")):
            result1 = process_webhook_event(db, event)
            assert result1["status"] == "ok"

            result2 = process_webhook_event(db, event)
            assert result2["status"] == "skipped"

        # Exactly one webhook event row
        count = db.query(BillingWebhookEvent).filter(
            BillingWebhookEvent.stripe_event_id == "evt_replay_test_001"
        ).count()
        assert count == 1

    def test_duplicate_event_id_no_double_state_change(self, db):
        """Sending invoice.payment_failed twice must not set status to past_due twice
        (i.e., the subscription status must only change once)."""
        sub = _create_org_and_subscription(db, org_id=2)

        event = {
            "id": "evt_dupe_001",
            "type": "invoice.payment_failed",
            "data": {"object": {"id": "inv_y", "customer": None, "subscription": None,
                                "amount_due": 1000, "amount_paid": 0, "currency": "usd", "status": "open"}},
        }

        result1 = process_webhook_event(db, event)
        assert result1["status"] == "ok"
        db.refresh(sub)
        first_status = sub.status

        result2 = process_webhook_event(db, event)
        assert result2["status"] == "skipped"
        db.refresh(sub)
        assert sub.status == first_status  # no double transition


# ═════════════════════════════════════════════════════════════════════════════
# Webhook Event Handlers
# ═════════════════════════════════════════════════════════════════════════════

class TestCheckoutCompleted:
    def test_checkout_completed_creates_provider_ref_and_activates(self, db):
        _create_org_and_subscription(db, org_id=1)
        _create_plan(db)
        event = _load_fixture("checkout_completed")

        with patch("app.modules.billing.webhook_service.retrieve_subscription") as mock_ret:
            mock_ret.return_value = {
                "id": "sub_test_subscription_123",
                "status": "active",
                "current_period_start": 1725000000,
                "current_period_end": 1727678400,
                "cancel_at_period_end": False,
                "items": [{"price_id": "price_test_monthly", "quantity": 5}],
            }
            result = process_webhook_event(db, event)

        assert result["status"] == "ok"

        # Provider ref created
        ref = db.query(ProviderRef).filter(ProviderRef.organization_id == 1).first()
        assert ref is not None
        assert ref.stripe_customer_id == "cus_test_customer_123"
        assert ref.stripe_subscription_id == "sub_test_subscription_123"

        # Subscription activated
        sub = db.query(BillingSubscription).filter(BillingSubscription.organization_id == 1).first()
        assert sub.status == SubscriptionStatus.ACTIVE
        assert sub.quantity == 5

        # Audit log written with webhook source
        audit = db.query(BillingAuditLog).filter(
            BillingAuditLog.organization_id == 1,
            BillingAuditLog.action == BillingAuditAction.SUBSCRIPTION_ACTIVATED,
        ).first()
        assert audit is not None
        assert audit.source == "stripe_webhook"
        assert audit.stripe_event_id == "evt_test_checkout_completed"


class TestSubscriptionUpdated:
    def test_subscription_updated_syncs_status(self, db):
        _create_org_and_subscription(db, org_id=1)
        # Create provider ref first
        ref = ProviderRef(organization_id=1, stripe_subscription_id="sub_test_subscription_123")
        db.add(ref)
        db.commit()

        event = _load_fixture("subscription_updated")
        result = process_webhook_event(db, event)

        assert result["status"] == "ok"
        sub = db.query(BillingSubscription).filter(BillingSubscription.organization_id == 1).first()
        assert sub.status == SubscriptionStatus.ACTIVE
        assert sub.quantity == 10


class TestSubscriptionDeleted:
    def test_subscription_deleted_marks_canceled(self, db):
        _create_org_and_subscription(db, org_id=1)
        ref = ProviderRef(organization_id=1, stripe_subscription_id="sub_test_subscription_123")
        db.add(ref)
        db.commit()

        event = _load_fixture("subscription_deleted")
        result = process_webhook_event(db, event)

        assert result["status"] == "ok"
        sub = db.query(BillingSubscription).filter(BillingSubscription.organization_id == 1).first()
        assert sub.status == SubscriptionStatus.CANCELED


class TestInvoicePaid:
    def test_invoice_paid_records_invoice_and_activates_past_due(self, db):
        _create_org_and_subscription(db, org_id=1)
        sub = db.query(BillingSubscription).filter(BillingSubscription.organization_id == 1).first()
        sub.status = SubscriptionStatus.PAST_DUE
        db.commit()

        ref = ProviderRef(organization_id=1, stripe_subscription_id="sub_test_subscription_123")
        db.add(ref)
        db.commit()

        event = _load_fixture("invoice_paid")
        result = process_webhook_event(db, event)

        assert result["status"] == "ok"
        db.refresh(sub)
        assert sub.status == SubscriptionStatus.ACTIVE

        inv = db.query(BillingInvoice).filter(BillingInvoice.stripe_invoice_id == "inv_test_invoice_123").first()
        assert inv is not None
        assert inv.amount_paid_cents == 10000
        assert inv.status == "paid"


class TestInvoicePaymentFailed:
    def test_payment_failed_sets_past_due(self, db):
        _create_org_and_subscription(db, org_id=1)
        ref = ProviderRef(organization_id=1, stripe_subscription_id="sub_test_subscription_123")
        db.add(ref)
        db.commit()

        event = _load_fixture("invoice_payment_failed")
        result = process_webhook_event(db, event)

        assert result["status"] == "ok"
        sub = db.query(BillingSubscription).filter(BillingSubscription.organization_id == 1).first()
        assert sub.status == SubscriptionStatus.PAST_DUE


class TestUnhandledEvent:
    def test_unhandled_event_type_logged_not_dropped(self, db):
        event = {
            "id": "evt_unhandled_001",
            "type": "some.future.event_type",
            "data": {"object": {}},
        }
        result = process_webhook_event(db, event)

        assert result["status"] == "ok"
        audit = db.query(BillingAuditLog).filter(
            BillingAuditLog.action == BillingAuditAction.WEBHOOK_UNHANDLED,
            BillingAuditLog.stripe_event_id == "evt_unhandled_001",
        ).first()
        assert audit is not None
        assert audit.after["event_type"] == "some.future.event_type"


class TestMalformedEvent:
    def test_missing_event_id_returns_error(self, db):
        result = process_webhook_event(db, {"type": "test"})
        assert result["status"] == "error"

    def test_missing_event_type_returns_error(self, db):
        result = process_webhook_event(db, {"id": "evt_x"})
        assert result["status"] == "error"


# ═════════════════════════════════════════════════════════════════════════════
# Idempotency
# ═════════════════════════════════════════════════════════════════════════════

class TestIdempotency:
    def test_first_call_executes_handler(self, db):
        call_count = [0]
        def handler():
            call_count[0] += 1
            return {"ok": True}, 200

        result, status, is_replay = execute_idempotent(
            db, "key-001", 1, "checkout-session", {"plan": 1}, handler,
        )
        assert is_replay is False
        assert call_count[0] == 1
        assert result["ok"] is True

    def test_same_key_same_body_returns_stored_result(self, db):
        def handler():
            return {"ok": True}, 200

        execute_idempotent(db, "key-002", 1, "checkout-session", {"plan": 1}, handler)
        result, status, is_replay = execute_idempotent(
            db, "key-002", 1, "checkout-session", {"plan": 1}, handler,
        )
        assert is_replay is True
        assert result["ok"] is True

    def test_same_key_different_body_returns_409(self, db):
        from fastapi import HTTPException

        def handler():
            return {"ok": True}, 200

        execute_idempotent(db, "key-003", 1, "checkout-session", {"plan": 1}, handler)

        with pytest.raises(HTTPException) as exc_info:
            execute_idempotent(db, "key-003", 1, "checkout-session", {"plan": 2}, handler)
        assert exc_info.value.status_code == 409

    def test_different_key_same_body_executes_fresh(self, db):
        call_count = [0]
        def handler():
            call_count[0] += 1
            return {"count": call_count[0]}, 200

        r1, _, _ = execute_idempotent(db, "key-a", 1, "checkout-session", {"plan": 1}, handler)
        r2, _, _ = execute_idempotent(db, "key-b", 1, "checkout-session", {"plan": 1}, handler)
        assert r1["count"] == 1
        assert r2["count"] == 2

    def test_different_org_same_key_independent(self, db):
        def handler():
            return {"ok": True}, 200

        r1, _, _ = execute_idempotent(db, "key-org", 1, "checkout-session", {}, handler)
        r2, _, _ = execute_idempotent(db, "key-org", 2, "checkout-session", {}, handler)
        assert r1["ok"] is True
        assert r2["ok"] is True

    def test_body_hash_deterministic(self):
        body1 = {"a": 1, "b": "x"}
        body2 = {"b": "x", "a": 1}  # same content, different key order
        assert _hash_body(body1) == _hash_body(body2)

    def test_different_bodies_different_hash(self):
        assert _hash_body({"a": 1}) != _hash_body({"a": 2})


# ═════════════════════════════════════════════════════════════════════════════
# Reconciliation
# ═════════════════════════════════════════════════════════════════════════════

class TestReconciliation:
    def test_matching_state_no_case_opened(self, db):
        sub = _create_org_and_subscription(db, org_id=1)
        sub.status = SubscriptionStatus.ACTIVE
        ref = ProviderRef(organization_id=1, stripe_subscription_id="sub_match_001")
        db.add(ref)
        db.commit()

        with patch("app.modules.billing.reconciliation_service.retrieve_subscription") as mock_ret:
            mock_ret.return_value = {
                "id": "sub_match_001",
                "status": "active",
                "items": [{"price_id": "price_x", "quantity": 5}],
            }
            result = reconcile_org(db, organization_id=1)

        assert result["matched"] is True
        assert result["case_id"] is None

    def test_status_mismatch_opens_case_not_auto_fix(self, db):
        sub = _create_org_and_subscription(db, org_id=2)
        sub.status = SubscriptionStatus.ACTIVE
        ref = ProviderRef(organization_id=2, stripe_subscription_id="sub_mismatch_001")
        db.add(ref)
        db.commit()

        with patch("app.modules.billing.reconciliation_service.retrieve_subscription") as mock_ret:
            mock_ret.return_value = {
                "id": "sub_mismatch_001",
                "status": "past_due",
                "items": [{"price_id": "price_x", "quantity": 5}],
            }
            result = reconcile_org(db, organization_id=2)

        assert result["matched"] is False
        assert result["case_id"] is not None
        case = db.query(BillingReconciliationCase).filter(
            BillingReconciliationCase.id == result["case_id"]
        ).first()
        assert case.status == ReconciliationCaseStatus.OPEN
        assert case.reason in (ReconciliationCaseReason.STATUS_MISMATCH, ReconciliationCaseReason.BILLING_COUNT_DISCREPANCY)

        # Verify local subscription was NOT auto-overwritten
        db.refresh(sub)
        assert sub.status == SubscriptionStatus.ACTIVE

    def test_quantity_mismatch_opens_case(self, db):
        sub = _create_org_and_subscription(db, org_id=3)
        sub.status = SubscriptionStatus.ACTIVE
        sub.quantity = 10
        ref = ProviderRef(organization_id=3, stripe_subscription_id="sub_qty_001")
        db.add(ref)
        db.commit()

        with patch("app.modules.billing.reconciliation_service.retrieve_subscription") as mock_ret:
            mock_ret.return_value = {
                "id": "sub_qty_001",
                "status": "active",
                "items": [{"price_id": "price_x", "quantity": 25}],
            }
            result = reconcile_org(db, organization_id=3)

        assert result["matched"] is False
        assert "quantity" in result["diffs"][0]

    def test_missing_provider_ref_opens_case(self, db):
        _create_org_and_subscription(db, org_id=4)
        result = reconcile_org(db, organization_id=4)

        assert result["matched"] is False
        case = db.query(BillingReconciliationCase).filter(
            BillingReconciliationCase.organization_id == 4
        ).first()
        assert case is not None
        assert case.reason == ReconciliationCaseReason.MISSING_PROVIDER_REF

    def test_stripe_fetch_error_returns_diff(self, db):
        _create_org_and_subscription(db, org_id=5)
        ref = ProviderRef(organization_id=5, stripe_subscription_id="sub_err")
        db.add(ref)
        db.commit()

        with patch("app.modules.billing.reconciliation_service.retrieve_subscription", side_effect=Exception("network error")):
            result = reconcile_org(db, organization_id=5)

        assert result["matched"] is False
        assert any("stripe_fetch_error" in d for d in result["diffs"])
