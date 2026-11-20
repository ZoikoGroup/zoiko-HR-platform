"""Assets audit batch 4: A13 (text lengths match the database columns: a 422, never a PostgreSQL 500), A16 (the request
list loads names in one query, not two per row) and the purchase-date rule (A17: no dates after today).
"""
from datetime import date, timedelta

import pytest
from sqlalchemy import event

from app.modules.hr.models import Asset, AssetRequest, AssetRequestStatus, AssetStatus


def _req_body(**over):
    body = {"asset_type": "Monitor", "quantity": 1, "priority": "medium", "reason": "Work", "requested_on": date.today().isoformat()}
    body.update(over)
    return body


# ── A13: lengths ─────────────────────────────────────────────────────────────────────────────────────────────────────

def test_asset_type_longer_than_its_column_is_a_422(world):
    assert world.post("a_emp1", "/hr/assets/requests", json=_req_body(asset_type="x" * 101)).status_code == 422
    assert world.post("a_emp1", "/hr/assets/requests", json=_req_body(asset_type="")).status_code == 422
    ok = world.post("a_emp1", "/hr/assets/requests", json=_req_body(asset_type="x" * 100))
    assert ok.status_code == 201, ok.text
    assert world.db.query(AssetRequest).count() == 1


def test_maintenance_text_fields_are_limited_to_their_columns(world):
    a = Asset(name="Laptop", asset_tag="M-1", organization_id=1, status=AssetStatus.AVAILABLE)
    world.db.add(a)
    world.db.commit()
    base = {"asset_id": a.id, "issue": "Screen flickers", "priority": "medium", "reported_on": date.today().isoformat()}
    for field, size in (("asset_name", 151), ("asset_tag", 101), ("reported_by", 151)):
        r = world.post("a_admin", f"/hr/assets/{a.id}/maintenance", json={**base, field: "x" * size})
        assert r.status_code == 422, (field, r.text)
    assert world.post("a_admin", f"/hr/assets/{a.id}/maintenance", json={**base, "issue": ""}).status_code == 422
    assert world.post("a_admin", f"/hr/assets/{a.id}/maintenance", json=base).status_code == 201


def test_report_and_setting_text_fields_are_limited_to_their_columns(world):
    assert world.post("a_admin", "/hr/assets/reports", json={"report_type": "x" * 51, "title": "T"}).status_code == 422
    assert world.post("a_admin", "/hr/assets/reports", json={"report_type": "inventory", "title": "x" * 201}).status_code == 422
    assert world.post("a_admin", "/hr/assets/reports", json={"report_type": "inventory", "title": "Q4"}).status_code == 201
    assert world.put("a_admin", f"/hr/assets/settings/{'k' * 101}", json={"setting_value": "1"}).status_code == 422
    assert world.put("a_admin", "/hr/assets/settings/currency", json={"setting_value": "EUR"}).status_code == 200


def test_asset_and_category_names_keep_their_limits(world):
    assert world.post("a_admin", "/hr/assets", json={"name": "x" * 151, "asset_tag": "T-1"}).status_code == 422
    assert world.post("a_admin", "/hr/assets", json={"name": "Laptop", "asset_tag": "x" * 101}).status_code == 422
    assert world.post("a_admin", "/hr/assets/categories", json={"name": "x" * 101}).status_code == 422


# ── purchase date ────────────────────────────────────────────────────────────────────────────────────────────────────

def test_a_purchase_date_after_today_is_refused_on_create_and_update(world):
    future = (date.today() + timedelta(days=1)).isoformat()
    r = world.post("a_admin", "/hr/assets", json={"name": "Laptop", "asset_tag": "PD-1", "purchase_date": "2099-01-01"})
    assert r.status_code == 422 and "future" in r.text
    ok = world.post("a_admin", "/hr/assets", json={"name": "Laptop", "asset_tag": "PD-1", "purchase_date": date.today().isoformat()})
    assert ok.status_code == 201, ok.text
    assert world.put("a_admin", f"/hr/assets/{ok.json()['id']}", json={"purchase_date": future}).status_code == 422
    past = world.put("a_admin", f"/hr/assets/{ok.json()['id']}", json={"purchase_date": "2024-03-01"})
    assert past.status_code == 200 and past.json()["purchase_date"] == "2024-03-01"


# ── A16: names in one query ──────────────────────────────────────────────────────────────────────────────────────────

def _drop_cached_responses():
    """Rows written straight to the database skip the cache invalidation an API write triggers: with Redis on (CI) the
    response cache would keep serving the list as it was. Drop the cached responses so the next GET reads the database."""
    from app.core.redis_client import get_redis
    client = get_redis()
    if client is not None:
        for key in client.scan_iter(match="resp:*", count=500):
            client.delete(key)


def _seed_requests(w, n):
    people = [w.u["a_emp1"], w.u["a_emp2"], w.u["a_manager"]]
    for i in range(n):
        who = people[i % len(people)]
        w.db.add(AssetRequest(employee_id=who.id, employee_name=None if i % 2 else who.full_name, asset_type=f"Item {i}",
                              requested_on=date.today(), organization_id=1, status=AssetRequestStatus.APPROVED,
                              approved_by=w.u["a_hr"].id if i % 2 else w.u["a_admin"].id))
    w.db.commit()
    _drop_cached_responses()


def _count_queries(w, url):
    _drop_cached_responses()                       # each measured call reads the database, never a cached answer
    engine = w.db.get_bind()
    seen = []
    listener = lambda *args, **kw: seen.append(1)
    event.listen(engine, "before_cursor_execute", listener)
    try:
        r = w.get("a_admin", url)
    finally:
        event.remove(engine, "before_cursor_execute", listener)
    assert r.status_code == 200, r.text
    return len(seen), r.json()


def test_the_request_list_costs_the_same_number_of_queries_for_2_or_20_rows(world):
    _seed_requests(world, 2)
    _count_queries(world, "/hr/assets/requests?per_page=50")          # warm up: first-request caches are not the list's cost
    small, _ = _count_queries(world, "/hr/assets/requests?per_page=50")
    _seed_requests(world, 18)
    big, body = _count_queries(world, "/hr/assets/requests?per_page=50")
    assert body["total"] == 20
    assert big == small, f"{small} queries for 2 rows but {big} for 20"


def test_the_request_list_still_names_requesters_and_approvers(world):
    _seed_requests(world, 4)
    items = world.get("a_admin", "/hr/assets/requests").json()["items"]
    assert len(items) == 4
    full = {e.id: f"{e.first_name} {e.last_name}" for e in world.u.values()}
    for item in items:
        assert item["employee_name"] == full[item["employee_id"]]
        assert item["approved_by_name"] == full[item["approved_by"]]
    # a request whose requester is gone keeps what was stored, and a missing approver is simply unnamed
    world.db.add(AssetRequest(employee_id=None, employee_name="Former Person", asset_type="Mouse", requested_on=date.today(),
                              organization_id=1, approved_by=None))
    world.db.commit()
    _drop_cached_responses()
    row = next(i for i in world.get("a_admin", "/hr/assets/requests").json()["items"] if i["asset_type"] == "Mouse")
    assert (row["employee_name"], row["approved_by_name"]) == ("Former Person", None)
