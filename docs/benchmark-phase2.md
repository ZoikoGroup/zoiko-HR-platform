# Phase 2 performance work: slow endpoints

## Part A: baseline

**Setup.** Local PostgreSQL 17 (never production), schema = `create_all` from the models + migration-only indexes +
`alembic stamp head` (the same end state as the baseline migration). Data from `backend/scripts/seed_perf_data.py`:
50 organizations (2 soft-deleted), 5,501 employees (org 1 has 600), 18,250 rows each of
`BillableWorkforceSnapshot` / `BillingEntitlementSnapshot` (12 months daily per org), 50,000 audit logs, 11,000 leave
requests, 121,000 attendance rows, invoices and refunds. Server: the real app under uvicorn with
`HR_LOG_QUERY_STATS=true`; client: `scripts/measure_latency.py --scaling --json`, median of 5 calls per endpoint.
HR endpoints run as the HR admin of the 600-person org.

Local queries cost well under a millisecond of network, so **query count** is the number that carries over to the real
database (each sequential query = one round-trip). "N+1" = query count grows with the number of rows returned
(measured at page size 10 vs 100).

### Flagged

| Endpoint | Why |
|---|---|
| `GET /hr/attendance` | 611 queries, 1.3 s: unbounded list + one query per row |
| `GET /super-admin/command-center/commercial-health` | 708 ms: loads every snapshot row (18k) to find the latest per org |
| `GET /hr/attendance/records` | N+1: +90 queries for +90 rows |
| `GET /hr/employee-management/employees` | N+1: 33 queries at 10 rows, +20 at 100 |
| `GET /hr/employees`, `GET /hr/admin/users` | N+1: +13 at 100 rows |
| `GET /super-admin/hub/applications` | 21 queries for a static-sized list |
| `POST /auth/login` | ~300 ms is bcrypt, by design (not a DB cost) |

### Full table

| who | endpoint | status | median ms | queries | DB ms | flag |
|---|---|---|---|---|---|---|
| sa | command-center overview | 200 | 31.8 | 24 | 10.9 |  |
| sa | command-center attention | 200 | 16.3 | 11 | 4.1 |  |
| sa | command-center customer-health | 200 | 12.1 | 6 | 2.5 |  |
| sa | command-center commercial-health | 200 | 708.2 | 14 | 35.2 | >300 ms |
| sa | command-center lifecycle | 200 | 14.6 | 5 | 3.7 |  |
| sa | command-center platform-health | 200 | 12.0 | 3 | 2.1 |  |
| sa | command-center security | 200 | 24.5 | 7 | 11.4 |  |
| sa | command-center audit-logs(8) | 200 | 16.2 | 3 | 6.1 |  |
| sa | org list | 200 | 65.8 | 6 | 9.3 |  |
| sa | org detail | 200 | 17.3 | 5 | 3.7 |  |
| sa | org detail audit-logs | 200 | 11.6 | 4 | 2.6 |  |
| sa | org detail subscription | 200 | 11.3 | 2 | 1.9 |  |
| sa | org detail evaluations | 200 | 10.0 | 2 | 1.8 |  |
| sa | org detail delinquency | 200 | 12.1 | 3 | 2.2 |  |
| sa | users list | 200 | 22.9 | 4 | 11.7 |  |
| sa | audit-log filters | 200 | 15.6 | 2 | 7.9 |  |
| sa | audit-log list(50) | 200 | 17.4 | 3 | 6.0 |  |
| sa | notifications | 200 | 10.3 | 3 | 2.1 |  |
| sa | support access | 200 | 10.6 | 2 | 1.6 |  |
| sa | support tickets | 200 | 14.4 | 3 | 3.8 |  |
| sa | support assignees | 200 | 11.4 | 2 | 2.6 |  |
| sa | documents organizations | 200 | 11.7 | 2 | 1.9 |  |
| sa | platform documents | 200 | 13.3 | 3 | 3.6 |  |
| sa | billing plans | 200 | 10.5 | 2 | 1.7 |  |
| sa | billing discounts | 200 | 12.7 | 2 | 1.8 |  |
| sa | billing delinquency | 200 | 11.9 | 3 | 2.3 |  |
| sa | billing plan-changes | 200 | 13.8 | 4 | 2.9 |  |
| sa | billing evaluations | 200 | 13.4 | 4 | 2.5 |  |
| sa | billing invoices | 200 | 15.9 | 4 | 3.1 |  |
| sa | billing webhook-events | 200 | 10.3 | 2 | 1.7 |  |
| sa | billing reconciliation | 200 | 11.6 | 3 | 2.1 |  |
| sa | refunds list | 200 | 14.6 | 3 | 3.1 |  |
| sa | refunds summary | 200 | 12.9 | 5 | 2.8 |  |
| sa | org picker (200) | 200 | 138.1 | 6 | 15.1 |  |
| sa | expenses categories | 200 | 9.5 | 2 | 1.6 |  |
| sa | expenses summary | 200 | 14.0 | 2 | 2.7 |  |
| sa | expenses by-organization | 200 | 16.2 | 3 | 3.1 |  |
| sa | expenses claims | 200 | 12.7 | 3 | 3.4 |  |
| sa | expenses budgets | 200 | 10.2 | 2 | 2.0 |  |
| sa | activity | 200 | 21.2 | 4 | 9.7 |  |
| sa | hub applications | 200 | 30.6 | 21 | 10.2 |  |
| sa | hub webhooks | 200 | 9.7 | 2 | 1.7 |  |
| sa | hub events | 200 | 11.6 | 3 | 2.3 |  |
| sa | demo requests | 200 | 11.4 | 3 | 2.3 |  |
| sa | pricing requests | 200 | 11.7 | 3 | 2.2 |  |
| org | trivial /auth/me | 200 | 8.2 | 3 | 1.8 |  |
| org | notifications unread | 200 | 11.3 | 2 | 2.3 |  |
| org | employees list(10) | 200 | 39.5 | 33 | 14.0 | N+1 |
| org | employees list(200) | 200 | 87.1 | 53 | 19.8 | N+1 |
| org | employee profile | 200 | 16.4 | 7 | 4.1 |  |
| org | hr employees picker(200) | 200 | 47.8 | 23 | 10.3 |  |
| org | hr departments | 200 | 35.4 | 12 | 17.4 |  |
| org | hr designations | 200 | 16.9 | 5 | 4.7 |  |
| org | hr leaves | 200 | 82.3 | 4 | 7.5 |  |
| org | hr attendance records | 200 | 30.7 | 25 | 9.8 | N+1 |
| org | hr attendance (all) | 200 | 1342.1 | 611 | 153.1 | >300 ms |
| org | hr assets | 200 | 12.7 | 5 | 3.0 |  |
| org | hr documents | 200 | 12.6 | 4 | 2.6 |  |
| org | hr users | 200 | 18.1 | 10 | 4.8 | N+1 |
| org | hr dashboard stats | 200 | 20.1 | 11 | 8.1 |  |
| org | hr organization dashboard | 200 | 30.2 | 12 | 15.4 |  |
| org | hr attendance dashboard | 200 | 66.7 | 13 | 13.1 |  |
| org | hr leaves dashboard | 200 | 18.2 | 10 | 6.2 |  |
| org | hr compensation dashboard | 200 | 15.0 | 10 | 4.1 |  |
| org | hr performance dashboard | 200 | 18.9 | 12 | 5.4 |  |
| org | hr learning dashboard | 200 | 17.9 | 13 | 5.7 |  |
| org | hr recruitment dashboard | 200 | 15.7 | 9 | 4.0 |  |
| org | hr organization | 200 | 14.5 | 7 | 4.7 |  |
| org | hr travel | 200 | 12.2 | 5 | 2.5 |  |
| org | hr performance list | 200 | 11.7 | 4 | 2.4 |  |

| list endpoint | queries @10 rows | queries @100 rows | grows by |
|---|---|---|---|
| employees list | 33 | 53 | 20 (N+1) |
| hr employees | 10 | 23 | 13 (N+1) |
| hr attendance records | 15 | 105 | 90 (N+1) |
| hr users | 10 | 23 | 13 (N+1) |
| hr travel | 5 | 5 | 0 |
| org list | 6 | 6 | 0 |
| users list | 4 | 4 | 0 |
| audit-log list | 3 | 3 | 0 |
| refunds list | 3 | 3 | 0 |
| billing invoices | 4 | 4 | 0 |
| expenses claims | 3 | 3 | 0 |
| activity | 4 | 4 | 0 |

## Part G: results and report

### ⚠ Data-scoping bugs found (not fixed: they change responses, so they need your approval)

1. **Asset reports and asset settings are not org-scoped at all.** `asset_reports` and `asset_settings` have no
   `organization_id` column.
   - `GET /hr/assets/reports` (`app/modules/hr/asset_router.py`, `asset_service.get_asset_reports`): any signed-in
     user, in any organization and at any role, sees every organization's asset reports (title, description,
     parameters, generator).
   - `GET /hr/assets/settings` returns one global set of settings; `PUT /hr/assets/settings` lets any org admin change
     a setting **for every organization**.
   - Fix needs a migration (add `organization_id`, backfill reports from `generated_by` → employee's org) and a
     decision on existing settings rows, which cannot be attributed to an org (copy to every org, or start empty).
2. **Learning skills are readable and writable across organizations.** `learning_skills.organization_id` exists but is
   never used for reads/writes:
   - `GET /hr/learning/skills` returns every organization's skills (only an optional `employee_id` filter).
   - `GET`, `PUT`, `DELETE /hr/learning/skills/{id}` never check the organization: any user can read, and any org admin
     can change or delete, another organization's skill records by id.
   - Fix is small (filter by `current_user.organization_id` in the four routes); it removes other orgs' rows from
     responses, hence asking first.

Also found and **fixed** (it was a crash, not a response change): `GET` training-program assignments read
`assignment.employee`, a relationship the model does not have, so the endpoint raised `AttributeError` (HTTP 500)
whenever a program had any assignment. It now resolves names in one batched lookup
(`app/modules/hr/learning_service.py:869`).

### Before / after (same seeded data, same machine)

The slowest calls, and every endpoint that changed (full table: `scripts/perf_report.py before.json after.json`):

| Endpoint | ms before → after | queries before → after |
|---|---|---|
| `GET /hr/attendance` (all) | 1,342 → 108 | 611 → 6 |
| `GET /super-admin/command-center/commercial-health` | 708 → 39 | 14 → 14 |
| `GET /super-admin/organizations?page_size=200` (org picker) | 138 → 35 | 6 → 7 |
| `GET /super-admin/organizations?page_size=20` | 66 → 26 | 6 → 7 |
| `GET /hr/employee-management/employees?per_page=200` | 87 → 55 | 53 → 5 |
| `GET /hr/employee-management/employees?per_page=10` | 40 → 22 | 33 → 5 |
| `GET /hr/departments` | 35 → 16 | 12 → 5 |
| `GET /hr/attendance/records` | 31 → 21 | 25 → 6 |
| `GET /hr/employees?per_page=200` (pickers) | 48 → 39 | 23 → 5 |
| `GET /hr/admin/users` | 18 → 21 | 10 → 5 |
| `GET /super-admin/hub/applications` | 31 → 35 | 21 → 18 |
| `GET /billing/plan-changes`, `GET /billing/delinquency` | 14 → 16, 12 → 16 | 4 → 3, 3 → 2 |

N+1 check (queries at page size 10 → 100):

| List | before | after |
|---|---|---|
| employee-management employees | 33 → 53 | 5 → 5 |
| `/hr/employees` | 10 → 23 | 5 → 5 |
| attendance records | 15 → 105 | 6 → 6 |
| `/hr/admin/users` | 10 → 23 | 5 → 5 |
| travel, org list, users, audit logs, refunds, invoices, expense claims, activity | flat | flat |

No endpoint is above 300 ms after the work (it was 2 before) and all 70 measured endpoints return 200. Endpoints that
were not touched show the same query counts and plans; their few-ms movement between the two runs is run-to-run
variance of the local machine.

What carries over to production is the **query count**: each sequential query costs one round-trip to the database.
At the 210–280 ms round-trip measured from a dev machine, `/hr/attendance` alone was 611 round-trips (minutes); the
employee list saves 28–48 round-trips per page.

### Changes (file:line)

**Part B: known hotspots** (`d5a4bab`)
- `app/core/sql_helpers.py` `latest_per_group`: latest row per group via `DISTINCT ON` (PostgreSQL) or a
  `ROW_NUMBER()` window (SQLite), id tie-break.
- `app/modules/super_admin/command_center_router.py:530`: commercial health uses it for both snapshot tables (was a full
  load of 18k rows each); platform totals, customer health, lifecycle select only the columns used; the attention queue
  resolves names once for the orgs it lists (`:151`).
- `app/modules/super_admin/organization_service.py:40` `org_names_by_id(db, ids, include_deleted=False)`: the one
  shared name map, used by `billing/router.py:2064` (both plan-change lists), `billing/service.py:493` (evaluations),
  `:1204` (invoices), `billing/delinquency_service.py:532`; `super_admin/expenses_router.py:263` selects name columns
  only (it lists every live org by design). Soft-deleted orgs stay unnamed exactly as before. **Your call:** billing
  history pages show "Org #12" for a deleted org; switching to the deleted org's name is a one-argument change
  (`include_deleted=True`), not made without approval.
- `hr/asset_service.py:632` asset reports and `integrations/router.py:266` hub webhooks: paginated on request,
  otherwise the same list capped; hub events reads one column.

**Part C: N+1** (`1361ff2`)
- `employee/service.py:2245` `_employee_list_loads`: joinedload department, designation, reporting manager for the
  employee lists; `:1074` users list: department, designation.
- `hr/attendance_service.py:228`, `:284`: selectinload employee (+department) for attendance lists; `:874` leave list.
- `hr/service.py:711`: department headcounts in one grouped query; `:3084` upcoming joiners' department.
- `hr/asset_service.py:185` (+ CSV/Excel exports), `hr/learning_service.py:161` and recent enrollments,
  `assistant/orchestration_service.py:424`: batched employee/designation loads.
- `integrations/router.py:236`: five COUNTs → two conditional aggregates.
- `tests/test_query_budget.py`: fails any main list whose query count grows with its rows (checked against the old code:
  it fails on all four N+1s).

**Part D: pagination** (`146d26e`), see below. **Part E: indexes** (`85c100f`), see below, plus
`super_admin/router.py:381`: org list headcounts by one grouped query and a narrow admin lookup (was every employee of
every listed org as full rows).

### Pagination

Convention: HR routes `?page=&per_page=` → `{items, total, page, per_page}`; billing keeps `{list, total}` with
`?page=&limit=`; super-admin hub `?page=&page_size=`. Defaults 25, max 200. Paged mode orders with an id tie-break so
pages never skip or repeat rows.

**Approach for every endpoint below: backward compatible.** Without paging parameters the endpoint returns the same
plain list as before (no frontend caller changed), capped at 1,000 rows with a logged warning. With them it returns a
page.

| Endpoint | Note |
|---|---|
| `GET /hr/leaves` | cap reached by the 600-person seed org (1,200 requests → first 1,000, identical rows and order) |
| `GET /hr/attendance` | no frontend caller; cap reached (13,200 → 1,000 newest; same rows, tie order within a date differs, it was never defined) |
| `GET /hr/documents` | |
| `GET /hr/ess`, `/hr/engagement`, `/hr/onboarding/new-hires` | `/hr/onboarding/records` shares the service and gets the cap |
| `GET /hr/performance`, `/goals`, `/kpis`, `/feedback`, `/appraisals` | |
| `GET /hr/compensation/revisions` | |
| `GET /billing/plan-changes`, `GET /billing/support-access` | `total` is the full count in paged mode |
| `GET /hr/assets/reports`, `GET /super-admin/hub/webhooks` | (Part B) |

**Frontend follow-up (not done):** the Leave page (and the other pages above) still fetch the plain list. Big orgs will
see at most 1,000 rows until those pages pass `page`/`per_page`. No UI changes were made in this phase.

**Still unpaginated, intentionally** (bounded by configuration size, not by people × time): leave type configs and
balances, shifts, holidays, pay grades/bands/salary components/structures/allowances/benefits, document folders,
checklist templates, compliance reports, asset categories, learning paths/calendar, `/hr/config`, admin roles,
`/billing/plans`, `/billing/discounts`, platform settings, assistant controls and knowledge sources, connect channels,
hub events/applications, `/super-admin/documents/organizations` (one row per org), `/billing/delinquency` (open cases).

**Still unpaginated, should be paged next** (grow over time; not changed to keep this phase's scope): compliance
audits/violations/risks/corrective actions, onboarding records/preboarding tasks/checklist assignments/orientation
sessions/attendees/documents, `/hr/documents/assigned-to-me`, `/hr/documents/approvals/pending`,
`/hr/learning/certifications`, `/hr/learning/skills` (after the scoping fix), `/hr/recruitment/applications`,
employee lifecycle, employee compensation/benefits, assistant handoffs, conversations, privacy requests.

Audit logs keep offset paging: the UI shows page numbers and a total. The COUNT over 50k rows is a sequential scan
(about 11 ms here); keyset pagination on `(created_at, id)` is the next step if the table reaches millions of rows.

### Migration

`alembic/versions/a2b3c4d5e6f7_phase2_hot_path_indexes.py` (revises `z1a2b3c4d5ec`). 19 indexes, each
`CREATE INDEX CONCURRENTLY IF NOT EXISTS` in Alembic's autocommit block, so tables stay readable and writable while it
runs. Matching `Index()` declarations are on the models; Alembic's compare reports 0 differences for them.

- Deploy: the existing `alembic upgrade head` step. Building concurrently takes longer than a plain build but does not
  lock.
- Rollback: `alembic downgrade z1a2b3c4d5ec` (drops each with `DROP INDEX CONCURRENTLY IF EXISTS`). Verified locally:
  upgrade → downgrade (all gone) → upgrade → upgrade again (no-op).
- If a concurrent build is interrupted it can leave an INVALID index; re-running the upgrade does not rebuild it
  (IF NOT EXISTS). Check with `SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;`, drop it, re-run.

Note: the audit-log indexes (`organization_id`, `action_type`, `created_at`, actor), `organizations.deleted_at` and
`workflow_executions.organization_id` that the brief lists as missing were already created by earlier migrations
(`n1a2b3c4d5e9`, `o1b2c3d4e5f0`, `p1c2d3e4f5a1`). 143 single-column foreign keys have no index; only the ones used in filters were
indexed (the rest are audit columns such as `created_by` that nothing filters on).

### EXPLAIN (ANALYZE, BUFFERS): before → after for the hot statements

| Statement | Before | After |
|---|---|---|
| Latest workforce snapshot per org | Index Scan on organization_id + Incremental Sort, 3.70 ms | Index Scan on `ix_bws_org_snapshot_at`, no sort, 1.88 ms |
| Latest entitlement snapshot per org | Index Scan + Incremental Sort, 4.05 ms | Index Scan on `ix_bes_org_computed_at`, 2.10 ms |
| Super-admin users, newest 20 | Seq Scan employees (5,501 rows) + top-N sort, 3.48 ms | Index Scan Backward on `ix_employees_created_at`, 0.27 ms |
| Leave page (50 rows) | Bitmap scan + Seq Scan employees + top-N sort, 1.41 ms | Index Scan on `ix_leave_requests_org_created` + nested loops, 0.18 ms |
| Employees in one department | Seq Scan employees, 0.52 ms | Bitmap Index Scan on `ix_employees_department_id`, 0.10 ms |
| Org users, newest 20 | Bitmap scan + sort, 0.154 ms | Index Scan Backward on `ix_employees_org_created`, 0.030 ms |

Full plans: see "EXPLAIN plans" at the end of this file.

### Caching (Part F): not added

The command-center cards are 15–42 ms on the seeded data after Parts B–E, under the ~200 ms threshold, so no response
cache was added. In production their cost is set by round-trips: `overview` runs 24 sequential queries. If the app
server is not in the database's region (tens of ms per query), a 60-second cache for overview / commercial health /
lifecycle / customer health is the next step, keyed by endpoint + params with a `refresh` bypass.

### Remaining slowest endpoints

- `command-center/overview`: 24 queries, computes today's platform snapshot on every load (each query is a round-trip).
- `GET /hr/attendance` (plain list): 108 ms to serialize the 1,000-row cap; callers should page.
- HR dashboards (`organization`, `attendance`, `learning`): 9–13 queries each, fixed cost, no N+1.
- `/hr/leaves` plain list: 80 ms for 1,000 rows (serialization), until the Leave page pages.

### Verification

- Response equivalence on the seeded Postgres DB (`scripts/response_snapshot.py`, 94 responses captured before any
  change): identical after every part, except (a) audit-log/security views, which only gained the login rows the
  measurements themselves created, (b) the two lists where the 1,000-row cap applies (exact prefix / same rows), and
  (c) lists ordered only by `created_at` where every seeded row has the same timestamp: the new indexes return tied rows
  in a different, still-undefined order (same rows, same totals).
- `tests/test_phase2_equivalence.py` (old vs new logic, SQLite, with ties and soft-deleted orgs), `test_query_budget.py`,
  `test_pagination.py`.
- Full backend suite (SQLite, excluding the one test that needs the remote DB): 1,511 passed, 4 skipped, 0 failed.

### Full measurement table (before -> after)

| who | endpoint | ms before → after | queries before → after | DB ms before → after |
|---|---|---|---|---|
| sa | command-center overview | 31.8 → 41.8 | 24 → 24 | 10.9 → 15.7 |
| sa | command-center attention | 16.3 → 20.1 | 11 → 11 | 4.1 → 5.5 |
| sa | command-center customer-health | 12.1 → 16.6 | 6 → 6 | 2.5 → 3.7 |
| sa | command-center commercial-health | 708.2 → 38.5 | 14 → 14 | 35.2 → 16.6 |
| sa | command-center lifecycle | 14.6 → 15.8 | 5 → 5 | 3.7 → 4.4 |
| sa | command-center platform-health | 12.0 → 11.9 | 3 → 3 | 2.1 → 2.3 |
| sa | command-center security | 24.5 → 29.5 | 7 → 7 | 11.4 → 14.1 |
| sa | command-center audit-logs(8) | 16.2 → 20.1 | 3 → 3 | 6.1 → 7.6 |
| sa | org list | 65.8 → 26.4 | 6 → 7 | 9.3 → 7.8 |
| sa | org detail | 17.3 → 21.2 | 5 → 5 | 3.7 → 4.9 |
| sa | org detail audit-logs | 11.6 → 16.7 | 4 → 4 | 2.6 → 3.8 |
| sa | org detail subscription | 11.3 → 15.0 | 2 → 2 | 1.9 → 2.4 |
| sa | org detail evaluations | 10.0 → 14.6 | 2 → 2 | 1.8 → 2.6 |
| sa | org detail delinquency | 12.1 → 14.4 | 3 → 3 | 2.2 → 2.8 |
| sa | users list | 22.9 → 20.6 | 4 → 4 | 11.7 → 6.4 |
| sa | audit-log filters | 15.6 → 20.9 | 2 → 2 | 7.9 → 10.6 |
| sa | audit-log list(50) | 17.4 → 25.1 | 3 → 3 | 6.0 → 7.6 |
| sa | notifications | 10.3 → 16.4 | 3 → 3 | 2.1 → 3.7 |
| sa | support access | 10.6 → 13.4 | 2 → 2 | 1.6 → 2.1 |
| sa | support tickets | 14.4 → 18.2 | 3 → 3 | 3.8 → 4.7 |
| sa | support assignees | 11.4 → 16.1 | 2 → 2 | 2.6 → 3.8 |
| sa | documents organizations | 11.7 → 15.0 | 2 → 2 | 1.9 → 2.5 |
| sa | platform documents | 13.3 → 19.2 | 3 → 3 | 3.6 → 5.0 |
| sa | billing plans | 10.5 → 16.2 | 2 → 2 | 1.7 → 2.6 |
| sa | billing discounts | 12.7 → 15.4 | 2 → 2 | 1.8 → 2.9 |
| sa | billing delinquency | 11.9 → 16.1 | 3 → 2 | 2.3 → 2.9 |
| sa | billing plan-changes | 13.8 → 15.9 | 4 → 3 | 2.9 → 3.0 |
| sa | billing evaluations | 13.4 → 17.7 | 4 → 4 | 2.5 → 3.6 |
| sa | billing invoices | 15.9 → 18.9 | 4 → 4 | 3.1 → 3.6 |
| sa | billing webhook-events | 10.3 → 13.8 | 2 → 2 | 1.7 → 2.3 |
| sa | billing reconciliation | 11.6 → 14.2 | 3 → 3 | 2.1 → 2.7 |
| sa | refunds list | 14.6 → 17.4 | 3 → 3 | 3.1 → 3.6 |
| sa | refunds summary | 12.9 → 16.3 | 5 → 5 | 2.8 → 3.6 |
| sa | org picker (200) | 138.1 → 35.4 | 6 → 7 | 15.1 → 10.7 |
| sa | expenses categories | 9.5 → 12.4 | 2 → 2 | 1.6 → 2.1 |
| sa | expenses summary | 14.0 → 18.0 | 2 → 2 | 2.7 → 3.2 |
| sa | expenses by-organization | 16.2 → 21.0 | 3 → 3 | 3.1 → 4.3 |
| sa | expenses claims | 12.7 → 15.8 | 3 → 3 | 3.4 → 4.4 |
| sa | expenses budgets | 10.2 → 12.9 | 2 → 2 | 2.0 → 2.6 |
| sa | activity | 21.2 → 27.0 | 4 → 4 | 9.7 → 12.4 |
| sa | hub applications | 30.6 → 34.9 | 21 → 18 | 10.2 → 10.7 |
| sa | hub webhooks | 9.7 → 13.2 | 2 → 2 | 1.7 → 2.2 |
| sa | hub events | 11.6 → 13.8 | 3 → 3 | 2.3 → 2.6 |
| sa | demo requests | 11.4 → 17.9 | 3 → 3 | 2.3 → 3.5 |
| sa | pricing requests | 11.7 → 15.6 | 3 → 3 | 2.2 → 2.8 |
| org | trivial /auth/me | 8.2 → 9.9 | 3 → 3 | 1.8 → 2.1 |
| org | notifications unread | 11.3 → 14.6 | 2 → 2 | 2.3 → 3.0 |
| org | employees list(10) | 39.5 → 21.6 | 33 → 5 | 14.0 → 6.5 |
| org | employees list(200) | 87.1 → 55.2 | 53 → 5 | 19.8 → 7.6 |
| org | employee profile | 16.4 → 17.5 | 7 → 7 | 4.1 → 4.7 |
| org | hr employees picker(200) | 47.8 → 38.5 | 23 → 5 | 10.3 → 7.0 |
| org | hr departments | 35.4 → 15.5 | 12 → 5 | 17.4 → 3.7 |
| org | hr designations | 16.9 → 18.6 | 5 → 5 | 4.7 → 4.9 |
| org | hr leaves | 82.3 → 80.4 | 4 → 4 | 7.5 → 8.7 |
| org | hr attendance records | 30.7 → 20.9 | 25 → 6 | 9.8 → 5.6 |
| org | hr attendance (all) | 1342.1 → 108.4 | 611 → 6 | 153.1 → 13.9 |
| org | hr assets | 12.7 → 18.5 | 5 → 5 | 3.0 → 4.1 |
| org | hr documents | 12.6 → 17.0 | 4 → 4 | 2.6 → 3.4 |
| org | hr users | 18.1 → 20.9 | 10 → 5 | 4.8 → 5.7 |
| org | hr dashboard stats | 20.1 → 29.0 | 11 → 11 | 8.1 → 10.9 |
| org | hr organization dashboard | 30.2 → 43.9 | 12 → 12 | 15.4 → 21.0 |
| org | hr attendance dashboard | 66.7 → 87.4 | 13 → 13 | 13.1 → 15.5 |
| org | hr leaves dashboard | 18.2 → 25.7 | 10 → 10 | 6.2 → 9.1 |
| org | hr compensation dashboard | 15.0 → 20.3 | 10 → 10 | 4.1 → 6.0 |
| org | hr performance dashboard | 18.9 → 24.2 | 12 → 12 | 5.4 → 7.3 |
| org | hr learning dashboard | 17.9 → 28.8 | 13 → 13 | 5.7 → 8.8 |
| org | hr recruitment dashboard | 15.7 → 22.2 | 9 → 9 | 4.0 → 6.5 |
| org | hr organization | 14.5 → 23.0 | 7 → 7 | 4.7 → 7.7 |
| org | hr travel | 12.2 → 19.0 | 5 → 5 | 2.5 → 4.4 |
| org | hr performance list | 11.7 → 18.3 | 4 → 4 | 2.4 → 3.8 |

| list endpoint | queries @10 → @100, before | after |
|---|---|---|
| employees list | 33 → 53 | 5 → 5 |
| hr employees | 10 → 23 | 5 → 5 |
| hr attendance records | 15 → 105 | 6 → 6 |
| hr users | 10 → 23 | 5 → 5 |
| hr travel | 5 → 5 | 5 → 5 |
| org list | 6 → 6 | 7 → 7 |
| users list | 4 → 4 | 4 → 4 |
| audit-log list | 3 → 3 | 3 → 3 |
| refunds list | 3 → 3 | 3 → 3 |
| billing invoices | 4 → 4 | 4 → 4 |
| expenses claims | 3 → 3 | 3 → 3 |
| activity | 4 → 4 | 4 → 4 |

### EXPLAIN plans: before (no Part E indexes)

#### latest workforce snapshot per org (command-center commercial-health)
```sql
SELECT DISTINCT ON (organization_id) organization_id, quantity FROM billable_workforce_snapshots ORDER BY organization_id, snapshot_at DESC, id DESC
```
```
Unique  (cost=26.30..1575.48 rows=50 width=20) (actual time=0.080..3.684 rows=50 loops=1)
  Buffers: shared hit=189
  ->  Incremental Sort  (cost=26.30..1529.86 rows=18250 width=20) (actual time=0.079..3.084 rows=18250 loops=1)
        Sort Key: organization_id, snapshot_at DESC, id DESC
        Presorted Key: organization_id
        Full-sort Groups: 50  Sort Method: quicksort  Average Memory: 27kB  Peak Memory: 27kB
        Pre-sorted Groups: 50  Sort Method: quicksort  Average Memory: 39kB  Peak Memory: 39kB
        Buffers: shared hit=189
        ->  Index Scan using ix_billable_workforce_snapshots_organization_id on billable_workforce_snapshots  (cost=0.29..524.04 rows=18250 width=20) (actual time=0.010..1.539 rows=18250 loops=1)
              Buffers: shared hit=189
Planning:
  Buffers: shared hit=39
Planning Time: 0.114 ms
Execution Time: 3.702 ms
```

#### latest entitlement snapshot per org (command-center commercial-health)
```sql
SELECT DISTINCT ON (organization_id) organization_id, package FROM billing_entitlement_snapshots ORDER BY organization_id, computed_at DESC, id DESC
```
```
Unique  (cost=25.58..1539.48 rows=50 width=21) (actual time=0.088..4.039 rows=50 loops=1)
  Buffers: shared hit=153
  ->  Incremental Sort  (cost=25.58..1493.86 rows=18250 width=21) (actual time=0.087..3.449 rows=18250 loops=1)
        Sort Key: organization_id, computed_at DESC, id DESC
        Presorted Key: organization_id
        Full-sort Groups: 50  Sort Method: quicksort  Average Memory: 28kB  Peak Memory: 28kB
        Pre-sorted Groups: 50  Sort Method: quicksort  Average Memory: 42kB  Peak Memory: 42kB
        Buffers: shared hit=153
        ->  Index Scan using ix_billing_entitlement_snapshots_organization_id on billing_entitlement_snapshots  (cost=0.29..488.04 rows=18250 width=21) (actual time=0.010..1.616 rows=18250 loops=1)
              Buffers: shared hit=153
Planning:
  Buffers: shared hit=17
Planning Time: 0.083 ms
Execution Time: 4.052 ms
```

#### super-admin users list, newest 20 (GET /super-admin/users)
```sql
SELECT e.* FROM employees e LEFT JOIN organizations o ON o.id = e.organization_id AND o.deleted_at IS NULL WHERE e.organization_id IS NULL OR o.id IS NOT NULL ORDER BY e.created_at DESC LIMIT 20
```
```
Limit  (cost=387.15..387.20 rows=20 width=4741) (actual time=3.450..3.452 rows=20 loops=1)
  Buffers: shared hit=169
  ->  Sort  (cost=387.15..400.91 rows=5501 width=4741) (actual time=3.449..3.450 rows=20 loops=1)
        Sort Key: e.created_at DESC
        Sort Method: top-N heapsort  Memory: 30kB
        Buffers: shared hit=169
        ->  Hash Left Join  (cost=2.10..240.77 rows=5501 width=4741) (actual time=0.025..1.675 rows=5301 loops=1)
              Hash Cond: (e.organization_id = o.id)
              Filter: ((e.organization_id IS NULL) OR (o.id IS NOT NULL))
              Rows Removed by Filter: 200
              Buffers: shared hit=169
              ->  Seq Scan on employees e  (cost=0.00..223.01 rows=5501 width=4741) (actual time=0.005..0.197 rows=5501 loops=1)
                    Buffers: shared hit=168
              ->  Hash  (cost=1.50..1.50 rows=48 width=4) (actual time=0.013..0.013 rows=48 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 10kB
                    Buffers: shared hit=1
                    ->  Seq Scan on organizations o  (cost=0.00..1.50 rows=48 width=4) (actual time=0.003..0.009 rows=48 loops=1)
                          Filter: (deleted_at IS NULL)
                          Rows Removed by Filter: 2
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=267
Planning Time: 0.333 ms
Execution Time: 3.480 ms
```

#### org users list, newest 20 (GET /hr/admin/users)
```sql
SELECT * FROM employees WHERE organization_id = 1 ORDER BY created_at DESC LIMIT 20 OFFSET 0
```
```
Limit  (cost=224.40..224.45 rows=20 width=4741) (actual time=0.138..0.140 rows=20 loops=1)
  Buffers: shared hit=33
  ->  Sort  (cost=224.40..225.90 rows=600 width=4741) (actual time=0.138..0.138 rows=20 loops=1)
        Sort Key: created_at DESC
        Sort Method: top-N heapsort  Memory: 30kB
        Buffers: shared hit=33
        ->  Bitmap Heap Scan on employees  (cost=32.93..208.43 rows=600 width=4741) (actual time=0.037..0.067 rows=600 loops=1)
              Recheck Cond: (organization_id = 1)
              Heap Blocks: exact=25
              Buffers: shared hit=33
              ->  Bitmap Index Scan on uq_employees_organization_email  (cost=0.00..32.78 rows=600 width=0) (actual time=0.032..0.032 rows=600 loops=1)
                    Index Cond: (organization_id = 1)
                    Buffers: shared hit=8
Planning Time: 0.061 ms
Execution Time: 0.154 ms
```

#### leave requests page (GET /hr/leaves?page=1&per_page=50)
```sql
SELECT lr.*, e.employee_code, e.first_name, e.last_name, d.name FROM leave_requests lr JOIN employees e ON lr.employee_id = e.id LEFT JOIN departments d ON e.department_id = d.id WHERE lr.organization_id = 1 ORDER BY lr.created_at DESC, lr.id DESC LIMIT 50
```
```
Limit  (cost=492.15..492.27 rows=50 width=92) (actual time=1.360..1.364 rows=50 loops=1)
  Buffers: shared hit=196
  ->  Sort  (cost=492.15..495.15 rows=1200 width=92) (actual time=1.360..1.361 rows=50 loops=1)
        Sort Key: lr.created_at DESC, lr.id DESC
        Sort Method: top-N heapsort  Memory: 38kB
        Buffers: shared hit=196
        ->  Hash Left Join  (cost=186.59..452.28 rows=1200 width=92) (actual time=0.223..0.952 rows=1200 loops=1)
              Hash Cond: (e.department_id = d.id)
              Buffers: shared hit=196
              ->  Hash Join  (cost=172.59..435.10 rows=1200 width=89) (actual time=0.172..0.764 rows=1200 loops=1)
                    Hash Cond: (e.id = lr.employee_id)
                    Buffers: shared hit=191
                    ->  Seq Scan on employees e  (cost=0.00..223.01 rows=5501 width=28) (actual time=0.004..0.191 rows=5501 loops=1)
                          Buffers: shared hit=168
                    ->  Hash  (cost=157.59..157.59 rows=1200 width=65) (actual time=0.162..0.162 rows=1200 loops=1)
                          Buckets: 2048  Batches: 1  Memory Usage: 129kB
                          Buffers: shared hit=23
                          ->  Bitmap Heap Scan on leave_requests lr  (cost=17.59..157.59 rows=1200 width=65) (actual time=0.019..0.079 rows=1200 loops=1)
                                Recheck Cond: (organization_id = 1)
                                Heap Blocks: exact=21
                                Buffers: shared hit=23
                                ->  Bitmap Index Scan on ix_leave_requests_organization_id  (cost=0.00..17.29 rows=1200 width=0) (actual time=0.015..0.015 rows=1200 loops=1)
                                      Index Cond: (organization_id = 1)
                                      Buffers: shared hit=2
              ->  Hash  (cost=9.00..9.00 rows=400 width=11) (actual time=0.047..0.047 rows=400 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 26kB
                    Buffers: shared hit=5
                    ->  Seq Scan on departments d  (cost=0.00..9.00 rows=400 width=11) (actual time=0.003..0.022 rows=400 loops=1)
                          Buffers: shared hit=5
Planning:
  Buffers: shared hit=84
Planning Time: 0.294 ms
Execution Time: 1.412 ms
```

#### employees in one department (list filter / headcount)
```sql
SELECT count(*) FROM employees WHERE department_id = (SELECT min(id) FROM departments) AND status = 'ACTIVE'
```
```
Aggregate  (cost=250.76..250.77 rows=1 width=8) (actual time=0.505..0.505 rows=1 loops=1)
  Buffers: shared hit=170
  InitPlan 2
    ->  Result  (cost=0.20..0.21 rows=1 width=4) (actual time=0.019..0.019 rows=1 loops=1)
          Buffers: shared hit=2
          InitPlan 1
            ->  Limit  (cost=0.15..0.20 rows=1 width=4) (actual time=0.009..0.009 rows=1 loops=1)
                  Buffers: shared hit=2
                  ->  Index Only Scan using ix_departments_id on departments  (cost=0.15..22.15 rows=400 width=4) (actual time=0.008..0.008 rows=1 loops=1)
                        Heap Fetches: 1
                        Buffers: shared hit=2
  ->  Seq Scan on employees  (cost=0.00..250.51 rows=14 width=0) (actual time=0.024..0.501 rows=75 loops=1)
        Filter: ((department_id = (InitPlan 2).col1) AND ((status)::text = 'ACTIVE'::text))
        Rows Removed by Filter: 5426
        Buffers: shared hit=170
Planning:
  Buffers: shared hit=6
Planning Time: 0.097 ms
Execution Time: 0.523 ms
```

### EXPLAIN plans: after

#### latest workforce snapshot per org (command-center commercial-health)
```sql
SELECT DISTINCT ON (organization_id) organization_id, quantity FROM billable_workforce_snapshots ORDER BY organization_id, snapshot_at DESC, id DESC
```
```
Result  (cost=0.29..1084.79 rows=50 width=20) (actual time=0.010..1.854 rows=50 loops=1)
  Buffers: shared hit=262
  ->  Unique  (cost=0.29..1084.79 rows=50 width=20) (actual time=0.008..1.848 rows=50 loops=1)
        Buffers: shared hit=262
        ->  Index Scan using ix_bws_org_snapshot_at on billable_workforce_snapshots  (cost=0.29..1039.16 rows=18250 width=20) (actual time=0.008..1.224 rows=18250 loops=1)
              Buffers: shared hit=262
Planning:
  Buffers: shared hit=39 read=1
Planning Time: 0.146 ms
Execution Time: 1.877 ms
```

#### latest entitlement snapshot per org (command-center commercial-health)
```sql
SELECT DISTINCT ON (organization_id) organization_id, package FROM billing_entitlement_snapshots ORDER BY organization_id, computed_at DESC, id DESC
```
```
Result  (cost=0.29..1001.54 rows=50 width=21) (actual time=0.008..2.083 rows=50 loops=1)
  Buffers: shared hit=226
  ->  Unique  (cost=0.29..1001.54 rows=50 width=21) (actual time=0.007..2.074 rows=50 loops=1)
        Buffers: shared hit=226
        ->  Index Scan using ix_bes_org_computed_at on billing_entitlement_snapshots  (cost=0.29..955.91 rows=18250 width=21) (actual time=0.006..1.363 rows=18250 loops=1)
              Buffers: shared hit=226
Planning:
  Buffers: shared hit=21 read=1
Planning Time: 0.083 ms
Execution Time: 2.095 ms
```

#### super-admin users list, newest 20 (GET /super-admin/users)
```sql
SELECT e.* FROM employees e LEFT JOIN organizations o ON o.id = e.organization_id AND o.deleted_at IS NULL WHERE e.organization_id IS NULL OR o.id IS NOT NULL ORDER BY e.created_at DESC LIMIT 20
```
```
Limit  (cost=0.42..6.33 rows=20 width=4741) (actual time=0.168..0.185 rows=20 loops=1)
  Buffers: shared hit=459
  ->  Nested Loop Left Join  (cost=0.42..1625.30 rows=5501 width=4741) (actual time=0.166..0.183 rows=20 loops=1)
        Filter: ((e.organization_id IS NULL) OR (o.id IS NOT NULL))
        Rows Removed by Filter: 200
        Buffers: shared hit=459
        ->  Index Scan Backward using ix_employees_created_at on employees e  (cost=0.28..695.01 rows=5501 width=4741) (actual time=0.019..0.043 rows=220 loops=1)
              Buffers: shared hit=19
        ->  Index Scan using ix_organizations_id on organizations o  (cost=0.14..0.16 rows=1 width=4) (actual time=0.000..0.000 rows=0 loops=220)
              Index Cond: (id = e.organization_id)
              Filter: (deleted_at IS NULL)
              Rows Removed by Filter: 1
              Buffers: shared hit=440
Planning:
  Buffers: shared hit=231 read=5
Planning Time: 0.658 ms
Execution Time: 0.266 ms
```

#### org users list, newest 20 (GET /hr/admin/users)
```sql
SELECT * FROM employees WHERE organization_id = 1 ORDER BY created_at DESC LIMIT 20 OFFSET 0
```
```
Limit  (cost=0.28..21.03 rows=20 width=4741) (actual time=0.015..0.018 rows=20 loops=1)
  Buffers: shared hit=4
  ->  Index Scan Backward using ix_employees_org_created on employees  (cost=0.28..622.81 rows=600 width=4741) (actual time=0.014..0.016 rows=20 loops=1)
        Index Cond: (organization_id = 1)
        Buffers: shared hit=4
Planning Time: 0.111 ms
Execution Time: 0.030 ms
```

#### leave requests page (GET /hr/leaves?page=1&per_page=50)
```sql
SELECT lr.*, e.employee_code, e.first_name, e.last_name, d.name FROM leave_requests lr JOIN employees e ON lr.employee_id = e.id LEFT JOIN departments d ON e.department_id = d.id WHERE lr.organization_id = 1 ORDER BY lr.created_at DESC, lr.id DESC LIMIT 50
```
```
Limit  (cost=0.73..72.03 rows=50 width=92) (actual time=0.046..0.149 rows=50 loops=1)
  Buffers: shared hit=95
  ->  Nested Loop Left Join  (cost=0.73..1711.91 rows=1200 width=92) (actual time=0.045..0.146 rows=50 loops=1)
        Buffers: shared hit=95
        ->  Nested Loop  (cost=0.58..1613.83 rows=1200 width=89) (actual time=0.036..0.116 rows=50 loops=1)
              Buffers: shared hit=79
              ->  Index Scan using ix_leave_requests_org_created on leave_requests lr  (cost=0.29..501.75 rows=1200 width=65) (actual time=0.010..0.017 rows=50 loops=1)
                    Index Cond: (organization_id = 1)
                    Buffers: shared hit=4
              ->  Memoize  (cost=0.29..0.96 rows=1 width=28) (actual time=0.001..0.001 rows=1 loops=50)
                    Cache Key: lr.employee_id
                    Cache Mode: logical
                    Hits: 25  Misses: 25  Evictions: 0  Overflows: 0  Memory Usage: 4kB
                    Buffers: shared hit=75
                    ->  Index Scan using ix_employees_id on employees e  (cost=0.28..0.95 rows=1 width=28) (actual time=0.001..0.001 rows=1 loops=25)
                          Index Cond: (id = lr.employee_id)
                          Buffers: shared hit=75
        ->  Memoize  (cost=0.16..0.18 rows=1 width=11) (actual time=0.000..0.000 rows=1 loops=50)
              Cache Key: e.department_id
              Cache Mode: logical
              Hits: 42  Misses: 8  Evictions: 0  Overflows: 0  Memory Usage: 1kB
              Buffers: shared hit=16
              ->  Index Scan using ix_departments_id on departments d  (cost=0.15..0.17 rows=1 width=11) (actual time=0.001..0.001 rows=1 loops=8)
                    Index Cond: (id = e.department_id)
                    Buffers: shared hit=16
Planning:
  Buffers: shared hit=104 read=1
Planning Time: 0.430 ms
Execution Time: 0.175 ms
```

#### employees in one department (list filter / headcount)
```sql
SELECT count(*) FROM employees WHERE department_id = (SELECT min(id) FROM departments) AND status = 'ACTIVE'
```
```
Aggregate  (cost=48.72..48.73 rows=1 width=8) (actual time=0.077..0.078 rows=1 loops=1)
  Buffers: shared hit=18
  InitPlan 2
    ->  Result  (cost=0.20..0.21 rows=1 width=4) (actual time=0.016..0.017 rows=1 loops=1)
          Buffers: shared hit=2
          InitPlan 1
            ->  Limit  (cost=0.15..0.20 rows=1 width=4) (actual time=0.009..0.010 rows=1 loops=1)
                  Buffers: shared hit=2
                  ->  Index Only Scan using ix_departments_id on departments  (cost=0.15..22.15 rows=400 width=4) (actual time=0.009..0.009 rows=1 loops=1)
                        Heap Fetches: 1
                        Buffers: shared hit=2
  ->  Bitmap Heap Scan on employees  (cost=4.39..48.48 rows=14 width=0) (actual time=0.032..0.070 rows=75 loops=1)
        Recheck Cond: (department_id = (InitPlan 2).col1)
        Filter: ((status)::text = 'ACTIVE'::text)
        Heap Blocks: exact=14
        Buffers: shared hit=18
        ->  Bitmap Index Scan on ix_employees_department_id  (cost=0.00..4.39 rows=14 width=0) (actual time=0.025..0.025 rows=75 loops=1)
              Index Cond: (department_id = (InitPlan 2).col1)
              Buffers: shared hit=4
Planning:
  Buffers: shared hit=6
Planning Time: 0.248 ms
Execution Time: 0.104 ms
```
