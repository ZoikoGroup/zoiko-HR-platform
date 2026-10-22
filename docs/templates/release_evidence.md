# Release evidence — document template engine (ZHR-ELT-TPL-001)

Status on 2026-10-22, after Prompts 1–4. **P** = passed with the evidence listed; **F** = fails or missing; **U** = not yet
possible to decide (needs a person, a country or an environment that does not exist yet). Automated evidence is in
`backend/tests/doc_templates/` (268 tests) unless stated otherwise. Last full backend run (SQLite, 2026-10-22): 2,142 passed,
15 skipped, 4 failed; the 4 were fixed and their suites re-run green (doc_templates, privacy, assistant: all pass).

| Gate | Status | Evidence | Open items |
|---|---|---|---|
| **R0 Import** | **P** | `test_dt_catalogue.py`: 566 ids, 23 families with the guide's counts, exact titles, schema valid, no collisions; exactly 82 implemented (10 governance + 72 starters). `test_dt_starters.py`: all 72 starters validate against the field registry and block grammar and render with synthetic data; locked blocks enforced. | — |
| **R1 Security** | **P** (with one gap) | Tenant isolation, candidate-token scope, verification, preview/download/sign: `test_dt_isolation.py`, `test_dt_signing.py`; every GET route of the app is probed cross-tenant by `tests/privacy/test_idor_property.py`. C3/C4 encryption at rest (files and snapshots): `test_dt_compensation.py`, `test_dt_performance.py`, `test_dt_changes.py`. Redaction canaries (sickness reason, amounts, names): `test_dt_leave.py`, `test_dt_compensation.py`, `test_dt_golive.py`. Super Admin denial on `/hr` and tenant documents: `test_dt_policies.py`, `test_dt_golive.py`, privacy suite. Mira guardrails (prompt injection, other people's documents, approve/issue requests): `test_dt_golive.py::test_mira_…`. Support access only via grants: `tests/privacy/test_support_*`. | Write routes added in Prompts 2–4 have targeted 404/403 tests but not one generic cross-tenant property test; add one before GA. |
| **R2 Legal pack** | **U** | No country is activated. Platform packs remain SUSPENDED until Zoiko Legal signs them; tenant activation requires the attestation rules of Prompt 1 (author ≠ releaser, organization admin, plan permission). The country activation kit lists, per country, every clause still to write and produces the counsel review pack. | Counsel must write and release the clauses below; no country activates without this. |
| **R3 Semantic tests** | **P** (English only) | Per template: required fields, mandatory-clause presence (every clause without starter text has a fail-closed test in `test_dt_starters.py`), prohibited combinations and conditional blocks (`test_dt_semantic.py`, §8.1 negative suite in `test_dt_negative.py`), module refusals (decrease on increase letter, probation limit, contract variation, linked compensation). | Language coverage: only `en` variants exist. Other languages are U until variants are written; RTL rendering is tested, Arabic fonts are not bundled. |
| **R4 Workflow** | **P** | `test_dt_journeys.py`: (1) hire to confirmation, 21 documents; (2) policy rollout to 500, re-acknowledgement, Mira on v2 only; (3) promotion with pay rise, C3 letter, manager 404; (4) leave and time; (5) fail-closed (no pack, cross-border, missing clause, suspended variant, issued documents unchanged); (6) unsuccessful probation with checklist and three people, no state change. Separation of duties throughout (`test_dt_sod.py` and the module suites). | — |
| **R5 Integrations** | **P** (with one gap) | Payroll/time hand-offs are ID-only events after human approval (`compensation.change.approved`, `attendance.overtime.approved`, `onboarding.payroll_details_verified`; `tests/test_integrations.py`); nothing recalculates pay. E-mails carry no contents (canary tests) and are retried three times. | **F**: e-mail bounce handling is not built (delivery failures are logged, bounces are not tracked). |
| **R6 Production** | **P** (with gaps) | Feature flags `HR_TEMPLATES_ENABLED` (global) and the per-tenant generation switch, `HR_TEMPLATES_TENANT_ATTESTATION_ENABLED` (`test_dt_golive.py`, `operations.md`); rollback plan (disable generation, keep read access) in `operations.md`; emergency suspension of platform packs/variants rehearsed (`test_dt_golive.py`, journey 5) with HR-DOC-018 records and tenant notices (counts only); migrations rehearsed on PostgreSQL (upgrade → downgrade → upgrade for `d7e1a0b2c3f4`…`f8`); load test in `performance.md`. | **U**: monitoring dashboards (generation errors by reason code, queue depth, e-mail failures) — the in-app report and log signals exist, the observability dashboards must be built in the monitoring tool. Load test to be repeated on staging PostgreSQL. |

## Templates live and their release mode

All 82 implemented templates are **available to be released**; none is released for a real tenant yet.

* **Governance records (10)** — HR-DOC-001/003/004/008/010/012/013/014/016/018: engine records, live wherever the engine is enabled.
* **Business templates (72)** — Prompt 2: recruitment, workforce planning, onboarding (28); Prompt 3: policies, leave, working time,
  compensation (28); Prompt 4: performance, probation, learning, employment changes (16). Each becomes usable in a country only
  when a variant is released: **TENANT_ATTESTED** (the organization's own pack, attested by its admin; L1/L2, and L3 only if
  `HR_TEMPLATES_TENANT_ATTESTATION_L3_ENABLED`) or **PLATFORM_COUNSEL** (Zoiko Legal, once a platform pack is signed).

## Countries activated

None. The demo seed (`scripts/seed_doc_templates_demo.py`) activates GB for a synthetic tenant with text marked
"DEMO — NOT LEGAL TEXT"; it must never be used for a real organization.

## Clause keys still unwritten (every country)

These have no starter text and block the templates that require them until counsel releases them for the country.

| Clause | Blocks |
|---|---|
| `privacy_lawful_basis_recruitment` | HR-HIR-004 |
| `internship_status_statement`, `fixed_term_statement`, `offer_withdrawal_rights`, `probation_summary` | HR-HIR-014, HR-HIR-015, HR-HIR-018, offer letters with probation |
| `probation_legal_limits` | HR-POL-005 |
| `rest_breaks`, `overtime_pay_or_time_off`, `maximum_working_time` | HR-POL-019, HR-TIM-007 |
| `statutory_annual_leave`, `annual_leave_carry_over`, `leave_on_termination` | HR-POL-025 |
| `sickness_evidence_rules`, `sick_pay` | HR-POL-026 |
| `family_leave_entitlements`, `family_leave_pay`, `family_leave_notice_requirements` | HR-POL-027, HR-LEV-007 |
| `monitoring_notice` | HR-POL-031 |
| `probation_extension_rules` (+ `max_probation_months`) | HR-PRF-003 |
| `probation_termination_notice`, `appeal_rights` | HR-PRF-005 |
| `pip_outcomes` | HR-PRF-013 |

Optional clauses without starter text (omitted until released): `privacy_international_transfers`, `handbook_local_annex`,
`attendance_local_rules`, `cross_border_remote_work`, `sickness_during_leave`, `data_transfers`, `expense_tax_treatment`,
`bereavement_entitlement`, `shift_work_rules`, `shift_change_notice`, `pay_statement_notice`, `allowance_tax_note`,
`post_probation_terms`. Starter clauses to review before release: `offer_statutory_statement`, `offer_conditions_explainer`,
`part_time_equal_treatment`, `probation_policy_reference`, `leave_rights_statement`, `sickness_evidence_reminder`,
`change_terms_statement`.

## Open risks

1. No country can generate business documents until counsel writes the clauses above (by design: fail closed).
2. E-signature legal sufficiency per country is unconfirmed (typed/drawn signature + e-mail code + certificate).
3. E-mail bounces are not tracked; a person whose address bounces may miss a document (it stays in Documents to action).
4. Monitoring dashboards are not built; problems are visible in the app's report and logs only.
5. Arabic-script packs need bundled fonts and shaping before activation.
6. The immediate promote/transfer/confirm actions bypass the approval flow and produce no letters until retired.
7. Performance on PostgreSQL at scale is extrapolated from a SQLite baseline.

## Decisions needed

| From | Decision |
|---|---|
| Product | Plan pricing of template features (`seeds/plan_features.json`); when to retire the immediate lifecycle actions; whether appraisal calibration is compulsory. |
| Legal (Zoiko) | Which PLATFORM_COUNSEL packs to write first (use the country-demand report); e-signature sufficiency per country; sign-off of platform packs. |
| Legal (tenants) | The clause texts for each country they activate; protections that require legal review before an unsuccessful-probation letter. |
| HR / Privacy (tenants) | Retention durations per rule key (none is defaulted); compensation visibility for managers; who may reveal sickness reasons. |

See also `docs/privacy/human_actions_required.md` (items 1–44) and the per-family documents in this folder.
