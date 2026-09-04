"""
tests/test_plan_change.py
--------------------------
Tests for Prompt 4 plan-change engine:
  - Preview with entitlement delta
  - 7-category blocker detection
  - Schedule with blocker snapshot
  - Cancel scheduled change
  - Execute due changes (scheduler job)
  - Refund request / approve / reject / same-actor rejection
"""

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.modules.hr.models import Organization, OrganizationStatus
from app.modules.billing.models import (
    BillingPlan,
    BillingPlanChange,
    BillingRefundRequest,
    BillingSubscription,
    PlanChangeStatus,
    PlanChangeType,
    RefundRequestStatus,
    RefundRequestType,
    SubscriptionStatus,
    BillingClassification,
    BillingCycle,
    BillingMetric,
    PlanCode,
    TaxCategory,
)
from app.modules.billing.plan_change_service import (
    preview_plan_change,
    schedule_plan_change,
    cancel_plan_change,
    execute_due_changes,
)
from app.modules.billing.refund_service import (
    request_refund,
    approve_refund,
    reject_refund,
)
from app.modules.billing.downgrade_blockers import (
    detect_all_blockers,
    has_blocking_blockers,
    Blocker,
)
from app.core.exceptions import BadRequestException, NotFoundException, ForbiddenException


# ── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    engine.dispose()


def _create_org(db, org_id=1):
    org = Organization(id=org_id, name=f"Test Org {org_id}", status=OrganizationStatus.ACTIVE)
    db.add(org)
    db.flush()
    return org


def _create_plan(db, code=PlanCode.CORE):
    plan = BillingPlan(
        code=code,
        name=code.value,
        catalog_version="ZHR-COM-BILL-001-v1",
        billing_metric=BillingMetric.ACTIVE_WORKFORCE,
        is_active=True,
        is_contract_priced=False,
        monthly_price=10.00,
        annual_price=100.00,
        currency="USD",
        tax_category=TaxCategory.SAAS_SUBSCRIPTION,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def _create_subscription(db, org_id=1, plan_code=PlanCode.CORE):
    plan = _create_plan(db, plan_code)
    sub = BillingSubscription(
        organization_id=org_id,
        plan_id=plan.id,
        plan_code=plan_code,
        billing_classification=BillingClassification.COMMERCIAL,
        status=SubscriptionStatus.ACTIVE,
        billing_cycle=BillingCycle.MONTHLY,
        renewal_anchor_date=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=30),
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub, plan


# ═════════════════════════════════════════════════════════════════════════════
# Preview Tests
# ═════════════════════════════════════════════════════════════════════════════

class TestPlanChangePreview:
    @patch("app.modules.billing.plan_change_service.detect_all_blockers", return_value=[])
    def test_preview_same_plan_raises(self, mock_blockers, db):
        _create_org(db)
        sub, plan = _create_subscription(db)
        with pytest.raises(BadRequestException):
            preview_plan_change(db, 1, plan.id)

    @patch("app.modules.billing.plan_change_service.detect_all_blockers", return_value=[])
    def test_preview_returns_entitlement_delta(self, mock_blockers, db):
        _create_org(db)
        sub, current_plan = _create_subscription(db)
        target_plan = _create_plan(db, PlanCode.ENTERPRISE)
        result = preview_plan_change(db, 1, target_plan.id)
        assert "entitlement_delta" in result
        assert "gained" in result["entitlement_delta"]
        assert "lost" in result["entitlement_delta"]

    @patch("app.modules.billing.plan_change_service.detect_all_blockers", return_value=[])
    def test_preview_no_blockers_eligible(self, mock_blockers, db):
        _create_org(db)
        sub, current_plan = _create_subscription(db)
        target_plan = _create_plan(db, PlanCode.ENTERPRISE)
        result = preview_plan_change(db, 1, target_plan.id)
        assert result["eligible"] is True
        assert result["blockers"] == []

    @patch("app.modules.billing.plan_change_service.detect_all_blockers")
    def test_preview_with_blockers_not_eligible(self, mock_blockers, db):
        _create_org(db)
        sub, current_plan = _create_subscription(db)
        target_plan = _create_plan(db, PlanCode.ENTERPRISE)
        mock_blockers.return_value = [
            Blocker(category="sso", feature_key="hr.identity.sso",
                    message="Active SSO integration", severity="blocking"),
        ]
        result = preview_plan_change(db, 1, target_plan.id)
        assert result["eligible"] is False
        assert len(result["blockers"]) == 1

    @patch("app.modules.billing.plan_change_service.detect_all_blockers", return_value=[])
    def test_preview_nonexistent_plan_raises(self, mock_blockers, db):
        _create_org(db)
        _create_subscription(db)
        with pytest.raises(NotFoundException):
            preview_plan_change(db, 1, 9999)

    @patch("app.modules.billing.plan_change_service.detect_all_blockers", return_value=[])
    def test_preview_no_subscription_raises(self, mock_blockers, db):
        _create_org(db)
        target_plan = _create_plan(db, PlanCode.ENTERPRISE)
        with pytest.raises(NotFoundException):
            preview_plan_change(db, 1, target_plan.id)


# ═════════════════════════════════════════════════════════════════════════════
# Schedule Tests
# ═════════════════════════════════════════════════════════════════════════════

class TestPlanChangeSchedule:
    @patch("app.modules.billing.plan_change_service.detect_all_blockers", return_value=[])
    def test_schedule_creates_plan_change(self, mock_blockers, db):
        _create_org(db)
        sub, current_plan = _create_subscription(db)
        target_plan = _create_plan(db, PlanCode.ENTERPRISE)
        change = schedule_plan_change(db, 1, target_plan.id, BillingCycle.MONTHLY)
        assert change.id is not None
        assert change.status == PlanChangeStatus.SCHEDULED

    @patch("app.modules.billing.plan_change_service.detect_all_blockers")
    def test_schedule_blocks_when_blockers_present(self, mock_blockers, db):
        _create_org(db)
        sub, current_plan = _create_subscription(db)
        target_plan = _create_plan(db, PlanCode.ENTERPRISE)
        mock_blockers.return_value = [
            Blocker(category="sso", feature_key="hr.identity.sso",
                    message="Active SSO", severity="blocking"),
        ]
        change = schedule_plan_change(db, 1, target_plan.id, BillingCycle.MONTHLY)
        assert change.status == PlanChangeStatus.BLOCKED

    @patch("app.modules.billing.plan_change_service.detect_all_blockers", return_value=[])
    def test_schedule_same_plan_raises(self, mock_blockers, db):
        _create_org(db)
        sub, plan = _create_subscription(db)
        with pytest.raises(BadRequestException):
            schedule_plan_change(db, 1, plan.id, BillingCycle.MONTHLY)

    @patch("app.modules.billing.plan_change_service.detect_all_blockers", return_value=[])
    def test_schedule_records_requester(self, mock_blockers, db):
        _create_org(db)
        sub, current_plan = _create_subscription(db)
        target_plan = _create_plan(db, PlanCode.ENTERPRISE)
        change = schedule_plan_change(db, 1, target_plan.id, BillingCycle.MONTHLY, requested_by="admin@test.com")
        assert change.requested_by == "admin@test.com"

    @patch("app.modules.billing.plan_change_service.detect_all_blockers", return_value=[])
    def test_schedule_downgrade_defaults_to_renewal_date(self, mock_blockers, db):
        _create_org(db)
        sub, current_plan = _create_subscription(db, plan_code=PlanCode.ENTERPRISE)
        target_plan = _create_plan(db, PlanCode.CORE)
        change = schedule_plan_change(db, 1, target_plan.id, BillingCycle.MONTHLY)
        assert change.effective_at.date() == sub.renewal_anchor_date.date()


# ═════════════════════════════════════════════════════════════════════════════
# Cancel Tests
# ═════════════════════════════════════════════════════════════════════════════

class TestPlanChangeCancel:
    @patch("app.modules.billing.plan_change_service.detect_all_blockers", return_value=[])
    def test_cancel_scheduled_change(self, mock_blockers, db):
        _create_org(db)
        sub, current_plan = _create_subscription(db)
        target_plan = _create_plan(db, PlanCode.ENTERPRISE)
        change = schedule_plan_change(db, 1, target_plan.id, BillingCycle.MONTHLY)
        canceled = cancel_plan_change(db, change.id, cancel_reason="Changed mind")
        assert canceled.status == PlanChangeStatus.CANCELED
        assert canceled.cancel_reason == "Changed mind"

    @patch("app.modules.billing.plan_change_service.detect_all_blockers")
    def test_cancel_blocked_change(self, mock_blockers, db):
        _create_org(db)
        sub, current_plan = _create_subscription(db)
        target_plan = _create_plan(db, PlanCode.ENTERPRISE)
        mock_blockers.return_value = [
            Blocker(category="sso", feature_key="hr.identity.sso",
                    message="Active SSO", severity="blocking"),
        ]
        change = schedule_plan_change(db, 1, target_plan.id, BillingCycle.MONTHLY)
        assert change.status == PlanChangeStatus.BLOCKED
        canceled = cancel_plan_change(db, change.id)
        assert canceled.status == PlanChangeStatus.CANCELED

    @patch("app.modules.billing.plan_change_service.detect_all_blockers", return_value=[])
    def test_cancel_executed_change_raises(self, mock_blockers, db):
        _create_org(db)
        sub, current_plan = _create_subscription(db)
        target_plan = _create_plan(db, PlanCode.ENTERPRISE)
        change = schedule_plan_change(db, 1, target_plan.id, BillingCycle.MONTHLY)
        change.status = PlanChangeStatus.EXECUTED
        db.commit()
        with pytest.raises(BadRequestException):
            cancel_plan_change(db, change.id)

    def test_cancel_nonexistent_raises(self, db):
        with pytest.raises(NotFoundException):
            cancel_plan_change(db, 9999)


# ═════════════════════════════════════════════════════════════════════════════
# Execute Due Changes (Scheduler Job) Tests
# ═════════════════════════════════════════════════════════════════════════════

class TestExecuteDueChanges:
    @patch("app.modules.billing.plan_change_service.detect_all_blockers", return_value=[])
    def test_execute_due_changes_executes(self, mock_blockers, db):
        _create_org(db)
        sub, current_plan = _create_subscription(db)
        target_plan = _create_plan(db, PlanCode.ENTERPRISE)
        change = schedule_plan_change(db, 1, target_plan.id, BillingCycle.MONTHLY)
        change.effective_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=1)
        db.commit()

        result = execute_due_changes(db)
        assert result["executed"] == 1
        db.refresh(change)
        assert change.status == PlanChangeStatus.EXECUTED

    @patch("app.modules.billing.plan_change_service.detect_all_blockers")
    def test_execute_due_changes_rechecks_blockers(self, mock_blockers, db):
        _create_org(db)
        sub, current_plan = _create_subscription(db)
        target_plan = _create_plan(db, PlanCode.ENTERPRISE)

        mock_blockers.return_value = []
        change = schedule_plan_change(db, 1, target_plan.id, BillingCycle.MONTHLY)

        change.effective_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=1)
        db.commit()

        mock_blockers.return_value = [
            Blocker(category="sso", feature_key="hr.identity.sso",
                    message="Still active", severity="blocking"),
        ]
        result = execute_due_changes(db)
        assert result["blocked"] == 1
        db.refresh(change)
        assert change.status == PlanChangeStatus.BLOCKED

    @patch("app.modules.billing.plan_change_service.detect_all_blockers", return_value=[])
    def test_execute_no_due_changes(self, mock_blockers, db):
        result = execute_due_changes(db)
        assert result["total_due"] == 0
        assert result["executed"] == 0

    @patch("app.modules.billing.plan_change_service.detect_all_blockers", return_value=[])
    def test_execute_updates_subscription_plan(self, mock_blockers, db):
        _create_org(db)
        sub, current_plan = _create_subscription(db)
        target_plan = _create_plan(db, PlanCode.ENTERPRISE)
        change = schedule_plan_change(db, 1, target_plan.id, BillingCycle.MONTHLY)
        change.effective_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=1)
        db.commit()

        execute_due_changes(db)
        db.refresh(sub)
        assert sub.plan_id == target_plan.id
        assert sub.plan_code == PlanCode.ENTERPRISE


# ═════════════════════════════════════════════════════════════════════════════
# Blocker Detection Tests
# ═════════════════════════════════════════════════════════════════════════════

class TestBlockerDetection:
    @patch("app.modules.billing.downgrade_blockers.check_entitlement")
    def test_no_blockers_when_no_entitlements(self, mock_check, db):
        _create_org(db)
        _create_subscription(db)
        target_plan = _create_plan(db, PlanCode.ENTERPRISE)
        mock_check.return_value = {"state": "NOT_ENTITLED"}
        blockers = detect_all_blockers(db, 1, target_plan.code.value)
        assert blockers == []

    def test_has_blocking_blockers_true(self):
        blockers = [
            Blocker(category="sso", feature_key="hr.identity.sso",
                    message="SSO active", severity="blocking"),
        ]
        assert has_blocking_blockers(blockers) is True

    def test_has_blocking_blockers_false_for_warnings(self):
        blockers = [
            Blocker(category="sso", feature_key="hr.identity.sso",
                    message="SSO active", severity="warning"),
        ]
        assert has_blocking_blockers(blockers) is False

    def test_has_blocking_blockers_false_empty(self):
        assert has_blocking_blockers([]) is False


# ═════════════════════════════════════════════════════════════════════════════
# Refund Request Tests
# ═════════════════════════════════════════════════════════════════════════════

class TestRefundRequest:
    def test_request_creates_refund(self, db):
        _create_org(db)
        _create_subscription(db)
        req = request_refund(db, 1, 5000, "Test refund")
        assert req.id is not None
        assert req.status == RefundRequestStatus.PENDING_APPROVAL
        assert req.amount_cents == 5000

    def test_request_zero_amount_raises(self, db):
        _create_org(db)
        _create_subscription(db)
        with pytest.raises(BadRequestException):
            request_refund(db, 1, 0, "Zero refund")

    def test_request_empty_reason_raises(self, db):
        _create_org(db)
        _create_subscription(db)
        with pytest.raises(BadRequestException):
            request_refund(db, 1, 5000, "")

    def test_request_no_subscription_raises(self, db):
        _create_org(db)
        with pytest.raises(NotFoundException):
            request_refund(db, 1, 5000, "No sub")


# ═════════════════════════════════════════════════════════════════════════════
# Refund Approve / Reject Tests
# ═════════════════════════════════════════════════════════════════════════════

class TestRefundApproval:
    def test_approve_sets_status(self, db):
        _create_org(db)
        _create_subscription(db)
        req = request_refund(db, 1, 5000, "Test", requested_by="owner@test.com")
        approved = approve_refund(db, req.id, approved_by="ops@test.com")
        assert approved.status == RefundRequestStatus.APPROVED_AND_PROCESSED
        assert approved.approved_by == "ops@test.com"

    def test_approve_same_actor_rejected(self, db):
        _create_org(db)
        _create_subscription(db)
        req = request_refund(db, 1, 5000, "Test", requested_by="owner@test.com")
        with pytest.raises(ForbiddenException):
            approve_refund(db, req.id, approved_by="owner@test.com")

    def test_approve_non_pending_raises(self, db):
        _create_org(db)
        _create_subscription(db)
        req = request_refund(db, 1, 5000, "Test", requested_by="owner@test.com")
        req.status = RefundRequestStatus.APPROVED_AND_PROCESSED
        db.commit()
        with pytest.raises(BadRequestException):
            approve_refund(db, req.id, approved_by="ops@test.com")

    def test_reject_sets_status(self, db):
        _create_org(db)
        _create_subscription(db)
        req = request_refund(db, 1, 5000, "Test", requested_by="owner@test.com")
        rejected = reject_refund(db, req.id, rejected_by="ops@test.com", rejection_reason="Insufficient docs")
        assert rejected.status == RefundRequestStatus.REJECTED
        assert rejected.rejection_reason == "Insufficient docs"

    def test_reject_non_pending_raises(self, db):
        _create_org(db)
        _create_subscription(db)
        req = request_refund(db, 1, 5000, "Test", requested_by="owner@test.com")
        req.status = RefundRequestStatus.REJECTED
        db.commit()
        with pytest.raises(BadRequestException):
            reject_refund(db, req.id, rejected_by="ops@test.com")


class TestRefundCredit:
    def test_credit_request_type(self, db):
        _create_org(db)
        _create_subscription(db)
        req = request_refund(db, 1, 2500, "Credit adjustment",
                             request_type=RefundRequestType.CREDIT)
        assert req.request_type == RefundRequestType.CREDIT
        assert req.status == RefundRequestStatus.PENDING_APPROVAL
