"""Interview result (cleared / rejected)

Revision ID: f2c3d4e5a6b7
Revises: e1b2c3d4f5a6
Create Date: 2026-11-12

After an interview is completed HR records its result. The candidate is e-mailed (cleared / not selected) and the result is
final, so these columns keep what was decided, by whom, when, and whether the candidate was told.
"""
import sqlalchemy as sa
from alembic import op

revision = "f2c3d4e5a6b7"
down_revision = "e1b2c3d4f5a6"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("recruitment_interviews") as t:
        t.add_column(sa.Column("result", sa.String(20), nullable=True))
        t.add_column(sa.Column("result_message", sa.Text(), nullable=True))
        t.add_column(sa.Column("result_at", sa.DateTime(), nullable=True))
        t.add_column(sa.Column("result_by_id", sa.Integer(), nullable=True))
        t.add_column(sa.Column("result_emailed", sa.Boolean(), nullable=True))
        t.create_foreign_key("fk_recruitment_interviews_result_by", "employees", ["result_by_id"], ["id"])


def downgrade():
    with op.batch_alter_table("recruitment_interviews") as t:
        t.drop_constraint("fk_recruitment_interviews_result_by", type_="foreignkey")
        for col in ("result_emailed", "result_by_id", "result_at", "result_message", "result"):
            t.drop_column(col)
