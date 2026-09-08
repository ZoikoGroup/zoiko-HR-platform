"""
tests/test_commercial_exceptions.py
-------------------------------------
ZHR-COM-ENT-001 §19.1 — time-bound commercial exception entitlements.

Covers:
  - request: key/mode/window validation, subscription requirement, overlap guard
  - approve: ACTIVE transition, same-actor rejection, non-pending + past-expiry guards
  - reject / revoke: state transitions + guards
  - expire_overdue_exceptions: scheduler flip ACTIVE -> EXPIRED
  - resolver contract: exception effective state in check_entitlement() +
    compute_entitlement_snapshot(), delinquency-gate precedence, AI hard-block
  - HTTP: request/approve/list e2e over billing_router with RBAC
"""

import sys
import pathlib
from datetime import datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from app.database import Base, get_db
from app.core.dependencies import get_current_user
from app.core.exceptions import BadRequestException, ForbiddenException, NotFoundException
from app.modules.billing.router import billing_router
from app.modules.billing.models import (
    BillingAuditAction,
    DelinquencyStage,
    EntitlementMode,
    PlanCode,
)
from app.modules.billing import exception_service
from app.modules.billing.entitlement_service import (
    check_entitlement,
    compute_entitlement_snapshot,
    invalidate_entitlement_cache,
    ENTITLED_AVAILABLE,
    READ_ONLY,
    NOT_ENTITLED,
    DELINQUENCY_RESTRICTED,
)
from fixtures import tenants

from app.modules.billing.feature_keys import FEATURE_KEYS

_DELINQUENCY_KEY = "hr.identity.sso"   # in _DAY_10_RESTRICTED_KEYS
_GRANT_KEY = "hr.recruitment.core"     # registered FEATURE_KEYS key


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _window(days_start: int = 0, days_end: int = 7) -> tuple[datetime, datetime]:
    now = datetime.utcnow()
    return now + timedelta(days=days_start), now + timedelta(days=days_end)


# ═══════════════════════════════════════════════════════════════════════════
# Request validation
# ═══════════════════════════════════════════════════════════════════════════

class TestRequest:
    def test_request_creates_pending(self, db):
        tenants.core_tenant(db, org_id=1)
        exc = exception_service.request_exception(
            db, organization_id=1, feature_key=_GRANT_KEY,
            mode=EntitlementMode.ENABLED, reason="Temporary ops flexibility",
            requested_by="finance@tenant.z", starts_at=_window()[0], expires_at=_window()[1],
        )
        assert exc.status.value == "pending_approval"
        assert exc.mode == EntitlementMode.ENABLED
        assert exc.requested_by == "finance@tenant.z"

    def test_unknown_key_rejected(self, db):
        tenants.core_tenant(db, org_id=1)
        s, e = _window()
        with pytest.raises(BadRequestException) as ei:
            exception_service.request_exception(
                db, organization_id=1, feature_key="hr.not.a.key",
                mode=EntitlementMode.ENABLED, reason="x",
                requested_by="a@z", starts_at=s, expires_at=e,
            )
        assert "not a registered" in str(ei.value.message).lower()

    def test_non_grantable_mode_rejected(self, db):
        tenants.core_tenant(db, org_id=1)
        s, e = _window()
        with pytest.raises(BadRequestException) as ei:
            exception_service.request_exception(
                db, organization_id=1, feature_key=_GRANT_KEY,
                mode=EntitlementMode.POLICY_BLOCKED, reason="x",
                requested_by="a@z", starts_at=s, expires_at=e,
            )
        assert "not grantable" in str(ei.value.message).lower()

    def test_window_required_and_ordered(self, db):
        tenants.core_tenant(db, org_id=1)
        now = datetime.utcnow()
        with pytest.raises(BadRequestException) as ei:
            exception_service.request_exception(
                db, organization_id=1, feature_key=_GRANT_KEY,
                mode=EntitlementMode.ENABLED, reason="x",
                requested_by="a@z", starts_at=None, expires_at=None,
            )
        assert "never indefinite" in str(ei.value.message).lower()
        with pytest.raises(BadRequestException):
            exception_service.request_exception(
                db, organization_id=1, feature_key=_GRANT_KEY,
                mode=EntitlementMode.ENABLED, reason="x",
                requested_by="a@z", starts_at=now, expires_at=now - timedelta(days=1),
            )

    def test_requires_subscription(self, db):
        # No tenant -> no BillingSubscription row -> must fail closed.
        s, e = _window()
        with pytest.raises(BadRequestException) as ei:
            exception_service.request_exception(
                db, organization_id=999, feature_key=_GRANT_KEY,
                mode=EntitlementMode.ENABLED, reason="x",
                requested_by="a@z", starts_at=s, expires_at=e,
            )
        assert "no subscription" in str(ei.value.message).lower()

    def test_overlapping_window_conflict(self, db):
        tenants.core_tenant(db, org_id=1)
        s, e = _window()
        exception_service.request_exception(
            db, organization_id=1, feature_key=_GRANT_KEY,
            mode=EntitlementMode.ENABLED, reason="first",
            requested_by="a@z", starts_at=s, expires_at=e,
        )
        with pytest.raises(BadRequestException) as ei:
            exception_service.request_exception(
                db, organization_id=1, feature_key=_GRANT_KEY,
                mode=EntitlementMode.ENABLED, reason="second",
                requested_by="a@z", starts_at=s + timedelta(days=1), expires_at=e,
            )
        assert "already exists" in str(ei.value.message)

    def test_disjoint_windows_do_not_conflict(self, db):
        tenants.core_tenant(db, org_id=1)
        s, e = _window()
        exception_service.request_exception(
            db, organization_id=1, feature_key=_GRANT_KEY,
            mode=EntitlementMode.ENABLED, reason="first",
            requested_by="a@z", starts_at=s, expires_at=e,
        )
        later_start = e + timedelta(days=2)
        exc = exception_service.request_exception(
            db, organization_id=1, feature_key=_GRANT_KEY,
            mode=EntitlementMode.READ_ONLY, reason="second",
            requested_by="a@z", starts_at=later_start, expires_at=later_start + timedelta(days=5),
        )
        assert exc.status.value == "pending_approval"


# ═══════════════════════════════════════════════════════════════════════════
# Approve / reject / revoke
# ═══════════════════════════════════════════════════════════════════════════

class TestApprovalLifecycle:
    def _pending(self, db, org_id=1, key=_GRANT_KEY, starts=None, ends=None):
        s, e = _window() if starts is None else (starts, ends)
        return exception_service.request_exception(
            db, organization_id=org_id, feature_key=key,
            mode=EntitlementMode.ENABLED, reason="ops",
            requested_by="finance@tenant.z", starts_at=s, expires_at=e,
        )

    def test_approve_transitions_active(self, db):
        tenants.core_tenant(db, org_id=1)
        exc = self._pending(db)
        exc = exception_service.approve_exception(db, exc.id, approved_by="ops@zoiko.com")
        assert exc.status.value == "active"
        assert exc.approved_by == "ops@zoiko.com"
        assert exc.approved_at is not None

    def test_same_actor_rejection(self, db):
        tenants.core_tenant(db, org_id=1)
        exc = self._pending(db)
        with pytest.raises(ForbiddenException):
            exception_service.approve_exception(db, exc.id, approved_by="finance@tenant.z")

    def test_approve_non_pending_rejected(self, db):
        tenants.core_tenant(db, org_id=1)
        exc = self._pending(db)
        exception_service.approve_exception(db, exc.id, approved_by="ops@zoiko.com")
        with pytest.raises(BadRequestException):
            exception_service.approve_exception(db, exc.id, approved_by="ops2@zoiko.com")

    def test_cannot_approve_past_expiry(self, db):
        tenants.core_tenant(db, org_id=1)
        exc = self._pending(db, starts=datetime.utcnow() - timedelta(days=10),
                           ends=datetime.utcnow() - timedelta(days=1))
        with pytest.raises(BadRequestException):
            exception_service.approve_exception(db, exc.id, approved_by="ops@zoiko.com")

    def test_reject_transitions(self, db):
        tenants.core_tenant(db, org_id=1)
        exc = self._pending(db)
        exc = exception_service.reject_exception(
            db, exc.id, rejected_by="ops@zoiko.com", rejection_reason="not justified")
        assert exc.status.value == "rejected"
        assert exc.rejection_reason == "not justified"
        with pytest.raises(BadRequestException):
            exception_service.reject_exception(db, exc.id, rejected_by="ops@zoiko.com")

    def test_revoke_only_active(self, db):
        tenants.core_tenant(db, org_id=1)
        exc = self._pending(db)
        with pytest.raises(BadRequestException):
            exception_service.revoke_exception(db, exc.id, revoked_by="ops@zoiko.com")
        exc = exception_service.approve_exception(db, exc.id, approved_by="ops@zoiko.com")
        exc = exception_service.revoke_exception(
            db, exc.id, revoked_by="ops@zoiko.com", revocation_reason="policy change")
        assert exc.status.value == "revoked"
        assert exc.revoked_by == "ops@zoiko.com"
        assert exc.revoked_at is not None

    def test_missing_exception_not_found(self, db):
        with pytest.raises(NotFoundException):
            exception_service.approve_exception(db, 424242, approved_by="ops@zoiko.com")

    def test_audit_trail_written(self, db):
        tenants.core_tenant(db, org_id=1)
        exc = self._pending(db)
        exception_service.approve_exception(db, exc.id, approved_by="ops@zoiko.com")
        actions = tenants.audit_action_names(db, organization_id=1)
        assert BillingAuditAction.EXCEPTION_REQUESTED.value in actions
        assert BillingAuditAction.EXCEPTION_APPROVED.value in actions


# ═══════════════════════════════════════════════════════════════════════════
# Expiry walk
# ═══════════════════════════════════════════════════════════════════════════

class TestExpiry:
    def test_overdue_actives_flip_to_expired(self, db):
        tenants.core_tenant(db, org_id=1)
        past = datetime.utcnow() - timedelta(days=2)

        a = exception_service.request_exception(
            db, organization_id=1, feature_key=_GRANT_KEY,
            mode=EntitlementMode.ENABLED, reason="ops", requested_by="f@z",
            starts_at=datetime.utcnow() - timedelta(days=1),
            expires_at=datetime.utcnow() + timedelta(days=1))
        b = exception_service.request_exception(
            db, organization_id=1, feature_key="hr.onboarding.core",
            mode=EntitlementMode.ENABLED, reason="ops", requested_by="f@z",
            starts_at=datetime.utcnow() - timedelta(days=1),
            expires_at=datetime.utcnow() + timedelta(days=1))
        exception_service.approve_exception(db, a.id, approved_by="ops@z")
        exception_service.approve_exception(db, b.id, approved_by="ops@z")

        # Both approved while live; now A's window lapses -> walk expires it.
        a.expires_at = datetime.utcnow() - timedelta(hours=1)
        db.commit()

        expired = exception_service.expire_overdue_exceptions(db)
        assert [e.id for e in expired] == [a.id]
        assert a.status.value == "expired"
        assert b.status.value == "active"
        assert BillingAuditAction.EXCEPTION_EXPIRED.value in tenants.audit_action_names(db, 1)

    def test_expired_exception_no_longer_grants(self, db):
        tenants.core_tenant(db, org_id=1)
        exc = exception_service.request_exception(
            db, organization_id=1, feature_key=_GRANT_KEY, mode=EntitlementMode.ENABLED,
            reason="ops", requested_by="f@z",
            starts_at=datetime.utcnow() - timedelta(days=1),
            expires_at=datetime.utcnow() + timedelta(days=1))
        exception_service.approve_exception(db, exc.id, approved_by="ops@z")
        exc.expires_at = datetime.utcnow() - timedelta(hours=1)
        db.commit()
        exception_service.expire_overdue_exceptions(db)
        invalidate_entitlement_cache(1)
        result = check_entitlement(db, 1, _GRANT_KEY)
        assert result["state"] != ENTITLED_AVAILABLE


# ═══════════════════════════════════════════════════════════════════════════
# Resolver contract (check_entitlement + compute_entitlement_snapshot)
# ═══════════════════════════════════════════════════════════════════════════

class TestResolver:
    def test_override_beats_not_entitled(self, db):
        fx = tenants.active_tenant(db)   # org 6, CORE, commercial
        tenants.seed_entitlement_mappings(
            db, plan_codes=[PlanCode.CORE], not_entitled_keys={_GRANT_KEY})
        invalidate_entitlement_cache(fx.org.id)
        assert check_entitlement(db, fx.org.id, _GRANT_KEY)["state"] == NOT_ENTITLED

        exc = exception_service.request_exception(
            db, organization_id=fx.org.id, feature_key=_GRANT_KEY,
            mode=EntitlementMode.ENABLED, reason="migrate window",
            requested_by="finance@z", starts_at=_window()[0], expires_at=_window()[1])
        exception_service.approve_exception(db, exc.id, approved_by="ops@z")

        result = check_entitlement(db, fx.org.id, _GRANT_KEY)
        assert result["state"] == ENTITLED_AVAILABLE
        assert result["mode"] == "enabled"       # Section 15 mode vocabulary
        assert result["reason_code"] is None     # allowed decision carries no proof
        assert result["retryable"] is True
        assert result["snapshot_version"].startswith("v")
        assert "correlation_id" in result

    def test_read_only_exception_maps_to_read_only(self, db):
        fx = tenants.active_tenant(db)
        tenants.seed_entitlement_mappings(db, plan_codes=[PlanCode.CORE])
        exc = exception_service.request_exception(
            db, organization_id=fx.org.id, feature_key=_GRANT_KEY,
            mode=EntitlementMode.READ_ONLY, reason="view-only grace",
            requested_by="finance@z", starts_at=_window()[0], expires_at=_window()[1])
        exception_service.approve_exception(db, exc.id, approved_by="ops@z")
        invalidate_entitlement_cache(fx.org.id)
        result = check_entitlement(db, fx.org.id, _GRANT_KEY)
        assert result["state"] == READ_ONLY

    def test_pending_exception_does_not_grant(self, db):
        fx = tenants.active_tenant(db)
        tenants.seed_entitlement_mappings(db, plan_codes=[PlanCode.CORE],
                                          not_entitled_keys={_GRANT_KEY})
        exception_service.request_exception(
            db, organization_id=fx.org.id, feature_key=_GRANT_KEY,
            mode=EntitlementMode.ENABLED, reason="pending",
            requested_by="finance@z", starts_at=_window()[0], expires_at=_window()[1])
        invalidate_entitlement_cache(fx.org.id)
        assert check_entitlement(db, fx.org.id, _GRANT_KEY)["state"] == NOT_ENTITLED

    def test_revoked_exception_no_longer_grants(self, db):
        fx = tenants.active_tenant(db)
        tenants.seed_entitlement_mappings(db, plan_codes=[PlanCode.CORE],
                                          not_entitled_keys={_GRANT_KEY})
        exc = exception_service.request_exception(
            db, organization_id=fx.org.id, feature_key=_GRANT_KEY,
            mode=EntitlementMode.ENABLED, reason="temporary",
            requested_by="finance@z", starts_at=_window()[0], expires_at=_window()[1])
        exception_service.approve_exception(db, exc.id, approved_by="ops@z")
        exception_service.revoke_exception(db, exc.id, revoked_by="ops@z")
        invalidate_entitlement_cache(fx.org.id)
        assert check_entitlement(db, fx.org.id, _GRANT_KEY)["state"] == NOT_ENTITLED

    def test_delinquency_gate_beats_exception(self, db):
        """Payment policy (Section 10) takes precedence over any operator
        exception — a restricted org cannot get a write override while a
        DAY_10_RESTRICT case is open."""
        fx = tenants.active_tenant(db)
        tenants.seed_entitlement_mappings(db, plan_codes=[PlanCode.CORE])
        from app.modules.billing.delinquency_service import open_case
        case = open_case(db, organization_id=fx.org.id)
        case.stage = DelinquencyStage.DAY_10_RESTRICT
        db.commit()

        exc = exception_service.request_exception(
            db, organization_id=fx.org.id, feature_key=_DELINQUENCY_KEY,
            mode=EntitlementMode.ENABLED, reason="override attempt",
            requested_by="finance@z", starts_at=_window()[0], expires_at=_window()[1])
        exception_service.approve_exception(db, exc.id, approved_by="ops@z")

        result = check_entitlement(db, fx.org.id, _DELINQUENCY_KEY)
        assert result["state"] == DELINQUENCY_RESTRICTED
        assert result["reason_code"] is not None

    def test_ai_hard_block_not_overridable(self, db):
        fx = tenants.active_tenant(db)
        # Defense-in-depth: the request path itself rejects Section 8 E4 keys,
        # so an admin cannot even spend an approval cycle on an unrevivable key.
        with pytest.raises(BadRequestException):
            exception_service.request_exception(
                db, organization_id=fx.org.id, feature_key="hr.ai.autonomous_action",
                mode=EntitlementMode.ENABLED, reason="attempt to revive",
                requested_by="finance@z", starts_at=_window()[0], expires_at=_window()[1])
        # And should a row ever slip in (pre-guard history or SQL write), the
        # resolver STILL hard-blocks it — the engine stays authoritative.
        synthetic = exception_service.CommercialExceptionEntitlement(
            organization_id=fx.org.id, feature_key="hr.ai.autonomous_action",
            mode=EntitlementMode.ENABLED, status=exception_service.CommercialExceptionStatus.ACTIVE,
            requested_by="finance@z", approved_by="ops@z", reason="pre-guard synthetic row",
            starts_at=_window()[0],
            expires_at=(datetime.utcnow() + timedelta(days=1)),
        )
        db.add(synthetic)
        db.commit()
        invalidate_entitlement_cache(fx.org.id)
        assert check_entitlement(db, fx.org.id, "hr.ai.autonomous_action")["state"] == NOT_ENTITLED
        # Appendix A canonical spelling is equally unrevivable.
        invalidate_entitlement_cache(fx.org.id)
        assert check_entitlement(db, fx.org.id, "hr.ai.autonomous_decision")["state"] == NOT_ENTITLED

    def test_snapshot_reflects_active_exception(self, db):
        fx = tenants.active_tenant(db)
        tenants.seed_entitlement_mappings(db, plan_codes=[PlanCode.CORE],
                                          not_entitled_keys={_GRANT_KEY})
        exc = exception_service.request_exception(
            db, organization_id=fx.org.id, feature_key=_GRANT_KEY,
            mode=EntitlementMode.ENABLED, reason="snapshot test",
            requested_by="finance@z", starts_at=_window()[0], expires_at=_window()[1])
        exception_service.approve_exception(db, exc.id, approved_by="ops@z")

        snap = compute_entitlement_snapshot(db, fx.org.id)
        assert snap["feature_states"][_GRANT_KEY] == ENTITLED_AVAILABLE
        assert snap["snapshot_id"] is not None
        assert "feature_key_registry_version" in snap


# ═══════════════════════════════════════════════════════════════════════════
# Command Center surface (ZHR-COM-ENT-001 §19.1 operator review queue)
# ═══════════════════════════════════════════════════════════════════════════

class TestCommandCenterSurface:
    def test_pending_exception_surfaced_in_attention(self, db):
        from app.modules.super_admin.command_center_router import _compute_attention
        tenants.core_tenant(db, org_id=1)
        exc = exception_service.request_exception(
            db, organization_id=1, feature_key=_GRANT_KEY,
            mode=EntitlementMode.ENABLED, reason="needs review",
            requested_by="finance@tenant.z", starts_at=_window()[0], expires_at=_window()[1])

        items = _compute_attention(db)
        matches = [i for i in items if "Entitlement exception request" in i.issue]
        assert any(m.organization_id == 1 for m in matches)
        assert matches[0].severity == "high"

        # Approved exceptions are no longer an open review item.
        exception_service.approve_exception(db, exc.id, approved_by="ops@zoiko.com")
        items = _compute_attention(db)
        assert not any(
            i.organization_id == 1 and "Entitlement exception request" in i.issue for i in items
        )

    def test_overview_reports_pending_approval_count(self, db):
        from app.modules.super_admin.command_center_router import (
            command_center_overview, _get_or_create_today_snapshot, _seed_service_health,
        )
        _seed_service_health(db)
        _get_or_create_today_snapshot(db)
        tenants.core_tenant(db, org_id=1)
        exception_service.request_exception(
            db, organization_id=1, feature_key=_GRANT_KEY,
            mode=EntitlementMode.ENABLED, reason="queue me",
            requested_by="finance@tenant.z", starts_at=_window()[0], expires_at=_window()[1])

        class _Admin:
            role = "super_admin"
        overview = command_center_overview(db=db, _=_Admin())
        assert overview.pending_exception_approvals == 1


# ═══════════════════════════════════════════════════════════════════════════
# HTTP — RBAC + routing (mirrors test_billing_me scaffolding)
# ═══════════════════════════════════════════════════════════════════════════

class _Caller:
    def __init__(self, email, org_id, role):
        self.email = email
        self.organization_id = org_id
        self.role = role
        self.id = None


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    s = Session()

    app = FastAPI()
    app.include_router(billing_router)
    db_store = {"db": s}

    def _override_db():
        yield db_store["db"]

    app.dependency_overrides[get_db] = _override_db
    user_box = {}

    def _override_current_user():
        return user_box["user"]

    app.dependency_overrides[get_current_user] = _override_current_user

    with TestClient(app) as c:
        c.user_box = user_box
        c.db = s
        yield c
    s.close()
    engine.dispose()


def _as(client, email, org_id, role="super_admin"):
    client.user_box["user"] = _Caller(email=email, org_id=org_id, role=role)


class TestExceptionEndpoints:
    def test_request_approve_list_flow(self, client):
        fx = tenants.active_tenant(client.db)
        _as(client, "finance@tenant.z", fx.org.id)
        s, e = _window()

        r = client.post(f"/billing/exceptions/request?org_id={fx.org.id}", json={
            "feature_key": _GRANT_KEY, "mode": "enabled", "reason": "ops",
            "starts_at": s.isoformat(), "expires_at": e.isoformat(),
        })
        assert r.status_code == 200, r.text
        exc_id = r.json()["id"]
        assert r.json()["status"] == "pending_approval"

        _as(client, "ops@zoiko.com", fx.org.id)
        r = client.post(f"/billing/exceptions/{exc_id}/approve")
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "active"

        r = client.get(f"/billing/exceptions/{fx.org.id}?status=active")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["total"] == 1
        assert body["list"][0]["id"] == exc_id

    def test_invalid_mode_rejected_http(self, client):
        fx = tenants.active_tenant(client.db)
        _as(client, "finance@tenant.z", fx.org.id)
        s, e = _window()
        r = client.post(f"/billing/exceptions/request?org_id={fx.org.id}", json={
            "feature_key": _GRANT_KEY, "mode": "policy_blocked", "reason": "ops",
            "starts_at": s.isoformat(), "expires_at": e.isoformat(),
        })
        assert r.status_code == 400, r.text
        assert "not grantable" in r.text.lower()

    def test_approve_requires_super_admin(self, client):
        fx = tenants.active_tenant(client.db)
        _as(client, "finance@tenant.z", fx.org.id)
        s, e = _window()
        r = client.post(f"/billing/exceptions/request?org_id={fx.org.id}", json={
            "feature_key": _GRANT_KEY, "mode": "enabled", "reason": "ops",
            "starts_at": s.isoformat(), "expires_at": e.isoformat(),
        })
        exc_id = r.json()["id"]

        _as(client, "hr@tenant.z", fx.org.id, role="hr_admin")
        r = client.post(f"/billing/exceptions/{exc_id}/approve")
        assert r.status_code == 403, r.text


class TestDecisionEndpoint:
    def test_single_key_query_returns_section15_decision(self, client):
        fx = tenants.active_tenant(client.db)
        tenants.seed_entitlement_mappings(client.db, plan_codes=[PlanCode.CORE])
        _as(client, "finance@tenant.z", fx.org.id)
        r = client.get(
            f"/billing/entitlements/{fx.org.id}?feature_key={_GRANT_KEY}"
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["feature_key"] == _GRANT_KEY
        assert "state" in body
        assert "mode" in body
        assert "reason_code" in body
        assert "required_plan" in body
        assert "allowed" in body

    def test_no_query_param_returns_full_snapshot(self, client):
        fx = tenants.active_tenant(client.db)
        _as(client, "finance@tenant.z", fx.org.id)
        r = client.get(f"/billing/entitlements/{fx.org.id}")
        assert r.status_code == 200, r.text
        assert "feature_states" in r.json()

    def test_unknown_key_returns_400(self, client):
        fx = tenants.active_tenant(client.db)
        _as(client, "finance@tenant.z", fx.org.id)
        r = client.get(f"/billing/entitlements/{fx.org.id}?feature_key=bogus.key")
        assert r.status_code == 400, r.text

    def test_hard_blocked_ai_key_is_not_entitled(self, client):
        fx = tenants.active_tenant(client.db)
        _as(client, "finance@tenant.z", fx.org.id)
        r = client.get(
            f"/billing/entitlements/{fx.org.id}?feature_key=hr.ai.autonomous_decision"
        )
        assert r.status_code == 200, r.text
        assert r.json()["state"] == "NOT_ENTITLED"