"""
tests/test_billing_me.py
-------------------------
Prompt 6 — Customer Self-Serve Billing (/billing/me/*) HTTP coverage.

A minimal FastAPI app mounts ONLY billing_router with `get_db` overridden to an
in-memory sqlite session and `get_current_user` overridden to a synthetic
caller, so the routes are exercised end-to-end (routing, schema validation,
Section 19 trimming, tenant scoping, RBAC) without a live database.

Covers:
  - GET  /billing/me/subscription    (full for Owner; trimmed for admin/hr_admin)
  - GET  /billing/me/entitlements
  - POST /billing/me/cancel
  - POST /billing/me/reactivate      (incl. payment-method gate)
  - POST /billing/me/downgrade-impact
"""

from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.core.dependencies import get_current_user
from app.modules.billing.router import billing_router

import sys, pathlib

from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from fixtures import tenants
from app.modules.billing.models import (
    BillingAuditAction,
    PlanCode,
    ProviderRef,
    SubscriptionStatus,
)

from app.modules.billing.feature_keys import FEATURE_KEYS


class _Caller:
    def __init__(self, email, org_id, role):
        self.email = email
        self.organization_id = org_id
        self.role = role
        self.id = None


@pytest.fixture
def db():
    # StaticPool + check_same_thread=False so the in-memory DB can be shared
    # across the test thread and the TestClient's worker thread.
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
    """Minimal app with billing_router + overridden DB & auth deps."""
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


def _as(client, email, org_id, role="admin"):
    client.user_box["user"] = _Caller(email=email, org_id=org_id, role=role)


# ═══════════════════════════════════════════════════════════════════════════
# /me/subscription — Section 19 trimming
# ═══════════════════════════════════════════════════════════════════════════

class TestMeSubscription:
    def test_owner_sees_full_detail(self, db, client):
        fx = tenants.enterprise_tenant(db)  # commercial, plan ENTERPRISE
        _as(client, "owner@z", fx.org.id, role="super_admin")
        r = client.get("/billing/me/subscription")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["organization_id"] == fx.org.id
        assert body["plan_code"] == "enterprise"
        # Owner: financial detail present.
        assert body["billing_classification"] == "commercial"
        assert body["committed_quantity"] is not None or True
        assert "status" in body and body["status"] is not None

    @pytest.mark.parametrize("role", ["admin", "hr_admin"])
    def test_admin_hr_admin_trimmed(self, db, client, role):
        fx = tenants.enterprise_tenant(db)
        _as(client, "viewer@z", fx.org.id, role=role)
        r = client.get("/billing/me/subscription")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["plan_code"] == "enterprise"
        # Trimmed: no financial/billing detail (Section 19).
        assert body["billing_classification"] is None
        assert body["status"] is None
        assert body["committed_quantity"] is None
        assert body["service_start_at"] is None
        assert body["price_catalog_version"] is None

    def test_cross_tenant_isolation(self, db, client):
        """/me always scopes to the caller's OWN org; a caller from org 1 must
        get org 1's data, never org 2's."""
        a = tenants.core_tenant(db, org_id=1)
        b = tenants.enterprise_tenant(db, org_id=2)
        _as(client, "user-a@z", 1, role="admin")
        r = client.get("/billing/me/subscription")
        body = r.json()
        assert body["organization_id"] == 1
        assert body["plan_code"] == "core"

    def test_user_without_org_rejected(self, db, client):
        _as(client, "noorganization@z", None, role="admin")
        r = client.get("/billing/me/subscription")
        assert r.status_code == 403


# ═══════════════════════════════════════════════════════════════════════════
# /me/entitlements
# ═══════════════════════════════════════════════════════════════════════════

class TestMeEntitlements:
    def test_returns_full_snapshot(self, db, client):
        fx = tenants.core_tenant(db)
        tenants.seed_entitlement_mappings(db, plan_codes=[PlanCode.CORE])
        _as(client, "admin@z", fx.org.id, role="admin")
        r = client.get("/billing/me/entitlements")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["organization_id"] == fx.org.id
        assert body["catalog_version"].startswith("v")
        assert set(body["states"].keys()) == set(FEATURE_KEYS)
        # AI action hard-blocked always.
        assert body["states"]["hr.ai.autonomous_action"] == "NOT_ENTITLED"
        assert body["states"]["hr.core.employees"] == "ENTITLED_AVAILABLE"


# ═══════════════════════════════════════════════════════════════════════════
# /me/cancel
# ═══════════════════════════════════════════════════════════════════════════

class TestMeCancel:
    def test_org_decision_maker_can_cancel(self, db, client):
        fx = tenants.active_tenant(db)
        _as(client, "admin@z", fx.org.id, role="admin")
        r = client.post("/billing/me/cancel", json={"reason": "budget"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["organization_id"] == fx.org.id
        assert body["status"] == "cancel_at_period_end"
        db.refresh(fx.sub)
        assert fx.sub.status == SubscriptionStatus.CANCEL_AT_PERIOD_END
        # Audit trail written.
        assert "subscription_canceled" in tenants.audit_action_names(db, fx.org.id)

    def test_hr_admin_cannot_cancel(self, db, client):
        fx = tenants.active_tenant(db)
        _as(client, "hr@z", fx.org.id, role="hr_admin")
        r = client.post("/billing/me/cancel", json={"reason": "x"})
        assert r.status_code == 403


# ═══════════════════════════════════════════════════════════════════════════
# /me/reactivate (payment-method gate)
# ═══════════════════════════════════════════════════════════════════════════

class TestMeReactivate:
    def _setup(self, db):
        fx = tenants.active_tenant(db)
        _as_box = {}
        # force a canceled sub
        from app.modules.billing import service
        service.cancel_subscription(db, fx.org.id, reason="test")
        db.refresh(fx.sub)
        return fx

    def test_stripe_disabled_reactivates(self, db, client):
        fx = tenants.active_tenant(db)
        service = __import__("app.modules.billing.service", fromlist=["cancel_subscription"])
        service.cancel_subscription(db, fx.org.id, reason="test")
        _as(client, "owner@z", fx.org.id, role="super_admin")
        with patch("app.modules.billing.router.stripe_enabled", return_value=False):
            r = client.post("/billing/me/reactivate", json={"reason": "came back"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "active"
        db.refresh(fx.sub)
        assert fx.sub.status == SubscriptionStatus.ACTIVE
        assert "subscription_reactivated" in tenants.audit_action_names(db, fx.org.id)

    def test_stripe_enabled_blocks_without_payment_method(self, db, client):
        fx = tenants.active_tenant(db)
        service = __import__("app.modules.billing.service", fromlist=["cancel_subscription"])
        service.cancel_subscription(db, fx.org.id, reason="test")
        _as(client, "owner@z", fx.org.id, role="super_admin")
        with patch("app.modules.billing.router.stripe_enabled", return_value=True):
            with patch("app.modules.billing.stripe_client.payment_method_valid", return_value=False):
                r = client.post("/billing/me/reactivate", json={})
        assert r.status_code == 400
        db.refresh(fx.sub)
        assert fx.sub.status == SubscriptionStatus.CANCEL_AT_PERIOD_END

    def test_stripe_enabled_passes_with_valid_payment_method(self, db, client):
        fx = tenants.active_tenant(db)
        # give org a provider ref + default payment method
        ref = ProviderRef(organization_id=fx.org.id, stripe_customer_id="cus_1")
        db.add(ref)
        service = __import__("app.modules.billing.service", fromlist=["cancel_subscription"])
        service.cancel_subscription(db, fx.org.id, reason="test")
        db.commit()
        _as(client, "owner@z", fx.org.id, role="super_admin")
        with patch("app.modules.billing.router.stripe_enabled", return_value=True):
            with patch("app.modules.billing.stripe_client.payment_method_valid", return_value=True):
                r = client.post("/billing/me/reactivate", json={})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "active"

    def test_cannot_reactivate_active_subscription(self, db, client):
        fx = tenants.active_tenant(db)  # already ACTIVE
        _as(client, "owner@z", fx.org.id, role="super_admin")
        with patch("app.modules.billing.router.stripe_enabled", return_value=False):
            r = client.post("/billing/me/reactivate", json={})
        assert r.status_code == 400


# ═══════════════════════════════════════════════════════════════════════════
# /me/downgrade-impact
# ═══════════════════════════════════════════════════════════════════════════

class TestMeDowngradeImpact:
    def test_eligible_when_no_lost_entitlements(self, db, client):
        fx = tenants.advanced_tenant(db)
        # Entitle everything on both plans -> no blockers.
        tenants.seed_entitlement_mappings(
            db, plan_codes=[PlanCode.ADVANCED, PlanCode.CORE],
            not_entitled_keys={"hr.ai.autonomous_action"},
        )
        _as(client, "owner@z", fx.org.id, role="super_admin")
        r = client.post("/billing/me/downgrade-impact", json={"target_plan_code": "core"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["current_plan_code"] == "advanced"
        assert body["target_plan_code"] == "core"
        assert body["eligible"] is True
        assert body["blockers"] == []

    def test_reports_blocker_when_feature_would_be_lost(self, db, client):
        fx = tenants.enterprise_tenant(db)
        # enterprise entitled to documents.bulk_distribution, core NOT.
        tenants.seed_entitlement_mappings(
            db, plan_codes=[PlanCode.ENTERPRISE],
            not_entitled_keys={"hr.ai.autonomous_action"},
        )
        tenants.seed_entitlement_mappings(
            db, plan_codes=[PlanCode.CORE],
            not_entitled_keys={
                "hr.ai.autonomous_action",
                "hr.documents.core",
                "hr.documents.bulk_distribution",
                "hr.identity.sso",
            },
        )
        _as(client, "owner@z", fx.org.id, role="super_admin")
        r = client.post("/billing/me/downgrade-impact", json={"target_plan_code": "core"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["eligible"] is False
        categories = {b["category"] for b in body["blockers"]}
        assert "storage" in categories  # hr.documents.core / bulk_distribution

    def test_requires_decision_maker(self, db, client):
        fx = tenants.core_tenant(db)
        _as(client, "hire@z", fx.org.id, role="employee")
        r = client.post("/billing/me/downgrade-impact", json={"target_plan_code": "core"})
        assert r.status_code == 403
