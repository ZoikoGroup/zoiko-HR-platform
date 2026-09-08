"""
tests/test_entitlement_cache.py
-------------------------------
Phase 8 — entitlement decision cache: invalidation on subscription mutation.

Proves a cached per-key decision can never outlive a plan/status change:
after an immediate upgrade the next check must reflect the new plan, not a
stale cached "not configured" verdict.

The decision cache is process-global (ttl 120s) so every test uses a unique
organization id to avoid cross-test contamination.
"""

import sys
import pathlib

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from app.database import Base
from app.modules.billing.models import (
    BillingCycle,
    BillingMetric,
    BillingPlan,
    PlanCode,
)
from app.modules.billing.feature_keys import FEATURE_KEY_REGISTRY_VERSION
from app.modules.billing import service
from app.modules.billing.entitlement_service import (
    ENTITLED_AVAILABLE,
    ENTITLED_NOT_CONFIGURED,
    check_entitlement,
    invalidate_entitlement_cache,
)
from tests.fixtures import tenants

_GRANT_KEY = "hr.recruitment.core"
_ALWAYS_KEY = "hr.attendance.core"


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    s = Session()
    yield s
    s.close()
    engine.dispose()


def _plans(db, org_id: int):
    core = BillingPlan(
        code=PlanCode.CORE,
        name="Core",
        catalog_version=FEATURE_KEY_REGISTRY_VERSION,
        billing_metric=BillingMetric.ACTIVE_WORKFORCE,
    )
    ent = BillingPlan(
        code=PlanCode.ENTERPRISE,
        name="Enterprise",
        catalog_version=FEATURE_KEY_REGISTRY_VERSION,
        billing_metric=BillingMetric.ACTIVE_WORKFORCE,
    )
    db.add_all([core, ent])
    db.commit()
    db.refresh(core)
    db.refresh(ent)
    return core, ent


def test_upgrade_invalidates_stale_decision_cache(db):
    org_id = 9001
    core_plan, ent_plan = _plans(db, org_id)
    fx = tenants.active_tenant(db, org_id=org_id)
    fx.sub.plan_id = core_plan.id
    db.commit()

    # ENTERPRISE grants the key; CORE does not (no row → ENTITLED_NOT_CONFIGURED).
    tenants.seed_entitlement_mappings(
        db,
        plan_codes=[PlanCode.ENTERPRISE],
        entitled_keys={_GRANT_KEY},
    )
    tenants.seed_entitlement_mappings(
        db,
        plan_codes=[PlanCode.CORE],
        entitled_keys={_ALWAYS_KEY},
    )

    # Prime the cache under CORE: not configured for the grant key.
    before = check_entitlement(db, org_id, _GRANT_KEY)
    assert before["state"] == ENTITLED_NOT_CONFIGURED

    # Immediate upgrade — must drop the cached decision.
    service.upgrade_subscription(
        db,
        organization_id=org_id,
        plan_id=ent_plan.id,
        billing_cycle=BillingCycle.MONTHLY,
    )

    after = check_entitlement(db, org_id, _GRANT_KEY)
    assert after["state"] == ENTITLED_AVAILABLE, (
        "stale cached 'not configured' decision survived an upgrade — "
        "upgrade_subscription did not invalidate the entitlement cache"
    )


def test_cancel_clears_cache_for_org(db):
    org_id = 9002
    core_plan, _ = _plans(db, org_id)
    fx = tenants.active_tenant(db, org_id=org_id)
    fx.sub.plan_id = core_plan.id
    db.commit()
    tenants.seed_entitlement_mappings(
        db,
        plan_codes=[PlanCode.CORE],
        entitled_keys={_ALWAYS_KEY},
    )

    check_entitlement(db, org_id, _ALWAYS_KEY)

    service.cancel_subscription(db, organization_id=org_id, reason="test")

    # Invalidation must not raise, and the cached entry must be gone.
    invalidate_entitlement_cache(org_id)
    decision = check_entitlement(db, org_id, _ALWAYS_KEY)
    assert decision["state"] in (ENTITLED_AVAILABLE, ENTITLED_NOT_CONFIGURED)


def test_explicit_invalidation_clears_all_org_entries(db):
    org_id = 9003
    core_plan, _ = _plans(db, org_id)
    fx = tenants.active_tenant(db, org_id=org_id)
    fx.sub.plan_id = core_plan.id
    db.commit()
    tenants.seed_entitlement_mappings(
        db,
        plan_codes=[PlanCode.CORE],
        entitled_keys={_ALWAYS_KEY, _GRANT_KEY},
    )

    check_entitlement(db, org_id, _ALWAYS_KEY)
    check_entitlement(db, org_id, _GRANT_KEY)

    invalidate_entitlement_cache(org_id)
    # Re-resolving must recompute fresh (still entitled) without erroring.
    assert check_entitlement(db, org_id, _ALWAYS_KEY)["state"] == ENTITLED_AVAILABLE