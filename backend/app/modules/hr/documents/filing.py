"""Auto-filing of generated documents into the employee's containers (ZHR-DOCS-ARCH-001 §13.3, Phase 7).

An issued document (offer, contract, letter, tax statement) is filed as an approved file in the matching category
(source=template, auto-approved: the template engine already governed it). When every party has signed, the executed PDF
is added as a new version of the same file, `signature.completed` is emitted, open "sign" tasks close and the employee is
told where the signed copy is. Policies are not filed here: the policy hub and company documents carry them.

The bytes are copied into the documents module's encrypted store, so encrypted (C3/C4) generated documents are filed too.
"""
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.modules.hr.documents.constants import EMPLOYEE_KEYWORDS, DEFAULT_EMPLOYEE_CATEGORY

logger = logging.getLogger("zoiko.documents.filing")

KIND_CATEGORY = {"AGREEMENT": "offer_contracts", "LETTER_NOTICE": "offer_contracts", "DECISION": "offer_contracts"}
NOT_FILED_KINDS = ("POLICY",)
SIGNED_NOTE = "Signed copy"
TAB_FOR_CATEGORY = {"offer_contracts": "/employee/documents/contracts", "tax_compliance": "/employee/documents/tax"}


def category_key_for(gdoc) -> Optional[str]:
    """Which employee container a generated document belongs in (None: not filed as an employee document)."""
    kind = (gdoc.kind or "").upper()
    if kind in NOT_FILED_KINDS:
        return None
    text = f"{gdoc.title or ''} {gdoc.canonical_id or ''}".lower()
    if "tax" in text:
        return "tax_compliance"
    if kind in KIND_CATEGORY:
        return KIND_CATEGORY[kind]
    for words, key in EMPLOYEE_KEYWORDS:
        if any(w in text for w in words):
            return key
    return DEFAULT_EMPLOYEE_CATEGORY


def _bytes(gdoc, which: str) -> Optional[bytes]:
    from app.modules.doc_templates import service as dt_service
    try:
        return dt_service.file_bytes(gdoc, which)
    except Exception:
        logger.warning("generated document %s: %s file unavailable for filing", gdoc.id, which)
        return None


def _add_version(db: Session, doc, data: bytes, filename: str, actor, notes: str):
    from app.modules.hr.documents import approval_service, lifecycle, storage_service
    from app.modules.hr.models import HrDocumentVersion
    stored = storage_service.store_upload(doc.organization_id, data, filename, allowed_extensions={".pdf"})
    number = (db.query(HrDocumentVersion.version).filter(HrDocumentVersion.document_id == doc.id)
              .order_by(HrDocumentVersion.version.desc()).first())
    version = HrDocumentVersion(
        document_id=doc.id, organization_id=doc.organization_id, version=(number[0] if number else 0) + 1,
        file_name=stored.file_name, file_size=stored.size, mime_type=stored.mime_type, uploaded_by=getattr(actor, "id", None),
        storage_key=stored.storage_key, is_encrypted=True, sha256=stored.sha256, scan_status=stored.precheck.scan_status,
        precheck=stored.precheck.as_dict(), change_notes=notes, created_at=datetime.utcnow())
    version.document = doc
    reason = approval_service.auto_approval_reason(db, doc, version)
    if reason:
        lifecycle.apply_transition(db, version, lifecycle.Event.AUTO_APPROVE, actor, auto_reason=reason)
    else:                                                # a category that always needs a person (never for templates today)
        lifecycle.apply_transition(db, version, lifecycle.Event.UPLOAD, actor)
        approval_service.create_steps_for_version(db, doc, version)
    doc.file_name, doc.file_size, doc.mime_type = stored.file_name, stored.size, stored.mime_type
    doc.updated_at = datetime.utcnow()
    return version


def file_generated(db: Session, gdoc, actor=None, notes: str = "Issued") -> Optional[object]:
    """File an issued generated document into its employee container. Idempotent (gdoc.hr_document_id). Returns the
    HrDocument, or None when the document is not filed (policy, no recipient, file unavailable)."""
    from app.modules.hr.documents.category_service import employee_category_by_key, seed_org_categories
    from app.modules.hr.models import HrDocument, HrDocumentCategory, HrDocumentStatus
    if gdoc.hr_document_id or gdoc.recipient_employee_id is None:
        return db.get(HrDocument, gdoc.hr_document_id) if gdoc.hr_document_id else None
    key = category_key_for(gdoc)
    if key is None:
        return None
    org = gdoc.organization_id
    cat = employee_category_by_key(db, org, key)
    if cat is None:
        seed_org_categories(db, org)
        cat = employee_category_by_key(db, org, key)
    data = _bytes(gdoc, "pdf")
    if cat is None or not data:
        return None
    now = datetime.utcnow()
    legacy_cat = HrDocumentCategory.CONTRACT if key == "offer_contracts" else HrDocumentCategory.EMPLOYEE
    doc = HrDocument(title=f"{gdoc.title} ({gdoc.document_number})"[:255], description=f"Generated document {gdoc.document_number}",
                     category=legacy_cat, document_type=f"generated:{gdoc.canonical_id}", status=HrDocumentStatus.PENDING,
                     employee_id=gdoc.recipient_employee_id, uploaded_by=getattr(actor, "id", None), organization_id=org,
                     scope="employee", employee_category_id=cat.id, source="template", current_version=0,
                     created_at=now, updated_at=now)
    db.add(doc)
    db.flush()
    _add_version(db, doc, data, f"{gdoc.document_number}.pdf", actor, notes)
    gdoc.hr_document_id = doc.id
    return doc


def on_executed(db: Session, gdoc) -> None:
    """Every party signed: file the signed copy, close sign tasks, tell the employee, emit signature.completed."""
    from app.modules.hr.documents import notify
    from app.modules.hr.documents.automation import events as ev, tasks as task_service
    from app.modules.hr.models import HrDocumentVersion
    was_filed = bool(gdoc.hr_document_id)
    # filed only now (e.g. issued before auto-filing existed): the first version already is the signed copy
    doc = file_generated(db, gdoc, None, notes=SIGNED_NOTE if gdoc.executed_pdf_path else "Issued")
    if doc is not None and was_filed and gdoc.executed_pdf_path:
        signed = (db.query(HrDocumentVersion.id).filter(HrDocumentVersion.document_id == doc.id,
                                                        HrDocumentVersion.change_notes == SIGNED_NOTE).first())
        data = None if signed else _bytes(gdoc, "pdf")
        if data:
            _add_version(db, doc, data, f"{gdoc.document_number}-signed.pdf", None, SIGNED_NOTE)
    task_service.close_tasks(db, gdoc.organization_id, kinds=["sign"], employee_id=gdoc.recipient_employee_id,
                             generated_document_id=gdoc.id, reason="signed", now=datetime.utcnow())
    ev.emit(db, gdoc.organization_id, ev.SignatureCompleted(
        document_id=gdoc.id, canonical_id=gdoc.canonical_id, hr_document_id=getattr(doc, "id", None),
        recipient_employee_id=gdoc.recipient_employee_id))
    if doc is not None and gdoc.recipient_employee_id:
        from app.modules.employee.models import Employee
        person = db.get(Employee, gdoc.recipient_employee_id)
        if person is not None:
            notify.send(db, gdoc.organization_id, [person], "document.signed_filed", title=gdoc.title,
                        link=TAB_FOR_CATEGORY.get(category_key_for(gdoc), "/employee/documents/my-files"),
                        channels=["in_app"], document_id=doc.id)
    db.commit()


def _register() -> None:
    """Loaded by doc_templates.hooks.load_integrations: every executed generated document is filed."""
    from app.modules.doc_templates import hooks
    hooks.on_any("executed", on_executed)


_register()
