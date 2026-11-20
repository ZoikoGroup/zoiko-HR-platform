"""Company documents (ZHR-DOCS-ARCH-001 §7.2, Module B)."""
from datetime import datetime

from sqlalchemy.orm import Session

from app.modules.hr.documents.category_service import company_category_by_key, seed_org_categories
from app.modules.hr.documents.constants import DEFAULT_COMPANY_CATEGORY, map_legacy_category
from app.modules.hr.documents.models import HrDocumentAccessRule


def adopt_legacy_upload(db: Session, doc, uploader=None) -> None:
    """A file added through the legacy upload route (POST /hr/documents/upload) joins the new model: company scope, a
    category from its metadata, version 1 (approved when the uploader's role auto-approves it) and an admin-only access rule
    until someone shares it. Nobody gains access to a new upload by default."""
    from app.modules.hr.models import HrDocumentStatus, HrDocumentVersion
    seed_org_categories(db, doc.organization_id)
    _, key = map_legacy_category("company", doc.title, doc.document_type, False)
    cat = company_category_by_key(db, doc.organization_id, key) or company_category_by_key(db, doc.organization_id, DEFAULT_COMPANY_CATEGORY)
    doc.scope = "company"
    doc.source = "company"
    doc.employee_id = None
    doc.company_category_id = getattr(cat, "id", None)
    approved = doc.status == HrDocumentStatus.APPROVED
    version = HrDocumentVersion(
        document_id=doc.id, organization_id=doc.organization_id, version=doc.current_version or 1, file_path=doc.file_path,
        file_name=doc.file_name, file_size=doc.file_size, mime_type=doc.mime_type, uploaded_by=doc.uploaded_by,
        change_notes="Uploaded", status="approved" if approved else "pending_approval", expiry_date=doc.expiry_date,
        decided_by=doc.uploaded_by if approved else None, decided_role="auto" if approved else None,
        decided_at=datetime.utcnow() if approved else None, created_at=datetime.utcnow())
    db.add(version)
    db.flush()
    if approved:
        doc.approved_version_id = version.id
        doc.approved_by = doc.approved_by or doc.uploaded_by
    if not db.query(HrDocumentAccessRule.id).filter(HrDocumentAccessRule.organization_id == doc.organization_id,
                                                   HrDocumentAccessRule.target_type == "document",
                                                   HrDocumentAccessRule.target_id == doc.id).first():
        db.add(HrDocumentAccessRule(organization_id=doc.organization_id, target_type="document", target_id=doc.id,
                                    inherit=False, visibility="admin_only", permission="download"))
    db.commit()

# Categories, files, versions, publishing, access rules and acknowledgements: company_docs.py.
