"""ZHR-30: Super Admin expenses oversight - claims, summary, budgets."""

from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.dependencies import get_current_super_admin
from app.core.exceptions import ForbiddenException, ZoikoException, zoiko_exception_handler
from app.database import Base, get_db
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import (
    Organization, OrganizationStatus, RequestStatus, TravelApproval, TravelExpense, TravelReceipt, TravelRequest,
)
from app.modules.super_admin import expenses_router
from app.modules.super_admin.models import AuditLog, ExpenseBudget


def _emp(db, email, role, org_id, first, last):
    e = Employee(
        email=email, hashed_password="x", employee_code=f"C-{email}", role=role, first_name=first, last_name=last,
        job_title="t", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE,
        date_of_joining=date.today(), organization_id=org_id,
    )
    db.add(e)
    db.commit()
    return e


@pytest.fixture
def world():
    eng = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(eng)
    db = sessionmaker(bind=eng)()
    db.add_all([Organization(id=1, name="Acme", organization_name="Acme Ltd", status=OrganizationStatus.ACTIVE),
                Organization(id=2, name="Globex", organization_name="Globex Inc", status=OrganizationStatus.ACTIVE)])
    db.commit()
    people = {
        "sa": _emp(db, "root@example.com", UserRole.SUPER_ADMIN, None, "Root", "Admin"),
        "amy": _emp(db, "amy@example.com", UserRole.EMPLOYEE, 1, "Amy", "Adams"),
        "bob": _emp(db, "bob@example.com", UserRole.EMPLOYEE, 2, "Bob", "Brown"),
        "mgr": _emp(db, "mgr@example.com", UserRole.MANAGER, 1, "Mia", "Manager"),
    }
    app = FastAPI()
    app.include_router(expenses_router.router)
    app.add_exception_handler(ZoikoException, zoiko_exception_handler)
    app.dependency_overrides[get_db] = lambda: db
    box = {"user": people["sa"]}

    def _admin():
        if box["user"].role != UserRole.SUPER_ADMIN:
            raise ForbiddenException("Super admin only")
        return box["user"]

    app.dependency_overrides[get_current_super_admin] = _admin
    return {"db": db, "c": TestClient(app), "p": people, "box": box}


def _claim(db, emp, amount, status=RequestStatus.PENDING, category="Travel", currency="USD", days_ago=1,
           receipt=None, description=None, request_id=None):
    e = TravelExpense(
        organization_id=emp.organization_id, employee_id=emp.id, expense_type=category, amount=Decimal(amount),
        currency=currency, status=status, description=description or f"{category} claim", receipt_url=receipt,
        submitted_at=datetime.utcnow() - timedelta(days=days_ago), request_id=request_id,
    )
    db.add(e)
    db.commit()
    return e


# ───────────────────────── claims ─────────────────────────

def test_empty_state_everywhere(world):
    c = world["c"]
    d = c.get("/super-admin/expenses/claims").json()
    assert d["total"] == 0 and d["claims"] == []
    s = c.get("/super-admin/expenses/summary").json()
    assert s["totals"] == {} and s["claim_count"] == 0 and s["counts"]["pending"] == 0
    assert c.get("/super-admin/expenses/budgets").json() == {"budgets": []}
    assert c.get("/super-admin/expenses/categories").json() == {"categories": []}


def test_claims_from_every_org_with_correct_details(world):
    db, c, p = world["db"], world["c"], world["p"]
    _claim(db, p["amy"], "340.50", RequestStatus.APPROVED, "Travel", receipt="https://files.example.com/r1.pdf", days_ago=2)
    _claim(db, p["bob"], "150", RequestStatus.PENDING, "Meals", "EUR", days_ago=1)
    d = c.get("/super-admin/expenses/claims").json()
    assert d["total"] == 2
    by_emp = {x["employee_name"]: x for x in d["claims"]}
    amy, bob = by_emp["Amy Adams"], by_emp["Bob Brown"]
    assert amy["organization_name"] == "Acme Ltd" and amy["amount"] == "340.50" and amy["currency"] == "USD"
    assert amy["status"] == "approved" and amy["category"] == "Travel" and amy["has_receipt"] is True
    assert bob["organization_name"] == "Globex Inc" and bob["amount"] == "150.00" and bob["currency"] == "EUR"
    assert bob["status"] == "pending" and bob["has_receipt"] is False
    assert amy["submitted_at"].endswith("Z")
    assert d["claims"][0]["employee_name"] == "Bob Brown"  # newest first by default


def test_every_filter_and_sort(world):
    db, c, p = world["db"], world["c"], world["p"]
    _claim(db, p["amy"], "100", RequestStatus.APPROVED, "Travel", days_ago=10, description="Flight to Berlin")
    _claim(db, p["amy"], "500", RequestStatus.PENDING, "Software", days_ago=5)
    _claim(db, p["bob"], "50", RequestStatus.REJECTED, "Meals", "EUR", days_ago=3)
    _claim(db, p["bob"], "75", RequestStatus.COMPLETED, "Travel", days_ago=1)
    get = lambda **k: c.get("/super-admin/expenses/claims", params=k).json()
    assert get(status="pending")["total"] == 1 and get(status="approved")["total"] == 1
    assert get(status="paid")["total"] == 1 and get(status="rejected")["total"] == 1
    assert get(organization_id=2)["total"] == 2
    assert get(category="travel")["total"] == 2  # case-insensitive
    assert get(currency="eur")["total"] == 1
    assert get(min_amount="80")["total"] == 2 and get(max_amount="80")["total"] == 2
    assert get(min_amount="60", max_amount="120")["total"] == 2
    assert get(q="AMY")["total"] == 2 and get(q="bob@example")["total"] == 2 and get(q="berlin")["total"] == 1
    assert get(q="nobody")["total"] == 0
    since = (datetime.utcnow() - timedelta(days=4)).isoformat()
    assert get(date_from=since)["total"] == 2
    assert get(date_to=since)["total"] == 2
    assert [x["amount"] for x in get(sort="amount", order="asc")["claims"]] == ["50.00", "75.00", "100.00", "500.00"]
    assert get(status="approved", organization_id=1, category="Travel", q="amy")["total"] == 1  # AND
    assert get(page=2, page_size=3)["claims"].__len__() == 1 and get(page=2, page_size=3)["total"] == 4
    assert c.get("/super-admin/expenses/claims", params={"status": "weird"}).status_code == 400
    assert c.get("/super-admin/expenses/claims", params={"sort": "nope"}).status_code == 400
    assert c.get("/super-admin/expenses/claims", params={"min_amount": "-1"}).status_code == 422


def test_claim_detail_with_receipts_and_approver(world):
    db, c, p = world["db"], world["c"], world["p"]
    req = TravelRequest(organization_id=1, employee_id=p["amy"].id, destination="Berlin", start_date=date.today(),
                        end_date=date.today(), status=RequestStatus.APPROVED)
    db.add(req)
    db.commit()
    db.add(TravelApproval(request_id=req.id, organization_id=1, approver_id=p["mgr"].id, approval_level=1,
                          status=RequestStatus.APPROVED))
    e = _claim(db, p["amy"], "99.90", RequestStatus.APPROVED, "Hotel", receipt="file:///etc/passwd", request_id=req.id)
    db.add(TravelReceipt(expense_id=e.id, organization_id=1, receipt_number="R-1", receipt_url="https://files.example.com/a.pdf",
                         amount=Decimal("99.90"), vendor_name="Hotel Berlin", expense_date=date.today(), verified=True))
    db.commit()
    listed = c.get("/super-admin/expenses/claims").json()["claims"][0]
    assert listed["approver"] == "Mia Manager"
    d = c.get(f"/super-admin/expenses/claims/{e.id}").json()
    assert d["receipt_url"] is None  # non-http(s) locations are never exposed
    assert d["receipts"] == [{"id": d["receipts"][0]["id"], "receipt_number": "R-1", "vendor": "Hotel Berlin",
                              "amount": "99.90", "expense_date": date.today().isoformat(), "verified": True,
                              "url": "https://files.example.com/a.pdf"}]
    assert d["has_receipt"] is True
    assert c.get("/super-admin/expenses/claims/9999").status_code == 404


def test_categories_list_is_distinct_and_real(world):
    db, p = world["db"], world["p"]
    _claim(db, p["amy"], "1", category="Travel")
    _claim(db, p["bob"], "1", category="Travel")
    _claim(db, p["bob"], "1", category="Meals")
    assert world["c"].get("/super-admin/expenses/categories").json()["categories"] == ["Meals", "Travel"]


# ───────────────────────── summary & currency ─────────────────────────

def test_summary_groups_by_currency_and_never_mixes(world):
    db, c, p = world["db"], world["c"], world["p"]
    _claim(db, p["amy"], "100.00", RequestStatus.APPROVED, currency="USD")
    _claim(db, p["amy"], "50.25", RequestStatus.PENDING, currency="USD")
    _claim(db, p["bob"], "200.00", RequestStatus.COMPLETED, currency="EUR")
    _claim(db, p["bob"], "10.00", RequestStatus.REJECTED, currency="EUR")
    _claim(db, p["bob"], "999.00", RequestStatus.CANCELLED, currency="EUR")
    s = c.get("/super-admin/expenses/summary").json()
    assert s["totals"]["USD"] == {"claimed": "150.25", "pending": "50.25", "approved": "100.00", "paid": "0.00", "rejected": "0.00"}
    assert s["totals"]["EUR"] == {"claimed": "210.00", "pending": "0.00", "approved": "0.00", "paid": "200.00", "rejected": "10.00"}
    assert set(s["totals"]) == {"USD", "EUR"}  # no combined total anywhere
    assert s["counts"] == {"pending": 1, "approved": 1, "paid": 1, "rejected": 1, "cancelled": 1} and s["claim_count"] == 5


def test_summary_respects_period_org_and_currency_filters(world):
    db, c, p = world["db"], world["c"], world["p"]
    _claim(db, p["amy"], "100", RequestStatus.APPROVED, days_ago=40)
    _claim(db, p["amy"], "20", RequestStatus.APPROVED, days_ago=2)
    _claim(db, p["bob"], "7", RequestStatus.APPROVED, days_ago=2)
    since = (datetime.utcnow() - timedelta(days=10)).isoformat()
    assert c.get("/super-admin/expenses/summary", params={"date_from": since}).json()["totals"]["USD"]["approved"] == "27.00"
    assert c.get("/super-admin/expenses/summary", params={"date_from": since, "organization_id": 1}).json()["totals"]["USD"]["approved"] == "20.00"
    assert c.get("/super-admin/expenses/summary", params={"currency": "EUR"}).json()["totals"] == {}


# ───────────────────────── budgets ─────────────────────────

def _budget(c, **over):
    today = date.today()
    body = {"organization_id": 1, "name": "Travel Q", "category": "Travel", "period_start": (today - timedelta(days=30)).isoformat(),
            "period_end": (today + timedelta(days=30)).isoformat(), "currency": "USD", "allocated_amount": "1000.00", **over}
    return c.post("/super-admin/expenses/budgets", json=body)


def test_budget_spent_matches_approved_claims_in_scope(world):
    db, c, p = world["db"], world["c"], world["p"]
    _claim(db, p["amy"], "300.00", RequestStatus.APPROVED, "Travel", days_ago=5)
    _claim(db, p["amy"], "200.00", RequestStatus.COMPLETED, "travel", days_ago=4)   # paid counts, case-insensitive
    _claim(db, p["amy"], "999.00", RequestStatus.PENDING, "Travel", days_ago=3)     # not approved: excluded
    _claim(db, p["amy"], "999.00", RequestStatus.REJECTED, "Travel", days_ago=3)    # rejected: excluded
    _claim(db, p["amy"], "400.00", RequestStatus.APPROVED, "Meals", days_ago=3)     # other category: excluded
    _claim(db, p["amy"], "77.00", RequestStatus.APPROVED, "Travel", "EUR", days_ago=3)  # other currency: excluded
    _claim(db, p["bob"], "555.00", RequestStatus.APPROVED, "Travel", days_ago=3)    # other organization: excluded
    _claim(db, p["amy"], "888.00", RequestStatus.APPROVED, "Travel", days_ago=90)   # outside the period: excluded
    r = _budget(c)
    assert r.status_code == 201, r.text
    b = r.json()
    assert (b["allocated"], b["spent"], b["remaining"]) == ("1000.00", "500.00", "500.00")
    assert b["utilization_pct"] == 50.0 and b["over_budget"] is False and b["organization_name"] == "Acme Ltd"
    assert c.get("/super-admin/expenses/budgets").json()["budgets"][0]["spent"] == "500.00"


def test_all_category_budget_and_over_budget_flag(world):
    db, c, p = world["db"], world["c"], world["p"]
    _claim(db, p["amy"], "700.00", RequestStatus.APPROVED, "Travel", days_ago=2)
    _claim(db, p["amy"], "500.00", RequestStatus.APPROVED, "Meals", days_ago=2)
    b = _budget(c, category=None, name="All").json()
    assert b["spent"] == "1200.00" and b["remaining"] == "-200.00" and b["over_budget"] is True
    assert b["utilization_pct"] == 120.0


def test_budget_period_end_is_inclusive(world):
    db, c, p = world["db"], world["c"], world["p"]
    today = date.today()
    _claim(db, p["amy"], "10.00", RequestStatus.APPROVED, "Travel", days_ago=0)
    b = _budget(c, period_start=(today - timedelta(days=5)).isoformat(), period_end=today.isoformat()).json()
    assert b["spent"] == "10.00"


def test_budget_validation_archive_and_audit(world):
    db, c = world["db"], world["c"]
    assert _budget(c, organization_id=999).status_code == 400
    assert _budget(c, period_start="2026-02-01", period_end="2026-01-01").status_code == 400
    assert _budget(c, allocated_amount="0").status_code == 422
    assert _budget(c, allocated_amount="-5").status_code == 422
    assert _budget(c, currency="US").status_code == 422
    b = _budget(c).json()
    assert [l.details["event"] for l in db.query(AuditLog).all()] == ["expenses.budget_created"]
    r = c.delete(f"/super-admin/expenses/budgets/{b['id']}")
    assert r.status_code == 200 and r.json()["already_archived"] is False
    assert c.get("/super-admin/expenses/budgets").json()["budgets"] == []
    assert db.query(ExpenseBudget).count() == 1  # archived, never hard-deleted
    assert c.delete(f"/super-admin/expenses/budgets/{b['id']}").json()["already_archived"] is True
    assert c.delete("/super-admin/expenses/budgets/9999").status_code == 404
    assert "expenses.budget_archived" in [l.details["event"] for l in db.query(AuditLog).all()]


def test_budgets_filter_by_org(world):
    c = world["c"]
    _budget(c, organization_id=1, name="A")
    _budget(c, organization_id=2, name="B")
    names = lambda **k: sorted(x["name"] for x in c.get("/super-admin/expenses/budgets", params=k).json()["budgets"])
    assert names() == ["A", "B"] and names(organization_id=2) == ["B"]


# ───────────────────────── authorization ─────────────────────────

def test_authorization(world):
    c, p = world["c"], world["p"]
    world["box"]["user"] = p["amy"]
    for method, path in [("get", "/claims"), ("get", "/claims/1"), ("get", "/summary"), ("get", "/budgets"),
                         ("get", "/categories"), ("post", "/budgets"), ("delete", "/budgets/1")]:
        r = getattr(c, method)("/super-admin/expenses" + path, **({"json": {}} if method == "post" else {}))
        assert r.status_code == 403, (method, path, r.status_code)


def test_router_is_guarded_and_real_dependency_rejects_org_roles():
    from app.core.dependencies import get_current_super_admin as real

    assert real in [d.dependency for d in expenses_router.router.dependencies]
    for role in (UserRole.ADMIN, UserRole.HR_ADMIN, UserRole.EMPLOYEE):
        with pytest.raises(ForbiddenException):
            real(current_user=Employee(email="x@example.com", role=role))
