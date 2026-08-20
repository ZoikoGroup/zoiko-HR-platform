"""
scripts/seed_knowledge_base.py
---------------------------------
One-off seed script: ingests placeholder example policy documents into the
HR Assistant's knowledge base via the same create_source()/publish_source()
pipeline the admin UI uses (chunk -> embed -> publish). No real Zoiko policy
content existed to ingest (the docs/ folder's newly-added files are
engineering/architecture specifications, not raw policy text — same pattern
as the original PRD/FRS), so every document below is explicitly disclosed as
placeholder/example content, both in this docstring and as the first line of
each document's own text (so the disclosure surfaces in citations/excerpts
too, not just here).

Run once: `python scripts/seed_knowledge_base.py <organization_id> <owner_employee_id>`
Safe to re-run — skips any title that already exists for that organization.
"""

import datetime
import sys

sys.path.insert(0, ".")

from app.database import SessionLocal
from app.modules.assistant import knowledge_service
from app.modules.assistant.models import KnowledgeSource

DISCLOSURE = (
    "[EXAMPLE POLICY — placeholder content seeded to test the HR Assistant's knowledge base "
    "pipeline end-to-end. This is not Zoiko's verified, legally-reviewed policy. Replace with your "
    "organization's actual approved policy document before relying on these answers.]\n\n"
)

DOCUMENTS = [
    {
        "title": "Employee Handbook & Code of Conduct",
        "source_type": "handbook",
        "content": DISCLOSURE + """EMPLOYEE HANDBOOK & CODE OF CONDUCT

1. Purpose
This handbook summarizes the standards of conduct expected of every employee and the mutual commitments between employees and the organization. It supplements, and does not replace, your employment contract or applicable local law.

2. Standards of Conduct
Employees are expected to act with honesty, treat colleagues and customers with respect, and comply with all applicable laws and company policies. Harassment, discrimination, and retaliation of any kind are prohibited and will result in disciplinary action up to and including termination.

3. Conflicts of Interest
Employees must disclose any outside employment, financial interest, or personal relationship that could reasonably be seen as competing with or influencing their duties. When in doubt, disclose it to your manager or HR.

4. Confidentiality
Employees may not share confidential company information, customer data, or trade secrets with anyone outside the organization, or use such information for personal benefit, both during and after employment.

5. Use of Company Systems
Company equipment, email, and software are provided for business use. Incidental personal use is permitted as long as it does not interfere with work, violate policy, or involve illegal or offensive content.

6. Anti-Harassment and Equal Opportunity
The organization is an equal-opportunity employer. Discrimination or harassment based on race, gender, age, disability, religion, sexual orientation, or any other protected characteristic will not be tolerated. Report concerns to HR; retaliation against anyone who reports in good faith is prohibited.

7. Health and Safety
Employees must follow workplace safety guidelines and report unsafe conditions or incidents to HR or their manager promptly.

8. Disciplinary Process
Policy violations are handled through a fair process that typically includes a verbal warning, written warning, and final warning before termination, though serious misconduct (e.g. theft, harassment, safety violations) may result in immediate termination.

9. Reporting Concerns
Employees who witness or experience a violation of this code should report it to their manager, HR, or through the confidential ethics reporting channel without fear of retaliation.
""",
    },
    {
        "title": "Attendance & Leave Policy (Sick, Casual, Family & Unpaid Leave)",
        "source_type": "policy",
        "content": DISCLOSURE + """ATTENDANCE & LEAVE POLICY — BEYOND ANNUAL LEAVE

This policy covers leave types other than annual/vacation leave (see the separate Annual Leave Policy for that). All leave requests are submitted through the HR platform and require manager approval unless noted otherwise.

1. Sick Leave
Employees accrue 12 days of paid sick leave per calendar year. Sick leave may be used for the employee's own illness or to care for an immediate family member. Absences of 3 or more consecutive days require a medical certificate. Unused sick leave does not carry forward to the next year and is not paid out on separation.

2. Casual/Personal Leave
Employees receive 5 days of casual leave per year for personal matters that don't require advance planning. Casual leave should be requested as early as possible and is granted at the manager's discretion based on team coverage.

3. Maternity Leave
Eligible employees are entitled to 26 weeks of paid maternity leave, in line with applicable local law (which may grant additional entitlements depending on jurisdiction — see the Compliance & Jurisdiction Policy). Leave may begin up to 8 weeks before the expected delivery date.

4. Paternity Leave
Eligible employees receive 2 weeks of paid paternity leave, to be taken within 3 months of the child's birth or adoption.

5. Parental/Adoption Leave
Employees adopting a child are eligible for the same leave entitlements as biological parents, prorated based on the child's age at placement.

6. Bereavement Leave
Employees may take up to 5 paid days of bereavement leave for the death of an immediate family member, and up to 2 days for an extended family member.

7. Unpaid Leave
Employees may request unpaid leave for circumstances not covered by other leave types, subject to manager and HR approval. Unpaid leave does not accrue other benefits (e.g. paid leave, retirement contributions) during the unpaid period unless required by local law.

8. Emergency/Civic Leave
Leave for jury duty, military service, or civic obligations is granted as required by local law, generally paid up to a statutory limit.

9. Attendance Expectations
Employees are expected to be present and on time for scheduled work. Repeated unplanned absences without notice may be addressed through the standard disciplinary process, separate from approved protected leave.
""",
    },
    {
        "title": "Expense & Reimbursement Policy",
        "source_type": "policy",
        "content": DISCLOSURE + """EXPENSE & REIMBURSEMENT POLICY

1. Eligible Expenses
Reasonable, pre-approved business expenses are reimbursable, including travel (airfare, ground transport, lodging), client meals, conference/training fees, and necessary work supplies. Personal expenses, entertainment unrelated to business, and alcohol (outside of approved client entertainment) are not reimbursable.

2. Approval
Expenses over $500 require manager pre-approval before being incurred. Travel bookings should use the company's preferred travel partner where available.

3. Submission
Expense claims must be submitted within 30 days of the expense being incurred, with an itemized receipt attached. Claims submitted after 60 days may be declined except in exceptional circumstances approved by HR.

4. Per Diem & Meals
When traveling, employees may claim actual meal costs with receipts, up to a daily cap of $75 for domestic travel and $100 for international travel, or use the company's flat per-diem rate where offered.

5. Mileage
Personal vehicle use for business purposes is reimbursed at the standard mileage rate published annually by Finance, calculated from the employee's regular workplace (not home, unless traveling directly to a client site).

6. Reimbursement Timeline
Approved expense claims are reimbursed within the next two payroll cycles after submission.

7. Non-Compliant Claims
Expenses without a valid receipt, submitted late, or outside policy scope may be declined or require additional justification. Repeated policy violations may be escalated to the employee's manager.
""",
    },
    {
        "title": "Remote Work & WFH Policy",
        "source_type": "policy",
        "content": DISCLOSURE + """REMOTE WORK / WORK-FROM-HOME POLICY

1. Eligibility
Remote work arrangements are available to roles where the nature of the work does not require regular on-site presence, subject to manager approval. Eligibility is reviewed periodically and may change based on business needs.

2. Work Arrangements
The organization supports a hybrid model: employees are expected to be in the office a minimum of 2 days per week unless an exception is approved for fully remote roles. Specific in-office days may be set by team or department.

3. Work Hours & Availability
Remote employees are expected to be available during core business hours (typically 10 AM–4 PM local time) and to attend scheduled meetings with camera on where reasonable. Flexible scheduling outside core hours is permitted as long as deliverables and team coordination aren't impacted.

4. Equipment & Expenses
The company provides a laptop and standard peripherals for remote work. A one-time home office setup allowance may be available per company policy; ongoing internet/utility costs are the employee's responsibility unless otherwise stated in the employment contract.

5. Data Security
Remote employees must use company-approved VPN and security tools, keep work devices password-protected, and avoid conducting company business on public/unsecured networks. Confidential documents should not be printed or stored on personal devices.

6. Working From a Different Location/Country
Working remotely from a different city, state, or country for an extended period requires prior approval from HR and Legal, since it may create tax, payroll, or employment-law implications (see the Compliance & Jurisdiction Policy).

7. Performance Expectations
Remote work does not change performance expectations — employees are evaluated on outcomes and deliverables the same as on-site staff. Persistent unavailability or missed deliverables may result in the remote arrangement being revoked.
""",
    },
    {
        "title": "Benefits & Compensation Policy (Structure Overview)",
        "source_type": "policy",
        "content": DISCLOSURE + """BENEFITS & COMPENSATION POLICY — STRUCTURE OVERVIEW

This document describes the general structure of compensation and benefits programs. It does not contain any individual employee's pay details — for your personal compensation, refer to your offer letter or contact HR/Payroll directly.

1. Compensation Structure
Compensation consists of a base salary determined by role, level, and location-based pay bands, and may include a variable/bonus component tied to individual and company performance where applicable to the role.

2. Pay Reviews
Compensation is reviewed annually as part of the performance review cycle. Adjustments are not guaranteed and depend on performance, market benchmarking, and business results.

3. Health Benefits
Eligible employees may enroll in company-sponsored health, dental, and vision insurance plans. Enrollment windows occur at hire and during the annual open-enrollment period, or after a qualifying life event.

4. Retirement/Provident Fund
The company offers a retirement savings plan (e.g. 401(k) or provident fund depending on jurisdiction) with a partial employer match, subject to local regulations and plan documents.

5. Other Benefits
Additional benefits may include life and disability insurance, an employee assistance program, wellness stipends, and professional development reimbursement, as communicated by HR for your role and location.

6. Confidentiality of Compensation
Employees are free to discuss their own compensation, but the company does not disclose other employees' individual pay information. Requests to view or compare another employee's compensation will not be answered by this assistant — for compensation benchmarking, contact HR directly.

7. Eligibility Changes
Benefit eligibility may change with employment status changes (e.g. moving from full-time to part-time, or a leave of absence) — contact HR when your status changes to understand the impact on your benefits.
""",
    },
    {
        "title": "Onboarding & Offboarding Procedures",
        "source_type": "sop",
        "content": DISCLOSURE + """ONBOARDING & OFFBOARDING PROCEDURES

1. Pre-Boarding
Before an employee's start date, HR sends offer confirmation, background check consent (where applicable), and instructions for completing new-hire paperwork. IT provisions accounts and equipment ahead of day one.

2. Day One
New hires complete orientation covering company policies, benefits enrollment, and required compliance training. Employees are introduced to their team and assigned a manager and, where available, an onboarding buddy.

3. First 30/60/90 Days
Managers are expected to set initial goals within the first two weeks, conduct a 30-day check-in, and complete a formal 90-day review covering role expectations and early performance feedback.

4. Probation Period
New employees typically serve a probationary period (commonly 60–90 days depending on role and jurisdiction) during which either party may end employment with shorter notice. Specific terms are set out in the offer letter.

5. Resignation Process
Employees resigning should submit written notice to their manager and HR, per the notice period in their contract (typically 30 days). HR schedules an exit interview and provides a separation checklist.

6. Involuntary Separation
Involuntary terminations follow the disciplinary process outlined in the Employee Handbook (except for immediate-termination misconduct) and are coordinated with HR and, where required, Legal.

7. Offboarding Checklist
On an employee's last day: return company equipment and access badges, revoke system/email access, process final pay and any accrued/unused leave payout per local law, and provide COBRA/benefits continuation information where applicable.

8. Knowledge Transfer
Departing employees are expected to document ongoing work and hand off responsibilities to their manager or a designated team member before their last day.
""",
    },
    {
        "title": "Compliance & Jurisdiction-Specific Policy Notes",
        "source_type": "compliance",
        "content": DISCLOSURE + """COMPLIANCE & JURISDICTION-SPECIFIC POLICY NOTES

This document highlights how certain policies vary by jurisdiction. It is illustrative only — always confirm current requirements with HR/Legal for your specific location, as employment law changes frequently.

1. Why Jurisdiction Matters
Leave entitlements, notice periods, overtime rules, and termination requirements can differ significantly by country, state, or province. A policy that is generous in one jurisdiction may be a legal minimum in another — the company always complies with the more protective of company policy or local law.

2. Leave Entitlement Variation (Illustrative)
For example, statutory maternity leave, minimum paid sick leave, and public holiday entitlements are set by local law and may exceed the baseline figures in the Attendance & Leave Policy. Where local law provides a greater benefit, local law applies.

3. Working Hours & Overtime
Standard working hours, rest-day requirements, and overtime pay rules are governed by local labor law and may differ from the company's default guidance. Managers should confirm local requirements before setting schedules that deviate from standard hours.

4. Termination & Notice
Minimum notice periods and severance requirements on termination vary by jurisdiction and, in some locations, by length of service. HR and Legal are involved in any termination to confirm the applicable local requirements are met.

5. Data Privacy
Handling of employee personal data (including HR Assistant conversation data) follows applicable data protection law for the employee's location (e.g. GDPR-style rights in some regions). Data-subject rights available through this assistant — export, delete, restrict — apply regardless of jurisdiction as a baseline.

6. When in Doubt
This assistant will flag jurisdiction-sensitive questions (e.g. specific legal entitlements) as requiring HR or Legal review rather than stating a single global answer, since a wrong generalized answer could be misleading for your specific location.
""",
    },
]


def main():
    if len(sys.argv) != 3:
        print("Usage: python scripts/seed_knowledge_base.py <organization_id> <owner_employee_id>")
        sys.exit(1)
    organization_id = int(sys.argv[1])
    owner_employee_id = int(sys.argv[2])

    db = SessionLocal()
    try:
        existing_titles = {
            s.title for s in db.query(KnowledgeSource).filter(KnowledgeSource.organization_id == organization_id).all()
        }
        created, skipped = 0, 0
        for doc in DOCUMENTS:
            if doc["title"] in existing_titles:
                print(f"SKIP (already exists): {doc['title']}")
                skipped += 1
                continue
            source = knowledge_service.create_source(
                db, organization_id, owner_employee_id,
                title=doc["title"], source_type=doc["source_type"], authority_tier="B",
                content_text=doc["content"],
                jurisdiction_code=None, worker_type=None, audience_role=None,
                effective_from=datetime.date.today(), effective_to=None,
            )
            knowledge_service.publish_source(db, organization_id, source.id, owner_employee_id)
            print(f"CREATED + PUBLISHED: {doc['title']} (source id {source.id})")
            created += 1
        print(f"\nDone. Created {created}, skipped {skipped} (already existed).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
