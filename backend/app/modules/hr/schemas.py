"""
modules/hr/schemas.py
---------------------
Pydantic schemas = data validation for API requests and responses.
"""

from datetime import date, datetime
from typing import Optional, List
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
    date: Optional[date] = None
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
    overtime: int = 0
    overtime_count: int = 0
    attendance_percentage: float = 0.0
    attendance_rate: float = 0.0
    avg_working_hours: float = 0.0
    total_employees: int = 0
    department_attendance: list[dict] = []
    department_breakdown: list[dict] = []
    shift_distribution: list[dict] = []
    shift_utilization: list[dict] = []
    attendance_trend: list[dict] = []


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


class SalaryComponentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    component_type: str = Field(..., pattern="^(earning|deduction)$")
    is_taxable: bool = True
    default_amount: Optional[Decimal] = None
    description: Optional[str] = None


class SalaryComponentUpdate(BaseModel):
    name: Optional[str] = None
    component_type: Optional[str] = None
    is_taxable: Optional[bool] = None
    default_amount: Optional[Decimal] = None
    description: Optional[str] = None


class SalaryComponentResponse(SalaryComponentCreate):
    id: int
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

class StructureComponentCreate(BaseModel):
    structure_id: int
    component_id: int
    amount_or_formula: str

class StructureComponentUpdate(BaseModel):
    structure_id: Optional[int] = None
    component_id: Optional[int] = None
    amount_or_formula: Optional[str] = None

class StructureComponentResponse(StructureComponentCreate):
    id: int
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

class AllowanceCreate(BaseModel):
    employee_id: int
    allowance_type: str
    amount: Decimal
    effective_date: date

class AllowanceUpdate(BaseModel):
    allowance_type: Optional[str] = None
    amount: Optional[Decimal] = None
    effective_date: Optional[date] = None

class AllowanceResponse(AllowanceCreate):
    id: int
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


class CourseCreate(BaseModel):
    course_name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    course_type: Optional[str] = Field(None, max_length=50)
    category: Optional[str] = Field(None, max_length=100)
    provider: Optional[str] = Field(None, max_length=150)
    duration_hours: Optional[int] = Field(None, ge=0)
    cost: Optional[Decimal] = Field(None, ge=0)
    status: str = "active"


class CourseUpdate(BaseModel):
    course_name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    course_type: Optional[str] = Field(None, max_length=50)
    category: Optional[str] = Field(None, max_length=100)
    provider: Optional[str] = Field(None, max_length=150)
    duration_hours: Optional[int] = Field(None, ge=0)
    cost: Optional[Decimal] = Field(None, ge=0)
    status: Optional[str] = None


class CourseResponse(BaseModel):
    id: int
    course_name: str
    description: Optional[str]
    course_type: Optional[str]
    category: Optional[str]
    provider: Optional[str]
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


class AssessmentCreate(BaseModel):
    course_id: int
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    passing_score: int = 70
    max_attempts: Optional[int] = None
    duration_minutes: Optional[int] = None


class AssessmentUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    passing_score: Optional[int] = None
    max_attempts: Optional[int] = None
    duration_minutes: Optional[int] = None
    is_active: Optional[bool] = None


class AssessmentResponse(BaseModel):
    id: int
    course_id: int
    title: str
    description: Optional[str]
    passing_score: int
    max_attempts: Optional[int]
    duration_minutes: Optional[int]
    is_active: bool
    created_by: Optional[int]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class QuestionCreate(BaseModel):
    question_text: str
    question_type: str = "multiple_choice"
    options: Optional[str] = None
    correct_answer: Optional[str] = None
    points: int = 1
    sort_order: int = 0


class QuestionUpdate(BaseModel):
    question_text: Optional[str] = None
    question_type: Optional[str] = None
    options: Optional[str] = None
    correct_answer: Optional[str] = None
    points: Optional[int] = None
    sort_order: Optional[int] = None


class QuestionResponse(BaseModel):
    id: int
    assessment_id: int
    question_text: str
    question_type: str
    options: Optional[str]
    correct_answer: Optional[str]
    points: int
    sort_order: int
    created_at: Optional[datetime]

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


class TrainingProgramCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    instructor_id: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: str = "planned"
    max_participants: Optional[int] = Field(None, ge=1)


class TrainingProgramUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    instructor_id: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[str] = None
    max_participants: Optional[int] = Field(None, ge=1)


class TrainingProgramResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    instructor_id: Optional[int]
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
    rejection_reason: Optional[str] = None
    title: Optional[str] = None
    category: Optional[str] = None
    tenant_id: Optional[str] = None

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

class OnboardingOrientationCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    date: date
    time: Optional[str] = None
    location: Optional[str] = None
    meeting_link: Optional[str] = None
    presenter: Optional[str] = None
    status: Optional[str] = "scheduled"
    tenant_id: Optional[str] = None

class OnboardingOrientationUpdate(BaseModel):
    title: Optional[str] = None
    date: Optional[date] = None
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
    assetsPending: int
    orientationPending: int
    trainingPending: int
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


class AppraisalCreate(BaseModel):
    employee_id: int
    reviewer_id: Optional[int] = None
    hr_reviewer_id: Optional[int] = None
    admin_reviewer_id: Optional[int] = None
    cycle: str = Field(..., min_length=1, max_length=50)
    self_score: Optional[float] = None
    manager_score: Optional[float] = None
    final_score: Optional[float] = None
    recommendation: Optional[str] = None
    salary_hike: Optional[float] = None
    comments: Optional[str] = None
    status: Optional[str] = "draft"


class AppraisalUpdate(BaseModel):
    employee_id: Optional[int] = None
    reviewer_id: Optional[int] = None
    hr_reviewer_id: Optional[int] = None
    admin_reviewer_id: Optional[int] = None
    cycle: Optional[str] = None
    self_score: Optional[float] = None
    manager_score: Optional[float] = None
    final_score: Optional[float] = None
    recommendation: Optional[str] = None
    salary_hike: Optional[float] = None
    comments: Optional[str] = None
    status: Optional[str] = None


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
    cycle: str
    rating: int = Field(..., ge=1, le=5)
    comments: Optional[str] = None


class PerformanceReviewUpdate(BaseModel):
    employee_id: Optional[int] = None
    reviewer_id: Optional[int] = None
    hr_reviewer_id: Optional[int] = None
    admin_reviewer_id: Optional[int] = None
    cycle: Optional[str] = None
    rating: Optional[int] = Field(None, ge=1, le=5)
    comments: Optional[str] = None
    status: Optional[str] = None


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


class TravelExpenseCreateSimple(BaseModel):
    employee_id: Optional[int] = None
    expense_type: str = Field("Other", min_length=1, max_length=100)
    amount: Decimal = Field(..., ge=0)
    description: Optional[str] = None
    currency: str = "USD"


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
    request_id: int
    employee_id: int
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


class TravelSettingUpdate(BaseModel):
    approval_workflow: Optional[str] = None
    expense_limit_per_day: Optional[Decimal] = Field(None, ge=0)
    max_trip_duration: Optional[int] = Field(None, ge=1)
    auto_approve_threshold: Optional[int] = Field(None, ge=0)
    reimbursement_deadline: Optional[int] = Field(None, ge=1)
    notification_enabled: Optional[bool] = None


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


class WfHeadcountCreate(BaseModel):
    department_id: Optional[int] = None
    fiscal_year: int = Field(..., ge=2020, le=2100)
    approved_positions: Optional[int] = 0
    filled_positions: Optional[int] = 0
    vacant_positions: Optional[int] = 0
    planned_hires: Optional[int] = 0
    projected_cost: Optional[float] = 0


class WfHeadcountUpdate(BaseModel):
    department_id: Optional[int] = None
    fiscal_year: Optional[int] = Field(None, ge=2020, le=2100)
    approved_positions: Optional[int] = None
    filled_positions: Optional[int] = None
    vacant_positions: Optional[int] = None
    planned_hires: Optional[int] = None
    projected_cost: Optional[float] = None


class WfHeadcountResponse(BaseModel):
    id: int
    organization_id: int
    department_id: Optional[int]
    fiscal_year: int
    approved_positions: Optional[int]
    filled_positions: Optional[int]
    vacant_positions: Optional[int]
    planned_hires: Optional[int]
    projected_cost: Optional[float]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class WfSuccessionCreate(BaseModel):
    employee_id: int
    successor_employee_id: Optional[int] = None
    readiness_level: Optional[str] = "not_ready"
    risk_level: Optional[str] = "medium"
    target_position: Optional[str] = None
    review_date: Optional[date] = None
    notes: Optional[str] = None


class WfSuccessionUpdate(BaseModel):
    successor_employee_id: Optional[int] = None
    readiness_level: Optional[str] = None
    risk_level: Optional[str] = None
    target_position: Optional[str] = None
    review_date: Optional[date] = None
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
    report_name: str = Field(..., min_length=1, max_length=200)
    report_type: str = Field(..., min_length=1, max_length=50)


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


class CandidateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    email: EmailStr
    phone: Optional[str] = Field(None, max_length=50)
    position: str = Field(..., min_length=1, max_length=150)
    source: Optional[str] = Field(None, max_length=100)
    status: Optional[RecruitmentCandidateStatus] = None
    location: Optional[str] = Field(None, max_length=150)
    experience: Optional[int] = Field(None, ge=0)
    resume_link: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = None
    requisition_id: Optional[int] = None


class CandidateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=150)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=50)
    position: Optional[str] = Field(None, min_length=1, max_length=150)
    source: Optional[str] = Field(None, max_length=100)
    status: Optional[RecruitmentCandidateStatus] = None
    location: Optional[str] = Field(None, max_length=150)
    experience: Optional[int] = Field(None, ge=0)
    resume_link: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = None
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
    status:          Optional[str] = "active"
    min_salary:      Optional[float] = None
    max_salary:      Optional[float] = None

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
    designation_name:  Optional[str] = None
    uploader_name:     Optional[str] = None

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
    date: Optional[date] = None

class ViolationResponse(BaseModel):
    id: int
    title: str
    violation: Optional[str]             # frontend reads v.violation
    policy: Optional[str]                # frontend reads v.policy
    employee: Optional[str]              # frontend reads v.employee
    reported_by: Optional[str]           # frontend reads v.reportedBy (fixed in service)
    severity: Optional[str]
    status: str
    date: Optional[date]                 # frontend reads v.date
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