"""Shared test setup.

The real-email and email-confirmation rules are ON in production. The older test suites build accounts with placeholder
addresses (name@example.com) and sign them in straight away, so they run with the rules off; the tests for the rules
themselves (tests/test_real_emails.py) switch them on with the `strict_emails` fixture.
"""
import os

import pytest

from app.config import settings


def pytest_collection_modifyitems(config, items):
    """HR_TEST_SHARD=k/N (CI) runs only shard k of N: whole test files, spread so each shard gets about the same number of
    tests. Every shard is a separate CI job with its own PostgreSQL and Redis, so no state is shared between them."""
    spec = (os.environ.get("HR_TEST_SHARD") or "").strip()
    if not spec:
        return
    k, n = (int(x) for x in spec.split("/"))
    if not 1 <= k <= n:
        raise pytest.UsageError(f"HR_TEST_SHARD={spec}: expected k/N with 1 <= k <= N")
    per_file: dict = {}
    for item in items:
        per_file.setdefault(item.nodeid.split("::")[0], []).append(item)
    load, owner = [0] * n, {}
    for path in sorted(per_file, key=lambda p: (-len(per_file[p]), p)):     # biggest files first, onto the lightest shard
        i = load.index(min(load))
        owner[path], load[i] = i, load[i] + len(per_file[path])
    keep = [it for it in items if owner[it.nodeid.split("::")[0]] == k - 1]
    drop = [it for it in items if owner[it.nodeid.split("::")[0]] != k - 1]
    if drop:
        config.hook.pytest_deselected(items=drop)
    items[:] = keep


@pytest.fixture(autouse=True, scope="session")
def _fast_password_hashing():
    """bcrypt at the production cost (12 rounds) takes ~0.3 s per hash, and most fixtures create a dozen users: that was
    the largest single cost of the backend suite. Tests hash at the minimum cost; verification is unchanged (the cost is
    read from each stored hash), and production keeps its setting."""
    from app.core import security
    security.pwd_context.update(bcrypt__rounds=4)
    yield


@pytest.fixture(autouse=True)
def _clear_caches():
    """Drop the in-process cache before and after every test. The cached org-access
    TTL (30s) would otherwise let an org status/evaluation change in one test
    leak a stale decision into the next."""
    from app.core.cache import clear_caches, invalidate_cache

    def _clear():
        clear_caches()
        # With HR_REDIS_URL set (CI) the entitlement/org-access caches live in Redis, which clear_caches() leaves alone;
        # entries would leak between tests. Flush it only when it is a local instance.
        url = settings.REDIS_URL or ""
        if url and any(h in url for h in ("localhost", "127.0.0.1", "redis://redis", "host.docker.internal")):
            invalidate_cache("")

    _clear()
    yield
    _clear()


@pytest.fixture(autouse=True)
def _relaxed_email_rules(request, monkeypatch):
    if "strict_emails" in request.fixturenames:
        monkeypatch.setattr(settings, "EMAIL_REAL_ONLY", True)
        monkeypatch.setattr(settings, "EMAIL_DNS_CHECK", False)          # no network in tests; the DNS part is tested on its own
        monkeypatch.setattr(settings, "REQUIRE_EMAIL_VERIFICATION", True)
    else:
        monkeypatch.setattr(settings, "EMAIL_REAL_ONLY", False)
        monkeypatch.setattr(settings, "EMAIL_DNS_CHECK", False)
        monkeypatch.setattr(settings, "REQUIRE_EMAIL_VERIFICATION", False)
    yield


@pytest.fixture
def strict_emails():
    """Marker fixture: the test runs with the real-email and confirmation rules on."""
    return True


@pytest.fixture(autouse=True)
def _support_access_mfa_on(monkeypatch):
    """The ZHR-PRIV-001 second factor on the support-access surface is pinned ON for every test.

    The dev escape hatch (HR_SUPPORT_ACCESS_MFA_REQUIRED=false) lives in a developer's local .env, which the settings
    loader reads here too. Without this, a local .env would silently disable the control the B06/B07 tests assert."""
    monkeypatch.setattr(settings, "SUPPORT_ACCESS_MFA_REQUIRED", True)
    yield
