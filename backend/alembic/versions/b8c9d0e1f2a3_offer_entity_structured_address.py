"""offers: the contracting entity's ID type and a structured address

Revision ID: b8c9d0e1f2a3
Revises: f1e2d3c4b5a6
Create Date: 2026-10-16

The entity is now identified and addressed the way its country does it: which number it is (GSTIN, EIN, ABN, TRN,
VAT...) and city / state-province-emirate / postal code next to the street lines (app/core/business_ids.py).
Guarded so it is safe to run twice.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b8c9d0e1f2a3"
down_revision: Union[str, Sequence[str], None] = "f1e2d3c4b5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = [
    lambda: sa.Column("entity_id_type", sa.String(30), nullable=True),
    lambda: sa.Column("entity_city", sa.String(120), nullable=True),
    lambda: sa.Column("entity_region", sa.String(120), nullable=True),
    lambda: sa.Column("entity_postal_code", sa.String(20), nullable=True),
]


def _cols():
    insp = sa.inspect(op.get_bind())
    return {c["name"] for c in insp.get_columns("recruitment_offers")} if insp.has_table("recruitment_offers") else None


def upgrade() -> None:
    existing = _cols()
    if existing is None:
        return
    for make in _COLUMNS:
        col = make()
        if col.name not in existing:
            op.add_column("recruitment_offers", col)


def downgrade() -> None:
    existing = _cols() or set()
    for make in reversed(_COLUMNS):
        name = make().name
        if name in existing:
            op.drop_column("recruitment_offers", name)
