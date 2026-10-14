"""row-level security policies on every tenant table (ZHR-PRIV-001 C02, C04)

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-10-14

PostgreSQL only (a no-op on SQLite, which has no row-level security).

ENABLEs row-level security and creates the `zhr_tenant_isolation` policy on every tenant table, from the classification registry
(app/core/privacy/rls.py): a row is visible only when its organization_id equals the transaction's `app.tenant_id` (no setting -> no
rows), and Zoiko's own records about a tenant are also visible when `app.plane = 'PLATFORM'`.

This migration does NOT FORCE row-level security unless HR_RLS_FORCE=true is set when it runs. ENABLE alone does not bind a table's
OWNER, so while the application still connects as the owner nothing changes for it. Switching the application to the
`zhr_app_tenant` / `zhr_app_platform` roles (scripts/privacy_db_roles.sql) is what makes the policies bind, and that switch needs
the cross-tenant code paths (sign-in lookup by e-mail, platform account management, schedulers) moved behind their own
allow-listed role first. See docs/privacy/trust_boundary.md.

Re-run `python scripts/privacy_apply_rls.py` after adding a tenant table (a CI test fails until you do).

Reversible: downgrade drops the policies and disables row-level security again.
"""
import os
from typing import Sequence, Union

from alembic import op

revision: str = "d5e6f7a8b9c0"
down_revision: Union[str, Sequence[str], None] = "c4d5e6f7a8b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _plan(conn):
    import app.main  # noqa: F401  (registers every model)
    from app.core.privacy import rls
    from app.database import Base
    existing = {r[0] for r in conn.exec_driver_sql("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")}
    return rls, [p for p in rls.policy_plan(Base.metadata) if p["table"] in existing]


def upgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        return
    rls, plan = _plan(conn)
    force = os.environ.get("HR_RLS_FORCE", "").lower() in ("1", "true", "yes")
    for stmt in rls.enable_sql(plan, force=force):
        op.execute(stmt)


def downgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        return
    rls, plan = _plan(conn)
    for stmt in rls.disable_sql(plan):
        op.execute(stmt)
