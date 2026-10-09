"""employees.email_verified: people confirm their e-mail address before they can sign in

Revision ID: x1a2b3c4d5ea
Revises: w1a2b3c4d5e9
Create Date: 2026-10-09

Existing accounts are marked confirmed (server default true), so nobody is locked out by this change; accounts created
from now on start unconfirmed until their owner clicks the e-mailed link. Idempotent and reversible.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "x1a2b3c4d5ea"
down_revision: Union[str, Sequence[str], None] = "w1a2b3c4d5e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns():
    insp = sa.inspect(op.get_bind())
    return {c["name"] for c in insp.get_columns("employees")} if insp.has_table("employees") else None


def upgrade() -> None:
    have = _columns()
    if have is None:
        return
    if "email_verified" not in have:
        op.add_column("employees", sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.true()))
    if "email_verified_at" not in have:
        op.add_column("employees", sa.Column("email_verified_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    have = _columns()
    if have is None:
        return
    for name in ("email_verified_at", "email_verified"):
        if name in have:
            op.drop_column("employees", name)
