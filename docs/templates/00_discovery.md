# 00 — Discovery: what the template engine builds on

Prompt 1 of 4 (ZHR-ELT-TPL-001). This file records what was actually found in the repo before the engine was built, and every place
where the brief's assumptions were wrong. Line numbers are as of branch `rugvedh` on 2026-10-21.

## Source documents

| Source | Where | Check |
|---|---|---|
| `template_register.json` (566 entries) | copied to `backend/app/modules/doc_templates/seeds/template_register.json` | 566 unique IDs, 23 families, counts match guide §2 |
| ZHR-ELT-TPL-001 v1.0 guide | `Zoiko_HR_566_Templates_Engineering_Implementation_Guide.docx` (not committed) | §5.1 preflight order, §8.1 negative suite, §10 exemplars used |
| Complete 566 Template Index v1.0 | `Zoiko_HR_Complete_566_Template_Index_v1.0.docx` (not committed) | All 566 IDs, titles and kinds identical to the register JSON (checked by script on 2026-10-21) |

The register entries carry `id, family, title, kind, risk, sensitivity, trigger, template_json, status`. The per-template JSON/Markdown
drafts mentioned in the guide (`templates/HR-xxx/*.json`) were **not** supplied, only the register. Starter content for business
templates therefore arrives with Prompts 2–4.

## Corrections to the brief's assumptions

| Brief said | Reality | What the engine does |
|---|---|---|
| Tenant API has a prefix "style" like `/api/...` | No `/api` prefix. HR routes are `/hr/...`; there is no `/me` ESS prefix (self-service is `/hr/employees/me`, `/hr/ess`). | New routes: `/hr/templates/*`, `/hr/generated-documents/*`, `/hr/legal-entities/*`, `/hr/policy-distributions/*`, `/hr/me/generated-documents/*`, public `/public/documents/*`. |
| `/documents/...` paths | `hr_router` already owns `/hr/documents/{document_id}`; a sibling `/hr/documents/templates` would be captured by it and fail validation (422). | Separate prefixes above. |
| HR routers call `core/privacy/policy.authorize()` | They don't. Only `support_access` and the assistant tool registry call it. HR routers read `current_user.organization_id` and use role guards. | The engine calls `authorize()` for the subject of every request (employee subject → `employees` resource; documents → `generated_documents` resource) and raises 403 itself (authorize never raises). |
| Classification levels C2/C3/C4 | `classification.py` uses named levels (`PERSONAL_BASIC`, `PERSONAL_CONFIDENTIAL`, `SPECIAL_CATEGORY`, `TENANT_FILE`, …). | Register sensitivity stays on the definition and the document. When a document is authorised it is treated as C2→`PERSONAL_CONFIDENTIAL`, C3/C4→`SPECIAL_CATEGORY` (so managers, whose grant stops at confidential, never see C3/C4). C3/C4 field snapshots and files are encrypted at rest and marked Confidential. |
| Employer entities exist | Only free-text `entity_*` columns on `recruitment_offers` (`hr/models.py:1223`). | New `employer_entities`, `authorised_signatories`. |
| Employees have a `user_id` | `employees` *is* the login account (`employee/models.py:122`). | Signer/actor = `employees.id`. |
| Employees have country as ISO-2 | `employees.country` is a free-text **name** ("India"); onboarding writes `regions.country_name(code)` into it. | New `work_country` (ISO-2) backfilled with a **strict** name/code/alias lookup (`regions.country_code_strict`, new); `regions.country_code()` also scans free text, which counts as guessing. |
| `employees` has a probation end date | No column; probation is in `employee_lifecycle` events + `confirmation_date`. | `employment.probation_end_date` resolves from the latest `probation_end` lifecycle event, else empty. |
| An `employee.created` event to subscribe to | `EVENT_CATALOG` (`integrations/events.py:12`) has 5 events, no `employee.created`; there is no in-process subscriber mechanism at all (events only queue webhooks/workflows). | New joiners are matched to published policy distributions by a scheduled job (every 30 min) — it also catches onboarding conversions and CSV imports, which emit nothing today. |
| Reuse existing email OTP | There is none. `core/privacy/mfa.py` is TOTP only. | New `document_sign_otps` (hashed 6-digit code, 10-min expiry, 5 attempts, rate limited). |
| `security_action_tokens` can carry a document | The table has no reference column and `_issue_action_token` revokes every outstanding token for the same email+purpose (a candidate with two documents would lose the first link). | New purpose `document_sign` plus a nullable `reference` column; engine-owned issue/consume functions revoke by reference, not by email. |
| Document approval: "admin approves → skip remaining steps" | Confirmed: `approve_document` (`hr/service.py:6504-6567`) approves every step the approver's power covers and marks higher steps SKIPPED. In practice every upload is auto-approved because only hr_admin/admin can upload (`create_default_approval_steps`, L6399). | Not reused. Generated documents use their own `generated_document_approvals` chain with separation-of-duties checks; no skip path. Existing `hr_documents` chain left untouched. |
| Document acknowledgement exists | `document_assignments.acknowledged_at` exists but **nothing** ever writes it; there is no acknowledge endpoint and no frontend action. `send_document_assigned_email` has no callers. | New `document_acknowledgements` + ESS endpoint; the linked `document_assignments` row is set to `acknowledged`. |
| Gap-free numbering helper | `core/code_generation.generate_business_code` is count-based (reuses numbers after deletes) and its advisory-lock key uses Python `hash()` (randomised per process). | New `document_number_sequences` row per org+year, incremented under `SELECT … FOR UPDATE` (row lock) in the same transaction as the insert. |
| ReportLab already used for documents | Only `workforce_router.export_wf_pdf` (simple table). No payslip/letter PDF exists server-side. | New Platypus renderer with embedded Noto fonts, numbered pages, invariant (deterministic) output. |
| `create_employee_history_entry` records changes | It never sets `organization_id`, which is NOT NULL (`employee/service.py:3151`, duplicate at `hr/service.py:5233`). Only `change_manager` calls it. | Engine writes `employee_history` rows itself with `organization_id`; the existing bug is fixed in both helpers. |
| Offer letter is generated server-side | Client-side only: pdfmake in `offers.jsx` (`buildDocDefinition` L372, `generatePdf*` L543-558) and `OfferLetterTemplate.tsx`, both with hard-coded `en-IN` money, `en-GB` dates, Indian/Zoiko fallback addresses, a fixed "₹2,000 per month" perk and a "30 October 2026" fallback deadline. `send_offer_letter` (`email_service.py:871`) attaches whatever base64 PDF the browser posts. | Not changed in Prompt 1 (HR-HIR templates are Prompt 2). Server-side formatting (`doc_templates/formatting.py`) is ready for it. |

### Decided during the build

| Brief said / assumption | Reality | What the engine does |
|---|---|---|
| Region *codes* from `core/regions.py` | `core/regions.py` has countries only; `core/business_ids.REGIONS` lists subdivision **names** for IN, US, CA, AU, AE, GB, with no codes anywhere in the repo. | `work_region` and pack `region` store the region name exactly as `REGIONS` spells it (validated case-insensitively for countries with a list), columns widened to 100. No code table was invented. |
| Table `clauses` | — | Named `template_clauses` (unambiguous next to other tables). |
| Platform rows visible to all tenants | The automatic tenant filter adds `organization_id = <tenant>`, which would hide platform rows (`NULL`). | Packs, variants and clauses use `owner_organization_id` with an explicit "mine or platform" filter in the engine; every table holding people or documents keeps a NOT NULL `organization_id` and the automatic filter. |
| Employee hard delete | `hard_delete_employee` deletes every row reachable through NOT NULL FKs, which would destroy document evidence. | Refused (with a clear message) for anyone who appears in document evidence; deactivate instead (`doc_templates/retention.py`). |

## How things work today

### Auth, tenant and role (routers)
- `core/dependencies.get_current_user` returns the ORM `Employee` (with `organization`), checks token freshness, active, password change, evaluation access, and returns **404** for a super_admin on any `DATA_PLANE` route.
- Role guards: `get_current_admin` (super_admin/admin/hr_admin), `get_current_org_admin` (super_admin/admin). There is no manager guard; modules write their own (e.g. `recruitment_router.get_recruitment_reader`).
- `core/privacy/middleware.PrivacyContextMiddleware` decodes the token, 404s platform tokens on data-plane routes, 404s cross-tenant `organization_id` query params, runs the support-login read-only gate (`sls` claim), and sets the request context used by `tenant_scope`.
- `core/privacy/tenant_scope` adds `organization_id = <tenant>` to every ORM SELECT/UPDATE/DELETE on any table with `organization_id`, and stamps/validates inserts. Applies only in TENANT context (not public routes or jobs). Every new engine table therefore carries `organization_id`.
- `core/privacy/routes.classify_route`: unknown paths default to `DATA_PLANE`; `/public` is `PUBLIC`.
- Support access: platform staff reach tenant data only through `/support/*` with a live `SupportGrant` (employees resource only) or through a tenant-approved temporary read-only sign-in (`support_login`), which blocks every non-GET. Neither path is widened by this work.

### Files
- `core/privacy/files.tenant_upload_path(root, org_id, filename)` → `<root>/t<org>/<name>`; `sign_download(kind, object_id, org_id, ttl≤300s)` / `verify_download(token)` HMAC tokens.
- Existing serving pattern: `POST /hr/documents/{id}/download-link` → `/hr/files/signed/{token}` (no auth, `kind == "hr_document"`, 404 on any failure, `Cache-Control: private, no-store`).
- Roots: `UPLOAD_BASE_DIR` (default `/tmp/uploads`), `HR_DOCUMENT_UPLOAD_DIR`, `ONBOARDING_DOCUMENT_UPLOAD_DIR`. README L124 warns these must be on a persistent volume.
- Engine adds `HR_GENERATED_DOCS_DIR` (default `$UPLOAD_BASE_DIR/generated_documents`) behind a `DocumentStore` interface (`doc_templates/storage.py`) and its own signed route kind `generated_document`.

### Email
- `services/email_service.send_approval_email(email, template_name, context, db=, organization_id=, attachments=[(name, bytes)])`, queued to a worker thread (sync under pytest). Jinja templates in `app/email_templates/` extend `_layouts/base.html` and use `_layouts/_components.html` macros (`ui.button`, `ui.details`, `ui.detail_row`, `ui.notice`, `ui.link_fallback`, `ui.signoff`). Subject comes from `context["subject"]`.
- SMTP settings in `app/config.py`; local `.env` credentials are rejected by the server (sends fail locally).

### Tokens
- `security_action_tokens` (`employee/models.py:102`): `email, organization_id, purpose (VARCHAR enum), token_hash (sha256), expires_at, used_at`. Consumption is an atomic `UPDATE … WHERE used_at IS NULL AND expires_at > now RETURNING`.

### Events
- `integrations/events.emit_event(db, type, data, organization_id)` after commit; unknown types dropped. New event types must be added to `EVENT_CATALOG` (the workflow-meta test compares the trigger list to it).

### Jobs
- APScheduler jobs are registered in `billing/scheduler._ensure_scheduler()`; started only on the leader (`core/leader.acquire_background_leadership`). Job body pattern: own `SessionLocal()`, try/except, close in finally.

### Entitlements
- `billing/feature_keys.FEATURE_KEYS`; `billing/route_entitlement_map.ROUTE_ENTITLEMENT_MAP` maps exact `(METHOD, path)` → key; enforced by `EntitlementMiddleware` (when `ENFORCE_ENTITLEMENTS`) or per route with `core/entitlements.require_entitlement(key)`. `tests/test_entitlement_coverage.py` requires every built key to map at least one real route. Keys absent from `plan_baseline.PLAN_BASELINE` are included in every plan.

### Privacy registration
- Every tenant table (has `organization_id`, or an FK to one) must be in `classification.TABLES` / `PREFIX_DEFAULTS`, or `tests/privacy/test_policy.py::test_A03` fails; `docs/privacy/data_classification.md` must be regenerated with `python scripts/privacy_classification_doc.py`.
- RLS policies are generated from metadata by `scripts/privacy_apply_rls.py` (run after a migration that adds a table).
- `tests/privacy/test_idor_property.py` sweeps every data-plane GET route with ≤1 path param using tenant-B ids, junk paging params and a platform token; new routes are covered automatically.

### Domain services the templates will bind to (Prompts 2–4)
| Area | Tables | Create functions |
|---|---|---|
| Lifecycle | `employee_lifecycle` | `employee/service.create_employee_lifecycle_event`, `confirm_probation`, `promote_employee`, `transfer_employee`, `resign_employee`, `exit_employee`, `change_manager` |
| Offers | `recruitment_offers` (`work_country` ISO-2, `entity_*`, `salary`, `currency`, `pay_period`) | `recruitment_service.create_offer`, `send_offer`, `send_offer_with_pdf`, `accept_offer` |
| Onboarding | `onboarding_new_hires` (country only in `profile_details` JSON) | `hr/service.create_new_hire`, `update_new_hire`, `_create_employee_from_onboarding`; `onboarding_flow.start_onboarding` |
| Leave | `leave_requests`, `leave_balances` | `hr/service.create_leave_request`, `attendance_service.create_leave_request` |
| Attendance | `attendance_records`, `shifts`, `shift_rosters` | `attendance_service.create_attendance_record`, `hr/service.create_attendance_record` |
| Performance | `performance_reviews`, `performance_goals`, `performance_appraisals` | `hr/service.create_performance_review` |
| Compensation | `employee_compensations`, `salary_revisions` | `employee/service.create_employee_compensation`, `hr/service.create_salary_revision` |
| Learning | `learning_enrollments`, `learning_certifications` | `learning_service.create_enrollment`, `create_certification`, `assign_program` |

### Jurisdiction-relevant fields
- `employees`: `country` (name), `state`, `city`, `address`, `employment_type` (`full_time, part_time, contract, intern, probation`), `job_title`, `designation_id`, `department_id`, `reporting_manager_id`, `date_of_joining`, `confirmation_date`, `work_email`, `language`, `timezone`.
- `organizations`: `organization_name`, `display_name`, `organization_code` (2 letters + optional digits), `address`, `country` (name), `state`, `city`, `tax_number`, `registered_email`, `phone`, `logo_url`, `currency`, `timezone`.
- `employee_reporting.location` (free text).
- `core/business_ids.FORMATS` gives registration ID types per ISO-2 country (gstin/cin/pan, ein, company_number/vat/utr, abn/acn, uen, …).

### Mira (assistant)
- `assistant/tool_registry.TOOLS` is a deterministic intent → (resource, action) map (`leave_balance, attendance_status, org_headcount, department_directory, employee_roster, book_leave, policy_qa`), not LLM function calling. None touches documents. A test now asserts no tool or intent can approve/issue/sign/send a generated document.

### Frontend
- React 19 + Vite, `.jsx` only (no TypeScript toolchain), Tailwind v4, lucide icons, raw-`fetch` client `src/service/api.js` (`api.get/post/put/patch/delete`, `{auth:false}` for public).
- Routes in `src/App.jsx` (`lazyRoute` + `routeOverrides`), sidebar in `src/navigation.js`, role prefixes in `src/config/roles.js`. Public routes are plain `<Route>`s outside `AppLayout`, before the `*` catch-all.
- Reusable UI: `components/HRPage.jsx`, `components/PageHeader.jsx`, `components/billing-ui.jsx` (`Modal`, `DataTable`, `Button`, `Field`, `Select`, `SearchInput`, `ActivityTimeline`). No toast provider is mounted; pages use local toast state.
- Tests: Node's built-in runner (`node --test`) with jsdom + @testing-library/react in `frontend/__tests__/*.test.mjs`.
- No signature pad, block editor or diff library; the engine ships small in-house ones (no new dependencies).
