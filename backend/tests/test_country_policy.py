"""Countries per plan: Core covers one country (the organization's registered country, one of the five configured),
Advanced (and a trial) the five configured countries (US, UK, India, Canada, Australia), Enterprise and organizations
without a plan are not limited. Existing records stay as they are; only a newly set or changed country is checked, and
a downgrade that would strand people in a country the target plan does not cover is blocked."""
from datetime import date, datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.main  # noqa: F401  (every model registered)
from app.core.exceptions import BadRequestException
from app.database import Base
from app.modules.billing import country_policy
from app.modules.billing.downgrade_blockers import detect_all_blockers
from app.modules.billing.models import (
    BillingClassification, BillingCycle, BillingMetric, BillingPlan, BillingSubscription, PlanCode, SubscriptionStatus, TaxCategory,
)
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import Organization, OrganizationStatus

CORE, ADV, ENT, TRIAL, NOPLAN, CORE_NOWHERE = 1, 2, 3, 4, 5, 6


@pytest.fixture
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine)()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    for oid, country in ((CORE, "India"), (ADV, "US"), (ENT, "Germany"), (TRIAL, "United Kingdom"), (NOPLAN, "Germany"), (CORE_NOWHERE, "Germany")):
        s.add(Organization(id=oid, name=f"org{oid}", organization_name=f"org{oid}", country=country, status=OrganizationStatus.ACTIVE))
    s.commit()
    plans = {}
    for code in (PlanCode.CORE, PlanCode.ADVANCED, PlanCode.ENTERPRISE):
        p = BillingPlan(code=code, name=code.value.title(), catalog_version="v1", billing_metric=BillingMetric.ACTIVE_WORKFORCE,
                        is_active=True, is_contract_priced=code == PlanCode.ENTERPRISE, monthly_price=10.0, annual_price=100.0,
                        currency="USD", tax_category=TaxCategory.SAAS_SUBSCRIPTION, published_at=now)
        s.add(p); s.commit(); plans[code] = p
    for oid, code in ((CORE, PlanCode.CORE), (ADV, PlanCode.ADVANCED), (ENT, PlanCode.ENTERPRISE), (CORE_NOWHERE, PlanCode.CORE)):
        s.add(BillingSubscription(organization_id=oid, plan_id=plans[code].id, plan_code=code, status=SubscriptionStatus.ACTIVE,
                                  billing_classification=BillingClassification.COMMERCIAL, billing_cycle=BillingCycle.MONTHLY))
    s.add(BillingSubscription(organization_id=TRIAL, status=SubscriptionStatus.EVALUATION,
                              billing_classification=BillingClassification.COMMERCIAL, billing_cycle=BillingCycle.MONTHLY))
    s.commit()
    s.plans = plans
    yield s
    s.close()
    engine.dispose()


def _emp(db, org, email, country=None, work_country=None, role=UserRole.EMPLOYEE, status=EmployeeStatus.ACTIVE):
    e = Employee(email=email, hashed_password="x", employee_code=f"E-{email}"[:20], role=role, first_name="A", last_name="B",
                 job_title="t", employment_type=EmploymentType.FULL_TIME, status=status, date_of_joining=date.today(),
                 organization_id=org, country=country, work_country=work_country, is_active=True)
    db.add(e); db.commit()
    return e


# ── which countries each plan allows ────────────────────────────────────────────────────────────────────────────────
def test_allowed_countries_per_plan(db):
    assert country_policy.allowed_countries(db, CORE) == {"IN"}
    assert country_policy.allowed_countries(db, ADV) == {"US", "GB", "IN", "CA", "AU"}
    assert country_policy.allowed_countries(db, TRIAL) == {"US", "GB", "IN", "CA", "AU"}
    assert country_policy.allowed_countries(db, ENT) is None
    assert country_policy.allowed_countries(db, NOPLAN) is None
    assert country_policy.allowed_countries(db, CORE_NOWHERE) == frozenset()  # registered outside the five


def test_core_allows_only_its_registered_country(db):
    country_policy.check_country(db, CORE, "India")
    country_policy.check_country(db, CORE, "Bengaluru, India")
    with pytest.raises(BadRequestException) as e:
        country_policy.check_country(db, CORE, "United Kingdom")
    assert "Core plan covers one country (India)" in e.value.message and "Upgrade to Advanced" in e.value.message


def test_advanced_allows_the_five_only(db):
    for c in ("US", "United Kingdom", "India", "Canada", "Australia"):
        country_policy.check_country(db, ADV, c)
    with pytest.raises(BadRequestException) as e:
        country_policy.check_country(db, ADV, "DE")
    assert "Enterprise" in e.value.message


def test_enterprise_and_no_plan_are_not_limited(db):
    country_policy.check_country(db, ENT, "Germany")
    country_policy.check_country(db, NOPLAN, "Japan")


def test_core_registered_outside_the_five_is_told_to_fix_the_country(db):
    with pytest.raises(BadRequestException) as e:
        country_policy.check_country(db, CORE_NOWHERE, "Germany")
    assert "registered country" in e.value.message and "Organization settings" in e.value.message


def test_existing_records_stay_editable_and_free_text_is_not_guessed(db):
    country_policy.check_country(db, CORE, "Germany", previous="DE")      # unchanged out-of-plan value: allowed
    country_policy.check_country(db, CORE, "Flat 4, Some Street")           # names no country: nothing to check


# ── the write paths ─────────────────────────────────────────────────────────────────────────────────────────────────
def test_employee_update_refuses_a_new_out_of_plan_country(db):
    from app.modules.employee.schema import EmployeeUpdate
    from app.modules.employee.service import update_employee
    e = _emp(db, CORE, "a@example.com", country="India")
    with pytest.raises(BadRequestException):
        update_employee(db, e.id, EmployeeUpdate(country="United Kingdom"), organization_id=CORE)
    db.rollback()
    update_employee(db, e.id, EmployeeUpdate(country="India", first_name="Z"), organization_id=CORE)
    legacy = _emp(db, CORE, "b@example.com", country="Germany")             # predates the rule
    update_employee(db, legacy.id, EmployeeUpdate(country="Germany", first_name="Kept"), organization_id=CORE)


def test_legal_entity_and_jurisdiction(db):
    from fastapi import HTTPException  # noqa: F401
    from app.modules.doc_templates import entities
    admin = _emp(db, CORE, "admin@example.com", role=UserRole.ADMIN)
    with pytest.raises(BadRequestException) as e:
        entities.create_entity(db, admin, {"legal_name": "Acme UK Ltd", "country": "GB"})
    assert "legal entity's country" in e.value.message
    db.rollback()
    worker = _emp(db, CORE, "w@example.com", work_country="IN")
    hr = _emp(db, CORE, "hr@example.com", role=UserRole.HR_ADMIN)
    with pytest.raises(BadRequestException):
        entities.update_jurisdiction(db, hr, worker, {"work_country": "GB"})


def test_offer_country_is_checked_and_a_default_never_refused(db):
    from app.modules.hr.models import RecruitmentCandidate
    from app.modules.hr.recruitment_service import _apply_offer_pay_rules
    with pytest.raises(BadRequestException):
        _apply_offer_pay_rules(db, {"work_country": "GB", "employment_type": "full_time"}, CORE)
    cand = RecruitmentCandidate(organization_id=CORE, name="C", email="c@example.com", position="Engineer", location="London, UK")
    db.add(cand); db.commit()
    values = _apply_offer_pay_rules(db, {"candidate_id": cand.id, "employment_type": "full_time"}, CORE)
    assert values["work_country"] == "IN"  # the candidate's location is outside the plan: the org's country is used


def test_core_org_cannot_switch_country_while_people_are_elsewhere(db):
    from app.modules.hr.schemas import OrganizationUpdate
    from app.modules.hr.service import update_organization
    _emp(db, CORE, "in@example.com", work_country="IN")
    with pytest.raises(BadRequestException) as e:
        update_organization(db, CORE, OrganizationUpdate(country="United Kingdom"))
    assert "India" in e.value.message
    with pytest.raises(BadRequestException):
        update_organization(db, CORE, OrganizationUpdate(country="Germany"))  # not one of the five


# ── downgrades ──────────────────────────────────────────────────────────────────────────────────────────────────────
def _country_blockers(db, org, target):
    return [b for b in detect_all_blockers(db, org, target) if b.category == "countries"]


def test_downgrade_to_core_is_blocked_while_more_than_one_country_is_used(db):
    db.query(Organization).filter(Organization.id == ADV).update({"country": "India"}); db.commit()
    _emp(db, ADV, "x@example.com", work_country="IN")
    assert _country_blockers(db, ADV, "core") == []
    _emp(db, ADV, "y@example.com", work_country="GB")
    blockers = _country_blockers(db, ADV, "core")
    assert len(blockers) == 1 and blockers[0].severity == "blocking" and "United Kingdom" in blockers[0].message


def test_former_employees_do_not_count(db):
    db.query(Organization).filter(Organization.id == ADV).update({"country": "India"}); db.commit()
    _emp(db, ADV, "gone@example.com", work_country="GB", status=EmployeeStatus.TERMINATED)
    assert _country_blockers(db, ADV, "core") == []


def test_an_upgrade_is_never_blocked_by_data_from_before_the_rule(db):
    _emp(db, CORE, "legacy@example.com", work_country="DE")
    assert _country_blockers(db, CORE, "advanced") == []


def test_import_reports_and_skips_rows_outside_the_plan(db):
    from app.modules.employee.service import import_employees_from_file
    admin = _emp(db, CORE, "boss@example.com", role=UserRole.ADMIN)
    csv = ("first_name,last_name,email,job_title,date_of_joining,country\n"
           "Asha,Rao,asha@example.com,Engineer,2026-01-05,India\n"
           "Ben,Ito,ben@example.com,Engineer,2026-01-05,United Kingdom\n").encode()
    result = import_employees_from_file(db, csv, "people.csv", CORE, admin.id, admin)
    country_errors = [e for e in result["errors"] if e.get("field") == "country"]
    assert len(country_errors) == 1 and country_errors[0]["email"] == "ben@example.com", result["errors"]
    assert db.query(Employee).filter(Employee.email == "asha@example.com").first() is not None
    assert db.query(Employee).filter(Employee.email == "ben@example.com").first() is None
