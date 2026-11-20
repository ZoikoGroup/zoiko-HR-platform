"""Bring legacy document rows into the new model (ZHR-DOCS-ARCH-001 §6.5, migration e1a2b3c4d5f2).

Runs from the Alembic data migration and, on a development boot, after the columns are self-healed. Idempotent: every step
only touches rows that still lack the new value, so a second run changes nothing. Works on a plain SQLAlchemy Connection
(no ORM session, no tenant scope) and on PostgreSQL and SQLite alike.

1. organization_id on versions, approval steps and approval logs, copied from their document. Until this runs, a tenant
   request would not see those rows (the tenant scope filters on organization_id).
2. System categories for every organization.
3. scope + category for every document that has none, from its legacy category / title / document type
   (constants.map_legacy_category); source='legacy_admin' (every legacy upload was made by an admin).
4. A v1 version row for documents with none, and the version status / approved_version_id pointers.
5. Access rules for company documents: the existing assignments become an 'employees' rule; anything else is
   'admin_only' — nobody gains access through the migration.
"""
import logging
from datetime import datetime

from sqlalchemy import text

from app.modules.hr.documents.constants import (
    SYSTEM_COMPANY_CATEGORIES, SYSTEM_EMPLOYEE_CATEGORIES, map_legacy_category,
)

log = logging.getLogger("zoiko.documents.backfill")


def _bool(conn, value: bool):
    return value if conn.dialect.name == "postgresql" else int(value)


def backfill_org_ids(conn) -> int:
    n = 0
    for table in ("hr_document_versions", "document_approval_steps", "document_approval_logs"):
        res = conn.execute(text(
            f"UPDATE {table} SET organization_id = (SELECT d.organization_id FROM hr_documents d WHERE d.id = {table}.document_id) "
            f"WHERE organization_id IS NULL"))
        n += res.rowcount or 0
    return n


def seed_all_org_categories(conn) -> int:
    orgs = [r[0] for r in conn.execute(text("SELECT id FROM organizations"))]
    added = 0
    true, false = _bool(conn, True), _bool(conn, False)
    for org in orgs:
        have = {r[0] for r in conn.execute(text(
            "SELECT key FROM hr_employee_document_categories WHERE organization_id = :o"), {"o": org})}
        for key, name, required, uploader, expiry, sensitivity, human, order in SYSTEM_EMPLOYEE_CATEGORIES:
            if key in have:
                continue
            conn.execute(text(
                "INSERT INTO hr_employee_document_categories (organization_id, key, name, is_required, uploader, requires_expiry, "
                "sensitivity, human_approval_required, sort_order, is_system, is_active, created_at, updated_at) VALUES "
                "(:o, :k, :n, :r, :u, :e, :s, :h, :so, :t, :t, :now, :now)"),
                {"o": org, "k": key, "n": name, "r": _bool(conn, required), "u": uploader, "e": _bool(conn, expiry),
                 "s": sensitivity, "h": _bool(conn, human), "so": order, "t": true, "now": datetime.utcnow()})
            added += 1
        have = {r[0] for r in conn.execute(text(
            "SELECT key FROM hr_company_document_categories WHERE organization_id = :o"), {"o": org})}
        for key, name, icon, needs_approval, ack, order in SYSTEM_COMPANY_CATEGORIES:
            if key in have:
                continue
            conn.execute(text(
                "INSERT INTO hr_company_document_categories (organization_id, key, name, icon, requires_approval, "
                "default_require_ack, auto_unpublish_on_expiry, locked_by_org_admin, sort_order, is_system, is_active, "
                "created_at, updated_at) VALUES (:o, :k, :n, :i, :ra, :ack, :f, :f, :so, :t, :t, :now, :now)"),
                {"o": org, "k": key, "n": name, "i": icon, "ra": _bool(conn, needs_approval), "ack": _bool(conn, ack),
                 "f": false, "so": order, "t": true, "now": datetime.utcnow()})
            added += 1
    return added


def categorise_documents(conn) -> list[int]:
    """Set scope/category for documents with neither category id. Returns ids of rows placed in a default container
    because nothing in their legacy metadata matched (for HR to review)."""
    emp_ids = {(r[0], r[1]): r[2] for r in conn.execute(text(
        "SELECT organization_id, key, id FROM hr_employee_document_categories"))}
    comp_ids = {(r[0], r[1]): r[2] for r in conn.execute(text(
        "SELECT organization_id, key, id FROM hr_company_document_categories"))}
    rows = conn.execute(text(
        "SELECT id, organization_id, category, title, document_type, employee_id FROM hr_documents "
        "WHERE employee_category_id IS NULL AND company_category_id IS NULL")).fetchall()
    defaulted = []
    for doc_id, org, category, title, doc_type, employee_id in rows:
        cat_value = getattr(category, "value", category)
        scope, key = map_legacy_category(cat_value, title, doc_type, employee_id is not None)
        if key in ("medical_other", "forms_templates"):
            defaulted.append(doc_id)
        if scope == "employee":
            conn.execute(text(
                "UPDATE hr_documents SET scope = 'employee', employee_category_id = :c, source = 'legacy_admin' WHERE id = :id"),
                {"c": emp_ids.get((org, key)), "id": doc_id})
        else:
            conn.execute(text(
                "UPDATE hr_documents SET scope = 'company', company_category_id = :c, source = 'legacy_admin' WHERE id = :id"),
                {"c": comp_ids.get((org, key)), "id": doc_id})
    return defaulted


_DOC_TO_VERSION_STATUS = {"pending": "pending_approval", "approved": "approved", "rejected": "rejected",
                          "expired": "expired", "reupload_requested": "reupload_requested"}


def ensure_versions(conn) -> int:
    """A v1 row for documents without versions; the latest version mirrors the document status; approved pointers."""
    created = 0
    docs = conn.execute(text(
        "SELECT d.id, d.organization_id, d.status, d.file_path, d.file_name, d.file_size, d.mime_type, d.uploaded_by, "
        "d.expiry_date, d.current_version, d.approved_by, d.approved_at, d.rejection_reason, d.created_at FROM hr_documents d "
        "WHERE NOT EXISTS (SELECT 1 FROM hr_document_versions v WHERE v.document_id = d.id)")).fetchall()
    for (doc_id, org, status, path, name, size, mime, uploader, expiry, current, approved_by, approved_at, reason,
         created_at) in docs:
        st = _DOC_TO_VERSION_STATUS.get(str(getattr(status, "value", status) or "").lower(), "approved")
        conn.execute(text(
            "INSERT INTO hr_document_versions (document_id, organization_id, version, file_path, file_name, file_size, mime_type, "
            "uploaded_by, change_notes, created_at, status, expiry_date, rejection_reason, decided_by, decided_at, is_encrypted, "
            "scan_status, material_change) VALUES (:d, :o, :v, :p, :n, :s, :m, :u, :cn, :c, :st, :e, :r, :db, :da, :f, 'skipped', :t)"),
            {"d": doc_id, "o": org, "v": current or 1, "p": path, "n": name, "s": size, "m": mime, "u": uploader,
             "cn": "Original upload (migrated)", "c": created_at or datetime.utcnow(), "st": st, "e": expiry, "r": reason,
             "db": approved_by, "da": approved_at, "f": _bool(conn, False), "t": _bool(conn, True)})
        created += 1
    # Versions created before statuses existed default to 'approved'; the newest one must mirror its document.
    latest = conn.execute(text(
        "SELECT v.id, d.status FROM hr_document_versions v JOIN hr_documents d ON d.id = v.document_id "
        "WHERE v.version = (SELECT MAX(v2.version) FROM hr_document_versions v2 WHERE v2.document_id = v.document_id) "
        "AND d.approved_version_id IS NULL")).fetchall()
    for vid, status in latest:
        st = _DOC_TO_VERSION_STATUS.get(str(getattr(status, "value", status) or "").lower(), "approved")
        conn.execute(text("UPDATE hr_document_versions SET status = :s WHERE id = :id"), {"s": st, "id": vid})
    conn.execute(text(
        "UPDATE hr_documents SET approved_version_id = (SELECT MAX(v.id) FROM hr_document_versions v "
        "WHERE v.document_id = hr_documents.id AND v.status = 'approved') WHERE approved_version_id IS NULL"))
    return created


def seed_access_rules(conn) -> int:
    """One rule per company document that has none: its assignees, or admin-only."""
    rows = conn.execute(text(
        "SELECT d.id, d.organization_id FROM hr_documents d WHERE d.scope = 'company' AND NOT EXISTS "
        "(SELECT 1 FROM hr_document_access_rules r WHERE r.target_type = 'document' AND r.target_id = d.id "
        "AND r.organization_id = d.organization_id)")).fetchall()
    import json
    n = 0
    for doc_id, org in rows:
        assignees = sorted({r[0] for r in conn.execute(text(
            "SELECT employee_id FROM document_assignments WHERE document_id = :d"), {"d": doc_id})})
        visibility = "employees" if assignees else "admin_only"
        conn.execute(text(
            "INSERT INTO hr_document_access_rules (organization_id, target_type, target_id, inherit, visibility, employee_ids, "
            "permission, require_ack, updated_at) VALUES (:o, 'document', :d, :inh, :v, :e, 'download', :f, :now)"),
            {"o": org, "d": doc_id, "inh": _bool(conn, False), "v": visibility, "e": json.dumps(assignees) if assignees else None,
             "f": _bool(conn, False), "now": datetime.utcnow()})
        n += 1
    return n


def seed_system_rules(conn, status: str = "paused") -> int:
    """System automation rules for every organization that lacks them (decision Q10: paused for existing ones)."""
    import json
    from app.modules.hr.documents.automation.seeds import SYSTEM_RULES
    added = 0
    for (org,) in conn.execute(text("SELECT id FROM organizations")).fetchall():
        have = {r[0] for r in conn.execute(text("SELECT key FROM automation_rules WHERE organization_id = :o"), {"o": org})}
        for spec in SYSTEM_RULES:
            if spec["key"] in have:
                continue
            conn.execute(text(
                "INSERT INTO automation_rules (organization_id, key, name, description, trigger_event, definition, status, "
                "is_system, version, created_at) VALUES (:o, :k, :n, :d, :t, :def, :st, :sys, 1, :now)"),
                {"o": org, "k": spec["key"], "n": spec["name"], "d": spec["description"], "t": spec["trigger_event"],
                 "def": json.dumps(spec["definition"]), "st": status, "sys": _bool(conn, True), "now": datetime.utcnow()})
            added += 1
    return added


def run_all(conn) -> dict:
    out = {
        "org_ids": backfill_org_ids(conn),
        "categories_seeded": seed_all_org_categories(conn),
    }
    defaulted = categorise_documents(conn)
    out["defaulted_documents"] = len(defaulted)
    out["versions_created"] = ensure_versions(conn)
    out["access_rules"] = seed_access_rules(conn)
    out["system_rules"] = seed_system_rules(conn)
    if defaulted:
        log.warning("documents backfill: %d legacy document(s) placed in a default category for HR to review: %s",
                    len(defaulted), defaulted[:50])
    log.info("documents backfill: %s", out)
    return out
