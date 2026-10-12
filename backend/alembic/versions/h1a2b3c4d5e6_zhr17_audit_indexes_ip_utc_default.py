"""ZHR-17: audit log filter indexes, billing audit client IP, UTC-pinned timestamps

Revision ID: h1a2b3c4d5e6
Revises: a4b5c6d7e8f9
Create Date: 2026-09-30

* Indexes on super_admin_audit_logs for every column the Audit Logs page filters
  on (created_at, performed_by_email, action, entity_type+entity_id).
* billing_audit_logs.ip_address VARCHAR(45) (45 = longest textual IPv6) so refund
  / credit / catalog actions record the client address like every other audit row.
* created_at server defaults pinned to UTC. The columns are TIMESTAMP WITHOUT TIME
  ZONE and the platform convention is naive UTC, but a bare ``now()`` default is
  converted to the *session* time zone first — correct today only because the
  database happens to run on Etc/UTC. ``timezone('utc', now())`` makes the stored
  value UTC regardless of server/session settings. Existing rows are NOT touched.

Fully reversible: downgrade restores ``now()`` defaults and drops the additions.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "h1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "a4b5c6d7e8f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_AUDIT_INDEXES = [
    ("ix_super_admin_audit_logs_created_at", ["created_at"]),
    ("ix_super_admin_audit_logs_actor_email", ["performed_by_email"]),
    ("ix_super_admin_audit_logs_action", ["action"]),
    ("ix_super_admin_audit_logs_entity", ["entity_type", "entity_id"]),
]
_UTC_DEFAULT_TABLES = [
    "super_admin_audit_logs",
    "super_admin_login_activities",
    "billing_audit_logs",
]


def _is_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    # Idempotent: a database that was patched by the dev auto-ALTER (or a partial
    # earlier run) may already have the column / indexes; skip what exists.
    insp = sa.inspect(op.get_bind())
    if "ip_address" not in {c["name"] for c in insp.get_columns("billing_audit_logs")}:
        op.add_column("billing_audit_logs", sa.Column("ip_address", sa.String(length=45), nullable=True))
    existing = {i["name"] for i in insp.get_indexes("super_admin_audit_logs")}
    for name, cols in _AUDIT_INDEXES:
        if name not in existing:
            op.create_index(name, "super_admin_audit_logs", cols)
    if _is_postgres():
        for table in _UTC_DEFAULT_TABLES:
            op.execute(
                f"ALTER TABLE {table} ALTER COLUMN created_at SET DEFAULT timezone('utc', now())"
            )


def downgrade() -> None:
    if _is_postgres():
        for table in _UTC_DEFAULT_TABLES:
            op.execute(f"ALTER TABLE {table} ALTER COLUMN created_at SET DEFAULT now()")
    for name, _cols in reversed(_AUDIT_INDEXES):
        op.drop_index(name, table_name="super_admin_audit_logs")
    op.drop_column("billing_audit_logs", "ip_address")
