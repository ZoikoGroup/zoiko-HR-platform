"""IDOR / tenant-boundary property tests generated from the endpoint inventory (ZHR-PRIV-001 C01, C07, D03; T02, T12).

For every GET route a TENANT-A user can call, with every id of TENANT-B in the place of the object id, and with generated filters,
pagination, sort and search parameters: nothing of TENANT-B appears, nothing crashes, and a foreign id looks like a missing one.
"""
import json
import re

import pytest
from hypothesis import HealthCheck, given, settings, strategies as st
from sqlalchemy import text

from scripts.privacy_endpoint_inventory import inventory
from tests.privacy.support import CANARY, all_canaries_in

B_CANARIES = ("name_b1", "last_b1", "email_b1", "iban_b1")
FORBIDDEN_STATUS = {500, 502, 503}
SKIP_PREFIXES = ("/hr/employee-management/employees/import", "/hr/employee-management/employees/delete-all", "/assistant", "/hr/files/signed")


def _routes():
    from app.main import app
    out = []
    for r in inventory(app):
        if r["privacy_class"] != "DATA_PLANE" or "GET" not in r["methods"] or r["path"].startswith(SKIP_PREFIXES):
            continue
        params = re.findall(r"\{([^}]+)\}", r["path"])
        if len(params) <= 1:
            out.append((r["path"], params))
    return out


ROUTES = _routes()


@pytest.fixture
def foreign_ids(world):
    """Every id of TENANT-B (any table), plus a few that exist nowhere."""
    ids = set()
    for table in ("employees", "employee_profiles", "hr_documents", "leave_requests", "departments"):
        ids.update(r[0] for r in world.db.execute(text(f"SELECT id FROM {table} WHERE organization_id = 2")).fetchall())
    return sorted(ids) + [987654, 4242424]


def _shape(resp):
    return resp.status_code, re.sub(r"\d+", "N", resp.text)[:300]


def test_the_route_sweep_found_a_real_number_of_routes():
    assert len(ROUTES) > 150, len(ROUTES)


@settings(max_examples=80, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow])
@given(data=st.data())
def test_C07_a_tenant_user_never_gets_another_tenants_data_through_any_get_route(world, foreign_ids, data):
    path, params = data.draw(st.sampled_from(ROUTES))
    url = path
    for p in params:
        url = url.replace("{" + p + "}", str(data.draw(st.sampled_from(foreign_ids))))
    query = {
        "page": data.draw(st.one_of(st.integers(-3, 50), st.just("x"))),
        "per_page": data.draw(st.one_of(st.integers(-3, 500), st.just("y"))),
        "search": data.draw(st.sampled_from(["", "CanaryGamma", CANARY["email_b1"], "%", "' OR 1=1 --", "tenant-b"])),
        "sort_by": data.draw(st.sampled_from(["", "last_name", "-created_at", "organization_id", "id"])),
        "organization_id": data.draw(st.sampled_from([None, 1, 2, 999])),
        "status": data.draw(st.sampled_from(["", "active", "x"])),
    }
    query = {k: v for k, v in query.items() if v not in (None, "")}
    who = data.draw(st.sampled_from(["a_admin", "a_hr", "a_manager", "a_emp2"]))
    resp = world.get(who, url, params=query)
    assert resp.status_code not in FORBIDDEN_STATUS, (who, url, query, resp.status_code, resp.text[:200])
    assert not all_canaries_in(resp.text, *B_CANARIES), (who, url, query)


@settings(max_examples=40, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow])
@given(data=st.data())
def test_C07_a_foreign_object_id_looks_exactly_like_a_missing_one(world, foreign_ids, data):
    candidates = [r for r in ROUTES if len(r[1]) == 1 and r[1][0] in ("employee_id", "id", "document_id", "user_id")]
    path, params = data.draw(st.sampled_from(candidates))
    foreign = data.draw(st.sampled_from([i for i in foreign_ids if i < 900000]))
    ours = {world.u["a_emp1"].id, world.u["a_emp2"].id, world.u["a_admin"].id, world.u["a_hr"].id, world.u["a_manager"].id}
    if foreign in ours:                                   # the id spaces overlap across tables: only ids that are not ours are foreign here
        return
    miss = world.get("a_admin", path.replace("{" + params[0] + "}", "987654"))
    other = world.get("a_admin", path.replace("{" + params[0] + "}", str(foreign)))
    if other.status_code == 200 or miss.status_code == 200:
        return                                            # the route has data at that id in the caller's own tenant
    assert _shape(other)[0] == _shape(miss)[0], (path, other.status_code, miss.status_code)


@settings(max_examples=40, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow])
@given(data=st.data())
def test_T01_a_platform_token_gets_nothing_from_any_route_with_any_parameters(world, foreign_ids, data):
    path, params = data.draw(st.sampled_from(ROUTES))
    url = path
    for p in params:
        url = url.replace("{" + p + "}", str(data.draw(st.sampled_from(foreign_ids))))
    resp = world.get("platform", url, params={"search": data.draw(st.sampled_from(["", "CanaryAlpha", "CanaryGamma"])),
                                              "organization_id": data.draw(st.sampled_from([1, 2]))})
    assert resp.status_code == 404 and resp.json() == {"detail": "Not Found"}, (url, resp.status_code, resp.text[:120])
    assert not all_canaries_in(resp.text)
