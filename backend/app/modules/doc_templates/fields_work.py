"""Module fields for policies, leave, working time and compensation (Prompt 3). Registered into fields.REGISTRY.

Values are prepared by the owning integration module's context provider (hooks.context) from the record named by the document's
source_ref and put on `ctx.extra`; these fields only read them back. That keeps each module's business rules (balance snapshots,
masking, which revision is "previous") in the module that owns the data.

Privacy: no leave field carries a sickness reason, diagnosis or other medical detail; there is deliberately no field for one.
Compensation amounts are FINANCIAL and only appear in C3 templates (encrypted snapshot and files).
"""
from __future__ import annotations

from datetime import date

from app.core.privacy.classification import Level
from app.modules.doc_templates.fields import register

L = Level
_D = date(2026, 11, 2)


def _x(key):
    return lambda c: c.extra.get(key)


def reg(key, label, type_, level, sample=None):
    register(key, label, type_, level, _x(key), sample)


# ── policies (policy_documents._policy_context: the released variant + per-organization policy settings) ─────────────
# policy.version / policy.effective_from are registered by fields_hr (also used by the onboarding acknowledgements).
for _key, _label, _type, _sample in [
    ("policy.title", "Policy title", "text", "Annual Leave Policy"),
    ("policy.review_due", "Next review", "date", date(2027, 11, 2)),
    ("policy.owner_name", "Policy owner", "text", "Head of People"),
    ("policy.contact", "Policy contact", "text", "people@example.com"),
    ("policy.scope_statement", "Applies to", "text", "All employees"),
    ("policy.change_summary", "What changed", "text", None),
    ("policy.privacy_contact", "Privacy contact", "text", "privacy@example.com"),
    ("policy.absence_notification_rule", "Absence notification rule", "text", "within one hour of your normal start time"),
    ("policy.default_probation_months", "Default probation (months)", "number", 6),
    ("policy.standard_workday_hours", "Standard working day (hours)", "text", "8"),
    ("policy.remote_cost_support", "Remote working cost support", "text", None),
    ("policy.core_hours", "Core hours", "text", "10:00 to 16:00"),
    ("policy.leave_year_label", "Leave year", "text", "1 January to 31 December"),
    ("policy.annual_leave_notice_days", "Annual leave notice (days)", "number", 14),
    ("policy.self_certification_days", "Self-certification period (days)", "number", 7),
    ("policy.travel_class_rules", "Travel class rules", "text", "Standard class rail and economy flights."),
    ("policy.travel_assistance_contact", "Travel assistance contact", "text", None),
    ("policy.expense_limits_summary", "Expense limits", "text", "Up to 120.00 per day for accommodation and meals."),
    ("policy.claim_deadline_days", "Claim deadline (days)", "number", 30),
    ("policy.eap_contact", "Employee assistance contact", "text", None),
    ("policy.claim_dispute_days", "Claim dispute window (days)", "number", 14),
]:
    reg(_key, _label, _type, L.PLATFORM_META, _sample)

# ── leave (leave_documents._leave_context) ─────────────────────────────────────────────────────────────────────────
for _key, _label, _type, _sample in [
    ("leave.type_label", "Leave type", "text", "Annual leave"),
    ("leave.start_date", "Leave start", "date", _D),
    ("leave.end_date", "Leave end", "date", date(2026, 11, 6)),
    ("leave.return_date", "Expected return", "date", None),
    ("leave.days", "Days", "number", 5),
    ("leave.balance_before", "Balance before", "number", 20),
    ("leave.balance_after", "Balance after", "number", 15),
    ("leave.requested_at", "Requested on", "date", date(2026, 10, 12)),
    ("leave.decision_status_label", "Decision", "text", "approved"),
    ("leave.is_approved", "Leave approved", "bool", True),
    ("leave.is_refused", "Leave refused", "bool", False),
    ("leave.decided_by", "Decided by", "text", "Morgan Manager"),
    ("leave.decided_at", "Decided on", "date", date(2026, 10, 14)),
    ("leave.decision_reason", "Decision reason", "text", None),
    ("leave.alternative_dates", "Alternative dates", "text", None),
    ("leave.handover_note", "Handover note", "text", "Sam covers the weekly report."),
    ("leave.confirmed_start", "Confirmed start", "date", _D),
    ("leave.expected_return", "Expected return", "date", date(2027, 5, 3)),
    ("leave.pay_summary", "Pay summary", "text", None),
    ("leave.confirmed_by", "Confirmed by", "text", "Harper People"),
    ("leave.confirmed_at", "Confirmed on", "date", date(2026, 10, 14)),
]:
    reg(_key, _label, _type, L.PERSONAL_CONFIDENTIAL, _sample)

# ── working time (time_documents) ──────────────────────────────────────────────────────────────────────────────────
for _key, _label, _type, _sample in [
    ("shift.name", "Shift", "text", "Early"),
    ("shift.pattern", "Shift pattern", "rows", [["Monday", "06:00", "14:00", "7.5"], ["Tuesday", "06:00", "14:00", "7.5"]]),
    ("shift.start_date", "Pattern starts", "date", _D),
    ("shift.end_date", "Pattern ends", "date", None),
    ("shift.break_summary", "Breaks", "text", "30 minutes unpaid"),
    ("shift.location", "Location", "text", "Leeds depot"),
    ("shift.changes", "Shift changes", "rows", [["9 November 2026", "Early (06:00–14:00)", "Late (14:00–22:00)"]]),
    ("shift.change_effective_date", "Change effective from", "date", date(2026, 11, 9)),
    ("shift.change_reason", "Reason for the change", "text", "Cover for a vacancy."),
    ("shift.is_short_notice", "Short notice", "bool", False),
    ("shift.short_notice_reason", "Reason for short notice", "text", None),
    ("overtime.date", "Overtime date", "date", _D),
    ("overtime.time_range", "Overtime time", "text", "17:00–19:00"),
    ("overtime.hours", "Overtime hours", "text", "2"),
    ("overtime.reason", "Overtime reason", "text", "Month-end close."),
    ("overtime.timing_label", "Pre-approved or retrospective", "text", "Pre-approved"),
    ("overtime.emergency_label", "Emergency", "text", "No"),
    ("overtime.status_label", "Overtime decision", "text", "Approved"),
    ("overtime.decided_by", "Overtime decided by", "text", "Morgan Manager"),
    ("overtime.decided_at", "Overtime decided on", "date", _D),
    ("overtime.compensation_method_label", "Compensation method", "text", "As set out in policy"),
    ("overtime.decision_reason", "Overtime decision reason", "text", None),
    ("correction.status_label", "Correction decision", "text", "Approved"),
    ("correction.decided_by", "Correction decided by", "text", "Morgan Manager"),
    ("correction.decided_at", "Correction decided on", "date", _D),
    ("correction.decision_reason", "Correction decision reason", "text", None),
]:
    reg(_key, _label, _type, L.PERSONAL_CONFIDENTIAL, _sample)

# ── compensation (compensation_documents) ──────────────────────────────────────────────────────────────────────────
for _key, _label, _type, _sample in [
    ("comp.base_amount", "Base pay amount", "text", "42,000.00"),
    ("comp.currency", "Currency", "text", "GBP"),
    ("comp.pay_period_label", "Pay period", "text", "per year"),
    ("comp.base_summary", "Base pay", "text", "42,000.00 GBP per year"),
    ("comp.pay_frequency_label", "Pay frequency", "text", "Monthly"),
    ("comp.effective_date", "Effective from", "date", _D),
    ("comp.pay_grade", "Pay grade", "text", "Grade 4"),
    ("comp.components", "Pay components", "rows", [["Base salary", "42,000.00 GBP", "per year"], ["Travel allowance", "1,200.00 GBP", "per year"]]),
    ("comp.annual_total", "Total annual value", "text", "43,200.00 GBP"),
    ("comp.statement_period", "Statement period", "text", "2026"),
    ("comp.benefits", "Benefits", "rows", [["Pension", "Example Pension Plan", "5%", "5%"]]),
    ("comp.total_value", "Estimated total value", "text", "45,300.00 GBP"),
    ("revision.previous_amount", "Previous salary", "text", "42,000.00"),
    ("revision.new_amount", "New salary", "text", "44,100.00"),
    ("revision.currency", "Currency", "text", "GBP"),
    ("revision.percentage_change", "Change (%)", "text", "5.00%"),
    ("revision.effective_date", "Effective from", "date", date(2027, 1, 1)),
    ("revision.type_label", "Revision type", "text", "your annual review"),
    ("revision.reason_statement", "Reason", "text", None),
    ("revision.summary_rows", "Salary change", "rows", [["42,000.00 GBP", "44,100.00 GBP", "+5.00%", "1 January 2027"]]),
    ("allowance.name", "Allowance", "text", "Travel allowance"),
    ("allowance.start_date", "Allowance starts", "date", _D),
    ("allowance.amount", "Allowance amount", "text", "100.00"),
    ("allowance.currency", "Allowance currency", "text", "GBP"),
    ("allowance.amount_summary", "Allowance amount", "text", "100.00 GBP"),
    ("allowance.frequency_label", "Allowance frequency", "text", "Monthly"),
    ("allowance.end_or_review_date", "End or review date", "date", None),
    ("allowance.eligibility_reason", "Eligibility reason", "text", "Regular travel between sites."),
    ("allowance.conditions", "Eligibility conditions", "text", "you continue to travel between sites at least weekly"),
    ("claim.reference", "Claim reference", "text", "EXP-00012"),
    ("claim.trip_reference", "Trip reference", "text", "TRV-00004"),
    ("claim.submitted_on", "Submitted on", "date", _D),
    ("claim.items", "Claim items", "rows", [["2 November 2026", "Hotel", "One night, Leeds", "95.00", "GBP", "Yes", "Yes"]]),
    ("claim.total_claimed", "Total claimed", "text", "95.00 GBP"),
    ("claim.total_approved", "Total approved", "text", "95.00 GBP"),
    ("claim.decision_label", "Claim decision", "text", "Approved"),
    ("claim.decided_by", "Claim decided by", "text", "Morgan Manager"),
    ("claim.second_approver", "Second approver", "text", None),
    ("claim.decided_at", "Claim decided on", "date", _D),
    ("claim.decision_reason", "Claim decision reason", "text", None),
]:
    reg(_key, _label, _type, L.FINANCIAL if _key.split(".")[0] in ("comp", "revision", "allowance", "claim") else L.PERSONAL_CONFIDENTIAL, _sample)
