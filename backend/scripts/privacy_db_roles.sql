-- ZHR-PRIV-001 C02 / C04 / A02: database roles.
--
-- Run ONCE per database as a superuser (or a role with CREATEROLE), BEFORE `alembic upgrade head`:
--
--   psql "$ADMIN_URL" -v migrator_pw="'...'" -v tenant_pw="'...'" -v platform_pw="'...'" -v jobs_pw="'...'" -v bi_pw="'...'" \
--        -f scripts/privacy_db_roles.sql
--
-- Then run migrations as zhr_migrator (it owns every table), and point the application at the other roles:
--
--   zhr_migrator      owns the tables; used ONLY for migrations; never by the running app
--   zhr_app_tenant    tenant / organization / user API traffic          NOBYPASSRLS, no ownership, subject to RLS
--   zhr_app_platform  platform (super admin) API traffic                NOBYPASSRLS, NO grant on tenant data tables
--   zhr_jobs          background workers (sets app.tenant_id per task)  NOBYPASSRLS, subject to RLS
--   zhr_bi_readonly   BI / reporting: approved aggregate views only     NOBYPASSRLS, NO grant on raw tenant tables
--
-- No role created here is a superuser, owns a table (other than the migrator), or has BYPASSRLS.

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['zhr_migrator', 'zhr_app_tenant', 'zhr_app_platform', 'zhr_jobs', 'zhr_bi_readonly'] LOOP
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION', r);
    ELSE
      EXECUTE format('ALTER ROLE %I NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION', r);
    END IF;
  END LOOP;
END $$;

ALTER ROLE zhr_migrator     PASSWORD :migrator_pw;
ALTER ROLE zhr_app_tenant   PASSWORD :tenant_pw;
ALTER ROLE zhr_app_platform PASSWORD :platform_pw;
ALTER ROLE zhr_jobs         PASSWORD :jobs_pw;
ALTER ROLE zhr_bi_readonly  PASSWORD :bi_pw;

-- the migrator owns the schema objects; nobody else can create in public
GRANT CREATE, USAGE ON SCHEMA public TO zhr_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO zhr_app_tenant, zhr_app_platform, zhr_jobs, zhr_bi_readonly;

-- tables created later by the migrator are usable by the runtime roles per `scripts/privacy_apply_rls.py`, which re-issues the
-- per-table GRANTs and policies after every migration run.
