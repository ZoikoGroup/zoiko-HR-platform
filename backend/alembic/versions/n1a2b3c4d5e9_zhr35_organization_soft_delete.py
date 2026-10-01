"""zhr35_organization_soft_delete: deleted_at/deleted_by/delete_reason/deletion_snapshot

Revision ID: n1a2b3c4d5e9
Revises: m1f2a3b4c5d8
Create Date: 2026-10-01

Adds four nullable columns to organizations. No existing row changes meaning
(deleted_at stays NULL = active). Rollback (alembic downgrade m1f2a3b4c5d8)
drops just these columns; any soft-deleted organization would reappear as
active, so restore or review them first.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "n1a2b3c4d5e9"
down_revision: Union[str, Sequence[str], None] = "m1f2a3b4c5d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    cols = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("organizations")}
    if "deleted_at" not in cols:
        op.add_column("organizations", sa.Column("deleted_at", sa.DateTime(), nullable=True))
        op.create_index("ix_organizations_deleted_at", "organizations", ["deleted_at"])
    if "deleted_by" not in cols:
        op.add_column("organizations", sa.Column("deleted_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True))
    if "delete_reason" not in cols:
        op.add_column("organizations", sa.Column("delete_reason", sa.Text(), nullable=True))
    if "deletion_snapshot" not in cols:
        op.add_column("organizations", sa.Column("deletion_snapshot", sa.JSON(), nullable=True))


def downgrade() -> None:
    cols = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("organizations")}
    for name in ("deletion_snapshot", "delete_reason", "deleted_by"):
        if name in cols:
            op.drop_column("organizations", name)
    if "deleted_at" in cols:
        op.drop_index("ix_organizations_deleted_at", table_name="organizations")
        op.drop_column("organizations", "deleted_at")
