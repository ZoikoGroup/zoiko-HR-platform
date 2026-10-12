"""
core/response_cache.py
----------------------
Generic Redis-backed HTTP response cache for FastAPI endpoints.

Strategy:
  - Every GET endpoint that takes no user-specific mutation can be cached.
  - Cache key:  resp:{org_id}:{path}:{sorted_query_params_hash}
  - TTL per category: dashboards=60s, lists=45s, stats=90s
  - Writes (POST/PUT/PATCH/DELETE) invalidate all keys with a matching prefix
    so the next GET re-fetches fresh data from the DB.
  - Fail-closed: Redis errors degrade to uncached responses, never to stale
    or crash.

Usage in a router:
    from app.core.response_cache import cached_response, invalidate_prefix

    @router.get("/dashboard/stats")
    @cached_response(prefix="hr:dashboard", ttl=60)
    def dashboard_stats(...):
        ...

    @router.post("/leaves")
    def create_leave(...):
        ...
        invalidate_prefix("hr:leaves", org_id=current_user.organization_id)
"""

import hashlib
import json
import logging
import time
from functools import wraps
from typing import Optional

from app.core.redis_client import get_redis

logger = logging.getLogger("zoiko.cache.response")

# ── Default TTLs (seconds) by category ──────────────────────────────────────
TTL_DASHBOARD = 60
TTL_LIST = 45
TTL_STATS = 90
TTL_LIGHT = 30


def _build_cache_key(prefix: str, org_id: Optional[int], path: str, query_params: dict) -> str:
    """Build a deterministic Redis key from endpoint metadata.

    The query param dict is sorted and JSON-serialized so the same logical
    request always maps to the same key regardless of param ordering.
    """
    # Stable hash of query params (sorted keys, compact JSON)
    params_str = json.dumps(query_params, sort_keys=True, default=str, separators=(",", ":"))
    params_hash = hashlib.md5(params_str.encode()).hexdigest()[:12]
    org_part = org_id if org_id is not None else "anon"
    return f"resp:{prefix}:{org_part}:{path}:{params_hash}"


def _serialize(data) -> Optional[str]:
    """Convert a Python value to a JSON string for Redis storage."""
    if data is None:
        return None
    try:
        return json.dumps(data, default=str)
    except (TypeError, ValueError) as exc:
        logger.warning("[response_cache] Serialization failed: %s", exc)
        return None


def _deserialize(raw: str):
    """Convert a JSON string back to Python objects."""
    try:
        return json.loads(raw)
    except (TypeError, ValueError) as exc:
        logger.warning("[response_cache] Deserialization failed: %s", exc)
        return None


def cached_response(prefix: str = "resp", ttl: int = TTL_LIST):
    """Decorator that caches an endpoint's JSON response in Redis.

    The decorated function must accept a ``current_user`` keyword argument
    (injected by Depends(get_current_user)) so the org_id is available.
    If no current_user is found, caching is skipped (uncached response).
    """

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            redis_client = get_redis()
            if redis_client is None:
                return fn(*args, **kwargs)

            # Extract current_user from kwargs (FastAPI injects it)
            current_user = kwargs.get("current_user")
            org_id = getattr(current_user, "organization_id", None)

            # Extract path from the function name (caller sets __cache_path__)
            path = getattr(fn, "__cache_path__", fn.__name__)

            # Build query params dict from kwargs (exclude 'db', 'current_user', 'request')
            query_params = {
                k: v for k, v in kwargs.items()
                if k not in ("db", "current_user", "request", "token")
                and v is not None
            }

            cache_key = _build_cache_key(prefix, org_id, path, query_params)

            # Try cache hit
            try:
                raw = redis_client.get(cache_key)
                if raw is not None:
                    return _deserialize(raw)
            except Exception as exc:
                logger.debug("[response_cache] GET failed for '%s': %s", cache_key, exc)
                # Fail open on read — serve from DB
                return fn(*args, **kwargs)

            # Cache miss — call the actual endpoint
            result = fn(*args, **kwargs)

            # Serialize and store
            serialized = _serialize(result)
            if serialized is not None:
                try:
                    redis_client.set(cache_key, serialized, ex=ttl)
                except Exception as exc:
                    logger.debug("[response_cache] SET failed for '%s': %s", cache_key, exc)

            return result

        # Attach metadata for the path-based key
        wrapper.__cache_prefix__ = prefix
        return wrapper

    return decorator


def invalidate_prefix(prefix: str, org_id: Optional[int] = None) -> int:
    """Delete all cached responses matching a prefix (and optionally org_id).

    Called by write endpoints to ensure subsequent reads fetch fresh data.
    Returns the number of keys deleted (best-effort).
    """
    redis_client = get_redis()
    if redis_client is None:
        return 0

    # Build the scan pattern
    org_part = org_id if org_id is not None else "*"
    pattern = f"resp:{prefix}:{org_part}:*"

    try:
        cursor = 0
        deleted = 0
        while True:
            cursor, keys = redis_client.scan(cursor=cursor, match=pattern, count=200)
            if keys:
                redis_client.delete(*keys)
                deleted += len(keys)
            if cursor == 0:
                break
        if deleted:
            logger.info("[response_cache] Invalidated %d key(s) for pattern '%s'", deleted, pattern)
        return deleted
    except Exception as exc:
        logger.warning("[response_cache] Invalidation FAILED for '%s': %s", pattern, exc)
        return 0


def invalidate_all(org_id: Optional[int] = None) -> int:
    """Nuclear option: invalidate ALL response cache keys for an org."""
    return invalidate_prefix("*", org_id=org_id)


def cache_stats() -> dict:
    """Return basic Redis/cache stats for monitoring."""
    redis_client = get_redis()
    if redis_client is None:
        return {"backend": "in-memory (no redis)", "connected": False}
    try:
        info = redis_client.info("keyspace")
        return {"backend": "redis", "connected": True, "info": info}
    except Exception:
        return {"backend": "redis", "connected": False}
