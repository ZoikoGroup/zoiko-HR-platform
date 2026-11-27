"""assistant: chat_turns.page_route, the app page the asker had open (M1-13 page context)

Revision ID: 4e8b2c6a9d17
Revises: 1d4c7a9e3b52
Create Date: 2026-11-27

A nullable column, no backfill: older turns simply have no page.
"""
from alembic import op
import sqlalchemy as sa

revision = "4e8b2c6a9d17"
down_revision = "1d4c7a9e3b52"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("chat_turns", sa.Column("page_route", sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column("chat_turns", "page_route")
