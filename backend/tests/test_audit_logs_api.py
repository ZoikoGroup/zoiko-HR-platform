"""
tests/test_audit_logs_api.py
----------------------------
ZHR-17 — Super Admin > Audit Logs.

(a) timestamps: API values carry a timezone designator and the UTC instant that
    was stored; (b) filters: each alone, combined (AND), inclusive date bounds
    across timezones, pagination, option source of truth; (c) IPs: stored in
    full, real client behind a trusted proxy, IPv4-mapped normalisation, and the
    spoofing guard.
"""

import pathlib
import sys
from datetime import datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from app.config import settings
from app.core.client_ip import (
    ClientIPMiddleware,
    normalize_ip,
    register_ip_stamping,
    resolve_client_ip,
)
from app.core.dependencies import get_current_user
from app.core.exceptions import ZoikoException, generic_exception_handler, zoiko_exception_handler
from app.database import Base, get_db
from app.modules.billing.models import BillingAuditAction, BillingAuditLog
from app.modules.super_admin.models import AuditAction, AuditLog
from app.modules.super_admin.router import router as super_admin_router


def _with_peer(app, peer):
    """Present requests as coming from `peer` (host, port). Works on every
    Starlette version; TestClient(client=...) only exists in newer ones."""

    async def wrapped(scope, receive, send):
        if scope["type"] in ("http", "websocket"):
            scope = {**scope, "client": peer}
        await app(scope, receive, send)

    return wrapped


class _Caller:
    def __init__(self, role="super_admin"):
        self.email = "root@zoiko.test"
        self.role = role
        self.id = 1
        self.organization_id = None


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine)()

    # The real app, so the platform-wide UTC ("Z") response middleware is in play.
    from app.main import app
    box = {"user": _Caller()}

    def _db():
        yield s

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_current_user] = lambda: box["user"]
    # No `with`: skips the app lifespan (which would connect to the real database).
    c = TestClient(app, raise_server_exceptions=False)
    c.db, c.box = s, box
    yield c
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
    s.close()
    engine.dispose()


def _log(db, *, action=AuditAction.CREATE, entity="Organization", entity_id=1,
         email="a@z.test", ip=None, created=None, details=None):
    row = AuditLog(action=action, entity_type=entity, entity_id=entity_id,
                   performed_by_email=email, ip_address=ip, details=details,
                   created_at=created or datetime.utcnow())
    db.add(row)
    db.commit()
    return row


def _get(client, **params):
    r = client.get("/super-admin/audit-logs", params=params)
    assert r.status_code == 200, r.text
    return r.json()


# ── (a) timestamps ────────────────────────────────────────────────────────────

class TestTimestamps:
    def test_created_at_is_iso8601_with_utc_designator_and_same_instant(self, client):
        stored = datetime(2026, 9, 30, 9, 21, 52, 477219)
        _log(client.db, created=stored)
        value = _get(client)["logs"][0]["created_at"]
        assert value == "2026-09-30T09:21:52.477219Z"
        # a browser/any ISO parser now resolves the exact stored UTC instant
        assert datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None) == stored

    def test_new_entries_are_stamped_in_utc(self, client):
        before = datetime.utcnow() - timedelta(seconds=2)
        row = AuditLog(action=AuditAction.LOGIN, entity_type="User", entity_id=1)
        client.db.add(row)
        client.db.commit()
        client.db.refresh(row)
        after = datetime.utcnow() + timedelta(seconds=2)
        assert row.created_at is not None and before <= row.created_at <= after

    def test_nested_details_timestamps_also_get_designator(self, client):
        _log(client.db, details={"evaluation_ends_at": "2026-10-01T00:00:00"})
        assert _get(client)["logs"][0]["details"]["evaluation_ends_at"].endswith("Z")


# ── (b) filters ───────────────────────────────────────────────────────────────

class TestFilters:
    def _seed(self, db):
        now = datetime(2026, 9, 20, 12, 0, 0)
        _log(db, action=AuditAction.LOGIN, entity="User", entity_id=5, email="alice@x.test",
             ip="203.0.113.7", created=now, details={"note": "first"})
        _log(db, action=AuditAction.CREATE, entity="Organization", entity_id=1, email="bob@x.test",
             ip="198.51.100.4", created=now + timedelta(days=1), details={"organization": "Acme Ltd"})
        _log(db, action=AuditAction.DELETE, entity="Organization", entity_id=2, email="alice@x.test",
             ip="2001:db8::1", created=now + timedelta(days=2))

    def test_each_filter_alone(self, client):
        self._seed(client.db)
        assert _get(client, action="login")["total"] == 1
        assert _get(client, entity_type="Organization")["total"] == 2
        assert _get(client, entity_id=2)["total"] == 1
        assert _get(client, actor="alice")["total"] == 2
        assert _get(client, ip="203.0.113")["total"] == 1
        assert _get(client, search="acme")["total"] == 1  # matches inside details JSON
        assert _get(client, search="bob@x")["total"] == 1

    def test_action_and_entity_type_are_case_insensitive(self, client):
        self._seed(client.db)
        assert _get(client, action="LOGIN")["total"] == 1
        assert _get(client, entity_type="organization")["total"] == 2

    def test_unknown_action_is_a_400_not_a_500(self, client):
        assert client.get("/super-admin/audit-logs", params={"action": "explode"}).status_code == 400

    def test_filters_combine_with_and(self, client):
        self._seed(client.db)
        body = _get(client, actor="alice", entity_type="Organization")
        assert [x["entity_id"] for x in body["logs"]] == [2]
        assert _get(client, actor="bob", action="login")["total"] == 0

    def test_date_range_includes_first_and_last_day(self, client):
        db = client.db
        day = datetime(2026, 9, 10)
        _log(db, entity_id=1, created=day - timedelta(microseconds=1))
        _log(db, entity_id=2, created=day)
        _log(db, entity_id=3, created=day + timedelta(days=1) - timedelta(microseconds=1))
        _log(db, entity_id=4, created=day + timedelta(days=1))
        body = _get(client, created_from="2026-09-10T00:00:00Z", created_before="2026-09-11T00:00:00Z")
        assert sorted(x["entity_id"] for x in body["logs"]) == [2, 3]

    def test_date_bounds_respect_the_viewers_timezone(self, client):
        _log(client.db, entity_id=9, created=datetime(2026, 9, 10, 22, 30))  # 11 Sep 04:00 in UTC+5:30
        # UTC+5:30 viewer asking for "10 Sep" => [09 Sep 18:30Z, 10 Sep 18:30Z): excluded
        assert _get(client, created_from="2026-09-10T00:00:00+05:30",
                    created_before="2026-09-11T00:00:00+05:30")["total"] == 0
        # UTC-8 viewer asking for "10 Sep" => [10 Sep 08:00Z, 11 Sep 08:00Z): included
        assert _get(client, created_from="2026-09-10T00:00:00-08:00",
                    created_before="2026-09-11T00:00:00-08:00")["total"] == 1

    def test_pagination_pages_are_disjoint_and_ordered(self, client):
        base = datetime(2026, 9, 1)
        for i in range(7):
            _log(client.db, entity_id=i, created=base + timedelta(minutes=i))
        p1 = _get(client, page=1, page_size=3)
        p2 = _get(client, page=2, page_size=3)
        p3 = _get(client, page=3, page_size=3)
        ids = [x["entity_id"] for x in p1["logs"] + p2["logs"] + p3["logs"]]
        assert ids == [6, 5, 4, 3, 2, 1, 0]  # newest first, no overlap, nothing lost
        assert p1["total"] == 7 and p2["page"] == 2 and p2["page_size"] == 3

    def test_legacy_limit_param_still_works(self, client):
        for i in range(5):
            _log(client.db, entity_id=i)
        assert len(_get(client, limit=2)["logs"]) == 2

    def test_filter_options_come_from_logged_data(self, client):
        self._seed(client.db)
        opts = client.get("/super-admin/audit-logs/filters").json()
        assert set(opts["entity_types"]) == {"User", "Organization"}
        assert "login" in opts["actions"] and "reactivated" in opts["actions"]
        assert set(opts["actions"]) == {a.value for a in AuditAction}

    def test_non_super_admin_gets_403(self, client):
        client.box["user"] = _Caller(role="employee")
        assert client.get("/super-admin/audit-logs").status_code == 403
        assert client.get("/super-admin/audit-logs/filters").status_code == 403


# ── (c) IPs ───────────────────────────────────────────────────────────────────

class TestClientIP:
    TRUSTED = "10.0.0.0/8"

    @pytest.mark.parametrize("raw,expected", [
        ("::ffff:1.2.3.4", "1.2.3.4"),
        ("1.2.3.4:5678", "1.2.3.4"),
        ("[2001:db8::1]:443", "2001:db8::1"),
        ("  203.0.113.9 ", "203.0.113.9"),
        ("fe80::1%eth0", "fe80::1"),
        ("not-an-ip", None),
        ("", None),
        (None, None),
    ])
    def test_normalize(self, raw, expected):
        assert normalize_ip(raw) == expected

    def test_forwarded_for_used_only_from_trusted_peer(self):
        assert resolve_client_ip("10.0.0.5", "203.0.113.9", self.TRUSTED) == "203.0.113.9"

    def test_untrusted_peer_cannot_spoof_the_header(self):
        assert resolve_client_ip("198.51.100.1", "203.0.113.9", self.TRUSTED) == "198.51.100.1"

    def test_default_trusts_nobody(self):
        assert resolve_client_ip("10.0.0.5", "203.0.113.9", "") == "10.0.0.5"

    def test_chain_walks_right_to_left_past_our_proxies(self):
        # client -> (spoofed) -> edge proxy -> internal proxy
        assert resolve_client_ip("10.0.0.5", "6.6.6.6, 203.0.113.9, 10.0.0.9", self.TRUSTED) == "203.0.113.9"

    def test_mapped_peer_and_hop_are_normalised(self):
        assert resolve_client_ip("::ffff:10.0.0.5", "::ffff:203.0.113.9", self.TRUSTED) == "203.0.113.9"

    def test_full_ipv6_is_not_truncated(self):
        full = "2001:0db8:85a3:0000:0000:8a2e:0370:7334"
        assert normalize_ip(full) == "2001:db8:85a3::8a2e:370:7334"
        assert len(normalize_ip("2001:db8:85a3:1:2:3:4:5")) > 15

    def test_audit_rows_are_stamped_with_the_real_client(self, monkeypatch):
        monkeypatch.setattr(settings, "TRUSTED_PROXIES", self.TRUSTED)
        register_ip_stamping(AuditLog, BillingAuditLog)

        engine = create_engine(
            "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine)
        s = sessionmaker(bind=engine)()

        app = FastAPI()
        app.add_exception_handler(ZoikoException, zoiko_exception_handler)
        app.add_exception_handler(Exception, generic_exception_handler)
        app.add_middleware(ClientIPMiddleware)

        @app.post("/act")
        def act():  # sync route -> threadpool, like the real ones
            s.add(AuditLog(action=AuditAction.UPDATE, entity_type="Thing"))
            s.add(BillingAuditLog(action=BillingAuditAction.REFUND_REQUESTED, entity_type="R"))
            s.commit()
            return {"ok": True}

        with TestClient(_with_peer(app, ("10.0.0.5", 5000))) as c:
            c.post("/act", headers={"X-Forwarded-For": "2001:db8:85a3:1:2:3:4:5, 10.0.0.9"})
        assert s.query(AuditLog).one().ip_address == "2001:db8:85a3:1:2:3:4:5"
        assert s.query(BillingAuditLog).one().ip_address == "2001:db8:85a3:1:2:3:4:5"
        s.close()

    def test_direct_caller_ip_is_recorded_when_no_proxy_configured(self, monkeypatch):
        monkeypatch.setattr(settings, "TRUSTED_PROXIES", "")
        register_ip_stamping(AuditLog)
        engine = create_engine(
            "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine)
        s = sessionmaker(bind=engine)()
        app = FastAPI()
        app.add_middleware(ClientIPMiddleware)

        @app.post("/act")
        def act():
            s.add(AuditLog(action=AuditAction.UPDATE, entity_type="Thing"))
            s.commit()
            return {}

        with TestClient(_with_peer(app, ("::ffff:192.0.2.44", 1))) as c:
            c.post("/act", headers={"X-Forwarded-For": "6.6.6.6"})  # ignored: nobody trusted
        assert s.query(AuditLog).one().ip_address == "192.0.2.44"
        s.close()

    def test_api_returns_the_full_address(self, client):
        full = "2001:db8:85a3:1:2:3:4:5"
        _log(client.db, ip=full)
        assert _get(client)["logs"][0]["ip_address"] == full
