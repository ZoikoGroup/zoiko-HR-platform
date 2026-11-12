"""Interview result (cleared / rejected)

Revision ID: f2c3d4e5a6b7
Revises: e1b2c3d4f5a6
Create Date: 2026-11-12

After an interview is completed HR records its result. The candidate is e-mailed (cleared / not selected) and the result is
final, so these columns keep what was decided, by whom, when, and whether the candidate was told.

Guarded like the earlier revisions: on a database whose tables were made by create_all (CI) the columns and the foreign key
already exist, and each one is only added when it is missing.
"""
import sqlalchemy as sa
from alembic import op

revision = "f2c3d4e5a6b7"
down_revision = "e1b2c3d4f5a6"
branch_labels = None
depends_on = None

TABLE = "recruitment_interviews"
FK_NAME = "fk_recruitment_interviews_result_by"
COLUMNS = [
    ("result", lambda: sa.String(20)),
    ("result_message", lambda: sa.Text()),
    ("result_at", lambda: sa.DateTime()),
    ("result_by_id", lambda: sa.Integer()),
    ("result_emailed", lambda: sa.Boolean()),
]


def _columns(bind) -> set:
    insp = sa.inspect(bind)
    return {c["name"] for c in insp.get_columns(TABLE)} if TABLE in insp.get_table_names() else set()


def _has_result_by_fk(bind) -> bool:
    insp = sa.inspect(bind)
    if TABLE not in insp.get_table_names():
        return False
    return any(fk.get("constrained_columns") == ["result_by_id"] for fk in insp.get_foreign_keys(TABLE))


def upgrade():
    bind = op.get_bind()
    if TABLE not in sa.inspect(bind).get_table_names():
        return
    existing = _columns(bind)
    for name, kind in COLUMNS:
        if name not in existing:
            op.add_column(TABLE, sa.Column(name, kind(), nullable=True))
    if not _has_result_by_fk(bind):
        op.create_foreign_key(FK_NAME, TABLE, "employees", ["result_by_id"], ["id"])


def downgrade():
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if TABLE not in insp.get_table_names():
        return
    for fk in insp.get_foreign_keys(TABLE):
        if fk.get("constrained_columns") == ["result_by_id"] and fk.get("name"):
            op.drop_constraint(fk["name"], TABLE, type_="foreignkey")
    existing = _columns(bind)
    for name, _kind in reversed(COLUMNS):
        if name in existing:
            op.drop_column(TABLE, name)
