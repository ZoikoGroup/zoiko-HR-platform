"""
tests/test_feature_key_alias.py
-------------------------------
Phase 11 — canonical feature-key aliasing:
  - feature_key_alias (DB) is consulted before the mapping lookup, with the
    code-side FEATURE_KEY_CANONICAL as fallback.
  - A retired legacy key canonicalizes onto its Appendix A sibling, so it can
    never bypass E4 or silently hit a mapping row.
  - The deprecated hr.ai.autonomous_action spelling resolves to NOT_ENTITLED
    even when a mapping row grants the canonical autonomous key.
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.modules.hr.models import Organization, OrganizationStatus
from app.modules.billing.entitlement_service import (
    ENTITLED_AVAILABLE,
    NOT_ENTITLED,
    check_entitlement,
    invalidate_entitlement_cache,
    resolve_canonical_feature_key,
)
from app.modules.billing.feature_keys import FEATURE_KEY_REGISTRY_VERSION
from app.modules.billing.models import (
    BillingClassification,
    BillingCycle,
    BillingMetric,
    BillingPlan,
    BillingSubscription,
    FeatureKeyAlias,
    PlanCode,
    PlanEntitlementMapping,
    SubscriptionStatus,
    TaxCategory,
)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    engine.dispose()


def _org(db, org_id):
    org = Organization(id=org_id, name=f"Alias Org {org_id}", status=OrganizationStatus.ACTIVE)
    db.add(org)
    db.flush()
    return org


def _subscription(db, org_id, plan_code=PlanCode.CORE):
    sub = BillingSubscription(
        organization_id=org_id,
        status=SubscriptionStatus.ACTIVE,
        plan_code=plan_code,
        billing_cycle=BillingCycle.ANNUAL,
        billing_classification=BillingClassification.COMMERCIAL,
    )
    db.add(sub)
    db.flush()
    return sub


def _mapping(db, feature_key, plan_code=PlanCode.CORE, state=ENTITLED_AVAILABLE):
    mapping = PlanEntitlementMapping(
        feature_key=feature_key,
        plan_code=plan_code,
        catalog_version=FEATURE_KEY_REGISTRY_VERSION,
        state=state,
        approved_by="approver@zoikohr.com",
    )
    db.add(mapping)
    db.flush()


def _plan(db, plan_code=PlanCode.CORE):
    plan = BillingPlan(
        code=plan_code,
        name=plan_code.value,
        catalog_version="v1",
        billing_metric=BillingMetric.ACTIVE_WORKFORCE,
        is_active=True,
        is_contract_priced=False,
        monthly_price=10.00,
        annual_price=100.00,
        currency="USD",
        tax_category=TaxCategory.SAAS_SUBSCRIPTION,
    )
    db.add(plan)
    db.commit()
    return plan


class TestResolverCanonicalization:
    def test_alias_resolves_before_mapping_lookup(self, db):
        org_id = 2001
        _org(db, org_id)
        _plan(db)
        _subscription(db, org_id)
        db.add(FeatureKeyAlias(
            alias_key="hr.documents.bulk_distribution",
            canonical_key="hr.documents.bulk",
            note="test",
        ))
        _mapping(db, "hr.documents.bulk")
        db.commit()

        result = check_entitlement(db, org_id, "hr.documents.bulk_distribution")
        assert result["state"] == ENTITLED_AVAILABLE
        assert result["feature_key"] == "hr.documents.bulk"

    def test_retired_autonomous_action_cannot_bypass_hard_block(self, db):
        org_id = 2002
        _org(db, org_id)
        _plan(db)
        _subscription(db, org_id)
        db.add(FeatureKeyAlias(
            alias_key="hr.ai.autonomous_action",
            canonical_key="hr.ai.autonomous_decision",
            note="E4 canonical alias",
        ))
        # Even a mapping row granting the CANONICAL key must not resurrect E4.
        _mapping(db, "hr.ai.autonomous_decision")
        db.commit()

        result = check_entitlement(db, org_id, "hr.ai.autonomous_action")
        assert result["state"] == NOT_ENTITLED
        assert result["feature_key"] == "hr.ai.autonomous_decision"

    def test_canonical_key_itself_stays_hard_blocked(self, db):
        org_id = 2003
        _org(db, org_id)
        _plan(db)
        _subscription(db, org_id)
        _mapping(db, "hr.ai.autonomous_decision")
        db.commit()

        result = check_entitlement(db, org_id, "hr.ai.autonomous_decision")
        assert result["state"] == NOT_ENTITLED

    def test_db_alias_is_authoritative_falls_back_to_code_map(self, db):
        _org(db, 2004)
        db.commit()
        # No alias rows seeded → code-side FEATURE_KEY_CANONICAL fallback.
        assert resolve_canonical_feature_key(db, "hr.documents.bulk_distribution") == "hr.documents.bulk"
        # Un-aliased key passes through untouched.
        assert resolve_canonical_feature_key(db, "hr.recruitment.core") == "hr.recruitment.core"

    def test_db_alias_wins_over_code_map(self, db):
        _org(db, 2005)
        db.add(FeatureKeyAlias(
            alias_key="hr.documents.bulk_distribution",
            canonical_key="hr.api.read",  # deliberately divergent from code map
            note="test override",
        ))
        db.commit()
        assert resolve_canonical_feature_key(db, "hr.documents.bulk_distribution") == "hr.api.read"

    def test_decision_echoes_canonical_key_without_cache_contamination(self, db):
        org_id = 2006
        _org(db, org_id)
        _plan(db)
        _subscription(db, org_id)
        db.add(FeatureKeyAlias(
            alias_key="hr.documents.bulk_distribution",
            canonical_key="hr.documents.bulk",
            note="test",
        ))
        _mapping(db, "hr.documents.bulk")
        db.commit()
        invalidate_entitlement_cache(org_id)
        result = check_entitlement(db, org_id, "hr.documents.bulk_distribution")
        assert result["state"] == ENTITLED_AVAILABLE
        assert result["feature_key"] == "hr.documents.bulk"