"""ZHR-19/20: notification content, targets and per-recipient read state

Revision ID: i1b2c3d4e5f6
Revises: h1a2b3c4d5e6
Create Date: 2026-09-30

super_admin_notifications stored one global ``is_read`` flag and at most one org
OR one user target. This adds:

* content/sender/channel/status columns on super_admin_notifications
  (``body_html``, ``sender_name``, ``channels``, ``target_type``, ``audience``,
  ``status``, ``sent_at``) - all nullable or defaulted, nothing dropped;
* super_admin_notification_targets - the audience (org / user / role entries);
* super_admin_notification_reads - lazy per-recipient read state.

Backfill of existing rows (no row is deleted):
* ``org_registration`` rows are internal Super Admin events whose org/user
  columns mean "the org this event is ABOUT", so they become ``system`` and are
  never delivered to recipients;
* other rows with a user target -> ``user``, with only an org target ->
  ``organization`` (org admins only), and a matching target row is written;
* everything else stays ``all``; ``sent_at`` = ``created_at``.

Reversible: downgrade drops the two tables and the added columns. The legacy
``target_org_id`` / ``target_user_id`` / ``is_read`` columns are untouched, so a
rollback loses only the new data.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "i1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "h1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_T = "super_admin_notifications"


def upgrade() -> None:
    op.add_column(_T, sa.Column("body_html", sa.Text(), nullable=True))
    op.add_column(_T, sa.Column("sender_name", sa.String(120), nullable=False, server_default="Zoiko HR Admin"))
    op.add_column(_T, sa.Column("channels", sa.JSON(), nullable=True))
    op.add_column(_T, sa.Column("target_type", sa.String(20), nullable=False, server_default="all"))
    op.add_column(_T, sa.Column("audience", sa.String(20), nullable=False, server_default="org_admins"))
    op.add_column(_T, sa.Column("status", sa.String(20), nullable=False, server_default="sent"))
    op.add_column(_T, sa.Column("sent_at", sa.DateTime(), nullable=True))
    op.create_index("ix_super_admin_notifications_sent_at", _T, ["sent_at"])
    op.create_index("ix_super_admin_notifications_target_type", _T, ["target_type"])

    op.create_table(
        "super_admin_notification_targets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("notification_id", sa.Integer(), sa.ForeignKey(f"{_T}.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("ref", sa.String(50), nullable=False),
        sa.UniqueConstraint("notification_id", "kind", "ref", name="uq_notification_target"),
    )
    op.create_index("ix_super_admin_notification_targets_kind_ref",
                    "super_admin_notification_targets", ["kind", "ref"])
    op.create_index("ix_super_admin_notification_targets_notification_id",
                    "super_admin_notification_targets", ["notification_id"])

    op.create_table(
        "super_admin_notification_reads",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("notification_id", sa.Integer(), sa.ForeignKey(f"{_T}.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False),
        sa.Column("read_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("notification_id", "user_id", name="uq_notification_read"),
    )
    op.create_index("ix_super_admin_notification_reads_user_id",
                    "super_admin_notification_reads", ["user_id"])

    # -- backfill ---------------------------------------------------------
    op.execute(f"UPDATE {_T} SET sent_at = created_at WHERE sent_at IS NULL")
    op.execute(f"UPDATE {_T} SET target_type = 'system' WHERE notification_type = 'org_registration'")
    op.execute(
        f"UPDATE {_T} SET target_type = 'user' "
        f"WHERE target_type = 'all' AND target_user_id IS NOT NULL"
    )
    op.execute(
        f"UPDATE {_T} SET target_type = 'organization' "
        f"WHERE target_type = 'all' AND target_org_id IS NOT NULL"
    )
    op.execute(
        "INSERT INTO super_admin_notification_targets (notification_id, kind, ref) "
        f"SELECT id, 'user', CAST(target_user_id AS VARCHAR) FROM {_T} WHERE target_type = 'user'"
    )
    op.execute(
        "INSERT INTO super_admin_notification_targets (notification_id, kind, ref) "
        f"SELECT id, 'org', CAST(target_org_id AS VARCHAR) FROM {_T} WHERE target_type = 'organization'"
    )


def downgrade() -> None:
    op.drop_index("ix_super_admin_notification_reads_user_id", table_name="super_admin_notification_reads")
    op.drop_table("super_admin_notification_reads")
    op.drop_index("ix_super_admin_notification_targets_notification_id", table_name="super_admin_notification_targets")
    op.drop_index("ix_super_admin_notification_targets_kind_ref", table_name="super_admin_notification_targets")
    op.drop_table("super_admin_notification_targets")
    op.drop_index("ix_super_admin_notifications_target_type", table_name=_T)
    op.drop_index("ix_super_admin_notifications_sent_at", table_name=_T)
    for col in ("sent_at", "status", "audience", "target_type", "channels", "sender_name", "body_html"):
        op.drop_column(_T, col)
