"""recruitment_interviews.result_by_id: tenant-safe composite key

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
Create Date: 2026-11-12

Like every other reference to an employee, the person who recorded an interview's result must belong to the interview's own
organization: (result_by_id, organization_id) -> employees (id, organization_id). Idempotent (create_all databases already
have it); NOT VALID like the other tenant keys, so it is enforced for new rows without a long validation lock.
"""
import sqlalchemy as sa
from alembic import op

revision = "b4c5d6e7f8a9"
down_revision = "a3b4c5d6e7f8"
branch_labels = None
depends_on = None

PAIR = {"child": "recruitment_interviews", "column": "result_by_id", "parent": "employees", "ondelete": None}


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name != "postgresql" or PAIR["child"] not in sa.inspect(bind).get_table_names():
        return
    from app.core.privacy import rls
    for stmt in rls.composite_fk_sql([PAIR]):
        op.execute(stmt)


def downgrade():
    if op.get_bind().dialect.name != "postgresql":
        return
    from app.core.privacy import rls
    for stmt in rls.composite_fk_drop_sql([PAIR]):
        op.execute(stmt)
