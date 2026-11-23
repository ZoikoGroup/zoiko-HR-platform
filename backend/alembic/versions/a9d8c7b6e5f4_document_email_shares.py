"""Company documents can be shared by email (hr_document_shares + hr_document_share_recipients)

Revision ID: a9d8c7b6e5f4
Revises: c2d3e4f5a6b7
Create Date: 2026-11-23

Company Documents P4. A share records what was sent (the file ids are fixed at send time), how (portal link or
attachment), the optional message, and one row per recipient with its own delivery status, so failed deliveries can be
retried and admins can see who received what. No existing table changes.

After upgrading, run scripts/privacy_apply_rls.py (new tenant tables) as for every table-adding migration.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a9d8c7b6e5f4"
down_revision: Union[str, Sequence[str], None] = "c2d3e4f5a6b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(name)


def _has_index(table: str, name: str) -> bool:
    return name in {i["name"] for i in sa.inspect(op.get_bind()).get_indexes(table)}


def upgrade() -> None:
    # A development boot creates missing model tables (Base.metadata.create_all), so either table may already exist:
    # create only what is missing.
    if not _has_table("hr_document_shares"):
        _create_shares()
    for name, cols in (("ix_hr_document_shares_organization_id", ["organization_id"]),
                       ("ix_hds_target", ["organization_id", "target_type", "target_id"])):
        if not _has_index("hr_document_shares", name):
            op.create_index(name, "hr_document_shares", cols)
    if not _has_table("hr_document_share_recipients"):
        _create_recipients()
    for name, cols in (("ix_hr_document_share_recipients_share_id", ["share_id"]),
                       ("ix_hr_document_share_recipients_organization_id", ["organization_id"])):
        if not _has_index("hr_document_share_recipients", name):
            op.create_index(name, "hr_document_share_recipients", cols)


def _create_shares() -> None:
    op.create_table(
        "hr_document_shares",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("target_type", sa.String(10), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=False),
        sa.Column("target_name", sa.String(255), nullable=False),
        sa.Column("mode", sa.String(12), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("grant_portal_access", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("document_ids", sa.JSON(), nullable=False),
        sa.Column("total_bytes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(10), nullable=False, server_default="sending"),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def _create_recipients() -> None:
    op.create_table(
        "hr_document_share_recipients",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("share_id", sa.Integer(), sa.ForeignKey("hr_document_shares.id", ondelete="CASCADE"), nullable=False),
        sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("status", sa.String(10), nullable=False, server_default="pending"),
        sa.Column("error", sa.String(500), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_attempt_at", sa.DateTime(), nullable=True),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    for name in ("hr_document_share_recipients", "hr_document_shares"):
        if _has_table(name):
            op.drop_table(name)
