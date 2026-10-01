"""ZHR-35: one soft-delete path for organizations; deleted orgs vanish everywhere,
their users are locked out with a clear message, and restore undoes it."""

import inspect
from datetime import date, datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.exceptions import ZoikoException, zoiko_exception_handler
from app.core.rate_limiter import limiter
from app.core.security import create_access_token, hash_password
from app.database import Base, get_db
from app.modules.employee import router as emp_router
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import AttendanceRecord, Department, Organization, OrganizationStatus
from app.modules.super_admin import models as SAM
from app.modules.super_admin import organization_service as svc
from app.modules.super_admin import router as sa_router_module
from app.modules.super_admin.models import AuditLog

PW = "Passw0rd1"
MSG = "This organization's account has been deactivated. Please contact support."


@pytest.fixture(autouse=True)
def _no_rate_limit():
    limiter.enabled = False
    yield
    limiter.enabled = True


def _emp(db, email, role, org_id, first="Test"):
    e = Employee(
        email=email, hashed_password=hash_password(PW), employee_code=f"C-{email}", role=role, first_name=first,
        last_name=role.value, job_title="t", is_active=True, employment_type=EmploymentType.FULL_TIME,
        status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=org_id,
    )
    db.add(e)
    db.commit()
    return e


def _token(user, iat=None):
    data = {"sub": user.email, "role": user.role.value, "id": user.id, "organization_id": user.organization_id}
    if iat is not None:
        data["iat"] = iat
    return {"Authorization": f"Bearer {create_access_token(data)}"}


@pytest.fixture
def world(monkeypatch):
    monkeypatch.setattr("app.modules.billing.service.evaluation_access_block_reason", lambda db, org_id: None)
    eng = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(eng)
    db = sessionmaker(bind=eng)()
    acme = Organization(id=1, name="Acme", organization_name="Acme Ltd", status=OrganizationStatus.ACTIVE, is_active=True)
    globex = Organization(id=2, name="Globex", organization_name="Globex Inc", status=OrganizationStatus.ACTIVE, is_active=True)
    db.add_all([acme, globex])
    db.commit()
    p = {
        "sa": _emp(db, "root@example.com", UserRole.SUPER_ADMIN, None, "Root"),
        "admin1": _emp(db, "admin1@example.com", UserRole.ADMIN, 1, "Olivia"),
        "emp1": _emp(db, "emp1@example.com", UserRole.EMPLOYEE, 1, "Amy"),
        "gone1": _emp(db, "gone1@example.com", UserRole.EMPLOYEE, 1, "Ned"),  # already inactive before the delete
        "admin2": _emp(db, "admin2@example.com", UserRole.ADMIN, 2, "Grace"),
        "emp2": _emp(db, "emp2@example.com", UserRole.EMPLOYEE, 2, "Bob"),
    }
    p["gone1"].is_active = False
    db.add(Department(name="HR", code="HR1", organization_id=1))
    db.add(AttendanceRecord(employee_id=p["emp1"].id, organization_id=1, date=date.today()))
    db.add(SAM.ApprovalHistory(organization_id=1, action="approved", performed_by=p["sa"].id))
    db.commit()
    app = FastAPI()
    app.include_router(sa_router_module.router)
    app.include_router(emp_router.auth_router)
    app.add_exception_handler(ZoikoException, zoiko_exception_handler)
    app.dependency_overrides[get_db] = lambda: db
    return {"db": db, "c": TestClient(app), "p": p}


def _delete(world, org_id=1, name="Acme Ltd", reason="Contract ended", who="sa"):
    return world["c"].request("DELETE", f"/super-admin/organizations/{org_id}", headers=_token(world["p"][who]),
                              json={"confirm_name": name, "reason": reason})


def _orgs(world, **params):
    r = world["c"].get("/super-admin/organizations", headers=_token(world["p"]["sa"]), params=params)
    assert r.status_code == 200, r.text
    return r.json()


# ───────────────────────── one deletion path ─────────────────────────

def test_there_is_exactly_one_route_and_one_service_for_deleting_an_organization():
    routes = [r for r in sa_router_module.router.routes if "DELETE" in getattr(r, "methods", ()) and "organizations" in r.path]
    assert [r.path for r in routes] == ["/super-admin/organizations/{org_id}"]
    source = inspect.getsource(routes[0].endpoint)
    assert "organization_service.delete_organization" in source and "_teardown_organization" not in source


def test_every_entry_point_goes_through_the_same_service(world, monkeypatch):
    calls = []
    real = svc.delete_organization
    monkeypatch.setattr(svc, "delete_organization", lambda *a, **k: (calls.append(k.get("source", "organizations")), real(*a, **k))[1])
    assert _delete(world, 1).status_code == 200
    assert _delete(world, 2, name="Globex Inc").status_code == 200
    assert len(calls) == 2  # Organizations list, Organization detail and User Management all hit this one endpoint


# ───────────────────────── the delete itself ─────────────────────────

def test_delete_is_soft_and_records_who_when_and_why(world):
    db, p = world["db"], world["p"]
    r = _delete(world)
    assert r.status_code == 200 and "restored" in r.json()["message"]
    org = db.query(Organization).execution_options(include_deleted=True).filter_by(id=1).one()
    assert org.deleted_at is not None and org.deleted_by == p["sa"].id and org.delete_reason == "Contract ended"
    assert org.is_active is False
    ev = [l for l in db.query(AuditLog).all() if (l.details or {}).get("event") == "organization.deleted"][0]
    assert ev.performed_by == p["sa"].id and ev.details["reason"] == "Contract ended" and ev.details["users_deactivated"] == 2 and ev.details["users_total"] == 3


def test_members_are_deactivated_and_other_orgs_and_super_admins_untouched(world):
    db, p = world["db"], world["p"]
    _delete(world)
    for e in db.query(Employee).all():
        db.refresh(e)
    assert [p[k].is_active for k in ("admin1", "emp1", "gone1")] == [False, False, False]
    assert p["admin2"].is_active and p["emp2"].is_active and p["sa"].is_active
    assert p["admin1"].password_changed_at is not None and p["admin2"].password_changed_at is None
    snapshot = db.query(Organization).execution_options(include_deleted=True).filter_by(id=1).one().deletion_snapshot
    assert sorted(snapshot["deactivated_user_ids"]) == sorted([p["admin1"].id, p["emp1"].id])  # not the one already inactive


def test_related_records_are_retained(world):
    db = world["db"]
    before = (db.query(Department).count(), db.query(AttendanceRecord).count(), db.query(SAM.ApprovalHistory).count(),
              db.query(Employee).count())
    _delete(world)
    after = (db.query(Department).count(), db.query(AttendanceRecord).count(), db.query(SAM.ApprovalHistory).count(),
             db.query(Employee).count())
    assert before == after
    assert db.query(AuditLog).count() >= 1


def test_name_confirmation_reason_and_error_cases(world):
    db = world["db"]
    wrong = _delete(world, name="acme")
    assert wrong.status_code == 400 and "exact name" in wrong.json()["message"]
    assert db.query(Organization).filter_by(id=1).one().deleted_at is None
    assert _delete(world, reason=None).status_code == 200
    again = _delete(world)
    assert again.status_code == 400 and "already been deleted" in again.json()["message"]
    assert _delete(world, org_id=999).status_code == 404
    missing = world["c"].request("DELETE", "/super-admin/organizations/2", headers=_token(world["p"]["sa"]), json={})
    assert missing.status_code == 422


def test_deletion_impact_summary(world):
    r = world["c"].get("/super-admin/organizations/1/deletion-impact", headers=_token(world["p"]["sa"])).json()
    assert (r["name"], r["users_total"], r["users_active"]) == ("Acme Ltd", 3, 2)
    assert any("signed out" in e for e in r["effects"]) and r["restore_window_days"] == 90
    assert world["c"].get("/super-admin/organizations/999/deletion-impact", headers=_token(world["p"]["sa"])).status_code == 404


# ───────────────────────── hidden everywhere ─────────────────────────

def test_deleted_org_disappears_from_lists_lookups_stats_and_user_lists(world):
    db, c, p = world["db"], world["c"], world["p"]
    sa = _token(p["sa"])
    assert {o["id"] for o in _orgs(world)["organizations"]} == {1, 2}
    stats_before = c.get("/super-admin/dashboard/stats", headers=sa).json()
    users_before = c.get("/super-admin/users", headers=sa).json()["total"]
    _delete(world)
    assert {o["id"] for o in _orgs(world)["organizations"]} == {2} and _orgs(world)["total"] == 1
    stats = c.get("/super-admin/dashboard/stats", headers=sa).json()
    assert stats["total_organizations"] == stats_before["total_organizations"] - 1
    assert stats["total_employees"] == stats_before["total_employees"] - 3
    users = c.get("/super-admin/users", headers=sa).json()
    assert users["total"] == users_before - 3 and all(u["email"] != "admin1@example.com" for u in users["users"])
    assert c.get("/super-admin/organizations/1", headers=sa).status_code == 404  # detail hidden too
    assert db.query(Organization).filter_by(id=1).first() is None  # global default filter
    assert db.query(Organization).count() == 1
    assert db.query(Organization).execution_options(include_deleted=True).count() == 2


def test_deleted_filter_lists_only_deleted_orgs_with_details(world):
    _delete(world)
    d = _orgs(world, deleted="deleted")
    assert d["total"] == 1 and d["organizations"][0]["id"] == 1
    assert d["organizations"][0]["delete_reason"] == "Contract ended" and d["organizations"][0]["deleted_at"]
    assert {o["id"] for o in _orgs(world, deleted="all")["organizations"]} == {1, 2}
    assert world["c"].get("/super-admin/organizations", headers=_token(world["p"]["sa"]), params={"deleted": "x"}).status_code == 400


# ───────────────────────── sessions and login ─────────────────────────

def test_existing_sessions_and_refresh_tokens_stop_working(world):
    c, p = world["c"], world["p"]
    old_iat = int((datetime.utcnow() - timedelta(minutes=10)).timestamp())
    old_access = _token(p["emp1"], iat=old_iat)
    old_refresh = create_access_token({"sub": p["emp1"].email, "id": p["emp1"].id, "organization_id": 1, "iat": old_iat})
    assert c.get("/auth/me", headers=old_access).status_code == 200
    _delete(world)
    r = c.get("/auth/me", headers=old_access)
    assert r.status_code == 401 and r.json()["message"] == MSG
    r = c.post("/auth/refresh", json={"refresh_token": old_refresh})
    assert r.status_code == 401 and r.json()["message"] == MSG
    # even a brand-new token for a deleted org's user is refused
    assert c.get("/auth/me", headers=_token(p["admin1"])).json()["message"] == MSG


def test_login_for_a_deleted_organization_gives_the_clear_message(world):
    c, p = world["c"], world["p"]
    assert c.post("/auth/login", json={"email": p["emp1"].email, "password": PW}).status_code == 200
    _delete(world)
    for key in ("emp1", "admin1", "gone1"):  # including a user who was inactive before
        r = c.post("/auth/login", json={"email": p[key].email, "password": PW})
        assert r.status_code == 401 and r.json()["message"] == MSG, key
    bad = c.post("/auth/login", json={"email": p["emp1"].email, "password": "wrong-Pass1"})
    assert bad.status_code == 401 and bad.json()["message"] != MSG  # wrong password never reveals the org state


def test_other_organizations_and_super_admins_keep_working(world):
    c, p = world["c"], world["p"]
    _delete(world)
    assert c.post("/auth/login", json={"email": p["emp2"].email, "password": PW}).status_code == 200
    assert c.post("/auth/login", json={"email": p["sa"].email, "password": PW}).status_code == 200
    assert c.get("/auth/me", headers=_token(p["admin2"])).status_code == 200
    assert c.get("/auth/me", headers=_token(p["sa"])).status_code == 200
    # one organization per user today, so there is no multi-organization membership to preserve
    assert len({e.organization_id for e in world["db"].query(Employee).filter_by(email=p["emp2"].email)}) == 1


# ───────────────────────── restore ─────────────────────────

def test_restore_reactivates_exactly_the_users_it_deactivated(world):
    db, c, p = world["db"], world["c"], world["p"]
    old = _token(p["emp1"], iat=int((datetime.utcnow() - timedelta(minutes=5)).timestamp()))
    _delete(world)
    r = c.post("/super-admin/organizations/1/restore", headers=_token(p["sa"]))
    assert r.status_code == 200 and "restored" in r.json()["message"]
    for e in db.query(Employee).all():
        db.refresh(e)
    assert p["admin1"].is_active and p["emp1"].is_active and p["gone1"].is_active is False
    org = db.query(Organization).filter_by(id=1).one()
    assert org.deleted_at is None and org.is_active is True and org.deletion_snapshot is None
    assert {o["id"] for o in _orgs(world)["organizations"]} == {1, 2}
    assert c.get("/super-admin/organizations/1", headers=_token(p["sa"])).status_code == 200
    # sessions stay revoked; users simply sign in again
    assert c.get("/auth/me", headers=old).status_code == 401
    assert c.post("/auth/login", json={"email": p["emp1"].email, "password": PW}).status_code == 200
    assert c.post("/auth/login", json={"email": p["gone1"].email, "password": PW}).status_code == 401  # still inactive
    events = [(l.details or {}).get("event") for l in db.query(AuditLog).all()]
    assert "organization.deleted" in events and "organization.restored" in events


def test_restore_rules(world):
    db, c, p = world["db"], world["c"], world["p"]
    sa = _token(p["sa"])
    assert c.post("/super-admin/organizations/1/restore", headers=sa).status_code == 400  # not deleted
    assert c.post("/super-admin/organizations/999/restore", headers=sa).status_code == 404
    _delete(world)
    org = db.query(Organization).execution_options(include_deleted=True).filter_by(id=1).one()
    org.deleted_at = datetime.utcnow() - timedelta(days=svc.RESTORE_WINDOW_DAYS + 1)
    db.commit()
    r = c.post("/super-admin/organizations/1/restore", headers=sa)
    assert r.status_code == 400 and "restore window" in r.json()["message"]
    assert db.query(Organization).filter_by(id=1).first() is None  # still deleted


# ───────────────────────── authorization ─────────────────────────

def test_only_super_admin_can_delete_restore_or_inspect(world):
    c, p = world["c"], world["p"]
    for who in ("admin1", "emp1"):
        h = _token(p[who])
        assert c.request("DELETE", "/super-admin/organizations/2", headers=h, json={"confirm_name": "Globex Inc"}).status_code in (401, 403)
        assert c.post("/super-admin/organizations/2/restore", headers=h).status_code in (401, 403)
        assert c.get("/super-admin/organizations/2/deletion-impact", headers=h).status_code in (401, 403)
    assert c.request("DELETE", "/super-admin/organizations/2", json={"confirm_name": "Globex Inc"}).status_code == 401
    assert world["db"].query(Organization).count() == 2


def test_real_dependency_rejects_org_roles():
    from app.core.dependencies import get_current_super_admin as real
    from app.core.exceptions import ForbiddenException

    for role in (UserRole.ADMIN, UserRole.HR_ADMIN, UserRole.EMPLOYEE):
        with pytest.raises(ForbiddenException):
            real(current_user=Employee(email="x@example.com", role=role))


# ───────────────────────── data-fix script ─────────────────────────

def test_data_fix_finds_only_unusable_organizations_and_dry_run_changes_nothing(world):
    from scripts.fix_inconsistent_organizations import find_inconsistent

    db, p = world["db"], world["p"]
    assert find_inconsistent(db) == []  # both seeded organizations are healthy
    # org 3: its administrator was hard-deleted (the old User Management path) - only an employee is left
    db.add(Organization(id=3, name="Orphan", organization_name="Orphan Co", status=OrganizationStatus.ACTIVE, is_active=True))
    db.commit()
    _emp(db, "orphan-emp@example.com", UserRole.EMPLOYEE, 3)
    # org 4: no users at all
    db.add(Organization(id=4, name="Empty", organization_name="Empty Co", status=OrganizationStatus.ACTIVE, is_active=True))
    # org 5: every user inactive
    db.add(Organization(id=5, name="Dormant", organization_name="Dormant Co", status=OrganizationStatus.ACTIVE, is_active=True))
    db.commit()
    dormant = _emp(db, "dormant-admin@example.com", UserRole.ADMIN, 5)
    dormant.is_active = False
    db.commit()
    found = {f["id"]: f for f in find_inconsistent(db)}
    assert set(found) == {3, 4, 5}
    assert "no active organization administrator" in found[3]["problem"]
    assert "no users at all" in found[4]["problem"] and "inactive" in found[5]["problem"]
    assert db.query(Organization).count() == 5  # a report changes nothing


def test_data_fix_apply_is_limited_to_approved_ids_and_uses_the_same_soft_delete(world):
    from scripts.fix_inconsistent_organizations import REASON, apply_fix

    db, p = world["db"], world["p"]
    db.add_all([Organization(id=3, name="Orphan", organization_name="Orphan Co", status=OrganizationStatus.ACTIVE, is_active=True),
                Organization(id=4, name="Empty", organization_name="Empty Co", status=OrganizationStatus.ACTIVE, is_active=True)])
    db.commit()
    _emp(db, "orphan-emp@example.com", UserRole.EMPLOYEE, 3)
    done = apply_fix(db, [3, 1], p["sa"].email)  # 1 is healthy: must be skipped even though it was requested
    assert done == [3]
    assert db.query(Organization).filter_by(id=3).first() is None
    assert db.query(Organization).filter_by(id=1).first() is not None and db.query(Organization).filter_by(id=4).first() is not None
    org = db.query(Organization).execution_options(include_deleted=True).filter_by(id=3).one()
    assert org.delete_reason == REASON and org.deleted_by == p["sa"].id
    assert db.query(Employee).filter_by(email="orphan-emp@example.com").one().is_active is False  # retained, deactivated
    with pytest.raises(SystemExit):
        apply_fix(db, [4], p["emp1"].email)  # the actor must be a Super Admin


# ───────────────────────── billing side effects ─────────────────────────

def _subscription(db, org_id, status):
    from app.modules.billing.models import BillingSubscription, SubscriptionStatus

    sub = BillingSubscription(organization_id=org_id, status=SubscriptionStatus(status))
    db.add(sub)
    db.commit()
    return sub


def _sub_status(db, org_id):
    from app.modules.billing.models import BillingSubscription

    db.expire_all()
    return db.query(BillingSubscription).filter_by(organization_id=org_id).one().status.value


@pytest.mark.parametrize("before", ["active", "past_due"])
def test_paying_subscription_is_scheduled_to_cancel_and_restore_puts_it_back(world, before):
    from app.modules.billing.models import BillingAuditLog

    db, c, p = world["db"], world["c"], world["p"]
    _subscription(db, 1, before)
    impact = c.get("/super-admin/organizations/1/deletion-impact", headers=_token(p["sa"])).json()
    assert impact["subscription"]["will_be_scheduled_to_cancel"] is True
    assert any("scheduled to cancel" in e for e in impact["effects"])
    _delete(world)
    assert _sub_status(db, 1) == "cancel_at_period_end"
    snap = db.query(Organization).execution_options(include_deleted=True).filter_by(id=1).one().deletion_snapshot
    assert snap["subscription"]["previous_status"] == before
    audit = db.query(BillingAuditLog).filter_by(organization_id=1).all()
    assert [a.reason for a in audit] == ["Organization deleted"] and audit[0].actor_id == p["sa"].id
    assert c.post("/super-admin/organizations/1/restore", headers=_token(p["sa"])).status_code == 200
    assert _sub_status(db, 1) == before
    assert [a.reason for a in db.query(BillingAuditLog).filter_by(organization_id=1).all()] == ["Organization deleted", "Organization restored"]
    restored = [l for l in db.query(AuditLog).all() if (l.details or {}).get("event") == "organization.restored"][0]
    assert restored.details["subscription_restored"] is True


@pytest.mark.parametrize("status", ["evaluation", "suspended", "canceled", "terminated"])
def test_other_subscriptions_are_left_alone(world, status):
    db, c, p = world["db"], world["c"], world["p"]
    _subscription(db, 1, status)
    impact = c.get("/super-admin/organizations/1/deletion-impact", headers=_token(p["sa"])).json()
    assert impact["subscription"]["will_be_scheduled_to_cancel"] is False
    _delete(world)
    assert _sub_status(db, 1) == status
    c.post("/super-admin/organizations/1/restore", headers=_token(p["sa"]))
    assert _sub_status(db, 1) == status


def test_restore_does_not_override_a_status_billing_changed_in_the_meantime(world):
    db, c, p = world["db"], world["c"], world["p"]
    sub = _subscription(db, 1, "active")
    _delete(world)
    sub.status = type(sub.status)("terminated")  # billing moved on while the organization was deleted
    db.commit()
    c.post("/super-admin/organizations/1/restore", headers=_token(p["sa"]))
    assert _sub_status(db, 1) == "terminated"


def test_no_subscription_is_fine(world):
    r = _delete(world)
    assert r.status_code == 200
    assert world["c"].post("/super-admin/organizations/1/restore", headers=_token(world["p"]["sa"])).status_code == 200


def test_data_fix_script_explains_when_the_database_is_not_migrated_yet(monkeypatch, capsys):
    import app.database as appdb
    from scripts.fix_inconsistent_organizations import main

    old = create_engine("sqlite:///:memory:", poolclass=StaticPool)
    with old.begin() as conn:
        conn.exec_driver_sql("CREATE TABLE organizations (id INTEGER PRIMARY KEY)")  # pre-ZHR-35 shape
    monkeypatch.setattr(appdb, "engine", old)
    assert main([]) == 3
    assert "alembic upgrade head" in capsys.readouterr().err
