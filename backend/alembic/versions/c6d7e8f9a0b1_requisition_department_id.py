"""recruitment_requisitions.department_id: a requisition belongs to one of the organization's departments (QA #13 BUG-1)

Revision ID: c6d7e8f9a0b1
Revises: b4c5d6e7f8a9
Create Date: 2026-11-17

Adds the column (idempotent: create_all / the boot-time column check may have added it already) and back-fills it where the
stored department name matches an active department of the same organization (case-insensitive, trimmed). Rows that do not
match keep department_id NULL; their Edit form asks HR to pick a department from the list. Reversible.
"""
import sqlalchemy as sa
from alembic import op

revision = "c6d7e8f9a0b1"
down_revision = "b4c5d6e7f8a9"
branch_labels = None
depends_on = None

TABLE = "recruitment_requisitions"


def _columns():
    insp = sa.inspect(op.get_bind())
    return {c["name"] for c in insp.get_columns(TABLE)} if insp.has_table(TABLE) else None


def upgrade():
    have = _columns()
    if have is None:
        return
    if "department_id" not in have:
        op.add_column(TABLE, sa.Column("department_id", sa.Integer(), sa.ForeignKey("departments.id"), nullable=True))
        op.create_index("ix_recruitment_requisitions_department_id", TABLE, ["department_id"])
    op.execute(sa.text(
        "UPDATE recruitment_requisitions SET department_id = ("
        "  SELECT MIN(d.id) FROM departments d"
        "  WHERE d.organization_id = recruitment_requisitions.organization_id AND d.is_active = :yes"
        "    AND LOWER(TRIM(d.name)) = LOWER(TRIM(recruitment_requisitions.department)))"
        " WHERE department_id IS NULL"
    ).bindparams(yes=True))


def downgrade():
    have = _columns()
    if have is None or "department_id" not in have:
        return
    insp = sa.inspect(op.get_bind())
    if any(i["name"] == "ix_recruitment_requisitions_department_id" for i in insp.get_indexes(TABLE)):
        op.drop_index("ix_recruitment_requisitions_department_id", table_name=TABLE)
    with op.batch_alter_table(TABLE) as batch:
        batch.drop_column("department_id")
