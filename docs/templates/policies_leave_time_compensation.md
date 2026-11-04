# Policies, leave, working time and compensation templates

Prompt 3 of 4 implements 28 starter templates: 14 company policies, 5 leave records and letters, 4 working-time records and
notices, and 5 compensation letters and records. This page lists, for each template, what triggers it, who receives it, which
approvals it needs, and the clauses each organization (or Zoiko counsel) must write and release before it can be used. A template
listed here still needs an ACTIVE jurisdiction pack, an applicable variant and every mandatory clause released; preflight refuses
the document otherwise (fail closed).

Starter content is authored in `backend/scripts/doc_templates_author_prompt3.py` (run it to rewrite the seed JSON) and loaded as
versioned starters by `python -m app.modules.doc_templates.seeds.load_starters`. Starters never state a statutory entitlement,
amount, limit or notice period: wherever the law decides, the text is a jurisdiction clause.

## Conventions

* **HR** is an organization `admin` or `hr_admin`. **L1**: no further document approver. **L2**: one approver other than the
  requester (for compensation templates an organization `admin` or an authorised signatory whose scope covers `HR-CMP`).
* Acknowledging confirms receipt and reading. It is never a signature and never consent; the acknowledgement records the
  document's SHA-256 and the variant checksum of the exact version.
* Generating a document never changes HR state. The owning module decides (a leave decision, an overtime approval, a salary
  revision approval) and then asks the engine for the record; a refused document never undoes the HR action.
* E-mails, events and logs carry ids, numbers and statuses only. Compensation e-mails say only that "a compensation document is
  available"; the manager fast-track for bereavement names the request reference only.
* Super Admin has no access to any of these routes (privacy middleware 404s `/hr/*` for the platform).

## A. Policies (HR-POL-001, 002, 004, 005, 019, 021, 025, 026, 027, 030, 031, 041, 042, 043)

All 14: POLICY output, ACKNOWLEDGE (a distribution may require SIGN instead), audience EMPLOYEE, trigger
`policy.lifecycle_event`. Releasing a variant is the L2 step (the content lifecycle requires releaser ≠ author ≠ legal reviewer);
publishing a released version is L1. Every policy carries the header (owner, version, effective from, next review, applies to),
"What changed in this version" when a later version has a change summary, and the locked `rights_policy_status` and
`rights_speak_up` blocks.

**End to end.** Release a variant (Template Library) → **Company Policies** (`/zoiko-hr/documents/policies`) → *Publish*: choose
the audience, what employees must do, the due date and reminders, preview how many people are ready or blocked, publish. New
joiners in the audience receive the current version automatically (daily `new_joiners_job`). Employees read and acknowledge in
ESS; the **Company policies** hub (`/employee/documents/policies`) shows each current policy, its version, effective date, what
changed since the version they acknowledged, and the versions they received.

**Version changes.** Releasing a new version of a published policy:

* *Material change* (default): a DRAFT re-acknowledgement distribution with the same audience appears on the policy card.
  Publishing it sends the new version, asks everyone to acknowledge it again, and closes the previous campaign.
* *Minor change* (`minor_change = true` on the variant, for typos): the published campaign moves to the new version with no new
  documents and no re-acknowledgement. The first version of a template cannot be a minor change.

**Mira (assistant) sync.** Publishing a version (or a minor change) renders the policy text with organization-level values only (no
employee data) and publishes it as a knowledge source with authority tier A, `policy_canonical_id`, version, effective date and
the distribution audience; the previous version's source is retired in the same transaction. Retrieval only serves a
policy to employees inside its audience (no employee, no audience-restricted policy) and cites "<title> (version N)". If the
text cannot be embedded, the old version is still retired (Mira says it has no approved answer rather than quoting a superseded
version) and the policy card shows *Mira sync failed: retry*. Publishing also retires the placeholder documents seeded by
`scripts/seed_real_policy_docs.py` that the policy replaces (Handbook & Code of Conduct → POL-001/002; Attendance & Leave →
POL-004/025/026; Expense & Reimbursement → POL-042; Remote Work & WFH → POL-021); the script never re-seeds a replaced placeholder.

**Review dates.** Publishing creates an HR-DOC-016 expiry item at effective date + `policies.review_months` (default 12).

**Settings** (`/hr/policies/settings`, Company Policies → Policy settings). Fields with no value stay empty and block the policies
that print them: owner, contact and scope (org-wide, or per policy), privacy contact, absence notification rule, default probation
months, core hours, remote cost support, annual leave notice days (else the `annual` leave type's minimum notice), self-certification
days, leave year (else `leave_settings.leave_year_start`), travel class rules (else active travel policy descriptions), expense
limits (else travel settings), claim deadline (else `travel_settings.reimbursement_deadline`), claim dispute days, EAP contact.
The standard working day is the attendance setting `attendance.standard_workday_hours`.

| Template | Settings it needs beyond owner and contact | Mandatory clauses (no starter text) | Optional clauses (omitted until released) |
|---|---|---|---|
| HR-POL-001 Employee handbook | none | — | `handbook_local_annex` |
| HR-POL-002 Code of conduct | none | — | — |
| HR-POL-004 Attendance policy | absence notification rule | — | `attendance_local_rules` |
| HR-POL-005 Probation policy | default probation months | `probation_legal_limits` | — |
| HR-POL-019 Working hours policy | standard working day (attendance setting) | `rest_breaks`, `overtime_pay_or_time_off`, `maximum_working_time` | — |
| HR-POL-021 Remote work policy | (core hours, cost support optional) | — | `cross_border_remote_work` |
| HR-POL-025 Annual leave policy | leave year, notice days | `statutory_annual_leave`, `annual_leave_carry_over`, `leave_on_termination` | `sickness_during_leave` |
| HR-POL-026 Sick leave policy | self-certification days | `sickness_evidence_rules`, `sick_pay` | — |
| HR-POL-027 Family and parental leave policy | none | `family_leave_entitlements`, `family_leave_pay` | — |
| HR-POL-030 Employee data protection policy | privacy contact | — | `data_transfers` |
| HR-POL-031 Acceptable use policy | none | `monitoring_notice` | — |
| HR-POL-041 Business travel policy | travel class rules | — | — |
| HR-POL-042 Expenses and reimbursement policy | expense limits, claim deadline | — | `expense_tax_treatment` |
| HR-POL-043 Company property policy | none | — | — |

HR-ONB-010 and HR-ONB-011 (Prompt 2) remain the onboarding acknowledgement letters for the Code of Conduct and the Handbook; they
quote the version of the policy document the employee received.

## B. Leave (HR-LEV-001, 003, 007, 013, 018)

Data: `leave_requests` gained `decision_reason` (required when refusing), `decided_by`, `decided_at`, `handover_note` (employee,
their manager and HR), `alternative_dates`, a balance snapshot (`balance_before`, `balance_after`, read from `leave_balances`
at decision time and never recalculated), `details` (family / bereavement answers; there is no field for medical detail),
`confirmation` (HR's family leave confirmation), `document_id`, and `reason_encrypted`.

**Sickness reasons are special-category data.** The reason given for sick leave is encrypted into `reason_encrypted` before the
request is first stored; `reason` stays empty, so no list, detail, manager or export response carries it, no template has a field
for it, and it never reaches a document, e-mail or event. HR can reveal it (`GET /hr/leave-documents/{id}/sensitive-reason`),
which is recorded in the activity log. A reason is optional for sick and bereavement leave. The migration moves existing sickness
reasons into the encrypted column.

Every decision path (HR review, the attendance leave review, an HR edit that sets the status) enforces: the decider is never the
employee; a refusal needs a reason; a review never overwrites the employee's own reason.

Documents per leave type (organization setting `leave.document_map` can change it):

| Leave type | On request | On decision | On HR confirmation |
|---|---|---|---|
| annual, earned, casual | — | HR-LEV-001 + HR-LEV-018 | — |
| sick | HR-LEV-003 | HR-LEV-018 | — |
| maternity, paternity | — | HR-LEV-018 | HR-LEV-007 |
| bereavement | manager fast-track e-mail (reference only) | HR-LEV-013 + HR-LEV-018 | — |
| all others | — | HR-LEV-018 | — |

| Template | Trigger | Audience and approval | Clauses |
|---|---|---|---|
| HR-LEV-001 Annual leave request and approval | leave decided (approve / refuse) | Employee, manager can see it; L1. Decider ≠ employee. | `leave_rights_statement` (starter text) |
| HR-LEV-003 Sick leave notification | sick leave requested | Employee; L1. Never prints the reason. | `sickness_evidence_reminder` (starter text) |
| HR-LEV-007 Parental leave request | HR confirms dates and pay (`POST /hr/leave-documents/{id}/confirm-family-leave`) | Employee acknowledges; L2: the employee is the requester, HR's confirmation is the approval. A return-to-work reminder (`employee_lifecycle` `return_to_work`) is scheduled 14 days before the expected return. | `family_leave_notice_requirements`, `family_leave_entitlements` (no starter text) |
| HR-LEV-013 Bereavement leave request | bereavement leave decided | Employee; L1. No evidence asked for by default (`leave.bereavement_evidence_enabled`, off). | `bereavement_entitlement` (optional, no starter text) |
| HR-LEV-018 Leave approval or refusal notice | any leave decided | Employee; L1. The existing approved/declined e-mails remain and now link to the request. | `leave_rights_statement` (starter text) |

## C. Working time (HR-TIM-003, 004, 007, 013)

* `STANDARD_WORKDAY_HOURS` is now the organization setting `attendance.standard_workday_hours` (a shift's `standard_hours`
  overrides it; 8 hours is only the analytics fallback until set). The Working Hours Policy prints the configured value only.
* `overtime_requests`, `attendance_correction_requests` and `shift_notices` are new; `shift_rosters` records `notified_at`,
  `document_id` and `notice_id`; `attendance_records` records the authorised overtime hours.
* Overtime analytics now report authorised and unauthorised hours (`authorized_hours`, `unauthorized_hours`).

| Template | Trigger | Audience and approval | Clauses |
|---|---|---|---|
| HR-TIM-003 Shift pattern assignment notice | roster published (`POST /hr/time/rosters/publish`, one notice per person, preview first) | Employee acknowledges; L1. | `shift_work_rules` (optional, no starter text) |
| HR-TIM-004 Shift change notice | shifts changed (`POST /hr/time/rosters/change`) | Employee acknowledges; L1, or **L2** when the notice is shorter than `attendance.shift_change_notice_days` (a reason is then required and HR approves before it is sent). | `shift_change_notice` (optional, no starter text) |
| HR-TIM-007 Overtime authorization | overtime decided | Employee and manager; L1. Decider is the manager or HR, never the requester or the employee. Retrospective and emergency requests are flagged. Approval emits the ID-only event `attendance.overtime.approved`. | `overtime_pay_or_time_off` (no starter text; shared with POL-019) |
| HR-TIM-013 Attendance correction request | correction decided | Employee and manager; L1. Applied to `attendance_records` only on approval; originals stay on the request and two `employee_history` rows are written. | — |

## D. Compensation (HR-CMP-001, 002, 005, 010, 024) — C3

Compensation documents are visible to the employee, HR and the approver; managers get a 404 unless an organization admin switches
on `compensation.managers_see_reports` (default off), and then only for their own reports. Field snapshots and files are
encrypted at rest. Payroll is out of scope: approved changes reach payroll only as the ID-only event
`compensation.change.approved` (id, type, employee id, effective date).

| Template | Trigger | Audience and approval | Clauses |
|---|---|---|---|
| HR-CMP-001 Initial salary confirmation letter | the employee's first compensation record (`employee_compensations` now has base amount, currency, pay period and frequency) | Employee acknowledges; L2 in the approvals queue (admin or compensation signatory ≠ requester). | `pay_statement_notice` (optional, no starter text) |
| HR-CMP-002 Compensation package statement | ESS *My compensation → Download statement*, or HR's statement run with a preview | Employee; L1. Benefits show provider and contributions from `employee_benefits`. | — |
| HR-CMP-005 Salary increase notification | salary revision approved (`DRAFT → PENDING_APPROVAL → APPROVED → COMMUNICATED`) | Employee acknowledges; L2, the revision approver is reused when separation of duties holds. Refused for a decrease (`SALARY_DECREASE_NOT_ALLOWED`; a reduction is HR-CMP-006, Tier 3) and never produced for a `correction`. | — |
| HR-CMP-010 Allowance eligibility and award letter | allowance award approved | Employee acknowledges; L2 as above. | `allowance_tax_note` (optional, no starter text) |
| HR-CMP-024 Employee reimbursement claim approval | expense claim decided (new decision endpoint and the existing travel-expense review) | Employee; L1. The approver is never the claimant; above `compensation.expense_second_approval_threshold` a second, different approver decides. Items over the travel policy limit are flagged. | — |

Allowances are already per-employee in this codebase, so `allowances` gained the award columns (currency, frequency, end and
review dates, eligibility reason, conditions, status, requester, approver) instead of a separate `employee_allowance_awards`
table. Rows created before Prompt 3 have a NULL status and keep working as before; they produce no letter.

## Clauses each organization must write before release

Each table lists a clause key without starter text, what it must cover, and the templates that cannot be generated (mandatory)
or that simply omit it (optional) until it is released for the jurisdiction pack. These are legal texts: write them for each
country/region you employ in, have them reviewed, and release them through the clause library.

### `probation_legal_limits` — mandatory
| Must state | Used by |
|---|---|
| The maximum probation length and any extension limits the law allows, and any rights during probation. | HR-POL-005 |

### `rest_breaks` — mandatory
| Must state | Used by |
|---|---|
| Daily and weekly rest and in-shift break entitlements, including any rules for young workers. | HR-POL-019 |

### `overtime_pay_or_time_off` — mandatory
| Must state | Used by |
|---|---|
| How approved overtime is compensated (pay rate or time off in lieu) and any statutory premium or limits. | HR-POL-019, HR-TIM-007 |

### `maximum_working_time` — mandatory
| Must state | Used by |
|---|---|
| Maximum weekly or reference-period working hours, opt-outs where lawful, and night work limits. | HR-POL-019 |

### `statutory_annual_leave` — mandatory
| Must state | Used by |
|---|---|
| The minimum paid annual leave the law provides and how it relates to contractual leave and public holidays. | HR-POL-025 |

### `annual_leave_carry_over` — mandatory
| Must state | Used by |
|---|---|
| What can be carried into the next leave year, limits and deadlines, and any statutory carry-over (e.g. after sickness or family leave). | HR-POL-025 |

### `leave_on_termination` — mandatory
| Must state | Used by |
|---|---|
| Payment for accrued untaken leave on leaving, and any recovery of leave taken in advance where lawful. | HR-POL-025 |

### `sickness_evidence_rules` — mandatory
| Must state | Used by |
|---|---|
| When and what evidence may lawfully be requested (self-certification, medical certificates), and who sees it. | HR-POL-026 |

### `sick_pay` — mandatory
| Must state | Used by |
|---|---|
| Statutory sick pay and any company sick pay: eligibility, waiting days, rate and duration. | HR-POL-026 |

### `family_leave_entitlements` — mandatory
| Must state | Used by |
|---|---|
| The family leave types the law provides (maternity, paternity/partner, adoption, shared/parental), their length and the right to return. | HR-POL-027, HR-LEV-007 |

### `family_leave_pay` — mandatory
| Must state | Used by |
|---|---|
| Statutory and any enhanced family leave pay, eligibility and duration. | HR-POL-027 |

### `family_leave_notice_requirements` — mandatory
| Must state | Used by |
|---|---|
| When and how employees must notify family leave, and the evidence the law allows the employer to ask for. | HR-LEV-007 |

### `monitoring_notice` — mandatory
| Must state | Used by |
|---|---|
| What is monitored (systems, e-mail, devices, location…), why, the lawful basis, retention, and how employees are informed. | HR-POL-031 |

### Optional clauses (no starter text; the section is left out until one is released)
| Clause | Purpose | Used by |
|---|---|---|
| `handbook_local_annex` | Country-specific handbook content. | HR-POL-001 |
| `attendance_local_rules` | Local attendance rules. | HR-POL-004 |
| `cross_border_remote_work` | Working from another country: tax, immigration, social security. | HR-POL-021 |
| `sickness_during_leave` | Whether sickness during annual leave converts it to sick leave. | HR-POL-025 |
| `data_transfers` | International transfers of employee data. | HR-POL-030 |
| `expense_tax_treatment` | Tax treatment of reimbursed expenses. | HR-POL-042 |
| `bereavement_entitlement` | Statutory or company bereavement leave. | HR-LEV-013 |
| `shift_work_rules` | Shift and night-work rules. | HR-TIM-003 |
| `shift_change_notice` | Notice rules for changing shifts. | HR-TIM-004 |
| `pay_statement_notice` | Pay statement rights. | HR-CMP-001 |
| `allowance_tax_note` | Tax treatment of the allowance. | HR-CMP-010 |

### Clauses with starter text (review before release)
| Clause | Used by |
|---|---|
| `leave_rights_statement` | HR-LEV-001, HR-LEV-018 |
| `sickness_evidence_reminder` | HR-LEV-003 |

## Differences from the policy wireframes in `docs/`

The seven "HR Chatbot … Engineering Wireframe" documents in `docs/` are engineering specifications for the assistant, not policy
text. Their principles were kept where they apply to these starters: a work location is never inferred from IP, VPN or
nationality and cross-border work needs prior HR approval (Remote Work); monitoring must be described transparently (Acceptable
Use → `monitoring_notice`); expense approvers never approve their own claims, with a second approver above a threshold (Expense &
Reimbursement); statutory entitlements are jurisdiction data, not prose (Attendance & Leave). Where a wireframe and the starter
differ, the starter wins: for example the wireframes describe AI-driven eligibility gates and per-country rule engines that are
out of scope here, and the starters leave every statutory value to a released jurisdiction clause.

## API summary

| Area | Routes |
|---|---|
| Policies | `GET /hr/policies`, `GET/PUT /hr/policies/settings`, `POST /hr/policies/audience-preview`, `POST /hr/policies/distributions/{id}/knowledge-sync`, `GET /hr/me/policies` (and the Prompt 1 `/hr/policy-distributions/*`) |
| Leave | `GET /hr/leave-documents/{id}`, `POST /hr/leave-documents/{id}/confirm-family-leave`, `GET /hr/leave-documents/{id}/sensitive-reason`, `GET/PUT /hr/leave-documents/settings/current` |
| Working time | `GET/POST /hr/time/overtime`, `POST /hr/time/overtime/{id}/decision`, `GET/POST /hr/time/corrections`, `POST /hr/time/corrections/{id}/decision`, `POST /hr/time/rosters/publish`, `POST /hr/time/rosters/change`, `GET /hr/time/documents/{kind}/{id}`, `GET/PUT /hr/time/settings` |
| Compensation | `/hr/compensation-documents/revisions[/{id}/submit|decision]`, `/allowance-awards[/{id}/decision]`, `/expenses/{id}/decision`, `/statements/run`, `/documents/{kind}/{id}`, `/settings`; `GET /hr/me/compensation`, `POST /hr/me/compensation/statement` |

Migration: `d7e1a0b2c3f7_doc_templates_prompt3.py` (after `d7e1a0b2c3f6`).
