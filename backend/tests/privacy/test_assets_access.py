"""Assets: who can see, assign and cancel what (fix batch 1 of the Assets / Learning / Travel audit).

Real sign-in tokens and two organizations (the privacy `world`): the role checks and the tenant filter run as in production.
  - A1  an asset is assigned / transferred / created only for someone working in the asset's own organization
  - A2  asset tags and category names are unique per organization: 409 inside one, allowed across two
  - A10 only the request's owner (or an admin) can cancel it
  - A11 employees and managers see only their own assets and requests
"""
from datetime import date

import pytest

from app.modules.employee.models import EmployeeStatus
from app.modules.hr.models import Asset, AssetRequest, AssetStatus


def _asset(w, who="a_admin", **over):
    body = {"name": "Laptop", "asset_tag": over.pop("asset_tag", "LT-001"), "category": "Laptops", "status": "available"}
    body.update(over)
    return w.post(who, "/hr/assets", json=body)


def _row_asset(w, org, tag, employee=None):
    a = Asset(name="Phone", asset_tag=tag, organization_id=org, status=AssetStatus.ASSIGNED if employee else AssetStatus.AVAILABLE,
              employee_id=employee.id if employee else None)
    w.db.add(a)
    w.db.commit()
    return a


def _request(w, who, asset_type="Monitor"):
    r = w.post(who, "/hr/assets/requests", json={"asset_type": asset_type, "quantity": 1, "priority": "medium", "reason": "Work",
                                                         "requested_on": date.today().isoformat()})
    assert r.status_code == 201, r.text
    return r.json()


# ── A1: the employee named in a request must work in the asset's organization ─────────────────────────────────────────

@pytest.mark.parametrize("route", ["assign", "transfer"])
def test_assign_and_transfer_refuse_another_organizations_employee_and_a_made_up_id(world, route):
    asset = _asset(world).json()
    for who in (world.u["b_emp1"].id, 999999):
        r = world.put("a_admin", f"/hr/assets/{asset['id']}/{route}", json={"employee_id": who})
        assert r.status_code == 404, (who, r.text)
    world.db.expire_all()
    assert world.db.get(Asset, asset["id"]).employee_id is None


def test_creating_an_asset_already_assigned_to_someone_elsewhere_is_refused(world):
    r = _asset(world, employee_id=world.u["b_emp1"].id, status="assigned")
    assert r.status_code == 404
    assert world.db.query(Asset).count() == 0


def test_updating_an_asset_to_another_organizations_employee_is_refused(world):
    asset = _asset(world).json()
    r = world.put("a_admin", f"/hr/assets/{asset['id']}", json={"employee_id": world.u["b_emp1"].id})
    assert r.status_code == 404


def test_an_asset_cannot_be_assigned_to_someone_who_has_left(world):
    leaver = world.u["a_emp2"]
    leaver.status = EmployeeStatus.TERMINATED
    world.db.commit()
    asset = _asset(world).json()
    assert world.put("a_admin", f"/hr/assets/{asset['id']}/assign", json={"employee_id": leaver.id}).status_code == 409   # batch 2 (A6): a clear 409
    ok = world.put("a_admin", f"/hr/assets/{asset['id']}/assign", json={"employee_id": world.u["a_emp1"].id})
    assert ok.status_code == 200 and ok.json()["employee_id"] == world.u["a_emp1"].id


def test_hr_admin_assigns_within_the_organization_too(world):
    asset = _asset(world, who="a_hr").json()
    assert world.put("a_hr", f"/hr/assets/{asset['id']}/assign", json={"employee_id": world.u["a_emp2"].id}).status_code == 200


# ── A2: unique per organization ──────────────────────────────────────────────────────────────────────────────────────

def test_the_same_tag_twice_in_one_organization_is_a_409_but_another_organization_may_use_it(world):
    assert _asset(world, asset_tag="LAPTOP-001").status_code == 201
    dup = _asset(world, asset_tag="LAPTOP-001")
    assert dup.status_code == 409 and "already exists in this organization" in dup.json()["message"]
    other = _asset(world, who="b_admin", asset_tag="LAPTOP-001")
    assert other.status_code == 201, other.text


def test_renaming_a_tag_onto_an_existing_one_is_a_409(world):
    _asset(world, asset_tag="T-1")
    second = _asset(world, asset_tag="T-2").json()
    r = world.put("a_admin", f"/hr/assets/{second['id']}", json={"asset_tag": "T-1"})
    assert r.status_code == 409


def test_a_deleted_assets_tag_can_be_used_again(world):
    first = _asset(world, asset_tag="REUSE-1").json()
    assert world.delete("a_admin", f"/hr/assets/{first['id']}").status_code == 200
    assert _asset(world, asset_tag="REUSE-1").status_code == 201


def test_category_names_are_unique_per_organization_ignoring_case(world):
    assert world.post("a_admin", "/hr/assets/categories", json={"name": "Laptops"}).status_code == 201
    dup = world.post("a_admin", "/hr/assets/categories", json={"name": "LAPTOPS"})
    assert dup.status_code == 409 and "already exists in this organization" in dup.json()["message"]
    assert world.post("b_admin", "/hr/assets/categories", json={"name": "Laptops"}).status_code == 201


def test_the_database_itself_refuses_a_duplicate_tag_in_one_organization(world):
    """The race the friendly check cannot see: the unique index answers, and the app turns it into the same 409."""
    from sqlalchemy.exc import IntegrityError
    _row_asset(world, 1, "RACE-1")
    world.db.add(Asset(name="Dup", asset_tag="RACE-1", organization_id=1, status=AssetStatus.AVAILABLE))
    with pytest.raises(IntegrityError):
        world.db.commit()
    world.db.rollback()
    world.db.add(Asset(name="Other org", asset_tag="RACE-1", organization_id=2, status=AssetStatus.AVAILABLE))
    world.db.commit()


# ── A11: employees and managers see only their own assets and requests ───────────────────────────────────────────────

@pytest.mark.parametrize("who", ["a_emp1", "a_manager"])
def test_employees_and_managers_list_only_their_own_assets(world, who):
    me = world.u[who]
    mine = _row_asset(world, 1, "MINE-1", me)
    theirs = _row_asset(world, 1, "THEIRS-1", world.u["a_emp2"])
    _row_asset(world, 1, "SPARE-1")
    ids = [a["id"] for a in world.get(who, "/hr/assets").json()["items"]]
    assert ids == [mine.id]
    assert world.get(who, f"/hr/assets?employee_id={world.u['a_emp2'].id}").json()["items"] == []
    assert world.get(who, f"/hr/assets/{theirs.id}").status_code == 404
    assert world.get(who, f"/hr/assets/{mine.id}").status_code == 200
    assert world.get(who, f"/hr/assets/{theirs.id}/maintenance").status_code == 404
    csv_text = world.get(who, "/hr/assets/export/csv").text
    assert "MINE-1" in csv_text and "THEIRS-1" not in csv_text and "SPARE-1" not in csv_text


def test_a_manager_does_not_see_a_direct_reports_assets_either(world):
    report = world.u["a_emp1"]
    report.reporting_manager_id = world.u["a_manager"].id
    world.db.commit()
    _row_asset(world, 1, "REPORT-1", report)
    assert world.get("a_manager", "/hr/assets").json()["items"] == []


@pytest.mark.parametrize("who", ["a_emp2", "a_manager"])
def test_employees_and_managers_list_only_their_own_requests(world, who):
    theirs = _request(world, "a_emp1")
    mine = _request(world, who)
    ids = [r["id"] for r in world.get(who, "/hr/assets/requests").json()["items"]]
    assert ids == [mine["id"]]
    assert world.get(who, f"/hr/assets/requests?employee_id={world.u['a_emp1'].id}").json()["items"] == []
    assert theirs["id"] not in ids


@pytest.mark.parametrize("who", ["a_admin", "a_hr"])
def test_admins_still_see_every_asset_and_request_in_their_organization(world, who):
    _row_asset(world, 1, "A-1", world.u["a_emp1"])
    _row_asset(world, 1, "A-2")
    _row_asset(world, 2, "B-1", world.u["b_emp1"])
    _request(world, "a_emp1")
    _request(world, "b_emp1")
    tags = sorted(a["asset_tag"] for a in world.get(who, "/hr/assets").json()["items"])
    assert tags == ["A-1", "A-2"]
    assert len(world.get(who, "/hr/assets/requests").json()["items"]) == 1
    assert world.get(who, "/hr/assets/dashboard").status_code == 200


@pytest.mark.parametrize("who", ["a_emp1", "a_manager"])
def test_the_organization_wide_asset_dashboard_and_reports_are_admin_only(world, who):
    assert world.get(who, "/hr/assets/dashboard").status_code == 403
    assert world.get(who, "/hr/assets/reports").status_code == 403


# ── A10: cancelling a request ────────────────────────────────────────────────────────────────────────────────────────

def test_only_the_owner_or_an_admin_can_cancel_a_request(world):
    req = _request(world, "a_emp1")
    for who in ("a_emp2", "a_manager"):
        assert world.put(who, f"/hr/assets/requests/{req['id']}/cancel").status_code == 404, who
    assert world.db.get(AssetRequest, req["id"]).status.value == "pending"
    assert world.put("a_emp1", f"/hr/assets/requests/{req['id']}/cancel").status_code == 200
    other = _request(world, "a_emp2")
    assert world.put("a_admin", f"/hr/assets/requests/{other['id']}/cancel").status_code == 200


def test_another_organizations_admin_cannot_cancel_or_see_a_request(world):
    req = _request(world, "a_emp1")
    assert world.put("b_admin", f"/hr/assets/requests/{req['id']}/cancel").status_code == 404
    assert world.get("b_admin", "/hr/assets/requests").json()["items"] == []


# ── L14 (asset exports) ──────────────────────────────────────────────────────────────────────────────────────────────

def test_the_asset_exports_neutralise_formula_cells(world):
    import csv
    import io
    from openpyxl import load_workbook
    world.db.add(Asset(name="=HYPERLINK(\"http://x\")", asset_tag="@TAG", notes="+notes", organization_id=1, status=AssetStatus.AVAILABLE))
    world.db.commit()
    rows = list(csv.reader(io.StringIO(world.get("a_admin", "/hr/assets/export/csv").text)))
    assert rows[1][1:3] == ["'=HYPERLINK(\"http://x\")", "'@TAG"]
    wb = load_workbook(io.BytesIO(world.get("a_admin", "/hr/assets/export/excel").content))
    row = next(wb.active.iter_rows(min_row=2, values_only=True))
    assert row[1] == "'=HYPERLINK(\"http://x\")" and row[2] == "'@TAG" and row[12] == "'+notes"
