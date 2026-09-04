"""add is_public to knowledge_sources

Written by hand rather than via `alembic revision --autogenerate`: the dev
database this was authored against already has this column (added earlier
through the dev-only ALTER_SQL path in app/database.py's initialize_database,
before this project adopted Alembic), so autogenerate found no diff for it —
it only surfaced unrelated, pre-existing drift on other tables that belongs
in its own separate, reviewed migration, not bundled in here.

Column addition is written with `server_default` + `nullable=False` in one
step so it's safe to run against a table that already has rows (existing
rows get FALSE, matching the model's Python-side default for new rows).
IF NOT EXISTS-equivalent safety (skip cleanly if the column is already
present, e.g. on this dev database) is handled via a raw inspector check,
consistent with how `database.py`'s own ALTER_SQL list is idempotent.

Revision ID: a1f3c9d02b7e
Revises: 17aefc359dab
Create Date: 2026-08-31 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a1f3c9d02b7e'
down_revision: Union[str, Sequence[str], None] = '17aefc359dab'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("knowledge_sources")}
    if "is_public" not in existing_columns:
        op.add_column(
            "knowledge_sources",
            sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.false()),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("knowledge_sources")}
    if "is_public" in existing_columns:
        op.drop_column("knowledge_sources", "is_public")
