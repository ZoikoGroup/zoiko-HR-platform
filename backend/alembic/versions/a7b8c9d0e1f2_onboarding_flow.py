"""onboarding: completion time, employment type, pre-onboarding link, task owners, settings

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-10-16

  * onboarding_new_hires: employment_type (from the accepted offer), completed_at, the pre-onboarding link
    (portal_token_hash for lookup, portal_token_enc so emails can repeat the link, expiry, invite time) and
    profile_details (address + emergency contact the new hire entered).
  * onboarding_checklist_items: due_offset_days (templates: days from the joining date) and assignee_employee_id.
  * onboarding_settings: one row per organization (auto-assigned templates, required documents, invite and reminder
    rules, completion rules). The Settings page saved nothing before this.
Guarded so it is safe to run twice.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, Sequence[str], None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ADD = {
    "onboarding_new_hires": [
        lambda: sa.Column("employment_type", sa.String(30), nullable=True),
        lambda: sa.Column("completed_at", sa.DateTime(), nullable=True),
        lambda: sa.Column("portal_token_hash", sa.String(64), nullable=True),
        lambda: sa.Column("portal_token_enc", sa.Text(), nullable=True),
        lambda: sa.Column("portal_expires_at", sa.DateTime(), nullable=True),
        lambda: sa.Column("portal_invited_at", sa.DateTime(), nullable=True),
        lambda: sa.Column("profile_details", sa.JSON(), nullable=True),
    ],
    "onboarding_checklist_items": [
        lambda: sa.Column("due_offset_days", sa.Integer(), nullable=True),
        lambda: sa.Column("assignee_employee_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
    ],
}


def _insp():
    return sa.inspect(op.get_bind())


def _cols(table):
    insp = _insp()
    return {c["name"] for c in insp.get_columns(table)} if insp.has_table(table) else None


def upgrade() -> None:
    for table, makers in _ADD.items():
        existing = _cols(table)
        if existing is None:
            continue
        for make in makers:
            col = make()
            if col.name not in existing:
                op.add_column(table, col)
    if "ix_onboarding_new_hires_portal_token_hash" not in {i["name"] for i in _insp().get_indexes("onboarding_new_hires")}:
        op.create_index("ix_onboarding_new_hires_portal_token_hash", "onboarding_new_hires", ["portal_token_hash"])
    op.execute("UPDATE onboarding_new_hires SET completed_at = updated_at WHERE status = 'completed' AND completed_at IS NULL")

    if not _insp().has_table("onboarding_settings"):
        op.create_table(
            "onboarding_settings",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False, unique=True),
            sa.Column("auto_template_ids", sa.JSON(), nullable=True),
            sa.Column("required_document_categories", sa.JSON(), nullable=True),
            sa.Column("auto_send_portal_invite", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("portal_link_days", sa.Integer(), nullable=False, server_default="30"),
            sa.Column("reminder_days", sa.Integer(), nullable=False, server_default="3"),
            sa.Column("require_checklists_complete", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("require_documents_approved", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("welcome_message", sa.Text(), nullable=True),
            sa.Column("last_reminder_run", sa.Date(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_onboarding_settings_id", "onboarding_settings", ["id"])
        op.create_index("ix_onboarding_settings_organization_id", "onboarding_settings", ["organization_id"], unique=True)


def downgrade() -> None:
    if _insp().has_table("onboarding_settings"):
        op.drop_table("onboarding_settings")
    for table, makers in _ADD.items():
        existing = _cols(table) or set()
        for make in reversed(makers):
            name = make().name
            if name in existing:
                op.drop_column(table, name)
