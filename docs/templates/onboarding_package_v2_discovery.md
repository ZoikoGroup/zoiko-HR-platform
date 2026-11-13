# Onboarding package v2 — Phase 0 discovery

Discovery only: nothing in the code was changed. Line numbers are as of branch `rugvedh`, 2026-11-13 (working tree, including
uncommitted changes). "Package" = the 10 onboarding documents issued from Onboarding › Documents › Offer package.

---

## 1. Summary

**What exists.** The package is three backend modules plus two routers and two React components:

| Piece | File | Lines |
|---|---|---|
| Flow, settings, readiness, issuing, portal actions, signing hooks | `backend/app/modules/hr/onboarding_package.py` | 1165 |
| Content: Placeholder Dictionary, clause hooks, 10 block builders | `backend/app/modules/hr/onboarding_package_content.py` | 841 |
| Renderer: ReportLab PDF + candidate HTML from the same blocks | `backend/app/modules/hr/onboarding_package_render.py` | 981 |
| HR + public routes | `backend/app/modules/hr/onboarding_package_router.py` (156), `onboarding_portal_router.py` (118), `hr/router.py:1999` (send) | |
| Settings UI / per-hire panel | `frontend/src/modules/zoiko-hr/onboarding/OfferPackageSettings.jsx` (319), `OfferPackagePanel.jsx` (352) | |

Settings are one JSON row in `organization_configs` (`key = "onboarding_package.config"`). Company particulars come **only** from that
row (a test enforces it); per-hire values come from the new hire, the linked recruitment offer and requisition, the hire's
`profile_details` JSON, and HR's per-hire overrides. Missing required values or counsel clauses keep a document unsent and listed in
readiness; previews of unready documents carry a DRAFT watermark. Sent documents are immutable: the PDF (and, for SIGN documents, the
HTML) is stored at issue time and every later view serves the stored bytes.

**What v2 touches.** Every layer: a new `company_profile.config` sibling row merged into `get_config`; new token namespaces
(`company.*`, `worker.*` with structured address and initials, `engagement.*`, `role.*`); per-org Engagement/Role profiles (nothing
like them exists); all 10 builders rewritten to the reference documents; the renderer moved from Helvetica to the bundled Noto Sans
(already in the repo, ₹ glyph present); a DOCX writer (no library installed); new filename scheme; bulk generation; and
`PACKAGE_VERSION` 1.0 → 2.0.

**Biggest risks.**
1. **Document mode is not stored per issued document.** `mode_of(category)` reads the *current* `C.DOCS` at runtime
   (`onboarding_package.py:51`). Changing a category's mode or meaning in v2 (e.g. `self_disclosure` VOLUNTARY → a signed conflict-of-
   interest declaration) silently changes how already-issued v1 rows are counted, blocked and check-listed. Categories/template IDs
   must stay stable, or v1 rows need a stored mode/version.
2. **Some renders happen after issue.** `signing_schedule()` (`:863`) re-renders the affidavit's Schedule A *at signing time* with the
   current renderer. A v1 affidavit signed after the v2 deploy would get a v2-styled schedule page with a `v2.0` footer.
3. **`PUT /hr/onboarding/package/settings` with the v1 keys is used by about 15 tests** (`legal_name`, `signatory_name`, …). If the
   company fields move into `company_profile.config`, the old keys must keep working as aliases or every flow test breaks at once.
4. **"Every org has a profile row" vs. `test_only_the_onboarding_settings_supply_company_information`.** That test asserts
   `get_config(db, 1)["legal_name"] == ""` and that the offer letter is held for `employer.legal_name` when nothing was saved. A
   profile prefilled from the `organizations` record would break it and the neutrality rule behind it.
5. **Pay formatting.** Two e2e assertions pin `"INR 1,500,000.00 per year, paid monthly"`; ₹ + Indian grouping (`₹15,00,000`)
   changes them deliberately.
6. **Content module size.** 841 lines now; ten documents rebuilt to match long legal reference documents will likely triple it. Plan
   a package directory (one module per document).

---

## 2. Module-by-module findings

### 2.1 `onboarding_package.py`

**Public constants** (`:40–48`): `ONBOARDING_PACKAGE_SPEC`, `PACKAGE_CATEGORIES = C.CATEGORIES`, `SPEC_BY_CATEGORY`,
`SIGNABLE_CATEGORIES`, `NO_ACTION_STATUS = "available"`, `ACK_TEXT_VERSION = "ONB-ACK-1.0"`, `ACK_TEXT`. `mode_of(category)` `:51`,
`is_blocking(doc)` `:56` (VOLUNTARY/INFO never block).

**Settings storage.**
- `CONFIG_KEY = "onboarding_package.config"` `:62`; `HEX` regex `:63`.
- `TEXT_SETTINGS` `:64` = `{legal_name:200, registered_address:500, header_label:60, jurisdiction:120, signatory_name:200,
  signatory_title:200, hr_contact_name:200, hr_contact_email:255, leave_entitlement:300, post_employment_period:200,
  pay_frequency:60, kpi_review_cycle:120, benefits_reference:300, effective_date:40}` (key → max length).
- `_defaults(org)` `:79`: every company field `""`; `brand_primary "#0B3D91"`, `brand_accent "#00A3E0"`; `paper` LETTER/A4,
  `spelling` US/UK and `date_format` MDY/DMY chosen by `_is_us(org)` (`:74`, org.country ∈ us/usa/united states…);
  `response_days 7`; `clauses {}`; `logo_key ""`.
- `get_config(db, organization_id) -> dict` `:107`: defaults, then the stored JSON row overlaid **only for keys already in the
  defaults** and not `None`. Invalid JSON is logged and ignored. Adding new keys therefore requires adding them to `_defaults`.
- `save_config(db, actor, data) -> dict` `:120`: trims/truncates `TEXT_SETTINGS`; validates hex colours, `paper ∈ {A4, LETTER}`,
  `spelling ∈ {UK, US}`, `date_format ∈ {DMY, MDY}`, `response_days 1..60`, `hr_contact_email` regex; `clauses` must be an object of
  known `C.CLAUSES` keys, text ≤ 20 000 chars, stores `{text, not_applicable, counsel_reference, updated_by, updated_at}` (empty text
  and not N/A deletes the entry). Writes through `_write_config` `:179` (creates the row with `category="onboarding_package"`) and
  commits. **No audit/activity entry is written** for settings changes, clause changes or logo changes.
- `header_label(cfg)` `:97`: header label, else legal name, upper-cased, ≤ 60 chars.

**Logo** (`:175–233`): `LOGO_MAX_BYTES = 2 MB`, `LOGO_MAX_PX = (900, 300)`. `save_logo` `:189` accepts PNG/JPEG/WEBP via Pillow
(verify + reload), converts to RGBA, thumbnails, re-encodes PNG (metadata stripped), stores via `storage.get_store().put(org_id,
"org-logo-<hex>.png", …)`, saves `logo_key` in the config. `remove_logo` `:218` blanks the key (blob not deleted). `logo_bytes` `:225`
returns `None` on missing key or storage error. `settings_view` `:236` returns `{settings (without clauses/logo_key, plus has_logo),
clauses[{key, token, title, note, required, used_in, text, not_applicable, counsel_reference, updated_at}], documents[…], mode_labels}`.

**Per-hire inputs.** `HIRE_INPUT_FIELDS` `:257`: every `C.FIELDS` key in the `employment.*`, `job.*`, `kpi.*`, `worker.*` namespaces
except `worker.full_name`, `worker.email`, `worker.outside_activities`, `employment.pay_terms` — i.e. 41 keys (`worker.phone`,
`worker.postal_address`, `worker.employee_id`, 19 `employment.*`, 13 `job.*`, 6 `kpi.*`). Stored in
`hire.profile_details["_package_inputs"]` by `save_hire_inputs` `:299` (unknown key → 422, values ≤ 2000 chars, empty removes).

**`build_values(db, hire, cfg, *, secure_link=None, contract_id=None) -> dict`** `:318`. Sources and precedence today:

| Value | Source (first non-empty wins) |
|---|---|
| `generated_at` | today, `_fmt_date` (`:261`: DMY → `05 March 2026`, MDY → `March 05, 2026`; uses `strftime('%B')`, locale-dependent) |
| `employer.*` | settings only (`legal_name`, `registered_address`, `signatory_name`, `signatory_title`); `employer.hr_contact` = `"name – email"` |
| `worker.full_name`, `worker.email` | `hire.candidate_name`, `hire.email` (never overridable) |
| `worker.phone` | `hire.phone` → candidate.phone |
| `worker.postal_address` | `", ".join(profile_details[address, city, state, postal_code, country])` → `employee.current_address` |
| `worker.employee_id` | `hire.employee.employee_code` |
| `employment.position_title` | `hire.position` → `offer.position` |
| `employment.department` | `hire.department_name` → `requisition.department` |
| `employment.reports_to` | `hire.manager_name` |
| `employment.employment_type` | `_pretty(hire.employment_type → offer.employment_type)` |
| `employment.start_date`, `continuous_service_date` | `hire.joining_date` → `offer.joining_date` |
| `employment.work_location` | `offer.work_location` only (comment: never the org city) |
| `employment.work_arrangement` | `_pretty(offer.work_arrangement)` |
| `employment.working_hours` / `work_pattern` | `offer.hours_per_week` → `"40 hours per week"`; pattern = `offer.work_pattern` → hours |
| `employment.base_pay` | `f"{offer.currency → org.currency} {salary:,.2f} {PER_PERIOD[pay_period]}"` (Western grouping, ISO code, no symbol) |
| `employment.pay_frequency`, `benefits_reference`, `leave_entitlement` | settings |
| `employment.variable_pay` | `"Equity: …"` from `offer.equity` |
| `employment.country` | `country_name(offer.work_country → hire.work_country)` → settings `jurisdiction` |
| `offer.response_deadline` | today + `response_days` (ignores `offer.response_deadline` column) |
| `offer.secure_link`, `contract.id` | arguments (contract id = document number, contract only) |
| `agreement.post_employment_period`, `kpi.review_cycle` | settings |
| `document.version` | `C.PACKAGE_VERSION` |
| `document.effective_date` | settings `effective_date` → start date → today |
| `job.role_purpose` / `job.skills_essential` | `requisition.description[:1200]` / `requisition.requirements[:800]` |

Then (`:378–387`): HR's `_package_inputs` overwrite everything; **except** a portal/employee address re-overwrites HR's
`worker.postal_address`; `work_pattern` and `continuous_service_date` back-fill; `employment.pay_terms = "<base_pay>, paid <freq>"`.

**Reads of the Organization record**: yes, but only for formatting defaults (`_is_us` → paper/spelling/date format) and the currency
fallback in `base_pay`. Company particulars are never read from it (docstring `:80`, and the test in §6).

**`render_context(db, hire, category, *, cfg=None, final=False, esign=False, secure_link=None, contract_id=None)`** `:391`: builds
values; for previews (`final=False`) fills `offer.secure_link`/`contract.id` with explanatory text; creates `R.RenderContext(mode=
"issue", …, optional=C.OPTIONAL_BY_DOC[category], activities=profile_details["outside_activities"], org_label=header_label(cfg),
logo_png=…)`; `ctx.draft = not (final and ready)`; `status_text = "ISSUED – <date>"` when not draft.

**Readiness.** `DERIVED_FROM` `:413` maps `work_pattern → working_hours`, `continuous_service_date → start_date`, `pay_terms →
(base_pay, pay_frequency)`. `readiness(ctx, category)` `:418` walks `C.tokens_in(category)`; a clause hook with no value → missing
clause; a field with `ctx.field_value(tok) is None` (except `offer.secure_link`, `contract.id`) → its source field(s) listed. Returns
`{ready, missing_fields, missing_clauses}`. Note `field_value` returns the fallback for optional fields, so only required fields (or
optional fields with no fallback, e.g. `continuous_service_date`) can block.

**Views / PDFs.** `template_context`/`template_set_pdf` `:432–441` (blank template set). `stored_document_pdf(db, document_id,
organization_id) -> (bytes, filename) | None` `:444`: org-checked; executed copy when `EXECUTED`, else original; filename
`"<title> - <document_number>[ (signed)].pdf"`. `preview_pdf(db, hire, category)` `:466`: stored document if the row has one, else a
fresh draft render.

**State.** `_rows` `:479` (newest non-deleted row per package category); `_row_state` `:494` returns `not_sent | awaiting_signature |
awaiting_acknowledgement | awaiting_upload | needs_review | completed | available | declined | rejected`; rows not issued by the package
(no `_package_files` key, not the linked recruitment letter) count as `not_sent` unless EXECUTED. `package_view` `:532` returns per
document `{category, title, template_id, mode, mode_label, doc_type, risk, sensitivity, orientation, signers, state,
onboarding_document_id, status, signing_status, ready, missing_fields[{key, meaning, source, editable, candidate_provides,
hr_may_enter}], missing_clauses[{key, title}]}` plus `sent_at`, `inputs`, `input_fields[{key, meaning, value, required}]`,
`ready_to_send`. `candidate_provides`/`hr_may_enter` are hard-wired to `worker.postal_address`.

**Issuing.** `_ensure_definition` `:564` inserts a `TemplateDefinition` for package IDs not in the 566 register, with
`source_spec="ZOIKO-OFFER-PACKAGE v1.0"` (a product string, written once and never updated). `_issue_one(db, hire, d, cfg, actor,
secure_link, row)` `:588`:
- number `ONB-<template id without "HR-">-<hire id>-<6 hex>`; renders final PDF; stores `onb-<hire>-<cat>-<hex>.pdf`; records the key
  in `profile_details["_package_files"][cat]`.
- **SIGN only**: renders HTML, stores it, creates a `GeneratedDocument` (`execution_mode="SIGN_CANDIDATE"`, `subject_type="new_hire"`,
  `source_ref="onboarding_new_hire:<id>"`, `due_by = now + response_days`, `expires_at = now + 30 d`), state ISSUED + event, issues a
  candidate signing token and stores the **raw token** in `profile_details["_signing_tokens"]`.
- Row status: SIGN/ACKNOWLEDGE/COMPLETE → `requested`, VOLUNTARY/INFO → `available`; COMPLETE rows get no `file_path` (the upload
  becomes the file).
- No package version is persisted on the row or the GeneratedDocument (`variant_version` is null); the version exists only in the
  printed footer.

`send_package(db, hire, actor=None, categories=None, *, notify=True, automatic=False)` `:657`: only while onboarding is active; skips
live documents; reuses an EXECUTED recruitment offer letter (`_link_recruitment_offer` `:642`); holds unready documents; supersedes and
revokes a leftover ISSUED generator document; updates `_package {sent_at, last_sent_at, sent_by, held, submitted_at}`; syncs the
checklist; logs onboarding activity; e-mails via `onboarding_flow.notify_document_request`. `release_held` `:723` re-runs it with
`automatic=True, notify=False` after portal details / declarations. `generate_onboarding_package` `:738` is a compatibility wrapper.

**`link_documents_to_employee(db, hire, employee) -> int`** `:744`: sets `recipient_employee_id` on the hire's package
GeneratedDocuments, the offer's document and any `subject_type="new_hire"` document of the same org that has none.

**Candidate actions.** `acknowledge` `:764` (ACKNOWLEDGE mode, status `requested`, `text_version == ACK_TEXT_VERSION`; stores
`{at, text_version, document_sha256, ip, user_agent}` in `_acknowledgements`). `save_outside_activities` `:793` (≤ 20 rows
`{organisation, role, hours 0–168, paid|unpaid}`; `none` flag; refused once the affidavit is completed).

**Signing hooks** (called from `doc_templates`): `AFFIDAVIT_ID = "HR-CON-101"` `:823`; `check_before_signing(db, doc)` `:833` raises
409 `DECLARATION_REQUIRED` until `outside_activities` exists; `declaration_needed` `:844`; `declare_for_document` `:852`;
`signing_schedule(db, doc) -> bytes | None` `:863` renders Schedule A **at signing time** via `render_context(...final=True)` +
`R.render_affidavit_schedule`. All keyed on canonical id `HR-CON-101`.

**Portal / submission / checklist.** `portal_items` `:876`, `portal_package_status` `:887` (needs `address` if NDA/contract/affidavit
are held and no `address`/`city`; needs `outside_activities`), `sync_onboarding_document_checklist` `:909` (checklist "Onboarding
Documents & Agreements", items only for SIGN/ACKNOWLEDGE/COMPLETE), `get_signing_token_for_onboarding_doc` `:959`, `next_to_sign`
`:987`, `outstanding_for_hire` `:1023`, `submission_status` `:1060`, `submit_package` `:1066`, `hire_for_document` `:1095`,
`signed_documents` `:1107`, `signature_image` `:1146`, `generate_html_for_doc` `:1159`.

`profile_details` (JSON on `onboarding_new_hires`) as used today:
```
{address, city, state, country, postal_code,                     # portal (strings, ≤300)
 emergency_contact_name, emergency_contact_relation, emergency_contact_phone, details_submitted_at,
 outside_activities: {none, rows:[{organisation, role, hours, paid, approved}], declared_at},
 _package_inputs: {<field key>: str}, _package: {sent_at, last_sent_at, sent_by, held:[cat], submitted_at},
 _package_files: {<cat>: storage key}, _signing_tokens: {<gen id>: raw token},
 _acknowledgements: {<onboarding doc id>: {at, text_version, document_sha256, ip, user_agent}}}
```

### 2.2 `onboarding_package_content.py` (841 lines)

`PACKAGE_VERSION = "1.0"` `:18`. Source labels `ZHR, ZTIME, PAYROLL, COUNSEL = "Zoiko HR", "ZoikoTime", "Payroll", "Counsel"` `:22`
(printed in the template set's dictionary appendix; `time.hours_logged` meaning mentions "ZoikoTime" `:83`).

**FIELDS** `:24–84` — 57 keys, `key → (meaning, source, required, fallback)`:
- top level: `generated_at`*
- `employer.`: `legal_name`*, `registered_address`*, `signatory_name`*, `signatory_title`*, `hr_contact`*
- `worker.`: `full_name`*, `postal_address`*, `email`*, `phone`, `employee_id`
- `employment.` (20): `position_title`*, `department`, `reports_to`, `direct_reports`, `job_code`, `employment_type`*, `start_date`*,
  `continuous_service_date` (optional, no fallback), `work_location`*, `work_arrangement`, `working_hours`*, `work_pattern` (optional,
  no fallback), `base_pay`*, `pay_frequency`*, `pay_terms`*, `variable_pay`, `benefits_reference`, `pay_range`, `leave_entitlement`*,
  `country`*
- `offer.`: `response_deadline`*, `secure_link`*; `contract.id`*; `agreement.post_employment_period`*; `document.version`,
  `document.effective_date`*
- `job.` (13): `role_purpose`*, `education_/experience_/skills_/languages_/licences_` × `essential/desirable`, `travel`,
  `physical_requirements`
- `kpi.` (6): `set_version`, `review_cycle`, `role_specific_definition/target/minimum/source`
- `time.hours_logged`

(* = required.) `worker.outside_activities` is emitted by `_strings` for an `activities` block but is **not** in FIELDS; no builder
uses that block (only `render_affidavit_schedule`), so the dictionary test passes.

**CLAUSES** `:89–152` — 27 hooks `key → (title, drafting note, required)`. Optional (5): `trade_secret_immunity_notice`,
`post_termination_restrictions_if_enforceable`, `collective_instrument`, `veteran_categories`, `criminal_record_question`. Required
(22): `required_clause_block`, `probation`, `notice_and_termination`, `equal_opportunity`, `protected_disclosure_and_whistleblowing`,
`confidentiality_and_ip`, `remedies`, `employee_privacy`, `governing_law`, `working_time`, `leave_and_holiday`,
`sickness_and_protected_leave`, `benefits_and_training`, `outside_employment`, `policy_status`, `grievance_and_discipline`,
`legal_precedence`, `outside_employment_lawful_scope`, `false_statement_consequences`, `special_category_data_notice`,
`ethnicity_categories`, `applicant_privacy_notice`.

**Token syntax** `TOKEN_RE` `:154` = `\{\{\s*([a-z_]+(?::[a-z_]+|\.[a-z_]+)?)\s*\}\}` — **one dot level only, lowercase letters and
underscores only**. `company.address.line1`, `worker.address_line1` with digits, or camelCase would not be recognised (they'd print
literally and escape readiness). The renderer's `_SPLIT` (`render.py:118`) uses the same pattern; both must change together.
`clause_key` `:157`.

**Block constructors** `:167–202`: `H1 H2 H3 P(t, style) CENTER BUL NUM KV(rows) NOTICE(paras) HOOK(key) NOTE PB EX(t) CHECKS(label,
options, hook) FIELDS_(rows, cols) TEXTBOX(label, lines, hint) CONSENT(text, after) CHART(title, note) LETTERHEAD TOC(entries)
COVER(lines) COLUMNS(left, right) TABLE(headers, rows, widths, total, compact) SIG(rows[(party, name, title, date)], statement)
CLAUSE(num, title, items, anchor)`; plus raw `{"t": "anchor"}` and `{"t": "activities"}`. Inline markup: `**bold**`, `<br/>`.
Clause numbering is one level (`n.m` generated for string items and hooks); no nested `n.m.k`.

**Builders and index** (`DOCUMENT_INDEX` `:750`, tuple: category, title, template_id, family, type, risk, sensitivity, mode,
orientation, pages, signers, builder):

| # | category | title | id | mode | orient. | builder | clause hooks used |
|---|---|---|---|---|---|---|---|
| 1 | `offer_letter` | Offer Letter | HR-HIR-011 | SIGN | portrait | `_offer_letter` `:210` | probation, notice_and_termination, required_clause_block |
| 2 | `job_description` | Job Description | HR-ORG-005 | ACKNOWLEDGE | portrait | `_job_description` `:266` | equal_opportunity |
| 3 | `daily_kpi` | Daily Key Performance Indicators | HR-PRF-101 | ACKNOWLEDGE | portrait | `_daily_kpi` `:335` (`KPI_ROWS` `:326`) | none |
| 4 | `nda` | Non-Disclosure Agreement | HR-CON-017 | SIGN | portrait | `_nda` `:378` | 6 (protected disclosure, trade secret, IP, remedies, privacy, governing law) |
| 5 | `employment_contract` | Employment Contract | HR-CON-001 | SIGN | portrait | `_employment_contract` `:466` (`CONTRACT_CLAUSES` 23 clauses `:455`) | 17 |
| 6 | `exclusivity_affidavit` | Affidavit of Employment Exclusivity | HR-CON-101 | SIGN | portrait | `_exclusivity_affidavit` `:553` | outside_employment_lawful_scope, false_statement_consequences |
| 7 | `self_disclosure` | Voluntary Self-Disclosure Form | HR-REC-101 (C4) | VOLUNTARY | portrait | `_self_disclosure` `:583` | special_category_data_notice, ethnicity_categories, veteran_categories |
| 8 | `job_application` | Job Application Form | HR-HIR-005 | COMPLETE | portrait | `_job_application` `:617` | criminal_record_question, applicant_privacy_notice |
| 9 | `daily_work_report` | Daily Work Report (DWR) | HR-TIM-101 | INFO | landscape | `_daily_work_report` `:662` | none |
| 10 | `velocity_report` | Project Velocity Report | HR-PRF-102 | INFO | landscape | `_velocity_report` `:695` | none |

`OPTIONAL_BY_DOC = {"offer_letter": {"worker.postal_address"}}` `:776`. `MODE_LABELS` `:778`. `documents()` `:782`, `DOCS`,
`CATEGORIES` `:791`, `blocks_for` `:795`, `_strings` `:799`, `tokens_in(category)` `:816` (first-use order, re-runs the builder
each call), `dictionary()` `:825`. Cross-references between documents are hard-coded strings ("document HR-ORG-005", "HR-CON-017",
"HR-CON-101", "HR-PRF-101"). Content contains no statutes or regulator names by design (module docstring `:11`).

### 2.3 `onboarding_package_render.py`

**`RenderContext`** `:51` dataclass: `mode ("template"|"issue")`, `values`, `clauses`, `optional`, `activities`, `org_label`,
`primary`, `accent`, `paper`, `spelling`, `effective_date`, `status_text`, `draft=True`, `esign`, `version=C.PACKAGE_VERSION`,
`logo_png`; properties `header_text` (`"<LABEL> | HR"` or `"HR"`), `show_placeholders` (template mode only); `field_value(key)`
(`:83`: value → fallback for optional → `""` if in `optional` → `None`), `clause_value(key)` (`("text", s) | ("na", None) | None`; an
optional hook without text = N/A), `spell(text)` (UK→US via `US_SPELLING` `:43`, 15 word pairs, whole-word regex).

**Fonts — `_styles(ctx)` `:166`**: every style is `Helvetica` / `Helvetica-Bold` / `Helvetica-Oblique` (standard Type-1, WinAnsi).
`_decorate` and `_grid_style` also hard-code Helvetica names. **₹ (U+20B9) is not in WinAnsi and would not render** with these
fonts. Bundled fonts exist in `backend/app/modules/doc_templates/fonts/`: `NotoSans-Regular.ttf`, `NotoSans-Bold.ttf`,
`NotoSansDevanagari-Regular.ttf`, `NotoSansDevanagari-Bold.ttf`, `OFL.txt` — **no italic files**. Glyph check (ReportLab
`TTFontFile`): NotoSans has ₹, – — • … “ ÷; it lacks `≤`/`≥` (used in `KPI_ROWS`: "≤ 4 h") and `☐ ☑ ✓`. The doc_templates engine
already registers them as `ZNoto`/`ZNoto-Bold` with `addMapping` (italic mapped to regular) in `doc_templates/renderer.py:296–322`
(`_fonts()`, Helvetica fallback if files missing) — reuse that.

**Page furniture — `_decorate(c, info, page, total, ctx_for)` `:257`** (drawn in `save()` of a custom canvas `_canvas_class` `:230`
so "Page X of Y" is counted **per document** via `_DocMarker` `:216`): DRAFT watermark (`"DRAFT – NOT FOR ISSUE"`, 35°, grey 13 %
alpha) when the doc is draft; header: `header_text` left in brand primary, document title right, logo image (≤120×20) after the label
or the dashed "`[<WORD> LOGO – insert approved asset]`" box in template mode; rule under header; footer: `"<template_id> | v<version>"`
left, "Private and Confidential" centre, "Page X of Y" right. Margins 2.54 cm; A4/LETTER; portrait/landscape page templates.

**`PdfBuilder`** `:331`: `add_document(d, blocks, draft=None)` (control block only in template mode), `_flow` (keeps an h2/h3 with
a following small table/form), `_block` handles every block type (`h1/h2/h3 p center note bullets numbered kv table hook notice
checks fields textbox consent signature clause pagebreak anchor toc cover letterhead activities columns chart`, else `ValueError`),
`_hook`, `_clause` (`n.m` sub-numbering, hanging indent 30 pt), `_fields`, `_signature` (5-column table Party/Name/Title/Signature/
Date; with `esign` the signature cell says "Issued electronically by the employer" for rows whose party starts with "For ", else
"Electronic signature – see execution certificate"), `_activities`, `_control_block`, `_choice_grid`, `build()`.

**Checkboxes**: `_checkbox_png()` `:720` draws a 96×96 empty square once per process into a `mkdtemp` folder under a lock;
`_box_pdf()` `:738` inlines it as `<img … width=8.5>`. This replaced ZapfDingbats (a test bans it). HTML uses the `☐` glyph.

**Unresolved tokens**: `inline()` `:125` wraps unresolved `{{field}}` / hooks in `<font backColor="#FFF176">` (PDF) or
`<mark class="ph">` (HTML) and appends the drafting note. Issued documents are never rendered with unresolved tokens because
readiness holds them.

**Entry points**: `render_pdf(category, ctx)` `:747`; `render_affidavit_schedule(ctx, declared_at)` `:754` (title "Affidavit of
Employment Exclusivity – Schedule A", no control block); `render_template_set(ctx)` `:768` (cover + 10 + dictionary appendix printing
the source labels); `render_html(category, ctx, *, document_number="")` `:805` (font-family Calibri, Arial, Helvetica; same header;
footer has template id, version and document number, no page numbers; watermark when draft). PDF metadata `title="Offer package"`,
`author=org_label or "HR"`.

### 2.4 Routers

`onboarding_package_router.py` — `router` prefix `/hr/onboarding`, all `Depends(get_current_admin)` (roles `super_admin`, `admin`,
`hr_admin`; `core/dependencies.py:229`), org-scoped through `user.organization_id`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/hr/onboarding/signed-documents?new_hire_id=` | signed package documents with signatures |
| GET | `/hr/onboarding/signatures/{signature_id}/image` | drawn signature PNG (only for onboarding documents) |
| GET / PUT | `/hr/onboarding/package/settings` | `settings_view` / `save_config` then `settings_view` |
| POST / GET / DELETE | `/hr/onboarding/package/logo` | upload (reads ≤ 2 MB + 1), fetch PNG, remove |
| GET | `/hr/onboarding/package/template.pdf` | template set, attachment `offer-package-template-set.pdf` |
| GET | `/hr/onboarding/new-hires/{id}/package` | `package_view` |
| PUT | `/hr/onboarding/new-hires/{id}/package/inputs` | body `{values: {...}}` → `save_hire_inputs` |
| GET | `/hr/onboarding/new-hires/{id}/package/{category}/preview.pdf` | `preview_pdf`, inline `<template_id>-preview.pdf` |
| POST | `/hr/onboarding/new-hires/{id}/send-package` (+ alias `/records/{id}/send-package`) | in `hr/router.py:1999`, body `{categories?}` |

`portal_router` prefix `/public/onboarding` (the portal token is the credential; `onboarding_flow.hire_for_token`; rate-limited):

| Method | Path | Purpose | Limit |
|---|---|---|---|
| POST | `/{token}/documents/{document_id}/acknowledge` | body `{text_version}` → `acknowledge` | 20/min |
| POST | `/{token}/outside-activities` | `save_outside_activities` + `release_held` | 20/min |
| GET | `/{token}/package/{category}/file` | issued package PDF, attachment `"<template_id> <title>.pdf"` | 60/min |

`onboarding_portal_router.py` (`/public/onboarding`): `GET /{token}` (portal view, 60/min); **`PUT /{token}/details`** (20/min);
`POST /{token}/documents/{document_id}` (upload, 20/min); `GET /{token}/documents/{document_id}/file` (stored issued/signed PDF via
`stored_document_pdf`, else the uploaded file; 60/min); `POST /{token}/submit-signed-package` (20/min).

**`PUT /details` today** — schema `OnboardingPortalDetails` (`hr/schemas.py:2772`): `phone ≤50`, `address ≤300` (one free-text street
field), `city ≤100`, `state ≤100`, `country ≤100` (free-text name; tests send "United Kingdom", "UK", "India"), `postal_code ≤20`,
`emergency_contact_name/relation/phone`, `submit: bool`. `onboarding_flow.save_portal_details` (`onboarding_flow.py:301`) validates
with `field_rules` (`PORTAL_DETAIL_RULES` `:296`: phone, address, city→place_name, state, country, postal_code); with `submit`,
`PORTAL_DETAIL_REQUIRED = (phone, address, city, country, postal_code)` must be present (explicit `null` counts as missing). Stores the
address keys and emergency contact flat in `hire.profile_details` (each ≤300 chars), phone on `hire.phone`, `details_submitted_at`;
logs activity; calls `release_held`. There is **no** line 1 / line 2 / house number / district split, no ISO country code, and no
validation of postal code against country (`business_ids.validate_postal` exists but is not used here).

---

## 3. Data sources and proposed value precedence

### 3.1 Relevant columns today

- **`Organization`** (`hr/models.py:127`): `organization_name`, `display_name`, `website`, `logo_url`, `address` (Text), `country`
  (free-text name), `state`, `city`, `timezone`, `currency` (default USD), `industry`, `org_type`, `phone`, `tax_number`,
  `registered_email`, `employee_id_prefix`. No postal code, no CIN/PAN/GSTIN split, no legal-vs-trading name distinction.
- **`OnboardingNewHire`** (`:860`): `candidate_name` (single string), `email`, `phone`, `position`, `department_id` (→
  `department_name`), `manager_id` (→ `manager_name`), `joining_date`, `status`, `employment_type`, `work_country` (ISO-2),
  `work_region`, `employee_id`, `profile_details` (JSON, §2.4), `completed_at`.
- **`RecruitmentCandidate`** (`:1235`): `name`, `email`, `phone`, `location`, `experience`, `resume_link`, `requisition_id`,
  `onboarding_new_hire_id`.
- **`RecruitmentRequisition`** (`:1260`): `title`, `department` (string), `location`, `description`, `requirements`,
  `employment_type`, `budget_min/max`, `currency`, `target_start_date`, `hiring_manager_id`, `job_description_id` (FK
  `job_descriptions`), `scorecard_criteria`.
- **`RecruitmentOffer`** (`:1326`): `position`, `salary`, `remuneration_type` (salary|stipend|fee), `currency`, `pay_period`,
  `employment_type`, `work_country`, `entity_name`, `entity_tax_id`, `entity_id_type`, `entity_country`, `entity_address`,
  `entity_city`, `entity_region`, `entity_postal_code`, `equity`, `joining_date`, `department_id`, `reporting_manager_id`,
  `employer_entity_id`, `work_location`, `work_region`, `work_arrangement`, `hours_per_week`, `work_pattern`, `contract_end_date`,
  `internship_end_date`, `fixed_term_reason`, `probation_months`, `response_deadline`, `conditions` (JSON), `benefits_summary`,
  `components` (JSON `[{label, amount, frequency}]`), `learning_objectives`, `mentor_id`, `academic_institution`, `document_id`.
  Only a subset is read by the package today (see §2.1).
- **`EmployerEntity`** (`doc_templates/models.py:29`): `legal_name`, `trading_name`, `registration_type` (business_ids key),
  `registration_number`, `tax_id`, `country` (ISO-2), `region`, `city`, `postal_code`, `address_lines` (JSON list), `phone`, `email`,
  `logo_file`, `is_default`, `status`. Created by Recruitment's offer-letter setup (the e2e `SETUP` creates "Tenant A India Pvt Ltd").
  Not read by the package.
- **`AuthorisedSignatory`** (`:55`): `entity_id`, `employee_id`, `signatory_title`, `authority_scope`, `max_risk_level`,
  `valid_from/to`, `approved_by`, `status`. Not read by the package (it uses free-text `signatory_name/title` settings).
- **`OrganizationConfig`** (`hr/models.py:2314`): `organization_id`, `key` (≤200), `value` (Text), `description`, `category`,
  unique `(organization_id, key)`. Sibling key `company_profile.config` fits without a migration.
- **`Employee`** (`employee/models.py`): `first_name`, `last_name` (pending account splits `candidate_name` on the first space),
  `date_of_birth`, `address`, `current_address`, `permanent_address` (all Text), `employee_code`.

### 3.2 Planned token groups → where values can come from today

| Planned group | Example tokens | Available today | Gap |
|---|---|---|---|
| `company.*` | legal name, registered address (lines/city/state/PIN/country), CIN/PAN/GSTIN, signatory, HR contact, logo, brand | package settings (free text); `EmployerEntity` (structured, registration type/number); `Organization` (address/city/state/country/tax_number) | No validated profile; registered address is one free-text field; registration numbers not captured in package settings; signatory is free text, not an `AuthorisedSignatory`. Neutrality test forbids falling back to `Organization`. |
| `worker.*` | full name, first/last, initials, structured address, phone, email, employee id, DOB?, nationality? | `candidate_name` (single string), `email`, `phone`, flat `profile_details` address fields, `employee.current_address`, `employee_code` | **No structured address** (one `address` line, free-text country); no name parts on the hire; initials must be derived (order convention undefined); no DOB/ID collection (and should stay off unless a pack requires it). |
| `engagement.*` | engagement type, probation months, notice, fixed-term end, internship end, hours, pattern, arrangement | offer: `employment_type`, `probation_months`, `contract_end_date`, `internship_end_date`, `fixed_term_reason`, `hours_per_week`, `work_pattern`, `work_arrangement` | **No per-org Engagement Profiles**; probation/notice today come only from counsel clauses; `probation_months` is not read. |
| `employment.*` | start date, location, department, manager, country | hire + offer (see §2.1) | Department on requisition is a string, on hire an FK; `offer.department_id` not read. |
| `role.*` | purpose, responsibilities, qualifications, KPIs, travel, physical | requisition `description`/`requirements`; `job_description_id` → `job_descriptions`; HR per-hire inputs (`job.*`, `kpi.*`) | **No Role Profiles**; JD responsibilities are hard-coded generic text in `_job_description`; `job_descriptions` table not read by the package. |
| `offer.*` | pay, currency, period, components, benefits, response deadline, link | offer `salary`, `currency`, `pay_period`, `components`, `benefits_summary`, `equity`, `response_deadline`; settings `pay_frequency`, `response_days` | `components` and `benefits_summary` unused; deadline computed from settings not `offer.response_deadline`; money formatted ad hoc (`doc_templates/formatting.format_money` has Indian grouping but no ₹ symbol — returns `"INR 15,00,000.00"`). |
| `document.*` | version, effective date, reference number, generated date | `C.PACKAGE_VERSION`, settings `effective_date`, document number at issue | Version not persisted per issued document. |

### 3.3 Proposed precedence (for review, not implemented)

`per-hire HR override (_package_inputs)` > `new-hire portal entry (worker address)` > `offer` > `requisition / role profile` >
`engagement profile` > `company_profile.config` > `onboarding_package.config (v1 keys)` > formatting defaults. Never
`Organization` for company particulars (it may seed the *form* in the UI as a suggestion only, explicitly saved by HR). Keep today's
quirk explicit: a portal-entered address beats HR's typed one.

---

## 4. Frontend

- **`OfferPackageSettings.jsx`** — mounted once at `onboarding/settings.jsx:343` (`<OfferPackageSettings />`, section
  `id="offer-package"`, linked from the panel as `/zoiko-hr/onboarding/settings#offer-package`). Shows: logo card (PNG/JPG/WebP ≤
  2 MB, preview, replace/remove), 13 text fields (`TEXT_FIELDS` L101: legal_name, registered_address, header_label, signatory
  name/title, HR contact name/e-mail, pay_frequency, leave_entitlement, post_employment_period, benefits_reference, kpi_review_cycle,
  jurisdiction — `effective_date` is in `TEXT_SETTINGS` but has no input), colour pickers, paper / spelling / date-format selects,
  days to respond, the counsel clause library (accordion per hook: drafting note, textarea, "Not used" checkbox for optional hooks,
  counsel reference, last-changed date) and a single Save. "Download template set" button. Explicit copy: "Nothing is taken from your
  organisation profile". Also says "Zoiko HR never writes these clauses for you" (product name, fine). Calls `getOfferPackageSettings`,
  `saveOfferPackageSettings`, `uploadOfferPackageLogo`, `deleteOfferPackageLogo`, `getOfferPackageLogo`,
  `getOfferPackageTemplateSet` (`hrService.js:237–246`).
- **`OfferPackagePanel.jsx`** — mounted in `onboarding/documents.jsx:900` inside the "Send 10 Onboarding Docs" SlideOver with a
  new-hire picker (one hire at a time). Shows counts (ready / waiting / sent), why nothing can be sent, missing counsel clauses (link
  to settings), a "Missing details" fieldset for editable missing fields (textarea for `job.role_purpose`, inputs otherwise;
  `PLACEHOLDERS` L343 has GBP/Leeds examples), per-document card (mode pill, state pill, missing data / clauses / candidate-provided,
  Preview), and the Send button. `worker.postal_address` is special-cased in several places (`hr_may_enter`, "their postal address").
  Calls `getHirePackage`, `getHirePackagePreview`, `saveHirePackageInputs`, `sendOnboardingPackage`, `sendOnboardingPortalInvite`
  (`hrService.js:231–250`).
- **Role gating**: server `get_current_admin` (super_admin/admin/hr_admin); client routes via `config/roles.js` prefixes —
  `/zoiko-hr/onboarding` is in the manager's disallowed list (`roles.js:233`); nav item has `featureKey: "hr.onboarding.core"`
  (`navigation.js:223`). No per-component role check.
- Portal page: `frontend/src/pages/OnboardingPortalPage.jsx` (sends the flat address fields to `PUT /details`).
- No bulk UI exists for the package; DOCX download does not exist anywhere in the package UI.

---

## 5. Reusable infrastructure and gaps

| Need | Exists | Notes |
|---|---|---|
| GSTIN / PAN / CIN validation | **Yes** — `app/core/business_ids.py`: `FORMATS["IN"]` ids `gstin` (regex + `_gstin_ok` checksum), `cin` (regex), `pan` (regex), `llpin`; `validate_id(country, key, number)` `:139`, `validate_postal(country, postal)` `:156` (IN: 6-digit PIN), `format_for`, `id_type`, `clean`, `payload()`. Also US EIN, GB company/VAT/UTR, AU ABN/ACN (checksums), SG, AE, EU VAT, etc. | Personal PAN uses the same regex; no Aadhaar validator (Aadhaar is recognised only by privacy redaction/classification patterns). |
| Background / bulk jobs | `doc_templates/jobs.py` is **scheduled cron jobs only** (APScheduler `register()` `:214`; reminders, expiry, retention…). The real bulk mechanism is `doc_templates/distribution.py`: `bulk_generate` `:207`, `run_in_background(job, actor_id, on_error)` (thread, own session; `BULK_INLINE` for tests), `DocumentBulkRun` model (`results [{subject_id, outcome, document_id, reasons}]`), `MAX_BULK = 200`, `BACKGROUND_OVER = 20`. Recruitment also uses FastAPI `BackgroundTasks`. | Package bulk generation should reuse `run_in_background` + a run record; `DocumentBulkRun.canonical_id` is a single template FK, so a package run (10 templates) either needs its own row shape or one run per template. |
| CV parsing | `hr/cv_parser.py` (191 lines): `extract_text_from_pdf` (pypdf), `extract_text_from_docx` (zipfile + XML), `parse_cv`. | Its DOCX reader can extract text from the reference .docx files without new dependencies. |
| DOCX export | **python-docx is not in `backend/requirements.txt`** and not installed (`import docx` fails). | Add `python-docx` (MIT) or write minimal OOXML by hand. Decide before Phase 2. |
| Fonts | `doc_templates/fonts/` NotoSans Regular/Bold (+ Devanagari), OFL licence; `doc_templates/renderer._fonts()` registers them. | No italic; no `≤ ≥ ☐`. |
| Money formatting | `doc_templates/formatting.format_money(amount, currency, language, country)` — Indian lakh grouping when `country == "IN"`, ISO code prefix. | No currency symbol option. |
| Organisation creation (for "every org has a profile row") | Single creation site: `employee/service.py:863` `register_enterprise` (emits `organization.created`). Test fixtures create orgs directly; `doc_templates` builds an unsaved sample org. | Lazy "get-or-create on read" is safer than a creation hook + backfill, and keeps fixtures working. |
| Audit log | Pattern: local `_audit(db, actor, action_type, entity_type, entity_id, target_name, changes=None)` wrapping `super_admin.activity_service.record_activity(..., commit=True)` inside `try/except: pass` — see `doc_templates/entities.py:27`, `hr/onboarding_documents.py:133` (e.g. `"payroll.finance_viewers_changed"`, entity `OrganizationConfig`). | Package settings/logo/clauses currently write **no** audit entry. Onboarding activity per hire uses `hr.service.log_onboarding_activity`. |
| Feature flag | `app/config.py` pydantic settings with `Field(default=…, validation_alias="HR_…")`, e.g. `TEMPLATES_ENABLED` `:211` (`HR_TEMPLATES_ENABLED`). | `ONBOARDING_PACKAGE_V2: bool = Field(default=False, validation_alias="HR_ONBOARDING_PACKAGE_V2")` fits the pattern. No per-tenant flag mechanism beyond plan entitlements (`featureKey`). |
| Organisation-level config | `OrganizationConfig` key/value JSON rows. | No schema/version field inside the JSON; v2 should add `"schema": 2` in the payload. |

---

## 6. Test impact

Files: `backend/tests/doc_templates/test_dt_offer_package.py` (656 lines, 23 test functions, one parametrised ×10) and
`test_dt_hire_to_employee_e2e.py` (281 lines, 4 tests). `backend/tests/test_onboarding_flow.py:131–139` also drives
`PUT /public/onboarding/{token}/details` with flat address keys. (`test_zz_audit_render` / `test_zz_probe_preview` exist only as
stale `.pyc` files.)

### 6.1 Every test (one line each)

`test_dt_offer_package.py`
1. `test_every_placeholder_is_in_the_dictionary_and_every_hook_has_a_drafting_note` — every token is in FIELDS/CLAUSES with a note; dictionary == tokens used; sources ⊆ the four labels.
2. `test_package_order_ids_and_modes` — exact 10 titles in order, two template ids, self-disclosure C4/VOLUNTARY, SIGN set.
3. `test_page_budget_and_running_header_footer[×10]` — template render page counts within budget; header, footer `<id> | v1.0`, page X of Y, logo box, draft status/watermark.
4. `test_template_set_has_cover_documents_and_dictionary_and_no_invented_law` — cover, all ids, dictionary; bans statute/legal-citation strings; NDA whistleblowing hook; post-termination note.
5. `test_forms_ask_nothing_unlawful_and_keep_ack_signature_and_consent_apart` — application bans DOB/marital/nationality/photo; self-disclosure voluntary, ≥8 "Prefer not to say", unnamed; offer acceptance note; no "disciplin" in DWR.
6. `test_supplied_clause_replaces_hook_and_us_spelling` — supplied clause prints; others still hooks; no watermark when issued; US spelling in JD.
7. `test_without_clauses_only_hook_free_documents_are_sent` — with no clauses only KPI/DWR/velocity issue; row statuses; documents_total 1; NDA preview is DRAFT.
8. `test_settings_validation_and_tenant_isolation` — 422s for bad colour/clause/paper; clause saved; tenant B cannot read A's hire; B's clause empty; template.pdf works.
9. `test_full_package_journey` — inputs, issue 7 / hold 3, never issue twice, offer PDF content, portal modes/needs, address releases 3, Schedule A gate, affidavit signing, NDA signing + next, acknowledgement, blank form download, states, progress, checklist.
10. `test_old_upload_requests_are_replaced_and_deleting_revokes_the_signing_link` — package categories never become upload requests; stale row reused; delete revokes link; reissue after delete allowed.
11. `test_a_signing_code_that_could_not_be_emailed_is_reported_not_claimed` — OTP e-mail failure → 503, codes consumed.
12. `test_company_logo_upload_validation_and_rendering` — logo validation, 403 for employee, scaling, tenant isolation, embedded image, no placeholder box.
13. `test_the_documents_list_api_carries_the_package_mode` — `/hr/onboarding/documents` exposes `package_mode`.
14. `test_a_completion_that_cannot_create_the_employee_leaves_the_hire_as_it_was` — failed completion rolls back.
15. `test_settings_changes_apply_to_new_documents_only_sent_ones_are_final` — sent HTML keeps old wording/position; no "reissue" in OpenAPI; new hire gets new wording.
16. `test_documents_left_by_the_earlier_generator_count_as_not_sent_until_hr_presses_send` — legacy rows `not_sent`, 10 ready, all issued, legacy SUPERSEDED.
17. `test_a_new_hire_who_became_an_employee_signs_the_package_from_self_service` — self-service signing incl. Schedule A declaration; only the recipient.
18. `test_admins_see_every_signed_document_with_the_signature_itself` — signed-documents API, drawn vs typed, isolation, 403 for employee, executed PDF page order.
19. `test_previews_show_the_document_as_sent_and_the_signed_copy_once_signed` — three views serve stored original then signed copy; filename; isolation.
20. `test_only_the_onboarding_settings_supply_company_information` — nothing from org record; header; banned strings incl. "ZOIKO", "{{", control block; tick-box images; no ZapfDingbats.
21. `test_a_revoked_link_cannot_reach_the_hires_other_documents` — revoked token gets 404 everywhere.
22. `test_the_hire_cannot_submit_while_documents_are_held_or_declined` — held contract and declined NDA block submission.
23. `test_submit_details_treats_an_explicit_null_as_missing` — `address: null` with submit → 422.

`test_dt_hire_to_employee_e2e.py`
1. `test_requisition_to_employee` — full recruitment → package → portal → completion → activation → self-service.
2. `test_a_newly_hired_employee_gets_the_package_in_one_send` — HR enters address + role purpose, one Send issues 9 + reuses letter.
3. `test_pending_account_follows_the_hire_cancel_reopen_and_email_change` — pending employee lifecycle (package-independent).
4. `test_no_account_is_created_for_an_email_that_signs_in_to_another_organization` — cross-org e-mail guard (package-independent).

### 6.2 (a) MUST stay exactly as they are

| Test | Assertion(s) | Why |
|---|---|---|
| offer #8 | `world.get("b_admin", f".../new-hires/{h.id}/package").status_code == 404`; B's `probation` text `is None` | tenant isolation |
| offer #12 | `world.get("b_admin", "/hr/onboarding/package/logo").status_code == 404`; `a_emp` upload → 403 | isolation, role gate |
| offer #18 | `b_admin` signature image 404; B's list excludes A's hire; `a_emp` → 403 | isolation |
| offer #19 | `world.get("b_admin", f"/hr/onboarding/documents/{nda['id']}/file").status_code == 404` | isolation |
| offer #15 | `"Old governing law wording." in html and "New governing law wording." not in html`; `"Senior Analyst" not in html`; `"reissue" not in world.client.get("/openapi.json").text` | sent documents immutable; **v2 must not add any route/summary containing "reissue"** (bulk endpoints included) |
| offer #9 | `again["issued"] == []` ("a live document is never issued twice"); `"Chess Club" not in` the sent affidavit PDF | immutability |
| offer #9, #17, #18, #19, #21, #22; e2e #1, #2 | signing/OTP/declaration/next/self-service/certificate flow assertions (409 "Schedule A", `needs_declaration`, `can_sign`, executed page order, "Electronic Signature Evidence Certificate", acknowledgement 422 for old `text_version`) | e-sign/OTP/certificate/portal/ack/upload flows unchanged |
| offer #21 | revoked link → 404 on `/next`, `/pdf`, `/submit-package`, view | revoked links |
| offer #10 | delete revokes the signing link (404) | revoked links |
| offer #9, #20; e2e #1 | `"{{" not in pdf/text/out`, `"DRAFT – NOT FOR ISSUE" not in` issued output, `"Legal risk level" not in pdf` | no tokens / no template furniture in issued output |
| offer #20 | banned `"ZOIKO"`, `"Zoiko Group"`, `"ZG-ENG"`, `"ZHR-1042"`, `"Tenant A"`, `"insert approved asset"`, `"Legal risk level"`, `"Sensitivity level"`, `"{{"` in every issued PDF and HTML | multi-tenant neutrality |
| offer #20 | held offer letter lists `employer.legal_name/signatory_name/hr_contact` (semantics) and `get_config(...)["legal_name"] == ""` before any save | company data never from the org record — see risk 4; the *key names* may be renamed deliberately (b), the behaviour must not |
| offer #20 | `pages[0].images` for the forms; `"ZapfDingbats" not in pdf.decode("latin-1")` | checkbox PNG approach |
| offer #1 | every token in FIELDS/CLAUSES with a drafting note; `listed == used` | placeholder dictionary integrity (the source-label line is discussed in §7) |
| offer #5 | `"disciplin" not in` DWR text | DWR never disciplinary |
| offer #5 | application bans `"Date of birth", "Marital status", "Nationality", "Photo"` | the brief calls this "ask_nationality default off"; **no `ask_nationality` flag exists** — the nearest mechanism is doc_templates pack `requirements.collect_nationality` (`doc_templates/content.py:107`, `hr/onboarding_documents.py:38`). Keep the ban unless a pack requirement turns collection on. |
| offer #5 | `"Signing confirms acceptance of the offer only"` | acceptance kept separate from acknowledgements/consent |
| offer #11, #13, #14, #16, #23; e2e #3, #4 | unrelated to content | unchanged behaviour |
| offer #7 | NDA preview contains "DRAFT – NOT FOR ISSUE"; held documents never issued | missing value → stays DRAFT and listed |

### 6.3 (b) WILL need deliberate updating

| Test | Assertion (quoted) | Reason |
|---|---|---|
| offer #3 | `f"{d['template_id']} \| v1.0" in text` | `PACKAGE_VERSION` → 2.0 |
| offer #3 | page budgets `("nda", 3, 4)`, `("employment_contract", 6, 10)`, `("daily_work_report", 1, 1)`, … | content rebuilt to the reference documents; Noto Sans is wider than Helvetica |
| offer #3, #20 | `"EXAMPLE HOLDINGS \| HR" in text`, `"BRIGHTWAVE ANALYTICS LTD \| HR" in out` | running header format may change in the formatting standard |
| offer #2 | exact title list; `(C.DOCS["self_disclosure"]["sensitivity"], ...["mode"]) == ("C4", "VOLUNTARY")`; SIGN set `{offer_letter, nda, employment_contract, exclusivity_affidavit}` | titles/modes change if the form becomes a conflict-of-interest declaration (and likely SIGN/ACKNOWLEDGE) |
| offer #5 | `"entirely voluntary" in sd and sd.count("Prefer not to say") >= 8 and "withdraw consent" in sd`; `"{{worker.full_name}}" not in sd` | the self-disclosure form becomes a named COI declaration |
| offer #5 / #4 | application banned list; `" v. ", "Act 19", "Act 20", "GDPR"` banned in the template set | reference documents may cite statutes (e.g. "Act, 1872", "IT Act 2000") or ask for DOB/nationality; decide per rule, not per test |
| offer #6 | `"prioritize" in jd and "prioritise" not in jd and "Licenses" in jd` | JD wording replaced; spelling test needs words that still exist |
| offer #7 | `issued == {"daily_kpi", "daily_work_report", "velocity_report"}`; `rows == {...}`; `documents_total == 1` | depends on which rebuilt documents have clause hooks and their modes |
| offer #9 | `issued == {7 categories}`, `set(held) == {nda, contract, affidavit}`, `held["exclusivity_affidavit"]["missing_fields"] == ["worker.postal_address"]`, `"GBP 42,000 per year, paid monthly" in pdf`, `prog["documents_total"] == 7`, modes for JD/self-disclosure, checklist titles | structured address keys, mode changes, pay formatting |
| offer #16 | `INPUTS + "worker.postal_address": "1 Lane, York"`; `len(pkg["ready_to_send"]) == 10` | address becomes structured keys |
| offer #8, #9 … (≈15 tests) | `world.put("a_admin", "/hr/onboarding/package/settings", json={**SETTINGS, ...})` with v1 keys | if company fields move to `company_profile.config`, keep the v1 keys as aliases or update the fixture |
| offer #19 | `"(signed).pdf" in r.headers["content-disposition"] or "preview" in ...` | new filename scheme (`RR_RAVURI_RUGVEDH_OFFER_LETTER.pdf`) |
| offer #20 | `{"employer.legal_name", "employer.signatory_name", "employer.hr_contact"} <= set(held["missing_fields"])` | key rename to `company.*` (behaviour stays, §6.2) |
| offer #1 | `{r["source"] for r in C.dictionary()} <= {"Zoiko HR", "ZoikoTime", "Payroll", "Counsel"}` | only if source labels are neutralised (§7) |
| e2e #1 | `"INR 1,500,000.00 per year, paid monthly"`, `"40 hours per week"`, `"Counsel wording – Probation."` | ₹ and Indian grouping; probation may move to an engagement profile |
| e2e #1, #2 | `{h["category"] for h in sent["held"]} == {nda, contract, affidavit}`; `asks == {"worker.postal_address", "job.role_purpose"}`; `"INR 900,000.00 per year, paid monthly"`, `"18 days"` | structured address; role profiles supply role purpose; pay format |
| `test_onboarding_flow.py` | flat `address/city/...` bodies to `PUT /details` | only if the portal schema changes shape (prefer additive keys) |

---

## 7. Risks and open questions

1. **Per-document mode/version is not stored** (risk 1 in §1). Options: keep categories, template IDs and modes stable for v1-issued
   rows; or store `{"package_version": "1.0", "mode": …}` per row in `profile_details["_package_files"]` (or a new column) and read
   mode from there for issued rows. Also `_ensure_definition` never updates `TemplateDefinition.source_spec` (`v1.0`).
2. **Post-issue renders**: `signing_schedule()` (Schedule A at signing), `preview_pdf` for unsent rows, `outstanding_for_hire`
   readiness for held rows. Schedule A for a v1 affidavit must render with the v1 renderer or a version-neutral layout.
3. **Company profile vs. neutrality test**: lazy-create an *empty* `company_profile.config`; never auto-fill from `Organization`. Merge
   order and migration: existing `onboarding_package.config` values (`legal_name`, `registered_address`, signatory, HR contact) must be
   copied/aliased into the profile without loss; `get_config` drops unknown keys, so new keys must be added to `_defaults`.
4. **Token grammar**: `TOKEN_RE`/`_SPLIT` allow one dot and `[a-z_]` only. Structured tokens (`worker.address_line_1`,
   `company.address.city`) need the regex widened in both places and the dictionary test kept green.
5. **Fonts**: Noto Sans present (₹ ok), but no italic (notes/examples use `Helvetica-Oblique`; map to regular or add NotoSans-Italic
   under OFL) and no `≤`/`≥`/`☐` (KPI table uses "≤ 4 h" — already missing in Helvetica today). TTF embedding raises PDF size and
   render time; page budgets shift.
6. **Content module size**: 841 lines for short generic documents; v2 reference-length content plus DOCX builders suggests a
   `onboarding_package/` package with one module per document and a shared block vocabulary consumed by PDF, HTML and DOCX writers.
7. **DOCX**: no library installed. python-docx would need adding to `requirements.txt` and the Docker image; DOCX of a sent document
   must be generated from the same values snapshot as the stored PDF (the values are not stored today — only the PDF/HTML bytes), or
   DOCX is offered for drafts only.
8. **Dates**: India defaults to DMY via `_is_us` (non-US → DMY), output `05 March 2026` (zero-padded, `strftime('%B')` is
   locale-dependent). Confirm the reference format (e.g. `05/03/2026` vs `5 March 2026`) and whether the date format belongs to the
   company profile.
9. **Money**: `build_values` hand-formats `"<ISO> <amount:,.2f> per year"`; `formatting.format_money` does lakh grouping but no ₹.
   Decide symbol vs code, decimals for INR, and CTC/monthly breakdown from `offer.components`.
10. **Aadhaar / national IDs**: nothing collects them in the package; privacy redaction treats `aadhaar`/`pan` as sensitive. If the
    reference documents print Aadhaar/PAN of the worker, that needs a C3/C4 classification decision, encryption at rest and a pack
    requirement flag (default off), not a plain `profile_details` string.
11. **Names and initials**: hire has only `candidate_name`; `RR_RAVURI_RUGVEDH` implies initials + name in stored order upper-cased.
    Define the rule (given/family order, multiple given names, non-ASCII, collisions) and keep it out of the e-mailed subject/URL.
12. **Filenames** today: stored `onb-<hire>-<cat>-<hex>.pdf`; download names `"<title> - <number>[ (signed)].pdf"`,
    `"<template_id>-preview.pdf"`, `"<template_id> <title>.pdf"`. New names contain personal data — fine in Content-Disposition, not
    in storage keys or logs.
13. **Product strings**: `"Zoiko HR"`/`"ZoikoTime"` source labels appear in the template-set dictionary appendix (all tenants), and
    `source_spec="ZOIKO-OFFER-PACKAGE v1.0"`. Not tenant data, but the "nothing Zoiko-specific" rule should state whether platform
    names count. The ZOIKO ban test currently checks issued documents only.
14. **Bulk generation**: must respect "held stays draft", never re-issue live documents, run per tenant, and not add a "reissue" path.
    `DocumentBulkRun` is keyed to one `canonical_id`.
15. **Audit**: settings/profile/clause/logo changes are not audited today; v2 should add `_audit` entries following
    `doc_templates/entities.py:27`.
16. **Raw signing tokens** are kept in `profile_details["_signing_tokens"]` (pre-existing; out of scope, but any v2 change to
    `profile_details` handling must not log or export that key).
17. **Feature flag scope**: a global `HR_ONBOARDING_PACKAGE_V2` switches all tenants at once; with the flag off v1 must render
    exactly as today (tests in §6.2 run with it off), with it on the §6.3 updates apply.

---

## 8. Pending inputs

- The 10 reference `.docx` files are **not in the repo**: `docs/reference/onboarding_package_v2/` does not exist. Text and structure
  extraction (headings, clause numbering, tables, header/footer text, fonts, which fields are filled per hire) is pending until they
  are added. `hr/cv_parser.extract_text_from_docx` can do a first plain-text pass without new dependencies.
- Until then, content-dependent items in §6.3 (titles, modes, page budgets, banned-word lists, which documents carry clause hooks) and
  §7 items 8–11 cannot be finalised.
