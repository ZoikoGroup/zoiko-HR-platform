"""
modules/billing/entitlement_service.py
--------------------------------------
Server-authoritative entitlement resolver.

Resolution order for check_entitlement():
  1. hr.ai.autonomous_action → hard-blocked unconditionally (Section 8 E4)
  2. Unknown feature_key → engineering bug: loud in dev, fail-safe NOT_ENTITLED in prod
  3. No PlanEntitlementMapping row for (plan, feature_key, catalog_version) → ENTITLED_NOT_CONFIGURED
  4. Mapping row says NOT_ENTITLED → NOT_ENTITLED
  5. Mapping row says ENTITLED_AVAILABLE but runtime/config dependency unmet → DEPENDENCY_UNAVAILABLE
  6. Policy-level tenant disable → ENTITLED_POLICY_BLOCKED
  7. Otherwise → ENTITLED_AVAILABLE

Five canonical entitlement states:
  ENTITLED_AVAILABLE         Feature is enabled for this org.
  NOT_ENTITLED               Feature is not in the org's plan (upgrade CTA).
  ENTITLED_NOT_CONFIGURED    Feature has no mapping row — product/policy gap, not a paywall.
  DEPENDENCY_UNAVAILABLE     Entitled but runtime prerequisite missing (e.g. no IdP configured).
  ENTITLED_POLICY_BLOCKED    Explicitly disabled by org admin (e.g. Section 8 E3 AI toggle).
"""

import logging
import os
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.cache import get_cached, set_cached, invalidate_cache
from app.modules.billing.feature_keys import FEATURE_KEYS, FEATURE_KEY_REGISTRY_VERSION
from app.modules.billing.models import (
    BillingEntitlementSnapshot,
    BillingSubscription,
    PlanEntitlementMapping,
)

logger = logging.getLogger("zoiko.entitlement")

# ── Canonical entitlement states ────────────────────────────────────────────
ENTITLED_AVAILABLE = "ENTITLED_AVAILABLE"
NOT_ENTITLED = "NOT_ENTITLED"
ENTITLED_NOT_CONFIGURED = "ENTITLED_NOT_CONFIGURED"
DEPENDENCY_UNAVAILABLE = "DEPENDENCY_UNAVAILABLE"
ENTITLED_POLICY_BLOCKED = "ENTITLED_POLICY_BLOCKED"

CANONICAL_STATES = frozenset({
    ENTITLED_AVAILABLE,
    NOT_ENTITLED,
    ENTITLED_NOT_CONFIGURED,
    DEPENDENCY_UNAVAILABLE,
    ENTITLED_POLICY_BLOCKED,
})

_CACHE_PREFIX = "entitlement:"
_CACHE_TTL_SECONDS = 120

_ENVIRONMENT = (os.getenv("ENVIRONMENT") or os.getenv("APP_ENV") or "").strip().lower()
_IS_PROD = _ENVIRONMENT in {"production", "prod", "staging"}


def _is_production() -> bool:
    return _IS_PROD


# ── Snapshot computation ────────────────────────────────────────────────────

def compute_entitlement_snapshot(
    db: Session,
    organization_id: int,
) -> dict:
    """Resolve the org's plan + contract_overrides into a compiled snapshot
    and persist it to billing_entitlement_snapshots.

    Returns a dict with: organization_id, package, plan_code, feature_states,
    contract_overrides, catalog_version, feature_key_registry_version.
    """
    subscription = (
        db.query(BillingSubscription)
        .filter(BillingSubscription.organization_id == organization_id)
        .first()
    )

    plan_code = None
    if subscription and subscription.plan_code:
        plan_code = subscription.plan_code

    # Resolve contract_overrides from existing snapshot or empty
    existing_snapshot = (
        db.query(BillingEntitlementSnapshot)
        .filter(BillingEntitlementSnapshot.organization_id == organization_id)
        .order_by(BillingEntitlementSnapshot.computed_at.desc())
        .first()
    )
    contract_overrides = {}
    if existing_snapshot and existing_snapshot.contract_overrides:
        contract_overrides = existing_snapshot.contract_overrides

    catalog_version = FEATURE_KEY_REGISTRY_VERSION

    # Build feature_states from mapping table for all feature keys
    feature_states = {}
    if plan_code is not None:
        mappings = (
            db.query(PlanEntitlementMapping)
            .filter(
                PlanEntitlementMapping.plan_code == plan_code,
                PlanEntitlementMapping.catalog_version == catalog_version,
            )
            .all()
        )
        mapping_by_key = {m.feature_key: m.state for m in mappings}

        for fk in FEATURE_KEYS:
            # Hard block: AI autonomous action is never entitleable
            if fk == "hr.ai.autonomous_action":
                feature_states[fk] = NOT_ENTITLED
                continue
            state = mapping_by_key.get(fk)
            if state is not None:
                feature_states[fk] = state
            elif fk in contract_overrides:
                feature_states[fk] = contract_overrides[fk]
            else:
                feature_states[fk] = ENTITLED_NOT_CONFIGURED
    else:
        # No plan assigned → every feature is NOT_CONFIGURED
        for fk in FEATURE_KEYS:
            feature_states[fk] = ENTITLED_NOT_CONFIGURED

    # Persist snapshot
    if existing_snapshot:
        existing_snapshot.package = plan_code
        existing_snapshot.contract_overrides = contract_overrides
        existing_snapshot.catalog_version = catalog_version
        existing_snapshot.computed_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.commit()
        db.refresh(existing_snapshot)
        snapshot_id = existing_snapshot.id
    else:
        new_snapshot = BillingEntitlementSnapshot(
            organization_id=organization_id,
            package=plan_code,
            contract_overrides=contract_overrides,
            catalog_version=catalog_version,
        )
        db.add(new_snapshot)
        db.commit()
        db.refresh(new_snapshot)
        snapshot_id = new_snapshot.id

    return {
        "organization_id": organization_id,
        "package": plan_code.value if plan_code else None,
        "plan_code": plan_code.value if plan_code else None,
        "feature_states": feature_states,
        "contract_overrides": contract_overrides,
        "catalog_version": catalog_version,
        "feature_key_registry_version": FEATURE_KEY_REGISTRY_VERSION,
        "snapshot_id": snapshot_id,
    }


# ── Single feature entitlement check ────────────────────────────────────────

def check_entitlement(
    db: Session,
    organization_id: int,
    feature_key: str,
) -> dict:
    """Resolve entitlement for a single feature.

    Returns dict with: state, feature_key, catalog_version.
    """
    # ── Step 3.1: Unknown feature key — engineering bug ──────────────────
    if feature_key not in FEATURE_KEYS:
        if _is_production():
            logger.error(
                "ENTITLEMENT BUG: unknown feature_key '%s' requested for org %d. "
                "Failing safe to NOT_ENTITLED in production.",
                feature_key, organization_id,
            )
            return {
                "state": NOT_ENTITLED,
                "feature_key": feature_key,
                "catalog_version": FEATURE_KEY_REGISTRY_VERSION,
            }
        else:
            raise ValueError(
                f"ENTITLEMENT BUG: '{feature_key}' is not in FEATURE_KEYS. "
                "This indicates a coding error — check the caller."
            )

    # ── Hard block: hr.ai.autonomous_action — Section 8 E4 ──────────────
    # "Block autonomous action routes for consequential decisions."
    # This is a non-negotiable guard clause. No mapping row, override,
    # or plan can override it.
    if feature_key == "hr.ai.autonomous_action":
        return {
            "state": NOT_ENTITLED,
            "feature_key": feature_key,
            "catalog_version": FEATURE_KEY_REGISTRY_VERSION,
        }

    # ── Check cache ──────────────────────────────────────────────────────
    cache_key = f"{_CACHE_PREFIX}{organization_id}:{feature_key}"
    cached = get_cached(cache_key)
    if cached is not None:
        return cached

    # ── Resolve subscription ─────────────────────────────────────────────
    subscription = (
        db.query(BillingSubscription)
        .filter(BillingSubscription.organization_id == organization_id)
        .first()
    )

    plan_code = None
    if subscription and subscription.plan_code:
        plan_code = subscription.plan_code

    # No subscription / no plan → ENTITLED_NOT_CONFIGURED (policy gap, not paywall)
    if plan_code is None:
        result = {
            "state": ENTITLED_NOT_CONFIGURED,
            "feature_key": feature_key,
            "catalog_version": FEATURE_KEY_REGISTRY_VERSION,
        }
        set_cached(cache_key, result)
        return result

    # ── Look up mapping row ──────────────────────────────────────────────
    mapping = (
        db.query(PlanEntitlementMapping)
        .filter(
            PlanEntitlementMapping.plan_code == plan_code,
            PlanEntitlementMapping.feature_key == feature_key,
            PlanEntitlementMapping.catalog_version == FEATURE_KEY_REGISTRY_VERSION,
        )
        .first()
    )

    if mapping is None:
        # No mapping row → ENTITLED_NOT_CONFIGURED (C5: distinct from NOT_ENTITLED)
        result = {
            "state": ENTITLED_NOT_CONFIGURED,
            "feature_key": feature_key,
            "catalog_version": FEATURE_KEY_REGISTRY_VERSION,
        }
        set_cached(cache_key, result)
        return result

    # ── Mapping exists — check state ────────────────────────────────────
    state = mapping.state

    if state == NOT_ENTITLED:
        result = {
            "state": NOT_ENTITLED,
            "feature_key": feature_key,
            "catalog_version": FEATURE_KEY_REGISTRY_VERSION,
        }
        set_cached(cache_key, result)
        return result

    if state == ENTITLED_AVAILABLE:
        # Runtime/config dependency check placeholder.
        # Future: check if SSO IdP is configured, API keys exist, etc.
        # For now, no dependency checks are wired — all entitled features
        # are immediately available. This branch exists so the pattern is
        # ready when dependency checks are added.
        result = {
            "state": ENTITLED_AVAILABLE,
            "feature_key": feature_key,
            "catalog_version": FEATURE_KEY_REGISTRY_VERSION,
        }
        set_cached(cache_key, result)
        return result

    # Any other mapped state (ENTITLED_POLICY_BLOCKED, etc.)
    result = {
        "state": state,
        "feature_key": feature_key,
        "catalog_version": FEATURE_KEY_REGISTRY_VERSION,
    }
    set_cached(cache_key, result)
    return result


def invalidate_entitlement_cache(organization_id: int) -> None:
    """Invalidate all cached entitlement results for an org."""
    invalidate_cache(f"{_CACHE_PREFIX}{organization_id}")
