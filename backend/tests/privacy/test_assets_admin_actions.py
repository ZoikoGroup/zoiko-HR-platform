"""Assets audit batch 3, A12: the endpoints behind the Org Admin page's edit / delete / return / transfer / category actions.

Real sign-in tokens and two organizations (the privacy `world`).
"""
import pytest

from app.modules.hr.models import Asset, AssetCategory, AssetCondition, AssetStatus


def _row(w, tag, org=1, status=AssetStatus.AVAILABLE, employee=None):
    a = Asset(name=f"Asset {tag}", asset_tag=tag, organization_id=org, status=status,
              employee_id=employee.id if employee else None)
    w.db.add(a)
    w.db.commit()
    return a


# ── edit ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

def test_admin_edits_an_assets_details(world):
    a = _row(world, "ED-1")
    r = world.put("a_admin", f"/hr/assets/{a.id}", json={"name": "MacBook", "serial_number": "SN9", "condition": "fair",
                                                          "status": "maintenance", "notes": "screen"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["name"], body["serial_number"], body["condition"], body["status"]) == ("MacBook", "SN9", "fair", "maintenance")


@pytest.mark.parametrize("who", ["a_emp1", "a_manager"])
def test_only_admins_edit_delete_return_or_transfer(world, who):
    a = _row(world, "NO-1", status=AssetStatus.ASSIGNED, employee=world.u[who])
    assert world.put(who, f"/hr/assets/{a.id}", json={"name": "x"}).status_code == 403
    assert world.delete(who, f"/hr/assets/{a.id}").status_code == 403
    assert world.put(who, f"/hr/assets/{a.id}/return", json={"reason": "x"}).status_code == 403
    assert world.put(who, f"/hr/assets/{a.id}/transfer", json={"employee_id": world.u["a_emp2"].id}).status_code == 403


# ── delete ───────────────────────────────────────────────────────────────────────────────────────────────────────────

def test_an_assigned_asset_cannot_be_deleted_until_it_is_returned(world):
    a = _row(world, "DEL-1", status=AssetStatus.ASSIGNED, employee=world.u["a_emp1"])
    r = world.delete("a_admin", f"/hr/assets/{a.id}")
    assert r.status_code == 409 and "Return it before deleting" in r.json()["message"]
    world.db.expire_all()
    assert world.db.get(Asset, a.id).deleted_at is None
    assert world.put("a_admin", f"/hr/assets/{a.id}/return", json={"reason": "leaving"}).status_code == 200
    assert world.delete("a_admin", f"/hr/assets/{a.id}").status_code == 200
    assert world.get("a_admin", f"/hr/assets/{a.id}").status_code == 404


def test_another_organizations_admin_cannot_delete(world):
    a = _row(world, "DEL-2")
    assert world.delete("b_admin", f"/hr/assets/{a.id}").status_code == 404
    world.db.expire_all()
    assert world.db.get(Asset, a.id).deleted_at is None


# ── return / transfer ────────────────────────────────────────────────────────────────────────────────────────────────

def test_return_makes_the_asset_available_and_records_its_condition(world):
    a = _row(world, "RET-1", status=AssetStatus.ASSIGNED, employee=world.u["a_emp1"])
    r = world.put("a_admin", f"/hr/assets/{a.id}/return", json={"reason": "upgrade", "condition": "poor"})
    assert r.status_code == 200, r.text
    assert (r.json()["status"], r.json()["employee_id"], r.json()["condition"]) == ("available", None, "poor")
    world.db.expire_all()
    assert world.db.get(Asset, a.id).condition == AssetCondition.POOR


def test_return_rejects_an_unknown_condition_and_an_unassigned_asset(world):
    a = _row(world, "RET-2", status=AssetStatus.ASSIGNED, employee=world.u["a_emp1"])
    assert world.put("a_admin", f"/hr/assets/{a.id}/return", json={"reason": "x", "condition": "shiny"}).status_code == 422
    spare = _row(world, "RET-3")
    r = world.put("a_admin", f"/hr/assets/{spare.id}/return", json={"reason": "x"})
    assert r.status_code == 400 and "not currently assigned" in r.json()["message"]


def test_an_asset_goes_back_to_the_organization_before_anyone_else_gets_it(world):
    """QA bug 20: no direct hand-over from one employee to another; Return, then Assign."""
    a = _row(world, "TR-1", status=AssetStatus.ASSIGNED, employee=world.u["a_emp1"])
    r = world.put("a_hr", f"/hr/assets/{a.id}/transfer", json={"employee_id": world.u["a_emp2"].id})
    assert r.status_code == 409 and "return it to the organization first" in r.json()["message"]
    world.db.expire_all()
    assert world.db.get(Asset, a.id).employee_id == world.u["a_emp1"].id, "still with its holder"
    assert world.put("a_hr", f"/hr/assets/{a.id}/assign", json={"employee_id": world.u["a_emp2"].id}).status_code == 409

    back = world.put("a_hr", f"/hr/assets/{a.id}/return", json={"reason": "moving to the new hire", "condition": "good"})
    assert back.status_code == 200 and (back.json()["status"], back.json()["employee_id"]) == ("available", None)
    given = world.put("a_hr", f"/hr/assets/{a.id}/assign", json={"employee_id": world.u["a_emp2"].id})
    assert given.status_code == 200 and given.json()["employee_id"] == world.u["a_emp2"].id
    # another organization's asset stays a plain 404
    other = _row(world, "TR-B", org=2)
    assert world.put("a_hr", f"/hr/assets/{other.id}/transfer", json={"employee_id": world.u["a_emp2"].id}).status_code == 404


def test_the_return_is_kept_in_the_activity_log_with_its_reason(world):
    from app.modules.super_admin.models import AuditLog as SuperAdminAuditLog
    a = _row(world, "TR-2", status=AssetStatus.ASSIGNED, employee=world.u["a_emp1"])
    assert world.put("a_admin", f"/hr/assets/{a.id}/return", json={"reason": "leaving the team", "condition": "fair"}).status_code == 200
    world.db.expire_all()
    row = (world.db.query(SuperAdminAuditLog).filter(SuperAdminAuditLog.action_type == "asset.returned")
           .order_by(SuperAdminAuditLog.id.desc()).first())
    assert row is not None and row.entity_id == a.id
    text = str(row.details)
    assert "leaving the team" in text and "fair" in text


# ── categories ───────────────────────────────────────────────────────────────────────────────────────────────────────

def test_admin_creates_renames_and_deletes_categories_with_a_clear_duplicate_message(world):
    c = world.post("a_admin", "/hr/assets/categories", json={"name": "Phones"})
    assert c.status_code == 201
    world.post("a_admin", "/hr/assets/categories", json={"name": "Laptops"})
    dup = world.put("a_admin", f"/hr/assets/categories/{c.json()['id']}", json={"name": "laptops"})
    assert dup.status_code == 409 and "already exists in this organization" in dup.json()["message"]
    ok = world.put("a_admin", f"/hr/assets/categories/{c.json()['id']}", json={"name": "Mobiles"})
    assert ok.status_code == 200 and ok.json()["name"] == "Mobiles"
    assert world.delete("b_admin", f"/hr/assets/categories/{c.json()['id']}").status_code == 404
    assert world.delete("a_admin", f"/hr/assets/categories/{c.json()['id']}").status_code == 200
    assert sorted(x["name"] for x in world.get("a_admin", "/hr/assets/categories").json()) == ["Laptops"]


@pytest.mark.parametrize("who", ["a_emp1", "a_manager"])
def test_only_admins_change_categories(world, who):
    assert world.post(who, "/hr/assets/categories", json={"name": "X"}).status_code == 403
    world.db.add(AssetCategory(name="Y", organization_id=1))
    world.db.commit()
    cid = world.db.query(AssetCategory).filter_by(name="Y").one().id
    assert world.put(who, f"/hr/assets/categories/{cid}", json={"name": "Z"}).status_code == 403
    assert world.delete(who, f"/hr/assets/categories/{cid}").status_code == 403
