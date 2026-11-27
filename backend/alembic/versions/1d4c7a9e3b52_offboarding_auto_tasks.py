"""offboarding: clearance tasks that complete themselves (auto_key)

A clearance item that only mirrors another record of the case – asset recovery, the final settlement, the exit interview,
the relieving / experience letter – carries `auto_key` and is ticked automatically when that record is done.

Revision ID: 1d4c7a9e3b52
Revises: 0a7d3e9c5b21
Create Date: 2026-11-26 15:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "1d4c7a9e3b52"
down_revision: Union[str, Sequence[str], None] = "0a7d3e9c5b21"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = "offboarding_tasks"


def _cols(bind) -> set:
    insp = sa.inspect(bind)
    return {c["name"] for c in insp.get_columns(TABLE)} if TABLE in insp.get_table_names() else set()


def upgrade() -> None:
    bind = op.get_bind()
    if TABLE in sa.inspect(bind).get_table_names() and "auto_key" not in _cols(bind):
        op.add_column(TABLE, sa.Column("auto_key", sa.String(length=30), nullable=True))


def downgrade() -> None:
    if "auto_key" in _cols(op.get_bind()):
        op.drop_column(TABLE, "auto_key")
