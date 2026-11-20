"""merge onboarding docs and email identity heads

Revision ID: 4f39f5164151
Revises: 91a7c4e2b6d0, d1e2f3a4b5c6
Create Date: 2026-11-19 22:26:45.048057

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4f39f5164151'
down_revision: Union[str, Sequence[str], None] = ('91a7c4e2b6d0', 'd1e2f3a4b5c6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
