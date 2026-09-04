"""
tests/test_entitlement_coverage.py
------------------------------------
Prompt 6 — entitlement mapping coverage guarantees.

Asserts the route_entitlement_map is complete and drift-free:
  1. Every FEATURE_KEYS key (except the explicit NOT_BUILT allowlist and the
     hard-blocked hr.ai.autonomous_action) has >= 1 mapped route.
  2. Every value in the map is a valid FEATURE_KEY (no orphan mappings).
  3. coverage_gap_keys() is empty — no silent, undocumented gaps.
  4. The live sweep against the assembled app reports no "zero routes mapped" for
     a built key and no reference to a route that no longer exists (drift).
"""

import logging

from fastapi import FastAPI

from app.modules.billing.feature_keys import FEATURE_KEYS, is_valid_feature_key
from app.modules.billing import route_entitlement_map as rem


def test_every_built_key_has_a_mapped_route():
    mapped = rem.mapped_feature_keys()
    unmapped_built = {
        k for k in FEATURE_KEYS
        if k not in mapped and k not in rem.NOT_BUILT_FEATURE_KEYS
    }
    assert unmapped_built == set(), (
        f"FEATURE_KEYS with zero mapped routes that are not NOT_BUILT: {unmapped_built}"
    )


def test_not_built_keys_are_allowlisted_not_silent_gaps():
    for key in rem.NOT_BUILT_FEATURE_KEYS:
        assert key in FEATURE_KEYS, f"allowlisted key not a real FEATURE_KEY: {key}"


def test_every_mapped_value_is_a_valid_feature_key():
    for (method, path), key in rem.ROUTE_ENTITLEMENT_MAP.items():
        assert is_valid_feature_key(key), f"invalid feature key '{key}' for {method} {path}"


def test_no_coverage_gaps():
    assert rem.coverage_gap_keys() == set()


def test_hard_blocked_key_is_unmapped_by_design():
    assert "hr.ai.autonomous_action" not in rem.mapped_feature_keys()


def test_sweep_reports_no_drift_and_no_unmapped_built_keys():
    from app.main import app

    warnings = []
    handler = logging.getLogger("zoiko.billing.entitlement")
    old_level = handler.level
    handler.setLevel(logging.WARNING)

    buffer = []
    class _Capture(logging.Handler):
        def emit(self, record):
            buffer.append(self.format(record))

    cap = _Capture()
    handler.addHandler(cap)
    try:
        rem.sweep_route_entitlement_map(app)
    finally:
        handler.removeHandler(cap)
        handler.setLevel(old_level)

    warnings = buffer
    gap_warnings = [w for w in warnings if "coverage gap" in w]
    drift_warnings = [w for w in warnings if "references missing route" in w]

    assert gap_warnings == [], f"coverage gap warnings: {gap_warnings}"
    assert drift_warnings == [], f"drift warnings: {drift_warnings}"


def test_map_is_nonempty_and_keyed_by_method_path_tuple():
    assert len(rem.ROUTE_ENTITLEMENT_MAP) > 0
    for (method, path), _ in rem.ROUTE_ENTITLEMENT_MAP.items():
        assert isinstance(method, str) and method == method.upper()
        assert isinstance(path, str) and path.startswith("/")
