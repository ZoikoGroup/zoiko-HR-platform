"""
tests/test_catalog_service.py
-----------------------------
Phase 10 — Section 14 durable governance: feature_definition sync, catalog
version immutability after publish, and the unpriced-SKU live-use gate.
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.exceptions import BadRequestException, AlreadyExistsException, NotFoundException
from app.database import Base
from app.modules.billing.catalog_service import (
    _checksum_of,
    add_sku,
    create_catalog_version,
    ensure_plan_mutable,
    get_feature_definition,
    get_live_catalog_version,
    list_skus,
    publish_catalog_version,
    sync_feature_definitions,
)
from app.modules.billing.feature_keys import FEATURE_KEYS
from app.modules.billing.models import (
    BillingPlan,
    CommercialCatalogStatus,
    CommercialSkuType,
    FeatureDefinition,
    PlanCode,
)


def test_ensure_plan_mutable_allows_unpublished_plan():
    plan = BillingPlan(code=PlanCode.CORE, catalog_version="v1")
    ensure_plan_mutable(plan)  # no exception


def test_ensure_plan_mutable_blocks_published_plan():
    import datetime

    plan = BillingPlan(code=PlanCode.CORE, catalog_version="v1", published_at=datetime.datetime.now(datetime.timezone.utc))
    with pytest.raises(AlreadyExistsException):
        ensure_plan_mutable(plan)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    engine.dispose()


# ── feature_definition sync ──────────────────────────────────────────────────

class TestFeatureDefinitionSync:
    def test_sync_inserts_every_registry_key(self, db):
        result = sync_feature_definitions(db)
        assert result["inserted"] == len(FEATURE_KEYS)
        assert result["total"] == len(FEATURE_KEYS)
        total = db.query(FeatureDefinition).count()
        assert total == len(FEATURE_KEYS)

    def test_sync_is_idempotent(self, db):
        sync_feature_definitions(db)
        result = sync_feature_definitions(db)
        assert result["inserted"] == 0
        assert result["existing"] == len(FEATURE_KEYS)

    def test_sync_writes_governance_domain(self, db):
        sync_feature_definitions(db)
        row = get_feature_definition(db, "hr.ai.policy_qa")
        assert row is not None
        assert row.domain == "ai"
        assert row.status == "active"

    def test_get_feature_definition_miss(self, db):
        assert get_feature_definition(db, "hr.never.exists") is None


# ── catalog version + SKU ────────────────────────────────────────────────────

class TestCatalogLifecycle:
    def test_create_and_add_priced_sku_then_publish(self, db):
        version = create_catalog_version(db, "ZHR-COM-ENT-002-v1")
        assert version.status == CommercialCatalogStatus.DRAFT
        add_sku(
            db, version.id, "core_seat",
            type=CommercialSkuType.SUBSCRIPTION,
            interval="annual",
            currency="USD",
            amount_cents=12000,
        )
        published = publish_catalog_version(db, version.id, approved_by="admin@zoikohr.com")
        assert published.status == CommercialCatalogStatus.PUBLISHED
        assert published.published_at is not None
        assert published.approved_by == "admin@zoikohr.com"
        assert published.checksum is not None and len(published.checksum) == 64
        assert get_live_catalog_version(db).id == version.id

    def test_publish_refuses_unpriced_subscription_sku(self, db):
        version = create_catalog_version(db, "ZHR-COM-ENT-002-v1")
        add_sku(
            db, version.id, "core_seat",
            type=CommercialSkuType.SUBSCRIPTION,
            interval="annual",
            currency="USD",
            amount_cents=None,
        )
        with pytest.raises(BadRequestException):
            publish_catalog_version(db, version.id)

    def test_service_skus_may_remain_unpriced(self, db):
        version = create_catalog_version(db, "ZHR-COM-ENT-002-v1")
        add_sku(
            db, version.id, "core_seat",
            type=CommercialSkuType.SUBSCRIPTION,
            amount_cents=12000,
        )
        add_sku(db, version.id, "migration_service", type=CommercialSkuType.SERVICE)
        publish_catalog_version(db, version.id)
        assert len(list_skus(db, version.id)) == 2

    def test_published_version_is_immutable(self, db):
        version = create_catalog_version(db, "ZHR-COM-ENT-002-v1")
        add_sku(db, version.id, "core_seat", amount_cents=12000)
        publish_catalog_version(db, version.id)
        with pytest.raises(AlreadyExistsException):
            add_sku(db, version.id, "second_sku", amount_cents=5000)

    def test_publish_twice_is_refused(self, db):
        version = create_catalog_version(db, "ZHR-COM-ENT-002-v1")
        add_sku(db, version.id, "core_seat", amount_cents=12000)
        publish_catalog_version(db, version.id)
        with pytest.raises(AlreadyExistsException):
            publish_catalog_version(db, version.id)

    def test_duplicate_version_and_sku_conflict(self, db):
        create_catalog_version(db, "ZHR-COM-ENT-002-v1")
        with pytest.raises(AlreadyExistsException):
            create_catalog_version(db, "ZHR-COM-ENT-002-v1")
        version = create_catalog_version(db, "ZHR-COM-ENT-003-v1")
        add_sku(db, version.id, "core_seat", amount_cents=12000)
        with pytest.raises(AlreadyExistsException):
            add_sku(db, version.id, "core_seat", amount_cents=14000)

    def test_live_catalog_is_most_recent_publish(self, db):
        assert get_live_catalog_version(db) is None
        v1 = create_catalog_version(db, "v1")
        add_sku(db, v1.id, "seat", amount_cents=12000)
        publish_catalog_version(db, v1.id)
        v2 = create_catalog_version(db, "v2")
        add_sku(db, v2.id, "seat", amount_cents=13000)
        publish_catalog_version(db, v2.id)
        assert get_live_catalog_version(db).version == "v2"

    def test_missing_version_raises(self, db):
        with pytest.raises(NotFoundException):
            add_sku(db, 999, "seat", amount_cents=1)

    def test_checksum_is_deterministic(self, db):
        version = create_catalog_version(db, "ZHR-COM-ENT-002-v1")
        add_sku(db, version.id, "core_seat", amount_cents=12000)
        first = _checksum_of(version)
        second = _checksum_of(version)
        assert first == second
        assert len(first) == 64
