"""Data steps for the attendance M1 migration (also safe to run again):

1. merge_duplicates  — one live record per (organization, employee, date): the newest stays, the others are soft-deleted
                       with an audit entry, so the unique index can be created.
2. backfill_instants — check_in_at / check_out_at (UTC) from the legacy wall-clock times read in the employee's time zone
                       (else the organization's), plus work_date_tz and the minute totals.
3. scope_rosters     — shift_rosters.organization_id from the employee.

Works on a SQLAlchemy Connection (plain SQL), so it runs inside Alembic without the ORM.
"""
import json
from datetime import datetime

from sqlalchemy import text

from app.modules.hr.attendance.clock import UTC, to_utc, zone


def _true(conn):
    return "true" if conn.dialect.name == "postgresql" else "1"


def _false(conn):
    return "false" if conn.dialect.name == "postgresql" else "0"


def _dt(value):
    if value is None or isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value).replace("Z", "").split("+")[0])


def merge_duplicates(conn) -> int:
    rows = conn.execute(text(
        "SELECT organization_id, employee_id, date FROM attendance_records "
        f"WHERE COALESCE(is_deleted, {_false(conn)}) = {_false(conn)} "
        "GROUP BY organization_id, employee_id, date HAVING COUNT(*) > 1")).fetchall()
    merged = 0
    for org, emp, day in rows:
        ids = [r[0] for r in conn.execute(text(
            "SELECT id FROM attendance_records WHERE organization_id = :o AND employee_id = :e AND date = :d "
            f"AND COALESCE(is_deleted, {_false(conn)}) = {_false(conn)} ORDER BY COALESCE(updated_at, created_at) DESC, id DESC"),
            {"o": org, "e": emp, "d": day}).fetchall()]
        keep, drop = ids[0], ids[1:]
        for rid in drop:
            conn.execute(text(f"UPDATE attendance_records SET is_deleted = {_true(conn)} WHERE id = :i"), {"i": rid})
            conn.execute(text(
                "INSERT INTO attendance_audit_log (organization_id, attendance_id, employee_id, work_date, action, actor_type, "
                "before, after, reason, created_at) VALUES (:o, :i, :e, :d, 'merged', 'system', NULL, :a, :r, :c)"),
                {"o": org, "i": rid, "e": emp, "d": day, "a": json.dumps({"kept_record_id": keep}),
                 "r": "Duplicate record for the same day removed when one record per day became the rule.", "c": datetime.utcnow()})
            merged += 1
    return merged


def backfill_instants(conn) -> int:
    tz_rows = conn.execute(text(
        "SELECT a.id, a.check_in, a.check_out, e.timezone, o.timezone FROM attendance_records a "
        "JOIN employees e ON e.id = a.employee_id JOIN organizations o ON o.id = a.organization_id "
        "WHERE a.check_in_at IS NULL AND (a.check_in IS NOT NULL OR a.check_out IS NOT NULL)")).fetchall()
    for rid, cin, cout, emp_tz, org_tz in tz_rows:
        tz = zone(emp_tz) or zone(org_tz) or UTC
        cin, cout = _dt(cin), _dt(cout)
        cin_at, cout_at = to_utc(cin, tz), to_utc(cout, tz)
        worked = int((cout_at - cin_at).total_seconds() // 60) if cin_at and cout_at and cout_at > cin_at else 0
        conn.execute(text(
            "UPDATE attendance_records SET check_in_at = :ci, check_out_at = :co, work_date_tz = :tz, "
            "worked_minutes = CASE WHEN worked_minutes = 0 THEN :w ELSE worked_minutes END WHERE id = :i"),
            {"ci": cin_at, "co": cout_at, "tz": tz.key, "w": worked, "i": rid})
    return len(tz_rows)


def scope_rosters(conn) -> int:
    res = conn.execute(text(
        "UPDATE shift_rosters SET organization_id = (SELECT e.organization_id FROM employees e WHERE e.id = shift_rosters.employee_id) "
        "WHERE organization_id IS NULL"))
    return res.rowcount or 0


def run_all(conn) -> dict:
    return {"merged": merge_duplicates(conn), "instants": backfill_instants(conn), "rosters": scope_rosters(conn)}
