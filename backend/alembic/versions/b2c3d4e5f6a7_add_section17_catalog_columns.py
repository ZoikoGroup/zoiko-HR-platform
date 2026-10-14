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
    # Idempotent: this project's dev-boot path (database.py's _ALTER_SQL
    # list) already adds these exact columns with IF NOT EXISTS, so a dev/
    # staging database that booted the app even once before this migration
    # runs must not crash with DuplicateColumn here.
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {col["name"] for col in inspector.get_columns("billing_plans")}

    if "published_at" not in existing:
        op.add_column('billing_plans', sa.Column('published_at', sa.DateTime(), nullable=True))
    if "tax_category" not in existing:
        op.add_column('billing_plans', sa.Column('tax_category', sa.String(length=50), nullable=True))
    if "stripe_product_id" not in existing:
        op.add_column('billing_plans', sa.Column('stripe_product_id', sa.String(length=255), nullable=True))
    if "stripe_monthly_price_id" not in existing:
        op.add_column('billing_plans', sa.Column('stripe_monthly_price_id', sa.String(length=255), nullable=True))
    if "stripe_annual_price_id" not in existing:
        op.add_column('billing_plans', sa.Column('stripe_annual_price_id', sa.String(length=255), nullable=True))

    # Existing plans default to the SaaS subscription tax category.
    op.execute("UPDATE billing_plans SET tax_category = 'saas_subscription' WHERE tax_category IS NULL")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {col["name"] for col in inspector.get_columns("billing_plans")}
    for col_name in ("stripe_annual_price_id", "stripe_monthly_price_id", "stripe_product_id", "tax_category", "published_at"):
        if col_name in existing:
            op.drop_column('billing_plans', col_name)
