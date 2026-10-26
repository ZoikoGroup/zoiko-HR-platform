"""The AI chatbot is not part of the Core plan: an organization on Core is refused by the assistant routes with the
upgrade message, Advanced keeps it, platform accounts (no organization, no plan) keep it, and the public website
assistant stays open. Uses the real entitlement resolver and plan baseline (no stubbed check_entitlement)."""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.main  # noqa: F401  (every model registered)
from app.database import Base, get_db
from app.core.dependencies import get_current_user, get_current_admin
from app.modules.assistant.router import assistant_router
from app.modules.billing.entitlement_service import ENTITLED_AVAILABLE, check_entitlement, invalidate_entitlement_cache
from app.modules.billing.models import (
    BillingClassification, BillingCycle, BillingMetric, BillingPlan, BillingSubscription, PlanCode, SubscriptionStatus, TaxCategory,
)
from app.modules.billing.plan_baseline import baseline_included
from app.modules.hr.models import Organization, OrganizationStatus

CHAT_KEYS = ("hr.ai.navigation", "hr.ai.policy_qa", "hr.ai.draft_summary", "hr.ai.governance_admin")


class _User:
    def __init__(self, org_id, role="employee"):
        self.id, self.email, self.organization_id, self.role = 7, "u@example.com", org_id, role


@pytest.fixture
def world(monkeypatch):
    monkeypatch.setattr("app.modules.billing.service.evaluation_access_block_reason", lambda db, org_id: None, raising=False)
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add_all([Organization(id=i, name=n, organization_name=n, status=OrganizationStatus.ACTIVE) for i, n in ((1, "CoreCo"), (2, "AdvCo"), (3, "EntCo"), (4, "TrialCo"), (5, "NoPlanCo"))])
    db.commit()
    plans = {}
    for code in (PlanCode.CORE, PlanCode.ADVANCED, PlanCode.ENTERPRISE):
        p = BillingPlan(code=code, name=code.value.title(), catalog_version="v1", billing_metric=BillingMetric.ACTIVE_WORKFORCE,
                        is_active=True, is_contract_priced=False, monthly_price=10.0, annual_price=100.0, currency="USD",
                        tax_category=TaxCategory.SAAS_SUBSCRIPTION, published_at=now)
        db.add(p); db.commit(); plans[code] = p.id
    for org_id, code in ((1, PlanCode.CORE), (2, PlanCode.ADVANCED), (3, PlanCode.ENTERPRISE)):
        db.add(BillingSubscription(organization_id=org_id, plan_id=plans[code], plan_code=code,
                                   billing_classification=BillingClassification.COMMERCIAL, status=SubscriptionStatus.ACTIVE,
                                   billing_cycle=BillingCycle.MONTHLY, renewal_anchor_date=now + timedelta(days=30)))
    db.add(BillingSubscription(organization_id=4, billing_classification=BillingClassification.COMMERCIAL,
                               status=SubscriptionStatus.EVALUATION, billing_cycle=BillingCycle.MONTHLY))
    db.commit()
    for org_id in (1, 2, 3, 4, 5):
        invalidate_entitlement_cache(org_id)

    api = FastAPI()
    api.include_router(assistant_router)
    box = {"user": None}
    api.dependency_overrides[get_db] = lambda: db
    api.dependency_overrides[get_current_user] = lambda: box["user"]
    api.dependency_overrides[get_current_admin] = lambda: box["user"]
    client = TestClient(api, raise_server_exceptions=False)
    yield db, client, box
    db.close()
    engine.dispose()


def test_baseline_leaves_the_chatbot_out_of_core_only():
    for key in CHAT_KEYS:
        assert baseline_included("core", key) is False, key
        assert baseline_included("advanced", key) is True, key


def test_core_org_is_refused_with_the_upgrade_message(world):
    db, client, box = world
    assert check_entitlement(db, 1, "hr.ai.navigation")["state"] != ENTITLED_AVAILABLE
    box["user"] = _User(1)
    for method, path in (("GET", "/assistant/capabilities"), ("GET", "/assistant/conversations"), ("POST", "/assistant/conversations")):
        r = client.request(method, path, json={})
        assert r.status_code == 403, (path, r.status_code, r.text)
        detail = r.json()["detail"]
        assert detail["feature_key"] == "hr.ai.navigation" and detail["entitlement_state"] == "NOT_ENTITLED"
        assert "Advanced" in detail["message"]
    box["user"] = _User(1, role="hr_admin")
    assert client.get("/assistant/admin/knowledge/sources").status_code in (403, 404, 405)
    assert client.get("/assistant/admin/controls").status_code == 403


def test_advanced_org_keeps_the_chatbot(world):
    db, client, box = world
    assert check_entitlement(db, 2, "hr.ai.navigation")["state"] == ENTITLED_AVAILABLE
    box["user"] = _User(2)
    r = client.get("/assistant/capabilities")
    assert r.status_code != 403, r.text


def test_platform_account_is_not_plan_gated(world):
    """A platform account has no plan; the gate lets it through (the chat routes themselves still need an
    organization, as before, but the admin routes take one as a scope)."""
    _, client, box = world
    box["user"] = _User(None, role="super_admin")
    r = client.get("/assistant/admin/controls", params={"organization_id": 2})
    assert r.status_code == 200, r.text


def test_public_website_assistant_stays_open(world):
    _, client, box = world
    box["user"] = None
    r = client.post("/assistant/public/ask", json={"question": "What is Zoiko HR?"})
    assert r.status_code != 403, r.text


@pytest.mark.parametrize("org_id, label", [(3, "Enterprise without contract rows"), (4, "evaluation"), (5, "no plan yet")])
def test_only_core_loses_the_chatbot(world, org_id, label):
    """Enterprise, trials and organizations without a plan resolve to NOT_CONFIGURED / TRIAL_RESTRICTED, not
    NOT_ENTITLED: they keep the assistant exactly as before."""
    _, client, box = world
    box["user"] = _User(org_id)
    r = client.get("/assistant/capabilities")
    assert r.status_code != 403, (label, r.text)
