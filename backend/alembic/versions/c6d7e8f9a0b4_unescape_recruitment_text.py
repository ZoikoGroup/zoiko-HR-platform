"""Undo the HTML-escaping that recruitment used to apply when saving (QA #13: "R&amp;D" shown instead of "R&D")

Revision ID: c6d7e8f9a0b4
Revises: c6d7e8f9a0b3
Create Date: 2026-11-17

recruitment_service ran markupsafe.escape over every text value before saving, so "&" was stored as "&amp;" (and < > " '
as entities) and then escaped again on display. Values are now stored as typed and escaped on output. This runs
html.unescape() once over the text columns of requisitions, candidates, interviews and offers – only on values that contain
one of the entities escape() produced – and logs each changed row id. The same repair is available as
scripts/unescape_recruitment_text.py (with --dry-run). Not reversible (downgrade does nothing): the escaped form was a bug.
"""
import logging

from alembic import op

revision = "c6d7e8f9a0b4"
down_revision = "c6d7e8f9a0b3"
branch_labels = None
depends_on = None

log = logging.getLogger("alembic.runtime.migration")


def upgrade():
    from app.modules.hr.recruitment_text_repair import repair
    changes = repair(op.get_bind(), dry_run=False)
    for table, row_id, column in changes:
        log.info("unescaped %s.%s id=%s", table, column, row_id)
    if changes:
        log.warning("Unescaped %d recruitment text value(s).", len(changes))


def downgrade():
    pass
