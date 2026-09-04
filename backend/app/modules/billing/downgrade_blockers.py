"""
modules/billing/downgrade_blockers.py
--------------------------------------
Declarative blocker detection for plan downgrades.

Per Section 20 of the PRD, a downgrade may be blocked when the target plan
lacks capacity/features the org currently depends on. Seven categories:

  1. SSO        — hr.identity.sso entitlement
  2. Integration — hr.integration.* entitlements
  3. Retention  — hr.compliance.core (data retention)
  4. Storage    — hr.documents.core (document storage)
  5. Workflow   — hr.attendance.shift_rostering (approval chains)
  6. AI         — hr.ai.autonomous_action (hard-blocked, never passes)
  7. Governance — hr.compliance.core (compliance governance)

All checks use feature keys that exist in FEATURE_KEYS.
If current plan has feature as ENTITLED_AVAILABLE but target plan doesn't,
downgrade is blocked for that category.

Each check function returns a list of Blocker dataclasses.
All checks are pure DB queries — no Stripe calls, no side effects.
"""

import logging
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.modules.billing.entitlement_service import (
    check_entitlement,
    ENTITLED_AVAILABLE,
)
from app.modules.billing.feature_keys import FEATURE_KEYS

logger = logging.getLogger("zoiko.billing.blockers")


@dataclass
class Blocker:
    category: str
    feature_key: str
    message: str
    severity: str = "blocking"
    details: dict = field(default_factory=dict)


def _check_feature_blocks_downgrade(
    db: Session,
    organization_id: int,
    feature_key: str,
    category: str,
    target_plan_code: str = None,
) -> list[Blocker]:
    """Core helper: check if a single feature key is ENTITLED_AVAILABLE on
    the current plan but won't be on the target plan. Returns one Blocker
    if blocked, empty list otherwise."""
    if feature_key not in FEATURE_KEYS:
        return []

    current = check_entitlement(db, organization_id, feature_key)
    if current["state"] != ENTITLED_AVAILABLE:
        return []

    if target_plan_code is None:
        return [Blocker(
            category=category,
            feature_key=feature_key,
            message=f"Active entitlement '{feature_key}' (state={current['state']}) may be lost on downgrade.",
            severity="blocking",
            details={"current_state": current["state"]},
        )]

    from app.modules.billing.models import PlanEntitlementMapping, PlanCode
    try:
        target_pc = PlanCode(target_plan_code)
    except ValueError:
        return [Blocker(
            category=category,
            feature_key=feature_key,
            message=f"Active entitlement '{feature_key}' (state={current['state']}) may be lost on downgrade.",
            severity="blocking",
            details={"current_state": current["state"]},
        )]

    target_mapping = (
        db.query(PlanEntitlementMapping)
        .filter(
            PlanEntitlementMapping.plan_code == target_pc,
            PlanEntitlementMapping.feature_key == feature_key,
        )
        .first()
    )

    if target_mapping is not None and target_mapping.state == ENTITLED_AVAILABLE:
        return []

    return [Blocker(
        category=category,
        feature_key=feature_key,
        message=f"Active entitlement '{feature_key}' (state={current['state']}) will be lost on downgrade to {target_plan_code}.",
        severity="blocking",
        details={"current_state": current["state"], "target_plan": target_plan_code},
    )]


# ── 1. SSO Blocker ────────────────────────────────────────────────────────

def check_sso_blocker(db: Session, organization_id: int, target_plan_code) -> list[Blocker]:
    """Check if org has active SSO entitlement (hr.identity.sso) that would
    break on downgrade to a plan without it."""
    return _check_feature_blocks_downgrade(db, organization_id, "hr.identity.sso", "sso", target_plan_code)


# ── 2. Integration Blocker ────────────────────────────────────────────────

def check_integration_blocker(db: Session, organization_id: int, target_plan_code) -> list[Blocker]:
    """Check for active integration entitlements (hr.integration.*) that would
    lose capability on downgrade."""
    blockers = []
    for fk in ("hr.integration.api_read", "hr.integration.api_write",
               "hr.integration.file_exchange", "hr.integration.custom_connector"):
        blockers.extend(_check_feature_blocks_downgrade(db, organization_id, fk, "integration", target_plan_code))
    return blockers


# ── 3. Retention Blocker ──────────────────────────────────────────────────

def check_retention_blocker(db: Session, organization_id: int, target_plan_code) -> list[Blocker]:
    """Check if active data retention (hr.compliance.core) exceeds target."""
    return _check_feature_blocks_downgrade(db, organization_id, "hr.compliance.core", "retention", target_plan_code)


# ── 4. Storage Blocker ────────────────────────────────────────────────────

def check_storage_blocker(db: Session, organization_id: int, target_plan_code) -> list[Blocker]:
    """Check if document storage (hr.documents.core) entitlement would be lost."""
    return _check_feature_blocks_downgrade(db, organization_id, "hr.documents.core", "storage", target_plan_code)


# ── 5. Workflow Blocker ───────────────────────────────────────────────────

def check_workflow_blocker(db: Session, organization_id: int, target_plan_code) -> list[Blocker]:
    """Check if workflow/shift rostering (hr.attendance.shift_rostering) would be lost."""
    return _check_feature_blocks_downgrade(db, organization_id, "hr.attendance.shift_rostering", "workflow", target_plan_code)


# ── 6. AI Blocker ─────────────────────────────────────────────────────────

def check_ai_blocker(db: Session, organization_id: int, target_plan_code) -> list[Blocker]:
    """Check AI features. hr.ai.autonomous_action is hard-blocked to NOT_ENTITLED
    by the entitlement engine (Section 8 E4), so it never passes. This check
    is forward-compatible for when entitleable AI features are added."""
    return _check_feature_blocks_downgrade(db, organization_id, "hr.ai.autonomous_action", "ai", target_plan_code)


# ── 7. Governance Blocker ─────────────────────────────────────────────────

def check_governance_blocker(db: Session, organization_id: int, target_plan_code) -> list[Blocker]:
    """Check compliance governance (hr.compliance.core)."""
    return _check_feature_blocks_downgrade(db, organization_id, "hr.compliance.core", "governance", target_plan_code)


# ── Composite runner ──────────────────────────────────────────────────────

ALL_CHECKS = [
    check_sso_blocker,
    check_integration_blocker,
    check_retention_blocker,
    check_storage_blocker,
    check_workflow_blocker,
    check_ai_blocker,
    check_governance_blocker,
]


def detect_all_blockers(
    db: Session,
    organization_id: int,
    target_plan_code: str,
) -> list[Blocker]:
    """Run all seven blocker checks and return aggregated results."""
    all_blockers: list[Blocker] = []
    for check_fn in ALL_CHECKS:
        try:
            blockers = check_fn(db, organization_id, target_plan_code)
            all_blockers.extend(blockers)
        except Exception as e:
            logger.error(
                "[blocker] %s check failed for org %d: %s",
                check_fn.__name__, organization_id, e,
            )
            all_blockers.append(Blocker(
                category=check_fn.__name__.replace("check_", "").replace("_blocker", ""),
                feature_key="error",
                message=f"Blocker check {check_fn.__name__} failed: {e}",
                severity="error",
            ))
    return all_blockers


def has_blocking_blockers(blockers: list[Blocker]) -> bool:
    """True if any blocker has severity 'blocking' (not 'warning' or 'error')."""
    return any(b.severity == "blocking" for b in blockers)


def blockers_to_dict(blockers: list[Blocker]) -> list[dict]:
    """Serialize blocker list to JSON-safe dicts."""
    return [
        {
            "category": b.category,
            "feature_key": b.feature_key,
            "message": b.message,
            "severity": b.severity,
            "details": b.details,
        }
        for b in blockers
    ]
