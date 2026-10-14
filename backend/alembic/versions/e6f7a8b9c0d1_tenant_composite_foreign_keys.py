"""composite (reference, organization_id) foreign keys between tenant tables (ZHR-PRIV-001 C03)

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-10-14

PostgreSQL only. For every foreign key between two tenant tables, adds a composite foreign key (column, organization_id) ->
(id, organization_id) so a row of one organization cannot reference a row of another. Each parent table gets a UNIQUE (id,
organization_id) constraint to point at. The new keys are added NOT VALID: they are enforced for every new and changed row at once,
while existing rows are left alone. Run `python scripts/privacy_check_cross_tenant.py` to list any existing cross-tenant reference
(it never changes data); once the list is empty or handled, validate with `ALTER TABLE <child> VALIDATE CONSTRAINT <name>`.

Reversible: downgrade drops the composite keys and the unique constraints again.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "e6f7a8b9c0d1"
down_revision: Union[str, Sequence[str], None] = "d5e6f7a8b9c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _pairs(conn):
    import app.main  # noqa: F401
    from app.core.privacy import rls
    from app.database import Base
    existing = {r[0] for r in conn.exec_driver_sql("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")}
    return rls, [p for p in rls.tenant_fk_pairs(Base.metadata) if p["child"] in existing and p["parent"] in existing]


def upgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        return
    rls, pairs = _pairs(conn)
    major = int(conn.exec_driver_sql("SHOW server_version_num").scalar()) // 10000
    for stmt in rls.composite_fk_sql(pairs, pg_major=major):
        op.execute(stmt)


def downgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        return
    rls, pairs = _pairs(conn)
    for stmt in rls.composite_fk_drop_sql(pairs):
        op.execute(stmt)
