import pytest
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.modules.billing.models import (
    BillingPlan, BillingInvoice, DelinquencyCase, DelinquencyCaseStatus, DelinquencyStage
)
from app.modules.billing import service
from app.modules.billing import delinquency_service

@pytest.fixture
def db():
    """Isolated in-memory SQLite session."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()

def test_platform_invoices_service(db):
    """Verify list_platform_invoices returns invoices with filters and pagination."""
    inv1 = BillingInvoice(
        organization_id=101,
        stripe_invoice_id="in_test_101",
        amount_due_cents=5000,
        amount_paid_cents=5000,
        currency="USD",
        status="paid",
        created_at=datetime.utcnow()
    )
    inv2 = BillingInvoice(
        organization_id=102,
        stripe_invoice_id="in_test_102",
        amount_due_cents=12000,
        amount_paid_cents=0,
        currency="USD",
        status="open",
        created_at=datetime.utcnow()
    )
    db.add_all([inv1, inv2])
    db.commit()

    # Query all
    items, total = service.list_platform_invoices(db, limit=10)
    assert total == 2
    assert len(items) == 2

    # Filter by status
    paid_items, paid_total = service.list_platform_invoices(db, status="paid", limit=10)
    assert paid_total == 1
    assert paid_items[0]["stripe_invoice_id"] == "in_test_101"

    # Filter by org_id
    org_items, org_total = service.list_platform_invoices(db, organization_id=102, limit=10)
    assert org_total == 1
    assert org_items[0]["stripe_invoice_id"] == "in_test_102"

def test_platform_delinquency_cases_service(db):
    """Verify list_platform_delinquency_cases returns open delinquency cases."""
    case1 = DelinquencyCase(
        organization_id=201,
        status=DelinquencyCaseStatus.OPEN,
        stage=DelinquencyStage.DAY_10_RESTRICT,
        failed_at=datetime.utcnow()
    )
    case2 = DelinquencyCase(
        organization_id=202,
        status=DelinquencyCaseStatus.RECOVERED,
        stage=DelinquencyStage.RECOVERY,
        failed_at=datetime.utcnow()
    )
    db.add_all([case1, case2])
    db.commit()

    cases = delinquency_service.list_platform_delinquency_cases(db)
    assert len(cases) == 1
    assert cases[0]["organization_id"] == 201
    assert cases[0]["has_open_case"] is True
