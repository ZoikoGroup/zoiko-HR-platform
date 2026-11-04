"""doc_templates Phase 2: template engine tables, the 566-item catalogue, research packs and evidence triggers

Revision ID: d7e1a0b2c3f5
Revises: d7e1a0b2c3f4
Create Date: 2026-10-21

* Catalogue and content: template_definitions, jurisdiction_packs, template_variants, template_clauses,
  template_supersessions (HR-DOC-018), template_approval_records (HR-DOC-003), doc_template_settings.
* Documents and evidence: document_number_sequences, generated_documents, generated_document_approvals, decision_receipts,
  document_signatures, document_acknowledgements, document_events, document_sign_otps, policy_distributions,
  document_expiry_items, document_bulk_runs.
* Seeds template_definitions from app/modules/doc_templates/seeds/template_register.json (566 rows, gate R0), and four
  PLATFORM jurisdiction packs GB, US, AU, SG with status SUSPENDED ("research seed only — not activated"). Nothing is
  activated by this migration.
* Postgres only: append-only triggers on decision_receipts, document_events, document_signatures, document_acknowledgements,
  and immutability triggers on template_variants / template_clauses content once they leave IN_DRAFT.

After upgrading, run scripts/privacy_apply_rls.py (new tenant tables) as for every table-adding migration.
"""
from datetime import datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d7e1a0b2c3f5"
down_revision: Union[str, Sequence[str], None] = "d7e1a0b2c3f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

APPEND_ONLY = ("decision_receipts", "document_events", "document_signatures", "document_acknowledgements")
TABLES = (
    "template_definitions", "jurisdiction_packs", "template_variants", "template_clauses", "template_supersessions",
    "template_approval_records", "doc_template_settings", "document_number_sequences", "policy_distributions",
    "generated_documents", "generated_document_approvals", "decision_receipts", "document_signatures",
    "document_acknowledgements", "document_events", "document_sign_otps", "document_expiry_items", "document_bulk_runs",
)
RESEARCH_PACKS = [
    ("GB", [{"title": "Written statement of employment particulars", "url": "https://www.gov.uk/employment-contracts-and-conditions/written-statement-of-employment-particulars"}]),
    ("US", [{"title": "Form I-9 employment eligibility verification", "url": "https://www.uscis.gov/i-9"},
            {"title": "FMLA forms", "url": "https://www.dol.gov/agencies/whd/fmla/forms"}]),
    ("AU", [{"title": "Fair Work information statements", "url": "https://www.fairwork.gov.au/employment-conditions/information-statements"}]),
    ("SG", [{"title": "Key Employment Terms", "url": "https://www.mom.gov.sg/employment-practices/contract-of-service/key-employment-terms"},
            {"title": "Itemised payslips (Zoiko Payroll output, outside the HR catalogue)", "url": "https://www.mom.gov.sg/employment-practices/salary/itemised-payslips"}]),
]


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table("template_definitions"):
        op.create_table(
            "template_definitions",
            sa.Column("canonical_id", sa.String(20), primary_key=True),
            sa.Column("family_id", sa.String(10), nullable=False),
            sa.Column("title", sa.String(255), nullable=False),
            sa.Column("kind", sa.String(30), nullable=False),
            sa.Column("legal_risk", sa.String(2), nullable=False),
            sa.Column("sensitivity", sa.String(2), nullable=False),
            sa.Column("lifecycle_trigger", sa.String(120), nullable=True),
            sa.Column("catalogue_status", sa.String(60), nullable=False),
            sa.Column("implemented", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("output_mode", sa.String(20), nullable=False),
            sa.Column("execution_mode", sa.String(20), nullable=False),
            sa.Column("audience", sa.String(20), nullable=False),
            sa.Column("approval_policy", sa.String(2), nullable=False),
            sa.Column("retention_rule_key", sa.String(60), nullable=True),
            sa.Column("schema_version", sa.Integer(), nullable=False),
            sa.Column("source_spec", sa.String(60), nullable=False),
            sa.Column("template_json_ref", sa.String(255), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
        )
        op.create_index("ix_template_definitions_family_id", "template_definitions", ["family_id"])
    if not insp.has_table("jurisdiction_packs"):
        op.create_table(
            "jurisdiction_packs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("scope_type", sa.String(10), nullable=False),
            sa.Column("owner_organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=True),
            sa.Column("country", sa.String(2), nullable=False),
            sa.Column("region", sa.String(100), nullable=True),
            sa.Column("status", sa.String(20), nullable=False),
            sa.Column("effective_from", sa.Date(), nullable=True),
            sa.Column("effective_to", sa.Date(), nullable=True),
            sa.Column("signed_off_by_name", sa.String(200), nullable=True),
            sa.Column("signed_off_by_role", sa.String(200), nullable=True),
            sa.Column("signed_off_firm", sa.String(200), nullable=True),
            sa.Column("signed_off_at", sa.DateTime(), nullable=True),
            sa.Column("attested_by", sa.Integer(), nullable=True),
            sa.Column("source_references", sa.JSON(), nullable=True),
            sa.Column("retention_rules", sa.JSON(), nullable=True),
            sa.Column("notes", sa.String(None), nullable=True),
            sa.Column("created_by", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
        )
        op.create_index("ix_jurisdiction_packs_lookup", "jurisdiction_packs", ["country", "region", "status"])
        op.create_index("ix_jurisdiction_packs_owner_organization_id", "jurisdiction_packs", ["owner_organization_id"])
    if not insp.has_table("template_variants"):
        op.create_table(
            "template_variants",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("canonical_id", sa.String(20), sa.ForeignKey("template_definitions.canonical_id"), nullable=False),
            sa.Column("pack_id", sa.Integer(), sa.ForeignKey("jurisdiction_packs.id"), nullable=False),
            sa.Column("owner_organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=True),
            sa.Column("language", sa.String(20), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(20), nullable=False),
            sa.Column("release_mode", sa.String(20), nullable=False),
            sa.Column("applicability", sa.JSON(), nullable=True),
            sa.Column("content", sa.JSON(), nullable=False),
            sa.Column("field_contract", sa.JSON(), nullable=False),
            sa.Column("clause_rules", sa.JSON(), nullable=False),
            sa.Column("options", sa.JSON(), nullable=True),
            sa.Column("effective_from", sa.Date(), nullable=True),
            sa.Column("effective_to", sa.Date(), nullable=True),
            sa.Column("checksum", sa.String(64), nullable=True),
            sa.Column("authored_by", sa.Integer(), nullable=True),
            sa.Column("reviewed_by", sa.Integer(), nullable=True),
            sa.Column("released_by", sa.Integer(), nullable=True),
            sa.Column("legal_review", sa.JSON(), nullable=True),
            sa.Column("change_reason", sa.String(None), nullable=True),
            sa.Column("previous_version_id", sa.Integer(), sa.ForeignKey("template_variants.id"), nullable=True),
            sa.Column("status_changed_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
            sa.UniqueConstraint("canonical_id", "pack_id", "owner_organization_id", "language", "version", name="uq_template_variant_version"),
        )
        op.create_index("ix_template_variants_lookup", "template_variants", ["canonical_id", "pack_id", "status"])
        op.create_index("ix_template_variants_owner_organization_id", "template_variants", ["owner_organization_id"])
    if not insp.has_table("template_clauses"):
        op.create_table(
            "template_clauses",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("clause_key", sa.String(80), nullable=False),
            sa.Column("pack_id", sa.Integer(), sa.ForeignKey("jurisdiction_packs.id"), nullable=False),
            sa.Column("owner_organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=True),
            sa.Column("language", sa.String(20), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(20), nullable=False),
            sa.Column("title", sa.String(200), nullable=True),
            sa.Column("text", sa.String(None), nullable=False),
            sa.Column("source_references", sa.JSON(), nullable=True),
            sa.Column("effective_from", sa.Date(), nullable=True),
            sa.Column("effective_to", sa.Date(), nullable=True),
            sa.Column("checksum", sa.String(64), nullable=True),
            sa.Column("authored_by", sa.Integer(), nullable=True),
            sa.Column("reviewed_by", sa.Integer(), nullable=True),
            sa.Column("released_by", sa.Integer(), nullable=True),
            sa.Column("change_reason", sa.String(None), nullable=True),
            sa.Column("previous_version_id", sa.Integer(), sa.ForeignKey("template_clauses.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
            sa.UniqueConstraint("clause_key", "pack_id", "owner_organization_id", "language", "version", name="uq_template_clause_version"),
        )
        op.create_index("ix_template_clauses_lookup", "template_clauses", ["clause_key", "pack_id", "status"])
        op.create_index("ix_template_clauses_owner_organization_id", "template_clauses", ["owner_organization_id"])
    if not insp.has_table("template_supersessions"):
        op.create_table(
            "template_supersessions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("owner_organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=True),
            sa.Column("canonical_id", sa.String(20), nullable=False),
            sa.Column("old_variant_id", sa.Integer(), sa.ForeignKey("template_variants.id"), nullable=False),
            sa.Column("old_version", sa.Integer(), nullable=False),
            sa.Column("new_variant_id", sa.Integer(), sa.ForeignKey("template_variants.id"), nullable=True),
            sa.Column("new_version", sa.Integer(), nullable=True),
            sa.Column("action", sa.String(20), nullable=False),
            sa.Column("reason", sa.String(None), nullable=False),
            sa.Column("effective_at", sa.DateTime(), nullable=False),
            sa.Column("decided_by", sa.Integer(), nullable=True),
            sa.Column("affected_in_progress", sa.Integer(), nullable=False),
            sa.Column("affected_document_ids", sa.JSON(), nullable=True),
            sa.Column("issued_unchanged", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("record_pdf_path", sa.String(500), nullable=True),
            sa.Column("record_pdf_sha256", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_template_supersessions_owner_organization_id", "template_supersessions", ["owner_organization_id"])
    if not insp.has_table("template_approval_records"):
        op.create_table(
            "template_approval_records",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("owner_organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=True),
            sa.Column("variant_id", sa.Integer(), sa.ForeignKey("template_variants.id"), nullable=False),
            sa.Column("variant_checksum", sa.String(64), nullable=False),
            sa.Column("reviewer_id", sa.Integer(), nullable=True),
            sa.Column("review", sa.JSON(), nullable=False),
            sa.Column("signed_name_typed", sa.String(200), nullable=True),
            sa.Column("ip_address", sa.String(45), nullable=True),
            sa.Column("record_pdf_path", sa.String(500), nullable=True),
            sa.Column("record_pdf_sha256", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_template_approval_records_owner_organization_id", "template_approval_records", ["owner_organization_id"])
        op.create_index("ix_template_approval_records_variant_id", "template_approval_records", ["variant_id"])
    if not insp.has_table("doc_template_settings"):
        op.create_table(
            "doc_template_settings",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False, unique=True),
            sa.Column("tenant_attestation_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("prefer_tenant_variants", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("expiry_warning_days", sa.Integer(), nullable=False, server_default="30"),
            sa.Column("approval_overrides", sa.JSON(), nullable=True),
            sa.Column("updated_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
        )
    if not insp.has_table("document_number_sequences"):
        op.create_table(
            "document_number_sequences",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("year", sa.Integer(), nullable=False),
            sa.Column("last_value", sa.Integer(), nullable=False),
            sa.UniqueConstraint("organization_id", "year", name="uq_document_number_sequence"),
        )
    if not insp.has_table("policy_distributions"):
        op.create_table(
            "policy_distributions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("canonical_id", sa.String(20), sa.ForeignKey("template_definitions.canonical_id"), nullable=False),
            sa.Column("variant_id", sa.Integer(), sa.ForeignKey("template_variants.id"), nullable=True),
            sa.Column("version", sa.Integer(), nullable=True),
            sa.Column("variant_checksum", sa.String(64), nullable=True),
            sa.Column("title", sa.String(255), nullable=False),
            sa.Column("audience", sa.JSON(), nullable=False),
            sa.Column("requires", sa.String(20), nullable=False),
            sa.Column("due_date", sa.Date(), nullable=True),
            sa.Column("reminder_days", sa.JSON(), nullable=True),
            sa.Column("auto_include_new_joiners", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("status", sa.String(20), nullable=False),
            sa.Column("published_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("published_at", sa.DateTime(), nullable=True),
            sa.Column("closed_at", sa.DateTime(), nullable=True),
            sa.Column("stats", sa.JSON(), nullable=True),
            sa.Column("last_results", sa.JSON(), nullable=True),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
        )
        op.create_index("ix_policy_distributions_organization_id", "policy_distributions", ["organization_id"])
    if not insp.has_table("generated_documents"):
        op.create_table(
            "generated_documents",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("document_number", sa.String(40), nullable=False, unique=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("canonical_id", sa.String(20), sa.ForeignKey("template_definitions.canonical_id"), nullable=False),
            sa.Column("family_id", sa.String(10), nullable=False),
            sa.Column("title", sa.String(255), nullable=False),
            sa.Column("kind", sa.String(30), nullable=False),
            sa.Column("legal_risk", sa.String(2), nullable=False),
            sa.Column("sensitivity", sa.String(2), nullable=False),
            sa.Column("output_mode", sa.String(20), nullable=False),
            sa.Column("execution_mode", sa.String(20), nullable=False),
            sa.Column("audience", sa.String(20), nullable=False),
            sa.Column("approval_policy", sa.String(2), nullable=False),
            sa.Column("variant_id", sa.Integer(), sa.ForeignKey("template_variants.id"), nullable=True),
            sa.Column("variant_version", sa.Integer(), nullable=True),
            sa.Column("variant_checksum", sa.String(64), nullable=True),
            sa.Column("pack_id", sa.Integer(), sa.ForeignKey("jurisdiction_packs.id"), nullable=True),
            sa.Column("release_mode", sa.String(20), nullable=True),
            sa.Column("subject_type", sa.String(20), nullable=False),
            sa.Column("subject_id", sa.Integer(), nullable=True),
            sa.Column("source_ref", sa.String(80), nullable=True),
            sa.Column("language", sa.String(20), nullable=False),
            sa.Column("status", sa.String(30), nullable=False),
            sa.Column("status_changed_at", sa.DateTime(), nullable=True),
            sa.Column("field_snapshot", sa.String(None), nullable=True),
            sa.Column("snapshot_encrypted", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("decision_receipt_id", sa.Integer(), nullable=True),
            sa.Column("rendered_html_path", sa.String(500), nullable=True),
            sa.Column("pdf_path", sa.String(500), nullable=True),
            sa.Column("pdf_sha256", sa.String(64), nullable=True),
            sa.Column("files_encrypted", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("executed_pdf_path", sa.String(500), nullable=True),
            sa.Column("executed_pdf_sha256", sa.String(64), nullable=True),
            sa.Column("recipient_name", sa.String(200), nullable=True),
            sa.Column("recipient_email", sa.String(255), nullable=True),
            sa.Column("recipient_employee_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("entity_id", sa.Integer(), sa.ForeignKey("employer_entities.id"), nullable=True),
            sa.Column("requested_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
            sa.Column("approved_by", sa.JSON(), nullable=True),
            sa.Column("issued_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("issued_at", sa.DateTime(), nullable=True),
            sa.Column("delivered_via", sa.String(20), nullable=True),
            sa.Column("delivered_at", sa.DateTime(), nullable=True),
            sa.Column("viewed_at", sa.DateTime(), nullable=True),
            sa.Column("due_by", sa.DateTime(), nullable=True),
            sa.Column("expires_at", sa.DateTime(), nullable=True),
            sa.Column("reminder_days", sa.JSON(), nullable=True),
            sa.Column("last_reminded_at", sa.DateTime(), nullable=True),
            sa.Column("retention_until", sa.Date(), nullable=True),
            sa.Column("retention_flagged_at", sa.DateTime(), nullable=True),
            sa.Column("legal_hold", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("legal_hold_reason", sa.String(None), nullable=True),
            sa.Column("status_before_hold", sa.String(30), nullable=True),
            sa.Column("corrected_by_document_id", sa.Integer(), sa.ForeignKey("generated_documents.id"), nullable=True),
            sa.Column("corrects_document_id", sa.Integer(), sa.ForeignKey("generated_documents.id"), nullable=True),
            sa.Column("signer_name_overrides", sa.JSON(), nullable=True),
            sa.Column("cancel_reason", sa.String(None), nullable=True),
            sa.Column("distribution_id", sa.Integer(), sa.ForeignKey("policy_distributions.id"), nullable=True),
            sa.Column("hr_document_id", sa.Integer(), sa.ForeignKey("hr_documents.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
        )
        op.create_index("ix_generated_documents_canonical_id", "generated_documents", ["canonical_id"])
        op.create_index("ix_generated_documents_distribution_id", "generated_documents", ["distribution_id"])
        op.create_index("ix_generated_documents_org_status", "generated_documents", ["organization_id", "status"])
        op.create_index("ix_generated_documents_organization_id", "generated_documents", ["organization_id"])
        op.create_index("ix_generated_documents_recipient_employee_id", "generated_documents", ["recipient_employee_id"])
        op.create_index("ix_generated_documents_subject", "generated_documents", ["organization_id", "subject_type", "subject_id"])
    if not insp.has_table("generated_document_approvals"):
        op.create_table(
            "generated_document_approvals",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("document_id", sa.Integer(), sa.ForeignKey("generated_documents.id"), nullable=False),
            sa.Column("step_order", sa.Integer(), nullable=False),
            sa.Column("step_kind", sa.String(20), nullable=False),
            sa.Column("required_roles", sa.JSON(), nullable=False),
            sa.Column("approver_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("approver_role", sa.String(30), nullable=True),
            sa.Column("decision", sa.String(20), nullable=False),
            sa.Column("comment", sa.String(None), nullable=True),
            sa.Column("sod_check", sa.JSON(), nullable=True),
            sa.Column("decided_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_generated_document_approvals_document_id", "generated_document_approvals", ["document_id"])
        op.create_index("ix_generated_document_approvals_organization_id", "generated_document_approvals", ["organization_id"])
    if not insp.has_table("decision_receipts"):
        op.create_table(
            "decision_receipts",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("document_id", sa.Integer(), sa.ForeignKey("generated_documents.id"), nullable=True),
            sa.Column("canonical_id", sa.String(20), nullable=False),
            sa.Column("requested_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("inputs", sa.JSON(), nullable=False),
            sa.Column("resolved_pack_id", sa.Integer(), nullable=True),
            sa.Column("variant_id", sa.Integer(), nullable=True),
            sa.Column("variant_version", sa.Integer(), nullable=True),
            sa.Column("variant_checksum", sa.String(64), nullable=True),
            sa.Column("clauses", sa.JSON(), nullable=True),
            sa.Column("steps", sa.JSON(), nullable=False),
            sa.Column("reasons", sa.JSON(), nullable=True),
            sa.Column("outcome", sa.String(30), nullable=False),
            sa.Column("engine_version", sa.String(20), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_decision_receipts_document_id", "decision_receipts", ["document_id"])
        op.create_index("ix_decision_receipts_organization_id", "decision_receipts", ["organization_id"])
    if not insp.has_table("document_signatures"):
        op.create_table(
            "document_signatures",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("document_id", sa.Integer(), sa.ForeignKey("generated_documents.id"), nullable=False),
            sa.Column("signer_party", sa.String(20), nullable=False),
            sa.Column("signer_employee_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("signer_email", sa.String(255), nullable=True),
            sa.Column("signer_name_typed", sa.String(200), nullable=True),
            sa.Column("signature_method", sa.String(10), nullable=True),
            sa.Column("signature_image_path", sa.String(500), nullable=True),
            sa.Column("consent_text_version", sa.String(20), nullable=True),
            sa.Column("otp_verified_at", sa.DateTime(), nullable=True),
            sa.Column("ip_address", sa.String(45), nullable=True),
            sa.Column("user_agent", sa.String(400), nullable=True),
            sa.Column("signed_document_sha256", sa.String(64), nullable=False),
            sa.Column("signed_at", sa.DateTime(), nullable=False),
            sa.Column("decision", sa.String(10), nullable=False),
            sa.Column("decline_reason", sa.String(None), nullable=True),
        )
        op.create_index("ix_document_signatures_document_id", "document_signatures", ["document_id"])
        op.create_index("ix_document_signatures_organization_id", "document_signatures", ["organization_id"])
    if not insp.has_table("document_acknowledgements"):
        op.create_table(
            "document_acknowledgements",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("document_id", sa.Integer(), sa.ForeignKey("generated_documents.id"), nullable=False),
            sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
            sa.Column("acknowledgement_text_version", sa.String(20), nullable=False),
            sa.Column("document_sha256", sa.String(64), nullable=False),
            sa.Column("acknowledged_at", sa.DateTime(), nullable=False),
            sa.Column("ip_address", sa.String(45), nullable=True),
            sa.Column("user_agent", sa.String(400), nullable=True),
            sa.Column("assignment_id", sa.Integer(), sa.ForeignKey("document_assignments.id"), nullable=True),
        )
        op.create_index("ix_document_acknowledgements_document_id", "document_acknowledgements", ["document_id"])
        op.create_index("ix_document_acknowledgements_organization_id", "document_acknowledgements", ["organization_id"])
    if not insp.has_table("document_events"):
        op.create_table(
            "document_events",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("document_id", sa.Integer(), sa.ForeignKey("generated_documents.id"), nullable=False),
            sa.Column("event_type", sa.String(40), nullable=False),
            sa.Column("actor_type", sa.String(20), nullable=False),
            sa.Column("actor_id", sa.Integer(), nullable=True),
            sa.Column("detail", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_document_events_document_id", "document_events", ["document_id"])
        op.create_index("ix_document_events_organization_id", "document_events", ["organization_id"])
    if not insp.has_table("document_sign_otps"):
        op.create_table(
            "document_sign_otps",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("document_id", sa.Integer(), sa.ForeignKey("generated_documents.id"), nullable=False),
            sa.Column("signer_party", sa.String(20), nullable=False),
            sa.Column("signer_key", sa.String(255), nullable=False),
            sa.Column("code_hash", sa.String(64), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("attempts", sa.Integer(), nullable=False),
            sa.Column("verified_at", sa.DateTime(), nullable=True),
            sa.Column("consumed_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_document_sign_otps_document_id", "document_sign_otps", ["document_id"])
        op.create_index("ix_document_sign_otps_organization_id", "document_sign_otps", ["organization_id"])
    if not insp.has_table("document_expiry_items"):
        op.create_table(
            "document_expiry_items",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("item_type", sa.String(20), nullable=False),
            sa.Column("ref_id", sa.Integer(), nullable=False),
            sa.Column("title", sa.String(255), nullable=False),
            sa.Column("owner_employee_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("expiry_date", sa.Date(), nullable=False),
            sa.Column("action_required", sa.String(255), nullable=False),
            sa.Column("status", sa.String(20), nullable=False),
            sa.Column("resolution_note", sa.String(None), nullable=True),
            sa.Column("resolved_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("resolved_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
            sa.UniqueConstraint("organization_id", "item_type", "ref_id", "expiry_date", name="uq_document_expiry_item"),
        )
        op.create_index("ix_document_expiry_items_organization_id", "document_expiry_items", ["organization_id"])
    if not insp.has_table("document_bulk_runs"):
        op.create_table(
            "document_bulk_runs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("canonical_id", sa.String(20), sa.ForeignKey("template_definitions.canonical_id"), nullable=False),
            sa.Column("subject_type", sa.String(20), nullable=False),
            sa.Column("subject_ids", sa.JSON(), nullable=False),
            sa.Column("requested_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
            sa.Column("status", sa.String(20), nullable=False),
            sa.Column("results", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("finished_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_document_bulk_runs_organization_id", "document_bulk_runs", ["organization_id"])
    _seed(bind)
    if bind.dialect.name == "postgresql":
        _triggers()


def _seed(bind) -> None:
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from app.modules.doc_templates.registry import definition_rows

    existing = {r[0] for r in bind.execute(sa.text("SELECT canonical_id FROM template_definitions")).fetchall()}
    defs = sa.table("template_definitions", *[sa.column(k) for k in (
        "canonical_id", "family_id", "title", "kind", "legal_risk", "sensitivity", "lifecycle_trigger", "catalogue_status",
        "implemented", "output_mode", "execution_mode", "audience", "approval_policy", "retention_rule_key", "schema_version",
        "source_spec", "template_json_ref")])
    rows = [r for r in definition_rows() if r["canonical_id"] not in existing]
    if rows:
        op.bulk_insert(defs, rows)
    packs = sa.table("jurisdiction_packs", sa.column("scope_type"), sa.column("owner_organization_id"), sa.column("country"),
                     sa.column("region"), sa.column("status"), sa.column("source_references", sa.JSON), sa.column("notes"),
                     sa.column("created_at"))
    have = {r[0] for r in bind.execute(sa.text("SELECT country FROM jurisdiction_packs WHERE scope_type = 'PLATFORM'")).fetchall()}
    for country, sources in RESEARCH_PACKS:
        if country not in have:
            bind.execute(packs.insert().values(scope_type="PLATFORM", owner_organization_id=None, country=country, region=None,
                                               status="SUSPENDED", source_references=sources, created_at=datetime.utcnow(),
                                               notes="research seed only — not activated (ZHR-ELT-TPL-001 §4.1). No counsel sign-off."))


def _triggers() -> None:
    op.execute("""
        CREATE OR REPLACE FUNCTION zhr_doc_append_only() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION '% is append-only (document evidence)', TG_TABLE_NAME;
        END $$ LANGUAGE plpgsql;
    """)
    for table in APPEND_ONLY:
        op.execute(f"DROP TRIGGER IF EXISTS zhr_{table}_append_only ON {table}")
        op.execute(f"CREATE TRIGGER zhr_{table}_append_only BEFORE UPDATE OR DELETE ON {table} "
                   f"FOR EACH ROW EXECUTE FUNCTION zhr_doc_append_only()")
    op.execute("""
        CREATE OR REPLACE FUNCTION zhr_template_variant_frozen() RETURNS trigger AS $$
        BEGIN
            IF OLD.status <> 'IN_DRAFT' AND (
                NEW.content::text IS DISTINCT FROM OLD.content::text OR
                NEW.field_contract::text IS DISTINCT FROM OLD.field_contract::text OR
                NEW.clause_rules::text IS DISTINCT FROM OLD.clause_rules::text OR
                NEW.canonical_id IS DISTINCT FROM OLD.canonical_id OR NEW.pack_id IS DISTINCT FROM OLD.pack_id OR
                NEW.language IS DISTINCT FROM OLD.language OR NEW.version IS DISTINCT FROM OLD.version) THEN
                RAISE EXCEPTION 'template_variants content is frozen after IN_DRAFT; create a new version';
            END IF;
            RETURN NEW;
        END $$ LANGUAGE plpgsql;
    """)
    op.execute("DROP TRIGGER IF EXISTS zhr_template_variants_frozen ON template_variants")
    op.execute("CREATE TRIGGER zhr_template_variants_frozen BEFORE UPDATE ON template_variants "
               "FOR EACH ROW EXECUTE FUNCTION zhr_template_variant_frozen()")
    op.execute("""
        CREATE OR REPLACE FUNCTION zhr_template_clause_frozen() RETURNS trigger AS $$
        BEGIN
            IF OLD.status <> 'IN_DRAFT' AND (
                NEW.text IS DISTINCT FROM OLD.text OR NEW.clause_key IS DISTINCT FROM OLD.clause_key OR
                NEW.pack_id IS DISTINCT FROM OLD.pack_id OR NEW.language IS DISTINCT FROM OLD.language OR
                NEW.version IS DISTINCT FROM OLD.version) THEN
                RAISE EXCEPTION 'template_clauses text is frozen after IN_DRAFT; create a new version';
            END IF;
            RETURN NEW;
        END $$ LANGUAGE plpgsql;
    """)
    op.execute("DROP TRIGGER IF EXISTS zhr_template_clauses_frozen ON template_clauses")
    op.execute("CREATE TRIGGER zhr_template_clauses_frozen BEFORE UPDATE ON template_clauses "
               "FOR EACH ROW EXECUTE FUNCTION zhr_template_clause_frozen()")


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for table in APPEND_ONLY:
            op.execute(f"DROP TRIGGER IF EXISTS zhr_{table}_append_only ON {table}")
        op.execute("DROP TRIGGER IF EXISTS zhr_template_variants_frozen ON template_variants")
        op.execute("DROP TRIGGER IF EXISTS zhr_template_clauses_frozen ON template_clauses")
        op.execute("DROP FUNCTION IF EXISTS zhr_doc_append_only()")
        op.execute("DROP FUNCTION IF EXISTS zhr_template_variant_frozen()")
        op.execute("DROP FUNCTION IF EXISTS zhr_template_clause_frozen()")
    for table in reversed(TABLES):
        if sa.inspect(bind).has_table(table):
            op.drop_table(table)
