"""E-mails and integration events for generated documents.

Privacy rule (ZHR-ELT-TPL-001 §6): no document contents in notifications, logs or events. E-mails carry the document number,
a neutral label ("Document AB-2026-000012", or the template title for C2 documents only), dates and a link. Events carry ids,
numbers, template ids and statuses. Failures are logged by id and never break the action that triggered them.
"""
from __future__ import annotations

import logging
from typing import Optional

from app.config import settings
from app.modules.doc_templates.models import GeneratedDocument
from app.modules.doc_templates import registry

logger = logging.getLogger("zoiko.doc_templates")

ACTION_TEXT = {
    "ACKNOWLEDGE": ("Read and acknowledge", "read and acknowledge"),
    "SIGN_EMPLOYEE": ("Review and sign", "review and sign"),
    "SIGN_BOTH": ("Review and sign", "review and sign"),
    "SIGN_CANDIDATE": ("Review and sign", "review and sign"),
    "NONE": ("Read", "read"),
}


def app_url(path: str) -> str:
    return f"{(settings.FRONTEND_URL or '').rstrip('/')}{path}"


def label(doc: GeneratedDocument) -> str:
    """What an e-mail may call the document. C3/C4 titles can reveal a case or a medical matter, so they are never used."""
    if doc.sensitivity == "C2":
        return f"{doc.title} ({doc.document_number})"
    return f"Confidential document {doc.document_number}"


def fmt_day(value) -> Optional[str]:
    return value.strftime("%b %d, %Y") if value else None


def _first_name(person) -> str:
    return getattr(person, "first_name", None) or "there"


EMAIL_ATTEMPTS = 3


def _safe(fn, doc_id, what, *, attempts=EMAIL_ATTEMPTS):
    """Send an e-mail, retrying a transient failure (no sleep: the next attempt is immediate). Failures are logged by id only and
    never break the action that triggered them."""
    for attempt in range(1, attempts + 1):
        try:
            result = fn()
            if result is not False:
                return True
        except Exception:
            pass
        if attempt == attempts:
            logger.warning("doc_templates: %s e-mail failed for document id %s after %s attempts", what, doc_id, attempt)
    return False


def event(db, name: str, doc: GeneratedDocument) -> None:
    try:
        from app.modules.integrations.events import emit_event
        emit_event(db, name, {"id": doc.id, "document_number": doc.document_number, "canonical_id": doc.canonical_id,
                              "status": doc.status}, doc.organization_id)
    except Exception:
        logger.warning("doc_templates: event %s failed for document id %s", name, doc.id)


def variant_event(db, name: str, variant, organization_id: Optional[int]) -> None:
    try:
        from app.modules.integrations.events import emit_event
        emit_event(db, name, {"id": variant.id, "canonical_id": variant.canonical_id, "version": variant.version,
                              "status": variant.status}, organization_id)
    except Exception:
        logger.warning("doc_templates: event %s failed for variant id %s", name, variant.id)


def action_required(db, doc: GeneratedDocument, person, issuer) -> None:
    from app.services import email_service
    email = getattr(person, "work_email", None) or getattr(person, "email", None)
    if not email:
        return
    action_label, phrase = ACTION_TEXT.get(doc.execution_mode, ACTION_TEXT["NONE"])
    issuer_name = getattr(getattr(issuer, "organization", None), "organization_name", None) or "your HR team"
    url = app_url(f"/employee/documents/company?generated={doc.id}")
    if doc.execution_mode != "NONE":
        from app.modules.doc_templates.golive import notify_in_app
        notify_in_app(db, doc, person)          # the in-app inbox: document number only
    if doc.family_id in registry.COMPENSATION_FAMILIES:
        # compensation letters never name an amount, a revision or even the letter type in an e-mail
        _safe(lambda: email_service.send_compensation_document_available_email(
            email, _first_name(person), doc.document_number, url, db=db, organization_id=doc.organization_id), doc.id, "compensation")
        return
    if doc.distribution_id:
        _safe(lambda: email_service.send_policy_published_email(
            email, _first_name(person), doc.title if doc.sensitivity == "C2" else "a policy", doc.document_number, phrase,
            fmt_day(doc.due_by), url, db=db, organization_id=doc.organization_id), doc.id, "policy published")
        return
    _safe(lambda: email_service.send_document_action_required_email(
        email, _first_name(person), label(doc), doc.document_number, action_label, phrase, issuer_name, fmt_day(doc.due_by), url,
        db=db, organization_id=doc.organization_id), doc.id, "action required")


def reminder(db, doc: GeneratedDocument, person) -> None:
    from app.services import email_service
    email = getattr(person, "work_email", None) or getattr(person, "email", None)
    if not email:
        return
    _, phrase = ACTION_TEXT.get(doc.execution_mode, ACTION_TEXT["NONE"])
    _safe(lambda: email_service.send_document_reminder_email(
        email, _first_name(person), label(doc), doc.document_number, phrase, fmt_day(doc.due_by),
        app_url(f"/employee/documents/company?generated={doc.id}"), db=db, organization_id=doc.organization_id), doc.id, "reminder")


def candidate_link(db, doc: GeneratedDocument, candidate, raw_token: str, expires_at, organization_name: str,
                   *, wait: bool = False) -> bool:
    from app.services import email_service
    url = app_url(f"/sign/{raw_token}")
    errors = [] if wait else None
    return _safe(lambda: email_service.send_candidate_document_sign_email(
        candidate.email, (getattr(candidate, "name", None) or getattr(candidate, "candidate_name", None) or "there").split()[0],
        organization_name, doc.document_number, fmt_day(expires_at), url, fmt_day(doc.due_by), db=db,
        organization_id=doc.organization_id, wait=wait, error_out=errors), doc.id, "candidate link",
        attempts=1 if wait else EMAIL_ATTEMPTS)


def sign_code(db, doc: GeneratedDocument, email: str, first_name: str, code: str) -> None:
    from app.services import email_service
    _safe(lambda: email_service.send_document_sign_code_email(
        email, first_name or "there", doc.document_number, code, settings.DOC_SIGN_OTP_TTL_MINUTES, db=db,
        organization_id=doc.organization_id), doc.id, "sign code")


def _hr_people(db, doc: GeneratedDocument) -> list:
    from app.modules.employee.models import Employee
    ids = {i for i in (doc.requested_by, doc.issued_by) if i}
    return db.query(Employee).filter(Employee.id.in_(ids or [-1]), Employee.is_active.is_(True)).all()


def executed(db, doc: GeneratedDocument) -> None:
    from app.services import email_service
    for person in _hr_people(db, doc):
        _safe(lambda p=person: email_service.send_document_executed_email(
            p.work_email or p.email, _first_name(p), label(doc), doc.document_number,
            doc.status_changed_at.strftime("%b %d, %Y %H:%M UTC") if doc.status_changed_at else "",
            app_url(f"/zoiko-hr/documents/generated?id={doc.id}"), db=db, organization_id=doc.organization_id), doc.id, "executed")


def declined(db, doc: GeneratedDocument, party: str) -> None:
    from app.services import email_service
    for person in _hr_people(db, doc):
        _safe(lambda p=person: email_service.send_document_declined_email(
            p.work_email or p.email, _first_name(p), label(doc), doc.document_number, party.capitalize(),
            app_url(f"/zoiko-hr/documents/generated?id={doc.id}"), db=db, organization_id=doc.organization_id), doc.id, "declined")


def expired(db, doc: GeneratedDocument) -> None:
    from app.services import email_service
    for person in _hr_people(db, doc):
        _safe(lambda p=person: email_service.send_document_expired_email(
            p.work_email or p.email, _first_name(p), label(doc), doc.document_number, fmt_day(doc.expires_at) or "",
            app_url(f"/zoiko-hr/documents/generated?id={doc.id}"), db=db, organization_id=doc.organization_id), doc.id, "expired")


def variant_review(db, variant, reviewers, author, step_label: str, jurisdiction: str) -> None:
    from app.services import email_service
    author_name = " ".join(p for p in (getattr(author, "first_name", None), getattr(author, "last_name", None)) if p) or "a colleague"
    for person in reviewers:
        _safe(lambda p=person: email_service.send_template_variant_review_required_email(
            p.work_email or p.email, _first_name(p), variant.canonical_id, variant.version, jurisdiction, author_name, step_label,
            app_url(f"/zoiko-hr/documents/templates/{variant.canonical_id}?variant={variant.id}"), db=db,
            organization_id=p.organization_id), variant.id, "variant review")


def candidate_view_link(db, doc: GeneratedDocument, candidate, raw_token: str, expires_at, organization_name: str, attachment=None) -> None:
    """A document the candidate only needs to read (privacy notice, rejection, withdrawal, acceptance confirmation)."""
    from app.services import email_service
    url = app_url(f"/sign/{raw_token}")
    first = (getattr(candidate, "name", None) or getattr(candidate, "candidate_name", None) or "there").split()[0]
    _safe(lambda: email_service.send_candidate_document_available_email(
        candidate.email, first, organization_name, label(doc), doc.document_number, fmt_day(expires_at), url,
        attachment=attachment, db=db, organization_id=doc.organization_id), doc.id, "candidate view link")
