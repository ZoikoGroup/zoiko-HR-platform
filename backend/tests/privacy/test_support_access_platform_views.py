"""What the platform's Support Access pages read: the request catalog, the independent-approval queue, organization names
next to tenant ids, and the Billing Ops support-access grant rules (bounded TTL, unknown organization, idempotent revoke)."""
from __future__ import annotations

from tests.privacy.test_support_access_flow import (
    PLATFORM, _approve, _create, _designate, _grant_employee_read, _second_platform, mfa_token,
)


def _export_scope(world):
    return {
        "resources": ["employees"], "record_ids": [world.u["b_emp1"].id], "entity_ids": [], "department_ids": [],
        "jurisdictions": [], "fields": {"employees": ["first_name"]}, "actions": ["read", "export"],
    }


def test_catalog_lists_requestable_fields_and_never_a_secret_column(world):
    r = world.client.get(f"{PLATFORM}/catalog", headers=mfa_token(world.u["platform"]))
    assert r.status_code == 200, r.text
    body = r.json()
    assert "TROUBLESHOOTING" in body["purpose_categories"]
    assert "read" in body["actions"] and "export" in body["high_risk_actions"]
    assert body["duration"]["max"] == 120
    fields = {f["name"]: f["level"] for f in body["resources"][0]["fields"]}
    assert "first_name" in fields
    assert "hashed_password" not in fields and "mfa_secret" not in fields
    assert all(level != "SECRET" for level in fields.values())


def test_catalog_is_platform_only(world):
    r = world.client.get(f"{PLATFORM}/catalog", headers=mfa_token(world.u["a_admin"]))
    assert r.status_code in (401, 403)


def test_high_risk_request_waits_for_another_platform_person(world):
    requester = mfa_token(world.u["platform"])
    _designate(world, 2, "b_admin", "b_admin", ["PERSONAL_BASIC"])
    created = _create(world, requester, _export_scope(world), tenant_id=2)
    assert created.status_code == 201, created.text
    rid = created.json()["id"]
    assert _approve(world, rid, mfa_token(world.u["b_admin"])).status_code == 200

    # the requester never sees their own request in the queue (maker-checker)
    assert world.client.get(f"{PLATFORM}/requests/awaiting-independent", headers=requester).json() == []

    approver = mfa_token(_second_platform(world))
    queue = world.client.get(f"{PLATFORM}/requests/awaiting-independent", headers=approver).json()
    assert [q["id"] for q in queue] == [rid]
    assert queue[0]["required_approvals"] == ["SECURITY"]
    assert queue[0]["approved_types"] == ["TENANT"]
    assert queue[0]["tenant_name"] == "TENANT-B"
    assert queue[0]["purpose"]

    decided = world.client.post(f"{PLATFORM}/requests/{rid}/independent-approve", headers=approver,
                                json={"approval_type": "SECURITY", "decision": "APPROVED"})
    assert decided.status_code == 200, decided.text
    assert decided.json()["status"] == "APPROVED"
    assert world.client.get(f"{PLATFORM}/requests/awaiting-independent", headers=approver).json() == []


def test_platform_lists_carry_the_organization_name(world):
    plt, _rid, _cookie = _grant_employee_read(world)
    grants = world.client.get(f"{PLATFORM}/grants", headers=plt).json()
    requests = world.client.get(f"{PLATFORM}/requests", headers=plt).json()
    assert grants and grants[0]["tenant_name"] == "TENANT-A"
    assert requests and requests[0]["tenant_name"] == "TENANT-A"

    killed = world.client.post(f"{PLATFORM}/kill-switch", headers=plt, json={"scope": "TENANT", "target": "1", "reason": "test"})
    assert killed.status_code == 200 and killed.json()["revoked"] == 1
    revocations = world.client.get(f"{PLATFORM}/revocations", headers=plt).json()
    assert revocations and all(r["tenant_name"] == "TENANT-A" for r in revocations)


# ── Billing Ops support-access grants ────────────────────────────────────────────────────────────────────────────────
def test_billing_grant_ttl_is_bounded_and_the_organization_must_exist(world):
    h = mfa_token(world.u["platform"])
    for ttl in (0, -5, 169):
        r = world.client.post("/billing/support-access", headers=h, json={"organization_id": 1, "reason": "x", "ttl_hours": ttl})
        assert r.status_code == 422, (ttl, r.text)
    r = world.client.post("/billing/support-access", headers=h, json={"organization_id": 999, "reason": "x", "ttl_hours": 2})
    assert r.status_code == 404


def test_billing_grant_shows_the_organization_and_revoke_is_idempotent(world):
    h = mfa_token(world.u["platform"])
    created = world.client.post("/billing/support-access", headers=h, json={"organization_id": 1, "reason": "probe", "ttl_hours": 2})
    assert created.status_code == 200, created.text
    assert created.json()["organization_name"] == "TENANT-A" and created.json()["token"]
    gid = created.json()["id"]

    listed = world.client.get("/billing/support-access", headers=h).json()["list"]
    assert listed[0]["organization_name"] == "TENANT-A"
    paged = world.client.get("/billing/support-access", headers=h, params={"page": 1, "limit": 10}).json()["list"]
    assert paged[0]["organization_name"] == "TENANT-A"

    first = world.client.post(f"/billing/support-access/{gid}/revoke", headers=h).json()
    again = world.client.post(f"/billing/support-access/{gid}/revoke", headers=h).json()
    assert first["revoked_at"] and first["revoked_at"] == again["revoked_at"]
    assert world.client.post("/billing/support-access/99999/revoke", headers=h).status_code == 404
