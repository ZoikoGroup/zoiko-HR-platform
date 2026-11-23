"""Departments: the head of department is a person (an active employee of the organization), budget and spent are
never negative, and utilization is worked out once on the server. The old free-text `head` keeps the person's name so
older screens still show it."""
from test_department_status import _dept, _put, client  # noqa: F401  (fixture)


def _list(client):
    return {d["name"]: d for d in client.get("/hr/departments").json()}


def test_a_head_is_picked_from_the_organization_and_shown_by_name(client):
    d = _dept(client.db, "Design", "DSN")
    r = _put(client, d.id, head_employee_id=client.people["emp"].id)
    assert r.status_code == 200, r.text
    assert (r.json()["head_employee_id"], r.json()["head_name"], r.json()["head"]) == (client.people["emp"].id, "Emp U", "Emp U")
    row = _list(client)["Design"]
    assert row["head_name"] == "Emp U"
    r = _put(client, d.id, head_employee_id=None)                        # clear the head
    assert r.json()["head_employee_id"] is None and r.json()["head_name"] is None


def test_someone_outside_the_organization_or_inactive_cannot_be_head(client):
    d = _dept(client.db, "Design", "DSN")
    r = _put(client, d.id, head_employee_id=client.people["other"].id)
    assert r.status_code == 400 and "active employee of your organization" in r.json()["message"]
    client.people["emp"].is_active = False
    client.db.commit()
    assert _put(client, d.id, head_employee_id=client.people["emp"].id).status_code == 400


def test_cross_department_heads_follow_the_setting(client):
    a, b = _dept(client.db, "Design", "DSN"), _dept(client.db, "Sales", "SLS")
    assert _put(client, a.id, head_employee_id=client.people["hr"].id).status_code == 200
    assert _put(client, b.id, head_employee_id=client.people["hr"].id).status_code == 200     # allowed by default
    settings = client.get("/hr/departments/settings").json()
    settings["allow_cross_heads"] = False
    assert client.put("/hr/departments/settings", json=settings).status_code == 200
    c = _dept(client.db, "Support", "SUP")
    r = _put(client, c.id, head_employee_id=client.people["hr"].id)
    assert r.status_code == 400 and "already heads" in r.json()["message"]


def test_creating_with_a_head_and_budget(client):
    r = client.post("/hr/departments", json={"name": "Finance", "code": "FIN", "head_employee_id": client.people["emp"].id,
                                             "budget": "120000", "spent_budget": "30000"})
    assert r.status_code == 201, r.text
    assert r.json()["head_name"] == "Emp U" and r.json()["utilization"] == 25


def test_budget_and_spent_are_never_negative_and_utilization_is_from_the_server(client):
    d = _dept(client.db, "Design", "DSN")
    assert _put(client, d.id, budget="-1").status_code == 422
    assert _put(client, d.id, spent_budget="-5").status_code == 422
    assert _put(client, d.id, budget="12000", spent_budget="10000").json()["utilization"] == 83
    assert _list(client)["Design"]["utilization"] == 83
    assert _put(client, d.id, budget="0").json()["utilization"] is None                    # no budget, no percentage
