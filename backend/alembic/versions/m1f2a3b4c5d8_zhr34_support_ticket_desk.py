"""zhr34_support_ticket_desk: priority/assignee on chat_handoffs + replies table

Revision ID: m1f2a3b4c5d8
Revises: l1e2f3a4b5c7
Create Date: 2026-10-01

Adds priority, assigned_to, updated_at to chat_handoffs and a new
chat_handoff_messages table. Existing tickets keep working (priority defaults
to 'normal'). Rollback (alembic downgrade l1e2f3a4b5c7) drops only these.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "m1f2a3b4c5d8"
down_revision: Union[str, Sequence[str], None] = "l1e2f3a4b5c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    cols = {c["name"] for c in insp.get_columns("chat_handoffs")}
    if "priority" not in cols:
        op.add_column("chat_handoffs", sa.Column("priority", sa.String(20), nullable=False, server_default="normal"))
    if "assigned_to" not in cols:
        op.add_column("chat_handoffs", sa.Column("assigned_to", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True))
        op.create_index("ix_chat_handoffs_assigned_to", "chat_handoffs", ["assigned_to"])
    if "updated_at" not in cols:
        op.add_column("chat_handoffs", sa.Column("updated_at", sa.DateTime(), nullable=True))
    if not insp.has_table("chat_handoff_messages"):
        op.create_table(
            "chat_handoff_messages",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("handoff_id", sa.Integer(), sa.ForeignKey("chat_handoffs.id"), nullable=False),
            sa.Column("author_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
            sa.Column("author_role", sa.String(20), nullable=False, server_default="staff"),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index("ix_chat_handoff_messages_handoff_id", "chat_handoff_messages", ["handoff_id"])


def downgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if insp.has_table("chat_handoff_messages"):
        op.drop_table("chat_handoff_messages")
    cols = {c["name"] for c in insp.get_columns("chat_handoffs")}
    if "updated_at" in cols:
        op.drop_column("chat_handoffs", "updated_at")
    if "assigned_to" in cols:
        op.drop_index("ix_chat_handoffs_assigned_to", table_name="chat_handoffs")
        op.drop_column("chat_handoffs", "assigned_to")
    if "priority" in cols:
        op.drop_column("chat_handoffs", "priority")
