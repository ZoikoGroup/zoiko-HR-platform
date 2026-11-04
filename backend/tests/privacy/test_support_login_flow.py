"""Temporary read-only support sign-ins: operator asks, an org admin approves, the operator gets one-time credentials that
sign in to that organization for 5/15/30 minutes, read-only, revocable by the tenant, and logged."""
from datetime import datetime, timedelta

import pytest
from sqlalchemy.orm import sessionmaker

from app.modules.support_login import gate
from app.modules.support_login.models import SupportLoginAccessLog, SupportLoginRequest, SupportLoginSession


@pytest.fixture
def w(world, monkeypatch):
    factory = sessionmaker(bind=world.db.get_bind(), expire_on_commit=False)
    monkeypatch.setattr(gate, "_session_factory", factory)
    monkeypatch.setattr("app.services.email_service.send_support_login_requested", lambda *a, **k: True)
    return world


def _ask(w, org_id=1, minutes=15):
    r = w.post("platform", "/support-access/requests", json={
        "organization_id": org_id, "justification": "Customer reports payroll page error", "ticket_reference": "T-42",
        "duration_minutes": minutes})
    assert r.status_code == 200, r.text
    return r.json()


def _approved_credentials(w, minutes=15):
    req = _ask(w, minutes=minutes)
    r = w.post("a_admin", f"/org/me/support-access/requests/{req['id']}/approve", json={"note": "ok"})
    assert r.status_code == 200, r.text
    r = w.post("platform", f"/support-access/requests/{req['id']}/credentials")
    assert r.status_code == 200, r.text
    return req, r.json()["credentials"]


def _sign_in(w, creds):
    r = w.client.post("/auth/login", json={"email": creds["username"], "password": creds["password"]})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}, r.json()


def test_full_flow_request_approve_credentials_read_only_session(w):
    req = _ask(w)
    assert req["status"] == "PENDING" and req["reference"].startswith("SLR-")

    # the org admin sees it; another organization does not
    mine = w.get("a_admin", "/org/me/support-access/requests").json()
    assert [r["id"] for r in mine] == [req["id"]]
    assert w.get("b_admin", "/org/me/support-access/requests").json() == []
    assert w.post("b_admin", f"/org/me/support-access/requests/{req['id']}/approve", json={}).status_code == 404

    # no credentials before approval
    assert w.post("platform", f"/support-access/requests/{req['id']}/credentials").status_code == 400

    assert w.post("a_admin", f"/org/me/support-access/requests/{req['id']}/approve", json={}).json()["status"] == "APPROVED"
    out = w.post("platform", f"/support-access/requests/{req['id']}/credentials").json()
    creds = out["credentials"]
    assert out["status"] == "ACTIVE" and creds["username"].endswith("@support.zoikohr.com") and len(creds["password"]) >= 12
    # shown once: never again in a listing, and only once can they be generated
    listing = w.get("platform", "/support-access/requests").json()
    assert creds["password"] not in str(listing)
    assert w.post("platform", f"/support-access/requests/{req['id']}/credentials").status_code == 400

    headers, signed = _sign_in(w, creds)
    assert signed["employee"]["id"] == w.u["a_admin"].id

    # reads of the tenant's workspace work
    assert w.client.get("/auth/me", headers=headers).status_code == 200
    info = w.client.get("/auth/support-session", headers=headers).json()
    assert info["read_only"] is True and 0 < info["seconds_remaining"] <= 15 * 60
    assert w.client.get("/org/me/support-access/requests", headers=headers).status_code == 200

    # every write is refused, whatever the route
    for method, url in (("post", "/hr/departments"), ("put", "/auth/me"), ("delete", "/hr/departments/1"),
                        ("post", f"/org/me/support-access/requests/{req['id']}/revoke"), ("post", "/auth/change-password")):
        r = w.client.request(method.upper(), url, headers=headers, json={})
        assert r.status_code == 403 and r.json()["error_code"] == "SUPPORT_SESSION_READ_ONLY", (method, url, r.text)

    # the tenant sees what was opened, including the refused writes
    log = w.get("a_admin", f"/org/me/support-access/requests/{req['id']}/activity").json()
    assert any(e["path"] == "/org/me/support-access/requests" and e["outcome"] == "allowed" for e in log)
    assert any(e["outcome"] == "blocked_write" for e in log)

    # the tenant revokes: the very next request is refused
    assert w.post("a_admin", f"/org/me/support-access/requests/{req['id']}/revoke").json()["status"] == "REVOKED"
    r = w.client.get("/auth/me", headers=headers)
    assert r.status_code == 401 and r.json()["error_code"] == "SUPPORT_SESSION_ENDED"
    assert w.client.post("/auth/login", json={"email": creds["username"], "password": creds["password"]}).status_code == 401


def test_session_ends_when_time_runs_out_and_refresh_stops(w):
    req, creds = _approved_credentials(w, minutes=5)
    headers, signed = _sign_in(w, creds)
    r = w.client.post("/auth/refresh", json={"refresh_token": signed["refresh_token"]})
    assert r.status_code == 200, r.text

    s = w.db.query(SupportLoginSession).filter_by(request_id=req["id"]).one()
    s.expires_at = datetime.utcnow() - timedelta(seconds=1)
    w.db.commit()
    assert w.client.get("/org/me/support-access/requests", headers=headers).status_code == 401
    assert w.client.post("/auth/refresh", json={"refresh_token": signed["refresh_token"]}).status_code == 401
    assert w.get("platform", "/support-access/requests").json()[0]["status"] == "COMPLETED"


def test_rejection_needs_a_reason_and_blocks_credentials(w):
    req = _ask(w)
    assert w.post("a_admin", f"/org/me/support-access/requests/{req['id']}/reject", json={}).status_code == 400
    assert w.post("a_admin", f"/org/me/support-access/requests/{req['id']}/reject", json={"note": " "}).status_code == 400
    assert w.post("a_admin", f"/org/me/support-access/requests/{req['id']}/reject", json={"note": "not now"}).json()["status"] == "REJECTED"
    assert w.post("platform", f"/support-access/requests/{req['id']}/credentials").status_code == 400


def test_only_allowed_durations_and_one_open_request_per_org(w):
    r = w.post("platform", "/support-access/requests", json={"organization_id": 1, "justification": "Investigate an issue", "duration_minutes": 60})
    assert r.status_code == 400
    _ask(w)
    r = w.post("platform", "/support-access/requests", json={"organization_id": 1, "justification": "Investigate an issue", "duration_minutes": 5})
    assert r.status_code == 400


def test_tenant_roles_other_than_admin_cannot_decide_and_tenants_cannot_use_operator_routes(w):
    req = _ask(w)
    assert w.post("a_hr", f"/org/me/support-access/requests/{req['id']}/approve", json={}).status_code == 403
    assert w.post("a_admin", "/support-access/requests", json={"organization_id": 1, "justification": "x" * 12, "duration_minutes": 5}).status_code == 403
    assert w.get("a_admin", "/support-access/requests").status_code == 403


def test_operator_logout_ends_the_session(w):
    req, creds = _approved_credentials(w)
    headers, _ = _sign_in(w, creds)
    assert w.client.post("/auth/logout", headers=headers).status_code == 200
    assert w.client.get("/auth/me", headers=headers).status_code == 401
    w.db.expire_all()
    assert w.db.get(SupportLoginRequest, req["id"]).status == "COMPLETED"


def test_an_ordinary_admin_token_is_not_read_only(w):
    r = w.get("a_admin", "/auth/support-session")
    assert r.status_code == 401
    assert w.db.query(SupportLoginAccessLog).count() == 0
