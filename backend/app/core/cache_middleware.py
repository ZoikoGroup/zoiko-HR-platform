"""
core/cache_middleware.py
------------------------
FastAPI middleware that automatically caches GET responses in Redis and
invalidates related caches on write operations (POST/PUT/PATCH/DELETE).

This requires ZERO changes to existing route handlers — caching is applied
transparently at the middleware layer.

How it works:

  READS (GET/HEAD):
    1. Verify the JWT (Authorization header). Requests without a valid token
       are NEVER served from or stored in the cache, so the route's own
       authentication always runs for them (a cached response must not be
       readable by someone who could not have fetched it).
    2. Build key: resp:{org}:{user}:{method}:{path}:{sorted_query_params_hash}
       — scoped to the verified user, so one user's data (or role-specific
       view) is never served to another user, even inside the same org.
    3. Redis GET — on hit, return cached JSON immediately (skips DB).
    4. On miss, pass through to the app, intercept the response, serialize
       the JSON body, and store in Redis with a per-route TTL.

  WRITES (POST/PUT/PATCH/DELETE):
    1. Pass through to the app normally.
    2. After the response is sent, scan and delete all cached keys of the
       org whose path starts with the written path prefix, so the next read is
       fresh.

TTLs are configured per path prefix — dashboards get 60s, list views 45s,
reference data 120s. Unconfigured paths default to 30s.

Fail-closed: any Redis error degrades to serving uncached responses. Never
crashes, never serves stale data that can't be verified.
"""

import hashlib
import json
import logging
import re
import time
from typing import Optional

from starlette.concurrency import run_in_threadpool
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response, JSONResponse

from app.core.redis_client import get_redis
from app.core.security import decode_access_token

logger = logging.getLogger("zoiko.cache.middleware")

# ── Path prefix → TTL mapping ───────────────────────────────────────────────
# Longer prefixes match first (most-specific wins).
_PATH_TTL = [
    # Dashboards — high aggregation cost, stale for a few seconds is fine
    (r"/hr/dashboard", 60),
    (r"/hr/organization/dashboard", 60),
    (r"/hr/organization/metrics", 60),
    (r"/hr/organization", 60),
    (r"/hr/overview", 60),
    (r"/hr/compensation/dashboard", 60),
    (r"/hr/performance/dashboard", 60),
    (r"/hr/engagement/dashboard", 60),
    (r"/hr/attendance/dashboard", 60),
    (r"/hr/assets/dashboard", 60),
    (r"/hr/learning/dashboard", 60),
    (r"/hr/recruitment/dashboard", 60),
    (r"/hr/workforce/dashboard", 60),
    (r"/hr/leaves/dashboard", 60),
    (r"/employee-management/dashboard", 60),

    # Lists — moderate aggregation, refresh reasonably fast
    (r"/hr/employees", 45),
    (r"/hr/departments", 45),
    (r"/hr/leaves", 45),
    (r"/hr/attendance", 45),
    (r"/hr/assets", 45),
    (r"/hr/travel", 45),
    (r"/hr/ess", 45),
    (r"/hr/onboarding", 45),
    (r"/hr/learning", 45),
    (r"/hr/recruitment", 45),
    (r"/hr/workforce", 45),
    (r"/hr/performance", 45),
    (r"/hr/compensation", 45),
    (r"/hr/compliance", 45),
    (r"/hr/documents", 45),
    (r"/hr/document-folders", 45),
    (r"/hr/employees/me", 45),
    (r"/admin/users", 45),
    (r"/employee-management/employees", 45),

    # Billing — plan/subscription reads are cheap but go stale the moment a
    # checkout or webhook lands, so keep the window short and let the write
    # invalidation below drop them immediately.
    (r"/billing", 15),

    # Reference data — changes rarely, cache longer
    (r"/hr/holidays", 120),
    (r"/hr/attendance/shifts", 120),
    (r"/hr/designations", 120),
    (r"/auth/products", 120),
]

# Paths that should NEVER be cached (auth, mutations, file operations)
_NO_CACHE_PATHS = [
    r"/auth/login",
    r"/auth/logout",
    r"/auth/register",
    r"/auth/refresh",
    r"/auth/forgot-password",
    r"/auth/reset-password",
    r"/auth/accept-invite",
    r"/super-admin/health",
    # Platform-admin data is sensitive, low-volume and permission-checked per
    # request: never cache it.
    r"/super-admin",
    # Per-USER data. This cache is keyed per organization, so caching these would
    # serve one user's notifications / unread count to everyone else in their org.
    r"/notifications",
    r"/docs",
    r"/redoc",
    r"/openapi.json",
]

# Path prefix → cache key segment mapping for invalidation
# (write endpoint path prefix → URL path prefix whose cached GETs are dropped)
_WRITE_INVALIDATION = [
    (r"/hr/employees", "/hr/employees"),
    (r"/hr/employee-management", "/hr/employee"),
    (r"/hr/departments", "/hr/departments"),
    # /hr/designations is cached for 2 minutes; without this entry a create / edit / delete (or an
    # employee import that creates designations and changes their headcounts) left the list stale,
    # so the Refresh button kept returning the old rows (ZHR-53).
    (r"/hr/designations", "/hr/designations"),
    (r"/hr/employees", "/hr/designations"),
    (r"/hr/employee-management", "/hr/designations"),
    (r"/hr/leaves", "/hr/leaves"),
    (r"/hr/attendance", "/hr/attendance"),
    (r"/hr/assets", "/hr/assets"),
    (r"/hr/travel", "/hr/travel"),
    (r"/hr/ess", "/hr/ess"),
    (r"/hr/onboarding", "/hr/onboarding"),
    (r"/hr/learning", "/hr/learning"),
    (r"/hr/recruitment", "/hr/recruitment"),
    (r"/hr/workforce", "/hr/workforce"),
    (r"/hr/performance", "/hr/performance"),
    (r"/hr/compensation", "/hr/compensation"),
    (r"/hr/compliance", "/hr/compliance"),
    (r"/hr/documents", "/hr/document"),
    (r"/hr/document-folders", "/hr/document"),
    (r"/hr/holidays", "/hr/holidays"),
    (r"/hr/attendance/shifts", "/hr/attendance"),
    (r"/admin/users", "/hr/admin/users"),
    (r"/hr/admin/users", "/hr/admin/users"),
    # Any billing write (checkout confirm, plan change, payment) must drop the
    # cached billing/overview and subscription reads for the org immediately.
    (r"/billing", "/billing"),
]


# Deleting or restoring an organization must drop everything cached for it, so
# its users cannot read stale cached data after the lifecycle change (ZHR-35).
_ORG_LIFECYCLE = re.compile(r"^/super-admin/organizations/(\d+)(?:/restore)?$")


def _lifecycle_org_id(method: str, path: str) -> Optional[int]:
    m = _ORG_LIFECYCLE.match(path)
    if not m:
        return None
    is_delete = method == "DELETE" and not path.endswith("/restore")
    is_restore = method == "POST" and path.endswith("/restore")
    return int(m.group(1)) if (is_delete or is_restore) else None


def _get_ttl(path: str) -> Optional[int]:
    """Return the TTL for a given path, or None if it shouldn't be cached."""
    for pattern, ttl in _PATH_TTL:
        if re.match(pattern, path):
            return ttl
    return None


def _should_cache_path(path: str) -> bool:
    """Check if a path should be cached (not in the exclusion list)."""
    for pattern in _NO_CACHE_PATHS:
        if re.match(pattern, path):
            return False
    return True


def _extract_identity(request: Request) -> Optional[tuple]:
    """Return (organization_id, user_key) for a request carrying a VALID token,
    else None. user_key is a short hash of subject + role + org, never the token."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    try:
        payload = decode_access_token(auth[7:])
    except Exception:
        return None
    if not payload or not payload.get("sub"):
        return None
    org_id = payload.get("organization_id")
    ident = f"{payload.get('sub')}|{payload.get('role')}|{org_id}"
    return org_id, hashlib.sha256(ident.encode()).hexdigest()[:16]


def _extract_org_id(request: Request) -> Optional[int]:
    """Organization id from a valid token (None when absent/invalid)."""
    identity = _extract_identity(request)
    return identity[0] if identity else None


def _build_key(org_id: Optional[int], user_key: str, method: str, path: str, query: str) -> str:
    """Build a deterministic, user-scoped cache key."""
    query_hash = hashlib.md5(query.encode()).hexdigest()[:10] if query else "none"
    org_part = org_id if org_id is not None else "none"
    return f"resp:{org_part}:{user_key}:{method}:{path}:{query_hash}"


def _get_invalidation_prefixes(path: str) -> list[str]:
    """Return the cache key prefixes to invalidate for a given write path."""
    prefixes = []
    for pattern, prefix in _WRITE_INVALIDATION:
        if re.match(pattern, path):
            prefixes.append(prefix)
    return prefixes


class CacheMiddleware(BaseHTTPMiddleware):
    """Middleware that caches GET responses and invalidates on writes.

    Only active when Redis is configured (HR_REDIS_URL is set). When Redis
    is unavailable, all requests pass through uncached — zero overhead.
    """

    def __init__(self, app, exclude_paths: list[str] | None = None):
        super().__init__(app)
        self._exclude = set(exclude_paths or [])

    async def dispatch(self, request: Request, call_next):
        redis_client = get_redis()
        if redis_client is None:
            return await call_next(request)

        path = request.url.path
        method = request.method

        # Skip non-cacheable paths
        if path in self._exclude:
            return await call_next(request)

        # ── READ (GET/HEAD) — try cache ─────────────────────────────────
        if method in ("GET", "HEAD") and _should_cache_path(path):
            identity = _extract_identity(request)
            if identity is None:
                # No verified caller: skip the cache so authentication runs.
                return await call_next(request)
            org_id, user_key = identity
            query = str(request.url.query) if request.url.query else ""
            cache_key = _build_key(org_id, user_key, method, path, query)

            try:
                raw = await run_in_threadpool(redis_client.get, cache_key)  # a network call: keep it off the event loop
                if raw is not None:
                    return JSONResponse(
                        content=json.loads(raw),
                        headers={"X-Cache": "HIT"},
                    )
            except Exception as exc:
                logger.debug("[cache] GET failed for '%s': %s", cache_key, exc)
                # Fail open — serve from DB

            # Cache miss — run the request
            response = await call_next(request)

            # Only cache successful JSON responses
            if response.status_code == 200:
                try:
                    body = b""
                    async for chunk in response.body_iterator:
                        body += chunk if isinstance(chunk, bytes) else chunk.encode()
                    # Verify it's valid JSON
                    data = json.loads(body)
                    ttl = _get_ttl(path) or 30
                    # Store in Redis (fire and forget)
                    try:
                        await run_in_threadpool(redis_client.set, cache_key, body.decode(), ex=ttl)
                    except Exception:
                        pass
                    # Rebuild response (we consumed the iterator)
                    return Response(
                        content=body,
                        status_code=response.status_code,
                        headers=dict(response.headers),
                        media_type="application/json",
                    )
                except (json.JSONDecodeError, UnicodeDecodeError):
                    pass

            return response

        # ── WRITE (POST/PUT/PATCH/DELETE) — run then invalidate ─────────
        response = await call_next(request)

        if method in ("POST", "PUT", "PATCH", "DELETE") and response.status_code < 400:
            lifecycle_org = _lifecycle_org_id(method, path)
            if lifecycle_org is not None:
                try:
                    cursor = 0
                    while True:
                        cursor, keys = redis_client.scan(cursor=cursor, match=f"resp:{lifecycle_org}:*", count=500)
                        if keys:
                            redis_client.delete(*keys)
                        if cursor == 0:
                            break
                except Exception as exc:
                    logger.debug("[cache] org lifecycle invalidation failed for %s: %s", lifecycle_org, exc)
            org_id = _extract_org_id(request)
            prefixes = _get_invalidation_prefixes(path)
            if prefixes:
                try:
                    for prefix in prefixes:
                        org_part = org_id if org_id is not None else "*"
                        # keys look like resp:{org}:{user}:{METHOD}:{path}:{hash}
                        pattern = f"resp:{org_part}:*:*:{prefix}*"
                        cursor = 0
                        while True:
                            cursor, keys = redis_client.scan(
                                cursor=cursor, match=pattern, count=200
                            )
                            if keys:
                                redis_client.delete(*keys)
                            if cursor == 0:
                                break
                except Exception as exc:
                    logger.debug("[cache] Invalidation failed for '%s': %s", path, exc)

        return response
