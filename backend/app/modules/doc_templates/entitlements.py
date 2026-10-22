"""Plan entitlements for templates (Prompt 4 §C6), read from seeds/plan_features.json so pricing is configuration.

`required_features(definition)` lists the billing feature keys a template needs; preflight refuses a template the plan does not
include with PLAN_FEATURE_REQUIRED:<key>, which the UI shows as an upgrade message (never a server error).
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

CONFIG_PATH = Path(__file__).parent / "seeds" / "plan_features.json"


@lru_cache(maxsize=1)
def config() -> dict:
    data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    from app.modules.billing.feature_keys import FEATURE_KEYS
    keys = [data["default"], *data.get("families", {}).values(), *data.get("execution_modes", {}).values(), *data.get("features", {}).values()]
    unknown = sorted({k for k in keys if k not in FEATURE_KEYS})
    if unknown:
        raise ValueError(f"plan_features.json names unknown feature keys: {unknown}")
    return data


def required_features(definition) -> list[str]:
    c = config()
    keys = [c["default"]]
    for extra in (c.get("families", {}).get(definition.family_id), c.get("execution_modes", {}).get(definition.execution_mode)):
        if extra and extra not in keys:
            keys.append(extra)
    return keys


def feature_for(name: str) -> str:
    return config().get("features", {}).get(name) or config()["default"]
