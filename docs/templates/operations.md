# Operations

## Deploy

1. `alembic upgrade head` — five template-engine migrations:
   * `d7e1a0b2c3f4` employer entities, signatories, worker jurisdiction columns, `security_action_tokens.reference`; creates one
     default entity per organization (copied only from what the organization record holds) and backfills `employees.work_country`.
   * `d7e1a0b2c3f5` engine tables, the 566 definitions, the four SUSPENDED research packs, Postgres append-only and frozen-content triggers.
   * `d7e1a0b2c3f6` Prompt 2: starters, recruitment / workforce / onboarding document data.
   * `d7e1a0b2c3f7` Prompt 3: leave decision evidence (sickness reasons moved into `reason_encrypted`), overtime, attendance
     corrections, shift notices, salary-revision and allowance approvals, policy versions and the Mira link.
   * `d7e1a0b2c3f8` Prompt 4: probation reviews, PIPs, appraisal stages, training records, lifecycle approvals, retention and
     automation settings, idempotency keys; existing `hr_documents` are flagged `is_legacy` (canonical id only where unambiguous).
   All are guarded and reversible; Postgres upgrade → downgrade → upgrade was rehearsed for each (Docker, `pgvector/pgvector:pg15`).
2. `python -m app.modules.doc_templates.seeds.load_starters` loads the versioned starters (also done at startup by `bootstrap.seed`).
3. `python scripts/privacy_apply_rls.py` (new tenant tables), as after every table-adding migration.
4. Mount `HR_GENERATED_DOCS_DIR` (default `$UPLOAD_BASE_DIR/generated_documents`) on **persistent storage**. Without it every
   generated document and its signature evidence is lost on restart.
5. `python scripts/doc_templates_jurisdiction_report.py > gaps.csv` and send each organization its list: people whose work
   country could not be mapped must be set by HR (employee profile → Jurisdiction). Nothing is guessed.
6. Ask each organization admin to complete the default legal entity (registration number, address) and appoint authorised
   signatories (Organization admin → Legal entities & signatories), then to work through **Documents centre → Country activation**.

## Settings and switches

| Variable | Default | Meaning |
|---|---|---|
| `HR_TEMPLATES_ENABLED` | `true` | release gate R6: `false` stops all new generation everywhere; reading, downloading, signing and acknowledging continue |
| `HR_TEMPLATES_TENANT_ATTESTATION_ENABLED` | `true` | allow TENANT_ATTESTED release for L1/L2 |
| `HR_TEMPLATES_TENANT_ATTESTATION_L3_ENABLED` | `false` | allow TENANT_ATTESTED release for L3 |
| `HR_GENERATED_DOCS_DIR` | `$UPLOAD_BASE_DIR/generated_documents` | where PDFs/HTML/drawn signatures are stored |
| `HR_DOC_SIGN_LINK_TTL_DAYS` | `7` | candidate signing link lifetime |
| `HR_DOC_SIGN_OTP_TTL_MINUTES` | `10` | signing code lifetime |
| `HR_DOC_SIGN_OTP_MAX_ATTEMPTS` | `5` | wrong codes before a code dies |
| `FRONTEND_URL` | — | base of links in e-mails and of the printed verification URL |

Per tenant: `doc_template_settings.automation_rules["_generation"] = "off"` stops generation for one organization (Documents
centre → Automation, organization admin). Plan features per template family / execution mode / automation / bulk are configured in
`app/modules/doc_templates/seeds/plan_features.json` (Product owns the pricing; keys must exist in `billing/feature_keys.py`).

**Rollback plan.** Set `HR_TEMPLATES_ENABLED=false` (or the tenant switch): generation stops with `TEMPLATES_DISABLED`, everything
issued stays readable and actionable. Code rollback below `d7e1a0b2c3f4` is not needed for that; the migrations can be reversed
one at a time if a schema rollback is ever required (sickness reasons are decrypted back on the Prompt 3 downgrade).

## Scheduled jobs (leader only)

| Job | When |
|---|---|
| `doc_templates_reminders` | daily 07:30 |
| `doc_templates_expiry` | hourly at :05 |
| `doc_templates_expiry_collect` (HR-DOC-016) | daily 06:00 |
| `doc_templates_expiry_digest` | Mondays 07:00 |
| `doc_templates_retention` | daily 03:30 (flags only, never deletes) |
| `doc_templates_commencement` (HR-ONB-007) | daily 06:30 |
| `doc_templates_learning_expiry` (certifications, mandatory training → HR-DOC-016, reminders 60/30/7 days) | daily 02:45 |
| `doc_templates_new_joiners` | every 30 minutes |

Bulk work over 20 documents (bulk generation, a policy published to more than 20 people) renders in a background worker; the
bulk run and the distribution report progress. See [performance.md](performance.md) for measured timings.

## Monitoring

* Generation refusals by reason code: Documents centre → Reports ("Why documents could not be generated"), from
  `decision_receipts` (no contents). A jump in `MISSING_FIELD:*` is a data-quality problem; in `CLAUSE_UNRESOLVED:*` a pack gap.
* Queue depth: `document_bulk_runs` with `status = RUNNING`, and policy distributions whose `last_results` is still growing.
* E-mail failures: `doc_templates: … e-mail failed for document id … after 3 attempts` (retries are immediate; ids only).
* Background failures: `doc_templates background job failed` (stack trace, no document contents).

## Emergency suspension

* **A tenant variant:** Documents → Template → version → Suspend (reason). Drafts generated from it can no longer be issued;
  issued documents are untouched; an HR-DOC-018 record is written.
* **A tenant pack:** Jurisdiction packs → Suspend.
* **A platform pack or variant (Super Admin):** Super Admin → Template controls → Suspend (reason), or
  `POST /super-admin/doc-templates/packs/{id}/suspend`. Every ACTIVE variant in the pack is suspended with its own HR-DOC-018
  record; organizations that used it get an in-app notice with the number of affected drafts only. The platform never sees a
  tenant document. Rehearsed in `tests/doc_templates/test_dt_golive.py::test_platform_emergency_suspension…` and journey 5.

## Runbook: a wrong document was issued

1. **Stop further copies.** If the content is wrong (not just one person's data), suspend the variant (above).
2. **Keep the evidence.** Never edit or delete the issued document; it is immutable and its decision receipt shows what was used.
   If the matter may become a dispute, put it on legal hold (Generated documents → Legal hold).
3. **Correct or cancel.** *Correct* produces a new document linked to the old one (`corrects_document_id`); *Cancel* withdraws an
   unsigned one. Both record who, when and why (HR-DOC-018 / document events).
4. **Tell the person.** Suggested wording (adapt, no contents in the e-mail): "We sent you a document (number ABC-2026-000123) that
   contained an error. Please disregard it. A corrected version is now in Zoiko HR under Documents to action. If you have already
   acted on it, contact HR." Send it from HR's own mailbox or the Zoiko notice.
5. **Record it.** Export the document's HR-DOC-008 generation instruction and HR-DOC-010 workflow record for the incident file.

## Retention and legal hold

* `retention_until` comes from the organization's own duration (Documents centre → Retention, organization admin) or else from a
  counsel-approved pack rule. Nothing is defaulted: until a duration exists, the document is kept and counted as "retention not
  configured".
* The review queue lists documents past `retention_until`; HR keeps or extends them (recorded as a document event). Legal hold
  blocks correction and any change of retention. Disposal and HR-DOC-020 destruction certificates are **out of scope** for this release.
* `decision_receipts`, `document_events`, `document_signatures`, `document_acknowledgements` are append-only (ORM guard +
  Postgres triggers). A person who appears in document evidence cannot be hard-deleted; deactivate instead.

## Languages and right-to-left text

Variants are per language; Documents centre → Languages lists which languages each template has. Dates and numbers are formatted
per language. Arabic, Hebrew, Persian and Urdu variants render right to left (`dir="rtl"` in HTML, right-aligned PDF). The bundled
PDF fonts cover Latin and Devanagari; **before activating an Arabic-script pack**, bundle Noto Sans Arabic in
`app/modules/doc_templates/fonts/` and add Arabic shaping (e.g. `arabic-reshaper` + `python-bidi`) to the PDF path — until then
keep such packs inactive (human action 40).

## Demo and QA data

`HR_DEBUG=true python scripts/seed_synthetic_tenants.py` then `python scripts/seed_doc_templates_demo.py TENANT-A`: a GB tenant pack,
a released variant for each of the 72 business templates, every clause released (starter text, or text marked
"DEMO — NOT LEGAL TEXT"), and synthetic candidates, hires, leave, overtime, appraisals and changes. Refuses non-development databases.

## Tests

`pytest tests/doc_templates` (≈260 tests): R0 catalogue, §8.1 negative suite, separation of duties, signing/OTP/tamper, candidate
links, tenant isolation, injection, state machine, append-only, governance PDFs, jobs, entities, the Prompt 2–4 modules, the go-live
tooling and the six end-to-end journeys (`test_dt_journeys.py`). Load test: `scripts/doc_templates_load_test.py`.
Regenerate generated docs after changes: `python scripts/doc_templates_field_registry.py`, `python scripts/privacy_classification_doc.py`.
