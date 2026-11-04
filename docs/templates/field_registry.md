# Field registry (generated)

Generated from `backend/app/modules/doc_templates/fields.py` by `scripts/doc_templates_field_registry.py`. Do not edit by hand.

Only these keys may appear as `{{key}}` placeholders. An unknown key is rejected when a variant or clause is saved.
Engine-only keys are bound by governance records (HR-DOC family) and are not offered in the template editor.

| Key | Label | Type | Classification | Engine-only |
|---|---|---|---|---|
| `allowance.amount` | Allowance amount | text | FINANCIAL |  |
| `allowance.amount_summary` | Allowance amount | text | FINANCIAL |  |
| `allowance.conditions` | Eligibility conditions | text | FINANCIAL |  |
| `allowance.currency` | Allowance currency | text | FINANCIAL |  |
| `allowance.eligibility_reason` | Eligibility reason | text | FINANCIAL |  |
| `allowance.end_or_review_date` | End or review date | date | FINANCIAL |  |
| `allowance.frequency_label` | Allowance frequency | text | FINANCIAL |  |
| `allowance.name` | Allowance | text | FINANCIAL |  |
| `allowance.start_date` | Allowance starts | date | FINANCIAL |  |
| `appraisal.calibrated_by` | Calibrated by | text | SPECIAL_CATEGORY |  |
| `appraisal.competencies` | Competencies | rows | SPECIAL_CATEGORY |  |
| `appraisal.development_priorities` | Development priorities | list | SPECIAL_CATEGORY |  |
| `appraisal.goals` | Goals | rows | SPECIAL_CATEGORY |  |
| `appraisal.manager_competency_rows` | Competency ratings | rows | SPECIAL_CATEGORY |  |
| `appraisal.manager_goal_rows` | Goal ratings | rows | SPECIAL_CATEGORY |  |
| `appraisal.manager_summary` | Manager summary | text | SPECIAL_CATEGORY |  |
| `appraisal.overall_rating_label` | Overall rating | text | SPECIAL_CATEGORY |  |
| `appraisal.period_label` | Appraisal period | text | SPECIAL_CATEGORY |  |
| `appraisal.self_goal_rows` | My goals | rows | SPECIAL_CATEGORY |  |
| `approval.approver_name` | Approver | text | PERSONAL_BASIC |  |
| `approval.comment` | Approval comment | text | PERSONAL_BASIC |  |
| `approval.decided_at` | Decided on | date | PLATFORM_META |  |
| `approval.decision` | Decision | text | PLATFORM_META |  |
| `approval.released_by` | Released by | text | PLATFORM_META | yes |
| `approval.requested_by` | Proposed by | text | PLATFORM_META | yes |
| `asset.issued_by` | Issued by | text | PERSONAL_BASIC |  |
| `asset.items` | Equipment issued | rows | PERSONAL_BASIC |  |
| `candidate.email` | Candidate e-mail | text | TENANT_CUSTOMER |  |
| `candidate.first_name` | Candidate first name | text | TENANT_CUSTOMER |  |
| `candidate.full_name` | Candidate full name | text | TENANT_CUSTOMER |  |
| `candidate.personal_note` | Personal note | text | TENANT_CUSTOMER |  |
| `candidate.postal_address` | Candidate postal address | text | PERSONAL_CONFIDENTIAL |  |
| `candidate.stage_reached` | Stage reached | text | TENANT_CUSTOMER |  |
| `cert.expires_on` | Expires on | date | PERSONAL_BASIC |  |
| `cert.issued_on` | Issued on | date | PERSONAL_BASIC |  |
| `cert.issuing_body` | Issuing body | text | PERSONAL_BASIC |  |
| `cert.name` | Certification | text | PERSONAL_BASIC |  |
| `cert.number_masked` | Certificate number | text | PERSONAL_BASIC |  |
| `cert.renewal_history` | Renewal history | rows | PERSONAL_BASIC |  |
| `cert.renewal_requirements` | Renewal requirements | text | PERSONAL_BASIC |  |
| `change.decided_at` | Decided on | date | PERSONAL_BASIC |  |
| `change.decided_by` | Decided by | text | PERSONAL_BASIC |  |
| `change.decision_label` | Decision | text | PERSONAL_BASIC |  |
| `change.decision_reason` | Decision reason | text | PERSONAL_BASIC |  |
| `change.department` | Department | text | PERSONAL_BASIC |  |
| `change.duties_changed` | Duties changed | bool | PERSONAL_BASIC |  |
| `change.effective_date` | Effective from | date | PERSONAL_BASIC |  |
| `change.from_summary` | From | text | PERSONAL_BASIC |  |
| `change.has_pay` | Includes a pay change | bool | FINANCIAL |  |
| `change.hr_approved_by` | HR approval by | text | PERSONAL_BASIC |  |
| `change.is_refused` | Refused | bool | PERSONAL_BASIC |  |
| `change.new_department` | New department | text | PERSONAL_BASIC |  |
| `change.new_grade` | New grade | text | PERSONAL_BASIC |  |
| `change.new_manager` | New manager | text | PERSONAL_BASIC |  |
| `change.new_manager_title` | New manager's title | text | PERSONAL_BASIC |  |
| `change.new_responsibilities` | New responsibilities | list | PERSONAL_BASIC |  |
| `change.new_title` | New title | text | PERSONAL_BASIC |  |
| `change.pay_rows` | Pay change | rows | FINANCIAL |  |
| `change.previous_department` | Previous department | text | PERSONAL_BASIC |  |
| `change.previous_manager` | Previous manager | text | PERSONAL_BASIC |  |
| `change.previous_title` | Previous title | text | PERSONAL_BASIC |  |
| `change.reason_statement` | Reason | text | PERSONAL_BASIC |  |
| `change.to_summary` | To | text | PERSONAL_BASIC |  |
| `change.work_location` | Work location | text | PERSONAL_BASIC |  |
| `change.working_pattern` | Working pattern | text | PERSONAL_BASIC |  |
| `claim.decided_at` | Claim decided on | date | FINANCIAL |  |
| `claim.decided_by` | Claim decided by | text | FINANCIAL |  |
| `claim.decision_label` | Claim decision | text | FINANCIAL |  |
| `claim.decision_reason` | Claim decision reason | text | FINANCIAL |  |
| `claim.items` | Claim items | rows | FINANCIAL |  |
| `claim.reference` | Claim reference | text | FINANCIAL |  |
| `claim.second_approver` | Second approver | text | FINANCIAL |  |
| `claim.submitted_on` | Submitted on | date | FINANCIAL |  |
| `claim.total_approved` | Total approved | text | FINANCIAL |  |
| `claim.total_claimed` | Total claimed | text | FINANCIAL |  |
| `claim.trip_reference` | Trip reference | text | FINANCIAL |  |
| `comp.annual_total` | Total annual value | text | FINANCIAL |  |
| `comp.base_amount` | Base pay amount | text | FINANCIAL |  |
| `comp.base_summary` | Base pay | text | FINANCIAL |  |
| `comp.benefits` | Benefits | rows | FINANCIAL |  |
| `comp.components` | Pay components | rows | FINANCIAL |  |
| `comp.currency` | Currency | text | FINANCIAL |  |
| `comp.effective_date` | Effective from | date | FINANCIAL |  |
| `comp.pay_frequency_label` | Pay frequency | text | FINANCIAL |  |
| `comp.pay_grade` | Pay grade | text | FINANCIAL |  |
| `comp.pay_period_label` | Pay period | text | FINANCIAL |  |
| `comp.statement_period` | Statement period | text | FINANCIAL |  |
| `comp.total_value` | Estimated total value | text | FINANCIAL |  |
| `correction.decided_at` | Correction decided on | date | PERSONAL_CONFIDENTIAL |  |
| `correction.decided_by` | Correction decided by | text | PERSONAL_CONFIDENTIAL |  |
| `correction.decision_reason` | Correction decision reason | text | PERSONAL_CONFIDENTIAL |  |
| `correction.status_label` | Correction decision | text | PERSONAL_CONFIDENTIAL |  |
| `document.date` | Document date | date | PLATFORM_META |  |
| `document.number` | Document number | text | PLATFORM_META |  |
| `document.response_deadline` | Response deadline | date | PLATFORM_META |  |
| `document.sha256` | Document SHA-256 | text | PLATFORM_META |  |
| `document.title` | Document title | text | PLATFORM_META |  |
| `document.verify_url` | Verification link | text | PLATFORM_META |  |
| `employer.hr_contact_email` | HR contact e-mail | text | PERSONAL_BASIC |  |
| `employer.hr_contact_name` | HR contact name | text | PERSONAL_BASIC |  |
| `employer.legal_name` | Employer legal name | text | PERSONAL_BASIC |  |
| `employer.registered_address` | Employer registered address | text | PERSONAL_BASIC |  |
| `employer.registration_label` | Employer registration type | text | PERSONAL_BASIC |  |
| `employer.registration_number` | Employer registration number | text | PERSONAL_BASIC |  |
| `employer.signatory_name` | Authorised signatory name | text | PERSONAL_BASIC |  |
| `employer.signatory_title` | Authorised signatory title | text | PERSONAL_BASIC |  |
| `employer.trading_name` | Employer trading name | text | PERSONAL_BASIC |  |
| `employment.continuous_service_date` | Continuous service date | date | PERSONAL_BASIC |  |
| `employment.contract_end_date` | Contract end date | date | PERSONAL_BASIC |  |
| `employment.department` | Department | text | PERSONAL_BASIC |  |
| `employment.employment_type` | Employment type (code) | text | PERSONAL_BASIC |  |
| `employment.employment_type_label` | Employment type | text | PERSONAL_BASIC |  |
| `employment.manager_name` | Manager name | text | PERSONAL_BASIC |  |
| `employment.pay_summary` | Pay summary | text | FINANCIAL |  |
| `employment.position_title` | Position title | text | PERSONAL_BASIC |  |
| `employment.probation_end_date` | Probation end date | date | PERSONAL_BASIC |  |
| `employment.start_date` | Start date | date | PERSONAL_BASIC |  |
| `employment.work_country_name` | Work country | text | PERSONAL_BASIC |  |
| `employment.work_location` | Work location | text | PERSONAL_BASIC |  |
| `employment.work_pattern` | Work pattern | text | PERSONAL_BASIC |  |
| `employment.worker_category` | Worker category | text | PERSONAL_BASIC |  |
| `execution.completed_at` | Executed on | datetime | PLATFORM_META | yes |
| `execution.consent_version` | Consent statement version | text | PLATFORM_META | yes |
| `generated_at` | Generated at | date | PLATFORM_META |  |
| `headcount.change` | Change | text | TENANT_AGGREGATE |  |
| `headcount.cost_estimate` | Estimated cost | money | FINANCIAL |  |
| `headcount.current` | Current headcount | number | TENANT_AGGREGATE |  |
| `headcount.department` | Department | text | PERSONAL_BASIC |  |
| `headcount.period` | Period | text | PERSONAL_BASIC |  |
| `headcount.plan_name` | Workforce plan | text | PERSONAL_BASIC |  |
| `headcount.rationale` | Rationale | text | PERSONAL_BASIC |  |
| `headcount.requested` | Requested headcount | number | TENANT_AGGREGATE |  |
| `interview.adjustments_provided` | Adjustments provided | text | TENANT_CUSTOMER |  |
| `interview.concerns` | Concerns | text | TENANT_CUSTOMER |  |
| `interview.date` | Interview date | date | TENANT_CUSTOMER |  |
| `interview.evidence_notes` | Evidence observed | text | TENANT_CUSTOMER |  |
| `interview.mode` | Interview mode | text | TENANT_CUSTOMER |  |
| `interview.panel` | Interview panel | text | PERSONAL_BASIC |  |
| `interview.questions_asked` | Questions asked | list | TENANT_CUSTOMER |  |
| `interview.recommendation` | Recommendation | text | TENANT_CUSTOMER |  |
| `interview.recommendation_reason` | Reason for recommendation | text | TENANT_CUSTOMER |  |
| `interview.stage` | Interview stage | text | TENANT_CUSTOMER |  |
| `interview.strengths` | Strengths | text | TENANT_CUSTOMER |  |
| `jd.approved_on` | Approved on | date | PLATFORM_META |  |
| `jd.department` | Department | text | PERSONAL_BASIC |  |
| `jd.desirable` | Desirable requirements | list | PERSONAL_BASIC |  |
| `jd.essential` | Essential requirements | list | PERSONAL_BASIC |  |
| `jd.grade` | Grade | text | PERSONAL_BASIC |  |
| `jd.location` | Location | text | PERSONAL_BASIC |  |
| `jd.purpose` | Purpose of the role | text | PERSONAL_BASIC |  |
| `jd.reports_to` | Reports to | text | PERSONAL_BASIC |  |
| `jd.responsibilities` | Key responsibilities | list | PERSONAL_BASIC |  |
| `jd.title` | Job title | text | PERSONAL_BASIC |  |
| `jd.version` | Version | number | PLATFORM_META |  |
| `jd.work_arrangement_label` | Working arrangement | text | PERSONAL_BASIC |  |
| `leave.alternative_dates` | Alternative dates | text | PERSONAL_CONFIDENTIAL |  |
| `leave.balance_after` | Balance after | number | PERSONAL_CONFIDENTIAL |  |
| `leave.balance_before` | Balance before | number | PERSONAL_CONFIDENTIAL |  |
| `leave.confirmed_at` | Confirmed on | date | PERSONAL_CONFIDENTIAL |  |
| `leave.confirmed_by` | Confirmed by | text | PERSONAL_CONFIDENTIAL |  |
| `leave.confirmed_start` | Confirmed start | date | PERSONAL_CONFIDENTIAL |  |
| `leave.days` | Days | number | PERSONAL_CONFIDENTIAL |  |
| `leave.decided_at` | Decided on | date | PERSONAL_CONFIDENTIAL |  |
| `leave.decided_by` | Decided by | text | PERSONAL_CONFIDENTIAL |  |
| `leave.decision_reason` | Decision reason | text | PERSONAL_CONFIDENTIAL |  |
| `leave.decision_status_label` | Decision | text | PERSONAL_CONFIDENTIAL |  |
| `leave.end_date` | Leave end | date | PERSONAL_CONFIDENTIAL |  |
| `leave.expected_return` | Expected return | date | PERSONAL_CONFIDENTIAL |  |
| `leave.handover_note` | Handover note | text | PERSONAL_CONFIDENTIAL |  |
| `leave.is_approved` | Leave approved | bool | PERSONAL_CONFIDENTIAL |  |
| `leave.is_refused` | Leave refused | bool | PERSONAL_CONFIDENTIAL |  |
| `leave.pay_summary` | Pay summary | text | PERSONAL_CONFIDENTIAL |  |
| `leave.requested_at` | Requested on | date | PERSONAL_CONFIDENTIAL |  |
| `leave.return_date` | Expected return | date | PERSONAL_CONFIDENTIAL |  |
| `leave.start_date` | Leave start | date | PERSONAL_CONFIDENTIAL |  |
| `leave.type_label` | Leave type | text | PERSONAL_CONFIDENTIAL |  |
| `offer.academic_institution` | Academic institution | text | TENANT_CUSTOMER |  |
| `offer.accepted_at` | Accepted on | date | TENANT_CUSTOMER |  |
| `offer.benefits_summary` | Benefits summary | text | FINANCIAL |  |
| `offer.changes` | Offer changes | rows | FINANCIAL |  |
| `offer.components` | Pay components | rows | FINANCIAL |  |
| `offer.condition_not_met` | Condition not met | text | TENANT_CUSTOMER |  |
| `offer.conditions` | Open offer conditions | list | TENANT_CUSTOMER |  |
| `offer.contract_end_date` | Fixed-term end date | date | TENANT_CUSTOMER |  |
| `offer.currency` | Currency | text | FINANCIAL |  |
| `offer.equity` | Equity | text | FINANCIAL |  |
| `offer.fixed_term_reason` | Reason for fixed term | text | TENANT_CUSTOMER |  |
| `offer.has_conditions` | Offer has open conditions | bool | TENANT_CUSTOMER |  |
| `offer.hours_per_week` | Hours per week | text | TENANT_CUSTOMER |  |
| `offer.internship_end_date` | Internship end date | date | TENANT_CUSTOMER |  |
| `offer.issue_date` | Offer date | date | TENANT_CUSTOMER |  |
| `offer.learning_objectives` | Learning objectives | list | TENANT_CUSTOMER |  |
| `offer.mentor_name` | Mentor | text | PERSONAL_BASIC |  |
| `offer.pay_amount` | Pay amount | text | FINANCIAL |  |
| `offer.pay_period_label` | Pay period | text | FINANCIAL |  |
| `offer.previous_date` | Previous offer date | date | TENANT_CUSTOMER |  |
| `offer.previous_reference` | Previous offer reference | text | TENANT_CUSTOMER |  |
| `offer.probation_months` | Probation (months) | number | TENANT_CUSTOMER |  |
| `offer.reference` | Offer reference | text | TENANT_CUSTOMER |  |
| `offer.remuneration_type_label` | Remuneration type | text | FINANCIAL |  |
| `offer.response_deadline` | Response deadline | date | TENANT_CUSTOMER |  |
| `offer.withdrawal_reason_category` | Withdrawal reason (code) | text | TENANT_CUSTOMER |  |
| `offer.withdrawal_reason_statement` | Withdrawal statement | text | TENANT_CUSTOMER |  |
| `offer.work_arrangement_label` | Working arrangement | text | TENANT_CUSTOMER |  |
| `onboarding.checklist_items` | Checklist items | rows | PERSONAL_BASIC |  |
| `onboarding.closed_by_name` | Closed by | text | PERSONAL_BASIC |  |
| `onboarding.completed_on` | Completed on | date | PLATFORM_META |  |
| `onboarding.exceptions` | Checklist exceptions | rows | PERSONAL_CONFIDENTIAL |  |
| `onboarding.owner` | HR owner | text | PERSONAL_BASIC |  |
| `org.display_name` | Organization name | text | PERSONAL_BASIC |  |
| `org.logo` | Organization logo | image | PERSONAL_BASIC |  |
| `overtime.compensation_method_label` | Compensation method | text | PERSONAL_CONFIDENTIAL |  |
| `overtime.date` | Overtime date | date | PERSONAL_CONFIDENTIAL |  |
| `overtime.decided_at` | Overtime decided on | date | PERSONAL_CONFIDENTIAL |  |
| `overtime.decided_by` | Overtime decided by | text | PERSONAL_CONFIDENTIAL |  |
| `overtime.decision_reason` | Overtime decision reason | text | PERSONAL_CONFIDENTIAL |  |
| `overtime.emergency_label` | Emergency | text | PERSONAL_CONFIDENTIAL |  |
| `overtime.hours` | Overtime hours | text | PERSONAL_CONFIDENTIAL |  |
| `overtime.reason` | Overtime reason | text | PERSONAL_CONFIDENTIAL |  |
| `overtime.status_label` | Overtime decision | text | PERSONAL_CONFIDENTIAL |  |
| `overtime.time_range` | Overtime time | text | PERSONAL_CONFIDENTIAL |  |
| `overtime.timing_label` | Pre-approved or retrospective | text | PERSONAL_CONFIDENTIAL |  |
| `pack.country` | Jurisdiction country | text | PLATFORM_META | yes |
| `pack.region` | Jurisdiction region | text | PLATFORM_META | yes |
| `pip.adjustments_considered` | Adjustments considered | text | SPECIAL_CATEGORY |  |
| `pip.end_date` | Plan end | date | SPECIAL_CATEGORY |  |
| `pip.hr_contact` | HR contact | text | SPECIAL_CATEGORY |  |
| `pip.objectives` | Objectives | rows | SPECIAL_CATEGORY |  |
| `pip.review_dates` | Review meetings | rows | SPECIAL_CATEGORY |  |
| `pip.start_date` | Plan start | date | SPECIAL_CATEGORY |  |
| `pip.support` | Support | list | SPECIAL_CATEGORY |  |
| `policy.absence_notification_rule` | Absence notification rule | text | PLATFORM_META |  |
| `policy.annual_leave_notice_days` | Annual leave notice (days) | number | PLATFORM_META |  |
| `policy.change_summary` | What changed | text | PLATFORM_META |  |
| `policy.claim_deadline_days` | Claim deadline (days) | number | PLATFORM_META |  |
| `policy.claim_dispute_days` | Claim dispute window (days) | number | PLATFORM_META |  |
| `policy.contact` | Policy contact | text | PLATFORM_META |  |
| `policy.core_hours` | Core hours | text | PLATFORM_META |  |
| `policy.default_probation_months` | Default probation (months) | number | PLATFORM_META |  |
| `policy.document_ref` | Policy document | text | PLATFORM_META |  |
| `policy.eap_contact` | Employee assistance contact | text | PLATFORM_META |  |
| `policy.effective_from` | Policy effective from | date | PLATFORM_META |  |
| `policy.expense_limits_summary` | Expense limits | text | PLATFORM_META |  |
| `policy.leave_year_label` | Leave year | text | PLATFORM_META |  |
| `policy.owner_name` | Policy owner | text | PLATFORM_META |  |
| `policy.privacy_contact` | Privacy contact | text | PLATFORM_META |  |
| `policy.remote_cost_support` | Remote working cost support | text | PLATFORM_META |  |
| `policy.review_due` | Next review | date | PLATFORM_META |  |
| `policy.scope_statement` | Applies to | text | PLATFORM_META |  |
| `policy.self_certification_days` | Self-certification period (days) | number | PLATFORM_META |  |
| `policy.standard_workday_hours` | Standard working day (hours) | text | PLATFORM_META |  |
| `policy.title` | Policy title | text | PLATFORM_META |  |
| `policy.travel_assistance_contact` | Travel assistance contact | text | PLATFORM_META |  |
| `policy.travel_class_rules` | Travel class rules | text | PLATFORM_META |  |
| `policy.version` | Policy version | text | PLATFORM_META |  |
| `position.department` | Department | text | PERSONAL_BASIC |  |
| `position.employment_type_label` | Employment type | text | PERSONAL_BASIC |  |
| `position.grade` | Grade | text | PERSONAL_BASIC |  |
| `position.job_description_ref` | Job description | text | PLATFORM_META |  |
| `position.location` | Location | text | PERSONAL_BASIC |  |
| `position.reason` | Reason for the position | text | PERSONAL_BASIC |  |
| `position.reports_to` | Reports to | text | PERSONAL_BASIC |  |
| `position.salary_range` | Salary range | text | FINANCIAL |  |
| `position.title` | Position title | text | PERSONAL_BASIC |  |
| `probation.concerns` | Areas to improve | text | PERSONAL_CONFIDENTIAL |  |
| `probation.confirmation_date` | Confirmation date | date | PERSONAL_CONFIDENTIAL |  |
| `probation.decision_reasons` | Reasons for the decision | text | PERSONAL_CONFIDENTIAL |  |
| `probation.end_date` | Probation end | date | PERSONAL_CONFIDENTIAL |  |
| `probation.extension_objectives` | What we need to see | list | PERSONAL_CONFIDENTIAL |  |
| `probation.extension_reason` | Reason for the extension | text | PERSONAL_CONFIDENTIAL |  |
| `probation.final_meeting_date` | Final review meeting | date | PERSONAL_CONFIDENTIAL |  |
| `probation.new_end_date` | New probation end date | date | PERSONAL_CONFIDENTIAL |  |
| `probation.next_review_dates` | Next review dates | text | PERSONAL_CONFIDENTIAL |  |
| `probation.objectives_progress` | Objectives progress | rows | PERSONAL_CONFIDENTIAL |  |
| `probation.objectives_summary` | Initial objectives | text | PERSONAL_CONFIDENTIAL |  |
| `probation.recommendation_label` | Recommendation | text | PERSONAL_CONFIDENTIAL |  |
| `probation.review_date` | Review date | date | PERSONAL_CONFIDENTIAL |  |
| `probation.review_dates` | Probation reviews | rows | PERSONAL_CONFIDENTIAL |  |
| `probation.review_number` | Review number | number | PERSONAL_CONFIDENTIAL |  |
| `probation.reviewer` | Reviewer | text | PERSONAL_BASIC |  |
| `probation.start_date` | Probation start | date | PERSONAL_CONFIDENTIAL |  |
| `probation.strengths` | What is going well | text | PERSONAL_CONFIDENTIAL |  |
| `probation.support_agreed` | Support agreed | text | PERSONAL_CONFIDENTIAL |  |
| `record.subject` | Record subject | text | PLATFORM_META | yes |
| `recruitment.privacy_contact_email` | Recruitment privacy contact | text | PERSONAL_BASIC |  |
| `recruitment.retention_months` | Candidate data retention (months) | number | PLATFORM_META |  |
| `recruitment.talent_pool_opt_in_url` | Talent pool opt-in link | text | PLATFORM_META |  |
| `recruitment.uses_cv_parsing` | Automated CV reading in use | bool | PLATFORM_META |  |
| `requisition.budget_range` | Budget range | text | FINANCIAL |  |
| `requisition.currency` | Budget currency | text | FINANCIAL |  |
| `requisition.department` | Department | text | PERSONAL_BASIC |  |
| `requisition.employment_type_label` | Employment type | text | PERSONAL_BASIC |  |
| `requisition.headcount` | Number of positions | number | PERSONAL_BASIC |  |
| `requisition.headcount_plan_ref` | Headcount authorization | text | PLATFORM_META |  |
| `requisition.hiring_manager` | Hiring manager | text | PERSONAL_BASIC |  |
| `requisition.justification` | Business justification | text | PERSONAL_BASIC |  |
| `requisition.reason` | Reason | text | PERSONAL_BASIC |  |
| `requisition.reference` | Requisition reference | text | PLATFORM_META |  |
| `requisition.replaces_employee_ref` | Replaces (employee ID) | text | PERSONAL_BASIC |  |
| `requisition.target_start_date` | Target start date | date | PERSONAL_BASIC |  |
| `requisition.title` | Requisition title | text | PERSONAL_BASIC |  |
| `requisition.work_location` | Work location | text | PERSONAL_BASIC |  |
| `review.conditions` | Conditions / limitations | text | PLATFORM_META | yes |
| `review.date` | Reviewed on | date | PLATFORM_META | yes |
| `review.qualification_statement` | Qualification statement | text | PLATFORM_META | yes |
| `review.reviewer_firm` | Reviewer firm / organisation | text | PLATFORM_META | yes |
| `review.reviewer_name` | Reviewer | text | PLATFORM_META | yes |
| `review.reviewer_role` | Reviewer role | text | PLATFORM_META | yes |
| `revision.currency` | Currency | text | FINANCIAL |  |
| `revision.effective_date` | Effective from | date | FINANCIAL |  |
| `revision.new_amount` | New salary | text | FINANCIAL |  |
| `revision.percentage_change` | Change (%) | text | FINANCIAL |  |
| `revision.previous_amount` | Previous salary | text | FINANCIAL |  |
| `revision.reason_statement` | Reason | text | FINANCIAL |  |
| `revision.summary_rows` | Salary change | rows | FINANCIAL |  |
| `revision.type_label` | Revision type | text | FINANCIAL |  |
| `scorecard.interviewer` | Interviewer | text | PERSONAL_BASIC |  |
| `scorecard.scores` | Scores | rows | TENANT_CUSTOMER |  |
| `scorecard.submitted_at` | Submitted on | date | PLATFORM_META |  |
| `scorecard.weighted_total` | Weighted total | text | TENANT_CUSTOMER |  |
| `shift.break_summary` | Breaks | text | PERSONAL_CONFIDENTIAL |  |
| `shift.change_effective_date` | Change effective from | date | PERSONAL_CONFIDENTIAL |  |
| `shift.change_reason` | Reason for the change | text | PERSONAL_CONFIDENTIAL |  |
| `shift.changes` | Shift changes | rows | PERSONAL_CONFIDENTIAL |  |
| `shift.end_date` | Pattern ends | date | PERSONAL_CONFIDENTIAL |  |
| `shift.is_short_notice` | Short notice | bool | PERSONAL_CONFIDENTIAL |  |
| `shift.location` | Location | text | PERSONAL_CONFIDENTIAL |  |
| `shift.name` | Shift | text | PERSONAL_CONFIDENTIAL |  |
| `shift.pattern` | Shift pattern | rows | PERSONAL_CONFIDENTIAL |  |
| `shift.short_notice_reason` | Reason for short notice | text | PERSONAL_CONFIDENTIAL |  |
| `shift.start_date` | Pattern starts | date | PERSONAL_CONFIDENTIAL |  |
| `signature.candidate` | Candidate signature | signature | PERSONAL_BASIC |  |
| `signature.employee` | Employee signature | signature | PERSONAL_BASIC |  |
| `signature.employer` | Employer signature | signature | PERSONAL_BASIC |  |
| `succession.candidates` | Potential successors | rows | PERSONAL_CONFIDENTIAL |  |
| `succession.critical_role` | Critical role | text | PERSONAL_CONFIDENTIAL |  |
| `succession.incumbent_ref` | Incumbent | text | PERSONAL_CONFIDENTIAL |  |
| `succession.owner` | Plan owner | text | PERSONAL_BASIC |  |
| `succession.review_date` | Next review | date | PERSONAL_CONFIDENTIAL |  |
| `succession.risk_of_vacancy` | Risk of vacancy | text | PERSONAL_CONFIDENTIAL |  |
| `template.canonical_id` | Template ID | text | PLATFORM_META | yes |
| `template.family` | Template family | text | PLATFORM_META | yes |
| `template.title` | Template title | text | PLATFORM_META | yes |
| `training.completed_on` | Completed on | date | PERSONAL_BASIC |  |
| `training.course` | Course | text | PERSONAL_BASIC |  |
| `training.provider` | Provider | text | PERSONAL_BASIC |  |
| `training.score` | Score | text | PERSONAL_BASIC |  |
| `training.valid_until` | Valid until | date | PERSONAL_BASIC |  |
| `training.version` | Course version | text | PERSONAL_BASIC |  |
| `variant.checksum` | Variant checksum | text | PLATFORM_META | yes |
| `variant.id` | Variant ID | text | PLATFORM_META | yes |
| `variant.language` | Variant language | text | PLATFORM_META | yes |
| `variant.release_mode` | Release mode | text | PLATFORM_META | yes |
| `variant.status` | Variant status | text | PLATFORM_META | yes |
| `variant.version` | Variant version | number | PLATFORM_META | yes |
| `version.change_reason` | Change reason | text | PLATFORM_META | yes |
| `version.impact` | Requirements affected | text | PLATFORM_META | yes |
| `version.next` | New version | text | PLATFORM_META | yes |
| `version.previous` | Previous version | text | PLATFORM_META | yes |
| `worker.employee_code` | Employee code | text | PERSONAL_BASIC |  |
| `worker.first_name` | Worker first name | text | PERSONAL_BASIC |  |
| `worker.full_name` | Worker full name | text | PERSONAL_BASIC |  |
| `worker.postal_address` | Worker postal address | text | PERSONAL_CONFIDENTIAL |  |
| `worker.work_email` | Worker work e-mail | text | PERSONAL_BASIC |  |
