"""zhr36_organization_activity: organization activity columns on the audit ledger

Revision ID: p1c2d3e4f5a1
Revises: o1b2c3d4e5f0
Create Date: 2026-10-01

Reuses super_admin_audit_logs (the platform's one append-only ledger) for
organization activity instead of adding a second table. Adds eight nullable
columns - organization_id, actor_name, actor_role, action_type, target_label,
status, changes, error_message - and the composite indexes the Workflows
activity feed filters and sorts on. Every column is nullable, so existing
platform-level audit rows stay valid and unchanged.

Backfill: rows about an Organization (entity_type = 'Organization') get
organization_id = entity_id so they belong to the right tenant. Nothing else is
guessed.

Idempotent (a database patched by the dev auto-ALTER keeps what it has) and
reversible: downgrade drops only these columns and indexes.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "p1c2d3e4f5a1"
down_revision: Union[str, Sequence[str], None] = "o1b2c3d4e5f0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_T = "super_admin_audit_logs"
_COLUMNS = [
    ("organization_id", lambda: sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=True)),
    ("actor_name", lambda: sa.Column("actor_name", sa.String(200), nullable=True)),
    ("actor_role", lambda: sa.Column("actor_role", sa.String(50), nullable=True)),
    ("action_type", lambda: sa.Column("action_type", sa.String(100), nullable=True)),
    ("target_label", lambda: sa.Column("target_label", sa.String(300), nullable=True)),
    ("status", lambda: sa.Column("status", sa.String(20), nullable=True)),
    ("changes", lambda: sa.Column("changes", sa.JSON(), nullable=True)),
    ("error_message", lambda: sa.Column("error_message", sa.String(500), nullable=True)),
]
_INDEXES = [
    ("ix_super_admin_audit_logs_org_created", ["organization_id", "created_at"]),
    ("ix_super_admin_audit_logs_action_type_created", ["action_type", "created_at"]),
    ("ix_super_admin_audit_logs_status_created", ["status", "created_at"]),
    ("ix_super_admin_audit_logs_actor_name", ["actor_name"]),
]


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    have = {c["name"] for c in insp.get_columns(_T)}
    for name, make in _COLUMNS:
        if name not in have:
            op.add_column(_T, make())
    existing = {i["name"] for i in sa.inspect(op.get_bind()).get_indexes(_T)}
    for name, cols in _INDEXES:
        if name not in existing:
            op.create_index(name, _T, cols)
    # Organization lifecycle rows already say which organization they are about.
    op.execute(
        f"UPDATE {_T} SET organization_id = entity_id "
        f"WHERE organization_id IS NULL AND entity_type = 'Organization' AND entity_id IS NOT NULL "
        f"AND entity_id IN (SELECT id FROM organizations)"
    )


def downgrade() -> None:
    insp = sa.inspect(op.get_bind())
    existing = {i["name"] for i in insp.get_indexes(_T)}
    for name, _cols in reversed(_INDEXES):
        if name in existing:
            op.drop_index(name, table_name=_T)
    have = {c["name"] for c in insp.get_columns(_T)}
    for name, _make in reversed(_COLUMNS):
        if name in have:
            op.drop_column(_T, name)
