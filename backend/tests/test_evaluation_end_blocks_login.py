"""
tests/test_evaluation_end_blocks_login.py
------------------------------------------
ZHR-14 regression: ending an evaluation from the super-admin
"Evaluations & Trials" page (POST /billing/evaluations/{id}/end) must revoke
platform access immediately. Previously only *overdue ACTIVE* evaluations were
caught by the login/per-request gates, so a manually ended evaluation left the
org fully usable — the user could still log in.

Fixed behavior pinned here:
  1. An ACTIVE evaluation still allows login (no false positive).
  2. Overdue ACTIVE evaluation blocks login and is flipped to EVALUATION_ENDED.
  3. A super-admin ended evaluation blocks login, and the subscription moves
     to EVALUATION_EXPIRED so entitlements stop resolving.
  4. A converted (paid) org keeps login even though its evaluation is no longer
     ACTIVE.
"""

from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.core.exceptions import UnauthorizedException
from app.modules.employee import service as employee_service
from app.modules.employee.schema import LoginRequest, RegisterRequest
from app.modules.billing import service as billing_service
from app.modules.billing.models import (
    EvaluationStatus,
    OrganizationEvaluation,
    SubscriptionStatus,
    BillingSubscription,
)


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


def _register(db, email: str = "admin@z-test.example", org_name: str = "Z Test Co"):
    data = RegisterRequest(
        name="Zulu Admin",
        email=email,
        password="SecurePass123!",
        organization=org_name,
        plan_code="core",
        billing_cycle="monthly",
    )
    result = employee_service.register_enterprise(db, data)
    return result["organization_id"], data


def _login(db, data) -> dict:
    return employee_service.login_employee(db, LoginRequest(
        email=data.email,
        password=data.password,
    ))


def _get_evaluation(db, org_id) -> OrganizationEvaluation:
    return (
        db.query(OrganizationEvaluation)
        .filter(OrganizationEvaluation.organization_id == org_id)
        .order_by(OrganizationEvaluation.created_at.desc())
        .first()
    )


def test_active_evaluation_still_allows_login(db):
    org_id, data = _register(db)
    assert _login(db, data)["access_token"]
    db.refresh(_get_evaluation(db, org_id))
    assert _get_evaluation(db, org_id).status == EvaluationStatus.ACTIVE


def test_overdue_active_evaluation_blocks_login_and_ends(db):
    org_id, data = _register(db)
    evaluation = _get_evaluation(db, org_id)
    evaluation.evaluation_ends_at = datetime.utcnow() - timedelta(days=1)
    db.commit()

    with pytest.raises(UnauthorizedException):
        _login(db, data)

    db.refresh(evaluation)
    assert evaluation.status == EvaluationStatus.EVALUATION_ENDED
    sub = db.query(BillingSubscription).filter(
        BillingSubscription.organization_id == org_id
    ).first()
    assert sub.status == SubscriptionStatus.EVALUATION_EXPIRED


def test_superadmin_ended_evaluation_blocks_login_and_expires_subscription(db):
    org_id, data = _register(db)
    evaluation = _get_evaluation(db, org_id)
    assert evaluation.status == EvaluationStatus.ACTIVE
    assert _login(db, data)["access_token"]

    billing_service.end_evaluation(db, evaluation.id)

    with pytest.raises(UnauthorizedException):
        _login(db, data)

    sub = db.query(BillingSubscription).filter(
        BillingSubscription.organization_id == org_id
    ).first()
    assert sub.status == SubscriptionStatus.EVALUATION_EXPIRED


def test_converted_org_still_allows_login_after_evaluation_ended(db):
    org_id, data = _register(db)
    evaluation = _get_evaluation(db, org_id)

    sub = db.query(BillingSubscription).filter(
        BillingSubscription.organization_id == org_id
    ).first()
    sub.status = SubscriptionStatus.ACTIVE
    db.commit()
    evaluation.status = EvaluationStatus.CONVERTED
    db.commit()

    assert _login(db, data)["access_token"]


def test_access_gate_helper_reflects_end_and_conversion(db):
    org_id, data = _register(db)
    assert billing_service.evaluation_access_block_reason(db, org_id) is None

    billing_service.end_evaluation(db, _get_evaluation(db, org_id).id)
    assert billing_service.evaluation_access_block_reason(db, org_id) is not None