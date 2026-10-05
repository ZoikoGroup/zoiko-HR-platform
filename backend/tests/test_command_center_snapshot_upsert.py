"""
tests/test_command_center_snapshot_upsert.py
----------------------------------------------
Regression: loading the Command Center overview and the Commercial Health
trend in parallel used to race — both requests saw "no snapshot row for
today", both INSERTed, and the loser blew up with
UniqueViolation on ix_super_admin_daily_snapshots_snapshot_date. The write
is now an atomic ON CONFLICT DO UPDATE upsert, so repeat and concurrent
calls update the single row for the day instead of failing.
"""

from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.modules.super_admin.command_center_models import PlatformDailySnapshot
from app.modules.super_admin.command_center_router import (
    _compute_platform_totals, _get_or_create_today_snapshot,
)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    engine.dispose()


class TestTodaySnapshotUpsert:
    def test_first_call_creates_row(self, db):
        snap = _get_or_create_today_snapshot(db)
        assert snap.id is not None
        assert snap.snapshot_date == date.today()
        assert db.query(PlatformDailySnapshot).count() == 1

    def test_second_call_updates_instead_of_raising(self, db):
        first = _get_or_create_today_snapshot(db)
        second = _get_or_create_today_snapshot(db)
        assert second.id == first.id
        assert db.query(PlatformDailySnapshot).count() == 1

    def test_repeat_calls_track_live_totals(self, db):
        from app.modules.hr.models import Organization, OrganizationStatus

        _get_or_create_today_snapshot(db)
        db.add(Organization(name="Acme", status=OrganizationStatus.APPROVED))
        db.commit()

        snap = _get_or_create_today_snapshot(db)
        expected = _compute_platform_totals(db)
        assert snap.total_organizations == expected["total_organizations"]
        assert snap.active_organizations == expected["active_organizations"]
        assert db.query(PlatformDailySnapshot).count() == 1

    def test_two_sessions_do_not_collide_on_same_day(self, db):
        """Second session simulates the concurrent request that lost the race."""
        _get_or_create_today_snapshot(db)

        Session = sessionmaker(bind=db.get_bind())
        other = Session()
        try:
            snap = _get_or_create_today_snapshot(other)
            assert snap.snapshot_date == date.today()
        finally:
            other.close()
        assert db.query(PlatformDailySnapshot).count() == 1