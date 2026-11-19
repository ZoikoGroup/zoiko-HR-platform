"""The organisation's onboarding package, portal form overrides, upload categories and the docs setup wizard

Revision ID: d1e2f3a4b5c6
Revises: c6d7e8f9a0b6
Create Date: 2026-11-19

New tenant tables (all with organization_id):
  org_package_documents, org_form_overrides, org_document_request_categories,
  docs_setup_sessions, docs_setup_files, docs_setup_proposals.

The tables are created from the models (app/modules/hr/docs_setup_models.py) so the columns match exactly. Rows are seeded
lazily per organisation on first use (the 10 platform documents, the five current upload categories), preserving today's
behaviour. After upgrading, run scripts/privacy_apply_rls.py (new tenant tables) as for every table-adding migration.
"""
import sqlalchemy as sa
from alembic import op

revision = "d1e2f3a4b5c6"
down_revision = "c6d7e8f9a0b6"
branch_labels = None
depends_on = None

TABLES = ("org_package_documents", "org_form_overrides", "org_document_request_categories", "docs_setup_sessions",
          "docs_setup_files", "docs_setup_proposals")


def upgrade():
    from app.database import Base
    import app.modules.hr.docs_setup_models  # noqa: F401
    bind = op.get_bind()
    insp = sa.inspect(bind)
    for name in TABLES:
        if not insp.has_table(name):
            Base.metadata.tables[name].create(bind)
    # verified values of the organisation's own portal form fields (never mapped into core employee columns)
    if "custom_fields" not in {c["name"] for c in insp.get_columns("employees")}:
        op.add_column("employees", sa.Column("custom_fields", sa.JSON(), nullable=True))


def downgrade():
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "custom_fields" in {c["name"] for c in insp.get_columns("employees")}:
        op.drop_column("employees", "custom_fields")
    for name in reversed(TABLES):
        if insp.has_table(name):
            op.drop_table(name)
