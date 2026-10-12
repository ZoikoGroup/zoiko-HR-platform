"""zhr53_designation_provenance: record where a designation came from

Revision ID: q1e2f3a4b5c3
Revises: p1c2d3e4f5a1
Create Date: 2026-10-06

designations.source     'manual' | 'import' | 'user_form' (NULL = created before this was tracked)
designations.created_by employees.id of whoever created it, when known (no FK on purpose, see the model)

Both nullable, so every existing row stays valid. Idempotent and reversible.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "q1e2f3a4b5c3"
down_revision: Union[str, Sequence[str], None] = "p1c2d3e4f5a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_T = "designations"


def upgrade() -> None:
    have = {c["name"] for c in sa.inspect(op.get_bind()).get_columns(_T)}
    if "source" not in have:
        op.add_column(_T, sa.Column("source", sa.String(20), nullable=True))
    if "created_by" not in have:
        op.add_column(_T, sa.Column("created_by", sa.Integer(), nullable=True))


def downgrade() -> None:
    have = {c["name"] for c in sa.inspect(op.get_bind()).get_columns(_T)}
    if "created_by" in have:
        op.drop_column(_T, "created_by")
    if "source" in have:
        op.drop_column(_T, "source")
