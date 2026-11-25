"""Tables for "Set up docs for your organisation" and the customer's control over the onboarding package.

Every table carries organization_id (filtered automatically on tenant requests, core/privacy/tenant_scope) and is classified
in core/privacy/classification.py, so scripts/privacy_apply_rls.py gives it the row-level security policy of every tenant table.

* org_package_documents           which documents are in the organisation's package, in what order, mode and audience
* org_form_overrides              per-organisation changes to the portal forms (HR-ONB-001 / HR-ONB-003)
* org_document_request_categories the upload categories new hires are asked for (replaces the fixed list)
* docs_setup_sessions / files / proposals   one run of the setup wizard, its uploads and every proposed change
"""
from __future__ import annotations

from sqlalchemy import JSON, Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.sql import false, func, true

from app.database import Base


class OrgPackageDocument(Base):
    __tablename__ = "org_package_documents"
    __table_args__ = (UniqueConstraint("organization_id", "canonical_id", name="uq_org_package_document"),
                      Index("ix_org_package_documents_org_order", "organization_id", "sort_order"))

    id                        = Column(Integer, primary_key=True)
    organization_id           = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    source                    = Column(String(20), nullable=False, default="platform")     # platform | org_template
    category                  = Column(String(100), nullable=False)                         # platform: offer_letter …; org: org:<canonical_id>
    canonical_id              = Column(String(20), nullable=False)                          # PKG-HR-HIR-011 / the organisation's template id
    title                     = Column(String(255), nullable=True)                          # org documents: the template's title
    variant_id                = Column(Integer, ForeignKey("template_variants.id"), nullable=True)   # pinned version (null = resolve)
    mode                      = Column(String(20), nullable=False)                          # SIGN | ACKNOWLEDGE | COMPLETE | VOLUNTARY | INFO
    enabled                   = Column(Boolean, nullable=False, default=True, server_default=true())
    mandatory                 = Column(Boolean, nullable=False, default=False, server_default=false())   # system-set
    applies_to_engagement_slugs = Column(JSON, nullable=True)                               # [] / null = every engagement profile
    excluded_engagement_slugs = Column(JSON, nullable=True)
    signers                   = Column(JSON, nullable=True)                                 # ["employer", "candidate", ...]
    sort_order                = Column(Integer, nullable=False, default=0)
    conditions                = Column(JSON, nullable=True)                                 # [{field, op, value}] all must hold; null = every hire
    send_when                 = Column(String(30), nullable=True)                           # manual | hire_created | details_submitted | days_before_start
    send_days_before          = Column(Integer, nullable=True)                              # days_before_start: days before the start date
    created_by_session_id     = Column(Integer, nullable=True)                              # docs setup session that added it
    updated_by                = Column(Integer, ForeignKey("employees.id"), nullable=True)
    updated_at                = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=True)


class OrgFormOverride(Base):
    __tablename__ = "org_form_overrides"
    __table_args__ = (UniqueConstraint("organization_id", "canonical_id", name="uq_org_form_override"),)

    id              = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    canonical_id    = Column(String(20), nullable=False)                                     # HR-ONB-001 | HR-ONB-003
    hidden_keys     = Column(JSON, nullable=True)
    added_fields    = Column(JSON, nullable=True)                                            # [{key, label, help, required, type, options, rule, classification}]
    field_order     = Column(JSON, nullable=True)
    version         = Column(Integer, nullable=False, default=1)
    updated_by      = Column(Integer, ForeignKey("employees.id"), nullable=True)
    updated_at      = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=True)


class OrgDocumentRequestCategory(Base):
    __tablename__ = "org_document_request_categories"
    __table_args__ = (UniqueConstraint("organization_id", "key", name="uq_org_document_request_category"),)

    id                 = Column(Integer, primary_key=True)
    organization_id    = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    key                = Column(String(60), nullable=False)
    label              = Column(String(120), nullable=False)
    description        = Column(String(500), nullable=True)
    required_by_default = Column(Boolean, nullable=False, default=False, server_default=false())
    accepted_types     = Column(JSON, nullable=True)                                         # ["pdf", "jpg", "png", "docx"]
    max_size_mb        = Column(Integer, nullable=False, default=10)
    sort_order         = Column(Integer, nullable=False, default=0)
    active             = Column(Boolean, nullable=False, default=True, server_default=true())
    is_system          = Column(Boolean, nullable=False, default=False, server_default=false())
    created_by_session_id = Column(Integer, nullable=True)
    created_at         = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at         = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=True)


class DocsSetupSession(Base):
    __tablename__ = "docs_setup_sessions"

    id                       = Column(Integer, primary_key=True)
    organization_id          = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    created_by               = Column(Integer, ForeignKey("employees.id"), nullable=True)
    status                   = Column(String(20), nullable=False, default="uploading")   # uploading|analysing|review|applying|applied|cancelled|failed
    step                     = Column(Integer, nullable=False, default=1)
    progress                 = Column(JSON, nullable=True)                                # {"files": {id: pct}, "message": str}
    ai_used                  = Column(Boolean, nullable=False, default=False, server_default=false())
    settings_snapshot_before = Column(Text, nullable=True)                                # JSON, Fernet-encrypted
    applied_summary          = Column(JSON, nullable=True)                                # what Apply created/changed (for undo)
    idempotency_key          = Column(String(80), nullable=True)
    applied_at               = Column(DateTime, nullable=True)
    applied_by               = Column(Integer, ForeignKey("employees.id"), nullable=True)
    undone_at                = Column(DateTime, nullable=True)
    error                    = Column(Text, nullable=True)
    created_at               = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at               = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=True)


class DocsSetupFile(Base):
    __tablename__ = "docs_setup_files"

    id                = Column(Integer, primary_key=True)
    session_id        = Column(Integer, ForeignKey("docs_setup_sessions.id"), nullable=False, index=True)
    organization_id   = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    filename          = Column(String(255), nullable=False)
    label             = Column(String(30), nullable=True)                                     # offer_letter|contract|handbook|policy|form|other
    media_type        = Column(String(100), nullable=False)
    size              = Column(Integer, nullable=False)
    sha256            = Column(String(64), nullable=False)
    storage_key       = Column(String(500), nullable=False)                                   # encrypted document store
    page_count        = Column(Integer, nullable=True)
    scan_status       = Column(String(20), nullable=False, default="pending")                 # pending|clean|rejected
    extract_status    = Column(String(20), nullable=False, default="pending")                 # pending|done|failed
    chunks_key        = Column(String(500), nullable=True)                                    # extracted text chunks (encrypted store)
    detected_kind     = Column(String(40), nullable=True)
    kind_confidence   = Column(Float, nullable=True)
    detected_language = Column(String(10), nullable=True)
    warnings          = Column(JSON, nullable=True)                                           # ["injection_attempt", "ocr_used", ...]
    mapping           = Column(JSON, nullable=True)                                           # Step 4 decision
    delete_after      = Column(DateTime, nullable=True)
    deleted_at        = Column(DateTime, nullable=True)
    created_at        = Column(DateTime, server_default=func.now(), nullable=False)


class DocsSetupProposal(Base):
    __tablename__ = "docs_setup_proposals"
    __table_args__ = (Index("ix_docs_setup_proposals_session_target", "session_id", "target"),)

    id              = Column(Integer, primary_key=True)
    session_id      = Column(Integer, ForeignKey("docs_setup_sessions.id"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    target          = Column(String(30), nullable=False)       # company_profile|engagement_profile|role_profile|clause|package_document|template|form_field|request_category|offer_setting
    target_key      = Column(String(120), nullable=False)
    label           = Column(String(255), nullable=True)
    proposed_value  = Column(JSON, nullable=True)
    current_value   = Column(JSON, nullable=True)
    confidence      = Column(Float, nullable=False, default=0.5)
    sources         = Column(JSON, nullable=True)              # [{file_id, page, paragraph, quote}]
    conflict_group  = Column(String(140), nullable=True)
    problem         = Column(String(500), nullable=True)       # "needs attention": the validator's message
    origin          = Column(String(20), nullable=False, default="rules")   # rules | ai
    decision        = Column(String(20), nullable=False, default="pending")  # pending|accepted|edited|rejected
    final_value     = Column(JSON, nullable=True)
    decided_by      = Column(Integer, ForeignKey("employees.id"), nullable=True)
    decided_at      = Column(DateTime, nullable=True)
    created_at      = Column(DateTime, server_default=func.now(), nullable=False)
