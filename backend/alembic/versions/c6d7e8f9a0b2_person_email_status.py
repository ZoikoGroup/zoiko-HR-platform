"""email_status on recruitment_candidates and onboarding_new_hires (QA #13 BUG-8, BUG-25)

Revision ID: c6d7e8f9a0b2
Revises: c6d7e8f9a0b1
Create Date: 2026-11-17

"bounced" once the mail server permanently refused the address (app/modules/hr/email_status.py); NULL otherwise.
Idempotent and reversible.
"""
import sqlalchemy as sa
from alembic import op

revision = "c6d7e8f9a0b2"
down_revision = "c6d7e8f9a0b1"
branch_labels = None
depends_on = None

TABLES = ("recruitment_candidates", "onboarding_new_hires")


def upgrade():
    insp = sa.inspect(op.get_bind())
    for table in TABLES:
        if insp.has_table(table) and "email_status" not in {c["name"] for c in insp.get_columns(table)}:
            op.add_column(table, sa.Column("email_status", sa.String(20), nullable=True))


def downgrade():
    insp = sa.inspect(op.get_bind())
    for table in TABLES:
        if insp.has_table(table) and "email_status" in {c["name"] for c in insp.get_columns(table)}:
            with op.batch_alter_table(table) as batch:
                batch.drop_column("email_status")
