"""merge billing_audit_logs source column and ENT-001 Phase 11 heads

Revision ID: ab6df8b648e0
Revises: 7a8b9c0d1e2f, g1f2a3b4c5d6
Create Date: 2026-09-08 15:50:14.067730

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ab6df8b648e0'
down_revision: Union[str, Sequence[str], None] = ('7a8b9c0d1e2f', 'g1f2a3b4c5d6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
