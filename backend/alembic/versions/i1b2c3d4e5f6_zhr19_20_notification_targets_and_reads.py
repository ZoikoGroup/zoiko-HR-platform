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
    # Idempotent: a database that was already patched (dev auto-ALTER / create_all,
    # or a partial earlier attempt) keeps what it has; only the missing pieces are added.
    insp = sa.inspect(op.get_bind())
    cols = {c["name"] for c in insp.get_columns(_T)}

    def add(name, column):
        if name not in cols:
            op.add_column(_T, column)

    add("body_html", sa.Column("body_html", sa.Text(), nullable=True))
    add("sender_name", sa.Column("sender_name", sa.String(120), nullable=False, server_default="Zoiko HR Admin"))
    add("channels", sa.Column("channels", sa.JSON(), nullable=True))
    add("target_type", sa.Column("target_type", sa.String(20), nullable=False, server_default="all"))
    add("audience", sa.Column("audience", sa.String(20), nullable=False, server_default="org_admins"))
    add("status", sa.Column("status", sa.String(20), nullable=False, server_default="sent"))
    add("sent_at", sa.Column("sent_at", sa.DateTime(), nullable=True))
    have_idx = {i["name"] for i in insp.get_indexes(_T)}
    for idx, col in (("ix_super_admin_notifications_sent_at", "sent_at"), ("ix_super_admin_notifications_target_type", "target_type")):
        if idx not in have_idx:
            op.create_index(idx, _T, [col])

    if not insp.has_table("super_admin_notification_targets"):
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

    if not insp.has_table("super_admin_notification_reads"):
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

    # -- backfill (each statement is safe to repeat) ----------------------
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
        f"SELECT n.id, 'user', CAST(n.target_user_id AS VARCHAR) FROM {_T} n WHERE n.target_type = 'user' "
        "AND NOT EXISTS (SELECT 1 FROM super_admin_notification_targets t "
        "WHERE t.notification_id = n.id AND t.kind = 'user' AND t.ref = CAST(n.target_user_id AS VARCHAR))"
    )
    op.execute(
        "INSERT INTO super_admin_notification_targets (notification_id, kind, ref) "
        f"SELECT n.id, 'org', CAST(n.target_org_id AS VARCHAR) FROM {_T} n WHERE n.target_type = 'organization' "
        "AND NOT EXISTS (SELECT 1 FROM super_admin_notification_targets t "
        "WHERE t.notification_id = n.id AND t.kind = 'org' AND t.ref = CAST(n.target_org_id AS VARCHAR))"
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
