"""Onboarding package v2: the 10 documents rebuilt to the reference structure (offer letter, job description, daily KPIs,
NDA, employment contract, affidavit, self-disclosure declaration, job application, daily work report, velocity report).

Every company detail comes from the organisation's Company Profile, every term of the engagement from its Engagement
Profile, every duty and KPI from the hire's Role Profile, and every personal detail from the hire. Nothing organisation-
specific is written here: legal wording stays in {{clause:…}} hooks that each organisation (or its seed) fills, and the
connecting text is neutral. Weekdays, money, addresses and notice periods are formatted by doc_formatting only.
"""
from __future__ import annotations

from app.modules.hr.onboarding_package_content import (BUL, CENTER, CHECKS, CLAUSE, EX, FIELDS_, H1, H2, H3, HOOK, KV, NOTE,
                                                        NOTICE, NUM, P, PB, SIG, TABLE, TEXTBOX, TOC, blank_rows)


# ── v2 block constructors (expanded by onboarding_package_render.expand) ───────────────────────────────────────────────
def LIST(src, numbered=False):
    """A list-valued field printed as bullets (or numbered)."""
    return {"t": "list", "src": src, "numbered": numbered}


def GROUPS(src):
    """[{heading, bullets}] printed as numbered headings with bullets."""
    return {"t": "groups", "src": src}


def KPIS(src):
    """[{title, bullets, success}] printed as numbered sections with a "Success looks like" callout."""
    return {"t": "kpis", "src": src}


def WHEN(key, blocks):
    """Blocks printed only when the value `key` is set (the template set shows them all)."""
    return {"t": "when", "key": key, "blocks": list(blocks)}


def LETTERHEAD2():
    return {"t": "letterhead", "name": "{{company.legal_name}}", "address": "{{company.address_block}}"}


PARTY = "{{engagement.party_term}}"
COMPANY = "{{company.legal_name}}"


# ── 1. Offer Letter ───────────────────────────────────────────────────────────────────────────────────────────────────
def offer_letter():
    return [
        LETTERHEAD2(),
        P("{{document.issue_date}}"),
        P("**{{worker.full_name_caps}}**<br/>{{worker.address_block}}"),
        CENTER("CONGRATULATIONS"),
        P("**Subject: Offer of Engagement – {{role.title}}**"),
        P("Dear {{worker.full_name}},"),
        P("We are pleased to offer you the role of **{{role.title}}** with " + COMPANY + ". This letter sets out the main terms "
          "of your engagement; the full terms are in the enclosed agreements."),
        WHEN("engagement.programme_name", [
            P("The role is part of the **{{engagement.programme_name}}**, and you will join as a " + PARTY + "."),
        ]),
        WHEN("offer.candidate_fit_summary", [P("{{offer.candidate_fit_summary}}")]),
        H2("Engagement Details"),
        KV([
            ("Role", "{{role.title}}"),
            ("Company", COMPANY),
            ("Start date", "{{employment.start_date_long}}"),
            ("Engagement type", "{{employment.employment_type}}"),
            ("{{engagement.assessment_label}}", "{{engagement.assessment_months}} months"),
            ("Work arrangement", "{{employment.work_arrangement}}"),
            ("Work schedule", "{{engagement.work_schedule}}"),
            ("{{engagement.remuneration_label}}", "{{employment.pay_statement}}"),
            ("Reports to", "{{employment.reports_to}}"),
        ]),
        WHEN("engagement.saturday_rule", [P("Work may also be required on {{engagement.saturday_rule}}.")]),
        WHEN("engagement.conversion_text", [
            H2("Programme Structure and Conversion Pathway"),
            P("{{engagement.conversion_text}}"),
        ]),
        H2("Role Responsibilities"),
        LIST("{{role.offer_responsibilities}}"),
        H2("Work Standards, Tools and Accountability"),
        P("Working time is recorded in {{company.time_tracking_tool}}, and work is planned and tracked in "
          "{{company.task_system}}. A Daily Work Report is submitted each working day."),
        WHEN("engagement.workspace_requirements", [LIST("{{engagement.workspace_requirements}}")]),
        H2("Compensation, Leave and Notice Period"),
        BUL([
            "**{{engagement.remuneration_label}}:** {{employment.pay_statement}}.",
            "**Notice:** either party may end the engagement by giving {{employment.notice_text}}.",
        ]),
        WHEN("engagement.leave_rule", [P("**Leave:** {{engagement.leave_rule}}")]),
        H2("Acceptance and Confirmation"),
        P("Your start date is **{{employment.start_date_long}}**. Please sign this letter through your secure onboarding link "
          "({{offer.secure_link}}) by **{{offer.response_deadline}}**, and send the following documents to "
          "{{company.onboarding_return_email}} so that they can be verified before your start date:"),
        LIST("{{offer.compliance_documents}}", numbered=True),
        P("If you have any questions, please contact {{employer.hr_contact}}."),
        P("Yours sincerely,"),
        P("{{company.sign_off}}<br/>" + COMPANY),
        SIG([("For " + COMPANY, "{{employer.signatory_name}}", "{{employer.signatory_title}}", "{{document.issue_date}}")]),
        H2("Acknowledgement and Acceptance"),
        SIG([(PARTY, "{{worker.full_name}}", "{{role.title}}", "")],
            statement="I, {{worker.full_name_caps}}, accept the terms of engagement set out in this letter."),
    ]


# ── 2. Job Description ────────────────────────────────────────────────────────────────────────────────────────────────
def job_description():
    return [
        H1("Job Description"),
        KV([
            ("Job title", "{{role.title}}"),
            ("Programme", "{{engagement.programme_name}}"),
            ("Employment type", "{{employment.employment_type}}"),
            ("Work mode", "{{employment.work_arrangement}}"),
            ("Start date", "{{employment.start_date_long}}"),
            ("Reports to", "{{employment.reports_to}}"),
            (PARTY, "{{worker.full_name}}"),
        ]),
        H2("About the Role"),
        LIST("{{role.about}}"),
        H2("Key Responsibilities"),
        GROUPS("{{role.responsibility_groups}}"),
        H2("Required Skills"),
        LIST("{{role.required_skills}}"),
        WHEN("role.work_setup", [H2("Work Setup Requirements"), LIST("{{role.work_setup}}")]),
        H2("Work Schedule"),
        P("{{engagement.work_schedule}}."),
        WHEN("engagement.saturday_rule", [P("Work may also be required on {{engagement.saturday_rule}}.")]),
        WHEN("role.performance_structure", [H2("Performance Structure"), LIST("{{role.performance_structure}}")]),
        P("This job description is not exhaustive. Duties may change, after discussion with the " + PARTY + ", as the needs of "
          "the role change."),
        H2("Acknowledgement"),
        SIG([(PARTY, "{{worker.full_name}}", "{{role.title}}", ""),
             ("Manager", "{{employment.reports_to}}", "Line manager", "")],
            statement="Signing below acknowledges receipt of this job description. It does not change the Employment Contract."),
    ]


# ── 3. Daily Key Performance Indicators ───────────────────────────────────────────────────────────────────────────────
def daily_kpi():
    return [
        H1("Daily Key Performance Indicators"),
        KV([
            (PARTY, "{{worker.full_name}}"),
            ("Employee ID", "{{worker.employee_id}}"),
            ("Role", "{{role.title}}"),
            ("Manager", "{{employment.reports_to}}"),
            ("Effective date", "{{document.issue_date}}"),
        ]),
        P("These are the areas in which your daily performance is reviewed. Your manager discusses them with you; they are a "
          "basis for feedback and support, and are never applied automatically."),
        KPIS("{{kpi.areas}}"),
        H2("Fairness Safeguards"),
        BUL([
            "A human manager reviews every KPI result with you; no decision about pay or discipline is ever made automatically "
            "from a KPI result.",
            "Days of approved leave, sickness, training or system outage are excluded.",
            "Targets are adjusted for part-time hours and during ramp-up for new starters.",
            "You can see your own KPI data at any time and ask for corrections.",
            "Any reasonable adjustment agreed with you also applies to these KPIs.",
        ]),
        H2("Agreement"),
        SIG([(PARTY, "{{worker.full_name}}", "{{role.title}}", ""),
             ("Manager", "{{employment.reports_to}}", "Line manager", "")],
            statement="Signing confirms that these KPIs have been discussed and agreed."),
    ]


# ── 4. Non-Disclosure Agreement ───────────────────────────────────────────────────────────────────────────────────────
def nda():
    return [
        H1("Non-Disclosure Agreement"),
        P("This Non-Disclosure Agreement (the **Agreement**) is made on the {{document.issue_date_legal}}."),
        CLAUSE("", "Parties", [
            "**{{company.legal_name_with_associates}}**, having its registered office at {{company.address_inline}} (the "
            "**Company**), OF THE FIRST PART;",
            "AND",
            "**{{worker.full_name}}**, residing at {{worker.address_inline}} (the **" + PARTY + "**), OF THE SECOND PART.",
        ]),
        CLAUSE("", "Background", [
            "The " + PARTY + " is engaged by the Company as {{role.title}} from {{employment.start_date_long}}, and will receive "
            "Confidential Information for the purpose of performing that role (the **Permitted Purpose**).",
            "In consideration of the engagement and of the Confidential Information made available, the parties agree as "
            "follows.",
        ]),
        CLAUSE(1, "Confidential Information", [
            "**Confidential Information** means information, in any form, that is not public and that the " + PARTY + " "
            "receives or creates through the engagement, including:",
            BUL([
                "(a) business plans, strategies, forecasts and financial information;",
                "(b) customer, client, supplier and partner information;",
                "(c) personal data about employees, customers or other people;",
                "(d) software, source code, algorithms, designs, data models and technical documentation;",
                "(e) products, product roadmaps, research and unreleased work;",
                "(f) pricing, contracts and commercial terms;",
                "(g) marketing, sales and growth plans;",
                "(h) know-how, processes and methods of working;",
                "(i) security arrangements, credentials and access methods;",
                "(j) information about the Company's associated companies;",
                "(k) any information marked confidential, or that a reasonable person would treat as confidential.",
            ]),
            "Confidential Information does **not** include information that:",
            BUL([
                "(a) is or becomes public other than through a breach of this Agreement;",
                "(b) the " + PARTY + " lawfully knew before receiving it from the Company;",
                "(c) the " + PARTY + " lawfully receives from a third party who owes no duty of confidence;",
                "(d) the " + PARTY + " develops independently, without using Confidential Information, Company equipment or "
                "Company time;",
                "(e) the Company agrees in writing may be disclosed.",
            ]),
        ]),
        CLAUSE(2, "Obligations of Non-Disclosure", [
            "The " + PARTY + " must keep Confidential Information secret and secure, use it only for the Permitted Purpose, and "
            "not copy, remove or transfer it outside Company systems unless authorised.",
            "The " + PARTY + " may disclose Confidential Information only:",
            BUL([
                "(a) to colleagues or advisers who need it for the Permitted Purpose and owe a duty of confidence;",
                "(b) with the Company's prior written consent; or",
                "(c) where required by (i) law, (ii) a court order, (iii) a regulator or (iv) a competent authority — and then "
                "only what is required, telling the Company first where the law allows.",
            ]),
            HOOK("protected_disclosure_and_whistleblowing"),
        ]),
        CLAUSE(3, "Avoiding Conflict of Opportunities", [HOOK("conflict_of_opportunities")]),
        CLAUSE(4, "Non-Solicitation", [
            "This clause applies for {{company.nda_non_solicit_months}} months from the date of this Agreement.",
            HOOK("non_solicitation"),
        ]),
        CLAUSE(5, "Non-Competition", [HOOK("non_competition")]),
        CLAUSE(6, "Ownership and Title", [HOOK("confidentiality_and_ip")]),
        CLAUSE(7, "Remedies", [HOOK("remedies")]),
        CLAUSE(8, "Return of Confidential Information", [
            "When the engagement ends, or earlier on request, the " + PARTY + " must return all Company property and Confidential "
            "Information, delete it from personal devices and accounts, and confirm this in writing if asked.",
        ]),
        CLAUSE(9, "Notices", [
            "Notices under this Agreement are given in writing to the Company at {{company.address_inline}}, and to the "
            + PARTY + " at {{worker.address_inline}} or the e-mail address held by the Company.",
        ]),
        CLAUSE(10, "Representations", [
            "Each party confirms that it is free to enter into this Agreement.",
        ]),
        CLAUSE(11, "Duration and Termination", [
            "The obligations of confidentiality continue {{company.confidentiality_duration}} after the engagement ends, unless "
            "the information ceases to be confidential.",
        ]),
        CLAUSE(12, "Assignment", [
            "The " + PARTY + " may not assign this Agreement. The Company may assign it to an associated company or a successor.",
        ]),
        CLAUSE(13, "Amendments", ["A change to this Agreement is valid only if it is in writing and signed by both parties."]),
        CLAUSE(14, "Governing Law", ["This Agreement is governed by {{company.governing_law}}."]),
        CLAUSE(15, "General Provisions", [
            "If any part of this Agreement cannot be enforced, the rest continues to apply. This Agreement, with the Employment "
            "Contract, is the whole agreement between the parties on confidentiality.",
        ]),
        {"t": "anchor", "name": "signatures"},
        H2("Signatures"),
        SIG([("For " + COMPANY + " (Per)", "{{employer.signatory_name}}", "{{employer.signatory_title}}", "{{document.issue_date}}"),
             ("Witness 1 (name, address)", "", "", ""),
             (PARTY, "{{worker.full_name}}", "{{role.title}}", ""),
             ("Witness 2 (name, address)", "", "", "")]),
        NOTE("© {{document.year}} {{company.copyright_line}}"),
    ]


# ── 5. Employment Contract ────────────────────────────────────────────────────────────────────────────────────────────
CONTRACT_CLAUSES = [
    (1, "Commencement Date and Term"), (2, "Programme Duration and Potential Conversion"), (3, "Job Title and Description"),
    (4, "Remuneration"), (5, "Place of Work"), (6, "Time of Work"), (7, "Benefits"), (8, "Annual Leave"),
    (9, "Duty to Devote Full Time"), (10, "Conflict of Interest"), (11, "Non-Solicitation"), (12, "Confidential Information"),
    (13, "Duties regarding Confidential Information"), (14, "Ownership and Title"), (15, "Return of Confidential Information"),
    (16, "Contract Binding Authority"), (17, "Termination due to Discontinuance of Business"), (18, "Termination of Engagement"),
    (19, "Remedies"), (20, "Severability"), (21, "Notices"), (22, "Modification"), (23, "Governing Law"), (24, "Definitions"),
    (25, "General Provisions"),
]


def employment_contract():
    body = {
        1: ["The engagement starts on {{employment.start_date_long}} (the **Start Date**).",
            "The first {{engagement.assessment_months}} months are the {{engagement.assessment_label}}. During it either party "
            "may end the engagement by giving {{employment.notice_text}}.",
            HOOK("probation")],
        2: [WHEN("engagement.conversion_text", [P("{{engagement.conversion_text}}")]),
            "Conversion to the next stage is not automatic and depends on the review at the end of the "
            "{{engagement.assessment_label}}."],
        3: ["The " + PARTY + " is engaged as **{{role.title}}**, reporting to {{employment.reports_to}}.",
            "{{employment.duties_paragraph}}",
            "The " + PARTY + " will also carry out other reasonable duties that fit the role, set out in the Job Description."],
        4: ["The {{engagement.remuneration_label}} is {{employment.pay_statement}}.",
            "The Company will make the deductions the law requires. Any bonus is discretionary. Reasonable business expenses "
            "approved in advance are reimbursed under the expenses policy."],
        5: ["The " + PARTY + " works on a {{employment.work_arrangement}} basis{{employment.work_location_suffix}}."],
        6: ["Normal working time is {{engagement.work_schedule}}.",
            WHEN("engagement.saturday_rule", [P("Work may also be required on {{engagement.saturday_rule}}.")]),
            HOOK("working_time")],
        7: [HOOK("benefits_and_training")],
        8: [WHEN("engagement.leave_rule", [P("{{engagement.leave_rule}}")]), HOOK("leave_and_holiday")],
        9: ["The " + PARTY + " will devote full working time to the role, record working time in {{company.time_tracking_tool}}, "
            "and submit a Daily Work Report each working day to {{company.reports_email}}{{company.reports_channel}}."],
        10: ["The " + PARTY + " must disclose any outside activity as set out in the Affidavit of Employment Exclusivity.",
             HOOK("outside_employment")],
        11: ["For {{company.non_solicit_months}} months after the engagement ends:", HOOK("non_solicitation")],
        12: ["Confidential Information has the meaning given in the Non-Disclosure Agreement signed with this contract. It "
             "does **not** include information the " + PARTY + " develops without using Company equipment, Company time or "
             "Confidential Information, or that is or becomes public other than through a breach."],
        13: ["The " + PARTY + " must comply with the Non-Disclosure Agreement, which forms part of this contract."],
        14: [HOOK("confidentiality_and_ip")],
        15: ["When the engagement ends the " + PARTY + " must return all Company property and Confidential Information."],
        16: ["The " + PARTY + " may not enter into any contract on the Company's behalf unless authorised in writing."],
        17: [HOOK("business_discontinuance")],
        18: ["Either party may end the engagement by giving {{employment.notice_text}}.", HOOK("notice_and_termination")],
        19: [HOOK("remedies")],
        20: ["If any part of this contract cannot be enforced, the rest continues to apply."],
        21: ["Notices are given in writing to the Company at {{company.address_inline}} and to the " + PARTY + " at "
             "{{worker.address_inline}}."],
        22: ["A change to this contract is valid only if it is in writing and signed by both parties."],
        23: ["This contract is governed by {{company.governing_law}}."],
        24: [TABLE(["Term", "Meaning"], [
                ["Company", COMPANY],
                [PARTY, "{{worker.full_name}}"],
                ["Start Date", "{{employment.start_date_long}}"],
                ["{{engagement.assessment_label}}", "The first {{engagement.assessment_months}} months of the engagement"],
                ["Confidential Information", "As defined in the Non-Disclosure Agreement"],
            ], widths=[0.32, 0.68])],
        25: ["This contract, Schedule 1, the Job Description and the Non-Disclosure Agreement form the whole agreement on these "
             "terms. Nothing in this contract removes a right the " + PARTY + " has by law.", HOOK("legal_precedence")],
    }
    blocks = [
        CENTER("EMPLOYMENT CONTRACT"),
        P("between **{{company.legal_name}}** and **{{worker.full_name}}**", "body"),
        P("Contract reference: {{contract.id}}"),
        H2("Contents"),
        TOC([(n, t) for n, t in CONTRACT_CLAUSES] + [("", "Schedule 1 – Particulars"), ("", "Signatures")]),
        PB(),
        CLAUSE("", "Parties and Background", [
            "This contract is made on the {{document.issue_date_legal}} between **{{company.legal_name_with_associates}}**, of "
            "{{company.address_inline}} (the **Company**), and **{{worker.full_name}}**, of {{worker.address_inline}} (the **"
            + PARTY + "**).",
        ]),
    ]
    for n, t in CONTRACT_CLAUSES:
        blocks.append(CLAUSE(n, t, body[n], anchor=f"cl{n}"))
    blocks += [
        PB(),
        {"t": "anchor", "name": "sched1"},
        H2("Schedule 1 – Particulars"),
        TABLE(["Item", "Particular"], [
            ["Role", "{{role.title}}"],
            ["Start date", "{{employment.start_date_long}}"],
            ["{{engagement.assessment_label}}", "{{engagement.assessment_months}} months"],
            ["{{engagement.remuneration_label}}", "{{employment.pay_statement}}"],
            ["Work schedule", "{{engagement.work_schedule}}"],
            ["Work arrangement", "{{employment.work_arrangement}}"],
            ["Notice", "{{employment.notice_text}}"],
            ["Reports to", "{{employment.reports_to}}"],
        ], widths=[0.35, 0.65]),
        {"t": "anchor", "name": "signatures"},
        H2("Signatures"),
        P("IN WITNESS WHEREOF the parties have signed this contract on the {{document.issue_date_legal}}."),
        SIG([("For " + COMPANY + " (Per)", "{{employer.signatory_name}}", "{{employer.signatory_title}}", "{{document.issue_date}}"),
             (PARTY, "{{worker.full_name}}", "{{role.title}}", ""),
             ("Witness 1 (name, address)", "", "", ""),
             ("Witness 2 (name, address)", "", "", "")]),
    ]
    return blocks


# ── 6. Affidavit of Employment Exclusivity ────────────────────────────────────────────────────────────────────────────
def exclusivity_affidavit():
    return [
        CENTER("AFFIDAVIT OF EMPLOYMENT EXCLUSIVITY"),
        P("Date: {{document.issue_date}}"),
        P("I, **{{worker.full_name_caps}}**, residing at {{worker.address_inline}}, hereby affirm and declare as follows:"),
        NUM([
            "I have been offered the role of {{role.title}} with " + COMPANY + ", starting on {{employment.start_date_long}}.",
            "I will devote my full working time and attention to " + COMPANY + ".",
            "I will not take up any other employment, consultancy or business activity without the Company's prior written "
            "approval.",
            "I understand that a breach of this affidavit is a breach of my terms of engagement.",
            "I understand that a breach may lead to action under the Company's disciplinary procedure.",
            "I certify that, apart from the activities I list in Schedule A, I have no other employment, consultancy or business "
            "activity.",
            "I will tell the Company promptly about any change to the statements in this affidavit.",
            "I understand that this affidavit is legally binding.",
            "I make this affidavit believing its contents to be true.",
        ]),
        H3("Schedule A – Disclosed outside activities"),
        P("I complete Schedule A when I sign this affidavit. It lists every outside activity, paid or unpaid, or confirms that I "
          "have none, and forms part of this affidavit."),
        H3("Scope"),
        HOOK("outside_employment_lawful_scope"),
        HOOK("false_statement_consequences"),
        SIG([("Deponent", "{{worker.full_name}}", "{{role.title}}", "")]),
        P("Sworn and declared before me on this ______ day of ____________, 20____, by {{worker.full_name_caps}}."),
        WHEN("company.affidavit_notary", [
            H3("Notary Public"),
            TABLE(["Name of Notary Public", "Registration number", "Seal", "Signature", "Date"], [["", "", "", "", ""]],
                  widths=[0.26, 0.2, 0.18, 0.18, 0.18]),
        ]),
        WHEN("company.affidavit_stamp_note", [NOTE("{{company.affidavit_stamp_note}}")]),
        NOTICE(["**Submission deadline:** submit this affidavit within {{company.affidavit_hours}} hours of receiving the offer "
                "letter."]),
    ]


# ── 7. Self-Disclosure Declaration (conflict of interest and document accuracy) ───────────────────────────────────────
def self_disclosure():
    return [
        H1("Self-Disclosure Declaration"),
        KV([
            ("Name", "{{worker.full_name}}"),
            ("Employee ID", "{{worker.employee_id}}"),
            ("Department", "{{employment.department}}"),
            ("Position / title", "{{role.title}}"),
            ("Date", "{{document.issue_date}}"),
        ]),
        NOTICE(["Your answers are treated as confidential and are seen only by HR and management who need them."]),
        CHECKS("1. Do you work exclusively for {{company.legal_name}}?", ["Yes", "No"]),
        P("**2. If you answered No to question 1**, list every other business or employer you work with:"),
        TABLE(["Business / employer name", "Role / position", "Nature of involvement", "Hours per week"], blank_rows(3, 4),
              widths=[0.3, 0.22, 0.32, 0.16]),
        CHECKS("3. Have you submitted any false documents or incorrect information to the Company (for example bank "
               "statements, pay stubs, previous salaries or earnings, qualifications or residential address)?", ["Yes", "No"]),
        TEXTBOX("3a. If you answered Yes to question 3, give the correct information", 4,
                "Which document or information, and the correction."),
        H2("Acknowledgement"),
        BUL([
            "The information I have given is true and complete to the best of my knowledge.",
            "I will tell the Company promptly if any of it changes.",
            "I understand that false or incomplete information may affect my engagement.",
        ]),
        SIG([(PARTY, "{{worker.full_name}}", "{{role.title}}", "")]),
        H3("HR / Management Use Only"),
        TABLE(["Verified by", "Date", "Action taken"], [["", "", ""]], widths=[0.3, 0.2, 0.5]),
    ]


# ── 8. Job Application Form ───────────────────────────────────────────────────────────────────────────────────────────
def job_application():
    return [
        H1("Job Application Form"),
        FIELDS_([("Post applied for", "{{role.title}}", ""), ("Job reference number", "Enter the reference", "")]),
        NOTE("Complete the form in black ink or electronically, in BLOCK CAPITALS where asked. Every section applies unless it "
             "says otherwise."),
        H2("1. Personal Details"),
        TABLE(["Surname", "Initials", "Former surnames", "Preferred name"], [["", "{{worker.initials}}", "", ""]],
              widths=[0.3, 0.15, 0.3, 0.25]),
        TABLE(["Address", "Postcode / PIN"], [["", ""]], widths=[0.75, 0.25]),
        TABLE(["Home phone", "Business phone", "Mobile", "E-mail"], [["", "", "{{worker.phone}}", "{{worker.email}}"]],
              widths=[0.2, 0.2, 0.2, 0.4]),
        WHEN("employment.country_is_in", [
            TABLE(["PAN", "Aadhaar (last 4 digits only)"], [["", "XXXX XXXX ____"]], widths=[0.5, 0.5]),
            NOTE("Never write your full Aadhaar number on this form."),
        ]),
        CHECKS("Do you have the right to work in {{employment.country}}?", ["Yes", "No"]),
        CHECKS("Preferred work arrangement", ["On-site", "Hybrid", "Remote"]),
        H2("2. Education"),
        TABLE(["Institution", "From", "To", "Examinations", "Date", "Result"], blank_rows(4, 6),
              widths=[0.26, 0.1, 0.1, 0.24, 0.12, 0.18]),
        H2("3. Professional Qualifications"),
        TEXTBOX("Professional qualifications", 3, "Body, qualification and year."),
        H2("4. Other Courses"),
        TEXTBOX("Other courses", 2, ""),
        H2("5. Present Post"),
        TABLE(["Employer name and address", "Job title", "Date started", "Salary", "Notice period"], [["", "", "", "", ""]],
              widths=[0.34, 0.18, 0.14, 0.16, 0.18]),
        TEXTBOX("Main duties", 3, ""),
        H2("6. Previous Employment"),
        TABLE(["Employer", "Job title", "From", "To", "Reason for leaving"], blank_rows(4, 5),
              widths=[0.26, 0.2, 0.12, 0.12, 0.3]),
        H2("7. Relevant Skills and Reasons for Applying"),
        TEXTBOX("Skills and reasons", 8, "How your skills and experience match the role."),
        H2("8. Other Information"),
        TABLE(["Interests", "Driving licence", "Internet and workspace", "Adjustments needed for interview"], [["", "", "", ""]],
              widths=[0.25, 0.15, 0.3, 0.3]),
        H2("9. Criminal Record"),
        HOOK("criminal_record_question"),
        H2("10. References"),
        TABLE(["Referee name", "Relationship", "Organisation", "E-mail", "Phone"], blank_rows(2, 5),
              widths=[0.22, 0.17, 0.21, 0.24, 0.16]),
        H2("11. Declaration"),
        P("I confirm that the information in this form is true and complete to the best of my knowledge."),
        SIG([("Applicant", "{{worker.full_name}}", "Applicant", "")]),
        H2("12. Privacy Notice"),
        HOOK("applicant_privacy_notice"),
    ]


# ── 9. Daily Work Report ──────────────────────────────────────────────────────────────────────────────────────────────
def daily_work_report():
    return [
        H1("Daily Work Report"),
        KV([
            ("Employee name", "{{worker.full_name}}"),
            ("Employee ID", "{{worker.employee_id}}"),
            ("Project / module", EX("Enter the project or module")),
            ("Reporting to", "{{employment.reports_to}}"),
            ("Date", EX("DD Month YYYY")),
        ]),
        H3("1. Summary"),
        TEXTBOX("Summary of the day", 2, ""),
        CHECKS("Overall outcome", ["On track", "Partly on track", "Behind"]),
        H3("2. Tasks Completed"),
        TABLE(["Task ID", "Description", "Status (Done / Partial / Pending)", "Time spent"], blank_rows(5, 4),
              widths=[0.14, 0.46, 0.24, 0.16], compact=True),
        H3("3. Work in Progress"),
        TEXTBOX("Work in progress", 2, ""),
        H3("4. Blockers"),
        TABLE(["Issue", "Impact", "Required support"], blank_rows(3, 3), widths=[0.4, 0.3, 0.3], compact=True),
        H3("5. Solutions Applied"),
        TEXTBOX("Solutions applied", 2, ""),
        H3("6. AI Tools Usage"),
        TEXTBOX("AI tools used and for what", 2, ""),
        H3("7. Code / Technical Contributions"),
        TABLE(["Backend", "Frontend", "Database / API", "AI / ML"], [["", "", "", ""]], widths=[0.25, 0.25, 0.25, 0.25],
              compact=True),
        H3("8. Key Learnings"),
        TEXTBOX("Key learnings", 2, ""),
        H3("9. Tomorrow's Plan"),
        TEXTBOX("Tomorrow's plan", 2, ""),
        H3("10. Self Rating (1–10)"),
        TABLE(["Self rating", "Reason"], [["", ""]], widths=[0.2, 0.8], compact=True),
        NOTICE(["Submit by e-mail to {{company.reports_email}}{{company.reports_channel}} each working day."]),
        TABLE(["Submitted by", "Time of submission"], [["{{worker.full_name}}", ""]], widths=[0.6, 0.4], compact=True),
    ]


# ── 10. Project Velocity Report ───────────────────────────────────────────────────────────────────────────────────────
def velocity_report():
    brand = "{{company.brand_label}}"
    return [
        CENTER("{{company.group_name_caps}} — PROJECT VELOCITY"),
        P("**Weekly Execution Report (MANDATORY)**"),
        WHEN("company.velocity_motto", [NOTE("{{company.velocity_motto}}")]),
        KV([
            ("Owner", "Each team member, for their own work"),
            ("Deadline", "{{company.velocity_deadline}}"),
            ("Where", "{{company.task_system}}"),
            ("Length", "One page; short and specific"),
            ("Hard rule", "Three answers: What did I finish? What will I finish next? What is blocking me?"),
        ]),
        H2("1. Identification"),
        KV([
            ("Name", "{{worker.full_name}}"),
            ("Role", "{{role.title}}"),
            ("Team", "{{employment.department}}"),
            ("Velocity lead / manager", "{{employment.reports_to}}"),
            ("Work location", "{{employment.work_arrangement}}"),
            ("Time zone", "{{engagement.timezone}}"),
            ("Reporting week", EX("e.g. 3–7 August")),
            (brand, EX("Enter the brand")),
        ]),
        WHEN("company.brands", [P("**" + brand + " options:**"), LIST("{{company.brands}}")]),
        H2("2. Top 3 Completed"),
        TABLE(["#", "What was completed", "Evidence / link"], [["1", "", ""], ["2", "", ""], ["3", "", ""]],
              widths=[0.06, 0.6, 0.34], compact=True),
        H2("3. Top 3 Priorities for Next Week"),
        TABLE(["#", "Priority", "Target date"], [["1", "", ""], ["2", "", ""], ["3", "", ""]], widths=[0.06, 0.7, 0.24],
              compact=True),
        H2("4. Blockers"),
        TABLE(["#", "Blocker", "Help needed from"], [["1", "", ""], ["2", "", ""], ["3", "", ""]], widths=[0.06, 0.6, 0.34],
              compact=True),
        H2("5. Quality / Errors"),
        TEXTBOX("Quality issues or errors this week", 2, ""),
        H2("Declaration"),
        P("I confirm that this report is accurate."),
        SIG([("Team member", "{{worker.full_name}}", "{{role.title}}", "")]),
        P("**Summarise in three answers, every week, on time.**"),
    ]


# ── the v2 package index ──────────────────────────────────────────────────────────────────────────────────────────────
# category, title, template_id, family, type, risk, sensitivity, mode, orientation, pages, signers, builder, initials
DOCUMENT_INDEX = [
    ("offer_letter", "Offer Letter", "HR-HIR-011", "HR-HIR", "LETTER_NOTICE", "L2", "C2", "SIGN", "portrait", "2–3",
     "Employer (issues); Candidate (accepts)", offer_letter, False),
    ("job_description", "Job Description", "HR-ORG-005", "HR-ORG", "RECORD", "L1", "C1", "ACKNOWLEDGE", "portrait", "2",
     "Employee and manager (acknowledgement)", job_description, False),
    ("daily_kpi", "Daily Key Performance Indicators", "HR-PRF-101", "HR-PRF", "ASSESSMENT", "L1", "C2", "ACKNOWLEDGE",
     "portrait", "2", "Employee and manager (agreement)", daily_kpi, False),
    ("nda", "Non-Disclosure Agreement", "HR-CON-017", "HR-CON", "AGREEMENT", "L3", "C3", "SIGN", "portrait", "5–7",
     "Employer; Employee; two witnesses", nda, True),
    ("employment_contract", "Employment Contract", "HR-CON-001", "HR-CON", "AGREEMENT", "L3", "C3", "SIGN", "portrait", "8–11",
     "Employer; Employee; two witnesses", employment_contract, True),
    ("exclusivity_affidavit", "Affidavit of Employment Exclusivity", "HR-CON-101", "HR-CON", "AGREEMENT", "L3", "C3", "SIGN",
     "portrait", "2", "Deponent; notary if required", exclusivity_affidavit, False),
    ("self_disclosure", "Self-Disclosure Declaration", "HR-REC-101", "HR-REC", "FORM", "L2", "C3", "COMPLETE", "portrait",
     "1–2", "Employee (declaration)", self_disclosure, False),
    ("job_application", "Job Application Form", "HR-HIR-005", "HR-HIR", "FORM", "L2", "C3", "COMPLETE", "portrait", "3–4",
     "Applicant (declaration)", job_application, False),
    ("daily_work_report", "Daily Work Report (DWR)", "HR-TIM-101", "HR-TIM", "RECORD", "L1", "C2", "INFO", "portrait", "1–2",
     "Employee; manager review", daily_work_report, False),
    ("velocity_report", "Project Velocity Report", "HR-PRF-102", "HR-PRF", "RECORD", "L1", "C2", "INFO", "portrait", "1–2",
     "Team member", velocity_report, False),
]

# The offer letter goes out before the new hire enters an address; the agreements still need it.
OPTIONAL_BY_DOC = {"offer_letter": {"worker.address_block", "worker.postal_address"}}
