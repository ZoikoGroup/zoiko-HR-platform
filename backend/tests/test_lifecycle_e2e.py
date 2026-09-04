"""
tests/test_lifecycle_e2e.py
----------------------------
Prompt 6 — end-to-end lifecycle state-machine coverage, timezone-boundary
coverage, and the worker duplicate-import dedup guard.

Runs against the same in-memory sqlite schema as the rest of the suite. It drives
the billing *service* layer directly (these are pure synchronous operations on a
passed-in Session), so there is no HTTP worker-thread involved and the shared
in-memory DB from the `db` fixture is used in one thread only.

Covers the PRD lifecycle:
  evaluation -> conversion -> implementation -> activation
  -> quantity change -> renewal/cancel -> (reactivation via router, HTTP-tested in
     tests/test_billing_me.py)
plus:
  - timezone boundary: subscriptions anchored in a non-UTC billing_timezone
  - worker duplicate-import: a second import sharing an employee email must be
    rejected by the UNIQUE(employees.email) constraint (IntegrityError).
"""

import sys, pathlib
from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine, exc
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from fixtures import tenants
from app.database import Base
from app.modules.billing import service
from app.modules.billing.models import (
    BillingAuditAction,
    BillingConversion,
    BillingCycle,
    BillingMetric,
    BillingPlan,
    DataClassification,
    EvaluationStatus,
    PlanCode,
    SubscriptionStatus,
    TaxCategory,
)
from app.modules.hr.models import Organization, OrganizationStatus


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


def _make_plan(db, code: PlanCode, name: str):
    plan = BillingPlan(
        code=code,
        name=name,
        catalog_version="v1.0.0",
        billing_metric=BillingMetric.ACTIVE_WORKFORCE,
        is_active=True,
        tax_category=TaxCategory.SAAS_SUBSCRIPTION,
        monthly_price=None,
        annual_price=None,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


class _Actor:
    id = 1
    email = "owner@z.test"


def _log(db, org_id, action, entity_type, entity_id, before=None, after=None):
    return service.log_billing_audit(
        db, actor=_Actor(), organization_id=org_id, action=action,
        entity_type=entity_type, entity_id=entity_id,
        before=before, after=after, source="test-lifecycle-e2e",
    )


class TestLifecycleStateMachine:
    def test_evaluation_to_conversion_to_activation(self, db):
        fx = tenants.evaluation_tenant(db)
        plan = _make_plan(db, PlanCode.CORE, "Core Suite")

        # 1. Evaluation starts
        eval_obj = service.start_evaluation(
            db, organization_id=fx.org.id,
            evaluation_ends_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=30),
            approved_package_scope="Core evaluation",
            data_classification=DataClassification.SYNTHETIC,
        )
        assert eval_obj.status == EvaluationStatus.ACTIVE
        _log(db, fx.org.id, BillingAuditAction.EVALUATION_STARTED, "OrganizationEvaluation", eval_obj.id)

        sub = service.get_or_create_subscription(db, fx.org.id)
        assert sub.status == SubscriptionStatus.EVALUATION
        assert sub.billing_classification.value == "evaluation"

        # 2. Evaluation -> conversion -> commercial ACTIVE
        effective = datetime.now(timezone.utc).replace(tzinfo=None)
        conversion = service.convert_evaluation(
            db, evaluation_id=eval_obj.id, plan_id=plan.id,
            billing_cycle=BillingCycle.MONTHLY, quantity_basis="active_workforce",
            commercial_effective_at=effective, approver="owner@z.test",
            order_form_reference="OF-1001",
        )
        _log(db, fx.org.id, BillingAuditAction.EVALUATION_CONVERTED, "BillingConversion", conversion.id)

        assert isinstance(conversion, BillingConversion)
        assert eval_obj.status == EvaluationStatus.CONVERTED
        sub = service.get_or_create_subscription(db, fx.org.id)
        assert sub.status == SubscriptionStatus.ACTIVE
        assert sub.billing_classification.value == "commercial"
        assert sub.plan_code == PlanCode.CORE
        assert sub.service_start_at == effective
        assert sub.renewal_anchor_date == effective

        # 3. Implementation/activation recorded (commercial_effective_at set)
        assert sub.commercial_effective_at == effective

        # 4. Quantity change (implemented as workforce snapshot recompute + field)
        service.recompute_billable_workforce_snapshot(db, fx.org.id)
        sub.quantity = 25
        db.commit()
        _log(db, fx.org.id, BillingAuditAction.WORKFORCE_RECOMPUTED, "BillingSubscription", sub.id)

        # 5. Cancellation scheduled at period end — data retained (no org delete)
        canceled = service.cancel_subscription(db, fx.org.id, reason="vendor migration")
        _log(db, fx.org.id, BillingAuditAction.SUBSCRIPTION_CANCELED, "BillingSubscription", canceled.id)
        assert canceled.status == SubscriptionStatus.CANCEL_AT_PERIOD_END
        assert db.query(Organization).filter(Organization.id == fx.org.id).count() == 1

        # Full audit trail in order
        actions = tenants.audit_action_names(db, fx.org.id)
        assert "evaluation_started" in actions
        assert "evaluation_converted" in actions
        assert "workforce_recomputed" in actions
        assert "subscription_canceled" in actions
        assert actions[-1] == "subscription_canceled"

    def test_upgrade_assigns_new_plan_and_logs(self, db):
        fx = tenants.active_tenant(db)
        core = _make_plan(db, PlanCode.CORE, "Core")
        ent = _make_plan(db, PlanCode.ENTERPRISE, "Enterprise")

        sub = service.upgrade_subscription(
            db, organization_id=fx.org.id, plan_id=ent.id,
            billing_cycle=BillingCycle.ANNUAL, effective_at=datetime.now(timezone.utc).replace(tzinfo=None),
        )
        _log(db, fx.org.id, BillingAuditAction.SUBSCRIPTION_UPGRADED, "BillingSubscription", sub.id)
        assert sub.plan_code == PlanCode.ENTERPRISE
        assert sub.billing_cycle == BillingCycle.ANNUAL
        assert tenants.audit_action_names(db, fx.org.id)[-1] == "subscription_upgraded"

    def test_conversion_rejects_backdated_effective_without_signed_agreement(self, db):
        from app.core.exceptions import BadRequestException
        fx = tenants.evaluation_tenant(db)
        plan = _make_plan(db, PlanCode.CORE, "Core")
        eval_obj = service.start_evaluation(
            db, organization_id=fx.org.id,
            evaluation_ends_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=30),
        )
        backdated = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=45)
        with pytest.raises(BadRequestException):
            service.convert_evaluation(
                db, evaluation_id=eval_obj.id, plan_id=plan.id,
                billing_cycle=BillingCycle.MONTHLY, quantity_basis="active_workforce",
                commercial_effective_at=backdated, approver="owner@z.test",
            )


class TestTimezoneBoundary:
    def test_non_utc_billing_timezone_persisted(self, db):
        # Asia/Kolkata is UTC+5:30 — a half-hour offset boundary that a naive
        # UTC assumption would mishandle.
        fx = tenants.pilot_tenant(db)

        org = fx.org
        org.timezone = "Asia/Kolkata"
        fx.sub.billing_timezone = "Asia/Kolkata"
        db.commit()

        sub = service.get_or_create_subscription(db, fx.org.id)
        assert sub.billing_timezone == "Asia/Kolkata"
        assert org.timezone == "Asia/Kolkata"

    def test_renewal_anchor_no_calendar_drift_across_boundary(self, db):
        import zoneinfo
        fx = tenants.active_tenant(db)
        tz = zoneinfo.ZoneInfo("Asia/Kolkata")  # UTC+5:30 — half-hour boundary

        # Anchor stored at UTC midnight; the naive storage convention means the
        # DB value AND the stored tz string must be honored together. Reading it
        # back must not drift to a different UTC calendar date.
        anchor_utc = datetime(2026, 1, 15, 0, 0, 0)  # naive = UTC midnight
        fx.sub.billing_timezone = "Asia/Kolkata"
        fx.sub.renewal_anchor_date = anchor_utc
        db.commit()

        sub = service.get_or_create_subscription(db, fx.org.id)
        assert sub.billing_timezone == "Asia/Kolkata"
        assert sub.renewal_anchor_date.date() == date(2026, 1, 15)

        # In the org's timezone the same instant is still 2026-01-15 (05:30 IST),
        # i.e. the half-hour offset must not push it across the date boundary.
        aware = anchor_utc.replace(tzinfo=timezone.utc).astimezone(tz)
        assert aware.date() == date(2026, 1, 15)
        assert aware.hour == 5 and aware.minute == 30


class TestDuplicateImportDedup:
    def test_second_import_same_email_raises_integrity_error(self, db):
        from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole

        fx = tenants.duplicate_import_tenant(db)
        original = fx.extra["worker"]

        dup = Employee(
            email=original.email,  # same email -> UNIQUE violation
            hashed_password="x",
            employee_code=f"E-NEW-{fx.org.id}",
            role=UserRole.EMPLOYEE,
            first_name="Second",
            last_name="Import",
            job_title="Engineer",
            employment_type=EmploymentType.FULL_TIME,
            status=EmployeeStatus.ACTIVE,
            date_of_joining=datetime.utcnow().date(),
            organization_id=fx.org.id,
        )
        db.add(dup)
        with pytest.raises(exc.IntegrityError):
            db.commit()
