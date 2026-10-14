# ZHR-PRIV-001 control status (Prompt 1)

Stack note: the real stack is FastAPI + SQLAlchemy + Alembic + React (Vite), not Django / Next.js. There is no Celery (APScheduler loops and
threads), no GraphQL, no Next.js routes, no Sentry (see `stack.md`). Controls were adapted to what exists.

Status: **P** implemented and proven by a test, **F** partly done (the gap is in the notes), **U** built and tested here but not verified in a
production-equivalent setting, **N** not done.

Run the suite: `cd backend && python -m pytest tests/privacy -q` (add `HR_PRIVACY_PG_ADMIN_URL=postgresql://postgres@localhost:5432/postgres` to include the
PostgreSQL row-level-security tests). CI job: `privacy-boundary` in `.github/workflows/ci.yml`.

Verification pass (second read-through, while re-running the suites): the every-route IDOR sweep found and this pass fixed two
real 500 crashes in tenant routes - the learning dashboard used a PostgreSQL-only `to_char` expression (now dialect-aware) and the
attendance leave dashboard referenced a non-existent `LeaveRequest.total_days` and `Employee.is_deleted`
(the real names are `LeaveRequest.days` and `Employee.is_active`). On the frontend, the new MFA wiring added imports
(`mfaEnrollStart`, `mfaEnrollConfirm`) to the sign-in flow, so the older `authService` test doubles were updated to match,
and the entitlement nav test was repointed at paths a `super_admin` may reach (the same change added role path filtering for
the platform role). These were wiring/latent-bug fixes; they do not change any control's status below.

| Control | Status | Where | Proof / notes |
|---|---|---|---|
| A01 no standing platform access | P | `core/privacy/middleware.py`, `core/dependencies.py`, `core/privacy/routes.py` | `test_platform_boundary.py` (every data-plane route, every method, platform token: 404 identical to an unknown URL) and a Hypothesis sweep in `test_idor_property.py` |
| A02 trust boundary documented | P | `trust_boundary.md` | diagram + rules table |
| A03 / G07 classification complete | P | `core/privacy/classification.py`, `scripts/privacy_classification_doc.py` | `test_policy.py`: fails on any new table / column or an under-classified name; CI checks the generated doc |
| A04 / D02 platform namespace | F | route classes in `core/privacy/routes.py` | no `/api/platform` rename: the platform namespace is `/super-admin/*` and `/billing/*`, and everything else is closed to it by default |
| A05 fail closed | P | `core/privacy/policy.py` | `test_policy.py` T17: exception, unknown resource / action / field, missing tenant, bad subject, failing audit sink |
| A07 separated roles | F | `policy.GRANTS`, `roles_matrix.md` | HR admin keeps pay fields (as today): needs your decision |
| A08 small-cohort suppression | P | `core/privacy/minimise.py`; org list, org detail, dashboard | `test_platform_boundary.py` |
| B01 named platform accounts | P | `core/privacy/accounts.py`, bootstrap, platform-account requests, `scripts/privacy_flag_generic_accounts.py` | `test_platform_auth.py`. Existing generic accounts are reported, not disabled |
| B02 second factor | F | `core/privacy/mfa.py`, `/auth/mfa/*`, login page | TOTP, **not phishing-resistant**. WebAuthn not built. `HR_PLATFORM_MFA_REQUIRED` is off until accounts have enrolled; an account that enrolled is always asked |
| B03 reserved | N | | not part of this prompt's foundation list |
| B04 sessions / leaver | F | short platform access token, 8 h refresh cap, `typ=refresh`, revoke on deactivation / suspend / archive / role change, inactive account refused on every request | `test_platform_auth.py`. No server-side session table: idle timeout is token expiry |
| B06 dual control, platform accounts | P | `core/privacy/approvals.py`, `platform_accounts_router.py` | `test_platform_auth.py` (own approval refused, expiry, single use, at least two administrators) |
| B07 step-up | P | `/auth/mfa/step-up`, `mfa.require_fresh_mfa` | `test_platform_auth.py` |
| C01 tenant context | P | `core/privacy/context.py`, middleware, `tenant_scope.py` | `test_tenant_scope.py`, `test_jobs_and_context.py`. The ORM filter is on in enforce mode (`HR_TENANT_SCOPE_MODE`), see the notes below |
| C02 / C04 row-level security, roles | U | `core/privacy/rls.py`, `scripts/privacy_db_roles.sql`, migrations `d5e6…`, `e6f7…`, `f7a8…` | `test_rls_postgres.py` on PostgreSQL 17. **The application still connects as the table owner**, so the policies do not bind yet; see `db_roles.md` for the switch-over steps |
| C03 cross-tenant references | P | composite foreign keys (NOT VALID), `scripts/privacy_check_cross_tenant.py`, session write check | `test_cross_tenant_integrity.py`, PostgreSQL test. Existing data not yet checked on a real database |
| C05 files | P | `core/privacy/files.py`, tenant-prefixed uploads, 5-minute signed links, tenant check on downloads | `test_files.py`. Older files (no tenant folder) are still served; they are covered by their organization-scoped record only |
| C06 caches / search | P | response cache keyed by organization + user, retrieval filtered by organization | `test_cache_and_search.py`; audit result in `stack.md` |
| C07 uniform responses | F | middleware 404 for a foreign `organization_id`, 404 for foreign ids, ID lookups rate limited | `test_cache_and_search.py`, `test_idor_property.py`. Creating a user with an e-mail used in another organization still says it exists: sign-in finds a person by address, so the address must be unique across organizations |
| C09 background jobs | F | `core/privacy/jobs.py` (`tenant_job`, `recheck`, `run_in_thread`) | `test_jobs_and_context.py`. Applied to the e-mail threads; the webhook and billing schedulers are system-wide loops and are not yet per-tenant tasks |
| C10 / D07 redaction | P | `core/privacy/redact.py`, installed at start-up | `test_egress.py` including the canary leak test through the main flows |
| D01 no impersonation | P | none exists | `test_platform_boundary.py` |
| D03 platform pages and notifications | P | see `super_admin_exposure.md` | `test_platform_boundary.py` |
| D04 analytics | N/A | no analytics SDK in the repo | |
| D05 audience-bound tokens | P | `core/privacy/tokens.py`, `core/security.py` | `test_tokens.py` (T16) |
| D06 Mira | P | `assistant/tool_registry.py`, `orchestration_service.py` | `test_mira.py` (T13) |
| D07 LLM data | P | `redact.scrub_messages` in `llm_client.py`, `llm_dataflow.md` | `test_llm_dataflow.py`. Provider retention is not recorded: fill it in |
| D08 error messages | P | generic 500 handler | `test_egress.py` |
| D09 dual control, bulk actions | F | `approvals.gate_high_impact`, `/hr/approvals`, bulk delete, delete-all, bulk hard delete | `test_dual_control.py`. **Off by default** (`HR_DUAL_CONTROL_HIGH_IMPACT`); no UI for the 202 "approval needed" answer yet; bulk pay import is not gated |
| E01 platform sees no people | P | | `test_platform_boundary.py` |
| E02 / E03 / E06 / T05 field policy | P | `core/privacy/employee_view.py`, `EmployeeResponse`, reports / export admin-only | `test_employee_visibility.py`. Employee records only: other response types (leave, documents, compensation lists) are not masked yet |
| E04 tenant finance not reachable | P | expense, approvals, support routers deleted | `test_platform_boundary.py` |
| E07 ABAC | F | manager = direct reports; delegate = departments in `policy` | `test_policy.py`. No delegate role exists in the product |
| E08 previews, history, exports | F | files and exports covered; version history / diff endpoints are not masked | |
| E09 export is its own action | P | `policy` actions; export admin-only in the API | `test_policy.py`, `test_employee_visibility.py` |
| F03 non-production data | P | `scripts/seed_synthetic_tenants.py`, `scripts/mask_database_copy.py` | `test_nonprod_data.py` |
| T01-T02, T05, T12-T14, T16-T18 | see rows above | `tests/privacy/` | T14 needs PostgreSQL (`HR_PRIVACY_PG_ADMIN_URL`); T18 = `test_E04…` |

## Removed (code deleted, in git history)
`/super-admin/documents`, `/approvals`, `/expenses`, `/support` routers and their tests; the platform's Documents, Expenses, Support Tickets and Assistant Knowledge pages; the platform's use of `/hr/admin/users`.
Candidate for removal that needs your decision: table `super_admin_expense_budgets` (unused now).

## Needs a human decision or action
1. **Rotate the database password in `backend/add_mfa_cols.py` and delete the file** (a production URL is hard-coded in it).
2. HR admin and pay (`roles_matrix.md`).
3. When to turn on `HR_PLATFORM_MFA_REQUIRED`, `HR_DUAL_CONTROL_HIGH_IMPACT`, and when to move the application to the row-level-security roles.
4. Fill in the provider retention line in `llm_dataflow.md`.
5. Existing platform accounts: run `scripts/privacy_flag_generic_accounts.py`, then replace any generic one through the request flow.
6. The production database: run the three queries in `db_roles.md` and `scripts/privacy_check_cross_tenant.py` against it (this work never connected to it).
7. If the production super admin address is a placeholder or generic, it is refused at sign-in since ZHR-103.

## Behaviour changes users will notice
Platform: no tenant people pages, minimised activity / audit / user views, no way to message an individual, organization admin accounts managed from `/super-admin/users`. Tenants: colleagues see the company directory only (not pay, phone, personal details), org-wide reports and the export are administrator-only, platform sessions are short. Responses carry `X-Request-ID`.

## Handed to Prompt 2
Support grants (`policy._evaluate_support_grant` is the one hook), break-glass, immutable audit store (replace `AuditSink`; today decisions go to the log and an in-memory tail), alerts, grant revocation (extend `core/privacy/sessions.revoke_all_sessions`), the remaining T-series tests, the evidence bundle.
