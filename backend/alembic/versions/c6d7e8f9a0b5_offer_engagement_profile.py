"""Offer type: recruitment_offers.engagement_profile_slug

Revision ID: c6d7e8f9a0b5
Revises: c6d7e8f9a0b4
Create Date: 2026-11-18

The offer records which Onboarding engagement profile (offer type, e.g. "Full-time employee", "Associate programme") it was
made on. The 10 onboarding documents of the new hire use that profile's terms (notice, probation, pay wording, schedule)
unless HR picks another one in the package panel.
"""
import sqlalchemy as sa
from alembic import op

revision = "c6d7e8f9a0b5"
down_revision = "c6d7e8f9a0b4"
branch_labels = None
depends_on = None


def upgrade():
    cols = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("recruitment_offers")}
    if "engagement_profile_slug" not in cols:
        op.add_column("recruitment_offers", sa.Column("engagement_profile_slug", sa.String(60), nullable=True))


def downgrade():
    op.drop_column("recruitment_offers", "engagement_profile_slug")
