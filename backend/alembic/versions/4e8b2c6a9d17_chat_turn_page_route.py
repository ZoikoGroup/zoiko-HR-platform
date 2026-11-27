"""assistant: chat_turns.page_route, the app page the asker had open (M1-13 page context)

Revision ID: 4e8b2c6a9d17
Revises: p7e1a2b3c4d9
Create Date: 2026-11-27

A nullable column, no backfill: older turns simply have no page.
"""
from alembic import op
import sqlalchemy as sa

revision = "4e8b2c6a9d17"
down_revision = "p7e1a2b3c4d9"
branch_labels = None
depends_on = None


def _columns() -> set:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns("chat_turns")}


def upgrade() -> None:
    # A fresh database already has it: the baseline migration (17aefc359dab) creates every table from the current
    # models, so only an existing database needs the column added.
    if "page_route" not in _columns():
        op.add_column("chat_turns", sa.Column("page_route", sa.String(length=200), nullable=True))


def downgrade() -> None:
    if "page_route" in _columns():
        op.drop_column("chat_turns", "page_route")
