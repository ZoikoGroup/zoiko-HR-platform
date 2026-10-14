"""PostgreSQL role and row-level-security proof (ZHR-PRIV-001 C02, C03, C04, A02; T14).

Needs a real PostgreSQL with a superuser:   HR_PRIVACY_PG_ADMIN_URL=postgresql://postgres@localhost:5432/postgres
(the CI job `privacy-boundary` provides one). Skipped when the variable is not set. Every run creates and drops its own database
and its own roles' memberships; it never touches an existing database.
"""
import os
import uuid
from datetime import date

import pytest

ADMIN_URL = os.environ.get("HR_PRIVACY_PG_ADMIN_URL")
pytestmark = pytest.mark.skipif(not ADMIN_URL, reason="HR_PRIVACY_PG_ADMIN_URL is not set (needs a PostgreSQL superuser)")

PW = {"migrator": "m1", "tenant": "t1", "platform": "p1", "jobs": "j1", "bi": "b1"}
ROLES = ["zhr_migrator", "zhr_app_tenant", "zhr_app_platform", "zhr_jobs", "zhr_bi_readonly"]


def _url(role, pw, db):
    from sqlalchemy.engine import make_url
    u = make_url(ADMIN_URL)
    return u.set(username=role, password=pw, database=db)


@pytest.fixture(scope="module")
def pg():
    from sqlalchemy import create_engine, text
    import app.main  # noqa: F401  (registers every model)
    from app.core.privacy import rls
    from app.database import Base

    admin = create_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    db = "zhr_priv_" + uuid.uuid4().hex[:8]
    with admin.connect() as c:
        c.execute(text(f'CREATE DATABASE "{db}"'))
    from sqlalchemy.engine import make_url
    su = create_engine(make_url(ADMIN_URL).set(database=db), isolation_level="AUTOCOMMIT")
    try:
        with su.connect() as c:
            try:
                c.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            except Exception:
                # a server without pgvector (a local dev install): the one embedding column is created as TEXT instead; nothing
                # here depends on it
                from pgvector.sqlalchemy import Vector
                from sqlalchemy.ext.compiler import compiles

                @compiles(Vector, "postgresql")
                def _vector_as_text(type_, compiler, **kw):
                    return "TEXT"
            pass
        # the real role script, run by psql with test passwords
        import shutil, subprocess
        psql = os.environ.get("HR_PRIVACY_PSQL") or shutil.which("psql") or "C:/Program Files/PostgreSQL/17/bin/psql.exe"
        if not os.path.exists(psql) and not shutil.which(psql):
            pytest.skip("psql is not available to run scripts/privacy_db_roles.sql")
        script = os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "privacy_db_roles.sql")
        done = subprocess.run([psql, str(make_url(ADMIN_URL).set(database=db).render_as_string(hide_password=False)), "-v", "ON_ERROR_STOP=1",
                               "-v", f"migrator_pw='{PW['migrator']}'", "-v", f"tenant_pw='{PW['tenant']}'", "-v", f"platform_pw='{PW['platform']}'",
                               "-v", f"jobs_pw='{PW['jobs']}'", "-v", f"bi_pw='{PW['bi']}'", "-f", script], capture_output=True, text=True)
        assert done.returncode == 0, done.stderr
        with su.connect() as c:
            c.execute(text(f'GRANT CONNECT ON DATABASE "{db}" TO zhr_migrator, zhr_app_tenant, zhr_app_platform, zhr_jobs, zhr_bi_readonly'))
            c.execute(text("GRANT ALL ON SCHEMA public TO zhr_migrator"))
            c.execute(text("ALTER SCHEMA public OWNER TO zhr_migrator"))

        mig = create_engine(_url("zhr_migrator", PW["migrator"], db))
        Base.metadata.create_all(mig)
        plan = rls.policy_plan(Base.metadata)
        with mig.begin() as conn:
            for s in rls.enable_sql(plan) + rls.grants_sql(plan, Base.metadata):
                conn.exec_driver_sql(s)
            major = int(conn.exec_driver_sql("SHOW server_version_num").scalar()) // 10000
            for s in rls.composite_fk_sql(rls.tenant_fk_pairs(Base.metadata), pg_major=major):
                conn.exec_driver_sql(s)
        yield {"db": db, "plan": plan, "mig": mig,
               "tenant": create_engine(_url("zhr_app_tenant", PW["tenant"], db)),
               "platform": create_engine(_url("zhr_app_platform", PW["platform"], db)),
               "bi": create_engine(_url("zhr_bi_readonly", PW["bi"], db)),
               "jobs": create_engine(_url("zhr_jobs", PW["jobs"], db)),
               "rls": rls, "Base": Base}
    finally:
        su.dispose()
        with admin.connect() as c:
            c.execute(text(f'DROP DATABASE IF EXISTS "{db}" WITH (FORCE)'))
        admin.dispose()


@pytest.fixture(scope="module")
def seeded(pg):
    """Two synthetic tenants with people, written by the OWNER (policies are ENABLEd, not FORCEd, so the owner is not bound)."""
    from sqlalchemy.orm import sessionmaker
    from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
    from app.modules.hr.models import EmployeeProfile, Organization, OrganizationStatus
    s = sessionmaker(bind=pg["mig"], expire_on_commit=False)()
    s.add_all([Organization(id=1, name="TENANT-A", organization_name="TENANT-A", status=OrganizationStatus.ACTIVE),
               Organization(id=2, name="TENANT-B", organization_name="TENANT-B", status=OrganizationStatus.ACTIVE)])
    s.commit()
    def emp(email, org, role=UserRole.EMPLOYEE):
        e = Employee(email=email, hashed_password="x", employee_code="C" + email[:2].upper(), role=role, first_name="Syn", last_name="Thetic", job_title="t",
                     employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=org)
        s.add(e); s.commit(); return e
    a1, a2, b1 = emp("a1@tenant-a.example.com", 1), emp("a2@tenant-a.example.com", 1), emp("b1@tenant-b.example.com", 2)
    s.add_all([EmployeeProfile(employee_id=a1.id, organization_id=1, bank_account="CANARY-IBAN-A"), EmployeeProfile(employee_id=b1.id, organization_id=2, bank_account="CANARY-IBAN-B")])
    s.commit()
    s.close()
    return {"a1": a1.id, "b1": b1.id}


def _rows(engine, sql, tenant=None, plane=None):
    from sqlalchemy import text
    with engine.begin() as conn:
        if tenant is not None:
            conn.execute(text("SELECT set_config('app.tenant_id', :t, true)"), {"t": str(tenant)})
        if plane is not None:
            conn.execute(text("SELECT set_config('app.plane', :p, true)"), {"p": plane})
        return conn.execute(text(sql)).fetchall()


def test_no_role_is_superuser_or_bypasses_rls_and_only_the_migrator_owns_tables(pg):
    from sqlalchemy import text
    with pg["mig"].connect() as c:
        rows = c.execute(text("SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = ANY(:r)"), {"r": ROLES}).fetchall()
        assert {r[0] for r in rows} == set(ROLES)
        assert all(not r[1] and not r[2] for r in rows), rows
        owners = {r[0] for r in c.execute(text("SELECT DISTINCT tableowner FROM pg_tables WHERE schemaname = 'public'")).fetchall()}
        assert owners == {"zhr_migrator"}, owners
        sec = {r[0] for r in c.execute(text("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity")).fetchall()}
    assert {p["table"] for p in pg["plan"]} <= sec, "every tenant table has row-level security enabled"


def test_every_tenant_table_has_the_isolation_policy_and_every_tenant_table_is_in_the_plan(pg):
    from sqlalchemy import text
    from app.core.privacy import classification as cls
    with pg["mig"].connect() as c:
        with_policy = {r[0] for r in c.execute(text("SELECT tablename FROM pg_policies WHERE policyname = 'zhr_tenant_isolation'")).fetchall()}
    wanted = {t.name for t in cls.tenant_data_tables(pg["Base"].metadata)}
    assert wanted <= with_policy, sorted(wanted - with_policy)


def test_T14_the_tenant_role_sees_only_its_own_tenant_and_nothing_without_a_tenant(pg, seeded):
    own = _rows(pg["tenant"], "SELECT email FROM employees ORDER BY email", tenant=1)
    assert [r[0] for r in own] == ["a1@tenant-a.example.com", "a2@tenant-a.example.com"]
    other = _rows(pg["tenant"], "SELECT email FROM employees", tenant=2)
    assert [r[0] for r in other] == ["b1@tenant-b.example.com"]
    assert _rows(pg["tenant"], "SELECT email FROM employees") == [], "no tenant context: zero rows, never all rows"
    assert _rows(pg["tenant"], "SELECT email FROM employees", tenant="") == []
    assert _rows(pg["tenant"], "SELECT bank_account FROM employee_profiles", tenant=1) == [("CANARY-IBAN-A",)]
    assert _rows(pg["tenant"], "SELECT count(*) FROM employee_profiles", tenant=99) == [(0,)]


def test_C03_a_tenant_cannot_write_or_move_a_row_into_another_tenant(pg, seeded):
    from sqlalchemy import text
    from sqlalchemy.exc import DBAPIError
    with pytest.raises(DBAPIError):
        with pg["tenant"].begin() as conn:
            conn.execute(text("SELECT set_config('app.tenant_id', '1', true)"))
            conn.execute(text("UPDATE employees SET organization_id = 2 WHERE organization_id = 1"))
    with pg["tenant"].begin() as conn:
        conn.execute(text("SELECT set_config('app.tenant_id', '1', true)"))
        assert conn.execute(text("UPDATE employees SET job_title = 'x' WHERE organization_id = 2")).rowcount == 0, "another tenant's rows are not even visible to update"
        assert conn.execute(text("DELETE FROM employees WHERE organization_id = 2")).rowcount == 0


def test_T14_the_platform_role_is_denied_every_tenant_data_table(pg, seeded):
    from sqlalchemy import text
    from sqlalchemy.exc import DBAPIError
    data_tables = [p["table"] for p in pg["plan"] if p["kind"] == "DATA"]
    assert "employees" in data_tables and "employee_profiles" in data_tables and "hr_documents" in data_tables
    denied = 0
    for t in data_tables:
        try:
            with pg["platform"].begin() as conn:
                conn.execute(text("SELECT set_config('app.plane', 'PLATFORM', true)"))
                conn.execute(text(f'SELECT 1 FROM "{t}" LIMIT 1'))
        except DBAPIError as e:
            assert "permission denied" in str(e).lower(), (t, str(e)[:120])
            denied += 1
    assert denied == len(data_tables), "permission denied on every tenant data table, whatever the session claims"


def test_the_platform_role_reads_control_plane_records_across_tenants_only_as_the_platform(pg, seeded):
    from sqlalchemy import text
    orgs = _rows(pg["platform"], "SELECT id FROM organizations ORDER BY id", plane="PLATFORM")
    assert [r[0] for r in orgs] == [1, 2]
    assert _rows(pg["platform"], "SELECT id FROM organizations") == [], "without saying it is the platform, even the platform role sees nothing"
    # a tenant sees only its own organization row
    assert [r[0] for r in _rows(pg["tenant"], "SELECT id FROM organizations", tenant=1)] == [1]


def test_C04_the_bi_role_has_no_access_to_raw_tenant_tables(pg, seeded):
    from sqlalchemy import text
    from sqlalchemy.exc import DBAPIError
    for t in ("employees", "employee_profiles", "hr_documents", "recruitment_candidates"):
        with pytest.raises(DBAPIError):
            with pg["bi"].begin() as conn:
                conn.execute(text(f'SELECT * FROM "{t}" LIMIT 1'))


def test_set_local_does_not_leak_into_the_next_transaction_on_a_pooled_connection(pg, seeded):
    from sqlalchemy import text
    with pg["tenant"].connect() as conn:
        with conn.begin():
            conn.execute(text("SELECT set_config('app.tenant_id', '1', true)"))
            assert conn.execute(text("SELECT count(*) FROM employees")).scalar() == 2
        with conn.begin():                       # the same connection, next request
            assert conn.execute(text("SELECT count(*) FROM employees")).scalar() == 0
            assert (conn.execute(text("SELECT current_setting('app.tenant_id', true)")).scalar() or "") == ""


def test_force_binds_the_table_owner_too(pg, seeded):
    """Once the app no longer connects as the owner, FORCE closes the last gap: even the owner sees nothing without a tenant."""
    from sqlalchemy import text
    rls = pg["rls"]
    owner_before = _rows(pg["mig"], "SELECT count(*) FROM employees")
    assert owner_before == [(3,)], "ENABLE alone does not bind the owner"
    with pg["mig"].begin() as conn:
        for s in rls.enable_sql(pg["plan"], force=True):
            conn.exec_driver_sql(s)
    try:
        assert _rows(pg["mig"], "SELECT count(*) FROM employees") == [(0,)]
        assert _rows(pg["mig"], "SELECT count(*) FROM employees", tenant=1) == [(2,)]
    finally:
        with pg["mig"].begin() as conn:
            for s in rls.enable_sql(pg["plan"], force=False):
                conn.exec_driver_sql(s)


def test_the_policy_expression_fails_closed_when_the_setting_is_garbage(pg, seeded):
    from sqlalchemy.exc import DBAPIError
    try:
        rows = _rows(pg["tenant"], "SELECT email FROM employees", tenant="not-a-number")
        assert rows == []
    except DBAPIError:
        pass                                      # an error is also a refusal: it never returns another tenant's rows


def test_C03_the_database_refuses_a_row_that_points_into_another_tenant(pg, seeded):
    from sqlalchemy import text
    from sqlalchemy.exc import DBAPIError
    # the owner writes (policies are enabled, not forced): the constraint, not the policy, is what is under test
    with pytest.raises(DBAPIError) as err:
        with pg["mig"].begin() as conn:
            conn.execute(text("INSERT INTO leave_requests (employee_id, organization_id, leave_type, start_date, end_date, days, status) "
                              "VALUES (:e, 1, 'ANNUAL', '2026-01-01', '2026-01-01', 1, 'PENDING')"), {"e": seeded["b1"]})
    assert "foreign key" in str(err.value).lower() or "violates" in str(err.value).lower()
    with pg["mig"].begin() as conn:                                                   # the same tenant is fine
        conn.execute(text("INSERT INTO leave_requests (employee_id, organization_id, leave_type, start_date, end_date, days, status) "
                          "VALUES (:e, 1, 'ANNUAL', '2026-01-01', '2026-01-01', 1, 'PENDING')"), {"e": seeded["a1"]})
