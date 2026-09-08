"""
modules/billing/feature_keys.py
-------------------------------
Feature/module key registry — v2 expands to the ZHR-COM-ENT-001 Appendix A
commercial key list (the "engineering handoff" registry), while keeping the
v1 engineering keys valid and frozen for compatibility.

VERSIONED (FEATURE_KEY_REGISTRY_VERSION) so a future re-key never silently
breaks stored mappings in plan_entitlement_mappings. v2 = "Appendix A
expansion": every Appendix A row is now a valid key plus every legacy v1 key
remains resolvable (this file must never delete a key that Product or a
running process depends on — retire, don't remove).

GENERIC (not organized by Core/Advanced/Enterprise) — the plan→feature
mapping lives in the data table, never in code.

DO NOT add per-capability sub-keys. One key per functional module boundary.
Product decides granularity later — that's a data migration, not code.
"""

FEATURE_KEY_REGISTRY_VERSION = "v2"

# ── Canonical commercial registry — ZHR-COM-ENT-001 Appendix A ─────────────
# Stable semantic keys; marketing labels may change. Copy of the spec rows.

_APPENDIX_A_KEYS: frozenset[str] = frozenset({
    "hr.admin.delegation",
    "hr.ai.autonomous_decision",
    "hr.ai.custom_sources",
    "hr.ai.draft_summary",
    "hr.ai.governance_admin",
    "hr.ai.navigation",
    "hr.ai.policy_qa",
    "hr.ai.workflow_assist",
    "hr.ai.workforce_query",
    "hr.api.read",
    "hr.api.webhooks",
    "hr.api.write",
    "hr.documents.bulk",
    "hr.documents.core",
    "hr.documents.policies",
    "hr.documents.workflow",
    "hr.enterprise.data_options",
    "hr.enterprise.sandbox",
    "hr.identity.conditional_access",
    "hr.identity.multi_idp",
    "hr.identity.scim",
    "hr.identity.sso",
    "hr.integration.custom",
    "hr.integration.file_exchange",
    "hr.integration.standard",
    "hr.integration.zoiko_connector",
    "hr.leave.advanced",
    "hr.leave.core",
    "hr.leave.global",
    "hr.leave.policies",
    "hr.lifecycle.automation",
    "hr.lifecycle.offboarding",
    "hr.lifecycle.onboarding",
    "hr.lifecycle.tasks",
    "hr.mobile.companion",
    "hr.org.directory",
    "hr.org.jobs",
    "hr.org.legal_entities",
    "hr.org.positions",
    "hr.org.structure",
    "hr.performance.cycles",
    "hr.performance.goals",
    "hr.performance.one_to_one",
    "hr.performance.reporting",
    "hr.records",
    "hr.records.custom_fields",
    "hr.records.effective_changes",
    "hr.records.history",
    "hr.reporting.builder",
    "hr.reporting.cross_entity",
    "hr.reporting.dashboards_custom",
    "hr.reporting.export",
    "hr.reporting.governed_sharing",
    "hr.reporting.metric_governance",
    "hr.reporting.scheduled",
    "hr.reporting.standard",
    "hr.reporting.templates",
    "hr.self_service.employee",
    "hr.self_service.manager",
    "hr.service.implementation",
    "hr.service.integration",
    "hr.service.migration",
    "hr.support.named_success",
    "hr.support.priority",
    "hr.support.sla",
    "hr.support.standard",
    "hr.workflow.builder",
    "hr.workflow.bulk_actions",
    "hr.workflow.conditional",
    "hr.workflow.dual_control",
    "hr.workflow.standard",
})

# ── Legacy v1 engineering keys ─────────────────────────────────────────────
# Predate Appendix A. Frozen for compatibility — never renamed, never removed
# silently. Some have a one-to-one Appendix A sibling (see FEATURE_KEY_CANONICAL);
# others (attendance, recruitment, travel, learning, assets, compensation,
# compliance, engagement, workforce planning) have no Appendix A row and remain
# the registry entry — Appendix A simply lists commercial-facing keys, it does
# not disown those modules. Commercial-gating decisions on legacy-only keys are
# a Product/dataset question, not an engineering rename.
_LEGACY_KEYS: frozenset[str] = frozenset({
    "hr.core.employees",
    "hr.core.departments",
    "hr.core.designations",
    "hr.core.org_config",
    "hr.attendance.core",
    "hr.attendance.shift_rostering",
    "hr.leave.core",                      # dup of hr.leave.core — kept harmless
    "hr.assets.core",
    "hr.compensation.core",
    "hr.compliance.core",
    "hr.engagement.surveys",
    "hr.ess.core",
    "hr.onboarding.core",
    "hr.performance.core",
    "hr.recruitment.core",
    "hr.travel.core",
    "hr.learning.core",
    "hr.documents.bulk_distribution",
    "hr.workforce_planning.core",
    "hr.identity.sso",                    # dup — matches Appendix A exactly
    "hr.identity.scim",                   # dup — matches Appendix A exactly
    "hr.integration.api_read",
    "hr.integration.api_write",
    "hr.integration.file_exchange",       # dup — matches Appendix A exactly
    "hr.integration.custom_connector",
})

# NOTE: hr.ai.autonomous_action is intentionally ABSENT — it was retired from
# the runtime registry in Phase 11. Canonicalization routes it through
# FEATURE_KEY_CANONICAL (and the feature_key_alias table) onto the Appendix A
# hr.ai.autonomous_decision key, which is a permanent hard block. Keeping a
# retired key in the registry would defeat the "only alias seed + tests
# reference the legacy spelling" acceptance bar.

# ── Canonical aliasing (informational, Phase 3b seed-migration target) ─────
# Legacy engineering key → Appendix A sibling when a clean one-to-one exists.
# v2 does NOT auto-canonicalize inside the resolver (stored rows, exceptions
# and downgrade impact items must migrate in lock-step via the approved seed
# script); the table exists for observability and for that future migration.
FEATURE_KEY_CANONICAL: dict[str, str] = {
    "hr.core.employees": "hr.records",
    "hr.core.departments": "hr.org.structure",
    "hr.ess.core": "hr.self_service.employee",
    "hr.onboarding.core": "hr.lifecycle.onboarding",
    "hr.performance.core": "hr.performance.cycles",
    "hr.documents.bulk_distribution": "hr.documents.bulk",
    "hr.integration.api_read": "hr.api.read",
    "hr.integration.api_write": "hr.api.write",
    "hr.integration.custom_connector": "hr.integration.custom",
    "hr.ai.autonomous_action": "hr.ai.autonomous_decision",
}

FEATURE_KEYS: frozenset[str] = _APPENDIX_A_KEYS | _LEGACY_KEYS


def is_valid_feature_key(feature_key: str) -> bool:
    """Check if a feature key is in the registry (canonical or legacy)."""
    return feature_key in FEATURE_KEYS


def canonical_feature_key(feature_key: str) -> str:
    """Return the Appendix A sibling for a legacy engineering key, or the key
    itself when no canonical alias exists."""
    return FEATURE_KEY_CANONICAL.get(feature_key, feature_key)


# ── Evaluation (trial) profile — ZHR-COM-ENT-001 §7.1 ───────────────────────
# During an active evaluation, core HR/self-service, multi-entity, custom
# workflow, performance and custom-reporting-shaped modules are enabled;
# SSO/SCIM/API/webhook/custom-connector integration plus governed/advanced AI
# are sandboxed (excluded here, resolved to TRIAL_RESTRICTED instead of
# ENTITLED_AVAILABLE); autonomous AI is never entitleable regardless of profile.
_TRIAL_EXCLUDED_FEATURE_KEYS: frozenset[str] = frozenset({
    key
    for key in FEATURE_KEYS
    if key.startswith(("hr.ai.", "hr.integration.", "hr.identity.", "hr.api."))
})

TRIAL_PROFILE_FEATURE_KEYS: frozenset[str] = frozenset(
    FEATURE_KEYS - _TRIAL_EXCLUDED_FEATURE_KEYS
)