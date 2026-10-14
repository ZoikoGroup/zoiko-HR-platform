"""privacy audit chain: immutable, tamper-evident support-access events (ZHR-PRIV-001 Phase 9)

Revision ID: 6b7c8d9e0f1a
Revises: 5a6b7c8d9e0f
Create Date: 2026-10-14

One append-only table. Each row commits (SHA-256) to the row before it, so any edit or deletion breaks the chain and
`verify_chain` reports the first row that no longer matches. The rows carry names and opaque ids only - never a tenant
field value.

On PostgreSQL a BEFORE UPDATE OR DELETE trigger refuses every change, so the table is append-only even for a mistaken
application query. Granting the application role INSERT only (and no UPDATE/DELETE) is the matching deployment action,
recorded in the privacy runbook; it is a role change, not a schema one. Reversible: downgrade drops the trigger, the
function and the table.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "6b7c8d9e0f1a"
down_revision: Union[str, Sequence[str], None] = "5a6b7c8d9e0f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = "privacy_audit_events"

APPEND_ONLY_FUNCTION = """
CREATE OR REPLACE FUNCTION zhr_privacy_audit_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'privacy audit is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;
"""

APPEND_ONLY_TRIGGER = """
CREATE TRIGGER zhr_privacy_audit_no_change
BEFORE UPDATE OR DELETE ON privacy_audit_events
FOR EACH ROW EXECUTE FUNCTION zhr_privacy_audit_append_only();
"""


def _is_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    if not sa.inspect(op.get_bind()).has_table(TABLE):
        op.create_table(
            TABLE,
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("event_type", sa.String(length=64), nullable=False),
            sa.Column("occurred_at", sa.DateTime(), nullable=False),
            sa.Column("actor_person_id", sa.Integer(), nullable=True),
            sa.Column("tenant_id", sa.Integer(), nullable=True),
            sa.Column("grant_id", sa.String(length=64), nullable=True),
            sa.Column("request_id", sa.Integer(), nullable=True),
            sa.Column("action", sa.String(length=32), nullable=True),
            sa.Column("reason", sa.String(length=64), nullable=True),
            sa.Column("payload", sa.JSON(), nullable=True),
            sa.Column("prev_hash", sa.String(length=64), nullable=False),
            sa.Column("hash", sa.String(length=64), nullable=False),
        )
        op.create_index("ix_privacy_audit_events_event_type", TABLE, ["event_type"])
        op.create_index("ix_privacy_audit_events_tenant_id", TABLE, ["tenant_id"])
        op.create_index("ix_privacy_audit_events_grant_id", TABLE, ["grant_id"])
        op.create_index("ix_privacy_audit_events_hash", TABLE, ["hash"])

    if _is_postgres():
        op.execute(APPEND_ONLY_FUNCTION)
        op.execute("DROP TRIGGER IF EXISTS zhr_privacy_audit_no_change ON privacy_audit_events;")
        op.execute(APPEND_ONLY_TRIGGER)


def downgrade() -> None:
    if _is_postgres():
        op.execute("DROP TRIGGER IF EXISTS zhr_privacy_audit_no_change ON privacy_audit_events;")
        op.execute("DROP FUNCTION IF EXISTS zhr_privacy_audit_append_only();")
    op.drop_index("ix_privacy_audit_events_hash", table_name=TABLE)
    op.drop_index("ix_privacy_audit_events_grant_id", table_name=TABLE)
    op.drop_index("ix_privacy_audit_events_tenant_id", table_name=TABLE)
    op.drop_index("ix_privacy_audit_events_event_type", table_name=TABLE)
    op.drop_table(TABLE)
