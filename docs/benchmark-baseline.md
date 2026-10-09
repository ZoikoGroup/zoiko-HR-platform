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