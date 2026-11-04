"""Seats per plan: Core includes 50 users, Advanced (and a trial) 250, Enterprise and organizations without a plan are not
limited. A seat is an enabled person who is not in a former status. Adding past the limit is refused on every write path
(the session guard), a reactivation counts as an add, and a move to a plan with fewer seats than in use is blocked."""
from datetime import date, datetime, timezone
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.main  # noqa: F401  (every model registered)
from app.database import Base
from app.modules.billing import seat_policy
from app.modules.billing.downgrade_blockers import detect_all_blockers, has_blocking_blockers
from app.modules.billing.models import (
    BillingClassification, BillingCycle, BillingMetric, BillingPlan, BillingSubscription, PlanCode, SubscriptionStatus, TaxCategory,
)
from app.modules.billing.seat_policy import SeatLimitExceeded
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import Organization, OrganizationStatus

CORE, ADV, ENT, TRIAL, NOPLAN = 1, 2, 3, 4, 5


@pytest.fixture
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine)()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    for oid in (CORE, ADV, ENT, TRIAL, NOPLAN):
        s.add(Organization(id=oid, name=f"org{oid}", organization_name=f"org{oid}", country="India", status=OrganizationStatus.ACTIVE))
    s.commit()
    plans = {}
    for code in (PlanCode.CORE, PlanCode.ADVANCED, PlanCode.ENTERPRISE):
        p = BillingPlan(code=code, name=code.value.title(), catalog_version="v1", billing_metric=BillingMetric.ACTIVE_WORKFORCE,
                        is_active=True, is_contract_priced=code == PlanCode.ENTERPRISE, monthly_price=10.0, annual_price=100.0,
                        currency="USD", tax_category=TaxCategory.SAAS_SUBSCRIPTION, published_at=now)
        s.add(p); s.commit(); plans[code] = p
    for oid, code in ((CORE, PlanCode.CORE), (ADV, PlanCode.ADVANCED), (ENT, PlanCode.ENTERPRISE)):
        s.add(BillingSubscription(organization_id=oid, plan_id=plans[code].id, plan_code=code, status=SubscriptionStatus.ACTIVE,
                                  billing_classification=BillingClassification.COMMERCIAL, billing_cycle=BillingCycle.MONTHLY))
    s.add(BillingSubscription(organization_id=TRIAL, status=SubscriptionStatus.EVALUATION,
                              billing_classification=BillingClassification.COMMERCIAL, billing_cycle=BillingCycle.MONTHLY))
    s.commit()
    s.plans = plans
    yield s
    s.rollback()
    s.close()
    engine.dispose()


_seq = iter(range(1, 10**6))


def _new(org, status=EmployeeStatus.ACTIVE, is_active=True, role=UserRole.EMPLOYEE):
    n = next(_seq)
    return Employee(email=f"p{n}@x.test", hashed_password="x", employee_code=f"E{n}", role=role, first_name="A", last_name="B",
                    job_title="t", employment_type=EmploymentType.FULL_TIME, status=status, date_of_joining=date.today(),
                    organization_id=org, is_active=is_active)


def _fill(db, org, n, **kw):
    people = [_new(org, **kw) for _ in range(n)]
    db.add_all(people)
    db.commit()
    return people


# ── limits per plan ─────────────────────────────────────────────────────────────────────────────────────────────────
def test_limits_per_plan(db):
    assert seat_policy.seat_limit(db, CORE) == 50
    assert seat_policy.seat_limit(db, ADV) == 250
    assert seat_policy.seat_limit(db, TRIAL) == 250
    assert seat_policy.seat_limit(db, ENT) is None
    assert seat_policy.seat_limit(db, NOPLAN) is None


def test_core_takes_exactly_50(db):
    _fill(db, CORE, 50)
    assert seat_policy.seats_in_use(db, CORE) == 50
    with pytest.raises(SeatLimitExceeded) as e:
        seat_policy.check_can_add(db, CORE)
    assert "Core plan includes 50 users and 50 are in use" in e.value.message


def test_guard_refuses_any_write_path_past_the_limit(db):
    _fill(db, CORE, 50)
    db.add(_new(CORE))
    with pytest.raises(SeatLimitExceeded):
        db.commit()
    db.rollback()
    assert seat_policy.seats_in_use(db, CORE) == 50


def test_one_flush_cannot_overshoot(db):
    _fill(db, CORE, 45)
    db.add_all([_new(CORE) for _ in range(6)])
    with pytest.raises(SeatLimitExceeded) as e:
        db.commit()
    assert "6 more people" in e.value.message
    db.rollback()
    _fill(db, CORE, 5)
    assert seat_policy.seats_in_use(db, CORE) == 50


def test_advanced_takes_250(db):
    _fill(db, ADV, 250)
    with pytest.raises(SeatLimitExceeded):
        _fill(db, ADV, 1)
    db.rollback()


def test_trial_previews_advanced(db):
    _fill(db, TRIAL, 250)
    with pytest.raises(SeatLimitExceeded):
        _fill(db, TRIAL, 1)
    db.rollback()


def test_enterprise_and_no_plan_are_not_limited(db):
    _fill(db, ENT, 300)
    _fill(db, NOPLAN, 300)
    assert seat_policy.seats_in_use(db, ENT) == 300


# ── what takes a seat ───────────────────────────────────────────────────────────────────────────────────────────────
def test_former_and_disabled_people_take_no_seat(db):
    _fill(db, CORE, 50)
    for status in (EmployeeStatus.TERMINATED, EmployeeStatus.RESIGNED, EmployeeStatus.INACTIVE,
                   EmployeeStatus.DEACTIVATED, EmployeeStatus.ARCHIVED):
        _fill(db, CORE, 1, status=status)
    _fill(db, CORE, 1, is_active=False)
    assert seat_policy.seats_in_use(db, CORE) == 50


def test_pending_invites_and_admins_take_seats(db):
    _fill(db, CORE, 49, status=EmployeeStatus.PENDING)
    _fill(db, CORE, 1, role=UserRole.ADMIN)
    with pytest.raises(SeatLimitExceeded):
        _fill(db, CORE, 1, status=EmployeeStatus.PENDING)
    db.rollback()


def test_reactivation_counts_as_an_add(db):
    _fill(db, CORE, 50)
    former = _fill(db, CORE, 1, status=EmployeeStatus.TERMINATED)[0]
    former.status = EmployeeStatus.ACTIVE
    with pytest.raises(SeatLimitExceeded):
        db.commit()
    db.rollback()
    disabled = _fill(db, CORE, 1, is_active=False)[0]
    disabled.is_active = True
    with pytest.raises(SeatLimitExceeded):
        db.commit()
    db.rollback()


def test_freeing_a_seat_lets_someone_in_and_a_swap_in_one_flush_is_fine(db):
    people = _fill(db, CORE, 50)
    people[0].status = EmployeeStatus.TERMINATED
    db.commit()
    _fill(db, CORE, 1)
    people[1].status = EmployeeStatus.RESIGNED
    db.add(_new(CORE))
    db.commit()
    assert seat_policy.seats_in_use(db, CORE) == 50


def test_over_limit_org_keeps_its_people_editable(db):
    """Data from before the rule (or a downgrade) stays: edits that add no seat are never refused."""
    _fill(db, NOPLAN, 60)
    db.add(BillingSubscription(organization_id=NOPLAN, plan_id=db.plans[PlanCode.CORE].id, plan_code=PlanCode.CORE,
                               status=SubscriptionStatus.ACTIVE, billing_classification=BillingClassification.COMMERCIAL))
    db.commit()
    person = db.query(Employee).filter(Employee.organization_id == NOPLAN).first()
    person.job_title = "Lead"
    person.status = EmployeeStatus.ON_LEAVE
    db.commit()
    person.status = EmployeeStatus.TERMINATED
    db.commit()
    with pytest.raises(SeatLimitExceeded):
        _fill(db, NOPLAN, 1)
    db.rollback()


# ── service entry points refuse before doing anything ───────────────────────────────────────────────────────────────
def test_create_employee_is_refused_up_front(db):
    from app.modules.employee import service
    from app.modules.employee.schema import EmployeeCreate

    _fill(db, CORE, 50)
    data = EmployeeCreate(email="new.person@example.com", first_name="N", last_name="P", job_title="t", date_of_joining=date.today())
    with patch.object(service, "_notify_email") as notify, pytest.raises(SeatLimitExceeded):
        service.create_employee(db, data, CORE)
    notify.assert_not_called()
    db.rollback()
    assert db.query(Employee).filter(Employee.email == "new.person@example.com").first() is None


def test_activate_user_is_refused_at_the_limit(db):
    from app.modules.employee import service

    _fill(db, CORE, 50)
    former = _fill(db, CORE, 1, status=EmployeeStatus.DEACTIVATED, is_active=False)[0]
    with patch.object(service, "_notify_email") as notify, pytest.raises(SeatLimitExceeded):
        service.activate_organization_user(db, former.id, CORE, updated_by_id=None)
    notify.assert_not_called()


# ── plan moves ──────────────────────────────────────────────────────────────────────────────────────────────────────
def test_downgrade_to_core_blocked_when_over_50(db):
    _fill(db, ADV, 60)
    blockers = [b for b in detect_all_blockers(db, ADV, "core") if b.category == "seats"]
    assert blockers and blockers[0].severity == "blocking"
    assert "includes 50 users, but your organization has 60" in blockers[0].message
    assert has_blocking_blockers(blockers)
    with pytest.raises(SeatLimitExceeded):
        seat_policy.check_plan_fits(db, ADV, PlanCode.CORE)


def test_downgrade_to_core_allowed_at_50(db):
    _fill(db, ADV, 50)
    assert not [b for b in detect_all_blockers(db, ADV, "core") if b.category == "seats"]
    seat_policy.check_plan_fits(db, ADV, "core")
    seat_policy.check_plan_fits(db, ADV, "enterprise")


def test_usage_for_the_organization_page(db):
    _fill(db, CORE, 12)
    _fill(db, CORE, 3, status=EmployeeStatus.TERMINATED)
    assert seat_policy.usage(db, CORE) == {"plan": "core", "seat_limit": 50, "seats_used": 12, "seats_remaining": 38}
    assert seat_policy.usage(db, ENT)["seat_limit"] is None
