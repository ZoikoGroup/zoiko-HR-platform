"""compliance audits, regulations, risks, violations and corrective actions belong to an organization

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-10-09

These five tables had no organization_id: every organization listed, opened, edited and deleted every other
organization's compliance records, and the compliance dashboard counted them all.

Adds a nullable, indexed organization_id to each. Existing rows cannot be attributed (the tables have no creator
column), so they stay NULL and are visible to platform super admins only. To hand them back to their organization:

    UPDATE compliance_audits SET organization_id = <org id> WHERE id IN (...);   -- etc. per table

Reversible: downgrade drops the column (and its index) again.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c4d5e6f7a8b9"
down_revision: Union[str, Sequence[str], None] = "b3c4d5e6f7a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLES = ["compliance_audits", "compliance_regulations", "compliance_risks", "compliance_violations",
          "compliance_corrective_actions"]


def _tables():
    return TABLES


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    for table in _tables():
        if not insp.has_table(table) or "organization_id" in {c["name"] for c in insp.get_columns(table)}:
            continue
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=True))
        op.create_index(f"ix_{table}_organization_id", table, ["organization_id"])


def downgrade() -> None:
    insp = sa.inspect(op.get_bind())
    for table in reversed(_tables()):
        if not insp.has_table(table) or "organization_id" not in {c["name"] for c in insp.get_columns(table)}:
            continue
        op.drop_index(f"ix_{table}_organization_id", table_name=table)
        with op.batch_alter_table(table) as batch:
            batch.drop_column("organization_id")
