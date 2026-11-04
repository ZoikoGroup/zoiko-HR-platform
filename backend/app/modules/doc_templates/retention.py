"""Retention guard for document evidence.

`employee.service.hard_delete_employee` removes every row that references an employee through a NOT NULL foreign key. For a
person who appears in generated-document evidence that would silently destroy documents, signatures, acknowledgements and
decision receipts that are under retention or legal hold (and the append-only database triggers refuse it anyway). Such a
person must be deactivated instead; deletion of evidence is a retention decision, never a side effect.
"""
from __future__ import annotations

from sqlalchemy import or_


def employee_document_references(db, employee_id: int) -> list[str]:
    """Which kinds of document evidence name this employee ([] = safe to hard-delete)."""
    from app.modules.doc_templates.models import (AuthorisedSignatory, DecisionReceipt, DocumentAcknowledgement, DocumentSignature,
                                                  GeneratedDocument, GeneratedDocumentApproval)
    checks = [
        ("generated documents about or for them", db.query(GeneratedDocument.id).filter(or_(
            GeneratedDocument.recipient_employee_id == employee_id,
            (GeneratedDocument.subject_type == "employee") & (GeneratedDocument.subject_id == employee_id)))),
        ("generated documents they requested or issued", db.query(GeneratedDocument.id).filter(or_(
            GeneratedDocument.requested_by == employee_id, GeneratedDocument.issued_by == employee_id))),
        ("document approvals", db.query(GeneratedDocumentApproval.id).filter(GeneratedDocumentApproval.approver_id == employee_id)),
        ("electronic signatures", db.query(DocumentSignature.id).filter(DocumentSignature.signer_employee_id == employee_id)),
        ("document acknowledgements", db.query(DocumentAcknowledgement.id).filter(DocumentAcknowledgement.employee_id == employee_id)),
        ("decision receipts", db.query(DecisionReceipt.id).filter(DecisionReceipt.requested_by == employee_id)),
        ("signing authority records", db.query(AuthorisedSignatory.id).filter(or_(AuthorisedSignatory.employee_id == employee_id,
                                                                                  AuthorisedSignatory.approved_by == employee_id))),
    ]
    return [label for label, q in checks if q.first() is not None]
