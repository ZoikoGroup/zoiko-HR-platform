"""department_settings: per-organization preferences of the Departments module

Revision ID: f0e1d2c3b4a5
Revises: e7f8a9b0c1d2
Create Date: 2026-10-16

One row per organization holding the whole preference set as JSON (mirrors
designation_settings). New table only; idempotent and reversible.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f0e1d2c3b4a5"
down_revision: Union[str, Sequence[str], None] = "e7f8a9b0c1d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_T = "department_settings"


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
    op.create_index("ix_department_settings_id", _T, ["id"])
    op.create_index("ix_department_settings_organization_id", _T, ["organization_id"], unique=True)


def downgrade() -> None:
    if sa.inspect(op.get_bind()).has_table(_T):
        op.drop_table(_T)
