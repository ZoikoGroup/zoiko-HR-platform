"""Merge heads: documents + attendance (venu) with main's offers / docs setup / employee email / assets chain

Revision ID: b0c1d2e3f4a5
Revises: a7c1d2e3f4a3, e2f3a4b5c6d7
Create Date: 2026-11-20

No schema change. The two branches touch different tables (documents / attendance vs recruitment offers, candidates,
employee e-mail indexes, assets, organization document setup), so their order does not matter; this revision only
gives Alembic a single head again.
"""
from typing import Sequence, Union

revision: str = "b0c1d2e3f4a5"
down_revision: Union[str, Sequence[str], None] = ("a7c1d2e3f4a3", "e2f3a4b5c6d7")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
