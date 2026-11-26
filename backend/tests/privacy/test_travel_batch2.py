"""Travel, fix batch 2 of the Assets / Learning / Travel audit. Real sign-in tokens and two organizations (the privacy `world`).

  - T3  a trip's status moves only pending -> approved / rejected / cancelled and approved -> cancelled / completed;
        a rejected, cancelled or completed trip is final; an edit cannot make a trip end before it starts or blank its
        destination
  - T5  the maximum trip duration in the travel settings is enforced on create and edit; the daily expense limit flags a
        claim (within_policy) as soon as it is filed
  - T6  lists page on the server with a total; expense totals cover every matching claim, per currency
  - T9  the dashboard counts every claim of the organization (also those with no trip), per currency
"""
from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.modules.hr.models import RequestStatus, TravelExpense, TravelRequest, TravelSetting

SOON = date.today() + timedelta(days=3)


def _trip(w, who="a_emp1", org=1, status=RequestStatus.PENDING, days=3):
    t = TravelRequest(employee_id=w.u[who].id, organization_id=org, destination="Pune", purpose="Client",
                      start_date=SOON, end_date=SOON + timedelta(days=days - 1), status=status)
    w.db.add(t)
    w.db.commit()
    return t


def _claim_row(w, who="a_emp1", org=1, amount=10, currency="INR", status=RequestStatus.PENDING, request_id=None, kind="Hotel"):
    e = TravelExpense(employee_id=w.u[who].id, organization_id=org, expense_type=kind, amount=amount, currency=currency,
                      status=status, request_id=request_id, description="Two nights in Pune")
    w.db.add(e)
    w.db.commit()
    return e


def _status(w, trip_id):
    w.db.expire_all()
    return w.db.get(TravelRequest, trip_id).status


def _settings(w, org=1, **values):
    s = w.db.query(TravelSetting).filter(TravelSetting.organization_id == org).first()
    if s is None:
        s = TravelSetting(organization_id=org)
        w.db.add(s)
    for k, v in values.items():
        setattr(s, k, v)
    w.db.commit()


def _lines(lines):
    return {l["currency"]: Decimal(str(l["amount"])) for l in lines}


# ── T3: status rules and edits ───────────────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("start,new", [
    (RequestStatus.REJECTED, "approved"), (RequestStatus.REJECTED, "pending"), (RequestStatus.APPROVED, "pending"),
    (RequestStatus.APPROVED, "rejected"), (RequestStatus.CANCELLED, "approved"), (RequestStatus.COMPLETED, "cancelled"),
    (RequestStatus.PENDING, "completed"),
])
def test_a_trip_cannot_jump_between_states(world, start, new):
    trip = _trip(world, status=start)
    r = world.put("a_admin", f"/hr/travel/{trip.id}", json={"status": new})
    assert r.status_code == 409, r.text
    assert _status(world, trip.id) == start


@pytest.mark.parametrize("start,new", [
    (RequestStatus.PENDING, "approved"), (RequestStatus.PENDING, "rejected"), (RequestStatus.PENDING, "cancelled"),
    (RequestStatus.APPROVED, "cancelled"), (RequestStatus.APPROVED, "completed"),
])
def test_the_allowed_moves_still_work(world, start, new):
    trip = _trip(world, status=start)
    r = world.put("a_hr", f"/hr/travel/{trip.id}", json={"status": new})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == new


def test_approving_sets_the_approval_time(world):
    trip = _trip(world)
    r = world.put("a_admin", f"/hr/travel/{trip.id}", json={"status": "approved"})
    assert r.status_code == 200 and r.json()["approved_at"] is not None


def test_a_manager_cannot_reverse_a_decision(world):
    world.u["a_emp1"].reporting_manager_id = world.u["a_manager"].id
    world.db.commit()
    trip = _trip(world, status=RequestStatus.REJECTED)
    assert world.put("a_manager", f"/hr/travel/{trip.id}", json={"status": "approved"}).status_code == 409
    assert _status(world, trip.id) == RequestStatus.REJECTED


def test_a_final_trip_cannot_be_edited(world):
    for final in (RequestStatus.REJECTED, RequestStatus.CANCELLED, RequestStatus.COMPLETED):
        trip = _trip(world, status=final)
        assert world.put("a_admin", f"/hr/travel/{trip.id}", json={"destination": "Goa"}).status_code == 409, final


def test_editing_an_approved_trip_checks_its_dates(world):
    trip = _trip(world, status=RequestStatus.APPROVED)
    before = (SOON - timedelta(days=5)).isoformat()
    r = world.put("a_admin", f"/hr/travel/{trip.id}", json={"end_date": before})
    assert r.status_code == 400 and "end date cannot be before" in r.text
    r = world.put("a_admin", f"/hr/travel/{trip.id}", json={"start_date": (SOON + timedelta(days=30)).isoformat()})
    assert r.status_code == 400
    world.db.expire_all()
    assert world.db.get(TravelRequest, trip.id).end_date == SOON + timedelta(days=2)
    assert world.put("a_admin", f"/hr/travel/{trip.id}", json={"destination": "Goa"}).status_code == 200


@pytest.mark.parametrize("value", ["", "   ", None, "12"])
def test_an_edit_cannot_blank_the_destination(world, value):
    trip = _trip(world)
    r = world.put("a_admin", f"/hr/travel/{trip.id}", json={"destination": value})
    assert r.status_code == 422, r.text
    world.db.expire_all()
    assert world.db.get(TravelRequest, trip.id).destination == "Pune"


def test_an_edited_destination_is_trimmed(world):
    trip = _trip(world)
    r = world.put("a_admin", f"/hr/travel/{trip.id}", json={"destination": "   New   Delhi  "})
    assert r.status_code == 200 and r.json()["destination"] == "New Delhi"


def test_dates_and_status_cannot_be_cleared(world):
    trip = _trip(world)
    for field in ("start_date", "end_date", "status"):
        assert world.put("a_admin", f"/hr/travel/{trip.id}", json={field: None}).status_code == 422, field


# ── T5: travel settings ──────────────────────────────────────────────────────────────────────────────────────────────

def test_a_trip_longer_than_the_maximum_is_refused_on_create(world):
    _settings(world, max_trip_duration=5)
    body = {"destination": "Pune", "purpose": "Client", "start_date": SOON.isoformat()}
    r = world.post("a_emp1", "/hr/travel", json={**body, "end_date": (SOON + timedelta(days=5)).isoformat()})    # 6 days
    assert r.status_code == 400 and "at most 5 days" in r.text
    ok = world.post("a_emp1", "/hr/travel", json={**body, "end_date": (SOON + timedelta(days=4)).isoformat()})   # 5 days
    assert ok.status_code == 200, ok.text
    # an admin raising it for someone else is held to the same policy
    r = world.post("a_admin", "/hr/travel", json={**body, "employee_id": world.u["a_emp2"].id,
                                                  "end_date": (SOON + timedelta(days=9)).isoformat()})
    assert r.status_code == 400


def test_a_trip_cannot_be_edited_past_the_maximum(world):
    _settings(world, max_trip_duration=5)
    trip = _trip(world, days=3)
    r = world.put("a_admin", f"/hr/travel/{trip.id}", json={"end_date": (SOON + timedelta(days=10)).isoformat()})
    assert r.status_code == 400 and "at most 5 days" in r.text
    own = world.put("a_emp1", f"/hr/travel/{trip.id}", json={"end_date": (SOON + timedelta(days=10)).isoformat()})
    assert own.status_code == 400


def test_the_maximum_is_per_organization(world):
    _settings(world, org=1, max_trip_duration=2)
    _settings(world, org=2, max_trip_duration=30)
    body = {"destination": "Pune", "purpose": "Client", "start_date": SOON.isoformat(),
            "end_date": (SOON + timedelta(days=9)).isoformat()}
    assert world.post("a_emp1", "/hr/travel", json=body).status_code == 400
    assert world.post("b_emp1", "/hr/travel", json=body).status_code == 200


def test_a_claim_over_the_daily_limit_is_refused_with_the_reason(world):
    _settings(world, expense_limit_per_day=Decimal("100"))
    over = world.post("a_emp1", "/hr/travel/expenses", json={"expense_type": "Hotel", "amount": 150, "description": "Two nights"})
    under = world.post("a_emp1", "/hr/travel/expenses", json={"expense_type": "Hotel", "amount": 50, "description": "One night"})
    assert over.status_code == 400 and "expense limit" in str(over.json())
    assert under.status_code == 201 and under.json()["within_policy"] is True
    listed = [r["id"] for r in world.get("a_admin", "/hr/travel-expenses").json()]
    assert listed == [under.json()["id"]], "the refused claim was never saved"


def test_a_claim_on_a_trip_may_use_the_limit_for_every_day_less_what_is_claimed(world):
    _settings(world, expense_limit_per_day=Decimal("100"))
    trip = _trip(world, days=3)                                          # 3 days: up to 300 in all
    _claim_row(world, amount=120, request_id=trip.id)
    _claim_row(world, amount=500, request_id=trip.id, status=RequestStatus.REJECTED)   # a refused claim does not count
    post = lambda amt: world.post("a_emp1", "/hr/travel/expenses",  # noqa: E731
                                  json={"expense_type": "Hotel", "amount": amt, "description": "Hotel", "request_id": trip.id})
    too_much = post(181)
    assert too_much.status_code == 400
    assert "up to INR 180.00" in str(too_much.json()) or "up to 180.00" in str(too_much.json())
    assert post(180).status_code == 201
    assert post(1).status_code == 400, "the trip's allowance is used up"


def test_without_a_limit_any_amount_is_accepted(world):
    ok = world.post("a_emp1", "/hr/travel/expenses", json={"expense_type": "Hotel", "amount": 99999, "description": "Hotel"})
    assert ok.status_code == 201 and ok.json()["within_policy"] is None


# ── T6: paging and totals ────────────────────────────────────────────────────────────────────────────────────────────

def test_without_paging_parameters_the_lists_stay_plain_lists(world):
    _trip(world)
    _claim_row(world)
    assert isinstance(world.get("a_admin", "/hr/travel").json(), list)
    assert isinstance(world.get("a_admin", "/hr/travel-expenses").json(), list)


def test_trips_page_on_the_server_with_a_total(world):
    for _ in range(7):
        _trip(world)
    _trip(world, who="b_emp1", org=2)
    first = world.get("a_admin", "/hr/travel?page=1&per_page=3").json()
    last = world.get("a_admin", "/hr/travel?page=3&per_page=3").json()
    assert first["total"] == 7 and len(first["items"]) == 3 and len(last["items"]) == 1
    ids = {r["id"] for p in (1, 2, 3) for r in world.get("a_admin", f"/hr/travel?page={p}&per_page=3").json()["items"]}
    assert len(ids) == 7


def test_the_paged_trip_list_keeps_each_callers_scope(world):
    _trip(world, who="a_emp1")
    _trip(world, who="a_emp2")
    page = world.get("a_emp2", "/hr/travel?page=1&per_page=50").json()
    assert page["total"] == 1 and page["items"][0]["employee_id"] == world.u["a_emp2"].id


def test_trips_can_be_searched_by_the_travellers_name(world):
    _trip(world, who="a_emp1")
    _trip(world, who="a_emp2")
    first = world.u["a_emp2"].first_name
    page = world.get("a_admin", f"/hr/travel?page=1&per_page=50&search={first}").json()
    assert page["total"] == 1 and page["items"][0]["employee_id"] == world.u["a_emp2"].id


def test_expense_totals_cover_every_matching_claim_not_just_the_page(world):
    for _ in range(5):
        _claim_row(world, amount=100)                                      # pending INR
    _claim_row(world, amount=40, currency="USD", status=RequestStatus.APPROVED, kind="Flight")
    _claim_row(world, amount=30, status=RequestStatus.COMPLETED, kind="Cab")
    _claim_row(world, amount=7, status=RequestStatus.REJECTED)
    _claim_row(world, who="b_emp1", org=2, amount=999)                    # another organization
    r = world.get("a_admin", "/hr/travel-expenses?page=1&per_page=2")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 8 and len(body["items"]) == 2
    t = body["totals"]
    assert _lines(t["pending"]) == {"INR": Decimal("500")}
    assert _lines(t["approved"]) == {"INR": Decimal("30"), "USD": Decimal("40")}
    assert _lines(t["reimbursed"]) == {"INR": Decimal("30")}
    assert _lines(t["rejected"]) == {"INR": Decimal("7")}
    assert _lines(t["total_claimed"]) == {"INR": Decimal("530"), "USD": Decimal("40")}
    cats = {(c["label"], c["currency"]): Decimal(str(c["amount"])) for c in t["categories"]}
    assert cats == {("Hotel", "INR"): Decimal("500"), ("Flight", "USD"): Decimal("40"), ("Cab", "INR"): Decimal("30")}


def test_a_managers_expense_totals_cover_only_what_they_may_see(world):
    world.u["a_emp1"].reporting_manager_id = world.u["a_manager"].id
    world.db.commit()
    _claim_row(world, who="a_emp1", amount=10)
    _claim_row(world, who="a_emp2", amount=1000)
    body = world.get("a_manager", "/hr/travel-expenses?page=1&per_page=20").json()
    assert body["total"] == 1 and _lines(body["totals"]["pending"]) == {"INR": Decimal("10")}


# ── T9: dashboard ────────────────────────────────────────────────────────────────────────────────────────────────────

def test_the_dashboard_counts_claims_without_a_trip_and_keeps_currencies_apart(world):
    trip = _trip(world)
    _claim_row(world, amount=100, status=RequestStatus.APPROVED, request_id=trip.id)
    _claim_row(world, amount=50, status=RequestStatus.COMPLETED)              # no trip
    _claim_row(world, amount=20, currency="USD", status=RequestStatus.APPROVED)
    _claim_row(world, amount=5, status=RequestStatus.PENDING)                 # not approved yet
    _claim_row(world, who="b_emp1", org=2, amount=999, status=RequestStatus.APPROVED)
    d = world.get("a_admin", "/hr/travel/dashboard").json()
    assert _lines(d["approved_expenses_by_currency"]) == {"INR": Decimal("150"), "USD": Decimal("20")}
    assert _lines(d["reimbursed_expenses_by_currency"]) == {"INR": Decimal("50")}
    assert Decimal(str(d["total_expenses"])) == 0                            # no single total across currencies


def test_the_dashboard_total_is_filled_in_for_a_single_currency(world):
    _claim_row(world, amount=100, status=RequestStatus.APPROVED)
    _claim_row(world, amount=50, status=RequestStatus.COMPLETED)
    d = world.get("a_admin", "/hr/travel/dashboard").json()
    assert Decimal(str(d["total_expenses"])) == Decimal("150")
