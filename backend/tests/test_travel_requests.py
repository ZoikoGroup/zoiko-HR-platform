"""Travel requests and expenses carry the staff member's name, so no page shows 'Unknown' (ZHR-79)."""

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.modules.hr.models import Organization, OrganizationStatus, TravelExpense, TravelRequest


def _person(email, org, n, first="Pat", last=None, role=None):
    from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
    return Employee(email=email, hashed_password="x", employee_code=f"C{n}", role=role or UserRole.EMPLOYEE, first_name=first, last_name=last or str(n),
                    job_title="t", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=org)


@pytest.fixture
def env():
    from app.main import app
    from app.core.dependencies import get_current_admin, get_current_user
    from app.modules.employee.models import UserRole

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add_all([Organization(id=1, name="A", status=OrganizationStatus.ACTIVE), Organization(id=2, name="B", status=OrganizationStatus.ACTIVE)])
    s.commit()
    admin = _person("a@x.com", 1, 1, "Priya", "Shah", UserRole.ADMIN)
    ann = _person("ann@x.com", 1, 2, "Ann", "Lee")
    nameless = _person("nameless@x.com", 1, 3, "", "")
    stranger = _person("s@x.com", 2, 4, "Sam", "Other", UserRole.ADMIN)
    s.add_all([admin, ann, nameless, stranger])
    s.commit()
    box = {"user": admin}
    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: box["user"]
    app.dependency_overrides[get_current_admin] = lambda: box["user"]
    c = TestClient(app, raise_server_exceptions=False)
    c.db, c.box, c.admin, c.ann, c.nameless, c.stranger = s, box, admin, ann, nameless, stranger
    yield c
    for dep in (get_db, get_current_user, get_current_admin):
        app.dependency_overrides.pop(dep, None)
    s.close()
    engine.dispose()


def _trip(env, employee, **over):
    body = {"employee_id": employee.id, "destination": "Pune", "purpose": "Client visit",
            "start_date": (date.today() + timedelta(days=3)).isoformat(), "end_date": (date.today() + timedelta(days=5)).isoformat()}
    body.update(over)
    return env.post("/hr/travel", json=body)


def test_a_travel_request_comes_back_with_the_staff_members_name(env):
    r = _trip(env, env.ann)
    assert r.status_code in (200, 201), r.text
    assert r.json()["employee_name"] == "Ann Lee"
    listed = env.get("/hr/travel").json()
    assert [(t["employee_id"], t["employee_name"]) for t in listed] == [(env.ann.id, "Ann Lee")]
    assert env.get(f"/hr/travel/{r.json()['id']}").json()["employee_name"] == "Ann Lee"
    assert env.put(f"/hr/travel/{r.json()['id']}", json={"purpose": "Updated"}).json()["employee_name"] == "Ann Lee"


def test_a_person_with_no_name_falls_back_to_their_email_not_to_unknown(env):
    env.nameless.last_name = ""
    env.db.commit()
    _trip(env, env.nameless)
    assert env.get("/hr/travel").json()[0]["employee_name"] == "nameless@x.com"


def test_every_row_of_a_list_gets_its_own_name_and_the_newest_is_first(env):
    first = _trip(env, env.ann).json()["id"]
    second = _trip(env, env.admin).json()["id"]
    rows = env.get("/hr/travel").json()
    assert {r["id"]: r["employee_name"] for r in rows} == {first: "Ann Lee", second: "Priya Shah"}
    assert rows[0]["id"] == second


def test_travel_expenses_carry_the_name_too(env):
    trip = _trip(env, env.ann).json()["id"]
    env.db.add(TravelExpense(organization_id=1, request_id=trip, employee_id=env.ann.id, expense_type="Taxi", amount=40, currency="USD"))
    env.db.commit()
    rows = env.get("/hr/travel-expenses").json()
    assert rows[0]["employee_name"] == "Ann Lee"


def test_a_request_for_someone_outside_the_organization_or_with_dates_reversed_is_refused(env):
    r = _trip(env, env.stranger)
    assert r.status_code == 400 and "not found in this organization" in r.text
    ghost = env.post("/hr/travel", json={"employee_id": 9999, "destination": "Pune", "start_date": "2026-11-02", "end_date": "2026-11-03"})
    assert ghost.status_code == 400
    back = _trip(env, env.ann, start_date="2026-11-10", end_date="2026-11-05")
    assert back.status_code == 400 and "end date cannot be before" in back.text
    assert env.get("/hr/travel").json() == []


def test_other_organizations_see_none_of_it(env):
    _trip(env, env.ann)
    env.box["user"] = env.stranger
    assert env.get("/hr/travel").json() == []


# ── ZHR-94: an employee's travel dates cannot be in the past
def _as_employee(env):
    env.box["user"] = env.ann


def test_an_employee_cannot_submit_travel_dates_in_the_past(env):
    _as_employee(env)
    today = date.today()
    for start, end in ((today - timedelta(days=3), today - timedelta(days=1)), (today - timedelta(days=1), today + timedelta(days=2))):
        r = _trip(env, env.ann, start_date=start.isoformat(), end_date=end.isoformat())
        assert r.status_code == 400 and "cannot be in the past" in r.text, r.text
    assert "end date cannot be before" in _trip(env, env.ann, start_date=(today + timedelta(days=5)).isoformat(), end_date=(today + timedelta(days=2)).isoformat()).text
    assert env.get("/hr/travel").json() == []
    ok = _trip(env, env.ann, start_date=today.isoformat(), end_date=today.isoformat())
    assert ok.status_code in (200, 201), ok.text                      # today is fine


def test_an_admin_can_still_record_a_past_trip(env):
    past = (date.today() - timedelta(days=10)).isoformat()
    r = _trip(env, env.ann, start_date=past, end_date=past)
    assert r.status_code in (200, 201), r.text


def test_destination_and_purpose_are_cleaned_and_checked(env):
    assert _trip(env, env.ann, destination="   ").status_code == 422
    assert _trip(env, env.ann, destination="12345").status_code == 422
    assert _trip(env, env.ann, purpose="x" * 501).status_code == 422
    r = _trip(env, env.ann, destination="  New   Delhi ")
    assert r.json()["destination"] == "New Delhi"


def test_an_employee_sees_and_changes_only_their_own_requests(env):
    mine = _trip(env, env.ann).json()
    theirs = _trip(env, env.nameless).json()
    _as_employee(env)
    ids = [t["id"] for t in env.get("/hr/travel").json()]
    assert ids == [mine["id"]]
    assert env.get(f"/hr/travel/{theirs['id']}").status_code == 404
    assert env.put(f"/hr/travel/{theirs['id']}", json={"destination": "Goa"}).status_code == 404
    assert env.delete(f"/hr/travel/{theirs['id']}").status_code == 404
    assert env.put(f"/hr/travel/{mine['id']}", json={"status": "approved"}).status_code == 400          # no approving your own trip
    past = (date.today() - timedelta(days=2)).isoformat()
    assert env.put(f"/hr/travel/{mine['id']}", json={"start_date": past, "end_date": past}).status_code == 400
    assert env.put(f"/hr/travel/{mine['id']}", json={"destination": "Goa"}).status_code == 200
    # a request someone has already decided on is locked
    env.box["user"] = env.admin
    env.put(f"/hr/travel/{mine['id']}", json={"status": "approved"})
    _as_employee(env)
    assert env.put(f"/hr/travel/{mine['id']}", json={"destination": "Pune"}).status_code == 400
    assert env.delete(f"/hr/travel/{mine['id']}").status_code == 400


# ── ZHR-95: an employee can submit an expense claim
def _claim(env, **over):
    body = {"expense_type": "Hotel", "amount": 4500.5, "description": "Two nights in Pune"}
    body.update(over)
    return env.post("/hr/travel/expenses", json=body)


def test_a_claim_without_a_trip_is_saved_and_listed(env):
    _as_employee(env)
    r = _claim(env)
    assert r.status_code == 201, r.text
    body = r.json()
    assert (body["expense_type"], float(body["amount"]), body["currency"], body["status"], body["employee_id"]) == ("Hotel", 4500.5, "INR", "pending", env.ann.id)
    assert body["request_id"] is None and body["employee_name"] == "Ann Lee"
    rows = env.get("/hr/travel-expenses").json()
    assert [x["id"] for x in rows] == [body["id"]]


def test_a_claim_can_belong_to_the_employees_own_trip_only(env):
    mine = _trip(env, env.ann).json()
    theirs = _trip(env, env.nameless).json()
    _as_employee(env)
    assert _claim(env, request_id=mine["id"]).status_code == 201
    r = _claim(env, request_id=theirs["id"])
    assert r.status_code == 400 and "your own trips" in r.text
    assert _claim(env, request_id=99999).status_code == 400


def test_bad_claims_are_refused_with_a_message_for_each_box(env):
    _as_employee(env)
    for body, word in (({"amount": 0}, "more than zero"), ({"amount": -5}, "more than zero"), ({"amount": "abc"}, "as a number"),
                       ({"amount": 12.345}, "2 decimal"), ({"amount": 99999999999}, "too large"), ({"expense_type": "Yacht"}, "category"),
                       ({"description": " "}, "Describe"), ({"description": "x" * 501}, "at most 500")):
        r = _claim(env, **body)
        assert r.status_code == 422 and word in r.text, (body, r.text)
    assert env.get("/hr/travel-expenses").json() == []


def test_an_employee_sees_only_their_own_claims_and_cannot_claim_for_others(env):
    r = _claim(env)                                   # raised by the admin, for the admin
    _as_employee(env)
    mine = _claim(env, employee_id=env.admin.id).json()
    assert mine["employee_id"] == env.ann.id
    assert [x["id"] for x in env.get("/hr/travel-expenses").json()] == [mine["id"]]


# ── ZHR-98: the admin Expenses page loads every claim
def test_admin_lists_every_claim_even_ones_without_a_trip_or_a_currency(env):
    from app.modules.hr.models import RequestStatus
    trip = _trip(env, env.ann).json()
    env.db.add_all([
        TravelExpense(request_id=None, organization_id=1, employee_id=env.ann.id, expense_type="Hotel", amount=100, currency=None, description=None, status=RequestStatus.PENDING),
        TravelExpense(request_id=trip["id"], organization_id=1, employee_id=env.ann.id, expense_type="Cab", amount=50, currency="INR", description="Airport", status=RequestStatus.PENDING),
        TravelExpense(request_id=None, organization_id=2, employee_id=env.stranger.id, expense_type="Other", amount=9, status=RequestStatus.PENDING),
    ])
    env.db.commit()
    r = env.get("/hr/travel-expenses?page=1&per_page=100&search=")
    assert r.status_code == 200, r.text
    rows = r.json()
    assert len(rows) == 2 and {x["employee_name"] for x in rows} == {"Ann Lee"}          # the other organization's claim is not listed
    assert {x["request_id"] for x in rows} == {None, trip["id"]}


def test_admin_approves_and_rejects_claims_once_and_the_employee_sees_the_result(env):
    _as_employee(env)
    claim = _claim(env).json()
    env.box["user"] = env.admin
    ok = env.put(f"/hr/travel-expenses/{claim['id']}", json={"status": "approved"})
    assert ok.status_code == 200, ok.text
    assert ok.json()["status"] == "approved" and ok.json()["approved_at"] is not None
    again = env.put(f"/hr/travel-expenses/{claim['id']}", json={"status": "rejected"})
    assert again.status_code == 400 and "already approved" in again.text
    other = _claim(env, employee_id=env.ann.id).json()
    assert env.put(f"/hr/travel-expenses/{other['id']}", json={"status": "bogus"}).status_code == 422
    assert env.put(f"/hr/travel-expenses/{other['id']}", json={"status": "pending"}).status_code == 400
    rej = env.put(f"/hr/travel-expenses/{other['id']}", json={"status": "rejected"})
    assert rej.status_code == 200 and rej.json()["status"] == "rejected"
    _as_employee(env)
    assert {x["status"] for x in env.get("/hr/travel-expenses").json()} == {"approved", "rejected"}


def test_a_claim_from_another_organization_cannot_be_decided(env):
    from app.modules.hr.models import RequestStatus
    env.db.add(TravelExpense(request_id=None, organization_id=2, employee_id=env.stranger.id, expense_type="Other", amount=9, status=RequestStatus.PENDING))
    env.db.commit()
    foreign = env.db.query(TravelExpense).filter_by(organization_id=2).one()
    assert env.put(f"/hr/travel-expenses/{foreign.id}", json={"status": "approved"}).status_code == 404
