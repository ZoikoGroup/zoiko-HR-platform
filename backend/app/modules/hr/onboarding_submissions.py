"""One pipeline for everything a new hire hands back during onboarding.

Every submission (a portal upload, a "Complete and return" package form, a structured portal form, an acknowledgement, an
electronic signature) goes through on_submitted(): the OnboardingDocument row exists and carries the new version, the
activity log records it, HR admins get one digest e-mail per hire per DIGEST_MINUTES, the hire's "Onboarding Documents &
Agreements" checklist follows, and everything is committed once.

The same module answers the read side: what kind of item a row is, its board state (one rule for "done" everywhere), the
admin list item / detail (answers with financial values masked, signature or acknowledgement evidence, version history),
review (approve / reject with a reason), the file of any row (read_onboarding_file: document store first, legacy disk files
still served), and the new hire's own "My documents" list.
"""
from __future__ import annotations

import io
import logging
import re
import secrets
import zipfile
from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session, object_session

from app.modules.doc_templates import storage
from app.modules.hr.models import OnboardingActivity, OnboardingDocument, OnboardingFormSubmission, OnboardingNewHire

logger = logging.getLogger("zoiko.onboarding.submissions")

# structured portal forms (onboarding_documents.FORMS) → the category of their row in Onboarding › Documents
FORM_CATEGORIES = {"HR-ONB-001": "starter_info", "HR-ONB-003": "emergency_contacts", "HR-ONB-017": "bank_details"}
DONE_STATES = ("completed", "available")             # board states that count as done (needs_review is NOT done)
DIGEST_MINUTES = 10
DIGEST_KEY = "_hr_digest_sent_at"
KINDS = ("upload", "form", "package")
SUBMIT_KINDS = ("upload", "package_form", "form", "acknowledge", "sign")
_ACTIVITY = {"upload": ("Document Submitted", "uploaded '{t}' for review."),
             "package_form": ("Form Submitted", "filled in and submitted '{t}' online for review."),
             "form": ("Form Submitted", "submitted '{t}' for review."),
             "acknowledge": ("Document acknowledged", "acknowledged receipt of '{t}'."),
             "sign": ("Document Signed", "electronically signed '{t}'.")}


# ── what a row is ────────────────────────────────────────────────────────────────────────────────────────────────────
def kind_of(doc: OnboardingDocument) -> str:
    if getattr(doc, "kind", None) in KINDS:
        return doc.kind
    if getattr(doc, "form_submission_id", None):
        return "form"
    from app.modules.hr import onboarding_package_org as ORG
    return "package" if ORG.is_package_category(doc.category) else "upload"


def mode_for(doc: OnboardingDocument) -> Optional[str]:
    k = kind_of(doc)
    if k == "form":
        return "COMPLETE"
    if k == "upload":
        return None
    from app.modules.hr.onboarding_package import mode_of
    return mode_of(doc)


_PLAIN_STATE = {"requested": "awaiting_upload", "pending": "needs_review", "approved": "completed", "verified": "completed",
                "executed": "completed", "rejected": "rejected", "available": "available"}


def board_state(db, doc: OnboardingDocument) -> str:
    """The board's state vocabulary for any row (package rows use the board's own rule)."""
    if kind_of(doc) == "package":
        from app.modules.hr.onboarding_package import _row_state
        return _row_state(db, doc)
    return _PLAIN_STATE.get(doc.status, doc.status)


def is_done(state: str) -> bool:
    """ONE rule for "done": approved / verified / executed (board: completed) or available. needs_review is not done."""
    return state in DONE_STATES


def status_done(status: Optional[str]) -> bool:
    return (status or "").lower() in ("approved", "verified", "executed", "available")


def needs_action(doc: OnboardingDocument) -> bool:
    """Is this row something the new hire must act on (so it belongs on their checklist)?"""
    if doc.status == "available":
        return False
    if kind_of(doc) == "package":
        return mode_for(doc) in ("SIGN", "ACKNOWLEDGE", "COMPLETE")
    return True


# ── checklist wording (B) ────────────────────────────────────────────────────────────────────────────────────────────
ITEM_VERB = {"SIGN": "Sign", "ACKNOWLEDGE": "Acknowledge", "COMPLETE": "Complete and return"}


def checklist_title(doc: OnboardingDocument) -> str:
    k = kind_of(doc)
    if k == "upload":
        return f"Upload {doc.title}"
    if k == "form":
        return f"Complete {doc.title}"
    return f"{ITEM_VERB.get(mode_for(doc), 'Review')} {doc.title}"


def checklist_description(doc: OnboardingDocument) -> str:
    if status_done(doc.status):
        return "Done"
    if doc.status == "pending":
        return "Submitted – HR to review"
    if doc.status == "rejected":
        return f"Returned – {doc.rejection_reason}" if doc.rejection_reason else "Returned"
    return "Open"


def status_label(doc: OnboardingDocument) -> str:
    mode = mode_for(doc)
    if doc.status == "available":
        return "Available"
    if doc.status == "approved":
        return {"SIGN": "Signed", "ACKNOWLEDGE": "Acknowledged"}.get(mode, "Approved")
    if doc.status == "pending":
        return "Submitted – HR to review"
    if doc.status == "rejected":
        return f"Returned – {doc.rejection_reason}" if doc.rejection_reason else "Returned"
    return {"SIGN": "To sign", "ACKNOWLEDGE": "To acknowledge", "COMPLETE": "To complete"}.get(mode, "To upload")


# ── the submission pipeline (A) ──────────────────────────────────────────────────────────────────────────────────────
def _activity(db, hire, action: str, description: str) -> None:
    db.add(OnboardingActivity(onboarding_new_hire_id=hire.id, action=action, description=description,
                              organization_id=hire.organization_id))


def _bump_version(doc: OnboardingDocument) -> None:
    """A resubmission after a rejection is the next version (the rejected one is already in history)."""
    hist = list(doc.history or [])
    if hist and int(hist[-1].get("version") or 0) >= int(doc.version or 1):
        doc.version = int(hist[-1]["version"]) + 1


def on_submitted(db: Session, hire: OnboardingNewHire, kind: str, ref) -> OnboardingDocument:
    """kind: upload | package_form | form | acknowledge | sign. ref: the OnboardingDocument (the
    OnboardingFormSubmission for a structured form). Callers set the row's own new state first."""
    if kind not in SUBMIT_KINDS:
        raise ValueError(f"unknown submission kind {kind}")
    doc = _ensure_form_row(db, hire, ref) if kind == "form" else ref
    if doc.kind is None:
        doc.kind = kind_of(doc)
    _bump_version(doc)
    doc.submitted_at = datetime.utcnow()
    action, text = _ACTIVITY[kind]
    _activity(db, hire, action, f"{hire.candidate_name} {text.format(t=doc.title)}")
    if kind in ("upload", "package_form") and hire.status in ("offer_sent", "offer_accepted"):
        hire.status = "pre_joining"                        # the new hire has started their part
    try:
        from app.modules.super_admin.admin_notifications import notify_org_admins
        notify_org_admins(db, org_id=hire.organization_id, title=f"Onboarding: {action.lower()}",
                          message=f"{hire.candidate_name} {text.format(t=doc.title)}", notification_type="onboarding")
    except Exception:
        logger.exception("in-app notification failed for new hire %s", hire.id)
    from app.modules.hr import onboarding_package
    onboarding_package.sync_onboarding_document_checklist(db, hire, commit=False)
    db.commit()
    send_digest(db, hire)
    return doc


def send_digest(db: Session, hire: OnboardingNewHire, now: Optional[datetime] = None) -> int:
    """One e-mail to HR admins per hire per DIGEST_MINUTES, listing what was handed back since the last one."""
    now = now or datetime.utcnow()
    details = dict(hire.profile_details or {})
    last = details.get(DIGEST_KEY)
    try:
        last_at = datetime.fromisoformat(last) if last else None
    except ValueError:
        last_at = None
    if last_at is not None and now - last_at < timedelta(minutes=DIGEST_MINUTES):
        return 0
    rows = (db.query(OnboardingDocument)
            .filter(OnboardingDocument.onboarding_new_hire_id == hire.id, OnboardingDocument.is_deleted == False,  # noqa: E712
                    OnboardingDocument.submitted_at.isnot(None))
            .order_by(OnboardingDocument.submitted_at).all())
    items = [{"title": d.title, "status": status_label(d)} for d in rows if last_at is None or d.submitted_at > last_at]
    if not items:
        return 0
    details[DIGEST_KEY] = now.isoformat()
    hire.profile_details = details
    db.commit()
    sent = 0
    try:
        from app.modules.hr import onboarding_flow
        from app.services.email_service import send_onboarding_submissions_digest
        org = onboarding_flow._org_name(db, hire.organization_id)
        url = f"{onboarding_flow.app_base()}/zoiko-hr/onboarding/documents?hire_id={hire.id}"
        for admin in onboarding_flow._admins(db, hire.organization_id):
            if admin.email:
                sent += bool(send_onboarding_submissions_digest(admin.email, admin.first_name or "there", hire.candidate_name,
                                                                hire.position, org, items, url, db=db,
                                                                organization_id=hire.organization_id))
    except Exception:
        logger.exception("submission digest failed for new hire %s", hire.id)
    return sent


# ── structured forms: their row and filled PDF ───────────────────────────────────────────────────────────────────────
def mask(value) -> str:
    v = "".join(str(value or "").split())
    return f"****{v[-4:]}" if len(v) > 4 else "****"


def form_answers(db, sub: OnboardingFormSubmission, *, reveal: bool = False) -> tuple[list[dict], list[dict]]:
    """([{label, value, masked}], fields) of a structured form, financial values masked unless revealed."""
    from app.modules.hr import onboarding_documents as OD
    country, region = OD._location_of(db, sub)
    fields = OD.fields_for(db, sub, country, region)
    fin = OD._financial_keys(fields)
    vals = OD._values(sub)
    out, seen = [], set()
    for f in fields:
        k = f["key"]
        seen.add(k)
        v = vals.get(k)
        if v in (None, ""):
            continue
        masked = k in fin and not reveal
        out.append({"label": f.get("label") or k, "value": mask(v) if masked else str(v), "masked": masked})
    for k, v in vals.items():                        # values of fields the current form no longer has
        if k not in seen and v not in (None, "") and not k.startswith("_"):
            out.append({"label": k.replace("_", " ").capitalize(), "value": str(v), "masked": False})
    return out, fields


def render_form_pdf(db, hire: OnboardingNewHire, sub: OnboardingFormSubmission) -> bytes:
    """The submitted structured form as a PDF: every answer (bank values masked), the declaration, signed name and date."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    from xml.sax.saxutils import escape
    from app.modules.hr import onboarding_documents as OD
    from app.modules.hr import onboarding_package_render as R
    answers, _fields = form_answers(db, sub)
    reg, bold = R.FONT_R(), R.FONT_B()
    body = ParagraphStyle("b", fontName=reg, fontSize=9.5, leading=13)
    head = ParagraphStyle("h", fontName=bold, fontSize=15, leading=19, spaceAfter=4)
    small = ParagraphStyle("s", fontName=reg, fontSize=8.5, leading=11)
    title = OD.FORMS.get(sub.canonical_id, sub.canonical_id)
    decl = (sub.data or {}).get("_declaration") or {}
    when = (decl.get("accepted_at") or (sub.submitted_at.isoformat() if sub.submitted_at else ""))[:10]
    from app.modules.hr import onboarding_flow
    story = [Paragraph(escape(onboarding_flow._org_name(db, hire.organization_id)), small),
             Paragraph(escape(f"{title} ({sub.canonical_id})"), head),
             Paragraph(escape(f"Submitted by {hire.candidate_name} on {when}"), body), Spacer(1, 4 * mm)]
    rows = [[Paragraph(escape(a["label"]), body), Paragraph(escape(a["value"]), body)] for a in answers] or \
        [[Paragraph("No answers", body), Paragraph("", body)]]
    t = Table(rows, colWidths=[60 * mm, 110 * mm])
    t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.4, "#c8ccd4"), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("BACKGROUND", (0, 0), (0, -1), "#f3f4f6")]))
    story += [t, Spacer(1, 5 * mm)]
    statement = OD._declaration(db, sub.canonical_id)
    if statement:
        story.append(Paragraph(escape(statement), body))
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph(escape(f"Declaration confirmed and signed electronically by {hire.candidate_name} on {when}"
                                  f" (declaration {decl.get('version') or OD.DECLARATION_VERSION})."), body))
    if any(a["masked"] for a in answers):
        story.append(Paragraph("Bank and payroll values are masked; finance-permitted staff can reveal them in Zoiko HR.", small))
    buf = io.BytesIO()
    SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
                      title=title).build(story)
    return buf.getvalue()


def form_row(db, hire, sub: OnboardingFormSubmission) -> Optional[OnboardingDocument]:
    cat = FORM_CATEGORIES.get(sub.canonical_id)
    q = db.query(OnboardingDocument).filter(OnboardingDocument.onboarding_new_hire_id == hire.id,
                                            OnboardingDocument.is_deleted == False)  # noqa: E712
    row = q.filter(OnboardingDocument.form_submission_id == sub.id).first()
    if row is None and cat:
        row = q.filter(OnboardingDocument.kind == "form", OnboardingDocument.category == cat).order_by(OnboardingDocument.id.desc()).first()
    if row is None and cat:
        # a document requested from every new hire (e.g. Bank details) is satisfied by the structured form; do not create
        # a second row for the same thing. Only an unfilled request is reused — a hire's uploaded file is never replaced.
        row = q.filter(OnboardingDocument.category == cat, OnboardingDocument.form_submission_id.is_(None),
                       OnboardingDocument.document_id.is_(None), OnboardingDocument.file_path.is_(None),
                       OnboardingDocument.status == "requested").order_by(OnboardingDocument.id).first()
    return row


def _ensure_form_row(db, hire, sub: OnboardingFormSubmission, *, status: str = "pending") -> OnboardingDocument:
    from app.modules.hr import onboarding_documents as OD
    cat = FORM_CATEGORIES[sub.canonical_id]
    row = form_row(db, hire, sub)
    if row is None:
        row = OnboardingDocument(organization_id=hire.organization_id, onboarding_new_hire_id=hire.id,
                                 title=OD.FORMS[sub.canonical_id], category=cat, kind="form", created_by="portal")
        db.add(row)
    row.kind, row.form_submission_id = "form", sub.id
    pdf = render_form_pdf(db, hire, sub)
    row.file_path = storage.get_store().put(hire.organization_id, f"onbform-{hire.id}-{cat}-{secrets.token_hex(6)}.pdf", pdf)
    row.status, row.rejection_reason = status, None
    db.flush()
    return row


def on_form_reviewed(db, actor, sub: OnboardingFormSubmission) -> None:
    """HR verified or returned a structured form: its row and checklist item follow (called by onboarding_documents)."""
    if not sub.new_hire_id:
        return                                        # an employee's later change (self-service), not onboarding
    hire = db.get(OnboardingNewHire, sub.new_hire_id)
    if hire is None:
        return
    row = form_row(db, hire, sub)
    if row is None:
        row = _ensure_form_row(db, hire, sub)
        row.submitted_at = sub.submitted_at
    if sub.status == "VERIFIED":
        row.status, row.rejection_reason = "approved", None
        _activity(db, hire, "Form verified", f"'{row.title}' was verified by {_name(actor)}.")
    elif sub.status == "RETURNED":
        _record_rejection(row, actor, sub.return_reason)
        _activity(db, hire, "Form returned", f"'{row.title}' was returned to {hire.candidate_name}: {sub.return_reason}")
    row.reviewed_by, row.reviewed_at = getattr(actor, "id", None), datetime.utcnow()
    from app.modules.hr import onboarding_package
    onboarding_package.sync_onboarding_document_checklist(db, hire, commit=False)
    db.commit()
    if sub.status == "RETURNED":
        _tell_hire_returned(db, hire, row)


# ── review (C) ───────────────────────────────────────────────────────────────────────────────────────────────────────
def _name(actor) -> str:
    if actor is None:
        return "HR"
    return " ".join(x for x in (getattr(actor, "first_name", None), getattr(actor, "last_name", None)) if x) or "HR"


def _record_rejection(doc: OnboardingDocument, actor, reason: Optional[str]) -> None:
    now = datetime.utcnow()
    hist = list(doc.history or [])
    hist.append({"version": int(doc.version or 1), "status": "rejected",
                 "submitted_at": doc.submitted_at.isoformat() if doc.submitted_at else None,
                 "reviewed_at": now.isoformat(), "reviewed_by": getattr(actor, "id", None), "reviewed_by_name": _name(actor),
                 "rejection_reason": reason, "file_path": doc.file_path})
    doc.history = hist
    doc.status, doc.rejection_reason = "rejected", reason


def _tell_hire_returned(db, hire, doc) -> None:
    try:
        from app.modules.hr import onboarding_flow
        onboarding_flow.notify_document_request(db, hire, [{"title": doc.title, "note": f"Rejected: {doc.rejection_reason}"}])
    except Exception:
        logger.exception("could not tell new hire %s about the returned document", hire.id)


_NO_REVIEW = {"SIGN": "This agreement is completed by the new hire's electronic signature.",
              "ACKNOWLEDGE": "This document is completed when the new hire acknowledges receipt."}


def review(db, actor, doc: OnboardingDocument, decision: str, reason: Optional[str] = None) -> OnboardingDocument:
    decision = (decision or "").strip().lower()
    reason = (reason or "").strip() or None
    if decision not in ("approve", "reject"):
        raise HTTPException(422, "decision must be approve or reject.")
    if decision == "reject" and not reason:
        raise HTTPException(422, "Enter a reason for rejecting this document.")
    k, mode = kind_of(doc), mode_for(doc)
    if k == "package" and mode in ("SIGN", "ACKNOWLEDGE", "INFO", "VOLUNTARY"):
        raise HTTPException(400, _NO_REVIEW.get(mode, "This document needs no review."))
    if k == "form" and doc.form_submission_id:
        from app.modules.hr import onboarding_documents as OD
        sub = db.get(OnboardingFormSubmission, doc.form_submission_id)
        if sub is None or sub.organization_id != doc.organization_id:
            raise HTTPException(404, "Submission not found")
        if decision == "approve":
            OD.verify_submission(db, actor, sub)       # bank details: finance permission (403 otherwise)
        else:
            OD.return_submission(db, actor, sub, reason)
        db.refresh(doc)
        return doc
    if decision == "approve" and not doc.file_path:
        raise HTTPException(400, "Nothing has been uploaded for this document yet.")
    apply_review(db, actor, doc, decision == "approve", reason)
    return doc


def apply_review(db, actor, doc: OnboardingDocument, approved: bool, reason: Optional[str]) -> None:
    """Record an upload / package form decision: status, reviewer, history; the hire is told about a rejection."""
    was_rejected = doc.status == "rejected"
    if approved:
        doc.status, doc.rejection_reason = "approved", None
    elif not was_rejected:
        _record_rejection(doc, actor, reason)
    else:
        doc.rejection_reason = reason
    doc.reviewed_by, doc.reviewed_at = getattr(actor, "id", None), datetime.utcnow()
    hire = doc.new_hire
    if hire is not None:
        _activity(db, hire, "Document approved" if approved else "Document returned",
                  f"'{doc.title}' was {'approved' if approved else 'returned: ' + (reason or '')} by {_name(actor)}.")
    db.commit()
    if hire is None:
        return
    if not approved and not was_rejected:
        if mode_for(doc) == "COMPLETE" and kind_of(doc) == "package":   # an online form goes back with its answers kept
            from app.modules.hr import onboarding_package_forms
            onboarding_package_forms.returned(db, hire, doc.category, doc.rejection_reason)
        _tell_hire_returned(db, hire, doc)
    from app.modules.hr import onboarding_package
    onboarding_package.sync_onboarding_document_checklist(db, hire)


# ── files (E) ────────────────────────────────────────────────────────────────────────────────────────────────────────
_STORE_KEY = re.compile(r"^(t\d+|platform)/[A-Za-z0-9._-]{1,160}$")


def _safe_title(title: Optional[str]) -> str:
    return re.sub(r"[^A-Za-z0-9 ._()-]+", "", title or "document").strip() or "document"


def _media_type(name: str) -> str:
    from app.modules.hr import file_storage
    return file_storage.effective_media_type(name, None)


def read_onboarding_file(db, doc: OnboardingDocument) -> Optional[tuple[bytes, str, str]]:
    """(bytes, file name, media type) of a row: the signed copy (with certificate) once executed / the issued document, the
    hire's own filled or uploaded file, else the issued package file (a blank form). None when there is no file."""
    org = doc.organization_id
    from app.modules.hr import onboarding_package as P
    if doc.document_id:
        stored = P.stored_document_pdf(db, doc.document_id, org)
        if stored is not None:
            return stored[0], stored[1], "application/pdf"
    path = doc.file_path
    if path:
        p = str(path).replace("\\", "/")
        store = storage.get_store()
        if _STORE_KEY.match(p):
            if store.key_tenant(p) not in (org,):
                return None                            # another tenant's key: never served
            try:
                data = store.get(p)
            except (FileNotFoundError, ValueError, OSError):
                data = None
            if data is not None:
                ext = re.sub(r"\.enc$", "", p).rsplit(".", 1)
                ext = f".{ext[1]}" if len(ext) == 2 else ""
                name = f"{_safe_title(doc.title)}{ext}"
                return data, name, _media_type(name)
        else:
            from app.core.privacy.files import belongs_to_tenant
            from app.modules.hr import file_storage
            resolved = file_storage.resolve_stored_file(path) if belongs_to_tenant(path, org) else None
            if resolved:
                import os
                with open(resolved, "rb") as fh:
                    data = fh.read()
                name = f"{_safe_title(doc.title)}{os.path.splitext(resolved)[1]}"
                return data, name, _media_type(name)
    hire = doc.new_hire
    if hire is not None and kind_of(doc) == "package":
        key = P.package_file_key(hire, doc.category)
        if key and storage.get_store().key_tenant(key) == org:
            try:
                return storage.get_store().get(key), f"{_safe_title(doc.title)}.pdf", "application/pdf"
            except (FileNotFoundError, ValueError, OSError):
                return None
    return None


def has_file(db, doc: OnboardingDocument) -> bool:
    if doc.document_id or doc.file_path:
        return True
    hire = doc.new_hire
    if hire is not None and kind_of(doc) == "package":
        from app.modules.hr import onboarding_package as P
        return bool(P.package_file_key(hire, doc.category))
    return False


def file_response(db, doc: OnboardingDocument, download: bool = False):
    from fastapi.responses import Response
    got = read_onboarding_file(db, doc)
    if got is None:
        if not has_file(db, doc):
            raise HTTPException(404, "No file has been uploaded for this document yet.")
        raise HTTPException(410, "The file for this document is not available on the server. Upload it again.")
    data, name, media = got
    disp = "attachment" if download else "inline"
    ascii_name = name.encode("ascii", "ignore").decode() or "document"
    return Response(content=data, media_type=media,
                    headers={"Content-Disposition": f'{disp}; filename="{ascii_name}"', "Cache-Control": "no-store"})


def zip_response(db, docs: list, filename: str):
    from fastapi.responses import Response
    buf = io.BytesIO()
    used = set()
    n = 0
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for d in docs:
            try:
                got = read_onboarding_file(db, d)
            except Exception:
                logger.exception("file of onboarding document %s could not be read for the ZIP", d.id)
                got = None
            if got is None:
                continue
            data, name, _m = got
            n += 1
            entry = f"{n:02d} {name}"
            while entry in used:
                entry = f"{n:02d}-{secrets.token_hex(2)} {name}"
            used.add(entry)
            zf.writestr(entry, data)
    return Response(content=buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"})


def hire_zip_name(hire) -> str:
    who = re.sub(r"[^A-Za-z0-9]+", "_", hire.candidate_name or "new_hire").strip("_") or "new_hire"
    return f"{who}_onboarding_documents.zip"


# ── admin list item and detail (C, finding 5) ────────────────────────────────────────────────────────────────────────
def _employee_names(db, ids) -> dict:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    from app.modules.employee.models import Employee
    return {e.id: " ".join(x for x in (e.first_name, e.last_name) if x) for e in db.query(Employee).filter(Employee.id.in_(ids)).all()}


def list_item_extras(db, doc: OnboardingDocument, names: Optional[dict] = None) -> dict:
    hire = doc.new_hire
    if names is None:
        names = _employee_names(db, [doc.reviewed_by])
    try:
        state = board_state(db, doc)
    except Exception:
        logger.exception("board state of onboarding document %s", doc.id)
        state = _PLAIN_STATE.get(doc.status, doc.status)
    return {"hire_name": hire.candidate_name if hire is not None else None,
            "position": hire.position if hire is not None else None,
            "submitted_at": doc.submitted_at, "reviewed_by_name": names.get(doc.reviewed_by) if doc.reviewed_by else None,
            "reviewed_at": doc.reviewed_at, "kind": kind_of(doc), "version": int(doc.version or 1), "board_state": state,
            "details_changed": bool(doc.details_changed)}


def sort_for_review(items: list[dict]) -> list[dict]:
    """Needs review (pending) first, then the newest submission, then the newest row."""
    def key(d):
        sub = d.get("submitted_at")
        created = d.get("created_at")
        return (0 if d.get("status") == "pending" else 1,
                -(sub.timestamp() if isinstance(sub, datetime) else 0),
                -(created.timestamp() if isinstance(created, datetime) else 0), -d["id"])
    return sorted(items, key=key)


def _package_form_answers(db, hire, doc) -> Optional[list[dict]]:
    from app.modules.hr import onboarding_package_forms as FORMS
    if not FORMS.fillable(doc.category):
        return None
    try:
        view = FORMS.submission_view(db, hire, doc.category)
    except HTTPException:
        return None
    if view is None:
        return None
    ans = view.get("answers") or {}
    out = []
    for it in view["items"]:
        t, fid = it["type"], it.get("id")
        if t in ("choice", "text", "answer"):
            out.append({"label": it.get("label") or "", "value": str(ans.get(fid) or ""), "masked": False})
        elif t == "fields":
            for r in it["rows"]:
                if r.get("editable"):
                    out.append({"label": r.get("label") or "", "value": str(ans.get(r["id"]) or ""), "masked": False})
        elif t == "table":
            for row in ans.get(fid) or []:
                if any(str(c).strip() for c in row):
                    out.append({"label": " / ".join(it.get("headers") or []), "value": " | ".join(str(c) for c in row),
                                "masked": False})
        elif t == "signature":
            sig = ans.get(fid) or {}
            out.append({"label": "Signed by", "value": str(sig.get("name") or ""), "masked": False})
    if view.get("submitted_at"):
        out.append({"label": "Submitted at", "value": str(view["submitted_at"]), "masked": False})
    return out


def _evidence(db, hire, doc) -> Optional[dict]:
    mode = mode_for(doc)
    if doc.document_id:
        from app.modules.doc_templates.models import DocumentSignature
        sig = (db.query(DocumentSignature).filter(DocumentSignature.document_id == doc.document_id,
                                                  DocumentSignature.decision == "SIGNED",
                                                  DocumentSignature.organization_id == doc.organization_id)
               .order_by(DocumentSignature.signed_at).first())
        if sig is not None:
            return {"signed_by": sig.signer_name_typed, "signed_at": sig.signed_at, "method": sig.signature_method,
                    "acknowledged_at": None, "ip": sig.ip_address}
    if mode == "ACKNOWLEDGE" and hire is not None:
        ack = ((hire.profile_details or {}).get("_acknowledgements") or {}).get(str(doc.id))
        if ack:
            return {"signed_by": hire.candidate_name, "signed_at": None, "method": "acknowledgement",
                    "acknowledged_at": ack.get("at"), "ip": ack.get("ip") or None}
    if kind_of(doc) == "form" and doc.form_submission_id:
        sub = db.get(OnboardingFormSubmission, doc.form_submission_id)
        decl = ((sub.data or {}).get("_declaration") or {}) if sub is not None else {}
        if decl:
            return {"signed_by": hire.candidate_name if hire else None, "signed_at": decl.get("accepted_at"),
                    "method": "typed declaration", "acknowledged_at": None, "ip": decl.get("ip")}
    return None


def can_reveal(db, user) -> bool:
    from app.modules.doc_templates import access
    from app.modules.hr import onboarding_documents as OD
    return access.role_of(user) == "admin" or OD.is_finance_permitted(db, user)


def detail(db, user, doc: OnboardingDocument, base_item: dict, *, reveal: bool = False) -> dict:
    hire = doc.new_hire
    answers = None
    has_financial = False
    if kind_of(doc) == "form" and doc.form_submission_id:
        sub = db.get(OnboardingFormSubmission, doc.form_submission_id)
        if sub is not None:
            if reveal:
                if not can_reveal(db, user):
                    raise HTTPException(403, {"code": "FINANCE_PERMISSION_REQUIRED",
                                              "message": "Only people with finance permission can see these details."})
                from app.modules.hr import onboarding_documents as OD
                OD._audit(db, user, "payroll.details_revealed", "OnboardingDocument", doc.id, doc.title)
                if hire is not None:
                    _activity(db, hire, "Details revealed", f"{_name(user)} revealed the masked values of '{doc.title}'.")
                    db.commit()
            answers, fields = form_answers(db, sub, reveal=reveal)
            from app.modules.hr import onboarding_documents as OD
            has_financial = bool(OD._financial_keys(fields))
    elif reveal:
        if not can_reveal(db, user):
            raise HTTPException(403, {"code": "FINANCE_PERMISSION_REQUIRED",
                                      "message": "Only people with finance permission can see these details."})
    if answers is None and hire is not None and kind_of(doc) == "package" and mode_for(doc) == "COMPLETE":
        answers = _package_form_answers(db, hire, doc)
    names = _employee_names(db, [h.get("reviewed_by") for h in (doc.history or [])] + [doc.reviewed_by])
    history = [{"version": h.get("version"), "status": h.get("status"), "submitted_at": h.get("submitted_at"),
                "reviewed_at": h.get("reviewed_at"), "reviewed_by_name": h.get("reviewed_by_name") or names.get(h.get("reviewed_by")),
                "rejection_reason": h.get("rejection_reason")} for h in (doc.history or [])]
    history.append({"version": int(doc.version or 1), "status": doc.status,
                    "submitted_at": doc.submitted_at.isoformat() if doc.submitted_at else None,
                    "reviewed_at": doc.reviewed_at.isoformat() if doc.reviewed_at and doc.status != "pending" else None,
                    "reviewed_by_name": names.get(doc.reviewed_by) if doc.reviewed_by and doc.status != "pending" else None,
                    "rejection_reason": doc.rejection_reason})
    return {"document": base_item, "answers": answers, "evidence": _evidence(db, hire, doc), "history": history,
            "can_reveal": bool(has_financial and can_reveal(db, user))}


# ── the new hire's own documents (G) ─────────────────────────────────────────────────────────────────────────────────
DETAIL_KEYS = ("address", "city", "state", "country", "postal_code", "emergency_contact_name",
               "emergency_contact_relation", "emergency_contact_phone", "house", "building", "street", "landmark",
               "locality", "district")


def detail_snapshot(hire) -> dict:
    """The hire's entered details, as used to render offer-package documents."""
    details = dict(hire.profile_details or {})
    return {**{k: details.get(k) for k in DETAIL_KEYS}, "phone": hire.phone}


def mark_details_changed(db, hire, before: dict) -> int:
    """The hire edited their details after a package document was sent but before they returned it. Never touch the sent
    document: flag it for HR as 'Details changed – reissue'. Returns the number of rows flagged."""
    if detail_snapshot(hire) == before:
        return 0
    from app.modules.doc_templates import signing
    from app.modules.doc_templates.models import GeneratedDocument
    rows = (db.query(OnboardingDocument)
            .filter(OnboardingDocument.onboarding_new_hire_id == hire.id, OnboardingDocument.is_deleted == False,  # noqa: E712
                    OnboardingDocument.document_id.isnot(None)).all())
    flagged = 0
    for row in rows:
        if mode_for(row) not in ("SIGN", "ACKNOWLEDGE"):
            continue
        gen = db.get(GeneratedDocument, row.document_id)
        if gen is None or gen.organization_id != hire.organization_id or gen.status != "ISSUED":
            continue
        required = signing.required_parties(gen)
        if "candidate" in required and "candidate" in signing.signed_parties(db, gen):
            continue
        if not row.details_changed:
            row.details_changed = True
            _activity(db, hire, "Details changed – reissue",
                      f"'{row.title}' was sent before {hire.candidate_name} changed their details. Reissue it; the sent copy is unchanged.")
        flagged += 1
    return flagged


def hire_documents(db, hire) -> list[OnboardingDocument]:
    return (db.query(OnboardingDocument)
            .filter(OnboardingDocument.onboarding_new_hire_id == hire.id, OnboardingDocument.organization_id == hire.organization_id,
                    OnboardingDocument.is_deleted == False)  # noqa: E712
            .order_by(OnboardingDocument.id).all())


def hire_document(db, hire, document_id: int) -> OnboardingDocument:
    doc = (db.query(OnboardingDocument)
           .filter(OnboardingDocument.id == document_id, OnboardingDocument.onboarding_new_hire_id == hire.id,
                   OnboardingDocument.organization_id == hire.organization_id, OnboardingDocument.is_deleted == False)  # noqa: E712
           .first())
    if doc is None:
        raise HTTPException(404, "Document not found.")
    return doc


def my_documents(db, hire) -> list[dict]:
    out = []
    for d in hire_documents(db, hire):
        f = has_file(db, d)
        out.append({"id": d.id, "title": d.title, "category": d.category, "kind": kind_of(d), "mode": mode_for(d),
                    "status": d.status, "status_label": status_label(d), "rejection_reason": d.rejection_reason,
                    "can_preview": f, "can_download": f, "can_resubmit": d.status == "rejected",
                    "submitted_at": d.submitted_at})
    return out


# ── details changed after sending (F) and the backfill (B) ───────────────────────────────────────────────────────────
def backfill(db, organization_id: Optional[int] = None) -> dict:
    """Re-sync every hire's documents checklist; give submitted / verified structured forms their row. Idempotent."""
    q = db.query(OnboardingNewHire).filter(OnboardingNewHire.is_deleted == False)  # noqa: E712
    if organization_id is not None:
        q = q.filter(OnboardingNewHire.organization_id == organization_id)
    from app.modules.hr import onboarding_package
    hires = forms = 0
    for hire in q.order_by(OnboardingNewHire.id).all():
        try:
            subs = (db.query(OnboardingFormSubmission)
                    .filter(OnboardingFormSubmission.new_hire_id == hire.id,
                            OnboardingFormSubmission.canonical_id.in_(list(FORM_CATEGORIES)),
                            OnboardingFormSubmission.status.in_(["SUBMITTED", "VERIFIED", "RETURNED"]))
                    .order_by(OnboardingFormSubmission.id.desc()).all())
            latest: dict = {}
            for s in subs:
                latest.setdefault(s.canonical_id, s)
            for sub in latest.values():
                if form_row(db, hire, sub) is None:
                    row = _ensure_form_row(db, hire, sub, status={"SUBMITTED": "pending", "VERIFIED": "approved"}.get(sub.status, "rejected"))
                    row.submitted_at = sub.submitted_at
                    if sub.status == "RETURNED":
                        row.rejection_reason = sub.return_reason
                    forms += 1
            onboarding_package.sync_onboarding_document_checklist(db, hire, commit=False)
            db.commit()
            hires += 1
        except Exception:
            db.rollback()
            logger.exception("backfill failed for new hire %s", hire.id)
    return {"hires": hires, "form_rows_created": forms}
