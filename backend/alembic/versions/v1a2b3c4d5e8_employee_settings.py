"""employees: saved notification preferences, language and timezone

Revision ID: v1a2b3c4d5e8
Revises: u1a2b3c4d5e7
Create Date: 2026-10-08

The employee Settings page never stored anything, so every reload showed the defaults (email and push on). Adds the
three columns it needs. Idempotent and reversible.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "v1a2b3c4d5e8"
down_revision: Union[str, Sequence[str], None] = "u1a2b3c4d5e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = (
    ("notification_preferences", sa.JSON()),
    ("language", sa.String(30)),
    ("timezone", sa.String(50)),
)


def _existing():
    insp = sa.inspect(op.get_bind())
    return {c["name"] for c in insp.get_columns("employees")} if insp.has_table("employees") else None


def upgrade() -> None:
    have = _existing()
    if have is None:
        return
    for name, kind in _COLUMNS:
        if name not in have:
            op.add_column("employees", sa.Column(name, kind, nullable=True))


def downgrade() -> None:
    have = _existing()
    if have is None:
        return
    for name, _ in reversed(_COLUMNS):
        if name in have:
            op.drop_column("employees", name)
