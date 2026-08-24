"""baseline schema (create_all snapshot)

This project ran on SQLAlchemy's Base.metadata.create_all() in development
with no migration history. Rather than hand-writing 99 op.create_table()
calls (or autogenerating a diff against an already-populated dev database,
which would miss anything Alembic can't see the "before" state of), this
baseline reuses create_all()/drop_all() directly against the metadata that
is already the single source of truth for the schema:

  - Against a fresh/empty database (a new production deploy), upgrade()
    creates every table, matching what create_all() used to do on boot.
  - Against an existing dev/staging database that already has these tables,
    upgrade() is a safe no-op (checkfirst=True) — run `alembic stamp head`
    there instead of `upgrade` so Alembic records history without touching
    data.

Every migration after this one should use normal op.* calls generated via
`alembic revision --autogenerate`.

Revision ID: 17aefc359dab
Revises:
Create Date: 2026-08-24 17:45:00.727090

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

from app.database import Base

# revision identifiers, used by Alembic.
revision: str = '17aefc359dab'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    bind.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.create_all(bind=bind, checkfirst=True)


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
