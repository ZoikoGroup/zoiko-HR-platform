"""T05 / E02 / E03 / E06: who sees which fields of an employee record, through the real endpoints."""
from tests.privacy.support import CANARY


def _row(resp, who_id):
    body = resp.json()
    items = body["items"] if "items" in body else [body]
    return next(i for i in items if i["id"] == who_id)


def test_T05_a_colleague_sees_the_directory_not_pay_phone_or_private_details(world):
    target = world.u["a_emp1"].id
    for viewer in ("a_emp2", "a_manager"):                                  # a manager who does NOT manage this person is a colleague too
        row = _row(world.get(viewer, f"/hr/employee-management/employees/{target}"), target)
        assert row["firstName"] == CANARY["name_a1"] and row["jobTitle"], viewer
        for hidden in ("basicSalary", "ctc", "phoneNumber", "dateOfBirth", "personalEmail", "currentAddress", "gender"):
            assert row[hidden] is None, (viewer, hidden)
        assert row["email"] == "••••" and row["employeeCode"] == "••••"
        assert {"basicSalary", "phoneNumber", "email"} <= set(row["redacted"]), row["redacted"]
        text = str(row)
        assert str(CANARY["salary_a1"]) not in text and CANARY["phone_a1"] not in text and CANARY["email_a1"] not in text
    listing = world.get("a_emp2", "/hr/employee-management/employees?per_page=100")
    assert str(CANARY["salary_a1"]) not in listing.text and CANARY["phone_a1"] not in listing.text


def test_T05_you_see_everything_about_yourself(world):
    me = world.u["a_emp1"].id
    row = _row(world.get("a_emp1", f"/hr/employee-management/employees/{me}"), me)
    assert float(row["basicSalary"]) == CANARY["salary_a1"] and row["phoneNumber"] == CANARY["phone_a1"] and row["email"] == CANARY["email_a1"]
    assert not row.get("redacted")
    mine = world.get("a_emp1", "/hr/employees/me").json()
    assert float(mine["basicSalary"]) == CANARY["salary_a1"]


def test_E02_a_manager_sees_a_direct_reports_people_fields_but_never_their_pay(world):
    from app.modules.employee.models import Employee
    world.db.get(Employee, world.u["a_emp1"].id).reporting_manager_id = world.u["a_manager"].id
    world.db.commit()
    target = world.u["a_emp1"].id
    row = _row(world.get("a_manager", f"/hr/employee-management/employees/{target}"), target)
    assert row["phoneNumber"] == CANARY["phone_a1"] and row["email"] == CANARY["email_a1"], "a manager's own people see contact details"
    assert row["basicSalary"] is None and row["ctc"] is None, "but never pay"
    assert {"basicSalary", "ctc"} <= set(row["redacted"])
    colleague = world.u["a_emp2"].id
    other = _row(world.get("a_manager", f"/hr/employee-management/employees/{colleague}"), colleague)
    assert other["phoneNumber"] is None and other["email"] == "••••", "someone who does not report to them is just a colleague"


def test_E06_org_wide_reports_and_exports_are_administrator_only(world):
    for viewer in ("a_emp2", "a_manager"):
        assert world.get(viewer, "/hr/employee-management/reports").status_code == 403, viewer
        assert world.post(viewer, "/hr/employee-management/export", json={"format": "csv"}).status_code in (403, 422), viewer
    assert world.get("a_hr", "/hr/employee-management/reports").status_code == 200
    assert world.get("a_admin", "/hr/employee-management/reports").status_code == 200


def test_E03_an_organization_admin_and_hr_keep_the_full_record(world):
    target = world.u["a_emp1"].id
    for viewer in ("a_admin", "a_hr"):
        row = _row(world.get(viewer, f"/hr/employee-management/employees/{target}"), target)
        assert float(row["basicSalary"]) == CANARY["salary_a1"] and row["phoneNumber"] == CANARY["phone_a1"], viewer
        assert not row.get("redacted")


def test_T05_the_bank_and_tax_profile_is_still_closed_to_everyone_but_the_person_and_hr(world):
    target = world.u["a_emp1"].id
    for viewer in ("a_emp2", "a_manager"):
        r = world.get(viewer, f"/hr/employee-management/employees/{target}/profile")
        assert r.status_code == 403 and CANARY["iban_a1"] not in r.text, viewer
    assert CANARY["iban_a1"] in world.get("a_emp1", f"/hr/employee-management/employees/{target}/profile").text
    assert CANARY["iban_a1"] in world.get("a_hr", f"/hr/employee-management/employees/{target}/profile").text
