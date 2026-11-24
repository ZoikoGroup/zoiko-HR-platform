"""Shift assignments (My Attendance plan step 6, admin Shifts & Work Policy): who works which shift over which period,
stored in employee_shifts (no schema change). A roster entry for one date still wins over an assignment, and an
assignment wins over the organization's default shift (policy.shift_for).

Rules
* a new assignment starts on `effective_from` and runs to `effective_to` (inclusive) or open-ended
* an earlier assignment that is still running then ends the day before; if it ran past the new end date, its remainder
  continues after it (nobody silently loses their shift)
* an assignment that starts inside the new period is not overwritten: the request is refused and says which one
* every change is audited (attendance audit log, actions shift_assigned / shift_ended) and the person is notified
"""
from datetime import date, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException, NotFoundException, ZoikoException
from app.modules.hr.attendance import audit
from app.modules.hr.attendance.models import EmployeeShift

MAX_PEOPLE = 500
LINK = "/employee/ess/attendance"


def _shift_label(shift) -> str:
    return f"{shift.name} ({shift.start_time}–{shift.end_time})"


def _name(e) -> str:
    return f"{e.first_name or ''} {e.last_name or ''}".strip() or e.email


def serialize(db: Session, row: EmployeeShift, people: Optional[dict] = None, shifts: Optional[dict] = None) -> dict:
    from app.modules.employee.models import Employee
    from app.modules.hr.models import Shift
    e = (people or {}).get(row.employee_id) or db.get(Employee, row.employee_id)
    s = (shifts or {}).get(row.shift_id) or db.get(Shift, row.shift_id)
    return {"id": row.id, "employee": {"id": row.employee_id, "name": _name(e) if e else None,
                                       "department_id": getattr(e, "department_id", None)},
            "shift": {"id": row.shift_id, "name": s.name if s else None, "start": s.start_time if s else None,
                      "end": s.end_time if s else None},
            "effective_from": row.effective_from.isoformat(),
            "effective_to": row.effective_to.isoformat() if row.effective_to else None,
            "assigned_by": row.assigned_by}


def list_assignments(db: Session, org: int, *, employee_id: Optional[int] = None, shift_id: Optional[int] = None,
                     active_on: Optional[date] = None, page: int = 1, per_page: int = 50) -> dict:
    from sqlalchemy import or_
    from app.modules.employee.models import Employee
    from app.modules.hr.models import Shift
    q = db.query(EmployeeShift).filter(EmployeeShift.organization_id == org)
    if employee_id:
        q = q.filter(EmployeeShift.employee_id == employee_id)
    if shift_id:
        q = q.filter(EmployeeShift.shift_id == shift_id)
    if active_on:
        q = q.filter(EmployeeShift.effective_from <= active_on,
                     or_(EmployeeShift.effective_to.is_(None), EmployeeShift.effective_to >= active_on))
    total = q.count()
    rows = q.order_by(EmployeeShift.effective_from.desc(), EmployeeShift.id.desc()).offset((page - 1) * per_page).limit(per_page).all()
    people = {e.id: e for e in db.query(Employee).filter(Employee.id.in_({r.employee_id for r in rows} or {0}))}
    shifts = {s.id: s for s in db.query(Shift).filter(Shift.id.in_({r.shift_id for r in rows} or {0}))}
    return {"items": [serialize(db, r, people, shifts) for r in rows], "total": total, "page": page, "per_page": per_page}


def _people(db: Session, org: int, employee_ids, department_id) -> list:
    from app.modules.employee.models import Employee
    ids = {int(i) for i in employee_ids or []}
    q = db.query(Employee).filter(Employee.organization_id == org, Employee.is_active.isnot(False))
    found = q.filter(Employee.id.in_(ids)).all() if ids else []
    if ids - {e.id for e in found}:
        raise BadRequestException("Some of the chosen people are not active employees of this organization.")
    if department_id:
        found += [e for e in q.filter(Employee.department_id == int(department_id)).all() if e.id not in ids]
    if not found:
        raise BadRequestException("Choose at least one person or a department with people in it.")
    if len(found) > MAX_PEOPLE:
        raise BadRequestException(f"Assign at most {MAX_PEOPLE} people at a time.")
    return found


def assign(db: Session, actor, *, shift_id: int, effective_from: date, effective_to: Optional[date] = None,
           employee_ids=(), department_id: Optional[int] = None, ctx=None) -> dict:
    from app.modules.hr.models import Shift
    org = actor.organization_id
    shift = db.query(Shift).filter(Shift.id == shift_id, Shift.organization_id == org).first()
    if shift is None:
        raise NotFoundException("Shift", shift_id)
    if shift.is_active is False:
        raise BadRequestException(f"“{shift.name}” is inactive. Activate it before assigning it.")
    if effective_to is not None and effective_to < effective_from:
        raise BadRequestException("The end date is before the start date.")
    people = _people(db, org, employee_ids, department_id)
    end_new = effective_to or date.max

    # check everyone first, then write: one refusal leaves nothing half-done
    clashes, plans = [], []
    for e in people:
        existing = (db.query(EmployeeShift).filter(EmployeeShift.organization_id == org, EmployeeShift.employee_id == e.id)
                    .order_by(EmployeeShift.effective_from).all())
        overlapping = [r for r in existing if r.effective_from <= end_new and (r.effective_to or date.max) >= effective_from]
        later = [r for r in overlapping if r.effective_from >= effective_from]
        if later:
            clashes.append(f"{_name(e)} already has a shift from {later[0].effective_from.isoformat()}")
        plans.append((e, [r for r in overlapping if r.effective_from < effective_from]))
    if clashes:
        raise ZoikoException(409, "SHIFT_ASSIGNMENT_OVERLAP",
                             "; ".join(clashes[:5]) + (f" and {len(clashes) - 5} more" if len(clashes) > 5 else "")
                             + ". End or change those assignments first.")

    created = []
    for e, earlier in plans:
        for r in earlier:                                    # the running assignment ends the day before
            old_to = r.effective_to
            r.effective_to = effective_from - timedelta(days=1)
            audit.record(db, organization_id=org, employee_id=e.id, work_date=effective_from, action="shift_ended", actor=actor,
                         before={"assignment_id": r.id, "effective_to": old_to.isoformat() if old_to else None},
                         after={"assignment_id": r.id, "effective_to": r.effective_to.isoformat()}, reason="Replaced by a new assignment", ctx=ctx)
            if effective_to is not None and (old_to is None or old_to > effective_to):   # its remainder continues afterwards
                db.add(EmployeeShift(organization_id=org, employee_id=e.id, shift_id=r.shift_id,
                                     effective_from=effective_to + timedelta(days=1), effective_to=old_to, assigned_by=actor.id))
        row = EmployeeShift(organization_id=org, employee_id=e.id, shift_id=shift.id, effective_from=effective_from,
                            effective_to=effective_to, assigned_by=actor.id)
        db.add(row)
        db.flush()
        audit.record(db, organization_id=org, employee_id=e.id, work_date=effective_from, action="shift_assigned", actor=actor,
                     after={"assignment_id": row.id, "shift_id": shift.id, "effective_from": effective_from.isoformat(),
                            "effective_to": effective_to.isoformat() if effective_to else None}, ctx=ctx)
        created.append(row)
    db.commit()

    from app.modules.hr.hr_notifications import notify_employee
    notify_employee(db, org, [e.id for e in people], "shift.assigned", date=effective_from, title=_shift_label(shift), link=LINK)
    try:
        from app.modules.integrations.events import emit_event
        for row in created:
            emit_event(db, "attendance.shift.assigned", {"assignment_id": row.id, "employee_id": row.employee_id, "shift_id": shift.id,
                                                         "effective_from": effective_from.isoformat(),
                                                         "effective_to": effective_to.isoformat() if effective_to else None}, org)
    except Exception:                                        # an integration problem never undoes the assignment
        pass
    return {"items": [serialize(db, r) for r in created], "count": len(created)}


def end(db: Session, actor, assignment_id: int, effective_to: date, ctx=None) -> dict:
    org = actor.organization_id
    row = db.query(EmployeeShift).filter(EmployeeShift.id == assignment_id, EmployeeShift.organization_id == org).first()
    if row is None:
        raise NotFoundException("Shift assignment", assignment_id)
    if effective_to < row.effective_from:
        raise BadRequestException("An assignment can't end before it starts.")
    if row.effective_to is not None and effective_to > row.effective_to:
        raise BadRequestException("That is after the assignment already ends.")
    before = row.effective_to
    row.effective_to = effective_to
    audit.record(db, organization_id=org, employee_id=row.employee_id, work_date=effective_to, action="shift_ended", actor=actor,
                 before={"assignment_id": row.id, "effective_to": before.isoformat() if before else None},
                 after={"assignment_id": row.id, "effective_to": effective_to.isoformat()}, ctx=ctx)
    db.commit()
    from app.modules.hr.hr_notifications import notify_employee
    notify_employee(db, org, [row.employee_id], "shift.changed", date=effective_to + timedelta(days=1),
                    title="no fixed shift (your organization's default applies)", link=LINK)
    return serialize(db, row)
