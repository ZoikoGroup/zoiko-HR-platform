"""Company document categories can be hidden (and shown again)

Revision ID: c2d3e4f5a6b7
Revises: c1d2e3f4a5b6
Create Date: 2026-11-23

Company Documents P3 (Q6): built-in categories can be renamed and hidden, never deleted. A hidden category keeps its
files, folders and access rules; employees simply stop seeing it until an admin shows it again. Separate from is_active,
which marks a custom category as deleted.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c2d3e4f5a6b7"
down_revision: Union[str, Sequence[str], None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("hr_company_document_categories",
                  sa.Column("is_hidden", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    with op.batch_alter_table("hr_company_document_categories") as batch:
        batch.drop_column("is_hidden")
