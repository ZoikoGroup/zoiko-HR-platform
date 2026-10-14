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


CHANNEL = "zhr:support:revocation"
_subscriber_thread: Optional[threading.Thread] = None
_subscriber_stop: Optional[threading.Event] = None


def subscribe(stop_event: Optional[threading.Event] = None, poll_timeout: float = 1.0) -> None:
    """Blocking pub/sub loop: apply every revocation another node published. Returns when stop_event is set (or at once if
    there is no Redis, so a caller without Redis is never blocked)."""
    client = None
    try:
        from app.core.redis_client import get_redis

        client = get_redis()
    except Exception:
        client = None
    if client is None:
        logger.debug("revocation subscriber not started (no redis)")
        return
    pubsub = client.pubsub(ignore_subscribe_messages=True)
    pubsub.subscribe(CHANNEL)
    try:
        while not (stop_event is not None and stop_event.is_set()):
            message = pubsub.get_message(timeout=poll_timeout)
            if message and message.get("type") == "message":
                apply_revocation(message.get("data"))
    except Exception:
        logger.warning("revocation subscriber stopped after an error", exc_info=True)
    finally:
        try:
            pubsub.close()
        except Exception:  # pragma: no cover
            pass


def start_subscriber() -> Optional[threading.Thread]:
    """Start the revocation subscriber on a daemon thread. Idempotent; returns None when there is no Redis."""
    global _subscriber_thread, _subscriber_stop
    if _subscriber_thread is not None and _subscriber_thread.is_alive():
        return _subscriber_thread
    if _subscriber_stop is None:
        _subscriber_stop = threading.Event()
    try:
        from app.core.redis_client import get_redis

        if get_redis() is None:
            return None
    except Exception:
        return None
    _subscriber_thread = threading.Thread(
        target=subscribe, args=(_subscriber_stop,), daemon=True, name="support-revocation-subscriber"
    )
    _subscriber_thread.start()
    return _subscriber_thread


def stop_subscriber() -> None:
    global _subscriber_thread, _subscriber_stop
    if _subscriber_stop is not None:
        _subscriber_stop.set()
    _subscriber_thread = None
