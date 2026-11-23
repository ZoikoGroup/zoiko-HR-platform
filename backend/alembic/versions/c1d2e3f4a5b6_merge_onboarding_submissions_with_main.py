"""Merge heads: offer-accepted welcome + onboarding submissions (rugvedh) with main's documents / attendance / assets chain

Revision ID: c1d2e3f4a5b6
Revises: b0c1d2e3f4a5, f8a9b0c1d2e4
Create Date: 2026-11-20

No schema change. The rugvedh branch touches onboarding_settings, recruitment_offers and onboarding_documents; main's new
revisions touch documents, attendance and assets tables, so their order does not matter. This revision only gives Alembic
a single head again.
"""
from typing import Sequence, Union

revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, Sequence[str], None] = ("b0c1d2e3f4a5", "f8a9b0c1d2e4")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
