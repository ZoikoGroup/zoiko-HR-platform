"""Org admins only ever see the latest PUBLISHED catalog; drafts must not look buyable.

Regression: the Billing page listed unpublished plans with working-looking Subscribe
buttons, but checkout refused them with "not available for purchase" instead of
redirecting to Stripe.
"""
from datetime import datetime
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import sys, pathlib

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from app.database import Base, get_db
from app.core.dependencies import get_current_user
from app.modules.billing.router import billing_router
from app.modules.billing.models import (
    BillingMetric,
    BillingPlan,
    PlanCode,
    TaxCategory,
)


class _Caller:
    def __init__(self, email, org_id, role):
        self.email = email
        self.organization_id = org_id
        self.role = role
        self.id = None


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


@pytest.fixture
def client(db):
    app = FastAPI()
    app.include_router(billing_router)

    def _override_db():
        yield db

    app.dependency_overrides[get_db] = _override_db
    user_box = {}

    def _override_current_user():
        return user_box["user"]

    app.dependency_overrides[get_current_user] = _override_current_user
    with TestClient(app) as c:
        c.user_box = user_box
        yield c


def _plan(db, code, name, version, published, active=True, priced=True):
    plan = BillingPlan(
        code=code, name=name, catalog_version=version,
        billing_metric=BillingMetric.ACTIVE_WORKFORCE,
        is_active=active, is_contract_priced=False,
        monthly_price=10.0 if priced else None,
        annual_price=100.0 if priced else None,
        currency="USD", tax_category=TaxCategory.SAAS_SUBSCRIPTION,
        published_at=datetime.utcnow() if published else None,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@pytest.fixture
def catalog(db):
    v1 = {c: _plan(db, c, c.value.title(), "v1", True) for c in PlanCode}
    draft = _plan(db, PlanCode.CORE, "Core", "v2", False)
    return v1, draft


def _as(client, role):
    client.user_box["user"] = _Caller(email=f"{role}@x.com", org_id=1, role=role)


def test_org_admin_sees_only_the_published_catalog(client, catalog):
    _as(client, "admin")
    r = client.get("/billing/plans")
    assert r.status_code == 200, r.text
    rows = r.json()["list"]
    assert {p["code"] for p in rows} == {"core", "advanced", "enterprise"}
    assert all(p["is_published"] for p in rows)
    assert {p["catalog_version"] for p in rows} == {"v1"}


def test_super_admin_still_sees_drafts(client, catalog):
    _as(client, "super_admin")
    r = client.get("/billing/plans")
    assert r.status_code == 200, r.text
    assert len(r.json()["list"]) == 4


def test_checkout_refuses_an_unpublished_plan(client, catalog):
    _, draft = catalog
    _as(client, "admin")
    with patch("app.modules.billing.router.stripe_enabled", return_value=True):
        r = client.post(
            "/billing/checkout-session",
            json={
                "organization_id": 1, "plan_id": draft.id, "billing_cycle": "monthly",
                "success_url": "http://localhost/billing", "cancel_url": "http://localhost/billing",
            },
            headers={"Idempotency-Key": "ik-unpublished-1"},
        )
    assert r.status_code == 400
    assert "not available for purchase" in str(r.json()).lower()
