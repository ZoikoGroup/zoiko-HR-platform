"""
tests/test_command_center_attention.py
----------------------------------------
Task 2 (Command Center "Needs Your Attention"): an evaluation expiring within
2 days must appear as a leading-indicator attention item — before it lapses,
not just after (customer_health()'s existing lagging indicator is untouched
and covered separately).
"""

from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.modules.billing import service as billing_service
from app.modules.super_admin.command_center_router import _compute_attention


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    engine.dispose()


def _org(db, org_id: int):
    from app.modules.hr.models import Organization, OrganizationStatus
    org = Organization(id=org_id, name=f"Org {org_id}", status=OrganizationStatus.APPROVED)
    db.add(org)
    db.flush()
    return org


class TestEvaluationExpiringAttention:
    def test_evaluation_within_1_day_is_high_severity(self, db):
        _org(db, 1)
        billing_service.start_evaluation(
            db, organization_id=1, evaluation_ends_at=datetime.utcnow() + timedelta(hours=12),
        )

        items = _compute_attention(db)
        matches = [i for i in items if i.issue == "Evaluation expiring without conversion" and i.organization_id == 1]
        assert len(matches) == 1
        assert matches[0].severity == "high"

    def test_evaluation_between_1_and_2_days_is_medium_severity(self, db):
        _org(db, 2)
        billing_service.start_evaluation(
            db, organization_id=2, evaluation_ends_at=datetime.utcnow() + timedelta(days=1, hours=12),
        )

        items = _compute_attention(db)
        matches = [i for i in items if i.issue == "Evaluation expiring without conversion" and i.organization_id == 2]
        assert len(matches) == 1
        assert matches[0].severity == "medium"

    def test_evaluation_beyond_2_days_is_not_surfaced(self, db):
        _org(db, 3)
        billing_service.start_evaluation(
            db, organization_id=3, evaluation_ends_at=datetime.utcnow() + timedelta(days=5),
        )

        items = _compute_attention(db)
        matches = [i for i in items if i.issue == "Evaluation expiring without conversion" and i.organization_id == 3]
        assert matches == []

    def test_converted_evaluation_is_not_surfaced(self, db):
        """status == ACTIVE alone excludes converted evaluations — convert_evaluation
        always flips status away from ACTIVE — so no separate BillingConversion
        join is needed to filter out an evaluation mid-conversion."""
        from app.modules.billing.models import PlanCode, BillingMetric, TaxCategory, BillingPlan, BillingCycle

        _org(db, 4)
        evaluation = billing_service.start_evaluation(
            db, organization_id=4, evaluation_ends_at=datetime.utcnow() + timedelta(hours=6),
        )
        plan = BillingPlan(
            code=PlanCode.CORE, name="Core", catalog_version="ZHR-COM-BILL-001-v1",
            billing_metric=BillingMetric.ACTIVE_WORKFORCE, is_active=True, is_contract_priced=False,
            monthly_price=10.00, annual_price=100.00, currency="USD",
            tax_category=TaxCategory.SAAS_SUBSCRIPTION,
        )
        db.add(plan)
        db.commit()
        db.refresh(plan)
        billing_service.convert_evaluation(
            db, evaluation_id=evaluation.id, plan_id=plan.id, billing_cycle=BillingCycle.MONTHLY,
            quantity_basis="test", commercial_effective_at=datetime.utcnow(), approver="tester",
        )

        items = _compute_attention(db)
        matches = [i for i in items if i.issue == "Evaluation expiring without conversion" and i.organization_id == 4]
        assert matches == []
