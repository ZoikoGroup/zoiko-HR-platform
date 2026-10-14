"""Live grant-state cache with a short TTL (ZHR-PRIV-001 B07, F08).

Enforcement asks this cache "is grant X still live?" on every request. A TTL of a few seconds bounds how long a revoked
grant could still be honoured, and a revocation drops the entry (and leaves a tombstone) everywhere at once. The Redis
pub/sub fan-out (Phase 7) uses `publish_revocation`/`apply_revocation`; without Redis the in-process store is used and the
TTL still bounds staleness on a single node.
"""
from __future__ import annotations

import logging
import threading
import time
from typing import Optional

logger = logging.getLogger("zoiko.privacy.support")

TTL_SECONDS = 5.0
TOMBSTONE_TTL = 300.0

_LOCK = threading.Lock()
_STORE: dict[str, tuple[float, object]] = {}
_TOMBSTONES: dict[str, float] = {}


def put(grant_id: str, value, ttl: float = TTL_SECONDS) -> None:
    with _LOCK:
        _STORE[grant_id] = (time.time() + ttl, value)


def get(grant_id: str):
    """Return the cached value, or the sentinel REVOKED, or None. A tombstone always wins over a live entry."""
    with _LOCK:
        if grant_id in _TOMBSTONES and _TOMBSTONES[grant_id] > time.time():
            return REVOKED
        entry = _STORE.get(grant_id)
        if entry is None:
            return None
        expires, value = entry
        if expires <= time.time():
            _STORE.pop(grant_id, None)
            return None
        return value


def forget_grant(grant_id: str) -> None:
    """Drop the cached state and leave a tombstone so a racing read cannot resurrect a revoked grant."""
    with _LOCK:
        _STORE.pop(grant_id, None)
        _TOMBSTONES[grant_id] = time.time() + TOMBSTONE_TTL
    publish_revocation(grant_id)


def clear() -> None:
    with _LOCK:
        _STORE.clear()
        _TOMBSTONES.clear()


class _Revoked:
    def __repr__(self):  # pragma: no cover
        return "REVOKED"


REVOKED = _Revoked()


def publish_revocation(grant_id: str) -> None:
    """Fan out the revocation to other nodes. Best effort: a missing Redis must never block the local revocation."""
    try:
        from app.core.redis_client import get_redis  # type: ignore

        client = get_redis()
        if client is not None:
            client.publish("zhr:support:revocation", grant_id)
    except Exception:
        logger.debug("revocation publish skipped (no redis)", exc_info=True)


def apply_revocation(grant_id: str) -> None:
    """A message from the pub/sub channel: drop the entry on this node (and leave the tombstone)."""
    with _LOCK:
        _STORE.pop(grant_id, None)
        _TOMBSTONES[grant_id] = time.time() + TOMBSTONE_TTL
