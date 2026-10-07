"""designation_settings: per-organization preferences of the Designations module

Revision ID: s1a2b3c4d5e5
Revises: r1f2a3b4c5d4
Create Date: 2026-10-07

One row per organization holding the whole preference set as JSON. New table only; idempotent and reversible.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "s1a2b3c4d5e5"
down_revision: Union[str, Sequence[str], None] = "r1f2a3b4c5d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_T = "designation_settings"


def upgrade() -> None:
    if sa.inspect(op.get_bind()).has_table(_T):
        return
    op.create_table(
        _T,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("settings", sa.JSON(), nullable=False),
        sa.Column("updated_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_designation_settings_id", _T, ["id"])
    op.create_index("ix_designation_settings_organization_id", _T, ["organization_id"], unique=True)


def downgrade() -> None:
    if sa.inspect(op.get_bind()).has_table(_T):
        op.drop_table(_T)
