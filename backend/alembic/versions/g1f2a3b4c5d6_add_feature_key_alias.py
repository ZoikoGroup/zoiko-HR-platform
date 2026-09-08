"""add feature_key_alias canonicalization table (Phase 11)

Revision ID: g1f2a3b4c5d6
Revises: f1f2f3f4f5f6
Create Date: 2026-09-08

Adds the durable alias table behind FEATURE_KEY_CANONICAL so the resolver can
canonicalize a legacy engineering key to its Appendix A sibling from the
database (not just a Python dict) and log deprecation on every alias hit.

Seeds the full canonical map — 10 rows, one per legacy->Appendix A sibling.
hr.ai.autonomous_action -> hr.ai.autonomous_decision is the operator-critical
row: the legacy autonomous-action key is RETIRED from the runtime registry in
Phase 11, so resolving it now routes through the alias into the canonical
hard-block instead of a silent unknown-key fail-safe.

The table is additive; no existing rows are touched.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'g1f2a3b4c5d6'
down_revision: Union[str, Sequence[str], None] = 'f1f2f3f4f5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CANONICAL_ALIASES = [
    ("hr.core.employees", "hr.records", "Phase 11 canonical alias"),
    ("hr.core.departments", "hr.org.structure", "Phase 11 canonical alias"),
    ("hr.ess.core", "hr.self_service.employee", "Phase 11 canonical alias"),
    ("hr.onboarding.core", "hr.lifecycle.onboarding", "Phase 11 canonical alias"),
    ("hr.performance.core", "hr.performance.cycles", "Phase 11 canonical alias"),
    ("hr.documents.bulk_distribution", "hr.documents.bulk", "Phase 11 canonical alias"),
    ("hr.integration.api_read", "hr.api.read", "Phase 11 canonical alias"),
    ("hr.integration.api_write", "hr.api.write", "Phase 11 canonical alias"),
    ("hr.integration.custom_connector", "hr.integration.custom", "Phase 11 canonical alias"),
    # Operator-critical: legacy autonomous-action key hard-canonicalizes onto the
    # Appendix A autonomous_decision key, which itself is a permanent hard block.
    ("hr.ai.autonomous_action", "hr.ai.autonomous_decision", "Phase 11 E4 canonical alias"),
]


def upgrade() -> None:
    op.create_table(
        'feature_key_alias',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('alias_key', sa.String(length=150), nullable=False),
        sa.Column('canonical_key', sa.String(length=150), nullable=False),
        sa.Column('note', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('alias_key', name='uq_feature_key_alias_alias_key'),
    )
    op.create_index('ix_feature_key_alias_alias_key', 'feature_key_alias', ['alias_key'])

    aliases = sa.table(
        'feature_key_alias',
        sa.column('alias_key', sa.String(150)),
        sa.column('canonical_key', sa.String(150)),
        sa.column('note', sa.String(255)),
    )
    op.bulk_insert(aliases, [
        {"alias_key": alias, "canonical_key": canonical, "note": note}
        for alias, canonical, note in _CANONICAL_ALIASES
    ])


def downgrade() -> None:
    op.drop_index('ix_feature_key_alias_alias_key', table_name='feature_key_alias')
    op.drop_table('feature_key_alias')