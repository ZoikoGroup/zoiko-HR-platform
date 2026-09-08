"""
tests/test_require_entitlement.py
----------------------------------
Regression coverage for core/entitlements.py's `require_entitlement()`
dependency — the always-on enforcement path used by 4 routes (distinct from
the opt-in entitlement_middleware.py, which already had this coverage).

Confirms the fix: READ_ONLY must pass on GET/HEAD (Section 14.1 read-compatible
mode) and still block POST/PUT/PATCH/DELETE, matching the same method-based
rule entitlement_middleware.py already enforces for its own guarded routes.
Before the fix, `require_entitlement()` blocked READ_ONLY unconditionally
regardless of HTTP method.
"""

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.core.entitlements import require_entitlement
from app.database import get_db
from app.modules.billing.entitlement_service import ENTITLED_AVAILABLE, NOT_ENTITLED, READ_ONLY


class _FakeUser:
    organization_id = 1


def _build_client(monkeypatch, state: str):
    import app.core.entitlements as mod
    from app.core import dependencies as deps

    def _fake_check_entitlement(db, organization_id, feature_key):
        return {"state": state, "mode": None, "reason_code": None}

    monkeypatch.setattr(mod, "check_entitlement", _fake_check_entitlement)

    app = FastAPI()
    guard = require_entitlement("hr.some.feature")

    @app.get("/thing", dependencies=[Depends(guard)])
    def read_thing():
        return {"ok": True}

    @app.post("/thing", dependencies=[Depends(guard)])
    def write_thing():
        return {"ok": True}

    app.dependency_overrides[deps.get_current_user] = lambda: _FakeUser()
    app.dependency_overrides[get_db] = lambda: None
    return TestClient(app)


def test_entitled_available_passes_both_methods(monkeypatch):
    client = _build_client(monkeypatch, ENTITLED_AVAILABLE)
    assert client.get("/thing").status_code == 200
    assert client.post("/thing").status_code == 200


def test_not_entitled_blocks_both_methods(monkeypatch):
    client = _build_client(monkeypatch, NOT_ENTITLED)
    assert client.get("/thing").status_code == 403
    assert client.post("/thing").status_code == 403


def test_read_only_allows_get_blocks_post(monkeypatch):
    client = _build_client(monkeypatch, READ_ONLY)
    assert client.get("/thing").status_code == 200
    assert client.post("/thing").status_code == 403
