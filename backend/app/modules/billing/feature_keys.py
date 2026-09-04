"""
modules/billing/feature_keys.py
-------------------------------
Engineering-drafted, tier-agnostic feature/module key registry.

This file is a TECHNICAL INVENTORY of functional modules and capabilities
that exist (or are planned) in the HR platform. It is:

  - VERSIONED (FEATURE_KEY_REGISTRY_VERSION) so a future re-key never
    silently breaks stored mappings in plan_entitlement_mappings.
  - GENERIC (not organized by Core/Advanced/Enterprise) — the plan→feature
    mapping lives in the data table, never in code.
  - PENDING Product naming/approval — keys reflect engineering module
    boundaries (TABLE_OWNERSHIP.md, router tree), not marketing names.

DO NOT add per-capability sub-keys (e.g. individual assistant routes).
One key per functional module boundary. Product decides granularity later
if needed — that's a data migration, not a code change.
"""

FEATURE_KEY_REGISTRY_VERSION = "v1-engineering-draft"

FEATURE_KEYS: frozenset[str] = frozenset({
    # ── Core HR & org structure ──────────────────────────────────────────
    "hr.core.employees",
    "hr.core.departments",
    "hr.core.designations",
    "hr.core.org_config",
    # ── Attendance & shifts ──────────────────────────────────────────────
    "hr.attendance.core",
    "hr.attendance.shift_rostering",
    # ── Leave ────────────────────────────────────────────────────────────
    "hr.leave.core",
    # ── Assets ───────────────────────────────────────────────────────────
    "hr.assets.core",
    # ── Compensation (structures only — no payroll processing) ──────────
    "hr.compensation.core",
    # ── Compliance ───────────────────────────────────────────────────────
    "hr.compliance.core",
    # ── Engagement & ESS ────────────────────────────────────────────────
    "hr.engagement.surveys",
    "hr.ess.core",
    # ── Onboarding ──────────────────────────────────────────────────────
    "hr.onboarding.core",
    # ── Performance ─────────────────────────────────────────────────────
    "hr.performance.core",
    # ── Recruitment ─────────────────────────────────────────────────────
    "hr.recruitment.core",
    # ── Travel & expenses ───────────────────────────────────────────────
    "hr.travel.core",
    # ── Learning ────────────────────────────────────────────────────────
    "hr.learning.core",
    # ── HR documents ────────────────────────────────────────────────────
    "hr.documents.core",
    "hr.documents.bulk_distribution",
    # ── Workforce planning ──────────────────────────────────────────────
    "hr.workforce_planning.core",
    # ── Identity & integration (not yet built — keys exist for future
    #    entitlement checks when these modules land) ─────────────────────
    "hr.identity.sso",
    "hr.identity.scim",
    "hr.integration.api_read",
    "hr.integration.api_write",
    "hr.integration.file_exchange",
    "hr.integration.custom_connector",
    # ── Governed AI (Section 8, E1–E5) ──────────────────────────────────
    # Policy-level key only. Never entitleable — the entitlement engine
    # hard-blocks this unconditionally (see entitlement_service.py).
    "hr.ai.autonomous_action",
})


def is_valid_feature_key(feature_key: str) -> bool:
    """Check if a feature key is in the registry."""
    return feature_key in FEATURE_KEYS
