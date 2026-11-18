"""recruitment_offers.equity: VARCHAR(50) -> NUMERIC(5,2), a percentage from 0 to 100 (QA #13 BUG-23)

Revision ID: c6d7e8f9a0b3
Revises: c6d7e8f9a0b2
Create Date: 2026-11-17

Each stored value that reads as a percentage from 0 to 100 with at most two decimals ("0.25", "1.5 %") is kept as that
number; anything else ("-20000", "a lot", "150") becomes NULL and its offer id is written to the migration log, so HR can
re-enter it. PostgreSQL only (SQLite test databases are created from the models). Downgrade turns the numbers back into text.
"""
import logging
from decimal import Decimal, InvalidOperation

import sqlalchemy as sa
from alembic import op

revision = "c6d7e8f9a0b3"
down_revision = "c6d7e8f9a0b2"
branch_labels = None
depends_on = None

log = logging.getLogger("alembic.runtime.migration")


def _as_percent(text):
    try:
        pct = Decimal(str(text).strip().rstrip("%").strip())
    except (InvalidOperation, ValueError):
        return None
    if not pct.is_finite() or pct < 0 or pct > 100 or pct != pct.quantize(Decimal("0.01")):
        return None
    return pct.quantize(Decimal("0.01"))


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    insp = sa.inspect(bind)
    if not insp.has_table("recruitment_offers"):
        return
    col = next((c for c in insp.get_columns("recruitment_offers") if c["name"] == "equity"), None)
    if col is None or isinstance(col["type"], sa.Numeric):
        return
    rows = bind.execute(sa.text("SELECT id, equity FROM recruitment_offers WHERE equity IS NOT NULL AND TRIM(equity) <> ''")).fetchall()
    cleared = []
    for row_id, value in rows:
        pct = _as_percent(value)
        if pct is None:
            cleared.append(row_id)
            bind.execute(sa.text("UPDATE recruitment_offers SET equity = NULL WHERE id = :i"), {"i": row_id})
        else:
            bind.execute(sa.text("UPDATE recruitment_offers SET equity = :v WHERE id = :i"), {"v": str(pct), "i": row_id})
    bind.execute(sa.text("UPDATE recruitment_offers SET equity = NULL WHERE TRIM(equity) = ''"))
    if cleared:
        log.warning("recruitment_offers.equity: %d value(s) were not a 0-100 percentage and were cleared; offer ids: %s",
                    len(cleared), ", ".join(str(i) for i in cleared))
    op.execute("ALTER TABLE recruitment_offers ALTER COLUMN equity TYPE NUMERIC(5,2) USING equity::numeric(5,2)")


def downgrade():
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.execute("ALTER TABLE recruitment_offers ALTER COLUMN equity TYPE VARCHAR(50) USING equity::text")
