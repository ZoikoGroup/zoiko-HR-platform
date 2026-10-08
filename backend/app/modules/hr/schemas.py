"""
modules/hr/schemas.py
---------------------
Pydantic schemas = data validation for API requests and responses.
"""

import re
from datetime import date, datetime
from datetime import date as _date_type   # a field called `date` hides the `date` type inside its own class
from typing import Optional, List, Literal
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator, ConfigDict

from app.modules.hr.models import (
    AttendanceStatus, LeaveType, RequestStatus, AssetStatus,
    AssetCondition, MaintenancePriority, MaintenanceStatus,
    RequestPriority, AssetRequestStatus,
    OnboardingStatus,
    ShiftType,
    RecruitmentCandidateStatus, RequisitionStatus, InterviewStatus, OfferStatus,
    Gender, EmploymentType, EmployeeStatus, UserRole,
)
from app.modules.employee.schema import (
    EmployeeCompensationCreate, EmployeeCompensationUpdate, EmployeeCompensationResponse,
    EmployeeBenefitCreate,
    EmployeeProfileCreate, EmployeeProfileUpdate,
    EmployeeReportingCreate, EmployeeReportingUpdate,
    EmployeeLifecycleCreate, EmployeeLifecycleUpdate,
    EmployeeExportRequest,
    ChangeManagerRequest, ConfirmProbationRequest,
    PromoteEmployeeRequest, TransferEmployeeRequest,
    ResignationRequest, ExitEmployeeRequest,
)


# ════════════════════════════════════════════════════════════════════════════
# DEPARTMENT SCHEMAS
# ════════════════════════════════════════════════════════════════════════════

# modules/hr/schemas.py

class DepartmentCreate(BaseModel):
    """Data required to CREATE a new department."""
    name:               str = Field(..., min_length=2, max_length=100, json_schema_extra={"example": "Engineering"})
    code:               str = Field(..., min_length=2, max_length=20, json_schema_extra={"example": "ENG"})
    description:        Optional[str] = Field(None, json_schema_extra={"example": "Software development team"})
    
    # ── Fields to capture on creation ──
    head:               Optional[str] = None
    budget:             Optional[Decimal] = Field(Decimal("0.00"))
    spent_budget:       Optional[Decimal] = Field(Decimal("0.00"))
    establishment_year: Optional[int] = None
    parent_id:          Optional[int] = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, v):
        return v.strip()

    @field_validator("code")
    @classmethod
    def uppercase_code(cls, v):
        return v.upper().strip()


class OrganizationUpdate(BaseModel):
    """Update own organization details (org admin). ALL fields optional."""
    name:      Optional[str] = Field(None, min_length=2, max_length=200)
    industry:  Optional[str] = None
    address:   Optional[str] = None
    city:      Optional[str] = None
    state:     Optional[str] = None
    country:   Optional[str] = None
    timezone:  Optional[str] = None
    currency:  Optional[str] = None
    domain:    Optional[str] = None


class DepartmentUpdate(BaseModel):
    """Update an existing department. ALL fields are optional."""
    name:               Optional[str] = Field(None, min_length=2, max_length=100)
    code:               Optional[str] = Field(None, min_length=2, max_length=20)
    description:        Optional[str] = None
    head:               Optional[str] = None
    budget:             Optional[Decimal] = None
    spent_budget:       Optional[Decimal] = None
    establishment_year: Optional[int] = None
    parent_id:          Optional[int] = None
    is_active:          Optional[bool] = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, v):
        return v.strip() if v else v

    @field_validator("code")
    @classmethod
    def uppercase_code(cls, v):
        return v.upper().strip() if v else v


class DepartmentResponse(BaseModel):
    """What the API returns when you request department data."""
    id:                 int
    name:               str
    code:               str
    department_code:    Optional[str] = None
    description:        Optional[str] = None
    is_active:          bool
    created_at:         Optional[datetime] = None
    organization_id:    Optional[int] = None
    
    # ── Return fields for UI visibility ──
    head:               Optional[str] = None
    budget:             Optional[Decimal] = None
    spent_budget:       Optional[Decimal] = None
    establishment_year: Optional[int] = None
    parent_id:          Optional[int] = None
    employee_count:     Optional[int] = 0

    model_config = {"from_attributes": True}


# ════════════════════════════════════════════════════════════════════════════
# EMPLOYEE SCHEMAS
# ════════════════════════════════════════════════════════════════════════════

class EmployeeCreate(BaseModel):
    email:               EmailStr          = Field(..., json_schema_extra={"example": "john.doe@zoiko.com"})
    password:            str               = Field(..., min_length=8, json_schema_extra={"example": "SecurePass123!"})
    first_name:          str               = Field(..., min_length=1, max_length=100, json_schema_extra={"example": "John"})
    last_name:           str               = Field(..., min_length=1, max_length=100, json_schema_extra={"example": "Doe"})
    phone:               Optional[str]     = Field(None, json_schema_extra={"example": "+91-9876543210"})
    date_of_birth:       Optional[date]    = Field(None, json_schema_extra={"example": "1995-06-15"})
    gender:              Optional[Gender]  = None
    job_title:           str               = Field(..., json_schema_extra={"example": "Software Engineer"})
    employment_type:     EmploymentType    = Field(EmploymentType.FULL_TIME)
    date_of_joining:     date              = Field(..., json_schema_extra={"example": "2024-01-15"})
    department_id:       Optional[int]     = Field(None, json_schema_extra={"example": 1})
    designation_id:      Optional[int]     = Field(None, json_schema_extra={"example": 1})
    reporting_manager_id: Optional[int]    = Field(None, json_schema_extra={"example": 1})
    basic_salary:        Optional[Decimal] = Field(None, json_schema_extra={"example": 75000.00})
    ctc:                 Optional[Decimal] = Field(None, json_schema_extra={"example": 1200000.00})
    role:                UserRole          = Field(UserRole.EMPLOYEE)
    work_email:          Optional[str]     = Field(None, json_schema_extra={"example": "john@zoikone.com"})
    personal_email:      Optional[str]     = Field(None, json_schema_extra={"example": "john@gmail.com"})
    confirmation_date:   Optional[date]    = Field(None, json_schema_extra={"example": "2024-07-15"})
    company:             Optional[str]     = Field(None, json_schema_extra={"example": "ZoikoOne"})
    business_unit:       Optional[str]     = Field(None, json_schema_extra={"example": "Enterprise"})
    division:            Optional[str]     = Field(None, json_schema_extra={"example": "Engineering"})
    team:                Optional[str]     = Field(None, json_schema_extra={"example": "Frontend"})
    current_address:     Optional[str]     = Field(None, json_schema_extra={"example": "123 Main St"})
    permanent_address:   Optional[str]     = Field(None, json_schema_extra={"example": "456 Oak Ave"})
    city:                Optional[str]     = Field(None, json_schema_extra={"example": "Mumbai"})
    state:               Optional[str]     = Field(None, json_schema_extra={"example": "Maharashtra"})
    country:             Optional[str]     = Field(None, json_schema_extra={"example": "India"})
    pincode:             Optional[str]     = Field(None, json_schema_extra={"example": "400001"})

    @field_validator("employment_type", mode="before")
    @classmethod
    def normalize_employment_type(cls, v):
        if isinstance(v, str):
            try:
                return EmploymentType(v)
            except ValueError:
                pass
            try:
                return EmploymentType[v.upper()]
            except KeyError:
                pass
        return v

    @field_validator("role", mode="before")
    @classmethod
    def normalize_role(cls, v):
        if isinstance(v, str):
            try:
                return UserRole(v)
            except ValueError:
                pass
            try:
                return UserRole[v.upper()]
            except KeyError:
                pass
        return v

    @field_validator("gender", mode="before")
    @classmethod
    def normalize_gender(cls, v):
        if isinstance(v, str):
            try:
                return Gender(v)
            except ValueError:
                pass
            try:
                return Gender[v.upper()]
            except KeyError:
                pass
        return v


class EmployeeUpdate(BaseModel):
    first_name:           Optional[str]            = None
    last_name:            Optional[str]            = None
    phone:                Optional[str]            = None
    date_of_birth:        Optional[date]           = None
    gender:               Optional[Gender]         = None
    job_title:            Optional[str]            = None
    employment_type:      Optional[EmploymentType] = None
    status:               Optional[EmployeeStatus] = None
    department_id:        Optional[int]            = None
    designation_id:       Optional[int]            = None
    reporting_manager_id: Optional[int]            = None
    basic_salary:         Optional[Decimal]        = None
    ctc:                  Optional[Decimal]        = None
    address:              Optional[str]            = None
    profile_picture:      Optional[str]            = None
    work_email:           Optional[str]            = None
    personal_email:       Optional[str]            = None
    confirmation_date:    Optional[date]           = None

    @field_validator("employment_type", mode="before")
    @classmethod
    def normalize_employment_type(cls, v):
        if isinstance(v, str):
            try:
                return EmploymentType(v)
            except ValueError:
                pass
            try:
                return EmploymentType[v.upper()]
            except KeyError:
                pass
        return v

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, v):
        if isinstance(v, str):
            try:
                return EmployeeStatus(v)
            except ValueError:
                pass
            try:
                return EmployeeStatus[v.upper()]
            except KeyError:
                pass
        return v

    @field_validator("gender", mode="before")
    @classmethod
    def normalize_gender(cls, v):
        if isinstance(v, str):
            try:
                return Gender(v)
            except ValueError:
                pass
            try:
                return Gender[v.upper()]
            except KeyError:
                pass
        return v
    company:              Optional[str]            = None
    business_unit:        Optional[str]            = None
    division:             Optional[str]            = None
    team:                 Optional[str]            = None
    current_address:      Optional[str]            = None
    permanent_address:    Optional[str]            = None
    city:                 Optional[str]            = None
    state:                Optional[str]            = None
    country:              Optional[str]            = None
    pincode:              Optional[str]            = None


class EmployeeResponse(BaseModel):
    id:                  int
    email:               str
    role:                UserRole
    is_active:           bool
    first_name:          str
    last_name:           str
    full_name:           str
    phone:               Optional[str]
    date_of_birth:       Optional[date]
    gender:              Optional[Gender]
    profile_picture:     Optional[str]
    employee_id:         Optional[str] = None
    employee_code:       str
    legacy_code:         Optional[str] = None
    job_title:           str
    employment_type:     EmploymentType
    status:              EmployeeStatus
    date_of_joining:     date
    basic_salary:        Optional[Decimal]
    ctc:                 Optional[Decimal]
    department_id:       Optional[int]
    designation_id:      Optional[int]
    reporting_manager_id: Optional[int]
    department:          Optional[DepartmentResponse] = None
    work_email:          Optional[str]
    personal_email:      Optional[str]
    confirmation_date:   Optional[date]
    company:             Optional[str]
    business_unit:       Optional[str]
    division:            Optional[str]
    team:                Optional[str]
    current_address:     Optional[str]
    permanent_address:   Optional[str]
    city:                Optional[str]
    state:               Optional[str]
    country:             Optional[str]
    pincode:             Optional[str]
    created_at:          Optional[datetime]
    created_by:          Optional[int] = None
    updated_by:          Optional[int] = None

    model_config = {"from_attributes": True}


class EmployeeListResponse(BaseModel):
    total:    int
    page:     int
    per_page: int
    items:    List[EmployeeResponse]


class TokenResponse(BaseModel):
    access_token:  str
    token_type:    str = "bearer"
    refresh_token: Optional[str] = None
    employee:      EmployeeResponse


class RefreshRequest(BaseModel):
    """Request payload for refreshing tokens."""
    refresh_token: str


class SuccessResponse(BaseModel):
    message: str


# ════════════════════════════════════════════════════════════════════════════
# USER MANAGEMENT SCHEMAS (Organization Admin)
# ════════════════════════════════════════════════════════════════════════════

class UserCreateRequest(BaseModel):
    first_name:      str = Field(..., min_length=1, max_length=100, json_schema_extra={"example": "Jane"})
    last_name:       str = Field(..., min_length=1, max_length=100, json_schema_extra={"example": "Smith"})
    email:           EmailStr = Field(..., json_schema_extra={"example": "jane.smith@company.com"})
    phone:           Optional[str] = Field(None, json_schema_extra={"example": "+1-555-0100"})
    role:            UserRole = Field(..., json_schema_extra={"example": "hr_admin"})
    organization_id: Optional[int] = Field(None, description="Target organization ID (Super Admin only)")

    @field_validator("role", mode="before")
    @classmethod
    def normalize_role(cls, v):
        if isinstance(v, str):
            try:
                return UserRole(v)
            except ValueError:
                pass
            try:
                return UserRole[v.upper()]
            except KeyError:
                pass
        return v

    @field_validator("role", mode="before")
    @classmethod
    def validate_role(cls, v):
        if isinstance(v, str):
            try:
                return UserRole[v.upper()]
            except KeyError:
                pass
            try:
                return UserRole(v.lower())
            except ValueError:
                pass
        return v


class UserUpdateRequest(BaseModel):
    first_name:      Optional[str] = Field(None, min_length=1, max_length=100)
    last_name:       Optional[str] = Field(None, min_length=1, max_length=100)
    phone:           Optional[str] = None
    role:            Optional[UserRole] = None
    is_active:       Optional[bool] = None
    organization_id: Optional[int] = Field(None, description="Target organization ID (Super Admin only)")

    @field_validator("role", mode="before")
    @classmethod
    def normalize_role(cls, v):
        if isinstance(v, str):
            try:
                return UserRole(v)
            except ValueError:
                pass
            try:
                return UserRole[v.upper()]
            except KeyError:
                pass
        return v

    @field_validator("role", mode="before")
    @classmethod
    def validate_role(cls, v):
        if isinstance(v, str):
            try:
                return UserRole[v.upper()]
            except KeyError:
                pass
            try:
                return UserRole(v.lower())
            except ValueError:
                pass
        return v


class UserResponse(BaseModel):
    id:            int
    email:         str
    role:          UserRole
    is_active:     bool
    first_name:    str
    last_name:     str
    full_name:     str
    phone:         Optional[str]
    employee_code: str
    status:        EmployeeStatus
    job_title:     Optional[str] = None
    department:    Optional[str] = None
    created_at:    Optional[datetime]
    updated_at:    Optional[datetime]
    created_by:    Optional[int] = None
    updated_by:    Optional[int] = None

    model_config = {"from_attributes": True}

    @field_validator("department", mode="before")
    @classmethod
    def coerce_department(cls, v):
        if v is None or isinstance(v, str):
            return v
        if hasattr(v, "name"):
            return v.name
        return str(v)


class UserListResponse(BaseModel):
    total:    int
    page:     int
    per_page: int
    items:    List[UserResponse]


class PasswordResetResponse(BaseModel):
    message:           str
    temporary_password: str
class AllowedRolesResponse(BaseModel):
    """Response listing roles the current user is allowed to create."""
    allowed_roles: List[str]
    can_create_users: bool


# ════════════════════════════════════════════════════════════════════════════
# HR SUBMODULE SCHEMAS
# ════════════════════════════════════════════════════════════════════════════

class LoginRequest(BaseModel):
    email: EmailStr = Field(..., json_schema_extra={"example": "admin@zoiko.com"})
    password: str = Field(..., json_schema_extra={"example": "SecurePassword123"})


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200, json_schema_extra={"example": "John Doe"})
    email: EmailStr = Field(..., json_schema_extra={"example": "admin@company.com"})
    password: str = Field(..., min_length=8, json_schema_extra={"example": "SecurePass123!"})
    organization: str = Field(..., min_length=1, max_length=200, json_schema_extra={"example": "Acme Inc."})
    product: Optional[str] = Field(None, json_schema_extra={"example": "payroll"})
    products: Optional[List[str]] = Field(None, json_schema_extra={"example": ["hr", "payroll"]})
    org_type: Optional[str] = Field(None, json_schema_extra={"example": "corporation"})
    phone: Optional[str] = Field(None, json_schema_extra={"example": "+1-555-0100"})
    address: Optional[str] = Field(None, json_schema_extra={"example": "123 Main St, Suite 100"})
    city: Optional[str] = Field(None, json_schema_extra={"example": "New York"})
    state: Optional[str] = Field(None, json_schema_extra={"example": "NY"})
    country: Optional[str] = Field(None, json_schema_extra={"example": "US"})
    timezone: Optional[str] = Field(None, json_schema_extra={"example": "UTC"})
    industry: Optional[str] = Field(None, json_schema_extra={"example": "Technology"})
    tax_number: Optional[str] = Field(None, json_schema_extra={"example": "12-3456789"})
    registered_email: Optional[str] = Field(None, json_schema_extra={"example": "company@example.com"})
class AttendanceCreate(BaseModel):
    employee_id: int
    date: date
    status: AttendanceStatus = AttendanceStatus.PRESENT
    check_in: Optional[datetime] = None
    check_out: Optional[datetime] = None
    notes: Optional[str] = None

    @field_validator("status", mode="before")
    @classmethod
    def normalize_attendance_status(cls, v):
        if isinstance(v, str):
            try:
                return AttendanceStatus(v)
            except ValueError:
                pass
            try:
                return AttendanceStatus[v.upper()]
            except KeyError:
                pass
        return v


class AttendanceResponse(BaseModel):
    id: int
    employee_id: int
    date: date
    status: AttendanceStatus
    check_in: Optional[datetime]
    check_out: Optional[datetime]
    notes: Optional[str]
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


class AttendanceUpdate(BaseModel):
    status: Optional[AttendanceStatus] = None
    check_in: Optional[datetime] = None
    check_out: Optional[datetime] = None
    notes: Optional[str] = None

    @field_validator("status", mode="before")
    @classmethod
    def normalize_attendance_status(cls, v):
        if isinstance(v, str):
            try:
                return AttendanceStatus(v)
            except ValueError:
                pass
            try:
                return AttendanceStatus[v.upper()]
            except KeyError:
                pass
        return v


# ════════════════════════════════════════════════════════════════════════════
# SHIFT SCHEMAS
# ════════════════════════════════════════════════════════════════════════════

class ShiftCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    shift_type: ShiftType = ShiftType.GENERAL
    start_time: str = Field(..., min_length=4, max_length=5, pattern=r"^\d{2}:\d{2}$")
    end_time: str = Field(..., min_length=4, max_length=5, pattern=r"^\d{2}:\d{2}$")
    grace_time_minutes: int = Field(default=0, ge=0)
    break_duration_minutes: int = Field(default=60, ge=0)
    is_overtime_eligible: bool = True
    requires_attendance: bool = True
    description: Optional[str] = None


class ShiftUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    shift_type: Optional[ShiftType] = None
    start_time: Optional[str] = Field(None, min_length=4, max_length=5, pattern=r"^\d{2}:\d{2}$")
    end_time: Optional[str] = Field(None, min_length=4, max_length=5, pattern=r"^\d{2}:\d{2}$")
    grace_time_minutes: Optional[int] = Field(None, ge=0)
    break_duration_minutes: Optional[int] = Field(None, ge=0)
    is_overtime_eligible: Optional[bool] = None
    requires_attendance: Optional[bool] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class ShiftResponse(BaseModel):
    id: int
    name: str
    shift_type: ShiftType
    start_time: str
    end_time: str
    grace_time_minutes: int
    break_duration_minutes: int
    is_overtime_eligible: bool
    requires_attendance: bool
    description: Optional[str]
    is_active: bool
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


# ════════════════════════════════════════════════════════════════════════════
# SHIFT ROSTER SCHEMAS
# ════════════════════════════════════════════════════════════════════════════

class ShiftRosterCreate(BaseModel):
    employee_id: int
    shift_id: int
    date: date


class ShiftRosterBulkCreate(BaseModel):
    assignments: list[ShiftRosterCreate]


class ShiftRosterResponse(BaseModel):
    id: int
    employee_id: int
    shift_id: int
    date: date
    is_active: bool
    assigned_by: Optional[int]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


# ════════════════════════════════════════════════════════════════════════════
# HOLIDAY SCHEMAS
# ════════════════════════════════════════════════════════════════════════════

class HolidayCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    date: date
    type: str = "public"
    is_recurring: bool = False
    description: Optional[str] = None


class HolidayUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=150)
    date: Optional[_date_type] = None
    type: Optional[str] = None
    is_recurring: Optional[bool] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class HolidayResponse(BaseModel):
    id: int
    name: str
    date: date
    type: Optional[str]
    is_recurring: bool
    description: Optional[str]
    is_active: bool
    created_by: Optional[int]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


# ════════════════════════════════════════════════════════════════════════════
# DASHBOARD / REPORT SCHEMAS
# ════════════════════════════════════════════════════════════════════════════

class AttendanceDashboardResponse(BaseModel):
    present_today: int = 0
    absent_today: int = 0
    late_arrivals: int = 0
    early_departures: int = 0
    on_leave: int = 0
    on_leave_count: int = 0
    remote: int = 0
    remote_count: int = 0
    overtime: float = 0.0
    overtime_count: float = 0.0
    attendance_percentage: float = 0.0
    attendance_rate: float = 0.0
    avg_working_hours: float = 0.0
    total_employees: int = 0
    department_attendance: list[dict] = []
    department_breakdown: list[dict] = []
    shift_distribution: list[dict] = []
    shift_utilization: list[dict] = []
    attendance_trend: list[dict] = []
    changes: dict = {}
    departments: list[str] = []
    as_of: Optional[str] = None


class AttendanceReportResponse(BaseModel):
    employee_id: int
    employee_name: Optional[str] = None
    department: Optional[str] = None
    period_start: date
    period_end: date
    total_working_days: int = 0
    days_present: int = 0
    days_absent: int = 0
    days_on_leave: int = 0
    days_remote: int = 0
    late_arrivals: int = 0
    early_departures: int = 0
    overtime_hours: float = 0.0
    attendance_percentage: float = 0.0


class LeaveRequestCreate(BaseModel):
    employee_id: Optional[int] = None
    leave_type: LeaveType
    start_date: date
    end_date: date
    reason: Optional[str] = None

    @field_validator("leave_type", mode="before")
    @classmethod
    def normalize_leave_type(cls, v):
        if isinstance(v, str):
            try:
                return LeaveType(v)
            except ValueError:
                pass
            try:
                return LeaveType[v.upper()]
            except KeyError:
                pass
            mapping = {
                "annual leave": "annual",
                "sick leave": "sick",
                "casual leave": "casual",
                "unpaid leave": "unpaid",
                "maternity leave": "maternity",
                "paternity leave": "paternity",
                "bereavement leave": "bereavement",
                "emergency leave": "emergency",
                "study leave": "study",
                "earned leave": "earned",
                "comp off": "comp_off",
                "comp-off": "comp_off",
                "sabbatical leave": "sabbatical",
                "work from home": "work_from_home",
            }
            return mapping.get(v.strip().lower(), v)
        return v


class LeaveRequestUpdate(BaseModel):
    status: Optional[RequestStatus] = None
    reason: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, v):
        if isinstance(v, str):
            try:
                return RequestStatus(v)
            except ValueError:
                pass
            try:
                return RequestStatus[v.upper()]
            except KeyError:
                pass
        return v


class LeaveRequestResponse(BaseModel):
    id: int
    employee_id: int
    employee_code: Optional[str] = None
    employee_name: Optional[str] = None
    department: Optional[str] = None
    organization_id: int
    leave_type: LeaveType
    start_date: date
    end_date: date
    days: int
    reason: Optional[str]
    status: RequestStatus
    reviewed_by: Optional[int]
    reviewed_at: Optional[datetime]
    approved_by: Optional[str] = None
    reviewer_name: Optional[str] = None     # who decided it (None while nobody has)
    approval_date: Optional[datetime] = None
    approval_comments: Optional[str] = None
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class LeaveTypeConfigCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    code: str = Field(..., min_length=1, max_length=100, description="Unique code for the leave type (e.g. emergency, comp_off)")
    default_days_per_year: int = 0
    carry_forward_allowed: bool = False
    carry_forward_max_days: Optional[int] = None
    min_notice_days: Optional[int] = None
    max_consecutive_days: Optional[int] = None
    requires_approval: bool = True
    is_active: bool = True
    color: Optional[str] = None
    icon: Optional[str] = None


class LeaveTypeConfigUpdate(BaseModel):
    name: Optional[str] = None
    default_days_per_year: Optional[int] = None
    carry_forward_allowed: Optional[bool] = None
    carry_forward_max_days: Optional[int] = None
    min_notice_days: Optional[int] = None
    max_consecutive_days: Optional[int] = None
    requires_approval: Optional[bool] = None
    is_active: Optional[bool] = None
    color: Optional[str] = None
    icon: Optional[str] = None


class LeaveTypeConfigResponse(BaseModel):
    id: int
    organization_id: int
    name: str
    code: str
    default_days_per_year: int
    carry_forward_allowed: bool
    carry_forward_max_days: Optional[int]
    min_notice_days: Optional[int]
    max_consecutive_days: Optional[int]
    requires_approval: bool
    is_active: bool
    color: Optional[str]
    icon: Optional[str]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class LeaveSettingCreate(BaseModel):
    working_days: list[str] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    leave_year_start: Optional[date] = None
    max_consecutive_days: Optional[int] = None
    carry_forward_limit: int = 0
    approval_workflow: str = "manager"
    escalation_days: int = 3
    auto_approve_days: int = 1
    notification_on_submit: bool = True
    notification_on_approve: bool = True
    notification_on_reject: bool = True


class LeaveSettingUpdate(BaseModel):
    working_days: Optional[list[str]] = None
    leave_year_start: Optional[date] = None
    max_consecutive_days: Optional[int] = None
    carry_forward_limit: Optional[int] = None
    approval_workflow: Optional[str] = None
    escalation_days: Optional[int] = None
    auto_approve_days: Optional[int] = None
    notification_on_submit: Optional[bool] = None
    notification_on_approve: Optional[bool] = None
    notification_on_reject: Optional[bool] = None


class LeaveSettingResponse(BaseModel):
    id: int
    organization_id: int
    working_days: list[str]
    leave_year_start: Optional[date]
    max_consecutive_days: Optional[int]
    carry_forward_limit: int
    approval_workflow: str
    escalation_days: int
    auto_approve_days: int
    notification_on_submit: bool
    notification_on_approve: bool
    notification_on_reject: bool
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class LeaveBalanceResponse(BaseModel):
    id: int
    employee_id: int
    organization_id: int
    leave_type: LeaveType
    total_days: int
    used_days: int
    pending_days: int
    year: int
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class LeaveBalanceUpdate(BaseModel):
    total_days: Optional[int] = None
    used_days: Optional[int] = None
    pending_days: Optional[int] = None


class LeaveDashboardStats(BaseModel):
    total_requests: int = 0
    pending_requests: int = 0
    approved_requests: int = 0
    rejected_requests: int = 0
    total_days_taken: int = 0
    pending_days_taken: int = 0
    approved_days_taken: int = 0
    employee_count: int = 0
    on_leave_today: int = 0
    wfh: int = 0  # employees working from home today (approved Work From Home requests)


class LeaveCalendarEvent(BaseModel):
    id: int
    employee_id: int
    employee_name: str = ""
    leave_type: LeaveType
    start_date: date
    end_date: date
    days: int
    status: RequestStatus


class LeaveStatisticsResponse(BaseModel):
    total_employees: int = 0
    total_requests: int = 0
    approval_rate: float = 0.0
    average_days_per_request: float = 0.0
    leave_type_breakdown: Optional[list[dict]] = None
    monthly_trend: Optional[list[dict]] = None


class AssetCreate(BaseModel):
    employee_id: Optional[int] = None
    name: str = Field(..., min_length=1, max_length=150)
    asset_tag: str = Field(..., min_length=1, max_length=100)
    category: Optional[str] = Field(None, max_length=100)
    serial_number: Optional[str] = Field(None, max_length=200)
    department: Optional[str] = Field(None, max_length=100)
    assigned_date: Optional[date] = None
    purchase_date: Optional[date] = None
    purchase_cost: Optional[Decimal] = Field(None, ge=0)
    condition: Optional[AssetCondition] = None
    status: AssetStatus = AssetStatus.AVAILABLE
    notes: Optional[str] = None


class AssetUpdate(BaseModel):
    employee_id: Optional[int] = None
    name: Optional[str] = Field(None, min_length=1, max_length=150)
    asset_tag: Optional[str] = Field(None, min_length=1, max_length=100)
    category: Optional[str] = Field(None, max_length=100)
    serial_number: Optional[str] = Field(None, max_length=200)
    department: Optional[str] = Field(None, max_length=100)
    assigned_date: Optional[date] = None
    purchase_date: Optional[date] = None
    purchase_cost: Optional[Decimal] = Field(None, ge=0)
    condition: Optional[AssetCondition] = None
    status: Optional[AssetStatus] = None
    notes: Optional[str] = None


class AssetResponse(BaseModel):
    id: int
    employee_id: Optional[int]
    name: str
    asset_tag: str
    category: Optional[str]
    serial_number: Optional[str]
    department: Optional[str]
    assigned_date: Optional[date]
    purchase_date: Optional[date]
    purchase_cost: Optional[Decimal]
    condition: Optional[AssetCondition]
    status: AssetStatus
    notes: Optional[str]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    employee_name: Optional[str] = None

    model_config = {"from_attributes": True}


class AssetListResponse(BaseModel):
    total: int
    page: int
    per_page: int
    items: list[AssetResponse]


class MaintenanceCreate(BaseModel):
    asset_id: int
    asset_name: Optional[str] = None
    asset_tag: Optional[str] = None
    issue: str
    priority: MaintenancePriority = MaintenancePriority.MEDIUM
    reported_by: Optional[str] = None
    reported_by_id: Optional[int] = None
    reported_on: date


class MaintenanceUpdate(BaseModel):
    issue: Optional[str] = None
    priority: Optional[MaintenancePriority] = None
    status: Optional[MaintenanceStatus] = None


class MaintenanceResolve(BaseModel):
    resolution: str
    resolved_by: Optional[int] = None


class MaintenanceResponse(BaseModel):
    id: int
    asset_id: int
    asset_name: Optional[str]
    asset_tag: Optional[str]
    issue: str
    priority: MaintenancePriority
    reported_by: Optional[str]
    reported_by_id: Optional[int]
    reported_on: date
    status: MaintenanceStatus
    resolution: Optional[str]
    resolved_by: Optional[int]
    resolved_on: Optional[datetime]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class AssetRequestCreate(BaseModel):
    employee_id: Optional[int] = None
    employee_name: Optional[str] = None
    asset_type: str
    quantity: int = Field(default=1, ge=1)
    priority: RequestPriority = RequestPriority.MEDIUM
    reason: Optional[str] = None
    notes: Optional[str] = None
    requested_on: date


class AssetRequestResponse(BaseModel):
    id: int
    employee_id: Optional[int]
    employee_name: Optional[str]
    asset_type: str
    quantity: int
    priority: RequestPriority
    reason: Optional[str]
    notes: Optional[str]
    status: AssetRequestStatus
    requested_on: date
    approved_by: Optional[int]
    approved_on: Optional[datetime]
    fulfilled_on: Optional[datetime]
    cancelled_on: Optional[datetime]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class AssetCategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None


class AssetCategoryResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    is_active: bool
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


class AssetReportGenerate(BaseModel):
    report_type: str
    title: str
    description: Optional[str] = None
    parameters: Optional[str] = None


class AssetReportResponse(BaseModel):
    id: int
    report_type: str
    title: str
    description: Optional[str]
    generated_by: Optional[int]
    parameters: Optional[str]
    file_url: Optional[str]
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


class AssetSettingUpdate(BaseModel):
    settings: dict[str, Optional[str]]


class AssetSettingResponse(BaseModel):
    id: int
    setting_key: str
    setting_value: Optional[str]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class AssetDashboardResponse(BaseModel):
    total_assets: int = 0
    assigned_count: int = 0
    available_count: int = 0
    maintenance_count: int = 0
    retired_count: int = 0
    lost_count: int = 0
    recently_added: int = 0
    category_breakdown: list[dict] = []
    status_breakdown: list[dict] = []
    pending_requests: int = 0
    open_maintenance: int = 0


# ── Compensation Schemas ──────────────────────────────────────────────────────

# Legacy compensation item (used by old dashboard stats)
class CompensationCreate(BaseModel):
    employee_id: int
    amount: Decimal
    item_type: str
    description: Optional[str] = None

class CompensationResponse(CompensationCreate):
    id: int
    created_at: datetime
    model_config = {"from_attributes": True}


class PayGradeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    min_salary: Decimal
    max_salary: Decimal
    description: Optional[str] = None

class PayGradeUpdate(BaseModel):
    name: Optional[str] = None
    min_salary: Optional[Decimal] = None
    max_salary: Optional[Decimal] = None
    description: Optional[str] = None

class PayGradeResponse(PayGradeCreate):
    id: int
    created_at: datetime
    updated_at: Optional[datetime]
    model_config = {"from_attributes": True}

class CompensationBandCreate(BaseModel):
    band_name: str = Field(..., min_length=1, max_length=100)
    level: int
    min_salary: Decimal
    max_salary: Decimal

class CompensationBandUpdate(BaseModel):
    band_name: Optional[str] = None
    level: Optional[int] = None
    min_salary: Optional[Decimal] = None
    max_salary: Optional[Decimal] = None

class CompensationBandResponse(CompensationBandCreate):
    id: int
    created_at: datetime
    updated_at: Optional[datetime]
    model_config = {"from_attributes": True}


class _SalaryComponentChecks(BaseModel):
    """A component's default amount is optional: it is only a suggested starting value. The amount that counts is the one
    set for the component inside each salary structure, and that one is required."""
    @field_validator("name", mode="before", check_fields=False)
    @classmethod
    def _v_name(cls, v):
        return _course_text("Component name", 100)(v)

    @field_validator("component_type", mode="before", check_fields=False)
    @classmethod
    def _v_type(cls, v):
        text = str(v).strip().lower() if v is not None else ""
        if text not in ("earning", "deduction"):
            raise ValueError("Type must be Earning or Deduction.")
        return text

    @field_validator("default_amount", mode="before", check_fields=False)
    @classmethod
    def _v_amount(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        try:
            n = Decimal(str(v).strip())
        except Exception:
            raise ValueError("Default amount must be a number.")
        if not n.is_finite():
            raise ValueError("Default amount must be a number.")
        if n <= 0:
            raise ValueError("Default amount must be greater than 0.")
        if n > Decimal("99999999.99"):
            raise ValueError("Default amount is too large (the most is 99,999,999.99).")
        if n != n.quantize(Decimal("0.01")):
            raise ValueError("Default amount can have at most 2 decimal places.")
        return n

    @field_validator("description", mode="before", check_fields=False)
    @classmethod
    def _v_description(cls, v):
        text = str(v).strip() if v is not None else ""
        if not text:
            return None
        if len(text) > 2000:
            raise ValueError("Description can be at most 2000 characters.")
        return text


class SalaryComponentCreate(_SalaryComponentChecks):
    name: str
    component_type: str
    is_taxable: bool = True
    default_amount: Optional[Decimal] = None
    description: Optional[str] = None


class SalaryComponentUpdate(_SalaryComponentChecks):
    """Fields left out stay as they are; a name that is sent must still be filled in. A blank default amount clears it."""
    name: Optional[str] = None
    component_type: Optional[str] = None
    is_taxable: Optional[bool] = None
    default_amount: Optional[Decimal] = None
    description: Optional[str] = None


class SalaryComponentResponse(BaseModel):
    # reading never re-checks: a component saved before these rules (with no amount) must still be listed
    id: int
    name: str
    component_type: str
    is_taxable: bool = True
    default_amount: Optional[Decimal] = None
    description: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime]
    model_config = {"from_attributes": True}


class SalaryStructureCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    is_active: bool = True

class SalaryStructureUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None

class SalaryStructureResponse(SalaryStructureCreate):
    id: int
    created_at: datetime
    updated_at: Optional[datetime]
    model_config = {"from_attributes": True}

_FORMULA_CHARS = re.compile(r"^[A-Za-z0-9_ .%+\-*/()]+$")


def clean_structure_amount(v) -> str:
    """What a component pays inside a salary structure: a fixed amount ("50000", "1250.50"), a percentage ("12%") or a short
    formula ("40% of basic", "basic * 0.4"). It is required: a structure never holds a component without one."""
    text = " ".join(str(v if v is not None else "").split())
    if not text:
        raise ValueError("Enter the amount or formula for this component in the structure.")
    if len(text) > 255:
        raise ValueError("The amount or formula can be at most 255 characters.")
    plain = text.replace(",", "")
    try:
        number = Decimal(plain)
    except Exception:
        number = None
    if number is not None:
        if not number.is_finite():
            raise ValueError("Enter the amount as a number.")
        if number <= 0:
            raise ValueError("The amount must be greater than 0.")
        if number > Decimal("99999999.99"):
            raise ValueError("The amount is too large (the most is 99,999,999.99).")
        if number != number.quantize(Decimal("0.01")):
            raise ValueError("The amount can have at most 2 decimal places.")
        return format(number.normalize(), "f")
    if text.endswith("%") and re.fullmatch(r"\d+(\.\d+)?%", text):
        pct = Decimal(text[:-1])
        if pct <= 0 or pct > 100:
            raise ValueError("A percentage must be more than 0 and at most 100.")
        return text
    if not _FORMULA_CHARS.match(text) or not re.search(r"[A-Za-z0-9]", text):
        raise ValueError("Use a number, a percentage such as 12%, or a formula such as 40% of basic.")
    return text


class StructureComponentCreate(BaseModel):
    structure_id: Optional[int] = None      # taken from the URL when it is left out
    component_id: int
    amount_or_formula: str

    @field_validator("amount_or_formula", mode="before")
    @classmethod
    def _v_amount(cls, v):
        return clean_structure_amount(v)

class StructureComponentUpdate(BaseModel):
    amount_or_formula: str

    @field_validator("amount_or_formula", mode="before")
    @classmethod
    def _v_amount(cls, v):
        return clean_structure_amount(v)

class StructureComponentResponse(BaseModel):
    # reading never re-checks, so a row saved before these rules still lists
    id: int
    structure_id: int
    component_id: int
    amount_or_formula: str
    component_name: Optional[str] = None
    component_type: Optional[str] = None
    default_amount: Optional[Decimal] = None
    created_at: datetime
    updated_at: Optional[datetime]
    model_config = {"from_attributes": True}




class SalaryRevisionCreate(BaseModel):
    employee_compensation_id: int
    old_salary: Optional[Decimal] = None
    new_salary: Decimal
    effective_date: date
    reason: Optional[str] = None

class SalaryRevisionUpdate(BaseModel):
    old_salary: Optional[Decimal] = None
    new_salary: Optional[Decimal] = None
    effective_date: Optional[date] = None
    reason: Optional[str] = None


class SalaryRevisionResponse(SalaryRevisionCreate):
    id: int
    created_at: datetime
    updated_at: Optional[datetime]
    model_config = {"from_attributes": True}

class _AllowanceChecks(BaseModel):
    """The employee must be chosen (the service then confirms they belong to this organization); the rest is checked here."""
    @field_validator("employee_id", mode="before", check_fields=False)
    @classmethod
    def _v_employee(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            raise ValueError("Choose the employee this allowance is for.")
        try:
            n = int(v)
        except (TypeError, ValueError):
            raise ValueError("Choose the employee this allowance is for.")
        if n < 1:
            raise ValueError("Choose the employee this allowance is for.")
        return n

    @field_validator("allowance_type", mode="before", check_fields=False)
    @classmethod
    def _v_type(cls, v):
        return _course_text("Allowance type", 100)(v)

    @field_validator("amount", mode="before", check_fields=False)
    @classmethod
    def _v_amount(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            raise ValueError("Amount is required.")
        try:
            n = Decimal(str(v).strip())
        except Exception:
            raise ValueError("Amount must be a number.")
        if not n.is_finite():
            raise ValueError("Amount must be a number.")
        if n <= 0:
            raise ValueError("Amount must be greater than 0.")
        if n > Decimal("99999999.99"):
            raise ValueError("Amount is too large (the most is 99,999,999.99).")
        if n != n.quantize(Decimal("0.01")):
            raise ValueError("Amount can have at most 2 decimal places.")
        return n

    @field_validator("effective_date", mode="before", check_fields=False)
    @classmethod
    def _v_date_required(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            raise ValueError("Effective date is required.")
        return v

    @field_validator("effective_date", check_fields=False)
    @classmethod
    def _v_date_range(cls, v):
        if v is not None and not (2000 <= v.year <= 2100):
            raise ValueError("Enter a date between the years 2000 and 2100.")
        return v


class AllowanceCreate(_AllowanceChecks):
    employee_id: int
    allowance_type: str
    amount: Decimal
    effective_date: _date_type


class AllowanceUpdate(_AllowanceChecks):
    """Fields left out stay as they are; a field that is sent must still be filled in."""
    employee_id: Optional[int] = None
    allowance_type: Optional[str] = None
    amount: Optional[Decimal] = None
    effective_date: Optional[_date_type] = None


class AllowanceResponse(BaseModel):
    # reading never re-checks, so a record saved before these rules is still listed
    id: int
    employee_id: int
    employee_name: Optional[str] = None
    allowance_type: str
    amount: Decimal
    effective_date: date
    created_at: datetime
    updated_at: Optional[datetime]
    model_config = {"from_attributes": True}


class BenefitCreate(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: bool = True

class BenefitUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class BenefitResponse(BenefitCreate):
    id: int
    created_at: datetime
    updated_at: Optional[datetime]
    model_config = {"from_attributes": True}




class ComplianceRecordCreate(BaseModel):
    employee_id: int
    policy_name: str
    status: RequestStatus = RequestStatus.PENDING
    notes: Optional[str] = None


class ComplianceRecordResponse(BaseModel):
    id: int
    employee_id: int
    policy_name: str
    status: RequestStatus
    completed_at: Optional[datetime]
    notes: Optional[str]
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


class EngagementSurveyCreate(BaseModel):
    employee_id: int
    survey_name: str
    score: int
    comments: Optional[str] = None


class EngagementSurveyResponse(BaseModel):
    id: int
    employee_id: int
    survey_name: str
    score: int
    comments: Optional[str]
    completed_at: Optional[datetime]
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


class EssRequestCreate(BaseModel):
    employee_id: int
    request_type: str
    description: Optional[str] = None


class EssRequestUpdate(BaseModel):
    status: Optional[str] = None
    request_type: Optional[str] = None
    description: Optional[str] = None


class EssRequestResponse(BaseModel):
    id: int
    employee_id: int
    request_type: str
    description: Optional[str]
    status: RequestStatus
    created_at: Optional[datetime]
    resolved_at: Optional[datetime]

    model_config = {"from_attributes": True}


COURSE_TYPES = ("online", "in_person", "hybrid", "self_paced")
COURSE_STATUSES = ("active", "inactive")


def _course_text(label, max_len):
    def check(v):
        text = " ".join(str(v).split()) if v is not None else ""
        if not text:
            raise ValueError(f"{label} is required.")
        if len(text) > max_len:
            raise ValueError(f"{label} can be at most {max_len} characters.")
        return text
    return check


class _CourseChecks(BaseModel):
    """What a learner needs to see before choosing a course is required, in the same words for adding and editing."""
    @field_validator("course_name", mode="before", check_fields=False)
    @classmethod
    def _v_name(cls, v):
        return _course_text("Course name", 200)(v)

    @field_validator("description", mode="before", check_fields=False)
    @classmethod
    def _v_description(cls, v):
        text = str(v).strip() if v is not None else ""
        if not text:
            raise ValueError("Description is required, so learners know what the course covers.")
        if len(text) > 5000:
            raise ValueError("Description can be at most 5000 characters.")
        return text

    @field_validator("category", mode="before", check_fields=False)
    @classmethod
    def _v_category(cls, v):
        return _course_text("Category", 100)(v)

    @field_validator("provider", mode="before", check_fields=False)
    @classmethod
    def _v_provider(cls, v):
        return _course_text("Provider", 150)(v)

    @field_validator("course_type", mode="before", check_fields=False)
    @classmethod
    def _v_type(cls, v):
        text = str(v).strip().lower() if v is not None else ""
        if not text:
            raise ValueError("Course type is required.")
        if text not in COURSE_TYPES:
            raise ValueError("Course type must be online, in person, hybrid or self paced.")
        return text

    @field_validator("duration_hours", mode="before", check_fields=False)
    @classmethod
    def _v_duration(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            raise ValueError("Duration is required.")
        try:
            n = float(v)
        except (TypeError, ValueError):
            raise ValueError("Duration must be a whole number of hours.")
        if n != int(n):
            raise ValueError("Duration must be a whole number of hours.")
        if not 1 <= int(n) <= 1000:
            raise ValueError("Duration must be between 1 and 1000 hours.")
        return int(n)

    @field_validator("department", mode="before", check_fields=False)
    @classmethod
    def _v_department(cls, v):
        text = " ".join(str(v).split()) if v is not None else ""
        if not text:
            return None
        if len(text) > 100:
            raise ValueError("Department can be at most 100 characters.")
        return text

    @field_validator("resource_link", mode="before", check_fields=False)
    @classmethod
    def _v_link(cls, v):
        text = str(v).strip() if v is not None else ""
        if not text:
            return None
        if len(text) > 500:
            raise ValueError("The resource link can be at most 500 characters.")
        if not re.match(r"^https?://[^\s/]+\.[^\s/]+\S*$", text, re.IGNORECASE):
            raise ValueError("Enter a valid link starting with http:// or https://.")
        return text

    @field_validator("status", mode="before", check_fields=False)
    @classmethod
    def _v_status(cls, v):
        text = str(v).strip().lower() if v is not None else ""
        if text not in COURSE_STATUSES:
            raise ValueError("Status must be active or inactive.")
        return text


class CourseCreate(_CourseChecks):
    course_name: str
    description: str
    course_type: str
    category: str
    provider: str
    duration_hours: int
    department: Optional[str] = None
    resource_link: Optional[str] = None
    cost: Optional[Decimal] = Field(None, ge=0)
    status: str = "active"


class CourseUpdate(_CourseChecks):
    """Fields left out stay as they are; a field that is sent must still be filled in, so an edit can never blank a
    detail that learners rely on."""
    course_name: Optional[str] = None
    description: Optional[str] = None
    course_type: Optional[str] = None
    category: Optional[str] = None
    provider: Optional[str] = None
    duration_hours: Optional[int] = None
    department: Optional[str] = None
    resource_link: Optional[str] = None
    cost: Optional[Decimal] = Field(None, ge=0)
    status: Optional[str] = None


class CourseResponse(BaseModel):
    id: int
    course_name: str
    description: Optional[str]
    course_type: Optional[str]
    category: Optional[str]
    provider: Optional[str]
    department: Optional[str] = None
    resource_link: Optional[str] = None
    duration_hours: Optional[int]
    cost: Optional[Decimal]
    status: str
    created_by: Optional[int]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class CourseListResponse(BaseModel):
    total: int
    page: int
    per_page: int
    items: list[CourseResponse]


class EnrollmentCreate(BaseModel):
    course_id: int
    employee_id: int
    notes: Optional[str] = None


class EnrollmentUpdate(BaseModel):
    status: Optional[str] = None
    progress_pct: Optional[int] = Field(None, ge=0, le=100)
    score: Optional[int] = Field(None, ge=0, le=100)
    notes: Optional[str] = None


class EnrollmentResponse(BaseModel):
    id: int
    course_id: int
    employee_id: int
    status: str
    progress_pct: int
    enrolled_at: Optional[datetime]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    score: Optional[int]
    notes: Optional[str]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    course_name: Optional[str] = None
    employee_name: Optional[str] = None

    model_config = {"from_attributes": True}


class LearningPathCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None


class LearningPathUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    is_active: Optional[bool] = None


class LearningPathItemCreate(BaseModel):
    course_id: int
    sort_order: int = 0
    is_required: bool = False


class LearningPathItemResponse(BaseModel):
    id: int
    path_id: int
    course_id: int
    sort_order: int
    is_required: bool
    course_name: Optional[str] = None

    model_config = {"from_attributes": True}


class LearningPathResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    created_by: Optional[int]
    is_active: bool
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    items: list[LearningPathItemResponse] = []

    model_config = {"from_attributes": True}


class CertificationCreate(BaseModel):
    employee_id: int
    certification_name: str = Field(..., min_length=1, max_length=200)
    issuing_organization: Optional[str] = Field(None, max_length=200)
    issue_date: date
    expiry_date: Optional[date] = None
    credential_url: Optional[str] = Field(None, max_length=500)
    status: str = "active"
    created_by: Optional[int] = None


class CertificationUpdate(BaseModel):
    certification_name: Optional[str] = Field(None, min_length=1, max_length=200)
    issuing_organization: Optional[str] = None
    issue_date: Optional[date] = None
    expiry_date: Optional[date] = None
    credential_url: Optional[str] = None
    status: Optional[str] = None


class CertificationResponse(BaseModel):
    id: int
    employee_id: int
    certification_name: str
    issuing_organization: Optional[str]
    issue_date: date
    expiry_date: Optional[date]
    credential_url: Optional[str]
    status: str
    created_by: Optional[int]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class SkillCreate(BaseModel):
    employee_id: int
    skill_name: str = Field(..., min_length=1, max_length=200)
    category: Optional[str] = Field(None, max_length=100)
    proficiency_level: int = Field(default=3, ge=1, le=5)


class SkillUpdate(BaseModel):
    skill_name: Optional[str] = Field(None, min_length=1, max_length=200)
    category: Optional[str] = None
    proficiency_level: Optional[int] = Field(None, ge=1, le=5)


class SkillResponse(BaseModel):
    id: int
    employee_id: int
    skill_name: str
    category: Optional[str]
    proficiency_level: int
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


QUESTION_TYPES = ("multiple_choice", "true_false", "short_answer", "essay")


def _whole(label, v, low, high, required=True, what=None):
    if v is None or (isinstance(v, str) and not v.strip()):
        if required:
            raise ValueError(f"{label} is required.")
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        raise ValueError(f"{label} must be a whole number.")
    if n != int(n):
        raise ValueError(f"{label} must be a whole number.")
    if not low <= int(n) <= high:
        raise ValueError(f"{label} must be between {low} and {high}{what or ''}.")
    return int(n)


class _AssessmentChecks(BaseModel):
    """The passing score is never filled in for the person: it has to be entered, as a percentage from 1 to 100."""
    @field_validator("title", mode="before", check_fields=False)
    @classmethod
    def _v_title(cls, v):
        return _course_text("Title", 200)(v)

    @field_validator("description", mode="before", check_fields=False)
    @classmethod
    def _v_description(cls, v):
        text = str(v).strip() if v is not None else ""
        if not text:
            raise ValueError("Description is required, so learners know what the assessment covers.")
        if len(text) > 5000:
            raise ValueError("Description can be at most 5000 characters.")
        return text

    @field_validator("passing_score", mode="before", check_fields=False)
    @classmethod
    def _v_passing(cls, v):
        return _whole("Passing score", v, 1, 100, what=" percent")

    @field_validator("max_attempts", mode="before", check_fields=False)
    @classmethod
    def _v_attempts(cls, v):
        return _whole("Maximum attempts", v, 1, 100, required=False)

    @field_validator("duration_minutes", mode="before", check_fields=False)
    @classmethod
    def _v_duration(cls, v):
        return _whole("Duration", v, 1, 600, required=False, what=" minutes")

    @field_validator("resource_link", mode="before", check_fields=False)
    @classmethod
    def _v_link(cls, v):
        text = str(v).strip() if v is not None else ""
        if not text:
            return None
        if len(text) > 500:
            raise ValueError("The resource link can be at most 500 characters.")
        if not re.match(r"^https?://[^\s/]+\.[^\s/]+\S*$", text, re.IGNORECASE):
            raise ValueError("Enter a valid link starting with http:// or https://.")
        return text


class AssessmentCreate(_AssessmentChecks):
    course_id: int
    title: str
    description: str
    passing_score: int
    max_attempts: Optional[int] = None
    duration_minutes: Optional[int] = None
    resource_link: Optional[str] = None


class AssessmentUpdate(_AssessmentChecks):
    """Fields left out stay as they are; a field that is sent must still be filled in."""
    course_id: Optional[int] = None
    title: Optional[str] = None
    description: Optional[str] = None
    passing_score: Optional[int] = None
    max_attempts: Optional[int] = None
    duration_minutes: Optional[int] = None
    resource_link: Optional[str] = None
    is_active: Optional[bool] = None


class AssessmentResponse(BaseModel):
    id: int
    course_id: int
    course_name: Optional[str] = None
    title: str
    description: Optional[str]
    passing_score: Optional[int]
    max_attempts: Optional[int]
    duration_minutes: Optional[int]
    resource_link: Optional[str] = None
    is_active: bool
    questions_count: int = 0
    attempts_count: int = 0
    created_by: Optional[int]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


def normalize_question(question_type, options, correct_answer):
    """Checks a question hangs together and returns (options, correct_answer) in their stored form."""
    qtype = str(question_type or "").strip().lower()
    if qtype not in QUESTION_TYPES:
        raise ValueError("Question type must be multiple choice, true/false, short answer or essay.")
    if isinstance(options, str):
        options = options.split(",")
    opts = []
    for o in options or []:
        t = " ".join(str(o).split())
        if t and t.lower() not in [x.lower() for x in opts]:
            opts.append(t)
    answer = " ".join(str(correct_answer).split()) if correct_answer is not None else ""
    if qtype == "multiple_choice":
        if len(opts) < 2:
            raise ValueError("A multiple choice question needs at least two different options.")
        if not answer:
            raise ValueError("Choose the correct answer.")
        match = next((o for o in opts if o.lower() == answer.lower()), None)
        if match is None:
            raise ValueError("The correct answer must be one of the options.")
        return opts, match
    if qtype == "true_false":
        if answer.lower() not in ("true", "false"):
            raise ValueError("The correct answer must be True or False.")
        return None, answer.capitalize()
    if qtype == "short_answer":
        if not answer:
            raise ValueError("Enter the correct answer, so the quiz can be marked.")
        return None, answer
    return None, None    # essay: marked by a person


class QuestionCreate(BaseModel):
    question_text: str
    question_type: str = "multiple_choice"
    options: Optional[list[str]] = None
    correct_answer: Optional[str] = None
    points: int
    sort_order: Optional[int] = None

    @field_validator("question_text", mode="before")
    @classmethod
    def _v_text(cls, v):
        return _course_text("Question text", 2000)(v)

    @field_validator("points", mode="before")
    @classmethod
    def _v_points(cls, v):
        return _whole("Points", v, 1, 100)

    @field_validator("options", mode="before")
    @classmethod
    def _v_options_in(cls, v):
        if isinstance(v, str):
            return [o for o in v.split(",")]
        return v

    @model_validator(mode="after")
    def _v_consistent(self):
        self.options, self.correct_answer = normalize_question(self.question_type, self.options, self.correct_answer)
        self.question_type = str(self.question_type).strip().lower()
        return self


class QuestionUpdate(BaseModel):
    """Whatever is sent is merged with the saved question and the whole question is checked again by the service."""
    question_text: Optional[str] = None
    question_type: Optional[str] = None
    options: Optional[list[str]] = None
    correct_answer: Optional[str] = None
    points: Optional[int] = None
    sort_order: Optional[int] = None

    @field_validator("question_text", mode="before")
    @classmethod
    def _v_text(cls, v):
        return _course_text("Question text", 2000)(v)

    @field_validator("points", mode="before")
    @classmethod
    def _v_points(cls, v):
        return _whole("Points", v, 1, 100)

    @field_validator("options", mode="before")
    @classmethod
    def _v_options_in(cls, v):
        if isinstance(v, str):
            return [o for o in v.split(",")]
        return v


class QuestionResponse(BaseModel):
    id: int
    assessment_id: int
    question_text: str
    question_type: str
    options: Optional[list[str]] = None
    correct_answer: Optional[str] = None
    points: int
    sort_order: int
    created_at: Optional[datetime]

    @field_validator("options", mode="before")
    @classmethod
    def _v_options_out(cls, v):
        if v is None or isinstance(v, list):
            return v
        if isinstance(v, str):
            try:
                import json as _json
                parsed = _json.loads(v)
                if isinstance(parsed, list):
                    return [str(x) for x in parsed]
            except ValueError:
                pass
            return [o.strip() for o in v.split(",") if o.strip()]
        return None

    model_config = {"from_attributes": True}


class QuizAttemptStart(BaseModel):
    assessment_id: int
    employee_id: int
    enrollment_id: Optional[int] = None


class QuizAttemptSubmit(BaseModel):
    answers: str


class QuizAttemptResponse(BaseModel):
    id: int
    assessment_id: int
    employee_id: int
    employee_name: Optional[str] = None
    enrollment_id: Optional[int]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    score: Optional[int]
    passed: Optional[bool]
    answers: Optional[str]
    attempt_number: int
    status: str
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


PROGRAM_STATUSES = ("planned", "active", "completed", "cancelled")


class _ProgramChecks(BaseModel):
    """What a learner needs to see before joining a program is required, in the same words for adding and editing."""
    @field_validator("name", mode="before", check_fields=False)
    @classmethod
    def _v_name(cls, v):
        return _course_text("Program name", 200)(v)

    @field_validator("description", mode="before", check_fields=False)
    @classmethod
    def _v_description(cls, v):
        text = str(v).strip() if v is not None else ""
        if not text:
            raise ValueError("Description is required, so learners know what the program covers.")
        if len(text) > 5000:
            raise ValueError("Description can be at most 5000 characters.")
        return text

    @field_validator("instructor_id", mode="before", check_fields=False)
    @classmethod
    def _v_instructor(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            raise ValueError("Choose the instructor who will run the program.")
        try:
            n = int(v)
        except (TypeError, ValueError):
            raise ValueError("Choose the instructor who will run the program.")
        if n < 1:
            raise ValueError("Choose the instructor who will run the program.")
        return n

    @field_validator("start_date", mode="before", check_fields=False)
    @classmethod
    def _v_start(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            raise ValueError("Start date is required.")
        return v

    @field_validator("end_date", mode="before", check_fields=False)
    @classmethod
    def _v_end(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            raise ValueError("End date is required.")
        return v

    @field_validator("start_date", "end_date", check_fields=False)
    @classmethod
    def _v_year(cls, v):
        if v is not None and not (2000 <= v.year <= 2100):
            raise ValueError("Enter a date between the years 2000 and 2100.")
        return v

    @field_validator("max_participants", mode="before", check_fields=False)
    @classmethod
    def _v_capacity(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            raise ValueError("Maximum participants is required.")
        try:
            n = float(v)
        except (TypeError, ValueError):
            raise ValueError("Maximum participants must be a whole number.")
        if n != int(n):
            raise ValueError("Maximum participants must be a whole number.")
        if not 1 <= int(n) <= 10000:
            raise ValueError("Maximum participants must be between 1 and 10000.")
        return int(n)

    @field_validator("department", mode="before", check_fields=False)
    @classmethod
    def _v_department(cls, v):
        text = " ".join(str(v).split()) if v is not None else ""
        if not text:
            return None
        if len(text) > 100:
            raise ValueError("Department can be at most 100 characters.")
        return text

    @field_validator("resource_link", mode="before", check_fields=False)
    @classmethod
    def _v_link(cls, v):
        text = str(v).strip() if v is not None else ""
        if not text:
            return None
        if len(text) > 500:
            raise ValueError("The resource link can be at most 500 characters.")
        if not re.match(r"^https?://[^\s/]+\.[^\s/]+\S*$", text, re.IGNORECASE):
            raise ValueError("Enter a valid link starting with http:// or https://.")
        return text

    @field_validator("status", mode="before", check_fields=False)
    @classmethod
    def _v_status(cls, v):
        text = str(v).strip().lower() if v is not None else ""
        if text not in PROGRAM_STATUSES:
            raise ValueError("Status must be planned, active, completed or cancelled.")
        return text

    @model_validator(mode="after")
    def _v_order(self):
        start, end = getattr(self, "start_date", None), getattr(self, "end_date", None)
        if start and end and end < start:
            raise ValueError("The end date cannot be before the start date.")
        return self


class TrainingProgramCreate(_ProgramChecks):
    name: str
    description: str
    instructor_id: int
    start_date: _date_type
    end_date: _date_type
    max_participants: int
    department: Optional[str] = None
    resource_link: Optional[str] = None
    status: str = "planned"


class TrainingProgramUpdate(_ProgramChecks):
    """Fields left out stay as they are; a field that is sent must still be filled in."""
    name: Optional[str] = None
    description: Optional[str] = None
    instructor_id: Optional[int] = None
    start_date: Optional[_date_type] = None
    end_date: Optional[_date_type] = None
    max_participants: Optional[int] = None
    department: Optional[str] = None
    resource_link: Optional[str] = None
    status: Optional[str] = None


class TrainingProgramResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    instructor_id: Optional[int]
    instructor_name: Optional[str] = None
    department: Optional[str] = None
    resource_link: Optional[str] = None
    start_date: Optional[date]
    end_date: Optional[date]
    status: str
    max_participants: Optional[int]
    participants_count: int = 0
    created_by: Optional[int]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class ProgramAssignmentCreate(BaseModel):
    program_id: int
    employee_id: int


class ProgramAssignmentUpdate(BaseModel):
    status: Optional[str] = None
    attended_at: Optional[datetime] = None


class ProgramAssignmentResponse(BaseModel):
    id: int
    program_id: int
    employee_id: int
    status: str
    attended_at: Optional[datetime]
    created_at: Optional[datetime]
    employee_name: Optional[str] = None

    model_config = {"from_attributes": True}


class CalendarEventCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    event_date: date
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    event_type: str = "session"
    course_id: Optional[int] = None
    program_id: Optional[int] = None
    location: Optional[str] = Field(None, max_length=200)


class CalendarEventUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    event_date: Optional[date] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    event_type: Optional[str] = None
    course_id: Optional[int] = None
    program_id: Optional[int] = None
    location: Optional[str] = None


class CalendarEventResponse(BaseModel):
    id: int
    title: str
    description: Optional[str]
    event_date: date
    start_time: Optional[datetime]
    end_time: Optional[datetime]
    event_type: str
    course_id: Optional[int]
    program_id: Optional[int]
    location: Optional[str]
    created_by: Optional[int]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class LearningDashboardResponse(BaseModel):
    total_courses: int = 0
    active_courses: int = 0
    total_enrollments: int = 0
    completed_enrollments: int = 0
    completion_rate: float = 0.0
    total_certifications: int = 0
    total_skills: int = 0
    avg_skill_level: float = 0.0
    pending_assessments: int = 0
    upcoming_events: int = 0
    enrollment_trend: list[dict] = []
    category_distribution: list[dict] = []
    recent_enrollments: list[dict] = []


class OnboardingNewHireCreate(BaseModel):
    candidate_name: str = Field(..., min_length=1, max_length=150)
    email: EmailStr
    phone: Optional[str] = None
    position: str = Field(..., min_length=1, max_length=150)
    department_id: Optional[int] = None
    manager_id: Optional[int] = None
    joining_date: Optional[date] = None
    notes: Optional[str] = None
    status: Optional[str] = "offer_sent"
    joining_status: Optional[str] = "not_joined"
    tenant_id: Optional[str] = None

class OnboardingNewHireUpdate(BaseModel):
    candidate_name: Optional[str] = Field(None, min_length=1, max_length=150)
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    position: Optional[str] = Field(None, min_length=1, max_length=150)
    department_id: Optional[int] = None
    manager_id: Optional[int] = None
    joining_date: Optional[date] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    joining_status: Optional[str] = None
    employee_id: Optional[int] = None
    tenant_id: Optional[str] = None

class OnboardingNewHireResponse(BaseModel):
    id: int
    employee_id: Optional[int] = None
    candidate_name: str
    email: str
    phone: Optional[str] = None
    position: str
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    manager_id: Optional[int] = None
    manager_name: Optional[str] = None
    joining_date: Optional[date] = None
    status: str
    joining_status: str
    notes: Optional[str] = None
    tenant_id: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    temp_password: Optional[str] = None

    model_config = {"from_attributes": True}

class OnboardingPreboardingTaskCreate(BaseModel):
    onboarding_new_hire_id: Optional[int] = None
    employee_id: Optional[int] = None
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    due_date: Optional[date] = None
    tenant_id: Optional[str] = None

class OnboardingPreboardingTaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    due_date: Optional[date] = None
    completed: Optional[bool] = None
    tenant_id: Optional[str] = None

class OnboardingPreboardingTaskResponse(BaseModel):
    id: int
    onboarding_new_hire_id: Optional[int] = None
    employee_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    due_date: Optional[date] = None
    completed: bool
    completed_at: Optional[datetime] = None
    tenant_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

class OnboardingDocumentCreate(BaseModel):
    onboarding_new_hire_id: Optional[int] = None
    title: str = Field(..., min_length=1, max_length=200)
    category: str = Field(..., min_length=1, max_length=100)
    tenant_id: Optional[str] = None

class OnboardingDocumentUpdate(BaseModel):
    status: Optional[str] = None
    rejection_reason: Optional[str] = Field(None, max_length=1000)
    title: Optional[str] = Field(None, max_length=200)
    category: Optional[str] = Field(None, max_length=100)
    tenant_id: Optional[str] = None

    @field_validator("status")
    @classmethod
    def _v_status(cls, v):
        if v is None:
            return v
        v = str(v).strip().lower()
        if v not in ("pending", "approved", "rejected"):
            raise ValueError("Status must be pending, approved or rejected.")
        return v

    @field_validator("title")
    @classmethod
    def _v_title(cls, v):
        if v is None:
            return v
        v = " ".join(v.split())
        if not v:
            raise ValueError("Title is required.")
        return v

    @field_validator("rejection_reason")
    @classmethod
    def _v_reason(cls, v):
        return (v or "").strip() or None

class OnboardingDocumentResponse(BaseModel):
    id: int
    onboarding_new_hire_id: Optional[int] = None
    title: str
    category: str
    file_path: Optional[str] = None
    file_url: Optional[str] = None
    status: str
    rejection_reason: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

class OnboardingChecklistItemCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    due_date: Optional[date] = None

class OnboardingChecklistCreate(BaseModel):
    onboarding_new_hire_id: Optional[int] = None
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    category: Optional[str] = "HR"
    items: Optional[list[OnboardingChecklistItemCreate]] = []
    tenant_id: Optional[str] = None

class OnboardingChecklistItemUpdate(BaseModel):
    id: Optional[int] = None
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    completed: bool = False
    due_date: Optional[date] = None

class OnboardingChecklistUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None
    items: Optional[list[OnboardingChecklistItemUpdate]] = None
    tenant_id: Optional[str] = None

class OnboardingChecklistItemResponse(BaseModel):
    id: int
    checklist_id: int
    title: str
    description: Optional[str] = None
    completed: bool
    completed_at: Optional[datetime] = None
    due_date: Optional[date] = None

    model_config = {"from_attributes": True}

class OnboardingChecklistResponse(BaseModel):
    id: int
    onboarding_new_hire_id: Optional[int] = None
    template_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    category: str
    status: str
    tenant_id: Optional[str] = None
    items: list[OnboardingChecklistItemResponse] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

class OnboardingChecklistAssignmentCreate(BaseModel):
    onboarding_record_id: int
    template_id: int

_ORIENTATION_STATUSES = ("scheduled", "completed", "cancelled")


def _orientation_text(label, required, max_len):
    def check(v):
        text = " ".join(str(v).split()) if v is not None else ""
        if not text:
            if required:
                raise ValueError(f"{label} is required.")
            return None
        if len(text) > max_len:
            raise ValueError(f"{label} can be at most {max_len} characters.")
        return text
    return check


def _orientation_date(v):
    if v is None:
        return v
    if not (2000 <= v.year <= 2100):
        raise ValueError("Enter a date between the years 2000 and 2100.")
    return v


def _orientation_time(v):
    text = "" if v is None else str(v).strip()
    if not text:
        return None
    if not re.match(r"^([01]\d|2[0-3]):[0-5]\d$", text):
        raise ValueError("Enter the time as HH:MM, for example 10:30.")
    return text


def _orientation_link(v):
    text = "" if v is None else str(v).strip()
    if not text:
        return None
    if len(text) > 500:
        raise ValueError("The meeting link can be at most 500 characters.")
    if not re.match(r"^https?://[^\s/]+\.[^\s/]+\S*$", text, re.IGNORECASE):
        raise ValueError("Enter a valid link starting with http:// or https://.")
    return text


def _orientation_status(v):
    if v is None:
        return v
    v = str(v).strip().lower()
    if v not in _ORIENTATION_STATUSES:
        raise ValueError("Status must be scheduled, completed or cancelled.")
    return v


class _OrientationChecks(BaseModel):
    """Checks shared by creating and editing a session; each message is written for the person filling the form."""
    @field_validator("title", mode="before", check_fields=False)
    @classmethod
    def _v_title(cls, v):
        return _orientation_text("Title", True, 200)(v)

    @field_validator("date", check_fields=False)
    @classmethod
    def _v_date(cls, v):
        return _orientation_date(v)

    @field_validator("time", mode="before", check_fields=False)
    @classmethod
    def _v_time(cls, v):
        return _orientation_time(v)

    @field_validator("location", mode="before", check_fields=False)
    @classmethod
    def _v_location(cls, v):
        return _orientation_text("Location", False, 200)(v)

    @field_validator("presenter", mode="before", check_fields=False)
    @classmethod
    def _v_presenter(cls, v):
        return _orientation_text("Presenter", False, 200)(v)

    @field_validator("meeting_link", mode="before", check_fields=False)
    @classmethod
    def _v_link(cls, v):
        return _orientation_link(v)

    @field_validator("status", mode="before", check_fields=False)
    @classmethod
    def _v_status(cls, v):
        return _orientation_status(v)


class OnboardingOrientationCreate(_OrientationChecks):
    title: str
    date: _date_type
    time: Optional[str] = None
    location: Optional[str] = None
    meeting_link: Optional[str] = None
    presenter: Optional[str] = None
    status: Optional[str] = "scheduled"
    tenant_id: Optional[str] = None


class OnboardingOrientationUpdate(_OrientationChecks):
    title: Optional[str] = None
    date: Optional[_date_type] = None
    time: Optional[str] = None
    location: Optional[str] = None
    meeting_link: Optional[str] = None
    presenter: Optional[str] = None
    status: Optional[str] = None
    tenant_id: Optional[str] = None

class OnboardingOrientationAttendeeCreate(BaseModel):
    session_id: int
    onboarding_record_id: int
    status: Optional[str] = "pending"

class OnboardingOrientationAttendeeUpdate(BaseModel):
    status: str

class OnboardingOrientationAttendeeResponse(BaseModel):
    id: int
    session_id: int
    onboarding_new_hire_id: int
    status: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

class OnboardingOrientationResponse(BaseModel):
    id: int
    title: str
    date: date
    time: Optional[str] = None
    location: Optional[str] = None
    meeting_link: Optional[str] = None
    presenter: Optional[str] = None
    status: str
    tenant_id: Optional[str] = None
    attendees: list[OnboardingOrientationAttendeeResponse] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

class OnboardingActivityResponse(BaseModel):
    id: int
    onboarding_new_hire_id: Optional[int] = None
    action: str
    description: str
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

class OnboardingDashboardResponse(BaseModel):
    totalNewHires: int
    pendingOnboarding: int
    completedOnboarding: int
    documentsPending: int
    checklistsPending: int = 0
    assetsPending: Optional[int] = None
    orientationPending: int
    trainingPending: Optional[int] = None
    monthlyJoiningTrend: list[dict]
    departmentWise: list[dict]
    completionStatus: dict
    upcomingJoiners: list[dict]
    recentActivities: list[dict]

class OnboardingAnalyticsResponse(BaseModel):
    totalNewHires: int
    completionRate: float
    avgDaysToOnboard: float
    statusDistribution: list[dict]
    departmentDistribution: list[dict]


class PerformanceGoalCreate(BaseModel):
    employee_id: int
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    goal_type: Optional[str] = "okr"
    quarter: Optional[str] = None
    year: Optional[int] = None
    progress: Optional[int] = 0
    status: Optional[str] = "not_started"
    due_date: Optional[date] = None


class PerformanceGoalUpdate(BaseModel):
    employee_id: Optional[int] = None
    title: Optional[str] = None
    description: Optional[str] = None
    goal_type: Optional[str] = None
    quarter: Optional[str] = None
    year: Optional[int] = None
    progress: Optional[int] = None
    status: Optional[str] = None
    due_date: Optional[date] = None


class PerformanceGoalResponse(BaseModel):
    id: int
    employee_id: int
    title: str
    description: Optional[str]
    goal_type: Optional[str]
    quarter: Optional[str]
    year: Optional[int]
    progress: int
    status: str
    due_date: Optional[date]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class PerformanceKpiCreate(BaseModel):
    employee_id: int
    goal_id: Optional[int] = None
    name: str = Field(..., min_length=1, max_length=255)
    target_value: Optional[float] = None
    actual_value: Optional[float] = None
    unit: Optional[str] = None
    weight: Optional[float] = 1.0
    period: Optional[str] = None


class PerformanceKpiUpdate(BaseModel):
    name: Optional[str] = None
    target_value: Optional[float] = None
    actual_value: Optional[float] = None
    unit: Optional[str] = None
    weight: Optional[float] = None
    period: Optional[str] = None


class PerformanceKpiResponse(BaseModel):
    id: int
    employee_id: int
    goal_id: Optional[int]
    name: str
    target_value: Optional[float]
    actual_value: Optional[float]
    unit: Optional[str]
    weight: float
    period: Optional[str]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class PerformanceFeedbackCreate(BaseModel):
    employee_id: int
    reviewer_id: Optional[int] = None
    review_id: Optional[int] = None
    feedback_type: Optional[str] = "peer"
    rating: Optional[int] = None
    comments: Optional[str] = None
    strengths: Optional[str] = None
    improvements: Optional[str] = None


class PerformanceFeedbackResponse(BaseModel):
    id: int
    employee_id: int
    reviewer_id: Optional[int]
    review_id: Optional[int]
    feedback_type: str
    rating: Optional[int]
    comments: Optional[str]
    strengths: Optional[str]
    improvements: Optional[str]
    submitted_at: Optional[datetime]

    model_config = {"from_attributes": True}


_APPRAISAL_STATUSES = ("draft", "submitted", "approved", "rejected")
_APPRAISAL_RECOMMENDATIONS = ("promotion", "bonus", "promotion_bonus", "improvement_plan")


def _appraisal_cycle(v):
    from app.core.appraisal_period import normalize_appraisal_period
    return normalize_appraisal_period(v)


def _appraisal_status(v):
    if v is None:
        return v
    v = str(v).strip().lower()
    if v not in _APPRAISAL_STATUSES:
        raise ValueError("Status must be draft, submitted, approved or rejected.")
    return v


def _appraisal_recommendation(v):
    if v is None or str(v).strip() == "":
        return None
    v = str(v).strip().lower()
    if v not in _APPRAISAL_RECOMMENDATIONS:
        raise ValueError("Recommendation must be promotion, bonus, promotion_bonus or improvement_plan.")
    return v


class AppraisalCreate(BaseModel):
    employee_id: int
    reviewer_id: Optional[int] = None
    hr_reviewer_id: Optional[int] = None
    admin_reviewer_id: Optional[int] = None
    cycle: str = Field(..., max_length=50)
    self_score: Optional[float] = Field(None, ge=0, le=5)
    manager_score: Optional[float] = Field(None, ge=0, le=5)
    final_score: Optional[float] = Field(None, ge=0, le=5)
    recommendation: Optional[str] = None
    salary_hike: Optional[float] = Field(None, ge=0, le=100)
    comments: Optional[str] = Field(None, max_length=5000)
    status: Optional[str] = "draft"

    _v_cycle = field_validator("cycle", mode="before")(lambda cls, v: _appraisal_cycle(v))
    _v_status = field_validator("status")(lambda cls, v: _appraisal_status(v) or "draft")
    _v_rec = field_validator("recommendation", mode="before")(lambda cls, v: _appraisal_recommendation(v))


class AppraisalUpdate(BaseModel):
    employee_id: Optional[int] = None
    reviewer_id: Optional[int] = None
    hr_reviewer_id: Optional[int] = None
    admin_reviewer_id: Optional[int] = None
    cycle: Optional[str] = Field(None, max_length=50)
    self_score: Optional[float] = Field(None, ge=0, le=5)
    manager_score: Optional[float] = Field(None, ge=0, le=5)
    final_score: Optional[float] = Field(None, ge=0, le=5)
    recommendation: Optional[str] = None
    salary_hike: Optional[float] = Field(None, ge=0, le=100)
    comments: Optional[str] = Field(None, max_length=5000)
    status: Optional[str] = None

    _v_cycle = field_validator("cycle", mode="before")(lambda cls, v: None if v is None else _appraisal_cycle(v))
    _v_status = field_validator("status")(lambda cls, v: _appraisal_status(v))
    _v_rec = field_validator("recommendation", mode="before")(lambda cls, v: _appraisal_recommendation(v))


class AppraisalResponse(BaseModel):
    id: int
    employee_id: int
    reviewer_id: Optional[int]
    hr_reviewer_id: Optional[int] = None
    admin_reviewer_id: Optional[int] = None
    cycle: str
    self_score: Optional[float]
    manager_score: Optional[float]
    final_score: Optional[float]
    recommendation: Optional[str]
    salary_hike: Optional[float]
    comments: Optional[str]
    status: str
    created_at: Optional[datetime]
    reviewed_at: Optional[datetime]

    model_config = {"from_attributes": True}


class PerformanceReviewCreate(BaseModel):
    employee_id: int
    reviewer_id: Optional[int] = None
    hr_reviewer_id: Optional[int] = None
    admin_reviewer_id: Optional[int] = None
    cycle: str = Field(..., min_length=1, max_length=50)
    rating: int = Field(..., ge=1, le=5)
    comments: Optional[str] = Field(None, max_length=5000)

    @field_validator("cycle")
    @classmethod
    def _cycle_not_blank(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("Cycle is required, for example 'Q1 2026'.")
        return v


class PerformanceReviewUpdate(BaseModel):
    employee_id: Optional[int] = None
    reviewer_id: Optional[int] = None
    hr_reviewer_id: Optional[int] = None
    admin_reviewer_id: Optional[int] = None
    cycle: Optional[str] = Field(None, max_length=50)
    rating: Optional[int] = Field(None, ge=1, le=5)
    comments: Optional[str] = Field(None, max_length=5000)
    status: Optional[RequestStatus] = None

    @field_validator("cycle")
    @classmethod
    def _cycle_not_blank(cls, v):
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Cycle cannot be blank.")
        return v


class PerformanceReviewResponse(BaseModel):
    id: int
    employee_id: int
    reviewer_id: Optional[int]
    hr_reviewer_id: Optional[int] = None
    admin_reviewer_id: Optional[int] = None
    cycle: str
    rating: int
    comments: Optional[str]
    status: RequestStatus
    created_at: Optional[datetime]
    reviewed_at: Optional[datetime]

    model_config = {"from_attributes": True}


class TravelRequestCreate(BaseModel):
    employee_id: Optional[int] = None
    destination: str
    purpose: Optional[str] = None
    start_date: date
    end_date: date

    @field_validator("destination", mode="before")
    @classmethod
    def _v_destination(cls, v):
        text = " ".join(str(v or "").split())
        if not text:
            raise ValueError("Destination is required.")
        if len(text) < 2 or len(text) > 200:
            raise ValueError("Destination must be between 2 and 200 characters.")
        if not any(ch.isalpha() for ch in text):
            raise ValueError("Enter a real place name for the destination.")
        return text

    @field_validator("purpose", mode="before")
    @classmethod
    def _v_purpose(cls, v):
        text = " ".join(str(v or "").split())
        if not text:
            return None
        if len(text) > 500:
            raise ValueError("Purpose can be at most 500 characters.")
        return text

    @field_validator("start_date", "end_date", mode="before")
    @classmethod
    def alias_from_to(cls, v, info):
        if isinstance(v, str) and info.field_name not in ("start_date", "end_date"):
            return v
        return v

    @model_validator(mode="before")
    @classmethod
    def rename_fields(cls, values):
        if isinstance(values, dict):
            if "from" in values and "start_date" not in values:
                values["start_date"] = values.pop("from")
            if "to" in values and "end_date" not in values:
                values["end_date"] = values.pop("to")
        return values


class TravelRequestResponse(BaseModel):
    id: int
    organization_id: int
    employee_id: int
    employee_name: Optional[str] = None
    destination: str
    purpose: Optional[str]
    start_date: date
    end_date: date
    status: RequestStatus
    approved_at: Optional[datetime]
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


class TravelRequestUpdate(BaseModel):
    destination: Optional[str] = Field(None, max_length=200)
    purpose: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[RequestStatus] = None


class TravelApprovalCreate(BaseModel):
    request_id: int
    approver_id: int
    approval_level: int = Field(..., ge=1)
    comments: Optional[str] = None


class TravelApprovalUpdate(BaseModel):
    status: Optional[RequestStatus] = None
    comments: Optional[str] = None
    approved_at: Optional[datetime] = None


class TravelApprovalResponse(BaseModel):
    id: int
    organization_id: int
    request_id: int
    approver_id: int
    approval_level: int
    status: RequestStatus
    comments: Optional[str]
    approved_at: Optional[datetime]
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


class TravelExpenseCreate(BaseModel):
    request_id: int
    employee_id: int
    expense_type: str = Field(..., min_length=1, max_length=100)
    amount: Decimal = Field(..., ge=0)
    currency: str = "USD"
    description: Optional[str] = None
    receipt_url: Optional[str] = None


EXPENSE_TYPES = ("Hotel", "Flight", "Cab", "Meals", "Transport", "Other")
MAX_EXPENSE_AMOUNT = Decimal("10000000")


class TravelExpenseCreateSimple(BaseModel):
    """An expense claim raised from the employee portal."""
    employee_id: Optional[int] = None
    request_id: Optional[int] = None          # the trip it belongs to (optional)
    expense_type: str = "Other"
    amount: Decimal
    description: Optional[str] = None
    currency: str = "INR"

    @field_validator("expense_type", mode="before")
    @classmethod
    def _v_type(cls, v):
        text = str(v or "").strip()
        match = next((t for t in EXPENSE_TYPES if t.lower() == text.lower()), None)
        if not match:
            raise ValueError("Choose a category from the list.")
        return match

    @field_validator("amount", mode="before")
    @classmethod
    def _v_amount(cls, v):
        try:
            value = Decimal(str(v).strip())
        except Exception:
            raise ValueError("Enter the amount as a number.")
        if not value.is_finite():
            raise ValueError("Enter the amount as a number.")
        if value <= 0:
            raise ValueError("The amount must be more than zero.")
        if value > MAX_EXPENSE_AMOUNT:
            raise ValueError("The amount is too large. Contact HR for claims above 1,00,00,000.")
        if value != value.quantize(Decimal("0.01")):
            raise ValueError("The amount can have at most 2 decimal places.")
        return value

    @field_validator("description", mode="before")
    @classmethod
    def _v_description(cls, v):
        text = " ".join(str(v or "").split())
        if len(text) < 3:
            raise ValueError("Describe what the expense was for (at least 3 characters).")
        if len(text) > 500:
            raise ValueError("The description can be at most 500 characters.")
        return text

    @field_validator("currency", mode="before")
    @classmethod
    def _v_currency(cls, v):
        text = str(v or "INR").strip().upper()
        if len(text) != 3 or not text.isalpha():
            raise ValueError("Currency must be a 3-letter code such as INR.")
        return text


class TravelExpenseUpdate(BaseModel):
    expense_type: Optional[str] = Field(None, max_length=100)
    amount: Optional[Decimal] = Field(None, ge=0)
    currency: Optional[str] = None
    description: Optional[str] = None
    receipt_url: Optional[str] = None
    status: Optional[RequestStatus] = None
    approved_at: Optional[datetime] = None
    reimbursed_at: Optional[datetime] = None


class TravelExpenseResponse(BaseModel):
    id: int
    organization_id: int
    request_id: Optional[int] = None
    employee_id: int
    employee_name: Optional[str] = None
    expense_type: str
    amount: Decimal
    currency: str
    description: Optional[str]
    receipt_url: Optional[str]
    status: RequestStatus
    submitted_at: Optional[datetime]
    approved_at: Optional[datetime]
    reimbursed_at: Optional[datetime]
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


class TravelReceiptCreate(BaseModel):
    expense_id: int
    receipt_number: str = Field(..., min_length=1, max_length=100)
    receipt_url: str = Field(..., min_length=1, max_length=500)
    amount: Decimal = Field(..., ge=0)
    vendor_name: str = Field(..., min_length=1, max_length=200)
    expense_date: date
    notes: Optional[str] = None


class TravelReceiptResponse(BaseModel):
    id: int
    organization_id: int
    expense_id: int
    receipt_number: str
    receipt_url: str
    amount: Decimal
    vendor_name: str
    expense_date: date
    notes: Optional[str]
    uploaded_at: Optional[datetime]
    verified: bool
    verified_at: Optional[datetime]
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


class TravelPolicyCreate(BaseModel):
    policy_name: str = Field(..., min_length=1, max_length=200)
    policy_type: str = Field(..., min_length=1, max_length=50)
    description: Optional[str] = None
    max_daily_allowance: Optional[Decimal] = Field(None, ge=0)
    max_trip_duration: Optional[int] = Field(None, ge=1)
    max_per_diem: Optional[Decimal] = Field(None, ge=0)
    is_active: bool = True
    effective_date: date
    expiry_date: Optional[date] = None


class TravelPolicyUpdate(BaseModel):
    policy_name: Optional[str] = Field(None, min_length=1, max_length=200)
    policy_type: Optional[str] = Field(None, min_length=1, max_length=50)
    description: Optional[str] = None
    max_daily_allowance: Optional[Decimal] = Field(None, ge=0)
    max_trip_duration: Optional[int] = Field(None, ge=1)
    max_per_diem: Optional[Decimal] = Field(None, ge=0)
    is_active: Optional[bool] = None
    effective_date: Optional[date] = None
    expiry_date: Optional[date] = None


class TravelPolicyResponse(BaseModel):
    id: int
    policy_name: str
    policy_type: str
    description: Optional[str]
    max_daily_allowance: Optional[Decimal]
    max_trip_duration: Optional[int]
    max_per_diem: Optional[Decimal]
    is_active: bool
    effective_date: date
    expiry_date: Optional[date]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


TRAVEL_WORKFLOWS = ("manager", "manager+director", "manager+director+finance")


def _bounded(label, v, low, high, whole=True, unit=""):
    if v is None or (isinstance(v, str) and not v.strip()):
        raise ValueError(f"{label} is required.")
    try:
        n = Decimal(str(v).strip())
    except Exception:
        raise ValueError(f"{label} must be a number.")
    if not n.is_finite():
        raise ValueError(f"{label} must be a number.")
    if whole and n != n.to_integral_value():
        raise ValueError(f"{label} must be a whole number.")
    if not (Decimal(low) <= n <= Decimal(high)):
        raise ValueError(f"{label} must be between {low} and {high}{unit}.")
    if not whole and n != n.quantize(Decimal("0.01")):
        raise ValueError(f"{label} can have at most 2 decimal places.")
    return int(n) if whole else n


class TravelSettingUpdate(BaseModel):
    """What is sent is checked; what is left out stays as it is."""
    approval_workflow: Optional[str] = None
    expense_limit_per_day: Optional[Decimal] = None
    max_trip_duration: Optional[int] = None
    auto_approve_threshold: Optional[int] = None
    reimbursement_deadline: Optional[int] = None
    notification_enabled: Optional[bool] = None

    @field_validator("approval_workflow", mode="before")
    @classmethod
    def _v_workflow(cls, v):
        text = str(v).strip().lower().replace(" ", "") if v is not None else ""
        if text not in TRAVEL_WORKFLOWS:
            raise ValueError("Choose Manager Only, Manager + Director, or Manager + Director + Finance.")
        return text

    @field_validator("expense_limit_per_day", mode="before")
    @classmethod
    def _v_limit(cls, v):
        return _bounded("Daily expense limit", v, 0, 1000000, whole=False)

    @field_validator("max_trip_duration", mode="before")
    @classmethod
    def _v_duration(cls, v):
        return _bounded("Maximum trip duration", v, 1, 365, unit=" days")

    @field_validator("auto_approve_threshold", mode="before")
    @classmethod
    def _v_threshold(cls, v):
        return _bounded("Auto-approve threshold", v, 0, 10000000)

    @field_validator("reimbursement_deadline", mode="before")
    @classmethod
    def _v_deadline(cls, v):
        return _bounded("Reimbursement deadline", v, 1, 365, unit=" days")


class TravelSettingResponse(BaseModel):
    id: int
    organization_id: int
    approval_workflow: str
    expense_limit_per_day: Decimal
    max_trip_duration: int
    auto_approve_threshold: int
    reimbursement_deadline: int
    notification_enabled: bool
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class TravelDashboardStats(BaseModel):
    total_requests: int = 0
    pending_requests: int = 0
    approved_requests: int = 0
    total_expenses: Decimal = 0


class WorkforcePlanCreate(BaseModel):
    department_id: Optional[int] = None
    year: int
    headcount_target: int
    notes: Optional[str] = None


class WorkforcePlanResponse(BaseModel):
    id: int
    department_id: Optional[int]
    year: int
    headcount_target: int
    notes: Optional[str]
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


class WorkforceSummaryResponse(BaseModel):
    """Workforce analytics summary."""
    total_headcount: int = 0
    active_employees: int = 0
    department_breakdown: list[dict] = []
    yearly_trend: list[dict] = []
    turnover_rate: Optional[float] = None


class WfPlanCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    plan_year: int = Field(..., ge=2020, le=2100)
    status: Optional[str] = "draft"
    department_id: Optional[int] = None
    owner_id: Optional[int] = None
    budget: Optional[float] = 0
    target_headcount: Optional[int] = 0
    current_headcount: Optional[int] = 0


class WfPlanUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    plan_year: Optional[int] = Field(None, ge=2020, le=2100)
    status: Optional[str] = None
    department_id: Optional[int] = None
    owner_id: Optional[int] = None
    budget: Optional[float] = None
    target_headcount: Optional[int] = None
    current_headcount: Optional[int] = None


class WfPlanResponse(BaseModel):
    id: int
    organization_id: int
    department_id: Optional[int]
    title: str
    description: Optional[str]
    plan_year: int
    status: str
    owner_id: Optional[int]
    budget: Optional[float]
    target_headcount: Optional[int]
    current_headcount: Optional[int]
    created_by: Optional[int]
    updated_by: Optional[int]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    department_name: Optional[str] = None
    owner_name: Optional[str] = None

    model_config = {"from_attributes": True}


def _count(label, v, high=100000, required=False):
    if v is None or (isinstance(v, str) and not v.strip()):
        if required:
            raise ValueError(f"{label} is required.")
        return 0
    try:
        n = Decimal(str(v).strip())
    except Exception:
        raise ValueError(f"{label} must be a whole number.")
    if not n.is_finite() or n != n.to_integral_value():
        raise ValueError(f"{label} must be a whole number.")
    if not 0 <= n <= high:
        raise ValueError(f"{label} must be between 0 and {high}.")
    return int(n)


class _HeadcountChecks(BaseModel):
    """A headcount row is one department's position numbers for one fiscal year; the numbers have to add up."""
    @field_validator("department_id", mode="before", check_fields=False)
    @classmethod
    def _v_department(cls, v):
        if v is None or (isinstance(v, str) and not str(v).strip()):
            raise ValueError("Choose the department this headcount is for.")
        try:
            n = int(v)
        except (TypeError, ValueError):
            raise ValueError("Choose the department this headcount is for.")
        if n < 1:
            raise ValueError("Choose the department this headcount is for.")
        return n

    @field_validator("fiscal_year", mode="before", check_fields=False)
    @classmethod
    def _v_year(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            raise ValueError("Fiscal year is required.")
        try:
            n = int(str(v).strip())
        except ValueError:
            raise ValueError("Fiscal year must be a four-digit year.")
        if not 2020 <= n <= 2100:
            raise ValueError("Fiscal year must be between 2020 and 2100.")
        return n

    @field_validator("approved_positions", mode="before", check_fields=False)
    @classmethod
    def _v_approved(cls, v):
        return _count("Approved positions", v)

    @field_validator("filled_positions", mode="before", check_fields=False)
    @classmethod
    def _v_filled(cls, v):
        return _count("Filled positions", v)

    @field_validator("vacant_positions", mode="before", check_fields=False)
    @classmethod
    def _v_vacant(cls, v):
        return _count("Vacant positions", v)

    @field_validator("planned_hires", mode="before", check_fields=False)
    @classmethod
    def _v_hires(cls, v):
        return _count("Planned hires", v)

    @field_validator("projected_cost", mode="before", check_fields=False)
    @classmethod
    def _v_cost(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            return 0
        try:
            n = Decimal(str(v).strip())
        except Exception:
            raise ValueError("Projected cost must be a number.")
        if not n.is_finite() or n < 0:
            raise ValueError("Projected cost cannot be negative.")
        if n > Decimal("999999999999.99"):
            raise ValueError("Projected cost is too large.")
        if n != n.quantize(Decimal("0.01")):
            raise ValueError("Projected cost can have at most 2 decimal places.")
        return float(n)


def positions_problem(approved, filled, vacant):
    """The one message about the three position counts (None when they are consistent)."""
    if filled > approved:
        return "Filled positions cannot be more than approved positions."
    if vacant > approved:
        return "Vacant positions cannot be more than approved positions."
    if filled + vacant > approved:
        return "Filled plus vacant positions cannot be more than approved positions."
    return None


class WfHeadcountCreate(_HeadcountChecks):
    department_id: int
    fiscal_year: int
    approved_positions: Optional[int] = 0
    filled_positions: Optional[int] = 0
    vacant_positions: Optional[int] = 0
    planned_hires: Optional[int] = 0
    projected_cost: Optional[float] = 0

    @model_validator(mode="after")
    def _v_totals(self):
        problem = positions_problem(self.approved_positions or 0, self.filled_positions or 0, self.vacant_positions or 0)
        if problem:
            raise ValueError(problem)
        return self


class WfHeadcountUpdate(_HeadcountChecks):
    """Fields left out stay as they are; the totals are checked again by the service with the saved values."""
    department_id: Optional[int] = None
    fiscal_year: Optional[int] = None
    approved_positions: Optional[int] = None
    filled_positions: Optional[int] = None
    vacant_positions: Optional[int] = None
    planned_hires: Optional[int] = None
    projected_cost: Optional[float] = None


class WfHeadcountResponse(BaseModel):
    id: int
    organization_id: int
    department_id: Optional[int]
    department_name: Optional[str] = None
    fiscal_year: int
    approved_positions: Optional[int]
    filled_positions: Optional[int]
    vacant_positions: Optional[int]
    planned_hires: Optional[int]
    projected_cost: Optional[float]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


SUCCESSION_READINESS = ("not_ready", "moderately_ready", "ready", "fully_ready")
SUCCESSION_RISK = ("low", "medium", "high", "critical")


class _SuccessionChecks(BaseModel):
    """The people are checked against the organization by the service; the values themselves are checked here."""
    @field_validator("employee_id", mode="before", check_fields=False)
    @classmethod
    def _v_employee(cls, v):
        if v is None or (isinstance(v, str) and not str(v).strip()):
            raise ValueError("Choose the employee this succession plan is for.")
        try:
            n = int(v)
        except (TypeError, ValueError):
            raise ValueError("Choose the employee this succession plan is for.")
        if n < 1:
            raise ValueError("Choose the employee this succession plan is for.")
        return n

    @field_validator("successor_employee_id", mode="before", check_fields=False)
    @classmethod
    def _v_successor(cls, v):
        if v is None or (isinstance(v, str) and not str(v).strip()):
            return None                      # a successor may not be named yet
        try:
            n = int(v)
        except (TypeError, ValueError):
            raise ValueError("Choose a successor from the list.")
        if n < 1:
            raise ValueError("Choose a successor from the list.")
        return n

    @field_validator("readiness_level", mode="before", check_fields=False)
    @classmethod
    def _v_readiness(cls, v):
        text = str(v).strip().lower() if v is not None else ""
        if text not in SUCCESSION_READINESS:
            raise ValueError("Readiness must be not ready, moderately ready, ready or fully ready.")
        return text

    @field_validator("risk_level", mode="before", check_fields=False)
    @classmethod
    def _v_risk(cls, v):
        text = str(v).strip().lower() if v is not None else ""
        if text not in SUCCESSION_RISK:
            raise ValueError("Risk must be low, medium, high or critical.")
        return text

    @field_validator("target_position", mode="before", check_fields=False)
    @classmethod
    def _v_position(cls, v):
        text = " ".join(str(v).split()) if v is not None else ""
        if not text:
            return None
        if len(text) > 150:
            raise ValueError("Target position can be at most 150 characters.")
        return text

    @field_validator("review_date", check_fields=False)
    @classmethod
    def _v_review(cls, v):
        if v is not None and not (2000 <= v.year <= 2100):
            raise ValueError("Enter a date between the years 2000 and 2100.")
        return v

    @field_validator("notes", mode="before", check_fields=False)
    @classmethod
    def _v_notes(cls, v):
        text = str(v).strip() if v is not None else ""
        if not text:
            return None
        if len(text) > 5000:
            raise ValueError("Notes can be at most 5000 characters.")
        return text


class WfSuccessionCreate(_SuccessionChecks):
    employee_id: int
    successor_employee_id: Optional[int] = None
    readiness_level: Optional[str] = "not_ready"
    risk_level: Optional[str] = "medium"
    target_position: Optional[str] = None
    review_date: Optional[_date_type] = None
    notes: Optional[str] = None


class WfSuccessionUpdate(_SuccessionChecks):
    """Fields left out stay as they are; employee, readiness and risk cannot be blanked."""
    employee_id: Optional[int] = None
    successor_employee_id: Optional[int] = None
    readiness_level: Optional[str] = None
    risk_level: Optional[str] = None
    target_position: Optional[str] = None
    review_date: Optional[_date_type] = None
    notes: Optional[str] = None


class WfSuccessionResponse(BaseModel):
    id: int
    organization_id: int
    employee_id: int
    successor_employee_id: Optional[int]
    readiness_level: Optional[str]
    risk_level: Optional[str]
    target_position: Optional[str]
    review_date: Optional[date]
    notes: Optional[str]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    employee_name: Optional[str] = None
    successor_name: Optional[str] = None

    model_config = {"from_attributes": True}


class WfReportCreate(BaseModel):
    report_name: str = Field(..., max_length=200)
    report_type: str = Field(..., max_length=50)

    @field_validator("report_name", mode="before")
    @classmethod
    def _v_name(cls, v):
        return _course_text("Report name", 200)(v)

    @field_validator("report_type", mode="before")
    @classmethod
    def _v_type(cls, v):
        text = str(v).strip().lower() if v is not None else ""
        if text not in ("workforce_summary", "headcount_summary", "succession_pipeline"):
            raise ValueError("Report type must be Workforce Summary, Headcount Summary or Succession Pipeline.")
        return text


class WfReportResponse(BaseModel):
    id: int
    organization_id: int
    report_name: str
    report_type: str
    generated_by: Optional[int]
    generated_at: Optional[datetime]
    generated_by_name: Optional[str] = None

    model_config = {"from_attributes": True}


class WfDashboardResponse(BaseModel):
    total_plans: int = 0
    active_plans: int = 0
    total_headcount_target: int = 0
    total_current_headcount: int = 0
    total_budget: float = 0
    total_approved_positions: int = 0
    total_filled_positions: int = 0
    total_vacant_positions: int = 0
    total_planned_hires: int = 0
    total_projected_cost: float = 0
    succession_count: int = 0
    high_risk_count: int = 0
    ready_successors: int = 0
    department_breakdown: list[dict] = []
    recent_plans: list[dict] = []
    headcount_by_dept: list[dict] = []


class PaginatedWfPlans(BaseModel):
    total: int
    page: int
    per_page: int
    items: list[WfPlanResponse]


class PaginatedWfHeadcount(BaseModel):
    total: int
    page: int
    per_page: int
    items: list[WfHeadcountResponse]


class PaginatedWfSuccession(BaseModel):
    total: int
    page: int
    per_page: int
    items: list[WfSuccessionResponse]


class PaginatedWfReports(BaseModel):
    total: int
    page: int
    per_page: int
    items: list[WfReportResponse]


# ════════════════════════════════════════════════════════════════════════════
# RECRUITMENT SCHEMAS
# ════════════════════════════════════════════════════════════════════════════

class RecruitmentDashboardResponse(BaseModel):
    total_open_positions: int = 0
    active_candidates: int = 0
    scheduled_interviews: int = 0
    offers_extended: int = 0
    offers_accepted: int = 0
    time_to_hire: float = 0.0
    hiring_funnel: list[dict] = []
    recent_activity: list[dict] = []


class RequisitionCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    department: str = Field(..., min_length=1, max_length=100)
    location: Optional[str] = Field(None, max_length=150)
    openings: int = Field(default=1, ge=1)
    priority: str = "medium"
    status: Optional[RequisitionStatus] = None
    description: Optional[str] = None


class RequisitionUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    department: Optional[str] = Field(None, min_length=1, max_length=100)
    location: Optional[str] = Field(None, max_length=150)
    openings: Optional[int] = Field(None, ge=1)
    filled: Optional[int] = Field(None, ge=0)
    priority: Optional[str] = None
    status: Optional[RequisitionStatus] = None
    description: Optional[str] = None


class RequisitionResponse(BaseModel):
    id: int
    title: str
    department: str
    location: Optional[str]
    openings: int
    filled: int
    candidate_count: int = 0
    priority: str
    status: RequisitionStatus
    description: Optional[str]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class RequisitionListResponse(BaseModel):
    total: int
    page: int
    per_page: int
    pages: int
    items: list[RequisitionResponse]


def _candidate_text(label, required, max_len):
    def check(v):
        if v is None:
            if required:
                raise ValueError(f"{label} is required.")
            return v
        text = " ".join(str(v).split())
        if not text:
            if required:
                raise ValueError(f"{label} is required.")
            return None
        if len(text) > max_len:
            raise ValueError(f"{label} can be at most {max_len} characters.")
        return text
    return check


def _candidate_email(v):
    text = "" if v is None else str(v).strip()
    if not text:
        raise ValueError("Email is required.")
    if len(text) > 255:
        raise ValueError("Email can be at most 255 characters.")
    if not re.match(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$", text):
        raise ValueError("Enter a valid email address, for example name@company.com.")
    return text.lower()


def _candidate_phone(v):
    from app.core.phone import normalize_phone
    return normalize_phone(v)


def _candidate_link(v):
    text = "" if v is None else str(v).strip()
    if not text:
        return None
    if not re.match(r"^https?://[^\s/]+\.[^\s/]+\S*$", text, re.IGNORECASE):
        raise ValueError("Enter a valid link starting with http:// or https://.")
    if len(text) > 500:
        raise ValueError("The resume link can be at most 500 characters.")
    return text


class _CandidateFields(BaseModel):
    """Checks shared by adding and editing a candidate; every message is written for the person filling the form."""
    @field_validator("name", mode="before", check_fields=False)
    @classmethod
    def _v_name(cls, v):
        return None if v is None and cls is CandidateUpdate else _candidate_text("Name", True, 150)(v)

    @field_validator("position", mode="before", check_fields=False)
    @classmethod
    def _v_position(cls, v):
        return None if v is None and cls is CandidateUpdate else _candidate_text("Position", True, 150)(v)

    @field_validator("email", mode="before", check_fields=False)
    @classmethod
    def _v_email(cls, v):
        return None if v is None and cls is CandidateUpdate else _candidate_email(v)

    @field_validator("phone", mode="before", check_fields=False)
    @classmethod
    def _v_phone(cls, v):
        return _candidate_phone(v)

    @field_validator("location", mode="before", check_fields=False)
    @classmethod
    def _v_location(cls, v):
        return _candidate_text("Location", False, 150)(v)

    @field_validator("source", mode="before", check_fields=False)
    @classmethod
    def _v_source(cls, v):
        return _candidate_text("Source", False, 100)(v)

    @field_validator("resume_link", mode="before", check_fields=False)
    @classmethod
    def _v_link(cls, v):
        return _candidate_link(v)


class CandidateCreate(_CandidateFields):
    name: str
    email: str
    phone: Optional[str] = None
    position: str
    source: Optional[str] = None
    status: Optional[RecruitmentCandidateStatus] = None
    location: Optional[str] = None
    experience: Optional[int] = Field(None, ge=0, le=60)
    resume_link: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=5000)
    requisition_id: Optional[int] = None


class CandidateUpdate(_CandidateFields):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    position: Optional[str] = None
    source: Optional[str] = None
    status: Optional[RecruitmentCandidateStatus] = None
    location: Optional[str] = None
    experience: Optional[int] = Field(None, ge=0, le=60)
    resume_link: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=5000)
    requisition_id: Optional[int] = None


class CandidateStatusUpdate(BaseModel):
    status: RecruitmentCandidateStatus


class CandidateResponse(BaseModel):
    id: int
    name: str
    email: str
    phone: Optional[str]
    position: str
    source: Optional[str]
    status: RecruitmentCandidateStatus
    location: Optional[str]
    experience: Optional[int]
    resume_link: Optional[str]
    applied_at: Optional[datetime]
    notes: Optional[str]
    onboarding_new_hire_id: Optional[int] = None
    requisition_id: Optional[int] = None
    requisition_title: Optional[str] = None
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class CandidateListResponse(BaseModel):
    total: int
    page: int
    per_page: int
    pages: int
    items: list[CandidateResponse]


class InterviewCreate(BaseModel):
    candidate_id: Optional[int] = None
    candidate_name: str = Field(..., min_length=1, max_length=150)
    position: str = Field(..., min_length=1, max_length=150)
    interview_type: str = "in_person"
    interview_date: date
    start_time: Optional[str] = Field(None, max_length=10)
    end_time: Optional[str] = Field(None, max_length=10)
    interviewer: Optional[str] = Field(None, max_length=150)
    interviewer_id: Optional[int] = None
    notes: Optional[str] = None


class InterviewUpdate(BaseModel):
    candidate_id: Optional[int] = None
    candidate_name: Optional[str] = Field(None, min_length=1, max_length=150)
    position: Optional[str] = Field(None, min_length=1, max_length=150)
    interview_type: Optional[str] = None
    interview_date: Optional[date] = None
    start_time: Optional[str] = Field(None, max_length=10)
    end_time: Optional[str] = Field(None, max_length=10)
    interviewer: Optional[str] = Field(None, max_length=150)
    interviewer_id: Optional[int] = None
    status: Optional[InterviewStatus] = None
    feedback: Optional[str] = None
    rating: Optional[int] = Field(None, ge=1, le=5)
    notes: Optional[str] = None


class InterviewFeedback(BaseModel):
    feedback: Optional[str] = None
    rating: Optional[int] = Field(None, ge=1, le=5)
    status: Optional[InterviewStatus] = None


class InterviewResponse(BaseModel):
    id: int
    candidate_id: Optional[int] = None
    candidate_name: str
    position: str
    interview_type: str
    interview_date: date
    start_time: Optional[str]
    end_time: Optional[str]
    interviewer: Optional[str]
    interviewer_id: Optional[int]
    status: InterviewStatus
    feedback: Optional[str]
    rating: Optional[int]
    notes: Optional[str]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class InterviewListResponse(BaseModel):
    total: int
    page: int
    per_page: int
    pages: int
    items: list[InterviewResponse]


class OfferCreate(BaseModel):
    candidate_id: Optional[int] = None
    candidate_name: str = Field(..., min_length=1, max_length=150)
    position: str = Field(..., min_length=1, max_length=150)
    salary: Optional[Decimal] = Field(None, ge=0)
    equity: Optional[str] = Field(None, max_length=50)
    joining_date: Optional[date] = None
    notes: Optional[str] = None


class OfferUpdate(BaseModel):
    candidate_id: Optional[int] = None
    candidate_name: Optional[str] = Field(None, min_length=1, max_length=150)
    position: Optional[str] = Field(None, min_length=1, max_length=150)
    salary: Optional[Decimal] = Field(None, ge=0)
    equity: Optional[str] = Field(None, max_length=50)
    joining_date: Optional[date] = None
    status: Optional[OfferStatus] = None
    notes: Optional[str] = None


class OfferStatusUpdate(BaseModel):
    status: OfferStatus


class OfferResponse(BaseModel):
    id: int
    candidate_id: Optional[int] = None
    candidate_name: str
    position: str
    salary: Optional[Decimal]
    equity: Optional[str]
    joining_date: Optional[date]
    status: OfferStatus
    notes: Optional[str]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class OfferListResponse(BaseModel):
    total: int
    page: int
    per_page: int
    pages: int
    items: list[OfferResponse]


class DocumentCreate(BaseModel):
    document_type: str = Field(..., min_length=2, max_length=50)
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    file_name: str = Field(..., min_length=1, max_length=255)
    file_size: Optional[int] = Field(None, ge=0)
    category: Optional[str] = None
    tags: Optional[list] = None
    expiry_date: Optional[date] = None
    is_public: bool = False


class DocumentResponse(BaseModel):
    id: int
    document_type: str
    title: str
    description: Optional[str] = None
    file_name: str
    file_path: Optional[str] = None
    file_size: Optional[int]
    category: Optional[str] = None
    tags: Optional[list] = None
    uploaded_by_id: int
    uploaded_at: Optional[datetime]
    status: str
    expiry_date: Optional[date] = None
    is_public: bool
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class ApplicationCreate(BaseModel):
    candidate_id: int
    requisition_id: int
    status: str = "new"
    notes: Optional[str] = None


class ApplicationResponse(BaseModel):
    id: int
    candidate_id: int
    requisition_id: int
    application_date: Optional[datetime]
    status: str
    notes: Optional[str]

    model_config = {"from_attributes": True}


class InterviewFeedbackCreate(BaseModel):
    interview_id: int
    interviewer_id: int
    rating: int = Field(..., ge=1, le=10)
    feedback: Optional[str] = None
    strengths: Optional[str] = None
    improvements: Optional[str] = None


class InterviewFeedbackResponse(BaseModel):
    id: int
    interview_id: int
    interviewer_id: int
    rating: int
    feedback: Optional[str]
    strengths: Optional[str]
    improvements: Optional[str]
    created_date: Optional[datetime]

    model_config = {"from_attributes": True}


class OfferApprovalCreate(BaseModel):
    offer_id: int
    approver_id: int
    approval_status: str = "pending"
    comments: Optional[str] = None


class OfferApprovalResponse(BaseModel):
    id: int
    offer_id: int
    approver_id: int
    approval_status: str
    comments: Optional[str]
    approved_date: Optional[datetime]

    model_config = {"from_attributes": True}


class RecruitmentAnalyticsResponse(BaseModel):
    id: int
    requisition_id: Optional[int]
    total_applicants: int = 0
    interviews_scheduled: int = 0
    interviews_completed: int = 0
    offers_extended: int = 0
    offers_accepted: int = 0
    offers_rejected: int = 0
    time_to_hire: Optional[int]
    cost_per_hire: Optional[float]

    model_config = {"from_attributes": True}


# ════════════════════════════════════════════════════════════════════════════════
# EMPLOYEE MANAGEMENT SCHEMAS
# ════════════════════════════════════════════════════════════════════════════════






































# ════════════════════════════════════════════════════════════════════════════════
# DESIGNATION SCHEMAS
# ════════════════════════════════════════════════════════════════════════════════

class DesignationCreate(BaseModel):
    title:           str
    department_name: Optional[str] = None
    level:           Optional[str] = None
    description:     Optional[str] = None
    # None = use the organization's "default status for new designations" setting
    status:          Optional[str] = None
    min_salary:      Optional[float] = None
    max_salary:      Optional[float] = None
    # Only honoured when the organization turned "auto-generate codes" off
    designation_code: Optional[str] = Field(None, max_length=20)


class DesignationNotificationPrefs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    created: bool = True
    updated: bool = True
    head_changed: bool = True
    budget_updated: bool = True
    status_changed: bool = True
    added_under_hierarchy: bool = True
    deletion_requested: bool = True


class DesignationSettingsData(BaseModel):
    """Everything on the Designation Settings page. Unknown keys are rejected so a typo can never be saved
    silently; every field has a default, so an organization that never saved settings gets these."""
    model_config = ConfigDict(extra="forbid")

    # General
    code_prefix: str = "DES"
    default_status: Literal["active", "inactive"] = "active"
    auto_generate_codes: bool = True
    enforce_unique_codes: bool = True
    # Hierarchy
    max_hierarchy_depth: int = Field(10, ge=1, le=10)
    allow_cross_heads: bool = True
    require_parent: bool = False
    enforce_single_parent: bool = True
    # Notifications
    notifications: DesignationNotificationPrefs = Field(default_factory=DesignationNotificationPrefs)
    # Display
    show_salary_range: bool = True
    show_employee_count: bool = True
    default_sort_field: Literal["title", "department", "level", "salary", "created_at"] = "title"
    default_sort_direction: Literal["asc", "desc"] = "asc"
    items_per_page: Literal[5, 10, 15, 25, 50] = 10
    compact_mode: bool = False

    @field_validator("code_prefix", mode="before")
    @classmethod
    def _clean_prefix(cls, v):
        v = str(v or "").strip().upper()
        if not re.fullmatch(r"[A-Z0-9]{2,6}", v):
            raise ValueError("The code prefix must be 2 to 6 letters or digits (for example DES).")
        return v

class DesignationUpdate(BaseModel):
    title:           Optional[str] = None
    department_name: Optional[str] = None
    level:           Optional[str] = None
    description:     Optional[str] = None
    status:          Optional[str] = None
    min_salary:      Optional[float] = None
    max_salary:      Optional[float] = None

class DesignationResponse(BaseModel):
    id:              int
    title:           str
    designation_code: Optional[str] = None
    department_name: Optional[str]
    level:           Optional[str]
    description:     Optional[str]
    status:          str
    min_salary:      Optional[float]
    max_salary:      Optional[float]
    employees_count: int = 0
    source:          Optional[str] = None
    created_by:      Optional[int] = None
    created_by_name: Optional[str] = None
    created_at:      Optional[datetime]
    updated_at:      Optional[datetime]

    model_config = ConfigDict(from_attributes=True)

# ════════════════════════════════════════════════════════════════════════════════
# HR DOCUMENT SCHEMAS
# ════════════════════════════════════════════════════════════════════════════════

class HrDocumentUpdate(BaseModel):
    """Update metadata on an existing HR document. All fields optional."""
    title:           Optional[str]  = Field(None, min_length=1, max_length=255)
    description:     Optional[str]  = None
    category:        Optional[str]  = None   # HrDocumentCategory value
    document_type:   Optional[str]  = None
    employee_id:     Optional[int]  = None
    expiry_date:     Optional[date] = None
    tags:            Optional[List[str]] = None


class HrDocumentStatusUpdate(BaseModel):
    """Payload for PATCH /hr/documents/{id}/status"""
    status:           str  # HrDocumentStatus value
    rejection_reason: Optional[str] = None


class HrDocumentResponse(BaseModel):
    """Full document object returned by the API."""
    id:               int
    title:            str
    description:      Optional[str]
    category:         str
    document_type:    Optional[str]
    file_path:        Optional[str]
    file_url:         Optional[str] = None
    file_name:        Optional[str]
    file_size:        Optional[int]
    mime_type:        Optional[str]
    status:           str
    rejection_reason: Optional[str]
    employee_id:      Optional[int]
    uploaded_by:      Optional[int]
    expiry_date:      Optional[date]
    tags:             Optional[List]
    is_deleted:       bool
    created_at:       Optional[datetime]
    updated_at:       Optional[datetime]
    # Convenience fields resolved server-side
    employee_name:     Optional[str] = None
    employee_id_str:   Optional[str] = None
    employee_code:     Optional[str] = None
    legacy_code:       Optional[str] = None
    file_missing:      bool = False
    designation_name:  Optional[str] = None
    uploader_name:     Optional[str] = None
    folder_id:         Optional[int] = None

    model_config = {"from_attributes": True}


# ════════════════════════════════════════════════════════════════════════════
# DOCUMENT DASHBOARD SCHEMAS
# ════════════════════════════════════════════════════════════════════════════

class DocumentDashboardStats(BaseModel):
    total_documents: int = 0
    pending_review: int = 0
    approved: int = 0
    rejected: int = 0
    expired: int = 0
    completion_rate: float = 0.0
    expiring_soon: list = []
    expiring_soon_count: int = 0

    model_config = {"from_attributes": True}


class ExpiringDocumentItem(BaseModel):
    id: int
    title: str
    category: str
    employee_name: Optional[str] = None
    expiry_date: date
    days_remaining: int

    model_config = {"from_attributes": True}


# ════════════════════════════════════════════════════════════════════════════
# DOCUMENT VERSION SCHEMAS
# ════════════════════════════════════════════════════════════════════════════

class HrDocumentVersionResponse(BaseModel):
    id: int
    document_id: int
    version: int
    file_path: Optional[str]
    file_url: Optional[str] = None
    file_name: Optional[str]
    file_size: Optional[int]
    mime_type: Optional[str]
    uploaded_by: Optional[int]
    uploader_name: Optional[str] = None
    change_notes: Optional[str]
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


# ════════════════════════════════════════════════════════════════════════════
# DOCUMENT APPROVAL WORKFLOW SCHEMAS
# ════════════════════════════════════════════════════════════════════════════

class ApprovalStepResponse(BaseModel):
    id: int
    document_id: int
    step_order: int
    required_role: str
    status: str
    approved_by: Optional[int]
    approver_name: Optional[str] = None
    approved_at: Optional[datetime]
    comment: Optional[str]

    model_config = {"from_attributes": True}


class ApprovalAction(BaseModel):
    comment: Optional[str] = None


class ApprovalLogResponse(BaseModel):
    id: int
    document_id: int
    document_title: Optional[str] = None
    action: str
    step_id: Optional[int]
    step_role: Optional[str] = None
    performed_by: Optional[int]
    performer_name: Optional[str] = None
    role_at_time: Optional[str]
    comment: Optional[str]
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


class PendingApprovalItem(BaseModel):
    id: int
    document_id: int
    document_title: str
    category: str
    employee_name: Optional[str] = None
    employee_identifier: Optional[str] = None
    uploader_name: Optional[str] = None
    step_order: int
    required_role: str
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


# ════════════════════════════════════════════════════════════════════════════
# DOCUMENT-EMPLOYEE ASSIGNMENT SCHEMAS
# ════════════════════════════════════════════════════════════════════════════

class DocumentAssignRequest(BaseModel):
    employee_ids: list[int] = Field(..., min_length=1, description="List of employee IDs to assign this document to")
    notes: Optional[str] = None


class DocumentAssignmentResponse(BaseModel):
    id: int
    document_id: int
    employee_id: int
    employee_name: Optional[str] = None
    employee_identifier: Optional[str] = None
    employee_code: Optional[str] = None
    assigned_by: Optional[int]
    assigner_name: Optional[str] = None
    status: str
    notes: Optional[str]
    acknowledged_at: Optional[datetime]
    assigned_at: Optional[datetime]

    model_config = {"from_attributes": True}


class EmployeeDocumentResponse(BaseModel):
    """For employee self-service — shows assigned docs to an employee."""
    id: int
    document_id: int
    document_title: str
    document_category: str
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    status: str
    assigned_at: Optional[datetime]
    acknowledged_at: Optional[datetime]
    notes: Optional[str]

    model_config = {"from_attributes": True}


# ════════════════════════════════════════════════════════════════════════════
# COMPLIANCE SCHEMAS
# ════════════════════════════════════════════════════════════════════════════

class PolicyCreate(BaseModel):
    title: str
    category: Optional[str] = None
    status: Optional[str] = "active"

class PolicyResponse(BaseModel):
    id: int
    title: str
    category: Optional[str]
    status: str
    owner: Optional[str] = None          # frontend reads p.owner
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

class AuditCreate(BaseModel):
    title: str
    auditor: Optional[str] = None
    score: Optional[float] = None
    status: Optional[str] = "pending"

class AuditResponse(BaseModel):
    id: int
    title: str
    auditor: Optional[str]
    score: Optional[float]
    status: str
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

class PolicyAcknowledgementCreate(BaseModel):
    policy_id: int
    employee_id: int
    employee: Optional[str] = None
    policy: Optional[str] = None
    status: Optional[str] = "pending"
    due_date: Optional[date] = None

class PolicyAcknowledgementResponse(BaseModel):
    id: int
    policy_id: int
    employee_id: int
    employee: Optional[str]              # frontend reads t.employee
    policy: Optional[str]                # frontend reads t.policy
    status: str
    due_date: Optional[date]             # frontend reads t.dueDate (camelCase fixed in service)
    acknowledged_at: Optional[datetime]
    model_config = ConfigDict(from_attributes=True)

class RegulatoryRequirementCreate(BaseModel):
    name: str
    jurisdiction: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = "active"

class RegulatoryRequirementResponse(BaseModel):
    id: int
    name: str
    jurisdiction: Optional[str]
    category: Optional[str]
    status: str
    model_config = ConfigDict(from_attributes=True)

class RiskCreate(BaseModel):
    title: str
    category: Optional[str] = None
    risk_score: Optional[int] = 0
    mitigation_strategy: Optional[str] = None
    mitigation: Optional[str] = None     # alias the frontend uses
    status: Optional[str] = "open"

class RiskResponse(BaseModel):
    id: int
    title: str
    category: Optional[str]
    risk_score: int                      # frontend reads r.riskScore (fixed in service)
    mitigation_strategy: Optional[str]
    mitigation: Optional[str]            # frontend reads r.mitigation
    status: str
    model_config = ConfigDict(from_attributes=True)

class ViolationCreate(BaseModel):
    title: str
    violation: Optional[str] = None
    policy: Optional[str] = None
    employee: Optional[str] = None
    reported_by: Optional[str] = None
    severity: Optional[str] = None
    status: Optional[str] = "investigating"
    date: Optional[_date_type] = None

class ViolationResponse(BaseModel):
    id: int
    title: str
    violation: Optional[str]             # frontend reads v.violation
    policy: Optional[str]                # frontend reads v.policy
    employee: Optional[str]              # frontend reads v.employee
    reported_by: Optional[str]           # frontend reads v.reportedBy (fixed in service)
    severity: Optional[str]
    status: str
    date: Optional[_date_type]                 # frontend reads v.date
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

class CorrectiveActionCreate(BaseModel):
    title: str
    violation_id: Optional[int] = None
    assigned_to: Optional[str] = None
    status: Optional[str] = "pending"
    deadline: Optional[date] = None

class CorrectiveActionResponse(BaseModel):
    id: int
    title: str
    violation_id: Optional[int]
    assigned_to: Optional[str]           # frontend reads act.assignedTo (fixed in service)
    status: str
    deadline: Optional[date]             # frontend reads act.deadline
    model_config = ConfigDict(from_attributes=True)

class ComplianceDashboardStats(BaseModel):
    totalPolicies: int = 0
    pendingAcknowledgment: int = 0
    openViolations: int = 0
    completedAudits: int = 0

class ComplianceDashboardResponse(BaseModel):
    stats: ComplianceDashboardStats

class ComplianceReportItem(BaseModel):
    id: str
    title: str
    type: str       # "PDF" or "CSV"
    size: str
    date: str       # ISO date string


# ── Organization Configuration Schemas ────────────────────────────────────────

class OrgConfigCreate(BaseModel):
    key: str
    value: Optional[str] = None
    description: Optional[str] = None
    category: str = "general"

class OrgConfigUpdate(BaseModel):
    value: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None

class OrgConfigResponse(BaseModel):
    id: int
    organization_id: int
    key: str
    value: Optional[str] = None
    description: Optional[str] = None
    category: str = "general"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class OrgConfigBulkUpdate(BaseModel):
    configs: list[OrgConfigCreate]