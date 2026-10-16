"""offers: remuneration type, currency, pay period, work country, employing entity

Revision ID: b5c6d7e8f9a1
Revises: d4e5f6a7b8c9
Create Date: 2026-10-16

An offer was a bare "salary" number shown in dollars. It now says what kind of pay it is (salary, stipend for an internship,
or fee), in which currency (defaulting from the work country), per what period, and which business it is with (filled in
from that business's registration / VAT number). Existing offers become salary offers; their currency is backfilled from
their organization's currency. Guarded so it is safe to run twice.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b5c6d7e8f9a1"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = [
    ("remuneration_type", lambda: sa.Column("remuneration_type", sa.String(20), nullable=False, server_default="salary")),
    ("currency", lambda: sa.Column("currency", sa.String(3), nullable=True)),
    ("pay_period", lambda: sa.Column("pay_period", sa.String(20), nullable=True)),
    ("employment_type", lambda: sa.Column("employment_type", sa.String(30), nullable=True)),
    ("work_country", lambda: sa.Column("work_country", sa.String(2), nullable=True)),
    ("entity_name", lambda: sa.Column("entity_name", sa.String(200), nullable=True)),
    ("entity_tax_id", lambda: sa.Column("entity_tax_id", sa.String(40), nullable=True)),
    ("entity_country", lambda: sa.Column("entity_country", sa.String(2), nullable=True)),
    ("entity_address", lambda: sa.Column("entity_address", sa.Text(), nullable=True)),
]


def _cols():
    insp = sa.inspect(op.get_bind())
    return {c["name"] for c in insp.get_columns("recruitment_offers")} if insp.has_table("recruitment_offers") else None


def upgrade() -> None:
    existing = _cols()
    if existing is None:
        return
    for name, make in _COLUMNS:
        if name not in existing:
            op.add_column("recruitment_offers", make())
    op.execute(
        "UPDATE recruitment_offers SET currency = "
        "(SELECT organizations.currency FROM organizations WHERE organizations.id = recruitment_offers.organization_id) "
        "WHERE currency IS NULL"
    )
    op.execute("UPDATE recruitment_offers SET pay_period = 'annual' WHERE pay_period IS NULL")


def downgrade() -> None:
    existing = _cols() or set()
    for name, _ in reversed(_COLUMNS):
        if name in existing:
            op.drop_column("recruitment_offers", name)
