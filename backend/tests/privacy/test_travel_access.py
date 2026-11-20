"""Travel: who may decide, change, delete or see a trip or claim (fix batch 1 of the Assets / Learning / Travel audit).

Real sign-in tokens and two organizations (the privacy `world`).
  - T1  an admin (ADMIN, HR_ADMIN) may approve, reject, edit or delete anyone else's trip; a manager may only approve or
        reject a direct report's trip; nobody approves, rejects or sets the status of their own trip
  - T2  only an admin raises a trip or files a claim for someone else
  - T4  a claim's employee belongs to the organization, also when no trip is named
  - T14 the organization-wide travel dashboard is admin only
"""
from datetime import date, timedelta

import pytest

from app.modules.hr.models import RequestStatus, TravelExpense, TravelRequest

SOON = (date.today() + timedelta(days=3)).isoformat()
LATER = (date.today() + timedelta(days=5)).isoformat()


def _team(w):
    """a_emp1 reports to a_manager; a_emp2 does not."""
    w.u["a_emp1"].reporting_manager_id = w.u["a_manager"].id
    w.db.commit()


def _trip_row(w, who, org=1, status=RequestStatus.PENDING):
    t = TravelRequest(employee_id=w.u[who].id, organization_id=org, destination="Pune", purpose="Client",
                      start_date=date.today() + timedelta(days=3), end_date=date.today() + timedelta(days=5), status=status)
    w.db.add(t)
    w.db.commit()
    return t


def _claim(w, who, **over):
    body = {"expense_type": "Hotel", "amount": 40, "description": "Two nights in Pune"}
    body.update(over)
    return w.post(who, "/hr/travel/expenses", json=body)


def _status(w, trip_id):
    w.db.expire_all()
    return w.db.get(TravelRequest, trip_id).status


# ── T1: deciding and changing a trip ─────────────────────────────────────────────────────────────────────────────────

def test_a_manager_approves_or_rejects_a_direct_reports_trip(world):
    _team(world)
    one, two = _trip_row(world, "a_emp1"), _trip_row(world, "a_emp1")
    assert world.put("a_manager", f"/hr/travel/{one.id}", json={"status": "approved"}).status_code == 200
    assert world.put("a_manager", f"/hr/travel/{two.id}", json={"status": "rejected"}).status_code == 200
    assert _status(world, one.id) == RequestStatus.APPROVED and _status(world, two.id) == RequestStatus.REJECTED


def test_a_manager_cannot_edit_or_delete_a_direct_reports_trip(world):
    _team(world)
    trip = _trip_row(world, "a_emp1")
    assert world.put("a_manager", f"/hr/travel/{trip.id}", json={"destination": "Goa"}).status_code == 403
    assert world.put("a_manager", f"/hr/travel/{trip.id}", json={"status": "approved", "destination": "Goa"}).status_code == 403
    assert world.put("a_manager", f"/hr/travel/{trip.id}", json={"status": "cancelled"}).status_code == 403
    assert world.delete("a_manager", f"/hr/travel/{trip.id}").status_code == 403
    assert world.db.get(TravelRequest, trip.id) is not None


def test_a_manager_cannot_touch_or_see_someone_who_is_not_their_report(world):
    _team(world)
    trip = _trip_row(world, "a_emp2")
    assert world.get("a_manager", f"/hr/travel/{trip.id}").status_code == 404
    assert world.put("a_manager", f"/hr/travel/{trip.id}", json={"status": "approved"}).status_code == 404
    assert world.delete("a_manager", f"/hr/travel/{trip.id}").status_code == 404
    assert _status(world, trip.id) == RequestStatus.PENDING


@pytest.mark.parametrize("who", ["a_admin", "a_hr", "a_manager", "a_emp1"])
def test_nobody_approves_or_rejects_their_own_trip(world, who):
    trip = _trip_row(world, who)
    for decision in ("approved", "rejected"):
        r = world.put(who, f"/hr/travel/{trip.id}", json={"status": decision})
        assert r.status_code == 403, (who, decision, r.text)
    assert _status(world, trip.id) == RequestStatus.PENDING
    # withdrawing your own pending trip is still allowed
    assert world.put(who, f"/hr/travel/{trip.id}", json={"status": "cancelled"}).status_code == 200


@pytest.mark.parametrize("who", ["a_admin", "a_hr"])
def test_admins_approve_edit_and_delete_anyone_elses_trip(world, who):
    trip = _trip_row(world, "a_emp2")
    assert world.put(who, f"/hr/travel/{trip.id}", json={"status": "approved"}).status_code == 200
    assert world.put(who, f"/hr/travel/{trip.id}", json={"destination": "Goa"}).status_code == 200
    assert world.delete(who, f"/hr/travel/{trip.id}").status_code == 200


@pytest.mark.parametrize("who", ["a_emp2", "a_emp1"])
def test_an_employee_cannot_decide_change_or_delete_a_colleagues_trip(world, who):
    _team(world)
    trip = _trip_row(world, "a_manager" if who == "a_emp1" else "a_emp1")          # their manager's trip, or a peer's
    assert world.put(who, f"/hr/travel/{trip.id}", json={"status": "approved"}).status_code == 404
    assert world.delete(who, f"/hr/travel/{trip.id}").status_code == 404


def test_another_organizations_admin_cannot_reach_a_trip(world):
    trip = _trip_row(world, "a_emp1")
    assert world.get("b_admin", f"/hr/travel/{trip.id}").status_code == 404
    assert world.put("b_admin", f"/hr/travel/{trip.id}", json={"status": "approved"}).status_code == 404
    assert world.delete("b_admin", f"/hr/travel/{trip.id}").status_code == 404


# ── who sees which trips and claims ──────────────────────────────────────────────────────────────────────────────────

def test_lists_admins_see_the_organization_managers_their_team_employees_themselves(world):
    _team(world)
    for who in ("a_emp1", "a_emp2", "a_manager"):
        _trip_row(world, who)
        world.db.add(TravelExpense(employee_id=world.u[who].id, organization_id=1, expense_type="Taxi", amount=10, currency="INR"))
    _trip_row(world, "b_emp1", org=2)
    world.db.commit()
    ids = {k: world.u[k].id for k in ("a_emp1", "a_emp2", "a_manager")}
    for path in ("/hr/travel", "/hr/travel-expenses"):
        seen = lambda who: sorted(r["employee_id"] for r in world.get(who, path).json())  # noqa: E731
        assert seen("a_admin") == sorted(ids.values()), path
        assert seen("a_hr") == sorted(ids.values()), path
        assert seen("a_manager") == sorted([ids["a_manager"], ids["a_emp1"]]), path
        assert seen("a_emp2") == [ids["a_emp2"]], path
        assert world.get("a_manager", f"{path}?employee_id={ids['a_emp2']}").json() == [], path


# ── T2: raising a trip or a claim for someone else ───────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("who", ["a_manager", "a_emp1"])
def test_only_admins_raise_a_trip_or_claim_for_someone_else(world, who):
    _team(world)
    other = world.u["a_emp1" if who == "a_manager" else "a_emp2"].id
    trip = world.post(who, "/hr/travel", json={"employee_id": other, "destination": "Pune", "purpose": "Client",
                                              "start_date": SOON, "end_date": LATER})
    assert trip.status_code == 403
    assert _claim(world, who, employee_id=other).status_code == 403
    assert world.db.query(TravelRequest).count() == 0 and world.db.query(TravelExpense).count() == 0
    own = world.post(who, "/hr/travel", json={"destination": "Pune", "purpose": "Client", "start_date": SOON, "end_date": LATER})
    assert own.status_code == 200 and own.json()["employee_id"] == world.u[who].id


def test_a_manager_cannot_backdate_a_trip(world):
    past = (date.today() - timedelta(days=10)).isoformat()
    r = world.post("a_manager", "/hr/travel", json={"destination": "Pune", "purpose": "Client", "start_date": past, "end_date": past})
    assert r.status_code == 400


@pytest.mark.parametrize("who", ["a_admin", "a_hr"])
def test_admins_raise_trips_and_claims_for_their_own_people_only(world, who):
    ok = world.post(who, "/hr/travel", json={"employee_id": world.u["a_emp1"].id, "destination": "Pune", "purpose": "Client",
                                            "start_date": SOON, "end_date": LATER})
    assert ok.status_code == 200
    assert _claim(world, who, employee_id=world.u["a_emp1"].id).status_code == 201
    for emp in (world.u["b_emp1"].id, 999999):
        assert world.post(who, "/hr/travel", json={"employee_id": emp, "destination": "Pune", "purpose": "Client",
                                                  "start_date": SOON, "end_date": LATER}).status_code == 404


# ── T4: a claim with no trip still has to name this organization's employee ──────────────────────────────────────────

def test_a_claim_without_a_trip_cannot_name_another_organizations_employee(world):
    for emp in (world.u["b_emp1"].id, 999999):
        assert _claim(world, "a_admin", employee_id=emp).status_code == 404, emp
    assert world.db.query(TravelExpense).count() == 0


# ── T14: the dashboard ───────────────────────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("who,code", [("a_admin", 200), ("a_hr", 200), ("a_manager", 403), ("a_emp1", 403)])
def test_the_travel_dashboard_is_admin_only(world, who, code):
    assert world.get(who, "/hr/travel/dashboard").status_code == code
