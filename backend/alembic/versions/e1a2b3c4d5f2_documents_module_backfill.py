"""Documents module (ZHR-DOCS-ARCH-001): bring existing documents into the new model

Revision ID: e1a2b3c4d5f2
Revises: e1a2b3c4d5f1
Create Date: 2026-11-19

Data only (app/modules/hr/documents/backfill.py, also run on a development boot):
1. organization_id on versions, approval steps and approval logs, from their document.
2. The system employee and company categories for every organization.
3. scope + category for every existing document, from its legacy category / title / document type; source='legacy_admin'.
   Documents nothing matched go to a default container and are logged by id for HR to review.
4. A v1 version for documents with none; version statuses and approved-version pointers.
5. One access rule per company document: its existing assignees, otherwise admin-only. Nobody gains access.

Idempotent. The legacy columns (category, access_control, document_assignments) are not touched, so downgrade does nothing:
rolling back to e1a2b3c4d5f1 leaves the filled-in columns unused.

Files are NOT moved or encrypted here: scripts/encrypt_hr_documents.py does that, resumably, outside the migration.
"""
import logging
from typing import Sequence, Union

from alembic import op

revision: str = "e1a2b3c4d5f2"
down_revision: Union[str, Sequence[str], None] = "e1a2b3c4d5f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

log = logging.getLogger("alembic.runtime.migration")


def upgrade() -> None:
    from app.modules.hr.documents.backfill import run_all
    out = run_all(op.get_bind())
    log.info("documents backfill: %s", out)


def downgrade() -> None:
    pass
