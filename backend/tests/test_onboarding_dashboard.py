"""The Onboarding Dashboard counts the same people everywhere, and its charts add up."""

from datetime import date, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.modules.hr import service
from app.modules.hr.models import Department, OnboardingNewHire, Organization, OrganizationStatus


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine)()
    s.add_all([Organization(id=1, name="A", status=OrganizationStatus.ACTIVE), Organization(id=2, name="B", status=OrganizationStatus.ACTIVE)])
    s.add_all([Department(id=1, name="Management", code="MGT", organization_id=1), Department(id=2, name="Engineering", code="ENG", organization_id=1)])
    s.commit()
    yield s
    s.close()
    engine.dispose()


def _hire(db, n, status="in_progress", dept=None, joining=None, org=1, deleted=False):
    db.add(OnboardingNewHire(organization_id=org, candidate_name=f"H{n}", email=f"h{n}@x.com", position="Dev", department_id=dept,
                             joining_date=joining, status=status, is_deleted=deleted))
    db.commit()


def test_an_empty_organization_shows_zeros_and_twelve_empty_months_not_invented_numbers(db):
    d = service.get_onboarding_dashboard(db, organization_id=1)
    assert d["totalNewHires"] == 0 and d["departmentWise"] == [] and d["upcomingJoiners"] == []
    assert len(d["monthlyJoiningTrend"]) == 12 and all(m["count"] == 0 for m in d["monthlyJoiningTrend"])
    assert d["completionStatus"]["total"] == 0


def test_the_statuses_department_bars_and_total_all_agree(db):
    today = date.today()
    _hire(db, 1, "completed", dept=1)
    _hire(db, 2, "in_progress", dept=1)
    _hire(db, 3, "offer_sent", dept=2)
    _hire(db, 4, "pre_joining", dept=None)         # no department
    _hire(db, 5, "cancelled", dept=2)
    _hire(db, 6, "in_progress", dept=2, deleted=True)   # deleted: counted nowhere
    _hire(db, 7, "in_progress", dept=1, org=2)          # another organization: counted nowhere
    d = service.get_onboarding_dashboard(db, organization_id=1)
    cs = d["completionStatus"]
    assert d["totalNewHires"] == 5
    assert (cs["completed"], cs["in_progress"], cs["not_started"], cs["cancelled"]) == (1, 1, 2, 1)
    assert cs["completed"] + cs["in_progress"] + cs["not_started"] + cs["cancelled"] == d["totalNewHires"]
    assert d["pendingOnboarding"] == 3 and d["completedOnboarding"] == 1
    assert sum(r["count"] for r in d["departmentWise"]) == d["totalNewHires"]
    assert {r["department"]: r["count"] for r in d["departmentWise"]} == {"Management": 2, "Engineering": 2, "Unassigned": 1}
    assert d["departmentWise"][0]["count"] >= d["departmentWise"][-1]["count"]
    assert d["assetsPending"] is None and d["trainingPending"] is None


def test_the_joining_trend_is_by_joining_month_and_ignores_cancelled(db):
    today = date.today()
    _hire(db, 1, joining=today)
    _hire(db, 2, joining=today)
    _hire(db, 3, joining=today, status="cancelled")
    _hire(db, 4, joining=today - timedelta(days=400))   # outside the 12 months
    d = service.get_onboarding_dashboard(db, organization_id=1)
    trend = d["monthlyJoiningTrend"]
    assert trend[-1] == {"month": f"{today.year:04d}-{today.month:02d}", "count": 2}
    assert sum(m["count"] for m in trend) == 2
    assert [m["month"] for m in trend] == sorted(m["month"] for m in trend)


def test_upcoming_joiners_exclude_cancelled_and_past_dates(db):
    today = date.today()
    _hire(db, 1, joining=today + timedelta(days=3))
    _hire(db, 2, joining=today + timedelta(days=1), status="cancelled")
    _hire(db, 3, joining=today - timedelta(days=3))
    assert [j["name"] for j in service.get_onboarding_dashboard(db, 1)["upcomingJoiners"]] == ["H1"]


def test_last_months_wraps_the_year():
    assert service._last_months(3, date(2026, 1, 15)) == ["2025-11", "2025-12", "2026-01"]
