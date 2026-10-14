"""The platform (super admin) never reaches tenant people, finance, customer or file data.

T01  Super admin requests TENANT-A data through every discovered endpoint: closed, zero rows, no metadata.
T02  Super admin guesses TENANT-B ids and keys: the answer is identical to "does not exist".
T18  Tenant finance / customer / file records through platform helpdesk, billing or analytics endpoints: denied.
A01 / A04 / A08 / D01 / D02 / D03 / E01 / E04  platform pages show control-plane data only, minimised.
"""
import json
import re

import pytest

from app.core.privacy.routes import classify_route
from scripts.privacy_endpoint_inventory import inventory
from tests.privacy.support import CANARY, all_canaries_in, token_for

UNKNOWN = "/this/route/does/not/exist-for-sure"


def _fill(path: str) -> str:
    return re.sub(r"\{[^}]+\}", "1", path)


def _routes():
    from app.main import app
    return inventory(app)


def _not_found_body(w, who, method="GET", url=UNKNOWN):
    r = w.client.request(method, url, headers=token_for(w.u[who]))
    return r.status_code, r.json()


# ── T01 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
def test_T01_every_data_plane_route_is_closed_to_a_platform_token(world):
    """Every DATA_PLANE endpoint in the route table, every method: 404 with the body an unknown URL gets. Nothing else."""
    blank = _not_found_body(world, "platform")
    checked = 0
    for r in _routes():
        if r["privacy_class"] != "DATA_PLANE":
            continue
        for method in r["methods"]:
            resp = world.client.request(method, _fill(r["path"]), headers=token_for(world.u["platform"]), json={} if method in ("POST", "PUT", "PATCH") else None)
            assert (resp.status_code, resp.json()) == blank, f"{method} {r['path']} answered {resp.status_code} {resp.text[:120]}"
            assert not all_canaries_in(resp.text)
            checked += 1
    assert checked > 300, "the sweep covered the whole data plane"


def test_T01_a_platform_token_without_a_role_claim_is_stopped_too(world):
    """A refresh-style token carries no role: the dependency applies the same rule from the account's real role."""
    from app.core.security import create_access_token
    u = world.u["platform"]
    token = create_access_token({"sub": u.email, "id": u.id, "organization_id": None})
    r = world.client.get("/hr/employee-management/employees", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 404 and r.json() == {"detail": "Not Found"}


def test_T01_the_platform_cannot_list_or_search_tenant_employees_anywhere_it_can_still_call(world):
    for url in ("/super-admin/users?search=CanaryAlpha", "/super-admin/users?search=canary.a1", f"/super-admin/users?search={CANARY['last_a1']}",
                "/super-admin/audit-logs?search=CanaryAlpha", f"/super-admin/audit-logs?actor={CANARY['email_a1']}",
                "/super-admin/activity?q=CanaryAlpha", f"/super-admin/email-logs?recipient_email={CANARY['email_a1']}"):
        r = world.get("platform", url)
        assert r.status_code == 200, (url, r.status_code)
        assert not all_canaries_in(r.text), url
        body = r.json()
        rows = body.get("users") or body.get("logs") or body.get("events") or body.get("list") or []
        assert not [x for x in rows if x.get("action_type") or x.get("entity_type") == "Employee"] or all(x.get("minimised") or "actor_ref" in x for x in rows), url


# ── T02 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
def test_T02_guessing_ids_and_keys_looks_exactly_like_a_missing_object(world):
    guesses = [f"/hr/employee-management/employees/{world.u['b_emp1'].id}", "/hr/employee-management/employees/987654",
               "/hr/documents/1/download", "/hr/documents/99999/download", "/super-admin/documents/1/download", "/hr/employees/me"]
    answers = set()
    for g in guesses:
        r = world.client.get(g, headers=token_for(world.u["platform"]))
        answers.add((r.status_code, json.dumps(r.json(), sort_keys=True)))
    assert len(answers) == 1, answers
    assert next(iter(answers))[0] == 404


def test_T02_a_decision_is_recorded_for_every_refusal(world):
    from app.core.privacy import policy
    before = len(policy.recent_decisions())
    world.get("platform", "/hr/employee-management/employees/1")
    new = policy.recent_decisions()[before:]
    assert new and new[-1]["decision"] == "DENY" and new[-1]["reason"] == policy.PLATFORM_DATA_PLANE_DENIED and new[-1]["plane"] == "PLATFORM"
    assert not all_canaries_in(json.dumps(new))


# ── D01 / D02: no way in through the control plane ───────────────────────────────────────────────────────────────────
def test_D01_there_is_no_impersonation_or_login_as_route(world):
    paths = " ".join(r["path"] for r in _routes()).lower()
    for word in ("impersonat", "login-as", "login_as", "act-as", "switch-tenant"):
        assert word not in paths


def test_D02_unknown_routes_are_closed_to_the_platform_by_default():
    assert classify_route("/brand-new/people-export") == "DATA_PLANE"
    assert classify_route("/hr/anything") == "DATA_PLANE"
    assert classify_route("/super-admin/documents/5/download") == "DATA_PLANE"
    assert classify_route("/super-admin/organizations") == "CONTROL_PLANE"
    assert classify_route("/billing/plans") == "CONTROL_PLANE"
    assert classify_route("/auth/login") == "AUTH"


# ── E01 / A08 / D03: the control-plane pages that touch tenants ──────────────────────────────────────────────────────
def test_E01_organization_detail_has_no_people_in_it(world):
    r = world.get("platform", "/super-admin/organizations/1")
    assert r.status_code == 200, r.text
    assert not all_canaries_in(r.text)
    body = r.json()
    assert body["admin_name"].startswith("Org Admin #") and "@" in body["admin_email"] and "tenant-a" not in body["admin_email"].split("@")[0]
    assert body["tax_number"] is None
    assert "admin@tenant-a" not in r.text


def test_A08_small_groups_are_never_shown_as_numbers(world, monkeypatch):
    body = world.get("platform", "/super-admin/organizations/1").json()
    assert body["active_employees"] is None and body["active_employees_label"] == "<10"
    assert body["hr_admins"] is None and body["managers"] is None
    listing = world.get("platform", "/super-admin/organizations").json()
    first = (listing.get("organizations") or listing.get("items") or listing)[0]
    assert first["active_employees"] is None and first["active_employees_label"] == "<10"
    stats = world.get("platform", "/super-admin/dashboard/stats").json()
    assert stats["total_admins"] is None and stats["total_hr_admins"] is None and stats["active_employees"] is None
    from app.config import settings
    monkeypatch.setattr(settings, "PRIVACY_MIN_COHORT", 2)
    again = world.get("platform", "/super-admin/organizations/1").json()
    assert again["active_employees"] == 5, "with a lower threshold the real count shows"


def test_E01_the_user_list_is_tenant_admin_accounts_only_pseudonymised(world):
    r = world.get("platform", "/super-admin/users")
    body = r.json()
    assert r.status_code == 200 and body["total"] == 2                          # the two tenant admins, nobody else
    assert all(u["role"] == "admin" and u["first_name"].startswith("Org Admin #") and u["phone"] is None for u in body["users"])
    assert not all_canaries_in(r.text) and "ZZADMIN" not in r.text and "AdminAlpha" not in r.text
    assert world.get("platform", "/super-admin/users?search=CanaryAlpha").json()["total"] == 0


def test_E01_the_activity_feed_names_nobody_and_shows_no_target_or_diff(world):
    r = world.get("platform", "/super-admin/activity")
    assert r.status_code == 200
    text = r.text
    assert not all_canaries_in(text) and "AdminAlpha" not in text and "ZZADMIN" not in text
    events = {e["action_type"]: e for e in r.json()["events"]}
    assert events["employee.added"]["sentence"].startswith("Org Admin #") and "TENANT-A" in events["employee.added"]["sentence"]
    imp = events["employee.bulk_imported"]
    assert imp["sentence"].endswith("(48 succeeded, 2 failed) - failed") and imp["failure_code"] == "DUPLICATE"
    for e in events.values():
        assert not ({"target_label", "changes", "actor_email", "actor_name", "entity_id", "ip_address", "details", "error_message", "actor_id"} & set(e)), e.keys()
    detail = world.get("platform", f"/super-admin/activity/{events['employee.added']['id']}")
    assert detail.status_code == 200 and not all_canaries_in(detail.text)


def test_E01_activity_cannot_be_searched_by_person_or_filtered_by_actor(world):
    for q in ("CanaryAlpha", CANARY["last_a1"], "AdminAlpha", CANARY["email_a1"]):
        r = world.get("platform", f"/super-admin/activity?q={q}")
        assert r.json()["total"] == 0, q
    everything = world.get("platform", "/super-admin/activity").json()["total"]
    assert world.get("platform", f"/super-admin/activity?actor_id={world.u['a_admin'].id}").json()["total"] == everything, "an actor filter does nothing"
    assert "actors" not in world.get("platform", "/super-admin/activity/filters").json()


def test_E01_audit_logs_minimise_tenant_rows_but_keep_platform_actors(world):
    r = world.get("platform", "/super-admin/audit-logs")
    assert r.status_code == 200
    assert not all_canaries_in(r.text) and "ZZADMIN" not in r.text
    logs = r.json()["logs"]
    tenant_rows = [l for l in logs if l.get("minimised")]
    assert len(tenant_rows) == 2 and all(l["ip_address"] is None and l["entity_id"] is None and l["performed_by"] is None for l in tenant_rows)
    platform_rows = [l for l in logs if not l.get("minimised")]
    assert platform_rows and platform_rows[0]["performed_by_email"] == world.u["platform"].email
    assert "admin@tenant-a" not in json.dumps(platform_rows[0]["details"]), "an e-mail inside a platform row's details is masked"
    # person-level probes only match platform rows
    for url in (f"/super-admin/audit-logs?search={CANARY['name_a1']}", f"/super-admin/audit-logs?entity_id={world.u['a_emp1'].id}&entity_type=Employee",
                f"/super-admin/audit-logs?actor={world.u['a_admin'].email}"):
        assert world.get("platform", url).json()["total"] == 0, url


def test_E01_organization_audit_logs_and_login_activity_and_email_logs_are_minimised(world):
    from app.modules.super_admin.models import EmailDeliveryLog, LoginActivity
    world.db.add_all([
        EmailDeliveryLog(recipient_email=CANARY["email_a1"], template_name="welcome.html", status="failed", organization_id=1,
                         subject=f"Welcome {CANARY['name_a1']}", error_message=f"smtp refused {CANARY['email_a1']}", context_data={"first_name": CANARY["name_a1"], "action_url": "https://x/y?token=abc"}),
        LoginActivity(user_id=world.u["a_emp1"].id, email=CANARY["email_a1"], organization_id=1, ip_address="10.0.0.9", user_agent="UA-CANARY", status="failed", failure_reason="bad password for canary"),
        LoginActivity(user_id=world.u["platform"].id, email=world.u["platform"].email, organization_id=None, ip_address="10.0.0.1", status="success"),
    ])
    world.db.commit()
    for url in ("/super-admin/organizations/1/audit-logs", "/super-admin/login-activity", "/super-admin/email-logs"):
        r = world.get("platform", url)
        assert r.status_code == 200, (url, r.text)
        assert not all_canaries_in(r.text) and "UA-CANARY" not in r.text and "token=abc" not in r.text, url
    acts = world.get("platform", "/super-admin/login-activity").json()["activities"]
    assert any(a["email"] == world.u["platform"].email for a in acts), "a platform person's own sign-in is shown plainly"
    assert world.get("platform", f"/super-admin/email-logs?recipient_email={CANARY['email_a1']}").json()["total"] == 1, "the recipient filter is ignored, not a way to probe"


def test_D03_notifications_cannot_be_addressed_to_a_person(world):
    r = world.post("platform", "/super-admin/notifications", json={"title": "Hello", "message": "x", "target_user_ids": [world.u["a_emp1"].id]})
    assert r.status_code == 400 and "individual" in r.text.lower()
    ok = world.post("platform", "/super-admin/notifications", json={"title": "Hello", "message": "x", "target_org_ids": [1]})
    assert ok.status_code in (200, 201), ok.text
    assert not all_canaries_in(ok.text)
    by_plan = world.post("platform", "/super-admin/notifications", json={"title": "Plan note", "message": "x", "target_plans": ["not_assigned"]})
    assert by_plan.status_code in (200, 201), by_plan.text


def test_E04_billing_is_zoikos_own_subscription_billing_only(world):
    """T18: /billing carries Zoiko's subscription billing for the tenant. No table the tenant keeps its own finance in is
    reachable from a billing route, and the people/finance classes are still closed to the platform."""
    from app.core.privacy import classification as c
    for table in ("billing_invoices", "billing_subscriptions", "billing_refund_requests", "billing_plan_changes"):
        assert c.table_default(table) == c.Level.PLATFORM_META, table
    for table in ("employee_compensations", "salary_structures", "travel_expenses", "super_admin_expense_budgets"):
        assert c.table_default(table) in (c.Level.FINANCIAL, c.Level.TENANT_BUSINESS_FINANCE)
    for path in ("/super-admin/expenses/claims", "/super-admin/expenses/by-organization", "/super-admin/expenses/summary", "/hr/compensation/salary-structures"):
        r = world.get("platform", path)
        assert r.status_code == 404, path
    assert not any("expense" in r["path"] and r["privacy_class"] != "DATA_PLANE" for r in _routes())


def test_support_and_documents_and_approvals_are_not_platform_routes(world):
    for path in ("/super-admin/support/tickets", "/super-admin/documents", "/super-admin/approvals", "/super-admin/expenses/claims"):
        assert world.get("platform", path).status_code == 404, path


# ── C01: the tenant is the signed identity, never the request ────────────────────────────────────────────────────────
def test_C01_a_tenant_user_naming_another_organization_gets_the_not_found_answer(world):
    blank = world.client.get(UNKNOWN, headers=token_for(world.u["a_admin"]))
    for param in ("organization_id", "org_id", "tenant_id"):
        r = world.get("a_admin", f"/hr/employee-management/employees?{param}=2")
        assert (r.status_code, r.json()) == (blank.status_code, blank.json()), param
        assert not all_canaries_in(r.text, "name_b1", "last_b1", "email_b1", "iban_b1")
    own = world.get("a_admin", "/hr/employee-management/employees?organization_id=1")
    assert own.status_code == 200


def test_C07_another_tenants_employee_looks_like_a_missing_one(world):
    other = world.get("a_admin", f"/hr/employee-management/employees/{world.u['b_emp1'].id}")
    missing = world.get("a_admin", "/hr/employee-management/employees/987654")
    def shape(r):   # the answer echoes the id that was asked for: take that out, the rest must be identical
        return r.status_code, json.loads(re.sub(r"\d+", "N", r.text))
    assert shape(other) == shape(missing)
    assert not all_canaries_in(other.text, "name_b1", "last_b1", "email_b1", "iban_b1")


def test_a_tenant_admin_still_sees_their_own_people(world):
    r = world.get("a_admin", "/hr/employee-management/employees")
    assert r.status_code == 200
    assert CANARY["name_a1"] in r.text and not all_canaries_in(r.text, "name_b1", "last_b1", "email_b1", "iban_b1")


def test_the_correlation_id_is_on_every_response(world):
    r = world.get("a_admin", "/hr/employee-management/employees")
    assert r.headers.get("x-request-id")
    r2 = world.client.get("/hr/employee-management/employees", headers={"x-request-id": "abc-123", **token_for(world.u["a_admin"])})
    assert r2.headers["x-request-id"] == "abc-123"
    hostile = world.client.get(UNKNOWN, headers={"x-request-id": "bad id\twith spaces"})
    assert hostile.headers["x-request-id"] != "bad id\twith spaces"
