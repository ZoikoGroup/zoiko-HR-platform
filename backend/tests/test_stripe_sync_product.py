"""Plan→Stripe Product creation must never send a blank description.

Stripe reads `description=""` as an attempt to unset the field and rejects the
whole request (parameter_invalid_empty). Plans whose description column is empty
or NULL therefore failed to sync on every boot. These tests pin the omission.
"""

import pytest

from app.modules.billing.stripe_sync_service import _find_or_create_product


class _FakeProduct:
    def __init__(self, metadata=None, product_id="prod_1"):
        self.metadata = metadata or {}
        self.id = product_id


class _FakeProductApi:
    def __init__(self, search_results=(), created=None):
        self._search_results = list(search_results)
        self.created = created if created is not None else []

    def search(self, query):
        return type("SearchResult", (), {"data": self._search_results})()

    def create(self, **kwargs):
        self.created.append(kwargs)
        return _FakeProduct(metadata=kwargs.get("metadata"))


class _FakeStripe:
    def __init__(self, search_results=()):
        self.created = []
        self.Product = _FakeProductApi(search_results, self.created)


class _Plan:
    def __init__(self, description):
        self.code = "enterprise"
        self.name = "Enterprise"
        self.description = description
        self.tax_category = "saas_subscription"


@pytest.mark.parametrize("blank", [None, "", "   "])
def test_blank_description_is_omitted(blank):
    stripe = _FakeStripe()

    _find_or_create_product(stripe, _Plan(blank))

    assert len(stripe.created) == 1
    assert "description" not in stripe.created[0], (
        f"sent description={blank!r}; Stripe rejects empty strings as an unset attempt"
    )


def test_populated_description_is_sent():
    stripe = _FakeStripe()

    _find_or_create_product(stripe, _Plan("Custom deployment with dedicated support."))

    assert stripe.created[0]["description"] == "Custom deployment with dedicated support."


def test_existing_product_is_reused_without_creating():
    existing = _FakeProduct(metadata={"zoiko_plan_code": "enterprise"})
    stripe = _FakeStripe(search_results=[existing])

    product, created = _find_or_create_product(stripe, _Plan(""))

    assert created is False
    assert product is existing
    assert stripe.created == []


def test_plan_metadata_always_carries_the_code():
    stripe = _FakeStripe()

    _find_or_create_product(stripe, _Plan(None))

    assert stripe.created[0]["metadata"]["zoiko_plan_code"] == "enterprise"