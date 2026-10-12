# Phase-1 performance work — baseline (Part A)

Measured 2026-10-09 against the live Neon DB from a dev machine, via the real
FastAPI app running under uvicorn with `HR_LOG_QUERY_STATS=true`. Numbers are
medians of 5 warm calls per endpoint, read from the `X-Query-Count` /
`X-DB-Time` / `X-Pool-Checkouts` response headers. Tooling:
`backend/scripts/measure_latency.py`.

## The headline number — fixed cost of every authenticated request

Every authenticated call first resolves the user through `get_current_user`
(`app/core/dependencies.py`), which today makes **6 sequential round-trips** to
the database. At Neon's ~210 ms warm round-trip (measured below) that is a
~1.4 s fixed tax before the endpoint's own SQL even starts.

```
SELECT 1 round-trip (Neon, 20 warm runs): min=207.2ms median=210.4ms p95=234.0ms
/auth/me: queries=6  db_ms≈1455  checkouts=1  total≈1916ms
```

`/notifications/unread-count` (fired by the frontend shell on page load)
alone costs 5 queries / ~1.25 s.

## Baseline table

### Org-side (HR dashboards + employees)

| endpoint | queries | db_ms | total_ms | checkouts |
| --- | --- | --- | --- | --- |
| `/auth/me` (fixed auth cost) | 6 | 1455 | 1916 | 1 |
| `/notifications/unread-count` | 5 | 1250 | 1710 | 1 |
| `/hr/organization` | 11 | 2482 | 2901 | 1 |
| `/hr/leaves/dashboard` | 14 | 3061 | 3513 | 1 |
| `/hr/compensation/dashboard` | 14 | 3097 | 3537 | 1 |
| `/hr/dashboard/stats` | 15 | 3213 | 3620 | 1 |
| `/hr/employees` | 14 | 3373 | 2734 | 2 |
| `/hr/departments` | 12 | 2898 | 2289 | 2 |
| `/hr/employee-management/employees` (list) | 14 | 4066 | 3162 | 2 |
| `/hr/employee-management/employees/{id}` (profile) | 10 | 2602 | 2026 | 2 |
| `/hr/attendance/dashboard` | 19 | 4834 | 4269 | 2 |
| `/hr/performance/dashboard` | 403 | 0 | 1480 | 0 |

### Super-admin side (command center + billing)

| endpoint | queries | db_ms | total_ms | checkouts |
| --- | --- | --- | --- | --- |
| `/super-admin/health` | 1 | 409 | 828 | 1 |
| `/billing/plans` | 2 | 633 | 1069 | 1 |
| `/billing/discounts` | 2 | 640 | 1069 | 1 |
| `/billing/delinquency` | 3 | 1260 | 1685 | 1 |
| `/super-admin/audit-logs?limit=8` | 3 | 836 | 1267 | 1 |
| `/super-admin/audit-logs?page=1&page_size=50` | 3 | 1171 | 1638 | 1 |
| `/billing/refunds?page=1&page_size=20` | 3 | 828 | 1274 | 1 |
| `/super-admin/command-center/lifecycle` | 5 | 1235 | 1664 | 1 |
| `/super-admin/command-center/platform-health` | 3 | 814 | 1245 | 1 |
| `/super-admin/command-center/security?days=30` | 7 | 1681 | 2124 | 1 |
| `/super-admin/command-center/customer-health` | 6 | 1421 | 1859 | 1 |
| `/billing/refunds/summary` | 5 | 1501 | 2209 | 1 |
| `/super-admin/organizations?page=1&page_size=20` | 7 | 2203 | 2645 | 1 |
| `/super-admin/command-center/attention` | 11 | 2543 | 2945 | 1 |
| `/super-admin/command-center/commercial-health?days=30` | 14 | 3322 | 4135 | 2 |
| `/super-admin/command-center/overview?days=30` | 24 | 5455 | 6273 | 2 |

## Part B — auth path collapsed (after)

`get_current_user` / login / refresh now resolve the user with **one** query
(`Employee` + joined `Organization`) and read the rest from the cached
`OrgAccess` decision (`app/core/org_access.py`), which is invalidated on every
write through a `Session` flush listener and on the eval-expiry/bulk-update
paths. Also: `evaluation_access_block_reason` is now a pure read — the
write that used to auto-end overdue evaluations on the auth hot path moved to
a 10-minute scheduler interval job (+ the existing 02:10 cron). Measured
against the same Neon DB, same dev box:

```
SELECT 1 round-trip: unchanged ~210ms
/auth/me cold (cache miss):  queries=4  db_ms≈1057
/auth/me hot  (cached):      queries=2  db_ms≈620   (was 6 / ≈1455ms)
```

`/auth/me` total time dropped from **1.9 s to ≈ 1.0–1.2 s**; query count fixed
at 2 (auth lookup + the endpoint's own read). The two remaining queries pay
~210 ms each of Neon round-trip — further gains live in Part D.

## Part C — entitlement middleware cached

`_is_org_in_scope` used to read `entitlement_staged_org_ids` AND probe for a
billing subscription on every guarded request (2 queries / ~450 ms Neon).
Both are now short-TTL (30 s) cached via the shared cache backend,
invalidated synchronously by `PUT /super-admin/platform-settings/
entitlement_staged_org_ids` and by the org_access flush listener on any
org/subscription/evaluation write. Sample guarded endpoint on the same box:

```
/hr/departments  cold: queries=14 db_ms≈3350  (was baseline: 12 / 2898)
/hr/departments  hot:  queries=6  db_ms≈1660  → includes get_current_user(1) + entitlement(0)
```

## Part D — connection pool hardening

Recycle now matches Neon's idle timeout (300s vs 1800s), psycopg2 TCP
keepalives catch silent middlebox drops so `pool_pre_ping` sees them early,
`HR_USE_NEON_POOLER=true` rewrites the DATABASE_URL host to Neon's
PgBouncer-compatible `-pooler` endpoint, and a boot-time sizing guard warns when
`workers x (pool_size + max_overflow)` is about to exceed the configured
connection limit. Same query counts, no request-path change — resilience only.

## Part E — final re-measure + report

### How this was measured

Same endpoints the pages call (traced from the frontend service layer), run
before Part B and after Part D against the **same local PostgreSQL 17** seeded
with 60 orgs, 755 employees (one org of 400), 1,800 rows in each billing
snapshot table and 5,000 audit logs. Each endpoint: one cold call after boot,
then the median of 5 warm calls, read from `X-Query-Count`. Local Postgres
answers each query in well under 10 ms, so **query count is the metric that
carries over to production**: on the real database each sequential query
costs one network round-trip.

### Per page (warm)

| Page | Calls | Queries before → after | Slowest single call, before → after |
|---|---|---|---|
| Login (`/auth/login` + `/auth/me`) | 2 | 13 → 6 | 8 → 4 |
| HR dashboard | 6 | 75 → 55 | 17 → 13 |
| Employees list | 4 | 68 → 48 | 20 → 15 |
| Employee profile | 1 | 10 → 5 | 10 → 5 |
| Super Admin dashboard | 8 | 73 → 73 | 24 → 24 |
| Billing Overview | 6 | 32 → 32 | 14 → 14 |
| Organizations list | 1 | 6 → 6 | 6 → 6 |
| Refunds | 2 | 8 → 8 | 5 → 5 |
| Audit Logs | 2 | 5 → 5 | 3 → 3 |

Every org-user request now pays **3–5 fewer sequential queries** (auth 4 → 1,
entitlement middleware 4 → 2 on guarded routes). Super-admin pages are
unchanged: a super admin's auth was already 1 query and those routes are not
entitlement-guarded — their cost is the endpoints' own SQL (Phase 2).

What that means at a given round-trip time, for the slowest call on each
org-side page (queries are sequential within a request):

| Slowest call | Before | After | Saved at 2 ms RTT | at 30 ms | at 210 ms (dev box → DB) |
|---|---|---|---|---|---|
| Employees list | 20 | 15 | 10 ms | 150 ms | 1.05 s |
| HR dashboard (`performance`) | 17 | 13 | 8 ms | 120 ms | 0.84 s |
| Employee profile | 10 | 5 | 10 ms | 150 ms | 1.05 s |
| `/auth/me`, `/notifications/unread-count` | 5 | 2 | 6 ms | 90 ms | 0.63 s |

### Security review fixes made in Part E

Reviewing Part B against the rules ("no change may weaken auth, org deletion,
evaluation expiry") found two windows, both now closed:

1. **Deleted org on another worker.** Deletion was read from the cached
   decision, so with several workers and no Redis a deleted org could keep
   working on another worker for up to the TTL. `get_current_user` already
   loads the org row fresh with the employee; deletion is now also read from
   that row (no extra query). Always current.
2. **Evaluation ending while a decision is cached.** The cached decision said
   "allowed" with no end time, so access could outlive `evaluation_ends_at` by
   up to the TTL. The decision now stores `allowed_until`; a cached entry past
   that instant is treated as a miss and re-read. Expiry is exact again (cost:
   one query, only on that miss).

`tests/test_auth_path_cache.py` (9 tests) pins: the hot path is one query;
deleted org refused while the cache is stale; evaluation end enforced on the
dot with no write; end / convert / bulk expiry take effect on the next request;
old tokens after a password change refused; `must_change_password` gate;
token for another org refused.

### Cache keys and their invalidation

| Key | TTL | Invalidated by |
|---|---|---|
| `org_access:{org_id}` | 30 s (5 s with several workers and no Redis) | Session listener on commit for any write to `Organization`, `BillingSubscription`, `OrganizationEvaluation`, `BillingConversion`; explicit calls on the bulk-update paths (eval expiry, org delete/status); never trusted past `allowed_until` |
| `billing_sub_exists:{org_id}` | 30 s | Same listener (via `invalidate_org_access`) |
| entitlement staged-org list | 30 s | `PUT /super-admin/platform-settings/entitlement_staged_org_ids` (instantly on the instance that handled it; others within the TTL unless Redis is set) |

Not cached on purpose: the delinquency gate inside `check_entitlement`
(payment-policy enforcement).

### Remaining bottlenecks (Phase 2+)

- Super Admin dashboard: 73 queries across 8 calls; `command-center/overview`
  alone runs 24 sequentially.
- N+1: the employees list loads each row's department separately;
  `/hr/departments` counts employees one department at a time.
- `check_entitlement` still reads the feature-alias table on every guarded
  request (cacheable; left for Phase 2).

### Infrastructure notes (not changed)

- The database in `backend/.env` is a **self-managed PostgreSQL 14 on Google
  Cloud (Finland, 100 connection limit)**, not Neon; `.env.production` still
  holds a placeholder. `HR_USE_NEON_POOLER` (Part D) only applies if production
  really is on Neon.
- The figures above are from a dev machine; run
  `scripts/measure_latency.py` from the VM for production numbers.

## Observations driving parts B–D

1. **Fixed auth cost = 6 queries.** Part B removes/collapses these (one
   joinedload query + cached org access decision).
2. **Everything runs on one pooled connection** (`checkouts` of 1 per request
   even at 14–24 queries): the full request already holds a single connection,
   and each query is a full ~200 ms Neon round-trip issued sequentially — no
   client round-trips can be saved with a different pool, but the *number of
   sequential queries* is exactly what dominates.
3. **Dashboards do 11–24 queries.** Biggest wins come from part B (auth) plus
   flattening the obvious duplicate reads (e.g. `/auth/me` running the same
   employee query the endpoint repeats).
4. **Retry/health surface:** `/super-admin/health` itself needs a DB hit
   today. Part D keeps the check trivially fast without pre-ping tax.
5. Entitlement middleware is enabled (`HR_ENFORCE_ENTITLEMENTS=true`, staging
   list empty → pass-through), so the middleware's live `entitlement_staged_org_ids`
   lookup is already included in every guarded org-side number above.

## Caveats

- Measured from a Windows dev box far from the Neon compute region; absolute
  ms will differ from the GCP VM (likely faster), but query *counts* and the
  ratio structure carry over. The GCP VM should re-run this script for final
  numbers.
- `test_applications_reflect_real_state` fails in this checkout: it asserts
  Google sign-in shows "Not configured", but the local `.env` sets
  `GOOGLE_CLIENT_ID`. Pre-existing, environment-dependent, unrelated to this
  work.
- Server-side request log lines (`queries= db_ms= checkouts=`) go to stderr
  via the logging config when `HR_LOG_QUERY_STATS=true`.

## Reproduce

```bash
cd backend
HR_LOG_QUERY_STATS=true uvicorn app.main:app --port 8000
# mint tokens directly against the DB (dev only), then:
python scripts/measure_latency.py --base-url http://127.0.0.1:8000 \
  --super-admin-token "$SA_TOKEN" --org-admin-token "$ORG_TOKEN"
```