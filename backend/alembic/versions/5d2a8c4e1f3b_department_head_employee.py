"""Departments: the head of department as a person (head_employee_id)

Revision ID: 5d2a8c4e1f3b
Revises: 4c8e1f2a9b7d
Create Date: 2026-11-23

`departments.head` was free text ("peter"), so a head could not be picked from the organization's people, checked, or
shown with the person's current name. This adds a nullable `head_employee_id` (employees.id, SET NULL when the person
is removed). `head` stays and is kept in step with the person's name, so older screens keep working. Nothing is
backfilled automatically: a free-text name may match several people; admins pick the person once.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "5d2a8c4e1f3b"
down_revision: Union[str, Sequence[str], None] = "4c8e1f2a9b7d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

FK = "fk_departments_head_employee_id"


def _has_column() -> bool:
    return "head_employee_id" in {c["name"] for c in sa.inspect(op.get_bind()).get_columns("departments")}


def upgrade() -> None:
    # a development boot may already have added it (database._SELF_HEALED_TABLES)
    if not _has_column():
        op.add_column("departments", sa.Column("head_employee_id", sa.Integer(), nullable=True))
    if op.get_bind().dialect.name == "postgresql":
        names = {fk["name"] for fk in sa.inspect(op.get_bind()).get_foreign_keys("departments")}
        if FK not in names:
            op.create_foreign_key(FK, "departments", "employees", ["head_employee_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    if not _has_column():
        return
    if op.get_bind().dialect.name == "postgresql":
        op.drop_constraint(FK, "departments", type_="foreignkey")
    with op.batch_alter_table("departments") as batch:
        batch.drop_column("head_employee_id")
