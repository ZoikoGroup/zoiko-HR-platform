"""Response-cache middleware must never serve data to someone who could not
have fetched it, and must not serve one user's response to another."""

import fnmatch

import pytest
from fastapi import FastAPI, Header, HTTPException
from fastapi.testclient import TestClient

from app.core import cache_middleware
from app.core.cache_middleware import CacheMiddleware, _build_key, _get_invalidation_prefixes, _should_cache_path
from app.core.security import create_access_token


class FakeRedis:
    def __init__(self):
        self.store = {}

    def get(self, key):
        return self.store.get(key)

    def set(self, key, value, ex=None):
        self.store[key] = value

    def scan(self, cursor=0, match=None, count=None):
        return 0, [k for k in self.store if fnmatch.fnmatchcase(k, match)]

    def delete(self, *keys):
        for k in keys:
            self.store.pop(k, None)


def _token(email, role="employee", org=1):
    return {"Authorization": "Bearer " + create_access_token({"sub": email, "role": role, "id": 1, "organization_id": org})}


@pytest.fixture
def world(monkeypatch):
    redis = FakeRedis()
    monkeypatch.setattr(cache_middleware, "get_redis", lambda: redis)
    hits = {"n": 0}
    app = FastAPI()
    app.add_middleware(CacheMiddleware)

    def _who(authorization):
        if not authorization:
            raise HTTPException(status_code=401, detail="no token")
        return authorization

    @app.get("/hr/employees")
    def employees(authorization: str = Header(None)):
        hits["n"] += 1
        return {"served_to": _who(authorization)[-6:], "n": hits["n"]}

    @app.post("/hr/employees")
    def create(authorization: str = Header(None)):
        _who(authorization)
        return {"ok": True}

    @app.get("/super-admin/audit-logs")
    def audit(authorization: str = Header(None)):
        hits["n"] += 1
        _who(authorization)
        return {"secret": "platform data", "n": hits["n"]}

    return {"c": TestClient(app), "redis": redis, "hits": hits}


def test_unauthenticated_request_cannot_read_a_cached_response(world):
    c = world["c"]
    assert c.get("/hr/employees", headers=_token("amy@example.com")).status_code == 200
    assert c.get("/hr/employees", headers=_token("amy@example.com")).headers.get("x-cache") == "HIT"
    anon = c.get("/hr/employees")  # no token: authentication must still run
    assert anon.status_code == 401 and anon.headers.get("x-cache") != "HIT"
    forged = c.get("/hr/employees", headers={"Authorization": "Bearer not-a-real-token"})
    assert forged.headers.get("x-cache") != "HIT"  # not served from the cache; the route's own auth decides


def test_super_admin_responses_are_never_cached_or_shared(world):
    c = world["c"]
    sa = _token("root@example.com", "super_admin", None)
    assert c.get("/super-admin/audit-logs", headers=sa).status_code == 200
    second = c.get("/super-admin/audit-logs", headers=sa)
    assert second.headers.get("x-cache") != "HIT" and second.json()["n"] == 2  # handler ran again
    assert c.get("/super-admin/audit-logs").status_code == 401  # unauthenticated still rejected
    assert not any("/super-admin" in k for k in world["redis"].store)


def test_responses_are_scoped_per_user_not_just_per_organization(world):
    c = world["c"]
    a = c.get("/hr/employees", headers=_token("amy@example.com"))
    b = c.get("/hr/employees", headers=_token("bob@example.com"))  # same organization
    assert b.headers.get("x-cache") != "HIT"
    assert a.json()["served_to"] != b.json()["served_to"]
    assert c.get("/hr/employees", headers=_token("amy@example.com")).headers.get("x-cache") == "HIT"
    other_org = c.get("/hr/employees", headers=_token("amy@example.com", org=2))
    assert other_org.headers.get("x-cache") != "HIT"


def test_a_write_invalidates_the_orgs_cached_lists(world):
    c = world["c"]
    h = _token("amy@example.com")
    c.get("/hr/employees", headers=h)
    assert c.get("/hr/employees", headers=h).headers.get("x-cache") == "HIT"
    assert c.post("/hr/employees", headers=h).status_code == 200
    fresh = c.get("/hr/employees", headers=h)
    assert fresh.headers.get("x-cache") != "HIT"
    # other organizations' caches are untouched
    other = _token("zed@example.com", org=2)
    c.get("/hr/employees", headers=other)
    c.post("/hr/employees", headers=h)
    assert c.get("/hr/employees", headers=other).headers.get("x-cache") == "HIT"


def test_key_shape_and_path_rules():
    key = _build_key(3, "abc123", "GET", "/hr/employees", "page=1")
    assert key.startswith("resp:3:abc123:GET:/hr/employees:")
    assert _should_cache_path("/super-admin/users") is False
    assert _should_cache_path("/notifications") is False
    assert _should_cache_path("/hr/employees") is True
    assert "/hr/employee" in _get_invalidation_prefixes("/hr/employee-management/promote")
    assert "/hr/document" in _get_invalidation_prefixes("/hr/document-folders")


def test_deleting_or_restoring_an_organization_drops_everything_cached_for_it(world):
    from app.core.cache_middleware import _lifecycle_org_id

    assert _lifecycle_org_id("DELETE", "/super-admin/organizations/7") == 7
    assert _lifecycle_org_id("POST", "/super-admin/organizations/7/restore") == 7
    assert _lifecycle_org_id("GET", "/super-admin/organizations/7") is None
    assert _lifecycle_org_id("POST", "/super-admin/organizations/7/status") is None
    assert _lifecycle_org_id("DELETE", "/super-admin/organizations/7/restore") is None


def test_lifecycle_write_flushes_that_orgs_cache_only(world):
    from fastapi import FastAPI

    app = FastAPI()
    app.add_middleware(CacheMiddleware)

    @app.get("/hr/employees")
    def employees(authorization: str = Header(None)):
        return {"ok": True}

    @app.delete("/super-admin/organizations/{org_id}")
    def delete_org(org_id: int):
        return {"deleted": org_id}

    c = TestClient(app)
    org1, org2 = _token("a@example.com", org=1), _token("b@example.com", org=2)
    c.get("/hr/employees", headers=org1)
    c.get("/hr/employees", headers=org2)
    assert c.get("/hr/employees", headers=org1).headers.get("x-cache") == "HIT"
    assert c.delete("/super-admin/organizations/1").status_code == 200
    assert c.get("/hr/employees", headers=org1).headers.get("x-cache") != "HIT"  # org 1 flushed
    assert c.get("/hr/employees", headers=org2).headers.get("x-cache") == "HIT"  # org 2 untouched
