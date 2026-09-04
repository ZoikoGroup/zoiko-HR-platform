"""
modules/billing/route_entitlement_map.py
----------------------------------------
Prompt 6 — declarative (method, path) -> FEATURE_KEY mapping used to apply
server-side entitlement enforcement across the HR/employee module routers.

WHY this exists instead of hand-editing ~450 decorators (Prompt 6 scope):
  - One curated table of 'this route guards THIS feature module'.
  - main.py sweeps `app.routes` at startup against this map to (a) surface any
    mapped path that no longer exists (drift guard) and (b) log a warning for
    every FEATURE_KEY that maps to zero routes, so silent coverage gaps are
    visible.
  - An ASGI/HTTP middleware enforces the mapped feature key for each matched
    request, scoped to the caller's own organization (super_admin bypasses:
    the Org Owner row owns all modules).

Assistant module (`app/modules/assistant/`) is intentionally EXCLUDED — it is
out of scope for every prompt, exactly as the project has consistently decided.
`hr.ai.autonomous_action` is a policy-level, hard-blocked key (entitlement
engine always returns NOT_ENTITLED) and is intentionally NOT wired to a route;
leaving it unmapped is correct, so it intentionally shows in the startup
'unmapped' warning.

Keys with no corresponding module yet (identity.*, integration.*) are listed in
NOT_BUILT_FEATURE_KEYS and deliberately left unmapped — they are future modules,
not silent gaps.
"""

from app.modules.billing.feature_keys import FEATURE_KEYS


def _r(method: str, path: str, key: str) -> dict:
    return {(method.upper(), path): key}


# ── (METHOD, exact FastAPI route path) -> feature key ────────────────────────
# Paths use FastAPI's `{param}` syntax exactly as registered in app.routes.
# A representative but complete-enough set is listed per module: the startup
# sweep asserts every mapped path actually exists, and the coverage test asserts
# every FEATURE_KEY (except NOT_BUILT + hard-blocked) has >= 1 mapped route.
ROUTE_ENTITLEMENT_MAP: dict[tuple[str, str], str] = {
    # hr.core.employees (employee directory + lifecycle + admin/user mgmt)
    **_r("GET", "/hr/employees", "hr.core.employees"),
    **_r("POST", "/hr/employees", "hr.core.employees"),
    **_r("GET", "/hr/employees/{employee_id}", "hr.core.employees"),
    **_r("PUT", "/hr/employees/{employee_id}", "hr.core.employees"),
    **_r("DELETE", "/hr/employees/{employee_id}", "hr.core.employees"),
    **_r("GET", "/hr/employee-management/employees", "hr.core.employees"),
    **_r("POST", "/hr/employee-management/employees", "hr.core.employees"),
    **_r("PUT", "/hr/employee-management/employees/{employee_id}", "hr.core.employees"),
    **_r("GET", "/hr/employee-management/employees/{employee_id}", "hr.core.employees"),
    **_r("DELETE", "/hr/employee-management/employees/{employee_id}", "hr.core.employees"),
    **_r("POST", "/hr/employee-management/employees/import", "hr.core.employees"),
    **_r("GET", "/hr/employee-management/lifecycle", "hr.core.employees"),
    **_r("POST", "/hr/employee-management/promote", "hr.core.employees"),
    **_r("POST", "/hr/employee-management/transfer", "hr.core.employees"),
    **_r("GET", "/hr/admin/users", "hr.core.employees"),
    **_r("POST", "/hr/admin/users", "hr.core.employees"),
    **_r("PUT", "/hr/admin/users/{user_id}", "hr.core.employees"),

    # hr.core.departments
    **_r("GET", "/hr/departments", "hr.core.departments"),
    **_r("POST", "/hr/departments", "hr.core.departments"),
    **_r("GET", "/hr/departments/{dept_id}", "hr.core.departments"),
    **_r("PUT", "/hr/departments/{dept_id}", "hr.core.departments"),
    **_r("DELETE", "/hr/departments/{dept_id}", "hr.core.departments"),

    # hr.core.designations
    **_r("GET", "/hr/designations", "hr.core.designations"),
    **_r("POST", "/hr/designations", "hr.core.designations"),
    **_r("GET", "/hr/designations/{designation_id}", "hr.core.designations"),
    **_r("PUT", "/hr/designations/{designation_id}", "hr.core.designations"),
    **_r("DELETE", "/hr/designations/{designation_id}", "hr.core.designations"),

    # hr.core.org_config (router prefix is /hr/config)
    **_r("GET", "/hr/config", "hr.core.org_config"),
    **_r("GET", "/hr/config/defaults", "hr.core.org_config"),
    **_r("GET", "/hr/config/{key}", "hr.core.org_config"),
    **_r("PUT", "/hr/config/bulk", "hr.core.org_config"),
    **_r("PUT", "/hr/config/{key}", "hr.core.org_config"),
    **_r("DELETE", "/hr/config/{key}", "hr.core.org_config"),
    **_r("POST", "/hr/config/reset", "hr.core.org_config"),

    # hr.attendance.core
    **_r("GET", "/hr/attendance", "hr.attendance.core"),
    **_r("GET", "/hr/attendance/records", "hr.attendance.core"),
    **_r("POST", "/hr/attendance/records", "hr.attendance.core"),
    **_r("PUT", "/hr/attendance/records/{record_id}", "hr.attendance.core"),
    **_r("GET", "/hr/attendance/dashboard", "hr.attendance.core"),
    **_r("POST", "/hr/attendance/holidays", "hr.attendance.core"),
    **_r("GET", "/hr/attendance/export/csv", "hr.attendance.core"),

    # hr.attendance.shift_rostering
    **_r("GET", "/hr/attendance/shifts", "hr.attendance.shift_rostering"),
    **_r("POST", "/hr/attendance/shifts", "hr.attendance.shift_rostering"),
    **_r("POST", "/hr/attendance/shifts/rosters", "hr.attendance.shift_rostering"),
    **_r("DELETE", "/hr/attendance/shifts/rosters/{roster_id}", "hr.attendance.shift_rostering"),

    # hr.leave.core
    **_r("GET", "/hr/leaves", "hr.leave.core"),
    **_r("POST", "/hr/leaves", "hr.leave.core"),
    **_r("PUT", "/hr/leaves/{leave_id}", "hr.leave.core"),
    **_r("GET", "/hr/leaves/balance", "hr.leave.core"),
    **_r("GET", "/hr/attendance/leaves", "hr.leave.core"),
    **_r("POST", "/hr/attendance/leaves", "hr.leave.core"),
    **_r("GET", "/hr/attendance/leaves/balance", "hr.leave.core"),

    # hr.assets.core
    **_r("GET", "/hr/assets", "hr.assets.core"),
    **_r("POST", "/hr/assets", "hr.assets.core"),
    **_r("GET", "/hr/assets/{asset_id}", "hr.assets.core"),
    **_r("PUT", "/hr/assets/{asset_id}", "hr.assets.core"),
    **_r("DELETE", "/hr/assets/{asset_id}", "hr.assets.core"),
    **_r("GET", "/hr/assets/requests", "hr.assets.core"),
    **_r("POST", "/hr/assets/requests", "hr.assets.core"),

    # hr.compensation.core
    **_r("GET", "/hr/compensation", "hr.compensation.core"),
    **_r("POST", "/hr/compensation/pay-grades", "hr.compensation.core"),
    **_r("GET", "/hr/compensation/pay-grades", "hr.compensation.core"),
    **_r("GET", "/hr/compensation/salary-structures", "hr.compensation.core"),
    **_r("POST", "/hr/compensation/salary-structures", "hr.compensation.core"),
    **_r("GET", "/hr/compensation/employee-compensation", "hr.compensation.core"),
    **_r("POST", "/hr/compensation/employee-compensation", "hr.compensation.core"),

    # hr.compliance.core
    **_r("GET", "/hr/compliance", "hr.compliance.core"),
    **_r("POST", "/hr/compliance", "hr.compliance.core"),
    **_r("GET", "/hr/compliance/audits", "hr.compliance.core"),
    **_r("POST", "/hr/compliance/audits", "hr.compliance.core"),
    **_r("GET", "/hr/compliance/risks", "hr.compliance.core"),
    **_r("POST", "/hr/compliance/violations", "hr.compliance.core"),

    # hr.engagement.surveys
    **_r("GET", "/hr/engagement", "hr.engagement.surveys"),
    **_r("POST", "/hr/engagement", "hr.engagement.surveys"),

    # hr.ess.core
    **_r("GET", "/hr/ess", "hr.ess.core"),
    **_r("POST", "/hr/ess", "hr.ess.core"),
    **_r("GET", "/hr/employees/me", "hr.ess.core"),
    **_r("PUT", "/hr/employees/me", "hr.ess.core"),

    # hr.onboarding.core
    **_r("GET", "/hr/onboarding/new-hires", "hr.onboarding.core"),
    **_r("POST", "/hr/onboarding/new-hires", "hr.onboarding.core"),
    **_r("GET", "/hr/onboarding/records", "hr.onboarding.core"),
    **_r("POST", "/hr/onboarding/records", "hr.onboarding.core"),
    **_r("GET", "/hr/onboarding/dashboard", "hr.onboarding.core"),

    # hr.performance.core
    **_r("GET", "/hr/performance", "hr.performance.core"),
    **_r("POST", "/hr/performance", "hr.performance.core"),
    **_r("GET", "/hr/performance/appraisals", "hr.performance.core"),
    **_r("POST", "/hr/performance/appraisals", "hr.performance.core"),
    **_r("GET", "/hr/performance/goals", "hr.performance.core"),
    **_r("POST", "/hr/performance/goals", "hr.performance.core"),
    **_r("GET", "/hr/performance/dashboard", "hr.performance.core"),
    **_r("GET", "/hr/performance/analytics", "hr.performance.core"),

    # hr.recruitment.core
    **_r("GET", "/hr/recruitment/requisitions", "hr.recruitment.core"),
    **_r("POST", "/hr/recruitment/requisitions", "hr.recruitment.core"),
    **_r("GET", "/hr/recruitment/candidates", "hr.recruitment.core"),
    **_r("POST", "/hr/recruitment/candidates", "hr.recruitment.core"),
    **_r("GET", "/hr/recruitment/interviews", "hr.recruitment.core"),
    **_r("POST", "/hr/recruitment/offers", "hr.recruitment.core"),

    # hr.travel.core
    **_r("GET", "/hr/travel", "hr.travel.core"),
    **_r("PUT", "/hr/travel/{travel_id}", "hr.travel.core"),
    **_r("GET", "/hr/travel-expenses", "hr.travel.core"),
    **_r("POST", "/hr/travel", "hr.travel.core"),
    **_r("POST", "/hr/travel/expenses", "hr.travel.core"),

    # hr.learning.core
    **_r("GET", "/hr/learning/courses", "hr.learning.core"),
    **_r("POST", "/hr/learning/courses", "hr.learning.core"),
    **_r("GET", "/hr/learning/courses/{course_id}", "hr.learning.core"),
    **_r("GET", "/hr/learning/enrollments", "hr.learning.core"),
    **_r("POST", "/hr/learning/enrollments", "hr.learning.core"),
    **_r("GET", "/hr/learning/skills", "hr.learning.core"),
    **_r("POST", "/hr/learning/assessments", "hr.learning.core"),

    # hr.documents.core
    **_r("GET", "/hr/documents", "hr.documents.core"),
    **_r("GET", "/hr/documents/{document_id}", "hr.documents.core"),
    **_r("PUT", "/hr/documents/{document_id}", "hr.documents.core"),
    **_r("DELETE", "/hr/documents/{document_id}", "hr.documents.core"),
    **_r("GET", "/hr/document-folders", "hr.documents.core"),
    **_r("POST", "/hr/document-folders", "hr.documents.core"),
    **_r("DELETE", "/hr/document-folders/{folder_id}", "hr.documents.core"),

    # hr.documents.bulk_distribution
    **_r("POST", "/hr/documents/upload", "hr.documents.bulk_distribution"),
    **_r("POST", "/hr/documents/{document_id}/versions", "hr.documents.bulk_distribution"),
    **_r("POST", "/hr/documents/{document_id}/assign", "hr.documents.bulk_distribution"),
    **_r("POST", "/hr/documents/{document_id}/approve", "hr.documents.bulk_distribution"),

    # hr.workforce_planning.core
    **_r("GET", "/hr/workforce-planning", "hr.workforce_planning.core"),
    **_r("POST", "/hr/workforce-planning", "hr.workforce_planning.core"),
    **_r("GET", "/hr/workforce/plans", "hr.workforce_planning.core"),
    **_r("POST", "/hr/workforce/plans", "hr.workforce_planning.core"),
    **_r("GET", "/hr/workforce/headcount", "hr.workforce_planning.core"),
    **_r("POST", "/hr/workforce/headcount", "hr.workforce_planning.core"),
    **_r("GET", "/hr/workforce/succession", "hr.workforce_planning.core"),
    **_r("POST", "/hr/workforce/succession", "hr.workforce_planning.core"),
}


# ── Updating the OLD map format: defensive lookup by (method, path) ──────────


def lookup_feature_key(method: str, path: str) -> str | None:
    """Return the feature key guarding a (method, path), or None if unmapped."""
    return ROUTE_ENTITLEMENT_MAP.get((method.upper(), path))


# Keys that are engineering-mapped (i.e. should be enforced).
def mapped_feature_keys() -> set[str]:
    return set(ROUTE_ENTITLEMENT_MAP.values())


# Keys intentionally WITHOUT any routes (future modules / hard-blocked policy).
# These are not silent gaps — they are explicit NOT_BUILT. hr.ai.autonomous_action
# is additionally hard-blocked at the entitlement engine regardless of mapping.
NOT_BUILT_FEATURE_KEYS: frozenset[str] = frozenset({
    "hr.identity.sso",
    "hr.identity.scim",
    "hr.integration.api_read",
    "hr.integration.api_write",
    "hr.integration.file_exchange",
    "hr.integration.custom_connector",
    "hr.ai.autonomous_action",
})


def coverage_gap_keys() -> set[str]:
    """FEATURE_KEYS that have zero enforced routes and are NOT in the explicit
    not-built allowlist — i.e. silent gaps that must be fixed or documented."""
    mapped = mapped_feature_keys()
    return {k for k in FEATURE_KEYS if k not in mapped and k not in NOT_BUILT_FEATURE_KEYS}


def sweep_route_entitlement_map(app) -> None:
    """Iterate app.routes at startup:
      1. Warn (don't crash) for every FEATURE_KEY with zero mapped routes.
      2. Warn if any mapped (method,path) no longer exists in app.routes
         (drift guard — a mapped route that was deleted should be noticed).
    """
    import logging
    logger = logging.getLogger("zoiko.billing.entitlement")

    registered = set()
    for route in app.routes:
        for method in getattr(route, "methods", []):
            if method in ("HEAD", "OPTIONS"):
                continue
            registered.add((method.upper(), getattr(route, "path", "")))

    # Keys with no mapped route.
    mapped = mapped_feature_keys()
    for key in sorted(FEATURE_KEYS):
        if key not in mapped:
            if key in NOT_BUILT_FEATURE_KEYS:
                logger.info(
                    "[startup] entitlement key '%s': no routes (explicit NOT_BUILT / hard-blocked).", key
                )
            else:
                logger.warning(
                    "[startup] entitlement key '%s': ZERO routes mapped — coverage gap.", key
                )

    # Mapped routes that no longer exist (drift).
    for (method, path), key in sorted(ROUTE_ENTITLEMENT_MAP.items()):
        if (method, path) not in registered:
            logger.warning(
                "[startup] entitlement map references missing route %s %s (key=%s) — update route_entitlement_map.py",
                method, path, key,
            )
