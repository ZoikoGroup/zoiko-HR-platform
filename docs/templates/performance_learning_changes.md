# Performance, probation, learning and employment-change templates

Prompt 4 of 4 implements 16 starter templates (10 performance, probation and learning; 6 employment changes), bringing the engine
to **82 implemented templates**: the 10 governance records of Prompt 1 and 72 business templates. A template listed here still
needs an ACTIVE jurisdiction pack, an applicable variant and every mandatory clause released; preflight refuses it otherwise.

Starter content: `backend/scripts/doc_templates_author_prompt4.py` (rerun to rewrite the seed JSON). Module code:
`app/modules/hr/performance_documents.py`, `learning_documents.py`, `change_documents.py`.

## Rules that apply to all of them

* **Decisions first, letters after.** Every letter communicates a decision a person already made in its module. Generating a
  document never changes HR state: department, manager, title, status, confirmation date, access and pay change only when HR
  completes the change (`POST /hr/changes/{id}/complete`) or acts in the module that owns the data.
* **Separation of duties.** A lifecycle request is decided by someone other than the initiator and the employee. An internal
  transfer needs two decisions: a manager of the receiving department (or HR) and then HR, two different people. PIPs need HR
  approval from someone other than the manager. Calibration is never done by the assessing manager. HR-PRF-005 needs three
  distinct people (requester, HR approver, authorised signatory).
* **Visibility.** Appraisals, manager assessments and PIPs are C3: the employee, HR roles and the manager chain (the direct manager
  and one level up) only — never peers. Self-assessments and probation records are C2: employee, manager, HR.
* **Acknowledgement is not agreement.** Every acknowledgement wording says so where a person might disagree.
* **Contract variations.** A change that also moves someone to another country or region, or changes hours or contract type,
  is refused with `CONTRACT_VARIATION_REQUIRED` — a terms-variation agreement (HR-CHG-009/010/011, later tiers) is needed.

## A. Performance, probation and learning

| Template | Trigger | Audience and approval | Clauses |
|---|---|---|---|
| HR-PRF-002 Probation review form | the reviewer submits a structured review (`probation_reviews`, from the HR-ONB-020 review tasks); the employee adds comments; the record is issued | Employee acknowledges, manager sees it; L1. Concerns need specifics and the support offered (refused otherwise). | — |
| HR-PRF-003 Probation extension notice | lifecycle `probation_extended` approved by HR | Employee acknowledges; **L2** (requested by the manager, HR approval reused). Refused without a review recommending an extension (`PROBATION_EXTENSION_NOT_RECOMMENDED`), when the clause states no limit (`PROBATION_LIMIT_NOT_CONFIGURED`) or when the new end date exceeds it (`PROBATION_LIMIT_EXCEEDED`). | `probation_extension_rules` (no starter text, mandatory; parameter `max_probation_months` set by the releaser, `null` = no statutory limit) |
| HR-PRF-004 Probation confirmation letter | lifecycle `confirmation` approved by HR (the manager recommends) | Employee acknowledges; L1. Replaces the generic lifecycle e-mail in the new flow. | `post_probation_terms` (optional, no starter text) |
| HR-PRF-005 Probation unsuccessful outcome | lifecycle `probation_end` (not confirmed) approved | Employee, no acknowledgement; **L3**: requester + HR approver + authorised signatory. Blocking checklist recorded in the decision receipt: a review with concerns and support, a chance to respond (date), adjustments considered (yes / not applicable with reason), HR review (who, when), legal review cleared when the person has a protection the pack flags. Issuing it never ends employment, access or pay. | `probation_termination_notice`, `appeal_rights` (no starter text, mandatory) |
| HR-PRF-007 Annual performance appraisal | appraisal finalised (after optional calibration by someone else; `performance.calibration_required` makes it compulsory) | Employee acknowledges, manager chain sees it; L1; **C3**. | — |
| HR-PRF-010 Employee self-assessment | the employee submits it | Employee, manager, HR; L1. | — |
| HR-PRF-011 Manager performance assessment | the manager submits it; **evidence is required for every rating** | C3; generated at submission, issued (shared with the employee) only when the appraisal is finalised. | — |
| HR-PRF-013 Performance improvement plan | PIP approved by HR (`DRAFT → PENDING_HR_APPROVAL → ACTIVE`) | Employee acknowledges; **L2** (HR ≠ manager); C3. Objectives need the standard, examples of the gap and the success measure; adjustments considered must be recorded. Outcomes (successful, unsuccessful, cancelled, extended) are recorded only; anything further is a separate procedure. | `pip_outcomes` (no starter text, mandatory) |
| HR-PRF-018 Mandatory training completion record | an enrollment in a mandatory course is completed | Employee and HR; L1. With `renewal_months` the completion expires and feeds HR-DOC-016. | — |
| HR-PRF-020 Training certification and renewal record | a certification is recorded, or renewed (expiry moved later) | Employee and HR; L1. Certificate number printed masked (last 4). Reminders 60/30/7 days before expiry (`learning.reminder_days`). | — |

Learning data: `learning_courses.is_mandatory`, `mandatory_audience` (policy-style audience), `renewal_months`, `version`;
`learning_enrollments.expires_on`; `learning_certifications.certificate_number`, `renewal_requirements`, `renewal_history`.
HR's compliance report (Documents centre → Training compliance) shows complete / expired / missing per department, with small
groups suppressed.

## B. Employment changes

| Template | Trigger | Audience and approval | Clauses |
|---|---|---|---|
| HR-CHG-001 Internal transfer request | ESS "Request an internal transfer" (`POST /hr/me/transfer-requests`) | Employee record; L1. The employee may choose not to tell their manager before HR contacts them. | — |
| HR-CHG-002 Internal transfer decision | the second (HR) decision on a transfer, or a refusal | HR-internal; **L2**. | — |
| HR-CHG-004 Promotion confirmation letter | lifecycle `promotion` approved | Employee acknowledges; **L2**. With a linked salary revision the letter has a pay section and becomes **C3** (encrypted; managers without compensation permission get a 404). A linked revision that is not approved blocks it (`LINKED_COMPENSATION_NOT_APPROVED`). | `change_terms_statement` (starter text) |
| HR-CHG-006 Job title change notification | lifecycle `role_change` approved | Employee acknowledges; L1. | `change_terms_statement` |
| HR-CHG-007 Department transfer letter | lifecycle `department_change` or `transfer` approved | Employee acknowledges; L1. | `change_terms_statement` |
| HR-CHG-008 Reporting manager change notification | lifecycle `manager_change` approved; bulk team moves with a preview (`/hr/changes/bulk-manager-change`) | Employee, information only; L1. The old and new manager get an ID-only notice. | — |

The existing immediate HR actions (`/hr/employee-management/promote|transfer|confirm`) remain for compatibility; they have no
approval step and produce no letters. New changes should go through `/hr/changes` (Employment changes screen).

## Clauses each organization must write

### `probation_extension_rules` — mandatory, with a parameter
| Must state | Parameter | Used by |
|---|---|---|
| Whether and how probation can be extended, the maximum total length, notice of the extension. | `max_probation_months` (number, or `null` when the law sets no limit) | HR-PRF-003 |

### `probation_termination_notice` — mandatory
| Must state | Used by |
|---|---|
| The notice (or pay in lieu) that applies when employment ends during or at the end of probation. | HR-PRF-005 |

### `appeal_rights` — mandatory
| Must state | Used by |
|---|---|
| Whether the employee can appeal, how, to whom and by when. | HR-PRF-005 |

### `pip_outcomes` — mandatory
| Must state | Used by |
|---|---|
| The possible outcomes of a plan and the procedure that applies (capability, disciplinary or none), without pre-judging the outcome. | HR-PRF-013 |

### Optional and starter clauses
| Clause | Kind | Used by |
|---|---|---|
| `post_probation_terms` | optional, no starter text (notice or benefits that change after probation) | HR-PRF-004 |
| `change_terms_statement` | starter text: "All other terms and conditions of your employment remain unchanged." | HR-CHG-004 / 006 / 007 |

## API summary

| Area | Routes |
|---|---|
| Probation | `GET/POST /hr/performance-documents/probation-reviews`, `POST …/probation-reviews/{id}/issue`, `POST …/probation/{employee_id}/outcome`; ESS `GET /hr/me/performance/probation-reviews`, `POST …/{id}/comments` |
| Appraisals | `POST /hr/performance-documents/appraisals/{id}/manager-assessment`, `…/calibrate`, `…/finalise`, `GET …/documents`; ESS `POST /hr/me/performance/appraisals/{id}/self-assessment`, `…/comments` |
| PIPs | `GET/POST /hr/performance-documents/pips`, `POST …/{id}/submit`, `…/decision`, `…/reviews`, `…/outcome` |
| Training | `GET /hr/learning-documents/compliance`, `POST /hr/learning-documents/run-expiry-check` |
| Changes | `GET/POST /hr/changes`, `POST /hr/changes/{id}/decision`, `…/complete`, `GET …/documents`, `POST /hr/changes/bulk-manager-change`; ESS `GET/POST /hr/me/transfer-requests` |

Migration: `d7e1a0b2c3f8_doc_templates_prompt4.py` (after `d7e1a0b2c3f7`).
