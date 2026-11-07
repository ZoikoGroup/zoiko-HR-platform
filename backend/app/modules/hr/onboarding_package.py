"""Zoiko Onboarding Package Generator.

Handles the 10 standard employment and onboarding package documents:
1. Offer Letter (signable)
2. Job Description (operational template)
3. Daily Key Performance Indicators (KPIs) (operational framework)
4. Non-Disclosure Agreement (NDA) (signable)
5. Employment Contract (signable)
6. Affidavit of Employment Exclusivity (signable)
7. Voluntary Self-Disclosure Form (signable declaration)
8. Job Application Form (candidate application record)
9. Daily Work Report (DWR) Template (operational report template)
10. Zoiko Group Project Velocity Report Template (sprint/velocity template)

Generates professional PDFs populated with employee and employer details,
wires electronic signatures (with single-use token links and audit evidence certificates),
and connects seamlessly to both the Candidate Onboarding Portal and Org Admin Onboarding management.
"""
from __future__ import annotations

import io
import logging
import os
import secrets
from datetime import date, datetime, timedelta
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import HRFlowable, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.orm import Session

from app.modules.doc_templates import governance, signing, state, storage
from app.modules.doc_templates.models import GeneratedDocument, TemplateDefinition
from app.modules.hr.models import (
    OnboardingActivity,
    OnboardingDocument,
    OnboardingNewHire,
    Organization,
    RecruitmentCandidate,
    RecruitmentOffer,
)

logger = logging.getLogger("zoiko.onboarding.package")

# ── 10 standard package documents specification ────────────────────────────────────────────────────────
ONBOARDING_PACKAGE_SPEC = [
    {
        "category": "offer_letter",
        "title": "Offer Letter",
        "canonical_id": "HR-HIR-011",
        "family_id": "HR-HIR",
        "requires_signature": True,
        "description": "Formal offer of employment outlining position, compensation, benefits, and key terms.",
    },
    {
        "category": "job_description",
        "title": "Job Description",
        "canonical_id": "HR-ORG-005",
        "family_id": "HR-ORG",
        "requires_signature": False,
        "description": "Comprehensive role specifications, key responsibilities, competencies, and reporting structure.",
    },
    {
        "category": "daily_kpi",
        "title": "Daily Key Performance Indicators (KPIs)",
        "canonical_id": "HR-PRF-002",
        "family_id": "HR-PRF",
        "requires_signature": False,
        "description": "Daily operational performance standards, task targets, quality benchmarks, and reporting cadence.",
    },
    {
        "category": "nda",
        "title": "Non-Disclosure Agreement (NDA)",
        "canonical_id": "HR-CON-017",
        "family_id": "HR-CON",
        "requires_signature": True,
        "description": "Confidentiality and proprietary information protection agreement with trade secrets safeguards.",
    },
    {
        "category": "employment_contract",
        "title": "Employment Contract",
        "canonical_id": "HR-CON-001",
        "family_id": "HR-CON",
        "requires_signature": True,
        "description": "Comprehensive employment agreement defining terms of service, remuneration, IP assignment, and policies.",
    },
    {
        "category": "exclusivity_affidavit",
        "title": "Affidavit of Employment Exclusivity",
        "canonical_id": "HR-CON-025",
        "family_id": "HR-CON",
        "requires_signature": True,
        "description": "Solemn declaration affirming full-time exclusive commitment and strict non-moonlighting covenant.",
    },
    {
        "category": "self_disclosure",
        "title": "Voluntary Self-Disclosure Form",
        "canonical_id": "HR-ONB-025",
        "family_id": "HR-ONB",
        "requires_signature": True,
        "description": "Compliance self-disclosure covering background disclosures, conflicts of interest, and certifications.",
    },
    {
        "category": "job_application",
        "title": "Job Application Form",
        "canonical_id": "HR-HIR-005",
        "family_id": "HR-HIR",
        "requires_signature": False,
        "description": "Official candidate job application record summarizing personal details, history, and verified qualifications.",
    },
    {
        "category": "daily_work_report",
        "title": "Daily Work Report (DWR) Template",
        "canonical_id": "HR-OPS-DWR",
        "family_id": "HR-TIM",
        "requires_signature": False,
        "description": "Operational daily task logging template for tracking deliverables, hours, blockers, and next-day plans.",
    },
    {
        "category": "velocity_report",
        "title": "Zoiko Group Project Velocity Report Template",
        "canonical_id": "HR-OPS-VEL",
        "family_id": "HR-PRF",
        "requires_signature": False,
        "description": "Sprint and milestone velocity tracking protocol for project milestones, burn-up, and deliverables.",
    },
]

PACKAGE_CATEGORIES = [item["category"] for item in ONBOARDING_PACKAGE_SPEC]
SIGNABLE_CATEGORIES = {item["category"] for item in ONBOARDING_PACKAGE_SPEC if item["requires_signature"]}
SPEC_BY_CATEGORY = {item["category"]: item for item in ONBOARDING_PACKAGE_SPEC}


# ── PDF Generation Helpers ───────────────────────────────────────────────────────────────────────────
def _get_styles():
    base = getSampleStyleSheet()
    primary = colors.HexColor("#0A1128")
    accent = colors.HexColor("#2563EB")
    dark = colors.HexColor("#1E293B")
    muted = colors.HexColor("#64748B")

    return {
        "title": ParagraphStyle("DocTitle", parent=base["Heading1"], fontSize=18, leading=22, textColor=primary, fontName="Helvetica-Bold", spaceAfter=4),
        "subtitle": ParagraphStyle("DocSubtitle", parent=base["Normal"], fontSize=10, leading=14, textColor=muted, spaceAfter=14),
        "h2": ParagraphStyle("DocH2", parent=base["Heading2"], fontSize=12, leading=16, textColor=primary, fontName="Helvetica-Bold", spaceBefore=12, spaceAfter=6),
        "h3": ParagraphStyle("DocH3", parent=base["Heading3"], fontSize=10, leading=14, textColor=accent, fontName="Helvetica-Bold", spaceBefore=8, spaceAfter=4),
        "body": ParagraphStyle("DocBody", parent=base["Normal"], fontSize=9, leading=13, textColor=dark, spaceAfter=6),
        "body_bold": ParagraphStyle("DocBodyBold", parent=base["Normal"], fontSize=9, leading=13, textColor=dark, fontName="Helvetica-Bold"),
        "table_header": ParagraphStyle("DocTh", parent=base["Normal"], fontSize=8.5, leading=11, textColor=colors.white, fontName="Helvetica-Bold"),
        "table_cell": ParagraphStyle("DocTd", parent=base["Normal"], fontSize=8.5, leading=11, textColor=dark),
        "legal": ParagraphStyle("DocLegal", parent=base["Normal"], fontSize=8, leading=11, textColor=muted, spaceBefore=4),
        "callout": ParagraphStyle("DocCallout", parent=base["Normal"], fontSize=9, leading=13, textColor=primary, fontName="Helvetica-Oblique"),
    }


def _header_table(org_name: str, doc_title: str, doc_num: str, s: dict) -> Table:
    data = [
        [
            Paragraph(f"<b>{org_name.upper()}</b><br/><font color='#64748B' size='8'>HUMAN RESOURCES & TALENT MANAGEMENT</font>", s["body"]),
            Paragraph(f"<b>{doc_title.upper()}</b><br/><font color='#64748B' size='8'>DOC REF: {doc_num}</font>", ParagraphStyle("RAlign", parent=s["body"], alignment=2)),
        ]
    ]
    t = Table(data, colWidths=[300, 230])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 1.5, colors.HexColor("#0A1128")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


def _meta_box(items: list[tuple[str, str]], s: dict) -> Table:
    rows = []
    for label, val in items:
        rows.append([Paragraph(f"<b>{label}:</b>", s["body_bold"]), Paragraph(str(val or "—"), s["body"])])
    t = Table(rows, colWidths=[140, 390])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#F1F5F9")),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


def _signature_block(candidate_name: str, org_name: str, s: dict, is_signable: bool = True) -> Table:
    c_title = "CANDIDATE / EMPLOYEE SIGNATURE" if is_signable else "EMPLOYEE ACKNOWLEDGEMENT"
    data = [
        [
            Paragraph(f"<b>FOR AND ON BEHALF OF:</b><br/>{org_name}", s["body"]),
            Paragraph(f"<b>{c_title}:</b><br/>{candidate_name}", s["body"]),
        ],
        [
            Paragraph("<br/><br/>________________________________________<br/>Authorized Signatory<br/>Zoiko Human Resources", s["body"]),
            Paragraph(f"<br/><br/>________________________________________<br/>{candidate_name}<br/>{'Electronically Signed via Zoiko HR' if is_signable else 'Received & Acknowledged'}", s["body"]),
        ],
        [
            Paragraph(f"Date: {date.today().strftime('%b %d, %Y')}", s["legal"]),
            Paragraph(f"Date: {date.today().strftime('%b %d, %Y')}", s["legal"]),
        ],
    ]
    t = Table(data, colWidths=[265, 265])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEABOVE", (0, 0), (-1, 0), 0.5, colors.HexColor("#CBD5E1")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


# ── Individual Document PDF Builders ──────────────────────────────────────────────────────────────────
def build_document_pdf(category: str, hire_ctx: dict) -> bytes:
    """Generates the official PDF for any of the 10 documents populated with candidate & employer details."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, leftMargin=36, rightMargin=36, topMargin=36, bottomMargin=36)
    s = _get_styles()
    story = []

    c_name = hire_ctx.get("candidate_name") or "New Hire"
    org_name = hire_ctx.get("org_name") or "Zoiko Enterprises"
    position = hire_ctx.get("position") or "Team Member"
    dept = hire_ctx.get("department") or "Operations"
    manager = hire_ctx.get("manager") or "Department Manager"
    join_date = hire_ctx.get("joining_date") or date.today().strftime("%b %d, %Y")
    emp_type = hire_ctx.get("employment_type") or "Full-Time"
    salary = hire_ctx.get("salary") or "As per offer schedule"
    doc_ref = f"ZKO-{category.upper()[:6]}-{datetime.utcnow().strftime('%Y%m%d%H%M')}"

    # Header
    spec = SPEC_BY_CATEGORY.get(category, {"title": category.replace("_", " ").title()})
    story.append(_header_table(org_name, spec["title"], doc_ref, s))
    story.append(Spacer(1, 12))

    if category == "offer_letter":
        story.append(Paragraph("<b>FORMAL OFFER OF EMPLOYMENT</b>", s["title"]))
        story.append(Paragraph(f"Dear <b>{c_name}</b>,", s["body"]))
        story.append(Paragraph(
            f"On behalf of <b>{org_name}</b>, we are delighted to offer you the position of <b>{position}</b>. "
            f"We were impressed by your background, professional accomplishments, and the energy you bring. "
            f"We are confident you will make a substantial contribution to our continued growth and culture of excellence.",
            s["body"]
        ))
        story.append(Spacer(1, 8))
        story.append(_meta_box([
            ("Candidate Name", c_name),
            ("Position / Designation", position),
            ("Department", dept),
            ("Reporting Manager", manager),
            ("Proposed Start Date", join_date),
            ("Employment Type", emp_type),
            ("Remuneration / Compensation", salary),
            ("Probationary Period", "90 Days from Start Date"),
        ], s))
        story.append(Spacer(1, 10))
        story.append(Paragraph("<b>Terms & Conditions of Employment:</b>", s["h2"]))
        story.append(Paragraph(
            "1. <b>Duties & Responsibilities:</b> You shall devote your entire time, attention, and abilities to the performance of your duties.",
            s["body"]
        ))
        story.append(Paragraph(
            "2. <b>Exclusivity & Non-Moonlighting:</b> This position is full-time and exclusive. You agree not to engage in secondary employment without express written approval.",
            s["body"]
        ))
        story.append(Paragraph(
            "3. <b>Confidentiality:</b> You agree to protect all company confidential information and trade secrets in accordance with the Non-Disclosure Agreement.",
            s["body"]
        ))
        story.append(Spacer(1, 16))
        story.append(KeepTogether([_signature_block(c_name, org_name, s, is_signable=True)]))

    elif category == "job_description":
        story.append(Paragraph("<b>JOB SPECIFICATION & ROLE DESCRIPTION</b>", s["title"]))
        story.append(_meta_box([
            ("Role Title", position),
            ("Department", dept),
            ("Reports To", manager),
            ("Employment Category", emp_type),
            ("Effective Date", join_date),
        ], s))
        story.append(Spacer(1, 10))
        story.append(Paragraph("<b>Role Overview & Strategic Purpose</b>", s["h2"]))
        story.append(Paragraph(
            f"The <b>{position}</b> plays a central role within the <b>{dept}</b> division, responsible for driving operational excellence, "
            f"delivering high-caliber outcomes, adhering to established KPIs, and collaborating cross-functionally across Zoiko teams.",
            s["body"]
        ))
        story.append(Paragraph("<b>Key Responsibilities & Accountabilities</b>", s["h2"]))
        story.append(Paragraph("• Execute assigned operational and technical deliverables in alignment with sprint cycles and company standards.", s["body"]))
        story.append(Paragraph("• Maintain high data integrity, task velocity, and meticulous quality assurance across all workstreams.", s["body"]))
        story.append(Paragraph("• Participate actively in daily standups, sprint retrospectives, and cross-team knowledge transfers.", s["body"]))
        story.append(Paragraph("• Submit daily work reports (DWR) outlining task status, achievements, and blockers to reporting management.", s["body"]))
        story.append(Paragraph("• Proactively identify process optimizations, performance bottlenecks, and automation opportunities.", s["body"]))
        story.append(Paragraph("<b>Core Competencies & Requirements</b>", s["h2"]))
        story.append(Paragraph("• Strong analytical, problem-solving, and communication skills.", s["body"]))
        story.append(Paragraph("• Demonstrated proficiency in modern enterprise tooling, collaborative platforms, and agile workflows.", s["body"]))
        story.append(Paragraph("• High level of professionalism, integrity, and adherence to company policies.", s["body"]))
        story.append(Spacer(1, 16))
        story.append(KeepTogether([_signature_block(c_name, org_name, s, is_signable=False)]))

    elif category == "daily_kpi":
        story.append(Paragraph("<b>DAILY KEY PERFORMANCE INDICATORS (KPIs)</b>", s["title"]))
        story.append(Paragraph("Operational Performance Benchmarks & Daily Accountability Matrix", s["subtitle"]))
        story.append(_meta_box([
            ("Employee Name", c_name),
            ("Position", position),
            ("Department", dept),
            ("Supervisor / Reviewer", manager),
            ("Evaluation Cadence", "Daily Logging / Weekly Review"),
        ], s))
        story.append(Spacer(1, 10))
        kpi_table_data = [
            [Paragraph("<b>KPI Metric</b>", s["table_header"]), Paragraph("<b>Daily Target / Standard</b>", s["table_header"]), Paragraph("<b>Measurement Method</b>", s["table_header"])],
            [Paragraph("Task Completion Rate", s["table_cell"]), Paragraph("100% of planned daily sprint items completed or updated with clear status.", s["table_cell"]), Paragraph("Sprint Board / Jira / Task Tracker", s["table_cell"])],
            [Paragraph("Quality & Accuracy", s["table_cell"]), Paragraph("Zero critical defects; >98% first-pass review acceptance.", s["table_cell"]), Paragraph("Peer Review / QA Audit", s["table_cell"])],
            [Paragraph("Turnaround Time (TAT)", s["table_cell"]), Paragraph("Standard requests resolved within SLA (<4 business hours).", s["table_cell"]), Paragraph("Ticketing / Incident Log", s["table_cell"])],
            [Paragraph("Daily Standup Attendance", s["table_cell"]), Paragraph("Punctual attendance and clear 3-bullet progress report.", s["table_cell"]), Paragraph("Daily Meeting Roster", s["table_cell"])],
            [Paragraph("Daily Work Report (DWR)", s["table_cell"]), Paragraph("Logged and submitted by 6:00 PM local time daily.", s["table_cell"]), Paragraph("Zoiko HR DWR Portal", s["table_cell"])],
        ]
        t = Table(kpi_table_data, colWidths=[150, 230, 150])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0A1128")),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(t)
        story.append(Spacer(1, 16))
        story.append(KeepTogether([_signature_block(c_name, org_name, s, is_signable=False)]))

    elif category == "nda":
        story.append(Paragraph("<b>CONFIDENTIALITY & NON-DISCLOSURE AGREEMENT</b>", s["title"]))
        story.append(Paragraph(
            f"This Confidentiality and Non-Disclosure Agreement (\"Agreement\") is entered into on <b>{date.today().strftime('%B %d, %Y')}</b>, "
            f"between <b>{org_name}</b> (\"Company\") and <b>{c_name}</b> (\"Employee\").",
            s["body"]
        ))
        story.append(Spacer(1, 8))
        story.append(Paragraph("<b>1. Confidential Information Defined</b>", s["h3"]))
        story.append(Paragraph(
            "\"Confidential Information\" includes all technical, business, financial, customer, employee, and operational data, source code, "
            "product roadmaps, trade secrets, architecture designs, and strategic plans disclosed to or accessed by Employee.",
            s["body"]
        ))
        story.append(Paragraph("<b>2. Non-Disclosure & Duty of Care</b>", s["h3"]))
        story.append(Paragraph(
            "Employee agrees to hold all Confidential Information in the strictest confidence, not to disclose or publish any part thereof "
            "to any third party without prior written authorization, and to use such information solely in performance of official duties.",
            s["body"]
        ))
        story.append(Paragraph("<b>3. Return of Materials & Term</b>", s["h3"]))
        story.append(Paragraph(
            "Upon termination of employment or request by Company, Employee shall immediately surrender all documents, devices, digital keys, "
            "and files containing Company information. This confidentiality obligation endures during employment and survives indefinitely.",
            s["body"]
        ))
        story.append(Paragraph("<b>4. Injunctive Relief & Remedies</b>", s["h3"]))
        story.append(Paragraph(
            "Employee acknowledges that breach of this Agreement causes irreparable harm for which monetary damages alone are insufficient, "
            "entitling the Company to seek immediate injunctive relief and recovery of legal fees.",
            s["body"]
        ))
        story.append(Spacer(1, 16))
        story.append(KeepTogether([_signature_block(c_name, org_name, s, is_signable=True)]))

    elif category == "employment_contract":
        story.append(Paragraph("<b>EMPLOYMENT AGREEMENT & CONTRACT OF SERVICE</b>", s["title"]))
        story.append(Paragraph(
            f"This Employment Agreement is entered into between <b>{org_name}</b> (\"Employer\") and <b>{c_name}</b> (\"Employee\").",
            s["body"]
        ))
        story.append(Spacer(1, 6))
        story.append(_meta_box([
            ("Employee Name", c_name),
            ("Designation", position),
            ("Department", dept),
            ("Commencement Date", join_date),
            ("Classification", emp_type),
            ("Remuneration", salary),
        ], s))
        story.append(Spacer(1, 8))
        story.append(Paragraph("<b>Key Contractual Clauses:</b>", s["h2"]))
        story.append(Paragraph(
            "<b>1. Appointment:</b> Employer engages Employee to perform the duties of <b>" + position + "</b> reporting to " + manager + ".",
            s["body"]
        ))
        story.append(Paragraph(
            "<b>2. Probationary Period:</b> Initial service is subject to a 90-day probationary review during which performance will be evaluated.",
            s["body"]
        ))
        story.append(Paragraph(
            "<b>3. Intellectual Property Assignment:</b> All inventions, software, documentation, designs, and work products conceived or developed "
            "during employment belong exclusively and perpetually to Employer.",
            s["body"]
        ))
        story.append(Paragraph(
            "<b>4. Exclusivity & Devotion of Time:</b> Employee shall devote full business time and best efforts exclusively to Employer and shall not "
            "undertake any outside business or secondary employment.",
            s["body"]
        ))
        story.append(Paragraph(
            "<b>5. Termination & Notice:</b> Either party may terminate with 30 days written notice or pay in lieu thereof, subject to statutory minimums. "
            "Employer reserves the right of summary dismissal for gross misconduct.",
            s["body"]
        ))
        story.append(Spacer(1, 16))
        story.append(KeepTogether([_signature_block(c_name, org_name, s, is_signable=True)]))

    elif category == "exclusivity_affidavit":
        story.append(Paragraph("<b>AFFIDAVIT OF EMPLOYMENT EXCLUSIVITY</b>", s["title"]))
        story.append(Paragraph("Solemn Declaration & Non-Moonlighting Undertaking", s["subtitle"]))
        story.append(Paragraph(
            f"I, <b>{c_name}</b>, residing at the address provided in my onboarding records, being of sound mind, do hereby solemnly declare, "
            f"affirm, and undertake under oath as follows:",
            s["body"]
        ))
        story.append(Spacer(1, 6))
        story.append(Paragraph(
            "1. <b>Exclusive Full-Time Service:</b> I acknowledge that my engagement as <b>" + position + "</b> with <b>" + org_name + "</b> "
            "is full-time and exclusive. I covenant that I will devote my entire productive time, energy, and attention exclusively to the business of the Company.",
            s["body"]
        ))
        story.append(Paragraph(
            "2. <b>Non-Moonlighting Prohibition:</b> I affirm that I do not currently hold, nor will I undertake during my tenure, any secondary employment, "
            "freelance contracts, advisory roles, directorships, commercial partnerships, or consulting engagements, paid or unpaid, without prior written approval from Executive Management.",
            s["body"]
        ))
        story.append(Paragraph(
            "3. <b>Conflict of Interest:</b> I confirm that I have no personal, commercial, or financial affiliations that compete directly or indirectly with the Company.",
            s["body"]
        ))
        story.append(Paragraph(
            "4. <b>Consequences of Breach:</b> I understand that violation of this undertaking constitutes willful breach of trust and gross misconduct, "
            "resulting in immediate termination of employment for cause, forfeiture of benefits, and potential recovery of liquidated damages.",
            s["body"]
        ))
        story.append(Spacer(1, 16))
        story.append(KeepTogether([_signature_block(c_name, org_name, s, is_signable=True)]))

    elif category == "self_disclosure":
        story.append(Paragraph("<b>VOLUNTARY SELF-DISCLOSURE FORM</b>", s["title"]))
        story.append(Paragraph("Compliance, Conflict of Interest & Background Affirmation", s["subtitle"]))
        story.append(_meta_box([
            ("Candidate Full Name", c_name),
            ("Position Applied For", position),
            ("Department", dept),
            ("Submission Date", date.today().strftime("%B %d, %Y")),
        ], s))
        story.append(Spacer(1, 10))
        story.append(Paragraph("<b>Disclosure Statements:</b>", s["h2"]))
        disclosure_rows = [
            [Paragraph("<b>Question</b>", s["table_header"]), Paragraph("<b>Declaration</b>", s["table_header"])],
            [Paragraph("1. Do you have any commercial directorships, outside business interests, or side businesses?", s["table_cell"]), Paragraph("NONE / DISCLOSED IN ESS", s["table_cell"])],
            [Paragraph("2. Do you have any relatives or personal affiliations currently employed at this organization?", s["table_cell"]), Paragraph("NONE / DISCLOSED IN ESS", s["table_cell"])],
            [Paragraph("3. Are you bound by any non-compete or restrictive covenants from previous employers?", s["table_cell"]), Paragraph("NO / ALL CLEARED", s["table_cell"])],
            [Paragraph("4. Have you ever been convicted of a criminal offense involving fraud or financial misconduct?", s["table_cell"]), Paragraph("NO", s["table_cell"])],
            [Paragraph("5. Are all credentials, educational degrees, and employment histories accurate and complete?", s["table_cell"]), Paragraph("YES - VERIFIED", s["table_cell"])],
        ]
        t = Table(disclosure_rows, colWidths=[360, 170])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0A1128")),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.append(t)
        story.append(Spacer(1, 10))
        story.append(Paragraph(
            "<b>Affirmation:</b> I certify that the statements provided above are true, complete, and correct to the best of my knowledge. "
            "I understand that any misstatement or omission may result in disqualification or dismissal.",
            s["legal"]
        ))
        story.append(Spacer(1, 16))
        story.append(KeepTogether([_signature_block(c_name, org_name, s, is_signable=True)]))

    elif category == "job_application":
        story.append(Paragraph("<b>OFFICIAL JOB APPLICATION RECORD</b>", s["title"]))
        story.append(Paragraph("Candidate Profile & Application Information Form", s["subtitle"]))
        story.append(_meta_box([
            ("Applicant Name", c_name),
            ("Position Applied For", position),
            ("Department", dept),
            ("Email Address", hire_ctx.get("email") or "—"),
            ("Phone Number", hire_ctx.get("phone") or "—"),
            ("Available Start Date", join_date),
            ("Status", "HIRED & ONBOARDING STARTED"),
        ], s))
        story.append(Spacer(1, 10))
        story.append(Paragraph("<b>Profile Summary & Application History</b>", s["h2"]))
        story.append(Paragraph(
            f"The candidate <b>{c_name}</b> successfully completed all recruitment evaluations, technical interviews, and reference screenings "
            f"for the position of <b>{position}</b>. This application record archives candidate submission data and consent for onboarding verification.",
            s["body"]
        ))
        story.append(Paragraph("<b>Verification & Authorizations:</b>", s["h2"]))
        story.append(Paragraph("• Candidate authorized background checks, credential verifications, and professional reference reviews.", s["body"]))
        story.append(Paragraph("• Privacy notice (HR-HIR-004) acknowledged and GDPR/DPDP compliant retention policy applied.", s["body"]))
        story.append(Spacer(1, 16))
        story.append(KeepTogether([_signature_block(c_name, org_name, s, is_signable=False)]))

    elif category == "daily_work_report":
        story.append(Paragraph("<b>DAILY WORK REPORT (DWR) TEMPLATE</b>", s["title"]))
        story.append(Paragraph("Zoiko Standard Operational Daily Activity & Deliverable Log", s["subtitle"]))
        story.append(_meta_box([
            ("Employee Name", c_name),
            ("Position", position),
            ("Department", dept),
            ("Reporting Manager", manager),
            ("Report Date", date.today().strftime("%Y-%m-%d")),
            ("Work Location", "Office / Remote Hybrid"),
        ], s))
        story.append(Spacer(1, 10))
        story.append(Paragraph("<b>1. Daily Task Breakdown Matrix</b>", s["h2"]))
        dwr_table = [
            [Paragraph("<b>Time</b>", s["table_header"]), Paragraph("<b>Task Description / JIRA Ticket</b>", s["table_header"]), Paragraph("<b>Deliverable Output</b>", s["table_header"]), Paragraph("<b>Status</b>", s["table_header"])],
            [Paragraph("09:00 - 10:00", s["table_cell"]), Paragraph("Daily Standup & Sprint Planning", s["table_cell"]), Paragraph("Sprint task alignment", s["table_cell"]), Paragraph("Completed", s["table_cell"])],
            [Paragraph("10:00 - 13:00", s["table_cell"]), Paragraph("Core Task Execution (Item #1)", s["table_cell"]), Paragraph("Code / Deliverable Draft", s["table_cell"]), Paragraph("Completed", s["table_cell"])],
            [Paragraph("14:00 - 16:30", s["table_cell"]), Paragraph("Cross-Functional Review & QA", s["table_cell"]), Paragraph("Test logs / Peer Sign-off", s["table_cell"]), Paragraph("In Progress", s["table_cell"])],
            [Paragraph("16:30 - 18:00", s["table_cell"]), Paragraph("Documentation & DWR Submission", s["table_cell"]), Paragraph("Daily report filed in portal", s["table_cell"]), Paragraph("Completed", s["table_cell"])],
        ]
        t = Table(dwr_table, colWidths=[80, 210, 160, 80])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0A1128")),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(t)
        story.append(Spacer(1, 8))
        story.append(Paragraph("<b>2. Key Accomplishments Today:</b>", s["h3"]))
        story.append(Paragraph("• Documented and achieved daily deliverables in accordance with sprint goals.", s["body"]))
        story.append(Paragraph("<b>3. Blockers / Dependencies:</b>", s["h3"]))
        story.append(Paragraph("• None reported / Escalated to manager if any.", s["body"]))
        story.append(Paragraph("<b>4. Planned Deliverables for Tomorrow:</b>", s["h3"]))
        story.append(Paragraph("• Continue scheduled sprint backlog execution and milestone validation.", s["body"]))
        story.append(Spacer(1, 16))
        story.append(KeepTogether([_signature_block(c_name, org_name, s, is_signable=False)]))

    elif category == "velocity_report":
        story.append(Paragraph("<b>ZOIKO GROUP PROJECT VELOCITY REPORT TEMPLATE</b>", s["title"]))
        story.append(Paragraph("Sprint Cadence, Task Burn-Up & Velocity Performance Framework", s["subtitle"]))
        story.append(_meta_box([
            ("Project / Product", f"{dept} Strategic Initiatives"),
            ("Prepared By", c_name),
            ("Designation", position),
            ("Sprint / Cycle", "Cycle 2026-Q4 Sprint #2"),
            ("Reviewing Manager", manager),
        ], s))
        story.append(Spacer(1, 10))
        story.append(Paragraph("<b>1. Sprint Velocity & Commitment Summary</b>", s["h2"]))
        vel_table = [
            [Paragraph("<b>Metric Dimension</b>", s["table_header"]), Paragraph("<b>Planned Target</b>", s["table_header"]), Paragraph("<b>Actual Achieved</b>", s["table_header"]), Paragraph("<b>Variance / Notes</b>", s["table_header"])],
            [Paragraph("Committed Story Points", s["table_cell"]), Paragraph("45 Points", s["table_cell"]), Paragraph("44 Points", s["table_cell"]), Paragraph("97.8% Completion", s["table_cell"])],
            [Paragraph("Planned Engineering Hours", s["table_cell"]), Paragraph("160 Hours", s["table_cell"]), Paragraph("158 Hours", s["table_cell"]), Paragraph("On Budget", s["table_cell"])],
            [Paragraph("Delivered Epics / Features", s["table_cell"]), Paragraph("6 Items", s["table_cell"]), Paragraph("6 Items", s["table_cell"]), Paragraph("100% Milestone Fit", s["table_cell"])],
            [Paragraph("Defect Escape Rate", s["table_cell"]), Paragraph("< 2 Defects", s["table_cell"]), Paragraph("0 Defects", s["table_cell"]), Paragraph("Passed Strict QA", s["table_cell"])],
            [Paragraph("Rolling 3-Sprint Velocity", s["table_cell"]), Paragraph("42.0 Avg", s["table_cell"]), Paragraph("43.5 Avg", s["table_cell"]), Paragraph("+3.5% Velocity Growth", s["table_cell"])],
        ]
        t = Table(vel_table, colWidths=[160, 110, 110, 150])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0A1128")),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(t)
        story.append(Spacer(1, 8))
        story.append(Paragraph("<b>2. Key Milestones Completed:</b>", s["h3"]))
        story.append(Paragraph("• Core architecture and functional test passes verified and merged.", s["body"]))
        story.append(Paragraph("<b>3. Velocity Impediments & Lessons Learned:</b>", s["h3"]))
        story.append(Paragraph("• Optimized asynchronous API testing; reduced CI pipeline build duration by 15%.", s["body"]))
        story.append(Spacer(1, 16))
        story.append(KeepTogether([_signature_block(c_name, org_name, s, is_signable=False)]))

    doc.build(story)
    return buf.getvalue()


# ── Core Orchestrator: Generate Full Onboarding Package ──────────────────────────────────────────────
def generate_onboarding_package(
    db: Session,
    hire: OnboardingNewHire,
    categories: Optional[list[str]] = None,
    actor=None,
) -> list[OnboardingDocument]:
    """Generates all requested or default 10 onboarding documents for a new hire.
    Populates them with hire & org details, generates PDFs, configures e-signing where required,
    and returns the created/updated OnboardingDocument records.
    """
    categories_to_generate = categories or PACKAGE_CATEGORIES
    org = db.get(Organization, hire.organization_id)
    org_name = getattr(org, "name", None) or getattr(org, "display_name", None) or "Zoiko Enterprises"

    # Resolve recruitment offer details if available
    cand = db.query(RecruitmentCandidate).filter(RecruitmentCandidate.onboarding_new_hire_id == hire.id).first()
    offer = (
        db.query(RecruitmentOffer)
        .filter(RecruitmentOffer.candidate_id == cand.id)
        .order_by(RecruitmentOffer.id.desc())
        .first()
        if cand
        else None
    )

    hire_ctx = {
        "candidate_name": hire.candidate_name,
        "email": hire.email,
        "phone": hire.phone,
        "position": hire.position or (offer.position if offer else "Team Member"),
        "department": hire.department_name or "Operations",
        "manager": hire.manager_name or "Department Manager",
        "joining_date": hire.joining_date.strftime("%b %d, %Y") if hire.joining_date else date.today().strftime("%b %d, %Y"),
        "employment_type": hire.employment_type or (offer.employment_type if offer else "Full-Time"),
        "salary": f"${offer.salary:,.2f} per annum" if (offer and offer.salary) else "As per offer schedule",
        "org_name": org_name,
    }

    created_or_updated = []
    store = storage.get_store()

    for cat in categories_to_generate:
        spec = SPEC_BY_CATEGORY.get(cat)
        if not spec:
            continue

        existing_doc = (
            db.query(OnboardingDocument)
            .filter(
                OnboardingDocument.onboarding_new_hire_id == hire.id,
                OnboardingDocument.category == cat,
                OnboardingDocument.is_deleted == False,  # noqa: E712
            )
            .first()
        )

        # If document already exists and is already approved / signed, keep it
        if existing_doc and existing_doc.status == "approved":
            created_or_updated.append(existing_doc)
            continue

        # If document already has an active signable GeneratedDocument, keep it
        if existing_doc and existing_doc.document_id and spec["requires_signature"]:
            existing_gen = db.get(GeneratedDocument, existing_doc.document_id)
            if existing_gen and existing_gen.status in ("ISSUED", "EXECUTED"):
                created_or_updated.append(existing_doc)
                continue

        # If offer letter already exists and was executed from recruitment offer
        if cat == "offer_letter" and offer and offer.document_id:
            gen_offer = db.get(GeneratedDocument, offer.document_id)
            if gen_offer and gen_offer.status == "EXECUTED":
                if not existing_doc:
                    existing_doc = OnboardingDocument(
                        organization_id=hire.organization_id,
                        onboarding_new_hire_id=hire.id,
                        title=spec["title"],
                        category=cat,
                        document_id=gen_offer.id,
                        file_path=gen_offer.executed_pdf_path or gen_offer.pdf_path,
                        status="approved",
                        created_by="system",
                    )
                    db.add(existing_doc)
                else:
                    existing_doc.document_id = gen_offer.id
                    existing_doc.file_path = gen_offer.executed_pdf_path or gen_offer.pdf_path
                    existing_doc.status = "approved"
                db.commit()
                created_or_updated.append(existing_doc)
                continue

        # Generate standard styled PDF for this document
        pdf_bytes = build_document_pdf(cat, hire_ctx)
        pdf_filename = f"onb-{hire.id}-{cat}-{secrets.token_hex(4)}.pdf"
        stored_key = store.put(hire.organization_id, pdf_filename, pdf_bytes)

        gen_doc_id = None
        if spec["requires_signature"]:
            # Create a GeneratedDocument so candidate can sign electronically
            now = datetime.utcnow()
            doc_num = f"ONB-{cat.upper()[:4]}-{hire.id}-{secrets.token_hex(3).upper()}"

            # Check if template definition exists, otherwise use a valid existing canonical ID
            canonical_id = spec["canonical_id"]
            t_def = db.get(TemplateDefinition, canonical_id)
            if not t_def:
                fallback_map = {
                    "self_disclosure": "HR-VER-002",
                    "exclusivity_affidavit": "HR-CON-025",
                    "offer_letter": "HR-HIR-011",
                    "nda": "HR-CON-017",
                    "employment_contract": "HR-CON-001",
                }
                canonical_id = fallback_map.get(cat, "HR-CON-001")
                t_def = db.get(TemplateDefinition, canonical_id)

            family_id = t_def.family_id if t_def else spec["family_id"]
            kind = t_def.kind if t_def else "AGREEMENT"

            # Create the GeneratedDocument record
            gen_doc = GeneratedDocument(
                document_number=doc_num,
                organization_id=hire.organization_id,
                canonical_id=canonical_id,
                family_id=family_id,
                title=spec["title"],
                kind=kind,
                legal_risk="L1",
                sensitivity="C2",
                output_mode="DOCUMENT",
                execution_mode="SIGN_EMPLOYEE",
                audience="COUNTERPARTY",
                approval_policy="L1",
                subject_type="new_hire",
                subject_id=hire.id,
                source_ref=f"onboarding_new_hire:{hire.id}",
                language="en",
                pdf_path=stored_key,
                pdf_sha256=storage.fernet_for(b"zoiko-hr-generated-document-v1").digest() if hasattr(storage, "digest") else "sha256",
                recipient_name=hire.candidate_name,
                recipient_email=hire.email,
                requested_by=actor.id if actor else 1,
                issued_at=now,
                due_by=now + timedelta(days=14),
                expires_at=now + timedelta(days=30),
            )
            state._set(gen_doc, "ISSUED")
            # Recompute exact SHA-256 for integrity check
            import hashlib
            gen_doc.pdf_sha256 = hashlib.sha256(pdf_bytes).hexdigest()
            db.add(gen_doc)
            db.flush()

            # Issue candidate signing token and cache in hire profile details
            raw_token, _ = signing.issue_candidate_token(db, gen_doc)
            details = dict(hire.profile_details or {})
            signing_tokens = dict(details.get("_signing_tokens") or {})
            signing_tokens[str(gen_doc.id)] = raw_token
            details["_signing_tokens"] = signing_tokens
            hire.profile_details = details
            gen_doc_id = gen_doc.id

        if not existing_doc:
            doc_status = "requested" if spec["requires_signature"] else "approved"
            existing_doc = OnboardingDocument(
                organization_id=hire.organization_id,
                onboarding_new_hire_id=hire.id,
                title=spec["title"],
                category=cat,
                file_path=stored_key,
                document_id=gen_doc_id,
                status=doc_status,
                created_by="system",
            )
            db.add(existing_doc)
        else:
            existing_doc.file_path = stored_key
            if gen_doc_id:
                existing_doc.document_id = gen_doc_id
                if existing_doc.status != "approved":
                    existing_doc.status = "requested"
        db.commit()
        db.refresh(existing_doc)
        created_or_updated.append(existing_doc)

    try:
        sync_onboarding_document_checklist(db, hire)
    except Exception:
        pass

    return created_or_updated


def generate_html_for_doc(doc: GeneratedDocument) -> str:
    """Generates an executive, corporate-styled HTML agreement for document signing and browser viewing."""
    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #0f172a;
    line-height: 1.6;
    margin: 0;
    padding: 24px;
    background: #ffffff;
  }}
  .contract-header {{
    border-bottom: 3px solid #0A1128;
    padding-bottom: 20px;
    margin-bottom: 24px;
  }}
  .brand-badge {{
    display: inline-block;
    background: #0A1128;
    color: #ffffff;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.1em;
    padding: 4px 10px;
    border-radius: 6px;
    text-transform: uppercase;
  }}
  h1 {{
    font-size: 22px;
    color: #0A1128;
    margin: 12px 0 4px 0;
    font-weight: 700;
  }}
  .meta-grid {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 24px;
    font-size: 13px;
  }}
  .meta-item strong {{
    color: #475569;
    display: block;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }}
  .meta-item span {{
    color: #0f172a;
    font-weight: 600;
  }}
  .section-title {{
    font-size: 14px;
    font-weight: 700;
    color: #0A1128;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-top: 24px;
    margin-bottom: 8px;
    border-left: 3px solid #2563EB;
    padding-left: 8px;
  }}
  p, li {{
    font-size: 14px;
    color: #334155;
    margin: 6px 0;
  }}
  ul {{
    padding-left: 20px;
  }}
  .sig-notice {{
    margin-top: 32px;
    padding: 16px;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 12px;
    font-size: 13px;
    color: #1e40af;
  }}
</style>
</head>
<body>
  <div class="contract-header">
    <span class="brand-badge">Zoiko HR · Official Employment Agreement</span>
    <h1>{doc.title}</h1>
    <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Document Ref: {doc.document_number}</p>
  </div>

  <div class="meta-grid">
    <div class="meta-item">
      <strong>Recipient / Signer</strong>
      <span>{doc.recipient_name or 'New Hire'}</span>
    </div>
    <div class="meta-item">
      <strong>Email Address</strong>
      <span>{doc.recipient_email or '—'}</span>
    </div>
    <div class="meta-item">
      <strong>Document Status</strong>
      <span>{doc.status}</span>
    </div>
    <div class="meta-item">
      <strong>Security & Legal Policy</strong>
      <span>L1 Binding / Electronic Consent</span>
    </div>
  </div>

  <div class="section-title">1. Purpose & Scope</div>
  <p>This official agreement governs the operational and contractual obligations between the Employer and <strong>{doc.recipient_name or 'the Employee'}</strong>. The terms set forth herein have been issued pursuant to corporate governance standards and regulatory compliance policies.</p>

  <div class="section-title">2. Terms & Conditions</div>
  <p>The undersigned candidate hereby agrees to the comprehensive stipulations, responsibilities, confidentiality covenants, and performance metrics designated under this {doc.title}.</p>
  <ul>
    <li>Compliance with all company directives, statutory guidelines, and workplace policies.</li>
    <li>Protection and non-disclosure of proprietary trade secrets, intellectual property, and client records.</li>
    <li>Timely submission of reports, deliverables, and operational requirements.</li>
  </ul>

  <div class="section-title">3. Execution & Electronic Signature</div>
  <p>By signing below using the authorized Zoiko HR electronic signature interface, the counterparty affirms understanding of and agreement with all incorporated terms.</p>

  <div class="sig-notice">
    <strong>Electronic Signature Notice:</strong> Applying your signature below creates a legally binding electronic execution record compliant with the Electronic Signatures in Global and National Commerce Act (E-SIGN) and uniform commercial standards.
  </div>
</body>
</html>"""


def sync_onboarding_document_checklist(db: Session, hire: OnboardingNewHire) -> None:
    """Syncs the new hire's onboarding documents into their Onboarding Checklist.
    Until documents are signed, they show as pending; once signed, they show as completed with the signed doc.
    """
    from app.modules.hr.models import OnboardingChecklist, OnboardingChecklistItem
    # Look for or create the dedicated documents checklist
    checklist = (
        db.query(OnboardingChecklist)
        .filter(
            OnboardingChecklist.onboarding_new_hire_id == hire.id,
            OnboardingChecklist.name == "Onboarding Documents & Agreements",
            OnboardingChecklist.is_deleted == False,
        )
        .first()
    )
    if not checklist:
        checklist = OnboardingChecklist(
            organization_id=hire.organization_id,
            onboarding_new_hire_id=hire.id,
            name="Onboarding Documents & Agreements",
            description="Review and electronically sign official onboarding agreements, operational templates, and compliance documents.",
            category="HR",
            status="pending",
        )
        db.add(checklist)
        db.flush()

    # Sync all documents
    docs = (
        db.query(OnboardingDocument)
        .filter(
            OnboardingDocument.onboarding_new_hire_id == hire.id,
            OnboardingDocument.is_deleted == False,
        )
        .order_by(OnboardingDocument.id)
        .all()
    )

    existing_items = {
        item.item_key: item
        for item in checklist.items
        if item.item_key and not item.is_deleted
    }

    for d in docs:
        key = f"doc_{d.id}"
        is_signed = (d.status == "approved")
        is_signable = bool(d.document_id) or d.category in SIGNABLE_CATEGORIES
        item_title = f"Sign {d.title}" if is_signable else f"Review {d.title}"

        if key in existing_items:
            it = existing_items[key]
            it.title = item_title
            it.completed = is_signed
            it.completed_at = d.updated_at if is_signed else None
            it.description = f"✓ Signed & Approved · {d.title}" if is_signed else f"Pending electronic signature · {d.title}"
        else:
            it = OnboardingChecklistItem(
                organization_id=hire.organization_id,
                checklist_id=checklist.id,
                title=item_title,
                description=f"✓ Signed & Approved · {d.title}" if is_signed else f"Pending electronic signature · {d.title}",
                completed=is_signed,
                completed_at=d.updated_at if is_signed else None,
                mandatory=is_signable,
                item_key=key,
                due_date=hire.joining_date or date.today(),
            )
            db.add(it)

    # Recompute checklist status
    db.flush()
    live = [i for i in checklist.items if not i.is_deleted]
    if live:
        done = sum(1 for i in live if i.completed)
        checklist.status = "completed" if done == len(live) else ("in_progress" if done else "pending")
    db.commit()


def get_signing_token_for_onboarding_doc(db: Session, onb_doc: OnboardingDocument) -> Optional[str]:
    """Retrieves or creates a stable candidate signing token for a signable onboarding document."""
    if not onb_doc.document_id:
        return None
    gen_doc = db.get(GeneratedDocument, onb_doc.document_id)
    if not gen_doc or gen_doc.status != "ISSUED":
        return None

    # Check for active token
    from app.modules.employee.models import SecurityActionPurpose, SecurityActionToken
    from app.modules.hr.models import OnboardingNewHire

    hire = db.get(OnboardingNewHire, onb_doc.onboarding_new_hire_id) if onb_doc.onboarding_new_hire_id else None
    details = dict(hire.profile_details or {}) if hire else {}
    signing_tokens = dict(details.get("_signing_tokens") or {})

    cached_raw = signing_tokens.get(str(gen_doc.id))
    if cached_raw:
        h = signing._token_hash(cached_raw)
        active = (
            db.query(SecurityActionToken)
            .filter(
                SecurityActionToken.token_hash == h,
                SecurityActionToken.purpose == SecurityActionPurpose.DOCUMENT_SIGN,
                SecurityActionToken.used_at.is_(None),
                SecurityActionToken.expires_at > datetime.utcnow(),
            )
            .first()
        )
        if active:
            return cached_raw

    # Otherwise issue a fresh candidate signing token
    raw, _ = signing.issue_candidate_token(db, gen_doc)
    if hire:
        signing_tokens[str(gen_doc.id)] = raw
        details["_signing_tokens"] = signing_tokens
        hire.profile_details = details
    db.commit()
    return raw
