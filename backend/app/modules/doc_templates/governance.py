"""The ten Tier-0 governance templates (HR-DOC family), produced by the engine from its own evidence.

    HR-DOC-001 register                 HR-DOC-012 e-signature evidence certificate (last page of every executed PDF)
    HR-DOC-003 legal approval record    HR-DOC-013 acknowledgement record
    HR-DOC-004 version history          HR-DOC-014 policy distribution record
    HR-DOC-008 generation instruction   HR-DOC-016 expiry and renewal record
    HR-DOC-010 workflow approval        HR-DOC-018 supersession and withdrawal record

They are records about documents, not employment documents: they are not jurisdiction-specific and are not produced from a
variant (docs/templates/release_modes.md "System records"). Every value is rendered literally (no placeholder parsing), so a
typed name or comment can never be interpreted. Each record is a `Record` (title + sections) exported to PDF or CSV.
"""
from __future__ import annotations

import csv
import difflib
import io
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Optional

from app.core import regions
from app.modules.doc_templates import blocks as blocks_mod
from app.modules.doc_templates import fields, registry, renderer, resolver
from app.modules.doc_templates.models import (
    DecisionReceipt, DocumentAcknowledgement, DocumentEvent, DocumentExpiryItem, DocumentSignature, GeneratedDocument,
    GeneratedDocumentApproval, JurisdictionPack, PolicyDistribution, TemplateApprovalRecord, TemplateClause, TemplateDefinition,
    TemplateSupersession, TemplateVariant,
)

CONSENT_VERSION = "ESIGN-CONSENT-1.0"
CONSENT_TEXT = ("I agree to sign this document electronically and that my typed or drawn signature has the same effect as a "
                "handwritten signature where the law allows.")
ACK_VERSION = "ACK-1.0"
ACK_TEXT = ("I confirm I have received and read this document. This does not mean I agree to give up any legal rights.")
ACK_STATEMENT = ("Acknowledgement confirms receipt and reading of the document. It is not acceptance of contractual terms and "
                 "does not waive any legal rights.")


@dataclass
class Record:
    canonical_id: str
    title: str
    sections: list = field(default_factory=list)    # ("heading"|"paragraph"|"kv"|"table", ...)
    confidential: bool = False
    number: str = ""

    def heading(self, text, level=2):
        self.sections.append(("heading", text, level))
        return self

    def para(self, text, style="normal"):
        self.sections.append(("paragraph", text, style))
        return self

    def kv(self, pairs):
        self.sections.append(("kv", [(a, _s(b)) for a, b in pairs]))
        return self

    def table(self, columns, rows):
        self.sections.append(("table", list(columns), [[_s(c) for c in r] for r in rows]))
        return self

    def blocks(self) -> list:
        out = [{"type": "letterhead"}, {"type": "heading", "text": self.title, "level": 1, "literal": True}]
        for s in self.sections:
            if s[0] == "heading":
                out.append({"type": "heading", "text": s[1], "level": s[2], "literal": True})
            elif s[0] == "paragraph":
                out.append({"type": "paragraph", "text": s[1], "style": s[2], "literal": True})
            elif s[0] == "kv":
                out.append({"type": "field_group", "pairs": s[1], "fields": []})
            elif s[0] == "table":
                out.append({"type": "table", "columns": s[1], "rows": s[2] or [["—"] + [""] * (len(s[1]) - 1)], "literal": True})
        return out

    def first_table(self):
        return next(((s[1], s[2]) for s in self.sections if s[0] == "table"), None)


def _s(v) -> str:
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d %H:%M:%S UTC")
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, bool):
        return "Yes" if v else "No"
    if isinstance(v, (list, tuple)):
        return ", ".join(_s(x) for x in v)
    return str(v)


# ── output ───────────────────────────────────────────────────────────────────────────────────────────────────────────

def _input(record: Record, organization, entity=None) -> renderer.RenderInput:
    from app.modules.doc_templates.service import letterhead
    lh = letterhead(entity, organization) if entity is not None else {"legal_name": getattr(organization, "organization_name", "") if organization else "Zoiko HR"}
    wide = any(s[0] == "table" and len(s[1]) > 7 for s in record.sections)
    return renderer.RenderInput(
        blocks=record.blocks(), value_of=lambda k: "", raw_values={}, clause_text=lambda k: None, required_clause_keys=[],
        document_number=record.number, title=record.title, confidential=record.confidential, letterhead=lh,
        author=lh.get("legal_name") or "", landscape=wide)


def to_pdf(record: Record, organization, entity=None) -> bytes:
    return renderer.render_pdf(_input(record, organization, entity))


def to_html(record: Record, organization, entity=None) -> str:
    return renderer.render_html(_input(record, organization, entity))


def to_csv(record: Record) -> str:
    """The record's main table (registers are tables); records without one export their label/value pairs."""
    buf = io.StringIO()
    w = csv.writer(buf)
    t = record.first_table()
    if t:
        w.writerow(t[0])
        for row in t[1]:
            w.writerow([_csv_safe(c) for c in row])
    else:
        w.writerow(["Field", "Value"])
        for s in record.sections:
            if s[0] == "kv":
                for a, b in s[1]:
                    w.writerow([_csv_safe(a), _csv_safe(b)])
    return buf.getvalue()


def _csv_safe(v: str) -> str:
    """Neutralise spreadsheet formula injection (=, +, -, @ at the start of a cell)."""
    v = _s(v)
    return "'" + v if v[:1] in ("=", "+", "-", "@", "\t", "\r") else v


def _name(db, employee_id) -> str:
    if not employee_id:
        return ""
    from app.modules.employee.models import Employee
    e = db.get(Employee, employee_id)
    return f"{e.first_name} {e.last_name}".strip() if e else f"#{employee_id}"


def _jurisdiction(pack: Optional[JurisdictionPack]) -> str:
    if pack is None:
        return ""
    return f"{pack.country}{('-' + pack.region) if pack.region else ''} ({pack.scope_type.lower()})"


# ── HR-DOC-001 register ──────────────────────────────────────────────────────────────────────────────────────────────

def availability(db, organization_id: int) -> dict:
    """canonical_id -> {"available", "reason", "variant"} for this tenant (catalogue view)."""
    from app.modules.doc_templates.preflight import tenant_attestation_allowed
    from sqlalchemy import or_
    variants = (db.query(TemplateVariant).filter(TemplateVariant.status == "ACTIVE",
                                                 or_(TemplateVariant.owner_organization_id == organization_id,
                                                     TemplateVariant.owner_organization_id.is_(None))).all())
    packs = {p.id: p for p in db.query(JurisdictionPack).filter(JurisdictionPack.status == "ACTIVE",
                                                                or_(JurisdictionPack.owner_organization_id == organization_id,
                                                                    JurisdictionPack.owner_organization_id.is_(None))).all()}
    by_template: dict[str, list] = {}
    today = date.today()
    for v in variants:
        if v.pack_id in packs and (v.effective_to is None or v.effective_to >= today):
            by_template.setdefault(v.canonical_id, []).append(v)
    attest_ok = {risk: tenant_attestation_allowed(db, organization_id, risk) for risk in registry.RISKS}
    out = {}
    for d in db.query(TemplateDefinition).all():
        if d.canonical_id in registry.SYSTEM_RECORDS:
            out[d.canonical_id] = {"available": True, "reason": "ENGINE_RECORD", "variant": None}
            continue
        if not d.implemented:
            out[d.canonical_id] = {"available": False, "reason": "NOT_IMPLEMENTED", "variant": None}
            continue
        vs = [v for v in by_template.get(d.canonical_id, [])
              if v.release_mode == "PLATFORM_COUNSEL" or attest_ok.get(d.legal_risk)]
        if vs:
            best = sorted(vs, key=lambda v: (v.release_mode != "TENANT_ATTESTED", -v.version))[0]
            out[d.canonical_id] = {"available": True, "reason": None, "variant": best}
        elif not packs:
            out[d.canonical_id] = {"available": False, "reason": "NO_ACTIVE_PACK", "variant": None}
        else:
            out[d.canonical_id] = {"available": False, "reason": "NO_ACTIVE_VARIANT", "variant": None}
    return out


def register_record(db, organization) -> Record:
    avail = availability(db, organization.id)
    packs = {p.id: p for p in db.query(JurisdictionPack).all()}
    rows = []
    for d in db.query(TemplateDefinition).order_by(TemplateDefinition.canonical_id).all():
        a = avail.get(d.canonical_id, {})
        v = a.get("variant")
        rows.append([d.canonical_id, d.family_id, d.title, d.kind, d.legal_risk, d.sensitivity, d.implemented,
                     "Yes" if a.get("available") else f"No ({a.get('reason')})", f"v{v.version}" if v else "",
                     _jurisdiction(packs.get(v.pack_id)) if v else "", v.effective_from if v else "", v.effective_to if v else "",
                     (v.status_changed_at or v.updated_at) if v else d.updated_at])
    rec = Record("HR-DOC-001", f"Template Register — {organization.display_name or organization.organization_name} — "
                               f"{datetime.utcnow().strftime('%Y-%m-%d')}")
    rec.para(f"{len(rows)} canonical templates ({registry.SOURCE_SPEC}). Every template is blocked until an approved "
             "jurisdiction variant is active for this organization.", "small")
    rec.table(["Canonical ID", "Family", "Title", "Kind", "Risk", "Sensitivity", "Implemented", "Available here",
               "Active version", "Pack", "Effective from", "Effective to", "Last change"], rows)
    return rec


# ── HR-DOC-003 legal approval record ────────────────────────────────────────────────────────────────────────────────

def approval_record(db, variant: TemplateVariant, review: dict, *, clauses: list) -> Record:
    d = db.get(TemplateDefinition, variant.canonical_id)
    pack = db.get(JurisdictionPack, variant.pack_id)
    rec = Record("HR-DOC-003", "Legal Template Approval Record")
    rec.kv([("Template", f"{d.canonical_id} — {d.title}"), ("Variant", f"{variant.id} v{variant.version}"),
            ("Jurisdiction", f"{pack.country} {pack.region or ''}".strip()), ("Language", variant.language),
            ("Release mode", variant.release_mode), ("Checksum", variant.checksum)])
    rec.para("The reviewer named below confirms that the variant identified above has been reviewed for use in the stated "
             "jurisdiction and scope, that mandatory clauses listed in this record are present, and that the sources listed "
             "were current on the review date.")
    rec.heading("Mandatory clauses")
    rec.table(["Clause", "Version", "Checksum"], [[c.clause_key, c.version, c.checksum] for c in clauses])
    rec.heading("Sources")
    srcs = (review.get("sources") or []) + list(pack.source_references or [])
    rec.table(["Title", "URL / reference", "Retrieved on"],
              [[s.get("title", ""), s.get("url") or s.get("reference", ""), s.get("retrieved_on", "")] for s in srcs if isinstance(s, dict)])
    rec.kv([("Reviewer", review.get("reviewer_name")), ("Role", review.get("reviewer_role")),
            ("Firm / organisation", review.get("reviewer_firm")), ("Qualification statement", review.get("qualification_statement")),
            ("Reviewed on", review.get("date")), ("Conditions / limitations", review.get("conditions") or "None stated")])
    if variant.release_mode == "TENANT_ATTESTED":
        rec.para("Release mode TENANT_ATTESTED: the organization adopted and reviewed this content under its own legal "
                 "responsibility. It has not been approved by Zoiko.", "notice")
    rec.heading("Declaration")
    rec.para(f"Signed electronically by {review.get('signed_name') or review.get('reviewer_name') or ''} on "
             f"{_s(review.get('signed_at'))}.")
    return rec


# ── HR-DOC-004 version history ──────────────────────────────────────────────────────────────────────────────────────

def _flatten(content) -> list[str]:
    lines = []
    for b in content or []:
        t = b.get("type")
        if t in ("heading", "paragraph", "declaration"):
            lines.append(f"[{t}] {b.get('text', '')}")
        elif t == "list":
            lines += [f"[list] {i}" for i in b.get("items") or []]
        elif t == "clause":
            lines.append(f"[clause] {b.get('key')}")
        elif t == "table":
            lines.append(f"[table] {' | '.join(b.get('columns') or [])}")
            lines += [f"[row] {' | '.join(str(c) for c in r)}" for r in b.get("rows") or []]
        else:
            lines.append(f"[{t}] {blocks_mod.canonical_json({k: v for k, v in b.items() if k != 'type'})}")
    return lines


def diff(old: Optional[TemplateVariant], new: TemplateVariant) -> dict:
    """Clause and text differences between two variant versions (the legal difference report)."""
    old_rules = (old.clause_rules or {}) if old else {}
    new_rules = new.clause_rules or {}
    clause_changes = {}
    for kind in ("mandatory", "optional", "prohibited"):
        a, b = set(old_rules.get(kind) or []), set(new_rules.get(kind) or [])
        if a != b:
            clause_changes[kind] = {"added": sorted(b - a), "removed": sorted(a - b)}
    old_fc, new_fc = (old.field_contract or {}) if old else {}, new.field_contract or {}
    field_changes = {k: {"added": sorted(set(new_fc.get(k) or []) - set(old_fc.get(k) or [])),
                         "removed": sorted(set(old_fc.get(k) or []) - set(new_fc.get(k) or []))} for k in ("required", "optional")}
    text = list(difflib.unified_diff(_flatten(old.content if old else []), _flatten(new.content), "previous", "new", lineterm="", n=1))
    return {"from_version": old.version if old else None, "to_version": new.version, "clause_changes": clause_changes,
            "field_changes": field_changes, "text_diff": text,
            "applicability_changed": (old.applicability if old else None) != new.applicability,
            "effective_dates": {"from": [old.effective_from if old else None, new.effective_from],
                                "to": [old.effective_to if old else None, new.effective_to]}}


def version_history_record(db, variant: TemplateVariant) -> Record:
    chain = []
    cur = variant
    while cur is not None and len(chain) < 200:
        chain.append(cur)
        cur = db.get(TemplateVariant, cur.previous_version_id) if cur.previous_version_id else None
    chain.reverse()
    pack = db.get(JurisdictionPack, variant.pack_id)
    rec = Record("HR-DOC-004", f"Template Version History — {variant.canonical_id}")
    rec.kv([("Template variant", variant.id), ("Current revision", variant.version), ("Artifact hash", variant.checksum),
            ("Legal pack", _jurisdiction(pack))])
    rec.table(["Version", "Status", "Release mode", "Proposed by", "Reviewed by", "Released by", "Effective from", "Effective to",
               "Checksum", "Change reason"],
              [[v.version, v.status, v.release_mode, _name(db, v.authored_by), _name(db, v.reviewed_by), _name(db, v.released_by),
                v.effective_from, v.effective_to, (v.checksum or "")[:16], v.change_reason] for v in chain])
    for prev, nxt in zip([None] + chain[:-1], chain):
        if prev is None:
            continue
        dd = diff(prev, nxt)
        rec.heading(f"Version transition v{prev.version} to v{nxt.version}", 3)
        rec.kv([("Proposed by", _name(db, nxt.authored_by)), ("Reason", nxt.change_reason),
                ("Requirements affected", "; ".join(f"{k}: +{v['added']} -{v['removed']}" for k, v in dd["clause_changes"].items()) or "No clause changes")])
        if dd["text_diff"]:
            rec.para("\n".join(dd["text_diff"][:200]), "small")
        rec.kv([("Legal reviewer", _name(db, nxt.reviewed_by) or (nxt.legal_review or {}).get("reviewer_name")),
                ("Publisher", _name(db, nxt.released_by))])
    rec.heading("Rollback and preservation", 3)
    rec.para("Old effective-dated versions and every document generated under them are retained unchanged. A withdrawn variant "
             "stops new use only; executed copies are never rewritten.")
    return rec


# ── HR-DOC-008 generation instruction ───────────────────────────────────────────────────────────────────────────────

def generation_instruction_record(db, doc: GeneratedDocument) -> Record:
    receipt = db.get(DecisionReceipt, doc.decision_receipt_id) if doc.decision_receipt_id else None
    steps = db.query(GeneratedDocumentApproval).filter(GeneratedDocumentApproval.document_id == doc.id) \
        .order_by(GeneratedDocumentApproval.step_order).all()
    rec = Record("HR-DOC-008", "Document Generation Instruction", number=doc.document_number)
    rec.para("HR-internal record. It identifies the subject by reference only.", "small")
    rec.kv([("Document", doc.document_number), ("Template", f"{doc.canonical_id} — {doc.title}"),
            ("Variant", f"{doc.variant_id} v{doc.variant_version}"), ("Variant checksum", doc.variant_checksum),
            ("Release mode", doc.release_mode), ("Requested by", _name(db, doc.requested_by)), ("Source event", doc.source_ref or "manual"),
            ("Subject reference", f"{doc.subject_type}:{doc.subject_id}" if doc.subject_id else doc.subject_type),
            ("Language", doc.language), ("Approval policy", doc.approval_policy),
            ("Required approvers", ", ".join(f"{s.step_kind} ({'/'.join(s.required_roles or [])})" for s in steps) or "None (L1)"),
            ("Delivery channel", {"CANDIDATE": "secure candidate link", "HR_INTERNAL": "none (internal)"}.get(doc.audience, "employee portal")),
            ("Execution mode", doc.execution_mode), ("Due date", doc.due_by), ("Decision receipt", receipt.id if receipt else None),
            ("Engine version", receipt.engine_version if receipt else None)])
    if receipt:
        rec.heading("Preflight outcome")
        rec.table(["Step", "Outcome", "Detail"], [[s.get("step"), s.get("outcome"), s.get("detail", "")] for s in receipt.steps or []])
        rec.table(["Clause", "Version", "Checksum"], [[c.get("key"), c.get("version"), (c.get("checksum") or "")[:16]] for c in receipt.clauses or []])
    return rec


# ── HR-DOC-010 workflow approval record ─────────────────────────────────────────────────────────────────────────────

def workflow_approval_record(db, doc: GeneratedDocument) -> Record:
    steps = db.query(GeneratedDocumentApproval).filter(GeneratedDocumentApproval.document_id == doc.id) \
        .order_by(GeneratedDocumentApproval.step_order).all()
    rec = Record("HR-DOC-010", "Document Workflow Approval Record", number=doc.document_number)
    rec.kv([("Document", f"{doc.document_number} — {doc.title}"), ("Approval policy", doc.approval_policy),
            ("Requested by", _name(db, doc.requested_by)), ("Current status", doc.status)])
    rows = []
    for s in steps:
        sod = s.sod_check or {}
        rows.append([s.step_order, s.step_kind, "/".join(s.required_roles or []), _name(db, s.approver_id), s.approver_role,
                     s.decision, s.comment or "", s.decided_at,
                     ("passed" if sod.get("passed") else "failed") if sod else "not yet decided"])
    if doc.approval_policy == "L1":
        rows.append([1, "ISSUER", "hr_admin/admin", _name(db, (doc.approved_by or [None])[0]), "", "APPROVED" if doc.approved_by else "PENDING",
                     "L1: issued by an authorised HR user without a second approver", doc.issued_at, "n/a (L1)"])
    rec.table(["Step", "Kind", "Required role", "Approver", "Role at the time", "Decision", "Comment", "Decided at",
               "Separation of duties"], rows)
    return rec


# ── HR-DOC-012 e-signature evidence certificate ─────────────────────────────────────────────────────────────────────

def mask_email(email: Optional[str]) -> str:
    if not email or "@" not in email:
        return ""
    local, domain = email.split("@", 1)
    return f"{local[:1]}***@{domain}"


def device_summary(ua: Optional[str]) -> str:
    ua = ua or ""
    browser = next((b for b, pat in (("Edge", r"Edg/"), ("Chrome", r"Chrome/"), ("Firefox", r"Firefox/"), ("Safari", r"Safari/"))
                    if re.search(pat, ua)), "Unknown browser")
    osn = next((o for o, pat in (("Windows", r"Windows"), ("Android", r"Android"), ("iOS", r"iPhone|iPad"), ("macOS", r"Mac OS X"),
                                 ("Linux", r"Linux")) if re.search(pat, ua)), "unknown OS")
    return f"{browser} on {osn}"


def certificate_record(db, doc: GeneratedDocument, signatures: list[DocumentSignature], completed_at: datetime, organization) -> Record:
    from app.modules.doc_templates.models import EmployerEntity
    entity = db.get(EmployerEntity, doc.entity_id) if doc.entity_id else None
    tz = getattr(organization, "timezone", None) or "UTC"
    rec = Record("HR-DOC-012", "Electronic Signature Evidence Certificate", number=doc.document_number,
                 confidential=doc.sensitivity in ("C3", "C4"))
    rec.kv([("Document", f"{doc.document_number} — {doc.title}"), ("Issued by", getattr(entity, "legal_name", "") or ""),
            ("Original document SHA-256", doc.pdf_sha256), ("Executed on", completed_at)])
    rows = []
    for s in signatures:
        third_party = s.signer_party in ("candidate", "witness")
        rows.append([s.signer_party, s.signer_name_typed or "", mask_email(s.signer_email) if third_party else (s.signer_email or ""),
                     s.signature_method or "", s.otp_verified_at or "not required", s.ip_address or "", device_summary(s.user_agent),
                     f"{_s(s.signed_at)} / {_local(s.signed_at, tz)}", s.decision])
    rec.table(["Party", "Name", "E-mail", "Method", "OTP verified at", "IP address", "Device", "Signed at (UTC / local)", "Decision"], rows)
    rec.para(f"Each signer viewed the document and confirmed the electronic signature consent statement version {CONSENT_VERSION} "
             "before signing. This certificate records the evidence captured by Zoiko HR. It is not a qualified electronic "
             "signature unless stated otherwise by the applicable approved jurisdiction pack.")
    rec.para(f"Consent statement {CONSENT_VERSION}: “{CONSENT_TEXT}”", "small")
    from app.modules.doc_templates.service import verify_url
    rec.para(f"Verify at {verify_url(doc.document_number)}", "small")
    return rec


def _local(dt: Optional[datetime], tz: str) -> str:
    if not dt:
        return ""
    try:
        from zoneinfo import ZoneInfo
        from datetime import timezone as _tz
        return dt.replace(tzinfo=_tz.utc).astimezone(ZoneInfo(tz)).strftime(f"%Y-%m-%d %H:%M {tz}")
    except Exception:
        return _s(dt)


# ── HR-DOC-013 acknowledgement record ───────────────────────────────────────────────────────────────────────────────

def acknowledgement_record(db, ack: DocumentAcknowledgement) -> Record:
    from app.modules.employee.models import Employee
    doc = db.get(GeneratedDocument, ack.document_id)
    emp = db.get(Employee, ack.employee_id)
    rec = Record("HR-DOC-013", "Employee Document Acknowledgement Record", number=doc.document_number)
    rec.kv([("Employee", f"{emp.first_name} {emp.last_name}" if emp else ""), ("Employee code", getattr(emp, "employee_code", "")),
            ("Document", f"{doc.document_number} — {doc.title}"), ("Template version", f"{doc.canonical_id} v{doc.variant_version}"),
            ("Document SHA-256", ack.document_sha256), ("Acknowledged at", ack.acknowledged_at), ("IP address", ack.ip_address),
            ("Device", device_summary(ack.user_agent)), ("Acknowledgement text version", ack.acknowledgement_text_version)])
    rec.para(f"Text confirmed: “{ACK_TEXT}”")
    rec.para(ACK_STATEMENT, "notice")
    return rec


# ── HR-DOC-014 policy distribution record ───────────────────────────────────────────────────────────────────────────

def distribution_stats(db, dist: PolicyDistribution) -> dict:
    docs = db.query(GeneratedDocument).filter(GeneratedDocument.distribution_id == dist.id).all()
    now = datetime.utcnow()
    done = {"ACKNOWLEDGED", "EXECUTED", "RETAINED"}
    return {
        "sent": sum(1 for d in docs if d.issued_at), "viewed": sum(1 for d in docs if d.viewed_at),
        "acknowledged": sum(1 for d in docs if d.status in done),
        "overdue": sum(1 for d in docs if d.status == "ISSUED" and d.due_by and d.due_by < now),
        "reminders": db.query(DocumentEvent).filter(DocumentEvent.document_id.in_([d.id for d in docs] or [-1]),
                                                   DocumentEvent.event_type == "reminded").count(),
        "recipients": len(docs),
    }


def distribution_record(db, dist: PolicyDistribution) -> Record:
    stats = distribution_stats(db, dist)
    docs = db.query(GeneratedDocument).filter(GeneratedDocument.distribution_id == dist.id).order_by(GeneratedDocument.id).all()
    rec = Record("HR-DOC-014", "Policy Distribution and Publication Record")
    rec.kv([("Policy", f"{dist.canonical_id} — {dist.title}"), ("Version", dist.version), ("Checksum", dist.variant_checksum),
            ("Audience", _audience_text(dist.audience)), ("Requires", dist.requires), ("Publisher", _name(db, dist.published_by)),
            ("Published at", dist.published_at), ("Due date", dist.due_date), ("Status", dist.status),
            ("Sent", stats["sent"]), ("Viewed", stats["viewed"]), ("Acknowledged", stats["acknowledged"]),
            ("Overdue", stats["overdue"]), ("Reminders sent", stats["reminders"])])
    rec.table(["Document", "Recipient", "Status", "Issued", "Viewed", "Due"],
              [[d.document_number, d.recipient_name, d.status, d.issued_at, d.viewed_at, d.due_by] for d in docs])
    return rec


def _audience_text(a) -> str:
    if not isinstance(a, dict):
        return ""
    t = a.get("type", "all")
    return "Everyone" if t == "all" else f"{t}: {', '.join(str(i) for i in a.get('ids') or [])}"


# ── HR-DOC-016 expiry and renewal ───────────────────────────────────────────────────────────────────────────────────

def expiry_record(db, organization_id: int) -> Record:
    items = db.query(DocumentExpiryItem).filter(DocumentExpiryItem.organization_id == organization_id) \
        .order_by(DocumentExpiryItem.status, DocumentExpiryItem.expiry_date).all()
    rec = Record("HR-DOC-016", "Document Expiry and Renewal Record")
    rec.table(["Item", "Type", "Owner", "Expiry date", "Action required", "Status", "Resolution"],
              [[i.title, i.item_type, _name(db, i.owner_employee_id), i.expiry_date, i.action_required, i.status, i.resolution_note or ""]
               for i in items])
    return rec


# ── HR-DOC-018 supersession and withdrawal ──────────────────────────────────────────────────────────────────────────

def supersession_record(db, sup: TemplateSupersession) -> Record:
    rec = Record("HR-DOC-018", "Template Supersession and Withdrawal Record")
    rec.kv([("Template", sup.canonical_id), ("Withdrawn variant", f"{sup.old_variant_id} v{sup.old_version}"),
            ("Replacement variant", f"{sup.new_variant_id} v{sup.new_version}" if sup.new_variant_id else "None"),
            ("Action", sup.action), ("Reason", sup.reason), ("Effective", sup.effective_at), ("Decided by", _name(db, sup.decided_by)),
            ("Documents in progress affected", sup.affected_in_progress)])
    if sup.affected_in_progress:
        rec.para("Drafts generated from the withdrawn variant are blocked from issue. HR must cancel and regenerate them.", "notice")
    rec.para("Previously issued documents remain unchanged: their bytes, hashes and evidence are not modified by this decision.")
    return rec
