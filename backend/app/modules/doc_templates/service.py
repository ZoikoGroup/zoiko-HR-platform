"""Generated documents: generate → (approve) → issue → acknowledge / sign → retain, plus cancel, correct and legal hold.

Rules that hold everywhere in this file:
* Generating, approving or issuing a document never changes HR state (status, pay, access, role). Nothing here writes to
  employees, compensation, leave or access tables. tests/doc_templates/test_no_hr_side_effects.py proves it.
* An issued document is never re-rendered. A correction is a new document (`correct`), the old one becomes CORRECTED.
* Status only changes through state.transition().
"""
from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import HTTPException

from app.modules.doc_templates import access, approvals, fields, hooks, notify, preflight, registry, renderer, resolver, state, storage
from app.modules.doc_templates.models import (DocumentNumberSequence, DocumentSignature, GeneratedDocument, JurisdictionPack,
                                              TemplateDefinition, TemplateVariant)

DEFAULT_RESPONSE_DAYS = 14
DEFAULT_REMINDER_DAYS = [3, 1]


class PreflightDenied(HTTPException):
    def __init__(self, result: preflight.PreflightResult, receipt_id: Optional[int] = None):
        super().__init__(422, {"code": "PREFLIGHT_" + result.outcome, "message": "The document cannot be generated.",
                               "receipt_id": receipt_id, **result.as_dict()})
        self.result = result


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# ── numbering ────────────────────────────────────────────────────────────────────────────────────────────────────────

def next_document_number(db, organization) -> str:
    """{ORGCODE}-{YYYY}-{000001}. The counter row is locked and incremented in the caller's transaction, so a rolled-back
    generation gives the number back: the sequence has no gaps."""
    from sqlalchemy.exc import IntegrityError
    year = datetime.utcnow().year
    q = db.query(DocumentNumberSequence).filter(DocumentNumberSequence.organization_id == organization.id,
                                                DocumentNumberSequence.year == year)
    row = q.with_for_update().first()
    if row is None:
        try:
            with db.begin_nested():
                row = DocumentNumberSequence(organization_id=organization.id, year=year, last_value=0)
                db.add(row)
        except IntegrityError:
            row = q.with_for_update().first()
    row.last_value += 1
    code = (organization.organization_code or f"ORG{organization.id}").upper()
    return f"{code}-{year}-{row.last_value:06d}"


# ── rendering ────────────────────────────────────────────────────────────────────────────────────────────────────────

def verify_url(number: str) -> str:
    return notify.app_url(f"/verify/{number}")


def letterhead(entity, organization) -> dict:
    if entity is None:
        return {"legal_name": getattr(organization, "organization_name", "")}
    from app.core import business_ids
    reg = None
    if entity.registration_number:
        lbl = business_ids.id_type(entity.country, entity.registration_type).get("label") or entity.registration_type or "Registration"
        reg = f"{lbl}: {entity.registration_number}"
    logo = None
    if entity.logo_file:
        from app.modules.hr.file_storage import resolve_stored_file
        logo = resolve_stored_file(entity.logo_file)
    return {"legal_name": entity.legal_name or "", "trading_name": entity.trading_name,
            "address": fields.REGISTRY["employer.registered_address"].source(fields.FieldContext(db=None, organization=organization,
                                                                                                 entity=entity)),
            "registration": reg, "logo_path": logo}


def build_input(ctx: fields.FieldContext, *, blocks: list, clauses: dict, required_clause_keys: list, number: str, title: str,
                sensitivity: str, letterhead_info: dict, author: str, signatures: Optional[dict] = None) -> renderer.RenderInput:
    refs = set(fields.REGISTRY)

    def value_of(key):
        return ctx.formatted(key) if key in refs else ""

    raw = {}
    from app.modules.doc_templates.blocks import references
    for key in references(blocks)["fields"]:
        if key in refs:
            raw[key] = ctx.raw(key)

    def clause_text(key):
        c = clauses.get(key)
        return c.text if c is not None else ("" if key not in required_clause_keys else None)

    def rows_of(key):
        v = ctx.raw(key)
        return v if isinstance(v, list) else []

    def items_of(key):
        v = ctx.raw(key)
        return [x for x in v if x not in (None, "")] if isinstance(v, list) else []

    return renderer.RenderInput(
        blocks=blocks, value_of=value_of, raw_values=raw, clause_text=clause_text, required_clause_keys=required_clause_keys,
        rows_of=rows_of, items_of=items_of, form_values=dict(ctx.form_values or {}), checklist_state=dict(ctx.checklist_state or {}),
        signatures=signatures or {}, document_number=number, title=title,
        verify_url=verify_url(number) if number else "", confidential=sensitivity in ("C3", "C4"), language=ctx.language,
        letterhead=letterhead_info, author=author)


def _store_render(db, doc: GeneratedDocument, inp: renderer.RenderInput) -> None:
    elements = renderer.layout(inp)
    html_bytes = renderer.render_html(inp, elements).encode("utf-8")
    pdf = renderer.render_pdf(inp, elements)
    encrypt = doc.sensitivity in ("C3", "C4")
    store = storage.get_store()
    digest = sha256(pdf)
    doc.pdf_sha256 = digest
    doc.pdf_path = store.put(doc.organization_id, f"{doc.document_number}-{digest[:12]}.pdf", pdf, encrypt=encrypt)
    doc.rendered_html_path = store.put(doc.organization_id, f"{doc.document_number}-{digest[:12]}.html", html_bytes, encrypt=encrypt)
    doc.files_encrypted = encrypt


# ── generate ─────────────────────────────────────────────────────────────────────────────────────────────────────────

def generate(db, actor, *, canonical_id: str, subject_type: str, subject_id: Optional[int], source_ref: Optional[str] = None,
             language: str = "en", effective_date: Optional[date] = None, entity_id: Optional[int] = None,
             signatory_id: Optional[int] = None, extra: Optional[dict] = None, distribution_id: Optional[int] = None,
             corrects: Optional[GeneratedDocument] = None, system_trigger: Optional[str] = None,
             prior_approvals: Optional[list] = None, approver_roles: Optional[list] = None,
             min_policy: Optional[str] = None, min_sensitivity: Optional[str] = None,
             idempotency_key: Optional[str] = None, waive_approval: Optional[str] = None) -> GeneratedDocument:
    """prior_approvals: approvals already given in the source module for the same decision (e.g. the recruitment offer
    approval chain), as [{"approver_id", "decided_at", "comment", "source"}]. Each is applied to the next pending step only if
    it passes the same separation-of-duties checks as a decision made here; otherwise the step stays pending."""
    org = actor.organization
    if idempotency_key:
        # a retried request (same key) gets the document the first request created, never a second one
        same = (db.query(GeneratedDocument).filter(GeneratedDocument.organization_id == actor.organization_id,
                                                   GeneratedDocument.idempotency_key == idempotency_key[:80]).first())
        if same is not None:
            if same.canonical_id != canonical_id or same.subject_id != subject_id:
                raise HTTPException(409, {"code": "IDEMPOTENCY_KEY_REUSED", "message": "This idempotency key was used for a different document."})
            return same
    result = preflight.run_preflight(db, organization_id=actor.organization_id, actor=actor, canonical_id=canonical_id,
                                     subject_type=subject_type, subject_id=subject_id, source_ref=source_ref, language=language,
                                     effective_date=effective_date, entity_id=entity_id, signatory_id=signatory_id, extra=extra,
                                     organization=org, system_trigger=system_trigger, min_policy=min_policy,
                                     waive_approval=waive_approval)
    if not result.allowed:
        receipt = preflight.persist_receipt(db, result, organization_id=actor.organization_id, requested_by=actor.id)
        db.commit()
        raise PreflightDenied(result, receipt.id)

    d: TemplateDefinition = result.definition
    v: TemplateVariant = result.variant
    number = next_document_number(db, org)
    # a module may make one document more sensitive than its template (a promotion letter with a pay section is C3)
    sensitivity = max(d.sensitivity, min_sensitivity or d.sensitivity, key=lambda x: registry.SENSITIVITIES.index(x)
                      if x in registry.SENSITIVITIES else 0)
    doc = GeneratedDocument(
        document_number=number, organization_id=actor.organization_id, canonical_id=d.canonical_id, family_id=d.family_id,
        title=d.title, kind=d.kind, legal_risk=d.legal_risk, sensitivity=sensitivity, output_mode=d.output_mode,
        execution_mode=d.execution_mode, audience=d.audience, approval_policy=result.policy, variant_id=v.id,
        variant_version=v.version, variant_checksum=v.checksum, pack_id=result.pack.id, release_mode=v.release_mode,
        subject_type=subject_type, subject_id=subject_id, source_ref=source_ref, language=v.language,
        recipient_name=result.recipient.get("name"), recipient_email=result.recipient.get("email"),
        recipient_employee_id=result.recipient.get("employee_id"), entity_id=result.entity.id, requested_by=actor.id,
        distribution_id=distribution_id, corrects_document_id=corrects.id if corrects else None,
        idempotency_key=idempotency_key[:80] if idempotency_key else None,
    )
    state.initial(doc)
    db.add(doc)
    db.flush()
    state.add_event(db, doc, "requested", actor_id=actor.id, detail={"canonical_id": d.canonical_id})

    receipt = preflight.persist_receipt(db, result, organization_id=actor.organization_id, requested_by=actor.id,
                                        document_id=doc.id)
    doc.decision_receipt_id = receipt.id
    state.transition(db, doc, "CONTEXT_VALIDATED", actor_id=actor.id, detail={"receipt_id": receipt.id})

    ctx = result.ctx
    opts = v.options or {}
    today = (effective_date or date.today())
    response_days = int(opts.get("response_days") or DEFAULT_RESPONSE_DAYS)
    ctx.document = {"number": number, "date": today, "title": d.title, "verify_url": verify_url(number),
                    "response_deadline": today + timedelta(days=response_days)}
    keys = set((v.field_contract or {}).get("required") or []) | set((v.field_contract or {}).get("optional") or [])
    for c in result.clauses.values():
        keys |= resolver.field_keys(c.text)
    snap = json.dumps(fields.snapshot(ctx, [k for k in keys if fields.is_known(k)]), sort_keys=True, default=str)
    if sensitivity in ("C3", "C4"):
        doc.field_snapshot, doc.snapshot_encrypted = storage.encrypt_text(snap), True
    else:
        doc.field_snapshot = snap

    inp = build_input(ctx, blocks=v.content, clauses=result.clauses,
                      required_clause_keys=list((v.clause_rules or {}).get("mandatory") or []), number=number, title=d.title,
                      sensitivity=sensitivity, letterhead_info=letterhead(result.entity, org),
                      author=result.entity.legal_name or "", signatures=_presigned(d, result))
    _store_render(db, doc, inp)
    state.transition(db, doc, "RENDERED_DRAFT", actor_id=actor.id, event_type="rendered", detail={"sha256": doc.pdf_sha256})
    if result.inputs.get("approval_waived"):
        state.add_event(db, doc, "approval_waived", actor_id=actor.id, detail=result.inputs["approval_waived"])

    if doc.execution_mode != "NONE":
        doc.due_by = datetime.combine(today + timedelta(days=response_days), datetime.min.time())
        expires_days = opts.get("expires_days")
        doc.expires_at = (datetime.combine(today + timedelta(days=int(expires_days)), datetime.min.time())
                          if expires_days else doc.due_by + timedelta(days=7))
        doc.reminder_days = opts.get("reminder_days") or DEFAULT_REMINDER_DAYS
    doc.retention_until = _retention_until(result.pack, d, today, organization_id=actor.organization_id, db=db)

    if result.chain and approver_roles:
        # a module may make the approver stricter for this one document (e.g. only an admin may approve withdrawing an
        # accepted offer); it can never make it looser
        result.chain = [{**s, "required_roles": [r for r in s["required_roles"] if r in approver_roles] or list(approver_roles)}
                        if s["step_kind"] == "APPROVER" else s for s in result.chain]
    if result.chain:
        approvals.create_steps(db, doc, result.chain)
        state.transition(db, doc, "PENDING_APPROVAL", actor_id=actor.id, detail={"policy": result.policy})
        db.flush()
        for prior in prior_approvals or []:
            if not approvals.apply_prior(db, doc, prior):
                break
        if approvals.current_step(db, doc) is None:
            state.transition(db, doc, "HUMAN_APPROVED", actor_id=actor.id, detail={"approved_in": "source module"})
    if corrects is not None:
        corrects.corrected_by_document_id = doc.id
    db.commit()
    db.refresh(doc)
    notify.event(db, "document.generated", doc)
    hooks.dispatch(db, "generated", doc)
    return doc


def _presigned(definition, result) -> dict:
    """Where the employer does not counter-sign (the candidate or employee is the only signer), the employer block names the
    authorised signatory issuing the document. A SIGN_BOTH document keeps a blank line until the employer really signs."""
    if result.signatory is None or definition.execution_mode == "SIGN_BOTH":
        return {}
    name = fields._full_name(fields._signatory_employee(result.ctx)) or ""
    return {"employer": f"{name}, {result.signatory.signatory_title} - authorised signatory for {result.entity.legal_name}"}


def retention_years(db, organization_id: Optional[int], pack: Optional[JurisdictionPack], rule_key: str):
    """The organization's own duration for this rule first, then the pack's counsel-approved rule. None: not configured."""
    from app.modules.doc_templates.models import DocTemplateSettings
    if db is not None and organization_id is not None:
        row = db.query(DocTemplateSettings).filter(DocTemplateSettings.organization_id == organization_id).first()
        years = ((row.retention_durations or {}) if row else {}).get(rule_key)
        if isinstance(years, (int, float)) and years > 0:
            return years
    years = (pack.retention_rules or {}).get(rule_key) if pack else None
    return years if isinstance(years, (int, float)) and years > 0 else None


def _retention_until(pack: JurisdictionPack, d: TemplateDefinition, on: date, *, organization_id=None, db=None) -> Optional[date]:
    years = retention_years(db, organization_id, pack, d.retention_rule_key)
    if not isinstance(years, (int, float)) or years <= 0:
        return None                                          # no approved rule: keep, never flag automatically
    return date(on.year + int(years), on.month, min(on.day, 28))


# ── approve / reject ─────────────────────────────────────────────────────────────────────────────────────────────────

def approve(db, doc: GeneratedDocument, actor, comment: Optional[str]) -> GeneratedDocument:
    step, complete = approvals.decide(db, doc, actor, approve=True, comment=comment)
    state.add_event(db, doc, "approved", actor_id=actor.id, detail={"step": step.step_order, "kind": step.step_kind})
    if complete:
        state.transition(db, doc, "HUMAN_APPROVED", actor_id=actor.id)
    db.commit()
    return doc


def reject(db, doc: GeneratedDocument, actor, comment: Optional[str]) -> GeneratedDocument:
    if not (comment or "").strip():
        raise HTTPException(422, "Give a reason for rejecting the document.")
    step, _ = approvals.decide(db, doc, actor, approve=False, comment=comment)
    state.transition(db, doc, "REJECTED", actor_id=actor.id, detail={"step": step.step_order})
    db.commit()
    return doc


# ── issue ────────────────────────────────────────────────────────────────────────────────────────────────────────────

def _variant_still_usable(db, doc: GeneratedDocument) -> None:
    v = db.get(TemplateVariant, doc.variant_id) if doc.variant_id else None
    pack = db.get(JurisdictionPack, doc.pack_id) if doc.pack_id else None
    today = date.today()
    if v is None or v.status != "ACTIVE" or (v.effective_to and v.effective_to < today):
        raise HTTPException(409, {"code": "VARIANT_NO_LONGER_ACTIVE",
                                  "message": "The template variant behind this draft was suspended, retired or expired. "
                                             "Cancel this draft and generate the document again."})
    if pack is None or pack.status != "ACTIVE" or (pack.effective_to and pack.effective_to < today):
        raise HTTPException(409, {"code": "PACK_NO_LONGER_ACTIVE",
                                  "message": "The jurisdiction pack behind this draft is no longer active. Generate the document again."})


def issue(db, doc: GeneratedDocument, actor, *, system_trigger: Optional[str] = None) -> GeneratedDocument:
    """system_trigger: issued automatically by a module (an L1 record or letter whose trigger was a human action already
    authorised there, e.g. an interview record when an interviewer submits feedback). Everything else still applies."""
    if not system_trigger:
        access.require_hr(actor)
    if doc.legal_hold:
        raise HTTPException(409, "The document is on legal hold.")
    if doc.status == "RENDERED_DRAFT":
        if doc.approval_policy != "L1":
            raise HTTPException(409, "This document needs approval before it can be issued.")
        _variant_still_usable(db, doc)
        doc.approved_by = [actor.id]
        state.transition(db, doc, "HUMAN_APPROVED", actor_id=actor.id, detail={"policy": "L1", "issuer_approval": True})
    elif doc.status == "HUMAN_APPROVED":
        _variant_still_usable(db, doc)
    else:
        raise HTTPException(409, f"A document in status {doc.status} cannot be issued.")

    v = db.get(TemplateVariant, doc.variant_id)
    if doc.execution_mode == "SIGN_BOTH" and (v.options or {}).get("employer_signs_first"):
        if not _signed(db, doc, "employer"):
            raise HTTPException(409, "The authorised signatory must sign before this document is issued.")

    doc.issued_by = actor.id
    doc.issued_at = datetime.utcnow()
    state.transition(db, doc, "ISSUED", actor_id=actor.id)
    _deliver(db, doc, actor)
    db.commit()
    notify.event(db, "document.issued", doc)
    hooks.dispatch(db, "issued", doc)
    return doc


def _signed(db, doc: GeneratedDocument, party: str) -> bool:
    return db.query(DocumentSignature).filter(DocumentSignature.document_id == doc.id, DocumentSignature.signer_party == party,
                                              DocumentSignature.decision == "SIGNED").first() is not None


def _deliver(db, doc: GeneratedDocument, actor) -> None:
    from app.modules.doc_templates import signing
    if doc.audience == "HR_INTERNAL":
        return
    if doc.audience == "CANDIDATE":
        from app.modules.hr.models import RecruitmentCandidate
        candidate = db.get(RecruitmentCandidate, doc.subject_id)
        raw, expires = signing.issue_candidate_token(db, doc)
        doc.delivered_via, doc.delivered_at = "email", datetime.utcnow()
        state.add_event(db, doc, "emailed", actor_id=actor.id, detail={"channel": "candidate_link"})
        db.flush()
        org_name = actor.organization.organization_name
        if doc.execution_mode == "SIGN_CANDIDATE":
            notify.candidate_link(db, doc, candidate, raw, expires, org_name)
        else:
            v = db.get(TemplateVariant, doc.variant_id) if doc.variant_id else None
            attach = None
            if v is not None and (v.options or {}).get("email_attachment") and doc.sensitivity == "C2" and not doc.files_encrypted:
                attach = (f"{doc.document_number}.pdf", file_bytes(doc, "original"))
            notify.candidate_view_link(db, doc, candidate, raw, expires, org_name, attachment=attach)
        return
    from app.modules.employee.models import Employee
    person = db.get(Employee, doc.recipient_employee_id)
    link_hr_document(db, doc, actor)
    doc.delivered_via, doc.delivered_at = "portal", datetime.utcnow()
    state.add_event(db, doc, "delivered", actor_id=actor.id, detail={"channel": "portal"})
    if person is not None:
        notify.action_required(db, doc, person, actor)
        state.add_event(db, doc, "emailed", actor_id=actor.id, detail={"channel": "notification"})


def link_hr_document(db, doc: GeneratedDocument, actor) -> None:
    """Show the issued document in the existing Documents / ESS "My documents" screens (plain files only: an encrypted C3/C4
    file has no servable plain path, so it is reachable only through the generated-documents endpoints)."""
    if doc.files_encrypted or doc.hr_document_id or doc.recipient_employee_id is None:
        return
    from app.modules.hr.models import DocumentAssignment, HrDocument, HrDocumentCategory, HrDocumentStatus, AssignmentStatus
    store = storage.get_store()
    if not hasattr(store, "absolute_path"):
        return
    category = {"AGREEMENT": HrDocumentCategory.CONTRACT, "POLICY": HrDocumentCategory.POLICY}.get(doc.kind, HrDocumentCategory.EMPLOYEE)
    data_len = None
    try:
        data_len = len(store.get(doc.pdf_path))
    except Exception:
        pass
    hd = HrDocument(title=f"{doc.title} ({doc.document_number})", description=f"Generated document {doc.document_number}",
                    category=category, document_type=f"generated:{doc.canonical_id}", file_path=store.absolute_path(doc.pdf_path),
                    file_name=f"{doc.document_number}.pdf", file_size=data_len, mime_type="application/pdf",
                    status=HrDocumentStatus.APPROVED, employee_id=doc.recipient_employee_id, uploaded_by=actor.id,
                    organization_id=doc.organization_id, approved_by=actor.id, approved_at=datetime.utcnow())
    db.add(hd)
    db.flush()
    doc.hr_document_id = hd.id
    if doc.execution_mode != "NONE":
        db.add(DocumentAssignment(document_id=hd.id, employee_id=doc.recipient_employee_id, assigned_by=actor.id,
                                  status=AssignmentStatus.PENDING, notes=f"Generated document {doc.document_number}"))


# ── cancel / correct / legal hold ────────────────────────────────────────────────────────────────────────────────────

def supersede(db, doc: GeneratedDocument, actor, reason: str) -> GeneratedDocument:
    """An issued document replaced by a newer one (e.g. an offer amended): it stays as issued, marked SUPERSEDED, and any
    open signing link dies."""
    if doc.status != "ISSUED":
        raise HTTPException(409, f"A document in status {doc.status} cannot be superseded.")
    state.transition(db, doc, "SUPERSEDED", actor_id=getattr(actor, "id", None), detail={"reason_recorded": bool(reason)})
    from app.modules.doc_templates import signing
    signing.revoke_candidate_tokens(db, doc)
    db.commit()
    return doc


def cancel(db, doc: GeneratedDocument, actor, reason: str, *, system_trigger: Optional[str] = None) -> GeneratedDocument:
    if not system_trigger:
        access.require_hr(actor)
    if not (reason or "").strip():
        raise HTTPException(422, "Give a reason for cancelling.")
    if doc.legal_hold:
        raise HTTPException(409, "The document is on legal hold.")
    doc.cancel_reason = reason.strip()[:2000]
    state.transition(db, doc, "CANCELLED", actor_id=getattr(actor, "id", None),
                     actor_type="employee" if actor is not None else "system")
    from app.modules.doc_templates import signing
    signing.revoke_candidate_tokens(db, doc)
    db.commit()
    hooks.dispatch(db, "cancelled", doc)
    return doc


def correct(db, doc: GeneratedDocument, actor, reason: str) -> GeneratedDocument:
    """Corrections create a new document; the issued one stays byte-for-byte as it was."""
    access.require_hr(actor)
    if not (reason or "").strip():
        raise HTTPException(422, "Give a reason for the correction.")
    if doc.legal_hold:
        raise HTTPException(409, "The document is on legal hold.")
    if doc.status not in ("ISSUED", "ACKNOWLEDGED", "EXECUTED", "DECLINED", "EXPIRED"):
        raise HTTPException(409, "Only an issued document can be corrected. Cancel a draft instead.")
    new = generate(db, actor, canonical_id=doc.canonical_id, subject_type=doc.subject_type, subject_id=doc.subject_id,
                   source_ref=doc.source_ref, language=doc.language, entity_id=doc.entity_id, corrects=doc)
    old = db.get(GeneratedDocument, doc.id)
    state.transition(db, old, "CORRECTED", actor_id=actor.id, detail={"corrected_by": new.id, "reason_recorded": True})
    old.corrected_by_document_id = new.id
    from app.modules.doc_templates import signing
    signing.revoke_candidate_tokens(db, old)
    db.commit()
    return new


def set_legal_hold(db, doc: GeneratedDocument, actor, reason: str) -> GeneratedDocument:
    access.require_hr(actor)
    if not (reason or "").strip():
        raise HTTPException(422, "Give a reason for the legal hold.")
    doc.legal_hold = True
    doc.legal_hold_reason = reason.strip()[:2000]
    state.transition(db, doc, "LEGAL_HOLD", actor_id=actor.id, event_type="legal_hold_set")
    db.commit()
    return doc


def release_hold(db, doc: GeneratedDocument, actor) -> GeneratedDocument:
    access.require_hr(actor)
    if doc.status != "LEGAL_HOLD":
        raise HTTPException(409, "The document is not on legal hold.")
    doc.legal_hold = False
    state.transition(db, doc, doc.status_before_hold, actor_id=actor.id, event_type="legal_hold_cleared")
    db.commit()
    return doc


# ── reading ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def file_bytes(doc: GeneratedDocument, which: str = "pdf") -> bytes:
    key = {"pdf": doc.executed_pdf_path or doc.pdf_path, "original": doc.pdf_path, "html": doc.rendered_html_path}[which]
    if not key:
        raise HTTPException(404, "File not found")
    try:
        return storage.get_store().get(key)
    except (FileNotFoundError, ValueError):
        raise HTTPException(410, "The stored file is missing. Restore it from backup.")


def serialize(doc: GeneratedDocument, *, viewer_is_hr: bool = True) -> dict:
    out = {
        "id": doc.id, "document_number": doc.document_number, "canonical_id": doc.canonical_id, "family_id": doc.family_id,
        "title": doc.title, "kind": doc.kind, "legal_risk": doc.legal_risk, "sensitivity": doc.sensitivity,
        "execution_mode": doc.execution_mode, "audience": doc.audience, "status": doc.status, "language": doc.language,
        "subject_type": doc.subject_type, "subject_id": doc.subject_id, "recipient_name": doc.recipient_name,
        "issued_at": doc.issued_at, "due_by": doc.due_by, "expires_at": doc.expires_at, "viewed_at": doc.viewed_at,
        "created_at": doc.created_at, "status_changed_at": doc.status_changed_at, "pdf_sha256": doc.pdf_sha256,
        "executed": bool(doc.executed_pdf_path), "executed_pdf_sha256": doc.executed_pdf_sha256,
    }
    if viewer_is_hr:
        out.update({
            "variant_id": doc.variant_id, "variant_version": doc.variant_version, "pack_id": doc.pack_id,
            "release_mode": doc.release_mode, "tenant_approved_template": doc.release_mode == "TENANT_ATTESTED",
            "approval_policy": doc.approval_policy, "source_ref": doc.source_ref, "requested_by": doc.requested_by,
            "approved_by": doc.approved_by or [], "issued_by": doc.issued_by, "legal_hold": doc.legal_hold,
            "decision_receipt_id": doc.decision_receipt_id, "corrected_by_document_id": doc.corrected_by_document_id,
            "corrects_document_id": doc.corrects_document_id, "distribution_id": doc.distribution_id,
            "retention_until": doc.retention_until, "hr_document_id": doc.hr_document_id, "delivered_via": doc.delivered_via,
        })
    return out
