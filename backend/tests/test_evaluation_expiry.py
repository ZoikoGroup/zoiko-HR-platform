"""
tests/test_evaluation_expiry.py
--------------------------------
G2 (ZHR-COM-ENT-001 §9): "Ends automatically; no charge." An OrganizationEvaluation
past its evaluation_ends_at must be picked up by service.expire_overdue_evaluations()
(the function the nightly scheduler job calls) and flipped to EVALUATION_ENDED,
with zero Stripe/provider calls made. If the org never converted, its subscription
moves to EVALUATION_EXPIRED.
"""

from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.modules.billing.models import (
    BillingAuditAction,
    BillingAuditLog,
    EvaluationStatus,
    OrganizationEvaluation,
    SubscriptionStatus,
)
from app.modules.billing import service as billing_service


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


class TestExpireOverdueEvaluations:
    def test_overdue_evaluation_flips_to_ended_and_subscription_expires(self, db, monkeypatch):
        _org(db, 1)
        evaluation = billing_service.start_evaluation(
            db, organization_id=1,
            evaluation_ends_at=datetime.utcnow() - timedelta(days=1),  # already overdue
            conversion_owner="owner-1@z.test",
        )

        stripe_calls = []
        monkeypatch.setattr(
            "app.modules.billing.stripe_client.retrieve_subscription",
            lambda *a, **k: stripe_calls.append(a) or {"status": "active"},
        )

        expired = billing_service.expire_overdue_evaluations(db)

        assert len(expired) == 1
        assert expired[0].id == evaluation.id
        assert stripe_calls == []  # never touched Stripe/provider

        db.refresh(evaluation)
        assert evaluation.status == EvaluationStatus.EVALUATION_ENDED

        sub = billing_service.get_or_create_subscription(db, 1)
        assert sub.status == SubscriptionStatus.EVALUATION_EXPIRED

        audit = db.query(BillingAuditLog).filter(
            BillingAuditLog.organization_id == 1,
            BillingAuditLog.action == BillingAuditAction.EVALUATION_ENDED,
        ).first()
        assert audit is not None
        assert audit.reason == "auto_expired"
        assert audit.source == "scheduler"

    def test_future_evaluation_is_not_touched(self, db):
        _org(db, 2)
        evaluation = billing_service.start_evaluation(
            db, organization_id=2,
            evaluation_ends_at=datetime.utcnow() + timedelta(days=5),  # still active
            conversion_owner="owner-2@z.test",
        )

        expired = billing_service.expire_overdue_evaluations(db)

        assert expired == []
        db.refresh(evaluation)
        assert evaluation.status == EvaluationStatus.ACTIVE

    def test_already_converted_evaluation_is_not_touched(self, db):
        """An org that converted before its trial window ran out must not be
        re-processed even though evaluation_ends_at has technically passed —
        the query only ever selects status == ACTIVE."""
        _org(db, 3)
        evaluation = billing_service.start_evaluation(
            db, organization_id=3,
            evaluation_ends_at=datetime.utcnow() - timedelta(days=1),
            conversion_owner="owner-3@z.test",
        )
        evaluation.status = EvaluationStatus.CONVERTED
        db.commit()

        expired = billing_service.expire_overdue_evaluations(db)

        assert expired == []
        db.refresh(evaluation)
        assert evaluation.status == EvaluationStatus.CONVERTED

    def test_subscription_already_active_is_left_alone(self, db):
        """If a conversion somehow left the evaluation ACTIVE (shouldn't happen
        given convert_evaluation flips it to CONVERTED, but guards belt-and-
        braces) the subscription must only move to EVALUATION_EXPIRED when it
        is still SubscriptionStatus.EVALUATION — never overwrite an ACTIVE
        commercial subscription."""
        _org(db, 4)
        evaluation = billing_service.start_evaluation(
            db, organization_id=4,
            evaluation_ends_at=datetime.utcnow() - timedelta(days=1),
            conversion_owner="owner-4@z.test",
        )
        sub = billing_service.get_or_create_subscription(db, 4)
        sub.status = SubscriptionStatus.ACTIVE
        db.commit()

        billing_service.expire_overdue_evaluations(db)

        db.refresh(sub)
        assert sub.status == SubscriptionStatus.ACTIVE

    def test_multiple_overdue_evaluations_across_orgs(self, db):
        _org(db, 5)
        _org(db, 6)
        ev5 = billing_service.start_evaluation(
            db, organization_id=5, evaluation_ends_at=datetime.utcnow() - timedelta(days=2),
        )
        ev6 = billing_service.start_evaluation(
            db, organization_id=6, evaluation_ends_at=datetime.utcnow() - timedelta(hours=1),
        )

        expired = billing_service.expire_overdue_evaluations(db)

        assert {e.id for e in expired} == {ev5.id, ev6.id}
