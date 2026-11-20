"""Documents module (ZHR-DOCS-ARCH-001): new columns on the legacy document tables

Revision ID: e1a2b3c4d5f1
Revises: e1a2b3c4d5f0
Create Date: 2026-11-19

* hr_documents: scope, employee/company category, source, approved_version_id, reason_code, storage_key, is_encrypted,
  sha256, review lock, publish state/time, is_archived, retention_until, legal_hold.
* hr_document_versions: organization_id and per-version status, expiry, decision, storage, scan and pre-check results.
* document_approval_steps: organization_id, version_id, sla_level. document_approval_logs: organization_id, version_id,
  reason_code. hr_document_folders: company_category_id.
* hrdocumentstatus enum (PostgreSQL): value REUPLOAD_REQUESTED (added outside the transaction, as PostgreSQL requires).

Every column is nullable or has a server default, so existing rows stay valid; the next revision fills them in.
Guarded (columns that already exist are skipped) and reversible (the enum value is left in place on downgrade:
PostgreSQL cannot drop an enum value, and an unused value is harmless).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e1a2b3c4d5f1"
down_revision: Union[str, Sequence[str], None] = "e1a2b3c4d5f0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _fk(name, target):
    return lambda: sa.Column(name, sa.Integer(), sa.ForeignKey(target), nullable=True)


COLUMNS = {
    "hr_documents": [
        lambda: sa.Column("scope", sa.String(10), nullable=False, server_default="employee"),
        _fk("employee_category_id", "hr_employee_document_categories.id"),
        _fk("company_category_id", "hr_company_document_categories.id"),
        lambda: sa.Column("source", sa.String(20), nullable=False, server_default="employee"),
        lambda: sa.Column("approved_version_id", sa.Integer(), nullable=True),
        lambda: sa.Column("reason_code", sa.String(40), nullable=True),
        lambda: sa.Column("storage_key", sa.String(500), nullable=True),
        lambda: sa.Column("is_encrypted", sa.Boolean(), nullable=False, server_default=sa.false()),
        lambda: sa.Column("sha256", sa.String(64), nullable=True),
        _fk("review_locked_by", "employees.id"),
        lambda: sa.Column("review_locked_until", sa.DateTime(), nullable=True),
        lambda: sa.Column("publish_state", sa.String(12), nullable=False, server_default="published"),
        lambda: sa.Column("publish_at", sa.DateTime(), nullable=True),
        lambda: sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.false()),
        lambda: sa.Column("retention_until", sa.Date(), nullable=True),
        lambda: sa.Column("legal_hold", sa.Boolean(), nullable=False, server_default=sa.false()),
    ],
    "hr_document_versions": [
        _fk("organization_id", "organizations.id"),
        lambda: sa.Column("status", sa.String(20), nullable=False, server_default="approved"),
        lambda: sa.Column("expiry_date", sa.Date(), nullable=True),
        lambda: sa.Column("rejection_reason", sa.Text(), nullable=True),
        lambda: sa.Column("reason_code", sa.String(40), nullable=True),
        _fk("decided_by", "employees.id"),
        lambda: sa.Column("decided_role", sa.String(20), nullable=True),
        lambda: sa.Column("decided_at", sa.DateTime(), nullable=True),
        lambda: sa.Column("storage_key", sa.String(500), nullable=True),
        lambda: sa.Column("is_encrypted", sa.Boolean(), nullable=False, server_default=sa.false()),
        lambda: sa.Column("sha256", sa.String(64), nullable=True),
        lambda: sa.Column("scan_status", sa.String(12), nullable=False, server_default="skipped"),
        lambda: sa.Column("precheck", sa.JSON(), nullable=True),
        lambda: sa.Column("material_change", sa.Boolean(), nullable=False, server_default=sa.true()),
    ],
    "document_approval_steps": [
        _fk("organization_id", "organizations.id"),
        _fk("version_id", "hr_document_versions.id"),
        lambda: sa.Column("sla_level", sa.Integer(), nullable=False, server_default="0"),
    ],
    "document_approval_logs": [
        _fk("organization_id", "organizations.id"),
        _fk("version_id", "hr_document_versions.id"),
        lambda: sa.Column("reason_code", sa.String(40), nullable=True),
    ],
    "hr_document_folders": [
        _fk("company_category_id", "hr_company_document_categories.id"),
    ],
}

INDEXES = (
    ("ix_hr_documents_employee_category_id", "hr_documents", ["employee_category_id"]),
    ("ix_hr_documents_company_category_id", "hr_documents", ["company_category_id"]),
    ("ix_hd_org_scope_status", "hr_documents", ["organization_id", "scope", "status"]),
    ("ix_hd_org_expiry", "hr_documents", ["organization_id", "expiry_date"]),
    ("ix_hr_document_versions_organization_id", "hr_document_versions", ["organization_id"]),
    ("ix_hr_document_versions_sha256", "hr_document_versions", ["sha256"]),
    ("ix_hdv_org_status", "hr_document_versions", ["organization_id", "status"]),
    ("ix_document_approval_steps_organization_id", "document_approval_steps", ["organization_id"]),
    ("ix_das_queue", "document_approval_steps", ["organization_id", "status", "required_role", "created_at"]),
    ("ix_document_approval_logs_organization_id", "document_approval_logs", ["organization_id"]),
    ("ix_hr_document_folders_company_category_id", "hr_document_folders", ["company_category_id"]),
)


def _existing(table):
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def _indexes(table):
    return {i["name"] for i in sa.inspect(op.get_bind()).get_indexes(table)}


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE hrdocumentstatus ADD VALUE IF NOT EXISTS 'REUPLOAD_REQUESTED'")
    for table, cols in COLUMNS.items():
        have = _existing(table)
        for make in cols:
            col = make()
            if col.name in have:
                continue
            if bind.dialect.name == "sqlite":        # SQLite cannot add a constraint to an existing table
                col = sa.Column(col.name, col.type, nullable=col.nullable, server_default=col.server_default)
            op.add_column(table, col)
    for name, table, columns in INDEXES:
        if name not in _indexes(table):
            op.create_index(name, table, columns)


def downgrade() -> None:
    for name, table, _ in reversed(INDEXES):
        if name in _indexes(table):
            op.drop_index(name, table_name=table)
    for table, cols in COLUMNS.items():
        have = _existing(table)
        for make in reversed(cols):
            name = make().name
            if name in have:
                op.drop_column(table, name)
