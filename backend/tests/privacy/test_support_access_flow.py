"""End-to-end support-access flow and enforcement (ZHR-PRIV-001 section 02, Phases 2-7; T01-T12).

A real request, a real tenant approval, a real signed capability, and real reads through the enforced `/support` path -
plus the refusals the standard demands. No AI assistant code is touched anywhere in this suite.
"""
from __future__ import annotations

import time

import pytest

from app.core.security import create_access_token
from app.modules.employee.models import UserRole
from app.modules.support_access.dependencies import SUPPORT_COOKIE
from tests.privacy.support import CANARY, _emp

PLATFORM = "/super-admin/support-access"
TENANT = "/hr/support-access"
ENFORCED = "/support"


def mfa_token(user, at=None):
    """An access token that carries a fresh MFA check, which the support endpoints require."""
    data = {"sub": user.email, "role": user.role.value, "id": user.id, "organization_id": user.organization_id}
    data["mfa_at"] = int(time.time()) if at is None else int(at)
    return {"Authorization": f"Bearer {create_access_token(data)}"}


def _second_platform(world, email="security.approver@zoiko-ops.example.com"):
    """A second platform person: an independent approver must be someone other than the requester (maker-checker)."""
    return _emp(world.db, email, UserRole.SUPER_ADMIN, None, "Security", "Approver")


def _designate(world, tenant_id, designator_key, user_key, limits):
    return world.client.post(
        f"{TENANT}/authorisers",
        headers=mfa_token(world.u[designator_key]),
        json={"user_id": world.u[user_key].id, "scope_limits": limits},
    )


def _create(world, token, scope, *, tenant_id=1, submit=True, purpose_category="TROUBLESHOOTING",
            legal_basis_reference=None, duration_minutes=None):
    body = {
        "tenant_id": tenant_id, "ticket_reference": "TICK-1", "purpose": "Investigate a reported sync error",
        "purpose_category": purpose_category, "scope": scope, "submit": submit,
        "legal_basis_reference": legal_basis_reference, "duration_minutes": duration_minutes,
    }
    return world.client.post(f"{PLATFORM}/requests", headers=token, json=body)


def _approve(world, request_id, token, **kw):
    return world.client.post(f"{TENANT}/requests/{request_id}/approve", headers=token, json={"decision": "APPROVED", **kw})


def _activate(world, request_id, token):
    r = world.client.post(f"{PLATFORM}/requests/{request_id}/activate", headers=token)
    return r, r.cookies.get(SUPPORT_COOKIE)


def _basic_scope(world, *, actions=("read",), fields=("first_name", "job_title")):
    return {
        "resources": ["employees"], "record_ids": [world.u["a_emp1"].id], "entity_ids": [], "department_ids": [],
        "jurisdictions": [], "fields": {"employees": list(fields)}, "actions": list(actions),
    }


def _grant_employee_read(world, *, scope=None, approver="a_hr", limits=("PERSONAL_BASIC",)):
    plt = mfa_token(world.u["platform"])
    _designate(world, 1, "a_admin", approver, list(limits))
    scope = scope or _basic_scope(world)
    created = _create(world, plt, scope)
    assert created.status_code == 201, created.text
    rid = created.json()["id"]
    approved = _approve(world, rid, mfa_token(world.u[approver]))
    assert approved.status_code == 200, approved.text
    activated, cookie = _activate(world, rid, plt)
    assert activated.status_code == 200, activated.text
    assert cookie
    return plt, rid, cookie


# ── route registration ──────────────────────────────────────────────────────────────────────────────────────────────
def test_support_routes_exist(world):
    # no grant cookie: the enforced path refuses, it does not 404
    plt = mfa_token(world.u["platform"])
    assert world.client.get(f"{ENFORCED}/tenants/1/employees", headers=plt).status_code == 403
    # the platform request API exists (validation refuses an empty body, it does not 404)
    assert world.client.post(f"{PLATFORM}/requests", headers=plt, json={}).status_code == 422


# ── T01: the permitted path, and only the permitted fields ──────────────────────────────────────────────────────────
def test_T01_platform_reads_only_the_granted_fields(world):
    plt, _rid, cookie = _grant_employee_read(world)
    emp = world.u["a_emp1"].id
    rr = world.client.get(f"{ENFORCED}/tenants/1/employees/{emp}", headers=plt, cookies={SUPPORT_COOKIE: cookie})
    assert rr.status_code == 200, rr.text
    body = rr.json()
    assert body["first_name"] == CANARY["name_a1"]
    assert body["job_title"] == "t"
    assert "basic_salary" not in body
    assert str(CANARY["salary_a1"]) not in rr.text
    assert CANARY["iban_a1"] not in rr.text


def test_T02_no_grant_is_no_access(world):
    plt = mfa_token(world.u["platform"])
    rr = world.client.get(f"{ENFORCED}/tenants/1/employees/{world.u['a_emp1'].id}", headers=plt)
    assert rr.status_code == 403


def test_T03_a_record_outside_the_list_is_refused(world):
    plt, _rid, cookie = _grant_employee_read(world)
    rr = world.client.get(f"{ENFORCED}/tenants/1/employees/{world.u['a_emp2'].id}", headers=plt, cookies={SUPPORT_COOKIE: cookie})
    assert rr.status_code == 403
    assert rr.json()["detail"] == "OBJECT_SCOPE_MISMATCH"


def test_T04_a_field_outside_the_grant_is_refused_when_asked_for_explicitly(world):
    plt, _rid, cookie = _grant_employee_read(world)
    rr = world.client.get(
        f"{ENFORCED}/tenants/1/employees/{world.u['a_emp1'].id}",
        headers=plt, cookies={SUPPORT_COOKIE: cookie}, params={"fields": "first_name,basic_salary"},
    )
    assert rr.status_code == 403
    assert rr.json()["detail"] == "FIELD_NOT_GRANTED"


def test_T05_another_tenant_is_refused(world):
    plt, _rid, cookie = _grant_employee_read(world)
    rr = world.client.get(f"{ENFORCED}/tenants/2/employees/{world.u['b_emp1'].id}", headers=plt, cookies={SUPPORT_COOKIE: cookie})
    assert rr.status_code == 403
    assert rr.json()["detail"] == "GRANT_TENANT_MISMATCH"


def test_T06_export_is_a_separate_action(world):
    plt, _rid, cookie = _grant_employee_read(world)   # read only
    rr = world.client.get(f"{ENFORCED}/tenants/1/employees/{world.u['a_emp1'].id}/export", headers=plt, cookies={SUPPORT_COOKIE: cookie})
    assert rr.status_code == 403
    assert rr.json()["detail"] == "ACTION_NOT_GRANTED"


def test_T07_a_tenant_admin_can_revoke_a_grant_immediately(world):
    plt, rid, cookie = _grant_employee_read(world)
    emp = world.u["a_emp1"].id
    assert world.client.get(f"{ENFORCED}/tenants/1/employees/{emp}", headers=plt, cookies={SUPPORT_COOKIE: cookie}).status_code == 200
    # the tenant's own "Revoke now"
    grants = world.client.get(f"{TENANT}/grants", headers=mfa_token(world.u["a_admin"]))
    assert grants.status_code == 200, grants.text
    gid = grants.json()[0]["id"]
    revoked = world.client.post(f"{TENANT}/grants/{gid}/revoke", headers=mfa_token(world.u["a_admin"]))
    assert revoked.status_code == 200, revoked.text
    after = world.client.get(f"{ENFORCED}/tenants/1/employees/{emp}", headers=plt, cookies={SUPPORT_COOKIE: cookie})
    assert after.status_code == 403


# ── maker-checker and independent approval ──────────────────────────────────────────────────────────────────────────
def test_T08_the_requester_cannot_approve_their_own_request(world):
    plt = mfa_token(world.u["platform"])
    _designate(world, 1, "a_admin", "a_hr", ["PERSONAL_BASIC"])
    rid = _create(world, plt, _basic_scope(world)).json()["id"]
    # a_hr is a designated authoriser but is not the requester -> allowed; now push the platform account as approver
    r = world.client.post(f"{TENANT}/requests/{rid}/approve", headers=mfa_token(world.u["platform"]), json={"decision": "APPROVED"})
    # the platform account is refused as a tenant approver (404 from tenant scope, or 403)
    assert r.status_code in (403, 404)


def test_T09_a_non_designated_user_cannot_approve(world):
    plt = mfa_token(world.u["platform"])
    rid = _create(world, plt, _basic_scope(world)).json()["id"]
    r = _approve(world, rid, mfa_token(world.u["a_manager"]))     # never designated
    assert r.status_code == 403


def test_T10_a_high_risk_request_is_not_issued_on_the_tenant_approval_alone(world):
    plt = mfa_token(world.u["platform"])
    _designate(world, 1, "a_admin", "a_hr", ["PERSONAL_BASIC", "FINANCIAL"])
    scope = {
        "resources": ["employee_profiles"], "record_ids": [world.u["a_emp1"].id], "entity_ids": [], "department_ids": [],
        "jurisdictions": [], "fields": {"employee_profiles": ["bank_account"]}, "actions": ["read"],
    }
    created = _create(world, plt, scope)
    assert created.status_code == 201, created.text
    rid = created.json()["id"]
    after_tenant = _approve(world, rid, mfa_token(world.u["a_hr"]))
    assert after_tenant.status_code == 200, after_tenant.text
    assert after_tenant.json()["status"] == "PENDING_INDEPENDENT"
    # one approval is not enough: activation is refused
    refused, _ = _activate(world, rid, plt)
    assert refused.status_code == 400
    # the independent Security approval comes from a DIFFERENT platform person (maker-checker)
    approver = _second_platform(world)
    indep = world.client.post(
        f"{PLATFORM}/requests/{rid}/independent-approve",
        headers=mfa_token(approver),
        json={"approval_type": "SECURITY", "decision": "APPROVED"},
    )
    assert indep.status_code == 200, indep.text
    assert indep.json()["status"] == "APPROVED"
    activated, cookie = _activate(world, rid, plt)
    assert activated.status_code == 200, activated.text
    assert cookie


def test_T11_a_narrowing_approval_shrinks_the_grant(world):
    plt = mfa_token(world.u["platform"])
    _designate(world, 1, "a_admin", "a_hr", ["PERSONAL_BASIC"])
    scope = _basic_scope(world, fields=("first_name", "job_title"))
    rid = _create(world, plt, scope).json()["id"]
    narrow = {"resources": ["employees"], "record_ids": [world.u["a_emp1"].id], "entity_ids": [], "department_ids": [],
              "jurisdictions": [], "fields": {"employees": ["first_name"]}, "actions": ["read"]}
    r = _approve(world, rid, mfa_token(world.u["a_hr"]), approved_scope=narrow)
    assert r.status_code == 200, r.text
    _act, cookie = _activate(world, rid, plt)
    # job_title was narrowed away, so asking for it explicitly is refused
    rr = world.client.get(f"{ENFORCED}/tenants/1/employees/{world.u['a_emp1'].id}", headers=plt,
                          cookies={SUPPORT_COOKIE: cookie}, params={"fields": "job_title"})
    assert rr.status_code == 403


def test_T12_platform_may_not_call_the_tenant_approval_api(world):
    plt = mfa_token(world.u["platform"])
    assert world.client.get(f"{TENANT}/requests", headers=plt).status_code == 404
