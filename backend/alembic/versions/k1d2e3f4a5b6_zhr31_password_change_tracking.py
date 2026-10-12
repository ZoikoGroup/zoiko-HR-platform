"""zhr31_password_change_tracking: password_changed_at + must_change_password

Revision ID: k1d2e3f4a5b6
Revises: j1c2d3e4f5a6
Create Date: 2026-09-30

Adds two nullable/defaulted columns to employees; no existing rows change
behaviour. Rollback (alembic downgrade j1c2d3e4f5a6) drops just these columns.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "k1d2e3f4a5b6"
down_revision: Union[str, Sequence[str], None] = "j1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _cols():
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns("employees")}


def upgrade() -> None:
    cols = _cols()
    if "password_changed_at" not in cols:
        op.add_column("employees", sa.Column("password_changed_at", sa.DateTime(), nullable=True))
    if "must_change_password" not in cols:
        op.add_column(
            "employees",
            sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()),
        )


def downgrade() -> None:
    cols = _cols()
    if "must_change_password" in cols:
        op.drop_column("employees", "must_change_password")
    if "password_changed_at" in cols:
        op.drop_column("employees", "password_changed_at")
