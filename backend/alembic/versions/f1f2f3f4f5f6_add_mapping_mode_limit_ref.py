"""add mode and limit_ref columns to plan_entitlement_mappings (ENT-001 Phase 2)

Revision ID: f1f2f3f4f5f6
Revises: e5f6a7b8c9d0
Create Date: 2026-09-08

Phase 2 of ZHR-COM-ENT-001: the Section 14.1 outward mode vocabulary
(ENABLED / DISABLED_PLAN / READ_ONLY / ...) and an optional Section 14.1
quotas/cap limit reference now live on each plan_entitlement_mappings row.

Both columns are nullable and additive — no existing rows are touched, and
NULL means "derive the mode from the canonical state as before". The app
still relies on Base.metadata.create_all (additive) at startup; this
migration keeps alembic authoritative for databases that run migrations.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f1f2f3f4f5f6'
down_revision: Union[str, Sequence[str], None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('plan_entitlement_mappings', sa.Column('mode', sa.String(length=30), nullable=True))
    op.add_column('plan_entitlement_mappings', sa.Column('limit_ref', sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column('plan_entitlement_mappings', 'limit_ref')
    op.drop_column('plan_entitlement_mappings', 'mode')