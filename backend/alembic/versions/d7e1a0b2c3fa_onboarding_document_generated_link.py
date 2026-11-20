"""onboarding_documents.document_id: link an onboarding document to its generated (e-signable) document

Revision ID: d7e1a0b2c3fa
Revises: d7e1a0b2c3f9
Create Date: 2026-11-10

The column was added to the model with the onboarding e-signing flow (commit 7f227b0) but never migrated, so databases built with
`alembic upgrade head` failed every query on onboarding_documents ("column onboarding_documents.document_id does not exist"):
the Onboarding › Documents page and the offer package panel answered 500. Guarded: a database where the column was added by hand
(or by create_all) is left as it is apart from the missing index / keys.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d7e1a0b2c3fa"
down_revision: Union[str, Sequence[str], None] = "d7e1a0b2c3f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE, COLUMN, INDEX = "onboarding_documents", "document_id", "ix_onboarding_documents_document_id"


def _has_column(bind) -> bool:
    insp = sa.inspect(bind)
    return TABLE in insp.get_table_names() and COLUMN in {c["name"] for c in insp.get_columns(TABLE)}


def upgrade() -> None:
    bind = op.get_bind()
    if TABLE not in sa.inspect(bind).get_table_names():
        return
    if not _has_column(bind):
        op.add_column(TABLE, sa.Column(COLUMN, sa.Integer(), sa.ForeignKey("generated_documents.id"), nullable=True))
    if INDEX not in {i["name"] for i in sa.inspect(bind).get_indexes(TABLE)}:
        op.create_index(INDEX, TABLE, [COLUMN])
    if bind.dialect.name == "postgresql":
        # tenant-safe composite key (onboarding document and generated document belong to the same organization)
        from app.core.privacy import rls
        for stmt in rls.composite_fk_sql([{"child": TABLE, "column": COLUMN, "parent": "generated_documents", "ondelete": None}]):
            op.execute(stmt)


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_column(bind):
        return
    if bind.dialect.name == "postgresql":
        op.execute(f"ALTER TABLE {TABLE} DROP CONSTRAINT IF EXISTS fk_{TABLE}_{COLUMN}_tenant")
    if INDEX in {i["name"] for i in sa.inspect(bind).get_indexes(TABLE)}:
        op.drop_index(INDEX, table_name=TABLE)
    op.drop_column(TABLE, COLUMN)
