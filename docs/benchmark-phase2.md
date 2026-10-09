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
