"""
tests/test_entitlement_middleware.py
------------------------------------
Phase 4 — safe enforcement rollout for the optional route-level entitlement
middleware:

  1. ENTITLED_AVAILABLE passes (both GET and POST).
  2. Blocked states 403 with an enriched Section 15 decision body
     (mode / reason_code / state).
  3. READ_ONLY is read-compatible: GET passes, POST is blocked (Section 14.1).
  4. allow_read_in_read_only=False turns READ_ONLY into a full block.
  5. enforce_keys staging: non-empty subset only enforces those keys.
  6. Anonymous (no token) requests pass through to the app (route auth wins).
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.modules.billing.entitlement_service import (
    ENTITLED_AVAILABLE,
    NOT_ENTITLED,
    READ_ONLY,
)


class _FakeSettingRow:
    def __init__(self, value):
        self.value = value


class _FakeQuery:
    def __init__(self, row):
        self._row = row

    def filter(self, *a, **kw):
        return self

    def first(self):
        return self._row


class _FakeSession:
    """staged_org_ids=None means no "entitlement_staged_org_ids" row exists
    (the pre-org-staging default) — every existing test relies on this
    meaning "no org-level restriction"."""

    def __init__(self, staged_org_ids: str | None = None):
        self._staged_org_ids = staged_org_ids

    def query(self, *a, **kw):
        # the middleware first asks whether the organization has a billing subscription at all
        if a and "BillingSubscription" in str(a[0]):
            return _FakeQuery(object())
        row = _FakeSettingRow(self._staged_org_ids) if self._staged_org_ids is not None else None
        return _FakeQuery(row)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _build_test_client(check_decision_fn, monkeypatch, *, org_id=7, staged_org_ids=None, **mw_kwargs):
    from app.modules.billing import entitlement_middleware as em

    app = FastAPI()

    @app.get("/hr/attendance/records")
    def get_records():
        return {"ok": True}

    @app.post("/hr/attendance/records")
    def post_records():
        return {"ok": True}

    monkeypatch.setattr(em, "check_entitlement", lambda db, org_id, key: check_decision_fn(key))
    monkeypatch.setattr(em, "decode_access_token", lambda token: {"organization_id": org_id})

    app.add_middleware(
        em.EntitlementMiddleware,
        db_session_factory=lambda: _FakeSession(staged_org_ids=staged_org_ids),
        **mw_kwargs,
    )
    return TestClient(app)


_AUTH = {"Authorization": "Bearer dummy"}


class TestEnforcementModes:
    def test_entitled_available_passes_get_and_post(self, monkeypatch):
        client = _build_test_client(
            lambda key: {"state": ENTITLED_AVAILABLE, "mode": "enabled",
                         "reason_code": None, "allowed": True},
            monkeypatch,
        )
        assert client.get("/hr/attendance/records", headers=_AUTH).status_code == 200
        assert client.post("/hr/attendance/records", headers=_AUTH).status_code == 200

    def test_not_entitled_blocks_and_carries_section15_decision(self, monkeypatch):
        client = _build_test_client(
            lambda key: {"state": NOT_ENTITLED, "mode": "disabled_plan",
                         "reason_code": "PLAN_REQUIRED", "allowed": False},
            monkeypatch,
        )
        r = client.get("/hr/attendance/records", headers=_AUTH)
        assert r.status_code == 403
        body = r.json()
        assert body["state"] == NOT_ENTITLED
        assert body["mode"] == "disabled_plan"
        assert body["reason_code"] == "PLAN_REQUIRED"
        assert body["allowed"] is False
        assert body["feature_key"] == "hr.attendance.core"

    def test_read_only_permits_reads_but_blocks_writes(self, monkeypatch):
        client = _build_test_client(
            lambda key: {"state": READ_ONLY, "mode": "read_only",
                         "reason_code": "DOWNGRADE_PENDING_READ_ONLY", "allowed": True},
            monkeypatch,
        )
        assert client.get("/hr/attendance/records", headers=_AUTH).status_code == 200
        assert client.post("/hr/attendance/records", headers=_AUTH).status_code == 403

    def test_read_only_full_block_when_disabled(self, monkeypatch):
        client = _build_test_client(
            lambda key: {"state": READ_ONLY, "mode": "read_only",
                         "reason_code": None, "allowed": True},
            monkeypatch,
            allow_read_in_read_only=False,
        )
        assert client.get("/hr/attendance/records", headers=_AUTH).status_code == 403
        assert client.post("/hr/attendance/records", headers=_AUTH).status_code == 403


class TestStagedRollout:
    def test_non_matching_enforce_keys_pass_through(self, monkeypatch):
        client = _build_test_client(
            lambda key: {"state": NOT_ENTITLED, "mode": "disabled_plan",
                         "reason_code": "PLAN_REQUIRED", "allowed": False},
            monkeypatch,
            enforce_keys={"hr.other.module"},
        )
        assert client.get("/hr/attendance/records", headers=_AUTH).status_code == 200
        assert client.post("/hr/attendance/records", headers=_AUTH).status_code == 200

    def test_matching_enforce_key_is_hard_enforced(self, monkeypatch):
        client = _build_test_client(
            lambda key: {"state": NOT_ENTITLED, "mode": "disabled_plan",
                         "reason_code": "PLAN_REQUIRED", "allowed": False},
            monkeypatch,
            enforce_keys={"hr.attendance.core"},
        )
        assert client.get("/hr/attendance/records", headers=_AUTH).status_code == 403

    def test_empty_enforce_keys_enforces_everything(self, monkeypatch):
        client = _build_test_client(
            lambda key: {"state": NOT_ENTITLED, "mode": "disabled_plan",
                         "reason_code": "PLAN_REQUIRED", "allowed": False},
            monkeypatch,
            enforce_keys=frozenset(),
        )
        assert client.get("/hr/attendance/records", headers=_AUTH).status_code == 403


class TestOrgLevelStagedRollout:
    """Phase 12 — org-level staging is an independent axis from enforce_keys.
    An empty/missing entitlement_staged_org_ids setting means no org-level
    restriction (existing behavior, unchanged); a non-empty list restricts
    hard enforcement to only those organization IDs."""

    def test_org_not_in_staged_list_passes_through(self, monkeypatch):
        client = _build_test_client(
            lambda key: {"state": NOT_ENTITLED, "mode": "disabled_plan",
                         "reason_code": "PLAN_REQUIRED", "allowed": False},
            monkeypatch,
            org_id=99,
            staged_org_ids="12,47",
        )
        assert client.get("/hr/attendance/records", headers=_AUTH).status_code == 200

    def test_org_in_staged_list_is_hard_enforced(self, monkeypatch):
        client = _build_test_client(
            lambda key: {"state": NOT_ENTITLED, "mode": "disabled_plan",
                         "reason_code": "PLAN_REQUIRED", "allowed": False},
            monkeypatch,
            org_id=12,
            staged_org_ids="12,47",
        )
        assert client.get("/hr/attendance/records", headers=_AUTH).status_code == 403

    def test_empty_staged_org_ids_restricts_nobody(self, monkeypatch):
        client = _build_test_client(
            lambda key: {"state": NOT_ENTITLED, "mode": "disabled_plan",
                         "reason_code": "PLAN_REQUIRED", "allowed": False},
            monkeypatch,
            org_id=999,
            staged_org_ids="",
        )
        assert client.get("/hr/attendance/records", headers=_AUTH).status_code == 403

    def test_missing_setting_row_restricts_nobody(self, monkeypatch):
        client = _build_test_client(
            lambda key: {"state": NOT_ENTITLED, "mode": "disabled_plan",
                         "reason_code": "PLAN_REQUIRED", "allowed": False},
            monkeypatch,
            org_id=999,
            staged_org_ids=None,
        )
        assert client.get("/hr/attendance/records", headers=_AUTH).status_code == 403


class TestAnonymous:
    def test_no_token_passes_through_to_route_auth(self, monkeypatch):
        # While entitlement is OFF for anonymous callers, the middleware must
        # not invent a paywall decision — the route's own 401/403 wins.
        client = _build_test_client(
            lambda key: {"state": NOT_ENTITLED, "mode": "disabled_plan",
                         "reason_code": "PLAN_REQUIRED", "allowed": False},
            monkeypatch,
        )
        assert client.get("/hr/attendance/records").status_code == 200

class TestOrganizationsWithoutBilling:
    def test_an_organization_with_no_subscription_is_not_locked_out(self, monkeypatch):
        """Created outside the self-serve flow / before billing: no plan to measure against, so nothing is blocked."""
        client = _build_test_client(
            lambda key: {"state": NOT_ENTITLED, "mode": "disabled_plan", "reason_code": "PLAN_REQUIRED", "allowed": False},
            monkeypatch,
        )

        class _NoSubscription(_FakeSession):
            def query(self, *a, **kw):
                if a and "BillingSubscription" in str(a[0]):
                    return _FakeQuery(None)
                return super().query(*a, **kw)

        import app.modules.billing.entitlement_middleware as em

        for layer in client.app.user_middleware:
            if layer.cls is em.EntitlementMiddleware:
                layer.kwargs["db_session_factory"] = lambda: _NoSubscription()
        client.app.middleware_stack = None  # rebuild with the replaced factory
        assert client.get("/hr/attendance/records", headers=_AUTH).status_code == 200


class TestCustomerMessages:
    def test_a_blocked_feature_explains_itself_and_points_at_the_upgrade(self, monkeypatch):
        client = _build_test_client(
            lambda key: {"state": NOT_ENTITLED, "mode": "disabled_plan", "reason_code": "PLAN_REQUIRED", "allowed": False, "required_plan": "advanced"},
            monkeypatch,
        )
        body = client.get("/hr/attendance/records", headers=_AUTH).json()
        assert "not included in your plan" in body["detail"] and "Advanced" in body["detail"]
        assert body["required_plan"] == "advanced" and body["upgrade_url"] == "/organization-admin/billing-and-plan"


class TestTheRealApplicationIsGuarded:
    def test_the_route_table_of_the_real_app_is_found(self):
        """With enforcement on, the log used to say 'enforcing 0 guarded routes': nothing was ever blocked."""
        from app.main import app as real_app
        import app.modules.billing.entitlement_middleware as em

        mw = em.EntitlementMiddleware(real_app, db_session_factory=lambda: None, routes_provider=lambda: real_app.routes)
        guarded = {(m, getattr(r, "path", "")) for m, r, _ in mw.guards}
        assert len(guarded) >= 100
        assert ("GET", "/hr/performance/dashboard") in guarded
        assert ("POST", "/hr/documents/{document_id}/assign") in guarded
