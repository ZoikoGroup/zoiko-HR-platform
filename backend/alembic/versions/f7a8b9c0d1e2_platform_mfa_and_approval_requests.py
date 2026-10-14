"""second factor columns for platform accounts and the dual-control approval table (ZHR-PRIV-001 B02, B06, D09)

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-10-14

Idempotent: each column is added only when it is missing (some databases already received the MFA columns from an earlier ad-hoc
script), and the table only when it does not exist. Reversible: downgrade drops what this migration added (the MFA columns only
when they carry no enrolled factor, so an already-enrolled account is never silently un-enrolled).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f7a8b9c0d1e2"
down_revision: Union[str, Sequence[str], None] = "e6f7a8b9c0d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUMNS = (
    ("mfa_enabled", sa.Boolean(), {"nullable": False, "server_default": sa.false()}),
    ("mfa_secret", sa.String(255), {"nullable": True}),
    ("mfa_enrolled_at", sa.DateTime(), {"nullable": True}),
    ("mfa_last_step", sa.Integer(), {"nullable": True}),
)


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing = {c["name"] for c in insp.get_columns("employees")}
    for name, type_, kw in COLUMNS:
        if name not in existing:
            op.add_column("employees", sa.Column(name, type_, **kw))
    if "privacy_approval_requests" not in insp.get_table_names():
        op.create_table(
            "privacy_approval_requests",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("kind", sa.String(60), nullable=False),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=True),
            sa.Column("requested_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
            sa.Column("approver_plane", sa.String(20), nullable=False, server_default="PLATFORM"),
            sa.Column("payload", sa.JSON(), nullable=True),
            sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
            sa.Column("decided_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("decided_at", sa.DateTime(), nullable=True),
            sa.Column("executed_at", sa.DateTime(), nullable=True),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index("ix_privacy_approval_requests_id", "privacy_approval_requests", ["id"])
        op.create_index("ix_privacy_approval_requests_kind", "privacy_approval_requests", ["kind"])
        op.create_index("ix_privacy_approval_requests_organization_id", "privacy_approval_requests", ["organization_id"])
        op.create_index("ix_privacy_approval_requests_status", "privacy_approval_requests", ["status"])


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "privacy_approval_requests" in insp.get_table_names():
        op.drop_table("privacy_approval_requests")
    existing = {c["name"] for c in insp.get_columns("employees")}
    enrolled = 0
    if "mfa_enabled" in existing:
        enrolled = bind.execute(sa.text("SELECT count(*) FROM employees WHERE mfa_enabled = :t"), {"t": True}).scalar() or 0
    if enrolled:
        return                                                    # keep the columns: dropping them would un-enrol real accounts
    for name, _t, _kw in COLUMNS:
        if name in existing:
            op.drop_column("employees", name)
