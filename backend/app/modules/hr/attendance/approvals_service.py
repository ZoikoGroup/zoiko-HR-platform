"""Attendance approvals queue (attendance plan M7): correction and overtime requests in one list, with who asked, what
they asked for, how long it has waited and whether the viewer may decide it. Decisions use the existing endpoints
(POST /hr/time/corrections/{id}/decision and /hr/time/overtime/{id}/decision), which enforce the rules: a manager decides
for their reports, HR for anyone, and nobody decides their own request.

Visibility follows time_documents._scope: HR sees the organization, a manager their reports (and themselves).
"""
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.modules.employee.models import Employee
from app.modules.hr.attendance import clock, errors
from app.modules.hr.models import AttendanceCorrectionRequest, Department, OvertimeRequest

STATUS = {"pending": "PENDING", "approved": "APPROVED", "rejected": "REJECTED"}
TYPES = ("correction", "overtime")
APPROVER_ROLES = ("super_admin", "admin", "hr_admin", "manager")


def _role(user) -> str:
    return str(getattr(user.role, "value", user.role) or "")


def _hhmm(v) -> Optional[str]:
    return v.strftime("%H:%M") if v else None


def _iso(v):
    return v.isoformat() if v else None


def _can_decide(db: Session, user, employee_id: int, requested_by: int) -> bool:
    from app.modules.hr.time_documents import can_manage
    return user.id not in (employee_id, requested_by) and can_manage(db, user, employee_id)


def queue(db: Session, user, *, kind: str = "all", status: str = "pending", page: int = 1, per_page: int = 25) -> dict:
    from app.modules.hr.time_documents import _scope
    if _role(user) not in APPROVER_ROLES:
        raise errors.forbidden("ATT_FORBIDDEN", "Only managers, HR and organization admins review attendance requests.")
    if kind not in ("all",) + TYPES:
        raise errors.invalid("type must be correction, overtime or all.", field="type")
    if status not in ("all",) + tuple(STATUS):
        raise errors.invalid("status must be pending, approved, rejected or all.", field="status")
    org = user.organization_id
    now = datetime.utcnow()
    items, counts = [], {t: {s: 0 for s in STATUS} for t in TYPES}
    for t, model in (("correction", AttendanceCorrectionRequest), ("overtime", OvertimeRequest)):
        base = _scope(db, user, db.query(model).filter(model.organization_id == org), model)
        for st, n in base.with_entities(model.status, model.id).all():
            key = next((k for k, v in STATUS.items() if v == st), None)
            if key:
                counts[t][key] += 1
        if kind not in ("all", t):
            continue
        q = base if status == "all" else base.filter(model.status == STATUS[status])
        for r in q.order_by(model.id.desc()).limit(500).all():
            items.append((t, r))
    people = {e.id: e for e in db.query(Employee).filter(Employee.id.in_({r.employee_id for _, r in items} | {r.decided_by for _, r in items if r.decided_by} or {-1}))}
    depts = {d.id: d.name for d in db.query(Department).filter(Department.id.in_({e.department_id for e in people.values() if e.department_id} or {-1}))}
    # oldest pending first (they have waited longest), then decided ones, newest decision first
    pending = [x for x in items if x[1].status == "PENDING"]
    decided = sorted([x for x in items if x[1].status != "PENDING"], key=lambda x: x[1].decided_at or x[1].created_at or now, reverse=True)
    ordered = sorted(pending, key=lambda x: x[1].created_at or now) + decided
    total = len(ordered)
    per_page = max(1, min(per_page, 100))
    chunk = ordered[(max(page, 1) - 1) * per_page: max(page, 1) * per_page]
    out = []
    for t, r in chunk:
        emp = people.get(r.employee_id)
        row = {"type": t, "id": r.id, "employee_id": r.employee_id, "employee_name": emp.full_name if emp else None,
               "employee_code": getattr(emp, "employee_code", None),
               "department": depts.get(emp.department_id) if emp and emp.department_id else None,
               "date": _iso(r.date), "status": r.status, "reason": r.reason, "requested_at": clock.iso_utc(r.created_at),
               "waiting_hours": round(((now - r.created_at).total_seconds() / 3600), 1) if r.status == "PENDING" and r.created_at else None,
               "decided_by_name": people[r.decided_by].full_name if r.decided_by in people else None,
               "decided_at": clock.iso_utc(r.decided_at), "decision_reason": r.decision_reason,
               "can_decide": r.status == "PENDING" and _can_decide(db, user, r.employee_id, r.requested_by),
               "own": user.id in (r.employee_id, r.requested_by)}
        if t == "correction":
            row.update({"kind": getattr(r, "kind", None) or "missed_punch", "reason_detail": r.reason_detail,
                        "original_check_in": _hhmm(r.original_check_in), "original_check_out": _hhmm(r.original_check_out),
                        "requested_check_in": _hhmm(r.requested_check_in), "requested_check_out": _hhmm(r.requested_check_out),
                        "requested_status": getattr(r, "requested_status", None), "requested_breaks": getattr(r, "requested_breaks", None)})
        else:
            row.update({"start_time": r.start_time, "end_time": r.end_time, "hours": float(r.hours or 0),
                        "pre_approved": bool(r.pre_approved), "emergency": bool(r.emergency), "compensation_method": r.compensation_method})
        out.append(row)
    return {"items": out, "total": total, "page": max(page, 1), "per_page": per_page, "counts": counts,
            "pending_total": counts["correction"]["pending"] + counts["overtime"]["pending"]}
