"""
modules/billing/plan_baseline.py
--------------------------------
What Core and Advanced include, as data: the baseline the entitlement resolver uses when no operator-approved
`plan_entitlement_mappings` row exists for a (plan, feature). Source: ZHR-COM-ENT-001 section 5 (docs/).

Why a baseline in code and not an empty table: with the table empty every feature resolved to "not configured", so
nothing was ever gated by plan (a Core customer got Advanced features) while a few routes failed closed and blocked
paying customers. A row in the table always wins over this baseline, so Product can still change any decision
from the Super Admin side without a deploy.

True = the plan includes the feature, False = it does not. Enterprise is contract-priced and handled per contract.
Product modules the spec does not price (assets, attendance, recruitment, travel and so on) are included in both
plans rather than silently locked: that is the customer-safe default until Product prices them.
"""

from app.modules.billing.feature_keys import FEATURE_KEYS, canonical_feature_key as resolve_alias, canonical_feature_key

# feature_key: (in Core, in Advanced)
PLAN_BASELINE: dict[str, tuple[bool, bool]] = {
    "hr.admin.delegation": (True, True),
    "hr.ai.autonomous_decision": (False, False),
    "hr.ai.custom_sources": (False, True),
    "hr.ai.draft_summary": (True, True),
    "hr.ai.governance_admin": (True, True),
    "hr.ai.navigation": (True, True),
    "hr.ai.policy_qa": (True, True),
    "hr.ai.workflow_assist": (False, True),
    "hr.ai.workforce_query": (False, True),
    "hr.api.read": (False, True),
    "hr.api.webhooks": (False, True),
    "hr.api.write": (False, True),
    "hr.documents.bulk": (False, True),
    "hr.documents.core": (True, True),
    "hr.documents.policies": (True, True),
    "hr.documents.workflow": (False, True),
    "hr.enterprise.data_options": (False, True),
    "hr.enterprise.sandbox": (False, False),
    "hr.identity.conditional_access": (False, True),
    "hr.identity.multi_idp": (False, False),
    "hr.identity.scim": (False, False),
    "hr.identity.sso": (False, True),
    "hr.integration.custom": (False, False),
    "hr.integration.file_exchange": (True, True),
    "hr.integration.standard": (True, True),
    "hr.integration.zoiko_connector": (True, True),
    "hr.leave.advanced": (False, True),
    "hr.leave.core": (True, True),
    "hr.leave.global": (False, True),
    "hr.leave.policies": (True, True),
    "hr.lifecycle.automation": (False, True),
    "hr.lifecycle.offboarding": (True, True),
    "hr.lifecycle.onboarding": (True, True),
    "hr.lifecycle.tasks": (True, True),
    "hr.mobile.companion": (True, True),
    "hr.org.directory": (True, True),
    "hr.org.jobs": (True, True),
    "hr.org.legal_entities": (True, True),
    "hr.org.positions": (False, True),
    "hr.org.structure": (True, True),
    "hr.performance.cycles": (False, True),
    "hr.performance.goals": (False, True),
    "hr.performance.one_to_one": (False, True),
    "hr.performance.reporting": (False, True),
    "hr.records": (True, True),
    "hr.records.custom_fields": (True, True),
    "hr.records.effective_changes": (True, True),
    "hr.records.history": (True, True),
    "hr.reporting.builder": (False, True),
    "hr.reporting.cross_entity": (False, True),
    "hr.reporting.dashboards_custom": (False, True),
    "hr.reporting.export": (True, True),
    "hr.reporting.governed_sharing": (True, True),
    "hr.reporting.metric_governance": (True, True),
    "hr.reporting.scheduled": (False, True),
    "hr.reporting.standard": (True, True),
    "hr.reporting.templates": (True, True),
    "hr.self_service.employee": (True, True),
    "hr.self_service.manager": (True, True),
    "hr.service.implementation": (False, False),
    "hr.service.integration": (False, False),
    "hr.service.migration": (False, False),
    "hr.support.named_success": (False, False),
    "hr.support.priority": (False, True),
    "hr.support.sla": (False, False),
    "hr.support.standard": (True, True),
    "hr.workflow.builder": (False, True),
    "hr.workflow.bulk_actions": (False, True),
    "hr.workflow.conditional": (False, True),
    "hr.workflow.dual_control": (False, True),
    "hr.workflow.standard": (True, True),
}

# Customer-facing names (the spec's own feature wording), for upgrade messages.
FEATURE_LABELS: dict[str, str] = {
    "hr.admin.delegation": "Delegated administration",
    "hr.ai.autonomous_decision": "Autonomous consequential employment decisions",
    "hr.ai.custom_sources": "Custom approved knowledge sources",
    "hr.ai.draft_summary": "Summarization / drafting assistance",
    "hr.ai.governance_admin": "Customer-facing AI governance controls",
    "hr.ai.navigation": "Product navigation / help AI",
    "hr.ai.policy_qa": "Policy / document Q&A",
    "hr.ai.workflow_assist": "Workflow navigation / administrative assistance",
    "hr.ai.workforce_query": "Authorized workforce-data Q&A",
    "hr.api.read": "API read access",
    "hr.api.webhooks": "Webhooks",
    "hr.api.write": "API write access",
    "hr.documents.bulk": "Bulk document distribution / targeting",
    "hr.documents.core": "Documents & employee files",
    "hr.documents.policies": "Policies & acknowledgments",
    "hr.documents.workflow": "Advanced document workflows / e-sign orchestration",
    "hr.enterprise.data_options": "Negotiated retention / residency options",
    "hr.enterprise.sandbox": "Customer sandbox / configuration promotion",
    "hr.identity.conditional_access": "IP allowlisting / advanced access conditions",
    "hr.identity.multi_idp": "Multiple IdPs / advanced identity routing",
    "hr.identity.scim": "SCIM lifecycle provisioning",
    "hr.identity.sso": "SAML/OIDC enterprise SSO",
    "hr.integration.custom": "Custom integration engineering",
    "hr.integration.file_exchange": "CSV import/export",
    "hr.integration.standard": "Standard third-party integrations",
    "hr.integration.zoiko_connector": "Standard Zoiko connector framework",
    "hr.leave.advanced": "Complex accrual, carryover & policy groups",
    "hr.leave.core": "Leave requests & balances",
    "hr.leave.global": "Multi-country leave configurations",
    "hr.leave.policies": "Leave calendars / standard policy rules",
    "hr.lifecycle.automation": "Lifecycle automation / conditional tasking",
    "hr.lifecycle.offboarding": "Separation / offboarding plans",
    "hr.lifecycle.onboarding": "Onboarding plans",
    "hr.lifecycle.tasks": "Lifecycle task ownership & reminders",
    "hr.mobile.companion": "Employee / manager mobile access",
    "hr.org.directory": "Employee directory & org chart",
    "hr.org.jobs": "Jobs / job catalog",
    "hr.org.legal_entities": "Legal entity administration",
    "hr.org.positions": "Position management",
    "hr.org.structure": "Locations, departments, teams",
    "hr.performance.cycles": "Performance review cycles",
    "hr.performance.goals": "Goals / structured performance inputs",
    "hr.performance.one_to_one": "1:1 process support",
    "hr.performance.reporting": "Performance reporting",
    "hr.records": "Employee records & profiles",
    "hr.records.custom_fields": "Custom HR fields",
    "hr.records.effective_changes": "Effective-dated workforce changes",
    "hr.records.history": "Record history / audit trail",
    "hr.reporting.builder": "Custom report builder",
    "hr.reporting.cross_entity": "Cross-entity analysis",
    "hr.reporting.dashboards_custom": "Custom dashboards / saved views",
    "hr.reporting.export": "Permissioned CSV/XLSX export",
    "hr.reporting.governed_sharing": "Advanced export policy / secure sharing",
    "hr.reporting.metric_governance": "Governed metric registry / custom metrics",
    "hr.reporting.scheduled": "Scheduled / shared reports",
    "hr.reporting.standard": "Standard workforce dashboards",
    "hr.reporting.templates": "Standard HR reports",
    "hr.self_service.employee": "Employee self-service",
    "hr.self_service.manager": "Manager self-service",
    "hr.service.implementation": "Implementation / configuration service",
    "hr.service.integration": "Premium integration service",
    "hr.service.migration": "Data migration service",
    "hr.support.named_success": "Named Customer Success / service governance",
    "hr.support.priority": "Priority support routing",
    "hr.support.sla": "Contractual support SLA",
    "hr.support.standard": "Standard support",
    "hr.workflow.builder": "Custom no-code workflow builder",
    "hr.workflow.bulk_actions": "Bulk operational actions",
    "hr.workflow.conditional": "Conditional / multi-step approvals",
    "hr.workflow.dual_control": "Maker-checker / dual-control patterns",
    "hr.workflow.standard": "Standard HR workflows & approvals",
}

_PLAN_INDEX = {"core": 0, "advanced": 1}


def baseline_included(plan_code, feature_key: str):
    """True / False when the baseline has an answer for this plan and feature, None when it has none
    (Enterprise, or a key that does not exist)."""
    plan = str(getattr(plan_code, "value", plan_code) or "").lower()
    if plan not in _PLAN_INDEX:
        return None
    key = resolve_alias(feature_key)
    if key == "hr.ai.autonomous_decision":
        return False
    row = PLAN_BASELINE.get(key)
    if row is not None:
        return row[_PLAN_INDEX[plan]]
    if key in FEATURE_KEYS:
        return True  # an unpriced product module: included in every self-serve plan
    return None


def baseline_required_plan(feature_key: str):
    """The cheapest self-serve plan that includes the feature, or None."""
    for plan in ("core", "advanced"):
        if baseline_included(plan, feature_key):
            return plan
    return None


def feature_label(feature_key: str) -> str:
    return FEATURE_LABELS.get(canonical_feature_key(feature_key), feature_key)


UPGRADE_URL = "/organization-admin/billing-and-plan"


def not_entitled_message(feature_key: str, state: str, required_plan=None) -> str:
    """The sentence a customer sees when a feature is blocked, e.g.
    "Performance review cycles is not included in your plan. It is available on the Advanced plan."."""
    label = feature_label(feature_key)
    if state == "NOT_ENTITLED":
        extra = f" It is available on the {str(required_plan).title()} plan." if required_plan else ""
        return f"{label} is not included in your plan.{extra} Go to Billing & Plan to upgrade."
    if state == "DELINQUENCY_RESTRICTED":
        return f"{label} is paused because a payment is overdue. Settle the invoice in Billing & Plan to restore it."
    if state == "TRIAL_RESTRICTED":
        return f"{label} is not part of the free evaluation. Choose a plan in Billing & Plan to use it."
    return f"{label} is not available for your organization right now. Please contact support."
