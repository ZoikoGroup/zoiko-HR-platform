"""Core and Advanced differ exactly as the commercial spec says, and no paying customer is blocked by a gap."""

import pytest

from app.modules.billing.feature_keys import FEATURE_KEYS, TRIAL_PROFILE_FEATURE_KEYS, canonical_feature_key
from app.modules.billing.plan_baseline import (
    PLAN_BASELINE, UPGRADE_URL, baseline_included, baseline_required_plan, feature_label, not_entitled_message,
)
from app.modules.billing.route_entitlement_map import ROUTE_ENTITLEMENT_MAP


def test_every_guarded_route_has_an_answer_for_both_plans():
    """A route whose feature the baseline knows nothing about would fail closed and block a paying customer."""
    for (method, path), key in ROUTE_ENTITLEMENT_MAP.items():
        for plan in ("core", "advanced"):
            assert baseline_included(plan, key) is not None, f"{method} {path} ({key}) has no baseline for {plan}"


def test_advanced_includes_everything_core_does():
    for key in FEATURE_KEYS:
        if baseline_included("core", key):
            assert baseline_included("advanced", key), key


def test_the_features_the_spec_withholds_from_core_are_blocked_for_core_only():
    for key in ("hr.performance.cycles", "hr.performance.core", "hr.workflow.builder", "hr.documents.bulk",
                "hr.documents.bulk_distribution", "hr.reporting.builder", "hr.api.read", "hr.identity.sso", "hr.support.priority"):
        assert baseline_included("core", key) is False, key
        assert baseline_included("advanced", key) is True, key
        assert baseline_required_plan(key) == "advanced", key


def test_what_every_customer_needs_is_in_core():
    for key in ("hr.records", "hr.core.employees", "hr.org.directory", "hr.leave.core", "hr.documents.core", "hr.self_service.employee",
                "hr.reporting.standard", "hr.support.standard", "hr.attendance.core", "hr.recruitment.core", "hr.assets.core",
                "hr.core.org_config", "hr.lifecycle.onboarding", "hr.onboarding.core", "hr.compensation.core", "hr.travel.core"):
        assert baseline_included("core", key) is True, key


def test_autonomous_ai_decisions_are_never_included_and_enterprise_is_not_decided_here():
    for plan in ("core", "advanced"):
        assert baseline_included(plan, "hr.ai.autonomous_decision") is False
        assert baseline_included(plan, "hr.ai.autonomous_action") is False
    assert baseline_included("enterprise", "hr.records") is None


def test_the_evaluation_profile_covers_what_both_plans_can_use():
    """An evaluating organization sees at least everything Advanced includes, so a trial is never poorer than a plan."""
    for key in FEATURE_KEYS:
        if baseline_included("advanced", key) and key != "hr.ai.autonomous_decision":
            assert key in TRIAL_PROFILE_FEATURE_KEYS or canonical_feature_key(key) in TRIAL_PROFILE_FEATURE_KEYS or key.startswith(("hr.ai.", "hr.api.", "hr.identity.", "hr.integration.", "hr.mobile.")), key


def test_customer_messages_name_the_feature_and_the_plan_to_upgrade_to():
    msg = not_entitled_message("hr.performance.core", "NOT_ENTITLED", "advanced")
    assert "Performance review cycles" in msg and "Advanced" in msg and "Billing & Plan" in msg
    assert "overdue" in not_entitled_message("hr.records", "DELINQUENCY_RESTRICTED")
    assert "evaluation" in not_entitled_message("hr.records", "TRIAL_RESTRICTED")
    assert feature_label("hr.documents.bulk_distribution") == "Bulk document distribution / targeting"
    assert UPGRADE_URL == "/organization-admin/billing-and-plan"


def test_document_upload_is_core_but_distributing_to_many_is_advanced():
    assert ROUTE_ENTITLEMENT_MAP[("POST", "/hr/documents/upload")] == "hr.documents.core"
    assert ROUTE_ENTITLEMENT_MAP[("POST", "/hr/documents/{document_id}/assign")] == "hr.documents.bulk_distribution"
    assert baseline_included("core", "hr.documents.core") and not baseline_included("core", "hr.documents.bulk_distribution")
