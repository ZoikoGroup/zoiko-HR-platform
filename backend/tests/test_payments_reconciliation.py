import pytest
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.modules.billing.models import (
    BillingWebhookEvent,
    BillingReconciliationCase,
    ReconciliationCaseReason,
    ReconciliationCaseStatus,
)
from app.modules.billing import reconciliation_service, webhook_service


@pytest.fixture
def db():
    """Isolated in-memory SQLite session for tests."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def test_reconciliation_cases_service(db):
    """Test creating, listing, and resolving reconciliation cases."""
    case1 = BillingReconciliationCase(
        organization_id=1,
        reason=ReconciliationCaseReason.STATUS_MISMATCH,
        status=ReconciliationCaseStatus.OPEN,
        local_snapshot={"status": "active"},
        stripe_snapshot={"status": "canceled"},
        notes="Status mismatch test",
        opened_by="test_admin@example.com",
    )
    case2 = BillingReconciliationCase(
        organization_id=2,
        reason=ReconciliationCaseReason.BILLING_COUNT_DISCREPANCY,
        status=ReconciliationCaseStatus.RESOLVED,
        local_snapshot={"quantity": 10},
        stripe_snapshot={"quantity": 5},
        notes="Quantity mismatch resolved",
        opened_by="system",
        resolved_by="admin@example.com",
        resolved_at=datetime.utcnow(),
    )
    db.add_all([case1, case2])
    db.commit()

    # Query all
    cases, total = reconciliation_service.list_reconciliation_cases(db)
    assert total == 2
    assert len(cases) == 2

    # Query by status
    open_cases, open_total = reconciliation_service.list_reconciliation_cases(db, status="open")
    assert open_total == 1
    assert open_cases[0]["organization_id"] == 1

    # Resolve case 1
    resolved = reconciliation_service.resolve_reconciliation_case(
        db, case_id=case1.id, resolved_by="super_admin@example.com", notes="Manually synced with Stripe"
    )
    assert resolved.status == ReconciliationCaseStatus.RESOLVED
    assert resolved.resolved_by == "super_admin@example.com"
    assert "Manually synced" in resolved.notes


def test_webhook_event_replay_service(db):
    """Test replaying a saved webhook event from the inbox."""
    ev = BillingWebhookEvent(
        stripe_event_id="evt_test_replay_101",
        event_type="unhandled.test.event",
        processed=False,
        error_message="Simulated error",
        payload={"id": "evt_test_replay_101", "type": "unhandled.test.event", "data": {}},
        created_at=datetime.utcnow(),
    )
    db.add(ev)
    db.commit()

    result = webhook_service.replay_webhook_event(db, stripe_event_id="evt_test_replay_101", actor="super_admin")
    assert result["status"] == "ok"
    assert result["event_id"] == "evt_test_replay_101"

    # Verify event state updated in DB
    updated = db.query(BillingWebhookEvent).filter(BillingWebhookEvent.stripe_event_id == "evt_test_replay_101").first()
    assert updated.processed is True
    assert updated.error_message is None
