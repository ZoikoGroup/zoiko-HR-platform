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
    stays report-only regardless of key staging. Read from a short-TTL cache
    (30s, see _STAGED_TTL), and invalidated immediately by
    PUT /super-admin/platform-settings/entitlement_staged_org_ids, so ops can
    add/remove pilot orgs via the platform-settings route and the change takes
    effect on the very next request on the instance that saved it (within the
    30s TTL on other workers). Empty (the default) means "no org-level
    restriction" — unchanged behavior from before this existed.
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
    returns to report-only for every org — the PUT invalidates the cached
    staging list — with no redeploy and no restart.

Expand to everyone: once satisfied, either keep adding org IDs, or clear the
list to "" AND rely on HR_ENTITLEMENTS_ENFORCE_KEYS / HR_ENFORCE_ENTITLEMENTS
alone (empty org list + non-empty key list = enforce those keys for all
orgs — the org axis and the key axis are independent, and "empty" always
means "no restriction on this axis," never "block everyone").
"""

import json
import logging

from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.cache import get_cached, set_cached
from app.core.security import decode_access_token
from app.modules.billing.entitlement_service import ENTITLED_AVAILABLE, READ_ONLY, check_entitlement

logger = logging.getLogger("zoiko.billing.entitlement.enforce")

_READ_METHODS = frozenset({"GET", "HEAD"})

# ── Per-request cost trimming (Part C) ───────────────────────────────────────
# The middleware used to read the staging setting AND probe for a billing
# subscription on every guarded request (2 DB round-trips ≈ 400ms on Neon).
# Both are now short-TTL cached and invalidated on their write paths:
#   * staging list  — invalidated by PUT /platform-settings/entitlement_staged_org_ids
#   * sub existence — invalidated by the org_access flush listener (any org /
#     subscription / evaluation write) via org_access.invalidate_org_access.
# Fail-closed: a cache miss recomputes from the DB; a stale *non-empty* list
# enforces MORE orgs (stricter); a stale *empty* list can only cause an org to
# be enforced that just left the pilot list — for at most the TTL below. Roll
# back quickly enough that this window is acceptable, or use the PUT endpoint,
# which invalidates synchronously.
_STAGED_CACHE_KEY = "entitlement_staged_org_ids"
_STAGED_TTL_SECONDS = 30
_SUB_EXISTS_PREFIX = "billing_sub_exists:"
_SUB_EXISTS_TTL_SECONDS = 30


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


def _flatten_routes(routes, depth: int = 0) -> list:
    """Every concrete route, looking inside routers FastAPI includes lazily (`_IncludedRouter`), which expose
    no `path` of their own. Include-time prefixes are empty in this app; a prefixed include is skipped rather
    than guessed at."""
    flat = []
    for route in routes or []:
        inner = getattr(route, "original_router", None)
        if inner is not None and depth < 8:
            ctx = getattr(route, "include_context", None)
            if getattr(ctx, "prefix", "") in ("", None):
                flat.extend(_flatten_routes(getattr(inner, "routes", []), depth + 1))
            continue
        flat.append(route)
    return flat


class EntitlementMiddleware:
    """ASGI middleware enforcing route_entitlement_map for authenticated calls."""

    def __init__(self, app: ASGIApp, db_session_factory, *,
                 enforce_keys=frozenset(), allow_read_in_read_only: bool = True, routes_provider=None):
        self.app = app
        self.session_factory = db_session_factory
        self.enforce_keys = frozenset(enforce_keys or ())
        self.allow_read_in_read_only = allow_read_in_read_only
        # `routes_provider` hands over the application's own route table. Walking the wrapped ASGI app to find it
        # (the old way) came back empty on current Starlette, so no route was ever enforced even with enforcement on.
        self._routes_provider = routes_provider
        self._guards = None

    @property
    def guards(self):
        """(method, route, feature key) for every guarded route, built once on first use so that every router
        mounted at startup is included."""
        if self._guards is None:
            from app.modules.billing.route_entitlement_map import ROUTE_ENTITLEMENT_MAP

            routes = _flatten_routes(self._routes_provider() if self._routes_provider else _collect_routes(self.app))
            built = []
            for route in routes:
                for method in getattr(route, "methods", []) or []:
                    if method in ("HEAD", "OPTIONS"):
                        continue
                    key = ROUTE_ENTITLEMENT_MAP.get((method.upper(), getattr(route, "path", "")))
                    if key is not None:
                        built.append((method.upper(), route, key))
            self._guards = built
            logger.info("[entitlement] enforcing %d guarded routes.", len(built))
        return self._guards

    @guards.setter
    def guards(self, value):
        self._guards = value

    def _is_enforced(self, key: str) -> bool:
        """Staged rollout: empty enforce_keys means enforce everything;
        otherwise only the listed keys are hard-enforced."""
        return not self.enforce_keys or key in self.enforce_keys

    def _staged_org_ids(self, db) -> set[str]:
        """The live pilot-org list, cached for _STAGED_TTL seconds. The
        platform-settings PUT invalidates this key synchronously, so the roll
        back / add-pilot flows take effect on the next request on the writing
        instance and within the TTL on every other worker."""
        cached = get_cached(_STAGED_CACHE_KEY)
        if cached is not None:
            return set(cached)

        from app.modules.super_admin.models import PlatformSetting

        row = (
            db.query(PlatformSetting)
            .filter(PlatformSetting.key == _STAGED_CACHE_KEY)
            .first()
        )
        raw = row.value if row is not None else ""
        org_ids = {s.strip() for s in (raw or "").split(",") if s.strip()}
        set_cached(_STAGED_CACHE_KEY, sorted(org_ids), ttl=_STAGED_TTL_SECONDS)
        return org_ids

    def _has_subscription(self, db, org_id: int) -> bool:
        """Whether the org has ANY billing subscription row, cached for
        _SUB_EXISTS_TTL seconds. Invalidated by the org_access flush listener
        after any org / subscription / evaluation commit, and by
        invalidate_org_access."""
        from app.modules.billing.models import BillingSubscription

        key = f"{_SUB_EXISTS_PREFIX}{org_id}"
        cached = get_cached(key)
        if cached is not None:
            return bool(cached)
        exists = (
            db.query(BillingSubscription.id)
            .filter(BillingSubscription.organization_id == org_id)
            .first()
            is not None
        )
        set_cached(key, exists, ttl=_SUB_EXISTS_TTL_SECONDS)
        return exists

    def _is_org_in_scope(self, db, org_id: int) -> bool:
        """Org-level staged rollout: empty list means no org-level
        restriction (every org enforced, subject to _is_enforced's key
        staging); otherwise only the listed organization IDs are
        hard-enforced."""
        # An organization with no billing subscription at all predates billing or was created outside the
        # self-serve flow. It has no plan to measure against, so it is left alone instead of being locked out.
        if not self._has_subscription(db, org_id):
            return False

        org_ids = self._staged_org_ids(db)
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

        from app.modules.billing.plan_baseline import UPGRADE_URL, not_entitled_message

        body = json.dumps({
            "detail": not_entitled_message(matched_key, state, result.get("required_plan")),
            "feature_key": matched_key,
            "required_plan": result.get("required_plan"),
            "upgrade_url": UPGRADE_URL,
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
