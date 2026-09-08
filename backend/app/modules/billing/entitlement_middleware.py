"""
modules/billing/entitlement_middleware.py
-----------------------------------------
Optional server-side entitlement enforcement for feature-guarded routes,
WITHOUT hand-editing ~450 route decorators.

How it works:
  - At construction it snapshots every registered FastAPI route whose
    (method, path) appears in route_entitlement_map.ROUTE_ENTITLEMENT_MAP,
    storing the feature key on the route.
  - For each request it tests the request scope against those guarded routes
    (Starlette's own route.matches) and, on a hit, resolves the caller's
    organization from the Bearer token and runs check_entitlement().
  - Non-allowed requests are rejected with 403 (JSON body carrying the Section
    15 decision — mode / reason_code / state — so the client can render the
    denial instead of guessing).

Safety / staged rollout (ZHR-COM-ENT-001 "safe enforcement"):
  - Only mounted when the application is constructed with enforce=True
    (settings.ENFORCE_ENTITLEMENTS, default False).
  - enforce_keys, when non-empty, restricts hard enforcement to that subset of
    feature keys so ops can flip modules one at a time.
  - Org-level staging (independent axis from enforce_keys): the
    "entitlement_staged_org_ids" platform setting, when non-empty, restricts
    hard enforcement to that subset of organization IDs — every other org
    stays report-only regardless of key staging. Read live from the database
    on every guarded request (not a cached/static value), so ops can add/
    remove pilot orgs via PUT /super-admin/platform-settings/
    entitlement_staged_org_ids without a redeploy. Empty (the default) means
    "no org-level restriction" — unchanged behavior from before this existed.
  - READ_ONLY is read-compatible: GET/HEAD pass while mutations are blocked
    (Section 14.1 mode semantics); configurable via allow_read_in_read_only.

super_admin note: enforcement is scoped to the mapped feature keys regardless
of role. The map is intentionally limited to HR/employee module routes; the
billing/super-admin/admin modules are not route-guarded here (they have their
own RBAC).

── Staged rollout runbook ───────────────────────────────────────────────────
Add a pilot org:
  PUT /super-admin/platform-settings/entitlement_staged_org_ids
  { "value": "12,47" }   # comma-separated organization IDs
  Once set, ONLY orgs 12 and 47 get real 403s for guarded routes; every other
  org stays report-only (sweep-logged, never blocked) even with
  HR_ENFORCE_ENTITLEMENTS=true globally.

Soak: watch [entitlement] BLOCKED log lines and the pilot org's own support
channel for at least one full business day before adding more orgs. A quiet
pilot org (no unexpected blocks, no support escalation) is the signal to
expand the list, not a fixed timer.

Roll back instantly: set the value back to "" (empty). This immediately
returns to report-only for every org, with no redeploy and no restart —
the next request re-reads the setting from the database.

Expand to everyone: once satisfied, either keep adding org IDs, or clear the
list to "" AND rely on HR_ENTITLEMENTS_ENFORCE_KEYS / HR_ENFORCE_ENTITLEMENTS
alone (empty org list + non-empty key list = enforce those keys for all
orgs — the org axis and the key axis are independent, and "empty" always
means "no restriction on this axis," never "block everyone").
"""

import json
import logging

from fastapi import Request
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.security import decode_access_token
from app.modules.billing.entitlement_service import ENTITLED_AVAILABLE, READ_ONLY, check_entitlement

logger = logging.getLogger("zoiko.billing.entitlement.enforce")

_READ_METHODS = frozenset({"GET", "HEAD"})


def _blocked_start(status: int) -> dict:
    return {
        "type": "http.response.start",
        "status": status,
        "headers": [(b"content-type", b"application/json")],
    }


def _collect_routes(app, seen: set | None = None) -> list:
    """Resolve the route table from whichever ASGI wrapper FastAPI hands us
    (app itself, ExceptionMiddleware, or the underlying router)."""
    seen = set() if seen is None else seen
    if id(app) in seen or app is None:
        return []
    seen.add(id(app))
    found = list(getattr(app, "routes", None) or [])
    if found:
        return found
    for attr in ("app", "router"):
        child = getattr(app, attr, None)
        if child is not None:
            child_routes = _collect_routes(child, seen)
            if child_routes:
                return child_routes
    return []


class EntitlementMiddleware:
    """ASGI middleware enforcing route_entitlement_map for authenticated calls."""

    def __init__(self, app: ASGIApp, db_session_factory, *,
                 enforce_keys=frozenset(), allow_read_in_read_only: bool = True):
        from app.modules.billing.route_entitlement_map import ROUTE_ENTITLEMENT_MAP

        self.app = app
        self.session_factory = db_session_factory
        self.enforce_keys = frozenset(enforce_keys or ())
        self.allow_read_in_read_only = allow_read_in_read_only
        # resolve the route table: FastAPI hands us an ExceptionMiddleware
        # wrapping the router, whose routes live one level deeper.
        routes = _collect_routes(app)
        # snapshot guarded routes -> feature key
        self.guards = []
        for route in routes:
            for method in getattr(route, "methods", []) or []:
                if method in ("HEAD", "OPTIONS"):
                    continue
                key = ROUTE_ENTITLEMENT_MAP.get((method.upper(), getattr(route, "path", "")))
                if key is not None:
                    self.guards.append((method.upper(), route, key))
        logger.info("[entitlement] enforcing %d guarded routes.", len(self.guards))

    def _is_enforced(self, key: str) -> bool:
        """Staged rollout: empty enforce_keys means enforce everything;
        otherwise only the listed keys are hard-enforced."""
        return not self.enforce_keys or key in self.enforce_keys

    def _is_org_in_scope(self, db, org_id: int) -> bool:
        """Org-level staged rollout: empty list means no org-level
        restriction (every org enforced, subject to _is_enforced's key
        staging); otherwise only the listed organization IDs are
        hard-enforced. Reads the live database value on every call — this is
        the one deliberately uncached read in the request path, so an ops
        edit via the platform-settings endpoint takes effect on the very next
        request, not after a cache TTL or restart."""
        from app.modules.super_admin.models import PlatformSetting

        row = (
            db.query(PlatformSetting)
            .filter(PlatformSetting.key == "entitlement_staged_org_ids")
            .first()
        )
        raw = row.value if row is not None else ""
        org_ids = {s.strip() for s in (raw or "").split(",") if s.strip()}
        return not org_ids or str(org_id) in org_ids

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "").upper()
        matched_key = self._match(method, scope)
        if matched_key is None or not self._is_enforced(matched_key):
            await self.app(scope, receive, send)
            return

        org_id = self._resolve_org_id(scope)
        if org_id is None:
            # No authenticated caller -> let the route's own auth dependency
            # produce the canonical 401/403. Not a paywall decision.
            await self.app(scope, receive, send)
            return

        with self.session_factory() as db:
            if not self._is_org_in_scope(db, org_id):
                await self.app(scope, receive, send)
                return
            result = check_entitlement(db, org_id, matched_key)
            state = result.get("state")

        if state == ENTITLED_AVAILABLE:
            await self.app(scope, receive, send)
            return

        # READ_ONLY reads pass (Section 14.1 read-compatible mode); mutations on
        # a read-only feature are blocked.
        if (
            self.allow_read_in_read_only
            and state == READ_ONLY
            and method in _READ_METHODS
        ):
            await self.app(scope, receive, send)
            return

        body = json.dumps({
            "detail": f"Feature not entitled for your organization: {matched_key}",
            "feature_key": matched_key,
            "state": state,
            "mode": result.get("mode"),
            "reason_code": result.get("reason_code"),
            "allowed": False,
        }).encode("utf-8")
        logger.warning(
            "[entitlement] BLOCKED %s %s for org %d on key '%s' (state=%s, reason=%s)",
            method, scope.get("path"), org_id, matched_key, state,
            result.get("reason_code"),
        )
        await send(_blocked_start(403))
        await send({"type": "http.response.body", "body": body})

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
