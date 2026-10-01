"""
tests/test_org_activity.py
--------------------------
ZHR-36 â€” Super Admin > Workflows > Activity.

(a) recording: an org admin's actions land in the platform ledger with the right
    organization, actor (name + role), target, changes and status, with secrets
    masked; (b) feed: filters, pagination, option source of truth; (c) access:
    only a super admin may read it; (d) the migration.
"""

import pathlib
import sys
from datetime import date, datetime, timedelta
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from app.core.dependencies import get_current_user
from app.database import Base, get_db
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import Organization, OrganizationStatus
from app.modules.super_admin import activity_service
from app.modules.super_admin.models import AuditLog


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()

    from app.main import app
    box = {"user": None}

    def _db():
        yield s

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_current_user] = lambda: box["user"]
    codes = iter(range(1, 10_000))
    # Postgres advisory lock / real e-mail are not available on SQLite.
    with patch("app.core.code_generation.generate_employee_code", lambda db, organization_id=None: f"EMP-{next(codes):04d}"), \
         patch("app.modules.employee.service._notify_email"):
        c = TestClient(app, raise_server_exceptions=False)
        c.db, c.box = s, box
        yield c
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
    s.close()
    engine.dispose()


_n = [0]


def _org(db, name):
    o = Organization(name=name, organization_name=name, status=OrganizationStatus.ACTIVE, timezone="UTC")
    db.add(o)
    db.commit()
    return o


def _person(db, org, role, first, last):
    _n[0] += 1
    e = Employee(
        email=f"{first.lower()}.{last.lower()}{_n[0]}@example.com", hashed_password="x",
        employee_code=f"X-{_n[0]:04d}", role=role, first_name=first, last_name=last,
        job_title="Admin", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE,
        date_of_joining=date.today() - timedelta(days=30), organization_id=org.id if org else None,
    )
    db.add(e)
    db.commit()
    return e


def _as(client, user):
    client.box["user"] = user


def _new_emp(email="rahul.mehta@example.com", first="Rahul", last="Mehta"):
    return {"email": email, "password": "TempPass#123", "first_name": first, "last_name": last,
            "job_title": "Engineer", "date_of_joining": "2026-09-01"}


def _feed(client, **params):
    r = client.get("/super-admin/activity", params=params)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture
def world(client):
    db = client.db
    acme, globex = _org(db, "Acme Ltd"), _org(db, "Globex Inc")
    return {
        "acme": acme, "globex": globex,
        "priya": _person(db, acme, UserRole.ADMIN, "Priya", "Shah"),
        "gina": _person(db, globex, UserRole.ADMIN, "Gina", "Lopez"),
        "root": _person(db, None, UserRole.SUPER_ADMIN, "Root", "Admin"),
    }


# â”€â”€ (a) recording â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class TestRecording:
    def test_org_admin_adds_employee(self, client, world):
        _as(client, world["priya"])
        r = client.post("/hr/employee-management/employees", json=_new_emp())
        assert r.status_code == 201, r.text
        _as(client, world["root"])
        events = _feed(client)["events"]
        assert len(events) == 1
        e = events[0]
        assert e["action_type"] == "employee.added"
        assert e["organization_id"] == world["acme"].id and e["organization_name"] == "Acme Ltd"
        assert e["actor_name"] == "Priya Shah" and e["actor_role"] == "admin"
        assert e["status"] == "success"
        assert e["target_label"].startswith("Rahul Mehta")
        assert e["sentence"].startswith("Priya Shah (Org Admin) added employee Rahul Mehta")
        assert e["sentence"].endswith("Acme Ltd")
        assert e["created_at"].endswith("Z")

    def test_password_is_never_stored(self, client, world):
        _as(client, world["priya"])
        client.post("/hr/employee-management/employees", json=_new_emp())
        dump = " ".join(str(r.changes) + str(r.details) + str(r.target_label) for r in client.db.query(AuditLog).all())
        assert "TempPass#123" not in dump

    def test_events_are_attributed_to_the_right_org(self, client, world):
        _as(client, world["priya"])
        client.post("/hr/employee-management/employees", json=_new_emp("a@example.com", "Amy", "One"))
        _as(client, world["gina"])
        client.post("/hr/employee-management/employees", json=_new_emp("b@example.com", "Bob", "Two"))
        _as(client, world["root"])
        acme = _feed(client, organization_id=world["acme"].id)["events"]
        globex = _feed(client, organization_id=world["globex"].id)["events"]
        assert [e["actor_name"] for e in acme] == ["Priya Shah"] and "Amy" in acme[0]["target_label"]
        assert [e["actor_name"] for e in globex] == ["Gina Lopez"] and "Bob" in globex[0]["target_label"]
        assert _feed(client)["total"] == 2

    def test_duplicate_email_is_recorded_as_failed(self, client, world):
        _as(client, world["priya"])
        assert client.post("/hr/employee-management/employees", json=_new_emp()).status_code == 201
        assert client.post("/hr/employee-management/employees", json=_new_emp()).status_code >= 400
        _as(client, world["root"])
        failed = _feed(client, status="failed")["events"]
        assert len(failed) == 1 and failed[0]["action_type"] == "employee.added"
        assert failed[0]["error_message"]
        assert failed[0]["organization_id"] == world["acme"].id

    def test_update_records_before_and_after(self, client, world):
        _as(client, world["priya"])
        emp_id = client.post("/hr/employee-management/employees", json=_new_emp()).json()["id"]
        r = client.put(f"/hr/employee-management/employees/{emp_id}", json={"job_title": "Lead"})
        assert r.status_code == 200, r.text
        _as(client, world["root"])
        ev = _feed(client, action_type="employee.updated")["events"][0]
        change = next(c for c in ev["changes"] if c["field"] == "job_title")
        assert change["before"] == "Engineer" and change["after"] == "Lead"

    def test_deactivate_then_delete(self, client, world):
        _as(client, world["priya"])
        emp_id = client.post("/hr/employee-management/employees", json=_new_emp()).json()["id"]
        assert client.delete(f"/hr/employee-management/employees/{emp_id}").status_code == 200
        assert client.delete(f"/hr/employee-management/employees/{emp_id}").status_code == 200
        _as(client, world["root"])
        types = {e["action_type"] for e in _feed(client)["events"]}
        assert {"employee.added", "employee.deactivated", "employee.deleted"} <= types

    def test_bulk_delete_is_one_grouped_event(self, client, world):
        _as(client, world["priya"])
        ids = [client.post("/hr/employee-management/employees", json=_new_emp(f"u{i}@example.com", f"U{i}", "X")).json()["id"]
               for i in range(3)]
        r = client.post("/hr/employee-management/employees/bulk-delete", json={"ids": ids})
        assert r.status_code == 200, r.text
        _as(client, world["root"])
        grouped = _feed(client, action_type="employee.bulk_removed")["events"]
        assert len(grouped) == 1
        assert grouped[0]["counts"]

    def test_bulk_import_is_one_grouped_event_with_counts(self, client, world):
        import io
        import openpyxl

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["First Name", "Last Name", "Email", "Job Title", "Date of Joining", "Password"])
        ws.append(["Ann", "A", "ann@example.com", "Dev", "2026-09-01", "Passw0rd!x"])
        ws.append(["Ben", "B", "ben@example.com", "Dev", "2026-09-01", "Passw0rd!x"])
        ws.append(["", "", "not-an-email", "", "", ""])
        buf = io.BytesIO()
        wb.save(buf)
        _as(client, world["priya"])
        r = client.post(
            "/hr/employee-management/employees/import",
            files={"file": ("people.xlsx", buf.getvalue(),
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert r.status_code == 200, r.text
        _as(client, world["root"])
        grouped = _feed(client, action_type="employee.bulk_imported")["events"]
        assert len(grouped) == 1
        counts = grouped[0]["counts"]
        assert counts and counts["succeeded"] == 2
        assert counts["failed"] + counts["skipped"] == 1
        # One event for the batch, not one per row.
        assert _feed(client, action_type="employee.added")["total"] == 0

    def test_sensitive_fields_are_masked(self):
        changes = activity_service.diff(
            {"bank_account": "123456789012", "pan_number": "ABCDE1234F", "aadhar_number": "1111", "city": "Pune"},
            {"bank_account": "999999999999", "pan_number": "ZZZZZ9999Z", "aadhar_number": "2222", "city": "Goa"},
        )
        by = {c["field"]: c for c in changes}
        for key in ("bank_account", "pan_number", "aadhar_number"):
            assert "123456789012" not in str(by[key]) and "999999999999" not in str(by[key])
            assert "ABCDE1234F" not in str(by[key]) and "1111" not in str(by[key])
        assert by["city"]["before"] == "Pune" and by["city"]["after"] == "Goa"

    def test_recording_never_breaks_the_action(self, client, world):
        _as(client, world["priya"])
        with patch("app.modules.super_admin.activity_service.AuditLog", side_effect=RuntimeError("ledger down")):
            r = client.post("/hr/employee-management/employees", json=_new_emp())
        assert r.status_code == 201, r.text


# â”€â”€ (b) feed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _seed(db, **kw):
    base = dict(action_type="employee.added", actor_name="Priya Shah", actor_role="admin", status="success",
                target_label="Rahul Mehta (EMP-1)", created_at=datetime.utcnow())
    base.update(kw)
    from app.modules.super_admin.models import AuditAction

    row = AuditLog(action=AuditAction.CREATE, entity_type="Employee", **base)
    db.add(row)
    db.commit()
    return row


class TestFeed:
    def test_filters(self, client, world):
        db, a, g = client.db, world["acme"].id, world["globex"].id
        now = datetime.utcnow()
        _seed(db, organization_id=a, performed_by=world["priya"].id, created_at=now - timedelta(days=10))
        _seed(db, organization_id=a, action_type="leave.approved", status="failed", actor_name="Zed Zee",
              created_at=now - timedelta(days=1))
        _seed(db, organization_id=g, action_type="settings.updated", actor_name="Gina Lopez", target_label="timezone")
        _as(client, world["root"])
        assert _feed(client)["total"] == 3
        assert _feed(client, organization_id=a)["total"] == 2
        assert _feed(client, action_type="leave.approved")["total"] == 1
        assert _feed(client, action_group="Settings")["total"] == 1
        assert _feed(client, actor_id=world["priya"].id)["total"] == 1
        assert _feed(client, actor="gina")["total"] == 1
        assert _feed(client, status="failed")["total"] == 1
        assert _feed(client, q="globex")["total"] == 1
        since = (now - timedelta(days=3)).isoformat() + "Z"
        assert _feed(client, date_from=since)["total"] == 2
        assert _feed(client, date_to=since)["total"] == 1
        assert _feed(client, organization_id=a, status="failed")["total"] == 1  # filters AND together

    def test_bad_inputs_are_400(self, client, world):
        _as(client, world["root"])
        assert client.get("/super-admin/activity", params={"status": "maybe"}).status_code == 400
        assert client.get("/super-admin/activity", params={"action_group": "Nope"}).status_code == 400

    def test_pagination_newest_first(self, client, world):
        now = datetime.utcnow()
        for i in range(5):
            _seed(client.db, organization_id=world["acme"].id, target_label=f"T{i}", created_at=now - timedelta(minutes=5 - i))
        _as(client, world["root"])
        p1 = _feed(client, page=1, page_size=2)
        p3 = _feed(client, page=3, page_size=2)
        assert p1["total"] == 5 and [e["target_label"] for e in p1["events"]] == ["T4", "T3"]
        assert [e["target_label"] for e in p3["events"]] == ["T0"]
        assert client.get("/super-admin/activity", params={"page_size": 101}).status_code == 422

    def test_platform_rows_are_not_activity(self, client, world):
        from app.modules.super_admin.models import AuditAction

        client.db.add(AuditLog(action=AuditAction.CREATE, entity_type="Organization", entity_id=1,
                               performed_by_email="root@example.com"))
        client.db.commit()
        _as(client, world["root"])
        assert _feed(client)["total"] == 0

    def test_filter_options_list_every_organization(self, client, world):
        _org(client.db, "Silent Co")  # no activity at all
        _as(client, world["root"])
        opts = client.get("/super-admin/activity/filters").json()
        assert {"Acme Ltd", "Globex Inc", "Silent Co"} <= {o["name"] for o in opts["organizations"]}
        assert "employee.added" in {t["key"] for t in opts["action_types"]}
        assert opts["statuses"] == ["success", "failed"]

    def test_detail(self, client, world):
        row = _seed(client.db, organization_id=world["acme"].id,
                    changes=[{"field": "job_title", "label": "Job title", "before": "A", "after": "B"}])
        _as(client, world["root"])
        r = client.get(f"/super-admin/activity/{row.id}")
        assert r.status_code == 200 and r.json()["changes"][0]["after"] == "B"
        assert client.get("/super-admin/activity/99999").status_code == 404


# â”€â”€ (c) access control â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class TestAccess:
    PATHS = ["/super-admin/activity", "/super-admin/activity/filters", "/super-admin/activity/1"]

    @pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.HR_ADMIN, UserRole.EMPLOYEE])
    def test_non_super_admins_get_403(self, client, world, role):
        _as(client, _person(client.db, world["acme"], role, "Some", "One"))
        for path in self.PATHS:
            assert client.get(path).status_code == 403, path

    def test_unauthenticated_is_rejected(self, client):
        from app.main import app

        app.dependency_overrides.pop(get_current_user, None)
        for path in self.PATHS:
            assert client.get(path).status_code in (401, 403), path


# â”€â”€ (d) migration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class TestMigration:
    def _load(self):
        import importlib.util

        path = pathlib.Path(__file__).parent.parent / "alembic" / "versions" / "p1c2d3e4f5a1_zhr36_organization_activity.py"
        spec = importlib.util.spec_from_file_location("zhr36_mig", path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod

    def test_upgrade_is_idempotent_backfills_and_downgrade_reverses(self):
        import sqlalchemy as sa
        from alembic.operations import Operations
        from alembic.runtime.migration import MigrationContext

        mod = self._load()
        mod._COLUMNS = [(n, (lambda: sa.Column("organization_id", sa.Integer(), nullable=True)) if n == "organization_id" else m) for n, m in mod._COLUMNS]  # SQLite cannot ALTER in a FK
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.execute(sa.text("CREATE TABLE organizations (id INTEGER PRIMARY KEY)"))
            conn.execute(sa.text(
                "CREATE TABLE super_admin_audit_logs (id INTEGER PRIMARY KEY, entity_type VARCHAR(50), entity_id INTEGER, created_at DATETIME)"))
            conn.execute(sa.text("INSERT INTO organizations (id) VALUES (7)"))
            conn.execute(sa.text("INSERT INTO super_admin_audit_logs (entity_type, entity_id) VALUES ('Organization', 7)"))
            conn.execute(sa.text("INSERT INTO super_admin_audit_logs (entity_type, entity_id) VALUES ('Organization', 99)"))
            conn.execute(sa.text("INSERT INTO super_admin_audit_logs (entity_type, entity_id) VALUES ('Plan', 7)"))
            ctx = MigrationContext.configure(conn)
            with Operations.context(ctx):
                mod.upgrade()
                mod.upgrade()  # second run must be a no-op
                cols = {c["name"] for c in sa.inspect(conn).get_columns("super_admin_audit_logs")}
                assert {n for n, _ in mod._COLUMNS} <= cols
                orgs = [r[0] for r in conn.execute(sa.text("SELECT organization_id FROM super_admin_audit_logs ORDER BY id"))]
                assert orgs == [7, None, None]  # only a real organization is back-filled
                mod.downgrade()
                mod.downgrade()
                cols = {c["name"] for c in sa.inspect(conn).get_columns("super_admin_audit_logs")}
                assert not ({n for n, _ in mod._COLUMNS} & cols)
