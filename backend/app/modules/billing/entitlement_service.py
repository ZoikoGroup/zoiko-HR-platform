"""
modules/billing/entitlement_service.py
---------------------------------------
Server-authoritative entitlement resolver.

Resolution order for check_entitlement() (ZHR-COM-ENT-001 §15 / §19.1):
  0. Canonicalize legacy feature keys through feature_key_alias / FEATURE_KEY_CANONICAL
     (deprecation-logged; README: a retired key must never reach a mapping lookup)
  1. Unknown feature_key → engineering bug: loud in dev, fail-safe NOT_ENTITLED in prod
  2. hr.ai.autonomous_decision → hard-blocked unconditionally (Section 8 E4;
     the retired hr.ai.autonomous_action spelling reaches this via step 0)
  3. Open delinquency case past a restriction threshold → DELINQUENCY_RESTRICTED
     (billing/payment policy beats every override below it — a controlled
     exception cannot silently resurrect a payment-restricted feature)
  4. Cache check (app/core/cache.py — shared across workers/instances via
     Redis when HR_REDIS_URL is set; falls back to a process-local cache
     otherwise, which is NOT safe once more than one worker/instance is
     running. See that module's docstring for the fail-closed contract.)
  5. Active commercial exception (operator-approved, time-bound) → overrides the
     plan decision with ENABLED / READ_ONLY (Section 19.1 sanctioned path)
  6. subscription.status == EVALUATION → trial profile (Section 7.1):
     ENTITLED_AVAILABLE or TRIAL_RESTRICTED
  7. No subscription / no plan → ENTITLED_NOT_CONFIGURED (policy gap, not paywall)
  8. No PlanEntitlementMapping row for (plan, feature_key, catalog_version) →
     ENTITLED_NOT_CONFIGURED
  9. Mapping row says NOT_ENTITLED → NOT_ENTITLED
 10. Mapping row says ENTITLED_AVAILABLE but runtime/config dependency unmet →
     DEPENDENCY_UNAVAILABLE (pattern reserved; not yet wired)
 11. Any other mapped state → passed through

States vs modes: `state` is the historical six-value vocabulary kept for
compatibility; `mode` is the Section 14.1 nine-mode spec vocabulary and
`reason_code` is the Section 15.1 proof behind each decision. Every result
carries { state, feature_key, catalog_version, allowed, mode, reason_code,
required_plan, limit_ref, retryable, snapshot_version, correlation_id }.

States:
  ENTITLED_AVAILABLE         Feature is enabled for this org (mode ENABLED).
  READ_ONLY                  Historic/configured data viewable; no mutation
                             (mode READ_ONLY — used by approved exceptions and,
                             Phase 2, downgrade-pending).
  NOT_ENTITLED               Feature is not in the org's plan (upgrade CTA).
  ENTITLED_NOT_CONFIGURED    No mapping row — product/policy gap, not a paywall.
  DEPENDENCY_UNAVAILABLE     Entitled but runtime prerequisite missing.
  ENTITLED_POLICY_BLOCKED    Explicitly disabled by org admin / AI policy.
  TRIAL_RESTRICTED           Outside the evaluation profile (Section 7.1).
  DELINQUENCY_RESTRICTED     Payment-state restriction (mode RESTRICTED_BILLING).

While an org's subscription is in SubscriptionStatus.EVALUATION, plan_code is
always None (start_evaluation never sets it), so both resolvers check
evaluation status *before* falling through to the plan_code-based lookup —
otherwise every feature key would resolve to ENTITLED_NOT_CONFIGURED for the
entire trial.
"""

import logging
import os
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.cache import get_cached, set_cached, invalidate_cache
from app.modules.billing.feature_keys import (
    FEATURE_KEYS,
    FEATURE_KEY_CANONICAL,
    FEATURE_KEY_REGISTRY_VERSION,
    TRIAL_PROFILE_FEATURE_KEYS,
)
from app.modules.billing.models import (
    BillingEntitlementSnapshot,
    BillingPlanChange,
    BillingSubscription,
    EntitlementMode,
    FeatureKeyAlias,
    PlanChangeStatus,
    PlanChangeType,
    PlanEntitlementMapping,
    SubscriptionStatus,
)

logger = logging.getLogger("zoiko.entitlement")

# ── Canonical entitlement states ────────────────────────────────────────────
ENTITLED_AVAILABLE = "ENTITLED_AVAILABLE"
NOT_ENTITLED = "NOT_ENTITLED"
ENTITLED_NOT_CONFIGURED = "ENTITLED_NOT_CONFIGURED"
DEPENDENCY_UNAVAILABLE = "DEPENDENCY_UNAVAILABLE"
ENTITLED_POLICY_BLOCKED = "ENTITLED_POLICY_BLOCKED"
TRIAL_RESTRICTED = "TRIAL_RESTRICTED"
READ_ONLY = "READ_ONLY"                 # Section 14.1 — historic/config data, no mutation
DELINQUENCY_RESTRICTED = "DELINQUENCY_RESTRICTED"

# Section 8 E4 hard block — the Appendix A canonical spelling of autonomous
# consequential AI decisions is NEVER entitleable, exceptionable,
# trial-profileable or downgrade-affected. The retired legacy engineering key
# (hr.ai.autonomous_action) reaches this guard through alias canonicalization
# at the top of check_entitlement() (Phase 11) — it must never be looked up as a
# mapping row directly.
_HARD_BLOCKED_AUTONOMOUS_KEYS = frozenset({
    "hr.ai.autonomous_decision",
})

CANONICAL_STATES = frozenset({
    ENTITLED_AVAILABLE,
    READ_ONLY,
    NOT_ENTITLED,
    ENTITLED_NOT_CONFIGURED,
    DEPENDENCY_UNAVAILABLE,
    ENTITLED_POLICY_BLOCKED,
    TRIAL_RESTRICTED,
})

# Section 15.1 mandatory reason codes — the full spec vocabulary. Several are
# reserved for layers that gate before the resolver runs (ROLE_DENIED,
# TENANT_SCOPE_DENIED) or for later phases (JURISDICTION_BLOCKED,
# LIMIT_REACHED, INCIDENT_DISABLED); the resolver itself emits the reachable
# subset today.
REASON_CODES = frozenset({
    "PLAN_REQUIRED",
    "ROLE_DENIED",
    "TENANT_SCOPE_DENIED",
    "TRIAL_RESTRICTED",
    "SUBSCRIPTION_INACTIVE",
    "PAYMENT_RESTRICTED",
    "CONFIG_REQUIRED",
    "DEPENDENCY_REQUIRED",
    "POLICY_BLOCKED",
    "JURISDICTION_BLOCKED",
    "LIMIT_REACHED",
    "INCIDENT_DISABLED",
    "DOWNGRADE_PENDING_READ_ONLY",
})

# Subscription states that mean "no active commercial service". A canceled/
# terminated/suspended sub must not keep resolving plan mappings — that is a
# free access smuggling hole. CANCEL_AT_PERIOD_END stays entitled (grace).
_SUBSCRIPTION_INACTIVE = frozenset({
    SubscriptionStatus.CANCELED,
    SubscriptionStatus.TERMINATED,
    SubscriptionStatus.SUSPENDED,
    SubscriptionStatus.RESTRICTED,
    SubscriptionStatus.EVALUATION_EXPIRED,
})

# A scheduled downgrade flips at-risk features to READ_ONLY during the pending
# window (reason DOWNGRADE_PENDING_READ_ONLY) so the org can see/prepare data
# while the mutation remains blocked.
_DOWNGRADE_READ_ONLY_MODES = frozenset({"read_only"})

# Section 15.1 reason codes attached to each state. Allowed decisions
# (ENABLED / READ_ONLY) carry reason_code=None; blocked ones carry the proof.
_MODE_REASON_BY_STATE: dict[str, tuple[str, str | None, bool]] = {
    ENTITLED_AVAILABLE: (EntitlementMode.ENABLED.value, None, True),
    READ_ONLY: (EntitlementMode.READ_ONLY.value, None, True),
    NOT_ENTITLED: (EntitlementMode.DISABLED_PLAN.value, "PLAN_REQUIRED", False),
    ENTITLED_NOT_CONFIGURED: (EntitlementMode.CONFIG_REQUIRED.value, "CONFIG_REQUIRED", True),
    DEPENDENCY_UNAVAILABLE: (EntitlementMode.DEPENDENCY_REQUIRED.value, "DEPENDENCY_REQUIRED", True),
    ENTITLED_POLICY_BLOCKED: (EntitlementMode.POLICY_BLOCKED.value, "POLICY_BLOCKED", False),
    TRIAL_RESTRICTED: (EntitlementMode.DISABLED_PLAN.value, "TRIAL_RESTRICTED", False),
    DELINQUENCY_RESTRICTED: (EntitlementMode.RESTRICTED_BILLING.value, "PAYMENT_RESTRICTED", True),
}


def _trial_profile_state(feature_key: str) -> str:
    """Resolve a feature key's state for an org currently in evaluation
    (Section 7.1). hr.ai.autonomous_action is handled by its own hard-block
    before either resolver reaches this helper, so it never appears here."""
    return ENTITLED_AVAILABLE if feature_key in TRIAL_PROFILE_FEATURE_KEYS else TRIAL_RESTRICTED


def _required_plan(db: Session, feature_key: str) -> str | None:
    """Cheapest plan that grants the feature today (Section 15 required_plan).
    Returns the lowest plan_code with an ENTITLED_AVAILABLE mapping at the
    current registry version, or None when no plan provides it."""
    rows = (
        db.query(PlanEntitlementMapping)
        .filter(
            PlanEntitlementMapping.feature_key == feature_key,
            PlanEntitlementMapping.catalog_version == FEATURE_KEY_REGISTRY_VERSION,
            PlanEntitlementMapping.state == ENTITLED_AVAILABLE,
        )
        .all()
    )
    if not rows:
        return None
    codes = {getattr(r.plan_code, "value", r.plan_code) for r in rows}
    return min(codes) if codes else None


def _plan_code_value(plan_code) -> str | None:
    """plan_code may be a PlanCode enum or a plain string depending on the
    call site; normalize both to its string value."""
    if plan_code is None:
        return None
    return getattr(plan_code, "value", plan_code)


def _pending_downgrade_lost_keys(db: Session, organization_id: int) -> frozenset[str]:
    """Keys an org is scheduled to lose via a pending downgrade. During the
    pending window these flip to READ_ONLY with reason
    DOWNGRADE_PENDING_READ_ONLY so data stays visible but mutations stop."""
    rows = (
        db.query(BillingPlanChange)
        .filter(
            BillingPlanChange.organization_id == organization_id,
            BillingPlanChange.status == PlanChangeStatus.SCHEDULED,
            BillingPlanChange.change_type == PlanChangeType.DOWNGRADE,
        )
        .all()
    )
    lost = set()
    for change in rows:
        for fk in (change.entitlement_delta or {}).get("lost", []) or []:
            # Stored deltas may carry a legacy spelling; canonicalize so a
            # retired key still maps onto the feature being resolved (Phase 11).
            lost.add(resolve_canonical_feature_key(db, fk))
    return frozenset(lost)


def _decorate(feature_key: str, state: str, *, mode: str | None = None,
              reason_code: str | None = None, required_plan: str | None = None,
              limit_ref: str | None = None) -> dict:
    """Build the Section 15 decision object for a state. Keeps `state` and
    `catalog_version` for historical compatibility and appends the spec's
    allowed / mode / reason_code / required_plan / limit_ref / retryable /
    snapshot_version / correlation_id."""
    default_mode, default_reason, retryable = _MODE_REASON_BY_STATE.get(state, (
        state, None, True,
    ))
    return {
        "state": state,
        "feature_key": feature_key,
        "catalog_version": FEATURE_KEY_REGISTRY_VERSION,
        "allowed": state in (ENTITLED_AVAILABLE, READ_ONLY),
        "mode": mode if mode is not None else default_mode,
        "reason_code": reason_code if reason_code is not None else default_reason,
        "required_plan": required_plan,
        "limit_ref": limit_ref,
        "retryable": retryable,
        "snapshot_version": FEATURE_KEY_REGISTRY_VERSION,
        "correlation_id": None,
    }


def _exception_override(db: Session, organization_id: int, feature_key: str) -> str | None:
    """Return the override state for an approved, in-window commercial
    exception (Section 19.1), or None. ENABLED → ENTITLED_AVAILABLE,
    READ_ONLY → READ_ONLY."""
    from app.modules.billing.exception_service import get_active_exception
    from app.modules.billing.models import EntitlementMode as _Mode

    exc = get_active_exception(db, organization_id, feature_key)
    if exc is None:
        return None
    return ENTITLED_AVAILABLE if exc.mode == _Mode.ENABLED else READ_ONLY


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
    """Resolve the org's plan + contract_overrides + active exceptions into a
    compiled snapshot and persist it to billing_entitlement_snapshots.

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
    if subscription and subscription.status == SubscriptionStatus.EVALUATION:
        # Evaluating orgs never have a plan_code — resolve against the trial
        # profile (Section 7.1) instead of falling through to "no plan".
        for fk in FEATURE_KEYS:
            if fk in _HARD_BLOCKED_AUTONOMOUS_KEYS:
                feature_states[fk] = NOT_ENTITLED
                continue
            feature_states[fk] = _trial_profile_state(fk)
    elif plan_code is not None:
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
            if fk in _HARD_BLOCKED_AUTONOMOUS_KEYS:
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

    # Pending-downgrade override: features scheduled to be lost flip to
    # READ_ONLY in the compiled snapshot during the pending window.
    for fk in _pending_downgrade_lost_keys(db, organization_id):
        if fk in _HARD_BLOCKED_AUTONOMOUS_KEYS:
            continue  # hard block is absolute
        if fk in feature_states:
            feature_states[fk] = READ_ONLY

    # Section 19.1: active commercial exceptions override the plan decision.
    # Applied AFTER plan resolution so the exception is the effective mode of
    # record, while the original plan decision is visible in the audit trail.
    from app.modules.billing.exception_service import get_active_exceptions_for_org
    for exc in get_active_exceptions_for_org(db, organization_id):
        if exc.feature_key in _HARD_BLOCKED_AUTONOMOUS_KEYS:
            continue  # hard block is absolute — no exception may revive it
        feature_states[exc.feature_key] = (
            ENTITLED_AVAILABLE if exc.mode == EntitlementMode.ENABLED else READ_ONLY
        )

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

# Feature keys whose use is "new commercial expansion / cost-increasing" and so
# are restricted from day 10, or "non-essential write-heavy / premium" and so are
# restricted from day 20 (Section 10 G2/G3). Read-only, privacy/legal-hold,
# billing-remediation and export paths are intentionally NOT restricted.
# Feature keys whose use is "new commercial expansion / cost-increasing" and so
# are restricted from day 10, or "non-essential write-heavy / premium" and so are
# restricted from day 20 (Section 10 G2/G3). Read-only, privacy/legal-hold,
# billing-remediation and export paths are intentionally NOT restricted.
_DAY_10_RESTRICTED_KEYS = frozenset({
    "hr.integration.sso",
    "hr.integration.scim",
    "hr.integration.api_write",
    "hr.integration.custom_connector",
    "hr.integration.file_exchange",
    "hr.integration.standard",
    "hr.api.webhooks",
    "hr.api.write",
    "hr.identity.conditional_access",
    "hr.identity.multi_idp",
    "hr.documents.bulk_distribution",
    "hr.documents.bulk",
    "hr.identity.sso",
    "hr.identity.scim",
})

_DAY_20_RESTRICTED_KEYS = _DAY_10_RESTRICTED_KEYS | frozenset({
    "hr.workforce_planning.core",
    "hr.onboarding.core",
    "hr.reporting.governed_sharing",
    "hr.workflow.bulk_actions",
    "hr.workflow.dual_control",
})


def _delinquency_gate(db: Session, organization_id: int, feature_key: str) -> dict | None:
    """If the organization has an open delinquency case whose stage has passed
    a restriction threshold, return a blocked entitlement dict; otherwise None.

    Day 20 additionally applies a controlled service restriction, but critical
    read / remediation / privacy / export paths are never blocked here."""
    from app.modules.billing.delinquency_service import get_open_case
    from app.modules.billing.models import DelinquencyStage

    case = get_open_case(db, organization_id)
    if case is None:
        return None

    def _restricted(feature_key: str, stage_value: str) -> dict:
        d = _decorate(feature_key, DELINQUENCY_RESTRICTED)
        d["delinquency_stage"] = stage_value  # back-compat key (Section 10 consumers)
        return d

    if case.stage == DelinquencyStage.DAY_10_RESTRICT:
        if feature_key in _DAY_10_RESTRICTED_KEYS:
            return _restricted(feature_key, case.stage.value)
        return None

    if case.stage == DelinquencyStage.DAY_20_RESTRICT:
        if feature_key in _DAY_20_RESTRICTED_KEYS:
            return _restricted(feature_key, case.stage.value)
        return None

    if case.stage == DelinquencyStage.DAY_45_TERMINATION:
        # G5: normal service ends at termination; read/export/privacy paths
        # remain governed separately and are not blocked here.
        if feature_key in _DAY_20_RESTRICTED_KEYS:
            return _restricted(feature_key, case.stage.value)
        return None

    return None


def resolve_canonical_feature_key(db: Session, feature_key: str) -> str:
    """Canonicalize a legacy engineering key onto its Appendix A sibling.

    Authoritative source is the feature_key_alias table (Phase 11 seed
    migration); FEATURE_KEY_CANONICAL is the in-code fallback so dev databases
    that never ran migrations still canonicalize. Every alias hit logs a
    deprecation warning — the key is talking the wrong vocabulary and callers
    should migrate (retire, don't silently rename)."""
    alias = db.query(FeatureKeyAlias).filter(
        FeatureKeyAlias.alias_key == feature_key,
    ).first()
    if alias is not None:
        logger.warning(
            "[entitlement] deprecated feature_key '%s' canonicalized to '%s' (feature_key_alias).",
            feature_key, alias.canonical_key,
        )
        return alias.canonical_key
    canonical = FEATURE_KEY_CANONICAL.get(feature_key)
    if canonical is not None:
        logger.warning(
            "[entitlement] deprecated feature_key '%s' canonicalized to '%s' (code fallback).",
            feature_key, canonical,
        )
        return canonical
    return feature_key


def check_entitlement(
    db: Session,
    organization_id: int,
    feature_key: str,
) -> dict:
    """Resolve entitlement for a single feature (Section 15 contract).

    Returns a Section 15 decision dict: state, feature_key, catalog_version,
    mode, reason_code, retryable, snapshot_version, correlation_id.
    """
    # ── Step 0: Canonicalize legacy keys (Phase 11) ────────────────────────
    # A deprecated engineering key (e.g. hr.ai.autonomous_action) is resolved
    # onto its Appendix A sibling BEFORE the validity / hard-block checks, so a
    # retired spelling can never bypass E4 or land in a mapping row. The
    # decision echoes the canonical key so consumers converge on one spelling.
    feature_key = resolve_canonical_feature_key(db, feature_key)

    # ── Step 1: Unknown feature key — engineering bug ────────────────────
    if feature_key not in FEATURE_KEYS:
        if _is_production():
            logger.error(
                "ENTITLEMENT BUG: unknown feature_key '%s' requested for org %d. "
                "Failing safe to NOT_ENTITLED in production.",
                feature_key, organization_id,
            )
            return _decorate(feature_key, NOT_ENTITLED)
        else:
            raise ValueError(
                f"ENTITLEMENT BUG: '{feature_key}' is not in FEATURE_KEYS. "
                "This indicates a coding error — check the caller."
            )

    # ── Step 2: Hard block: autonomous AI decisions — Section 8 E4 ──────────
    # "Block autonomous action routes for consequential decisions."
    # This is a non-negotiable guard clause. No mapping row, override,
    # exception, or plan can override it. The canonical Appendix A spelling is
    # guarded here; the retired legacy spelling was canonicalized in Step 0.
    if feature_key in _HARD_BLOCKED_AUTONOMOUS_KEYS:
        return _decorate(feature_key, NOT_ENTITLED)

    # ── Step 3: Delinquency gate (Section 10 G1-G3) ─────────────────────
    # Server-authoritative (not frontend-banner dependent): if the org has an
    # open delinquency case past day 10/20, cost-increasing / new-commercial
    # expansion and non-essential write actions are restricted here at the
    # entitlement layer, before any plan mapping is consulted. A controlled
    # exception (step 5) cannot override payment-policy restriction.
    gate = _delinquency_gate(db, organization_id, feature_key)
    if gate is not None:
        return gate

    # ── Step 4: Cache check ──────────────────────────────────────────────
    cache_key = f"{_CACHE_PREFIX}{organization_id}:{feature_key}"
    cached = get_cached(cache_key)
    if cached is not None:
        return cached

    # ── Step 5: Active commercial exception (§19.1 approved override) ────
    override = _exception_override(db, organization_id, feature_key)
    if override is not None:
        result = _decorate(feature_key, override)
        set_cached(cache_key, result)
        return result

    # ── Resolve subscription ─────────────────────────────────────────────
    subscription = (
        db.query(BillingSubscription)
        .filter(BillingSubscription.organization_id == organization_id)
        .first()
    )

    plan_code = None
    if subscription and subscription.plan_code:
        plan_code = subscription.plan_code

    # ── Step 6: Evaluating orgs (trial profile, Section 7.1) ─────────────
    if subscription and subscription.status == SubscriptionStatus.EVALUATION:
        result = _decorate(feature_key, _trial_profile_state(feature_key))
        set_cached(cache_key, result)
        return result

    # ── Step 6b: Inactive subscription → no commercial service ───────────
    # CANCELED / TERMINATED / SUSPENDED / RESTRICTED / EVALUATION_EXPIRED subs
    # must not keep resolving plan mappings (free-access smuggling hole).
    # Distinct from delinquency (PAYMENT_RESTRICTED), which runs earlier.
    if subscription and subscription.status in _SUBSCRIPTION_INACTIVE:
        result = _decorate(feature_key, NOT_ENTITLED, reason_code="SUBSCRIPTION_INACTIVE")
        set_cached(cache_key, result)
        return result

    # ── Step 6c: Pending downgrade → READ_ONLY during the pending window ─
    # A feature scheduled to be lost by a running downgrade is clamped to
    # READ_ONLY now (reason DOWNGRADE_PENDING_READ_ONLY) so the org can
    # prepare/export before the planned loss lands.
    if feature_key in _pending_downgrade_lost_keys(db, organization_id):
        result = _decorate(
            feature_key,
            READ_ONLY,
            reason_code="DOWNGRADE_PENDING_READ_ONLY",
        )
        set_cached(cache_key, result)
        return result

    # ── Step 7: No subscription / no plan → ENTITLED_NOT_CONFIGURED ──────
    if plan_code is None:
        result = _decorate(feature_key, ENTITLED_NOT_CONFIGURED)
        set_cached(cache_key, result)
        return result

    # ── Step 8: Look up mapping row ──────────────────────────────────────
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
        result = _decorate(
            feature_key,
            ENTITLED_NOT_CONFIGURED,
            required_plan=_required_plan(db, feature_key),
        )
        set_cached(cache_key, result)
        return result

    # ── Mapping exists — check state ────────────────────────────────────
    state = mapping.state

    if state == NOT_ENTITLED:
        result = _decorate(
            feature_key,
            NOT_ENTITLED,
            mode=mapping.mode,
            limit_ref=mapping.limit_ref,
            required_plan=_required_plan(db, feature_key),
        )
        set_cached(cache_key, result)
        return result

    if state == ENTITLED_AVAILABLE:
        # Runtime/config dependency check placeholder.
        # Future: check if SSO IdP is configured, API keys exist, etc.
        result = _decorate(
            feature_key,
            ENTITLED_AVAILABLE,
            mode=mapping.mode,
            limit_ref=mapping.limit_ref,
            required_plan=_plan_code_value(plan_code),
        )
        set_cached(cache_key, result)
        return result

    # Any other mapped state (ENTITLED_POLICY_BLOCKED, READ_ONLY, etc.)
    result = _decorate(
        feature_key,
        state,
        mode=mapping.mode,
        limit_ref=mapping.limit_ref,
        required_plan=_plan_code_value(plan_code),
    )
    set_cached(cache_key, result)
    return result


def invalidate_entitlement_cache(organization_id: int) -> None:
    """Invalidate all cached entitlement results for an org."""
    invalidate_cache(f"{_CACHE_PREFIX}{organization_id}")