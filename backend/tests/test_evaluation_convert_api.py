"""
tests/test_evaluation_convert_api.py
------------------------------------
POST /billing/evaluations/{id}/convert over HTTP, exactly as the Super Admin
Evaluations & Trials page calls it (commercial_effective_at is a `...Z` ISO
string from `Date.toISOString()`).

Regression: the tz-aware timestamp was compared with a naive utcnow() and blew up
as an unhandled 500 ("Something went wrong on the server"), leaving the
evaluation unconverted.
"""

import pathlib
import sys
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from app.core.dependencies import get_current_user
from app.core.exceptions import ZoikoException, generic_exception_handler, zoiko_exception_handler
from app.database import Base, get_db
from app.modules.billing import service as billing_service
from app.modules.billing.models import (
    BillingAuditAction,
    BillingAuditLog,
    BillingClassification,
    BillingConversion,
    BillingMetric,
    BillingPlan,
    BillingSubscription,
    EvaluationStatus,
    OrganizationEvaluation,
    PlanCode,
    SubscriptionStatus,
    TaxCategory,
)
from app.modules.billing.router import billing_router
from app.modules.hr.models import Organization, OrganizationStatus


class _Caller:
    def __init__(self, role="super_admin", org_id=None):
        self.email = "root@zoiko.test"
        self.organization_id = org_id
        self.role = role
        self.id = None


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine)()

    app = FastAPI()
    app.include_router(billing_router)
    app.add_exception_handler(ZoikoException, zoiko_exception_handler)
    app.add_exception_handler(Exception, generic_exception_handler)
    box = {"user": _Caller()}

    def _db():
        yield s

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_current_user] = lambda: box["user"]

    with TestClient(app, raise_server_exceptions=False) as c:
        c.db, c.box = s, box
        yield c
    s.close()
    engine.dispose()


def _seed(db):
    org = Organization(id=1, name="Trial Org", status=OrganizationStatus.APPROVED)
    db.add(org)
    db.flush()
    evaluation = billing_service.start_evaluation(
        db, organization_id=1,
        evaluation_ends_at=datetime.utcnow() + timedelta(days=10),
        conversion_owner="owner@z.test",
    )
    plan = BillingPlan(
        code=PlanCode.CORE, name="Core", catalog_version="ZHR-COM-BILL-001-v1",
        billing_metric=BillingMetric.ACTIVE_WORKFORCE, is_active=True,
        is_contract_priced=False, monthly_price=10.0, annual_price=100.0,
        currency="USD", tax_category=TaxCategory.SAAS_SUBSCRIPTION,
    )
    db.add(plan)
    db.commit()
    return evaluation, plan


def _payload(plan, **over):
    body = {
        "plan_id": plan.id,
        "billing_cycle": "monthly",
        "quantity_basis": "25 active employees",
        # what Date.toISOString() sends from the browser
        "commercial_effective_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "approver": "CFO",
    }
    body.update(over)
    return body


class TestConvertEvaluationApi:
    def test_success_with_browser_style_utc_timestamp(self, client):
        ev, plan = _seed(client.db)
        r = client.post(f"/billing/evaluations/{ev.id}/convert", json=_payload(plan))
        assert r.status_code == 200, r.text

        client.db.expire_all()
        assert client.db.get(OrganizationEvaluation, ev.id).status == EvaluationStatus.CONVERTED
        sub = client.db.query(BillingSubscription).filter_by(organization_id=1).one()
        assert sub.billing_classification == BillingClassification.COMMERCIAL
        assert sub.status == SubscriptionStatus.ACTIVE
        assert sub.plan_code == PlanCode.CORE
        assert client.db.query(BillingConversion).count() == 1

    def test_audit_entry_records_from_and_to(self, client):
        ev, plan = _seed(client.db)
        r = client.post(f"/billing/evaluations/{ev.id}/convert", json=_payload(plan))
        assert r.status_code == 200, r.text
        log = (client.db.query(BillingAuditLog)
               .filter_by(action=BillingAuditAction.EVALUATION_CONVERTED).one())
        assert log.actor_email == "root@zoiko.test"
        assert log.before["evaluation_status"] == "active"
        assert log.after["evaluation_status"] == "converted"
        assert log.after["billing_classification"] == "commercial"
        assert log.after["plan_code"] == "core"

    def test_already_converted_is_a_clear_400(self, client):
        ev, plan = _seed(client.db)
        assert client.post(f"/billing/evaluations/{ev.id}/convert", json=_payload(plan)).status_code == 200
        r = client.post(f"/billing/evaluations/{ev.id}/convert", json=_payload(plan))
        assert r.status_code == 400
        assert "already" in r.json()["message"].lower()

    def test_back_dated_without_agreement_is_a_400_not_a_500(self, client):
        ev, plan = _seed(client.db)
        old = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat().replace("+00:00", "Z")
        r = client.post(f"/billing/evaluations/{ev.id}/convert",
                        json=_payload(plan, commercial_effective_at=old))
        assert r.status_code == 400
        assert "signed_agreement_reference" in r.json()["message"]

    def test_blank_approver_and_quantity_rejected(self, client):
        ev, plan = _seed(client.db)
        r = client.post(f"/billing/evaluations/{ev.id}/convert",
                        json=_payload(plan, approver="  ", quantity_basis=""))
        assert r.status_code == 422

    def test_unknown_plan_is_a_404(self, client):
        ev, plan = _seed(client.db)
        r = client.post(f"/billing/evaluations/{ev.id}/convert", json=_payload(plan, plan_id=9999))
        assert r.status_code == 404

    def test_non_owner_is_forbidden_and_nothing_changes(self, client):
        ev, plan = _seed(client.db)
        client.box["user"] = _Caller(role="employee", org_id=1)
        r = client.post(f"/billing/evaluations/{ev.id}/convert", json=_payload(plan))
        assert r.status_code == 403
        client.db.expire_all()
        assert client.db.get(OrganizationEvaluation, ev.id).status == EvaluationStatus.ACTIVE
