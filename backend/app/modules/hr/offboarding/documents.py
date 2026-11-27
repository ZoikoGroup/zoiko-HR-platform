"""Exit documents: letters issued from the case (resignation acknowledgement, relieving letter, experience letter,
settlement statement, exit summary).

A document is a frozen snapshot of the values printed; the PDF is drawn from the snapshot (reportlab), so reissuing makes
a new document and the old one stays as issued. After the last working day the person cannot sign in, so they get an
e-mailed link (a random token, stored only as its sha256) that downloads their documents until it expires.
"""
import hashlib
import io
import secrets
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException, NotFoundException
from app.modules.employee.models import Employee
from app.modules.hr.offboarding import settings as S
from app.modules.hr.offboarding.models import DOCUMENT_KINDS, OffboardingCase, OffboardingDocument, OffboardingSettlement

TITLES = {"resignation_acknowledgement": "Resignation acknowledgement", "relieving_letter": "Relieving letter",
          "experience_letter": "Experience letter", "settlement_statement": "Final settlement statement",
          "exit_summary": "Exit summary"}


def _fmt(d) -> str:
    if not d:
        return "—"
    if isinstance(d, str):
        try:
            d = date.fromisoformat(d[:10])
        except ValueError:
            return d
    return f"{d.day} {d:%B %Y}"


def _org_block(db: Session, org_id: int) -> dict:
    try:
        from app.modules.hr import company_profile as CP
        p = CP.get_profile(db, org_id)
    except Exception:
        p = {}
    from app.modules.hr.models import Organization
    org = db.get(Organization, org_id)
    name = p.get("legal_name") or getattr(org, "organization_name", None) or getattr(org, "display_name", None) or "The Company"
    address = ", ".join(x for x in (p.get("address_line1"), p.get("address_line2"), p.get("city_display") or p.get("city"),
                                    p.get("state"), p.get("postal_code")) if x)
    return {"name": name, "address": address, "signatory_name": p.get("signatory_name") or "",
            "signatory_title": p.get("signatory_title") or "Human Resources", "hr_email": p.get("hr_contact_email") or ""}


def _snapshot(db: Session, case: OffboardingCase, kind: str) -> dict:
    from app.modules.hr.offboarding.service import EXIT_TYPE_LABELS, NOTICE_LABELS, name_of
    emp = db.get(Employee, case.employee_id)
    desg = getattr(getattr(emp, "designation", None), "name", None) or emp.job_title
    snap = {"org": _org_block(db, case.organization_id), "employee_name": name_of(emp), "employee_code": emp.employee_code,
            "designation": desg, "department": getattr(getattr(emp, "department", None), "name", None),
            "date_of_joining": str(emp.date_of_joining) if emp.date_of_joining else None,
            "resignation_date": str(case.resignation_date) if case.resignation_date else None,
            "last_working_day": str(case.last_working_day) if case.last_working_day else None,
            "exit_type": case.exit_type, "exit_type_label": EXIT_TYPE_LABELS.get(case.exit_type),
            "notice_label": NOTICE_LABELS.get(case.notice_handling), "case_number": case.case_number,
            "issued_on": str(date.today())}
    if kind == "settlement_statement":
        st = db.query(OffboardingSettlement).filter(OffboardingSettlement.case_id == case.id).first()
        if st is None:
            raise BadRequestException("There is no settlement for this case yet.")
        snap["settlement"] = {"currency": st.currency, "earnings": st.earnings or [], "deductions": st.deductions or [],
                              "net_amount": float(st.net_amount or 0), "status": st.status,
                              "paid_on": str(st.paid_on) if st.paid_on else None}
    return snap


def issue(db: Session, case: OffboardingCase, actor, kind: str, notify: bool = True) -> OffboardingDocument:
    from app.modules.hr.offboarding.service import OffboardingError, _notify, log, name_of
    if kind not in DOCUMENT_KINDS:
        raise BadRequestException("Unknown document.")
    if case.status not in ("approved", "exited", "closed"):
        raise OffboardingError("Documents can be issued once the exit is approved.")
    if kind == "resignation_acknowledgement" and case.exit_type != "resignation":
        raise OffboardingError("A resignation acknowledgement is only for resignations.")
    if kind in ("relieving_letter", "experience_letter") and case.exit_type == "death_in_service":
        raise OffboardingError("This letter does not apply to this exit.")
    doc = OffboardingDocument(organization_id=case.organization_id, case_id=case.id, kind=kind, title=TITLES[kind],
                              content=_snapshot(db, case, kind), issued_by=getattr(actor, "id", None))
    # an earlier copy of the same letter is replaced by this one
    for old in db.query(OffboardingDocument).filter(OffboardingDocument.case_id == case.id, OffboardingDocument.kind == kind,
                                                    OffboardingDocument.revoked_at.is_(None)):
        old.revoked_at = datetime.utcnow()
    db.add(doc)
    db.flush()
    log(db, case, getattr(actor, "id", None), "document_issued", f"{doc.title} issued"
        + (f" by {name_of(actor)}" if actor is not None else ""))
    if notify and case.exit_type != "death_in_service":
        _notify(db, case.organization_id, case.employee_id, "offboarding.document_issued", "/employee/ess/exit/documents",
                title=doc.title)
    db.commit()
    if case.status in ("exited", "closed"):
        send_link(db, case, only=[doc])
    from app.modules.hr.offboarding.service import after_change
    after_change(db, case)
    return doc


def revoke(db: Session, actor, case: OffboardingCase, doc_id: int) -> OffboardingDocument:
    from app.modules.hr.offboarding.service import log
    doc = db.query(OffboardingDocument).filter(OffboardingDocument.id == doc_id, OffboardingDocument.case_id == case.id).first()
    if doc is None:
        raise NotFoundException("Document", doc_id)
    if doc.revoked_at is None:
        doc.revoked_at = datetime.utcnow()
        doc.access_token_hash = None
        log(db, case, actor.id, "document_revoked", f"{doc.title} withdrawn", hr_only=True)
        db.commit()
        from app.modules.hr.offboarding.service import after_change
        after_change(db, case)
    return doc


def doc_out(d: OffboardingDocument) -> dict:
    return {"id": d.id, "case_id": d.case_id, "kind": d.kind, "title": d.title, "issued_at": d.issued_at,
            "revoked_at": d.revoked_at, "downloaded_at": d.downloaded_at}


def list_docs(db: Session, case: OffboardingCase, include_revoked: bool) -> list:
    q = db.query(OffboardingDocument).filter(OffboardingDocument.case_id == case.id)
    if not include_revoked:
        q = q.filter(OffboardingDocument.revoked_at.is_(None))
    return [doc_out(d) for d in q.order_by(OffboardingDocument.issued_at.desc(), OffboardingDocument.id.desc()).all()]


def get_doc(db: Session, case: OffboardingCase, doc_id: int, allow_revoked: bool) -> OffboardingDocument:
    q = db.query(OffboardingDocument).filter(OffboardingDocument.id == doc_id, OffboardingDocument.case_id == case.id)
    if not allow_revoked:
        q = q.filter(OffboardingDocument.revoked_at.is_(None))
    d = q.first()
    if d is None:
        raise NotFoundException("Document", doc_id)
    return d


# ── the link for after the last day ──────────────────────────────────────────────────────────────────────────────────

def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def send_link(db: Session, case: OffboardingCase, only: Optional[list] = None) -> int:
    """E-mail the person a download link for each live document (to the personal address when there is one)."""
    from app.modules.hr.offboarding.service import _email
    if case.exit_type == "death_in_service":
        return 0
    docs = only if only is not None else (db.query(OffboardingDocument)
                                          .filter(OffboardingDocument.case_id == case.id,
                                                  OffboardingDocument.revoked_at.is_(None)).all())
    if not docs:
        return 0
    days = S.get_settings(db, case.organization_id)["documents_link_days"]
    rows = []
    for d in docs:
        token = secrets.token_urlsafe(32)
        d.access_token_hash = _hash(token)
        d.access_expires_at = datetime.utcnow() + timedelta(days=days)
        rows.append((d.title, f"/exit-documents/{token}"))
    db.commit()
    emp = db.get(Employee, case.employee_id)
    for title, path in rows:
        _email(db, case.organization_id, emp, to=emp.personal_email or emp.email, heading=f"Your {title.lower()}",
               intro=f"Your {title.lower()} is ready. The link works for {days} days.",
               rows=[("Document", title)], button_url_path=path, button_label="Download")
    return len(rows)


def by_token(db: Session, token: str) -> OffboardingDocument:
    if not token or len(token) > 200:
        raise NotFoundException("Document")
    d = db.query(OffboardingDocument).filter(OffboardingDocument.access_token_hash == _hash(token)).first()
    if d is None or d.revoked_at is not None or (d.access_expires_at and d.access_expires_at < datetime.utcnow()):
        raise NotFoundException("Document")
    return d


# ── PDF ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

def _body(doc: OffboardingDocument) -> list:
    c = doc.content or {}
    org = c.get("org") or {}
    name, role = c.get("employee_name"), c.get("designation") or "employee"
    if doc.kind == "resignation_acknowledgement":
        return [f"Dear {name},",
                f"We acknowledge your resignation dated {_fmt(c.get('resignation_date'))}. It has been accepted, and your "
                f"last working day with {org.get('name')} will be {_fmt(c.get('last_working_day'))}.",
                "Before then, please complete the tasks listed in My Exit, including the handover of your work and the return "
                "of company property. Your final settlement will be processed after your last working day.",
                "Thank you for your contribution to the team."]
    if doc.kind == "relieving_letter":
        return ["To whom it may concern,",
                f"This is to certify that {name} (employee code {c.get('employee_code')}) was employed with {org.get('name')} "
                f"as {role} from {_fmt(c.get('date_of_joining'))} to {_fmt(c.get('last_working_day'))}.",
                f"{name} has been relieved of their duties with effect from the close of business on "
                f"{_fmt(c.get('last_working_day'))}, after completing the exit formalities.",
                "We wish them every success in the future."]
    if doc.kind == "experience_letter":
        dept = f" in the {c['department']} department" if c.get("department") else ""
        return ["To whom it may concern,",
                f"This is to certify that {name} worked with {org.get('name')} as {role}{dept} from "
                f"{_fmt(c.get('date_of_joining'))} to {_fmt(c.get('last_working_day'))}.",
                "During this period their work and conduct were found to be satisfactory.",
                "We wish them every success in their future career."]
    if doc.kind == "settlement_statement":
        return [f"Final settlement statement for {name} (employee code {c.get('employee_code')}), last working day "
                f"{_fmt(c.get('last_working_day'))}."]
    return [f"Exit summary for {name} (employee code {c.get('employee_code')}).",
            f"Type of exit: {c.get('exit_type_label')}. Notice: {c.get('notice_label') or '—'}.",
            f"Date of joining: {_fmt(c.get('date_of_joining'))}. Last working day: {_fmt(c.get('last_working_day'))}."]


def render_pdf(doc: OffboardingDocument) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    from xml.sax.saxutils import escape

    c = doc.content or {}
    org = c.get("org") or {}
    buf = io.BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=A4, leftMargin=22 * mm, rightMargin=22 * mm, topMargin=20 * mm, bottomMargin=20 * mm,
                            title=doc.title, author=org.get("name") or "")
    ss = getSampleStyleSheet()
    body = ParagraphStyle("b", parent=ss["Normal"], fontSize=10.5, leading=15, spaceAfter=8)
    small = ParagraphStyle("s", parent=ss["Normal"], fontSize=9, leading=12, textColor=colors.HexColor("#475569"))
    head = ParagraphStyle("h", parent=ss["Title"], fontSize=15, leading=19, alignment=0, spaceAfter=4)
    story = [Paragraph(escape(org.get("name") or ""), ParagraphStyle("o", parent=ss["Heading2"], spaceAfter=0)),
             Paragraph(escape(org.get("address") or ""), small), Spacer(1, 10 * mm),
             Paragraph(escape(doc.title), head),
             Paragraph(f"Date: {escape(_fmt(c.get('issued_on')))} &nbsp;&nbsp; Reference: {escape(c.get('case_number') or '')}", small),
             Spacer(1, 6 * mm)]
    for p in _body(doc):
        story.append(Paragraph(escape(p), body))
    st = c.get("settlement")
    if doc.kind == "settlement_statement" and st:
        cur = st.get("currency") or ""
        rows = [["Description", f"Amount ({cur})"]]
        rows += [[escape(l["label"]), f"{l['amount']:,.2f}"] for l in st.get("earnings") or []]
        rows += [[escape("Less: " + l["label"]), f"-{l['amount']:,.2f}"] for l in st.get("deductions") or []]
        rows.append(["Net amount", f"{st.get('net_amount', 0):,.2f}"])
        t = Table(rows, colWidths=[120 * mm, 40 * mm])
        t.setStyle(TableStyle([("FONT", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONT", (0, -1), (-1, -1), "Helvetica-Bold"),
                               ("ALIGN", (1, 0), (1, -1), "RIGHT"), ("LINEBELOW", (0, 0), (-1, 0), 0.6, colors.grey),
                               ("LINEABOVE", (0, -1), (-1, -1), 0.6, colors.grey), ("TOPPADDING", (0, 0), (-1, -1), 4),
                               ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
        story += [t, Spacer(1, 4 * mm)]
        if st.get("paid_on"):
            story.append(Paragraph(f"Paid on {escape(_fmt(st['paid_on']))}.", body))
    story += [Spacer(1, 12 * mm), Paragraph(f"For {escape(org.get('name') or '')}", body)]
    if org.get("signatory_name"):
        story.append(Paragraph(f"<b>{escape(org['signatory_name'])}</b>", body))
    story.append(Paragraph(escape(org.get("signatory_title") or ""), small))
    pdf.build(story)
    return buf.getvalue()
