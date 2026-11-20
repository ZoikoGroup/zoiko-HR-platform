"""Documents module (ZHR-DOCS-ARCH-001): new tables

Revision ID: e1a2b3c4d5f0
Revises: c6d7e8f9a0b4
Create Date: 2026-11-19

Creates the documents-module tables: employee and company document categories, access rules, acknowledgement rounds and
acknowledgements, the documents audit trail, the reminder log, and the automation layer (rules, runs, settings, notification
templates, document tasks, retention policies). Tables are created from the models as they were at this revision, each
guarded by `checkfirst`, so a development database that already self-created them is left alone.

Downgrade drops these tables (no existing data is affected).
"""
from typing import Sequence, Union

from alembic import op

revision: str = "e1a2b3c4d5f0"
down_revision: Union[str, Sequence[str], None] = "c6d7e8f9a0b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Creation order respects foreign keys (document_tasks before hr_document_reminders).
TABLES = (
    "hr_employee_document_categories",
    "hr_company_document_categories",
    "hr_document_access_rules",
    "hr_document_ack_rounds",
    "hr_document_acknowledgements",
    "hr_document_audit_logs",
    "automation_rules",
    "automation_runs",
    "automation_settings",
    "notification_templates",
    "document_tasks",
    "hr_document_reminders",
    "retention_policies",
)


def _metadata():
    import app.modules.hr.documents.automation.models  # noqa: F401
    import app.modules.hr.documents.models  # noqa: F401
    from app.database import Base
    return Base.metadata


def upgrade() -> None:
    md = _metadata()
    bind = op.get_bind()
    for name in TABLES:
        md.tables[name].create(bind=bind, checkfirst=True)


def downgrade() -> None:
    md = _metadata()
    bind = op.get_bind()
    for name in reversed(TABLES):
        md.tables[name].drop(bind=bind, checkfirst=True)
