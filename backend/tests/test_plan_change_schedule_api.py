"""Scheduling a plan change through the API: preview says eligible, submit saves the change.

Regression: preview (plain dict) worked but submit 500'd with "Something went wrong on
the server" because the audit call after scheduling missed the required `before`
argument — even though the change row had already been committed.
"""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import sys, pathlib

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from app.database import Base, get_db
from app.core.dependencies import get_current_user, get_current_billing_owner
from app.modules.billing.router import billing_router
from app.modules.billing.models import (
    BillingClassification,
    BillingCycle,
    BillingMetric,
    BillingPlan,
    BillingSubscription,
    PlanCode,
    SubscriptionStatus,
    TaxCategory,
)
from app.modules.hr.models import Organization, OrganizationStatus


class _Caller:
    def __init__(self, email, org_id, role):
        self.email = email
        self.organization_id = org_id
        self.role = role
        self.id = 99


@pytest.fixture
def client():
    from app.main import app  # noqa: F401  (ensures exception handlers match prod)

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Organization(id=1, name="Acme", status=OrganizationStatus.ACTIVE))
    session.commit()
    for code in (PlanCode.CORE, PlanCode.ADVANCED):
        session.add(BillingPlan(
            code=code, name=code.value.title(), catalog_version="v1",
            billing_metric=BillingMetric.ACTIVE_WORKFORCE,
            is_active=True, is_contract_priced=False,
            monthly_price=10.0, annual_price=100.0, currency="USD",
            tax_category=TaxCategory.SAAS_SUBSCRIPTION,
            published_at=datetime.now(timezone.utc).replace(tzinfo=None),
        ))
    session.commit()
    core = session.query(BillingPlan).filter_by(code=PlanCode.CORE).first()
    session.add(BillingSubscription(
        organization_id=1, plan_id=core.id, plan_code=PlanCode.CORE,
        billing_classification=BillingClassification.COMMERCIAL,
        status=SubscriptionStatus.ACTIVE, billing_cycle=BillingCycle.MONTHLY,
        renewal_anchor_date=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=30),
    ))
    session.commit()

    api = FastAPI()
    api.include_router(billing_router)

    def _override_db():
        yield session

    api.dependency_overrides[get_db] = _override_db
    box = {"user": _Caller("owner@x.com", 1, "super_admin")}
    api.dependency_overrides[get_current_user] = lambda: box["user"]
    api.dependency_overrides[get_current_billing_owner] = lambda: box["user"]
    with TestClient(api, raise_server_exceptions=False) as c:
        yield c
    session.close()
    engine.dispose()


def _plan_id(client, code):
    rows = client.get("/billing/plans").json()["list"]
    return next(p["id"] for p in rows if p["code"] == code)


def test_preview_eligible_then_schedule_succeeds(client):
    target = _plan_id(client, "advanced")
    preview = client.post("/billing/plan-changes/preview", params={"org_id": 1}, json={"plan_id": target})
    assert preview.status_code == 200, preview.text
    assert preview.json()["eligible"] is True

    scheduled = client.post(
        "/billing/plan-changes/schedule",
        params={"org_id": 1},
        json={"plan_id": target, "billing_cycle": "monthly"},
    )
    assert scheduled.status_code == 200, scheduled.text
    body = scheduled.json()
    assert body["to_plan_id"] == target and body["status"] == "scheduled"

    listed = client.get("/billing/plan-changes/1").json()["list"]
    assert [c["id"] for c in listed] == [body["id"]]


def _schedule(client, target):
    return client.post("/billing/plan-changes/schedule", params={"org_id": 1}, json={"plan_id": target, "billing_cycle": "monthly"})


def test_impact_row_failure_after_saving_still_answers_with_the_saved_change(client, monkeypatch):
    """A failed impact-row write left the session needing a rollback, so the audit write after it raised and the
    admin saw "Something went wrong on the server" for a change that had been saved."""
    from app.modules.billing import plan_change_service as pcs
    from app.modules.billing.models import DowngradeImpactItem

    def failing_sync(db, change, blockers):
        db.add(DowngradeImpactItem(plan_change_id=change.id, feature_key=None, severity="warning"))  # NOT NULL -> flush fails
        db.commit()

    monkeypatch.setattr(pcs, "_sync_impact_items", failing_sync)
    target = _plan_id(client, "advanced")
    scheduled = _schedule(client, target)
    assert scheduled.status_code == 200, scheduled.text
    assert scheduled.json()["status"] == "scheduled"
    assert [c["id"] for c in client.get("/billing/plan-changes/1").json()["list"]] == [scheduled.json()["id"]]


def test_audit_failure_does_not_turn_a_saved_change_into_a_server_error(client, monkeypatch):
    from app.modules.billing import service

    def failing_audit(*a, **k):
        raise RuntimeError("audit table unavailable")

    monkeypatch.setattr(service, "log_billing_audit", failing_audit)
    scheduled = _schedule(client, _plan_id(client, "advanced"))
    assert scheduled.status_code == 200, scheduled.text
    assert len(client.get("/billing/plan-changes/1").json()["list"]) == 1


def test_a_second_submit_for_the_same_plan_is_refused_clearly(client):
    target = _plan_id(client, "advanced")
    first = _schedule(client, target)
    assert first.status_code == 200, first.text
    again = _schedule(client, target)
    assert again.status_code == 400
    msg = again.json().get("message") or again.json().get("detail")
    assert "already scheduled" in msg and f"#{first.json()['id']}" in msg, msg
    assert len(client.get("/billing/plan-changes/1").json()["list"]) == 1
