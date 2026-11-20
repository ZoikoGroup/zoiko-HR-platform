from datetime import date
from typing import Optional, Union

from fastapi import APIRouter, Depends, Query, Body, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.exceptions import BadRequestException
from app.core.dependencies import get_current_user, get_current_admin

from pydantic import BaseModel, Field

from app.modules.hr import attendance_service
from app.modules.hr.attendance import records_service
from app.modules.hr.attendance.records_service import RecordFilter
from app.modules.hr.documents.audit_service import RequestCtx, request_ctx
from app.modules.hr.models import AttendanceStatus, ShiftType
from app.modules.employee.models import UserRole
from app.modules.hr.schemas import (
    AttendanceCreate, AttendanceUpdate, AttendanceResponse,
    AttendanceDashboardResponse,
    ShiftCreate, ShiftUpdate, ShiftResponse,
    ShiftRosterCreate, ShiftRosterResponse,
    HolidayCreate, HolidayUpdate, HolidayResponse,
    SuccessResponse, LeaveRequestResponse,
)

attendance_router = APIRouter(prefix="/hr/attendance", tags=["Attendance"])


# ── DASHBOARD ─────────────────────────────────────────────────────────────────

@attendance_router.get(
    "/dashboard",
    response_model=AttendanceDashboardResponse,
    summary="Attendance dashboard statistics",
)
def attendance_dashboard(
    department: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return attendance_service.get_attendance_dashboard(db, current_user.organization_id, department=department)


@attendance_router.get("/dashboard/today", summary="Live today: who is working, late, on leave, off or not checked in yet")
def attendance_today(
    department_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from app.modules.hr.attendance import dashboard_today
    from app.modules.hr.attendance.errors import forbidden
    role = getattr(current_user.role, "value", current_user.role)
    if role not in ("super_admin", "admin", "hr_admin", "manager"):
        raise forbidden("ATT_FORBIDDEN", "Only HR, organization admins and managers can see today's attendance.")
    return dashboard_today.today(db, current_user, department_id=department_id)


@attendance_router.get("/approvals", summary="Correction and overtime requests to review (managers: their team; HR: everyone)")
def attendance_approvals(
    type: str = Query("all", pattern="^(all|correction|overtime)$"),
    status: str = Query("pending", pattern="^(all|pending|approved|rejected)$"),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from app.modules.hr.attendance import approvals_service
    return approvals_service.queue(db, current_user, kind=type, status=status, page=page, per_page=per_page)


@attendance_router.get("", summary="List attendance records (plain list without page/per_page, capped at 1000)")
def list_all_attendance(
    page: Optional[int] = Query(None, ge=1, description="Page number (omit for the plain list)"),
    per_page: Optional[int] = Query(None, ge=1, le=200, description="Rows per page"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    scope = attendance_service.viewer_scope(db, current_user)
    return attendance_service.get_all_attendance_records(db, current_user.organization_id, page=page, per_page=per_page,
                                                         employee_ids=scope)


# ── ATTENDANCE RECORDS CRUD ──────────────────────────────────────────────────

class RecordBreakIn(BaseModel):
    start: str = Field(..., max_length=25)
    end: str = Field(..., max_length=25)


class RecordCreateIn(BaseModel):
    employee_id: int
    date: date
    status: Optional[str] = Field(None, max_length=20)         # set = HR decides the status (kept, not recomputed)
    check_in: Optional[str] = Field(None, max_length=25)       # local "HH:MM" or "YYYY-MM-DDTHH:MM"
    check_out: Optional[str] = Field(None, max_length=25)
    breaks: Optional[list[RecordBreakIn]] = Field(None, max_length=6)
    notes: Optional[str] = Field(None, max_length=2000)
    reason: Optional[str] = Field(None, max_length=1000)       # required (checked in the service, with a clear message)


class RecordUpdateIn(BaseModel):
    status: Optional[str] = Field(None, max_length=20)
    check_in: Optional[str] = Field(None, max_length=25)
    check_out: Optional[str] = Field(None, max_length=25)
    breaks: Optional[list[RecordBreakIn]] = Field(None, max_length=6)
    notes: Optional[str] = Field(None, max_length=2000)
    unlock_status: bool = False
    reason: Optional[str] = Field(None, max_length=1000)


def _filters(page, per_page, search, status, department, department_id, source, employee_id, date_from, date_to, preset,
             sort_by, sort_order) -> RecordFilter:
    return RecordFilter(page=page, per_page=per_page, search=search, status=status, department=department, department_id=department_id,
                        source=source, employee_id=employee_id, date_from=date_from, date_to=date_to, preset=preset,
                        sort_by=sort_by or "date", sort_order=sort_order or "desc")


@attendance_router.get("/records", summary="Attendance log: filters, date presets and paging (scoped to who you may see)")
def list_attendance_records(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    page:          int            = Query(1, ge=1),
    per_page:      int            = Query(25, ge=1, le=200),
    search:        Optional[str]  = Query(None, max_length=100),
    status:        Optional[str]  = Query(None, max_length=20),
    department:    Optional[str]  = Query(None, max_length=150),
    department_id: Optional[int]  = Query(None),
    source:        Optional[str]  = Query(None, max_length=12),
    date_from:     Optional[date] = Query(None),
    date_to:       Optional[date] = Query(None),
    preset:        Optional[str]  = Query(None, pattern="^(today|yesterday|this_week|this_month|last_month)$"),
    employee_id:   Optional[int]  = Query(None),
    sort_by:       Optional[str]  = Query("date"),
    sort_order:    Optional[str]  = Query("desc", pattern="^(asc|desc)$"),
):
    return records_service.list_records(db, current_user, _filters(page, per_page, search, status, department, department_id, source,
                                                                    employee_id, date_from, date_to, preset, sort_by, sort_order))


@attendance_router.post("/records", status_code=status.HTTP_201_CREATED, summary="Add a record (a reason is required)")
def create_attendance_record(data: RecordCreateIn, db: Session = Depends(get_db), current_user=Depends(get_current_admin),
                             ctx: RequestCtx = Depends(request_ctx)):
    body = data.model_dump()
    body["breaks"] = [b for b in (body.get("breaks") or [])]
    return records_service.create(db, current_user, body, ctx)


@attendance_router.get("/records/{record_id}", summary="One record with its breaks")
def get_attendance_record(record_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return records_service.get_one(db, current_user, record_id)


@attendance_router.get("/records/{record_id}/audit", summary="Who changed this record, when, what and why")
def attendance_record_audit(record_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return {"items": records_service.audit_for(db, current_user, record_id)}


@attendance_router.patch("/records/{record_id}", summary="Change a record (a reason is required)")
def patch_attendance_record(record_id: int, data: RecordUpdateIn, db: Session = Depends(get_db),
                            current_user=Depends(get_current_admin), ctx: RequestCtx = Depends(request_ctx)):
    return records_service.update(db, current_user, record_id, data.model_dump(exclude_unset=True), ctx)


@attendance_router.put("/records/{record_id}", summary="Change a record (same as PATCH; a reason is required)")
def update_attendance_record(record_id: int, data: RecordUpdateIn, db: Session = Depends(get_db),
                             current_user=Depends(get_current_admin), ctx: RequestCtx = Depends(request_ctx)):
    return records_service.update(db, current_user, record_id, data.model_dump(exclude_unset=True), ctx)


@attendance_router.delete("/records/{record_id}", response_model=SuccessResponse, summary="Remove a record (kept in history)")
def delete_attendance_record(record_id: int, reason: Optional[str] = Query(None, max_length=1000), db: Session = Depends(get_db),
                             current_user=Depends(get_current_admin), ctx: RequestCtx = Depends(request_ctx)):
    records_service.soft_delete(db, current_user, record_id, reason, ctx)
    return {"message": f"Attendance record {record_id} has been removed."}


# ── SHIFTS ───────────────────────────────────────────────────────────────────

@attendance_router.get("/shifts", response_model=list[ShiftResponse])
def list_shifts(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return attendance_service.get_shifts(db, current_user.organization_id)


@attendance_router.post("/shifts", response_model=ShiftResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(get_current_admin)])
def create_shift(data: ShiftCreate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return attendance_service.create_shift(db, data, created_by=current_user.id, organization_id=current_user.organization_id)


# ── SHIFT ROSTERS ────────────────────────────────────────────────────────────

@attendance_router.get("/shifts/rosters", summary="List shift rosters")
def list_shift_rosters(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    page:       int  = Query(1, ge=1),
    per_page:   int  = Query(20, ge=1, le=200),
    date_filter: Optional[date] = Query(None, alias="date"),
    employee_id: Optional[int]  = Query(None),
    shift_id:   Optional[int]  = Query(None),
):
    return attendance_service.get_shift_rosters(db, page, per_page, date_filter, employee_id, shift_id, organization_id=current_user.organization_id)


@attendance_router.post("/shifts/rosters", response_model=ShiftRosterResponse, status_code=status.HTTP_201_CREATED)
def create_shift_roster(
    data: ShiftRosterCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return attendance_service.create_shift_roster(db, data, assigned_by=current_user.id,
                                                  organization_id=current_user.organization_id)


@attendance_router.delete("/shifts/rosters/{roster_id}", response_model=SuccessResponse, dependencies=[Depends(get_current_admin)])
def delete_shift_roster(roster_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    attendance_service.delete_shift_roster(db, roster_id, organization_id=current_user.organization_id)
    return {"message": f"Shift roster {roster_id} has been deleted successfully."}


@attendance_router.get("/shifts/{shift_id}", response_model=ShiftResponse)
def get_shift(
    shift_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return attendance_service.get_shift_by_id(db, shift_id, current_user.organization_id)


@attendance_router.put("/shifts/{shift_id}", response_model=ShiftResponse, dependencies=[Depends(get_current_admin)])
def update_shift(shift_id: int, data: ShiftUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return attendance_service.update_shift(db, shift_id, data, current_user.organization_id)


@attendance_router.delete("/shifts/{shift_id}", response_model=SuccessResponse, dependencies=[Depends(get_current_admin)])
def delete_shift(shift_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    attendance_service.delete_shift(db, shift_id, current_user.organization_id)
    return {"message": f"Shift {shift_id} has been deleted successfully."}


# ── HOLIDAYS ─────────────────────────────────────────────────────────────────

@attendance_router.get("/holidays", response_model=list[HolidayResponse])
def list_holidays(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return attendance_service.get_holidays(db, current_user.organization_id)


@attendance_router.post("/holidays", response_model=HolidayResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(get_current_admin)])
def create_holiday(data: HolidayCreate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return attendance_service.create_holiday(db, data, created_by=current_user.id, organization_id=current_user.organization_id)


@attendance_router.get("/holidays/{holiday_id}", response_model=HolidayResponse)
def get_holiday(
    holiday_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return attendance_service.get_holiday_by_id(db, holiday_id, current_user.organization_id)


@attendance_router.put("/holidays/{holiday_id}", response_model=HolidayResponse, dependencies=[Depends(get_current_admin)])
def update_holiday(holiday_id: int, data: HolidayUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return attendance_service.update_holiday(db, holiday_id, data, current_user.organization_id)


@attendance_router.delete("/holidays/{holiday_id}", response_model=SuccessResponse, dependencies=[Depends(get_current_admin)])
def delete_holiday(holiday_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    attendance_service.delete_holiday(db, holiday_id, current_user.organization_id)
    return {"message": f"Holiday {holiday_id} has been deleted successfully."}


@attendance_router.post("/holidays/import", status_code=status.HTTP_201_CREATED, dependencies=[Depends(get_current_admin)])
def import_holidays(
    payload: Union[list[dict], dict] = Body(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    """Bulk-add holidays. The body may be the array itself or {"holidays": [...]}; the page used to
    send the wrapped form to an endpoint that only accepted the bare array, so every import failed."""
    rows = payload.get("holidays") if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        raise BadRequestException('Send a list of holidays, or an object like {"holidays": [...]}.')
    return attendance_service.import_holidays(db, rows, created_by=current_user.id, organization_id=current_user.organization_id)


# ── ANALYTICS ────────────────────────────────────────────────────────────────

@attendance_router.get("/analytics/trends", summary="Attendance trends")
def attendance_trends(
    date_from: Optional[date] = Query(None),
    date_to:   Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return attendance_service.get_attendance_trends(db, date_from, date_to, organization_id=current_user.organization_id)


@attendance_router.get("/analytics/department", summary="Department analysis")
def department_analysis(
    date_from: Optional[date] = Query(None),
    date_to:   Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return attendance_service.get_department_analysis(db, date_from, date_to, organization_id=current_user.organization_id)


@attendance_router.get("/analytics/overtime", summary="Overtime analytics")
def overtime_analytics(
    date_from: Optional[date] = Query(None),
    date_to:   Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return attendance_service.get_overtime_analytics(db, date_from, date_to, organization_id=current_user.organization_id)


@attendance_router.get("/analytics/summary", summary="Attendance analytics headline figures")
def attendance_kpis(
    date_from: Optional[date] = Query(None),
    date_to:   Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return attendance_service.get_attendance_kpis(db, date_from, date_to, organization_id=current_user.organization_id)


@attendance_router.get("/analytics/shift-efficiency", summary="Shift efficiency analytics")
def shift_efficiency(
    date_from: Optional[date] = Query(None),
    date_to:   Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return attendance_service.get_shift_efficiency(db, date_from, date_to, organization_id=current_user.organization_id)


# ── ATTENDANCE ANALYTICS ───────────────────────────────────────────────────────────────

@attendance_router.get("/analytics", summary="Attendance analytics dashboard")
def attendance_analytics(
    date_from: Optional[date] = Query(None),
    date_to:   Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return attendance_service.get_attendance_analytics(db, date_from, date_to, organization_id=current_user.organization_id)

# ── LEAVE MANAGEMENT ──────────────────────────────────────────────────────────────────

@attendance_router.get("/leaves/dashboard", summary="Leave dashboard stats")
def leave_dashboard(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return attendance_service.get_leave_dashboard(db, organization_id=current_user.organization_id)


@attendance_router.get("/leaves", summary="List leave requests")
def list_leave_requests(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    page:       int  = Query(1, ge=1),
    per_page:   int  = Query(20, ge=1, le=200),
    employee_id: Optional[int] = Query(None),
    status:      Optional[str] = Query(None),
    leave_type:  Optional[str] = Query(None),
):
    if current_user.role == UserRole.EMPLOYEE:
        employee_id = current_user.id
    return attendance_service.get_leave_requests(db, page, per_page, employee_id, status, leave_type, organization_id=current_user.organization_id)

@attendance_router.post("/leaves", response_model=LeaveRequestResponse, status_code=status.HTTP_201_CREATED)
def create_leave_request(
    data: dict = Body(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return attendance_service.create_leave_request(db, data, created_by=current_user.id, organization_id=current_user.organization_id)


@attendance_router.get("/leaves/balance")
def get_leave_balance(
    employee_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return attendance_service.get_leave_balance(db, employee_id, organization_id=current_user.organization_id)


@attendance_router.post("/leaves/balance/init")
def init_leave_balance(
    employee_id: int = Query(...),
    year: int = Query(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return attendance_service.init_leave_balance(db, employee_id, year, created_by=current_user.id, organization_id=current_user.organization_id)


@attendance_router.get("/leaves/{leave_id}", response_model=LeaveRequestResponse)
def get_leave_request(
    leave_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return attendance_service.get_leave_request_by_id(db, leave_id, organization_id=current_user.organization_id)

@attendance_router.put("/leaves/{leave_id}", response_model=LeaveRequestResponse)
def update_leave_request(
    leave_id: int,
    data: dict = Body(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return attendance_service.update_leave_request(db, leave_id, data, reviewed_by=current_user.id, organization_id=current_user.organization_id)

@attendance_router.delete("/leaves/{leave_id}", response_model=SuccessResponse)
def delete_leave_request(
    leave_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    attendance_service.delete_leave_request(db, leave_id, organization_id=current_user.organization_id, actor=current_user)
    return {"message": f"Leave request {leave_id} has been deleted successfully."}

@attendance_router.put("/leaves/{leave_id}/review", response_model=LeaveRequestResponse)
def review_leave_request(
    leave_id: int,
    data: dict = Body(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return attendance_service.review_leave_request(db, leave_id, data, reviewed_by=current_user.id, organization_id=current_user.organization_id)


# ── ATTENDANCE EXPORTS ───────────────────────────────────────────────────────

def _export_ids(db, user, search, status, department, department_id, source, preset, date_from, date_to, employee_id):
    if not any((search, status, department, department_id, source, preset)):
        return None                                        # no extra filter: the original export query (dates, employee)
    f = _filters(1, 1, search, status, department, department_id, source, employee_id, date_from, date_to, preset, "date", "desc")
    return records_service.filtered_ids(db, user, f), f.date_from, f.date_to


@attendance_router.get("/export/csv", summary="Export attendance as CSV (same filters as the log)")
def export_attendance_csv(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    employee_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None, max_length=100), status: Optional[str] = Query(None, max_length=20),
    department: Optional[str] = Query(None, max_length=150), department_id: Optional[int] = Query(None),
    source: Optional[str] = Query(None, max_length=12),
    preset: Optional[str] = Query(None, pattern="^(today|yesterday|this_week|this_month|last_month)$"),
):
    picked = _export_ids(db, current_user, search, status, department, department_id, source, preset, date_from, date_to, employee_id)
    ids, date_from, date_to = picked if picked else (None, date_from, date_to)
    return attendance_service.export_attendance_csv(db, date_from, date_to, employee_id, organization_id=current_user.organization_id,
                                                    record_ids=ids)


@attendance_router.get("/export/excel", summary="Export attendance as Excel (same filters as the log)")
def export_attendance_excel(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    employee_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None, max_length=100), status: Optional[str] = Query(None, max_length=20),
    department: Optional[str] = Query(None, max_length=150), department_id: Optional[int] = Query(None),
    source: Optional[str] = Query(None, max_length=12),
    preset: Optional[str] = Query(None, pattern="^(today|yesterday|this_week|this_month|last_month)$"),
):
    picked = _export_ids(db, current_user, search, status, department, department_id, source, preset, date_from, date_to, employee_id)
    ids, date_from, date_to = picked if picked else (None, date_from, date_to)
    return attendance_service.export_attendance_excel(db, date_from, date_to, employee_id, organization_id=current_user.organization_id,
                                                      record_ids=ids)
