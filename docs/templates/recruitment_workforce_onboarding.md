# Recruitment, workforce planning and onboarding templates

Prompt 2 of 4 implements 28 starter templates. This page describes their operational trigger, intended audience and approval
path. A template still requires an active jurisdiction pack, applicable variant and released required clauses; being listed here
does not bypass document preflight.

## Approval and role conventions

* **HR** means an organization `admin` or `hr_admin`. HR may initiate and manage the workflows below, subject to the route's
  authorization checks.
* **L1** means no additional document approver. The authorized requester can issue the generated record. It does not remove
  separate workflow controls, such as review of an interview submission or approval of a job-description version.
* **L2** means one `admin` or `hr_admin` approver other than the requester. The underlying request/decision can supply a prior
  approval where the workflow records it and separation of duties is satisfied.
* Candidate-signed offers and amendments require the candidate to sign through the document-signing flow. Employee acknowledgments
  and signatures are distinct actions from document approval. Employer signature requirements follow the active template variant
  and configured signatory.
* A candidate or employee is a document recipient, not an HR workflow approver. A manager receives only the manager checklist
  assigned to them. Succession plans are visible only to HR and the plan owner.

## Recruitment

| Template | Trigger and workflow | Audience and approval |
|---|---|---|
| HR-HIR-001 — Hiring requisition authorization | Generated after a requisition decision; the decision evidence is reused as the prior approval. | HR-internal; L2. The requisition itself is not blocked when its decider raised it; separation of duties is enforced on this authorization record. |
| HR-HIR-004 — Candidate privacy notice | Generated when a candidate is created; HR may resend it. | Candidate notice; L1, no signature. |
| HR-HIR-006 — Candidate assessment and interview record | Generated from submitted interview feedback. Submission is limited to the interviewer or HR. | HR-internal; L1. |
| HR-HIR-007 — Interview evaluation scorecard | Generated with the same interview-feedback submission as HR-HIR-006. Score and evidence are recorded against requisition criteria. | HR-internal; L1. |
| HR-HIR-011 — Conditional employment offer letter | HR generates and issues the selected offer after offer approval; selected when open conditions remain. | Candidate; L2, then candidate signature. |
| HR-HIR-012 — Unconditional employment offer letter | HR generates and issues the selected offer after offer approval when no open conditions remain; may also be generated after conditions clear when configured. | Candidate; L2, then candidate signature. |
| HR-HIR-014 — Internship or apprenticeship offer letter | Selected for an internship/apprenticeship offer; HR generates and issues it after offer approval. | Candidate; L2, then candidate signature. |
| HR-HIR-015 — Fixed-term employment offer letter | Selected for a fixed-term offer; HR generates and issues it after offer approval. | Candidate; L2, then candidate signature. |
| HR-HIR-016 — Part-time employment offer letter | Selected for a part-time offer; HR generates and issues it after offer approval. | Candidate; L2, then candidate signature. |
| HR-HIR-017 — Offer amendment letter | HR requests an amendment to an existing offer. Issuing the approved amendment supersedes the prior issued letter; an executed amendment updates the offer state. | Candidate; L2, then candidate signature. |
| HR-HIR-018 — Offer withdrawal and rescission notice | HR requests withdrawal with a reason and reviewed statement; issuing the notice changes the offer to withdrawn. | Candidate; L2. If the offer was accepted, an admin must approve and HR must record whether legal review was completed. |
| HR-HIR-019 — Candidate acceptance acknowledgement | Generated after the candidate executes an offer. | Candidate; L1, no second signature. |
| HR-HIR-020 — Candidate rejection communication | Generated when a candidate is rejected, including a confirmed bulk rejection. If no usable variant can be issued, the existing rejection email remains the fallback. | Candidate; L1, no signature. |

Offer signing outcomes update the offer: execution accepts it and starts the onboarding hand-off; decline is stored as `rejected` and
displayed as **Declined**; expiry sets the offer to `expired`. This compatibility mapping is documented for downstream reporting
and is a Product decision to confirm in [human actions required](../privacy/human_actions_required.md).

### Offer letter setup (one step per work country)

Recruitment → Offer Management → **Offer letter setup**, or **Set up offer letters for XX** in an offer's readiness checklist.
The endpoints are `GET/POST /hr/recruitment/offer-letter-setup` in `app/modules/hr/offer_letter_setup.py`.

The step does four things:
* confirms the employing legal entity (prefilled from the organization profile) and the authorised signatory, with scope `HR-HIR`
  and risk L2;
* activates the organization's own pack for the country;
* releases every offer template whose mandatory clauses all have starter wording (HR-HIR-011, 012, 016, 017, 019), with those
  clauses;
* optionally switches on *offer letters without approval*.

**One-admin attestation.** An organization admin attests the **unchanged** platform starter wording by typing their name. That one
attestation counts as approval and release. Every released row records it: the variant's `legal_review.mode =
STARTER_SINGLE_ADMIN_ATTESTATION`, the HR-DOC-003 approval record, the pack's sign-off fields, and the clause rows (their
`reviewed_by` and `released_by`). The variant's `authored_by` stays null, because the platform wrote the starter.

This is an exception to the author/approver/releaser separation. It is limited to wording the organization did not change.
Templates needing the organization's own wording (HR-HIR-014 internship, 015 fixed-term, 018 withdrawal) are listed and left
unreleased. Their wording goes through the clause library with the full review chain.

**Plan.** Offer letters (`SIGN_CANDIDATE`) need only `hr.documents.templates`, so they are included in every plan.
`seeds/plan_features.json` was changed on 2026-10-22.

### Offer letters without approval (organization setting, off by default)

Recruitment settings → **Offer letters without approval** (`recruitment.offer_letters_without_approval`). When on:

* Saving an offer (create, edit or amendment) approves it in the name of the person who saved it and generates its letter at
  once: the template for the offer type (HR-HIR-011/012/014/015/016/017) in the variant and clauses released for the offer's
  work country. The letter is handled as L1 for that one document; the decision receipt keeps `approval_waived` (policy L2 and
  the reason) and the document history an `approval_waived` event.
* HR still sends the letter (Send counts as the issuer's approval). Editing the terms before it is sent cancels the unsent letter
  and generates a new one; after it is sent, changes go through Amend.
* Everything else still applies: no ACTIVE pack, variant or mandatory clause for the work country, a missing field or a
  freelance offer means no letter (the offer is saved and the refusal is on its decision receipt). L3 documents are never waived.

Switching it on removes the second-person check on offer terms; it is the organization's decision.

## Workforce planning

| Template | Trigger and workflow | Audience and approval |
|---|---|---|
| HR-ORG-003 — Headcount authorization request | Generated after a submitted headcount request is approved or rejected; the decision is supplied as prior approval when separation of duties holds. | HR-internal; L2. |
| HR-ORG-004 — Position creation and approval form | Generated after a position request is decided. The request workflow is enabled by the `require_position_approval` designation setting. | HR-internal; L2. |
| HR-ORG-005 — Job description template | Generated after a job-description version is approved. A language check flags potentially exclusionary terms for human review; flags do not automatically reject the draft. A reviewer other than the author must approve it. | HR-internal; L1 document issue after the separate version approval. |
| HR-ORG-015 — Succession planning document | Generated after a succession plan is decided; approval uses the recorded prior decision when separation of duties holds. | HR-internal; L2. Read access is limited to HR and the plan owner. |

## Onboarding

The three portal forms are deliberately **HR-internal form records** with execution mode `NONE`. The new hire completes the
declaration during portal submission; the submission records its version and evidence. The generated record is the HR copy of the
submitted/verified information, not a second employee signature request.

| Template | Trigger and workflow | Audience and approval |
|---|---|---|
| HR-ONB-001 — New starter personal information form | New hire saves and submits the form through the onboarding portal; HR verifies the submission. | HR-internal; L1 document record. |
| HR-ONB-003 — Emergency contact information form | New hire saves and submits the form through the onboarding portal; HR verifies the submission. | HR-internal; L1 document record. |
| HR-ONB-004 — Employee onboarding checklist | Generated when HR completes onboarding; includes completed tasks and documented exceptions. | HR-internal; L1. |
| HR-ONB-005 — Manager onboarding checklist | Generated when onboarding starts for a hire with a manager; checklist tasks are assigned to that manager. | Assigned manager only; L1. |
| HR-ONB-007 — Employment commencement confirmation | Generated by the start-date job when an employee's start date is reached. | Employee; L1, employee acknowledgment. |
| HR-ONB-010 — Code of conduct acknowledgement | Generated when the corresponding code-of-conduct policy is issued to the employee. | Employee; L1, employee acknowledgment. |
| HR-ONB-011 — Employee handbook acknowledgement | Generated when the corresponding handbook policy is issued to the employee. | Employee; L1, employee acknowledgment. |
| HR-ONB-015 — Equipment issuance form | Generated when equipment is assigned to an employee. | Employee; L1, employee signature. |
| HR-ONB-017 — Banking and payroll information submission form | New hire submits the form through the portal; finance-permitted staff verify it. Sensitive values are encrypted and masked unless explicitly revealed to a permitted finance user. Bank details are not copied into `EmployeeProfile`. | HR-internal; L1 document record; finance permission is required for verification and reveal. |
| HR-ONB-020 — Probation commencement and review schedule | Generated when HR schedules probation, or when an accepted offer supplies a probation period at onboarding completion. Review tasks are assigned to the reviewer. | Employee; L1, employee acknowledgment. |
| HR-ONB-022 — Onboarding completion certificate or audit record | Generated with HR-ONB-004 when HR completes onboarding. | HR-internal; L1. |

## Jurisdiction clauses tenants must author

The starter authoring source intentionally supplies no text for these clauses. Legal must write and release jurisdiction-appropriate
content before a template that requires it can pass preflight. Tenant-specific language must not be treated as platform legal advice.

| Clause key | Used by |
|---|---|
| `privacy_lawful_basis_recruitment` | Required by HR-HIR-004. |
| `privacy_international_transfers` | Optional in HR-HIR-004; add it when the candidate-data flow requires an international-transfer notice. |
| `probation_summary` | Optional in HR-HIR-011 and HR-HIR-012. |
| `internship_status_statement` | Required by HR-HIR-014. |
| `fixed_term_statement` | Required by HR-HIR-015. |
| `offer_withdrawal_rights` | Required by HR-HIR-018. |

The pre-offer candidate jurisdiction falls back to the selected employing entity's country until the offer supplies a work country.
Configure the default entity and confirm this behavior for candidate records with Legal; see [human actions required](../privacy/human_actions_required.md).
