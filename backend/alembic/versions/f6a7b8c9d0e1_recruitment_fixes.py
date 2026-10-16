"""recruitment: hire time, requisition requirements + requester, interview time zone / link / location

Revision ID: f6a7b8c9d0e1
Revises: b5c6d7e8f9a1
Create Date: 2026-10-16

  * recruitment_candidates.hired_at: when the candidate became hired. Time-to-hire used updated_at, which moves on every
    later edit. Backfilled from updated_at for candidates already hired (the best value there is).
  * recruitment_requisitions.requirements: the form had a Requirements field that was never stored.
  * recruitment_requisitions.created_by: who raised the requisition, so they can be told when it is approved or rejected.
  * recruitment_interviews.timezone / meeting_link / location: needed for the interview invitation emails.
Guarded so it is safe to run twice.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, Sequence[str], None] = "b5c6d7e8f9a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ADD = {
    "recruitment_candidates": [lambda: sa.Column("hired_at", sa.DateTime(), nullable=True)],
    "recruitment_requisitions": [
        lambda: sa.Column("requirements", sa.Text(), nullable=True),
        lambda: sa.Column("created_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
    ],
    "recruitment_interviews": [
        lambda: sa.Column("timezone", sa.String(64), nullable=True),
        lambda: sa.Column("meeting_link", sa.String(500), nullable=True),
        lambda: sa.Column("location", sa.String(255), nullable=True),
    ],
}


def _cols(table):
    insp = sa.inspect(op.get_bind())
    return {c["name"] for c in insp.get_columns(table)} if insp.has_table(table) else None


def upgrade() -> None:
    for table, makers in _ADD.items():
        existing = _cols(table)
        if existing is None:
            continue
        for make in makers:
            col = make()
            if col.name not in existing:
                op.add_column(table, col)
    if _cols("recruitment_candidates") is not None:
        op.execute("UPDATE recruitment_candidates SET hired_at = COALESCE(updated_at, created_at) "
                   "WHERE hired_at IS NULL AND status = 'HIRED'")


def downgrade() -> None:
    for table, makers in _ADD.items():
        existing = _cols(table) or set()
        for make in reversed(makers):
            name = make().name
            if name in existing:
                op.drop_column(table, name)
