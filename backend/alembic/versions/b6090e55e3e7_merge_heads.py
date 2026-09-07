"""merge heads

Revision ID: b6090e55e3e7
Revises: a1f3c9d02b7e, c9d0e1f2a3b4
Create Date: 2026-09-07 14:35:51.932880

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b6090e55e3e7'
down_revision: Union[str, Sequence[str], None] = ('a1f3c9d02b7e', 'c9d0e1f2a3b4')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
