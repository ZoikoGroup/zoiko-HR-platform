"""Document template engine tables (ZHR-ELT-TPL-001; docs/templates/architecture.md).

Two kinds of table live here:

* Shared content tables: `template_definitions` (the 566-item catalogue), `jurisdiction_packs`, `template_variants`,
  `template_clauses`. Platform rows (owner_organization_id NULL) are visible to every tenant, tenant rows only to their owner.
  The automatic tenant filter (core/privacy/tenant_scope) can only express "organization_id = mine", which would hide every
  platform row, so these tables use `owner_organization_id` and the engine applies the "mine or platform" filter itself
  (`service.visible_to`). They hold template text, never personal data.
* Tenant tables: everything that holds a person, a document or evidence carries a NOT NULL `organization_id` and is
  filtered automatically on every tenant request.

Status columns are plain strings validated in code (portable across SQLite tests and Postgres). Evidence tables
(`decision_receipts`, `document_events`, `document_signatures`, `document_acknowledgements`) are append-only: the ORM refuses
UPDATE/DELETE (see `_append_only`) and the migration adds Postgres triggers that do the same.
"""
from __future__ import annotations

from sqlalchemy import (
    JSON, Boolean, Column, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, event,
)
from sqlalchemy.sql import func, false, true

from app.database import Base


# ── employer side ────────────────────────────────────────────────────────────────────────────────────────────────────

class EmployerEntity(Base):
    """A legal employer inside an organization. Documents are issued in its name (letterhead, signatory, registration)."""
    __tablename__ = "employer_entities"

    id                  = Column(Integer, primary_key=True)
    organization_id     = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    legal_name          = Column(String(255), nullable=True)        # nullable: the backfill never invents a value
    trading_name        = Column(String(255), nullable=True)
    registration_type   = Column(String(40), nullable=True)         # core/business_ids id key: gstin, ein, company_number, abn, uen…
    registration_number = Column(String(100), nullable=True)
    tax_id              = Column(String(100), nullable=True)
    country             = Column(String(2), nullable=True)          # ISO-2
    region              = Column(String(100), nullable=True)
    city                = Column(String(100), nullable=True)
    postal_code         = Column(String(20), nullable=True)
    address_lines       = Column(JSON, nullable=True)               # ["line 1", "line 2"]
    phone               = Column(String(50), nullable=True)
    email               = Column(String(255), nullable=True)
    logo_file           = Column(String(500), nullable=True)        # blank = the organization logo
    is_default          = Column(Boolean, nullable=False, default=False, server_default=false())
    status              = Column(String(20), nullable=False, default="active", server_default="active")
    created_by          = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at          = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at          = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=True)


class AuthorisedSignatory(Base):
    """Who may sign for an employer entity, for which templates, up to which legal risk, and when."""
    __tablename__ = "authorised_signatories"

    id               = Column(Integer, primary_key=True)
    organization_id  = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    entity_id        = Column(Integer, ForeignKey("employer_entities.id"), nullable=False, index=True)
    employee_id      = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    signatory_title  = Column(String(150), nullable=False)
    authority_scope  = Column(JSON, nullable=False)                 # ["ALL"] or family ids ("HR-HIR") / canonical ids ("HR-HIR-011")
    max_risk_level   = Column(String(2), nullable=False, default="L1")
    valid_from       = Column(Date, nullable=False)
    valid_to         = Column(Date, nullable=True)
    approved_by      = Column(Integer, ForeignKey("employees.id"), nullable=False)
    status           = Column(String(20), nullable=False, default="active", server_default="active")
    created_by       = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at       = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at       = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=True)


# ── catalogue and content ────────────────────────────────────────────────────────────────────────────────────────────

class TemplateDefinition(Base):
    """One row per canonical template (HR-DOC-001). Seeded from seeds/template_register.json; 566 rows (gate R0)."""
    __tablename__ = "template_definitions"

    canonical_id      = Column(String(20), primary_key=True)
    family_id         = Column(String(10), nullable=False, index=True)
    title             = Column(String(255), nullable=False)
    kind              = Column(String(30), nullable=False)
    legal_risk        = Column(String(2), nullable=False)
    sensitivity       = Column(String(2), nullable=False)
    lifecycle_trigger = Column(String(120), nullable=True)
    catalogue_status  = Column(String(60), nullable=False, default="BLOCKED_PENDING_JURISDICTION_COUNSEL_SIGNOFF")
    implemented       = Column(Boolean, nullable=False, default=False, server_default=false())
    output_mode       = Column(String(20), nullable=False, default="DOCUMENT")
    execution_mode    = Column(String(20), nullable=False, default="NONE")
    audience          = Column(String(20), nullable=False, default="HR_INTERNAL")
    approval_policy   = Column(String(2), nullable=False, default="L1")
    retention_rule_key = Column(String(60), nullable=True)
    schema_version    = Column(Integer, nullable=False, default=1)
    source_spec       = Column(String(60), nullable=False, default="ZHR-ELT-MSPEC-001 v1.0")
    template_json_ref = Column(String(255), nullable=True)
    updated_at        = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=True)


class JurisdictionPack(Base):
    __tablename__ = "jurisdiction_packs"
    __table_args__ = (Index("ix_jurisdiction_packs_lookup", "country", "region", "status"),)

    id                    = Column(Integer, primary_key=True)
    scope_type            = Column(String(10), nullable=False)       # PLATFORM | TENANT
    owner_organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    country               = Column(String(2), nullable=False)
    region                = Column(String(100), nullable=True)
    status                = Column(String(20), nullable=False, default="DRAFT")
    effective_from        = Column(Date, nullable=True)
    effective_to          = Column(Date, nullable=True)
    signed_off_by_name    = Column(String(200), nullable=True)
    signed_off_by_role    = Column(String(200), nullable=True)
    signed_off_firm       = Column(String(200), nullable=True)
    signed_off_at         = Column(DateTime, nullable=True)
    attested_by           = Column(Integer, nullable=True)          # employees.id of the tenant admin who attested (TENANT packs)
    source_references     = Column(JSON, nullable=True)
    retention_rules       = Column(JSON, nullable=True)             # {retention_rule_key: years}; absent = keep, never auto-flag
    requirements          = Column(JSON, nullable=True)             # data the law requires at onboarding, e.g. {"collect_nationality": true}
    notes                 = Column(Text, nullable=True)
    created_by            = Column(Integer, nullable=True)
    created_at            = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at            = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=True)


class TemplateVariant(Base):
    """Approved content for one canonical template in one pack and language (HR-DOC-004 version history).

    Immutable once it leaves IN_DRAFT: content, field_contract and clause_rules never change; an edit is a new version."""
    __tablename__ = "template_variants"
    __table_args__ = (
        UniqueConstraint("canonical_id", "pack_id", "owner_organization_id", "language", "version", name="uq_template_variant_version"),
        Index("ix_template_variants_lookup", "canonical_id", "pack_id", "status"),
    )

    id                    = Column(Integer, primary_key=True)
    canonical_id          = Column(String(20), ForeignKey("template_definitions.canonical_id"), nullable=False)
    pack_id               = Column(Integer, ForeignKey("jurisdiction_packs.id"), nullable=False)
    owner_organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    language              = Column(String(20), nullable=False, default="en")
    version               = Column(Integer, nullable=False, default=1)
    status                = Column(String(20), nullable=False, default="IN_DRAFT")
    release_mode          = Column(String(20), nullable=False)      # PLATFORM_COUNSEL | TENANT_ATTESTED
    applicability         = Column(JSON, nullable=True)             # {employment_types, worker_categories, regions, entity_ids, cross_border}
    content               = Column(JSON, nullable=False)            # list of blocks (renderer.py)
    field_contract        = Column(JSON, nullable=False)            # {"required": [...], "optional": [...]}
    clause_rules          = Column(JSON, nullable=False)            # {"mandatory": [...], "optional": [...], "prohibited": [...]}
    options               = Column(JSON, nullable=True)             # {employer_signs_first, email_attachment, response_days, reminder_days, expires_days}
    effective_from        = Column(Date, nullable=True)
    effective_to          = Column(Date, nullable=True)
    checksum              = Column(String(64), nullable=True)
    authored_by           = Column(Integer, nullable=True)
    reviewed_by           = Column(Integer, nullable=True)
    released_by           = Column(Integer, nullable=True)
    legal_review          = Column(JSON, nullable=True)             # reviewer name/role/firm/qualification/date/conditions, or the attestation
    change_reason         = Column(Text, nullable=True)
    previous_version_id   = Column(Integer, ForeignKey("template_variants.id"), nullable=True)
    starter_revision      = Column(Integer, nullable=True)          # template_starters.revision this version started from
    change_summary        = Column(Text, nullable=True)             # "what changed" shown to employees (policies)
    minor_change          = Column(Boolean, nullable=False, default=False, server_default=false())   # typo fix: no re-acknowledgement
    status_changed_at     = Column(DateTime, nullable=True)
    created_at            = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at            = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=True)


class TemplateClause(Base):
    """Clause library. Same lifecycle as variants; resolution is tenant ACTIVE → platform ACTIVE → DENY (no global fallback)."""
    __tablename__ = "template_clauses"
    __table_args__ = (
        UniqueConstraint("clause_key", "pack_id", "owner_organization_id", "language", "version", name="uq_template_clause_version"),
        Index("ix_template_clauses_lookup", "clause_key", "pack_id", "status"),
    )

    id                    = Column(Integer, primary_key=True)
    clause_key            = Column(String(80), nullable=False)
    pack_id               = Column(Integer, ForeignKey("jurisdiction_packs.id"), nullable=False)
    owner_organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    language              = Column(String(20), nullable=False, default="en")
    version               = Column(Integer, nullable=False, default=1)
    status                = Column(String(20), nullable=False, default="IN_DRAFT")
    title                 = Column(String(200), nullable=True)
    text                  = Column(Text, nullable=False)
    source_references     = Column(JSON, nullable=True)
    effective_from        = Column(Date, nullable=True)
    effective_to          = Column(Date, nullable=True)
    checksum              = Column(String(64), nullable=True)
    authored_by           = Column(Integer, nullable=True)
    reviewed_by           = Column(Integer, nullable=True)
    released_by           = Column(Integer, nullable=True)
    change_reason         = Column(Text, nullable=True)
    parameters            = Column(JSON, nullable=True)             # machine-checked limits set by the releaser, e.g. {"max_probation_months": 6}
    previous_version_id   = Column(Integer, ForeignKey("template_clauses.id"), nullable=True)
    created_at            = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at            = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=True)


class TemplateStarter(Base):
    """Zoiko starter content for a template (seeds/content/<FAMILY>/<ID>.json). Never ACTIVE, never issued: tenants and Zoiko
    Legal create variants from it. Re-loading changed content adds a revision; existing revisions and variants never change."""
    __tablename__ = "template_starters"
    __table_args__ = (UniqueConstraint("canonical_id", "revision", name="uq_template_starter_revision"),)

    id           = Column(Integer, primary_key=True)
    canonical_id = Column(String(20), ForeignKey("template_definitions.canonical_id"), nullable=False, index=True)
    revision     = Column(Integer, nullable=False)
    checksum     = Column(String(64), nullable=False)
    payload      = Column(JSON, nullable=False)
    source_path  = Column(String(255), nullable=True)
    loaded_at    = Column(DateTime, server_default=func.now(), nullable=False)


class TemplateStarterClause(Base):
    """Starter clause text a tenant can adopt into its own pack (then review and release it like any clause)."""
    __tablename__ = "template_starter_clauses"
    __table_args__ = (UniqueConstraint("clause_key", "revision", name="uq_template_starter_clause_revision"),)

    id         = Column(Integer, primary_key=True)
    clause_key = Column(String(80), nullable=False, index=True)
    revision   = Column(Integer, nullable=False)
    checksum   = Column(String(64), nullable=False)
    title      = Column(String(200), nullable=True)
    text       = Column(Text, nullable=False)
    note       = Column(Text, nullable=True)
    loaded_at  = Column(DateTime, server_default=func.now(), nullable=False)


class TemplateSupersession(Base):
    """HR-DOC-018: a variant suspended, retired or superseded, and what that did to documents in progress."""
    __tablename__ = "template_supersessions"

    id                    = Column(Integer, primary_key=True)
    owner_organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    canonical_id          = Column(String(20), nullable=False)
    old_variant_id        = Column(Integer, ForeignKey("template_variants.id"), nullable=False)
    old_version           = Column(Integer, nullable=False)
    new_variant_id        = Column(Integer, ForeignKey("template_variants.id"), nullable=True)
    new_version           = Column(Integer, nullable=True)
    action                = Column(String(20), nullable=False)       # SUSPENDED | RETIRED | SUPERSEDED
    reason                = Column(Text, nullable=False)
    effective_at          = Column(DateTime, nullable=False)
    decided_by            = Column(Integer, nullable=True)
    affected_in_progress  = Column(Integer, nullable=False, default=0)
    affected_document_ids = Column(JSON, nullable=True)
    issued_unchanged      = Column(Boolean, nullable=False, default=True, server_default=true())
    record_pdf_path       = Column(String(500), nullable=True)
    record_pdf_sha256     = Column(String(64), nullable=True)
    created_at            = Column(DateTime, server_default=func.now(), nullable=False)


class TemplateApprovalRecord(Base):
    """HR-DOC-003: the legal approval (or tenant attestation) of a variant, with its rendered, hashed record."""
    __tablename__ = "template_approval_records"

    id                    = Column(Integer, primary_key=True)
    owner_organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    variant_id            = Column(Integer, ForeignKey("template_variants.id"), nullable=False, index=True)
    variant_checksum      = Column(String(64), nullable=False)
    reviewer_id           = Column(Integer, nullable=True)
    review                = Column(JSON, nullable=False)
    signed_name_typed     = Column(String(200), nullable=True)
    ip_address            = Column(String(45), nullable=True)
    record_pdf_path       = Column(String(500), nullable=True)
    record_pdf_sha256     = Column(String(64), nullable=True)
    created_at            = Column(DateTime, server_default=func.now(), nullable=False)


class DocTemplateSettings(Base):
    """Per-organization switches for the engine."""
    __tablename__ = "doc_template_settings"

    id                         = Column(Integer, primary_key=True)
    organization_id            = Column(Integer, ForeignKey("organizations.id"), nullable=False, unique=True)
    tenant_attestation_enabled = Column(Boolean, nullable=False, default=True, server_default=true())
    prefer_tenant_variants     = Column(Boolean, nullable=False, default=True, server_default=true())
    expiry_warning_days        = Column(Integer, nullable=False, default=30, server_default="30")
    approval_overrides         = Column(JSON, nullable=True)        # {canonical_id or family_id: "L2" | "L3"}, stricter only
    retention_durations        = Column(JSON, nullable=True)        # {retention_rule_key: years}; HR sets them, nothing is defaulted
    automation_rules           = Column(JSON, nullable=True)        # {canonical_id: "off" | "draft" | "auto"}
    updated_by                 = Column(Integer, ForeignKey("employees.id"), nullable=True)
    updated_at                 = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=True)


# ── generated documents and evidence ────────────────────────────────────────────────────────────────────────────────

class DocumentNumberSequence(Base):
    """Gap-free per-organization, per-year counter for document numbers ({ORGCODE}-{YYYY}-{000001})."""
    __tablename__ = "document_number_sequences"
    __table_args__ = (UniqueConstraint("organization_id", "year", name="uq_document_number_sequence"),)

    id              = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    year            = Column(Integer, nullable=False)
    last_value      = Column(Integer, nullable=False, default=0)


class GeneratedDocument(Base):
    __tablename__ = "generated_documents"
    __table_args__ = (
        Index("ix_generated_documents_org_status", "organization_id", "status"),
        Index("ix_generated_documents_subject", "organization_id", "subject_type", "subject_id"),
        Index("uq_generated_documents_idempotency", "organization_id", "idempotency_key", unique=True),
    )

    id                     = Column(Integer, primary_key=True)
    document_number        = Column(String(40), nullable=False, unique=True)
    organization_id        = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    canonical_id           = Column(String(20), ForeignKey("template_definitions.canonical_id"), nullable=False, index=True)
    family_id              = Column(String(10), nullable=False)
    title                  = Column(String(255), nullable=False)
    kind                   = Column(String(30), nullable=False)
    legal_risk             = Column(String(2), nullable=False)
    sensitivity            = Column(String(2), nullable=False)
    output_mode            = Column(String(20), nullable=False)
    execution_mode         = Column(String(20), nullable=False)
    audience               = Column(String(20), nullable=False)
    approval_policy        = Column(String(2), nullable=False)
    variant_id             = Column(Integer, ForeignKey("template_variants.id"), nullable=True)
    variant_version        = Column(Integer, nullable=True)
    variant_checksum       = Column(String(64), nullable=True)
    pack_id                = Column(Integer, ForeignKey("jurisdiction_packs.id"), nullable=True)
    release_mode           = Column(String(20), nullable=True)      # PLATFORM_COUNSEL | TENANT_ATTESTED
    subject_type           = Column(String(20), nullable=False)     # employee | candidate | new_hire | position | org
    subject_id             = Column(Integer, nullable=True)
    source_ref             = Column(String(80), nullable=True)
    language               = Column(String(20), nullable=False, default="en")
    status                 = Column(String(30), nullable=False, default="REQUESTED")
    status_changed_at      = Column(DateTime, nullable=True)
    field_snapshot         = Column(Text, nullable=True)            # JSON; Fernet-encrypted when snapshot_encrypted
    snapshot_encrypted     = Column(Boolean, nullable=False, default=False, server_default=false())
    decision_receipt_id    = Column(Integer, nullable=True)
    rendered_html_path     = Column(String(500), nullable=True)
    pdf_path               = Column(String(500), nullable=True)
    pdf_sha256             = Column(String(64), nullable=True)
    files_encrypted        = Column(Boolean, nullable=False, default=False, server_default=false())
    executed_pdf_path      = Column(String(500), nullable=True)
    executed_pdf_sha256    = Column(String(64), nullable=True)
    recipient_name         = Column(String(200), nullable=True)
    recipient_email        = Column(String(255), nullable=True)
    recipient_employee_id  = Column(Integer, ForeignKey("employees.id"), nullable=True, index=True)
    entity_id              = Column(Integer, ForeignKey("employer_entities.id"), nullable=True)
    requested_by           = Column(Integer, ForeignKey("employees.id"), nullable=False)
    approved_by            = Column(JSON, nullable=True)            # [employee ids]
    issued_by              = Column(Integer, ForeignKey("employees.id"), nullable=True)
    issued_at              = Column(DateTime, nullable=True)
    delivered_via          = Column(String(20), nullable=True)      # email | portal
    delivered_at           = Column(DateTime, nullable=True)
    viewed_at              = Column(DateTime, nullable=True)
    due_by                 = Column(DateTime, nullable=True)
    expires_at             = Column(DateTime, nullable=True)
    reminder_days          = Column(JSON, nullable=True)            # days before due_by to remind
    last_reminded_at       = Column(DateTime, nullable=True)
    retention_until        = Column(Date, nullable=True)
    retention_flagged_at   = Column(DateTime, nullable=True)
    legal_hold             = Column(Boolean, nullable=False, default=False, server_default=false())
    legal_hold_reason      = Column(Text, nullable=True)
    status_before_hold     = Column(String(30), nullable=True)
    corrected_by_document_id = Column(Integer, ForeignKey("generated_documents.id"), nullable=True)
    corrects_document_id   = Column(Integer, ForeignKey("generated_documents.id"), nullable=True)
    signer_name_overrides  = Column(JSON, nullable=True)            # {party: "name accepted by HR"} (audited)
    cancel_reason          = Column(Text, nullable=True)
    distribution_id        = Column(Integer, ForeignKey("policy_distributions.id"), nullable=True, index=True)
    idempotency_key        = Column(String(80), nullable=True)      # client-supplied key: a retried generate returns the same document
    hr_document_id         = Column(Integer, ForeignKey("hr_documents.id"), nullable=True)
    created_at             = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at             = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=True)


class GeneratedDocumentApproval(Base):
    """One step of a document's approval chain (HR-DOC-010)."""
    __tablename__ = "generated_document_approvals"

    id              = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    document_id     = Column(Integer, ForeignKey("generated_documents.id"), nullable=False, index=True)
    step_order      = Column(Integer, nullable=False)
    step_kind       = Column(String(20), nullable=False)            # APPROVER | HR_APPROVER | SIGNATORY
    required_roles  = Column(JSON, nullable=False)
    approver_id     = Column(Integer, ForeignKey("employees.id"), nullable=True)
    approver_role   = Column(String(30), nullable=True)
    decision        = Column(String(20), nullable=False, default="PENDING")   # PENDING | APPROVED | REJECTED
    comment         = Column(Text, nullable=True)
    sod_check       = Column(JSON, nullable=True)                   # {"passed": bool, "rules": [...]}
    decided_at      = Column(DateTime, nullable=True)
    created_at      = Column(DateTime, server_default=func.now(), nullable=False)


class DecisionReceipt(Base):
    """Immutable rule-resolution evidence for one generation request (append-only)."""
    __tablename__ = "decision_receipts"

    id                = Column(Integer, primary_key=True)
    organization_id   = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    document_id       = Column(Integer, ForeignKey("generated_documents.id"), nullable=True, index=True)
    canonical_id      = Column(String(20), nullable=False)
    requested_by      = Column(Integer, ForeignKey("employees.id"), nullable=True)
    source_ref        = Column(String(80), nullable=True, index=True)   # the record that caused the request (blocked attempts too)
    inputs            = Column(JSON, nullable=False)
    resolved_pack_id  = Column(Integer, nullable=True)
    variant_id        = Column(Integer, nullable=True)
    variant_version   = Column(Integer, nullable=True)
    variant_checksum  = Column(String(64), nullable=True)
    clauses           = Column(JSON, nullable=True)                 # [{key, id, version, checksum}]
    steps             = Column(JSON, nullable=False)                # [{step, outcome, detail}]
    reasons           = Column(JSON, nullable=True)                 # ["MISSING_FIELD:worker.full_name", ...]
    outcome           = Column(String(30), nullable=False)          # ALLOW | DENY | NEEDS_LEGAL_REVIEW
    engine_version    = Column(String(20), nullable=False)
    created_at        = Column(DateTime, server_default=func.now(), nullable=False)


class DocumentSignature(Base):
    __tablename__ = "document_signatures"

    id                      = Column(Integer, primary_key=True)
    organization_id         = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    document_id             = Column(Integer, ForeignKey("generated_documents.id"), nullable=False, index=True)
    signer_party            = Column(String(20), nullable=False)    # employer | employee | candidate | witness | reviewer
    signer_employee_id      = Column(Integer, ForeignKey("employees.id"), nullable=True)
    signer_email            = Column(String(255), nullable=True)
    signer_name_typed       = Column(String(200), nullable=True)
    signature_method        = Column(String(10), nullable=True)     # TYPED | DRAWN
    signature_image_path    = Column(String(500), nullable=True)
    consent_text_version    = Column(String(20), nullable=True)
    otp_verified_at         = Column(DateTime, nullable=True)
    ip_address              = Column(String(45), nullable=True)
    user_agent              = Column(String(400), nullable=True)
    signed_document_sha256  = Column(String(64), nullable=False)
    signed_at               = Column(DateTime, nullable=False)
    decision                = Column(String(10), nullable=False)    # SIGNED | DECLINED
    decline_reason          = Column(Text, nullable=True)


class DocumentAcknowledgement(Base):
    """Receipt-and-read confirmation. Never a signature, never consent (separate tables, separate wording)."""
    __tablename__ = "document_acknowledgements"

    id                         = Column(Integer, primary_key=True)
    organization_id            = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    document_id                = Column(Integer, ForeignKey("generated_documents.id"), nullable=False, index=True)
    employee_id                = Column(Integer, ForeignKey("employees.id"), nullable=False)
    acknowledgement_text_version = Column(String(20), nullable=False)
    document_sha256            = Column(String(64), nullable=False)
    acknowledged_at            = Column(DateTime, nullable=False)
    ip_address                 = Column(String(45), nullable=True)
    user_agent                 = Column(String(400), nullable=True)
    assignment_id              = Column(Integer, ForeignKey("document_assignments.id"), nullable=True)


class DocumentEvent(Base):
    """Per-document timeline. IDs, statuses and timestamps only, never document contents."""
    __tablename__ = "document_events"

    id              = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    document_id     = Column(Integer, ForeignKey("generated_documents.id"), nullable=False, index=True)
    event_type      = Column(String(40), nullable=False)
    actor_type      = Column(String(20), nullable=False, default="employee")   # employee | candidate | system
    actor_id        = Column(Integer, nullable=True)
    detail          = Column(JSON, nullable=True)
    created_at      = Column(DateTime, nullable=False)


class DocumentSignOtp(Base):
    """E-mail one-time code that guards a signature. Only a hash is stored."""
    __tablename__ = "document_sign_otps"

    id              = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    document_id     = Column(Integer, ForeignKey("generated_documents.id"), nullable=False, index=True)
    signer_party    = Column(String(20), nullable=False)
    signer_key      = Column(String(255), nullable=False)           # "employee:<id>" or the candidate e-mail
    code_hash       = Column(String(64), nullable=False)
    expires_at      = Column(DateTime, nullable=False)
    attempts        = Column(Integer, nullable=False, default=0)
    verified_at     = Column(DateTime, nullable=True)
    consumed_at     = Column(DateTime, nullable=True)
    created_at      = Column(DateTime, server_default=func.now(), nullable=False)


class PolicyDistribution(Base):
    """HR-DOC-014: one publication of a policy to an audience."""
    __tablename__ = "policy_distributions"

    id                       = Column(Integer, primary_key=True)
    organization_id          = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    canonical_id             = Column(String(20), ForeignKey("template_definitions.canonical_id"), nullable=False)
    variant_id               = Column(Integer, ForeignKey("template_variants.id"), nullable=True)
    version                  = Column(Integer, nullable=True)
    variant_checksum         = Column(String(64), nullable=True)
    title                    = Column(String(255), nullable=False)
    audience                 = Column(JSON, nullable=False)          # {"type": "all"|"departments"|..., "ids": [...]}
    requires                 = Column(String(20), nullable=False, default="ACKNOWLEDGE")   # ACKNOWLEDGE | SIGN
    due_date                 = Column(Date, nullable=True)
    reminder_days            = Column(JSON, nullable=True)
    auto_include_new_joiners = Column(Boolean, nullable=False, default=True, server_default=true())
    status                   = Column(String(20), nullable=False, default="DRAFT")         # DRAFT | PUBLISHED | CLOSED
    published_by             = Column(Integer, ForeignKey("employees.id"), nullable=True)
    published_at             = Column(DateTime, nullable=True)
    closed_at                = Column(DateTime, nullable=True)
    stats                    = Column(JSON, nullable=True)
    last_results             = Column(JSON, nullable=True)           # per-recipient preflight outcome of the last run (ids + codes)
    previous_distribution_id = Column(Integer, ForeignKey("policy_distributions.id"), nullable=True)   # re-acknowledgement campaign
    kb_source_id             = Column(Integer, nullable=True)        # knowledge_sources.id holding this version's text for Mira
    kb_sync_status           = Column(String(20), nullable=True)     # SYNCED | FAILED | RETIRED
    kb_synced_at             = Column(DateTime, nullable=True)
    created_by               = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at               = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at               = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=True)


class DocumentExpiryItem(Base):
    """HR-DOC-016: something that expires soon and needs a decision."""
    __tablename__ = "document_expiry_items"
    __table_args__ = (UniqueConstraint("organization_id", "item_type", "ref_id", "expiry_date", name="uq_document_expiry_item"),)

    id                = Column(Integer, primary_key=True)
    organization_id   = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    item_type         = Column(String(20), nullable=False)          # generated_document | hr_document | template_variant
    ref_id            = Column(Integer, nullable=False)
    title             = Column(String(255), nullable=False)
    owner_employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    expiry_date       = Column(Date, nullable=False)
    action_required   = Column(String(255), nullable=False)
    status            = Column(String(20), nullable=False, default="OPEN")         # OPEN | RENEWED | WAIVED
    resolution_note   = Column(Text, nullable=True)
    resolved_by       = Column(Integer, ForeignKey("employees.id"), nullable=True)
    resolved_at       = Column(DateTime, nullable=True)
    created_at        = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at        = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=True)


class DocumentBulkRun(Base):
    """One bulk generation: the same template for many subjects. Produces drafts only (never issues), with a per-subject
    preflight result, so HR always sees every outcome before anything is issued."""
    __tablename__ = "document_bulk_runs"

    id              = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    canonical_id    = Column(String(20), ForeignKey("template_definitions.canonical_id"), nullable=False)
    subject_type    = Column(String(20), nullable=False)
    subject_ids     = Column(JSON, nullable=False)
    requested_by    = Column(Integer, ForeignKey("employees.id"), nullable=False)
    status          = Column(String(20), nullable=False, default="RUNNING")      # RUNNING | DONE | FAILED
    results         = Column(JSON, nullable=True)                               # [{subject_id, outcome, document_id, reasons}]
    created_at      = Column(DateTime, server_default=func.now(), nullable=False)
    finished_at     = Column(DateTime, nullable=True)


# ── append-only guard (the migration adds the same rule as Postgres triggers) ────────────────────────────────────────

class AppendOnlyViolation(RuntimeError):
    pass


def _append_only(mapper, connection, target):
    raise AppendOnlyViolation(f"{target.__tablename__} is append-only")


for _model in (DecisionReceipt, DocumentEvent, DocumentSignature, DocumentAcknowledgement):
    event.listen(_model, "before_update", _append_only)
    event.listen(_model, "before_delete", _append_only)


class ImmutableContentViolation(RuntimeError):
    pass


def _frozen_content(fields):
    def guard(mapper, connection, target):
        from sqlalchemy import inspect as sa_inspect
        state = sa_inspect(target)
        status_hist = state.attrs.status.history
        was = status_hist.deleted[0] if status_hist.deleted else target.status
        if was == "IN_DRAFT":
            return
        for name in fields:
            if state.attrs[name].history.has_changes():
                raise ImmutableContentViolation(f"{target.__tablename__}.{name} cannot change after IN_DRAFT; create a new version")
    return guard


event.listen(TemplateVariant, "before_update", _frozen_content(("content", "field_contract", "clause_rules", "canonical_id", "pack_id", "language", "version")))
event.listen(TemplateClause, "before_update", _frozen_content(("text", "clause_key", "pack_id", "language", "version")))
