"""
tests/test_evaluation_reminders.py
------------------------------------
Task 1 (ZHR-COM-ENT-001 §8.1): 7-day and 2-day reminder emails must each send
exactly once per evaluation, guarded by reminder_7d_sent_at/reminder_2d_sent_at
so a scheduler restart never double-sends. The "expired" email fires from
inside expire_overdue_evaluations() itself, not from the reminder sweep.

Follows the same in-memory-sqlite pattern as test_evaluation_expiry.py.
"""

from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.modules.billing import service as billing_service


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    engine.dispose()


def _org(db, org_id: int):
    from app.modules.hr.models import Organization, OrganizationStatus
    org = Organization(id=org_id, name=f"Org {org_id}", status=OrganizationStatus.APPROVED)
    db.add(org)
    db.flush()
    return org


class TestSevenDayReminder:
    def test_sends_once_when_in_window(self, db):
        _org(db, 1)
        evaluation = billing_service.start_evaluation(
            db, organization_id=1,
            evaluation_ends_at=datetime.utcnow() + timedelta(days=7),
            conversion_owner="owner-1@z.test",
        )

        with patch("app.services.email_service.send_evaluation_7_days_remaining") as mock_send:
            result = billing_service.send_evaluation_reminders(db)

        assert result["sent_7d"] == 1
        mock_send.assert_called_once()
        args, kwargs = mock_send.call_args
        assert args[0] == "owner-1@z.test"

        db.refresh(evaluation)
        assert evaluation.reminder_7d_sent_at is not None

    def test_does_not_double_send_on_second_sweep(self, db):
        _org(db, 2)
        billing_service.start_evaluation(
            db, organization_id=2,
            evaluation_ends_at=datetime.utcnow() + timedelta(days=7),
            conversion_owner="owner-2@z.test",
        )

        with patch("app.services.email_service.send_evaluation_7_days_remaining") as mock_send:
            billing_service.send_evaluation_reminders(db)
            billing_service.send_evaluation_reminders(db)

        assert mock_send.call_count == 1

    def test_outside_window_is_untouched(self, db):
        _org(db, 3)
        billing_service.start_evaluation(
            db, organization_id=3,
            evaluation_ends_at=datetime.utcnow() + timedelta(days=13),  # far from 7d window
            conversion_owner="owner-3@z.test",
        )

        with patch("app.services.email_service.send_evaluation_7_days_remaining") as mock_send:
            result = billing_service.send_evaluation_reminders(db)

        assert result["sent_7d"] == 0
        mock_send.assert_not_called()

    def test_no_conversion_owner_is_a_noop(self, db):
        _org(db, 4)
        billing_service.start_evaluation(
            db, organization_id=4,
            evaluation_ends_at=datetime.utcnow() + timedelta(days=7),
            conversion_owner=None,
        )

        with patch("app.services.email_service.send_evaluation_7_days_remaining") as mock_send:
            result = billing_service.send_evaluation_reminders(db)

        # Still counted as "handled" (reminder column set) even with no
        # recipient — a missing conversion_owner must not cause a retry loop.
        assert result["sent_7d"] == 1
        mock_send.assert_not_called()


class TestTwoDayReminder:
    def test_sends_once_when_in_window(self, db):
        _org(db, 5)
        evaluation = billing_service.start_evaluation(
            db, organization_id=5,
            evaluation_ends_at=datetime.utcnow() + timedelta(days=2),
            conversion_owner="owner-5@z.test",
        )

        with patch("app.services.email_service.send_evaluation_2_days_remaining") as mock_send:
            result = billing_service.send_evaluation_reminders(db)

        assert result["sent_2d"] == 1
        mock_send.assert_called_once()
        db.refresh(evaluation)
        assert evaluation.reminder_2d_sent_at is not None

    def test_both_windows_can_fire_independently(self, db):
        """An evaluation exactly at the 7-day mark and another at the 2-day
        mark in the same sweep must each get their own, independent email."""
        _org(db, 6)
        _org(db, 7)
        billing_service.start_evaluation(
            db, organization_id=6, evaluation_ends_at=datetime.utcnow() + timedelta(days=7),
            conversion_owner="owner-6@z.test",
        )
        billing_service.start_evaluation(
            db, organization_id=7, evaluation_ends_at=datetime.utcnow() + timedelta(days=2),
            conversion_owner="owner-7@z.test",
        )

        with patch("app.services.email_service.send_evaluation_7_days_remaining") as mock_7d, \
             patch("app.services.email_service.send_evaluation_2_days_remaining") as mock_2d:
            result = billing_service.send_evaluation_reminders(db)

        assert result == {"sent_7d": 1, "sent_2d": 1}
        mock_7d.assert_called_once()
        mock_2d.assert_called_once()


class TestExpiredEmailFiresFromExpiryJobOnly:
    def test_expired_email_sent_from_expire_overdue_evaluations(self, db):
        _org(db, 8)
        billing_service.start_evaluation(
            db, organization_id=8,
            evaluation_ends_at=datetime.utcnow() - timedelta(days=1),
            conversion_owner="owner-8@z.test",
        )

        with patch("app.services.email_service.send_evaluation_expired") as mock_expired:
            billing_service.expire_overdue_evaluations(db)

        mock_expired.assert_called_once()

    def test_reminder_sweep_never_sends_expired_email(self, db):
        """The reminder sweep (7d/2d only) must never call the expired sender
        — that's expire_overdue_evaluations()'s job exclusively, per the
        no-duplicate-query instruction."""
        _org(db, 9)
        billing_service.start_evaluation(
            db, organization_id=9,
            evaluation_ends_at=datetime.utcnow() + timedelta(days=7),
            conversion_owner="owner-9@z.test",
        )

        with patch("app.services.email_service.send_evaluation_expired") as mock_expired, \
             patch("app.services.email_service.send_evaluation_7_days_remaining"):
            billing_service.send_evaluation_reminders(db)

        mock_expired.assert_not_called()
