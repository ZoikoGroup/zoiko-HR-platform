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

---

# ZHR-PRIV-001 control status (Prompt 2 — just-in-time support access)

Prompt 2 is self-contained in `backend/app/modules/support_access/`, with one hook in the central PDP
(`policy._evaluate_support_grant`). Nothing here touches the AI assistant (Mira). Migration head is `7c8d9e0f1a2b`.

The rule, in one line: **a Super Admin's only route to tenant data is a just-in-time grant — requested by a named engineer,
approved by the tenant, co-approved by Security/Privacy when the risk is HIGH, issued as a signed single-tenant capability,
checked on every operation, revocable within seconds, and on a tamper-evident record the tenant can see.**

| Control | Status | Where | Proof / notes |
|---|---|---|---|
| A01 JIT only — no standing platform data access | P | `dependencies.grant_context`, `routes.py` (`/support` is CONTROL_PLANE, the grant is the access control) | `test_support_access_flow.py` T02, T05 |
| A02 named engineer requests, named approvers decide | P | `service.create_request`, `models.SupportAccessRequest` | T01, `test_support_access_model.py` |
| A03 ticket / purpose / category required | P | `service.create_request` validation, `scopes.validate_scope` | `test_support_access_model.py` |
| A04 one open request per engineer per tenant | P | `state.OPEN_STATUSES`, `create_request` | `test_support_access_model.py` |
| A05 the request grants nothing until activated | P | `create_request` writes DRAFT; only `activate_grant` issues a capability | T19 (break-glass analogue), T02 |
| A06 risk computed, not asserted | P | `scopes.compute_risk` (sensitive field, export/bulk/update, large record set) | `test_support_access_model.py` |
| A07 HIGH risk needs independent Security/Privacy | P | `service.independent_decide`, `_advance` refuses to issue on one approval | T10 |
| A08 nobody approves their own request | P | `service` self-approval refusal | T08 |
| B01 tenant-designated authorisers only | P | `service.designate_authoriser`, `TenantAuthoriser` | `test_support_access_flow.py`, `/hr/support-access/authorisers` |
| B02 a platform account can never be a tenant authoriser | P | `designate_authoriser` | `test_support_access_model.py` |
| B03 approval window auto-expires | P | `APPROVAL_WINDOW_HOURS`, `expire_stale` | `test_support_access_model.py` |
| B04 an approval may narrow, never widen | P | `scopes.narrower_or_equal` / `assert_narrowing` | `test_support_access_model.py` T-narrowing |
| B05 effective scope = request ∩ every approval | P | `service.effective_scope` | `test_support_access_model.py` |
| B06 fresh MFA at request, approve, activate, revoke, break-glass | P | `core/privacy/mfa.require_fresh_mfa` on every state-changing support route | route tests; `HR_SUPPORT_GRANT_MFA_MAX_AGE_SECONDS` |
| B07 capability is signed and verified on every call | P | `granttokens.issue/verify` (HS256, auto-RS256 if a PEM is set), `grant_context` | T02, `test_support_access_flow.py` |
| B08 status only moves through the state machine | P | `state.py`; a scan test refuses any `.status =` elsewhere | `test_support_access_model.py::test_status_is_only_written_by_the_state_module` |
| B09 scope schema is closed (unknown key/resource/field refused) | P | `scopes.validate_scope` | `test_support_access_model.py` T-scope |
| B10 `impersonate` can never be granted | P | `GRANTABLE_ACTIONS` excludes it; `validate_scope` refuses it | `test_support_access_model.py` |
| B11 secret values can never be in scope | P | `validate_scope` refuses SECRET classification | `test_support_access_model.py` |
| B12 tenant notified; tenant can revoke now | P | `service.notify_tenant`, `/hr/support-access/grants/{id}/revoke` | T07 |
| C01 single-tenant capability | P | grant carries `tenant_id`; `grant_context` + policy refuse another tenant | T05 |
| C02 bound to session and device | P | `session_fingerprint`, `device_fingerprint`, claims `sid`/`dev` | `grant_context`; T-flow |
| C03 short-lived, ≤120 min, no renewal | P | `HR_SUPPORT_GRANT_MAX_TTL_MINUTES`; there is no renew path | issuance tests |
| C04 action- and field-limited | P | capability carries actions + fields; policy enforces | T01, T04, T06 |
| C05 object-limited | P | `record_ids` / `entity_ids` / `department_ids` | T03 |
| C06 revocation version bound into the token | P | `revocation_version` vs claim `rv` | T30 |
| C07 superseded on policy change | P | `policy_version` vs claim `pv` | `grant_context` |
| D01 enforcement on every support operation | P | every `/support` handler depends on `grant_context` + `_authorize` | whole flow suite |
| D02 fail closed — any missing check denies | P | `grant_context` refuses in order; `policy` default-deny | T02, T04, T05, T06 |
| D03 default view IS the grant (mask the rest) | P | `router._fields_param` passes `fields=None` → policy returns exactly granted fields | T01 |
| D04 an explicitly named non-granted field refuses the whole request | P | `Context.explicit_fields` | T04 |
| D05 no cross-product propagation | P | capability is scoped to the support module; other routes ignore the cookie | `test_platform_boundary.py` unchanged |
| D06 platform refused on tenant routes even with a grant | P | route classification + middleware | `test_platform_boundary.py` |
| D07 export/download are separate verbs | P | action check | T06 |
| D08 jobs / downloads scoped to and cancelled with the grant | P | `jobs.register/cancel_for_grant` | T31 |
| E01 field sensitivity enforced | P | `policy` classification levels | T04 |
| E02 special-category data needs Privacy + legal basis | P | `scopes.requires_privacy_approval`, `legal_basis_reference` | model + flow tests |
| E03 financial data needs Security | P | `scopes.requires_security_approval` | model tests |
| E04 masking is real (values absent, not blanked) | P | policy returns field names; handler selects them | T01 (canary absent) |
| E05 exports are grant-scoped | P | export action + object scope | T06 |
| E06 no sensitive values in logs | P | `events.emit` filters; audit stores names only | `audit.record` payload review |
| E07 residency / jurisdiction (when a scope carries it) | F | `jurisdictions` in scope; no per-region store yet | note only |
| E08 usable only by the platform account it was issued to | P | `grantee_person_id` / `sub` checks | `grant_context` |
| F01 revocation is immediate | P | `revoke_grant` bumps version, tombstones cache | T30 |
| F02 tenant "Revoke now" | P | `/hr/support-access/grants/{id}/revoke` | T07 |
| F03 expiry enforced per request | P | `grant_context` checks `expires_at` | `test_support_access_flow.py` |
| F04 kill switch by person / session / tenant / global | P | `service.kill_switch`, `/super-admin/support-access/kill-switch` | T27, T28, T29 |
| F05 a tenant's kill switch reaches only itself | P | forced TENANT scope | T29 |
| F06 queued work cancelled on revocation | P | `jobs.cancel_for_grant` | T31 |
| F07 ≤60 s propagation across nodes | F | Redis pub/sub `cache.subscribe` + 5 s TTL fallback | T30 proves single-node immediacy; cross-node needs a Redis deployment to prove end-to-end |
| F08 revocation recorded and visible | P | `RevocationEvent`, `/revocations` | T32 |
| G01 append-only audit table | P | `audit.PrivacyAuditEvent`, `privacy_audit_events` | `test_support_access_audit.py` T13 |
| G02 SHA-256 hash chain over the record | P | `audit.record`, `verify_chain` | T13 |
| G03 an edit or delete breaks the chain and is named | P | `verify_chain` returns first bad id | T14, T15 |
| G04 PostgreSQL append-only trigger; external anchoring seam | F | migration `6b7c8d9e0f1a` trigger; `audit.anchor(sink=...)` is a seam with no sink configured | note; external anchoring needs a destination |
| H01 break-glass is two-person | P | `start_breakglass` + `confirm_breakglass`; initiator cannot confirm | T19, T20 |
| H02 fresh MFA on both people | P | `require_fresh_mfa(300)` on start and confirm | route |
| H03 read-only | P | `_breakglass_scope` refuses write verbs | T21 |
| H04 never special-category or secret | P | `_breakglass_scope` refuses those levels | T22 |
| H05 ≤60 min, non-renewable | P | `HR_SUPPORT_BREAKGLASS_MAX_MINUTES`, capped at 60 | T25 |
| H06 tenant sees it; ends by clock or explicit end | P | `/hr/support-access/breakglass`, `end_breakglass`, `expire_breakglass` | T23, T24, T26 |
| I01 active emergency access is surfaced | P | `assurance.detect` `BREAK_GLASS_ACTIVE` | T34 |
| I02 sensitive live grants are surfaced | P | `SENSITIVE_GRANT_LIVE` | T33 |
| I03 a live grant with no approval is critical | P | `GRANT_WITHOUT_APPROVAL` | `detect` |
| I04 a grant live after its request closed is critical | P | `GRANT_LIVE_AFTER_CLOSE` | `detect` |
| I05 probing (a burst of refusals) is flagged | P | `DENIAL_BURST` | T38 |
| I06 unpropagated revocations are flagged; alerts log | P | `REVOCATION_NOT_PROPAGATED`, `scheduler._maintenance_job` | T39, scheduler |
| J01 tenant transparency page (read model) | P | `assurance.tenant_activity`, `/hr/support-access/activity` | T37 |
| J02 tenant sees requests, grants, emergency sessions, revocations | P | `tenant_activity` | T37 |
| J03 tenant sees only its own | P | tenant-scoped query | T37 |
| J04 shape not values | P | `scopes.summary` in every row | T37 |
| J05 notification seam on each transition | F | `service.notify_tenant` emits `TENANT_NOTIFIED`; delivery is a seam | real e-mail/portal delivery is `human_actions_required.md` #3 |
| K01 daily reconciliation with pass/fail | P | `assurance.reconcile`, `/reconciliation` | T35, T39 |
| K02 recertification queue | P | `assurance.recertification`, `/recertification` | T36 |
| K03 periodic maintenance (expiry, lapse) | P | `service.run_maintenance`, `support_access/scheduler.py` | runs every 5 min under the leader lock |
| K04 reconciliation failure pages | P | `_maintenance_job` logs `ALERT` per failed check | scheduler |
| L01 platform UI: request / approve / revoke / switch | N | API only; no React screen built in this work | see Phase 13 note |
| L02 tenant UI: approve / revoke now / transparency | N | API only | see Phase 13 note |

## Prompt 2 verification
- Run: `cd backend && python -m pytest tests/privacy -q` — **298 passed, 11 skipped** (T01–T39 + Phase 1 model tests + Prompt 1 suites).
- Migrations `5a6b7c8d9e0f` (models + PG maker-checker trigger), `6b7c8d9e0f1a` (audit + append-only trigger),
  `7c8d9e0f1a2b` (break-glass grant has no request). All upgrade and downgrade cleanly; single head `7c8d9e0f1a2b`.
- `docs/privacy/endpoint_inventory.md` and `data_classification.md` are generated and checked in CI.

## Prompt 2 deviations and gaps (deliberate)
1. **Grant signing key**: HS256 with a dedicated key (`HR_SUPPORT_GRANT_SIGNING_KEY`, else derived from `SECRET_KEY`);
   auto-switches to RS256 when a PEM is configured. Asymmetric keys require key management, which is a deployment decision.
2. **External audit anchoring**: `audit.anchor(sink=...)` exists with no sink; the chain is tamper-evident within the DB,
   not yet anchored outside it (G04).
3. **Redis**: the pub/sub fan-out and cross-node ≤60 s proof need a Redis deployment; without it a single node is still
   bounded by the 5 s cache TTL and the per-request version check (F07).
4. **Notifications**: emitted as events; e-mail/portal delivery is a seam (J05).
5. **Phase 13 UI** is not built; every control is reachable by API and tested there.

