"""Assets: fix batch 2 of the Assets / Learning / Travel audit.

Real sign-in tokens and two organizations (the privacy `world`), so the role checks and the tenant filter run as in production.
  - A3/A4 the asset and request lists page, filter and search on the server; counts come from `total`
  - A5    the admin's employee picker searches the server, is ordered by name and offers only active staff
  - A6    an asset is never handed to someone who has left: a clear 409 (another organization's person stays a 404)
  - A7    only an available asset can be assigned; an assigned one moves with /transfer
  - A8    "assigned" needs an employee; create-with-employee assigns in the same call
  - A9    fulfilling a request hands the requester an available asset of the same organization, in one transaction
"""
from datetime import date

import pytest

from app.modules.employee.models import EmployeeStatus
from app.modules.hr.models import Asset, AssetRequest, AssetRequestStatus, AssetStatus


def _asset(w, who="a_admin", **over):
    body = {"name": "Laptop", "asset_tag": over.pop("asset_tag", "LT-001"), "category": "Laptops", "status": "available"}
    body.update(over)
    return w.post(who, "/hr/assets", json=body)


def _row(w, tag, org=1, status=AssetStatus.AVAILABLE, employee=None):
    a = Asset(name=f"Asset {tag}", asset_tag=tag, organization_id=org, status=status,
              employee_id=employee.id if employee else None)
    w.db.add(a)
    w.db.commit()
    return a


def _request(w, who, asset_type="Monitor", reason="Work"):
    r = w.post(who, "/hr/assets/requests", json={"asset_type": asset_type, "quantity": 1, "priority": "medium",
                                                 "reason": reason, "requested_on": date.today().isoformat()})
    assert r.status_code == 201, r.text
    return r.json()


def _approved(w, who="a_emp1", **kw):
    req = _request(w, who, **kw)
    assert w.put("a_admin", f"/hr/assets/requests/{req['id']}/approve").status_code == 200
    return req


def _leave(w, key):
    w.u[key].status = EmployeeStatus.TERMINATED
    w.db.commit()


# ── A3: server-side paging, filters and search for assets ────────────────────────────────────────────────────────────

def test_the_asset_list_pages_on_the_server_and_total_counts_every_row(world):
    for n in range(25):
        _row(world, f"P-{n:02d}")
    _row(world, "B-ONLY", org=2)
    first = world.get("a_admin", "/hr/assets?page=1&per_page=10").json()
    third = world.get("a_admin", "/hr/assets?page=3&per_page=10").json()
    assert first["total"] == 25 and len(first["items"]) == 10
    assert third["total"] == 25 and len(third["items"]) == 5
    seen = {a["id"] for p in (1, 2, 3) for a in world.get("a_admin", f"/hr/assets?page={p}&per_page=10").json()["items"]}
    assert len(seen) == 25, "pages do not overlap or skip rows"


def test_the_asset_list_filters_by_status_holder_and_search_on_the_server(world):
    _row(world, "S-1", status=AssetStatus.ASSIGNED, employee=world.u["a_emp1"])
    _row(world, "S-2", status=AssetStatus.ASSIGNED, employee=world.u["a_emp2"])
    _row(world, "S-3")
    _row(world, "S-4", status=AssetStatus.MAINTENANCE)
    assigned = world.get("a_admin", "/hr/assets?status=assigned").json()
    assert assigned["total"] == 2
    mine = world.get("a_admin", f"/hr/assets?employee_id={world.u['a_emp1'].id}").json()
    assert [a["asset_tag"] for a in mine["items"]] == ["S-1"]
    found = world.get("a_admin", "/hr/assets?search=S-3").json()
    assert [a["asset_tag"] for a in found["items"]] == ["S-3"]
    dash = world.get("a_admin", "/hr/assets/dashboard").json()
    assert (dash["total_assets"], dash["assigned_count"], dash["available_count"]) == (4, 2, 1)


# ── A4: server-side paging, filter and search for requests ───────────────────────────────────────────────────────────

def test_requests_page_and_filter_on_the_server(world):
    for n in range(23):
        _request(world, "a_emp1", asset_type=f"Item {n}")
    done = _request(world, "a_emp2", asset_type="Headset")
    world.put("a_admin", f"/hr/assets/requests/{done['id']}/reject")
    page2 = world.get("a_admin", "/hr/assets/requests?page=2&per_page=10").json()
    assert page2["total"] == 24 and len(page2["items"]) == 10
    pending = world.get("a_admin", "/hr/assets/requests?status=pending&per_page=1").json()
    assert pending["total"] == 23, "the pending banner counts every pending request, not one page"
    rejected = world.get("a_admin", "/hr/assets/requests?status=rejected").json()
    assert [r["id"] for r in rejected["items"]] == [done["id"]]


def test_request_search_matches_type_reason_and_requester_name(world):
    _request(world, "a_emp1", asset_type="Keyboard", reason="old one broke")
    _request(world, "a_emp2", asset_type="Monitor", reason="second screen")
    assert [r["asset_type"] for r in world.get("a_admin", "/hr/assets/requests?search=keyb").json()["items"]] == ["Keyboard"]
    assert [r["asset_type"] for r in world.get("a_admin", "/hr/assets/requests?search=second").json()["items"]] == ["Monitor"]
    name = world.u["a_emp2"].first_name
    assert [r["asset_type"] for r in world.get("a_admin", f"/hr/assets/requests?search={name}").json()["items"]] == ["Monitor"]


def test_an_employee_still_sees_only_their_own_requests_when_searching(world):
    _request(world, "a_emp1", asset_type="Keyboard")
    _request(world, "a_emp2", asset_type="Keyboard")
    items = world.get("a_emp2", "/hr/assets/requests?search=Keyboard").json()["items"]
    assert [r["employee_id"] for r in items] == [world.u["a_emp2"].id]


# ── A5: employee picker ──────────────────────────────────────────────────────────────────────────────────────────────

def test_the_picker_searches_the_server_orders_by_name_and_offers_only_active_staff(world):
    _leave(world, "a_emp2")
    opts = world.get("a_admin", "/hr/assets/employee-options").json()
    ids = [o["id"] for o in opts]
    assert world.u["a_emp2"].id not in ids and world.u["b_emp1"].id not in ids
    names = [(o["first_name"] or "").lower() for o in opts]
    assert names == sorted(names)
    hit = world.get("a_admin", "/hr/assets/employee-options?search=HrAlpha").json()
    assert [o["id"] for o in hit] == [world.u["a_hr"].id]
    everyone = world.get("a_admin", "/hr/assets/employee-options?include_inactive=true").json()
    assert world.u["a_emp2"].id in [o["id"] for o in everyone]
    assert world.get("a_admin", "/hr/assets/employee-options?limit=1").json().__len__() == 1


@pytest.mark.parametrize("who", ["a_emp1", "a_manager"])
def test_the_picker_is_admin_only(world, who):
    assert world.get(who, "/hr/assets/employee-options").status_code == 403


# ── A6: leavers ──────────────────────────────────────────────────────────────────────────────────────────────────────

def test_assign_transfer_and_create_refuse_a_leaver_with_a_clear_409(world):
    _leave(world, "a_emp2")
    leaver = world.u["a_emp2"].id
    spare = _row(world, "L-1")
    r = world.put("a_admin", f"/hr/assets/{spare.id}/assign", json={"employee_id": leaver})
    assert r.status_code == 409 and "no longer an active employee" in r.json()["message"]
    held = _row(world, "L-2", status=AssetStatus.ASSIGNED, employee=world.u["a_emp1"])
    r = world.put("a_admin", f"/hr/assets/{held.id}/transfer", json={"employee_id": leaver})
    assert r.status_code == 409
    r = _asset(world, asset_tag="L-3", employee_id=leaver)
    assert r.status_code == 409
    assert world.db.query(Asset).filter_by(asset_tag="L-3").count() == 0
    # another organization's person stays a plain 404
    assert world.put("a_admin", f"/hr/assets/{spare.id}/assign", json={"employee_id": world.u["b_emp1"].id}).status_code == 404


# ── A7: only an available asset is assigned ──────────────────────────────────────────────────────────────────────────

def test_an_assigned_asset_is_not_silently_reassigned(world):
    held = _row(world, "R-1", status=AssetStatus.ASSIGNED, employee=world.u["a_emp1"])
    r = world.put("a_admin", f"/hr/assets/{held.id}/assign", json={"employee_id": world.u["a_emp2"].id})
    assert r.status_code == 409 and "Transfer" in r.json()["message"]
    world.db.expire_all()
    assert world.db.get(Asset, held.id).employee_id == world.u["a_emp1"].id
    moved = world.put("a_admin", f"/hr/assets/{held.id}/transfer", json={"employee_id": world.u["a_emp2"].id})
    assert moved.status_code == 200 and moved.json()["employee_id"] == world.u["a_emp2"].id


@pytest.mark.parametrize("status", [AssetStatus.MAINTENANCE, AssetStatus.RETIRED, AssetStatus.LOST, AssetStatus.BROKEN])
def test_an_asset_that_is_not_available_cannot_be_assigned(world, status):
    a = _row(world, f"M-{status.value}", status=status)
    r = world.put("a_admin", f"/hr/assets/{a.id}/assign", json={"employee_id": world.u["a_emp1"].id})
    assert r.status_code == 409 and status.value in r.json()["message"]
    world.db.expire_all()
    assert world.db.get(Asset, a.id).employee_id is None


def test_transfer_needs_an_assigned_asset(world):
    spare = _row(world, "T-1")
    r = world.put("a_admin", f"/hr/assets/{spare.id}/transfer", json={"employee_id": world.u["a_emp1"].id})
    assert r.status_code == 409 and "Assign" in r.json()["message"]


def test_an_edit_cannot_change_the_holder_or_mark_assigned(world):
    spare = _row(world, "E-1")
    r = world.put("a_admin", f"/hr/assets/{spare.id}", json={"employee_id": world.u["a_emp1"].id})
    assert r.status_code == 400
    r = world.put("a_admin", f"/hr/assets/{spare.id}", json={"status": "assigned"})
    assert r.status_code == 400
    held = _row(world, "E-2", status=AssetStatus.ASSIGNED, employee=world.u["a_emp1"])
    # an edit form that sends employee_id null keeps the holder
    ok = world.put("a_admin", f"/hr/assets/{held.id}", json={"name": "Renamed", "employee_id": None, "status": "assigned"})
    assert ok.status_code == 200 and ok.json()["employee_id"] == world.u["a_emp1"].id
    back = world.put("a_admin", f"/hr/assets/{held.id}", json={"status": "available"})
    assert back.status_code == 200 and back.json()["employee_id"] is None


# ── A8: create ───────────────────────────────────────────────────────────────────────────────────────────────────────

def test_creating_as_assigned_without_an_employee_is_refused(world):
    r = _asset(world, asset_tag="C-1", status="assigned")
    assert r.status_code == 400
    assert world.db.query(Asset).count() == 0


def test_create_with_an_employee_assigns_in_one_call(world):
    r = _asset(world, asset_tag="C-2", employee_id=world.u["a_emp1"].id)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "assigned" and body["employee_id"] == world.u["a_emp1"].id and body["assigned_date"]


def test_a_failed_create_leaves_the_tag_free_for_the_retry(world):
    _leave(world, "a_emp2")
    assert _asset(world, asset_tag="C-3", employee_id=world.u["a_emp2"].id).status_code == 409
    assert _asset(world, asset_tag="C-3", employee_id=world.u["a_emp1"].id).status_code == 201


def test_create_with_an_employee_and_a_non_assignable_status_is_refused(world):
    r = _asset(world, asset_tag="C-4", employee_id=world.u["a_emp1"].id, status="maintenance")
    assert r.status_code == 400


# ── A9: fulfil ───────────────────────────────────────────────────────────────────────────────────────────────────────

def test_fulfilling_assigns_the_chosen_asset_to_the_requester(world):
    req = _approved(world)
    spare = _row(world, "F-1")
    r = world.put("a_admin", f"/hr/assets/requests/{req['id']}/fulfill", json={"asset_id": spare.id})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "fulfilled" and "F-1" in r.json()["notes"]
    world.db.expire_all()
    a = world.db.get(Asset, spare.id)
    assert a.status == AssetStatus.ASSIGNED and a.employee_id == world.u["a_emp1"].id
    mine = world.get("a_emp1", "/hr/assets").json()["items"]
    assert [x["asset_tag"] for x in mine] == ["F-1"]


def test_fulfilling_needs_an_asset(world):
    req = _approved(world)
    r = world.put("a_admin", f"/hr/assets/requests/{req['id']}/fulfill")
    assert r.status_code == 400
    assert world.db.get(AssetRequest, req["id"]).status == AssetRequestStatus.APPROVED


@pytest.mark.parametrize("case", ["assigned", "maintenance", "other_org", "missing"])
def test_fulfilling_refuses_an_asset_that_cannot_be_given(world, case):
    req = _approved(world)
    if case == "assigned":
        asset_id, code = _row(world, "X-1", status=AssetStatus.ASSIGNED, employee=world.u["a_emp2"]).id, 409
    elif case == "maintenance":
        asset_id, code = _row(world, "X-2", status=AssetStatus.MAINTENANCE).id, 409
    elif case == "other_org":
        asset_id, code = _row(world, "X-3", org=2).id, 404
    else:
        asset_id, code = 999999, 404
    r = world.put("a_admin", f"/hr/assets/requests/{req['id']}/fulfill", json={"asset_id": asset_id})
    assert r.status_code == code, r.text
    world.db.expire_all()
    assert world.db.get(AssetRequest, req["id"]).status == AssetRequestStatus.APPROVED


def test_fulfilling_for_a_requester_who_has_left_is_refused_and_nothing_changes(world):
    req = _approved(world, who="a_emp2")
    _leave(world, "a_emp2")
    spare = _row(world, "Y-1")
    r = world.put("a_admin", f"/hr/assets/requests/{req['id']}/fulfill", json={"asset_id": spare.id})
    assert r.status_code == 409
    world.db.expire_all()
    assert world.db.get(Asset, spare.id).status == AssetStatus.AVAILABLE
    assert world.db.get(AssetRequest, req["id"]).status == AssetRequestStatus.APPROVED


def test_only_an_approved_request_is_fulfilled_and_only_by_an_admin(world):
    pending = _request(world, "a_emp1")
    spare = _row(world, "Z-1")
    assert world.put("a_admin", f"/hr/assets/requests/{pending['id']}/fulfill", json={"asset_id": spare.id}).status_code == 400
    req = _approved(world)
    assert world.put("a_emp1", f"/hr/assets/requests/{req['id']}/fulfill", json={"asset_id": spare.id}).status_code == 403
    assert world.put("b_admin", f"/hr/assets/requests/{req['id']}/fulfill", json={"asset_id": spare.id}).status_code == 404
    assert world.put("a_hr", f"/hr/assets/requests/{req['id']}/fulfill", json={"asset_id": spare.id}).status_code == 200
