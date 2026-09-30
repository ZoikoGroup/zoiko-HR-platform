"""Unit tests for the Stripe catalog sync — no network, no real Stripe.

Covers the two bugs that made this unsafe before:
  1. StripeObject metadata/recurring are NOT dicts; calling .get() on them raises.
     That silently broke Product reuse, minting a new Product on every sync.
  2. A rate change must reach Stripe, and a no-op sync must not create anything.
"""
from decimal import Decimal
from types import SimpleNamespace

import re

import pytest

from app.modules.billing import stripe_sync_service as svc


class FakeStripeObject:
    """Mimics stripe.StripeObject: attribute access only, no dict methods.

    Calling .get() here raises exactly like the real library, which is the whole
    point — it catches code that assumes metadata is a dict.
    """

    def __init__(self, **data):
        for k, v in data.items():
            setattr(self, k, v)

    def get(self, *a, **k):  # pragma: no cover - must never be reached
        raise AttributeError(
            "'get' is a dict method, but a StripeObject is not a dict. Use .to_dict()"
        )

    def to_dict(self):
        return dict(self.__dict__)


def make_plan(**over):
    p = SimpleNamespace()
    p.code = "core"
    p.name = "Core"
    p.description = "Core plan"
    p.catalog_version = "v1"
    p.currency = "USD"
    p.tax_category = "saas_subscription"
    p.monthly_price = Decimal("12.00")
    p.annual_price = Decimal("120.00")
    p.is_contract_priced = False
    p.is_active = True
    p.stripe_product_id = None
    p.stripe_monthly_price_id = None
    p.stripe_annual_price_id = None
    for k, v in over.items():
        setattr(p, k, v)
    return p


class FakeStripe:
    """Records every create/modify so tests can assert no-op behaviour.

    Product/Price are exposed as instance attributes holding bound callables,
    mirroring how the real client exposes `stripe.Product.create`.
    """

    def __init__(self, products=None, prices=None):
        self.api_key = None
        self._products = list(products or [])
        self._prices = list(prices or [])
        self.created_products = []
        self.created_prices = []
        self.modified = []
        self._n = 0
        self.Product = SimpleNamespace(search=self._search_products,
                                       create=self._create_product,
                                       modify=self._modify_product)
        self.Price = SimpleNamespace(create=self._create_price,
                                     retrieve=self._retrieve_price,
                                     modify=self._modify_price)

    def _next(self, prefix):
        self._n += 1
        return f"{prefix}_fake{self._n}"

    def _search_products(self, query):
        # Query looks like: metadata['zoiko_plan_code']:'core' AND active:'true'
        # The VALUE is the first quoted token after a colon, not the first quoted
        # token overall (that one is the metadata key).
        code = re.search(r":'([^']+)'", query).group(1)
        # Real Stripe returns a SearchResult exposing .data, not a bare list.
        return SimpleNamespace(data=[
            p for p in self._products
            if svc._meta(p.metadata, "zoiko_plan_code") == code
        ])

    def _create_product(self, **kw):
        prod = FakeStripeObject(id=self._next("prod"), active=True,
                                metadata=FakeStripeObject(**kw.get("metadata", {})))
        self._products.append(prod)
        self.created_products.append(prod)
        return prod

    def _modify_product(self, pid, **kw):
        for p in self._products:
            if p.id == pid:
                for k, v in kw.items():
                    setattr(p, k, v)
        self.modified.append(("product", pid, kw))

    def _create_price(self, **kw):
        price = FakeStripeObject(
            id=self._next("price"),
            active=True,
            unit_amount=kw["unit_amount"],
            currency=kw["currency"],
            recurring=FakeStripeObject(**kw.get("recurring", {})),
            product=kw["product"],
        )
        self._prices.append(price)
        self.created_prices.append(price)
        return price

    def _retrieve_price(self, pid):
        for p in self._prices:
            if p.id == pid:
                return p
        raise ValueError(f"no such price {pid}")

    def _modify_price(self, pid, **kw):
        for p in self._prices:
            if p.id == pid:
                for k, v in kw.items():
                    setattr(p, k, v)
        self.modified.append(("price", pid, kw))


class FakeSession:
    def commit(self):
        pass

    def rollback(self):
        pass


@pytest.fixture
def enabled(monkeypatch):
    monkeypatch.setattr(svc, "stripe_enabled", lambda: True)
    monkeypatch.setattr(svc.settings, "STRIPE_SECRET_KEY", "sk_test_fake")


# ── _meta: the bug that broke everything ──────────────────────────────────────

def test_meta_reads_stripe_object():
    obj = FakeStripeObject(zoiko_plan_code="core")
    assert svc._meta(obj, "zoiko_plan_code") == "core"


def test_meta_returns_default_when_absent():
    assert svc._meta(FakeStripeObject(other="x"), "zoiko_plan_code") is None
    assert svc._meta(None, "zoiko_plan_code", "d") == "d"


def test_price_interval_handles_stripe_object():
    price = FakeStripeObject(recurring=FakeStripeObject(interval="month"))
    assert svc._price_interval(price) == "month"
    assert svc._price_interval(FakeStripeObject(recurring=None)) is None


# ── amount conversion ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("value,cents", [
    (Decimal("12.00"), 1200),
    (Decimal("17.5"), 1750),
    (Decimal("0.01"), 1),
    (Decimal("1234.56"), 123456),
    ("19.99", 1999),
])
def test_amount_cents_is_exact(value, cents):
    """Stripe rejects float-derived amounts, so this must be exact."""
    assert svc._amount_cents(value) == cents


def test_amount_cents_rejects_none():
    with pytest.raises(ValueError):
        svc._amount_cents(None)


# ── sync behaviour ────────────────────────────────────────────────────────────

def test_first_sync_creates_product_and_prices(enabled):
    stripe = FakeStripe()
    plan = make_plan()
    result = svc.sync_plan_to_stripe(FakeSession(), plan, stripe_client=stripe)
    assert result["synced"] is True
    assert len(stripe.created_products) == 1
    assert len(stripe.created_prices) == 2
    assert plan.stripe_monthly_price_id
    assert plan.stripe_annual_price_id


def test_second_sync_is_a_true_noop(enabled):
    """Regression: the old code created a new Product/Prices on every call."""
    stripe = FakeStripe()
    plan = make_plan()
    svc.sync_plan_to_stripe(FakeSession(), plan, stripe_client=stripe)

    first_product = plan.stripe_product_id
    first_monthly = plan.stripe_monthly_price_id
    products_before = len(stripe.created_products)
    prices_before = len(stripe.created_prices)

    result = svc.sync_plan_to_stripe(FakeSession(), plan, stripe_client=stripe)

    assert result["changed"] == []
    assert len(stripe.created_products) == products_before
    assert len(stripe.created_prices) == prices_before
    assert plan.stripe_product_id == first_product
    assert plan.stripe_monthly_price_id == first_monthly


def test_reprice_creates_new_price_and_archives_old(enabled):
    """Stripe Price amounts are immutable: a change means a new Price."""
    stripe = FakeStripe()
    plan = make_plan()
    svc.sync_plan_to_stripe(FakeSession(), plan, stripe_client=stripe)
    old_monthly = plan.stripe_monthly_price_id

    plan.monthly_price = Decimal("17.00")
    result = svc.sync_plan_to_stripe(FakeSession(), plan, stripe_client=stripe)

    assert "month" in result["changed"]
    assert plan.stripe_monthly_price_id != old_monthly
    assert ("price", old_monthly, {"active": False}) in stripe.modified
    # the superseded price is deactivated
    assert stripe.Price.retrieve(old_monthly).active is False
    # and the new one carries the new amount
    assert stripe.Price.retrieve(plan.stripe_monthly_price_id).unit_amount == 1700
    # annual untouched
    assert "year" not in result["changed"]


def test_contract_priced_plan_syncs_product_without_prices(enabled):
    """Regression: contract plans have NULL prices; float(None) used to crash."""
    stripe = FakeStripe()
    plan = make_plan(monthly_price=None, annual_price=None, is_contract_priced=True)
    result = svc.sync_plan_to_stripe(FakeSession(), plan, stripe_client=stripe)
    assert result["synced"] is True
    assert len(stripe.created_prices) == 0
    assert plan.stripe_product_id
    assert plan.stripe_monthly_price_id is None


def test_becoming_contract_archives_existing_prices(enabled):
    stripe = FakeStripe()
    plan = make_plan()
    svc.sync_plan_to_stripe(FakeSession(), plan, stripe_client=stripe)
    monthly = plan.stripe_monthly_price_id
    annual = plan.stripe_annual_price_id

    plan.is_contract_priced = True
    plan.monthly_price = None
    plan.annual_price = None
    svc.sync_plan_to_stripe(FakeSession(), plan, stripe_client=stripe)

    assert plan.stripe_monthly_price_id is None
    assert plan.stripe_annual_price_id is None
    assert ("price", monthly, {"active": False}) in stripe.modified
    assert ("price", annual, {"active": False}) in stripe.modified


# ── drift detection ───────────────────────────────────────────────────────────

def test_drift_match(enabled):
    stripe = FakeStripe()
    plan = make_plan()
    svc.sync_plan_to_stripe(FakeSession(), plan, stripe_client=stripe)
    drift = svc.stripe_price_drift(plan, stripe_client=stripe)
    assert drift["month"]["status"] == "match"
    assert svc.has_drift(plan, stripe_client=stripe) is False


def test_drift_detects_mismatch(enabled):
    """The money bug: catalog says 15, Stripe still charges 12."""
    stripe = FakeStripe()
    plan = make_plan()
    svc.sync_plan_to_stripe(FakeSession(), plan, stripe_client=stripe)
    plan.monthly_price = Decimal("15.00")
    drift = svc.stripe_price_drift(plan, stripe_client=stripe)
    assert drift["month"]["status"] == "mismatch"
    assert drift["month"]["stripe_cents"] == 1200
    assert drift["month"]["catalog_cents"] == 1500
    assert svc.has_drift(plan, stripe_client=stripe) is True


def test_drift_detects_missing_price(enabled):
    plan = make_plan()
    drift = svc.stripe_price_drift(plan, stripe_client=FakeStripe())
    assert drift["month"]["status"] == "missing"
    assert svc.has_drift(plan, stripe_client=FakeStripe()) is True


def test_drift_detects_archived_price(enabled):
    stripe = FakeStripe()
    plan = make_plan()
    svc.sync_plan_to_stripe(FakeSession(), plan, stripe_client=stripe)
    stripe.Price.modify(plan.stripe_monthly_price_id, active=False)
    drift = svc.stripe_price_drift(plan, stripe_client=stripe)
    assert drift["month"]["status"] == "archived"
    assert svc.has_drift(plan, stripe_client=stripe) is True


def test_drift_disabled_stripe(enabled, monkeypatch):
    monkeypatch.setattr(svc, "stripe_enabled", lambda: False)
    drift = svc.stripe_price_drift(make_plan())
    assert drift["month"]["status"] == "stripe_disabled"
    assert svc.has_drift(make_plan()) is False


def test_sync_noops_when_disabled(monkeypatch):
    monkeypatch.setattr(svc, "stripe_enabled", lambda: False)
    plan = make_plan()
    result = svc.sync_plan_to_stripe(FakeSession(), plan,
                                     stripe_client=FakeStripe())
    assert result["synced"] is False
    assert result["reason"] == "stripe_disabled"
    assert plan.stripe_product_id is None
