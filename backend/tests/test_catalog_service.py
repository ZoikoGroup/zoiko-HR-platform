"""
tests/test_catalog_service.py
------------------------------
Section 17 (Canonical Price Catalog Governance) coverage.

Covers:
  - publish_catalog_version: publish-twice fails (append-only)
  - ensure_plan_mutable: mutate-published fails (immutability)
  - get_customer_visible_plans: NEVER leaks unpublished rows (mixed fixture)
  - publishing a version with a non-contract-priced plan missing a price rejects
  - catalog_plan_to_dict exposes publication + provider IDs + tax_category
  - stripe_sync_service: mocked client (no network), ID write-back,
    partial-write compensating cleanup, disabled-without-key no-op
"""

import pytest
from unittest.mock import MagicMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.modules.billing.models import BillingPlan, PlanCode, BillingMetric, TaxCategory
from app.modules.billing import catalog_service, stripe_sync_service
from app.core.exceptions import BadRequestException


@pytest.fixture
def db():
    """In-memory SQLite session with the full schema (used only for the pure
    catalog logic tests; no external DB required in CI)."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _make_plan(
    code: PlanCode,
    version: str = "ZHR-COM-BILL-001-v1",
    contract_priced: bool = False,
    monthly=None,
    annual=None,
) -> BillingPlan:
    return BillingPlan(
        code=code,
        name=str(code),
        catalog_version=version,
        billing_metric=BillingMetric.ACTIVE_WORKFORCE,
        is_active=True,
        is_contract_priced=contract_priced,
        monthly_price=monthly,
        annual_price=annual,
        currency="USD",
        tax_category=TaxCategory.SAAS_SUBSCRIPTION,
    )


class TestPublish:
    def test_publish_sets_published_at_and_is_published(self, db):
        plans = [
            _make_plan(PlanCode.CORE, monthly=10, annual=100),
            _make_plan(PlanCode.ADVANCED, monthly=20, annual=200),
        ]
        db.add_all(plans)
        db.commit()

        published = catalog_service.publish_catalog_version(db, "ZHR-COM-BILL-001-v1", "fin@zoiko.com")

        assert len(published) == 2
        for p in published:
            assert p.published_at is not None
            assert catalog_service.is_published(p) is True
            assert p.is_published is True

    def test_publish_twice_fails_append_only(self, db):
        db.add(_make_plan(PlanCode.CORE, monthly=10, annual=100))
        db.commit()
        catalog_service.publish_catalog_version(db, "ZHR-COM-BILL-001-v1", "fin@zoiko.com")

        with pytest.raises(BadRequestException) as ei:
            catalog_service.publish_catalog_version(db, "ZHR-COM-BILL-001-v1", "fin@zoiko.com")
        assert "already published" in str(ei.value.message).lower()

    def test_publish_rejects_non_contract_plan_missing_price(self, db):
        # Core/Advanced are self-serve (not contract-priced); give Advanced a
        # price but leave Core without one -> must reject the whole version.
        db.add(_make_plan(PlanCode.CORE))  # missing price, not contract-priced
        db.add(_make_plan(PlanCode.ADVANCED, monthly=20, annual=200))
        db.commit()

        with pytest.raises(BadRequestException) as ei:
            catalog_service.publish_catalog_version(db, "ZHR-COM-BILL-001-v1", "fin@zoiko.com")
        assert "missing an approved price" in str(ei.value.message).lower()

    def test_publish_accepts_contract_priced_plan_without_price(self, db):
        db.add(_make_plan(PlanCode.ENTERPRISE, contract_priced=True))
        db.commit()

        published = catalog_service.publish_catalog_version(db, "ZHR-COM-BILL-001-v1", "fin@zoiko.com")
        assert len(published) == 1
        assert published[0].is_contract_priced is True

    def test_publish_unknown_version_rejects(self, db):
        with pytest.raises(BadRequestException) as ei:
            catalog_service.publish_catalog_version(db, "nonexistent", "fin@zoiko.com")
        assert "nothing to publish" in str(ei.value.message).lower()


class TestImmutability:
    def test_mutating_published_plan_raises(self, db):
        plan = _make_plan(PlanCode.CORE, monthly=10, annual=100)
        db.add(plan)
        db.commit()
        catalog_service.publish_catalog_version(db, "ZHR-COM-BILL-001-v1", "fin@zoiko.com")
        db.refresh(plan)

        with pytest.raises(BadRequestException) as ei:
            catalog_service.ensure_plan_mutable(plan)
        assert "immutable" in str(ei.value.message).lower()

    def test_mutating_draft_plan_is_allowed(self, db):
        plan = _make_plan(PlanCode.CORE, monthly=10, annual=100)
        db.add(plan)
        db.commit()
        # Should not raise
        catalog_service.ensure_plan_mutable(plan)


class TestGetCustomerVisiblePlans:
    def test_mixed_fixture_never_leaks_unpublished_rows(self, db):
        """SECTION 17 CORE RULE — dedicated test, not just a code comment.
        Draft (unpublished) rows must NEVER surface to customers even when
        is_active is True, and published inactive rows must not surface either."""
        published_active = _make_plan(PlanCode.CORE, monthly=10, annual=100)
        draft_active = _make_plan(PlanCode.ADVANCED, monthly=20, annual=200)
        published_inactive = _make_plan(PlanCode.ENTERPRISE, contract_priced=True)
        published_inactive.is_active = False

        db.add_all([published_active, draft_active, published_inactive])
        db.commit()

        # Publish the CORE + ENTERPRISE rows only (draft ADVANCED stays draft)
        for p in (published_active, published_inactive):
            p.published_at = __import__("datetime").datetime.utcnow()
        db.commit()

        visible = catalog_service.get_customer_visible_plans(db)

        codes = {p.code for p in visible}
        # Only the published + active CORE is visible; the draft ADVANCED is
        # LEAKED if present; published-but-inactive ENTERPRISE is hidden too.
        assert codes == {PlanCode.CORE}

    def test_empty_catalog_returns_nothing(self, db):
        db.add(_make_plan(PlanCode.CORE, monthly=10, annual=100))  # draft
        db.commit()
        assert catalog_service.get_customer_visible_plans(db) == []

    def test_version_filter_respects_publication(self, db):
        v1 = _make_plan(PlanCode.CORE, version="v1", monthly=10, annual=100)
        v2 = _make_plan(PlanCode.CORE, version="v2", monthly=15, annual=150)
        db.add_all([v1, v2])
        db.commit()
        for p in (v1, v2):
            p.published_at = __import__("datetime").datetime.utcnow()
        db.commit()
        visible = catalog_service.get_customer_visible_plans(db, version="v2")
        assert [p.catalog_version for p in visible] == ["v2"]


class TestCatalogDict:
    def test_catalog_dict_includes_publication_provider_and_tax(self, db):
        plan = _make_plan(PlanCode.CORE, monthly=10, annual=100)
        plan.tax_category = TaxCategory.TRAINING_SUPPORT
        plan.stripe_product_id = "prod_x"
        plan.stripe_monthly_price_id = "price_m"
        plan.stripe_annual_price_id = "price_a"
        plan.published_at = __import__("datetime").datetime.utcnow()
        db.add(plan)
        db.commit()

        d = catalog_service.catalog_plan_to_dict(plan)
        assert d["is_published"] is True
        assert d["tax_category"] == "training_support"
        assert d["stripe_product_id"] == "prod_x"
        assert d["stripe_monthly_price_id"] == "price_m"
        assert d["stripe_annual_price_id"] == "price_a"
        assert d["monthly_price"] == 10.0

    def test_catalog_dict_exposes_null_price(self, db):
        plan = _make_plan(PlanCode.CORE)  # no price
        d = catalog_service.catalog_plan_to_dict(plan)
        assert d["monthly_price"] is None
        assert d["annual_price"] is None


class TestStripeSync:
    def _plan(self, db):
        plan = _make_plan(PlanCode.CORE, monthly=10, annual=100)
        plan.stripe_product_id = "prod_existing"
        plan.stripe_monthly_price_id = "price_existing_m"
        plan.stripe_annual_price_id = "price_existing_a"
        db.add(plan)
        db.commit()
        db.refresh(plan)
        return plan

    def test_disabled_without_key_is_noop(self, db):
        plan = self._plan(db)
        with patch.object(stripe_sync_service, "stripe_enabled", return_value=False):
            stripe_sync_service.sync_plan_to_stripe(db, plan)
        # No keys touched, no network calls
        assert plan.stripe_product_id == "prod_existing"

    def test_mocked_client_writes_ids_back(self, db):
        plan = self._plan(db)
        client = MagicMock()
        client.Product.create.return_value = MagicMock(id="prod_new")
        client.Price.create.side_effect = [
            MagicMock(id="price_new_m"),
            MagicMock(id="price_new_a"),
        ]
        with patch.object(stripe_sync_service, "stripe_enabled", return_value=True):
            stripe_sync_service.sync_plan_to_stripe(db, plan, stripe_client=client)

        assert plan.stripe_product_id == "prod_new"
        assert plan.stripe_monthly_price_id == "price_new_m"
        assert plan.stripe_annual_price_id == "price_new_a"
        assert client.Product.create.call_count == 1
        assert client.Price.create.call_count == 2

    def test_db_failure_triggers_compensating_cleanup(self, db):
        plan = self._plan(db)
        client = MagicMock()
        client.Product.create.return_value = MagicMock(id="prod_clean")
        client.Price.create.side_effect = [
            MagicMock(id="price_clean_m"),
            MagicMock(id="price_clean_a"),
        ]

        def fail_on_commit():
            raise RuntimeError("db down")

        db.commit = fail_on_commit

        with patch.object(stripe_sync_service, "stripe_enabled", return_value=True):
            with pytest.raises(RuntimeError):
                stripe_sync_service.sync_plan_to_stripe(db, plan, stripe_client=client)

        # Compensating cleanup deactivated the created Stripe objects
        assert client.Price.modify.call_count == 2
        assert client.Product.modify.call_count == 1

    def test_unpriced_plan_raises(self, db):
        plan = _make_plan(PlanCode.CORE)  # no price
        client = MagicMock()
        with patch.object(stripe_sync_service, "stripe_enabled", return_value=True):
            with pytest.raises(ValueError):
                stripe_sync_service.sync_plan_to_stripe(db, plan, stripe_client=client)
        client.Product.create.assert_not_called()
