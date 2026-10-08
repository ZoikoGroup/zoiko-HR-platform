"""employees.travel_preferences: saved personal travel settings

Revision ID: w1a2b3c4d5e9
Revises: v1a2b3c4d5e8
Create Date: 2026-10-08

The employee Travel Settings page posted fields the server never stored, so "saved" settings were lost. Adds the column
that holds them. Idempotent and reversible.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "w1a2b3c4d5e9"
down_revision: Union[str, Sequence[str], None] = "v1a2b3c4d5e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column() -> bool | None:
    insp = sa.inspect(op.get_bind())
    if not insp.has_table("employees"):
        return None
    return any(c["name"] == "travel_preferences" for c in insp.get_columns("employees"))


def upgrade() -> None:
    if _has_column() is False:
        op.add_column("employees", sa.Column("travel_preferences", sa.JSON(), nullable=True))


def downgrade() -> None:
    if _has_column():
        op.drop_column("employees", "travel_preferences")
