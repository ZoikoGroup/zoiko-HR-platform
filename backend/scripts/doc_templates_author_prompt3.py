"""Authoring source for the Prompt 3 starter seeds (policies, leave, working time, compensation — 28 templates).

    python scripts/doc_templates_author_prompt3.py      # (re)writes app/modules/doc_templates/seeds/content/...

Same rules as Prompt 2 (scripts/doc_templates_author_prompt2.py): the JSON seed files are what the engine loads; this script keeps
their shared structure readable. Starters never invent statutory entitlements, amounts, limits or notice periods: wherever the
law decides, the content uses a jurisdiction clause, and clauses listed in `no_starter_text` must be written per jurisdiction and
released before the templates that require them can be generated.
"""
from __future__ import annotations

import json
from pathlib import Path

from doc_templates_author_prompt2 import C, D, EQ, FG, H, IN, L, LH, OUT, P, PRESENT, T  # noqa: F401  (shared block helpers)

STARTERS: dict[str, dict] = {}


def starter(cid, *, output_mode, execution_mode, audience, approval_policy, required, optional=(), mandatory=(), optional_clauses=(),
            prohibited=(), blocks, reminder_days=(), response_days=None):
    STARTERS[cid] = {
        "canonical_id": cid, "output_mode": output_mode, "execution_mode": execution_mode, "audience": audience,
        "approval_policy": approval_policy,
        "field_contract": {"required": list(required), "optional": [k for k in optional if k not in required]},
        "clause_rules": {"mandatory": list(mandatory), "optional": list(optional_clauses), "prohibited": list(prohibited)},
        "blocks": blocks, "locked_block_ids": [b["id"] for b in blocks if b.get("locked")],
        "email_attachment_allowed": False, "reminder_days": list(reminder_days), "response_days": response_days,
    }


# ═══ A. POLICIES ════════════════════════════════════════════════════════════════════════════════════════════════════
# Meta for all 14: POLICY | ACKNOWLEDGE (a distribution may require SIGN) | EMPLOYEE | L1 to publish a released version.
# Releasing a variant is the L2 step (author ≠ releaser), enforced by the content lifecycle.

POLICY_REQUIRED = ["policy.title", "policy.version", "policy.effective_from", "policy.owner_name", "policy.contact", "org.display_name"]
POLICY_OPTIONAL = ["policy.review_due", "policy.scope_statement", "policy.change_summary", "employer.legal_name"]

RIGHTS_POLICY_STATUS = P("This policy explains how we work. Unless your contract says otherwise, it does not form part of your contract of "
                         "employment and we may update it from time to time, following any consultation the law requires. Nothing in "
                         "this policy reduces your rights under the law or any applicable collective agreement.", id="rights_policy_status")
RIGHTS_SPEAK_UP = P("If you have questions or concerns about this policy, speak to your manager or {{policy.contact}}. You will not be "
                    "treated unfairly for raising a genuine concern.", id="rights_speak_up")


def policy_header():
    return [
        H("{{policy.title}}"),
        FG(["policy.owner_name", "policy.version", "policy.effective_from", "policy.review_due", "policy.scope_statement"],
           labels={"policy.owner_name": "Policy owner", "policy.version": "Version", "policy.effective_from": "Effective from",
                   "policy.review_due": "Next review", "policy.scope_statement": "Applies to"}),
        P("What changed in this version: {{policy.change_summary}}", when=PRESENT("policy.change_summary"), style="notice"),
    ]


def policy(cid, sections, *, required=(), optional=(), mandatory=(), optional_clauses=()):
    """sections: [(heading, [blocks])]; numbered "1. Purpose" … "N. Related policies and contact" and closed by the locked blocks."""
    blocks = policy_header()
    for n, (heading, body) in enumerate(sections, start=1):
        blocks.append(H(f"{n}. {heading}", 2))
        blocks.extend(body)
    blocks += [RIGHTS_POLICY_STATUS, RIGHTS_SPEAK_UP]
    starter(cid, output_mode="POLICY", execution_mode="ACKNOWLEDGE", audience="EMPLOYEE", approval_policy="L1",
            required=POLICY_REQUIRED + list(required), optional=POLICY_OPTIONAL + list(optional), mandatory=mandatory,
            optional_clauses=optional_clauses, blocks=blocks, reminder_days=(7, 1), response_days=14)


def related(text):
    return ("Related policies and contact", [P(text), P("Questions about this policy go to {{policy.contact}}.")])


policy("HR-POL-001", [
    ("Welcome", [P("Welcome to {{org.display_name}}. This handbook brings together the main things you need to know about working here "
                   "and points you to our detailed policies.")]),
    ("How to use this handbook", [P("The handbook is a guide. Where a separate policy exists, that policy contains the full rules. If "
                                    "anything in this handbook conflicts with your contract, a collective agreement or the law, the "
                                    "contract, agreement or law applies.")]),
    ("Our values and standards", [P("We expect everyone to act honestly, treat colleagues, customers and partners with respect, follow "
                                    "the law and our policies, and speak up when something is wrong. Our Code of Conduct sets out these "
                                    "standards in full.")]),
    ("Your employment", [L(["Your contract or written statement sets out your main terms of employment.",
                            "New employees normally complete a probation period, explained in our Probation Policy.",
                            "Your working hours and pattern are covered by our Working Hours Policy.",
                            "Recording attendance and reporting absence are covered by our Attendance Policy.",
                            "Remote and hybrid working are covered by our Remote Work Policy."])]),
    ("Pay and benefits", [P("You will receive pay statements as required by law through our payroll provider. Questions about pay go to "
                            "{{policy.contact}}.")]),
    ("Time off", [L(["Annual leave: see our Annual Leave Policy and your leave balance in Zoiko HR.",
                     "Sickness absence: see our Sick Leave Policy.",
                     "Maternity, paternity, adoption and parental leave: see our Family and Parental Leave Policy."]),
                  P("We observe the public holidays listed in the holiday calendar for your work location.")]),
    ("Conduct, concerns and complaints", [P("Our Code of Conduct explains the behaviour we expect. If you have a concern or a complaint "
                                            "about your work, raise it with your manager or HR so that it can be looked at fairly and "
                                            "promptly. You can raise a concern without fear of being treated unfairly.")]),
    ("Equality and respect", [P("We do not tolerate discrimination, harassment, bullying or victimisation.")]),
    ("Health, safety and wellbeing", [P("Report accidents, near misses and hazards to your manager straight away."),
                                      P("If you need support with your health or wellbeing at work, talk to your manager or HR.")]),
    ("Information, privacy and security", [L(["Handle personal data in line with our Employee Data Protection Policy.",
                                              "Use company systems and devices in line with our Acceptable Use Policy.",
                                              "Look after company equipment in line with our Company Property Policy."])]),
    ("Travel and expenses", [P("Business travel and expense claims are covered by our Business Travel Policy and our Expenses and "
                               "Reimbursement Policy.")]),
    ("Leaving us", [P("Give notice as set out in your contract and return company property before your last day.")]),
    ("Jurisdiction annex", [C("handbook_local_annex", required=False)]),
], optional_clauses=["handbook_local_annex"])

policy("HR-POL-002", [
    ("Purpose", [P("This code sets the standards of behaviour we expect from everyone who works for or on behalf of {{org.display_name}}.")]),
    ("Who it applies to", [P("Employees, interns, contractors and agency workers while working with us.")]),
    ("Our standards", [L(["Act honestly and with integrity.", "Treat everyone with dignity and respect.", "Follow the law and our policies.",
                          "Avoid conflicts of interest and declare them when they arise.", "Protect confidential information and personal data.",
                          "Use company property and systems properly.", "Never offer or accept bribes.", "Keep accurate records.",
                          "Speak up about wrongdoing."])]),
    ("Respect at work", [P("We do not tolerate discrimination, harassment, bullying or victimisation, whether in person, in writing or "
                           "online, at work or at work-related events."),
                         L(["Offensive jokes, comments or images.", "Unwanted physical contact or sexual attention.",
                            "Intimidating, excluding or undermining someone.", "Treating someone less favourably because of who they are.",
                            "Retaliating against someone who has raised a concern."])]),
    ("Conflicts of interest", [P("Declare any outside work, close personal relationship, investment or other interest that may conflict, "
                                 "or appear to conflict, with your work for us. Tell your manager or HR in writing as soon as it arises so "
                                 "that it can be managed. Declaring a conflict is not wrongdoing; hiding one may be.")]),
    ("Gifts and hospitality", [P("Gifts and hospitality must be reasonable, proportionate and transparent, and must never be intended to "
                                 "influence a business decision. Never give or accept cash or cash equivalents. If in doubt, ask before "
                                 "accepting and record what you received.")]),
    ("Confidentiality and data", [P("Keep confidential information and personal data secure, use it only for the purpose it was given for, "
                                    "and share it only with people who need it. See our Employee Data Protection Policy.")]),
    ("Use of social media in a personal capacity", [P("When using social media personally, do not disclose confidential information and "
                                                      "do not harass or abuse colleagues, customers or partners. Make clear that your "
                                                      "views are your own.")]),
    ("Speaking up", [P("If you see or suspect wrongdoing, report it to your manager, HR or {{policy.contact}}. We will look into genuine "
                       "concerns and will not tolerate retaliation against anyone who speaks up.")]),
    ("Breaches", [P("Breaches may be dealt with under our disciplinary procedure, following a fair process.")]),
    related("Employee Handbook; Employee Data Protection Policy; Acceptable Use Policy; Company Property Policy."),
])

policy("HR-POL-004", [
    ("Purpose", [P("This policy supports reliable attendance and fair, consistent handling of absence.")]),
    ("Recording attendance", [P("Record your working time using {{org.display_name}}'s attendance system (check-in/check-out) unless your "
                                "role is exempt. Do not record time for anyone else.")]),
    ("Lateness", [P("If you will be late, tell your manager as early as possible and before your start time where you can.")]),
    ("Unplanned absence", [P("If you cannot come to work, notify your manager {{policy.absence_notification_rule}}.")]),
    ("Unauthorised absence", [P("If you are absent without telling us, we will try to contact you, including through your emergency "
                                "contact if we are worried about your welfare.")]),
    ("Correcting records", [P("If your attendance record is wrong, use the attendance correction request in Zoiko HR. The original "
                              "record is kept for audit purposes.")]),
    ("Absence review", [P("Patterns of absence are discussed supportively first, to understand what is happening and whether we can "
                          "help. Adjustments for disability or health conditions are considered.")]),
    ("Local rules", [C("attendance_local_rules", required=False)]),
    related("Sick Leave Policy; Working Hours Policy."),
], required=["policy.absence_notification_rule"], optional_clauses=["attendance_local_rules"])

policy("HR-POL-005", [
    ("Purpose", [P("Probation is a two-way period to confirm that the role is right for you and that you are right for the role, and to "
                   "give you the support you need to succeed.")]),
    ("Length", [P("Your probation length is stated in your contract. It is {{policy.default_probation_months}} months unless your contract "
                  "says otherwise."), C("probation_legal_limits")]),
    ("Objectives and support", [P("Your manager will agree objectives with you in your first weeks, hold regular one-to-ones and arrange "
                                  "the training you need.")]),
    ("Reviews", [P("Reviews take place on the dates in your probation schedule. Any concerns are raised early, with examples and a fair "
                   "chance to improve.")]),
    ("Outcomes", [L(["Confirmation of your employment.",
                     "An extension, where your contract and the law allow it, with clear reasons and objectives.",
                     "Ending your employment after a fair review."])]),
    ("Absence during probation", [P("If you are absent for a significant part of your probation, it may be extended where your contract "
                                    "and the law permit, so that you have a fair opportunity to show what you can do.")]),
    ("Your rights", [P("Being on probation does not remove your legal rights, including protection from discrimination.", id="rights_probation")]),
    related("Employee Handbook; Code of Conduct."),
], required=["policy.default_probation_months"], mandatory=["probation_legal_limits"])

policy("HR-POL-019", [
    ("Purpose", [P("This policy explains working hours, breaks, overtime and how time is recorded.")]),
    ("Normal hours", [P("Your normal hours and working pattern are set out in your contract or offer. Standard working day for timekeeping: "
                        "{{policy.standard_workday_hours}} hours.")]),
    ("Breaks", [C("rest_breaks")]),
    ("Overtime", [P("Overtime must be approved in advance using an overtime authorization unless there is an emergency."),
                  C("overtime_pay_or_time_off")]),
    ("Maximum working time", [C("maximum_working_time")]),
    ("Night and shift work", [P("If you work shifts, you will receive a written shift pattern notice, and a shift change notice when "
                                "your pattern changes.")]),
    ("Recording time", [P("Record your working time accurately in the attendance system. Never record time for someone else.")]),
    ("Flexibility requests", [P("You can ask for a change to your hours, times or place of work. Talk to your manager or HR; every "
                                "request is considered and answered in writing.")]),
    related("Attendance Policy; Remote Work Policy; Annual Leave Policy."),
], required=["policy.standard_workday_hours"], mandatory=["rest_breaks", "overtime_pay_or_time_off", "maximum_working_time"])

policy("HR-POL-021", [
    ("Purpose", [P("This policy explains how remote and hybrid working is requested, agreed and supported.")]),
    ("Eligibility", [P("Remote work depends on whether the role is suitable, on performance and on manager approval. Any employee can "
                       "ask.")]),
    ("Requesting remote work", [P("Make your request in Zoiko HR. You will receive a written decision.")]),
    ("Working location", [P("You must work from the country and location agreed with us. Working from another country, even for a short "
                            "time, requires prior HR approval because of tax, immigration and employment law. Your location is never "
                            "decided from your IP address, VPN or nationality."),
                          C("cross_border_remote_work", required=False)]),
    ("Equipment and costs", [P("Company equipment is issued and returned in line with our Company Property Policy."),
                             P("Support with remote working costs: {{policy.remote_cost_support}}", when=PRESENT("policy.remote_cost_support"))]),
    ("Health and safety at home", [P("Complete the home-working self-assessment, keep your workspace safe, and report any problems or "
                                     "injuries to your manager.")]),
    ("Information security", [L(["Use secure Wi-Fi, never open public networks for work without the company VPN.",
                                 "Lock your screen whenever you step away.",
                                 "Do not print confidential information at home unless this has been approved.",
                                 "Follow our Acceptable Use Policy."])]),
    ("Availability and communication", [P("Be available during core hours: {{policy.core_hours}}.", when=PRESENT("policy.core_hours")),
                                        P("Keep your calendar and status up to date so colleagues know how to reach you.")]),
    ("Wellbeing and the right to switch off", [P("Outside your working hours you are not expected to read or reply to work messages, "
                                                 "except in a genuine emergency or where your contract says otherwise, and where the law "
                                                 "gives you a right to disconnect we respect it.")]),
    ("Ending or changing arrangements", [P("Remote arrangements can be changed or ended with reasonable notice, in line with your contract "
                                           "and the written decision you received.")]),
    related("Working Hours Policy; Acceptable Use Policy; Company Property Policy; Employee Data Protection Policy."),
], optional=["policy.remote_cost_support", "policy.core_hours"], optional_clauses=["cross_border_remote_work"])

policy("HR-POL-025", [
    ("Purpose", [P("This policy explains how annual leave is requested, approved and recorded.")]),
    ("Entitlement", [P("Your annual leave entitlement is set out in your contract and shown in your leave balance in ESS."),
                     C("statutory_annual_leave")]),
    ("Leave year", [P("The leave year is {{policy.leave_year_label}}.")]),
    ("Requesting leave", [P("Request leave in ESS at least {{policy.annual_leave_notice_days}} days ahead. Every decision is recorded and "
                            "you can see it with your request.")]),
    ("How decisions are made", [P("We consider business cover and a fair rota, and decide on a first-come basis where requests clash. If a "
                                  "request is refused, we give the reason and suggest alternatives.")]),
    ("Carry-over", [C("annual_leave_carry_over")]),
    ("Public holidays", [P("Public holidays follow the holiday calendar for your work location.")]),
    ("Sickness during leave", [C("sickness_during_leave", required=False)]),
    ("Leave on leaving", [C("leave_on_termination")]),
    ("Part-time workers", [P("Part-time workers receive leave on a pro-rata basis.")]),
    related("Sick Leave Policy; Family and Parental Leave Policy; Working Hours Policy."),
], required=["policy.leave_year_label", "policy.annual_leave_notice_days"],
    mandatory=["statutory_annual_leave", "annual_leave_carry_over", "leave_on_termination"], optional_clauses=["sickness_during_leave"])

policy("HR-POL-026", [
    ("Purpose", [P("This policy explains how we support you when you are ill, and how we handle sickness absence fairly and privately.")]),
    ("Telling us", [P("Tell your manager on the first day of absence, as explained in our Attendance Policy. We will confirm that we have "
                      "received your notification.")]),
    ("Evidence", [P("If you are absent for more than {{policy.self_certification_days}} days we may ask for evidence as allowed by law."),
                  C("sickness_evidence_rules")]),
    ("Sick pay", [C("sick_pay")]),
    ("Keeping in touch", [P("Your manager may keep in reasonable contact while you are off, respecting your recovery.")]),
    ("Return to work", [P("When you come back we will have a short conversation about how you are and whether any adjustments would "
                          "help.")]),
    ("Privacy", [P("Health information is sensitive. Only the people who need it will see it, and we will not record diagnoses in your "
                   "general HR file. Your manager sees only what is needed to plan work.", id="privacy_health")]),
    ("Long-term absence and adjustments", [P("If you are absent for a long time, we will support you and, where available, seek "
                                             "occupational health advice about adjustments that could help you return.")]),
    related("Attendance Policy; Annual Leave Policy; Employee Data Protection Policy."),
], required=["policy.self_certification_days"], mandatory=["sickness_evidence_rules", "sick_pay"])

policy("HR-POL-027", [
    ("Purpose", [P("This policy explains family leave and how we support you before, during and after it.")]),
    ("Types covered", [P("Maternity, paternity or partner, adoption, and shared or parental leave where the law provides it."),
                       C("family_leave_entitlements")]),
    ("Notifying us", [P("Use the family leave request in Zoiko HR, within the timings set out above.")]),
    ("Pay", [C("family_leave_pay")]),
    ("Keeping in touch", [P("You and your manager can agree reasonable contact during your leave, and keeping-in-touch days where these "
                            "are available.")]),
    ("Returning to work", [P("Your right to return is as set out above. You can also ask for flexible working when you come back.")]),
    ("Protection", [P("You will not be treated unfavourably because you are pregnant, take family leave, or ask to.", id="rights_family")]),
    ("Health and safety for pregnant and breastfeeding employees", [P("We carry out a risk assessment and make reasonable adjustments to "
                                                                      "protect you and your baby.")]),
    related("Annual Leave Policy; Working Hours Policy."),
], mandatory=["family_leave_entitlements", "family_leave_pay"])

policy("HR-POL-030", [
    ("Purpose", [P("This policy explains how you must handle the personal data of colleagues, candidates and customers. A separate "
                   "employee privacy notice explains how we handle your own data.")]),
    ("Principles", [L(["Lawful, fair and transparent.", "Used only for specified purposes.", "Limited to what is needed.", "Accurate.",
                       "Kept no longer than needed.", "Kept secure."])]),
    ("Your responsibilities", [L(["Access only the personal data you need for your work.", "Never share your passwords.",
                                  "Do not put personal data in personal e-mail or chat tools.", "Lock your screen when you step away.",
                                  "Report incidents straight away."])]),
    ("AI tools", [P("Do not paste personal or confidential data into tools that are not approved by {{org.display_name}}.")]),
    ("Data breaches", [P("Report any actual or suspected data breach immediately to {{policy.privacy_contact}}. Do not try to investigate "
                         "yourself.")]),
    ("Requests from individuals", [P("Forward access, correction or deletion requests to {{policy.privacy_contact}} the same day.")]),
    ("International transfers", [C("data_transfers", required=False)]),
    ("Breaches of this policy", [P("Breaches may be dealt with under our disciplinary procedure, following a fair process.")]),
    related("Acceptable Use Policy; Code of Conduct."),
], required=["policy.privacy_contact"], optional_clauses=["data_transfers"])

policy("HR-POL-031", [
    ("Purpose", [P("This policy covers the use of company systems, devices, e-mail, internet, software and AI tools.")]),
    ("Acceptable use", [P("Company systems are for business use. Limited personal use is allowed if it does not interfere with your work "
                          "or breach other policies.")]),
    ("Not allowed", [L(["Illegal, offensive or harassing content.", "Sharing your credentials.", "Installing unapproved software.",
                        "Bypassing security controls.", "Copying company data to personal storage.",
                        "Using unapproved AI tools with company data."])]),
    ("Passwords and multi-factor authentication", [P("Use strong, unique passwords and multi-factor authentication wherever it is "
                                                     "offered. Never share codes.")]),
    ("E-mail and messaging", [P("Write as you would in any business communication. Check recipients before sending confidential "
                                "information.")]),
    ("Monitoring", [C("monitoring_notice")]),
    ("Reporting incidents and lost devices", [P("Report security incidents and lost or stolen devices to {{policy.contact}} immediately.")]),
    ("Breaches", [P("Breaches may be dealt with under our disciplinary procedure, following a fair process.")]),
    related("Employee Data Protection Policy; Company Property Policy; Remote Work Policy."),
], mandatory=["monitoring_notice"])

policy("HR-POL-041", [
    ("Purpose", [P("This policy explains how business travel is approved, booked and kept safe.")]),
    ("Approval before travel", [P("Submit a travel request in Zoiko HR and wait for approval before booking.")]),
    ("Booking", [P("Class of travel and accommodation: {{policy.travel_class_rules}}")]),
    ("Safety and insurance", [P("Check official travel advice before you go and carry your emergency contacts."),
                              P("Travel assistance: {{policy.travel_assistance_contact}}", when=PRESENT("policy.travel_assistance_contact"))]),
    ("International travel", [P("You are responsible for a valid passport and any visa you need. Working while abroad may need approval "
                                "under our Remote Work Policy.")]),
    ("Expenses", [P("Claim expenses in line with our Expenses and Reimbursement Policy.")]),
    ("Duty of care", [P("Tell us if you feel unsafe. You may decline travel to high-risk areas without penalty where reasonable.")]),
    related("Expenses and Reimbursement Policy; Remote Work Policy."),
], required=["policy.travel_class_rules"], optional=["policy.travel_assistance_contact"])

policy("HR-POL-042", [
    ("Purpose", [P("This policy explains which business expenses we reimburse and how to claim them.")]),
    ("What we reimburse", [P("Reasonable, necessary business expenses within these limits: {{policy.expense_limits_summary}}")]),
    ("What we do not reimburse", [L(["Personal items.", "Fines.", "Alcohol, unless pre-approved for client entertainment.",
                                     "Upgrades that were not approved."])]),
    ("Claims", [P("Submit your claim in Zoiko HR within {{policy.claim_deadline_days}} days, with receipts. You will receive a written "
                  "decision.")]),
    ("Approval", [P("Claims are approved by your manager, then by finance where our settings require it. Nobody can approve their own "
                    "claim.")]),
    ("Payment", [P("Approved amounts are paid through payroll or accounts payable, following our usual payment process.")]),
    ("Tax", [C("expense_tax_treatment", required=False)]),
    ("Misuse", [P("Misuse may lead to disciplinary action and recovery of the amounts involved, as permitted by law.")]),
    related("Business Travel Policy; Code of Conduct."),
], required=["policy.expense_limits_summary", "policy.claim_deadline_days"], optional_clauses=["expense_tax_treatment"])

policy("HR-POL-043", [
    ("Purpose", [P("This policy explains how company property is issued, looked after and returned.")]),
    ("What counts as company property", [P("Equipment, devices, ID cards, keys, vehicles, documents and data.")]),
    ("Issue and records", [P("Equipment is issued with an equipment issuance form and recorded in our asset register.")]),
    ("Care and security", [P("Keep company property safe and do not lend it to anyone. Report loss, theft or damage immediately.")]),
    ("Personal use", [P("Limited personal use is allowed as set out in our Acceptable Use Policy.")]),
    ("Return", [P("Return company property when we ask, when it is replaced, and before your last day.")]),
    ("Deductions", [P("We will not deduct money from your pay for lost or damaged property unless the law allows it and you have agreed in "
                      "writing where required.", id="rights_deductions")]),
    related("Acceptable Use Policy; Remote Work Policy."),
])


# ═══ B. LEAVE ═══════════════════════════════════════════════════════════════════════════════════════════════════════

starter("HR-LEV-001", output_mode="FORM_RECORD", execution_mode="NONE", audience="EMPLOYEE", approval_policy="L1",
        required=["worker.full_name", "leave.type_label", "leave.start_date", "leave.end_date", "leave.days", "leave.requested_at",
                  "leave.decision_status_label", "leave.decided_by", "leave.decided_at"],
        optional=["leave.balance_before", "leave.balance_after", "leave.decision_reason", "leave.handover_note"],
        mandatory=["leave_rights_statement"],
        blocks=[
            H("Leave Request — {{leave.type_label}}"),
            FG(["worker.full_name", "leave.start_date", "leave.end_date", "leave.days", "leave.requested_at"],
               labels={"worker.full_name": "Employee", "leave.days": "Working days", "leave.requested_at": "Requested on"}),
            H("Balance", 2, include_when=PRESENT("leave.balance_before")),
            FG(["leave.balance_before", "leave.balance_after"], labels={"leave.balance_after": "Balance after (if approved)"}),
            H("Cover and handover", 2, include_when=PRESENT("leave.handover_note")),
            P("{{leave.handover_note}}", when=PRESENT("leave.handover_note")),
            H("Decision", 2),
            FG(["leave.decision_status_label", "leave.decided_by", "leave.decided_at", "leave.decision_reason"],
               labels={"leave.decision_status_label": "Status", "leave.decision_reason": "Reason"}),
            P("{{required_clause_block}}"),
            P("A leave record cannot be closed while a legal eligibility question is unresolved.", style="small"),
        ])

starter("HR-LEV-003", output_mode="DOCUMENT", execution_mode="NONE", audience="EMPLOYEE", approval_policy="L1",
        required=["worker.first_name", "leave.start_date"], optional=["leave.return_date"],
        mandatory=["sickness_evidence_reminder"],
        blocks=[
            H("We have received your sickness absence notification"),
            P("Dear {{worker.first_name}}, thank you for letting us know that you are unwell. We have recorded your absence starting "
              "{{leave.start_date}}."),
            P("You expect to return on {{leave.return_date}}.", when=PRESENT("leave.return_date")),
            P("Please keep your manager updated if anything changes. {{clause:sickness_evidence_reminder}}"),
            P("You do not need to tell your manager your diagnosis. Any medical evidence you give us is stored securely and seen only by "
              "people who need it.", id="privacy_health"),
            P("We wish you a speedy recovery."),
        ])

starter("HR-LEV-007", output_mode="FORM_RECORD", execution_mode="ACKNOWLEDGE", audience="EMPLOYEE", approval_policy="L2",
        required=["worker.full_name", "leave.confirmed_start", "leave.expected_return", "leave.confirmed_by", "leave.confirmed_at"],
        optional=["leave.pay_summary"],
        mandatory=["family_leave_notice_requirements", "family_leave_entitlements"],
        blocks=[
            H("Family Leave Request"),
            FG(["worker.full_name"], labels={"worker.full_name": "Employee"}),
            {"type": "form_fields", "id": "family_leave_fields", "fields": [
                {"key": "parental_type", "label": "Type of leave", "type": "select", "required": True,
                 "options": ["maternity", "paternity_partner", "adoption", "shared_parental"]},
                {"key": "expected_date", "label": "Expected week of childbirth or placement", "type": "date", "required": True},
                {"key": "start_date", "label": "Proposed start", "type": "date", "required": True},
                {"key": "end_date", "label": "Proposed end or return", "type": "date"},
                {"key": "pay_option", "label": "Pay option (where offered)", "type": "text"},
                {"key": "kit_days_interest", "label": "Interested in keep-in-touch days", "type": "checkbox"}]},
            P("Evidence: we may ask for the evidence the law permits (for example a certificate of expected birth or matching certificate). "
              "Please do not upload more medical information than requested.", id="privacy_family_evidence", style="notice"),
            C("family_leave_notice_requirements"),
            H("HR confirmation", 2),
            FG(["leave.confirmed_start", "leave.expected_return", "leave.pay_summary", "leave.confirmed_by", "leave.confirmed_at"],
               labels={"leave.confirmed_start": "Confirmed start", "leave.expected_return": "Expected return", "leave.pay_summary": "Pay summary",
                       "leave.confirmed_by": "Confirmed by", "leave.confirmed_at": "Date"}),
            C("family_leave_entitlements"),
            P("You will not be treated unfavourably for requesting or taking family leave.", id="rights_family"),
            D("I confirm I have received and read this document.", id="declaration"),
        ])

starter("HR-LEV-013", output_mode="FORM_RECORD", execution_mode="NONE", audience="EMPLOYEE", approval_policy="L1",
        required=["worker.full_name", "leave.decision_status_label", "leave.decided_by", "leave.decided_at"],
        optional=["policy.eap_contact"], optional_clauses=["bereavement_entitlement"],
        blocks=[
            H("Bereavement Leave"),
            P("We are very sorry for your loss. Please tell us the dates you need; you do not have to give us details you do not want to "
              "share.", id="privacy_bereavement"),
            {"type": "form_fields", "id": "bereavement_fields", "fields": [
                {"key": "relationship", "label": "Relationship (optional)", "type": "select",
                 "options": ["partner", "child", "parent", "sibling", "grandparent", "other family member", "other", "prefer not to say"]},
                {"key": "start_date", "label": "Start date", "type": "date", "required": True},
                {"key": "end_date", "label": "End date", "type": "date", "required": True},
                {"key": "travel_needed", "label": "Travel needed", "type": "checkbox"},
                {"key": "message", "label": "Message to your manager (optional)", "type": "textarea"}]},
            H("Decision", 2),
            FG(["leave.decision_status_label", "leave.decided_by", "leave.decided_at"],
               labels={"leave.decision_status_label": "Status"}),
            C("bereavement_entitlement", required=False),
            P("Support: {{policy.eap_contact}}", when=PRESENT("policy.eap_contact")),
        ])

starter("HR-LEV-018", output_mode="DOCUMENT", execution_mode="NONE", audience="EMPLOYEE", approval_policy="L1",
        required=["worker.first_name", "leave.type_label", "leave.start_date", "leave.end_date", "leave.days", "leave.decision_status_label",
                  "leave.decided_by", "leave.decided_at"],
        optional=["leave.decision_reason", "leave.alternative_dates", "leave.balance_after", "leave.is_refused", "leave.is_approved"],
        mandatory=["leave_rights_statement"],
        blocks=[
            H("Your leave request: {{leave.decision_status_label}}"),
            P("Dear {{worker.first_name}}, your request for {{leave.type_label}} from {{leave.start_date}} to {{leave.end_date}} "
              "({{leave.days}} days) has been {{leave.decision_status_label}} by {{leave.decided_by}} on {{leave.decided_at}}."),
            P("Reason: {{leave.decision_reason}}.", when=EQ("leave.is_refused", True)),
            P("If it helps, you could consider: {{leave.alternative_dates}}.", when=PRESENT("leave.alternative_dates")),
            P("Your remaining balance after this leave is {{leave.balance_after}} days.",
              when={"all": [EQ("leave.is_approved", True), PRESENT("leave.balance_after")]}),
            C("leave_rights_statement"),
        ])


# ═══ C. WORKING TIME ════════════════════════════════════════════════════════════════════════════════════════════════

starter("HR-TIM-003", output_mode="DOCUMENT", execution_mode="ACKNOWLEDGE", audience="EMPLOYEE", approval_policy="L1",
        required=["worker.first_name", "shift.name", "shift.start_date", "shift.pattern"],
        optional=["shift.end_date", "shift.break_summary", "shift.location"], optional_clauses=["shift_work_rules"],
        blocks=[
            H("Your shift pattern"),
            P("Dear {{worker.first_name}}, from {{shift.start_date}} you will work the {{shift.name}} pattern below."),
            T(["Day", "Start", "End", "Hours"], "shift.pattern"),
            FG(["shift.break_summary", "shift.location", "shift.end_date"],
               labels={"shift.break_summary": "Breaks", "shift.end_date": "End date (temporary pattern)"}),
            C("shift_work_rules", required=False),
            P("If this pattern causes you difficulty, for example because of caring responsibilities or a health condition, please talk "
              "to your manager or HR."),
            D("I confirm I have received and read this shift pattern notice.", id="declaration"),
        ])

starter("HR-TIM-004", output_mode="DOCUMENT", execution_mode="ACKNOWLEDGE", audience="EMPLOYEE", approval_policy="L1",
        required=["worker.first_name", "shift.changes", "shift.change_effective_date", "shift.change_reason"],
        optional=["shift.short_notice_reason", "shift.is_short_notice"], optional_clauses=["shift_change_notice"],
        blocks=[
            H("Change to your shift"),
            P("Dear {{worker.first_name}}, your shifts are changing as shown below."),
            T(["Date", "Previous shift", "New shift"], "shift.changes"),
            P("This change takes effect from {{shift.change_effective_date}}. Reason: {{shift.change_reason}}."),
            P("We are giving you less notice than usual because {{shift.short_notice_reason}}.", when=EQ("shift.is_short_notice", True)),
            C("shift_change_notice", required=False),
            P("If you cannot work the new shift, tell your manager as soon as possible."),
            D("I confirm I have received and read this shift change notice.", id="declaration"),
        ])

starter("HR-TIM-007", output_mode="FORM_RECORD", execution_mode="NONE", audience="EMPLOYEE", approval_policy="L1",
        required=["worker.full_name", "overtime.date", "overtime.time_range", "overtime.hours", "overtime.reason", "overtime.timing_label",
                  "overtime.status_label", "overtime.decided_by", "overtime.decided_at"],
        optional=["overtime.emergency_label", "overtime.compensation_method_label", "overtime.decision_reason"],
        mandatory=["overtime_pay_or_time_off"],
        blocks=[
            H("Overtime Authorization"),
            FG(["worker.full_name", "overtime.date", "overtime.time_range", "overtime.hours", "overtime.reason", "overtime.timing_label",
                "overtime.emergency_label"],
               labels={"worker.full_name": "Employee", "overtime.time_range": "Time", "overtime.timing_label": "Pre-approved or retrospective",
                       "overtime.emergency_label": "Emergency"}),
            H("Decision", 2),
            FG(["overtime.status_label", "overtime.decided_by", "overtime.decided_at", "overtime.compensation_method_label",
                "overtime.decision_reason"],
               labels={"overtime.status_label": "Status", "overtime.compensation_method_label": "Compensation method",
                       "overtime.decision_reason": "Reason"}),
            C("overtime_pay_or_time_off"),
            P("Approved overtime is passed to payroll or time-off records through the normal process. This record does not change pay "
              "by itself.", style="small"),
        ])

starter("HR-TIM-013", output_mode="FORM_RECORD", execution_mode="NONE", audience="EMPLOYEE", approval_policy="L1",
        required=["worker.full_name", "correction.status_label", "correction.decided_by", "correction.decided_at"],
        optional=["correction.decision_reason"],
        blocks=[
            H("Attendance Correction Request"),
            FG(["worker.full_name"], labels={"worker.full_name": "Employee"}),
            {"type": "form_fields", "id": "correction_fields", "fields": [
                {"key": "date", "label": "Date", "type": "date", "required": True},
                {"key": "recorded_check_in", "label": "Recorded check-in", "type": "text"},
                {"key": "recorded_check_out", "label": "Recorded check-out", "type": "text"},
                {"key": "requested_check_in", "label": "Requested check-in", "type": "text", "required": True},
                {"key": "requested_check_out", "label": "Requested check-out", "type": "text", "required": True},
                {"key": "reason", "label": "Reason", "type": "select", "required": True,
                 "options": ["Forgot to check in/out", "System issue", "Working off-site", "Other"]},
                {"key": "reason_detail", "label": "Details", "type": "textarea"},
                {"key": "evidence", "label": "Evidence attached", "type": "checkbox"}]},
            D("I confirm the corrected times are accurate.", id="declaration"),
            H("Decision", 2),
            FG(["correction.status_label", "correction.decided_by", "correction.decided_at", "correction.decision_reason"],
               labels={"correction.status_label": "Status", "correction.decision_reason": "Reason"}),
            P("The original record is kept for audit purposes.", style="small"),
        ])


# ═══ D. COMPENSATION (C3) ═══════════════════════════════════════════════════════════════════════════════════════════

starter("HR-CMP-001", output_mode="DOCUMENT", execution_mode="ACKNOWLEDGE", audience="EMPLOYEE", approval_policy="L2",
        required=["worker.first_name", "employment.position_title", "comp.effective_date", "comp.base_amount", "comp.currency",
                  "comp.pay_period_label", "comp.pay_frequency_label"],
        optional=["comp.base_summary", "comp.pay_grade", "comp.components", "comp.annual_total"], optional_clauses=["pay_statement_notice"],
        blocks=[
            LH, H("Confirmation of your salary"),
            P("Dear {{worker.first_name}}, this letter confirms your pay as {{employment.position_title}} from {{comp.effective_date}}."),
            FG(["comp.base_summary", "comp.pay_frequency_label", "comp.pay_grade"],
               labels={"comp.base_summary": "Base pay", "comp.pay_frequency_label": "Paid", "comp.pay_grade": "Pay grade"}),
            T(["Component", "Amount", "Frequency"], "comp.components", when=PRESENT("comp.components")),
            FG(["comp.annual_total"], labels={"comp.annual_total": "Total annual value (estimated, before deductions)"}),
            P("Your pay is subject to the deductions required by law, such as tax and social security, and any deductions you have agreed "
              "to in writing.", id="rights_pay_deductions"),
            C("pay_statement_notice", required=False),
            P("If anything in this letter does not match your contract, please contact HR."),
            D("I confirm I have received and read this letter.", id="declaration"),
        ])

starter("HR-CMP-002", output_mode="DOCUMENT", execution_mode="NONE", audience="EMPLOYEE", approval_policy="L1",
        required=["worker.full_name", "comp.statement_period", "comp.components"],
        optional=["comp.benefits", "comp.total_value", "document.date"],
        blocks=[
            LH, H("Your total reward statement — {{comp.statement_period}}"),
            P("This statement summarises the value of your pay and benefits. It is for information only and does not change your "
              "contract."),
            H("Pay", 2), T(["Component", "Amount", "Frequency"], "comp.components"),
            H("Benefits", 2, include_when=PRESENT("comp.benefits")),
            T(["Benefit", "Provider/plan", "Employer contribution", "Your contribution"], "comp.benefits", when=PRESENT("comp.benefits")),
            FG(["comp.total_value"], labels={"comp.total_value": "Estimated total value"}),
            P("Figures are estimates based on our records on {{document.date}} and may change. Your contract, plan rules and pay statements "
              "are the authoritative sources.", style="small"),
        ])

starter("HR-CMP-005", output_mode="DOCUMENT", execution_mode="ACKNOWLEDGE", audience="EMPLOYEE", approval_policy="L2",
        required=["worker.first_name", "revision.type_label", "revision.summary_rows", "revision.previous_amount", "revision.new_amount",
                  "revision.currency", "revision.effective_date"],
        optional=["revision.percentage_change", "revision.reason_statement"],
        blocks=[
            LH, H("Your salary increase"),
            P("Dear {{worker.first_name}}, we are pleased to confirm an increase to your salary following {{revision.type_label}}."),
            T(["Previous salary", "New salary", "Change", "Effective from"], "revision.summary_rows"),
            P("{{revision.reason_statement}}", when=PRESENT("revision.reason_statement")),
            P("Your new salary will be reflected in the first pay run after the effective date. All other terms of your employment remain "
              "unchanged."),
            P("Thank you for your contribution."),
            D("I confirm I have received and read this letter.", id="declaration"),
        ])

starter("HR-CMP-010", output_mode="DOCUMENT", execution_mode="ACKNOWLEDGE", audience="EMPLOYEE", approval_policy="L2",
        required=["worker.first_name", "allowance.name", "allowance.start_date", "allowance.amount", "allowance.currency",
                  "allowance.frequency_label", "allowance.conditions"],
        optional=["allowance.amount_summary", "allowance.end_or_review_date", "allowance.eligibility_reason"], optional_clauses=["allowance_tax_note"],
        blocks=[
            LH, H("Allowance award — {{allowance.name}}"),
            P("Dear {{worker.first_name}}, we are pleased to confirm that you are eligible for the {{allowance.name}} from "
              "{{allowance.start_date}}."),
            FG(["allowance.amount_summary", "allowance.frequency_label", "allowance.end_or_review_date", "allowance.eligibility_reason"],
               labels={"allowance.amount_summary": "Amount", "allowance.frequency_label": "Frequency",
                       "allowance.end_or_review_date": "End or review date", "allowance.eligibility_reason": "Eligibility reason"}),
            P("This allowance is paid while you continue to meet the eligibility conditions: {{allowance.conditions}}. We will write to you "
              "before changing or ending it, in line with your contract and the law.", id="rights_allowance_change"),
            C("allowance_tax_note", required=False),
            D("I confirm I have received and read this letter.", id="declaration"),
        ])

starter("HR-CMP-024", output_mode="FORM_RECORD", execution_mode="NONE", audience="EMPLOYEE", approval_policy="L1",
        required=["claim.reference", "worker.full_name", "claim.items", "claim.total_claimed", "claim.total_approved", "claim.decision_label",
                  "claim.decided_by", "claim.decided_at", "policy.claim_dispute_days"],
        optional=["claim.trip_reference", "claim.submitted_on", "claim.decision_reason", "claim.second_approver"],
        blocks=[
            H("Expense Claim Decision — {{claim.reference}}"),
            FG(["worker.full_name", "claim.trip_reference", "claim.submitted_on"],
               labels={"worker.full_name": "Employee", "claim.trip_reference": "Trip / request reference", "claim.submitted_on": "Submitted on"}),
            T(["Date", "Type", "Description", "Amount", "Currency", "Receipt", "Within policy"], "claim.items"),
            FG(["claim.total_claimed", "claim.total_approved", "claim.decision_label", "claim.decided_by", "claim.second_approver",
                "claim.decided_at", "claim.decision_reason"],
               labels={"claim.decision_label": "Decision", "claim.second_approver": "Second approver",
                       "claim.decision_reason": "Reason for any reduction or refusal"}),
            P("Approved amounts are paid through the normal payment process. If you disagree, reply through Zoiko HR within "
              "{{policy.claim_dispute_days}} days."),
        ])

CLAUSES = {
    "starter_text": {
        "leave_rights_statement": {
            "title": "Leave: rights statement on decisions",
            "text": "If you disagree with this decision, you can discuss it with your manager or HR. Refusing a request does not affect "
                    "any minimum leave entitlement you have under the law."},
        "sickness_evidence_reminder": {
            "title": "Sick leave: evidence reminder",
            "text": "If your absence continues, we may ask for evidence of your sickness in line with our Sick Leave Policy."},
    },
    "no_starter_text": [
        "probation_legal_limits", "rest_breaks", "overtime_pay_or_time_off", "maximum_working_time", "statutory_annual_leave",
        "annual_leave_carry_over", "leave_on_termination", "sickness_evidence_rules", "sick_pay", "family_leave_entitlements",
        "family_leave_pay", "monitoring_notice", "family_leave_notice_requirements",
        # optional, no default text: included only when a tenant or platform clause is released
        "handbook_local_annex", "attendance_local_rules", "cross_border_remote_work", "sickness_during_leave", "data_transfers",
        "expense_tax_treatment", "bereavement_entitlement", "shift_work_rules", "shift_change_notice", "pay_statement_notice",
        "allowance_tax_note",
    ],
    "_note": "Prompt 3 clauses. Mandatory clauses in no_starter_text block preflight until a jurisdiction clause is released; optional "
             "ones are simply omitted until one exists. Starters never invent entitlements, amounts, limits or notice periods.",
}


def main():
    for cid, data in STARTERS.items():
        family = cid.rsplit("-", 1)[0]
        path = OUT / family / f"{cid}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    (OUT / "clauses_prompt3.json").write_text(json.dumps(CLAUSES, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {len(STARTERS)} starters and clauses_prompt3.json to {OUT}")


if __name__ == "__main__":
    main()
