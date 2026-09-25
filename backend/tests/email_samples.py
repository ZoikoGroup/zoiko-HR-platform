"""
Sample invocations of every public email sender, used by the email
render tests and scripts/preview_emails.py. Each entry is
(sender_function_name, kwargs); delinquency stages go through
build_delinquency_context since send_delinquency_notice resolves its data
from the database.
"""

APP = "https://app.zoikohr.com"

SENDER_SAMPLES = [
    ("send_registration_received", dict(email="owner@acme.test", org_name="Acme Corp")),
    ("send_new_organization_created", dict(
        email="ops@zoikohr.test", recipient_first_name="Priya", organization_name="Acme Corp",
        created_at_local="Sep 25, 2026 10:30", timezone="UTC", creator_name="Jordan Lee",
        management_url=f"{APP}/super-admin/organizations/42")),
    ("send_hr_ticket_created", dict(
        email="hr@acme.test", employee_name="Sam Rivera", ticket_reference="HRT-2026-0042",
        issue_summary="I need help updating my details.", organization_name="Acme Corp",
        tickets_url=f"{APP}/hr-admin/assistant-handoffs", organization_id=42)),
    ("send_leave_request_submitted", dict(
        email="sam@acme.test", first_name="Sam", request_reference="LV-42-0007",
        leave_period_display="Oct 01, 2026 – Oct 03, 2026", leave_request_url=f"{APP}/employee/leaves")),
    ("send_leave_approved", dict(
        email="sam@acme.test", first_name="Sam", request_reference="LV-42-0007",
        leave_period_display="Oct 01, 2026 – Oct 03, 2026", leave_request_url=f"{APP}/employee/leaves",
        workspace_name="Acme Corp", organization_id=42)),
    ("send_leave_rejected", dict(
        email="sam@acme.test", first_name="Sam", request_reference="LV-42-0008",
        leave_request_url=f"{APP}/employee/leaves", organization_id=42)),
    ("send_approved", dict(email="owner@acme.test", org_name="Acme Corp", recipient_first_name="Alex", organization_id=42)),
    ("send_rejected", dict(email="owner@acme.test", org_name="Acme Corp", recipient_first_name="Alex", organization_id=42)),
    ("send_suspended", dict(email="owner@acme.test", org_name="Acme Corp", recipient_first_name="Alex", organization_id=42)),
    ("send_reactivated", dict(
        email="owner@acme.test", org_name="Acme Corp", recipient_first_name="Alex",
        event_time_local="Sep 25, 2026 10:30", timezone="UTC", organization_id=42)),
    ("send_password_reset", dict(email="sam@acme.test", temp_password="Tmp-9f2K-x7", first_name="Sam", organization_id=42)),
    ("send_quotation_proposal_email", dict(
        email="owner@acme.test", recipient_first_name="Alex", organization_name="Acme Corp",
        plan_name="Advanced", amount_display="USD 4,800.00", valid_until_display="Oct 25, 2026",
        decision_url=f"{APP}/quotations/Q-1001")),
    ("send_quotation_accepted_email", dict(
        email="owner@acme.test", recipient_first_name="Alex", organization_name="Acme Corp",
        quote_number="Q-1001", amount_display="USD 4,800.00")),
    ("send_quotation_invoice_email", dict(
        email="owner@acme.test", recipient_first_name="Alex", organization_name="Acme Corp",
        invoice_number="INV-2026-0101", amount_display="USD 4,800.00", currency="USD",
        due_date_display="Oct 10, 2026")),
    ("send_invoice_email", dict(
        email="billing@acme.test", customer_name="Acme Corp", invoice_number="INV-2026-0102",
        issue_date="2026-09-25", due_date="2026-10-10", total_amount="400.00", balance_due="400.00",
        organization_id=42)),
    ("send_subscription_renewed_email", dict(
        email="billing@acme.test", customer_name="Acme Corp", subscription_number="SUB-00042",
        plan_name="Advanced", term_start="2026-09-25", term_end="2027-09-24", amount="4800.00",
        organization_id=42)),
    ("send_past_due_notice_email", dict(
        email="billing@acme.test", customer_name="Acme Corp", subscription_number="INV-2026-0102",
        plan_name="Advanced", days_overdue="Pending", overdue_amount="400.00", organization_id=42)),
    ("send_payment_receipt_email", dict(
        email="billing@acme.test", customer_name="Acme Corp", payment_number="INV-2026-0102",
        payment_date="2026-09-25", amount="400.00", payment_method="card", organization_id=42)),
    ("send_refund_email", dict(
        email="billing@acme.test", customer_name="Acme Corp", refund_number="RF-0009",
        refund_date="2026-09-25", amount="120.00", organization_id=42)),
    ("send_employee_welcome_email", dict(
        email="sam@acme.test", employee_name="Sam Rivera", first_name="Sam", workspace_name="Acme Corp",
        organization_id=42)),
    ("send_org_admin_invite_email", dict(
        email="new.admin@acme.test", first_name="Riley", inviter_name="Alex Morgan", workspace_name="Acme Corp",
        expires_at_local="Sep 26, 2026 10:30", timezone="UTC", action_url=f"{APP}/accept-invite",
        organization_id=42)),
    ("send_org_admin_account_activated_email", dict(
        email="new.admin@acme.test", first_name="Riley", workspace_name="Acme Corp", organization_id=42)),
    ("send_org_admin_password_reset_email", dict(
        email="admin@acme.test", first_name="Riley", expires_at_local="Sep 26, 2026 10:30", timezone="UTC",
        action_url=f"{APP}/reset-password", organization_id=42)),
    ("send_org_admin_password_changed_email", dict(
        email="admin@acme.test", first_name="Riley", event_time_local="Sep 25, 2026 10:30", timezone="UTC",
        organization_id=42)),
    ("send_org_admin_account_locked_email", dict(email="admin@acme.test", first_name="Riley", organization_id=42)),
    ("send_org_admin_access_removed_email", dict(
        email="admin@acme.test", first_name="Riley", workspace_name="Acme Corp",
        effective_date_local="Sep 25, 2026", organization_id=42)),
    ("send_org_admin_access_changed_email", dict(
        email="admin@acme.test", first_name="Riley", workspace_name="Acme Corp",
        effective_date_local="Sep 25, 2026", organization_id=42)),
    ("send_employee_account_status_email", dict(
        email="sam@acme.test", employee_name="Sam Rivera", status="activated", organization_id=42)),
    ("send_employee_lifecycle_email", dict(
        email="sam@acme.test", employee_name="Sam Rivera", event_type="confirmation",
        effective_date="2026-09-25", organization_id=42)),
    ("send_evaluation_7_days_remaining", dict(
        email="owner@acme.test", org_name="Acme Corp", evaluation_ends_at_display="October 02, 2026", organization_id=42)),
    ("send_evaluation_2_days_remaining", dict(
        email="owner@acme.test", org_name="Acme Corp", evaluation_ends_at_display="September 27, 2026", organization_id=42)),
    ("send_evaluation_expired", dict(
        email="owner@acme.test", org_name="Acme Corp", evaluation_ends_at_display="September 25, 2026", organization_id=42)),
    ("send_support_access_granted_email", dict(
        organization_id=42, recipient_email="billing-ops@zoikohr.test", grant_duration_hours=4,
        expires_at="2026-09-25 14:30")),
    ("send_evaluation_started_email", dict(
        email="owner@acme.test", org_name="Acme Corp", evaluation_end_date="October 25, 2026", organization_id=42)),
    ("send_evaluation_halfway_email", dict(
        email="owner@acme.test", org_name="Acme Corp", evaluation_end_date="October 25, 2026", organization_id=42)),
    ("send_document_assigned_email", dict(
        email="sam@acme.test", first_name="Sam", document_name="Employment Agreement",
        due_at_local="Oct 01, 2026", organization_id=42)),
    ("send_performance_review_assigned_email", dict(
        email="sam@acme.test", first_name="Sam", cycle_name="Q3 2026 Review", due_at_local="Oct 15, 2026",
        organization_id=42)),
    ("send_performance_review_submitted_email", dict(
        email="sam@acme.test", first_name="Sam", cycle_name="Q3 2026 Review", organization_id=42)),
]

DELINQUENCY_SAMPLES = [
    dict(stage=stage, customer_name="Acme Corp", plan_name="advanced", subscription_number="SUB-00042",
         days_overdue=days, currency="USD", overdue_amount="400.00")
    for stage, days in (
        ("DAY_10_RESTRICT", 10),
        ("DAY_20_RESTRICT", 20),
        ("DAY_45_TERMINATION", 45),
        ("RECOVERED", 0),
    )
]


def collect_sample_calls():
    """Run every sample through its real sender with send_approval_email
    intercepted. Returns [(label, template_name, context, organization_id)]."""
    from app.services import email_service

    captured = []

    def _capture(email, template_name, context, db=None, organization_id=None, **_):
        captured.append((template_name, dict(context), organization_id))
        return True

    original = email_service.send_approval_email
    email_service.send_approval_email = _capture
    try:
        calls = []
        for sender_name, kwargs in SENDER_SAMPLES:
            before = len(captured)
            getattr(email_service, sender_name)(**kwargs)
            assert len(captured) == before + 1, f"{sender_name} did not send exactly one email"
            template_name, context, org_id = captured[-1]
            calls.append((sender_name, template_name, context, org_id))
        for sample in DELINQUENCY_SAMPLES:
            template_name, context = email_service.build_delinquency_context(**sample)
            calls.append((f"delinquency:{sample['stage']}", template_name, context, None))
        return calls
    finally:
        email_service.send_approval_email = original
