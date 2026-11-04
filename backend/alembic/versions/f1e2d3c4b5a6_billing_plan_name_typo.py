"""billing catalog: repair misspelled canonical plan names

Revision ID: f1e2d3c4b5a6
Revises: f0e1d2c3b4a5
Create Date: 2026-10-16

The live billing_plans catalog carried a "Core plam" typo in the free-text name
column, which the Billing pages, plan responses and emails render verbatim. The
catalog codes are the source of truth (CORE / ADVANCED / ENTERPRISE), so rows
whose name is not the canonical label for their code are reset to it.

Only the three system codes are touched; anything else keeps its name.
Downgrade is a no-op: a typo fix is not restored.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f1e2d3c4b5a6"
down_revision: Union[str, Sequence[str], None] = "f0e1d2c3b4a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CANONICAL = (("core", "Core"), ("advanced", "Advanced"), ("enterprise", "Enterprise"))


def upgrade() -> None:
    bind = op.get_bind()
    if "billing_plans" not in sa.inspect(bind).get_table_names():
        return
    for code, label in CANONICAL:
        bind.execute(
            sa.text(
                "UPDATE billing_plans SET name = :label "
                "WHERE lower(code) = :code AND (name IS NULL OR lower(name) != :lname)"
            ),
            {"label": label, "code": code, "lname": label.lower()},
        )


def downgrade() -> None:
    pass
