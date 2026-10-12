"""
tests/test_notifications.py
---------------------------
ZHR-19 (Super Admin detail view) + ZHR-20 (recipient inbox).

Authorization is the priority: every scoping rule is exercised against a fixed
cast of users across two organizations, and out-of-scope access must be a 404.
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

from app.core.cache_middleware import _should_cache_path
from app.core.dependencies import get_current_user
from app.core.exceptions import ZoikoException, generic_exception_handler, zoiko_exception_handler
from app.core.html_sanitizer import html_to_text, sanitize_html
from app.database import Base, get_db
from app.modules.employee.models import Employee, EmploymentType, EmployeeStatus, UserRole
from app.modules.hr.models import Organization, OrganizationStatus
from app.modules.super_admin import notification_service as svc
from app.modules.super_admin.models import (
    AuditAction, AuditLog, Notification, NotificationRead, NotificationTarget,
)
from app.modules.super_admin.notification_router import recipient_router
from app.modules.super_admin.router import router as super_admin_router


def _employee(db, *, email, role, org_id, created_at=None):
    e = Employee(
        email=email, hashed_password="x", employee_code=f"C-{email}", role=role,
        first_name=email.split("@")[0].title(), last_name="Test", job_title="t",
        employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE,
        date_of_joining=datetime.utcnow().date(), organization_id=org_id,
        created_at=created_at or (datetime.utcnow() - timedelta(days=30)),
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


@pytest.fixture
def world():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine)()

    s.add_all([Organization(id=1, name="Acme Ltd", status=OrganizationStatus.ACTIVE),
               Organization(id=2, name="Globex", status=OrganizationStatus.ACTIVE)])
    s.commit()
    users = {
        "admin1": _employee(s, email="admin1@a.test", role=UserRole.ADMIN, org_id=1),
        "hr1": _employee(s, email="hr1@a.test", role=UserRole.HR_ADMIN, org_id=1),
        "emp1a": _employee(s, email="emp1a@a.test", role=UserRole.EMPLOYEE, org_id=1),
        "emp1b": _employee(s, email="emp1b@a.test", role=UserRole.EMPLOYEE, org_id=1),
        "mgr1": _employee(s, email="mgr1@a.test", role=UserRole.MANAGER, org_id=1),
        "admin2": _employee(s, email="admin2@g.test", role=UserRole.ADMIN, org_id=2),
        "emp2": _employee(s, email="emp2@g.test", role=UserRole.EMPLOYEE, org_id=2),
        "sa": _employee(s, email="root@z.test", role=UserRole.SUPER_ADMIN, org_id=None),
    }

    app = FastAPI()
    app.include_router(super_admin_router)
    app.include_router(recipient_router)
    app.add_exception_handler(ZoikoException, zoiko_exception_handler)
    app.add_exception_handler(Exception, generic_exception_handler)
    box = {"user": users["sa"]}

    def _db():
        yield s

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_current_user] = lambda: box["user"]
    client = TestClient(app, raise_server_exceptions=False)

    class World:
        pass

    w = World()
    w.db, w.client, w.users, w.box = s, client, users, box

    def as_(name):
        box["user"] = users[name]
        return client

    def send(**payload):
        box["user"] = users["sa"]
        payload.setdefault("title", "Hello")
        payload.setdefault("message", "Body text")
        r = client.post("/super-admin/notifications", json=payload)
        assert r.status_code == 200, r.text
        return r.json()["id"]

    w.as_, w.send = as_, send
    w.visible = lambda name: {i["id"] for i in as_(name).get("/notifications").json()["items"]}
    yield w
    s.close()
    engine.dispose()


# ── scoping ──────────────────────────────────────────────────────────────────

class TestScoping:
    def test_direct_user_target_only_reaches_that_user(self, world):
        nid = world.send(target_user_ids=[world.users["emp1a"].id])
        assert nid in world.visible("emp1a")
        for other in ("emp1b", "admin1", "hr1", "mgr1", "admin2", "emp2"):
            assert nid not in world.visible(other), other

    def test_organization_target_defaults_to_org_admins_only(self, world):
        nid = world.send(target_org_ids=[1])
        assert nid in world.visible("admin1") and nid in world.visible("hr1")
        for other in ("emp1a", "emp1b", "mgr1", "admin2", "emp2"):
            assert nid not in world.visible(other), other

    def test_organization_target_all_members_reaches_the_whole_org_only(self, world):
        nid = world.send(target_org_ids=[1], audience="all_members")
        for mine in ("admin1", "hr1", "emp1a", "emp1b", "mgr1"):
            assert nid in world.visible(mine), mine
        for other in ("admin2", "emp2"):
            assert nid not in world.visible(other), other

    def test_multiple_organizations(self, world):
        nid = world.send(target_org_ids=[1, 2])
        assert nid in world.visible("admin1") and nid in world.visible("admin2")
        assert nid not in world.visible("emp2")

    def test_role_target(self, world):
        nid = world.send(target_roles=["employee"])
        for yes in ("emp1a", "emp1b", "emp2"):
            assert nid in world.visible(yes), yes
        for no in ("admin1", "hr1", "mgr1", "admin2"):
            assert nid not in world.visible(no), no

    def test_broadcast_reaches_every_non_super_admin(self, world):
        nid = world.send(target_type="all")
        for name in ("admin1", "hr1", "emp1a", "emp1b", "mgr1", "admin2", "emp2"):
            assert nid in world.visible(name), name

    def test_no_target_means_broadcast(self, world):
        nid = world.send()
        assert nid in world.visible("emp2")

    def test_mixed_targets_are_a_union(self, world):
        nid = world.send(target_org_ids=[1], target_roles=["employee"])
        assert nid in world.visible("admin1")      # org 1 admin
        assert nid in world.visible("emp2")        # employee role, other org
        assert nid not in world.visible("mgr1")    # neither rule
        assert nid not in world.visible("admin2")

    def test_super_admin_is_not_a_recipient(self, world):
        world.send(target_type="all")
        world.as_("sa")
        for path in ("/notifications", "/notifications/unread-count"):
            assert world.client.get(path).status_code == 403
        assert world.client.post("/notifications/read-all").status_code == 403

    def test_account_creation_cutoff(self, world):
        old = world.send(target_type="all")
        # the notification was sent a week ago ...
        world.db.query(Notification).filter_by(id=old).update({"sent_at": datetime.utcnow() - timedelta(days=7)})
        world.db.commit()
        # ... one user joined before it, one joined after
        before = _employee(world.db, email="early@a.test", role=UserRole.EMPLOYEE, org_id=1,
                           created_at=datetime.utcnow() - timedelta(days=10))
        after = _employee(world.db, email="late@a.test", role=UserRole.EMPLOYEE, org_id=1,
                          created_at=datetime.utcnow() - timedelta(days=1))
        world.users.update(early=before, late=after)
        assert old in world.visible("early")
        assert old not in world.visible("late")
        assert world.as_("late").get("/notifications/unread-count").json()["unread_count"] == 0
        assert world.as_("late").get(f"/notifications/{old}").status_code == 404

    def test_system_events_are_never_delivered(self, world):
        n = Notification(title="New Organization Signed Up", message="Acme signed up",
                         notification_type="org_registration", target_type="system",
                         target_org_id=1, target_user_id=world.users["admin1"].id,
                         sent_at=datetime.utcnow())
        n.targets = [NotificationTarget(kind="org", ref="1"),
                     NotificationTarget(kind="user", ref=str(world.users["admin1"].id))]
        world.db.add(n)
        world.db.commit()
        for name in ("admin1", "hr1", "emp1a", "admin2"):
            assert n.id not in world.visible(name), name
        assert world.as_("admin1").get(f"/notifications/{n.id}").status_code == 404

    def test_visibility_matches_admin_recipient_counts(self, world):
        """The Super Admin's recipient_count must equal the number of users for whom
        the notification is actually visible - both sides of the same rules."""
        ids = [
            world.send(target_user_ids=[world.users["emp1a"].id, world.users["emp2"].id]),
            world.send(target_org_ids=[1]),
            world.send(target_org_ids=[1], audience="all_members"),
            world.send(target_roles=["employee", "manager"]),
            world.send(target_org_ids=[2], target_roles=["hr_admin"]),
            world.send(target_type="all"),
        ]
        recipients = [n for n in world.users if n != "sa"]
        for nid in ids:
            actual = sum(1 for name in recipients if nid in world.visible(name))
            world.as_("sa")
            stats = world.client.get(f"/super-admin/notifications/{nid}").json()["stats"]
            assert stats["recipient_count"] == actual, (nid, stats, actual)


# ── read state, counts, bulk ─────────────────────────────────────────────────

class TestReadState:
    def test_unread_count_and_per_recipient_read_state(self, world):
        nid = world.send(target_type="all")
        assert world.as_("emp1a").get("/notifications/unread-count").json()["unread_count"] == 1
        r = world.as_("emp1a").get(f"/notifications/{nid}")
        assert r.status_code == 200 and r.json()["is_read"] is True and r.json()["unread_count"] == 0
        # another user's state is independent
        assert world.as_("emp1b").get("/notifications/unread-count").json()["unread_count"] == 1
        items = world.as_("emp1b").get("/notifications").json()["items"]
        assert items[0]["is_read"] is False
        # persisted (survives "reload")
        assert world.as_("emp1a").get("/notifications").json()["items"][0]["is_read"] is True

    def test_opening_twice_is_idempotent(self, world):
        nid = world.send(target_type="all")
        world.as_("emp1a")
        assert world.client.get(f"/notifications/{nid}").status_code == 200
        assert world.client.get(f"/notifications/{nid}").status_code == 200
        assert world.db.query(NotificationRead).filter_by(notification_id=nid).count() == 1

    def test_mark_read_and_unread_toggle(self, world):
        nid = world.send(target_type="all")
        world.as_("emp1a")
        r = world.client.post(f"/notifications/{nid}/read").json()
        assert r["is_read"] is True and r["unread_count"] == 0
        assert world.client.post(f"/notifications/{nid}/read").json()["unread_count"] == 0  # idempotent
        r = world.client.post(f"/notifications/{nid}/unread").json()
        assert r["is_read"] is False and r["unread_count"] == 1
        assert world.client.post(f"/notifications/{nid}/unread").json()["unread_count"] == 1  # idempotent

    def test_unread_filter_and_pagination(self, world):
        ids = [world.send(title=f"n{i}", target_type="all") for i in range(5)]
        world.as_("emp1a")
        world.client.post(f"/notifications/{ids[0]}/read")
        unread = world.client.get("/notifications", params={"filter": "unread"}).json()
        assert unread["total"] == 4 and ids[0] not in {i["id"] for i in unread["items"]}
        p1 = world.client.get("/notifications", params={"page": 1, "page_size": 2}).json()
        p3 = world.client.get("/notifications", params={"page": 3, "page_size": 2}).json()
        assert p1["total"] == 5 and len(p1["items"]) == 2 and len(p3["items"]) == 1
        assert [i["id"] for i in p1["items"]] == [ids[4], ids[3]]  # newest first
        assert p1["unread_count"] == 4

    def test_mark_all_read_only_affects_the_caller_and_their_scope(self, world):
        mine = world.send(target_type="all")
        also_mine = world.send(target_roles=["employee"])
        not_mine = world.send(target_org_ids=[1])             # admins only
        world.as_("emp1a")
        r = world.client.post("/notifications/read-all").json()
        assert r["updated"] == 2 and r["unread_count"] == 0
        reads = world.db.query(NotificationRead).all()
        assert {(x.notification_id, x.user_id) for x in reads} == {
            (mine, world.users["emp1a"].id), (also_mine, world.users["emp1a"].id)}
        # out-of-scope notification was not touched, other users keep their unread
        assert world.as_("emp1b").get("/notifications/unread-count").json()["unread_count"] == 2
        assert world.as_("admin1").get("/notifications/unread-count").json()["unread_count"] == 2  # all + org
        assert not_mine not in world.visible("emp1a")

    def test_mark_all_read_twice_is_safe(self, world):
        world.send(target_type="all")
        world.as_("emp1a")
        assert world.client.post("/notifications/read-all").json()["updated"] == 1
        assert world.client.post("/notifications/read-all").json()["updated"] == 0


class TestOutOfScopeAccess:
    def test_another_users_notification_is_404_everywhere(self, world):
        nid = world.send(target_user_ids=[world.users["emp1a"].id])
        world.as_("emp1b")
        assert world.client.get(f"/notifications/{nid}").status_code == 404
        assert world.client.post(f"/notifications/{nid}/read").status_code == 404
        assert world.client.post(f"/notifications/{nid}/unread").status_code == 404
        assert world.db.query(NotificationRead).count() == 0

    def test_other_organizations_notification_is_404(self, world):
        nid = world.send(target_org_ids=[1], audience="all_members")
        assert world.as_("emp2").get(f"/notifications/{nid}").status_code == 404

    def test_404_is_identical_for_missing_and_hidden(self, world):
        hidden = world.send(target_user_ids=[world.users["emp1a"].id])
        world.as_("emp1b")
        a = world.client.get(f"/notifications/{hidden}")
        b = world.client.get("/notifications/999999")
        assert a.status_code == b.status_code == 404

    def test_unauthenticated_user_cannot_read(self, world):
        from app.core.exceptions import UnauthorizedException

        def deny():
            raise UnauthorizedException()
        world.client.app.dependency_overrides[get_current_user] = deny
        assert world.client.get("/notifications").status_code == 401

    def test_notification_paths_are_excluded_from_the_shared_response_cache(self):
        # the cache keys per ORGANIZATION; these responses are per USER
        assert _should_cache_path("/notifications") is False
        assert _should_cache_path("/notifications/unread-count") is False
        assert _should_cache_path("/notifications/12") is False


# ── content ──────────────────────────────────────────────────────────────────

class TestContent:
    def test_preview_sender_and_timestamps(self, world):
        world.send(title="Maintenance", message="x " * 200, target_type="all")
        item = world.as_("emp1a").get("/notifications").json()["items"][0]
        assert item["sender_name"] == "Zoiko HR Admin"
        assert len(item["preview"]) <= 140 and item["preview"].endswith("…")
        assert item["sent_at"].endswith("Z") or "+" in item["sent_at"] or item["sent_at"].count(":") >= 2

    def test_recipient_detail_returns_sanitised_html(self, world):
        nid = world.send(
            body_html='<p>Hi <b>there</b></p><script>alert(1)</script><img src=x onerror="alert(2)">'
                      '<a href="javascript:alert(3)">click</a>',
            target_type="all")
        body = world.as_("emp1a").get(f"/notifications/{nid}").json()["body_html"]
        assert "<script" not in body and "onerror" not in body and "javascript:" not in body
        assert "<b>there</b>" in body and "click" in body

    def test_plain_message_is_escaped_not_injected(self, world):
        nid = world.send(message="<img src=x onerror=alert(1)> & more", target_type="all")
        body = world.as_("emp1a").get(f"/notifications/{nid}").json()["body_html"]
        assert "<img" not in body and "&lt;img" in body

    def test_legacy_row_without_content_says_so_instead_of_erroring(self, world):
        n = Notification(title="Old", message="", notification_type="info", target_type="all",
                         sent_at=datetime.utcnow())
        world.db.add(n)
        world.db.commit()
        d = world.as_("emp1a").get(f"/notifications/{n.id}")
        assert d.status_code == 200
        assert d.json()["content_available"] is False
        assert d.json()["content_unavailable_message"] == "Content not available for this notification"
        world.as_("sa")
        assert world.client.get(f"/super-admin/notifications/{n.id}").json()["content_available"] is False


# ── Super Admin side (ZHR-19) ────────────────────────────────────────────────

class TestSuperAdminDetail:
    def test_detail_success_with_resolved_targets_and_stats(self, world):
        nid = world.send(title="Policy update", body_html="<p>Read <i>this</i></p>",
                         target_org_ids=[1, 2], target_roles=["hr_admin"])
        world.as_("emp1a")  # irrelevant to the admin view
        world.as_("sa")
        r = world.client.get(f"/super-admin/notifications/{nid}")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["title"] == "Policy update" and d["sender_name"] == "Zoiko HR Admin"
        assert d["body_html"] == "<p>Read <i>this</i></p>"
        assert {t["label"] for t in d["targets"]} == {"Acme Ltd", "Globex", "Role: HR Admin"}
        assert "Acme Ltd, Globex" in d["target_summary"]
        assert d["channels"] == ["in_app"] and d["status"] == "sent"
        assert d["stats"]["recipient_count"] == 3          # admin1, admin2 + hr1
        assert d["stats"]["read_count"] == 0
        world.as_("admin1").get(f"/notifications/{nid}")
        world.as_("sa")
        stats = world.client.get(f"/super-admin/notifications/{nid}").json()["stats"]
        assert stats["read_count"] == 1 and stats["unread_count"] == 2

    def test_broadcast_summary(self, world):
        nid = world.send(target_type="all")
        world.as_("sa")
        assert world.client.get(f"/super-admin/notifications/{nid}").json()["target_summary"] == "All users"

    def test_unknown_id_is_404(self, world):
        world.as_("sa")
        assert world.client.get("/super-admin/notifications/424242").status_code == 404

    @pytest.mark.parametrize("who", ["admin1", "hr1", "emp1a", "mgr1"])
    def test_non_super_admins_get_403(self, world, who):
        nid = world.send(target_type="all")
        world.as_(who)
        assert world.client.get(f"/super-admin/notifications/{nid}").status_code == 403
        assert world.client.get("/super-admin/notifications").status_code == 403
        assert world.client.post("/super-admin/notifications",
                                 json={"title": "x", "message": "y"}).status_code == 403

    def test_list_honours_pagination_and_read_filter(self, world):
        ids = [world.send(title=f"n{i}") for i in range(5)]
        world.db.query(Notification).filter_by(id=ids[0]).update({"is_read": True})
        world.db.commit()
        world.as_("sa")
        p = world.client.get("/super-admin/notifications", params={"page": 2, "page_size": 2}).json()
        assert p["total"] == 5 and len(p["notifications"]) == 2 and p["page"] == 2
        unread = world.client.get("/super-admin/notifications", params={"is_read": False}).json()
        assert unread["total"] == 4
        read = world.client.get("/super-admin/notifications", params={"is_read": True}).json()
        assert [n["id"] for n in read["notifications"]] == [ids[0]]

    def test_list_items_carry_target_summary(self, world):
        world.send(target_org_ids=[1])
        world.as_("sa")
        item = world.client.get("/super-admin/notifications").json()["notifications"][0]
        assert item["target_summary"] == "Acme Ltd (org admins only)"
        assert item["content_available"] is True


class TestCreateValidation:
    def _post(self, world, **body):
        world.as_("sa")
        body.setdefault("title", "T")
        body.setdefault("message", "M")
        return world.client.post("/super-admin/notifications", json=body)

    def test_unknown_org_is_400(self, world):
        r = self._post(world, target_org_ids=[999])
        assert r.status_code == 400 and "999" in r.json()["message"]

    def test_unknown_role_and_super_admin_role_are_400(self, world):
        assert self._post(world, target_roles=["wizard"]).status_code == 400
        assert self._post(world, target_roles=["super_admin"]).status_code == 400

    def test_cannot_target_a_super_admin_user(self, world):
        assert self._post(world, target_user_ids=[world.users["sa"].id]).status_code == 400

    def test_blank_title_or_body_is_rejected(self, world):
        assert self._post(world, title="   ").status_code == 400
        assert self._post(world, message="  ", body_html=None).status_code == 400

    def test_selected_type_without_ids_is_400(self, world):
        assert self._post(world, target_type="organization").status_code == 400

    def test_bad_audience_is_400(self, world):
        assert self._post(world, target_org_ids=[1], audience="everyone").status_code == 400

    def test_html_is_sanitised_before_it_is_stored(self, world):
        r = self._post(world, body_html="<p>ok</p><script>steal()</script>", message="")
        assert r.status_code == 200
        n = world.db.get(Notification, r.json()["id"])
        assert n.body_html == "<p>ok</p>" and n.message == "ok"

    def test_audit_row_points_at_the_notification_and_is_atomic(self, world):
        nid = world.send(title="Audited", target_org_ids=[1])
        log = world.db.query(AuditLog).filter_by(entity_type="Notification").one()
        assert log.entity_id == nid and log.action == AuditAction.CREATE
        assert log.performed_by_email == "root@z.test" and log.details["orgs"] == [1]

    def test_legacy_single_target_fields_still_work(self, world):
        r = self._post(world, target_user_id=world.users["emp1a"].id)
        nid = r.json()["id"]
        assert nid in world.visible("emp1a") and nid not in world.visible("emp1b")

    def test_deleting_a_notification_removes_targets_and_reads(self, world):
        nid = world.send(target_org_ids=[1])
        world.as_("admin1").get(f"/notifications/{nid}")
        world.as_("sa")
        assert world.client.delete(f"/super-admin/notifications/{nid}").status_code == 200
        assert world.db.query(NotificationTarget).count() == 0
        assert world.db.query(NotificationRead).count() == 0


# ── sanitizer ────────────────────────────────────────────────────────────────

class TestSanitizer:
    @pytest.mark.parametrize("dirty,forbidden", [
        ("<script>alert(1)</script>", ["script", "alert"]),
        ('<img src=x onerror="alert(1)">', ["img", "onerror"]),
        ('<a href="javascript:alert(1)">x</a>', ["javascript"]),
        ('<a href="  jaVa\tscript:alert(1)">x</a>', ["script:"]),
        ('<a href="data:text/html;base64,AAAA">x</a>', ["data:"]),
        ("<style>body{display:none}</style>hi", ["style", "display"]),
        ('<iframe src="https://evil"></iframe>', ["iframe"]),
        ('<p onclick="x()" style="color:red">t</p>', ["onclick", "style="]),
        ("<svg onload=alert(1)><circle/></svg>", ["svg", "onload"]),
        ("<!--[if IE]><script>x</script><![endif]-->ok", ["script", "if IE"]),
        ('<form action="/steal"><input name=p></form>', ["form", "input"]),
    ])
    def test_dangerous_markup_is_removed(self, dirty, forbidden):
        out = sanitize_html(dirty).lower()
        for bad in forbidden:
            assert bad.lower() not in out, (dirty, out)

    def test_safe_formatting_and_links_survive(self):
        out = sanitize_html('<p>Hi <strong>you</strong> <a href="https://zoikohr.com/x?a=1&b=2">link</a></p>')
        assert "<strong>you</strong>" in out
        assert 'href="https://zoikohr.com/x?a=1&amp;b=2"' in out
        assert 'rel="noopener noreferrer nofollow"' in out

    def test_unclosed_and_misnested_tags_are_repaired(self):
        assert sanitize_html("<p><b>bold") == "<p><b>bold</b></p>"
        assert sanitize_html("<b><i>x</b>") == "<b><i>x</i></b>"

    def test_unknown_tags_are_unwrapped_keeping_text(self):
        assert sanitize_html("<blink>hello</blink>") == "hello"

    def test_text_is_escaped(self):
        assert sanitize_html("1 < 2 & 3") == "1 &lt; 2 &amp; 3"

    def test_html_to_text(self):
        assert html_to_text("<p>One</p><p>Two &amp; three</p>") == "One\nTwo & three"
        assert html_to_text(None) == ""


# ── guard against accidental broadcasts ──────────────────────────────────────

def test_every_notification_creator_states_its_audience_explicitly():
    """The column default is target_type='all' (a platform-wide broadcast). Any code
    that builds a Notification must therefore choose its audience on purpose - the
    signup event once relied on the default and would have gone to every user."""
    import ast

    root = pathlib.Path(__file__).resolve().parent.parent / "app"
    offenders, internal_ok = [], []
    for path in root.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and getattr(node.func, "id", None) == "Notification":
                kwargs = {k.arg: k.value for k in node.keywords}
                if "target_type" not in kwargs:
                    offenders.append(f"{path.relative_to(root)}:{node.lineno}")
                elif (isinstance(kwargs.get("notification_type"), ast.Constant)
                      and kwargs["notification_type"].value == "org_registration"):
                    internal_ok.append(ast.literal_eval(kwargs["target_type"]))
    assert not offenders, f"Notification() without an explicit target_type: {offenders}"
    assert internal_ok and all(t == "system" for t in internal_ok), internal_ok
