import pytest
from datetime import datetime, timedelta
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


def _org(db, org_id: int, name: str):
    from app.modules.hr.models import Organization, OrganizationStatus
    org = Organization(id=org_id, name=name, status=OrganizationStatus.APPROVED)
    db.add(org)
    db.flush()
    return org


def test_platform_evaluations_service(db):
    """Verify list_platform_evaluations returns evaluations across every
    organization with filters and pagination, mirroring list_platform_invoices."""
    _org(db, 301, "Org 301")
    _org(db, 302, "Org 302")

    ev1 = service.start_evaluation(
        db, organization_id=301, evaluation_ends_at=datetime.utcnow() + timedelta(days=10),
        conversion_owner="a@z.test",
    )
    ev2 = service.start_evaluation(
        db, organization_id=302, evaluation_ends_at=datetime.utcnow() + timedelta(days=1),
        conversion_owner="b@z.test",
    )

    # Query all
    items, total = service.list_platform_evaluations(db, limit=10)
    assert total == 2
    assert len(items) == 2
    assert {i["organization_id"] for i in items} == {301, 302}
    assert all(i["organization_name"] for i in items)

    # Filter by org_id
    org_items, org_total = service.list_platform_evaluations(db, organization_id=302, limit=10)
    assert org_total == 1
    assert org_items[0]["organization_id"] == 302

    # Filter by status
    status_items, status_total = service.list_platform_evaluations(db, status="active", limit=10)
    assert status_total == 2

    # expiring_within_days sorts soonest-first and excludes the far-out one
    expiring_items, expiring_total = service.list_platform_evaluations(db, expiring_within_days=2, limit=10)
    assert expiring_total == 1
    assert expiring_items[0]["organization_id"] == 302

    # Converting ev2 removes it from an "active" filter
    service.convert_evaluation(
        db, evaluation_id=ev2.id, plan_id=_seed_plan(db).id,
        billing_cycle=service.BillingCycle.MONTHLY, quantity_basis="test",
        commercial_effective_at=datetime.utcnow(), approver="tester",
    )
    active_items, active_total = service.list_platform_evaluations(db, status="active", limit=10)
    assert active_total == 1
    assert active_items[0]["organization_id"] == 301


def _seed_plan(db):
    from app.modules.billing.models import PlanCode, BillingMetric, TaxCategory
    plan = BillingPlan(
        code=PlanCode.CORE, name="Core", catalog_version="ZHR-COM-BILL-001-v1",
        billing_metric=BillingMetric.ACTIVE_WORKFORCE, is_active=True, is_contract_priced=False,
        monthly_price=10.00, annual_price=100.00, currency="USD",
        tax_category=TaxCategory.SAAS_SUBSCRIPTION,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan
