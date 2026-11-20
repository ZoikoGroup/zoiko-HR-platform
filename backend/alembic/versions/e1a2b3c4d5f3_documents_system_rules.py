"""Documents module (ZHR-DOCS-ARCH-001): system automation rules for existing organizations

Revision ID: e1a2b3c4d5f3
Revises: e1a2b3c4d5f2
Create Date: 2026-11-19

Seeds the system rules (onboarding checklist, review notice, decision notices, expiry re-upload) for every existing
organization, PAUSED (decision Q10: existing organizations opt in from Settings; organizations created from now on get them
active). Idempotent: a rule key an organization already has is left alone. Downgrade removes only system rules that were
never activated or edited (status still 'paused', version 1).
"""
import logging
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e1a2b3c4d5f3"
down_revision: Union[str, Sequence[str], None] = "e1a2b3c4d5f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

log = logging.getLogger("alembic.runtime.migration")


def upgrade() -> None:
    from app.modules.hr.documents.backfill import seed_system_rules
    log.info("documents system rules seeded (paused): %d", seed_system_rules(op.get_bind(), status="paused"))


def downgrade() -> None:
    from app.modules.hr.documents.automation.seeds import SYSTEM_RULES
    keys = [s["key"] for s in SYSTEM_RULES]
    op.get_bind().execute(
        sa.text("DELETE FROM automation_rules WHERE status = 'paused' AND version = 1 AND key IN :keys").bindparams(
            sa.bindparam("keys", expanding=True)), {"keys": keys})
