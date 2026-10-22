"""In-house electronic signature and acknowledgement (docs/templates/architecture.md §Execution).

This is a simple, auditable electronic signature, NOT a qualified electronic signature (eIDAS QES or similar). The evidence
it captures is listed on the HR-DOC-012 certificate appended to every executed PDF. `SignatureProvider` is the seam for an
external provider (DocuSign, Adobe Sign, Zoiko Docs Pro) later.

Three records, three meanings, never mixed:
* document_signatures      — a signature (or a decline) on an agreement: consent statement + OTP where required + name.
* document_acknowledgements — "I received and read it"; never acceptance, never a waiver, never a privacy lawful basis.
* (privacy consent is not captured by this engine at all.)
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta
from typing import Optional, Protocol

from fastapi import HTTPException

from app.config import settings
from app.modules.doc_templates import approvals, governance, notify, renderer, state, storage
from app.modules.doc_templates.models import (DocumentAcknowledgement, DocumentSignOtp, DocumentSignature, EmployerEntity,
                                              GeneratedDocument, TemplateVariant)

SIGN_STATUSES = ("ISSUED",)
MAX_DRAWN_BYTES = 200_000
OTP_SENDS_PER_HOUR = 5


class SignatureProvider(Protocol):
    """Adapter seam for an external e-signature provider. The in-house flow below is the default implementation."""
    def request_signatures(self, document: GeneratedDocument) -> None: ...
    def on_completed(self, document: GeneratedDocument, evidence: dict) -> None: ...


# ── who must sign ────────────────────────────────────────────────────────────────────────────────────────────────────

def required_parties(doc: GeneratedDocument) -> list[str]:
    counterparty = "candidate" if doc.subject_type == "candidate" else "employee"
    return {"SIGN_EMPLOYEE": ["employee"], "SIGN_CANDIDATE": ["candidate"],
            "SIGN_BOTH": [counterparty, "employer"]}.get(doc.execution_mode, [])


def signatures(db, doc: GeneratedDocument) -> list[DocumentSignature]:
    return db.query(DocumentSignature).filter(DocumentSignature.document_id == doc.id).order_by(DocumentSignature.id).all()


def signed_parties(db, doc: GeneratedDocument) -> set[str]:
    return {s.signer_party for s in signatures(db, doc) if s.decision == "SIGNED"}


def needs_otp(doc: GeneratedDocument, party: str) -> bool:
    return party == "candidate" or doc.legal_risk in ("L2", "L3")


def _employer_signs_first(db, doc) -> bool:
    v = db.get(TemplateVariant, doc.variant_id) if doc.variant_id else None
    return bool((v.options or {}).get("employer_signs_first")) if v else False


# ── candidate links (security_action_tokens, purpose document_sign) ─────────────────────────────────────────────────

def _token_hash(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _reference(doc) -> str:
    return f"generated_document:{doc.id}"


def issue_candidate_token(db, doc: GeneratedDocument) -> tuple[str, datetime]:
    from app.modules.employee.models import SecurityActionPurpose, SecurityActionToken
    revoke_candidate_tokens(db, doc)
    raw = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(days=settings.DOC_SIGN_LINK_TTL_DAYS)
    db.add(SecurityActionToken(email=doc.recipient_email, organization_id=doc.organization_id,
                               purpose=SecurityActionPurpose.DOCUMENT_SIGN, token_hash=_token_hash(raw), expires_at=expires,
                               reference=_reference(doc)))
    db.flush()
    return raw, expires


def revoke_candidate_tokens(db, doc: GeneratedDocument) -> None:
    from app.modules.employee.models import SecurityActionToken
    db.query(SecurityActionToken).filter(SecurityActionToken.reference == _reference(doc),
                                         SecurityActionToken.used_at.is_(None)) \
        .update({SecurityActionToken.used_at: datetime.utcnow()}, synchronize_session=False)


def resolve_candidate_token(db, raw: str):
    """(document, token) for a live link, or 404. Viewing does not use the link up; signing or declining does."""
    from app.modules.employee.models import SecurityActionPurpose, SecurityActionToken
    if not raw or len(raw) > 200:
        raise HTTPException(404, "This link is not valid.")
    tok = db.query(SecurityActionToken).filter(SecurityActionToken.token_hash == _token_hash(raw)).first()
    if tok is None or tok.purpose != SecurityActionPurpose.DOCUMENT_SIGN or tok.used_at is not None \
            or tok.expires_at <= datetime.utcnow() or not (tok.reference or "").startswith("generated_document:"):
        raise HTTPException(404, "This link is not valid or has expired.")
    doc = db.get(GeneratedDocument, int(tok.reference.split(":", 1)[1]))
    if doc is None or doc.organization_id != tok.organization_id or doc.subject_type != "candidate" \
            or (doc.recipient_email or "").lower() != (tok.email or "").lower():
        raise HTTPException(404, "This link is not valid or has expired.")
    return doc, tok


def _consume(db, tok) -> None:
    from app.modules.employee.models import SecurityActionToken
    n = db.query(SecurityActionToken).filter(SecurityActionToken.id == tok.id, SecurityActionToken.used_at.is_(None)) \
        .update({SecurityActionToken.used_at: datetime.utcnow()}, synchronize_session=False)
    if n != 1:
        raise HTTPException(409, "This link has already been used.")


# ── one-time codes ───────────────────────────────────────────────────────────────────────────────────────────────────

def _code_hash(doc_id: int, signer_key: str, code: str) -> str:
    key = hashlib.sha256(b"zhr-doc-sign-otp-v1" + settings.SECRET_KEY.encode()).digest()
    return hmac.new(key, f"{doc_id}:{signer_key}:{code}".encode(), hashlib.sha256).hexdigest()


def send_otp(db, doc: GeneratedDocument, *, party: str, signer_key: str, email: Optional[str], first_name: str) -> dict:
    if not email:
        raise HTTPException(422, "There is no e-mail address to send the code to. Contact HR.")
    since = datetime.utcnow() - timedelta(hours=1)
    recent = db.query(DocumentSignOtp).filter(DocumentSignOtp.document_id == doc.id, DocumentSignOtp.signer_key == signer_key,
                                              DocumentSignOtp.created_at >= since).count()
    if recent >= OTP_SENDS_PER_HOUR:
        raise HTTPException(429, "Too many codes requested. Try again later.")
    now = datetime.utcnow()
    db.query(DocumentSignOtp).filter(DocumentSignOtp.document_id == doc.id, DocumentSignOtp.signer_key == signer_key,
                                     DocumentSignOtp.consumed_at.is_(None)) \
        .update({DocumentSignOtp.consumed_at: now}, synchronize_session=False)
    code = f"{secrets.randbelow(10 ** 6):06d}"
    db.add(DocumentSignOtp(organization_id=doc.organization_id, document_id=doc.id, signer_party=party, signer_key=signer_key,
                           code_hash=_code_hash(doc.id, signer_key, code), created_at=now,
                           expires_at=now + timedelta(minutes=settings.DOC_SIGN_OTP_TTL_MINUTES)))
    db.commit()
    notify.sign_code(db, doc, email, first_name, code)
    return {"sent_to": governance.mask_email(email), "expires_in_minutes": settings.DOC_SIGN_OTP_TTL_MINUTES}


def verify_otp(db, doc: GeneratedDocument, signer_key: str, code: Optional[str]) -> datetime:
    otp = (db.query(DocumentSignOtp)
           .filter(DocumentSignOtp.document_id == doc.id, DocumentSignOtp.signer_key == signer_key,
                   DocumentSignOtp.consumed_at.is_(None))
           .order_by(DocumentSignOtp.id.desc()).first())
    now = datetime.utcnow()
    if otp is None or otp.expires_at <= now:
        raise HTTPException(422, {"code": "OTP_EXPIRED", "message": "The code has expired. Request a new one."})
    if otp.attempts >= settings.DOC_SIGN_OTP_MAX_ATTEMPTS:
        raise HTTPException(429, {"code": "OTP_LOCKED", "message": "Too many wrong codes. Request a new one."})
    otp.attempts += 1
    if not code or not hmac.compare_digest(otp.code_hash, _code_hash(doc.id, signer_key, str(code).strip())):
        if otp.attempts >= settings.DOC_SIGN_OTP_MAX_ATTEMPTS:
            otp.consumed_at = now
        db.commit()
        raise HTTPException(422, {"code": "OTP_INVALID", "message": "That code is not right.",
                                  "attempts_left": max(settings.DOC_SIGN_OTP_MAX_ATTEMPTS - otp.attempts, 0)})
    otp.verified_at = otp.consumed_at = now
    return now


# ── signing ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def _integrity(doc: GeneratedDocument) -> str:
    """The SHA-256 of the stored original, which must equal the hash recorded at generation (tamper check)."""
    data = storage.get_store().get(doc.pdf_path)
    digest = hashlib.sha256(data).hexdigest()
    if digest != doc.pdf_sha256:
        raise HTTPException(409, {"code": "DOCUMENT_INTEGRITY_FAILED",
                                  "message": "The stored document does not match the issued version. It cannot be signed. HR has been told."})
    return digest


def _same_name(a: Optional[str], b: Optional[str]) -> bool:
    norm = lambda s: " ".join((s or "").casefold().split())
    return bool(norm(a)) and norm(a) == norm(b)


def _drawn_png(data_url: Optional[str]) -> bytes:
    if not data_url:
        raise HTTPException(422, "Draw your signature or choose a typed signature.")
    raw = data_url.split(",", 1)[1] if data_url.startswith("data:") else data_url
    try:
        png = base64.b64decode(raw, validate=True)
    except Exception:
        raise HTTPException(422, "The drawn signature could not be read.")
    if len(png) > MAX_DRAWN_BYTES or not png.startswith(b"\x89PNG\r\n\x1a\n"):
        raise HTTPException(422, "The drawn signature must be a PNG image under 200 KB.")
    return png


def sign(db, doc: GeneratedDocument, *, party: str, signer_employee=None, signer_email: Optional[str], typed_name: str,
         method: str, drawn: Optional[str], consent_version: str, otp_code: Optional[str], ip: Optional[str], user_agent: Optional[str],
         token=None) -> GeneratedDocument:
    if doc.legal_hold:
        raise HTTPException(409, "The document is on legal hold.")
    parties = required_parties(doc)
    if party not in parties:
        raise HTTPException(409, "This document does not need a signature from you.")
    employer_first = party == "employer" and _employer_signs_first(db, doc)
    allowed_status = ("HUMAN_APPROVED", "ISSUED") if employer_first else SIGN_STATUSES
    if doc.status not in allowed_status:
        raise HTTPException(409, f"A document in status {doc.status} cannot be signed.")
    done = signed_parties(db, doc)
    if party in done:
        raise HTTPException(409, "This party has already signed.")
    if party == "employer" and not employer_first:
        others = [p for p in parties if p != "employer"]
        if not set(others) <= done:
            raise HTTPException(409, "The employer signs after the other party.")
    if consent_version != governance.CONSENT_VERSION:
        raise HTTPException(422, "Confirm the current electronic signature consent statement.")
    if method not in ("TYPED", "DRAWN"):
        raise HTTPException(422, "Choose a typed or drawn signature.")

    expected = _expected_name(db, doc, party, signer_employee)
    override = (doc.signer_name_overrides or {}).get(party)
    if not (_same_name(typed_name, expected) or (override and _same_name(typed_name, override))):
        raise HTTPException(422, {"code": "NAME_MISMATCH",
                                  "message": "Type your name exactly as it appears on the document. If it is wrong, ask HR to correct it."})
    if party == "employer":
        _require_signatory(db, doc, signer_employee)

    signer_key = _signer_key(party, signer_employee, signer_email)
    otp_at = verify_otp(db, doc, signer_key, otp_code) if needs_otp(doc, party) else None
    digest = _integrity(doc)
    image_key = None
    if method == "DRAWN":
        png = _drawn_png(drawn)
        image_key = storage.get_store().put(doc.organization_id, f"{doc.document_number}-sig-{party}-{secrets.token_hex(6)}.png", png,
                                            encrypt=doc.files_encrypted)
    if token is not None:
        _consume(db, token)
    now = datetime.utcnow()
    db.add(DocumentSignature(
        organization_id=doc.organization_id, document_id=doc.id, signer_party=party,
        signer_employee_id=getattr(signer_employee, "id", None), signer_email=signer_email, signer_name_typed=typed_name.strip()[:200],
        signature_method=method, signature_image_path=image_key, consent_text_version=consent_version, otp_verified_at=otp_at,
        ip_address=ip, user_agent=(user_agent or "")[:400], signed_document_sha256=digest, signed_at=now, decision="SIGNED"))
    state.add_event(db, doc, "signed", actor_id=getattr(signer_employee, "id", None),
                    actor_type="candidate" if party == "candidate" else "employee", detail={"party": party})
    db.flush()
    if set(parties) <= signed_parties(db, doc) and doc.status == "ISSUED":
        _finalize(db, doc)
    db.commit()
    if doc.status == "EXECUTED":
        notify.executed(db, doc)
        notify.event(db, "document.executed", doc)
        from app.modules.doc_templates import hooks
        hooks.dispatch(db, "executed", doc)
    return doc


def decline(db, doc: GeneratedDocument, *, party: str, signer_employee=None, signer_email: Optional[str], reason: str,
            ip: Optional[str], user_agent: Optional[str], token=None) -> GeneratedDocument:
    if party not in required_parties(doc):
        raise HTTPException(409, "This document does not need a signature from you.")
    if doc.status != "ISSUED":
        raise HTTPException(409, f"A document in status {doc.status} cannot be declined.")
    if not (reason or "").strip():
        raise HTTPException(422, "Tell HR why you are declining.")
    if token is not None:
        _consume(db, token)
    data = storage.get_store().get(doc.pdf_path)
    db.add(DocumentSignature(
        organization_id=doc.organization_id, document_id=doc.id, signer_party=party,
        signer_employee_id=getattr(signer_employee, "id", None), signer_email=signer_email,
        signed_document_sha256=hashlib.sha256(data).hexdigest(), signed_at=datetime.utcnow(), decision="DECLINED",
        decline_reason=reason.strip()[:2000], ip_address=ip, user_agent=(user_agent or "")[:400]))
    state.transition(db, doc, "DECLINED", actor_id=getattr(signer_employee, "id", None),
                     actor_type="candidate" if party == "candidate" else "employee", detail={"party": party})
    db.commit()
    notify.declined(db, doc, party)
    notify.event(db, "document.declined", doc)
    from app.modules.doc_templates import hooks
    hooks.dispatch(db, "declined", doc)
    return doc


def _signer_key(party, employee, email) -> str:
    return f"employee:{employee.id}" if employee is not None else f"email:{(email or '').lower()}"


def _expected_name(db, doc, party, signer_employee) -> Optional[str]:
    if party == "employer":
        return f"{signer_employee.first_name} {signer_employee.last_name}" if signer_employee else None
    return doc.recipient_name


def _require_signatory(db, doc, signer_employee) -> None:
    if signer_employee is None:
        raise HTTPException(403, "Only an authorised signatory can sign for the employer.")
    if doc.subject_type == "employee" and doc.subject_id == signer_employee.id:
        raise HTTPException(403, "You cannot sign for the employer on your own document.")
    from app.modules.doc_templates.models import AuthorisedSignatory
    sigs = db.query(AuthorisedSignatory).filter(AuthorisedSignatory.organization_id == doc.organization_id,
                                                AuthorisedSignatory.entity_id == doc.entity_id,
                                                AuthorisedSignatory.employee_id == signer_employee.id).all()
    if not any(approvals.signatory_covers(s, doc.canonical_id, doc.family_id, doc.legal_risk) for s in sigs):
        raise HTTPException(403, "You are not an authorised signatory for this document.")


def _finalize(db, doc: GeneratedDocument) -> None:
    """All parties signed: original pages + HR-DOC-012 certificate → executed PDF (new hash). The original is untouched."""
    from app.modules.hr.models import Organization
    org = db.get(Organization, doc.organization_id)
    entity = db.get(EmployerEntity, doc.entity_id) if doc.entity_id else None
    now = datetime.utcnow()
    sigs = [s for s in signatures(db, doc) if s.decision == "SIGNED"]
    cert = governance.to_pdf(governance.certificate_record(db, doc, sigs, now, org), org, entity)
    original = storage.get_store().get(doc.pdf_path)
    executed = renderer.append_pdf(original, cert)
    digest = hashlib.sha256(executed).hexdigest()
    doc.executed_pdf_path = storage.get_store().put(doc.organization_id, f"{doc.document_number}-executed-{digest[:12]}.pdf",
                                                    executed, encrypt=doc.files_encrypted)
    doc.executed_pdf_sha256 = digest
    state.transition(db, doc, "EXECUTED", actor_type="system", detail={"executed_sha256": digest})
    _point_hr_document(db, doc, len(executed))


def _point_hr_document(db, doc, size) -> None:
    if not doc.hr_document_id or doc.files_encrypted:
        return
    from app.modules.hr.models import AssignmentStatus, DocumentAssignment, HrDocument
    hd = db.get(HrDocument, doc.hr_document_id)
    store = storage.get_store()
    if hd is not None and hasattr(store, "absolute_path"):
        hd.file_path = store.absolute_path(doc.executed_pdf_path)
        hd.file_size = size
    for a in db.query(DocumentAssignment).filter(DocumentAssignment.document_id == doc.hr_document_id).all():
        a.status = AssignmentStatus.COMPLETED


# ── acknowledgement ──────────────────────────────────────────────────────────────────────────────────────────────────

def acknowledge(db, doc: GeneratedDocument, employee, *, text_version: str, ip: Optional[str], user_agent: Optional[str]):
    if doc.execution_mode != "ACKNOWLEDGE":
        raise HTTPException(409, "This document asks for a signature, not an acknowledgement.")
    if doc.status != "ISSUED":
        raise HTTPException(409, f"A document in status {doc.status} cannot be acknowledged.")
    if employee.id != doc.recipient_employee_id:
        raise HTTPException(404, "Document not found")
    if text_version != governance.ACK_VERSION:
        raise HTTPException(422, "Confirm the current acknowledgement statement.")
    digest = _integrity(doc)
    assignment_id = None
    if doc.hr_document_id:
        from app.modules.hr.models import AssignmentStatus, DocumentAssignment
        a = db.query(DocumentAssignment).filter(DocumentAssignment.document_id == doc.hr_document_id,
                                                DocumentAssignment.employee_id == employee.id).first()
        if a is not None:
            a.status, a.acknowledged_at, assignment_id = AssignmentStatus.ACKNOWLEDGED, datetime.utcnow(), a.id
    ack = DocumentAcknowledgement(organization_id=doc.organization_id, document_id=doc.id, employee_id=employee.id,
                                  acknowledgement_text_version=text_version, document_sha256=digest,
                                  acknowledged_at=datetime.utcnow(), ip_address=ip, user_agent=(user_agent or "")[:400],
                                  assignment_id=assignment_id)
    db.add(ack)
    state.transition(db, doc, "ACKNOWLEDGED", actor_id=employee.id, event_type="acknowledged")
    db.commit()
    notify.event(db, "document.acknowledged", doc)
    from app.modules.doc_templates import hooks
    hooks.dispatch(db, "acknowledged", doc)
    return ack


def mark_viewed(db, doc: GeneratedDocument, actor_id: Optional[int], actor_type: str = "employee") -> None:
    if doc.viewed_at is None and doc.status in ("ISSUED", "ACKNOWLEDGED", "EXECUTED"):
        doc.viewed_at = datetime.utcnow()
        state.add_event(db, doc, "viewed", actor_id=actor_id, actor_type=actor_type)
        db.commit()
