"""learning courses, training programs and assessments: department and resource_link

Revision ID: t1a2b3c4d5e6
Revises: s1a2b3c4d5e5
Create Date: 2026-10-07

The Courses and Training Programs forms have always asked for a department and a resource link, but the tables had
nowhere to keep them, so both were silently dropped on save. Two nullable columns on each table; idempotent and
reversible.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "t1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "s1a2b3c4d5e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLES = ("learning_courses", "learning_training_programs")
_LINK_ONLY = ("learning_assessments",)


def _columns(table: str) -> set:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    for table in _TABLES:
        if not insp.has_table(table):
            continue
        have = _columns(table)
        if "department" not in have:
            op.add_column(table, sa.Column("department", sa.String(100), nullable=True))
        if "resource_link" not in have:
            op.add_column(table, sa.Column("resource_link", sa.String(500), nullable=True))
    for table in _LINK_ONLY:
        if insp.has_table(table) and "resource_link" not in _columns(table):
            op.add_column(table, sa.Column("resource_link", sa.String(500), nullable=True))


def downgrade() -> None:
    insp = sa.inspect(op.get_bind())
    for table in _TABLES:
        if not insp.has_table(table):
            continue
        have = _columns(table)
        with op.batch_alter_table(table) as batch:
            if "resource_link" in have:
                batch.drop_column("resource_link")
            if "department" in have:
                batch.drop_column("department")
    for table in _LINK_ONLY:
        if insp.has_table(table) and "resource_link" in _columns(table):
            with op.batch_alter_table(table) as batch:
                batch.drop_column("resource_link")
