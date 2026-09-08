"""
tests/test_entitlement_cache_redis.py
---------------------------------------
Phase 13 — proves the Redis-backed cache actually closes the multi-worker
staleness bug test_entitlement_cache.py documents (that file explicitly notes
the in-process cache is "process-global" and only tests single-process
invalidation). Two independently-constructed _RedisCache instances simulate
two separate workers/containers that share no Python memory — the only thing
they share is the Redis connection, which is exactly the condition that was
missing before this phase.

Requires a real reachable Redis — set TEST_REDIS_URL (falls back to
redis://localhost:6379/0). Skipped automatically if nothing is listening
there, so this file doesn't fail the suite in an environment with no Redis
(e.g. a CI job that hasn't added the service yet).
"""

import os

import pytest

pytest.importorskip("redis")
import redis as redis_lib

from app.core.cache import _RedisCache

TEST_REDIS_URL = os.environ.get("TEST_REDIS_URL", "redis://localhost:16379/0")


def _redis_available() -> bool:
    try:
        redis_lib.Redis.from_url(TEST_REDIS_URL, socket_connect_timeout=1).ping()
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _redis_available(), reason="no reachable Redis for this test")


@pytest.fixture(autouse=True)
def _clean_redis():
    client = redis_lib.Redis.from_url(TEST_REDIS_URL)
    client.flushdb()
    yield
    client.flushdb()


def test_write_on_one_instance_visible_on_another():
    """The actual bug being fixed: two separate cache objects (simulating two
    worker processes) must see each other's writes through shared Redis."""
    worker_a = _RedisCache(TEST_REDIS_URL)
    worker_b = _RedisCache(TEST_REDIS_URL)

    worker_a.set("entitlement:1:hr.documents.core", {"state": "ENTITLED_AVAILABLE"})

    assert worker_b.get("entitlement:1:hr.documents.core") == {"state": "ENTITLED_AVAILABLE"}


def test_invalidation_on_one_instance_visible_on_another():
    """This is the exact scenario that was broken: instance A handles a plan
    upgrade and invalidates; instance B must stop serving the old value on
    its very next read, without waiting for its own local TTL."""
    worker_a = _RedisCache(TEST_REDIS_URL)
    worker_b = _RedisCache(TEST_REDIS_URL)

    worker_a.set("entitlement:1:hr.documents.core", {"state": "NOT_ENTITLED"})
    assert worker_b.get("entitlement:1:hr.documents.core") == {"state": "NOT_ENTITLED"}

    # Instance A handles the upgrade and invalidates org 1's entries.
    worker_a.invalidate_prefix("entitlement:1:")

    # Instance B must see the invalidation immediately — no stale read.
    assert worker_b.get("entitlement:1:hr.documents.core") is None


def test_invalidate_prefix_does_not_affect_other_orgs():
    worker = _RedisCache(TEST_REDIS_URL)
    worker.set("entitlement:1:hr.documents.core", {"state": "ENTITLED_AVAILABLE"})
    worker.set("entitlement:2:hr.documents.core", {"state": "ENTITLED_AVAILABLE"})

    worker.invalidate_prefix("entitlement:1:")

    assert worker.get("entitlement:1:hr.documents.core") is None
    assert worker.get("entitlement:2:hr.documents.core") == {"state": "ENTITLED_AVAILABLE"}


def test_fails_closed_on_unreachable_redis():
    """A Redis that can't be reached must degrade to a cache miss (forcing
    the authoritative DB read), never silently serve nothing-was-ever-written
    as if that were a valid decision, and never raise into the request path."""
    unreachable = _RedisCache("redis://127.0.0.1:1/0")  # nothing listens on port 1

    assert unreachable.get("entitlement:1:hr.documents.core") is None
    unreachable.set("entitlement:1:hr.documents.core", {"state": "ENTITLED_AVAILABLE"})  # must not raise
    unreachable.invalidate_prefix("entitlement:1:")  # must not raise
