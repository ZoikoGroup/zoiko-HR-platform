"""Break-glass emergency access (ZHR-PRIV-001 Phase 8; T19-T26).

Two platform people, read-only, no special-category data, capped below a normal grant, and it dies when it ends. The
enforced path is the same `/support` path every grant uses, so a break-glass capability is bounded by exactly the same
policy checks - it is not a bypass.
"""
from __future__ import annotations

from datetime import datetime

from tests.privacy.test_support_access_flow import (
    ENFORCED,
    PLATFORM,
    TENANT,
    SUPPORT_COOKIE,
    _second_platform,
    mfa_token,
)
from app.modules.support_access.dependencies import SUPPORT_COOKIE as _COOKIE

BREAKGLASS = f"{PLATFORM}/breakglass"


def _bg_scope(world, *, actions=("read",), fields=("first_name", "job_title"), resource="employees", record_ids=None):
    return {
        "resources": [resource],
        "record_ids": [world.u["a_emp1"].id] if record_ids is None else list(record_ids),
        "entity_ids": [],
        "department_ids": [],
        "jurisdictions": [],
        "fields": {resource: list(fields)},
        "actions": list(actions),
    }


def _start(world, token, *, scope=None, tenant_id=1, incident="INC-1", reason="Production outage investigation"):
    return world.client.post(
        BREAKGLASS,
        headers=token,
        json={
            "tenant_id": tenant_id,
            "incident_reference": incident,
            "reason": reason,
            "scope": scope or _bg_scope(world),
        },
    )


def _confirm(world, session_id, token):
    r = world.client.post(f"{BREAKGLASS}/{session_id}/confirm", headers=token)
    return r, r.cookies.get(SUPPORT_COOKIE)


# ── T19: the permitted emergency path, and only the permitted fields ────────────────────────────────────────────────
def test_T19_two_person_break_glass_grants_a_bounded_read(world):
    initiator = mfa_token(world.u["platform"])
    started = _start(world, initiator)
    assert started.status_code == 201, started.text
    body = started.json()
    assert body["status"] == "PENDING_CONFIRMATION"
    # a session that is merely started grants nothing
    assert world.client.get(
        f"{ENFORCED}/tenants/1/employees/{world.u['a_emp1'].id}", headers=initiator
    ).status_code == 403

    second = _second_platform(world)
    responder = mfa_token(second)   # one token, reused for the read so the bound session matches
    confirmed, cookie = _confirm(world, body["id"], responder)
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["session"]["status"] == "ACTIVE"
    assert cookie

    rr = world.client.get(
        f"{ENFORCED}/tenants/1/employees/{world.u['a_emp1'].id}",
        headers=responder, cookies={_COOKIE: cookie},
    )
    assert rr.status_code == 200, rr.text
    assert "job_title" in rr.json()
    assert "basic_salary" not in rr.json()


# ── T20: two people, always ─────────────────────────────────────────────────────────────────────────────────────────
def test_T20_the_initiator_cannot_confirm_their_own_session(world):
    initiator = mfa_token(world.u["platform"])
    started = _start(world, initiator)
    assert started.status_code == 201, started.text
    denied, cookie = _confirm(world, started.json()["id"], initiator)   # same person
    assert denied.status_code == 403
    assert cookie is None


# ── T21: read-only, enforced at issuance ────────────────────────────────────────────────────────────────────────────
def test_T21_a_write_action_is_refused(world):
    r = _start(world, mfa_token(world.u["platform"]), scope=_bg_scope(world, actions=("read", "export")))
    assert r.status_code == 400
    assert "read-only" in r.json()["detail"].lower()


# ── T22: special-category data is out of reach, ever ────────────────────────────────────────────────────────────────
def test_T22_special_category_data_is_refused(world):
    medical = _bg_scope(world, resource="employee_profiles", fields=("religion",))
    r = _start(world, mfa_token(world.u["platform"]), scope=medical)
    assert r.status_code == 400
    assert "special-category" in r.json()["detail"].lower()


# ── T23: the tenant can see it ──────────────────────────────────────────────────────────────────────────────────────
def test_T23_the_tenant_sees_the_emergency_session(world):
    initiator = mfa_token(world.u["platform"])
    started = _start(world, initiator, incident="INC-42")
    assert started.status_code == 201, started.text
    seen = world.client.get(f"{TENANT}/breakglass", headers=mfa_token(world.u["a_admin"]))
    assert seen.status_code == 200, seen.text
    refs = [row["incident_reference"] for row in seen.json()]
    assert "INC-42" in refs


# ── T24: ending the session kills the capability ────────────────────────────────────────────────────────────────────
def test_T24_ending_the_session_revokes_the_capability(world):
    initiator = mfa_token(world.u["platform"])
    started = _start(world, initiator)
    second = _second_platform(world)
    responder = mfa_token(second)
    confirmed, cookie = _confirm(world, started.json()["id"], responder)
    assert confirmed.status_code == 200, confirmed.text
    emp = world.u["a_emp1"].id
    assert world.client.get(f"{ENFORCED}/tenants/1/employees/{emp}", headers=responder, cookies={_COOKIE: cookie}).status_code == 200

    ended = world.client.post(f"{BREAKGLASS}/{started.json()['id']}/end", headers=initiator)
    assert ended.status_code == 200, ended.text
    assert ended.json()["status"] == "ENDED"
    after = world.client.get(f"{ENFORCED}/tenants/1/employees/{emp}", headers=responder, cookies={_COOKIE: cookie})
    assert after.status_code == 403


# ── T25: the window is short and capped ─────────────────────────────────────────────────────────────────────────────
def test_T25_the_capability_is_capped_below_the_normal_maximum(world):
    initiator = mfa_token(world.u["platform"])
    started = _start(world, initiator)
    responder = mfa_token(_second_platform(world))
    confirmed, _cookie = _confirm(world, started.json()["id"], responder)
    assert confirmed.status_code == 200, confirmed.text
    grant = confirmed.json()["grant"]
    issued = datetime.fromisoformat(grant["issued_at"])
    expires = datetime.fromisoformat(grant["expires_at"])
    assert 0 < (expires - issued).total_seconds() <= 60 * 60


# ── T26: an unconfirmed session never becomes access ────────────────────────────────────────────────────────────────
def test_T26_an_unconfirmed_session_is_not_access(world):
    initiator = mfa_token(world.u["platform"])
    started = _start(world, initiator)
    assert started.status_code == 201, started.text
    # the second person never confirms; there is no capability to present
    rr = world.client.get(f"{ENFORCED}/tenants/1/employees/{world.u['a_emp1'].id}", headers=initiator)
    assert rr.status_code == 403
