"""add Section 17 catalog columns to billing_plans

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-09-03

Adds append-only publication state + provider IDs + per-SKU tax category to
BillingPlan (Section 17 / Section 11 H5). All new columns are additive and
nullable/backfilled so existing rows are untouched — existing plans remain
DRAFT (published_at NULL).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('billing_plans', sa.Column('published_at', sa.DateTime(), nullable=True))
    op.add_column('billing_plans', sa.Column('tax_category', sa.String(length=50), nullable=True))
    op.add_column('billing_plans', sa.Column('stripe_product_id', sa.String(length=255), nullable=True))
    op.add_column('billing_plans', sa.Column('stripe_monthly_price_id', sa.String(length=255), nullable=True))
    op.add_column('billing_plans', sa.Column('stripe_annual_price_id', sa.String(length=255), nullable=True))

    # Existing plans default to the SaaS subscription tax category.
    op.execute("UPDATE billing_plans SET tax_category = 'saas_subscription' WHERE tax_category IS NULL")


def downgrade() -> None:
    op.drop_column('billing_plans', 'stripe_annual_price_id')
    op.drop_column('billing_plans', 'stripe_monthly_price_id')
    op.drop_column('billing_plans', 'stripe_product_id')
    op.drop_column('billing_plans', 'tax_category')
    op.drop_column('billing_plans', 'published_at')
