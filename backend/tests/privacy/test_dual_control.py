"""D09: high-impact tenant actions need a second organization admin when the deployment turns dual control on."""
import pytest

from app.config import settings
from app.modules.employee.models import Employee, UserRole
from tests.privacy.conftest import _emp


@pytest.fixture
def dual(world, monkeypatch):
    monkeypatch.setattr(settings, "DUAL_CONTROL_HIGH_IMPACT", True)
    monkeypatch.setattr(settings, "DUAL_CONTROL_BULK_THRESHOLD", 2)
    world.u["a_admin2"] = _emp(world.db, "admin2@tenant-a.example.com", UserRole.ADMIN, 1, "AdminTwo", "ZZADMINA2")
    return world


def test_D09_off_by_default_nothing_changes(world):
    assert settings.DUAL_CONTROL_HIGH_IMPACT is False
    ids = [world.u["a_emp1"].id, world.u["a_emp2"].id]
    r = world.post("a_admin", "/hr/employee-management/employees/bulk-delete", json={"ids": ids})
    assert r.status_code == 200, r.text


def test_D09_a_bulk_delete_is_held_until_a_different_admin_approves_and_then_runs_once(dual):
    w = dual
    ids = [w.u["a_emp1"].id, w.u["a_emp2"].id]
    held = w.post("a_admin", "/hr/employee-management/employees/bulk-delete", json={"ids": ids})
    assert held.status_code == 202 and held.json()["approval_required"] is True
    aid = held.json()["approval_id"]
    assert w.db.query(Employee).filter(Employee.id.in_(ids), Employee.is_active.is_(True)).count() == 2, "nothing was deleted"
    assert w.post("a_admin", f"/hr/approvals/{aid}/approve").status_code == 403, "nobody approves their own request"
    unapproved = w.post("a_admin", "/hr/employee-management/employees/bulk-delete", json={"ids": ids, "approval_id": aid})
    assert unapproved.status_code == 400, "pending is not approved"
    assert w.post("b_admin", f"/hr/approvals/{aid}/approve").status_code in (403, 404), "another organization's admin cannot decide"
    pend = w.get("a_admin2", "/hr/approvals").json()["requests"]
    assert pend[0]["payload"] == {"count": 2} and pend[0]["can_decide"] is True, "the approver sees how many, not who"
    assert w.post("a_admin2", f"/hr/approvals/{aid}/approve").status_code == 200
    wrong = w.post("a_admin", "/hr/employee-management/employees/bulk-delete", json={"ids": ids[:1] + [w.u["a_hr"].id], "approval_id": aid})
    assert wrong.status_code == 403, "an approval is for exactly what was asked"
    other = w.post("a_admin2", "/hr/employee-management/employees/bulk-delete", json={"ids": ids, "approval_id": aid})
    assert other.status_code == 403, "and for the person who asked"
    done = w.post("a_admin", "/hr/employee-management/employees/bulk-delete", json={"ids": ids, "approval_id": aid})
    assert done.status_code == 200, done.text
    again = w.post("a_admin", "/hr/employee-management/employees/bulk-delete", json={"ids": ids, "approval_id": aid})
    assert again.status_code == 400, "an approval runs once"


def test_D09_small_deletes_and_rejected_requests(dual):
    w = dual
    one = w.post("a_admin", "/hr/employee-management/employees/bulk-delete", json={"ids": [w.u["a_emp2"].id]})
    assert one.status_code == 200, "below the threshold: no second approval"
    held = w.post("a_admin", "/hr/employee-management/employees/delete-all")
    assert held.status_code == 202
    aid = held.json()["approval_id"]
    assert w.post("a_admin2", f"/hr/approvals/{aid}/reject").status_code == 200
    r = w.post("a_admin", f"/hr/employee-management/employees/delete-all?approval_id={aid}")
    assert r.status_code == 400
    assert w.db.query(Employee).filter(Employee.organization_id == 1, Employee.id == w.u["a_hr"].id).count() == 1


def test_D09_a_platform_identity_cannot_approve_for_a_tenant(dual):
    w = dual
    aid = w.post("a_admin", "/hr/employee-management/employees/delete-all").json()["approval_id"]
    r = w.post("platform", f"/hr/approvals/{aid}/approve")
    assert r.status_code == 404 and r.json() == {"detail": "Not Found"}
