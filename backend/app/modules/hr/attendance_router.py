from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query, Body, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_user, get_current_admin

from app.modules.hr import attendance_service
from app.modules.hr.models import AttendanceStatus, ShiftType
from app.modules.employee.models import UserRole
from app.modules.hr.schemas import (
    AttendanceCreate, AttendanceUpdate, AttendanceResponse,
    AttendanceDashboardResponse,
    ShiftCreate, ShiftUpdate, ShiftResponse,
    ShiftRosterCreate, ShiftRosterResponse,
    HolidayCreate, HolidayUpdate, HolidayResponse,
    SuccessResponse,
)

attendance_router = APIRouter(prefix="/hr/attendance", tags=["Attendance"])


# ── DASHBOARD ─────────────────────────────────────────────────────────────────

@attendance_router.get(
    "/dashboard",
    response_model=AttendanceDashboardResponse,
    summary="Attendance dashboard statistics",
)
def attendance_dashboard(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return attendance_service.get_attendance_dashboard(db, current_user.organization_id)


@attendance_router.get("", summary="List all attendance records (unpaginated)")
def list_all_attendance(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    employee_id = current_user.id if current_user.role == UserRole.EMPLOYEE else None
    return attendance_service.get_all_attendance_records(db, current_user.organization_id, employee_id=employee_id)


# ── ATTENDANCE RECORDS CRUD ──────────────────────────────────────────────────

@attendance_router.get("/records", summary="List attendance records with filters")
def list_attendance_records(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    page:        int                    = Query(1, ge=1),
    per_page:    int                    = Query(20, ge=1, le=10000),
    search:      Optional[str]          = Query(None),
    status:      Optional[AttendanceStatus] = Query(None),
    department:  Optional[str]          = Query(None),
    date_from:   Optional[date]         = Query(None),
    date_to:     Optional[date]         = Query(None),
    employee_id: Optional[int]          = Query(None),
    sort_by:     Optional[str]          = Query("date"),
    sort_order:  Optional[str]          = Query("desc"),
):
    if current_user.role == UserRole.EMPLOYEE:
        employee_id = current_user.id
    return attendance_service.get_attendance_records(
        db, page, per_page, search, status, department, date_from, date_to, employee_id, sort_by, sort_order,
        organization_id=current_user.organization_id,
    )


@attendance_router.post("/records", response_model=AttendanceResponse, status_code=status.HTTP_201_CREATED)
def create_attendance_record(
    data: AttendanceCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return attendance_service.create_attendance_record(db, data, created_by=current_user.id, organization_id=current_user.organization_id)


@attendance_router.get("/records/{record_id}", response_model=AttendanceResponse)
def get_attendance_record(
    record_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return attendance_service.get_attendance_record_by_id(db, record_id, current_user.organization_id)


@attendance_router.put("/records/{record_id}", response_model=AttendanceResponse)
def update_attendance_record(
    record_id: int,
    data: AttendanceUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return attendance_service.update_attendance_record(db, record_id, data, current_user.organization_id)


@attendance_router.delete("/records/{record_id}", response_model=SuccessResponse)
def delete_attendance_record(
    record_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    attendance_service.delete_attendance_record(db, record_id, current_user.organization_id)
    return {"message": f"Attendance record {record_id} has been deleted successfully."}


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
    per_page:   int  = Query(20, ge=1, le=10000),
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
    return attendance_service.create_shift_roster(db, data, assigned_by=current_user.id)


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
    holidays: list[dict] = Body(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return attendance_service.import_holidays(db, holidays, created_by=current_user.id, organization_id=current_user.organization_id)


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
    per_page:   int  = Query(20, ge=1, le=10000),
    employee_id: Optional[int] = Query(None),
    status:      Optional[str] = Query(None),
    leave_type:  Optional[str] = Query(None),
):
    if current_user.role == UserRole.EMPLOYEE:
        employee_id = current_user.id
    return attendance_service.get_leave_requests(db, page, per_page, employee_id, status, leave_type, organization_id=current_user.organization_id)

@attendance_router.post("/leaves", response_model=SuccessResponse, status_code=status.HTTP_201_CREATED)
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


@attendance_router.get("/leaves/{leave_id}", response_model=SuccessResponse)
def get_leave_request(
    leave_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return attendance_service.get_leave_request_by_id(db, leave_id, organization_id=current_user.organization_id)

@attendance_router.put("/leaves/{leave_id}", response_model=SuccessResponse)
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
    attendance_service.delete_leave_request(db, leave_id, organization_id=current_user.organization_id)
    return {"message": f"Leave request {leave_id} has been deleted successfully."}

@attendance_router.put("/leaves/{leave_id}/review", response_model=SuccessResponse)
def review_leave_request(
    leave_id: int,
    data: dict = Body(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return attendance_service.review_leave_request(db, leave_id, data, reviewed_by=current_user.id, organization_id=current_user.organization_id)


# ── ATTENDANCE EXPORTS ───────────────────────────────────────────────────────

@attendance_router.get("/export/csv", summary="Export attendance as CSV")
def export_attendance_csv(
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    employee_id: Optional[int] = Query(None),
):
    return attendance_service.export_attendance_csv(db, date_from, date_to, employee_id)


@attendance_router.get("/export/excel", summary="Export attendance as Excel")
def export_attendance_excel(
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    employee_id: Optional[int] = Query(None),
):
    return attendance_service.export_attendance_excel(db, date_from, date_to, employee_id)
