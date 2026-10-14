# Database roles

## Today (could not be inspected)
`backend/.env` points at a remote PostgreSQL that looks live. It was deliberately not connected to. What is believed from the code: the application connects with one role (the one in `HR_DATABASE_URL`), that role created and owns the tables (`create_all` / Alembic), and no row-level security existed before this work. **Status: unverified (U).** Run these as an administrator and record the answer here:

```sql
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles ORDER BY 1;
SELECT DISTINCT tableowner FROM pg_tables WHERE schemaname = 'public';
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND rowsecurity;
```

## Target (scripts/privacy_db_roles.sql)
| Role | Purpose | Owns tables | BYPASSRLS | Tenant data tables |
|---|---|---|---|---|
| `zhr_migrator` | migrations only | yes | no | owner |
| `zhr_app_tenant` | tenant / organization / user API | no | no | read/write, bound by row-level security |
| `zhr_app_platform` | platform (super admin) API | no | no | **no grant at all** |
| `zhr_jobs` | background workers | no | no | read/write, bound by row-level security |
| `zhr_bi_readonly` | BI | no | no | no grant (approved aggregate views only) |

Policies: `core/privacy/rls.py` (162 tables). Applied by migration `d5e6f7a8b9c0` (ENABLE, not FORCE) and re-applied by `scripts/privacy_apply_rls.py`. `FORCE` is opt-in (`HR_RLS_FORCE=true` or `--force`) because it also binds the table owner, which would blank the application while it still connects as the owner. Composite (reference, organization) foreign keys: migration `e6f7a8b9c0d1`, added NOT VALID; list existing violations with `scripts/privacy_check_cross_tenant.py`, then `VALIDATE CONSTRAINT`.

Proven on a real PostgreSQL 17 by `tests/privacy/test_rls_postgres.py`: no role is a superuser or has BYPASSRLS; only the migrator owns tables; a tenant role sees only its tenant and nothing without one; a cross-tenant write is refused; the platform role is denied on every data table; the BI role is denied on raw tables; `SET LOCAL` does not leak between transactions on a reused connection; FORCE binds the owner; a row cannot reference another tenant's row. The three migrations were also run up, down and up again on PostgreSQL 17.

## Switching the application over (not done)
1. Create the roles, run migrations as `zhr_migrator`, run `privacy_apply_rls.py --grants`.
2. Give the app a tenant engine, a platform engine and a jobs engine, and `SET LOCAL app.tenant_id` / `app.plane` per transaction.
3. Move behind an allow-listed path first: sign-in lookup by e-mail, e-mail uniqueness, platform account management, the schedulers, and the platform's employee counts.
4. Only then turn on FORCE.

Raw SQL in the code (`text(`, `.raw(`, `.extra(`) was found by search; the uses are in the billing reconciliation and report services and run under the same database role as the ORM. They need review when step 2 happens. Django admin does not exist here, and `manage.py shell` has no equivalent: use the migrator role for maintenance, never the application roles.
