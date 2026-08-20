import logging
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import func, asc, desc
from sqlalchemy.orm import Session

logger = logging.getLogger("zoiko")

from app.modules.hr.models import (
    AttendanceRecord, Shift, ShiftRoster, Holiday, Employee, Department,
    AttendanceStatus, ShiftType, LeaveRequest, LeaveBalance, RequestStatus,
    LeaveType, UserRole, Organization,
)
from app.modules.hr.schemas import (
    AttendanceCreate, AttendanceUpdate,
    ShiftCreate, ShiftUpdate,
    ShiftRosterCreate,
    HolidayCreate, HolidayUpdate,
    SuccessResponse,
)
from app.core.exceptions import NotFoundException, BadRequestException
from app.core.sanitize import sanitize_dict


# ── DASHBOARD ─────────────────────────────────────────────────────────────────

def get_attendance_dashboard(db: Session, organization_id: Optional[int] = None) -> dict:
    today = date.today()

    base_filter = [AttendanceRecord.date == today]
    if organization_id:
        base_filter.append(AttendanceRecord.organization_id == organization_id)

    present_today = db.query(func.count(AttendanceRecord.id)).filter(
        *base_filter, AttendanceRecord.status == AttendanceStatus.PRESENT,
    ).scalar() or 0

    absent_today = db.query(func.count(AttendanceRecord.id)).filter(
        *base_filter, AttendanceRecord.status == AttendanceStatus.ABSENT,
    ).scalar() or 0

    on_leave_count = db.query(func.count(AttendanceRecord.id)).filter(
        *base_filter, AttendanceRecord.status == AttendanceStatus.ON_LEAVE,
    ).scalar() or 0

    remote_count = db.query(func.count(AttendanceRecord.id)).filter(
        *base_filter, AttendanceRecord.status == AttendanceStatus.REMOTE,
    ).scalar() or 0

    late_arrivals = db.query(func.count(AttendanceRecord.id)).filter(
        *base_filter, AttendanceRecord.status == AttendanceStatus.LATE,
    ).scalar() or 0

    emp_filter = [Employee.is_active == True, Employee.role == UserRole.EMPLOYEE]
    if organization_id:
        emp_filter.append(Employee.organization_id == organization_id)
    total_emp = db.query(func.count(Employee.id)).filter(*emp_filter).scalar() or 1
    attendance_percentage = round((present_today / total_emp) * 100, 2) if total_emp else 0.0

    avg_hours_filter = [
        AttendanceRecord.date == today,
        AttendanceRecord.check_in.isnot(None),
        AttendanceRecord.check_out.isnot(None),
    ]
    if organization_id:
        avg_hours_filter.append(AttendanceRecord.organization_id == organization_id)
    avg_hours = db.query(
        func.avg(
            func.extract("epoch", AttendanceRecord.check_out - AttendanceRecord.check_in) / 3600
        )
    ).filter(*avg_hours_filter).scalar() or 0.0
    avg_working_hours = round(float(avg_hours), 2)

    dept_breakdown_query = (
        db.query(
            Department.name,
            func.count(AttendanceRecord.id),
        )
        .select_from(AttendanceRecord)
        .join(Employee, AttendanceRecord.employee_id == Employee.id)
        .join(Department, Employee.department_id == Department.id)
        .filter(AttendanceRecord.date == today)
    )
    if organization_id:
        dept_breakdown_query = dept_breakdown_query.filter(AttendanceRecord.organization_id == organization_id)
    dept_breakdown = dept_breakdown_query.group_by(Department.name).all()

    shift_util = (
        db.query(
            Shift.name,
            func.count(AttendanceRecord.id),
        )
        .select_from(Shift)
        .outerjoin(ShiftRoster, Shift.id == ShiftRoster.shift_id)
        .outerjoin(AttendanceRecord, (AttendanceRecord.employee_id == ShiftRoster.employee_id) & (AttendanceRecord.date == today))
        .group_by(Shift.name)
        .all()
    )
    
    # shift_util doesn't have a direct Shift ↔ org link, skip org filter

    return {
        "present_today": present_today,
        "absent_today": absent_today,
        "late_arrivals": late_arrivals,
        "early_departures": 0,
        "on_leave": on_leave_count,
        "on_leave_count": on_leave_count,
        "remote": remote_count,
        "remote_count": remote_count,
        "overtime": 0,
        "overtime_count": 0,
        "attendance_percentage": attendance_percentage,
        "attendance_rate": attendance_percentage,
        "avg_working_hours": avg_working_hours,
        "total_employees": total_emp,
        "department_attendance": [{"department": d, "count": c} for d, c in dept_breakdown],
        "department_breakdown": [{"department": d, "count": c} for d, c in dept_breakdown],
        "shift_distribution": [{"shift": s, "count": c} for s, c in shift_util],
        "shift_utilization": [{"shift": s, "count": c} for s, c in shift_util],
        "attendance_trend": [],
    }


# ── ATTENDANCE RECORDS CRUD ──────────────────────────────────────────────────

SORTABLE_FIELDS_RECORDS = {
    "id": AttendanceRecord.id,
    "employee_id": AttendanceRecord.employee_id,
    "date": AttendanceRecord.date,
    "status": AttendanceRecord.status,
    "check_in": AttendanceRecord.check_in,
    "check_out": AttendanceRecord.check_out,
    "created_at": AttendanceRecord.created_at,
}


def _get_records_query(
    db: Session, search=None, status=None, department=None,
    date_from=None, date_to=None, employee_id=None, organization_id=None,
):
    query = db.query(AttendanceRecord)

    if organization_id:
        query = query.filter(AttendanceRecord.organization_id == organization_id)

    if search:
        stmt = f"%{search}%"
        query = query.join(Employee, AttendanceRecord.employee_id == Employee.id).filter(
            (Employee.first_name.ilike(stmt)) |
            (Employee.last_name.ilike(stmt)) |
            (Employee.employee_code.ilike(stmt))
        )

    if status:
        query = query.filter(AttendanceRecord.status == status)

    if department:
        query = query.join(Employee, AttendanceRecord.employee_id == Employee.id).filter(
            Employee.department_id == Department.id,
            Department.name == department,
        )

    if date_from:
        query = query.filter(AttendanceRecord.date >= date_from)

    if date_to:
        query = query.filter(AttendanceRecord.date <= date_to)

    if employee_id:
        query = query.filter(AttendanceRecord.employee_id == employee_id)

    return query


def get_all_attendance_records(db: Session, organization_id: Optional[int] = None, employee_id: Optional[int] = None) -> list[dict]:
    query = db.query(AttendanceRecord)
    if organization_id:
        query = query.filter(AttendanceRecord.organization_id == organization_id)
    if employee_id:
        query = query.filter(AttendanceRecord.employee_id == employee_id)
    records = query.order_by(AttendanceRecord.date.desc()).all()
    items = []
    for r in records:
        items.append({
            "id": r.id,
            "employee_id": r.employee_id,
            "date": r.date,
            "status": r.status.value if hasattr(r.status, 'value') else r.status,
            "check_in": r.check_in,
            "check_out": r.check_out,
            "notes": r.notes,
            "created_at": r.created_at,
            "employee_name": r.employee.full_name if r.employee else None,
            "department": r.employee.department.name if r.employee and r.employee.department else None,
        })
    return items


def get_attendance_records(
    db: Session,
    page: int = 1,
    per_page: int = 20,
    search: Optional[str] = None,
    status: Optional[AttendanceStatus] = None,
    department: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    employee_id: Optional[int] = None,
    sort_by: Optional[str] = "date",
    sort_order: Optional[str] = "desc",
    organization_id: Optional[int] = None,
) -> dict:
    per_page = min(per_page, 100)
    query = _get_records_query(db, search, status, department, date_from, date_to, employee_id, organization_id)
    total = query.count()

    sort_col = SORTABLE_FIELDS_RECORDS.get(sort_by, AttendanceRecord.date)
    sort_fn = desc if sort_order == "desc" else asc
    records = query.order_by(sort_fn(sort_col)).offset((page - 1) * per_page).limit(per_page).all()

    items = []
    for r in records:
        items.append({
            "id": r.id,
            "employee_id": r.employee_id,
            "date": r.date,
            "status": r.status,
            "check_in": r.check_in,
            "check_out": r.check_out,
            "notes": r.notes,
            "created_at": r.created_at,
            "employee_name": r.employee.full_name if r.employee else None,
        })

    return {"total": total, "page": page, "per_page": per_page, "items": items}


def get_attendance_record_by_id(db: Session, record_id: int, organization_id: Optional[int] = None) -> AttendanceRecord:
    query = db.query(AttendanceRecord).filter(AttendanceRecord.id == record_id)
    if organization_id:
        query = query.filter(AttendanceRecord.organization_id == organization_id)
    record = query.first()
    if not record:
        raise NotFoundException("AttendanceRecord", record_id)
    return record


def create_attendance_record(db: Session, data: AttendanceCreate, created_by: int = None, organization_id: int = None) -> AttendanceRecord:
    raw = data.model_dump()
    safe = sanitize_dict(raw)
    record = AttendanceRecord(**safe)
    if organization_id:
        record.organization_id = organization_id
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def update_attendance_record(db: Session, record_id: int, data: AttendanceUpdate, organization_id: Optional[int] = None) -> AttendanceRecord:
    record = get_attendance_record_by_id(db, record_id, organization_id)
    update_data = sanitize_dict(data.model_dump(exclude_unset=True))
    for field, value in update_data.items():
        setattr(record, field, value)
    db.commit()
    db.refresh(record)
    return record


def delete_attendance_record(db: Session, record_id: int, organization_id: Optional[int] = None) -> None:
    record = get_attendance_record_by_id(db, record_id, organization_id)
    db.delete(record)
    db.commit()


# ── SHIFTS ───────────────────────────────────────────────────────────────────

def get_shifts(db: Session, organization_id: Optional[int] = None) -> list[Shift]:
    query = db.query(Shift)
    if organization_id:
        query = query.filter(Shift.organization_id == organization_id)
    return query.order_by(Shift.name).all()


def create_shift(db: Session, data: ShiftCreate, created_by: int = None, organization_id: int = None) -> Shift:
    shift = Shift(**data.model_dump(), created_by=created_by)
    if organization_id:
        shift.organization_id = organization_id
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return shift


def get_shift_by_id(db: Session, shift_id: int, organization_id: Optional[int] = None) -> Shift:
    query = db.query(Shift).filter(Shift.id == shift_id)
    if organization_id:
        query = query.filter(Shift.organization_id == organization_id)
    shift = query.first()
    if not shift:
        raise NotFoundException("Shift", shift_id)
    return shift


def update_shift(db: Session, shift_id: int, data: ShiftUpdate, organization_id: Optional[int] = None) -> Shift:
    shift = get_shift_by_id(db, shift_id, organization_id)
    update_data = sanitize_dict(data.model_dump(exclude_unset=True))
    for field, value in update_data.items():
        setattr(shift, field, value)
    db.commit()
    db.refresh(shift)
    return shift


def delete_shift(db: Session, shift_id: int, organization_id: Optional[int] = None) -> None:
    shift = get_shift_by_id(db, shift_id, organization_id)
    db.delete(shift)
    db.commit()


# ── SHIFT ROSTERS ────────────────────────────────────────────────────────────

def get_shift_rosters(
    db: Session, page: int = 1, per_page: int = 20,
    date_filter: Optional[date] = None,
    employee_id: Optional[int] = None,
    shift_id: Optional[int] = None,
    organization_id: Optional[int] = None,
) -> dict:
    per_page = min(per_page, 100)
    query = db.query(ShiftRoster, Shift, Employee).outerjoin(Shift, ShiftRoster.shift_id == Shift.id).outerjoin(Employee, ShiftRoster.employee_id == Employee.id)
    if organization_id:
        query = query.filter(Employee.organization_id == organization_id)
    if date_filter:
        query = query.filter(ShiftRoster.date == date_filter)
    if employee_id:
        query = query.filter(ShiftRoster.employee_id == employee_id)
    if shift_id:
        query = query.filter(ShiftRoster.shift_id == shift_id)
    total = query.count()
    rows = query.order_by(ShiftRoster.date.desc()).offset((page - 1) * per_page).limit(per_page).all()
    result = []
    for roster, shift, employee in rows:
        result.append({
            "id": roster.id,
            "employee_id": roster.employee_id,
            "shift_id": roster.shift_id,
            "date": roster.date,
            "is_active": roster.is_active,
            "assigned_by": roster.assigned_by,
            "created_at": roster.created_at,
            "updated_at": roster.updated_at,
            "employee_name": employee.full_name if employee else None,
            "shift_name": shift.name if shift else None,
        })
    return {"total": total, "page": page, "per_page": per_page, "items": result}


def create_shift_roster(db: Session, data: ShiftRosterCreate, assigned_by: int = None) -> ShiftRoster:
    roster = ShiftRoster(**data.model_dump(), assigned_by=assigned_by)
    db.add(roster)
    db.commit()
    db.refresh(roster)
    return roster


def delete_shift_roster(db: Session, roster_id: int, organization_id: Optional[int] = None) -> None:
    query = db.query(ShiftRoster).filter(ShiftRoster.id == roster_id)
    if organization_id:
        query = query.join(Employee, ShiftRoster.employee_id == Employee.id).filter(Employee.organization_id == organization_id)
    roster = query.first()
    if not roster:
        raise NotFoundException("ShiftRoster", roster_id)
    db.delete(roster)
    db.commit()


# ── HOLIDAYS ─────────────────────────────────────────────────────────────────

def get_holidays(db: Session, organization_id: Optional[int] = None) -> list[Holiday]:
    query = db.query(Holiday)
    if organization_id:
        query = query.filter(Holiday.organization_id == organization_id)
    return query.order_by(Holiday.date).all()


def create_holiday(db: Session, data: HolidayCreate, created_by: int = None, organization_id: int = None) -> Holiday:
    existing = db.query(Holiday).filter(Holiday.date == data.date, Holiday.name.ilike(data.name)).first()
    if existing:
        raise BadRequestException(f"Holiday on {data.date} already exists")
    holiday = Holiday(**data.model_dump(), created_by=created_by)
    if organization_id:
        holiday.organization_id = organization_id
    db.add(holiday)
    db.commit()
    db.refresh(holiday)
    return holiday


def get_holiday_by_id(db: Session, holiday_id: int, organization_id: Optional[int] = None) -> Holiday:
    query = db.query(Holiday).filter(Holiday.id == holiday_id)
    if organization_id:
        query = query.filter(Holiday.organization_id == organization_id)
    holiday = query.first()
    if not holiday:
        raise NotFoundException("Holiday", holiday_id)
    return holiday


def update_holiday(db: Session, holiday_id: int, data: HolidayUpdate, organization_id: Optional[int] = None) -> Holiday:
    holiday = get_holiday_by_id(db, holiday_id, organization_id)
    update_data = sanitize_dict(data.model_dump(exclude_unset=True))
    for field, value in update_data.items():
        setattr(holiday, field, value)
    db.commit()
    db.refresh(holiday)
    return holiday


def delete_holiday(db: Session, holiday_id: int, organization_id: Optional[int] = None) -> None:
    holiday = get_holiday_by_id(db, holiday_id, organization_id)
    db.delete(holiday)
    db.commit()


def import_holidays(db: Session, holidays: list[dict], created_by: int = None, organization_id: int = None) -> dict:
    imported = 0
    for h in holidays:
        safe = sanitize_dict(h)
        name = safe.get("name")
        h_date = safe.get("date")
        if not name or not h_date:
            continue
        existing = db.query(Holiday).filter(Holiday.date == h_date, Holiday.name.ilike(name)).first()
        if existing:
            continue
        h_type = safe.get("type", "public")
        is_recurring = safe.get("is_recurring", False)
        description = safe.get("description")
        holiday = Holiday(
            name=name,
            date=h_date,
            type=h_type,
            is_recurring=is_recurring,
            description=description,
            created_by=created_by,
            organization_id=organization_id,
        )
        db.add(holiday)
        imported += 1
    db.commit()
    return {"imported": imported}


# ── ANALYTICS ────────────────────────────────────────────────────────────────

def get_attendance_trends(db: Session, date_from: Optional[date] = None, date_to: Optional[date] = None, organization_id: Optional[int] = None) -> dict:
    if not date_to:
        date_to = date.today()
    if not date_from:
        date_from = date_to - timedelta(days=30)

    query = db.query(AttendanceRecord).filter(
        AttendanceRecord.date >= date_from,
        AttendanceRecord.date <= date_to,
    )
    if organization_id is not None:
        query = query.filter(AttendanceRecord.organization_id == organization_id)
    records = query.order_by(AttendanceRecord.date).all()

    daily = {}
    for r in records:
        d = str(r.date)
        if d not in daily:
            daily[d] = {"date": d, "present": 0, "absent": 0}
        if r.status == AttendanceStatus.PRESENT:
            daily[d]["present"] += 1
        elif r.status == AttendanceStatus.ABSENT:
            daily[d]["absent"] += 1

    return {
        "trends": list(daily.values()),
        "date_from": str(date_from),
        "date_to": str(date_to),
    }


def get_department_analysis(db: Session, date_from: Optional[date] = None, date_to: Optional[date] = None, organization_id: Optional[int] = None) -> dict:
    query = db.query(AttendanceRecord).join(Employee, AttendanceRecord.employee_id == Employee.id).join(Department)
    if date_from:
        query = query.filter(AttendanceRecord.date >= date_from)
    if date_to:
        query = query.filter(AttendanceRecord.date <= date_to)
    if organization_id is not None:
        query = query.filter(AttendanceRecord.organization_id == organization_id)

    records = query.all()
    dept_data = {}
    for r in records:
        dept = r.employee.department.name if r.employee and r.employee.department else "Unknown"
        if dept not in dept_data:
            dept_data[dept] = {"present": 0, "absent": 0, "total": 0}
        dept_data[dept]["total"] += 1
        if r.status == AttendanceStatus.PRESENT:
            dept_data[dept]["present"] += 1
        elif r.status == AttendanceStatus.ABSENT:
            dept_data[dept]["absent"] += 1

    breakdown = [
        {
            "department": d,
            "present": v["present"],
            "absent": v["absent"],
            "total_records": v["total"],
            "attendance_rate": round((v["present"] / max(v["total"], 1)) * 100, 2),
        }
        for d, v in dept_data.items()
    ]
    return {"department_breakdown": breakdown, "total_departments": len(breakdown)}


def get_overtime_analytics(db: Session, date_from: Optional[date] = None, date_to: Optional[date] = None, organization_id: Optional[int] = None) -> dict:
    query = db.query(AttendanceRecord).filter(
        AttendanceRecord.check_in.isnot(None),
        AttendanceRecord.check_out.isnot(None),
    )
    if date_from:
        query = query.filter(AttendanceRecord.date >= date_from)
    if date_to:
        query = query.filter(AttendanceRecord.date <= date_to)
    if organization_id is not None:
        query = query.filter(AttendanceRecord.organization_id == organization_id)

    records = query.all()
    monthly = {}
    for r in records:
        key = f"{r.date.year}-{r.date.month:02d}"
        if key not in monthly:
            monthly[key] = {"month": key, "total_hours": 0.0, "record_count": 0}
        hours = (r.check_out - r.check_in).total_seconds() / 3600
        overtime = max(0, hours - 8)
        monthly[key]["total_hours"] += overtime
        monthly[key]["record_count"] += 1

    return {
        "monthly_breakdown": list(monthly.values()),
        "total_months": len(monthly),
    }


def get_shift_efficiency(db: Session, date_from: Optional[date] = None, date_to: Optional[date] = None, organization_id: Optional[int] = None) -> dict:
    query = db.query(ShiftRoster, Shift).join(Shift, ShiftRoster.shift_id == Shift.id)
    if date_from:
        query = query.filter(ShiftRoster.date >= date_from)
    if date_to:
        query = query.filter(ShiftRoster.date <= date_to)
    if organization_id is not None:
        query = query.join(Employee, ShiftRoster.employee_id == Employee.id).filter(Employee.organization_id == organization_id)

    rows = query.all()
    shift_data = {}
    for roster, shift in rows:
        s_name = shift.name if shift else "Unknown"
        if s_name not in shift_data:
            shift_data[s_name] = {"total_assigned": 0, "total_present": 0}
        shift_data[s_name]["total_assigned"] += 1

        att = db.query(AttendanceRecord).filter(
            AttendanceRecord.employee_id == roster.employee_id,
            AttendanceRecord.date == roster.date,
        ).first()
        if att and att.status == AttendanceStatus.PRESENT:
            shift_data[s_name]["total_present"] += 1

    efficiency = [
        {
            "shift": s,
            "total_assigned": v["total_assigned"],
            "total_present": v["total_present"],
            "efficiency": round((v["total_present"] / max(v["total_assigned"], 1)) * 100, 2),
        }
        for s, v in shift_data.items()
    ]
    return {"shift_efficiency": efficiency, "total_shifts": len(efficiency)}


# ── ATTENDANCE ANALYTICS ───────────────────────────────────────────────────────────────

def get_attendance_analytics(db: Session, date_from: Optional[date] = None, date_to: Optional[date] = None, organization_id: Optional[int] = None) -> dict:
    today = date.today()
    org_filter = [AttendanceRecord.organization_id == organization_id] if organization_id else []
    
    present_today = db.query(func.count(AttendanceRecord.id)).filter(
        AttendanceRecord.date == today,
        AttendanceRecord.status == AttendanceStatus.PRESENT,
        *org_filter,
    ).scalar() or 0
    
    absent_today = db.query(func.count(AttendanceRecord.id)).filter(
        AttendanceRecord.date == today,
        AttendanceRecord.status == AttendanceStatus.ABSENT,
        *org_filter,
    ).scalar() or 0
    
    on_leave_count = db.query(func.count(AttendanceRecord.id)).filter(
        AttendanceRecord.date == today,
        AttendanceRecord.status == AttendanceStatus.ON_LEAVE,
        *org_filter,
    ).scalar() or 0
    
    remote_count = db.query(func.count(AttendanceRecord.id)).filter(
        AttendanceRecord.date == today,
        AttendanceRecord.status == AttendanceStatus.REMOTE,
        *org_filter,
    ).scalar() or 0
    
    late_arrivals = db.query(func.count(AttendanceRecord.id)).filter(
        AttendanceRecord.date == today,
        AttendanceRecord.status == AttendanceStatus.LATE,
        *org_filter,
    ).scalar() or 0
    
    emp_filter = [Employee.organization_id == organization_id] if organization_id else []
    total_emp = db.query(func.count(Employee.id)).filter(
        Employee.is_active == True, *emp_filter
    ).scalar() or 1
    attendance_percentage = round((present_today / total_emp) * 100, 2) if total_emp else 0.0
    
    avg_hours = db.query(
        func.avg(
            func.extract("epoch", AttendanceRecord.check_out - AttendanceRecord.check_in) / 3600
        )
    ).filter(
        AttendanceRecord.date == today,
        AttendanceRecord.check_in.isnot(None),
        AttendanceRecord.check_out.isnot(None),
        *org_filter,
    ).scalar() or 0.0
    avg_working_hours = round(float(avg_hours), 2)
    
    return {
        "present_today": present_today,
        "absent_today": absent_today,
        "late_arrivals": late_arrivals,
        "early_departures": 0,
        "on_leave_count": on_leave_count,
        "remote_count": remote_count,
        "overtime_count": 0,
        "attendance_percentage": attendance_percentage,
        "avg_working_hours": avg_working_hours,
        "total_employees": total_emp,
    }


# ── LEAVE MANAGEMENT ──────────────────────────────────────────────────────────────────

def get_leave_dashboard(db: Session, organization_id: Optional[int] = None) -> dict:
    today = date.today()
    base_filter = [LeaveRequest.organization_id == organization_id] if organization_id else []
    total_requests = db.query(func.count(LeaveRequest.id)).filter(*base_filter).scalar() or 0
    pending_requests = db.query(func.count(LeaveRequest.id)).filter(
        LeaveRequest.status == RequestStatus.PENDING, *base_filter
    ).scalar() or 0
    approved_requests = db.query(func.count(LeaveRequest.id)).filter(
        LeaveRequest.status == RequestStatus.APPROVED, *base_filter
    ).scalar() or 0
    rejected_requests = db.query(func.count(LeaveRequest.id)).filter(
        LeaveRequest.status == RequestStatus.REJECTED, *base_filter
    ).scalar() or 0
    total_days_taken = db.query(func.coalesce(func.sum(LeaveRequest.total_days), 0)).filter(
        LeaveRequest.status == RequestStatus.APPROVED, *base_filter
    ).scalar() or 0
    on_leave_today = db.query(func.count(LeaveRequest.id)).filter(
        LeaveRequest.start_date <= today,
        LeaveRequest.end_date >= today,
        LeaveRequest.status == RequestStatus.APPROVED,
        *base_filter,
    ).scalar() or 0
    wfh = db.query(func.count(LeaveRequest.id)).filter(
        LeaveRequest.start_date <= today,
        LeaveRequest.end_date >= today,
        LeaveRequest.status == RequestStatus.APPROVED,
        LeaveRequest.leave_type == LeaveType.WORK_FROM_HOME,
        *base_filter,
    ).scalar() or 0
    emp_filter = [Employee.organization_id == organization_id] if organization_id else []
    employee_count = db.query(func.count(Employee.id)).filter(
        Employee.is_deleted == False, *emp_filter
    ).scalar() or 0
    return {
        "employee_count": employee_count,
        "total_requests": total_requests,
        "pending_requests": pending_requests,
        "approved_requests": approved_requests,
        "rejected_requests": rejected_requests,
        "total_days_taken": total_days_taken,
        "on_leave_today": on_leave_today,
        "wfh": wfh,
    }


def get_leave_requests(
    db: Session,
    page: int = 1,
    per_page: int = 20,
    employee_id: Optional[int] = None,
    status: Optional[str] = None,
    leave_type: Optional[str] = None,
    organization_id: Optional[int] = None,
) -> dict:
    per_page = min(per_page, 100)
    query = db.query(LeaveRequest)
    
    if organization_id:
        query = query.filter(LeaveRequest.organization_id == organization_id)
    if employee_id:
        query = query.filter(LeaveRequest.employee_id == employee_id)
    if status:
        query = query.filter(LeaveRequest.status == status)
    if leave_type:
        query = query.filter(LeaveRequest.leave_type == leave_type)
    
    total = query.count()
    items = query.order_by(LeaveRequest.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    
    result = []
    for r in items:
        result.append({
            "id": r.id,
            "employee_id": r.employee_id,
            "leave_type": r.leave_type,
            "start_date": r.start_date,
            "end_date": r.end_date,
            "days": r.days,
            "reason": r.reason,
            "status": r.status,
            "reviewed_by": r.reviewed_by,
            "reviewed_at": r.reviewed_at,
            "created_at": r.created_at,
            "updated_at": r.updated_at,
            "employee_name": r.employee.full_name if r.employee else None,
        })
    
    return {"total": total, "page": page, "per_page": per_page, "items": result}


def get_leave_request_by_id(db: Session, leave_id: int, organization_id: Optional[int] = None) -> LeaveRequest:
    leave = db.query(LeaveRequest).filter(LeaveRequest.id == leave_id).first()
    if not leave:
        raise NotFoundException("LeaveRequest", leave_id)
    if organization_id and leave.organization_id != organization_id:
        raise NotFoundException("LeaveRequest", leave_id)
    return leave


def create_leave_request(db: Session, data: dict, created_by: int = None, organization_id: Optional[int] = None) -> LeaveRequest:
    if organization_id:
        data["organization_id"] = organization_id
    leave = LeaveRequest(**data, created_by=created_by)
    db.add(leave)
    db.commit()
    db.refresh(leave)
    return leave


def update_leave_request(db: Session, leave_id: int, data: dict, reviewed_by: int = None, organization_id: Optional[int] = None) -> LeaveRequest:
    leave = get_leave_request_by_id(db, leave_id, organization_id)
    update_data = sanitize_dict(data)
    for field, value in update_data.items():
        setattr(leave, field, value)
    if reviewed_by:
        leave.reviewed_by = reviewed_by
        leave.reviewed_at = func.now()
    db.commit()
    db.refresh(leave)
    return leave


def delete_leave_request(db: Session, leave_id: int, organization_id: Optional[int] = None) -> None:
    leave = get_leave_request_by_id(db, leave_id, organization_id)
    db.delete(leave)
    db.commit()


def review_leave_request(db: Session, leave_id: int, data: dict, reviewed_by: int = None, organization_id: Optional[int] = None) -> LeaveRequest:
    leave = get_leave_request_by_id(db, leave_id, organization_id)
    if reviewed_by:
        leave.reviewed_by = reviewed_by
        leave.reviewed_at = func.now()
    update_data = sanitize_dict(data)
    for field, value in update_data.items():
        setattr(leave, field, value)
    db.commit()
    db.refresh(leave)

    # Notify the employee about the review decision (non-blocking)
    if leave.status in (RequestStatus.APPROVED, RequestStatus.REJECTED):
        try:
            from app.services.email_service import send_leave_approved, send_leave_rejected
            from app.config import settings
            employee = db.query(Employee).filter(Employee.id == leave.employee_id).first()
            org = db.query(Organization).filter(Organization.id == leave.organization_id).first()
            if employee:
                if leave.status == RequestStatus.APPROVED:
                    send_leave_approved(
                        email=employee.email,
                        first_name=employee.first_name or "there",
                        request_reference=f"LV-{leave.organization_id}-{leave.id:04d}",
                        leave_period_display=(
                            f"{leave.start_date.strftime('%b %d, %Y')} – {leave.end_date.strftime('%b %d, %Y')}"
                        ),
                        leave_request_url=f"{settings.FRONTEND_URL.rstrip('/')}/employee/leaves",
                        workspace_name=(org.organization_name or org.display_name or "Your workspace") if org else "Your workspace",
                        db=db,
                        organization_id=leave.organization_id,
                    )
                else:
                    send_leave_rejected(
                        email=employee.email,
                        first_name=employee.first_name or "there",
                        request_reference=f"LV-{leave.organization_id}-{leave.id:04d}",
                        leave_request_url=f"{settings.FRONTEND_URL.rstrip('/')}/employee/leaves",
                        db=db,
                        organization_id=leave.organization_id,
                    )
        except Exception as e:
            logger.warning(f"[email] Failed to notify employee about reviewed leave request {leave.id}: {e}")

    return leave


def get_leave_balance(db: Session, employee_id: Optional[int] = None, organization_id: Optional[int] = None) -> dict:
    query = db.query(LeaveBalance)
    if organization_id:
        query = query.filter(LeaveBalance.organization_id == organization_id)
    if employee_id:
        query = query.filter(LeaveBalance.employee_id == employee_id)
    
    balances = query.all()
    result = {}
    for b in balances:
        # b.leave_type is a str-mixin Enum; str() on it renders "LeaveType.SICK"
        # rather than "sick" on this Python version, so use .value explicitly.
        leave_type_key = b.leave_type.value if hasattr(b.leave_type, "value") else str(b.leave_type)
        result[leave_type_key] = {
            "total_days": b.total_days,
            "used_days": b.used_days,
            "pending_days": b.pending_days,
            "year": b.year,
            "employee_id": b.employee_id,
            "organization_id": b.organization_id,
        }
    
    return result


def init_leave_balance(db: Session, employee_id: int, year: int, created_by: int = None, organization_id: Optional[int] = None) -> dict:
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise NotFoundException("Employee", employee_id)
    if organization_id and employee.organization_id != organization_id:
        raise NotFoundException("Employee", employee_id)
    
    org_id = organization_id or employee.organization_id or 1
    
    existing = db.query(LeaveBalance).filter(
        LeaveBalance.employee_id == employee_id,
        LeaveBalance.organization_id == org_id,
        LeaveBalance.year == year
    ).first()
    
    if existing:
        return {"message": f"Leave balance already exists for employee {employee_id} in year {year}"}
    
    default_balances = [
        {"leave_type": LeaveType.ANNUAL, "total_days": 21},
        {"leave_type": LeaveType.SICK, "total_days": 12},
        {"leave_type": LeaveType.CASUAL, "total_days": 5},
        {"leave_type": LeaveType.UNPAID, "total_days": 0},
    ]
    
    created = []
    for bal in default_balances:
        balance = LeaveBalance(
            employee_id=employee_id,
            organization_id=org_id,
            leave_type=bal["leave_type"],
            total_days=bal["total_days"],
            used_days=0,
            pending_days=0,
            year=year,
            created_by=created_by,
        )
        db.add(balance)
        created.append(balance)
    
    db.commit()
    for bal in created:
        db.refresh(bal)
    
    return {"created": len(created), "balances": created}


# ── ATTENDANCE EXPORTS ─────────────────────────────────────────────────────────

def export_attendance_csv(
    db: Session,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    employee_id: Optional[int] = None,
):
    query = db.query(AttendanceRecord)
    if date_from:
        query = query.filter(AttendanceRecord.date >= date_from)
    if date_to:
        query = query.filter(AttendanceRecord.date <= date_to)
    if employee_id:
        query = query.filter(AttendanceRecord.employee_id == employee_id)
    records = query.order_by(AttendanceRecord.date.desc()).all()

    import csv, io
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Employee ID", "Date", "Check In", "Check Out", "Status", "Hours Worked"])
    for r in records:
        writer.writerow([r.id, r.employee_id, r.date, r.check_in, r.check_out, r.status.value if r.status else "", r.hours_worked])
    output.seek(0)
    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=attendance_{date_from or 'all'}_{date_to or 'all'}.csv"},
    )


def export_attendance_excel(
    db: Session,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    employee_id: Optional[int] = None,
):
    query = db.query(AttendanceRecord)
    if date_from:
        query = query.filter(AttendanceRecord.date >= date_from)
    if date_to:
        query = query.filter(AttendanceRecord.date <= date_to)
    if employee_id:
        query = query.filter(AttendanceRecord.employee_id == employee_id)
    records = query.order_by(AttendanceRecord.date.desc()).all()

    import openpyxl
    from io import BytesIO

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Attendance"
    ws.append(["ID", "Employee ID", "Date", "Check In", "Check Out", "Status", "Hours Worked"])
    for r in records:
        ws.append([r.id, r.employee_id, r.date, r.check_in, r.check_out, r.status.value if r.status else "", r.hours_worked])

    output = BytesIO()
    wb.save(output)
    output.seek(0)
    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=attendance_{date_from or 'all'}_{date_to or 'all'}.xlsx"},
    )