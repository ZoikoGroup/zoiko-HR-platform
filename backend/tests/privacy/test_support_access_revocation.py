"""Revocation, the kill switch and its propagation (ZHR-PRIV-001 Phase 7; T27-T32).

A revocation is immediate and total: the grant's cache entry becomes REVOKED, any queued work for it is cancelled, a
token already in flight is refused by the version check, and the whole thing is on the record. The kill switch reaches a
person, a session, a tenant or everything, and a tenant can only ever reach itself.
"""
from __future__ import annotations

from datetime import datetime

from app.modules.support_access import cache, jobs, service
from app.modules.support_access.models import SupportGrant
from tests.privacy.test_support_access_flow import (
    ENFORCED,
    PLATFORM,
    TENANT,
    SUPPORT_COOKIE,
    _approve,
    _basic_scope,
    _create,
    _activate,
    _designate,
    _second_platform,
    mfa_token,
)

PLATFORM_BG = PLATFORM


def _scope_for(world, emp_key):
    scope = _basic_scope(world)
    scope["record_ids"] = [world.u[emp_key].id]
    return scope


def _grant_for(world, token, *, tenant_id=1, approver="a_hr", designator="a_admin", limits=("PERSONAL_BASIC",),
               emp_key="a_emp1"):
    """A full grant whose requester/activator is the owner of `token`."""
    _designate(world, tenant_id, designator, approver, list(limits))
    created = _create(world, token, _scope_for(world, emp_key), tenant_id=tenant_id)
    assert created.status_code == 201, created.text
    rid = created.json()["id"]
    approved = _approve(world, rid, mfa_token(world.u[approver]))
    assert approved.status_code == 200, approved.text
    activated, cookie = _activate(world, rid, token)
    assert activated.status_code == 200, activated.text
    return rid, cookie


def _grant_id_for(world, person_id):
    row = (
        world.db.query(SupportGrant)
        .filter(SupportGrant.grantee_person_id == person_id, SupportGrant.revoked_at.is_(None))
        .order_by(SupportGrant.issued_at.desc())
        .first()
    )
    return row.id if row else None


def _read(world, token, cookie, emp_key="a_emp1", tenant_id=1):
    return world.client.get(
        f"{ENFORCED}/tenants/{tenant_id}/employees/{world.u[emp_key].id}",
        headers=token, cookies={SUPPORT_COOKIE: cookie},
    )


# ── T27: a person kill switch reaches only that person ──────────────────────────────────────────────────────────────
def test_T27_kill_switch_by_person_hits_only_that_person(world):
    first = mfa_token(world.u["platform"])
    second = _second_platform(world)
    second_token = mfa_token(second)
    _g1, cookie1 = _grant_for(world, first)
    _g2, cookie2 = _grant_for(world, second_token)

    killed = world.client.post(
        f"{PLATFORM}/kill-switch",
        headers=first,
        json={"scope": "PERSON", "target": str(second.id), "reason": "device lost"},
    )
    assert killed.status_code == 200, killed.text
    assert killed.json()["revoked"] >= 1

    assert _read(world, second_token, cookie2).status_code == 403    # the named person
    assert _read(world, first, cookie1).status_code == 200           # someone else is untouched


# ── T28: a tenant kill switch reaches only that tenant ──────────────────────────────────────────────────────────────
def test_T28_kill_switch_by_tenant_leaves_other_tenants_alone(world):
    first = mfa_token(world.u["platform"])
    _g1, cookie1 = _grant_for(world, first, tenant_id=1)
    _g2, cookie2 = _grant_for(world, first, tenant_id=2, approver="b_admin", designator="b_admin", emp_key="b_emp1")

    killed = world.client.post(
        f"{PLATFORM}/kill-switch",
        headers=first,
        json={"scope": "TENANT", "target": "1", "reason": "tenant invoked the switch"},
    )
    assert killed.status_code == 200, killed.text
    assert _read(world, first, cookie1, tenant_id=1).status_code == 403
    assert _read(world, first, cookie2, emp_key="b_emp1", tenant_id=2).status_code == 200


# ── T29: a tenant can only ever reach itself ────────────────────────────────────────────────────────────────────────
def test_T29_a_tenant_kill_switch_cannot_reach_another_tenant(world):
    first = mfa_token(world.u["platform"])
    _g1, cookie1 = _grant_for(world, first, tenant_id=1)
    _g2, cookie2 = _grant_for(world, first, tenant_id=2, approver="b_admin", designator="b_admin", emp_key="b_emp1")

    # A tenant admin asks for a GLOBAL switch; the endpoint forces the scope to their own tenant.
    killed = world.client.post(
        f"{TENANT}/kill-switch",
        headers=mfa_token(world.u["a_admin"]),
        json={"scope": "GLOBAL", "reason": "panic"},
    )
    assert killed.status_code == 200, killed.text
    assert killed.json()["scope"] == "TENANT"
    assert _read(world, first, cookie1, tenant_id=1).status_code == 403    # own tenant, gone
    assert _read(world, first, cookie2, emp_key="b_emp1", tenant_id=2).status_code == 200   # the other tenant, safe


# ── T30: revocation propagates at once, and a token in flight is refused ────────────────────────────────────────────
def test_T30_revocation_is_immediate_and_a_token_in_flight_dies(world):
    plt = mfa_token(world.u["platform"])
    _rid, cookie = _grant_for(world, plt)
    emp = world.u["a_emp1"].id
    assert _read(world, plt, cookie).status_code == 200

    gid = _grant_id_for(world, world.u["platform"].id)
    service.kill_switch(world.db, scope="PERSON", target=str(world.u["platform"].id), actor_id=world.u["platform"].id,
                        reason="incident")

    assert cache.get(gid) is cache.REVOKED                  # the cache knows at once, on this node
    # the SAME cookie + bearer that worked a moment ago
    assert _read(world, plt, cookie).status_code == 403


# ── T31: the work a grant started is cancelled with it ──────────────────────────────────────────────────────────────
def test_T31_revocation_cancels_queued_work(world):
    jobs.clear()
    plt = mfa_token(world.u["platform"])
    _rid, _cookie = _grant_for(world, plt)
    gid = _grant_id_for(world, world.u["platform"].id)

    seen = {"cancelled": False}
    jobs.register(gid, lambda: seen.__setitem__("cancelled", True))
    assert jobs.pending_for_grant(gid) == 1

    service.kill_switch(world.db, scope="PERSON", target=str(world.u["platform"].id), actor_id=world.u["platform"].id,
                        reason="incident")
    assert seen["cancelled"] is True
    assert jobs.pending_for_grant(gid) == 0


# ── T32: the revocation is on the record, propagated, inside the window ─────────────────────────────────────────────
def test_T32_revocation_is_recorded_as_propagated(world):
    plt = mfa_token(world.u["platform"])
    _grant_for(world, plt)
    killed = world.client.post(
        f"{PLATFORM}/kill-switch",
        headers=plt,
        json={"scope": "GLOBAL", "reason": "platform-wide stop"},
    )
    assert killed.status_code == 200, killed.text

    seen = world.client.get(f"{PLATFORM}/revocations", headers=plt)
    assert seen.status_code == 200, seen.text
    global_rows = [r for r in seen.json() if r["target_type"] == "GLOBAL"]
    assert global_rows, seen.json()
    row = global_rows[0]
    assert row["propagation_confirmed"] is True
    requested = datetime.fromisoformat(row["requested_at"])
    propagated = datetime.fromisoformat(row["propagated_at"])
    assert 0 <= (propagated - requested).total_seconds() <= 60


# ── a plain unit check that the tombstone survives a racing read ─────────────────────────────────────────────────────
def test_apply_revocation_leaves_a_tombstone():
    cache.clear()
    cache.put("g-x", {"live": True})
    assert cache.get("g-x") == {"live": True}
    cache.apply_revocation("g-x")
    assert cache.get("g-x") is cache.REVOKED
