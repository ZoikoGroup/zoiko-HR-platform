"""
modules/hr/recruitment_text_repair.py
-------------------------------------
QA report #13 (root cause F): recruitment used to run markupsafe.escape() over every text value before saving, so "R&D" was
stored as "R&amp;D" and shown with the entity. repair() runs html.unescape() once over the affected text columns, only on
values that contain one of the entities escape() produced. Used by the alembic data migration c6d7e8f9a0b4 and by
scripts/unescape_recruitment_text.py (--dry-run lists what would change).
"""
import html
import re

import sqlalchemy as sa

COLUMNS = {
    "recruitment_requisitions": ("title", "department", "location", "description", "requirements", "justification",
                                 "decision_comment"),
    "recruitment_candidates": ("name", "position", "source", "location", "notes", "rejection_note"),
    "recruitment_interviews": ("candidate_name", "position", "interviewer", "location", "feedback", "notes", "result_message"),
    "recruitment_offers": ("candidate_name", "position", "notes", "entity_name", "entity_address", "entity_city", "entity_region",
                           "work_location", "work_region", "work_pattern", "fixed_term_reason", "benefits_summary",
                           "academic_institution", "decline_reason", "withdrawal_reason_note", "withdrawal_condition"),
}
ENTITY = re.compile(r"&(amp|lt|gt|quot|#34|#39|#x27);", re.IGNORECASE)


def repair(bind, dry_run: bool = True, organization_id=None) -> list[tuple[str, int, str]]:
    """[(table, id, column)] of every value that was (or, with dry_run, would be) unescaped."""
    insp = sa.inspect(bind)
    changes = []
    for table, wanted in COLUMNS.items():
        if not insp.has_table(table):
            continue
        present = {c["name"] for c in insp.get_columns(table)}
        columns = [c for c in wanted if c in present]
        if not columns:
            continue
        where = " OR ".join(f"{c} LIKE '%&%;%'" for c in columns)
        sql = f"SELECT id, {', '.join(columns)} FROM {table} WHERE ({where})"
        params = {}
        if organization_id is not None:
            sql += " AND organization_id = :org"
            params["org"] = organization_id
        for row in bind.execute(sa.text(sql), params).mappings().all():
            fixed = {}
            for column in columns:
                value = row[column]
                if isinstance(value, str) and ENTITY.search(value):
                    fixed[column] = html.unescape(value)
                    changes.append((table, row["id"], column))
            if fixed and not dry_run:
                sets = ", ".join(f"{c} = :{c}" for c in fixed)
                bind.execute(sa.text(f"UPDATE {table} SET {sets} WHERE id = :_id"), {**fixed, "_id": row["id"]})
    return changes
