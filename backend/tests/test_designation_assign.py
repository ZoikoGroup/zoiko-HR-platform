"""Designations → Assign to employees: an active designation goes to existing people of the organization (any role),
optionally with their job title; people outside the organization or who have left are refused. Employee edits and
promotions can only point at a designation of the employee's own organization."""
from datetime import date

from test_designation_settings import client  # noqa: F401,I001  (fixture; imported first so the app loads in order)
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import Designation


def _desig(db, title="Engineer", org=1, **kw):
    d = Designation(title=title, organization_id=org, status=kw.pop("status", "active"), employees_count=0, **kw)
    db.add(d)
    db.commit()
    return d


def _assign(client, did, ids, **kw):
    return client.post(f"/hr/designations/{did}/assign", json={"employee_ids": ids, **kw})


def test_people_of_any_role_get_the_designation_and_job_title(client):
    d = _desig(client.db)
    admin, emp = client.people["admin"], client.people["emp"]
    r = _assign(client, d.id, [emp.id, admin.id, emp.id])
    assert r.status_code == 200, r.text
    assert r.json()["assigned"] == 2
    client.db.refresh(emp)
    assert (emp.designation_id, emp.job_title) == (d.id, "Engineer")
    counts = {x["id"]: x["employees_count"] for x in client.get("/hr/designations").json()}
    assert counts[d.id] == 2
    again = _assign(client, d.id, [emp.id])
    assert (again.json()["assigned"], again.json()["unchanged"]) == (0, 1)


def test_the_detail_panel_lists_holders_current_people_first(client):
    d = _desig(client.db)
    admin, emp = client.people["admin"], client.people["emp"]
    _assign(client, d.id, [emp.id, admin.id])
    admin.status = EmployeeStatus.RESIGNED
    client.db.commit()
    rows = client.get(f"/hr/designations/{d.id}/employees").json()
    assert [(r["name"], r["status"]) for r in rows] == [("Emp U", "active"), ("Admin U", "resigned")]
    theirs = _desig(client.db, "Theirs", org=2)
    assert client.get(f"/hr/designations/{theirs.id}/employees").status_code == 404


def test_job_title_can_be_left_alone(client):
    d = _desig(client.db, "Lead")
    emp = client.people["emp"]
    assert _assign(client, d.id, [emp.id], sync_job_title=False).status_code == 200
    client.db.refresh(emp)
    assert (emp.designation_id, emp.job_title) == (d.id, "t")


def test_outsiders_leavers_and_inactive_designations_are_refused(client):
    d = _desig(client.db)
    r = _assign(client, d.id, [client.people["other"].id])
    assert r.status_code == 400 and "not in your organization" in r.json()["message"]
    gone = Employee(email="gone@example.com", hashed_password="x", employee_code="C-gone", role=UserRole.EMPLOYEE, first_name="Gone",
                    last_name="U", job_title="t", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.TERMINATED,
                    date_of_joining=date.today(), organization_id=1)
    client.db.add(gone)
    client.db.commit()
    r = _assign(client, d.id, [gone.id])
    assert r.status_code == 400 and "have left" in r.json()["message"]
    off = _desig(client.db, "Old", status="inactive")
    assert _assign(client, off.id, [client.people["emp"].id]).status_code == 400
    theirs = _desig(client.db, "Theirs", org=2)
    assert _assign(client, theirs.id, [client.people["emp"].id]).status_code == 404


def test_only_admins_assign(client):
    d = _desig(client.db)
    client.box["user"] = client.people["emp"]
    assert _assign(client, d.id, [client.people["emp"].id]).status_code == 403


def test_employee_edit_and_promotion_cannot_use_another_organizations_designation(client):
    from app.modules.employee import service as employee_service
    from app.modules.employee.schema import EmployeeUpdate, PromoteEmployeeRequest
    from app.core.exceptions import NotFoundException
    import pytest
    theirs = _desig(client.db, "Theirs", org=2)
    emp = client.people["emp"]
    with pytest.raises(NotFoundException):
        employee_service.update_employee(client.db, emp.id, EmployeeUpdate(designation_id=theirs.id), organization_id=1)
    with pytest.raises(NotFoundException):
        employee_service.promote_employee(client.db, PromoteEmployeeRequest(employee_id=emp.id, new_designation_id=theirs.id,
                                                                            effective_date=date.today(), reason="x"), 1)
    with pytest.raises(NotFoundException):   # another organization's person can't be promoted from here
        employee_service.promote_employee(client.db, PromoteEmployeeRequest(employee_id=client.people["other"].id, new_designation_id=theirs.id,
                                                                            effective_date=date.today(), reason="x"), 1)


def test_delete_explains_former_holders(client):
    d = _desig(client.db)
    emp = client.people["emp"]
    emp.designation_id, emp.status = d.id, EmployeeStatus.RESIGNED
    client.db.commit()
    r = client.delete(f"/hr/designations/{d.id}")
    assert r.status_code == 400 and "1 former or inactive employee(s)" in r.json()["message"]
