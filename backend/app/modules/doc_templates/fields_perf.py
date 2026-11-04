"""Module fields for performance, probation, learning and employment changes (Prompt 4). Registered into fields.REGISTRY.

Like Prompt 3, every value is prepared by the owning module's context provider (performance_documents, learning_documents,
change_documents) on `ctx.extra`; these registrations only read it back and give the editor a synthetic sample.
"""
from __future__ import annotations

from datetime import date

from app.core.privacy.classification import Level
from app.modules.doc_templates.fields import register

L = Level
_D = date(2026, 11, 2)


def _x(key):
    return lambda c: c.extra.get(key)


def _reg(rows, level):
    for key, label, type_, sample in rows:
        register(key, label, type_, level, _x(key), sample)


# probation.start_date / end_date / review_dates / objectives_summary / reviewer are registered by fields_hr (Prompt 2)
_reg([
    ("probation.review_number", "Review number", "number", 1),
    ("probation.review_date", "Review date", "date", date(2027, 1, 4)),
    ("probation.objectives_progress", "Objectives progress", "rows", [["Learn the reporting tools", "Meets", "Built the weekly report."]]),
    ("probation.strengths", "What is going well", "text", "Clear written communication."),
    ("probation.concerns", "Areas to improve", "text", None),
    ("probation.support_agreed", "Support agreed", "text", "Fortnightly coaching with the team lead."),
    ("probation.recommendation_label", "Recommendation", "text", "On track"),
    ("probation.new_end_date", "New probation end date", "date", date(2027, 7, 2)),
    ("probation.extension_reason", "Reason for the extension", "text", "More time is needed to show the objectives are met."),
    ("probation.extension_objectives", "What we need to see", "list", ["Complete the month-end close unaided"]),
    ("probation.next_review_dates", "Next review dates", "text", "1 March 2027, 1 June 2027"),
    ("probation.confirmation_date", "Confirmation date", "date", date(2027, 5, 2)),
    ("probation.final_meeting_date", "Final review meeting", "date", date(2027, 4, 20)),
    ("probation.decision_reasons", "Reasons for the decision", "text", "The objectives agreed at each review were not met."),
], L.PERSONAL_CONFIDENTIAL)

_reg([
    ("appraisal.period_label", "Appraisal period", "text", "2026"),
    ("appraisal.goals", "Goals", "rows", [["Reduce report turnaround", "40%", "Down from 5 to 3 days", "Exceeds", "Dashboard history"]]),
    ("appraisal.competencies", "Competencies", "rows", [["Collaboration", "Meets", "Led the cross-team planning session."]]),
    ("appraisal.overall_rating_label", "Overall rating", "text", "Meets expectations"),
    ("appraisal.manager_summary", "Manager summary", "text", "A strong year with clear progress."),
    ("appraisal.development_priorities", "Development priorities", "list", ["Stakeholder presentations"]),
    ("appraisal.calibrated_by", "Calibrated by", "text", "Harper People"),
    ("appraisal.self_goal_rows", "My goals", "rows", [["Reduce report turnaround", "Cut turnaround to 3 days"]]),
    ("appraisal.manager_goal_rows", "Goal ratings", "rows", [["Reduce report turnaround", "Exceeds", "Dashboard history"]]),
    ("appraisal.manager_competency_rows", "Competency ratings", "rows", [["Collaboration", "Meets", "Planning session"]]),
    ("pip.hr_contact", "HR contact", "text", "Harper People"),
    ("pip.start_date", "Plan start", "date", _D),
    ("pip.end_date", "Plan end", "date", date(2027, 1, 29)),
    ("pip.objectives", "Objectives", "rows", [["Accurate reports", "No errors in weekly reports", "3 corrections in October", "4 weeks without errors"]]),
    ("pip.support", "Support", "list", ["Weekly check-in with the team lead"]),
    ("pip.adjustments_considered", "Adjustments considered", "text", "Not applicable: none requested."),
    ("pip.review_dates", "Review meetings", "rows", [["16 November 2026", "Morgan Manager"]]),
], L.SPECIAL_CATEGORY)

_reg([
    ("training.course", "Course", "text", "Information security essentials"),
    ("training.version", "Course version", "text", "2026.1"),
    ("training.completed_on", "Completed on", "date", _D),
    ("training.score", "Score", "text", "92%"),
    ("training.valid_until", "Valid until", "date", date(2027, 11, 2)),
    ("training.provider", "Provider", "text", "Example Learning Ltd"),
    ("cert.name", "Certification", "text", "First aid at work"),
    ("cert.issuing_body", "Issuing body", "text", "Example Safety Council"),
    ("cert.number_masked", "Certificate number", "text", "••••1234"),
    ("cert.issued_on", "Issued on", "date", _D),
    ("cert.expires_on", "Expires on", "date", date(2029, 11, 2)),
    ("cert.renewal_requirements", "Renewal requirements", "text", "Refresher course every three years."),
    ("cert.renewal_history", "Renewal history", "rows", [["2 November 2023", "EX-2023-000210"]]),
], L.PERSONAL_BASIC)

_reg([
    ("change.effective_date", "Effective from", "date", _D),
    ("change.previous_title", "Previous title", "text", "Analyst"),
    ("change.new_title", "New title", "text", "Senior Analyst"),
    ("change.new_grade", "New grade", "text", "Grade 5"),
    ("change.new_manager", "New manager", "text", "Morgan Manager"),
    ("change.new_manager_title", "New manager's title", "text", "Operations Lead"),
    ("change.previous_manager", "Previous manager", "text", "Riley Former"),
    ("change.new_responsibilities", "New responsibilities", "list", ["Lead the monthly reporting cycle"]),
    ("change.department", "Department", "text", "Operations"),
    ("change.previous_department", "Previous department", "text", "Finance"),
    ("change.new_department", "New department", "text", "Operations"),
    ("change.work_location", "Work location", "text", "Leeds, United Kingdom (unchanged)"),
    ("change.working_pattern", "Working pattern", "text", "Unchanged"),
    ("change.reason_statement", "Reason", "text", None),
    ("change.duties_changed", "Duties changed", "bool", False),
    ("change.from_summary", "From", "text", "Finance · Analyst · Riley Former"),
    ("change.to_summary", "To", "text", "Operations · Analyst · Morgan Manager"),
    ("change.decision_label", "Decision", "text", "Approved"),
    ("change.is_refused", "Refused", "bool", False),
    ("change.decided_by", "Decided by", "text", "Morgan Manager"),
    ("change.hr_approved_by", "HR approval by", "text", "Harper People"),
    ("change.decided_at", "Decided on", "date", _D),
    ("change.decision_reason", "Decision reason", "text", None),
], L.PERSONAL_BASIC)

_reg([
    ("change.has_pay", "Includes a pay change", "bool", False),
    ("change.pay_rows", "Pay change", "rows", [["42,000.00 GBP", "46,000.00 GBP", "2 November 2026"]]),
], L.FINANCIAL)
