"""add delinquency, support-access and confirmation-token tables

Revision ID: c9d0e1f2a3b4
Revises: b2c3d4e5f6a7
Create Date: 2026-09-04

Adds the Section 10 G1-G5 delinquency lifecycle, Section 18 O3 support-access
and the two-step confirmation-token tables. All three tables are fresh and
additive — no existing rows are touched. The app itself relies on
Base.metadata.create_all (additive) at startup; this migration keeps alembic
authoritative for databases that run migrations.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c9d0e1f2a3b4'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'billing_delinquency_cases',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('organization_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('stage', sa.String(length=50), nullable=False),
        sa.Column('stripe_event_id', sa.String(length=255), nullable=True),
        sa.Column('failed_at', sa.DateTime(), nullable=False),
        sa.Column('recovered_at', sa.DateTime(), nullable=True),
        sa.Column('terminated_at', sa.DateTime(), nullable=True),
        sa.Column('retention_hold_until', sa.DateTime(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_billing_delinquency_cases_organization_id', 'billing_delinquency_cases', ['organization_id'])

    op.create_table(
        'billing_support_access_grants',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('organization_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=False),
        sa.Column('token_hash', sa.String(length=128), nullable=False, unique=True),
        sa.Column('granted_by', sa.String(length=255), nullable=False),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.Column('revoked_by', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_billing_support_access_grants_organization_id', 'billing_support_access_grants', ['organization_id'])

    op.create_table(
        'billing_confirmation_tokens',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('organization_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=False),
        sa.Column('purpose', sa.String(length=100), nullable=False),
        sa.Column('token_hash', sa.String(length=128), nullable=False, unique=True),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('actor_id', sa.Integer(), sa.ForeignKey('employees.id'), nullable=True),
        sa.Column('actor_email', sa.String(length=255), nullable=True),
        sa.Column('consumed_at', sa.DateTime(), nullable=True),
        sa.Column('token_metadata', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_billing_confirmation_tokens_organization_id', 'billing_confirmation_tokens', ['organization_id'])


def downgrade() -> None:
    op.drop_index('ix_billing_confirmation_tokens_organization_id', table_name='billing_confirmation_tokens')
    op.drop_table('billing_confirmation_tokens')
    op.drop_index('ix_billing_support_access_grants_organization_id', table_name='billing_support_access_grants')
    op.drop_table('billing_support_access_grants')
    op.drop_index('ix_billing_delinquency_cases_organization_id', table_name='billing_delinquency_cases')
    op.drop_table('billing_delinquency_cases')
