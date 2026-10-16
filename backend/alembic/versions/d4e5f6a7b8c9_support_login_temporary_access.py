"""temporary read-only support sign-ins

Revision ID: d4e5f6a7b8c9
Revises: 7680c43804a3
Create Date: 2026-10-16

Three tables for just-in-time support access through temporary credentials: the request an operator makes and the
organization admin decides (support_login_requests), the temporary sign-in issued for it (support_login_sessions; the
password is stored only as a bcrypt hash), and the per-request access log the organization's admins can review
(support_login_access_log). Guarded so it is safe on a database where create_all already made them.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "7680c43804a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has(table: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table)


def upgrade() -> None:
    if not _has("support_login_requests"):
        op.create_table(
            "support_login_requests",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("reference", sa.String(30), nullable=False, unique=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("requested_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
            sa.Column("requested_by_email", sa.String(255), nullable=True),
            sa.Column("justification", sa.Text(), nullable=False),
            sa.Column("ticket_reference", sa.String(100), nullable=True),
            sa.Column("duration_minutes", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(20), nullable=False, server_default="PENDING"),
            sa.Column("decided_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("decided_by_email", sa.String(255), nullable=True),
            sa.Column("decided_at", sa.DateTime(), nullable=True),
            sa.Column("decision_note", sa.Text(), nullable=True),
            sa.Column("pending_expires_at", sa.DateTime(), nullable=False),
            sa.Column("approval_expires_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index("ix_support_login_requests_id", "support_login_requests", ["id"])
        op.create_index("ix_support_login_requests_organization_id", "support_login_requests", ["organization_id"])
        op.create_index("ix_support_login_requests_status", "support_login_requests", ["status"])

    if not _has("support_login_sessions"):
        op.create_table(
            "support_login_sessions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("request_id", sa.Integer(), sa.ForeignKey("support_login_requests.id"), nullable=False, unique=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("acting_user_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
            sa.Column("username", sa.String(255), nullable=False, unique=True),
            sa.Column("password_hash", sa.String(255), nullable=False),
            sa.Column("issued_at", sa.DateTime(), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("first_login_at", sa.DateTime(), nullable=True),
            sa.Column("last_seen_at", sa.DateTime(), nullable=True),
            sa.Column("ended_at", sa.DateTime(), nullable=True),
            sa.Column("ended_by_email", sa.String(255), nullable=True),
            sa.Column("end_cause", sa.String(40), nullable=True),
            sa.Column("request_count", sa.Integer(), nullable=False, server_default="0"),
        )
        op.create_index("ix_support_login_sessions_id", "support_login_sessions", ["id"])
        op.create_index("ix_support_login_sessions_organization_id", "support_login_sessions", ["organization_id"])

    if not _has("support_login_access_log"):
        op.create_table(
            "support_login_access_log",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("session_id", sa.Integer(), sa.ForeignKey("support_login_sessions.id"), nullable=False),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("method", sa.String(10), nullable=False),
            sa.Column("path", sa.String(500), nullable=False),
            sa.Column("outcome", sa.String(20), nullable=False),
            sa.Column("at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_support_login_access_log_id", "support_login_access_log", ["id"])
        op.create_index("ix_support_login_access_log_organization_id", "support_login_access_log", ["organization_id"])
        op.create_index("ix_support_login_access_log_session_at", "support_login_access_log", ["session_id", "at"])


def downgrade() -> None:
    for table in ("support_login_access_log", "support_login_sessions", "support_login_requests"):
        if _has(table):
            op.drop_table(table)
