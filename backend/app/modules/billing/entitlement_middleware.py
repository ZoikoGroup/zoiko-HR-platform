"""
modules/billing/entitlement_middleware.py
-----------------------------------------
Prompt 6 — optional server-side entitlement enforcement for feature-guarded
routes, WITHOUT hand-editing ~450 route decorators.

How it works:
  - At construction it snapshots every registered FastAPI route whose
    (method, path) appears in route_entitlement_map.ROUTE_ENTITLEMENT_MAP,
    storing the feature key on the route.
  - For each request it tests the request scope against those guarded routes
    (Starlette's own route.matches) and, on a hit, resolves the caller's
    organization from the Bearer token and runs check_entitlement().
  - If the resolved state is not ENTITLED_AVAILABLE the request is rejected
    with 403 before it reaches the handler.

Safety / opt-in: this middleware is only mounted when the application is
constructed with enforce=True (driven by settings.ENFORCE_ENTITLEMENTS, which
defaults to False). The startup sweep in main.py is always report-only;
hard blocking requires an environment where the entitlement matrix is approved
and seeded, otherwise every un-mapped feature would 403.

super_admin note: enforcement is scoped to the mapped feature keys regardless
of role. The map is intentionally limited to HR/employee module routes; the
billing/super-admin/admin modules are not route-guarded here (they have their
own RBAC).
"""

import logging

from fastapi import Request
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.security import decode_access_token
from app.modules.billing.entitlement_service import ENTITLED_AVAILABLE, check_entitlement

logger = logging.getLogger("zoiko.billing.entitlement.enforce")

_HTTP_403 = {
    "type": "http.response.start",
    "status": 403,
    "headers": [(b"content-type", b"application/json")],
}
_HTTP_403_END = {"type": "http.response.body", "body": b'{"detail":"Feature not entitled for your organization."}'}


class EntitlementMiddleware:
    """ASGI middleware enforcing route_entitlement_map for authenticated calls."""

    def __init__(self, app: ASGIApp, db_session_factory):
        from app.modules.billing.route_entitlement_map import ROUTE_ENTITLEMENT_MAP

        self.app = app
        self.session_factory = db_session_factory
        # snapshot guarded routes -> feature key
        self.guards = []
        for route in getattr(app, "routes", []):
            for method in getattr(route, "methods", []) or []:
                if method in ("HEAD", "OPTIONS"):
                    continue
                key = ROUTE_ENTITLEMENT_MAP.get((method.upper(), getattr(route, "path", "")))
                if key is not None:
                    self.guards.append((method.upper(), route, key))
        logger.info("[entitlement] enforcing %d guarded routes.", len(self.guards))

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "").upper()
        matched_key = self._match(method, scope)
        if matched_key is None:
            await self.app(scope, receive, send)
            return

        org_id = self._resolve_org_id(scope)
        if org_id is None:
            # No authenticated caller -> let the route's own auth dependency
            # produce the canonical 401/403. Not a paywall decision.
            await self.app(scope, receive, send)
            return

        from app.database import SessionLocal

        with SessionLocal() as db:
            result = check_entitlement(db, org_id, matched_key)
            state = result.get("state")

        if state == ENTITLED_AVAILABLE:
            await self.app(scope, receive, send)
            return

        logger.warning(
            "[entitlement] BLOCKED %s %s for org %d on key '%s' (state=%s)",
            method, scope.get("path"), org_id, matched_key, state,
        )
        await send(_HTTP_403)
        await send(_HTTP_403_END)

    def _match(self, method: str, scope: Scope):
        for m, route, key in self.guards:
            if m != method:
                continue
            try:
                match, _ = route.matches(scope)
                if match.name == "FULL":
                    return key
            except Exception:
                continue
        return None

    def _resolve_org_id(self, scope: Scope) -> int | None:
        headers = scope.get("headers") or []
        token = None
        for name, value in headers:
            if name.lower() == b"authorization":
                raw = value.decode("latin1", "ignore")
                if raw.lower().startswith("bearer "):
                    token = raw[7:].strip()
                break
        if not token:
            return None
        payload = decode_access_token(token)
        if not payload:
            return None
        return payload.get("organization_id")
