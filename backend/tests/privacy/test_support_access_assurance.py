"""Detection, reconciliation, recertification and tenant transparency (ZHR-PRIV-001 Phases 10-12; T33-T39)."""
from __future__ import annotations

from datetime import datetime, timedelta

from app.core.privacy import policy
from app.modules.support_access import assurance
from app.modules.support_access.models import SupportGrant
from tests.privacy.test_support_access_flow import (
    ENFORCED,
    PLATFORM,
    SUPPORT_COOKIE,
    _second_platform,
    mfa_token,
)
from tests.privacy.test_support_access_breakglass import BREAKGLASS, _bg_scope, _start, _confirm
from tests.privacy.test_support_access_revocation import _grant_for, _read


def _sensitive_live_grant(world):
    g = SupportGrant(
        request_id=None, tenant_id=1, grantee_person_id=world.u["platform"].id,
        grantee_account_id=world.u["platform"].id, kind="STANDARD",
        effective_scope={
            "resources": ["employee_profiles"], "record_ids": [world.u["a_emp1"].id],
            "entity_ids": [], "department_ids": [], "jurisdictions": [],
            "fields": {"employee_profiles": ["bank_account"]}, "actions": ["read"],
        },
        issued_at=datetime.utcnow(), expires_at=datetime.utcnow() + timedelta(minutes=30),
        revocation_version=1, session_id="s", device_fingerprint="d",
        policy_version=policy.POLICY_VERSION, token_jti="j",
    )
    world.db.add(g)
    world.db.commit()
    return g


def _confirm_breakglass(world):
    initiator = mfa_token(world.u["platform"])
    started = _start(world, initiator)
    assert started.status_code == 201, started.text
    responder = mfa_token(_second_platform(world))
    confirmed, _cookie = _confirm(world, started.json()["id"], responder)
    assert confirmed.status_code == 200, confirmed.text
    return started.json()["id"]


def test_T33_a_live_sensitive_grant_is_detected(world):
    _sensitive_live_grant(world)
    kinds = {f["kind"] for f in assurance.detect(world.db)}
    assert "SENSITIVE_GRANT_LIVE" in kinds


def test_T34_active_emergency_access_is_detected(world):
    _confirm_breakglass(world)
    kinds = {f["kind"] for f in assurance.detect(world.db)}
    assert "BREAK_GLASS_ACTIVE" in kinds


def test_T35_reconciliation_is_clean_then_flags(world):
    clean = assurance.reconcile(world.db)
    assert clean["ok"] is True
    _sensitive_live_grant(world)
    after = assurance.reconcile(world.db)
    assert after["sensitive_live_grants"] >= 1


def test_T36_recertification_lists_authorisers_and_reviews(world):
    _grant_for(world, mfa_token(world.u["platform"]))
    _confirm_breakglass(world)
    rec = assurance.recertification(world.db)
    assert rec["authorisers"]
    assert rec["breakglass_awaiting_review"]


def test_T37_tenant_activity_is_their_own(world):
    plt = mfa_token(world.u["platform"])
    _grant_for(world, plt)
    mine = world.client.get("/hr/support-access/activity", headers=mfa_token(world.u["a_admin"]))
    assert mine.status_code == 200, mine.text
    assert mine.json()["tenant_id"] == 1
    assert mine.json()["grants"]

    other = world.client.get("/hr/support-access/activity", headers=mfa_token(world.u["b_admin"]))
    assert other.status_code == 200, other.text
    assert other.json()["tenant_id"] == 2
    assert other.json()["grants"] == []


def test_T38_a_burst_of_refusals_is_flagged(world):
    plt = mfa_token(world.u["platform"])
    _pid, cookie = _grant_for(world, plt)
    for _ in range(12):
        assert _read(world, plt, cookie, emp_key="a_emp2").status_code == 403
    kinds = {f["kind"] for f in assurance.detect(world.db)}
    assert "DENIAL_BURST" in kinds


def test_T39_the_platform_can_read_detections_and_reconciliation(world):
    plt = mfa_token(world.u["platform"])
    assert world.client.get(f"{PLATFORM}/detections", headers=plt).status_code == 200
    assert world.client.get(f"{PLATFORM}/reconciliation", headers=plt).status_code == 200
    assert world.client.get(f"{PLATFORM}/recertification", headers=plt).status_code == 200
    # a tenant user may not reach the platform assurance views
    assert world.client.get(f"{PLATFORM}/detections", headers=mfa_token(world.u["a_admin"])).status_code in (403, 404)
