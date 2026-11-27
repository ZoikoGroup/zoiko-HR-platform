"""Index organization_id on the seven organisation tables that had none

Every tenant query filters on organization_id (the tenant scope adds it to each SELECT), so these tables were scanned in
full as they grow. Idempotent (skips a missing table, column or existing index) and reversible.

Revision ID: p7e1a2b3c4d9
Revises: 1d4c7a9e3b52
Create Date: 2026-11-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "p7e1a2b3c4d9"
down_revision: Union[str, Sequence[str], None] = "1d4c7a9e3b52"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("billing_idempotency_keys", "billing_worker_states", "offboarding_exit_interviews", "offboarding_settlements",
          "security_action_tokens", "super_admin_approval_history", "super_admin_incidents")


def _name(table: str) -> str:
    return f"ix_{table}_org_id_perf"[:63]


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    for t in TABLES:
        if not insp.has_table(t) or "organization_id" not in {c["name"] for c in insp.get_columns(t)}:
            continue
        existing = insp.get_indexes(t)
        if any((ix.get("column_names") or [None])[0] == "organization_id" for ix in existing):
            continue
        op.create_index(_name(t), t, ["organization_id"])


def downgrade() -> None:
    insp = sa.inspect(op.get_bind())
    for t in TABLES:
        if insp.has_table(t) and any(ix["name"] == _name(t) for ix in insp.get_indexes(t)):
            op.drop_index(_name(t), table_name=t)
