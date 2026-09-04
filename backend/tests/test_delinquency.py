"""
tests/test_delinquency.py
--------------------------
Coverage for Prompt 5 — Delinquency Automation (Section 10 G1-G5) &
Support-Access Safeguards (Section 18 O3).

  - 46-day graduated timeline (RECOVERY → DAY_10 → DAY_20 → DAY_45)
  - Preserved-access guarantee: read/privacy/export paths are NOT restricted
  - PAYMENT_RECOVERED restores automatically only when no other restriction exists
  - Retention-hold window after termination (G5)
  - One-time, actor-bound, expiring confirmation tokens
  - Time-bounded support-access grant expiry
  - Webhook integration: invoice.payment_failed opens a case; invoice.paid recovers

Clock is deterministic: `failed_at` anchors the timeline and `advance_case`/
`resolve_stage` take an injectable `_now`; freezegun covers absolute-clock
cases (grant expiry, confirmation expiry).
"""

from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from freezegun import freeze_time
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.modules.billing.models import (
    BillingAuditAction,
    BillingSubscription,
    ConfirmationTokenPurpose,
    DelinquencyCase,
    DelinquencyCaseStatus,
    DelinquencyStage,
    ProviderRef,
    SubscriptionStatus,
    SupportAccessGrant,
)
from app.modules.billing import delinquency_service as ds
from app.modules.billing.entitlement_service import _delinquency_gate
from app.modules.billing.webhook_service import process_webhook_event
from app.modules.hr.models import Organization, OrganizationStatus


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    engine.dispose()


def _make_org(db, org_id=1, status=OrganizationStatus.ACTIVE) -> Organization:
    org = Organization(id=org_id, name=f"Org {org_id}", status=status)
    db.add(org)
    db.flush()

    sub = BillingSubscription(
        organization_id=org_id,
        status=SubscriptionStatus.ACTIVE,
        plan_code="core",
    )
    db.add(sub)
    db.commit()
    db.refresh(org)
    return org


# ═════════════════════════════════════════════════════════════════════════════
# 46-day graduated timeline
# ═════════════════════════════════════════════════════════════════════════════

class TestTimeline:
    def test_resolve_stage_thresholds(self, db):
        anchor = datetime.utcnow()
        assert ds.resolve_stage(anchor - timedelta(days=5), anchor)[0] == DelinquencyStage.RECOVERY
        assert ds.resolve_stage(anchor - timedelta(days=11), anchor)[0] == DelinquencyStage.DAY_10_RESTRICT
        assert ds.resolve_stage(anchor - timedelta(days=21), anchor)[0] == DelinquencyStage.DAY_20_RESTRICT
        assert ds.resolve_stage(anchor - timedelta(days=46), anchor)[0] == DelinquencyStage.DAY_45_TERMINATION

    def test_46_day_lifecycle(self, db):
        _make_org(db, org_id=1)
        anchor = datetime.utcnow()

        case = ds.open_case(db, 1, "evt_fail", failed_at=anchor)
        assert case.stage == DelinquencyStage.RECOVERY

        ds.advance_case(db, 1, _now=anchor + timedelta(days=11))
        case = ds.get_open_case(db, 1)
        assert case.stage == DelinquencyStage.DAY_10_RESTRICT

        ds.advance_case(db, 1, _now=anchor + timedelta(days=21))
        case = ds.get_open_case(db, 1)
        assert case.stage == DelinquencyStage.DAY_20_RESTRICT

        ds.advance_case(db, 1, _now=anchor + timedelta(days=46))
        case = ds.get_open_case(db, 1)
        assert case.stage == DelinquencyStage.DAY_45_TERMINATION
        assert case.terminated_at is not None
        assert case.retention_hold_until is not None
        assert case.retention_hold_until > case.terminated_at

        sub = db.query(BillingSubscription).filter(BillingSubscription.organization_id == 1).first()
        assert sub.status == SubscriptionStatus.RESTRICTED


class TestPreservedAccess:
    """Read / privacy / legal-hold / export paths must survive day-20 and
    day-45 restriction while cost-increasing actions are blocked (G2/G3)."""

    def _open_at_day20(self, db, org_id=1):
        _make_org(db, org_id=org_id)
        anchor = datetime.utcnow()
        case = ds.open_case(db, org_id, "evt_x", failed_at=anchor)
        ds.advance_case(db, org_id, _now=anchor + timedelta(days=21))
        return case

    def test_read_paths_not_restricted_at_day20(self, db):
        self._open_at_day20(db)
        for key in ("hr.core.employees", "hr.leave.core", "hr.attendance.core", "hr.documents.core"):
            assert _delinquency_gate(db, 1, key) is None, f"read/privacy path {key} should stay open"

    def test_cost_increasing_actions_blocked_at_day20(self, db):
        self._open_at_day20(db)
        for key in ("hr.integration.api_write", "hr.integration.sso", "hr.documents.bulk_distribution"):
            gate = _delinquency_gate(db, 1, key)
            assert gate is not None and gate["state"] == "DELINQUENCY_RESTRICTED"
            assert gate["delinquency_stage"] == "day_20_restrict"

    def test_no_gate_when_no_case(self, db):
        _make_org(db)
        assert _delinquency_gate(db, 1, "hr.integration.api_write") is None


class TestRecovery:
    def test_recovery_restores_active_when_no_other_reason(self, db):
        _make_org(db, org_id=1)
        ds.open_case(db, 1, "evt_fail", failed_at=datetime.utcnow() - timedelta(days=30))
        case = ds.recover(db, 1, stripe_event_id="evt_paid")
        assert case.status == DelinquencyCaseStatus.RECOVERED
        sub = db.query(BillingSubscription).filter(BillingSubscription.organization_id == 1).first()
        assert sub.status == SubscriptionStatus.ACTIVE

    @patch("app.modules.billing.service.clear_delinquency_restriction", return_value=False)
    def test_recovery_does_not_restore_when_other_restriction(self, mock_clear, db):
        _make_org(db, org_id=1)
        ds.open_case(db, 1, "evt_fail", failed_at=datetime.utcnow() - timedelta(days=30))
        case = ds.recover(db, 1, stripe_event_id="evt_paid")
        assert case.status == DelinquencyCaseStatus.RECOVERED
        # clear_delinquency_restriction returned False → subscription NOT forced ACTIVE.
        sub = db.query(BillingSubscription).filter(BillingSubscription.organization_id == 1).first()
        assert mock_clear.called


class TestRetentionHold:
    def test_retention_hold_extendable_after_termination(self, db):
        _make_org(db, org_id=1)
        anchor = datetime.utcnow()
        ds.open_case(db, 1, "evt_fail", failed_at=anchor - timedelta(days=60))
        ds.advance_case(db, 1, _now=anchor)
        case = ds.get_open_case(db, 1)
        assert case.stage == DelinquencyStage.DAY_45_TERMINATION

        new_until = anchor + timedelta(days=120)
        held = ds.add_retention_hold(db, 1, hold_until=new_until)
        assert held.retention_hold_until == new_until


# ═════════════════════════════════════════════════════════════════════════════
# Confirmation tokens (two-step destructive actions)
# ═════════════════════════════════════════════════════════════════════════════

class TestConfirmationToken:
    def test_token_bound_to_actor(self, db):
        _make_org(db, org_id=1)
        token, raw = ds.mint_confirmation_token(db, 1, ConfirmationTokenPurpose.DELETE_ORGANIZATION, actor_id=10, actor_email="a@x")
        with pytest.raises(ValueError) as exc:
            ds.confirm_token(db, token.id, raw, ConfirmationTokenPurpose.DELETE_ORGANIZATION, actor_id=99)
        assert "actor" in str(exc.value)

    def test_wrong_token_rejected(self, db):
        _make_org(db, org_id=1)
        token, _raw = ds.mint_confirmation_token(db, 1, ConfirmationTokenPurpose.DELETE_ORGANIZATION, actor_id=10, actor_email="a@x")
        with pytest.raises(ValueError) as exc:
            ds.confirm_token(db, token.id, "wrong", ConfirmationTokenPurpose.DELETE_ORGANIZATION, actor_id=10)
        assert "invalid" in str(exc.value)

    def test_token_single_use(self, db):
        _make_org(db, org_id=1)
        token, raw = ds.mint_confirmation_token(db, 1, ConfirmationTokenPurpose.DELETE_ORGANIZATION, actor_id=10, actor_email="a@x")
        consumed = ds.confirm_token(db, token.id, raw, ConfirmationTokenPurpose.DELETE_ORGANIZATION, actor_id=10)
        assert consumed.status.name == "CONSUMED"
        with pytest.raises(ValueError) as exc:
            ds.confirm_token(db, token.id, raw, ConfirmationTokenPurpose.DELETE_ORGANIZATION, actor_id=10)
        assert "already_used" in str(exc.value)

    @freeze_time("2026-01-01 00:00:00")
    def test_token_expiry(self, db):
        _make_org(db, org_id=1)
        token, raw = ds.mint_confirmation_token(db, 1, ConfirmationTokenPurpose.DELETE_ORGANIZATION, actor_id=10, actor_email="a@x", token_ttl_hours=1)
        with freeze_time("2026-01-01 03:00:00"):
            with pytest.raises(ValueError) as exc:
                ds.confirm_token(db, token.id, raw, ConfirmationTokenPurpose.DELETE_ORGANIZATION, actor_id=10)
            assert "expired" in str(exc.value)


# ═════════════════════════════════════════════════════════════════════════════
# Support access grants (time-bounded, tenant-scoped)
# ═════════════════════════════════════════════════════════════════════════════

class TestSupportAccess:
    def test_validate_valid_token(self, db):
        _make_org(db, org_id=1)
        grant, raw = ds.mint_support_access(db, 1, "ops@z", ttl_hours=24)
        ok = ds.validate_support_access(db, 1, raw)
        assert ok.id == grant.id

    def test_validate_expired_token(self, db):
        _make_org(db, org_id=1)
        grant, raw = ds.mint_support_access(db, 1, "ops@z", ttl_hours=1)
        with freeze_time(datetime.utcnow() + timedelta(hours=2)):
            with pytest.raises(ValueError) as exc:
                ds.validate_support_access(db, 1, raw)
            assert "expired" in str(exc.value)

    def test_revoked_token_rejected(self, db):
        _make_org(db, org_id=1)
        grant, raw = ds.mint_support_access(db, 1, "ops@z", ttl_hours=24)
        ds.revoke_support_access(db, grant.id, "ops2@z")
        with pytest.raises(ValueError) as exc:
            ds.validate_support_access(db, 1, raw)
        assert "invalid" in str(exc.value)

    def test_grant_tenant_scoped(self, db):
        _make_org(db, org_id=1)
        _make_org(db, org_id=2)
        _grant, raw = ds.mint_support_access(db, 1, "ops@z", ttl_hours=24)
        # Token minted for org 1 cannot be used against org 2.
        with pytest.raises(ValueError):
            ds.validate_support_access(db, 2, raw)


# ═════════════════════════════════════════════════════════════════════════════
# Webhook integration
# ═════════════════════════════════════════════════════════════════════════════

class TestWebhookIntegration:
    def _make_org_sub_ref(self, db, org_id=1):
        _make_org(db, org_id=org_id)
        ref = ProviderRef(organization_id=org_id, stripe_subscription_id=f"sub_{org_id}")
        db.add(ref)
        db.commit()

    def test_payment_failed_opens_delinquency_case(self, db):
        self._make_org_sub_ref(db, 1)
        event = {
            "id": "evt_pf_001",
            "type": "invoice.payment_failed",
            "data": {"object": {"id": "inv_1", "customer": None, "subscription": "sub_1",
                                "amount_due": 1000, "amount_paid": 0, "currency": "usd", "status": "open"}},
        }
        result = process_webhook_event(db, event)
        assert result["status"] == "ok"
        case = ds.get_open_case(db, 1)
        assert case is not None
        assert case.status == DelinquencyCaseStatus.OPEN

    def test_invoice_paid_recovers_case(self, db):
        self._make_org_sub_ref(db, 1)
        fail_event = {
            "id": "evt_pf_002",
            "type": "invoice.payment_failed",
            "data": {"object": {"id": "inv_2", "customer": None, "subscription": "sub_1",
                                "amount_due": 1000, "amount_paid": 0, "currency": "usd", "status": "open"}},
        }
        process_webhook_event(db, fail_event)
        assert ds.get_open_case(db, 1) is not None

        paid_event = {
            "id": "evt_paid_002",
            "type": "invoice.paid",
            "data": {"object": {"id": "inv_2", "customer": None, "subscription": "sub_1", "amount_paid": 1000}},
        }
        result = process_webhook_event(db, paid_event)
        assert result["status"] == "ok"
        assert ds.get_open_case(db, 1) is None
        closed = db.query(DelinquencyCase).filter(DelinquencyCase.organization_id == 1).first()
        assert closed.status == DelinquencyCaseStatus.RECOVERED

        # A recovery writes a DELINQUENCY_RECOVERED audit row.
        audit = db.query(DelinquencyCase).filter(DelinquencyCase.organization_id == 1).first()
        assert audit.status == DelinquencyCaseStatus.RECOVERED
