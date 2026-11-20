"""Travel, fix batch 4 of the Assets / Learning / Travel audit. Real sign-in tokens and two organizations (the privacy `world`).

  - T12 a claim cannot be approved once its trip was rejected or cancelled (refusing it is still possible)
  - T13 a trip with expense claims cannot be deleted; the refusal names the claims
  - T16 a claim with the first of two approvals says so, and tells the first approver they cannot give the second
"""
from datetime import date, timedelta

import pytest

from app.modules.hr.models import RequestStatus, TravelExpense, TravelRequest

SOON = date.today() + timedelta(days=3)


def _trip(w, who="a_emp1", status=RequestStatus.PENDING):
    t = TravelRequest(employee_id=w.u[who].id, organization_id=1, destination="Pune", purpose="Client",
                      start_date=SOON, end_date=SOON + timedelta(days=2), status=status)
    w.db.add(t)
    w.db.commit()
    return t


def _claim(w, who="a_emp1", amount=40, request_id=None, status=RequestStatus.PENDING):
    e = TravelExpense(employee_id=w.u[who].id, organization_id=1, expense_type="Hotel", amount=amount, currency="INR",
                      status=status, request_id=request_id, description="Two nights in Pune")
    w.db.add(e)
    w.db.commit()
    return e


def _expense_status(w, claim_id):
    w.db.expire_all()
    return w.db.get(TravelExpense, claim_id).status


# ── T12 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("trip_status", [RequestStatus.REJECTED, RequestStatus.CANCELLED])
def test_a_claim_on_a_rejected_or_cancelled_trip_cannot_be_approved(world, trip_status):
    trip = _trip(world, status=trip_status)
    claim = _claim(world, request_id=trip.id)
    r = world.put("a_admin", f"/hr/travel-expenses/{claim.id}", json={"status": "approved"})
    assert r.status_code == 409, r.text
    assert f"TRV-{trip.id:05d}" in r.text and "Reject it instead" in r.text
    assert _expense_status(world, claim.id) == RequestStatus.PENDING
    assert world.put("a_admin", f"/hr/travel-expenses/{claim.id}", json={"status": "rejected"}).status_code == 200


def test_a_claim_on_a_live_trip_or_no_trip_is_still_approved(world):
    for request_id in (_trip(world, status=RequestStatus.APPROVED).id, None):
        claim = _claim(world, request_id=request_id)
        r = world.put("a_hr", f"/hr/travel-expenses/{claim.id}", json={"status": "approved"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "approved" and r.json()["approved_at"] is not None


# ── T13 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

def test_a_trip_with_claims_cannot_be_deleted_and_the_claims_are_named(world):
    trip = _trip(world)
    one, two = _claim(world, request_id=trip.id), _claim(world, request_id=trip.id)
    r = world.delete("a_admin", f"/hr/travel/{trip.id}")
    assert r.status_code == 409, r.text
    assert f"EXP-{one.id:05d}" in r.text and f"EXP-{two.id:05d}" in r.text and "2 expense claims" in r.text
    world.db.expire_all()
    assert world.db.get(TravelRequest, trip.id) is not None
    assert world.db.get(TravelExpense, one.id).request_id == trip.id
    # the traveller withdrawing their own pending trip is held to the same rule
    assert world.delete("a_emp1", f"/hr/travel/{trip.id}").status_code == 409


def test_a_trip_without_claims_is_still_deleted(world):
    trip = _trip(world)
    assert world.delete("a_admin", f"/hr/travel/{trip.id}").status_code == 200
    world.db.expire_all()
    assert world.db.get(TravelRequest, trip.id) is None


# ── T16 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

def test_the_first_of_two_approvals_is_shown_and_the_first_approver_cannot_give_the_second(world):
    assert world.put("a_admin", "/hr/compensation-documents/settings",
                     json={"expense_second_approval_threshold": 200}).status_code == 200
    claim = _claim(world, amount=500)
    first = world.put("a_hr", f"/hr/travel-expenses/{claim.id}", json={"status": "approved"})
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["status"] == "in_progress" and body["awaiting_second_approval"] is True
    assert body["first_approver_id"] == world.u["a_hr"].id and body["first_approved_by_me"] is True
    assert body["first_approver_name"]

    mine = {r["id"]: r for r in world.get("a_hr", "/hr/travel-expenses").json()}[claim.id]
    theirs = {r["id"]: r for r in world.get("a_admin", "/hr/travel-expenses?page=1&per_page=10").json()["items"]}[claim.id]
    assert mine["awaiting_second_approval"] and mine["first_approved_by_me"] is True
    assert theirs["awaiting_second_approval"] and theirs["first_approved_by_me"] is False

    assert world.put("a_hr", f"/hr/travel-expenses/{claim.id}", json={"status": "approved"}).status_code == 403
    second = world.put("a_admin", f"/hr/travel-expenses/{claim.id}", json={"status": "approved"})
    assert second.status_code == 200, second.text
    assert second.json()["status"] == "approved" and second.json()["awaiting_second_approval"] is False


def test_a_claim_below_the_threshold_is_not_awaiting_a_second_approval(world):
    claim = _claim(world, amount=40)
    listed = {r["id"]: r for r in world.get("a_admin", "/hr/travel-expenses").json()}[claim.id]
    assert listed["awaiting_second_approval"] is False and listed["first_approved_by_me"] is False
