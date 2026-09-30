"""zhr30_expense_budgets: super_admin_expense_budgets

Revision ID: l1e2f3a4b5c7
Revises: k1d2e3f4a5b6
Create Date: 2026-09-30

Adds one new table; nothing existing changes. Rollback
(alembic downgrade k1d2e3f4a5b6) drops only this table.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "l1e2f3a4b5c7"
down_revision: Union[str, Sequence[str], None] = "k1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if sa.inspect(op.get_bind()).has_table("super_admin_expense_budgets"):
        return
    op.create_table(
        "super_admin_expense_budgets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("allocated_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_super_admin_expense_budgets_organization_id", "super_admin_expense_budgets", ["organization_id"])


def downgrade() -> None:
    if sa.inspect(op.get_bind()).has_table("super_admin_expense_budgets"):
        op.drop_table("super_admin_expense_budgets")
