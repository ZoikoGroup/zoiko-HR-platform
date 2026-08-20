"""
modules/hr/router.py
--------------------
Defines all HTTP endpoints for the HR module.

Endpoints created here:
  AUTH
    POST   /auth/login                  → Login, get token

  DEPARTMENTS
    POST   /hr/departments              → Create department
    GET    /hr/departments              → List all departments
    GET    /hr/departments/{id}         → Get one department
    PUT    /hr/departments/{id}         → Update department
    DELETE /hr/departments/{id}         → Delete department

  EMPLOYEES
    POST   /hr/employees                → Onboard new employee
    GET    /hr/employees                → List employees (with filters)
    GET    /hr/employees/{id}           → Get one employee
    PUT    /hr/employees/{id}           → Update employee
    DELETE /hr/employees/{id}           → Deactivate employee
    GET    /hr/employees/me             → Get my own profile

  DASHBOARD
    GET    /hr/dashboard/stats          → HR summary stats
"""

import os
import uuid
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status, Body
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_user, get_current_admin, get_current_org_admin

# Assuming these are imported from your config or database modules
# from app.database import get_db
# from app.modules.hr.auth import get_current_user, get_current_admin
# from app.modules.hr.schemas import DesignationCreate, DesignationUpdate, DesignationResponse, SuccessResponse


from app.modules.hr import service
from app.modules.hr.models import LeaveType, RequestStatus, HrDocument
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.schemas import (
    DepartmentCreate, DepartmentUpdate, DepartmentResponse,
    SuccessResponse, RefreshRequest, TokenResponse,
    OrganizationUpdate,
    AttendanceCreate, AttendanceResponse,
    LeaveRequestCreate, LeaveRequestUpdate, LeaveRequestResponse,
    LeaveTypeConfigCreate, LeaveTypeConfigUpdate, LeaveTypeConfigResponse,
    LeaveSettingCreate, LeaveSettingUpdate, LeaveSettingResponse,
    LeaveBalanceResponse, LeaveBalanceUpdate,
    LeaveDashboardStats, LeaveCalendarEvent, LeaveStatisticsResponse,
    PayGradeCreate, PayGradeUpdate, PayGradeResponse,
    CompensationBandCreate, CompensationBandUpdate, CompensationBandResponse,
    SalaryComponentCreate, SalaryComponentUpdate, SalaryComponentResponse,
    SalaryStructureCreate, SalaryStructureUpdate, SalaryStructureResponse,
    StructureComponentCreate, StructureComponentUpdate, StructureComponentResponse,
    SalaryRevisionCreate, SalaryRevisionUpdate, SalaryRevisionResponse,
    AllowanceCreate, AllowanceUpdate, AllowanceResponse,
    BenefitCreate, BenefitUpdate, BenefitResponse,
    ComplianceRecordCreate, ComplianceRecordResponse,
    PolicyCreate, PolicyResponse,
    AuditCreate, AuditResponse,
    PolicyAcknowledgementCreate, PolicyAcknowledgementResponse,
    RegulatoryRequirementCreate, RegulatoryRequirementResponse,
    RiskCreate, RiskResponse,
    ViolationCreate, ViolationResponse,
    CorrectiveActionCreate, CorrectiveActionResponse,
    ComplianceDashboardResponse, ComplianceReportItem,
    EngagementSurveyCreate, EngagementSurveyResponse,
    EssRequestCreate, EssRequestUpdate, EssRequestResponse,
    OnboardingNewHireCreate, OnboardingNewHireUpdate, OnboardingNewHireResponse,
    OnboardingPreboardingTaskCreate, OnboardingPreboardingTaskUpdate, OnboardingPreboardingTaskResponse,
    OnboardingDocumentCreate, OnboardingDocumentUpdate, OnboardingDocumentResponse,
    OnboardingChecklistCreate, OnboardingChecklistUpdate, OnboardingChecklistResponse,
    OnboardingChecklistAssignmentCreate,
    OnboardingOrientationCreate, OnboardingOrientationUpdate, OnboardingOrientationResponse,
    OnboardingOrientationAttendeeCreate, OnboardingOrientationAttendeeUpdate, OnboardingOrientationAttendeeResponse,
    OnboardingActivityResponse, OnboardingDashboardResponse, OnboardingAnalyticsResponse,
    PerformanceReviewCreate, PerformanceReviewUpdate, PerformanceReviewResponse,
    PerformanceGoalCreate, PerformanceGoalUpdate, PerformanceGoalResponse,
    PerformanceKpiCreate, PerformanceKpiUpdate, PerformanceKpiResponse,
    PerformanceFeedbackCreate, PerformanceFeedbackResponse,
    AppraisalCreate, AppraisalUpdate, AppraisalResponse,
    TravelRequestCreate, TravelRequestUpdate, TravelRequestResponse,
    TravelExpenseCreate, TravelExpenseCreateSimple, TravelExpenseUpdate, TravelExpenseResponse,
    TravelSettingUpdate, TravelSettingResponse,
    TravelDashboardStats,
    WorkforcePlanCreate, WorkforcePlanResponse,
    WorkforceSummaryResponse,
    DesignationCreate,
    DesignationUpdate,
    DesignationResponse,
    HrDocumentUpdate,
    HrDocumentStatusUpdate,
    HrDocumentResponse,
    ApprovalAction,
    DocumentAssignRequest,
    EmployeeDocumentResponse,
)

auth_router = APIRouter(prefix="/auth", tags=["🔐 Authentication"])
hr_router   = APIRouter(prefix="/hr",   tags=["👥 HR Module"])

# ── File upload validation constants ────────────────────────────────────────
MAX_FILE_SIZE_MB = 10
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt", ".rtf", ".odt"}
ALLOWED_MIME_TYPES = {
    "image/jpeg", "image/png", "image/gif",
    "application/pdf",
    "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv", "text/plain", "application/rtf", "application/vnd.oasis.opendocument.text",
}


def _validate_upload_file(file: UploadFile):
    """Validate file size and type for uploads. Raises HTTPException on failure."""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type '{ext}' not allowed. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}")
    if file.content_type and file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail=f"File MIME type '{file.content_type}' not allowed.")


# ── Role visibility helpers ──────────────────────────────────────────────────────
def _get_visible_roles(caller_role: str) -> Optional[list]:
    """Return the list of roles visible to the given caller role.
    Used by User Management — Organization Admin sees all org roles.
    None means all roles are visible."""
    if caller_role == "hr_admin":
        return [UserRole.HR_ADMIN, UserRole.EMPLOYEE]
    if caller_role == "admin":
        return [UserRole.ADMIN, UserRole.HR_ADMIN, UserRole.EMPLOYEE]
    return None  # super_admin and others see all


def _get_employee_visible_roles() -> list:
    """Return roles visible in Employee Management.
    Organization Admin (ADMIN), Super Admin (SUPER_ADMIN) and
    platform roles are never returned."""
    return [
        UserRole.HR_ADMIN,
        UserRole.EMPLOYEE,
    ]


# ════════════════════════════════════════════════════════════════════════════
# AUTH ENDPOINTS
# ════════════════════════════════════════════════════════════════════════════


@auth_router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh access token",
    description="Send a valid refresh token, get a new access token."
)
def refresh_token(data: RefreshRequest, db: Session = Depends(get_db)):
    return service.refresh_access_token(db, data.refresh_token)


# ════════════════════════════════════════════════════════════════════════════
# USER MANAGEMENT ENDPOINTS (Organization Admin / HR Admin)
# ════════════════════════════════════════════════════════════════════════════


# ════════════════════════════════════════════════════════════════════════════
# DEPARTMENT ENDPOINTS
# ════════════════════════════════════════════════════════════════════════════
# ── Department endpoints ─────────────────────────────────────────────────
@hr_router.post(
    "/departments",
    response_model=DepartmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new department",
    dependencies=[Depends(get_current_admin)],
)
def create_department(
    data: DepartmentCreate, 
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.create_department(db, data, current_user.organization_id)


@hr_router.get(
    "/departments",
    response_model=list[DepartmentResponse],
    summary="List all departments",
)
def list_departments(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    include_inactive: bool = Query(False),
):
    return service.get_all_departments(db, current_user.organization_id, include_inactive)


@hr_router.get(
    "/departments/{dept_id}",
    response_model=DepartmentResponse,
    summary="Get a single department by ID",
)
def get_department(
    dept_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.get_department_by_id(db, dept_id, current_user.organization_id)


@hr_router.put(
    "/departments/{dept_id}",
    response_model=DepartmentResponse,
    summary="Update a department",
    dependencies=[Depends(get_current_admin)],
)
def update_department(
    dept_id: int,
    data: DepartmentUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.update_department(db, dept_id, data, current_user.organization_id)


@hr_router.delete(
    "/departments/{dept_id}",
    response_model=SuccessResponse,
    summary="Deactivate a department",
    dependencies=[Depends(get_current_admin)],
)
def delete_department(
    dept_id: int, 
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    service.delete_department(db, dept_id, current_user.organization_id)
    return {"message": f"Department {dept_id} has been deactivated successfully."}


# ════════════════════════════════════════════════════════════════════════════
# DASHBOARD STATS
# ════════════════════════════════════════════════════════════════════════════

@hr_router.get(
    "/dashboard/stats",
    summary="HR Dashboard statistics",
    description="Returns total employees, active count, departments, new joiners this month, etc."
)
def dashboard_stats(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.get_hr_dashboard_stats(db, current_user.organization_id)


@hr_router.get(
    "/organization",
    summary="Get current user's organization details",
    description="Returns organization info with admin details, subscription, employee counts."
)
def get_my_organization(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.get_organization_details(db, current_user.organization_id)


@hr_router.put(
    "/organization",
    summary="Update current user's organization details",
    description="Org admin can update their organization name, industry, address, city, state, country, timezone, currency, domain.",
)
def update_my_organization(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    data: OrganizationUpdate = Body(...),
):
    if not current_user.organization_id:
        raise HTTPException(status_code=403, detail="Your account is not linked to an organization.")
    return service.update_organization(db, current_user.organization_id, data)


@hr_router.get(
    "/organization/dashboard",
    summary="Organization Admin dashboard stats",
    description="Returns dashboard statistics for the organization admin."
)
def organization_dashboard_stats(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.get_org_admin_dashboard_stats(db, current_user.organization_id)


@hr_router.get(
    "/organization/metrics",
    summary="Organization Admin detailed metrics",
    description="Returns comprehensive detailed metrics for the organization admin analytics page."
)
def organization_detailed_metrics(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.get_org_admin_detailed_metrics(db, current_user.organization_id)


@hr_router.get(
    "/performance/dashboard",
    summary="Performance dashboard stats",
    description="Returns performance review summary statistics."
)
def performance_dashboard(
    employee_id: Optional[int] = Query(None, description="Filter dashboard stats to a single employee"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.get_performance_dashboard(db, current_user.organization_id, employee_id=employee_id)


@hr_router.get(
    "/engagement/dashboard",
    summary="Engagement dashboard stats",
    description="Returns engagement survey summary statistics."
)
def engagement_dashboard(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.get_engagement_dashboard(db, current_user.organization_id)


@hr_router.get(
    "/compensation/dashboard",
    summary="Compensation dashboard stats",
    description="Returns compensation summary statistics."
)
def compensation_dashboard(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.get_compensation_dashboard(db, current_user.organization_id)


# ── Legacy compatibility endpoints ──────────────────────────────────────────
@hr_router.get("/overview", summary="HR overview stats")
def overview(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.get_hr_dashboard_stats(db, current_user.organization_id)


@hr_router.get("/workforce", summary="Workforce overview")
def workforce(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.get_workforce_summary(db, current_user.organization_id)


@hr_router.get("/compensation", summary="Compensation overview")
def compensation_overview(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.get_compensation_dashboard(db, current_user.organization_id)


@hr_router.get("/learning", summary="Learning overview")
def learning_overview(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    from app.modules.hr import learning_service
    return learning_service.get_learning_dashboard(db, current_user.organization_id)


@hr_router.get("/payrollSummary", summary="Payroll summary")
def payroll_summary(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return {"message": "Payroll summary not yet implemented", "data": []}


# ════════════════════════════════════════════════════════════════════════════
# HR SUBMODULE ENDPOINTS
# ════════════════════════════════════════════════════════════════════════════

@hr_router.post(
    "/attendance",
    response_model=AttendanceResponse,
    summary="Record attendance",
    description="Create a new attendance record for an employee."
)
def create_attendance(data: AttendanceCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.create_attendance_record(db, data, current_user.organization_id)





# ── Leave Dashboard ────────────────────────────────────────────────────────

@hr_router.get(
    "/leaves/dashboard",
    response_model=LeaveDashboardStats,
    summary="Leave dashboard statistics",
)
def leave_dashboard(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    visible_roles = _get_employee_visible_roles()
    return service.get_leave_dashboard(db, current_user.organization_id, visible_roles=visible_roles)


@hr_router.get(
    "/leaves/calendar",
    response_model=list[LeaveCalendarEvent],
    summary="Leave calendar events",
)
def leave_calendar(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
):
    return service.get_leave_calendar(db, current_user.organization_id, year, month)


@hr_router.get(
    "/leaves/statistics",
    response_model=LeaveStatisticsResponse,
    summary="Leave statistics & reports",
)
def leave_statistics(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    return service.get_leave_statistics(db, current_user.organization_id)


# ── Leave Requests ─────────────────────────────────────────────────────────

@hr_router.get(
    "/leaves",
    response_model=list[LeaveRequestResponse],
    summary="List leave requests",
)
def list_leave_requests(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
    employee_id: Optional[int] = Query(None, description="Filter by employee ID"),
    status: Optional[RequestStatus] = Query(None, description="Filter by status"),
    leave_type: Optional[LeaveType] = Query(None, description="Filter by leave type"),
    start_date: Optional[date] = Query(None, description="Filter by start date"),
    end_date: Optional[date] = Query(None, description="Filter by end date"),
    department_id: Optional[int] = Query(None, description="Filter by department ID"),
):
    if current_user.role == UserRole.EMPLOYEE:
        employee_id = current_user.id
    return service.get_leave_requests(db, current_user.organization_id, employee_id, status, leave_type, start_date, end_date, department_id)


# ── Leave Type Configs ─────────────────────────────────────────────────────

@hr_router.get(
    "/leaves/type-configs",
    response_model=list[LeaveTypeConfigResponse],
    summary="List leave type configurations",
)
def list_leave_type_configs(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    return service.get_leave_type_configs(db, current_user.organization_id)


@hr_router.post(
    "/leaves/type-configs",
    response_model=LeaveTypeConfigResponse,
    summary="Create leave type configuration",
)
def create_leave_type_config(
    data: LeaveTypeConfigCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    return service.create_leave_type_config(db, data, current_user.organization_id)


@hr_router.put(
    "/leaves/type-configs/{config_id}",
    response_model=LeaveTypeConfigResponse,
    summary="Update leave type configuration",
)
def update_leave_type_config(
    config_id: int,
    data: LeaveTypeConfigUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    return service.update_leave_type_config(db, config_id, data, current_user.organization_id)


@hr_router.delete(
    "/leaves/type-configs/{config_id}",
    response_model=SuccessResponse,
    summary="Delete leave type configuration",
)
def delete_leave_type_config(
    config_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    service.delete_leave_type_config(db, config_id, current_user.organization_id)
    return SuccessResponse(message="Leave type config deleted")


# ── Leave Balances ─────────────────────────────────────────────────────────

@hr_router.get(
    "/leaves/balance",
    response_model=list[LeaveBalanceResponse],
    summary="Get leave balances",
)
def list_leave_balances(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
    employee_id: Optional[int] = Query(None, description="Filter by employee ID"),
):
    return service.get_leave_balances(db, current_user.organization_id, employee_id)


@hr_router.put(
    "/leaves/balance/{balance_id}",
    response_model=LeaveBalanceResponse,
    summary="Update leave balance",
)
def update_leave_balance(
    balance_id: int,
    data: LeaveBalanceUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    return service.update_leave_balance(db, balance_id, data, current_user.organization_id)


@hr_router.post(
    "/leaves/balance/init",
    response_model=SuccessResponse,
    summary="Initialize leave balances for an employee",
)
def init_leave_balance(
    employee_id: int = Query(...),
    year: int = Query(...),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    service.init_leave_balance(db, employee_id, current_user.organization_id, year)
    return SuccessResponse(message=f"Leave balances initialized for employee {employee_id}")


# ── Leave Settings ─────────────────────────────────────────────────────────

@hr_router.get(
    "/leaves/settings",
    response_model=LeaveSettingResponse,
    summary="Get leave settings",
)
def get_leave_settings(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    return service.get_leave_settings(db, current_user.organization_id)


@hr_router.put(
    "/leaves/settings",
    response_model=LeaveSettingResponse,
    summary="Update leave settings",
)
def update_leave_settings(
    data: LeaveSettingUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    return service.update_leave_settings(db, current_user.organization_id, data)


@hr_router.delete(
    "/leaves/settings",
    response_model=SuccessResponse,
    summary="Reset leave settings to defaults",
)
def reset_leave_settings(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    service.reset_leave_settings(db, current_user.organization_id)
    return SuccessResponse(message="Leave settings reset to defaults")


# ── Leave Request Dynamic Routes ───────────────────────────────────────────

@hr_router.get(
    "/leaves/{leave_id}",
    response_model=LeaveRequestResponse,
    summary="Get a single leave request",
)
def get_leave_request(
    leave_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    return service.get_leave_request(db, leave_id, current_user.organization_id)


@hr_router.put(
    "/leaves/{leave_id}",
    response_model=LeaveRequestResponse,
    summary="Update a leave request",
)
def update_leave_request(
    leave_id: int,
    data: LeaveRequestUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    return service.update_leave_request(db, leave_id, data, current_user.organization_id)


@hr_router.delete(
    "/leaves/{leave_id}",
    response_model=SuccessResponse,
    summary="Delete a leave request",
)
def delete_leave_request(
    leave_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    service.delete_leave_request(db, leave_id, current_user.organization_id)
    return SuccessResponse(message="Leave request deleted")


@hr_router.put(
    "/leaves/{leave_id}/review",
    response_model=LeaveRequestResponse,
    summary="Review (approve/reject) a leave request",
    dependencies=[Depends(get_current_admin)],
)
def review_leave(
    leave_id: int,
    data: LeaveRequestUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    return service.review_leave_request(db, leave_id, data, current_user.organization_id, current_user.id)


# ── Compensation Endpoints (Expanded) ─────────────────────────────────────────

@hr_router.get("/compensation/pay-grades", response_model=list[PayGradeResponse], summary="List pay grades")
def get_pay_grades(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.get_pay_grades(db, current_user.organization_id)

@hr_router.post("/compensation/pay-grades", response_model=PayGradeResponse, summary="Create pay grade", dependencies=[Depends(get_current_admin)])
def create_pay_grade(data: PayGradeCreate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.create_pay_grade(db, data, current_user.organization_id)

@hr_router.put("/compensation/pay-grades/{id}", response_model=PayGradeResponse, summary="Update pay grade", dependencies=[Depends(get_current_admin)])
def update_pay_grade(id: int, data: PayGradeUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.update_pay_grade(db, id, data, current_user.organization_id)

@hr_router.delete("/compensation/pay-grades/{id}", summary="Delete pay grade", dependencies=[Depends(get_current_admin)])
def delete_pay_grade(id: int, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    service.delete_pay_grade(db, id, current_user.organization_id)
    return {"message": "Pay grade deleted successfully."}

@hr_router.get("/compensation/bands", response_model=list[CompensationBandResponse], summary="List bands")
def get_compensation_bands(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.get_compensation_bands(db, current_user.organization_id)

@hr_router.post("/compensation/bands", response_model=CompensationBandResponse, summary="Create band", dependencies=[Depends(get_current_admin)])
def create_compensation_band(data: CompensationBandCreate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.create_compensation_band(db, data, current_user.organization_id)

@hr_router.put("/compensation/bands/{id}", response_model=CompensationBandResponse, summary="Update band", dependencies=[Depends(get_current_admin)])
def update_compensation_band(id: int, data: CompensationBandUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.update_compensation_band(db, id, data, current_user.organization_id)

@hr_router.delete("/compensation/bands/{id}", summary="Delete band", dependencies=[Depends(get_current_admin)])
def delete_compensation_band(id: int, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    service.delete_compensation_band(db, id, current_user.organization_id)
    return {"message": "Compensation band deleted successfully."}

@hr_router.get("/compensation/salary-components", response_model=list[SalaryComponentResponse], summary="List components")
def get_salary_components(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.get_salary_components(db, current_user.organization_id)

@hr_router.post("/compensation/salary-components", response_model=SalaryComponentResponse, summary="Create component", dependencies=[Depends(get_current_admin)])
def create_salary_component(data: SalaryComponentCreate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.create_salary_component(db, data, current_user.organization_id)

@hr_router.put("/compensation/salary-components/{id}", response_model=SalaryComponentResponse, summary="Update component", dependencies=[Depends(get_current_admin)])
def update_salary_component(id: int, data: SalaryComponentUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.update_salary_component(db, id, data, current_user.organization_id)

@hr_router.delete("/compensation/salary-components/{id}", summary="Delete component", dependencies=[Depends(get_current_admin)])
def delete_salary_component(id: int, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    service.delete_salary_component(db, id, current_user.organization_id)
    return {"message": "Salary component deleted successfully."}

@hr_router.get("/compensation/salary-structures", response_model=list[SalaryStructureResponse], summary="List structures")
def get_salary_structures(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.get_salary_structures(db, current_user.organization_id)

@hr_router.post("/compensation/salary-structures", response_model=SalaryStructureResponse, summary="Create structure", dependencies=[Depends(get_current_admin)])
def create_salary_structure(data: SalaryStructureCreate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.create_salary_structure(db, data, current_user.organization_id)

@hr_router.put("/compensation/salary-structures/{id}", response_model=SalaryStructureResponse, summary="Update structure", dependencies=[Depends(get_current_admin)])
def update_salary_structure(id: int, data: SalaryStructureUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.update_salary_structure(db, id, data, current_user.organization_id)

@hr_router.delete("/compensation/salary-structures/{id}", summary="Delete structure", dependencies=[Depends(get_current_admin)])
def delete_salary_structure(id: int, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    service.delete_salary_structure(db, id, current_user.organization_id)
    return {"message": "Salary structure deleted successfully."}

@hr_router.post("/compensation/salary-structures/{id}/components", response_model=StructureComponentResponse, summary="Add component to structure", dependencies=[Depends(get_current_admin)])
def add_structure_component(id: int, data: StructureComponentCreate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.create_structure_component(db, data, current_user.organization_id)

@hr_router.get("/compensation/salary-structures/{id}/components", response_model=list[StructureComponentResponse], summary="Get structure components")
def get_structure_components(id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.get_structure_components(db, id, current_user.organization_id)

@hr_router.delete("/compensation/salary-structures/{id}/components/{comp_id}", summary="Remove component from structure", dependencies=[Depends(get_current_admin)])
def delete_structure_component(id: int, comp_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    service.delete_structure_component(db, comp_id, current_user.organization_id)
    return {"message": "Structure component removed successfully."}



@hr_router.get("/compensation/revisions", response_model=list[SalaryRevisionResponse], summary="List salary revisions")
def get_salary_revisions(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.get_salary_revisions(db, current_user.organization_id)

@hr_router.post("/compensation/revisions", response_model=SalaryRevisionResponse, summary="Create salary revision", dependencies=[Depends(get_current_admin)])
def create_salary_revision(data: SalaryRevisionCreate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.create_salary_revision(db, data, current_user.organization_id)

@hr_router.put("/compensation/revisions/{id}", response_model=SalaryRevisionResponse, summary="Update salary revision", dependencies=[Depends(get_current_admin)])
def update_salary_revision(id: int, data: SalaryRevisionUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.update_salary_revision(db, id, data, current_user.organization_id)

@hr_router.delete("/compensation/revisions/{id}", summary="Delete salary revision", dependencies=[Depends(get_current_admin)])
def delete_salary_revision(id: int, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    service.delete_salary_revision(db, id, current_user.organization_id)
    return {"message": f"Salary revision {id} deleted successfully."}

@hr_router.get("/compensation/allowances", response_model=list[AllowanceResponse], summary="List allowances")
def get_allowances(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.get_allowances(db, current_user.organization_id)

@hr_router.post("/compensation/allowances", response_model=AllowanceResponse, summary="Add allowance", dependencies=[Depends(get_current_admin)])
def create_allowance(data: AllowanceCreate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.create_allowance(db, data, current_user.organization_id)

@hr_router.put("/compensation/allowances/{id}", response_model=AllowanceResponse, summary="Update allowance", dependencies=[Depends(get_current_admin)])
def update_allowance(id: int, data: AllowanceUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.update_allowance(db, id, data, current_user.organization_id)

@hr_router.delete("/compensation/allowances/{id}", summary="Delete allowance", dependencies=[Depends(get_current_admin)])
def delete_allowance(id: int, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    service.delete_allowance(db, id, current_user.organization_id)
    return {"message": "Allowance deleted successfully."}

@hr_router.get("/compensation/benefits", response_model=list[BenefitResponse], summary="List benefits")
def get_benefits(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.get_benefits(db, current_user.organization_id)

@hr_router.post("/compensation/benefits", response_model=BenefitResponse, summary="Add benefit", dependencies=[Depends(get_current_admin)])
def create_benefit(data: BenefitCreate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.create_benefit(db, data, current_user.organization_id)

@hr_router.put("/compensation/benefits/{id}", response_model=BenefitResponse, summary="Update benefit", dependencies=[Depends(get_current_admin)])
def update_benefit(id: int, data: BenefitUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.update_benefit(db, id, data, current_user.organization_id)

@hr_router.delete("/compensation/benefits/{id}", summary="Delete benefit", dependencies=[Depends(get_current_admin)])
def delete_benefit(id: int, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    service.delete_benefit(db, id, current_user.organization_id)
    return {"message": "Benefit deleted successfully."}




@hr_router.post(
    "/compliance",
    response_model=ComplianceRecordResponse,
    summary="Create a compliance record",
    dependencies=[Depends(get_current_admin)],
)
def create_compliance_record(data: ComplianceRecordCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.create_compliance_record(db, data, organization_id=current_user.organization_id)


@hr_router.get(
    "/compliance",
    response_model=list[ComplianceRecordResponse],
    summary="List compliance records",
)
def list_compliance_records(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    employee_id: Optional[int] = Query(None, description="Filter by employee ID"),
):
    return service.get_compliance_records(db, organization_id=current_user.organization_id, employee_id=employee_id)


# ════════════════════════════════════════════════════════════════════════════════
# COMPLIANCE & RISK MANAGEMENT ENDPOINTS  (the "/comply" frontend)
#   GET  /hr/compliance/dashboard
#   GET  /hr/compliance/reports
#   CRUD /hr/compliance/policies
#   GET+POST /hr/compliance/acknowledgements
#   CRUD /hr/compliance/audits
#   GET+POST /hr/compliance/regulations
#   CRUD /hr/compliance/risks
#   CRUD /hr/compliance/violations
#   CRUD /hr/compliance/corrective-actions
# ════════════════════════════════════════════════════════════════════════════════

@hr_router.get(
    "/compliance/dashboard",
    response_model=ComplianceDashboardResponse,
    summary="Compliance dashboard stats",
    tags=["📜 Compliance"],
)
def get_compliance_dashboard_endpoint(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.get_compliance_dashboard(db, organization_id=current_user.organization_id)


@hr_router.get(
    "/compliance/reports",
    response_model=list[ComplianceReportItem],
    summary="List downloadable compliance report exports",
    tags=["📜 Compliance"],
)
def list_compliance_reports_endpoint(_=Depends(get_current_user)):
    return service.get_compliance_reports()


# --- Structural System Audits ---

@hr_router.get(
    "/compliance/audits",
    response_model=list[AuditResponse],
    summary="List structural system audits",
    tags=["📜 Compliance"],
)
def list_audits_endpoint(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    status_filter: Optional[str] = Query(None, alias="status"),
):
    return service.get_audits(db, status=status_filter, organization_id=current_user.organization_id)


@hr_router.post(
    "/compliance/audits",
    response_model=AuditResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an audit",
    tags=["📜 Compliance"],
    dependencies=[Depends(get_current_admin)],
)
def create_audit_endpoint(data: AuditCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.create_audit(db, data, organization_id=current_user.organization_id)


@hr_router.get(
    "/compliance/audits/{audit_id}",
    response_model=AuditResponse,
    summary="Get an audit by ID",
    tags=["📜 Compliance"],
)
def get_audit_endpoint(audit_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.get_audit_by_id(db, audit_id, organization_id=current_user.organization_id)


@hr_router.put(
    "/compliance/audits/{audit_id}",
    response_model=AuditResponse,
    summary="Update an audit",
    tags=["📜 Compliance"],
    dependencies=[Depends(get_current_admin)],
)
def update_audit_endpoint(audit_id: int, data: AuditCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.update_audit(db, audit_id, data, organization_id=current_user.organization_id)


@hr_router.delete(
    "/compliance/audits/{audit_id}",
    response_model=SuccessResponse,
    summary="Delete an audit",
    tags=["📜 Compliance"],
    dependencies=[Depends(get_current_admin)],
)
def delete_audit_endpoint(audit_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    service.delete_audit(db, audit_id, organization_id=current_user.organization_id)
    return {"message": f"Audit {audit_id} deleted successfully."}


# --- Statutory Frameworks ---

@hr_router.get(
    "/compliance/regulations",
    response_model=list[RegulatoryRequirementResponse],
    summary="List regulatory requirements",
    tags=["📜 Compliance"],
)
def list_regulations_endpoint(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.get_regulatory_requirements(db, organization_id=current_user.organization_id)


@hr_router.post(
    "/compliance/regulations",
    response_model=RegulatoryRequirementResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a regulatory requirement",
    tags=["📜 Compliance"],
    dependencies=[Depends(get_current_admin)],
)
def create_regulation_endpoint(data: RegulatoryRequirementCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.create_regulatory_requirement(db, data, organization_id=current_user.organization_id)


# --- Risk Assessments ---

@hr_router.get(
    "/compliance/risks",
    response_model=list[RiskResponse],
    summary="List risk assessments",
    tags=["📜 Compliance"],
)
def list_risks_endpoint(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    status_filter: Optional[str] = Query(None, alias="status"),
):
    return service.get_risk_assessments(db, status=status_filter, organization_id=current_user.organization_id)


@hr_router.post(
    "/compliance/risks",
    response_model=RiskResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a risk assessment",
    tags=["📜 Compliance"],
    dependencies=[Depends(get_current_admin)],
)
def create_risk_endpoint(data: RiskCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.create_risk_assessment(db, data, organization_id=current_user.organization_id)


@hr_router.get(
    "/compliance/risks/{risk_id}",
    response_model=RiskResponse,
    summary="Get a risk assessment by ID",
    tags=["📜 Compliance"],
)
def get_risk_endpoint(risk_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.get_risk_assessment_by_id(db, risk_id, organization_id=current_user.organization_id)


@hr_router.put(
    "/compliance/risks/{risk_id}",
    response_model=RiskResponse,
    summary="Update a risk assessment",
    tags=["📜 Compliance"],
    dependencies=[Depends(get_current_admin)],
)
def update_risk_endpoint(risk_id: int, data: RiskCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.update_risk_assessment(db, risk_id, data, organization_id=current_user.organization_id)


@hr_router.delete(
    "/compliance/risks/{risk_id}",
    response_model=SuccessResponse,
    summary="Delete a risk assessment",
    tags=["📜 Compliance"],
    dependencies=[Depends(get_current_admin)],
)
def delete_risk_endpoint(risk_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    service.delete_risk_assessment(db, risk_id, organization_id=current_user.organization_id)
    return {"message": f"Risk assessment {risk_id} deleted successfully."}


# --- Violations & Breaches ---

@hr_router.get(
    "/compliance/violations",
    response_model=list[ViolationResponse],
    summary="List compliance violations",
    tags=["📜 Compliance"],
)
def list_violations_endpoint(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    status_filter: Optional[str] = Query(None, alias="status"),
    severity: Optional[str] = Query(None),
):
    return service.get_compliance_violations(db, status=status_filter, severity=severity, organization_id=current_user.organization_id)


@hr_router.post(
    "/compliance/violations",
    response_model=ViolationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Report a compliance violation",
    tags=["📜 Compliance"],
)
def create_violation_endpoint(data: ViolationCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.create_compliance_violation(db, data, organization_id=current_user.organization_id)


@hr_router.get(
    "/compliance/violations/{violation_id}",
    response_model=ViolationResponse,
    summary="Get a violation by ID",
    tags=["📜 Compliance"],
)
def get_violation_endpoint(violation_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.get_compliance_violation_by_id(db, violation_id, organization_id=current_user.organization_id)


@hr_router.put(
    "/compliance/violations/{violation_id}",
    response_model=ViolationResponse,
    summary="Update a violation",
    tags=["📜 Compliance"],
    dependencies=[Depends(get_current_admin)],
)
def update_violation_endpoint(violation_id: int, data: ViolationCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.update_compliance_violation(db, violation_id, data, organization_id=current_user.organization_id)


@hr_router.delete(
    "/compliance/violations/{violation_id}",
    response_model=SuccessResponse,
    summary="Delete a violation",
    tags=["📜 Compliance"],
    dependencies=[Depends(get_current_admin)],
)
def delete_violation_endpoint(violation_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    service.delete_compliance_violation(db, violation_id, organization_id=current_user.organization_id)
    return {"message": f"Violation {violation_id} deleted successfully."}


# --- Corrective Remediation Actions ---

@hr_router.get(
    "/compliance/corrective-actions",
    response_model=list[CorrectiveActionResponse],
    summary="List corrective actions",
    tags=["📜 Compliance"],
)
def list_corrective_actions_endpoint(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    violation_id: Optional[int] = Query(None),
    assigned_to: Optional[str] = Query(None),
):
    return service.get_corrective_actions(db, violation_id=violation_id, assigned_to=assigned_to, organization_id=current_user.organization_id)


@hr_router.post(
    "/compliance/corrective-actions",
    response_model=CorrectiveActionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a corrective action",
    tags=["📜 Compliance"],
    dependencies=[Depends(get_current_admin)],
)
def create_corrective_action_endpoint(data: CorrectiveActionCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.create_corrective_action(db, data, organization_id=current_user.organization_id)


@hr_router.get(
    "/compliance/corrective-actions/{action_id}",
    response_model=CorrectiveActionResponse,
    summary="Get a corrective action by ID",
    tags=["📜 Compliance"],
)
def get_corrective_action_endpoint(action_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.get_corrective_action_by_id(db, action_id, organization_id=current_user.organization_id)


@hr_router.put(
    "/compliance/corrective-actions/{action_id}",
    response_model=CorrectiveActionResponse,
    summary="Update a corrective action",
    tags=["📜 Compliance"],
    dependencies=[Depends(get_current_admin)],
)
def update_corrective_action_endpoint(action_id: int, data: CorrectiveActionCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.update_corrective_action(db, action_id, data, organization_id=current_user.organization_id)


@hr_router.delete(
    "/compliance/corrective-actions/{action_id}",
    response_model=SuccessResponse,
    summary="Delete a corrective action",
    tags=["📜 Compliance"],
    dependencies=[Depends(get_current_admin)],
)
def delete_corrective_action_endpoint(action_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    service.delete_corrective_action(db, action_id, organization_id=current_user.organization_id)
    return {"message": f"Corrective action {action_id} deleted successfully."}


@hr_router.post(
    "/engagement",
    response_model=EngagementSurveyResponse,
    summary="Submit an engagement survey",
)
def create_engagement_survey(data: EngagementSurveyCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.create_engagement_survey(db, data, organization_id=current_user.organization_id)


@hr_router.get(
    "/engagement",
    response_model=list[EngagementSurveyResponse],
    summary="List engagement surveys",
)
def list_engagement_surveys(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    employee_id: Optional[int] = Query(None, description="Filter by employee ID"),
):
    return service.get_engagement_surveys(db, organization_id=current_user.organization_id, employee_id=employee_id)


@hr_router.post(
    "/ess",
    response_model=EssRequestResponse,
    summary="Create an ESS request",
)
def create_ess_request(data: EssRequestCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.create_ess_request(db, data, organization_id=current_user.organization_id)


@hr_router.get(
    "/ess",
    response_model=list[EssRequestResponse],
    summary="List ESS requests",
)
def list_ess_requests(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    employee_id: Optional[int] = Query(None, description="Filter by employee ID"),
):
    return service.get_ess_requests(db, organization_id=current_user.organization_id, employee_id=employee_id)


@hr_router.put(
    "/ess/{request_id}",
    response_model=EssRequestResponse,
    summary="Update an ESS request",
)
def update_ess_request(
    request_id: int,
    data: EssRequestUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.update_ess_request(db, request_id, data, organization_id=current_user.organization_id)


@hr_router.delete(
    "/ess/{request_id}",
    response_model=SuccessResponse,
    summary="Delete an ESS request",
)
def delete_ess_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    service.delete_ess_request(db, request_id, organization_id=current_user.organization_id)
    return {"message": f"ESS request {request_id} deleted successfully."}


# ════════════════════════════════════════════════════════════════════════════
# ONBOARDING MODULE — Production-Ready Endpoints
# ════════════════════════════════════════════════════════════════════════════

# ── New Hires ──────────────────────────────────────────────────────────────

@hr_router.get(
    "/onboarding/new-hires",
    response_model=list[OnboardingNewHireResponse],
    summary="List all new hires",
)
def list_new_hires(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
):
    return service.get_new_hires(db, search=search, status=status, organization_id=current_user.organization_id)


@hr_router.post(
    "/onboarding/new-hires",
    response_model=OnboardingNewHireResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new hire record",
)
def create_new_hire(data: OnboardingNewHireCreate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.create_new_hire(db, data, organization_id=current_user.organization_id)


@hr_router.get(
    "/onboarding/new-hires/{new_hire_id}",
    response_model=OnboardingNewHireResponse,
    summary="Get a single new hire by ID",
)
def get_new_hire(new_hire_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.get_new_hire_by_id(db, new_hire_id, organization_id=current_user.organization_id)


@hr_router.put(
    "/onboarding/new-hires/{new_hire_id}",
    response_model=OnboardingNewHireResponse,
    summary="Update a new hire record",
)
def update_new_hire(new_hire_id: int, data: OnboardingNewHireUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    result = service.update_new_hire(db, new_hire_id, data, organization_id=current_user.organization_id)
    new_hire = result["new_hire"]
    new_hire.temp_password = result["temp_password"]
    return new_hire


@hr_router.delete(
    "/onboarding/new-hires/{new_hire_id}",
    response_model=SuccessResponse,
    summary="Soft-delete a new hire record",
)
def delete_new_hire(new_hire_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    service.delete_new_hire(db, new_hire_id, organization_id=current_user.organization_id)
    return {"message": f"New hire {new_hire_id} deleted successfully."}


# ── Legacy alias endpoints (kept for backward compatibility) ────────────────

@hr_router.post(
    "/onboarding/records",
    response_model=OnboardingNewHireResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an onboarding record (alias)",
)
def create_onboarding_record(data: OnboardingNewHireCreate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.create_new_hire(db, data, organization_id=current_user.organization_id)


@hr_router.get(
    "/onboarding/records",
    response_model=list[OnboardingNewHireResponse],
    summary="List onboarding records (alias)",
)
def list_onboarding_records(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
):
    return service.get_new_hires(db, search=search, status=status, organization_id=current_user.organization_id)


@hr_router.get(
    "/onboarding/records/{record_id}",
    response_model=OnboardingNewHireResponse,
    summary="Get onboarding record by ID (alias)",
)
def get_onboarding_record(record_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.get_new_hire_by_id(db, record_id, organization_id=current_user.organization_id)


@hr_router.put(
    "/onboarding/records/{record_id}",
    response_model=OnboardingNewHireResponse,
    summary="Update onboarding record (alias)",
)
def update_onboarding_record(record_id: int, data: OnboardingNewHireUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    result = service.update_new_hire(db, record_id, data, organization_id=current_user.organization_id)
    new_hire = result["new_hire"]
    new_hire.temp_password = result["temp_password"]
    return new_hire


@hr_router.delete(
    "/onboarding/records/{record_id}",
    response_model=SuccessResponse,
    summary="Delete onboarding record (alias)",
)
def delete_onboarding_record(record_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    service.delete_new_hire(db, record_id, organization_id=current_user.organization_id)
    return {"message": f"Onboarding record {record_id} deleted successfully."}


# ── Pre-boarding / Tasks ───────────────────────────────────────────────────

@hr_router.get(
    "/onboarding/preboarding-tasks",
    response_model=list[OnboardingPreboardingTaskResponse],
    summary="List pre-boarding tasks",
)
def list_preboarding_tasks(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    new_hire_id: Optional[int] = Query(None),
    employee_id: Optional[int] = Query(None),
):
    return service.get_preboarding_tasks(db, new_hire_id=new_hire_id, employee_id=employee_id, organization_id=current_user.organization_id)


@hr_router.post(
    "/onboarding/preboarding-tasks",
    response_model=OnboardingPreboardingTaskResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a pre-boarding task",
)
def create_preboarding_task(data: OnboardingPreboardingTaskCreate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.create_preboarding_task(db, data, organization_id=current_user.organization_id)


@hr_router.put(
    "/onboarding/preboarding-tasks/{task_id}",
    response_model=OnboardingPreboardingTaskResponse,
    summary="Update a pre-boarding task",
)
def update_preboarding_task(task_id: int, data: OnboardingPreboardingTaskUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    # Self-service: employees can update their own tasks (e.g., mark complete)
    return service.update_preboarding_task(db, task_id, data, organization_id=current_user.organization_id)


@hr_router.delete(
    "/onboarding/preboarding-tasks/{task_id}",
    response_model=SuccessResponse,
    summary="Delete a pre-boarding task",
)
def delete_preboarding_task(task_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    service.delete_preboarding_task(db, task_id, organization_id=current_user.organization_id)
    return {"message": f"Task {task_id} deleted successfully."}

# ── Checklist Templates ────────────────────────────────────────────────────

@hr_router.get(
    "/onboarding/checklist-templates",
    response_model=list[OnboardingChecklistResponse],
    summary="List checklist templates",
)
def list_checklist_templates(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    category: Optional[str] = Query(None),
):
    return service.get_checklists(db, is_template=True, category=category, organization_id=current_user.organization_id)


@hr_router.post(
    "/onboarding/checklist-templates",
    response_model=OnboardingChecklistResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a checklist template",
)
def create_checklist_template(data: OnboardingChecklistCreate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.create_checklist(db, data, organization_id=current_user.organization_id)


@hr_router.get(
    "/onboarding/checklist-templates/{checklist_id}",
    response_model=OnboardingChecklistResponse,
    summary="Get a checklist template by ID",
)
def get_checklist_template(checklist_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    checklists = service.get_checklists(db, is_template=True, organization_id=current_user.organization_id)
    checklist = next((c for c in checklists if c.id == checklist_id), None)
    if not checklist:
        from app.core.exceptions import NotFoundException
        raise NotFoundException("OnboardingChecklist", checklist_id)
    return checklist


@hr_router.put(
    "/onboarding/checklist-templates/{checklist_id}",
    response_model=OnboardingChecklistResponse,
    summary="Update a checklist template",
)
def update_checklist_template(checklist_id: int, data: OnboardingChecklistUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.update_checklist(db, checklist_id, data, organization_id=current_user.organization_id)


@hr_router.delete(
    "/onboarding/checklist-templates/{checklist_id}",
    response_model=SuccessResponse,
    summary="Delete a checklist template",
)
def delete_checklist_template(checklist_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    service.delete_checklist(db, checklist_id, organization_id=current_user.organization_id)
    return {"message": f"Checklist template {checklist_id} deleted successfully."}


# ── Checklist Assignments ──────────────────────────────────────────────────

@hr_router.get(
    "/onboarding/checklist-assignments",
    response_model=list[OnboardingChecklistResponse],
    summary="List checklist assignments for a new hire",
)
def list_checklist_assignments(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    onboarding_record_id: Optional[int] = Query(None),
):
    return service.get_checklists(db, is_template=False, new_hire_id=onboarding_record_id, organization_id=current_user.organization_id)


@hr_router.post(
    "/onboarding/checklist-assignments",
    response_model=OnboardingChecklistResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Assign a checklist template to a new hire",
)
def assign_checklist(data: OnboardingChecklistAssignmentCreate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.assign_checklist_template(db, data.onboarding_record_id, data.template_id, organization_id=current_user.organization_id)


@hr_router.put(
    "/onboarding/checklist-assignments/{checklist_id}",
    response_model=OnboardingChecklistResponse,
    summary="Update a checklist assignment (mark items complete etc.)",
)
def update_checklist_assignment(checklist_id: int, data: OnboardingChecklistUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    # Self-service: employees can mark checklist items complete
    if data.items is not None:
        service.update_checklist_items(db, checklist_id, [item.model_dump() for item in data.items], organization_id=current_user.organization_id)
    return service.update_checklist(db, checklist_id, data, organization_id=current_user.organization_id)


@hr_router.delete(
    "/onboarding/checklist-assignments/{checklist_id}",
    response_model=SuccessResponse,
    summary="Remove a checklist assignment",
)
def delete_checklist_assignment(checklist_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    service.delete_checklist(db, checklist_id, organization_id=current_user.organization_id)
    return {"message": f"Checklist assignment {checklist_id} removed."}


# ── Orientation Sessions ───────────────────────────────────────────────────

@hr_router.get(
    "/onboarding/orientation-sessions",
    response_model=list[OnboardingOrientationResponse],
    summary="List orientation sessions",
)
def list_orientation_sessions(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.get_orientations(db, organization_id=current_user.organization_id)


@hr_router.post(
    "/onboarding/orientation-sessions",
    response_model=OnboardingOrientationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an orientation session",
)
def create_orientation_session(data: OnboardingOrientationCreate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.create_orientation(db, data, organization_id=current_user.organization_id)


@hr_router.get(
    "/onboarding/orientation-sessions/{session_id}",
    response_model=OnboardingOrientationResponse,
    summary="Get an orientation session by ID",
)
def get_orientation_session(session_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    sessions = service.get_orientations(db, organization_id=current_user.organization_id)
    session = next((s for s in sessions if s.id == session_id), None)
    if not session:
        from app.core.exceptions import NotFoundException
        raise NotFoundException("OnboardingOrientation", session_id)
    return session


@hr_router.put(
    "/onboarding/orientation-sessions/{session_id}",
    response_model=OnboardingOrientationResponse,
    summary="Update an orientation session",
)
def update_orientation_session(session_id: int, data: OnboardingOrientationUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.update_orientation(db, session_id, data, organization_id=current_user.organization_id)


@hr_router.delete(
    "/onboarding/orientation-sessions/{session_id}",
    response_model=SuccessResponse,
    summary="Delete an orientation session",
)
def delete_orientation_session(session_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    service.delete_orientation(db, session_id, organization_id=current_user.organization_id)
    return {"message": f"Orientation session {session_id} deleted."}


# ── Orientation Attendees ──────────────────────────────────────────────────

@hr_router.get(
    "/onboarding/orientation-attendees",
    response_model=list[OnboardingOrientationAttendeeResponse],
    summary="List orientation attendees",
)
def list_orientation_attendees(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    session_id: Optional[int] = Query(None),
    onboarding_record_id: Optional[int] = Query(None),
):
    return service.get_orientation_attendees(db, session_id=session_id, new_hire_id=onboarding_record_id, organization_id=current_user.organization_id)


@hr_router.post(
    "/onboarding/orientation-attendees",
    response_model=OnboardingOrientationAttendeeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add an attendee to an orientation session",
)
def add_orientation_attendee(data: OnboardingOrientationAttendeeCreate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.add_orientation_attendee(db, data, organization_id=current_user.organization_id)


@hr_router.put(
    "/onboarding/orientation-attendees/{attendee_id}",
    response_model=OnboardingOrientationAttendeeResponse,
    summary="Update orientation attendee status",
)
def update_orientation_attendee(attendee_id: int, data: OnboardingOrientationAttendeeUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.update_orientation_attendee(db, attendee_id, data, organization_id=current_user.organization_id)


@hr_router.delete(
    "/onboarding/orientation-attendees/{attendee_id}",
    response_model=SuccessResponse,
    summary="Remove an orientation attendee",
)
def remove_orientation_attendee(attendee_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    service.remove_orientation_attendee(db, attendee_id, organization_id=current_user.organization_id)
    return {"message": f"Attendee {attendee_id} removed."}


# ── Onboarding Documents ────────────────────────────────────────────────────

_ONBOARDING_DOC_UPLOAD_DIR = os.environ.get(
    "ONBOARDING_DOC_UPLOAD_DIR",
    os.path.join(os.environ.get("UPLOAD_BASE_DIR", "/tmp/uploads"), "onboarding_documents"),
)


@hr_router.get(
    "/onboarding/documents",
    response_model=list[OnboardingDocumentResponse],
    summary="List onboarding documents",
    description="Returns onboarding documents, optionally filtered by onboarding_record_id or category.",
)
def list_onboarding_documents(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
    onboarding_record_id: Optional[int] = Query(None, description="Filter by onboarding record ID"),
    category: Optional[str] = Query(None, description="Filter by document category"),
):
    return service.get_onboarding_documents(db, onboarding_record_id=onboarding_record_id, category=category, organization_id=current_user.organization_id)


@hr_router.post(
    "/onboarding/documents",
    response_model=OnboardingDocumentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload an onboarding document",
    description="Accepts multipart/form-data with file, title, category, and optional onboarding_record_id.",
)
async def upload_onboarding_document(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
    file: UploadFile = File(..., description="The document file"),
    title: str = Form(..., min_length=1, max_length=200),
    category: str = Form(..., min_length=1, max_length=100),
    onboarding_record_id: Optional[int] = Form(None),
):
    _validate_upload_file(file)
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail=f"File too large. Maximum size is {MAX_FILE_SIZE_MB}MB.")
    os.makedirs(_ONBOARDING_DOC_UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1]
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(_ONBOARDING_DOC_UPLOAD_DIR, unique_name)
    with open(file_path, "wb") as fh:
        fh.write(contents)
    doc = service.create_onboarding_document(
        db=db,
        title=title,
        category=category,
        file_path=file_path,
        onboarding_new_hire_id=onboarding_record_id,
        organization_id=current_user.organization_id,
    )
    return doc


@hr_router.get(
    "/onboarding/documents/{document_id}",
    response_model=OnboardingDocumentResponse,
    summary="Get an onboarding document by ID",
)
def get_onboarding_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return service.get_onboarding_document_by_id(db, document_id, organization_id=current_user.organization_id)


@hr_router.put(
    "/onboarding/documents/{document_id}",
    response_model=OnboardingDocumentResponse,
    summary="Update an onboarding document (status, title, category, etc.)",
)
def update_onboarding_document(
    document_id: int,
    data: OnboardingDocumentUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return service.update_onboarding_document(db, document_id, data, organization_id=current_user.organization_id)


@hr_router.delete(
    "/onboarding/documents/{document_id}",
    response_model=SuccessResponse,
    summary="Soft-delete an onboarding document",
)
def delete_onboarding_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    service.delete_onboarding_document(db, document_id, organization_id=current_user.organization_id)
    return {"message": f"Onboarding document {document_id} deleted successfully."}


# ── Activities, Dashboard & Analytics ─────────────────────────────────────

@hr_router.get(
    "/onboarding/activities",
    response_model=list[OnboardingActivityResponse],
    summary="List onboarding activity log",
)
def list_onboarding_activities(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
    limit: int = Query(50, ge=1, le=200),
):
    return service.get_onboarding_activities(db, limit, organization_id=current_user.organization_id)


@hr_router.get(
    "/onboarding/dashboard",
    response_model=OnboardingDashboardResponse,
    summary="Get onboarding dashboard overview",
)
def onboarding_dashboard(db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.get_onboarding_dashboard(db, organization_id=current_user.organization_id)


@hr_router.get(
    "/onboarding/analytics",
    response_model=OnboardingAnalyticsResponse,
    summary="Get onboarding analytics summary",
)
def onboarding_analytics(db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.get_onboarding_analytics(db, organization_id=current_user.organization_id)


# ── Reports ───────────────────────────────────────────────────────────────

@hr_router.get("/onboarding/reports/joining", summary="Joining report")
def onboarding_joining_report(db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    new_hires = service.get_new_hires(db, organization_id=current_user.organization_id)
    from datetime import date as ddate
    today = ddate.today()
    this_month = [r for r in new_hires if r.joining_date and r.joining_date.month == today.month and r.joining_date.year == today.year]
    this_quarter_months = {1,2,3} if today.month <= 3 else ({4,5,6} if today.month <= 6 else ({7,8,9} if today.month <= 9 else {10,11,12}))
    this_quarter = [r for r in new_hires if r.joining_date and r.joining_date.month in this_quarter_months and r.joining_date.year == today.year]
    # Monthly trend grouping
    from collections import defaultdict
    monthly_counts: dict = defaultdict(int)
    for r in new_hires:
        if r.joining_date:
            key = r.joining_date.strftime("%b %Y")
            monthly_counts[key] += 1
    monthly_trend = [{"month": k, "count": v} for k, v in sorted(monthly_counts.items())]
    time_to_onboard = [
        (r.joining_date - r.created_at.date()).days
        for r in new_hires
        if r.joining_date and r.created_at
    ]
    avg_days_to_onboard = round(sum(time_to_onboard) / len(time_to_onboard), 1) if time_to_onboard else 0
    return {
        "totalJoiners": len(new_hires),
        "thisMonth": len(this_month),
        "thisQuarter": len(this_quarter),
        "avgDaysToOnboard": avg_days_to_onboard,
        "monthlyTrend": monthly_trend,
    }





@hr_router.post(
    "/performance",
    response_model=PerformanceReviewResponse,
    summary="Create a performance review",
)
def create_performance_review(data: PerformanceReviewCreate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.create_performance_review(db, data, organization_id=current_user.organization_id)


@hr_router.get(
    "/performance",
    response_model=list[PerformanceReviewResponse],
    summary="List performance reviews",
)
def list_performance_reviews(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    employee_id: Optional[int] = Query(None, description="Filter by employee ID"),
):
    return service.get_performance_reviews(db, organization_id=current_user.organization_id, employee_id=employee_id)


# ── Performance Default Reviewers ────────────────────────────────

from pydantic import BaseModel as _BaseModel

class DefaultReviewersResponse(_BaseModel):
    manager_id: Optional[int] = None
    manager_name: Optional[str] = None
    hr_reviewer_id: Optional[int] = None
    hr_reviewer_name: Optional[str] = None
    admin_reviewer_id: Optional[int] = None
    admin_reviewer_name: Optional[str] = None


@hr_router.get(
    "/performance/default-reviewers",
    response_model=DefaultReviewersResponse,
    summary="Get default reviewers for an employee (manager, HR, org admin)",
)
def get_default_reviewers(
    employee_id: int = Query(..., description="Employee ID to resolve reviewers for"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    manager_id = employee.reporting_manager_id
    manager_name = None
    if manager_id:
        mgr = db.query(Employee).filter(Employee.id == manager_id).first()
        if mgr:
            manager_name = mgr.full_name

    hr = (
        db.query(Employee)
        .filter(
            Employee.organization_id == current_user.organization_id,
            Employee.role.in_([UserRole.HR_ADMIN]),
            Employee.is_active == True,
        )
        .first()
    )
    hr_id = hr.id if hr else None
    hr_name = hr.full_name if hr else None

    admin_id = current_user.id
    admin_name = current_user.full_name if hasattr(current_user, "full_name") else None
    if not admin_name:
        admin_emp = db.query(Employee).filter(Employee.id == current_user.id).first()
        admin_name = admin_emp.full_name if admin_emp else None

    return DefaultReviewersResponse(
        manager_id=manager_id,
        manager_name=manager_name,
        hr_reviewer_id=hr_id,
        hr_reviewer_name=hr_name,
        admin_reviewer_id=admin_id,
        admin_reviewer_name=admin_name,
    )


# ── Performance Goals ──────────────────────────────────────────────

@hr_router.get(
    "/performance/goals",
    response_model=list[PerformanceGoalResponse],
    summary="List performance goals",
)
def list_performance_goals(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    employee_id: Optional[int] = Query(None, description="Filter by employee ID"),
):
    return service.get_performance_goals(db, organization_id=current_user.organization_id, employee_id=employee_id)


@hr_router.post(
    "/performance/goals",
    response_model=PerformanceGoalResponse,
    summary="Create a performance goal",
)
def create_performance_goal(data: PerformanceGoalCreate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.create_performance_goal(db, data, organization_id=current_user.organization_id)


@hr_router.get(
    "/performance/goals/{goal_id}",
    response_model=PerformanceGoalResponse,
    summary="Get a performance goal",
)
def get_performance_goal(goal_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.get_performance_goal(db, goal_id, organization_id=current_user.organization_id)


@hr_router.put(
    "/performance/goals/{goal_id}",
    response_model=PerformanceGoalResponse,
    summary="Update a performance goal",
)
def update_performance_goal(goal_id: int, data: PerformanceGoalUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.update_performance_goal(db, goal_id, data, organization_id=current_user.organization_id)


@hr_router.delete(
    "/performance/goals/{goal_id}",
    response_model=SuccessResponse,
    summary="Delete a performance goal",
)
def delete_performance_goal(goal_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    service.delete_performance_goal(db, goal_id, organization_id=current_user.organization_id)
    return {"message": f"Performance goal {goal_id} deleted successfully."}


# ── Performance KPIs ───────────────────────────────────────────────

@hr_router.get(
    "/performance/kpis",
    response_model=list[PerformanceKpiResponse],
    summary="List performance KPIs",
)
def list_performance_kpis(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    goal_id: Optional[int] = Query(None, description="Filter by goal ID"),
    employee_id: Optional[int] = Query(None, description="Filter by employee ID"),
):
    return service.get_performance_kpis(db, organization_id=current_user.organization_id, goal_id=goal_id, employee_id=employee_id)


@hr_router.post(
    "/performance/kpis",
    response_model=PerformanceKpiResponse,
    summary="Create a performance KPI",
)
def create_performance_kpi(data: PerformanceKpiCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.create_performance_kpi(db, data, organization_id=current_user.organization_id)


@hr_router.get(
    "/performance/kpis/{kpi_id}",
    response_model=PerformanceKpiResponse,
    summary="Get a performance KPI",
)
def get_performance_kpi(kpi_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.get_performance_kpi(db, kpi_id, organization_id=current_user.organization_id)


@hr_router.put(
    "/performance/kpis/{kpi_id}",
    response_model=PerformanceKpiResponse,
    summary="Update a performance KPI",
)
def update_performance_kpi(kpi_id: int, data: PerformanceKpiUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.update_performance_kpi(db, kpi_id, data, organization_id=current_user.organization_id)


@hr_router.delete(
    "/performance/kpis/{kpi_id}",
    response_model=SuccessResponse,
    summary="Delete a performance KPI",
)
def delete_performance_kpi(kpi_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    service.delete_performance_kpi(db, kpi_id, organization_id=current_user.organization_id)
    return {"message": f"Performance KPI {kpi_id} deleted successfully."}


# ── Performance Feedback ───────────────────────────────────────────

@hr_router.get(
    "/performance/feedback",
    response_model=list[PerformanceFeedbackResponse],
    summary="List performance feedback",
)
def list_performance_feedback(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    employee_id: Optional[int] = Query(None, description="Filter by employee ID"),
    reviewer_id: Optional[int] = Query(None, description="Filter by reviewer ID"),
    review_id: Optional[int] = Query(None, description="Filter by review ID"),
):
    return service.get_performance_feedback(db, organization_id=current_user.organization_id, employee_id=employee_id, reviewer_id=reviewer_id, review_id=review_id)


@hr_router.post(
    "/performance/feedback",
    response_model=PerformanceFeedbackResponse,
    summary="Create performance feedback",
)
def create_performance_feedback(data: PerformanceFeedbackCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.create_performance_feedback(db, data, organization_id=current_user.organization_id)


@hr_router.delete(
    "/performance/feedback/{fb_id}",
    response_model=SuccessResponse,
    summary="Delete performance feedback",
)
def delete_performance_feedback(fb_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    service.delete_performance_feedback(db, fb_id, organization_id=current_user.organization_id)
    return {"message": f"Performance feedback {fb_id} deleted successfully."}


# ── Appraisals ─────────────────────────────────────────────────────

@hr_router.get(
    "/performance/appraisals",
    response_model=list[AppraisalResponse],
    summary="List appraisals",
)
def list_appraisals(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    employee_id: Optional[int] = Query(None, description="Filter by employee ID"),
):
    return service.get_appraisals(db, organization_id=current_user.organization_id, employee_id=employee_id)


@hr_router.post(
    "/performance/appraisals",
    response_model=AppraisalResponse,
    summary="Create an appraisal",
)
def create_appraisal(data: AppraisalCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.create_appraisal(db, data, organization_id=current_user.organization_id)


@hr_router.get(
    "/performance/appraisals/{appraisal_id}",
    response_model=AppraisalResponse,
    summary="Get an appraisal",
)
def get_appraisal(appraisal_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.get_appraisal(db, appraisal_id, organization_id=current_user.organization_id)


@hr_router.put(
    "/performance/appraisals/{appraisal_id}",
    response_model=AppraisalResponse,
    summary="Update an appraisal",
)
def update_appraisal(appraisal_id: int, data: AppraisalUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.update_appraisal(db, appraisal_id, data, organization_id=current_user.organization_id)


@hr_router.delete(
    "/performance/appraisals/{appraisal_id}",
    response_model=SuccessResponse,
    summary="Delete an appraisal",
)
def delete_appraisal(appraisal_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    service.delete_appraisal(db, appraisal_id, organization_id=current_user.organization_id)
    return {"message": f"Appraisal {appraisal_id} deleted successfully."}


# ── Performance Analytics ──────────────────────────────────────────

@hr_router.get(
    "/performance/analytics",
    summary="Performance analytics data",
)
def performance_analytics(
    employee_id: Optional[int] = Query(None, description="Filter analytics to a single employee"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.get_performance_analytics(db, organization_id=current_user.organization_id, employee_id=employee_id)


# ════════════════════════════════════════════════════════════════════════════
# PERFORMANCE CYCLES — stub endpoints
# ════════════════════════════════════════════════════════════════════════════

@hr_router.get("/performance/cycles", summary="List performance cycles (stub)")
def list_performance_cycles(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return []


@hr_router.get("/performance/cycles/{cycle_id}", summary="Get performance cycle by ID (stub)")
def get_performance_cycle(
    cycle_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return {"id": cycle_id, "name": "", "status": "inactive", "start_date": None, "end_date": None}


@hr_router.post("/performance/cycles", summary="Create performance cycle (stub)", status_code=201)
def create_performance_cycle(
    data: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return {"id": 0, **data}


@hr_router.put("/performance/cycles/{cycle_id}", summary="Update performance cycle (stub)")
def update_performance_cycle(
    cycle_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return {"id": cycle_id, **data}


@hr_router.delete("/performance/cycles/{cycle_id}", summary="Delete performance cycle (stub)")
def delete_performance_cycle(
    cycle_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return {"message": f"Performance cycle {cycle_id} deleted successfully."}


# ════════════════════════════════════════════════════════════════════════════
# PERFORMANCE PIPS — stub endpoints
# ════════════════════════════════════════════════════════════════════════════

@hr_router.get("/performance/pips", summary="List performance improvement plans (stub)")
def list_improvement_plans(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    employee_id: Optional[int] = Query(None),
):
    return []


@hr_router.get("/performance/pips/{pip_id}", summary="Get PIP by ID (stub)")
def get_improvement_plan(
    pip_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return {"id": pip_id, "employee_id": None, "reason": "", "status": "open", "created_at": None}


@hr_router.post("/performance/pips", summary="Create PIP (stub)", status_code=201)
def create_improvement_plan(
    data: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return {"id": 0, **data}


@hr_router.put("/performance/pips/{pip_id}", summary="Update PIP (stub)")
def update_improvement_plan(
    pip_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return {"id": pip_id, **data}


@hr_router.delete("/performance/pips/{pip_id}", summary="Delete PIP (stub)")
def delete_improvement_plan(
    pip_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return {"message": f"PIP {pip_id} deleted successfully."}


@hr_router.get(
    "/performance/{review_id}",
    response_model=PerformanceReviewResponse,
    summary="Get a performance review",
)
def get_performance_review(
    review_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.get_performance_review(db, review_id, organization_id=current_user.organization_id)


@hr_router.put(
    "/performance/{review_id}",
    response_model=PerformanceReviewResponse,
    summary="Update a performance review",
)
def update_performance_review(
    review_id: int,
    data: PerformanceReviewUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.update_performance_review(db, review_id, data, organization_id=current_user.organization_id)


@hr_router.delete(
    "/performance/{review_id}",
    response_model=SuccessResponse,
    summary="Delete a performance review",
)
def delete_performance_review(
    review_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    service.delete_performance_review(db, review_id, organization_id=current_user.organization_id)
    return {"message": f"Performance review {review_id} deleted successfully."}


@hr_router.get(
    "/travel",
    response_model=list[TravelRequestResponse],
    summary="List travel requests",
)
def list_travel_requests(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    employee_id: Optional[int] = Query(None, description="Filter by employee ID"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=10000),
    search: Optional[str] = Query(None),
    status: Optional[RequestStatus] = Query(None),
):
    result = service.get_travel_requests(
        db, organization_id=current_user.organization_id,
        employee_id=employee_id, page=page, per_page=per_page,
        search=search, status=status,
    )
    return result["items"]


@hr_router.get(
    "/travel/dashboard",
    response_model=TravelDashboardStats,
    summary="Travel dashboard stats",
)
def travel_dashboard(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.get_travel_dashboard_stats(db, organization_id=current_user.organization_id)


@hr_router.get(
    "/travel/settings",
    response_model=TravelSettingResponse,
    summary="Get travel settings",
)
def get_travel_settings(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.get_travel_settings(db, organization_id=current_user.organization_id)


@hr_router.put(
    "/travel/settings",
    response_model=TravelSettingResponse,
    summary="Update travel settings",
)
def update_travel_settings(
    data: TravelSettingUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.update_travel_settings(db, organization_id=current_user.organization_id, data=data)


@hr_router.get(
    "/travel/{travel_id}",
    response_model=TravelRequestResponse,
    summary="Get travel request by ID",
)
def get_travel_request(
    travel_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.get_travel_request(db, travel_id, organization_id=current_user.organization_id)


@hr_router.put(
    "/travel/{travel_id}",
    response_model=TravelRequestResponse,
    summary="Update a travel request",
)
def update_travel_request(
    travel_id: int,
    data: TravelRequestUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.update_travel_request(db, travel_id, data, organization_id=current_user.organization_id)


@hr_router.delete(
    "/travel/{travel_id}",
    summary="Delete a travel request",
)
def delete_travel_request(
    travel_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    service.delete_travel_request(db, travel_id, organization_id=current_user.organization_id)
    return {"message": "Travel request deleted successfully."}


@hr_router.get(
    "/travel-expenses",
    response_model=list[TravelExpenseResponse],
    summary="List travel expenses",
)
def list_travel_expenses(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    request_id: Optional[int] = Query(None),
    employee_id: Optional[int] = Query(None),
    status: Optional[RequestStatus] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=10000),
    search: Optional[str] = Query(None),
):
    result = service.get_travel_expenses(
        db, organization_id=current_user.organization_id,
        request_id=request_id, employee_id=employee_id,
        status=status, page=page, per_page=per_page, search=search,
    )
    return result["items"]


@hr_router.post(
    "/workforce-planning",
    response_model=WorkforcePlanResponse,
    summary="Create workforce planning item",
    dependencies=[Depends(get_current_admin)],
)
def create_workforce_plan(data: WorkforcePlanCreate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.create_workforce_plan(db, data, organization_id=current_user.organization_id)


@hr_router.get(
    "/workforce-planning",
    response_model=list[WorkforcePlanResponse],
    summary="List workforce planning items",
    dependencies=[Depends(get_current_admin)],
)
def list_workforce_plans(db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.get_workforce_plans(db, organization_id=current_user.organization_id)


@hr_router.get(
    "/workforce/summary",
    response_model=WorkforceSummaryResponse,
    summary="Get workforce analytics summary"
)
def workforce_summary(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.get_workforce_summary(db, organization_id=current_user.organization_id)


# ════════════════════════════════════════════════════════════════════════════════
# DESIGNATION ENDPOINTS
# ════════════════════════════════════════════════════════════════════════════════

@hr_router.get(
    "/designations",
    response_model=list[DesignationResponse],
    summary="List all designations",
    tags=["📋 Designations"],
)
def list_designations(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.get_designations(db, organization_id=current_user.organization_id)


@hr_router.post(
    "/designations",
    response_model=DesignationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new designation",
    tags=["📋 Designations"],
    dependencies=[Depends(get_current_admin)],
)
def create_designation_endpoint(data: DesignationCreate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.create_designation(db, data, organization_id=current_user.organization_id)


@hr_router.get(
    "/designations/{designation_id}",
    response_model=DesignationResponse,
    summary="Get a single designation by ID",
    tags=["📋 Designations"],
)
def get_designation(
    designation_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.get_designation_by_id(db, designation_id, organization_id=current_user.organization_id)


@hr_router.put(
    "/designations/{designation_id}",
    response_model=DesignationResponse,
    summary="Update a designation",
    tags=["📋 Designations"],
    dependencies=[Depends(get_current_admin)],
)
def update_designation_endpoint(
    designation_id: int,
    data: DesignationUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return service.update_designation(db, designation_id, data, organization_id=current_user.organization_id)


@hr_router.delete(
    "/designations/{designation_id}",
    response_model=SuccessResponse,
    summary="Delete a designation",
    tags=["📋 Designations"],
    dependencies=[Depends(get_current_admin)],
)
def delete_designation_endpoint(designation_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    service.delete_designation(db, designation_id, organization_id=current_user.organization_id)
    return {"message": f"Designation {designation_id} deleted successfully."}
# ════════════════════════════════════════════════════════════════════════════════
# HR DOCUMENT ENDPOINTS
# GET    /hr/documents                    → list all (with filters)
# POST   /hr/documents/upload             → upload a new document (multipart)
# PUT    /hr/documents/{id}               → update document metadata
# PATCH  /hr/documents/{id}/status        → approve / reject / expire
# DELETE /hr/documents/{id}               → soft-delete
# ════════════════════════════════════════════════════════════════════════════════

# Directory where uploaded files are stored. In production replace with S3 or
# a proper media volume; for now we write to a local uploads folder.
_DOCUMENT_UPLOAD_DIR = os.environ.get(
    "HR_DOCUMENT_UPLOAD_DIR",
    os.path.join(os.environ.get("UPLOAD_BASE_DIR", "/tmp/uploads"), "hr_documents"),
)


@hr_router.get(
    "/documents",
    response_model=list[HrDocumentResponse],
    summary="List HR documents",
    description=(
        "Returns all non-deleted HR documents. "
        "Supports optional filtering by `category`, `status`, `employee_id`, "
        "`employee_id_str` (org-scoped Employee ID), and `search`. "
        "Employee ID is the primary identifier across modules."
    ),
    tags=["📄 HR Documents"],
)
def list_hr_documents(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    category:       Optional[str] = Query(None, description="Filter by category (company, employee, policy, contract, other)"),
    doc_status:     Optional[str] = Query(None, alias="status", description="Filter by status (pending, approved, rejected, expired)"),
    employee_id:    Optional[int] = Query(None, description="Filter by employee database ID"),
    employee_id_str: Optional[str] = Query(None, description="Filter by Employee ID (e.g., ZO0001)"),
    search:         Optional[str] = Query(None, description="Search by title or document type"),
    exclude_categories: Optional[str] = Query(None, description="Comma-separated categories to exclude (e.g. employee,contract)"),
    folder_id:      Optional[int] = Query(None, description="Filter by folder ID (null = root)"),
):
    return service.get_hr_documents(
        db,
        category=category,
        status=doc_status,
        employee_id=employee_id,
        employee_id_str=employee_id_str,
        search=search,
        exclude_categories=exclude_categories,
        folder_id=folder_id,
        organization_id=current_user.organization_id,
        current_user=current_user,
    )


@hr_router.post(
    "/documents/upload",
    response_model=HrDocumentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload an HR document",
    description=(
        "Accepts multipart/form-data with `file` plus optional `title`, `document_type`, "
        "`category`, `description`/`note`, `employee_id`, and `expiry_date`. "
        "Documents are associated with the Employee ID (EMP format) for consistent "
        "cross-module identification. Any authenticated employee can upload; the "
        "document is created with status `pending` for HR/admin review."
    ),
    tags=["📄 HR Documents"],
)
async def upload_hr_document_route(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    file: UploadFile = File(..., description="The document file"),
    title: Optional[str] = Form(None, max_length=200),
    document_type: Optional[str] = Form(None, max_length=100),
    category: str = Form("other"),
    description: Optional[str] = Form(None),
    note: Optional[str] = Form(None),
    employee_id: Optional[int] = Form(None),
    expiry_date: Optional[date] = Form(None),
    folder_id: Optional[int] = Form(None),
):
    _validate_upload_file(file)
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail=f"File too large. Maximum size is {MAX_FILE_SIZE_MB}MB.")
    os.makedirs(_DOCUMENT_UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1]
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(_DOCUMENT_UPLOAD_DIR, unique_name)
    with open(file_path, "wb") as fh:
        fh.write(contents)

    # The upload form only sends document_type (not a separate title), so
    # fall back sensibly rather than 422-ing on a missing required field.
    resolved_title = title or document_type or file.filename or "Untitled Document"
    resolved_employee_id = employee_id or current_user.id

    doc = service.upload_hr_document_with_approval(
        db=db,
        title=resolved_title,
        category=category,
        file_path=file_path,
        file_name=file.filename,
        file_size=len(contents),
        mime_type=file.content_type,
        organization_id=current_user.organization_id,
        description=description or note,
        document_type=document_type,
        employee_id=resolved_employee_id,
        uploaded_by=current_user.id,
        expiry_date=expiry_date,
        folder_id=folder_id,
    )
    return doc


@hr_router.get(
    "/documents/assigned-to-me",
    response_model=list[EmployeeDocumentResponse],
    summary="Get documents assigned to the current employee",
    tags=["📄 HR Documents"],
)
def my_assigned_documents(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.get_my_assigned_documents(
        db, employee_id=current_user.id, organization_id=current_user.organization_id,
    )


@hr_router.get(
    "/documents/{document_id}",
    response_model=HrDocumentResponse,
    summary="Get an HR document by ID",
)
def get_hr_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.get_hr_document_by_id(db, document_id, organization_id=current_user.organization_id)


import os as _os


@hr_router.get(
    "/documents/{document_id}/file",
    summary="Download / view a document file",
    description="Serves the raw file for a given document ID with Content-Disposition: inline so browsers can render PDFs & images directly.",
    tags=["📄 HR Documents"],
)
def get_hr_document_file(
    document_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    doc_data = service.get_hr_document_by_id(db, document_id, organization_id=current_user.organization_id)
    file_path = doc_data.get("file_path")
    if not file_path or not _os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    file_name = doc_data.get("file_name") or _os.path.basename(file_path)
    media_type = doc_data.get("mime_type")
    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=file_name,
        headers={"Content-Disposition": f'inline; filename="{file_name}"'},
    )


@hr_router.put(
    "/documents/{document_id}",
    response_model=HrDocumentResponse,
    summary="Update HR document metadata",
    tags=["📄 HR Documents"],
    dependencies=[Depends(get_current_user)],
)
def update_hr_document(
    document_id: int,
    data: HrDocumentUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.update_hr_document(db, document_id, data, organization_id=current_user.organization_id)


@hr_router.patch(
    "/documents/{document_id}/status",
    response_model=HrDocumentResponse,
    summary="Update HR document status (approve / reject / expire)",
    description="Allowed status values: `pending`, `approved`, `rejected`, `expired`.",
    tags=["📄 HR Documents"],
    dependencies=[Depends(get_current_admin)],   # only admins can approve/reject
)
def update_hr_document_status(
    document_id: int,
    data: HrDocumentStatusUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return service.update_hr_document_status(db, document_id, data, organization_id=current_user.organization_id)


@hr_router.delete(
    "/documents/{document_id}",
    response_model=SuccessResponse,
    summary="Soft-delete an HR document (admins or owner)",
    tags=["📄 HR Documents"],
)
def delete_hr_document(document_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """
    Allow deletion if the current user is an admin-level user or the original uploader (owner).
    """
    service.delete_hr_document(db, document_id, current_user=current_user)
    return {"message": f"Document {document_id} deleted successfully."}


# ════════════════════════════════════════════════════════════════════════════
# DOCUMENT DASHBOARD STATS
# ════════════════════════════════════════════════════════════════════════════

@hr_router.get(
    "/documents/dashboard/stats",
    summary="Document dashboard stats",
    description="Returns document counts by status, completion rate, and expiring documents alert.",
    tags=["📄 HR Documents"],
)
def document_dashboard_stats(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.get_document_dashboard_stats(db, organization_id=current_user.organization_id)


# ════════════════════════════════════════════════════════════════════════════
# DOCUMENT VERSION ENDPOINTS
# ════════════════════════════════════════════════════════════════════════════

@hr_router.get(
    "/documents/{document_id}/versions",
    summary="List document versions",
    tags=["📄 HR Documents"],
)
def list_document_versions(
    document_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.get_document_versions(db, document_id, organization_id=current_user.organization_id)


@hr_router.post(
    "/documents/{document_id}/versions",
    summary="Upload a new document version",
    status_code=status.HTTP_201_CREATED,
    tags=["📄 HR Documents"],
)
async def upload_document_version(
    document_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    file: UploadFile = File(..., description="The updated document file"),
    change_notes: Optional[str] = Form(None),
):
    _validate_upload_file(file)
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail=f"File too large. Maximum size is {MAX_FILE_SIZE_MB}MB.")
    os.makedirs(_DOCUMENT_UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1]
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(_DOCUMENT_UPLOAD_DIR, unique_name)
    contents = await file.read()
    with open(file_path, "wb") as fh:
        fh.write(contents)

    return service.create_document_version(
        db=db,
        document_id=document_id,
        file_path=file_path,
        file_name=file.filename,
        file_size=len(contents),
        mime_type=file.content_type,
        uploaded_by=current_user.id,
        organization_id=current_user.organization_id,
        change_notes=change_notes,
    )


@hr_router.get(
    "/documents/{document_id}/versions/{version_id}/file",
    summary="Download / view a specific document version's file",
    description="Serves the raw file for a historical version of a document, same as /documents/{id}/file.",
    tags=["📄 HR Documents"],
)
def get_document_version_file(
    document_id: int,
    version_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    version_data = service.get_document_version_file(
        db, document_id, version_id, organization_id=current_user.organization_id
    )
    file_path = version_data.get("file_path")
    if not file_path or not _os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    file_name = version_data.get("file_name") or _os.path.basename(file_path)
    media_type = version_data.get("mime_type")
    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=file_name,
        headers={"Content-Disposition": f'inline; filename="{file_name}"'},
    )


# ════════════════════════════════════════════════════════════════════════════
# DOCUMENT APPROVAL WORKFLOW ENDPOINTS
# ════════════════════════════════════════════════════════════════════════════

@hr_router.get(
    "/documents/approvals/pending",
    summary="Get pending approvals for current user",
    tags=["📄 HR Documents"],
)
def get_pending_approvals(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.get_pending_approvals(db, current_user)


@hr_router.post(
    "/documents/{document_id}/approve",
    summary="Approve a document",
    description=(
        "If the current user is org admin (admin) or HR admin (hr_admin), "
        "all pending steps are approved and skipped — document is approved immediately. "
        "Regular managers approve only their step in the chain."
    ),
    tags=["📄 HR Documents"],
)
def approve_document(
    document_id: int,
    data: ApprovalAction = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    comment = data.comment if data else None
    return service.approve_document(db, document_id, current_user, comment=comment)


@hr_router.post(
    "/documents/{document_id}/reject",
    summary="Reject a document",
    tags=["📄 HR Documents"],
)
def reject_document(
    document_id: int,
    data: ApprovalAction = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    comment = data.comment if data else None
    return service.reject_document(db, document_id, current_user, comment=comment)


@hr_router.get(
    "/documents/approvals/audit-log",
    summary="Get approval audit log",
    tags=["📄 HR Documents"],
)
def get_approval_audit_log(
    document_id: Optional[int] = Query(None, description="Filter by document ID"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.get_approval_audit_log(db, organization_id=current_user.organization_id, document_id=document_id)


# ════════════════════════════════════════════════════════════════════════════
# DOCUMENT-EMPLOYEE ASSIGNMENT ENDPOINTS
# ════════════════════════════════════════════════════════════════════════════

@hr_router.post(
    "/documents/{document_id}/assign",
    summary="Assign document to employees",
    description="Assign a company document to one or more employees. Existing assignments are skipped.",
    tags=["📄 HR Documents"],
)
def assign_document(
    document_id: int,
    data: DocumentAssignRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return service.assign_document_to_employees(
        db, document_id, data.employee_ids,
        assigned_by=current_user.id,
        organization_id=current_user.organization_id,
        notes=data.notes,
    )


@hr_router.get(
    "/documents/{document_id}/assignments",
    summary="List document assignments",
    tags=["📄 HR Documents"],
)
def list_document_assignments(
    document_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.get_document_assignments(db, document_id, organization_id=current_user.organization_id)


@hr_router.delete(
    "/documents/assignments/{assignment_id}",
    summary="Remove a document assignment",
    tags=["📄 HR Documents"],
)
def remove_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    service.remove_document_assignment(db, assignment_id, organization_id=current_user.organization_id)
    return {"message": f"Assignment {assignment_id} removed."}


# ════════════════════════════════════════════════════════════════════════════════
# DOCUMENT FOLDERS
# ════════════════════════════════════════════════════════════════════════════════

@hr_router.get(
    "/document-folders",
    summary="List document folders",
    tags=["📄 HR Documents"],
)
def list_folders(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    parent_id: Optional[int] = Query(None, description="Parent folder ID (null = root)"),
):
    return service.get_document_folders(db, current_user.organization_id, parent_id=parent_id)


@hr_router.get(
    "/document-folders/{folder_id}/breadcrumb",
    summary="Get folder breadcrumb path",
    tags=["📄 HR Documents"],
)
def folder_breadcrumb(
    folder_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.get_folder_breadcrumb(db, folder_id)


@hr_router.post(
    "/document-folders",
    status_code=status.HTTP_201_CREATED,
    summary="Create a document folder",
    tags=["📄 HR Documents"],
)
def create_folder(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    name: str = Form(...),
    parent_id: Optional[int] = Form(None),
):
    return service.create_document_folder(
        db,
        name=name,
        organization_id=current_user.organization_id,
        parent_id=parent_id,
        created_by=current_user.id,
    )


@hr_router.patch(
    "/document-folders/{folder_id}",
    summary="Rename a document folder",
    tags=["📄 HR Documents"],
)
def rename_folder(
    folder_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    name: str = Form(...),
):
    return service.rename_document_folder(db, folder_id, name, current_user.organization_id)


@hr_router.delete(
    "/document-folders/{folder_id}",
    summary="Delete a document folder (documents move to root)",
    tags=["📄 HR Documents"],
)
def delete_folder(
    folder_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    service.delete_document_folder(db, folder_id, current_user.organization_id)
    return {"message": f"Folder {folder_id} deleted. Documents moved to root."}


@hr_router.post(
    "/document-folders/{folder_id}/assign",
    summary="Assign all documents in a folder to employees",
    tags=["📄 HR Documents"],
)
def assign_folder(
    folder_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
    employee_ids: str = Form(..., description="Comma-separated employee IDs"),
    notes: Optional[str] = Form(None),
):
    ids = [int(x.strip()) for x in employee_ids.split(",") if x.strip().isdigit()]
    if not ids:
        raise HTTPException(status_code=400, detail="No valid employee IDs provided")
    return service.assign_folder_to_employees(
        db,
        folder_id=folder_id,
        employee_ids=ids,
        assigned_by=current_user.id,
        organization_id=current_user.organization_id,
        notes=notes,
    )