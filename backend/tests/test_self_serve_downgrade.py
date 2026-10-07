"""A customer on Advanced can schedule a downgrade to Core for the end of the paid period, see it, and cancel it."""

import pathlib
import sys
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.dependencies import get_current_user
from app.database import Base, get_db
from app.modules.billing import plan_change_service
from app.modules.billing.feature_keys import FEATURE_KEY_REGISTRY_VERSION
from app.modules.billing.models import (
    BillingCycle, BillingMetric, BillingPlan, PlanChangeStatus, PlanCode, ProviderRef, SubscriptionStatus,
)
from app.modules.billing.router import billing_router

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from fixtures import tenants  # noqa: E402


class _Caller:
    def __init__(self, email, org_id, role):
        self.email, self.organization_id, self.role, self.id = email, org_id, role, None


@pytest.fixture
def env():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    core = BillingPlan(code=PlanCode.CORE, name="Core", catalog_version=FEATURE_KEY_REGISTRY_VERSION, billing_metric=BillingMetric.ACTIVE_WORKFORCE,
                       stripe_monthly_price_id="price_core_m")
    adv = BillingPlan(code=PlanCode.ADVANCED, name="Advanced", catalog_version=FEATURE_KEY_REGISTRY_VERSION, billing_metric=BillingMetric.ACTIVE_WORKFORCE)
    db.add_all([core, adv])
    db.commit()
    fx = tenants.active_tenant(db, org_id=40)
    fx.sub.plan_id, fx.sub.plan_code = adv.id, PlanCode.ADVANCED
    fx.sub.billing_cycle = BillingCycle.MONTHLY
    fx.sub.renewal_anchor_date = datetime.utcnow() + timedelta(days=20)
    db.commit()

    app = FastAPI()
    app.include_router(billing_router)
    box = {"user": _Caller("admin@z.test", 40, "admin")}
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: box["user"]
    with TestClient(app) as c:
        c.db, c.fx, c.core, c.adv, c.box = db, fx, core, adv, box
        yield c
    db.close()
    engine.dispose()


def test_the_downgrade_is_scheduled_for_the_renewal_date_and_names_what_will_be_lost(env):
    r = env.post("/billing/me/downgrade", json={"target_plan_code": "core"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["to_plan_code"] == "core" and body["status"] == "scheduled"
    assert body["effective_at"].startswith(env.fx.sub.renewal_anchor_date.date().isoformat())
    assert "hr.performance.cycles" in body["features_lost"] or "hr.performance.core" in body["features_lost"]
    assert env.get("/billing/me/pending-plan-change").json()["pending"]["id"] == body["id"]
    env.db.refresh(env.fx.sub)
    assert env.fx.sub.plan_code == PlanCode.ADVANCED, "nothing changes until the period ends"


def test_scheduling_twice_replaces_the_first_and_cancel_keeps_the_plan(env):
    first = env.post("/billing/me/downgrade", json={"target_plan_code": "core"}).json()
    second = env.post("/billing/me/downgrade", json={"target_plan_code": "core"}).json()
    assert second["id"] != first["id"]
    assert len(plan_change_service.get_pending_changes(env.db, 40)) == 1
    assert env.post("/billing/me/pending-plan-change/cancel").json() == {"pending": None}
    assert env.get("/billing/me/pending-plan-change").json() == {"pending": None}
    assert env.post("/billing/me/pending-plan-change/cancel").status_code == 400


def test_only_a_real_downgrade_of_an_active_paid_plan_with_a_known_renewal_date_is_accepted(env):
    assert env.post("/billing/me/downgrade", json={"target_plan_code": "advanced"}).status_code == 400   # same plan, not lower
    env.fx.sub.renewal_anchor_date = None
    env.db.commit()
    r = env.post("/billing/me/downgrade", json={"target_plan_code": "core"})
    assert r.status_code == 400 and "renewal date" in r.text
    env.fx.sub.renewal_anchor_date = datetime.utcnow() + timedelta(days=5)
    env.fx.sub.status = SubscriptionStatus.EVALUATION
    env.db.commit()
    assert env.post("/billing/me/downgrade", json={"target_plan_code": "core"}).status_code == 400


def test_an_ordinary_employee_cannot_schedule_a_downgrade(env):
    env.box["user"] = _Caller("emp@z.test", 40, "employee")
    assert env.post("/billing/me/downgrade", json={"target_plan_code": "core"}).status_code == 403


def _due(env):
    change = plan_change_service.schedule_plan_change(
        env.db, 40, env.core.id, BillingCycle.MONTHLY, effective_at=datetime.utcnow() - timedelta(minutes=1), requested_by="t")
    env.db.add(ProviderRef(organization_id=40, stripe_customer_id="cus_1", stripe_subscription_id="sub_1"))
    env.db.commit()
    return change


def test_when_the_period_ends_stripe_is_repriced_and_then_the_plan_changes(env):
    change = _due(env)
    calls = []
    with patch("app.modules.billing.stripe_client.stripe_enabled", return_value=True), \
         patch("app.modules.billing.stripe_client.modify_subscription_price", side_effect=lambda **kw: calls.append(kw) or {"status": "active"}):
        result = plan_change_service.execute_due_changes(env.db)
    assert result["executed"] == 1
    assert calls and calls[0]["new_price_id"] == "price_core_m" and calls[0]["subscription_id"] == "sub_1"
    env.db.refresh(env.fx.sub)
    assert env.fx.sub.plan_code == PlanCode.CORE


def test_if_stripe_refuses_the_customer_keeps_their_plan_and_the_change_is_retried(env):
    change = _due(env)
    with patch("app.modules.billing.stripe_client.stripe_enabled", return_value=True), \
         patch("app.modules.billing.stripe_client.modify_subscription_price", side_effect=RuntimeError("stripe down")):
        result = plan_change_service.execute_due_changes(env.db)
    assert result["failed"] == 1
    env.db.refresh(env.fx.sub)
    env.db.refresh(change)
    assert env.fx.sub.plan_code == PlanCode.ADVANCED, "never change what the customer has while Stripe still bills the old price"
    assert change.status == PlanChangeStatus.BLOCKED
