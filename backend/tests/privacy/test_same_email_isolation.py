"""One e-mail address, two organizations, two completely separate accounts (docs/email-identity-per-organization.md).

TENANT-A and TENANT-B each hold an account for TWIN. The TENANT-B account carries canary markers; nothing done with a TENANT-A
token, or to the TENANT-A account, may read, change or reveal it.
"""
import re

import pytest
from sqlalchemy import text

from app.core.security import decode_access_token, hash_password, verify_password
from app.modules.employee import identity
from app.modules.employee import service as employee_service
from app.modules.employee.models import Employee, UserRole
from tests.privacy.support import _emp as _support_emp, token_for

_codes = iter(range(1, 10_000))


def _emp(db, email, role, org, first, last, **extra):
    """support._emp, with a unique employee code (it derives the code from the address, and here addresses repeat)."""
    from datetime import date
    from app.modules.employee.models import EmployeeStatus, EmploymentType
    from tests.privacy.support import PW
    e = Employee(email=email, hashed_password=hash_password(PW), employee_code=f"TW-{next(_codes):05d}", role=role,
                 first_name=first, last_name=last, job_title="t", is_active=True, employment_type=EmploymentType.FULL_TIME,
                 status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=org, email_verified=True, **extra)
    db.add(e)
    db.commit()
    return e

TWIN = "twin@shared-co.example.com"
PW_A, PW_B = "AlphaTwin1", "BravoTwin2"
B_MARKERS = ("TwinBravo", "ZZTWINB", "+000-TWIN-B", "765432")
SNAPSHOT_COLUMNS = ("email", "hashed_password", "first_name", "last_name", "role", "status", "is_active", "phone", "job_title",
                    "must_change_password", "password_changed_at", "mfa_enabled", "mfa_secret", "organization_id",
                    "email_verified", "basic_salary")


@pytest.fixture
def twins(world):
    a = _emp(world.db, TWIN, UserRole.EMPLOYEE, 1, "TwinAlpha", "ZZTWINA")
    b = _emp(world.db, TWIN, UserRole.EMPLOYEE, 2, "TwinBravo", "ZZTWINB", phone="+000-TWIN-B", basic_salary=765432)
    a.hashed_password, b.hashed_password = hash_password(PW_A), hash_password(PW_B)
    world.db.commit()
    world.u["a_twin"], world.u["b_twin"] = a, b
    return a, b


def _snapshot(db, employee_id):
    row = db.execute(text(f"SELECT {', '.join(SNAPSHOT_COLUMNS)} FROM employees WHERE id = :id"), {"id": employee_id}).mappings().first()
    return dict(row) if row else None


def _login(world, password, **extra):
    return world.client.post("/auth/login", json={"email": TWIN, "password": password, **extra})


def _routes(methods):
    from app.main import app
    from scripts.privacy_endpoint_inventory import inventory
    out = []
    for r in inventory(app):
        if r["privacy_class"] != "DATA_PLANE" or not (set(r["methods"]) & methods):
            continue
        if r["path"].startswith(("/hr/employee-management/employees/import", "/hr/employee-management/employees/delete-all",
                                 "/hr/files/signed", "/assistant")):
            continue
        params = re.findall(r"\{([^}]+)\}", r["path"])
        if len(params) <= 1:
            out.append((r["path"], params, sorted(set(r["methods"]) & methods)))
    return out


# ── Reading: lists, search, export, directory, reports, assistant ──────────────────────────────────────────────────────

def test_every_tenant_a_read_route_never_returns_the_tenant_b_twin(world, twins):
    a, b = twins
    routes = _routes({"GET"})
    assert len(routes) > 150
    checked = 0
    for path, params, _m in routes:
        url = path
        for p in params:
            url = url.replace("{" + p + "}", str(b.id))
        for who in ("a_admin", "a_twin"):
            for search in (TWIN, "TwinBravo", "twin"):
                resp = world.get(who, url, params={"search": search, "q": search, "email": TWIN, "per_page": 500})
                assert resp.status_code < 500, (who, url, resp.status_code, resp.text[:200])
                leaked = [m for m in B_MARKERS if m in resp.text]
                assert not leaked, (who, url, leaked)
                checked += 1
    assert checked > 900


def test_the_employee_list_search_finds_the_tenant_a_twin_only(world, twins):
    a, b = twins
    r = world.get("a_admin", "/hr/employee-management/employees", params={"search": TWIN, "per_page": 100})
    assert r.status_code == 200 and "ZZTWINA" in r.text, "positive control: the own-organization account is found"
    assert not any(m in r.text for m in B_MARKERS)


def test_the_employee_export_contains_the_tenant_a_twin_only(world, twins):
    for body in ({}, {"format": "csv"}, {"format": "xlsx"}, {"search": TWIN}):
        r = world.post("a_admin", "/hr/employee-management/export", json=body)
        assert r.status_code < 500, r.text[:200]
        assert not any(m.encode() in r.content for m in B_MARKERS), body


def test_assistant_subject_lookup_refuses_the_tenant_b_twin(world, twins):
    from app.modules.assistant import scope_service
    a, b = twins
    admin = world.u["a_admin"]
    assert scope_service.resolve_authorized_subject(world.db, admin, a.id).id == a.id
    with pytest.raises(Exception):
        scope_service.resolve_authorized_subject(world.db, admin, b.id)


# ── Writing: nothing a TENANT-A token sends touches the TENANT-B twin ──────────────────────────────────────────────────

def test_no_tenant_a_write_route_can_change_the_tenant_b_twin_by_id(world, twins):
    a, b = twins
    before = _snapshot(world.db, b.id)
    payload = {"first_name": "HACKED", "last_name": "HACKED", "email": "hacked@evil.example.com", "role": "admin",
               "status": "inactive", "is_active": False, "phone": "+000", "job_title": "HACKED", "password": "Hacked123",
               "new_password": "Hacked123", "method": "temporary"}
    for path, params, methods in _routes({"PUT", "PATCH", "DELETE", "POST"}):
        if not params:
            continue
        url = path.replace("{" + params[0] + "}", str(b.id))
        for method in methods:
            resp = world.client.request(method, url, json=payload, headers=token_for(world.u["a_admin"]))
            # Known, unrelated bug: a few routes answer a missing object with 500 ("Folder not found", raised as ValueError)
            # instead of 404. Tolerated here (it leaks nothing); any other 500 fails the test.
            known_not_found_500 = resp.status_code == 500 and "not found" in resp.text.lower()
            assert resp.status_code < 500 or resp.status_code == 503 or known_not_found_500, (method, url, resp.status_code, resp.text[:200])
            world.db.rollback()
            world.db.expire_all()
            assert _snapshot(world.db, b.id) == before, (method, url, resp.status_code)
    assert _login(world, PW_B).status_code == 200, "the TENANT-B twin still signs in"


def test_by_email_too_tenant_a_admin_cannot_reach_the_tenant_b_twin(world, twins):
    a, b = twins
    before = _snapshot(world.db, b.id)
    r = world.post("a_admin", "/hr/admin/users", json={"first_name": "Twin", "last_name": "Again", "email": TWIN.upper(), "role": "employee"})
    assert r.status_code == 409 and identity.DUPLICATE_EMAIL_MESSAGE in r.json()["message"], "same organization: refused"
    assert _snapshot(world.db, b.id) == before


def test_no_edit_endpoint_changes_an_accounts_address(world, twins):
    """An account's address is fixed once created: neither the admin edit nor self-service accepts one (the fields are not in
    UserUpdateRequest / EmployeeUpdate / EmployeeSelfUpdate / EmployeeProfileUpdate), so an edit can never collide."""
    a, b = twins
    for who, method, url in (("a_admin", "PUT", f"/hr/admin/users/{a.id}"),
                             ("a_admin", "PUT", f"/hr/employee-management/employees/{a.id}"),
                             ("a_admin", "PUT", f"/hr/employee-management/employees/{a.id}/profile"),
                             ("a_twin", "PUT", "/hr/employees/me")):
        for new in ("admin@tenant-a.example.com", "fresh@shared-co.example.com"):
            resp = world.client.request(method, url, json={"email": new}, headers=token_for(world.u[who]))
            assert resp.status_code < 500, (url, resp.text[:200])
            world.db.expire_all()
            assert world.db.get(Employee, a.id).email == TWIN, (url, new)


# ── Changes to the TENANT-A twin stay in TENANT-A ──────────────────────────────────────────────────────────────────────

def test_password_change_in_a_leaves_b_untouched(world, twins):
    a, b = twins
    before = _snapshot(world.db, b.id)
    r = world.client.post("/auth/change-password", headers=token_for(a), json={"current_password": PW_A, "new_password": "NewAlpha77"})
    assert r.status_code == 200, r.text
    assert _snapshot(world.db, b.id) == before
    assert _login(world, PW_B).status_code == 200 and _login(world, "NewAlpha77").status_code == 200


def test_profile_status_role_changes_in_a_leave_b_untouched(world, twins):
    a, b = twins
    before = _snapshot(world.db, b.id)
    assert world.put("a_admin", f"/hr/admin/users/{a.id}", json={"first_name": "Renamed", "role": "manager"}).status_code < 300
    assert world.put("a_twin", "/hr/employees/me", json={"phone": "+44 20 7946 0000"}).status_code < 500
    assert world.post("a_admin", f"/hr/admin/users/{a.id}/suspend").status_code < 500
    world.db.expire_all()
    assert _snapshot(world.db, b.id) == before


def test_deactivating_or_deleting_a_leaves_b_signing_in(world, twins):
    a, b = twins
    assert world.post("a_admin", f"/hr/admin/users/{a.id}/archive").status_code < 500
    assert world.delete("a_admin", f"/hr/admin/users/{a.id}").status_code < 500
    world.db.expire_all()
    r = _login(world, PW_B)
    assert r.status_code == 200 and decode_access_token(r.json()["access_token"])["organization_id"] == 2
    a_login = _login(world, PW_A)
    assert a_login.status_code == 401, "the removed TENANT-A account no longer signs in"


def test_mfa_on_a_platform_account_leaves_the_same_address_organization_account_untouched(world):
    platform = _emp(world.db, "ops.twin@zoiko-ops.example.com", UserRole.SUPER_ADMIN, None, "Ops", "Twin")
    org_twin = _emp(world.db, "ops.twin@zoiko-ops.example.com", UserRole.EMPLOYEE, 1, "Ops", "Twin")
    before = _snapshot(world.db, org_twin.id)
    r = world.client.post("/auth/mfa/enroll/start", json={"email": "ops.twin@zoiko-ops.example.com", "password": "Passw0rd1"})
    assert r.status_code == 200, r.text
    world.db.expire_all()
    assert world.db.get(Employee, platform.id).mfa_secret, "the platform account got the secret"
    assert _snapshot(world.db, org_twin.id) == before


# ── Security links bind ONE account ────────────────────────────────────────────────────────────────────────────────────

def test_a_reset_link_affects_only_its_account_even_when_replayed_after_the_other_changes(world, twins):
    a, b = twins
    raw, _ = employee_service._issue_action_token(world.db, TWIN, 1, employee_service.SecurityActionPurpose.RESET)
    world.db.commit()
    # the other account changes in the meantime (and gets its own link)
    raw_b, _ = employee_service._issue_action_token(world.db, TWIN, 2, employee_service.SecurityActionPurpose.RESET)
    world.db.commit()
    world.client.post("/auth/reset-password", json={"token": raw_b, "password": "BravoNew88"})
    world.db.expire_all()
    before_b = _snapshot(world.db, b.id)

    assert world.client.post("/auth/reset-password", json={"token": raw, "password": "AlphaNew88"}).status_code == 200
    assert world.client.post("/auth/reset-password", json={"token": raw, "password": "AlphaNew99"}).status_code == 400, "single use"
    world.db.expire_all()
    assert verify_password("AlphaNew88", world.db.get(Employee, a.id).hashed_password)
    assert _snapshot(world.db, b.id) == before_b


def test_an_invite_link_affects_only_its_account(world, twins):
    a, b = twins
    before_a = _snapshot(world.db, a.id)
    raw, _ = employee_service._issue_action_token(world.db, TWIN, 2, employee_service.SecurityActionPurpose.INVITE)
    world.db.commit()
    assert world.client.post("/auth/accept-invite", json={"token": raw, "password": "InviteB123"}).status_code == 200
    world.db.expire_all()
    assert verify_password("InviteB123", world.db.get(Employee, b.id).hashed_password)
    assert _snapshot(world.db, a.id) == before_a


# ── The organization choice ────────────────────────────────────────────────────────────────────────────────────────────

def test_the_selection_token_is_short_lived_single_use_and_bound_to_its_accounts(world, twins):
    a, b = twins
    from app.modules.hr.models import Organization, OrganizationStatus
    from tests.db_backend import sync_sequences
    world.db.add(Organization(id=3, name="TENANT-C", organization_name="TENANT-C", status=OrganizationStatus.ACTIVE))
    world.db.commit()
    sync_sequences(world.db)
    third = _emp(world.db, TWIN, UserRole.EMPLOYEE, 3, "TwinCharlie", "ZZTWINC")      # same address, DIFFERENT password
    a.hashed_password = b.hashed_password = hash_password("SharedPw1")
    world.db.commit()
    r = _login(world, "SharedPw1")
    assert r.status_code == 200 and r.json()["requires_org_selection"]
    tok = r.json()["selection_token"]
    claims = decode_access_token(tok)
    assert claims["exp"] - claims["iat"] <= 300, "five minutes at most"
    assert sorted(claims["eids"]) == sorted([a.id, b.id]) and third.id not in claims["eids"]

    assert world.client.post("/auth/login/select-organization", json={"selection_token": tok, "organization_id": 3}).status_code == 400, \
        "an organization whose password did not match is not on the list"
    assert world.client.post("/auth/login/select-organization", json={"selection_token": tok, "organization_id": 999}).status_code == 400
    ok = world.client.post("/auth/login/select-organization", json={"selection_token": tok, "organization_id": 2})
    assert ok.status_code == 200 and decode_access_token(ok.json()["access_token"])["id"] == b.id
    again = world.client.post("/auth/login/select-organization", json={"selection_token": tok, "organization_id": 1})
    assert again.status_code == 401, "single use: the same token cannot sign in a second time"


def test_an_expired_selection_token_is_refused(world, twins, monkeypatch):
    from datetime import timedelta
    a, b = twins
    a.hashed_password = b.hashed_password = hash_password("SharedPw1")
    world.db.commit()
    monkeypatch.setattr(identity, "SELECTION_TOKEN_TTL", timedelta(seconds=-5))       # minted already expired
    tok = _login(world, "SharedPw1").json()["selection_token"]
    r = world.client.post("/auth/login/select-organization", json={"selection_token": tok, "organization_id": 1})
    assert r.status_code == 401 and r.json()["detail"] == identity.SELECTION_EXPIRED_MESSAGE


def test_a_selection_token_is_not_an_access_or_refresh_token(world, twins):
    a, b = twins
    a.hashed_password = b.hashed_password = hash_password("SharedPw1")
    world.db.commit()
    tok = _login(world, "SharedPw1").json()["selection_token"]
    assert world.client.get("/auth/me", headers={"Authorization": f"Bearer {tok}"}).status_code == 401
    assert world.client.post("/auth/refresh", json={"refresh_token": tok}).status_code == 401


def test_an_org_a_token_cannot_be_turned_into_org_b_by_refresh(world, twins):
    a, b = twins
    from app.core.security import create_access_token
    forged = create_access_token({"sub": TWIN, "id": a.id, "organization_id": 2, "aud": "zoiko-hr", "typ": "refresh"})
    assert world.client.post("/auth/refresh", json={"refresh_token": forged}).status_code == 401
    r = world.client.get("/auth/me", headers=token_for(a))
    assert r.status_code == 200 and "ZZTWINA" in r.text and "ZZTWINB" not in r.text


# ── Sign-in answers reveal nothing about other organizations ───────────────────────────────────────────────────────────

def test_login_errors_are_identical_and_cost_the_same_password_checks(world, twins, monkeypatch):
    import app.core.security as security
    calls = []
    real = security.verify_password
    monkeypatch.setattr(security, "verify_password", lambda p, h: calls.append(1) or real(p, h))

    def attempt(email, pw):
        calls.clear()
        r = world.client.post("/auth/login", json={"email": email, "password": pw})
        return r.status_code, r.json().get("detail"), len(calls)

    unknown = attempt("nobody@shared-co.example.com", "Whatever1")
    single = attempt("admin@tenant-a.example.com", "WrongPass1")
    multi = attempt(TWIN, "WrongPass1")
    assert unknown[:2] == single[:2] == multi[:2] == (401, "Invalid email or password.")
    floor = identity.sign_in_password_checks()
    assert floor == 3
    assert unknown[2] == single[2] == multi[2] == floor, (unknown, single, multi)

    # and a right password costs exactly the same, with one account or with two
    a, b = twins
    calls.clear()
    assert world.client.post("/auth/login", json={"email": "admin@tenant-a.example.com", "password": "Passw0rd1"}).status_code == 200
    one_right = len(calls)
    calls.clear()
    assert world.client.post("/auth/login", json={"email": TWIN, "password": PW_A}).status_code == 200
    assert one_right == len(calls) == floor


def test_an_address_with_more_accounts_than_the_floor_costs_one_check_per_account(world, monkeypatch):
    import app.core.security as security
    monkeypatch.setenv("HR_SIGN_IN_PASSWORD_CHECKS", "2")
    for org in (1, 2):
        _emp(world.db, "many@shared-co.example.com", UserRole.EMPLOYEE, org, "Many", "Accounts")
    _emp(world.db, "many@shared-co.example.com", UserRole.SUPER_ADMIN, None, "Many", "Platform")
    calls = []
    real = security.verify_password
    monkeypatch.setattr(security, "verify_password", lambda p, h: calls.append(1) or real(p, h))
    world.client.post("/auth/login", json={"email": "many@shared-co.example.com", "password": "Wrong1234"})
    assert len(calls) == 3, "above the floor: one check per account (documented)"
