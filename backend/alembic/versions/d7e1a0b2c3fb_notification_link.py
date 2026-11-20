"""super_admin_notifications.link: the in-app page a notification opens (A5, QA report 10 Nov 2026)

Revision ID: d7e1a0b2c3fb
Revises: d7e1a0b2c3fa
Create Date: 2026-11-11

Employee-facing HR notifications (leave approved / rejected, new request awaiting approval, …) link to the record they are
about. Nullable, so every existing notification is unchanged. Guarded like the previous revision: a database where the
column already exists (create_all) is left as it is.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d7e1a0b2c3fb"
down_revision: Union[str, Sequence[str], None] = "d7e1a0b2c3fa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE, COLUMN = "super_admin_notifications", "link"


def _has_column(bind) -> bool:
    insp = sa.inspect(bind)
    return TABLE in insp.get_table_names() and COLUMN in {c["name"] for c in insp.get_columns(TABLE)}


def upgrade() -> None:
    bind = op.get_bind()
    if TABLE in sa.inspect(bind).get_table_names() and not _has_column(bind):
        op.add_column(TABLE, sa.Column(COLUMN, sa.String(300), nullable=True))


def downgrade() -> None:
    if _has_column(op.get_bind()):
        op.drop_column(TABLE, COLUMN)
