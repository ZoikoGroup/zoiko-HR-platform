"""scope employee email uniqueness per organization (tenant isolation)

Revision ID: b7c8d9e0f1a2
Revises: 36c94a486784
Create Date: 2026-09-10

Previously `employees.email` carried a global UNIQUE constraint, so the same
address could never be reused across two organizations. This mirrors the
user-facing rule strictly into the schema: an email may repeat across orgs,
but only once per org. The composite unique constraint (organization_id, email)
replaces the column-level one in the Employee model (create_all source of
truth for fresh databases); this migration reconciles existing databases.

Super-admin / NULL-organization rows are unaffected: PostgreSQL treats NULL as
distinct, so org-less rows keep the old global uniqueness behavior naturally.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b7c8d9e0f1a2'
down_revision: Union[str, Sequence[str], None] = '36c94a486784'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # The old column-level UNIQUE was unnamed in the model, so its DDL name is
    # dialect-generated (PostgreSQL autogenerates employees_email_key). Find and
    # drop whatever unique constraint or unique index sits on email alone.
    for constraint in inspector.get_unique_constraints("employees"):
        if constraint["column_names"] == ["email"]:
            op.drop_constraint(constraint["name"], "employees", type_="unique")

    for index in inspector.get_indexes("employees"):
        if index.get("unique") and index["column_names"] == ["email"] and index.get("name"):
            op.drop_index(index["name"], table_name="employees")

    op.create_unique_constraint(
        "uq_employees_organization_email",
        "employees",
        ["organization_id", "email"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_employees_organization_email", "employees", type_="unique")
    op.create_unique_constraint("uq_employees_email", "employees", ["email"])