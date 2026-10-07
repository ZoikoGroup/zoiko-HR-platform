"""travel_settings.approval_workflow: room for the longest workflow name

Revision ID: u1a2b3c4d5e7
Revises: t1a2b3c4d5e6
Create Date: 2026-10-07

The column was VARCHAR(20) but the option "manager+director+finance" is 24 characters, so choosing it made the database
refuse the save ("value too long for type character varying(20)") and the page reported that the settings failed to
save. Widen the column to 50. Idempotent and reversible (the downgrade is only safe while no value is longer than 20).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "u1a2b3c4d5e7"
down_revision: Union[str, Sequence[str], None] = "t1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_T, _C = "travel_settings", "approval_workflow"


def _length():
    insp = sa.inspect(op.get_bind())
    if not insp.has_table(_T):
        return None
    for col in insp.get_columns(_T):
        if col["name"] == _C:
            return getattr(col["type"], "length", None)
    return None


def upgrade() -> None:
    length = _length()
    if length is not None and length < 50:
        with op.batch_alter_table(_T) as batch:
            batch.alter_column(_C, existing_type=sa.String(length), type_=sa.String(50), existing_nullable=True)


def downgrade() -> None:
    length = _length()
    if length is not None and length > 20:
        with op.batch_alter_table(_T) as batch:
            batch.alter_column(_C, existing_type=sa.String(length), type_=sa.String(20), existing_nullable=True)
