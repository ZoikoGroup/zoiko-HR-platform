"""Offer-package template set: the 10 onboarding documents as structured content (no rendering here).

Each document is a list of blocks (plain dicts) that `onboarding_package_render` turns into a PDF and into the HTML the candidate
reads before signing, so both always show the same words. Text may contain:

* ``{{object.field}}`` — data filled from the HR system (see FIELDS, the Placeholder Dictionary);
* ``{{clause:topic}}`` / ``{{required_clause_block}}`` — wording local employment counsel must supply (see CLAUSES). Each hook
  carries a drafting note; we never write the legal clause ourselves where a hook belongs;
* ``**bold**``.

Plain-English rules for anything added here: sentences under 25 words, "you" in letters, "the Employee" in agreements, no gendered
pronouns, no statutory wording, government form content, case law or regulator names.
"""
from __future__ import annotations

import re

PACKAGE_VERSION = "1.0"

# ── Placeholder Dictionary ─────────────────────────────────────────────────────────────────────────────────────────────
# key -> (meaning, data source, required, fallback shown when an optional value is missing)
ZHR, ZTIME, PAYROLL, COUNSEL = "Zoiko HR", "ZoikoTime", "Payroll", "Counsel"

FIELDS: dict[str, tuple[str, str, bool, str | None]] = {
    "generated_at": ("Date the document was generated", ZHR, True, None),
    "employer.legal_name": ("Employer's registered legal name", ZHR, True, None),
    "employer.registered_address": ("Employer's registered office address", ZHR, True, None),
    "employer.signatory_name": ("Name of the authorised signatory who issues the document", ZHR, True, None),
    "employer.signatory_title": ("Job title of the authorised signatory", ZHR, True, None),
    "employer.hr_contact": ("HR contact (name and e-mail) for questions", ZHR, True, None),
    "worker.full_name": ("Candidate's or employee's full legal name", ZHR, True, None),
    "worker.postal_address": ("Candidate's postal address, entered in the onboarding portal", ZHR, True, None),
    "worker.email": ("Candidate's e-mail address", ZHR, True, None),
    "worker.phone": ("Candidate's phone number", ZHR, False, "Not provided"),
    "worker.employee_id": ("Employee ID", ZHR, False, "Assigned on joining"),
    "employment.position_title": ("Job title of the role", ZHR, True, None),
    "employment.department": ("Department or team", ZHR, False, "To be confirmed"),
    "employment.reports_to": ("Name of the line manager", ZHR, False, "To be confirmed before the start date"),
    "employment.direct_reports": ("Number or roles of direct reports", ZHR, False, "None"),
    "employment.job_code": ("Job code or grade", ZHR, False, "Not graded"),
    "employment.employment_type": ("Employment type (full-time, part-time, fixed-term…)", ZHR, True, None),
    "employment.start_date": ("First day of employment", ZHR, True, None),
    "employment.continuous_service_date": ("Date continuous employment began", ZHR, False, None),
    "employment.work_location": ("Normal place of work", ZHR, True, None),
    "employment.work_arrangement": ("On-site, hybrid or remote", ZHR, False, "On-site"),
    "employment.working_hours": ("Normal working hours per week", ZHR, True, None),
    "employment.work_pattern": ("Working pattern (days and times)", ZHR, False, None),
    "employment.base_pay": ("Base pay amount and currency", PAYROLL, True, None),
    "employment.pay_frequency": ("How often pay is calculated and paid", PAYROLL, True, None),
    "employment.pay_terms": ("Base pay, frequency and payment method in one statement", PAYROLL, True, None),
    "employment.variable_pay": ("Variable pay or bonus arrangements", PAYROLL, False, "None offered"),
    "employment.benefits_reference": ("Where the benefits are described (annex or scheme)", ZHR, False,
                                      "the benefits summary HR provides with this offer"),
    "employment.pay_range": ("Pay range for the role, where pay-transparency law requires it", PAYROLL, False,
                             "Available from HR on request"),
    "employment.leave_entitlement": ("Annual leave entitlement", ZHR, True, None),
    "employment.country": ("Country of employment", ZHR, True, None),
    "offer.response_deadline": ("Date by which the candidate must respond to the offer", ZHR, True, None),
    "offer.secure_link": ("Secure onboarding portal link for the candidate", ZHR, True, None),
    "contract.id": ("Contract reference number", ZHR, True, None),
    "agreement.post_employment_period": ("How long confidentiality lasts after employment ends", COUNSEL, True, None),
    "document.version": ("Version of this document", ZHR, False, "1.0"),
    "document.effective_date": ("Date this document takes effect", ZHR, True, None),
    "job.role_purpose": ("Why the role exists, in 2–3 sentences", ZHR, True, None),
    "job.education_essential": ("Essential education", ZHR, False, "None specified"),
    "job.education_desirable": ("Desirable education", ZHR, False, "—"),
    "job.experience_essential": ("Essential experience", ZHR, False, "Relevant experience for the role"),
    "job.experience_desirable": ("Desirable experience", ZHR, False, "—"),
    "job.skills_essential": ("Essential technical skills", ZHR, False, "As discussed at interview"),
    "job.skills_desirable": ("Desirable technical skills", ZHR, False, "—"),
    "job.languages_essential": ("Essential languages", ZHR, False, "None specified"),
    "job.languages_desirable": ("Desirable languages", ZHR, False, "—"),
    "job.licences_essential": ("Essential licences or clearances", ZHR, False, "None required"),
    "job.licences_desirable": ("Desirable licences or clearances", ZHR, False, "—"),
    "job.travel": ("Travel the role needs", ZHR, False, "None expected"),
    "job.physical_requirements": ("Physical requirements of the role", ZHR, False, "None beyond normal working activity"),
    "kpi.set_version": ("Version of the agreed KPI set", ZHR, False, "1.0"),
    "kpi.review_cycle": ("How often KPIs are reviewed with the manager", ZHR, False, "Weekly, in the 1:1 meeting"),
    "kpi.role_specific_definition": ("Role-specific KPI and how it is measured", ZHR, False, "Agreed with the manager in week one"),
    "kpi.role_specific_target": ("Daily target for the role-specific KPI", ZHR, False, "To be agreed"),
    "kpi.role_specific_minimum": ("Minimum acceptable level for the role-specific KPI", ZHR, False, "To be agreed"),
    "kpi.role_specific_source": ("Data source for the role-specific KPI", ZHR, False, "To be agreed"),
    "time.hours_logged": ("Hours worked that day, read-only from ZoikoTime", ZTIME, False, "Filled automatically from time records"),
}

# ── Clause hooks ───────────────────────────────────────────────────────────────────────────────────────────────────────
# key -> (title, drafting note, required). A required hook without counsel wording keeps the document a draft.
# An optional hook without wording prints "Not used." in an issued document.
CLAUSES: dict[str, tuple[str, str, bool]] = {
    "required_clause_block": ("Jurisdiction-specific offer conditions and rights",
                              "Counsel to list any conditions or statements the law of the place of work requires in a written offer.", True),
    "probation": ("Probation",
                  "Counsel to set the probation length, review points, extension rules and notice that applies during probation.", True),
    "notice_and_termination": ("Notice and termination",
                               "Counsel to state notice periods for each party, pay in lieu, garden leave and summary termination, "
                               "at or above statutory minimums.", True),
    "equal_opportunity": ("Equal opportunity statement",
                          "Counsel to supply an equal-opportunity statement naming the characteristics protected where the role is based.", True),
    "protected_disclosure_and_whistleblowing": ("Protected disclosures and whistleblowing",
                                                "Counsel to confirm the Employee may report to regulators, authorities and others the "
                                                "law protects, without notice to the Company.", True),
    "trade_secret_immunity_notice": ("Trade secret immunity notice",
                                     "Counsel to add any notice of immunity for confidential disclosures to authorities that local law "
                                     "requires. Mark as not used where none applies.", False),
    "confidentiality_and_ip": ("Confidentiality and intellectual property",
                               "Counsel to set ownership and assignment of work product, moral rights, prior inventions and "
                               "any carve-outs local law requires.", True),
    "remedies": ("Remedies",
                 "Counsel to set the remedies available for breach, consistent with local law and the protected-rights clause.", True),
    "employee_privacy": ("Employee privacy",
                         "Counsel to reference the employee privacy notice and the lawful bases for processing. Do not rely on consent "
                         "for employment processing.", True),
    "governing_law": ("Governing law and jurisdiction",
                      "Counsel to state the governing law and the courts or tribunals with jurisdiction.", True),
    "working_time": ("Working time, overtime and rest",
                     "Counsel to cover overtime eligibility and pay, rest breaks, daily and weekly rest and any opt-out where lawful.", True),
    "leave_and_holiday": ("Holidays and leave",
                          "Counsel to cover the leave year, public holidays, carry-over, booking rules and pay on termination.", True),
    "sickness_and_protected_leave": ("Sickness and protected leave",
                                     "Counsel to cover sickness reporting, sick pay and statutory family or protected leave.", True),
    "benefits_and_training": ("Training",
                              "Counsel to cover mandatory training, paid training time and any lawful training-cost repayment.", True),
    "outside_employment": ("Outside activities",
                           "Counsel to set what outside work needs approval and the lawful limits on restricting it.", True),
    "policy_status": ("Status of policies",
                      "Counsel to confirm which policies, if any, are contractual and how the Company may change them.", True),
    "grievance_and_discipline": ("Grievance and discipline",
                                 "Counsel to reference the grievance and disciplinary procedures and any right to be accompanied.", True),
    "post_termination_restrictions_if_enforceable": ("Post-termination restrictions",
                                                     "Include only if counsel confirms enforceability in the jurisdiction. Counsel to "
                                                     "set scope, duration and any payment required.", False),
    "collective_instrument": ("Collective agreements",
                              "Counsel to name any collective agreement or award that applies, or confirm that none does.", False),
    "legal_precedence": ("Legal precedence",
                         "Counsel to confirm that mandatory law prevails over any conflicting term of this contract.", True),
    "outside_employment_lawful_scope": ("Lawful scope of exclusivity",
                                        "Some jurisdictions limit restrictions on secondary employment. Counsel must set the lawful "
                                        "scope of this affidavit.", True),
    "false_statement_consequences": ("Consequences of false statements",
                                     "Counsel to supply approved wording on the consequences of a false statement and any oath or "
                                     "affirmation formula.", True),
    "special_category_data_notice": ("Special category data notice",
                                     "Counsel to state the lawful basis, retention period and access controls for this sensitive data.", True),
    "ethnicity_categories": ("Ethnicity categories",
                             "Counsel to supply the ethnicity list used for monitoring where the role is based, one option per line.", True),
    "veteran_categories": ("Veteran categories",
                           "Where veteran monitoring applies, counsel to supply the categories, one per line. Otherwise mark as not used.", False),
    "criminal_record_question": ("Criminal record question",
                                 "Ask only where lawful and relevant to the role, and only at the stage the law allows.", False),
    "applicant_privacy_notice": ("Applicant privacy notice",
                                 "Counsel to summarise how applicant data is used, kept and shared, and how to exercise rights.", True),
}

TOKEN_RE = re.compile(r"\{\{\s*([a-z_]+(?::[a-z_]+|\.[a-z_]+)?)\s*\}\}")


def clause_key(token: str) -> str | None:
    """'clause:probation' -> 'probation'; 'required_clause_block' -> 'required_clause_block'; field tokens -> None."""
    if token.startswith("clause:"):
        return token.split(":", 1)[1]
    if token == "required_clause_block":
        return token
    return None


# ── block constructors ───────────────────────────────────────────────────────────────────────────────────────────────
def H1(t): return {"t": "h1", "text": t}
def H2(t): return {"t": "h2", "text": t}
def H3(t): return {"t": "h3", "text": t}
def P(t, style="body"): return {"t": "p", "text": t, "style": style}
def CENTER(t): return {"t": "center", "text": t}
def BUL(items): return {"t": "bullets", "items": list(items)}
def NUM(items): return {"t": "numbered", "items": list(items)}
def KV(rows): return {"t": "kv", "rows": list(rows)}
def NOTICE(paras): return {"t": "notice", "items": list(paras)}
def HOOK(key): return {"t": "hook", "key": key}
def NOTE(t): return {"t": "note", "text": t}
def PB(): return {"t": "pagebreak"}
def EX(t): return {"ex": t}
def CHECKS(label, options, hook=None): return {"t": "checks", "label": label, "options": list(options), "hook": hook}
def FIELDS_(rows, cols=2): return {"t": "fields", "rows": list(rows), "cols": cols}
def TEXTBOX(label, lines=3, hint=""): return {"t": "textbox", "label": label, "lines": lines, "hint": hint}
def CONSENT(text, after=()): return {"t": "consent", "text": text, "after": list(after)}
def CHART(title, note): return {"t": "chart", "title": title, "note": note}
def LETTERHEAD(): return {"t": "letterhead"}
def TOC(entries): return {"t": "toc", "entries": list(entries)}
def COVER(lines): return {"t": "cover", "lines": list(lines)}
def COLUMNS(left, right): return {"t": "columns", "left": list(left), "right": list(right)}


def TABLE(headers, rows, widths=None, total=None, compact=False):
    return {"t": "table", "headers": list(headers), "rows": [list(r) for r in rows], "widths": widths, "total": total,
            "compact": compact}


def SIG(rows, statement=None):
    """rows: (party, name, title, date). The signature cell is always left for the signer."""
    return {"t": "signature", "rows": list(rows), "statement": statement}


def CLAUSE(num, title, items, anchor=None):
    return {"t": "clause", "num": str(num), "title": title, "items": list(items), "anchor": anchor}


def blank_rows(n, cols):
    return [[""] * cols for _ in range(n)]


# ── 1. Offer Letter ───────────────────────────────────────────────────────────────────────────────────────────────────
def _offer_letter():
    enclosed = [d[1] for d in DOCUMENT_INDEX[1:]]
    return [
        LETTERHEAD(),
        P("{{generated_at}}"),
        P("**Private and Confidential**"),
        P("{{worker.full_name}}<br/>{{worker.postal_address}}"),
        P("**Conditional Offer of Employment – {{employment.position_title}}**"),
        P("Dear {{worker.full_name}},"),
        P("We are pleased to offer you the role of {{employment.position_title}} with {{employer.legal_name}}. "
          "This offer depends on the conditions set out below. Your main terms are summarised here and set out in full in the "
          "enclosed Employment Contract."),
        H2("Principal Particulars"),
        KV([
            ("Position", "{{employment.position_title}}"),
            ("Department", "{{employment.department}}"),
            ("Reports to", "{{employment.reports_to}}"),
            ("Employment type", "{{employment.employment_type}}"),
            ("Start date", "{{employment.start_date}}"),
            ("Work location", "{{employment.work_location}} ({{employment.work_arrangement}})"),
            ("Working hours", "{{employment.working_hours}}"),
            ("Base pay and pay frequency", "{{employment.base_pay}}, paid {{employment.pay_frequency}}"),
            ("Variable pay / bonus", "{{employment.variable_pay}}"),
            ("Benefits", "As set out in {{employment.benefits_reference}}"),
            ("Probation", "{{clause:probation}}"),
            ("Notice", "{{clause:notice_and_termination}}"),
        ]),
        H2("Conditions of Offer"),
        HOOK("required_clause_block"),
        P("This offer is also conditional on:"),
        BUL([
            "proof of your right to work in {{employment.country}}, checked before your start date;",
            "references that are satisfactory to us;",
            "your signed Employment Contract, Non-Disclosure Agreement and Affidavit of Employment Exclusivity;",
            "any licence, registration or clearance the role requires.",
        ]),
        P("We will tell you promptly if a condition is not met, and explain what happens next."),
        H2("Enclosed Documents"),
        NUM(enclosed),
        H2("Acceptance and Next Steps"),
        P("Please respond by **{{offer.response_deadline}}**."),
        P("Read and sign your documents through your secure onboarding link: {{offer.secure_link}}"),
        P("If we do not receive your acceptance by that date, this offer will lapse."),
        P("If you have any questions, please contact {{employer.hr_contact}}."),
        P("We look forward to welcoming you."),
        P("Yours sincerely,"),
        SIG([("For {{employer.legal_name}}", "{{employer.signatory_name}}", "{{employer.signatory_title}}", "{{generated_at}}")]),
        H2("Candidate Acceptance"),
        SIG([("Candidate", "{{worker.full_name}}", "Candidate", "")],
            statement="I accept this conditional offer of employment on the terms set out in this letter."),
        NOTE("Signing confirms acceptance of the offer only. Acknowledging receipt of other documents, and any consent to optional "
             "data processing, are recorded separately."),
    ]


# ── 2. Job Description ────────────────────────────────────────────────────────────────────────────────────────────────
def _job_description():
    return [
        H1("Job Description"),
        KV([
            ("Job title", "{{employment.position_title}}"),
            ("Job code / grade", "{{employment.job_code}}"),
            ("Department / team", "{{employment.department}}"),
            ("Reports to", "{{employment.reports_to}}"),
            ("Direct reports", "{{employment.direct_reports}}"),
            ("Employment type", "{{employment.employment_type}}"),
            ("Location", "{{employment.work_location}} ({{employment.work_arrangement}})"),
            ("Pay range", "{{employment.pay_range}}"),
            ("Version", "{{document.version}}"),
            ("Effective date", "{{document.effective_date}}"),
        ]),
        H2("Role Purpose"),
        P("{{job.role_purpose}}"),
        H2("Key Responsibilities"),
        NUM([
            "Deliver the core work of the {{employment.position_title}} role to the agreed quality and timescales.",
            "Plan and prioritise daily tasks with the line manager and the wider team.",
            "Collaborate with colleagues across teams to share information and resolve issues quickly.",
            "Keep accurate records, documentation and tickets for the work completed.",
            "Identify risks and blockers early and raise them with the right person.",
            "Suggest improvements to processes, tools and ways of working.",
            "Take part in team meetings, reviews and agreed training.",
            "Complete a Daily Work Report each working day.",
            "Follow company policies, including information security, data protection and health and safety.",
        ]),
        H2("Performance Measures"),
        P("Performance is measured using the agreed Daily Key Performance Indicators (document HR-PRF-101). A manager reviews them "
          "with the employee. They are never applied automatically."),
        H2("Qualifications and Skills"),
        TABLE(["Requirement", "Essential", "Desirable"], [
            ["Education", "{{job.education_essential}}", "{{job.education_desirable}}"],
            ["Experience", "{{job.experience_essential}}", "{{job.experience_desirable}}"],
            ["Technical skills", "{{job.skills_essential}}", "{{job.skills_desirable}}"],
            ["Languages", "{{job.languages_essential}}", "{{job.languages_desirable}}"],
            ["Licences / clearances", "{{job.licences_essential}}", "{{job.licences_desirable}}"],
        ], widths=[0.24, 0.38, 0.38]),
        H2("Working Conditions"),
        BUL([
            "**Hours:** {{employment.working_hours}}.",
            "**Travel:** {{job.travel}}.",
            "**Physical requirements:** {{job.physical_requirements}}.",
            "**Reasonable adjustments:** we will consider adjustments to the role, its duties or working arrangements. "
            "Ask HR or the line manager at any time.",
        ]),
        H2("Equal Opportunity Statement"),
        HOOK("equal_opportunity"),
        P("This job description is not exhaustive. Duties may change, after discussion with the employee, as the needs of the role "
          "change."),
        H2("Acknowledgement"),
        SIG([("Employee", "{{worker.full_name}}", "{{employment.position_title}}", ""),
             ("Manager", "{{employment.reports_to}}", "Line manager", "")],
            statement="Signing below acknowledges receipt of this job description. It does not change the Employment Contract."),
    ]


# ── 3. Daily KPIs ─────────────────────────────────────────────────────────────────────────────────────────────────────
KPI_ROWS = [
    ("Tasks completed vs planned", "Planned tasks marked Done ÷ tasks planned for the day", "90%", "75%"),
    ("First-pass quality", "Items accepted at first review ÷ items submitted for review", "95%", "85%"),
    ("Response time", "Median working hours to first response on assigned requests", "≤ 4 h", "≤ 8 h"),
    ("Story points delivered", "Points moved to Done ÷ sprint days (team-calibrated trend)", "Sprint plan ÷ days", "70% of plan"),
    ("Blockers raised promptly", "Blockers raised within 2 working hours of discovery", "100%", "90%"),
]


def _daily_kpi():
    rows = [[str(i + 1), k, d, t, m, w, s] for i, ((k, d, t, m), w, s) in enumerate(zip(
        KPI_ROWS, ["25", "20", "15", "20", "10"],
        ["Daily Work Report / task tracker", "Peer review / QA records", "Ticketing system", "Sprint board", "Daily Work Report"]))]
    rows.append(["6", "Role-specific KPI", "{{kpi.role_specific_definition}}", "{{kpi.role_specific_target}}",
                 "{{kpi.role_specific_minimum}}", "10", "{{kpi.role_specific_source}}"])
    return [
        H1("Daily Key Performance Indicators"),
        KV([
            ("Employee and ID", "{{worker.full_name}} ({{worker.employee_id}})"),
            ("Position", "{{employment.position_title}}"),
            ("Manager", "{{employment.reports_to}}"),
            ("KPI set version", "{{kpi.set_version}}"),
            ("Effective date", "{{document.effective_date}}"),
            ("Review cycle", "{{kpi.review_cycle}}"),
        ]),
        P("These KPIs are agreed between the employee and the manager, and a human manager reviews them. They are never applied "
          "automatically to pay or discipline."),
        H2("KPI Schedule"),
        TABLE(["#", "KPI", "Definition / how measured", "Daily target", "Minimum acceptable", "Weight (%)", "Data source"], rows,
              widths=[0.05, 0.15, 0.25, 0.12, 0.13, 0.09, 0.21], total=["", "Total", "", "", "", "100", ""], compact=True),
        H2("Scoring Guide"),
        TABLE(["Exceeds", "Meets", "Below"], [[
            "Above the daily target on most days in the review period.",
            "At or above the minimum acceptable level on most days.",
            "Under the minimum on most days. Agree support with the manager.",
        ]], widths=[0.333, 0.333, 0.334]),
        H2("Fairness Safeguards"),
        BUL([
            "Days of approved leave, sickness, training or system outage are excluded from KPI calculations.",
            "Targets are adjusted pro rata for part-time hours and during ramp-up for new starters.",
            "The employee can see their own KPI data at any time and can ask for corrections.",
            "No disciplinary action is ever triggered automatically by a KPI result.",
            "Any reasonable adjustment agreed for the employee also applies to these targets.",
        ]),
        H2("Agreement"),
        SIG([("Employee", "{{worker.full_name}}", "{{employment.position_title}}", ""),
             ("Manager", "{{employment.reports_to}}", "Line manager", "")],
            statement="Signing confirms that these KPIs have been discussed and agreed."),
    ]


# ── 4. Non-Disclosure Agreement ───────────────────────────────────────────────────────────────────────────────────────
def _nda():
    return [
        H1("Non-Disclosure Agreement"),
        CLAUSE("", "Parties", [
            "This Agreement is made on {{generated_at}} between:",
            "(1) {{employer.legal_name}}, of {{employer.registered_address}} (the **Company**); and",
            "(2) {{worker.full_name}}, of {{worker.postal_address}} (the **Employee**).",
        ]),
        CLAUSE(1, "Purpose", [
            "The Employee will have access to Confidential Information in the role of {{employment.position_title}}.",
            "This Agreement sets out how the Employee must protect that information.",
        ]),
        CLAUSE(2, "Definition of Confidential Information", [
            "Confidential Information means information, in any form, that is not public and that the Employee receives or "
            "creates through the employment. It includes:",
            BUL([
                "business plans, strategies and financial information;",
                "customer, supplier and partner information;",
                "personal data about employees, customers or other people;",
                "software, source code, designs, data models and technical documentation;",
                "product roadmaps, research and unreleased products;",
                "pricing, contracts and commercial terms;",
                "security arrangements, credentials and access methods;",
                "any information marked as confidential, or that a reasonable person would treat as confidential.",
            ]),
        ]),
        CLAUSE(3, "Exclusions", [
            "Confidential Information does not include information that:",
            BUL([
                "is or becomes public, other than through a breach by the Employee;",
                "the Employee lawfully knew before receiving it from the Company;",
                "the Employee lawfully receives from a third party who owes no duty of confidence;",
                "the Employee develops independently without using Confidential Information.",
            ]),
        ]),
        CLAUSE(4, "Employee Obligations", [
            "The Employee must keep Confidential Information secret and secure.",
            "The Employee must use Confidential Information only to perform duties for the Company.",
            "The Employee must not disclose it, except to colleagues or advisers who need it for their work and owe a duty of "
            "confidence.",
            "The Employee must not copy, remove or transfer it outside Company systems unless authorised.",
            "The Employee must follow the Company's information security and acceptable use policies.",
            "The Employee must tell the Company promptly about any actual or suspected loss or unauthorised disclosure.",
        ]),
        CLAUSE(5, "Legally Required Disclosure", [
            "The Employee may disclose Confidential Information when required by law, a court or a competent authority.",
            "Where the law allows, the Employee should tell the Company first, so that it can seek protection. The Employee should "
            "disclose only what is required.",
        ]),
        CLAUSE(6, "Protected Rights", [
            "Nothing in this Agreement limits the Employee's protected rights set out in this clause.",
            HOOK("protected_disclosure_and_whistleblowing"),
            HOOK("trade_secret_immunity_notice"),
        ]),
        CLAUSE(7, "Intellectual Property", [HOOK("confidentiality_and_ip")]),
        CLAUSE(8, "Return of Materials", [
            "When the employment ends, or earlier on request, the Employee must return all Company property and Confidential "
            "Information.",
            "The Employee must delete Company information from personal devices and accounts, and confirm this in writing if asked.",
        ]),
        CLAUSE(9, "Duration", [
            "These obligations apply during the employment and for {{agreement.post_employment_period}} after it ends.",
        ]),
        CLAUSE(10, "Remedies", [HOOK("remedies")]),
        CLAUSE(11, "Data Protection", [HOOK("employee_privacy")]),
        CLAUSE(12, "Governing Law", [HOOK("governing_law")]),
        CLAUSE(13, "Entire Agreement and Severability", [
            "This Agreement, with the Employment Contract, is the whole agreement between the parties on confidentiality.",
            "If any part of this Agreement cannot be enforced, the rest continues to apply.",
            "A change to this Agreement is valid only if it is in writing and signed by both parties.",
        ]),
        SIG([("For the Company", "{{employer.signatory_name}}", "{{employer.signatory_title}}", "{{generated_at}}"),
             ("Employee", "{{worker.full_name}}", "{{employment.position_title}}", "")]),
    ]


# ── 5. Employment Contract ────────────────────────────────────────────────────────────────────────────────────────────
CONTRACT_CLAUSES = [
    (1, "Parties and Definitions"), (2, "Commencement and Continuous Employment"), (3, "Job Title and Duties"),
    (4, "Place of Work and Mobility"), (5, "Hours of Work"), (6, "Remuneration and Deductions"), (7, "Benefits and Expenses"),
    (8, "Holidays and Leave"), (9, "Sickness and Protected Leave"), (10, "Training"), (11, "Probation"),
    (12, "Confidentiality and Intellectual Property"), (13, "Outside Activities"), (14, "Data Protection"), (15, "Policies"),
    (16, "Grievance and Discipline"), (17, "Notice and Termination"), (18, "Post-Termination Restrictions"),
    (19, "Collective Agreements"), (20, "Variation"), (21, "Legal Precedence and No Waiver of Statutory Rights"),
    (22, "Governing Law"), (23, "Entire Agreement"),
]


def _employment_contract():
    body = {
        1: ["This contract is between {{employer.legal_name}}, of {{employer.registered_address}} (the **Company**), and "
            "{{worker.full_name}}, of {{worker.postal_address}} (the **Employee**).",
            "In this contract:",
            BUL(["**Start Date** means {{employment.start_date}};",
                 "**Job Description** means document HR-ORG-005, as updated from time to time;",
                 "**Policies** means the Company's handbook and policies in force from time to time;",
                 "**Schedule 1** means the table of particulars at the end of this contract."])],
        2: ["The employment starts on the Start Date.",
            "The Employee's period of continuous employment began on {{employment.continuous_service_date}}."],
        3: ["The Employee is employed as {{employment.position_title}} in {{employment.department}}, reporting to "
            "{{employment.reports_to}}.",
            "The main duties are set out in the Job Description. The Employee will also carry out other reasonable duties that "
            "fit the role.",
            "The Employee must perform the duties with reasonable care and follow lawful, reasonable instructions."],
        4: ["The normal place of work is {{employment.work_location}}, on a {{employment.work_arrangement}} basis.",
            "The Company may ask the Employee to work at other locations for business needs. It will give reasonable notice and "
            "consider the Employee's circumstances."],
        5: ["The Employee's normal working hours are {{employment.work_pattern}}.", HOOK("working_time")],
        6: ["The Employee's pay is {{employment.pay_terms}}.",
            "Pay is reviewed periodically. A review does not guarantee an increase.",
            "The Company will make the deductions the law requires. Any other deduction needs the Employee's written agreement "
            "where the law requires it."],
        7: ["The Employee may join the benefits described in {{employment.benefits_reference}}, subject to the rules of each scheme.",
            "The Company will repay reasonable business expenses claimed under its expenses policy, with receipts."],
        8: ["The Employee's annual leave entitlement is set out in Schedule 1.", HOOK("leave_and_holiday")],
        9: [HOOK("sickness_and_protected_leave")],
        10: ["The Employee will complete the mandatory training the Company provides.", HOOK("benefits_and_training")],
        11: [HOOK("probation")],
        12: ["The Employee must comply with the Non-Disclosure Agreement (document HR-CON-017), which forms part of this contract.",
             HOOK("confidentiality_and_ip")],
        13: ["The Employee must disclose outside activities as described in the Affidavit of Employment Exclusivity "
             "(document HR-CON-101).", HOOK("outside_employment")],
        14: [HOOK("employee_privacy")],
        15: ["The Employee must follow the Policies. The handbook and its policies are non-contractual unless a policy says "
             "otherwise.", HOOK("policy_status")],
        16: [HOOK("grievance_and_discipline")],
        17: [HOOK("notice_and_termination")],
        18: [HOOK("post_termination_restrictions_if_enforceable")],
        19: [HOOK("collective_instrument")],
        20: ["The Company will tell the Employee in writing about any change to these terms.",
             "A change needs the Employee's agreement, unless the law or this contract allows it without agreement."],
        21: ["Nothing in this contract removes a right the Employee has by law.", HOOK("legal_precedence")],
        22: [HOOK("governing_law")],
        23: ["This contract, Schedule 1, the Job Description and the Non-Disclosure Agreement form the whole agreement on these "
             "terms.",
             "They replace any earlier discussions about these terms."],
    }
    blocks = [
        COVER(["Employment Contract",
               "between {{employer.legal_name}} and {{worker.full_name}}",
               "Contract reference: {{contract.id}}",
               "Date: {{generated_at}}"]),
        H2("Contents"),
        TOC([(n, t) for n, t in CONTRACT_CLAUSES] + [("", "Schedule 1 – Particulars of Employment"), ("", "Signatures")]),
        PB(),
    ]
    for n, t in CONTRACT_CLAUSES:
        blocks.append(CLAUSE(n, t, body[n], anchor=f"cl{n}"))
    blocks += [
        PB(),
        {"t": "anchor", "name": "sched1"},
        H2("Schedule 1 – Particulars of Employment"),
        TABLE(["Item", "Particular"], [
            ["Job title", "{{employment.position_title}}"],
            ["Start date", "{{employment.start_date}}"],
            ["Continuous service date", "{{employment.continuous_service_date}}"],
            ["Base pay", "{{employment.base_pay}}"],
            ["Pay frequency", "{{employment.pay_frequency}}"],
            ["Normal working hours (per week)", "{{employment.working_hours}}"],
            ["Work pattern", "{{employment.work_pattern}}"],
            ["Place of work", "{{employment.work_location}}"],
            ["Work arrangement", "{{employment.work_arrangement}}"],
            ["Annual leave entitlement", "{{employment.leave_entitlement}}"],
        ], widths=[0.4, 0.6]),
        {"t": "anchor", "name": "signatures"},
        H2("Signatures"),
        SIG([("For the Company", "{{employer.signatory_name}}", "{{employer.signatory_title}}", "{{generated_at}}"),
             ("Employee", "{{worker.full_name}}", "{{employment.position_title}}", "")],
            statement="Signed as an agreement. Electronic signature times are recorded on the execution certificate attached "
                      "after signing."),
    ]
    return blocks


# ── 6. Affidavit of Employment Exclusivity ────────────────────────────────────────────────────────────────────────────
def _exclusivity_affidavit():
    return [
        CENTER("AFFIDAVIT OF EMPLOYMENT EXCLUSIVITY"),
        P("I, {{worker.full_name}}, of {{worker.postal_address}}, state as follows:"),
        NUM([
            "I have been offered the role of {{employment.position_title}} with {{employer.legal_name}}, starting on "
            "{{employment.start_date}}.",
            "Apart from the activities I list in Schedule A, I have no other employment, consultancy or business activity that "
            "conflicts with my duties to {{employer.legal_name}}.",
            "I have disclosed all my existing outside activities, paid or unpaid, in Schedule A.",
            "I will ask for written approval before I start any new outside work or business activity.",
            "I am aware of the company's conflict of interest policy and will follow it.",
        ]),
        H3("Schedule A – Disclosed outside activities"),
        P("I complete Schedule A when I sign this affidavit. It lists every outside activity, paid or unpaid, or confirms that I "
          "have none. Schedule A is attached to the signed affidavit and forms part of it."),
        H3("Scope"),
        HOOK("outside_employment_lawful_scope"),
        H3("Declaration of truth"),
        P("I confirm that the statements in this affidavit are true to the best of my knowledge and belief."),
        HOOK("false_statement_consequences"),
        SIG([("Deponent", "{{worker.full_name}}", "{{employment.position_title}}", "")]),
        H3("Witness / Notary / Commissioner for Oaths – if required in jurisdiction"),
        TABLE(["Name", "Title", "Registration number", "Seal", "Date"], [["", "", "", "", ""]],
              widths=[0.24, 0.2, 0.2, 0.2, 0.16]),
        NOTE("Complete this block only where the law of the jurisdiction requires the affidavit to be sworn or witnessed."),
    ]


# ── 7. Voluntary Self-Disclosure Form ─────────────────────────────────────────────────────────────────────────────────
def _self_disclosure():
    pnts = "Prefer not to say"
    return [
        H1("Voluntary Self-Disclosure Form"),
        NOTICE([
            "**Providing this information is entirely voluntary.** You can answer some, all or none of the questions.",
            "Declining to answer has no effect on your employment or on any decision about you.",
            "Your answers are stored separately from your personnel file, and access is restricted.",
            "We use them only for equal-opportunity monitoring and to arrange reasonable adjustments.",
            "Return the completed form to {{employer.hr_contact}}. Do not upload it to your onboarding documents.",
            HOOK("special_category_data_notice"),
        ]),
        CHECKS("1. Gender identity", ["Woman", "Man", "Non-binary", "Prefer to self-describe: ____________", pnts]),
        CHECKS("2. Age band", ["Under 25", "25–34", "35–44", "45–54", "55–64", "65 and over", pnts]),
        CHECKS("3. Ethnicity", [pnts], hook="ethnicity_categories"),
        CHECKS("4. Disability or long-term health condition", ["Yes", "No", pnts]),
        TEXTBOX("5. Reasonable adjustments requested", 3, "Describe any adjustment that would help you at work (optional)."),
        CHECKS("6. Veteran / protected veteran status", [pnts], hook="veteran_categories"),
        CHECKS("7. Sexual orientation", ["Bisexual", "Gay or lesbian", "Heterosexual or straight",
                                         "Prefer to self-describe: ____________", pnts]),
        CHECKS("8. Religion or belief", ["No religion or belief", "Buddhist", "Christian", "Hindu", "Jewish", "Muslim", "Sikh",
                                         "Other: ____________", pnts]),
        CHECKS("9. Caring responsibilities", ["None", "Primary carer of a child or children", "Primary carer of an adult",
                                              "Secondary carer", pnts]),
        H2("Consent to processing"),
        CONSENT("I consent to {{employer.legal_name}} processing the information I have chosen to give on this form, for the "
                "purposes described above.",
                after=["You can withdraw consent at any time by contacting {{employer.hr_contact}}. Withdrawal does not affect "
                       "processing that took place before it."]),
        FIELDS_([("Date", "DD Month YYYY", "e.g. 14 March 2026")], cols=2),
    ]


# ── 8. Job Application Form ───────────────────────────────────────────────────────────────────────────────────────────
def _job_application():
    return [
        H1("Job Application Form"),
        P("Complete every section that applies to you. Fields marked with an example show the format we need."),
        H2("A. Position applied for"),
        FIELDS_([("Job title", "{{employment.position_title}}", ""),
                 ("Vacancy reference", "Enter the reference", "e.g. REQ-ENG-0142"),
                 ("How you heard about the role", "Enter the source", "e.g. company website")]),
        H2("B. Personal details"),
        FIELDS_([("Full name", "{{worker.full_name}}", ""),
                 ("Preferred name", "Enter the name you use", "e.g. Sam"),
                 ("E-mail", "{{worker.email}}", ""),
                 ("Phone", "{{worker.phone}}", ""),
                 ("Address", "Enter your postal address", "e.g. 12 High Street, Town, Postcode")]),
        H2("C. Right to work"),
        CHECKS("Do you have the right to work in {{employment.country}}?", ["Yes", "No"]),
        H2("D. Education and qualifications"),
        TABLE(["Institution", "Qualification", "Subject", "Dates (from – to)", "Grade"],
              [[EX("e.g. City University"), EX("e.g. BSc"), EX("e.g. Computing"), EX("e.g. 2019 – 2022"), EX("e.g. 2:1")]]
              + blank_rows(3, 5), widths=[0.25, 0.2, 0.2, 0.18, 0.17]),
        H2("E. Employment history"),
        TABLE(["Employer", "Job title", "Dates (from – to)", "Duties", "Reason for leaving"],
              blank_rows(4, 5), widths=[0.2, 0.17, 0.16, 0.29, 0.18]),
        TEXTBOX("Gaps in employment", 2, "Explain any gap longer than 3 months, if you wish."),
        H2("F. Skills and certifications"),
        TEXTBOX("Skills and certifications", 3, "e.g. AWS Certified Developer (2024); fluent Spanish"),
        H2("G. Supporting statement"),
        TEXTBOX("Supporting statement (suggested 300–500 words)", 10,
                "Tell us how your skills and experience match the role."),
        H2("H. References"),
        TABLE(["Referee name", "Relationship", "Organisation", "E-mail", "Phone", "Contact before offer? (Y/N)"],
              blank_rows(2, 6), widths=[0.18, 0.15, 0.17, 0.2, 0.14, 0.16]),
        H2("I. Criminal record disclosure"),
        HOOK("criminal_record_question"),
        H2("J. Reasonable adjustments for interview"),
        TEXTBOX("Adjustments", 3, "Tell us about anything that would help you at interview (optional)."),
        H2("K. Declaration"),
        P("I confirm that the information in this form is true and complete to the best of my knowledge."),
        SIG([("Applicant", "{{worker.full_name}}", "Applicant", "")]),
        H2("L. Privacy notice summary"),
        HOOK("applicant_privacy_notice"),
    ]


# ── 9. Daily Work Report ──────────────────────────────────────────────────────────────────────────────────────────────
def _daily_work_report():
    kpi = [[k, t, "", ""] for k, _d, t, _m in KPI_ROWS]
    return [
        H1("Daily Work Report"),
        TABLE(["Employee", "ID", "Position", "Team", "Manager", "Date", "Shift / hours worked (h)"],
              [["{{worker.full_name}}", "{{worker.employee_id}}", "{{employment.position_title}}", "{{employment.department}}",
                "{{employment.reports_to}}", EX("DD Month YYYY"), "{{time.hours_logged}}"]],
              widths=[0.16, 0.1, 0.16, 0.13, 0.15, 0.12, 0.18], compact=True),
        COLUMNS([
            H3("Planned Tasks for Today"),
            TABLE(["#", "Task", "Project / ticket ID", "Priority (H/M/L)", "Est. hours (h)"],
                  [["1", EX("e.g. Fix login timeout"), EX("e.g. PRJ-1042"), EX("H"), EX("2.0")], ["2", "", "", "", ""],
                   ["3", "", "", "", ""]], widths=[0.06, 0.4, 0.22, 0.16, 0.16], compact=True),
            H3("Work Completed"),
            TABLE(["#", "Task", "Status (Done / In progress / Blocked / Deferred)", "Actual hours (h)", "Output or link", "Notes"],
                  [["1", "", "", "", "", ""], ["2", "", "", "", "", ""], ["3", "", "", "", "", ""]],
                  widths=[0.06, 0.26, 0.2, 0.12, 0.18, 0.18], compact=True),
            H3("Blockers and Risks"),
            TABLE(["Blocker", "Impact", "Help needed from", "Raised at (time)"], [["", "", "", ""], ["", "", "", ""]],
                  widths=[0.34, 0.24, 0.24, 0.18], compact=True),
        ], [
            H3("KPI Snapshot"),
            TABLE(["KPI", "Daily target", "Actual", "Note"], kpi, widths=[0.36, 0.22, 0.14, 0.28], compact=True),
            H3("Plan for Next Working Day"),
            TEXTBOX("3–5 bullet points", 1, "• ...  • ...  • ..."),
            H3("Employee comments and manager review"),
            TABLE(["Employee comments", "Reviewed by", "Date", "Manager comments"], [["", "", "", ""]],
                  widths=[0.32, 0.2, 0.14, 0.34], compact=True),
        ]),
    ]


# ── 10. Project Velocity Report ───────────────────────────────────────────────────────────────────────────────────────
def _velocity_report():
    sprints = [[EX(f"Sprint n-{i}") if i else EX("Sprint n"), "", "", "", "", ""] for i in range(5, -1, -1)]
    return [
        H1("Project Velocity Report"),
        FIELDS_([("Project name and code", "Enter project name and code", "e.g. Payroll Revamp – PRJ-022"),
                 ("Team", "Enter team name", "e.g. Platform Squad"),
                 ("Project manager", "Enter name", ""),
                 ("Reporting period", "Sprint number and dates", "e.g. Sprint 14, 03 Nov – 14 Nov 2026"),
                 ("Report date", "DD Month YYYY", ""),
                 ("Prepared by", "Enter name", "")], cols=3),
        H2("Executive Summary"),
        CHECKS("Overall status (RAG)", ["Red", "Amber", "Green"]),
        BUL(["Headline: ______ points completed against ______ committed (______ %).", "", "", ""]),
        H2("Sprint Velocity"),
        TABLE(["Sprint", "Committed points (pts)", "Completed points (pts)", "Completion (%)", "Carry-over points (pts)", "Notes"],
              sprints, widths=[0.14, 0.15, 0.15, 0.12, 0.15, 0.29], total=["Rolling 3-sprint average", "", "", "", "", ""],
              compact=True),
        CHART("Committed vs completed points by sprint",
              "Chart placeholder: add the committed and completed points for the last 6 sprints to generate this chart."),
        COLUMNS([
            H2("Delivery Metrics"),
            TABLE(["Metric", "Value", "Unit", "Notes"], [
                ["Throughput (items done)", "", "items", ""],
                ["Cycle time (median)", "", "days", ""],
                ["Lead time (median)", "", "days", ""],
                ["Defects found / escaped", "", "count", ""],
                ["Scope change (points added mid-sprint)", "", "pts", ""],
            ], widths=[0.4, 0.15, 0.13, 0.32], compact=True),
        ], [
            H2("Milestones"),
            TABLE(["Milestone", "Planned date", "Forecast date", "Status", "Owner"], blank_rows(4, 5),
                  widths=[0.32, 0.17, 0.17, 0.14, 0.2], compact=True),
        ]),
        H2("Risks and Issues"),
        TABLE(["ID", "Description", "Likelihood (L/M/H)", "Impact (L/M/H)", "Mitigation", "Owner", "Due date"],
              blank_rows(4, 7), widths=[0.06, 0.26, 0.1, 0.1, 0.24, 0.12, 0.12], compact=True),
        COLUMNS([
            H2("Team Capacity"),
            TABLE(["Team member", "Available days (d)", "Planned leave (d)", "Allocation (%)"], blank_rows(4, 4),
                  widths=[0.4, 0.2, 0.2, 0.2], total=["Team total", "", "", ""], compact=True),
            NOTE("Capacity is reported at team level. Individuals are not ranked or scored."),
        ], [
            H2("Next Sprint Plan"),
            TEXTBOX("Next sprint plan", 2, "Sprint goal, committed scope and known dependencies."),
            H2("Decisions Needed"),
            TEXTBOX("Decisions needed", 2, "Decision, who decides, and by when."),
        ]),
        H2("Sign-off"),
        SIG([("Project manager", "", "Project manager", ""), ("Department head", "", "Department head", "")]),
    ]


# ── the package ───────────────────────────────────────────────────────────────────────────────────────────────────────
# mode: SIGN (e-signature), ACKNOWLEDGE (receipt in the portal), COMPLETE (download, complete, upload for HR review),
#       VOLUNTARY (optional; never blocks onboarding), INFO (reference template; no action needed now)
DOCUMENT_INDEX = [
    # category, title, template_id, family, type, risk, sensitivity, mode, orientation, pages, signers, builder
    ("offer_letter", "Offer Letter", "HR-HIR-011", "HR-HIR", "LETTER_NOTICE", "L2", "C2", "SIGN", "portrait", "1–2",
     "Employer (issues); Candidate (accepts)", _offer_letter),
    ("job_description", "Job Description", "HR-ORG-005", "HR-ORG", "RECORD", "L1", "C1", "ACKNOWLEDGE", "portrait", "2",
     "Employee and manager (acknowledgement)", _job_description),
    ("daily_kpi", "Daily Key Performance Indicators", "HR-PRF-101", "HR-PRF", "ASSESSMENT", "L1", "C2", "ACKNOWLEDGE",
     "portrait", "1–2", "Employee and manager (agreement)", _daily_kpi),
    ("nda", "Non-Disclosure Agreement", "HR-CON-017", "HR-CON", "AGREEMENT", "L3", "C3", "SIGN", "portrait", "3–4",
     "Employer; Employee", _nda),
    ("employment_contract", "Employment Contract", "HR-CON-001", "HR-CON", "AGREEMENT", "L3", "C3", "SIGN", "portrait", "6–10",
     "Employer; Employee", _employment_contract),
    ("exclusivity_affidavit", "Affidavit of Employment Exclusivity", "HR-CON-101", "HR-CON", "AGREEMENT", "L3", "C3", "SIGN",
     "portrait", "1–2", "Deponent; witness or notary if required", _exclusivity_affidavit),
    ("self_disclosure", "Voluntary Self-Disclosure Form", "HR-REC-101", "HR-REC", "FORM", "L2", "C4", "VOLUNTARY", "portrait",
     "1–2", "No signature (date only)", _self_disclosure),
    ("job_application", "Job Application Form", "HR-HIR-005", "HR-HIR", "FORM", "L2", "C3", "COMPLETE", "portrait", "3–4",
     "Applicant (declaration)", _job_application),
    ("daily_work_report", "Daily Work Report (DWR)", "HR-TIM-101", "HR-TIM", "RECORD", "L1", "C2", "INFO", "landscape",
     "1 (landscape)", "Employee; manager review", _daily_work_report),
    ("velocity_report", "Project Velocity Report", "HR-PRF-102", "HR-PRF", "RECORD", "L1", "C2", "INFO", "landscape",
     "2–3 (landscape)", "Project manager; department head", _velocity_report),
]

# Fields that are optional in one particular document (printed empty when missing). The offer letter goes out before the
# candidate has entered an address in the portal; the NDA, contract and affidavit still need it.
OPTIONAL_BY_DOC = {"offer_letter": {"worker.postal_address"}}

MODE_LABELS = {"SIGN": "E-signature", "ACKNOWLEDGE": "Acknowledge receipt", "COMPLETE": "Complete and return",
               "VOLUNTARY": "Voluntary", "INFO": "For information"}


def documents() -> list[dict]:
    out = []
    for (cat, title, tid, fam, typ, risk, sens, mode, orient, pages, signers, builder) in DOCUMENT_INDEX:
        out.append({"category": cat, "title": title, "template_id": tid, "family_id": fam, "doc_type": typ, "risk": risk,
                    "sensitivity": sens, "mode": mode, "orientation": orient, "pages": pages, "signers": signers,
                    "builder": builder})
    return out


DOCS = {d["category"]: d for d in documents()}
CATEGORIES = [d["category"] for d in documents()]


def blocks_for(category: str) -> list[dict]:
    return DOCS[category]["builder"]()


def _strings(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        if obj.get("t") == "hook":
            yield "{{clause:%s}}" % obj["key"] if obj["key"] != "required_clause_block" else "{{required_clause_block}}"
        if obj.get("t") == "checks" and obj.get("hook"):
            yield "{{clause:%s}}" % obj["hook"]
        if obj.get("t") == "activities":
            yield "{{worker.outside_activities}}"
        for v in obj.values():
            yield from _strings(v)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            yield from _strings(v)


def tokens_in(category: str) -> list[str]:
    """Every placeholder token used by one document, in first-use order (e.g. 'worker.full_name', 'clause:probation')."""
    seen: dict[str, None] = {}
    for s in _strings(blocks_for(category)):
        for m in TOKEN_RE.finditer(s):
            seen.setdefault(m.group(1), None)
    return list(seen)


def dictionary() -> list[dict]:
    """The Placeholder Dictionary appendix: every {{field}} and {{clause:…}} used, with where it comes from."""
    used: dict[str, list[str]] = {}
    for cat in CATEGORIES:
        for tok in tokens_in(cat):
            used.setdefault(tok, []).append(DOCS[cat]["template_id"])
    rows = []
    for tok, ids in used.items():
        ck = clause_key(tok)
        if ck:
            title, _note, req = CLAUSES[ck]
            rows.append({"placeholder": "{{%s}}" % tok, "meaning": title, "source": COUNSEL, "required": req, "used_in": ids})
        else:
            meaning, source, req, _fb = FIELDS[tok]
            rows.append({"placeholder": "{{%s}}" % tok, "meaning": meaning, "source": source, "required": req, "used_in": ids})
    rows.sort(key=lambda r: (r["source"] == COUNSEL, r["placeholder"]))
    return rows
