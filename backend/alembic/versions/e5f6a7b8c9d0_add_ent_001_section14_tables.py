"""add ZHR-COM-ENT-001 Section 14 data-model tables

Revision ID: e5f6a7b8c9d0
Revises: d3e4f5a6b7c8
Create Date: 2026-09-08

Adds the five new ZHR-COM-ENT-001 (Section 14) entities:
  - commercial_catalog_version        versioned, immutable-after-publish catalog snapshot
  - commercial_sku                    rated catalog line (amount NULL until price approval)
  - feature_definition                stable semantic feature-key registry
  - downgrade_impact_item             concrete blockers/warnings for plan changes
  - commercial_exception_entitlement  time-bound operator-approved entitlement override (§19.1)

All five tables are fresh and additive — no existing rows are touched.
BillingAuditAction gains Python-only enum members (EXCEPTION_*); no storage
change is needed for an enum stored as a string. The app still relies on
Base.metadata.create_all (additive) at startup; this migration keeps alembic
authoritative for databases that run migrations.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'f9e8d7c6b5a4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'commercial_catalog_version',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('version', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=30), nullable=False),
        sa.Column('effective_from', sa.DateTime(), nullable=True),
        sa.Column('effective_to', sa.DateTime(), nullable=True),
        sa.Column('approved_by', sa.String(length=255), nullable=True),
        sa.Column('published_at', sa.DateTime(), nullable=True),
        sa.Column('checksum', sa.String(length=64), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_commercial_catalog_version_id', 'commercial_catalog_version', ['id'])
    op.create_index('ix_commercial_catalog_version_version', 'commercial_catalog_version', ['version'], unique=True)

    op.create_table(
        'commercial_sku',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('catalog_version_id', sa.Integer(), sa.ForeignKey('commercial_catalog_version.id'), nullable=True),
        sa.Column('code', sa.String(length=100), nullable=False),
        sa.Column('type', sa.String(length=30), nullable=False),
        sa.Column('interval', sa.String(length=20), nullable=True),
        sa.Column('currency', sa.String(length=3), nullable=True),
        sa.Column('amount_cents', sa.Integer(), nullable=True),
        sa.Column('tax_code', sa.String(length=50), nullable=True),
        sa.Column('provider_product_id', sa.String(length=255), nullable=True),
        sa.Column('provider_price_id', sa.String(length=255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_commercial_sku_id', 'commercial_sku', ['id'])
    op.create_index('ix_commercial_sku_catalog_version_id', 'commercial_sku', ['catalog_version_id'])
    op.create_unique_constraint('uq_catalog_sku_code', 'commercial_sku', ['catalog_version_id', 'code'])

    op.create_table(
        'feature_definition',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('key', sa.String(length=150), nullable=False),
        sa.Column('domain', sa.String(length=100), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('sensitivity', sa.String(length=30), nullable=False),
        sa.Column('enforcement_mode', sa.String(length=30), nullable=False),
        sa.Column('status', sa.String(length=30), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_feature_definition_id', 'feature_definition', ['id'])
    op.create_index('ix_feature_definition_key', 'feature_definition', ['key'], unique=True)

    op.create_table(
        'downgrade_impact_item',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('plan_change_id', sa.Integer(), sa.ForeignKey('billing_plan_changes.id'), nullable=True),
        sa.Column('feature_key', sa.String(length=150), nullable=False),
        sa.Column('resource_type', sa.String(length=100), nullable=True),
        sa.Column('resource_id', sa.String(length=200), nullable=True),
        sa.Column('severity', sa.String(length=30), nullable=False),
        sa.Column('remediation', sa.Text(), nullable=True),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_downgrade_impact_item_id', 'downgrade_impact_item', ['id'])
    op.create_index('ix_downgrade_impact_item_plan_change_id', 'downgrade_impact_item', ['plan_change_id'])

    op.create_table(
        'commercial_exception_entitlement',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('organization_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=False),
        sa.Column('feature_key', sa.String(length=150), nullable=False),
        sa.Column('mode', sa.String(length=30), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('requested_by', sa.String(length=255), nullable=False),
        sa.Column('approved_by', sa.String(length=255), nullable=True),
        sa.Column('starts_at', sa.DateTime(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('status', sa.String(length=30), nullable=False),
        sa.Column('rejection_reason', sa.Text(), nullable=True),
        sa.Column('rejected_by', sa.String(length=255), nullable=True),
        sa.Column('revoked_by', sa.String(length=255), nullable=True),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.Column('approved_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_commercial_exception_entitlement_id', 'commercial_exception_entitlement', ['id'])
    op.create_index('ix_commercial_exception_entitlement_organization_id', 'commercial_exception_entitlement', ['organization_id'])
    op.create_index('ix_commercial_exception_entitlement_feature_key', 'commercial_exception_entitlement', ['feature_key'])
    op.create_unique_constraint(
        'uq_exception_org_feature_window',
        'commercial_exception_entitlement',
        ['organization_id', 'feature_key', 'starts_at', 'expires_at'],
    )


def downgrade() -> None:
    op.drop_constraint('uq_exception_org_feature_window', 'commercial_exception_entitlement', type_='unique')
    op.drop_index('ix_commercial_exception_entitlement_feature_key', table_name='commercial_exception_entitlement')
    op.drop_index('ix_commercial_exception_entitlement_organization_id', table_name='commercial_exception_entitlement')
    op.drop_index('ix_commercial_exception_entitlement_id', table_name='commercial_exception_entitlement')
    op.drop_table('commercial_exception_entitlement')

    op.drop_index('ix_downgrade_impact_item_plan_change_id', table_name='downgrade_impact_item')
    op.drop_index('ix_downgrade_impact_item_id', table_name='downgrade_impact_item')
    op.drop_table('downgrade_impact_item')

    op.drop_index('ix_feature_definition_key', table_name='feature_definition')
    op.drop_index('ix_feature_definition_id', table_name='feature_definition')
    op.drop_table('feature_definition')

    op.drop_constraint('uq_catalog_sku_code', 'commercial_sku', type_='unique')
    op.drop_index('ix_commercial_sku_catalog_version_id', table_name='commercial_sku')
    op.drop_index('ix_commercial_sku_id', table_name='commercial_sku')
    op.drop_table('commercial_sku')

    op.drop_index('ix_commercial_catalog_version_version', table_name='commercial_catalog_version')
    op.drop_index('ix_commercial_catalog_version_id', table_name='commercial_catalog_version')
    op.drop_table('commercial_catalog_version')