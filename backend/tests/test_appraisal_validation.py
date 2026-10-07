"""The appraisal period and the other appraisal fields are checked, so "20214-2025" can never be saved."""

import pytest
from pydantic import ValidationError

from app.core.appraisal_period import normalize_appraisal_period
from app.modules.hr.schemas import AppraisalCreate, AppraisalUpdate


@pytest.mark.parametrize("raw,expected", [
    ("2024-2025", "2024-2025"), (" 2024 - 2025 ", "2024-2025"), ("2024–2025", "2024-2025"), ("2024/2025", "2024-2025"),
    ("2024-25", "2024-2025"), ("2025", "2025"), ("q1 2026", "Q1 2026"), ("H2-2025", "H2 2025"),
])
def test_valid_periods_are_accepted_and_written_one_way(raw, expected):
    assert normalize_appraisal_period(raw) == expected


@pytest.mark.parametrize("raw", [
    "20214-2025", "2024-20255", "2024-2026", "2025-2024", "2024-2024", "1999-2000", "2100-2101", "12345", "abc", "", "   ",
    "Q5 2026", "H3 2025", "2024-", "-2025", "2024-2025-2026", "Q1 20266",
])
def test_invalid_periods_are_rejected_with_a_helpful_message(raw):
    with pytest.raises(ValueError) as e:
        normalize_appraisal_period(raw)
    assert str(e.value)


def _base(**kw):
    return {"employee_id": 1, "cycle": "2024-2025", **kw}


def test_the_reported_value_is_refused_by_the_api_schema():
    with pytest.raises(ValidationError) as e:
        AppraisalCreate(**_base(cycle="20214-2025"))
    assert "not a valid" in str(e.value) or "valid" in str(e.value)
    with pytest.raises(ValidationError):
        AppraisalUpdate(cycle="20214-2025")
    assert AppraisalUpdate().cycle is None
    assert AppraisalCreate(**_base(cycle="2024-25")).cycle == "2024-2025"


def test_scores_hike_status_and_recommendation_are_bounded():
    for bad in ({"self_score": 5.1}, {"manager_score": -1}, {"final_score": 9}, {"salary_hike": 101}, {"salary_hike": -1},
                {"status": "done"}, {"recommendation": "fire"}):
        with pytest.raises(ValidationError):
            AppraisalCreate(**_base(**bad))
    ok = AppraisalCreate(**_base(self_score=4.5, salary_hike=12.5, status="Submitted", recommendation=""))
    assert ok.status == "submitted" and ok.recommendation is None


# ── through the real service
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.modules.hr import service
from app.modules.employee.models import Employee
from app.modules.hr.models import Organization, OrganizationStatus
from app.core.exceptions import BadRequestException


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine)()
    yield s
    s.close()
    engine.dispose()


def _emp(db, org, n):
    from datetime import date
    from app.modules.employee.models import EmploymentType, EmployeeStatus
    for oid in (1, 2):
        if not db.get(Organization, oid):
            db.add(Organization(id=oid, name=f"Org{oid}", status=OrganizationStatus.ACTIVE))
    db.commit()
    e = Employee(organization_id=org, first_name=f"E{n}", last_name="T", email=f"e{n}@t.test", employee_code=f"C{org}{n}", hashed_password="x",
                 job_title="t", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today())
    db.add(e)
    db.commit()
    return e


def test_the_service_rejects_other_org_people_self_review_and_duplicate_periods(db):
    a, b, other = _emp(db, 1, 1), _emp(db, 1, 2), _emp(db, 2, 3)
    service.create_appraisal(db, AppraisalCreate(**_base(employee_id=a.id, reviewer_id=b.id)), organization_id=1)
    with pytest.raises(BadRequestException):   # same period again (written differently)
        service.create_appraisal(db, AppraisalCreate(**_base(employee_id=a.id, cycle="2024-25")), organization_id=1)
    with pytest.raises(BadRequestException):   # reviewing themselves
        service.create_appraisal(db, AppraisalCreate(**_base(employee_id=a.id, cycle="2025", reviewer_id=a.id)), organization_id=1)
    with pytest.raises(BadRequestException):   # someone from another organization
        service.create_appraisal(db, AppraisalCreate(**_base(employee_id=other.id, cycle="2025")), organization_id=1)


def test_a_status_change_does_not_need_the_period_again_and_stamps_the_review_date(db):
    a = _emp(db, 1, 1)
    row = service.create_appraisal(db, AppraisalCreate(**_base(employee_id=a.id)), organization_id=1)
    out = service.update_appraisal(db, row.id, AppraisalUpdate(status="approved"), organization_id=1)
    assert out.cycle == "2024-2025" and out.reviewed_at is not None
