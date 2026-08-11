# TABLE_OWNERSHIP.md

99 tables owned by the standalone HR platform. `super_admin_*` = platform-level; everything else = per-organization. Monolith product tables (billing/spend/inventory/operations/payroll/comply/governance/insights/zoikotime) are intentionally absent.

## Organizations & Core HR (11)
- `organizations`
- `organization_configs`
- `departments`
- `designations`
- `employees`
- `employee_profiles`
- `employee_history`
- `employee_lifecycle`
- `employee_reporting`
- `employee_benefits`
- `employee_compensations`

## Attendance & Shifts (4)
- `attendance_records`
- `shifts`
- `shift_rosters`
- `holidays`

## Leave (4)
- `leave_requests`
- `leave_type_configs`
- `leave_settings`
- `leave_balances`

## Assets (6)
- `assets`
- `asset_requests`
- `asset_categories`
- `asset_reports`
- `asset_maintenance_requests`
- `asset_settings`

## Compensation & Payroll Structures (9)
- `pay_grades`
- `compensation_bands`
- `salary_components`
- `salary_structures`
- `structure_components`
- `allowances`
- `benefits`
- `compensation_items`
- `salary_revisions`

## Compliance (6)
- `compliance_audits`
- `compliance_regulations`
- `compliance_risks`
- `compliance_violations`
- `compliance_corrective_actions`
- `compliance_records`

## Engagement & ESS (2)
- `engagement_surveys`
- `ess_requests`

## Onboarding (8)
- `onboarding_new_hires`
- `onboarding_orientations`
- `onboarding_orientation_attendees`
- `onboarding_activities`
- `onboarding_preboarding_tasks`
- `onboarding_documents`
- `onboarding_checklists`
- `onboarding_checklist_items`

## Performance (5)
- `performance_reviews`
- `performance_goals`
- `performance_appraisals`
- `performance_kpis`
- `performance_feedback`

## Recruitment (8)
- `recruitment_requisitions`
- `recruitment_candidates`
- `recruitment_interviews`
- `recruitment_interview_feedback`
- `recruitment_offers`
- `recruitment_offer_approvals`
- `recruitment_documents`
- `recruitment_applications`

## Travel & Expenses (6)
- `travel_requests`
- `travel_approvals`
- `travel_expenses`
- `travel_receipts`
- `travel_policies`
- `travel_settings`

## Learning (12)
- `learning_courses`
- `learning_paths`
- `learning_path_items`
- `learning_certifications`
- `learning_skills`
- `learning_training_programs`
- `learning_training_program_assignments`
- `learning_enrollments`
- `learning_assessments`
- `learning_assessment_questions`
- `learning_quiz_attempts`
- `learning_calendar_events`

## HR Documents (5)
- `hr_documents`
- `hr_document_versions`
- `document_approval_steps`
- `document_approval_logs`
- `document_assignments`

## Security (1)
- `security_action_tokens`

## Workforce Planning (5)
- `workforce_plans`
- `wf_plans`
- `wf_headcounts`
- `wf_successions`
- `wf_reports`

## Platform (Super Admin) (7)
- `super_admin_audit_logs`
- `super_admin_login_activities`
- `super_admin_notifications`
- `super_admin_platform_settings`
- `super_admin_security_events`
- `super_admin_support_tickets`
- `super_admin_approval_history`

## Frontend module ↔ backend ownership
| Frontend module | Backend router |
|---|---|
| `platform` | `hr` / `employee` (auth) |
| `super-admin` | `super_admin` |
| `organization-admin` | `hr` (org config, dashboard stats) |
| `hr-admin` | `hr` + `employee` |
| `zoiko-hr` | `hr` |
| `settings`, `shared-layers` | shared shell, no DB tables |
