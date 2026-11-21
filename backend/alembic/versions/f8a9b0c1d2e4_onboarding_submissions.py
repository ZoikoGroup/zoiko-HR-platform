"""onboarding submission pipeline: kind, form link, versions and review trail on onboarding_documents

- onboarding_documents.kind (upload | form | package), form_submission_id (structured portal forms)
- onboarding_documents.version / history (resubmission after rejection keeps the earlier versions)
- onboarding_documents.submitted_at / reviewed_by / reviewed_at
- onboarding_documents.details_changed (sent, unsigned, and the new hire's details changed since: "reissue")

Revision ID: f8a9b0c1d2e4
Revises: e7f8a9b0c1d3
Create Date: 2026-11-20 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f8a9b0c1d2e4"
down_revision: Union[str, Sequence[str], None] = "e7f8a9b0c1d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = "onboarding_documents"


def _columns() -> set:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(TABLE)}


def upgrade() -> None:
    have = _columns()
    adds = [
        sa.Column("kind", sa.String(length=20), nullable=True),
        sa.Column("form_submission_id", sa.Integer(), sa.ForeignKey("onboarding_form_submissions.id"), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("history", sa.JSON(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        sa.Column("reviewed_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("details_changed", sa.Boolean(), nullable=False, server_default=sa.false()),
    ]
    for col in adds:
        if col.name not in have:
            op.add_column(TABLE, col)
    if "form_submission_id" not in have:
        op.create_index("ix_onboarding_documents_form_submission_id", TABLE, ["form_submission_id"])
    # existing rows that already wait for review were submitted when they were last changed
    op.get_bind().execute(sa.text(
        "UPDATE onboarding_documents SET submitted_at = updated_at WHERE submitted_at IS NULL AND status IN ('pending', 'approved', 'rejected') "
        "AND file_path IS NOT NULL"))


def downgrade() -> None:
    have = _columns()
    if "form_submission_id" in have:
        op.drop_index("ix_onboarding_documents_form_submission_id", table_name=TABLE)
    for name in ("details_changed", "reviewed_at", "reviewed_by", "submitted_at", "history", "version", "form_submission_id", "kind"):
        if name in have:
            op.drop_column(TABLE, name)
