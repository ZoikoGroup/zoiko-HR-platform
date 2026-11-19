"""Candidate country, state / region and city

Revision ID: c6d7e8f9a0b6
Revises: c6d7e8f9a0b5
Create Date: 2026-11-18

The Add candidate form asks for the country, state / region and city separately; recruitment_candidates.location stays the
display text and is built from them.
"""
import sqlalchemy as sa
from alembic import op

revision = "c6d7e8f9a0b6"
down_revision = "c6d7e8f9a0b5"
branch_labels = None
depends_on = None

COLUMNS = (("country", 2), ("region", 120), ("city", 120))


def upgrade():
    have = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("recruitment_candidates")}
    for name, size in COLUMNS:
        if name not in have:
            op.add_column("recruitment_candidates", sa.Column(name, sa.String(size), nullable=True))


def downgrade():
    for name, _size in reversed(COLUMNS):
        op.drop_column("recruitment_candidates", name)
