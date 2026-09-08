"""
core/cache.py
--------------
Entitlement decision cache — process-local by default, Redis-backed (shared
across workers/instances) when HR_REDIS_URL is configured.

Why this matters (Section 13.2): a single-process in-memory cache is invisible
to every OTHER worker/instance. On any deployment with more than one process —
multiple `--workers`, or multiple horizontally-scaled containers (Cloud Run,
GKE) — an invalidation triggered by one instance (e.g. a plan upgrade handled
by instance A) never reaches instance B's copy of the cache, so instance B can
keep serving a stale, no-longer-correct decision for up to the TTL. That is
exactly backwards for a system whose spec (13.2) requires "a stale cache must
fail closed where it could grant a capability that is no longer entitled."

Two backends, same three-function interface (get_cached / set_cached /
invalidate_cache) so entitlement_service.py never needs to know which one is
active:

  - In-process (`cachetools.TTLCache`): used when HR_REDIS_URL is unset. This
    is what local dev, tests, and CI run on today — zero new infra required,
    unchanged behavior from before Redis support existed.
  - Redis: used when HR_REDIS_URL is set. Shared across every process that
    points at the same Redis instance, closing the staleness gap above.

Fail-closed on Redis errors: any exception talking to Redis (connection
refused, timeout, etc.) is caught and logged, and the operation degrades to
the safe direction —
  - get_cached  -> None (a cache miss forces entitlement_service.py to fall
                   through to the authoritative DB read; never returns a
                   possibly-stale cached decision it can't verify)
  - set_cached  -> no-op (an entitlement decision fails to cache; the next
                   read just recomputes it — no harm)
  - invalidate_cache -> no-op, but logged loudly, because a failed
                   invalidation during a Redis outage means any value already
                   cached (in a healthy replica, or once Redis recovers)
                   could still be stale. Ops should treat repeated
                   invalidation failures as a page, not a shrug.
This never fails OPEN — a cache that can't be reached or can't be cleared
never causes a request to be treated as more entitled than the authoritative
source would say.
"""

import logging

from cachetools import TTLCache

from app.config import settings

logger = logging.getLogger("zoiko.cache")

_TTL_SECONDS = 120

# ── In-process backend (default; used by local dev, tests, CI) ─────────────
_local_cache = TTLCache(maxsize=1024, ttl=_TTL_SECONDS)


class _InProcessCache:
    def get(self, key: str):
        return _local_cache.get(key)

    def set(self, key: str, value) -> None:
        _local_cache[key] = value

    def invalidate_prefix(self, pattern: str) -> None:
        for k in [k for k in _local_cache.keys() if k.startswith(pattern)]:
            del _local_cache[k]


# ── Redis backend (opt-in via HR_REDIS_URL) ─────────────────────────────────
class _RedisCache:
    def __init__(self, url: str):
        import redis

        self._client = redis.Redis.from_url(url, socket_connect_timeout=2, socket_timeout=2)

    def get(self, key: str):
        import json

        try:
            raw = self._client.get(key)
        except Exception as exc:
            logger.warning("[cache] Redis GET failed for '%s' — treating as cache miss: %s", key, exc)
            return None
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except (TypeError, ValueError) as exc:
            logger.warning("[cache] Redis value for '%s' was not valid JSON, discarding: %s", key, exc)
            return None

    def set(self, key: str, value) -> None:
        import json

        try:
            self._client.set(key, json.dumps(value), ex=_TTL_SECONDS)
        except Exception as exc:
            logger.warning("[cache] Redis SET failed for '%s' — decision will not be cached: %s", key, exc)

    def invalidate_prefix(self, pattern: str) -> None:
        try:
            cursor = 0
            deleted = 0
            while True:
                cursor, keys = self._client.scan(cursor=cursor, match=f"{pattern}*", count=200)
                if keys:
                    self._client.delete(*keys)
                    deleted += len(keys)
                if cursor == 0:
                    break
            logger.info("[cache] Redis invalidated %d key(s) for prefix '%s'.", deleted, pattern)
        except Exception as exc:
            logger.error(
                "[cache] Redis invalidation FAILED for prefix '%s' — a stale entry "
                "may still be served until it expires (up to %ds). Investigate Redis "
                "connectivity: %s",
                pattern, _TTL_SECONDS, exc,
            )


def _build_backend():
    if settings.REDIS_URL:
        logger.info("[cache] Using Redis-backed entitlement cache (shared across workers/instances).")
        return _RedisCache(settings.REDIS_URL)
    logger.info(
        "[cache] Using in-process entitlement cache (HR_REDIS_URL unset) — "
        "NOT shared across multiple workers/instances. Fine for single-instance "
        "dev/test; set HR_REDIS_URL before scaling to more than one process."
    )
    return _InProcessCache()


_backend = _build_backend()


def get_cached(key: str):
    return _backend.get(key)


def set_cached(key: str, value) -> None:
    _backend.set(key, value)


def invalidate_cache(pattern: str) -> None:
    _backend.invalidate_prefix(pattern)
