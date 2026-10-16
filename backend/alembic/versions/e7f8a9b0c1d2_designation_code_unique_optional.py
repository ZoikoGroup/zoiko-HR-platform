"""designation codes: uniqueness is a per-organization setting, not a global rule

Revision ID: e7f8a9b0c1d2
Revises: a7b8c9d0e1f2, f9e8d7c6b5a4
Create Date: 2026-10-16

The "Enforce Unique Designation Codes" switch in Designation Settings was static
because `designations.designation_code` carried a database-level UNIQUE
constraint: duplicates were refused for every organization no matter what the
setting said. Uniqueness is now enforced by the application per organization
(`create_designation` honours the setting), so the global constraint is dropped.

Idempotent and reversible. Non-Postgres databases (tests build the schema from
the models via create_all) need nothing and are skipped.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "e7f8a9b0c1d2"
down_revision: Union[str, Sequence[str], None] = ("a7b8c9d0e1f2", "f9e8d7c6b5a4")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_T = "designations"
_COL = "designation_code"


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    insp = sa.inspect(bind)
    for c in insp.get_unique_constraints(_T):
        if list(c.get("column_names") or []) == [_COL]:
            op.drop_constraint(c["name"], _T, type_="unique")
    for ix in insp.get_indexes(_T):
        if ix.get("unique") and list(ix.get("column_names") or []) == [_COL]:
            op.drop_index(ix["name"], table_name=_T)


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.create_unique_constraint(f"{_T}_{_COL}_key", _T, [_COL])
