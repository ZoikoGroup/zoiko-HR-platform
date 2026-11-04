"""Authoring source for the Prompt 4 starter seeds (performance, probation, learning, employment changes — 16 templates).

    python scripts/doc_templates_author_prompt4.py      # (re)writes app/modules/doc_templates/seeds/content/...

Same rules as Prompts 2 and 3. Starters never invent probation limits, notice periods, appeal routes or outcomes: those are
jurisdiction clauses without starter text, which block the templates that need them until counsel releases them.
"""
from __future__ import annotations

import json

from doc_templates_author_prompt2 import C, D, EQ, FG, H, L, LH, OUT, P, PRESENT, SIG, T  # noqa: F401
from doc_templates_author_prompt3 import starter, STARTERS  # noqa: F401  (same starter() shape)

STARTERS.clear()        # the Prompt 3 module filled it at import; this script writes only Prompt 4 files


def form(id_, fields):
    return {"type": "form_fields", "id": id_, "fields": fields}


# ═══ A. PERFORMANCE, PROBATION AND LEARNING ═════════════════════════════════════════════════════════════════════════

starter("HR-PRF-002", output_mode="FORM_RECORD", execution_mode="ACKNOWLEDGE", audience="EMPLOYEE", approval_policy="L1",
        required=["worker.full_name", "probation.review_number", "probation.review_date", "probation.reviewer",
                  "probation.recommendation_label"],
        optional=["employment.position_title", "employment.manager_name", "probation.end_date", "probation.objectives_progress",
                  "probation.strengths", "probation.concerns", "probation.support_agreed"],
        blocks=[
            H("Probation Review {{probation.review_number}} — {{worker.full_name}}"),
            FG(["employment.position_title", "employment.manager_name", "probation.review_date", "probation.end_date"],
               labels={"employment.position_title": "Role", "employment.manager_name": "Manager", "probation.end_date": "Probation ends"}),
            T(["Objective", "Progress", "Evidence"], "probation.objectives_progress", when=PRESENT("probation.objectives_progress")),
            H("What is going well", 2), P("{{probation.strengths}}", when=PRESENT("probation.strengths")),
            H("Areas to improve", 2), P("{{probation.concerns}}", when=PRESENT("probation.concerns")),
            P("Concerns must be specific, with examples, and the support offered.", style="small"),
            H("Support agreed", 2), P("{{probation.support_agreed}}", when=PRESENT("probation.support_agreed")),
            H("Your comments", 2),
            form("employee_comments", [{"key": "employee_comments", "label": "Your comments", "type": "textarea"}]),
            FG(["probation.recommendation_label"], labels={"probation.recommendation_label": "Recommendation"}),
            P("This review records progress at this point in your probation. A recommendation is not a final decision. You can add "
              "your comments and ask questions before any decision is made.", id="rights_probation_review"),
            D("I have read this review. My acknowledgement does not mean I agree with everything in it.", id="declaration"),
        ])

starter("HR-PRF-003", output_mode="DOCUMENT", execution_mode="ACKNOWLEDGE", audience="EMPLOYEE", approval_policy="L2",
        required=["worker.first_name", "probation.review_date", "probation.new_end_date", "probation.extension_reason",
                  "employer.hr_contact_name"],
        optional=["probation.extension_objectives", "probation.support_agreed", "probation.next_review_dates"],
        mandatory=["probation_extension_rules"],
        blocks=[
            LH, H("Extension of your probation period"),
            P("Dear {{worker.first_name}}, following your probation review on {{probation.review_date}}, we have decided to extend your "
              "probation period until {{probation.new_end_date}}."),
            H("Why we are extending it", 2), P("{{probation.extension_reason}}"),
            H("What we need to see", 2, include_when=PRESENT("probation.extension_objectives")),
            L(items_from="probation.extension_objectives", when=PRESENT("probation.extension_objectives")),
            H("Support", 2, include_when=PRESENT("probation.support_agreed")),
            P("{{probation.support_agreed}}", when=PRESENT("probation.support_agreed")),
            FG(["probation.next_review_dates"], labels={"probation.next_review_dates": "Next review dates"}),
            C("probation_extension_rules"),
            P("If you have questions or disagree, please speak to {{employer.hr_contact_name}}."),
            D("I confirm I have received and read this letter.", id="declaration"),
        ])

starter("HR-PRF-004", output_mode="DOCUMENT", execution_mode="ACKNOWLEDGE", audience="EMPLOYEE", approval_policy="L1",
        required=["worker.first_name", "employment.position_title", "probation.confirmation_date"],
        optional_clauses=["post_probation_terms"],
        blocks=[
            LH, H("Confirmation of your employment"),
            P("Dear {{worker.first_name}}, we are pleased to confirm that you have successfully completed your probation period. Your "
              "employment as {{employment.position_title}} is confirmed with effect from {{probation.confirmation_date}}."),
            P("Thank you for your work during your first months with us. Your manager will continue to meet with you regularly to agree "
              "objectives and development."),
            C("post_probation_terms", required=False),
            D("I confirm I have received and read this letter.", id="declaration"),
        ])

starter("HR-PRF-005", output_mode="DOCUMENT", execution_mode="NONE", audience="EMPLOYEE", approval_policy="L3",
        required=["worker.first_name", "probation.final_meeting_date", "probation.decision_reasons", "employer.signatory_name"],
        optional=["policy.eap_contact"],
        mandatory=["probation_termination_notice", "appeal_rights"],
        blocks=[
            LH, P("Private and confidential", style="notice"),
            H("Outcome of your probation period"),
            P("Dear {{worker.first_name}}, thank you for attending the probation review meeting on {{probation.final_meeting_date}}, where "
              "we discussed your performance against the objectives set for your probation."),
            H("Decision", 2),
            P("After considering the information discussed, including your comments, we have decided not to confirm your employment. "
              "{{probation.decision_reasons}}"),
            C("probation_termination_notice"),
            P("Arrangements for your final pay, any holiday entitlement and the return of company property will be confirmed separately "
              "through our normal processes."),
            C("appeal_rights"),
            P("If you would like support, you can contact {{policy.eap_contact}}.", when=PRESENT("policy.eap_contact")),
            SIG("employer"),
        ])

starter("HR-PRF-007", output_mode="FORM_RECORD", execution_mode="ACKNOWLEDGE", audience="EMPLOYEE", approval_policy="L1",
        required=["worker.full_name", "appraisal.period_label", "appraisal.goals", "appraisal.overall_rating_label",
                  "appraisal.manager_summary"],
        optional=["employment.position_title", "employment.manager_name", "appraisal.competencies", "appraisal.development_priorities",
                  "appraisal.calibrated_by"],
        blocks=[
            H("Performance Appraisal — {{appraisal.period_label}}"),
            FG(["worker.full_name", "employment.position_title", "employment.manager_name", "appraisal.period_label"],
               labels={"worker.full_name": "Employee", "employment.position_title": "Role", "employment.manager_name": "Manager",
                       "appraisal.period_label": "Period"}),
            T(["Goal", "Weight", "Result", "Rating", "Evidence"], "appraisal.goals"),
            T(["Competency", "Rating", "Evidence"], "appraisal.competencies", when=PRESENT("appraisal.competencies")),
            FG(["appraisal.overall_rating_label", "appraisal.calibrated_by"],
               labels={"appraisal.overall_rating_label": "Overall rating", "appraisal.calibrated_by": "Calibrated by"}),
            H("Manager summary", 2), P("{{appraisal.manager_summary}}"),
            H("Development priorities", 2, include_when=PRESENT("appraisal.development_priorities")),
            L(items_from="appraisal.development_priorities", when=PRESENT("appraisal.development_priorities")),
            H("Employee comments", 2),
            form("employee_comments", [{"key": "employee_comments", "label": "Your comments", "type": "textarea"}]),
            P("Ratings must be based on evidence from the review period. You can add comments and, if you disagree with the outcome, raise "
              "it through the appraisal review process.", id="rights_appraisal"),
            D("I have seen this appraisal. My acknowledgement does not mean I agree with it.", id="declaration"),
        ])

starter("HR-PRF-010", output_mode="FORM_RECORD", execution_mode="NONE", audience="EMPLOYEE", approval_policy="L1",
        required=["worker.full_name", "appraisal.period_label"],
        optional=["appraisal.self_goal_rows"],
        blocks=[
            H("Self-Assessment — {{appraisal.period_label}}"),
            T(["Goal", "What I achieved"], "appraisal.self_goal_rows", when=PRESENT("appraisal.self_goal_rows")),
            form("self_assessment", [
                {"key": "went_well", "label": "What went well", "type": "textarea", "required": True},
                {"key": "difficult", "label": "What was difficult, and why", "type": "textarea"},
                {"key": "support", "label": "Support that would help", "type": "textarea"},
                {"key": "development", "label": "Development interests", "type": "textarea"},
                {"key": "wellbeing", "label": "Wellbeing and workload (optional, seen by your manager and HR only)", "type": "textarea"}]),
            D("This is my own assessment of my performance.", id="declaration"),
        ])

starter("HR-PRF-011", output_mode="FORM_RECORD", execution_mode="NONE", audience="EMPLOYEE", approval_policy="L1",
        required=["worker.full_name", "appraisal.period_label", "appraisal.manager_goal_rows"],
        optional=["appraisal.manager_competency_rows"],
        blocks=[
            H("Manager Assessment — {{worker.full_name}} — {{appraisal.period_label}}"),
            T(["Goal", "Rating", "Evidence"], "appraisal.manager_goal_rows"),
            T(["Competency", "Rating", "Evidence"], "appraisal.manager_competency_rows", when=PRESENT("appraisal.manager_competency_rows")),
            form("manager_assessment", [
                {"key": "overall_recommendation", "label": "Overall recommendation", "type": "text", "required": True},
                {"key": "strengths", "label": "Strengths", "type": "textarea"},
                {"key": "development_needs", "label": "Development needs", "type": "textarea"}]),
            P("Base ratings on observed, job-related evidence across the whole period. Consider the impact of absence, adjustments and "
              "workload changes. Do not refer to protected characteristics.", id="rights_fair_assessment"),
            P("This assessment is shared with the employee when the appraisal is finalised.", style="small"),
        ])

starter("HR-PRF-013", output_mode="DOCUMENT", execution_mode="ACKNOWLEDGE", audience="EMPLOYEE", approval_policy="L2",
        required=["worker.full_name", "employment.position_title", "employment.manager_name", "pip.hr_contact", "pip.start_date",
                  "pip.end_date", "pip.objectives"],
        optional=["pip.support", "pip.adjustments_considered", "pip.review_dates"],
        mandatory=["pip_outcomes"],
        blocks=[
            LH, H("Performance Improvement Plan"),
            FG(["worker.full_name", "employment.position_title", "employment.manager_name", "pip.hr_contact", "pip.start_date", "pip.end_date"],
               labels={"worker.full_name": "Employee", "employment.position_title": "Role", "employment.manager_name": "Manager",
                       "pip.hr_contact": "HR contact", "pip.start_date": "Plan start", "pip.end_date": "Plan end"}),
            H("Purpose", 2),
            P("This plan sets out clearly where your performance needs to improve, the support we will give you, and how we will measure "
              "progress. It is not a decision to end your employment.", id="rights_pip_purpose"),
            H("Standards and evidence", 2),
            T(["Objective", "Expected standard", "Current performance (with examples)", "How success will be measured"], "pip.objectives"),
            H("Support and adjustments", 2),
            L(items_from="pip.support", when=PRESENT("pip.support")),
            P("Reasonable adjustments considered: {{pip.adjustments_considered}}", when=PRESENT("pip.adjustments_considered")),
            H("Review meetings", 2, include_when=PRESENT("pip.review_dates")),
            T(["Date", "With"], "pip.review_dates", when=PRESENT("pip.review_dates")),
            H("Possible outcomes", 2), C("pip_outcomes"),
            P("No outcome has been decided. We will consider your progress and your comments at each review."),
            H("Your comments", 2),
            form("employee_comments", [{"key": "employee_comments", "label": "Your comments", "type": "textarea"}]),
            P("You may be accompanied or represented at review meetings where our policy or the law allows.", id="rights_pip_companion"),
            D("I confirm I have received this plan. This does not mean I agree with the concerns described.", id="declaration"),
        ])

starter("HR-PRF-018", output_mode="DOCUMENT", execution_mode="NONE", audience="EMPLOYEE", approval_policy="L1",
        required=["worker.full_name", "training.course", "training.completed_on"],
        optional=["training.version", "training.score", "training.valid_until", "training.provider", "document.verify_url"],
        blocks=[
            H("Training Completion Record"),
            FG(["worker.full_name", "training.course", "training.version", "training.completed_on", "training.score", "training.valid_until",
                "training.provider"],
               labels={"worker.full_name": "Employee", "training.provider": "Delivered by / provider"}),
            P("This record confirms completion of mandatory training required for your role."),
            P("Verify this record at {{document.verify_url}}.", when=PRESENT("document.verify_url"), style="small"),
        ])

starter("HR-PRF-020", output_mode="DOCUMENT", execution_mode="NONE", audience="EMPLOYEE", approval_policy="L1",
        required=["worker.full_name", "cert.name", "cert.issued_on"],
        optional=["cert.issuing_body", "cert.number_masked", "cert.expires_on", "cert.renewal_requirements", "cert.renewal_history"],
        blocks=[
            H("Certification Record — {{cert.name}}"),
            FG(["worker.full_name", "cert.name", "cert.issuing_body", "cert.number_masked", "cert.issued_on", "cert.expires_on",
                "cert.renewal_requirements"],
               labels={"worker.full_name": "Holder", "cert.number_masked": "Certificate number"}),
            T(["Renewed on", "Evidence document"], "cert.renewal_history", when=PRESENT("cert.renewal_history")),
            P("Renew before {{cert.expires_on}} to stay compliant with the requirements of your role.", when=PRESENT("cert.expires_on")),
        ])


# ═══ B. EMPLOYMENT CHANGES ══════════════════════════════════════════════════════════════════════════════════════════

starter("HR-CHG-001", output_mode="FORM_RECORD", execution_mode="NONE", audience="EMPLOYEE", approval_policy="L1",
        required=["worker.full_name"],
        blocks=[
            H("Internal Transfer Request"),
            FG(["worker.full_name"], labels={"worker.full_name": "Employee"}),
            form("transfer_request", [
                {"key": "current_role", "label": "Current role", "type": "text"},
                {"key": "current_department", "label": "Current department", "type": "text"},
                {"key": "requested_department", "label": "Requested department", "type": "text", "required": True},
                {"key": "requested_role", "label": "Requested role (optional)", "type": "text"},
                {"key": "requested_location", "label": "Requested location (same country only)", "type": "text"},
                {"key": "preferred_start", "label": "Preferred start date", "type": "date"},
                {"key": "reason", "label": "Reason", "type": "textarea", "required": True},
                {"key": "manager_informed", "label": "Current manager informed", "type": "checkbox"},
                {"key": "supporting_information", "label": "Supporting information", "type": "textarea"}]),
            P("Requesting a transfer will not affect how you are treated in your current role.", id="rights_transfer"),
            D("The information in this request is accurate.", id="declaration"),
        ])

starter("HR-CHG-002", output_mode="FORM_RECORD", execution_mode="NONE", audience="HR_INTERNAL", approval_policy="L2",
        required=["worker.full_name", "change.from_summary", "change.to_summary", "change.decision_label", "change.decided_by",
                  "change.decided_at"],
        optional=["change.effective_date", "change.hr_approved_by", "change.decision_reason", "change.is_refused"],
        blocks=[
            H("Internal Transfer Decision"),
            FG(["worker.full_name", "change.from_summary", "change.to_summary", "change.effective_date", "change.decision_label",
                "change.decided_by", "change.hr_approved_by", "change.decided_at"],
               labels={"worker.full_name": "Employee", "change.from_summary": "From", "change.to_summary": "To",
                       "change.decision_label": "Decision", "change.decided_by": "Decided by (receiving manager)",
                       "change.hr_approved_by": "HR approval by", "change.decided_at": "Date"}),
            P("Reason: {{change.decision_reason}}", when=EQ("change.is_refused", True)),
            P("Approved transfers are completed in the employee record on the effective date. A transfer letter (HR-CHG-007) is issued to "
              "the employee.", style="small"),
        ])

starter("HR-CHG-004", output_mode="DOCUMENT", execution_mode="ACKNOWLEDGE", audience="EMPLOYEE", approval_policy="L2",
        required=["worker.first_name", "change.previous_title", "change.new_title", "change.effective_date"],
        optional=["change.new_grade", "change.new_manager", "change.department", "change.new_responsibilities", "change.pay_rows",
                  "change.has_pay"],
        mandatory=["change_terms_statement"],
        blocks=[
            LH, H("Congratulations on your promotion"),
            P("Dear {{worker.first_name}}, we are delighted to confirm your promotion from {{change.previous_title}} to "
              "{{change.new_title}} with effect from {{change.effective_date}}."),
            FG(["change.new_title", "change.new_grade", "change.new_manager", "change.department"],
               labels={"change.new_title": "New title", "change.new_grade": "Grade", "change.new_manager": "Reporting to",
                       "change.department": "Department"}),
            H("Your new responsibilities", 2, include_when=PRESENT("change.new_responsibilities")),
            L(items_from="change.new_responsibilities", when=PRESENT("change.new_responsibilities")),
            H("Pay", 2, include_when=EQ("change.has_pay", True)),
            T(["Previous salary", "New salary", "Effective from"], "change.pay_rows", when=EQ("change.has_pay", True)),
            P("Your pay is unchanged.", when=EQ("change.has_pay", False)),
            C("change_terms_statement"),
            P("Thank you for your contribution — we look forward to your continued success."),
            D("I confirm I have received and read this letter.", id="declaration"),
        ])

starter("HR-CHG-006", output_mode="DOCUMENT", execution_mode="ACKNOWLEDGE", audience="EMPLOYEE", approval_policy="L1",
        required=["worker.first_name", "change.previous_title", "change.new_title", "change.effective_date"],
        optional=["change.reason_statement", "change.duties_changed"],
        mandatory=["change_terms_statement"],
        blocks=[
            H("Change to your job title"),
            P("Dear {{worker.first_name}}, your job title will change from {{change.previous_title}} to {{change.new_title}} from "
              "{{change.effective_date}}."),
            P("Reason: {{change.reason_statement}}", when=PRESENT("change.reason_statement")),
            P("Your duties remain substantially the same.", when=EQ("change.duties_changed", False)),
            P("Your updated job description is attached.", when=EQ("change.duties_changed", True)),
            C("change_terms_statement"),
            D("I confirm I have received and read this notice.", id="declaration"),
        ])

starter("HR-CHG-007", output_mode="DOCUMENT", execution_mode="ACKNOWLEDGE", audience="EMPLOYEE", approval_policy="L1",
        required=["worker.first_name", "change.previous_department", "change.new_department", "change.effective_date"],
        optional=["employment.position_title", "change.new_manager", "change.work_location", "change.working_pattern"],
        mandatory=["change_terms_statement"],
        blocks=[
            LH, H("Your transfer to {{change.new_department}}"),
            P("Dear {{worker.first_name}}, we confirm your transfer from {{change.previous_department}} to {{change.new_department}} with "
              "effect from {{change.effective_date}}."),
            FG(["employment.position_title", "change.new_manager", "change.work_location", "change.working_pattern"],
               labels={"employment.position_title": "Role", "change.new_manager": "Reporting to", "change.work_location": "Work location",
                       "change.working_pattern": "Working pattern"}),
            P("Your new manager, {{change.new_manager}}, will arrange a handover and an introduction to the team.",
              when=PRESENT("change.new_manager")),
            C("change_terms_statement"),
            D("I confirm I have received and read this letter.", id="declaration"),
        ])

starter("HR-CHG-008", output_mode="DOCUMENT", execution_mode="NONE", audience="EMPLOYEE", approval_policy="L1",
        required=["worker.first_name", "change.effective_date", "change.new_manager"],
        optional=["change.new_manager_title", "change.previous_manager"],
        blocks=[
            H("Your new manager"),
            P("Dear {{worker.first_name}}, from {{change.effective_date}} you will report to {{change.new_manager}} "
              "({{change.new_manager_title}}) instead of {{change.previous_manager}}."),
            P("Your role, terms and conditions are unchanged. Open leave requests, objectives and reviews will move to your new manager, who "
              "will be in touch to arrange a first meeting."),
        ])

CLAUSES = {
    "starter_text": {
        "change_terms_statement": {
            "title": "Employment changes: other terms unchanged",
            "text": "All other terms and conditions of your employment remain unchanged."},
    },
    "no_starter_text": [
        "probation_extension_rules", "probation_termination_notice", "appeal_rights", "pip_outcomes",
        # optional, no default text
        "post_probation_terms",
    ],
    "_note": "Prompt 4 clauses. `probation_extension_rules` may carry the parameter max_probation_months, set by whoever releases it.",
}


def main():
    for cid, data in STARTERS.items():
        family = cid.rsplit("-", 1)[0]
        path = OUT / family / f"{cid}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    (OUT / "clauses_prompt4.json").write_text(json.dumps(CLAUSES, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {len(STARTERS)} starters and clauses_prompt4.json to {OUT}")


if __name__ == "__main__":
    main()
