"""Which side of the trust boundary a URL path is on (ZHR-PRIV-001 A02, D02).

CONTROL_PLANE  tenant lifecycle, plans, Zoiko's own subscription billing, platform configuration and health.
               A platform (super admin) token may call these, and the handlers return only PLATFORM_META /
               TENANT_AGGREGATE data (or a minimised form of it).
DATA_PLANE     tenant people, finance, customers, files, conversations. A platform token is refused outright.
AUTH / PUBLIC  sign-in and pre-sign-in endpoints.

Unknown paths are DATA_PLANE: a new route is closed to the platform until somebody lists it here on purpose
(deny by default).
"""
from __future__ import annotations

# longest prefix wins
CONTROL_PLANE_PREFIXES = (
    "/super-admin/dashboard",
    "/super-admin/organizations",
    "/super-admin/command-center",
    "/super-admin/platform-settings",
    "/super-admin/health",
    "/super-admin/cache-stats",
    "/super-admin/identity-providers",
    "/super-admin/active-sessions",
    "/super-admin/email-logs",
    "/super-admin/login-activity",
    "/super-admin/audit-logs",
    "/super-admin/activity",
    "/super-admin/users",
    "/super-admin/platform-accounts",
    "/super-admin/notifications",
    "/super-admin/connect",
    "/super-admin/hub",
    "/super-admin/workflow",
    "/super-admin/demo-requests",
    "/super-admin/pricing-requests",
    "/super-admin/bootstrap",
    # Support access. The platform request/approval API (control plane) only touches grant metadata. The /support data
    # path is control-plane REACHABLE so a platform bearer is not refused before the grant is examined, but every
    # handler depends on `grant_context`: without a live, validated, scope-checked grant the answer is 403 and no row
    # is ever read. This is the only path by which tenant data reaches a platform identity (ZHR-PRIV-001 B06/B07).
    "/super-admin/support-access",
    "/support",
    "/billing",
)

# Explicit data-plane paths inside otherwise-control prefixes, and prefixes that are plainly the tenant's own data.
DATA_PLANE_PREFIXES = (
    "/super-admin/documents",       # tenant files
    "/super-admin/approvals",       # employee leave decisions
    "/super-admin/expenses",        # employee expense claims and the tenant's budgets
    "/super-admin/support",         # employee-raised tickets
    "/hr",
    "/assistant",
    "/notifications",               # a person's own inbox
)

AUTH_PREFIXES = ("/auth",)
PUBLIC_PREFIXES = ("/public", "/billing/public", "/billing/webhooks", "/billing/webhook-events", "/billing/quotations", "/docs", "/openapi", "/redoc", "/health", "/")

# Billing sub-paths that are the tenant's own people/finance data would go here (none today: /billing is Zoiko's subscription billing).
DATA_PLANE_UNDER_CONTROL: tuple[str, ...] = ()


def _under(path: str, prefix: str) -> bool:
    return path == prefix or path.startswith(prefix.rstrip("/") + "/")


def classify_route(path: str) -> str:
    path = "/" + (path or "").strip("/")
    for p in DATA_PLANE_UNDER_CONTROL:
        if _under(path, p):
            return "DATA_PLANE"
    if path == "/":
        return "PUBLIC"
    for p in ("/billing/public", "/billing/webhooks", "/public"):
        if _under(path, p):
            return "PUBLIC"
    for p in AUTH_PREFIXES:
        if _under(path, p):
            return "AUTH"
    # most specific (longest) prefix across both lists decides
    best, kind = "", "DATA_PLANE"
    for p in CONTROL_PLANE_PREFIXES:
        if _under(path, p) and len(p) > len(best):
            best, kind = p, "CONTROL_PLANE"
    for p in DATA_PLANE_PREFIXES:
        if _under(path, p) and len(p) >= len(best):
            best, kind = p, "DATA_PLANE"
    return kind


def platform_may_call(path: str) -> bool:
    """A platform (super admin) subject may only call routes that are not tenant data-plane routes."""
    return classify_route(path) != "DATA_PLANE"
