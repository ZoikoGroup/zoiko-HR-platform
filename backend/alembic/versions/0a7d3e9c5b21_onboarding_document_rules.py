"""onboarding package documents: "include when" rules and automatic send triggers per document

Each organisation's package row gains
  * conditions        – [{field, op, value}] that must all hold for a hire to receive the document (country, department,
                        employment type, position, the organisation's own fields …); null / [] = every hire
  * send_when         – manual | hire_created | details_submitted | days_before_start; null = manual (today's behaviour)
  * send_days_before  – for days_before_start: how many days before the start date

Nothing changes for existing rows: null conditions and a null trigger behave exactly as before.

Revision ID: 0a7d3e9c5b21
Revises: eebc54645fb2
Create Date: 2026-11-25 12:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0a7d3e9c5b21"
down_revision: Union[str, Sequence[str], None] = "eebc54645fb2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = "org_package_documents"
COLUMNS = (
    ("conditions", sa.JSON(), {}),
    ("send_when", sa.String(length=30), {}),
    ("send_days_before", sa.Integer(), {}),
)


def _columns(bind) -> set:
    insp = sa.inspect(bind)
    if TABLE not in insp.get_table_names():
        return set()
    return {c["name"] for c in insp.get_columns(TABLE)}


def upgrade() -> None:
    bind = op.get_bind()
    if TABLE not in sa.inspect(bind).get_table_names():
        return                              # created later from the model with every column
    have = _columns(bind)
    for name, type_, kw in COLUMNS:
        if name not in have:
            op.add_column(TABLE, sa.Column(name, type_, nullable=True, **kw))


def downgrade() -> None:
    bind = op.get_bind()
    have = _columns(bind)
    for name, _type, _kw in reversed(COLUMNS):
        if name in have:
            op.drop_column(TABLE, name)
