"""Authoring source for the Prompt 2 starter seeds (recruitment, workforce planning, onboarding — 28 templates).

    python scripts/doc_templates_author_prompt2.py      # (re)writes app/modules/doc_templates/seeds/content/...

The JSON seed files are what the engine loads; this script only keeps their shared structure in one readable place.
Starters never invent legal entitlements, notice periods, probation limits or statutory amounts: wherever the law decides,
the content uses a jurisdiction clause, and clauses without starter text must be written per jurisdiction before release.
"""
from __future__ import annotations

import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "app" / "modules" / "doc_templates" / "seeds" / "content"


def H(text, level=1, **kw):
    return {"type": "heading", "text": text, "level": level, **kw}


def P(text, id=None, when=None, style=None):
    b = {"type": "paragraph", "text": text}
    if id:
        b["id"] = id
    if when:
        b["include_when"] = when
    if style:
        b["style"] = style
    return b


def L(items=None, items_from=None, style="bullet", id=None, when=None):
    b = {"type": "list", "style": style}
    if items_from:
        b["items_from"] = items_from
    else:
        b["items"] = items
    if id:
        b["id"] = id
    if when:
        b["include_when"] = when
    return b


def FG(fields, labels=None):
    b = {"type": "field_group", "fields": fields}
    if labels:
        b["labels"] = labels
    return b


def T(columns, rows_from, when=None):
    b = {"type": "table", "columns": columns, "rows_from": rows_from}
    if when:
        b["include_when"] = when
    return b


def C(key, required=True):
    return {"type": "clause", "key": key, "required": required}


def D(text, mode="acknowledge", id=None):
    b = {"type": "declaration", "text": text, "mode": mode}
    if id:
        b["id"] = id
    return b


def SIG(*parties):
    return {"type": "signature_block", "parties": list(parties)}


LH = {"type": "letterhead", "id": "letterhead"}
PRESENT = lambda key: {"field": key, "op": "present"}  # noqa: E731
EQ = lambda key, value: {"field": key, "op": "eq", "value": value}  # noqa: E731
IN = lambda key, values: {"field": key, "op": "in", "value": values}  # noqa: E731

APPROVAL_GROUP = FG(["approval.decision", "approval.approver_name", "approval.decided_at", "approval.comment"])
APPROVAL_FIELDS = ["approval.decision", "approval.approver_name", "approval.decided_at"]

STARTERS: dict[str, dict] = {}


def starter(cid, *, output_mode, execution_mode, audience, approval_policy, required, optional=(), mandatory=(), optional_clauses=(),
            prohibited=(), blocks, email_attachment_allowed=False, reminder_days=(), response_days=None, applicability=None):
    STARTERS[cid] = {
        "canonical_id": cid, "output_mode": output_mode, "execution_mode": execution_mode, "audience": audience,
        "approval_policy": approval_policy,
        "field_contract": {"required": list(required), "optional": list(optional)},
        "clause_rules": {"mandatory": list(mandatory), "optional": list(optional_clauses), "prohibited": list(prohibited)},
        "blocks": blocks, "locked_block_ids": [b["id"] for b in blocks if b.get("locked")],
        "email_attachment_allowed": email_attachment_allowed, "reminder_days": list(reminder_days), "response_days": response_days,
        **({"applicability": applicability} if applicability else {}),
    }


# ═══ A. RECRUITMENT ═════════════════════════════════════════════════════════════════════════════════════════════════

starter("HR-HIR-001", output_mode="FORM_RECORD", execution_mode="NONE", audience="HR_INTERNAL", approval_policy="L2",
        required=["requisition.reference", "requisition.title", "requisition.department", "requisition.headcount",
                  "requisition.reason", "requisition.justification"] + APPROVAL_FIELDS,
        optional=["requisition.hiring_manager", "requisition.employment_type_label", "requisition.work_location",
                  "requisition.target_start_date", "requisition.budget_range", "requisition.currency", "requisition.headcount_plan_ref",
                  "requisition.replaces_employee_ref", "approval.comment"],
        blocks=[
            H("Hiring Requisition Authorization — {{requisition.reference}}"),
            FG(["requisition.title", "requisition.department", "requisition.hiring_manager", "requisition.headcount",
                "requisition.employment_type_label", "requisition.work_location", "requisition.reason", "requisition.replaces_employee_ref",
                "requisition.target_start_date", "requisition.headcount_plan_ref"]),
            P("Budget range: {{requisition.budget_range}} {{requisition.currency}}", when=PRESENT("requisition.budget_range")),
            P("Business justification: {{requisition.justification}}"),
            P("Approval confirms that the role is budgeted and may be advertised. It does not approve any individual candidate or offer.",
              style="notice"),
            APPROVAL_GROUP,
        ])

starter("HR-HIR-004", output_mode="DOCUMENT", execution_mode="NONE", audience="CANDIDATE", approval_policy="L1",
        required=["candidate.first_name", "employer.legal_name", "employer.registered_address", "recruitment.privacy_contact_email",
                  "recruitment.retention_months"],
        optional=["recruitment.uses_cv_parsing", "candidate.full_name"],
        mandatory=["privacy_lawful_basis_recruitment"], optional_clauses=["privacy_international_transfers"],
        blocks=[
            LH, H("How we use your personal information when you apply for a job"),
            P("Dear {{candidate.first_name}}, thank you for your interest in working with {{employer.legal_name}}. This notice explains "
              "what personal information we collect during recruitment, why we use it, and your rights.", id="privacy_intro"),
            H("Who is responsible", 2),
            P("{{employer.legal_name}}, {{employer.registered_address}}, is responsible for your information. "
              "Contact: {{recruitment.privacy_contact_email}}.", id="privacy_controller"),
            H("What we collect", 2),
            L(["Identity and contact details.", "Your CV, work history, education and qualifications.",
               "Information you give us in applications, assessments and interviews.", "Interview notes and evaluations.",
               "References and verification results, where you are told about them in advance.",
               "Information needed to make an offer, such as expected pay and availability."], id="privacy_collect"),
            H("Why we use it", 2),
            L(["To assess your suitability for the role.", "To communicate with you.", "To make and manage an offer.",
               "To meet legal obligations.", "To keep a record of our recruitment decisions."], id="privacy_purposes"),
            H("Legal basis", 2), C("privacy_lawful_basis_recruitment"),
            P("We use automated tools to read the text of your CV so that our recruiters can review it more easily. These tools do not "
              "make hiring decisions. A person reviews every application.", id="privacy_cv_parsing",
              when=EQ("recruitment.uses_cv_parsing", True)),
            H("Who we share it with", 2),
            P("Our recruitment team and the hiring managers for the role; service providers who host our HR systems for us under "
              "contract; referees and verification providers only when we have told you; authorities where the law requires it.",
              id="privacy_sharing"),
            C("privacy_international_transfers", required=False),
            H("How long we keep it", 2),
            P("If you are not hired, we keep your information for {{recruitment.retention_months}} months after the recruitment process "
              "ends and then delete or anonymise it, unless you agree to us keeping it longer for future vacancies. If you are hired, it "
              "becomes part of your employee record.", id="privacy_retention"),
            H("Your rights", 2),
            P("Depending on where you live, you may have the right to access, correct or delete your information, to object to or "
              "restrict its use, and to complain to a data protection authority. To use your rights, contact "
              "{{recruitment.privacy_contact_email}}.", id="rights_candidate"),
        ])

starter("HR-HIR-006", output_mode="FORM_RECORD", execution_mode="NONE", audience="HR_INTERNAL", approval_policy="L1",
        required=["candidate.full_name", "requisition.title", "interview.date", "interview.stage", "interview.recommendation"],
        optional=["interview.mode", "interview.panel", "interview.questions_asked", "interview.evidence_notes", "interview.strengths",
                  "interview.concerns", "interview.adjustments_provided", "interview.recommendation_reason"],
        blocks=[
            H("Interview Record — {{requisition.title}} — {{interview.stage}}"),
            FG(["candidate.full_name", "requisition.title", "interview.date", "interview.mode", "interview.panel"]),
            P("Record only job-related evidence. Do not record information about protected characteristics, health, family plans or "
              "other matters unrelated to the requirements of the role.", id="rights_fair_assessment", style="notice"),
            H("Questions asked", 2), L(items_from="interview.questions_asked"),
            FG(["interview.evidence_notes", "interview.strengths", "interview.concerns", "interview.adjustments_provided",
                "interview.recommendation", "interview.recommendation_reason"]),
            D("I confirm this record is accurate and based on the evidence from the interview.", id="declaration"),
        ])

starter("HR-HIR-007", output_mode="CHECKLIST_RECORD", execution_mode="NONE", audience="HR_INTERNAL", approval_policy="L1",
        required=["requisition.title", "scorecard.scores", "scorecard.weighted_total", "scorecard.interviewer"],
        optional=["candidate.full_name", "scorecard.submitted_at"],
        blocks=[
            H("Interview Scorecard — {{requisition.title}}"),
            FG(["candidate.full_name"]),
            P("Score each criterion from 1 (no evidence) to 5 (strong evidence) using only what was demonstrated in the interview. "
              "Evidence is required for every score."),
            T(["Criterion", "Weight", "Score", "Evidence"], "scorecard.scores"),
            FG(["scorecard.weighted_total", "scorecard.interviewer", "scorecard.submitted_at"]),
            {"type": "checklist", "id": "rights_fair_assessment", "items": [
                {"key": "same_criteria", "label": "Same criteria used for all candidates", "mandatory": True},
                {"key": "evidence_only", "label": "Scores based on job-related evidence only", "mandatory": True},
                {"key": "no_protected", "label": "No discussion of protected characteristics recorded", "mandatory": True},
                {"key": "adjustments", "label": "Adjustments offered where requested", "mandatory": True}]},
        ])

OFFER_REQUIRED = ["candidate.first_name", "candidate.full_name", "employer.legal_name", "employment.position_title",
                  "employment.employment_type_label", "employment.start_date", "offer.reference", "offer.pay_amount", "offer.currency",
                  "offer.pay_period_label", "offer.response_deadline", "employer.hr_contact_email"]
OFFER_OPTIONAL = ["candidate.postal_address", "employment.department", "employment.manager_name", "employment.work_location",
                  "employment.work_country_name", "employment.work_pattern", "offer.work_arrangement_label",
                  "offer.remuneration_type_label", "offer.components", "offer.equity", "offer.benefits_summary", "offer.conditions",
                  "employer.hr_contact_name", "document.date", "employer.signatory_name"]


def offer_terms():
    return [
        H("Main terms", 2),
        FG(["employment.position_title", "employment.department", "employment.manager_name", "employment.employment_type_label",
            "employment.start_date", "employment.work_location", "employment.work_country_name", "offer.work_arrangement_label",
            "employment.work_pattern"],
           labels={"employment.manager_name": "Reporting to", "employment.start_date": "Proposed start date",
                   "offer.work_arrangement_label": "Working arrangement", "employment.work_pattern": "Working pattern"}),
        P("Pay: {{offer.pay_amount}} {{offer.currency}} {{offer.pay_period_label}} ({{offer.remuneration_type_label}})."),
        T(["Component", "Amount", "Frequency"], "offer.components", when=PRESENT("offer.components")),
        P("Equity: {{offer.equity}}, subject to the terms of the applicable plan documents.", when=PRESENT("offer.equity")),
        P("Benefits: {{offer.benefits_summary}}", when=PRESENT("offer.benefits_summary")),
    ]


def offer_head(title, opening):
    return [LH, P("{{document.date}} · Private and confidential · Reference {{offer.reference}}"),
            P("{{candidate.full_name}}, {{candidate.postal_address}}"), H(title), P(opening)]


def conditions_section():
    return [H("Conditions of this offer", 2, include_when=PRESENT("offer.conditions")),
            L(items_from="offer.conditions", when=PRESENT("offer.conditions")),
            {**C("offer_conditions_explainer"), "include_when": PRESENT("offer.conditions")}]


def next_steps(accept_text):
    return [H("Next steps", 2),
            P("Please review this offer and accept or decline it using the secure link by {{offer.response_deadline}}. If you have "
              "questions, contact {{employer.hr_contact_name}} at {{employer.hr_contact_email}}."),
            C("offer_statutory_statement"), P("We look forward to welcoming you."),
            SIG("employer", "candidate"), D(accept_text, mode="sign", id="declaration")]


OFFER_META = dict(output_mode="DOCUMENT", execution_mode="SIGN_CANDIDATE", audience="CANDIDATE", approval_policy="L2",
                  reminder_days=[3, 1], response_days=7)

starter("HR-HIR-011", **OFFER_META, required=OFFER_REQUIRED + ["offer.conditions"], optional=OFFER_OPTIONAL,
        mandatory=["offer_statutory_statement", "offer_conditions_explainer"], optional_clauses=["probation_summary"],
        blocks=offer_head("Conditional offer of employment",
                          "Dear {{candidate.first_name}}, we are pleased to offer you the position of {{employment.position_title}} in our "
                          "{{employment.department}} team at {{employer.legal_name}}, subject to the conditions set out below.")
        + offer_terms() + [C("probation_summary", required=False)]
        + [H("Conditions of this offer", 2), L(items_from="offer.conditions"), C("offer_conditions_explainer")]
        + next_steps("I accept this conditional offer of employment on the terms set out above."))

starter("HR-HIR-012", **OFFER_META, required=OFFER_REQUIRED, optional=OFFER_OPTIONAL,
        mandatory=["offer_statutory_statement"], optional_clauses=["probation_summary"],
        blocks=offer_head("Offer of employment",
                          "Dear {{candidate.first_name}}, we are pleased to offer you the position of {{employment.position_title}} in our "
                          "{{employment.department}} team at {{employer.legal_name}}.")
        + offer_terms() + [C("probation_summary", required=False), P("All pre-employment checks for this role have been completed.")]
        + next_steps("I accept this offer of employment on the terms set out above."))

starter("HR-HIR-014", **OFFER_META, required=OFFER_REQUIRED + ["offer.internship_end_date"],
        optional=OFFER_OPTIONAL + ["offer.learning_objectives", "offer.mentor_name", "offer.academic_institution"],
        mandatory=["internship_status_statement", "offer_statutory_statement", "offer_conditions_explainer"],
        blocks=offer_head("Internship offer",
                          "Dear {{candidate.first_name}}, we are pleased to offer you an internship as {{employment.position_title}} from "
                          "{{employment.start_date}} to {{offer.internship_end_date}}.")
        + [FG(["employment.department", "offer.mentor_name", "employment.work_location", "employment.work_pattern"],
              labels={"offer.mentor_name": "Mentor"}),
           P("Stipend / pay: {{offer.pay_amount}} {{offer.currency}} {{offer.pay_period_label}}."),
           H("What you will learn", 2, include_when=PRESENT("offer.learning_objectives")),
           L(items_from="offer.learning_objectives", when=PRESENT("offer.learning_objectives")),
           P("This internship is arranged with {{offer.academic_institution}}.", when=PRESENT("offer.academic_institution")),
           C("internship_status_statement")]
        + conditions_section() + next_steps("I accept this internship offer on the terms set out above."))

starter("HR-HIR-015", **OFFER_META, required=OFFER_REQUIRED + ["offer.contract_end_date", "offer.fixed_term_reason"],
        optional=OFFER_OPTIONAL, mandatory=["fixed_term_statement", "offer_statutory_statement", "offer_conditions_explainer"],
        blocks=offer_head("Fixed-term offer of employment",
                          "Dear {{candidate.first_name}}, we are pleased to offer you the position of {{employment.position_title}} at "
                          "{{employer.legal_name}} for a fixed term from {{employment.start_date}} to {{offer.contract_end_date}}.")
        + offer_terms() + [P("Reason for the fixed term: {{offer.fixed_term_reason}}"), C("fixed_term_statement")]
        + conditions_section() + next_steps("I accept this fixed-term offer of employment on the terms set out above."))

starter("HR-HIR-016", **OFFER_META, required=OFFER_REQUIRED + ["offer.hours_per_week"], optional=OFFER_OPTIONAL,
        mandatory=["part_time_equal_treatment", "offer_statutory_statement", "offer_conditions_explainer"],
        blocks=offer_head("Part-time offer of employment",
                          "Dear {{candidate.first_name}}, we are pleased to offer you the part-time position of "
                          "{{employment.position_title}} at {{employer.legal_name}}.")
        + offer_terms() + [P("Contracted hours: {{offer.hours_per_week}} hours per week."), C("part_time_equal_treatment")]
        + conditions_section() + next_steps("I accept this part-time offer of employment on the terms set out above."))

starter("HR-HIR-017", output_mode="DOCUMENT", execution_mode="SIGN_CANDIDATE", audience="CANDIDATE", approval_policy="L2",
        reminder_days=[3, 1], response_days=7,
        required=["candidate.first_name", "offer.previous_reference", "offer.previous_date", "offer.changes", "offer.response_deadline"],
        optional=["candidate.full_name", "document.date", "employer.legal_name"],
        blocks=[LH, H("Amendment to your offer of employment"),
                P("Dear {{candidate.first_name}}, further to our offer dated {{offer.previous_date}} (reference "
                  "{{offer.previous_reference}}), we have made the following changes:"),
                T(["Term", "Previous", "Revised"], "offer.changes"),
                P("All other terms of the original offer remain unchanged."),
                P("Please confirm whether you accept the revised offer by {{offer.response_deadline}}."),
                SIG("employer", "candidate"), D("I accept the offer as amended.", mode="sign", id="declaration")])

starter("HR-HIR-018", output_mode="DOCUMENT", execution_mode="NONE", audience="CANDIDATE", approval_policy="L2",
        required=["candidate.first_name", "employment.position_title", "offer.issue_date", "offer.reference",
                  "offer.withdrawal_reason_category", "offer.withdrawal_reason_statement", "employer.hr_contact_email"],
        optional=["offer.condition_not_met", "document.date", "employer.legal_name"],
        mandatory=["offer_withdrawal_rights"],
        blocks=[LH, H("Withdrawal of offer of employment"),
                P("Dear {{candidate.first_name}}, we are writing about our offer of employment for the position of "
                  "{{employment.position_title}} dated {{offer.issue_date}} (reference {{offer.reference}})."),
                P("Our offer was conditional on {{offer.condition_not_met}}. We have not been able to confirm that this condition has been "
                  "met. {{offer.withdrawal_reason_statement}}", when=EQ("offer.withdrawal_reason_category", "condition_not_met")),
                P("The role has been cancelled and we are therefore withdrawing our offer. {{offer.withdrawal_reason_statement}}",
                  when=EQ("offer.withdrawal_reason_category", "role_cancelled")),
                P("{{offer.withdrawal_reason_statement}}",
                  when={"field": "offer.withdrawal_reason_category", "op": "not_in", "value": ["condition_not_met", "role_cancelled"]}),
                P("We are sorry to give you this news. If you believe we have made a mistake, please contact "
                  "{{employer.hr_contact_email}} within 10 days.", id="rights_withdrawal_contact"),
                C("offer_withdrawal_rights"), SIG("employer")])

starter("HR-HIR-019", output_mode="DOCUMENT", execution_mode="NONE", audience="CANDIDATE", approval_policy="L1",
        email_attachment_allowed=True,
        required=["candidate.first_name", "employment.position_title", "offer.accepted_at", "employment.start_date",
                  "employer.hr_contact_email"],
        optional=["employment.manager_name", "offer.conditions", "employer.legal_name"],
        blocks=[LH, H("Thank you for accepting our offer"),
                P("Dear {{candidate.first_name}}, we confirm that we received your acceptance of our offer for the position of "
                  "{{employment.position_title}} on {{offer.accepted_at}}. A signed copy is available to you through the secure link "
                  "you used to sign."),
                H("What happens next", 2),
                L(["You will receive an invitation to our onboarding portal to complete your new starter details."]),
                P("Your manager, {{employment.manager_name}}, will be in touch before your start date.",
                  when=PRESENT("employment.manager_name")),
                P("We will contact you about the remaining pre-employment checks.", when=PRESENT("offer.conditions")),
                P("Your start date is {{employment.start_date}}. If anything changes, contact {{employer.hr_contact_email}}.")])

starter("HR-HIR-020", output_mode="DOCUMENT", execution_mode="NONE", audience="CANDIDATE", approval_policy="L1",
        required=["candidate.first_name", "employment.position_title", "employer.legal_name", "candidate.stage_reached"],
        optional=["recruitment.talent_pool_opt_in_url", "candidate.personal_note"],
        blocks=[H("Your application for {{employment.position_title}}"),
                P("Dear {{candidate.first_name}}, thank you for your interest in {{employer.legal_name}} and for the time you spent on "
                  "your application."),
                P("After careful review, we have decided not to progress your application on this occasion.",
                  when=IN("candidate.stage_reached", ["application", "screening"])),
                P("Thank you for meeting with us. After careful consideration, we have decided to offer the role to another candidate.",
                  when=IN("candidate.stage_reached", ["interview", "final"])),
                P("{{candidate.personal_note}}", when=PRESENT("candidate.personal_note")),
                P("If you would like us to keep your details for future vacancies, you can tell us here: "
                  "{{recruitment.talent_pool_opt_in_url}}. Otherwise we will delete your information as explained in our candidate "
                  "privacy notice.", id="privacy_talent_pool", when=PRESENT("recruitment.talent_pool_opt_in_url")),
                P("We wish you every success in your search.")])

# ═══ B. WORKFORCE PLANNING ══════════════════════════════════════════════════════════════════════════════════════════

starter("HR-ORG-003", output_mode="FORM_RECORD", execution_mode="NONE", audience="HR_INTERNAL", approval_policy="L2",
        required=["headcount.department", "headcount.period", "headcount.current", "headcount.requested", "headcount.rationale"]
        + APPROVAL_FIELDS,
        optional=["headcount.plan_name", "headcount.change", "headcount.cost_estimate", "approval.comment"],
        blocks=[H("Headcount Authorization — {{headcount.department}} — {{headcount.period}}"),
                FG(["headcount.plan_name", "headcount.department", "headcount.current", "headcount.requested", "headcount.change",
                    "headcount.cost_estimate"]),
                P("Rationale: {{headcount.rationale}}"),
                P("Approval authorises recruitment up to the approved headcount within the budget stated. Each hire still requires a "
                  "hiring requisition.", style="notice"),
                APPROVAL_GROUP])

starter("HR-ORG-004", output_mode="FORM_RECORD", execution_mode="NONE", audience="HR_INTERNAL", approval_policy="L2",
        required=["position.title", "position.department", "position.reason"] + APPROVAL_FIELDS,
        optional=["position.grade", "position.reports_to", "position.employment_type_label", "position.location", "position.salary_range",
                  "position.job_description_ref", "approval.comment"],
        blocks=[H("Position Creation Request — {{position.title}}"),
                FG(["position.title", "position.department", "position.grade", "position.reports_to", "position.employment_type_label",
                    "position.location", "position.salary_range", "position.job_description_ref"]),
                P("Reason for the new position: {{position.reason}}"),
                P("The job description reference {{position.job_description_ref}} is attached and must be approved before the position "
                  "is advertised.", when=PRESENT("position.job_description_ref")),
                APPROVAL_GROUP])

starter("HR-ORG-005", output_mode="DOCUMENT", execution_mode="NONE", audience="HR_INTERNAL", approval_policy="L1",
        required=["jd.title", "jd.purpose", "jd.responsibilities", "jd.essential", "jd.version", "jd.approved_on"],
        optional=["jd.department", "jd.grade", "jd.reports_to", "jd.location", "jd.work_arrangement_label", "jd.desirable"],
        blocks=[LH, H("Job Description — {{jd.title}}"),
                FG(["jd.department", "jd.grade", "jd.reports_to", "jd.location", "jd.work_arrangement_label"]),
                H("Purpose of the role", 2), P("{{jd.purpose}}"),
                H("Key responsibilities", 2), L(items_from="jd.responsibilities"),
                H("Essential requirements", 2), L(items_from="jd.essential"),
                H("Desirable requirements", 2, include_when=PRESENT("jd.desirable")), L(items_from="jd.desirable", when=PRESENT("jd.desirable")),
                P("We welcome applications from everyone. If you need any adjustments during the application process, please tell us.",
                  id="rights_inclusive_hiring"),
                P("This job description reflects the main duties of the role at the date shown and may be reviewed as the role develops. "
                  "Version {{jd.version}}, approved {{jd.approved_on}}.", style="small")])

starter("HR-ORG-015", output_mode="FORM_RECORD", execution_mode="NONE", audience="HR_INTERNAL", approval_policy="L2",
        required=["succession.critical_role", "succession.incumbent_ref", "succession.risk_of_vacancy", "succession.candidates"],
        optional=["succession.owner", "succession.review_date"],
        blocks=[H("Succession Plan — {{succession.critical_role}}"),
                FG(["succession.critical_role", "succession.incumbent_ref", "succession.risk_of_vacancy", "succession.owner",
                    "succession.review_date"]),
                T(["Potential successor", "Readiness", "Development actions"], "succession.candidates"),
                P("This plan is a confidential planning tool. Being named, or not named, is not a promise or a decision about promotion, "
                  "pay or employment. Assessments must be based on job-related evidence.", id="rights_succession", style="notice")])

# ═══ C. ONBOARDING ══════════════════════════════════════════════════════════════════════════════════════════════════

# The new starter fills these forms in the onboarding portal and confirms the declaration there (the confirmation, its version,
# time, IP and device are stored on the submission). The document generated when HR verifies the submission is the HR record
# of what was submitted and verified, so it is HR-internal and is not acknowledged a second time.
FORM_META = dict(output_mode="FORM_RECORD", execution_mode="NONE", audience="HR_INTERNAL", approval_policy="L1")

starter("HR-ONB-001", **FORM_META, required=["worker.full_name"], optional=["employment.start_date"],
        blocks=[H("New Starter Information"),
                P("Please check and complete your details. We use this information to set up your employment record. Fields marked * "
                  "are required."),
                {"type": "form_fields", "id": "starter_fields", "fields": [
                    {"key": "legal_first_name", "label": "Legal first name", "type": "text", "required": True, "classification": "PERSONAL_BASIC"},
                    {"key": "legal_last_name", "label": "Legal last name", "type": "text", "required": True, "classification": "PERSONAL_BASIC"},
                    {"key": "preferred_name", "label": "Preferred name", "type": "text", "classification": "PERSONAL_BASIC"},
                    {"key": "date_of_birth", "label": "Date of birth", "type": "date", "required": True, "classification": "PERSONAL_CONFIDENTIAL"},
                    {"key": "personal_email", "label": "Personal email", "type": "text", "required": True, "classification": "PERSONAL_CONFIDENTIAL"},
                    {"key": "mobile_phone", "label": "Mobile phone", "type": "text", "required": True, "classification": "PERSONAL_BASIC"},
                    {"key": "address_line1", "label": "Home address line 1", "type": "text", "required": True, "classification": "PERSONAL_CONFIDENTIAL"},
                    {"key": "address_line2", "label": "Home address line 2", "type": "text", "classification": "PERSONAL_CONFIDENTIAL"},
                    {"key": "city", "label": "City", "type": "text", "required": True, "classification": "PERSONAL_CONFIDENTIAL"},
                    {"key": "region", "label": "Region / state", "type": "text", "classification": "PERSONAL_CONFIDENTIAL"},
                    {"key": "postal_code", "label": "Postal code", "type": "text", "required": True, "classification": "PERSONAL_CONFIDENTIAL"},
                    {"key": "country", "label": "Country", "type": "text", "required": True, "classification": "PERSONAL_CONFIDENTIAL"},
                    {"key": "nationality", "label": "Nationality (only where the law requires it)", "type": "text", "classification": "PERSONAL_CONFIDENTIAL"},
                    {"key": "national_identifier", "label": "National / tax identifier (only where required)", "type": "text", "classification": "FINANCIAL"},
                    {"key": "preferred_language", "label": "Preferred language for communications", "type": "text", "classification": "PERSONAL_BASIC"}]},
                P("We collect only the information needed to employ you and meet our legal obligations. Read our employee privacy notice "
                  "for details of how we use it and your rights.", id="privacy_onboarding", style="notice"),
                D("I confirm that the information I have provided is accurate. I will tell HR if it changes.", id="declaration")])

starter("HR-ONB-003", **FORM_META, required=["worker.full_name"],
        blocks=[H("Emergency Contacts"),
                P("Please give details of at least one person we can contact in an emergency. Make sure they agree to you sharing their "
                  "details with us."),
                {"type": "form_fields", "id": "contact_fields", "fields": [
                    f for n in (1, 2, 3) for f in (
                        {"key": f"contact{n}_name", "label": f"Contact {n}: full name", "type": "text", "required": n == 1, "classification": "PERSONAL_CONFIDENTIAL"},
                        {"key": f"contact{n}_relationship", "label": f"Contact {n}: relationship", "type": "text", "required": n == 1, "classification": "PERSONAL_CONFIDENTIAL"},
                        {"key": f"contact{n}_phone", "label": f"Contact {n}: phone", "type": "text", "required": n == 1, "classification": "PERSONAL_CONFIDENTIAL"},
                        {"key": f"contact{n}_alt_phone", "label": f"Contact {n}: alternative phone", "type": "text", "classification": "PERSONAL_CONFIDENTIAL"},
                        {"key": f"contact{n}_email", "label": f"Contact {n}: email", "type": "text", "classification": "PERSONAL_CONFIDENTIAL"},
                        {"key": f"contact{n}_address", "label": f"Contact {n}: address", "type": "text", "classification": "PERSONAL_CONFIDENTIAL"})]},
                D("I confirm that the people listed have agreed to be my emergency contacts and that I will keep these details up to date.",
                  id="declaration")])

starter("HR-ONB-004", output_mode="CHECKLIST_RECORD", execution_mode="NONE", audience="HR_INTERNAL", approval_policy="L1",
        required=["worker.full_name", "employment.start_date", "employer.legal_name"],
        optional=["employment.department", "employment.manager_name", "onboarding.owner", "onboarding.checklist_items",
                  "onboarding.exceptions", "employment.work_country_name"],
        blocks=[H("Onboarding Checklist — {{worker.full_name}}"),
                FG(["employment.start_date", "employer.legal_name", "employment.department", "employment.manager_name", "onboarding.owner"],
                   labels={"onboarding.owner": "HR owner"}),
                H("Legal onboarding", 2),
                {"type": "checklist", "id": "legal_items", "items": [
                    {"key": "legal_terms", "label": "Signed offer/contract or written statement of terms where required", "owner_role": "hr_admin", "mandatory": True},
                    {"key": "legal_right_to_work", "label": "Right-to-work or eligibility check where required by the jurisdiction pack", "owner_role": "hr_admin", "mandatory": True},
                    {"key": "legal_tax_handoff", "label": "Statutory starter information and tax / social security hand-off", "owner_role": "hr_admin", "mandatory": True},
                    {"key": "legal_notices", "label": "Required local notices delivered", "owner_role": "hr_admin", "mandatory": True}]},
                H("People, policy and access", 2),
                {"type": "checklist", "id": "people_items", "items": [
                    {"key": "onb001", "label": "New starter information verified (HR-ONB-001)", "owner_role": "hr_admin", "mandatory": True},
                    {"key": "onb003", "label": "Emergency contacts recorded (HR-ONB-003)", "owner_role": "employee", "mandatory": True},
                    {"key": "onb011", "label": "Employee handbook acknowledged (HR-ONB-011)", "owner_role": "employee", "mandatory": True},
                    {"key": "onb010", "label": "Code of conduct acknowledged (HR-ONB-010)", "owner_role": "employee", "mandatory": True},
                    {"key": "onb005", "label": "Manager induction scheduled (HR-ONB-005)", "owner_role": "manager", "mandatory": True},
                    {"key": "hs_induction", "label": "Health and safety induction completed", "owner_role": "manager", "mandatory": True},
                    {"key": "it_accounts", "label": "IT accounts created", "owner_role": "hr_admin", "mandatory": False},
                    {"key": "onb015", "label": "Equipment issued (HR-ONB-015)", "owner_role": "hr_admin", "mandatory": False},
                    {"key": "onb017", "label": "Payroll / bank details submitted (HR-ONB-017)", "owner_role": "employee", "mandatory": True},
                    {"key": "onb020", "label": "Probation schedule set (HR-ONB-020)", "owner_role": "manager", "mandatory": False},
                    {"key": "benefits", "label": "Benefits enrolment started where applicable", "owner_role": "hr_admin", "mandatory": False}]},
                H("Organization checklist", 2, include_when=PRESENT("onboarding.checklist_items")),
                T(["Item", "Owner", "Status", "Completed on"], "onboarding.checklist_items", when=PRESENT("onboarding.checklist_items")),
                P("Exceptions: for every mandatory item not completed, record the reason, the owner, the due date and what is blocked "
                  "until it is complete."),
                T(["Item", "Reason", "Owner", "Due date", "Blocked until complete"], "onboarding.exceptions",
                  when=PRESENT("onboarding.exceptions")),
                D("I confirm the onboarding checklist is complete or that all exceptions are recorded with an owner and due date.",
                  id="declaration")])

starter("HR-ONB-005", output_mode="CHECKLIST_RECORD", execution_mode="NONE", audience="MANAGER", approval_policy="L1",
        required=["worker.full_name"], optional=["employment.start_date"],
        blocks=[H("Manager Onboarding Checklist — {{worker.full_name}}"),
                H("Before day 1", 2),
                {"type": "checklist", "id": "before", "items": [
                    {"key": "workspace", "label": "Confirm workspace or remote set-up", "owner_role": "manager", "due_offset_days": -5, "mandatory": True},
                    {"key": "equipment", "label": "Request equipment and system access", "owner_role": "manager", "due_offset_days": -5, "mandatory": True},
                    {"key": "first_week", "label": "Plan the first-week schedule", "owner_role": "manager", "due_offset_days": -2, "mandatory": True},
                    {"key": "buddy", "label": "Assign a buddy", "owner_role": "manager", "due_offset_days": -2, "mandatory": False}]},
                H("Day 1", 2),
                {"type": "checklist", "id": "day1", "items": [
                    {"key": "welcome", "label": "Welcome and team introductions", "owner_role": "manager", "due_offset_days": 0, "mandatory": True},
                    {"key": "expectations", "label": "Explain the role and expectations", "owner_role": "manager", "due_offset_days": 0, "mandatory": True},
                    {"key": "safety", "label": "Walk through health and safety arrangements for the workplace", "owner_role": "manager", "due_offset_days": 0, "mandatory": True}]},
                H("Week 1", 2),
                {"type": "checklist", "id": "week1", "items": [
                    {"key": "objectives", "label": "Agree initial objectives", "owner_role": "manager", "due_offset_days": 5, "mandatory": True},
                    {"key": "one_to_ones", "label": "Schedule regular one-to-ones", "owner_role": "manager", "due_offset_days": 5, "mandatory": True},
                    {"key": "access_check", "label": "Check access and equipment work", "owner_role": "manager", "due_offset_days": 5, "mandatory": True}]},
                H("Month 1", 2),
                {"type": "checklist", "id": "month1", "items": [
                    {"key": "progress", "label": "Review progress", "owner_role": "manager", "due_offset_days": 30, "mandatory": True},
                    {"key": "probation", "label": "Confirm probation objectives and review dates (HR-ONB-020)", "owner_role": "manager", "due_offset_days": 30, "mandatory": True}]},
                P("Ask your new team member if they need any adjustments to do their job well and tell HR about any agreed adjustments.",
                  id="rights_adjustments")])

starter("HR-ONB-007", output_mode="DOCUMENT", execution_mode="ACKNOWLEDGE", audience="EMPLOYEE", approval_policy="L1",
        required=["worker.first_name", "employer.legal_name", "employment.start_date", "worker.employee_code", "employment.position_title"],
        optional=["employment.department", "employment.manager_name", "employment.work_location", "employment.employment_type_label",
                  "employment.continuous_service_date", "employment.probation_end_date"],
        blocks=[LH, H("Confirmation of your employment start"),
                P("Dear {{worker.first_name}}, we are pleased to confirm that your employment with {{employer.legal_name}} started on "
                  "{{employment.start_date}}."),
                FG(["worker.employee_code", "employment.position_title", "employment.department", "employment.manager_name",
                    "employment.work_location", "employment.employment_type_label", "employment.continuous_service_date"],
                   labels={"worker.employee_code": "Employee number"}),
                P("Your probation period is expected to end on {{employment.probation_end_date}}. We will review your progress with you "
                  "during this period.", when=PRESENT("employment.probation_end_date")),
                P("If any of these details are wrong, please tell HR within 14 days."),
                D("I confirm I have received and read this document.", id="declaration")])


def policy_ack(cid, title, text):
    starter(cid, output_mode="DOCUMENT", execution_mode="ACKNOWLEDGE", audience="EMPLOYEE", approval_policy="L1",
            required=["worker.full_name", "policy.version"], optional=["policy.effective_from", "policy.document_ref"],
            blocks=[H(f"{title} — Acknowledgement"),
                    P(f"Please read the {title} (version {{{{policy.version}}}}, effective {{{{policy.effective_from}}}}) before confirming."),
                    P(f"The {title} is document {{{{policy.document_ref}}}} in your documents.", when=PRESENT("policy.document_ref")),
                    D(text, id="declaration")])


policy_ack("HR-ONB-010", "Code of Conduct",
           "I confirm that I have received and read the Code of Conduct. I understand that I can ask HR or my manager if anything is "
           "unclear. This acknowledgement confirms receipt; it does not take away any of my legal rights.")
policy_ack("HR-ONB-011", "Employee Handbook",
           "I confirm that I have received the Employee Handbook. I understand that the handbook explains our policies and procedures "
           "and, unless my contract says otherwise, it does not form part of my contract of employment. This acknowledgement does not "
           "take away any of my legal rights.")

starter("HR-ONB-015", output_mode="FORM_RECORD", execution_mode="SIGN_EMPLOYEE", audience="EMPLOYEE", approval_policy="L1",
        required=["worker.full_name", "asset.items"], optional=["asset.issued_by"],
        blocks=[H("Equipment Issued to {{worker.full_name}}"),
                T(["Item", "Asset tag", "Serial", "Condition", "Issued on"], "asset.items"),
                FG(["asset.issued_by"]),
                P("Please look after this equipment and use it in line with our Company Property and Acceptable Use policies. Report loss, "
                  "theft or damage to IT immediately. You will be asked to return all items when you leave or when they are replaced."),
                P("This form does not authorise any deduction from your pay.", id="rights_deductions", style="notice"),
                SIG("employee"),
                D("I confirm I have received the items listed in the condition described.", mode="sign", id="declaration")])

starter("HR-ONB-017", **FORM_META, required=["worker.full_name"],
        blocks=[H("Bank and Payroll Details"),
                P("We need these details to pay you. They are stored securely and shared only with our payroll provider."),
                {"type": "form_fields", "id": "bank_fields", "fields": [
                    {"key": "account_holder", "label": "Account holder name", "type": "text", "required": True, "classification": "FINANCIAL"},
                    {"key": "bank_name", "label": "Bank name", "type": "text", "required": True, "classification": "FINANCIAL"},
                    {"key": "account_number", "label": "Account number / IBAN", "type": "text", "required": True, "classification": "FINANCIAL"},
                    {"key": "routing_code", "label": "Bank routing code (sort code, IFSC, BSB, routing number or SWIFT)", "type": "text", "required": True, "classification": "FINANCIAL"},
                    {"key": "tax_identifier", "label": "Tax identifier (only where required)", "type": "text", "classification": "FINANCIAL"},
                    {"key": "social_security_number", "label": "Pension / social security number (only where required)", "type": "text", "classification": "FINANCIAL"}]},
                P("Never send bank details by email or chat. We will never ask you for your passwords or one-time codes.", id="privacy_bank",
                  style="notice"),
                D("I confirm these details are correct and that the account is in my name.", id="declaration")])

starter("HR-ONB-020", output_mode="DOCUMENT", execution_mode="ACKNOWLEDGE", audience="EMPLOYEE", approval_policy="L1",
        required=["worker.first_name", "probation.start_date", "probation.end_date"],
        optional=["probation.review_dates", "probation.objectives_summary", "probation.reviewer"],
        mandatory=["probation_policy_reference"],
        blocks=[LH, H("Your probation period"),
                P("Dear {{worker.first_name}}, your probation period runs from {{probation.start_date}} to {{probation.end_date}}."),
                H("Review meetings", 2, include_when=PRESENT("probation.review_dates")),
                T(["Review", "Date", "With"], "probation.review_dates", when=PRESENT("probation.review_dates")),
                P("Your initial objectives: {{probation.objectives_summary}}", when=PRESENT("probation.objectives_summary")),
                P("At each review your manager will discuss your progress, any support or training you need, and any concerns, so that "
                  "nothing at the end of your probation comes as a surprise.", id="rights_probation_support"),
                C("probation_policy_reference"),
                D("I confirm I have received and read this document.", id="declaration")])

starter("HR-ONB-022", output_mode="DOCUMENT", execution_mode="NONE", audience="HR_INTERNAL", approval_policy="L1",
        required=["worker.full_name", "employment.start_date", "onboarding.completed_on", "onboarding.closed_by_name"],
        optional=["onboarding.owner", "employment.manager_name", "onboarding.checklist_items", "onboarding.exceptions"],
        blocks=[H("Onboarding Completion Record — {{worker.full_name}}"),
                FG(["employment.start_date", "onboarding.completed_on", "onboarding.owner", "employment.manager_name"],
                   labels={"onboarding.owner": "HR owner"}),
                T(["Item", "Owner", "Status", "Completed on"], "onboarding.checklist_items", when=PRESENT("onboarding.checklist_items")),
                T(["Item", "Reason", "Owner", "Due date", "Blocked until complete"], "onboarding.exceptions",
                  when=PRESENT("onboarding.exceptions")),
                P("This record confirms that onboarding has been completed or that all outstanding items are recorded as exceptions with an "
                  "owner and due date."),
                FG(["onboarding.closed_by_name", "onboarding.completed_on"],
                   labels={"onboarding.closed_by_name": "Closed by (HR approver)", "onboarding.completed_on": "Closed on"}),
                SIG("employer")])

CLAUSES = {
    "starter_text": {
        "offer_statutory_statement": {
            "title": "Offer letter: written terms still to follow",
            "text": "This letter sets out the main terms of our offer. Your full terms and conditions will be confirmed in your "
                    "employment contract or written statement of employment terms, which you will receive as required by law."},
        "offer_conditions_explainer": {
            "title": "Offer letter: how conditions work",
            "text": "Each condition must be satisfied before your employment starts. We will tell you if a condition is not met and "
                    "give you a chance to respond before making any final decision, unless the law requires otherwise."},
        "part_time_equal_treatment": {
            "title": "Part-time: pro-rata treatment",
            "text": "As a part-time employee, your pay and benefits will be provided on a pro-rata basis compared with comparable "
                    "full-time employees, unless your contract states otherwise in line with the law."},
        "probation_policy_reference": {
            "title": "Probation: policy reference",
            "text": "Your probation period is managed in line with our Probation Policy and your contract of employment. The policy "
                    "explains how reviews work and what support is available."},
    },
    "no_starter_text": [
        "privacy_lawful_basis_recruitment", "privacy_international_transfers", "probation_summary", "internship_status_statement",
        "fixed_term_statement", "offer_withdrawal_rights",
    ],
    "_note": "Clauses in no_starter_text must be written for each jurisdiction (tenant or platform) and released before the "
             "templates that require them can be generated. Starters never invent entitlements, notice, probation or statutory terms.",
}


def main():
    for cid, data in STARTERS.items():
        family = cid.rsplit("-", 1)[0]
        path = OUT / family / f"{cid}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    (OUT / "clauses.json").write_text(json.dumps(CLAUSES, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {len(STARTERS)} starters and clauses.json to {OUT}")


if __name__ == "__main__":
    main()
