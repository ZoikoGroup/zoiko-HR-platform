"""
tests/test_catalog_service.py
-----------------------------
Phase 10 — Section 14 durable governance: feature_definition sync, catalog
version immutability after publish, and the unpriced-SKU live-use gate.

Also covers Section 17 BillingPlan publication + re-pricing (the path behind
POST /billing/plans/reprice and GET /billing/public/catalog). That path had no
coverage at all, which is how a missing `PlanCode` import shipped: publishing
any plan set raised NameError -> HTTP 500 while every test stayed green.
"""

from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.exceptions import BadRequestException, AlreadyExistsException, NotFoundException
from app.database import Base
from app.modules.billing.catalog_service import (
    _checksum_of,
    add_sku,
    catalog_plan_to_dict,
    clone_plan_version,
    create_catalog_version,
    ensure_plan_mutable,
    get_customer_visible_plans,
    get_feature_definition,
    get_latest_published_catalog_version,
    get_live_catalog_version,
    list_skus,
    publish_billing_plans,
    publish_catalog_version,
    reprice_plan,
    sync_feature_definitions,
)
from app.modules.billing.feature_keys import FEATURE_KEYS
from app.modules.billing.models import (
    BillingMetric,
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


# ── BillingPlan publication + re-pricing (Section 17) ────────────────────────
# The catalog the storefront sells from: publish_billing_plans() freezes a
# version, reprice_plan() moves to the next one. Both were untested, which is
# how the missing PlanCode import reached a live server as an HTTP 500.

V1 = "ZHR-COM-BILL-001-v1"
V2 = "ZHR-COM-BILL-001-v2"


def _plan(code, version, monthly=None, annual=None, **over):
    data = dict(code=code, name=str(code), catalog_version=version)
    if monthly is not None:
        data["monthly_price"] = Decimal(monthly)
    if annual is not None:
        data["annual_price"] = Decimal(annual)
    data.update(over)
    return BillingPlan(**data)


def _seed_v1(db, version=V1):
    """The canonical three-plan set, published — what the storefront reads.

    Mirrors app/database.py's seed: core 12/120, advanced 25/250, enterprise
    contract-priced (and therefore unpriced by design).
    """
    rows = [
        _plan(PlanCode.CORE, version, "12.00", "120.00", name="Core"),
        _plan(PlanCode.ADVANCED, version, "25.00", "250.00", name="Advanced"),
        _plan(PlanCode.ENTERPRISE, version, name="Enterprise",
              is_contract_priced=True,
              billing_metric=BillingMetric.COMMITTED_WORKFORCE),
    ]
    for row in rows:
        db.add(row)
    db.commit()
    return publish_billing_plans(db, version, actor_email="seed@zoikohr.com")


def _add(db, *rows):
    for row in rows:
        db.add(row)
    db.commit()
    return rows


class TestBillingPlanPublication:
    def test_publish_stamps_every_plan_and_reaches_customers(self, db):
        published = _seed_v1(db)
        assert len(published) == 3
        assert all(p.published_at is not None for p in published)
        assert get_latest_published_catalog_version(db) == V1
        assert {p.code for p in get_customer_visible_plans(db)} == {
            PlanCode.CORE, PlanCode.ADVANCED, PlanCode.ENTERPRISE}

    def test_publish_is_repeatable_without_restamping(self, db):
        first = _seed_v1(db)
        stamps = [p.published_at for p in first]
        again = publish_billing_plans(db, V1)
        assert [p.published_at for p in again] == stamps

    def test_publish_refuses_an_incomplete_plan_set(self, db):
        _add(db, _plan(PlanCode.CORE, V1, "12.00", "120.00"))
        with pytest.raises(BadRequestException) as err:
            publish_billing_plans(db, V1, actor_email="admin@zoikohr.com")
        assert "complete plan set" in str(err.value)
        # Nothing may reach customers from a refused publish.
        assert get_latest_published_catalog_version(db) is None
        assert get_customer_visible_plans(db) == []

    def test_publish_refuses_self_serve_plan_missing_a_rate(self, db):
        _add(
            db,
            _plan(PlanCode.CORE, V1, monthly="12.00"),          # annual NULL
            _plan(PlanCode.ADVANCED, V1, "25.00", "250.00"),
            _plan(PlanCode.ENTERPRISE, V1, is_contract_priced=True),
        )
        with pytest.raises(BadRequestException) as err:
            publish_billing_plans(db, V1)
        assert "missing a" in str(err.value)

    def test_publish_refuses_inactive_plan(self, db):
        _add(
            db,
            _plan(PlanCode.CORE, V1, "12.00", "120.00"),
            _plan(PlanCode.ADVANCED, V1, "25.00", "250.00"),
            _plan(PlanCode.ENTERPRISE, V1, is_contract_priced=True, is_active=False),
        )
        with pytest.raises(BadRequestException) as err:
            publish_billing_plans(db, V1)
        assert "inactive" in str(err.value)

    def test_publish_unknown_version_raises(self, db):
        with pytest.raises(NotFoundException):
            publish_billing_plans(db, "ZHR-COM-BILL-001-v99")

    def test_publish_requires_a_version_string(self, db):
        with pytest.raises(BadRequestException):
            publish_billing_plans(db, "  ")

    def test_public_projection_hides_stripe_ids(self, db):
        core = _seed_v1(db)[0]
        core.stripe_product_id = "prod_live"
        core.stripe_monthly_price_id = "price_live_m"
        core.stripe_annual_price_id = "price_live_a"
        db.commit()
        public = catalog_plan_to_dict(core, include_provider_ids=False)
        assert public["monthly_price"] == 12.0
        assert "stripe_product_id" not in public
        assert "stripe_monthly_price_id" not in public
        assert "stripe_annual_price_id" not in public


class TestRepricePlan:
    """reprice_plan() is what POST /billing/plans/reprice calls.

    Stripe is off in every test: sync is explicitly best-effort (a Stripe
    outage must never block a catalog change), so with it disabled the catalog
    contract is still fully assertable and no network is touched.
    """

    @pytest.fixture(autouse=True)
    def _stripe_off(self, monkeypatch):
        from app.modules.billing import stripe_sync_service
        monkeypatch.setattr(stripe_sync_service, "stripe_enabled", lambda: False)

    def test_reprice_cuts_a_new_version_and_moves_the_storefront(self, db):
        _seed_v1(db)
        result = reprice_plan(db, PlanCode.CORE, Decimal("14.00"), Decimal("140.00"),
                              actor="admin@zoikohr.com")

        assert result["catalog_version"] == V2
        assert result["before"] == {"monthly_price": 12.0, "annual_price": 120.0}
        assert result["after"] == {"monthly_price": 14.0, "annual_price": 140.0}
        assert result["drift"] == "stripe_disabled"
        assert len(result["published"]) == 3

        # The storefront (/billing/public/catalog, the registration page) reads
        # the latest PUBLISHED version, so the new rate is live...
        assert get_latest_published_catalog_version(db) == V2
        live = {p.code: p for p in get_customer_visible_plans(db)}
        assert float(live[PlanCode.CORE].monthly_price) == 14.0
        assert float(live[PlanCode.CORE].annual_price) == 140.0
        # ...and the untouched siblings came along, still priced.
        assert float(live[PlanCode.ADVANCED].monthly_price) == 25.0
        assert live[PlanCode.ENTERPRISE].is_contract_priced is True

    def test_reprice_leaves_the_published_version_untouched(self, db):
        """Subscriptions already converted onto v1 keep the rate they agreed to."""
        _seed_v1(db)
        reprice_plan(db, PlanCode.CORE, Decimal("14.00"), Decimal("140.00"))
        old = db.query(BillingPlan).filter_by(
            catalog_version=V1, code=PlanCode.CORE).one()
        assert float(old.monthly_price) == 12.0
        assert old.published_at is not None

    def test_reprice_accepts_a_plain_code_string(self, db):
        _seed_v1(db)
        result = reprice_plan(db, "core", Decimal("14.00"), Decimal("140.00"))
        assert result["code"] == "core"
        assert result["after"]["monthly_price"] == 14.0

    def test_repeated_edits_accumulate_in_one_draft(self, db):
        """publish=False edits the draft; the next call reuses that version
        instead of cutting v3, so a staged multi-plan edit is one release."""
        _seed_v1(db)
        first = reprice_plan(db, PlanCode.CORE, Decimal("14.00"), Decimal("140.00"),
                             publish=False)
        second = reprice_plan(db, PlanCode.ADVANCED, Decimal("29.00"), Decimal("290.00"),
                              publish=False)
        assert first["catalog_version"] == second["catalog_version"] == V2
        assert db.query(BillingPlan).filter_by(catalog_version=V2).count() == 3
        # A draft is invisible to customers until it is published.
        assert get_latest_published_catalog_version(db) == V1
        assert len(publish_billing_plans(db, V2)) == 3
        assert get_latest_published_catalog_version(db) == V2


    def test_reprice_refuses_a_published_version(self, db):
        _seed_v1(db)
        with pytest.raises(BadRequestException) as err:
            reprice_plan(db, PlanCode.CORE, Decimal("14.00"), Decimal("140.00"),
                         catalog_version=V1)
        assert "immutable" in str(err.value)
        core = db.query(BillingPlan).filter_by(
            catalog_version=V1, code=PlanCode.CORE).one()
        assert float(core.monthly_price) == 12.0

    def test_reprice_requires_both_rates_for_self_serve(self, db):
        _seed_v1(db)
        with pytest.raises(BadRequestException) as err:
            reprice_plan(db, PlanCode.CORE, Decimal("14.00"), None)
        assert "both rates" in str(err.value)
        assert get_latest_published_catalog_version(db) == V1

    def test_reprice_refuses_negative_amounts(self, db):
        _seed_v1(db)
        with pytest.raises(BadRequestException) as err:
            reprice_plan(db, PlanCode.CORE, Decimal("-1.00"), Decimal("140.00"))
        assert "negative" in str(err.value)

    def test_reprice_lets_a_contract_priced_plan_stay_unpriced(self, db):
        """Enterprise is contract-priced: no numeric rate is legitimate, and the
        version it lands in still publishes as a complete set."""
        _seed_v1(db)
        result = reprice_plan(db, PlanCode.ENTERPRISE)
        assert result["catalog_version"] == V2
        assert result["after"] == {"monthly_price": None, "annual_price": None}
        assert get_latest_published_catalog_version(db) == V2

    def test_reprice_unknown_code_is_a_clean_bad_request(self, db):
        """`code` is free text on the request model; an unknown value must be a
        400 naming the valid codes, not a driver ValueError surfacing as a 500."""
        _seed_v1(db)
        with pytest.raises(BadRequestException) as err:
            reprice_plan(db, "platinum", Decimal("1.00"), Decimal("10.00"))
        assert "Unknown plan code 'platinum'" in str(err.value)
        assert get_latest_published_catalog_version(db) == V1

    def test_reprice_unknown_version_raises(self, db):
        _seed_v1(db)
        with pytest.raises(NotFoundException):
            reprice_plan(db, PlanCode.CORE, Decimal("14.00"), Decimal("140.00"),
                         catalog_version="ZHR-COM-BILL-001-v99")

    def test_reprice_with_nothing_published_cannot_clone(self, db):
        with pytest.raises(BadRequestException) as err:
            reprice_plan(db, PlanCode.CORE, Decimal("14.00"), Decimal("140.00"))
        assert "clone" in str(err.value)

    def test_reprice_reports_a_stripe_failure_without_blocking_the_change(self, db, monkeypatch):
        """The rate customers see is the catalog, not Stripe. A Stripe outage is
        reported as drift (and blocked at checkout) instead of failing the edit."""
        from app.modules.billing import stripe_sync_service

        def _boom(*args, **kwargs):
            raise RuntimeError("stripe down")

        monkeypatch.setattr(stripe_sync_service, "stripe_enabled", lambda: True)
        monkeypatch.setattr(stripe_sync_service, "sync_plan_to_stripe", _boom)
        _seed_v1(db)
        result = reprice_plan(db, PlanCode.CORE, Decimal("14.00"), Decimal("140.00"))
        assert "stripe_error" in result["drift"]
        assert get_latest_published_catalog_version(db) == V2
        assert result["after"]["monthly_price"] == 14.0

