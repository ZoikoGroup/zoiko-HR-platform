"""create plan_entitlement_mappings

Revision ID: a1b2c3d4e5f6
Revises: 17aefc359dab
Create Date: 2026-09-03

Creates the plan_entitlement_mappings table, which stores the approved
plan→feature entitlement decisions (Section 20). Ships EMPTY — populated
only via an explicit, approved seed process.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '17aefc359dab'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'plan_entitlement_mappings',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('plan_code', sa.String(length=50), nullable=False),
        sa.Column('feature_key', sa.String(length=150), nullable=False),
        sa.Column('state', sa.String(length=30), nullable=False),
        sa.Column('catalog_version', sa.String(length=50), nullable=False),
        sa.Column('approved_by', sa.String(length=255), nullable=False),
        sa.Column('approved_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.UniqueConstraint('plan_code', 'feature_key', 'catalog_version', name='uq_plan_feature_catalog'),
    )


def downgrade() -> None:
    op.drop_table('plan_entitlement_mappings')
