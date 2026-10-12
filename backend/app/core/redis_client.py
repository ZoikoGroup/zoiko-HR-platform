"""
core/redis_client.py
--------------------
Shared Redis connection pool used by both the entitlement cache (cache.py)
and the new response cache (response_cache.py).

Returns None when HR_REDIS_URL is unset — every consumer must handle None
gracefully (fall back to no-cache / no-connection).
"""

import logging
from typing import Optional

from app.config import settings

logger = logging.getLogger("zoiko.redis")

_pool = None


def get_redis():
    """Return a Redis client from the shared connection pool, or None."""
    global _pool
    if not settings.REDIS_URL:
        return None
    try:
        import redis
        if _pool is None:
            _pool = redis.ConnectionPool.from_url(
                settings.REDIS_URL,
                max_connections=20,
                socket_connect_timeout=3,
                socket_timeout=5,
                decode_responses=True,
            )
            logger.info("[redis] Connection pool created for %s", settings.REDIS_URL.split("@")[-1])
        return redis.Redis(connection_pool=_pool)
    except Exception as exc:
        logger.warning("[redis] Failed to get Redis client: %s", exc)
        return None


def ping() -> bool:
    """Health-check: True if Redis responds to PING."""
    client = get_redis()
    if client is None:
        return False
    try:
        return client.ping()
    except Exception:
        return False
