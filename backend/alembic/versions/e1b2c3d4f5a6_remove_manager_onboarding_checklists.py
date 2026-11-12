"""Remove the automatic "Manager onboarding" checklists

Revision ID: e1b2c3d4f5a6
Revises: d7e1a0b2c3fb
Create Date: 2026-11-12

The "Manager onboarding" checklist (HR-ONB-005 tasks for the reporting manager) is no longer created. The ones the system
created earlier are soft-deleted with their items, so they leave the Checklists page, managers' task lists and the
completion blockers. Rows are kept (is_deleted), so the downgrade restores them.
"""
from alembic import op

revision = "e1b2c3d4f5a6"
down_revision = "d7e1a0b2c3fb"
branch_labels = None
depends_on = None

_SYSTEM_MANAGER_CHECKLISTS = ("SELECT id FROM onboarding_checklists WHERE name = 'Manager onboarding' "
                              "AND created_by = 'system'")


def upgrade():
    op.execute(f"UPDATE onboarding_checklist_items SET is_deleted = true WHERE checklist_id IN ({_SYSTEM_MANAGER_CHECKLISTS}) "
               "AND is_deleted = false")
    op.execute("UPDATE onboarding_checklists SET is_deleted = true WHERE name = 'Manager onboarding' AND created_by = 'system' "
               "AND is_deleted = false")


def downgrade():
    op.execute("UPDATE onboarding_checklists SET is_deleted = false WHERE name = 'Manager onboarding' AND created_by = 'system'")
    op.execute(f"UPDATE onboarding_checklist_items SET is_deleted = false WHERE checklist_id IN ({_SYSTEM_MANAGER_CHECKLISTS})")
