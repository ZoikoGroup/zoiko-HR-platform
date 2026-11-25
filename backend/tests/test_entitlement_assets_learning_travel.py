"""Audit A15, L18, T18: every Assets, Learning and Travel API route is gated by its module's plan feature, not only some of them."""
import re

from app.main import app
from app.modules.billing.entitlement_middleware import _flatten_routes
from app.modules.billing.route_entitlement_map import lookup_feature_key

EXPECTED = {"assets": "hr.assets.core", "learning": "hr.learning.core", "travel": "hr.travel.core", "travel-expenses": "hr.travel.core"}
PREFIX = re.compile(r"^/hr/(assets|learning|travel-expenses|travel)(/|$)")


def _module_routes():
    for route in _flatten_routes(app.routes):
        match = PREFIX.match(getattr(route, "path", ""))
        if not match:
            continue
        for method in getattr(route, "methods", None) or ():
            if method not in ("HEAD", "OPTIONS"):
                yield method, route.path, EXPECTED[match.group(1)]


def test_there_are_routes_to_check():
    seen = {EXPECTED_KEY for _m, _p, EXPECTED_KEY in _module_routes()}
    assert seen == {"hr.assets.core", "hr.learning.core", "hr.travel.core"}


def test_every_assets_learning_and_travel_route_is_gated_by_its_own_feature():
    wrong = [(m, p, lookup_feature_key(m, p), key) for m, p, key in _module_routes() if lookup_feature_key(m, p) != key]
    assert wrong == []
