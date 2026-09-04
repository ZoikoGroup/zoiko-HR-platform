"""merge is_public and billing heads

Revision ID: 6ba6f86a4dbb
Revises: c3d4e5f6a7b8, b2c3d4e5f6a7
Create Date: 2026-09-04 12:13:37.381771

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6ba6f86a4dbb'
down_revision: Union[str, Sequence[str], None] = ('c3d4e5f6a7b8', 'b2c3d4e5f6a7')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
