"""Merge billing and support access heads

Revision ID: 7680c43804a3
Revises: 6ba6f86a4dbb, 7c8d9e0f1a2b
Create Date: 2026-10-14 18:38:10.169757

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7680c43804a3'
down_revision: Union[str, Sequence[str], None] = ('6ba6f86a4dbb', '7c8d9e0f1a2b')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
