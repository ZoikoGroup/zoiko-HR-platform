"""
Sample invocations of every public email sender, used by the email
render tests and scripts/preview_emails.py. Each entry is
(sender_function_name, kwargs); delinquency stages go through
build_delinquency_context since send_delinquency_notice resolves its data
from the database.
"""

APP = "https://app.zoikohr.com"

SENDER_SAMPLES = [
    ("send_workflow_message", dict(email="sam@acme.test", subject="Welcome aboard", body="Hi Sam,\nYour laptop is ready.")),
    ("send_registration_received", dict(email="owner@acme.test", org_name="Acme Corp")),
    ("send_new_organization_created", dict(
        email="ops@zoikohr.test", recipient_first_name="Priya", organization_name="Acme Corp",
        created_at_local="Sep 25, 2026 10:30", timezone="UTC", creator_name="Jordan Lee",
        management_url=f"{APP}/super-admin/organizations/42")),
    ("send_hr_ticket_created", dict(
        email="hr@acme.test", employee_name="Sam Rivera", ticket_reference="HRT-2026-0042",
        issue_summary="I need help updating my details.", organization_name="Acme Corp",
        tickets_url=f"{APP}/hr-admin/assistant-handoffs", organization_id=42)),
    ("send_support_login_requested", dict(
        email="admin@acme.test", admin_name="Alex", organization_name="Acme Corp", operator_email="support@zoikohr.com",
        reference="SLR-2026-000042", duration_minutes=15, justification="Customer reports a payroll page error",
        ticket_reference="ZHR-1234", review_url=f"{APP}/organization-admin/support-access", organization_id=42)),
    ("send_interview_scheduled", dict(
        email="sam@acme.test", recipient_name="Sam Rivera", is_candidate=True, candidate_name="Sam Rivera",
        position="Backend Engineer", organization_name="Acme Corp", date_display="Thu, Oct 22, 2026",
        time_display="10:00 - 11:00 (Asia/Kolkata)", interview_type_label="Video call", location=None,
        meeting_link="https://meet.example.com/abc", interviewer_name="Jordan Lee", organization_id=42)),
    ("send_interview_rescheduled", dict(
        email="jordan@acme.test", recipient_name="Jordan Lee", is_candidate=False, candidate_name="Sam Rivera",
        position="Backend Engineer", organization_name="Acme Corp", date_display="Fri, Oct 23, 2026",
        time_display="14:00 - 15:00 (Asia/Kolkata)", interview_type_label="In person",
        previous_display="Thu, Oct 22, 2026 10:00", location="Acme HQ, Floor 3", organization_id=42)),
    ("send_interview_cancelled", dict(
        email="sam@acme.test", recipient_name="Sam Rivera", is_candidate=True, candidate_name="Sam Rivera",
        position="Backend Engineer", organization_name="Acme Corp", date_display="Thu, Oct 22, 2026",
        time_display="10:00", organization_id=42)),
    ("send_candidate_status_update", dict(
        email="sam@acme.test", candidate_name="Sam Rivera", position="Backend Engineer", organization_name="Acme Corp",
        status_label="Under review", is_rejection=False, organization_id=42)),
    ("send_offer_letter", dict(
        email="sam@acme.test", candidate_name="Sam Rivera", position="Design Intern", organization_name="Acme Corp",
        employment_type_label="Internship", remuneration_label="Stipend", remuneration_display="₹25,000 per month",
        start_date_display="Nov 02, 2026", entity_name="Acme Corp Private Limited", organization_id=42)),
    ("send_offer_outcome", dict(
        email="hr@acme.test", admin_name="Alex", candidate_name="Sam Rivera", position="Backend Engineer",
        organization_name="Acme Corp", accepted=True, offers_url=f"{APP}/zoiko-hr/recruitment/offers",
        start_date_display="Nov 02, 2026", organization_id=42)),
    ("send_requisition_approval_request", dict(
        email="admin@acme.test", admin_name="Alex", requester_name="Jordan Lee", title_text="Backend Engineer",
        department="Engineering", openings=2, priority="High", organization_name="Acme Corp",
        requisitions_url=f"{APP}/zoiko-hr/recruitment/job-requisitions", location="Pune, India", organization_id=42)),
    ("send_requisition_decision", dict(
        email="jordan@acme.test", requester_name="Jordan Lee", title_text="Backend Engineer", department="Engineering",
        approved=True, decider_name="Alex Morgan", requisitions_url=f"{APP}/zoiko-hr/recruitment/job-requisitions",
        organization_id=42)),
    ("send_onboarding_invite", dict(
        email="sam@mail.com", first_name="Sam", organization_name="Acme Corp", position="Backend Engineer",
        portal_url=f"{APP}/onboarding-portal/abc123", expires_display="Nov 15, 2026", joining_date_display="Nov 02, 2026",
        manager_name="Jordan Lee", documents_requested=3, welcome_message="We can't wait to meet you.", organization_id=42)),
    ("send_onboarding_document_request", dict(
        email="sam@mail.com", first_name="Sam", organization_name="Acme Corp",
        documents=[{"title": "ID proof", "note": "Requested"}, {"title": "Bank details", "note": "Rejected: image is blurry"}],
        portal_url=f"{APP}/onboarding-portal/abc123", joining_date_display="Nov 02, 2026", organization_id=42)),
    ("send_onboarding_task_assigned", dict(
        email="it@acme.test", assignee_name="Robin", candidate_name="Sam Rivera", position="Backend Engineer",
        organization_name="Acme Corp", tasks=[{"title": "Set up laptop", "due": "Oct 30, 2026"}],
        checklists_url=f"{APP}/zoiko-hr/onboarding/checklists", joining_date_display="Nov 02, 2026", organization_id=42)),
    ("send_orientation_invite", dict(
        email="sam@mail.com", first_name="Sam", organization_name="Acme Corp", session_title="Company orientation",
        date_display="Mon, Nov 02, 2026", time_display="10:00", location="HQ, Floor 3", meeting_link="https://meet.example.com/o",
        presenter="Hana (HR)", organization_id=42)),
    ("send_onboarding_completed", dict(
        email="hr@acme.test", recipient_name="Hana", candidate_name="Sam Rivera", employee_code="ACM-0042",
        position="Backend Engineer", organization_name="Acme Corp", employees_url=f"{APP}/zoiko-hr/employees",
        joining_date_display="Nov 02, 2026", organization_id=42)),
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
    ("send_plan_upgraded_email", dict(
        email="billing@acme.test", customer_name="Acme Corp", previous_plan_name="Core",
        new_plan_name="Advanced", billing_cycle="Annual", effective_date="2026-09-25",
        amount="4800.00", organization_id=42)),
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
    ("send_pricing_request_received", dict(
        email="lee@acme-corp.com", first_name="Lee", reference="PR-2026-000042", plan_label="Advanced",
        products=["Core HR", "Leave Management"])),
    ("send_pricing_request_to_sales", dict(
        email="sales@zoikohr.com", reference="PR-2026-000042", full_name="Lee Park", work_email="lee@acme-corp.com",
        phone="+1 555 0100", company="Acme Corp", job_title="HR Director", country="United States", company_size="51-200",
        plan_label="Advanced", products=["Core HR"], billing_preference="Annual", timeline="In 1-3 months", message="We need multi-entity leave.")),
    ("send_demo_request_received", dict(
        email="lee@acme-corp.com", first_name="Lee", reference="DM-2026-000042", when="Tue, 13 Oct 2026 · Morning (9am-12pm) (Asia/Kolkata)",
        demo_format="Live video call", interests=["Core HR", "Leave Management"])),
    ("send_demo_request_to_admins", dict(
        email="super@zoikohr.com", reference="DM-2026-000042", full_name="Lee Park", work_email="lee@acme-corp.com", phone="+1 555 0100",
        company="Acme Corp", job_title="HR Director", country="India", company_size="51-200", interests=["Core HR"],
        when="Tue, 13 Oct 2026 · Morning (9am-12pm)", demo_format="Live video call", message="Interested in leave policies.")),
    ("send_email_verification", dict(
        email="new.user@acme.test", first_name="Riley", expires_at_local="Oct 11, 2026 10:30", timezone="UTC",
        action_url=f"{APP}/verify-email", organization_id=42)),
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
    ("send_document_action_required_email", dict(
        email="sam@acme.test", first_name="Sam", document_label="Document AC-2026-000042", document_number="AC-2026-000042",
        action_label="Read and acknowledge", action_phrase="read and acknowledge", issuer_name="Acme Corp HR",
        due_at_local="Oct 15, 2026", action_url=f"{APP}/zoiko-hr/ess/my-documents", organization_id=42)),
    ("send_document_reminder_email", dict(
        email="sam@acme.test", first_name="Sam", document_label="Document AC-2026-000042", document_number="AC-2026-000042",
        action_phrase="sign", due_at_local="Oct 15, 2026", organization_id=42)),
    ("send_document_executed_email", dict(
        email="hr@acme.test", first_name="Harper", document_label="Document AC-2026-000042", document_number="AC-2026-000042",
        completed_at_local="Oct 12, 2026 10:30 UTC", organization_id=42)),
    ("send_document_declined_email", dict(
        email="hr@acme.test", first_name="Harper", document_label="Document AC-2026-000042", document_number="AC-2026-000042",
        declined_party="Employee", organization_id=42)),
    ("send_document_expired_email", dict(
        email="hr@acme.test", first_name="Harper", document_label="Document AC-2026-000042", document_number="AC-2026-000042",
        expired_at_local="Oct 16, 2026", organization_id=42)),
    ("send_candidate_document_sign_email", dict(
        email="casey@acme.test", first_name="Casey", organization_name="Acme Corp", document_number="AC-2026-000043",
        link_expires_local="Oct 19, 2026", action_url=f"{APP}/sign/abc123", due_at_local="Oct 18, 2026", organization_id=42)),
    ("send_candidate_document_available_email", dict(
        email="casey@acme.test", first_name="Casey", organization_name="Acme Corp", document_label="Candidate privacy notice (AC-2026-000045)",
        document_number="AC-2026-000045", link_expires_local="Oct 19, 2026", action_url=f"{APP}/sign/abc123", organization_id=42)),
    ("send_bank_details_changed_email", dict(
        email="sam@acme.test", first_name="Sam", changed_at_local="Oct 21, 2026 10:30 UTC", organization_id=42)),
    ("send_leave_decision_needed_email", dict(
        email="morgan@acme.test", first_name="Morgan", request_reference="LV-42-0007", organization_id=42)),
    ("send_compensation_document_available_email", dict(
        email="sam@acme.test", first_name="Sam", document_number="AC-2026-000050", organization_id=42)),
    ("send_reporting_line_changed_email", dict(
        email="morgan@acme.test", first_name="Morgan", change_reference="CHG-00012", organization_id=42)),
    ("send_documents_to_action_email", dict(
        email="sam@acme.test", first_name="Sam", pending_count=2, organization_id=42)),
    ("send_document_sign_code_email", dict(
        email="sam@acme.test", first_name="Sam", document_number="AC-2026-000042", code="482913", ttl_minutes=10,
        organization_id=42)),
    ("send_policy_published_email", dict(
        email="sam@acme.test", first_name="Sam", policy_title="Remote work policy", document_number="AC-2026-000044",
        action_phrase="acknowledge", due_at_local="Oct 30, 2026", organization_id=42)),
    ("send_template_variant_review_required_email", dict(
        email="admin@acme.test", first_name="Alex", canonical_id="HR-POL-001", version=2, jurisdiction="GB",
        author_name="Harper Lee", step_label="release approval", organization_id=42)),
    ("send_documents_expiry_digest_email", dict(
        email="hr@acme.test", first_name="Harper", window_days=30, documents_count=3, uploads_count=1, templates_count=0,
        overdue_count=1, organization_id=42)),
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
