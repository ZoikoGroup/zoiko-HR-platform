"""Two completed Checkouts for one organization must never leave the customer with two paid subscriptions."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.modules.billing import webhook_service as ws
from app.modules.billing.models import ProviderRef
from app.modules.hr.models import Organization, OrganizationStatus


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add(Organization(id=1, name="Acme", status=OrganizationStatus.ACTIVE))
    s.commit()
    yield s
    s.close()
    engine.dispose()


def _ref(db, sub="sub_first"):
    db.add(ProviderRef(organization_id=1, stripe_customer_id="cus_1", stripe_subscription_id=sub))
    db.commit()


def test_first_checkout_is_never_treated_as_a_duplicate(db, monkeypatch):
    monkeypatch.setattr(ws, "cancel_and_refund_duplicate_subscription", lambda sid: pytest.fail("must not cancel"))
    assert ws._handle_duplicate_checkout(db, 1, "sub_first") is None   # no provider ref yet
    _ref(db)
    assert ws._handle_duplicate_checkout(db, 1, "sub_first") is None   # the same subscription again (webhook retry)
    assert ws._handle_duplicate_checkout(db, 1, None) is None


def test_a_second_active_subscription_is_cancelled_and_refunded(db, monkeypatch):
    _ref(db)
    cancelled = []
    monkeypatch.setattr(ws, "retrieve_subscription", lambda sid: {"id": sid, "status": "active"})
    monkeypatch.setattr(ws, "cancel_and_refund_duplicate_subscription", lambda sid: cancelled.append(sid) or {"cancelled": sid, "refund_id": "re_1"})
    out = ws._handle_duplicate_checkout(db, 1, "sub_second")
    assert cancelled == ["sub_second"]
    assert out["status"] == "duplicate_cancelled" and out["refund_id"] == "re_1"
    assert db.query(ProviderRef).one().stripe_subscription_id == "sub_first", "the organization keeps its original subscription"


def test_a_new_checkout_replaces_a_subscription_that_has_already_ended(db, monkeypatch):
    _ref(db)
    monkeypatch.setattr(ws, "retrieve_subscription", lambda sid: {"id": sid, "status": "canceled"})
    monkeypatch.setattr(ws, "cancel_and_refund_duplicate_subscription", lambda sid: pytest.fail("a legitimate re-subscribe must not be cancelled"))
    assert ws._handle_duplicate_checkout(db, 1, "sub_second") is None


def test_if_stripe_cannot_be_asked_nothing_is_cancelled(db, monkeypatch):
    _ref(db)

    def boom(_):
        raise RuntimeError("stripe down")

    monkeypatch.setattr(ws, "retrieve_subscription", boom)
    monkeypatch.setattr(ws, "cancel_and_refund_duplicate_subscription", lambda sid: pytest.fail("must not cancel on uncertainty"))
    assert ws._handle_duplicate_checkout(db, 1, "sub_second") is None


def test_a_failed_automatic_cancel_is_reported_not_swallowed(db, monkeypatch):
    _ref(db)
    monkeypatch.setattr(ws, "retrieve_subscription", lambda sid: {"id": sid, "status": "active"})

    def fail(_):
        raise RuntimeError("stripe refused")

    monkeypatch.setattr(ws, "cancel_and_refund_duplicate_subscription", fail)
    out = ws._handle_duplicate_checkout(db, 1, "sub_second")
    assert out["status"] == "error" and "manual" not in out["message"].lower() or "could not be cancelled" in out["message"]
