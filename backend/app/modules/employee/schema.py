import re
from datetime import date, datetime
from typing import Literal, Optional, List
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.modules.employee.models import (
    EmploymentType, EmployeeStatus, UserRole, Gender,
)


class DepartmentResponse(BaseModel):
    id: int
    name: str
    code: str
    description: Optional[str]
    is_active: bool
    created_at: Optional[datetime]
    organization_id: Optional[int]
    head: Optional[str]
    budget: Optional[Decimal]
    spent_budget: Optional[Decimal]
    establishment_year: Optional[int]
    parent_id: Optional[int]
    employee_count: Optional[int] = 0

    model_config = {"from_attributes": True}




LANGUAGES = ("English", "Hindi", "Telugu", "Tamil")
TIMEZONES = ("Asia/Kolkata", "UTC", "America/New_York", "Europe/London")


def _clean_notification_preferences(v):
    """{email, sms, push} as real true/false values; anything else is refused instead of being stored."""
    if v is None:
        return None
    if not isinstance(v, dict) or set(v) - {"email", "sms", "push"}:
        raise ValueError("Notification preferences must set email, sms and push to on or off.")
    out = {}
    for key in ("email", "sms", "push"):
        if key not in v or not isinstance(v[key], bool):
            raise ValueError(f"Choose on or off for {key} notifications.")
        out[key] = v[key]
    return out


def _check_choice(v, allowed, label):
    if v is None or (isinstance(v, str) and not v.strip()):
        return None
    if v not in allowed:
        raise ValueError(f"Choose a {label} from the list.")
    return v


TRAVEL_CURRENCIES = ("INR", "USD", "EUR", "GBP")
MAX_PER_DIEM = 1000000


def _clean_travel_preferences(v):
    """{currency, per_diem, auto_notify}: a currency from the list, a per-diem limit above zero (2 decimals at most)
    and a real true/false for the notify switch. Anything else is refused instead of being stored."""
    if v is None:
        return None
    if not isinstance(v, dict) or set(v) - {"currency", "per_diem", "auto_notify"}:
        raise ValueError("Travel preferences must set currency, per diem and auto-notify.")
    currency = str(v.get("currency") or "").strip().upper()
    if currency not in TRAVEL_CURRENCIES:
        raise ValueError("Choose a currency from the list.")
    raw = v.get("per_diem")
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        raise ValueError("Enter your daily per diem limit.")
    from decimal import Decimal, InvalidOperation
    try:
        amount = Decimal(str(raw).strip())
    except (InvalidOperation, ValueError):
        raise ValueError("Enter the per diem limit as a number.")
    if not amount.is_finite():
        raise ValueError("Enter the per diem limit as a number.")
    if amount <= 0:
        raise ValueError("The per diem limit must be more than zero.")
    if amount > MAX_PER_DIEM:
        raise ValueError("The per diem limit is too large.")
    if amount != amount.quantize(Decimal("0.01")):
        raise ValueError("The per diem limit can have at most 2 decimal places.")
    if not isinstance(v.get("auto_notify"), bool):
        raise ValueError("Choose on or off for auto-notify.")
    return {"currency": currency, "per_diem": float(amount), "auto_notify": v["auto_notify"]}


class EmployeeCreate(BaseModel):
    email:               EmailStr          = Field(..., example="john.doe@zoiko.com")
    # Optional: when it is left out a one-time temporary password is generated, e-mailed to the employee and shown once
    # to whoever added them; the employee must change it at first sign-in.
    password:            Optional[str]     = Field(None, min_length=8, example="SecurePass123!")
    first_name:          str               = Field(..., min_length=1, max_length=100, example="John")
    last_name:           str               = Field(..., min_length=1, max_length=100, example="Doe")
    phone:               Optional[str]     = Field(None, example="+91-9876543210")
    date_of_birth:       Optional[date]    = Field(None, example="1995-06-15")
    gender:              Optional[Gender]  = None
    job_title:           str               = Field(..., example="Software Engineer")
    employment_type:     EmploymentType    = Field(EmploymentType.FULL_TIME)
    date_of_joining:     date              = Field(..., example="2024-01-15")
    department_id:       Optional[int]     = Field(None, example=1)
    designation_id:      Optional[int]     = Field(None, example=1)
    reporting_manager_id: Optional[int]    = Field(None, example=1)
    basic_salary:        Optional[Decimal] = Field(None, example=75000.00)
    ctc:                 Optional[Decimal] = Field(None, example=1200000.00)
    role:                UserRole          = Field(UserRole.EMPLOYEE)
    work_email:          Optional[str]     = Field(None, example="john@zoikone.com")
    personal_email:      Optional[str]     = Field(None, example="john@gmail.com")
    confirmation_date:   Optional[date]    = Field(None, example="2024-07-15")
    company:             Optional[str]     = Field(None, example="ZoikoOne")
    business_unit:       Optional[str]     = Field(None, example="Enterprise")
    division:            Optional[str]     = Field(None, example="Engineering")
    team:                Optional[str]     = Field(None, example="Frontend")
    current_address:     Optional[str]     = Field(None, example="123 Main St")
    permanent_address:   Optional[str]     = Field(None, example="456 Oak Ave")
    city:                Optional[str]     = Field(None, example="Mumbai")
    state:               Optional[str]     = Field(None, example="Maharashtra")
    country:             Optional[str]     = Field(None, example="India")
    pincode:             Optional[str]     = Field(None, example="400001")

    @field_validator("email", "work_email", "personal_email", mode="after", check_fields=False)
    @classmethod
    def _v_real_email(cls, v, info):
        from app.core.email_quality import check_real_email
        return check_real_email(v, label="Email")


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
    emergency_contacts:   Optional[list[dict]]     = None
    notification_preferences: Optional[dict] = None
    language:          Optional[str]       = None
    travel_preferences: Optional[dict] = None
    timezone:          Optional[str]       = None

    @field_validator("travel_preferences", mode="before")
    @classmethod
    def _v_travel_preferences(cls, v):
        return _clean_travel_preferences(v)

    @field_validator("notification_preferences", mode="before")
    @classmethod
    def _v_notification_preferences(cls, v):
        return _clean_notification_preferences(v)

    @field_validator("language", mode="before")
    @classmethod
    def _v_language(cls, v):
        return _check_choice(v, LANGUAGES, "language")

    @field_validator("timezone", mode="before")
    @classmethod
    def _v_timezone(cls, v):
        return _check_choice(v, TIMEZONES, "timezone")

    @field_validator("emergency_contacts", mode="before")
    @classmethod
    def _v_emergency_contacts(cls, v):
        from app.core import identity_formats as f
        return f.emergency_contacts(v)

    @field_validator("work_email", "personal_email", mode="after", check_fields=False)
    @classmethod
    def _v_real_email(cls, v, info):
        from app.core.email_quality import check_real_email
        return check_real_email(v, label="Email")


CONTACT_HR_TOPICS = ("Leave balance not set up", "Leave request question", "Payroll or payslip", "Profile or documents", "Other")


class ContactHRRequest(BaseModel):
    """A message from an employee to the HR team of their organization."""
    model_config = {"extra": "forbid"}

    topic:   str
    message: str

    @field_validator("topic", mode="before")
    @classmethod
    def _v_topic(cls, v):
        if v not in CONTACT_HR_TOPICS:
            raise ValueError("Choose a topic from the list.")
        return v

    @field_validator("message", mode="before")
    @classmethod
    def _v_message(cls, v):
        text = " ".join(str(v or "").split()) if "\n" not in str(v or "") else "\n".join(ln.strip() for ln in str(v).replace("\r", "").split("\n")).strip()
        if len(text) < 10:
            raise ValueError("Write a few words so HR knows how to help (at least 10 characters).")
        if len(text) > 1000:
            raise ValueError("The message can be at most 1000 characters.")
        return text


class EmployeeSelfUpdate(BaseModel):
    """What an employee can change about THEMSELVES. Pay, role, status, department, designation, manager, job title and
    employment type are set by HR and are not accepted here, whatever the request contains."""
    model_config = {"extra": "forbid"}

    first_name:        Optional[str]       = None
    last_name:         Optional[str]       = None
    phone:             Optional[str]       = None
    date_of_birth:     Optional[date]      = None
    gender:            Optional[Gender]    = None
    personal_email:    Optional[str]       = None
    profile_picture:   Optional[str]       = None
    company:           Optional[str]       = None
    business_unit:     Optional[str]       = None
    team:              Optional[str]       = None
    address:           Optional[str]       = None
    current_address:   Optional[str]       = None
    permanent_address: Optional[str]       = None
    city:              Optional[str]       = None
    state:             Optional[str]       = None
    country:           Optional[str]       = None
    pincode:           Optional[str]       = None
    emergency_contacts: Optional[list[dict]] = None
    notification_preferences: Optional[dict] = None
    language:          Optional[str]       = None
    travel_preferences: Optional[dict] = None
    timezone:          Optional[str]       = None

    @field_validator("travel_preferences", mode="before")
    @classmethod
    def _v_travel_preferences(cls, v):
        return _clean_travel_preferences(v)

    @field_validator("notification_preferences", mode="before")
    @classmethod
    def _v_notification_preferences(cls, v):
        return _clean_notification_preferences(v)

    @field_validator("language", mode="before")
    @classmethod
    def _v_language(cls, v):
        return _check_choice(v, LANGUAGES, "language")

    @field_validator("timezone", mode="before")
    @classmethod
    def _v_timezone(cls, v):
        return _check_choice(v, TIMEZONES, "timezone")

    @field_validator("emergency_contacts", mode="before")
    @classmethod
    def _v_emergency_contacts(cls, v):
        from app.core import identity_formats as f
        return f.emergency_contacts(v)

    @field_validator("first_name", "last_name", mode="before")
    @classmethod
    def _v_name(cls, v, info):
        from app.core import identity_formats as f
        label = "First name" if info.field_name == "first_name" else "Last name"
        text = f.person_text(v, label, 100)
        if text is None:
            raise ValueError(f"{label} is required.")
        return text

    @field_validator("phone", mode="before")
    @classmethod
    def _v_phone(cls, v):
        from app.core.phone import normalize_phone
        return normalize_phone(v)

    @field_validator("date_of_birth")
    @classmethod
    def _v_dob(cls, v):
        if v is None:
            return v
        today = date.today()
        if v >= today:
            raise ValueError("Date of birth must be in the past.")
        if v.year < 1900:
            raise ValueError("Enter a valid date of birth.")
        if (today - v).days < 14 * 365:
            raise ValueError("An employee must be at least 14 years old.")
        return v

    @field_validator("personal_email", mode="before")
    @classmethod
    def _v_email(cls, v):
        text = "" if v is None else str(v).strip()
        if not text:
            return None
        if len(text) > 255 or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[A-Za-z]{2,}", text):
            raise ValueError("Enter a valid email address, for example name@yourcompany.com.")
        from app.core.email_quality import check_real_email
        return check_real_email(text, label="Personal email").lower()

    @field_validator("company", "business_unit", "team", mode="before")
    @classmethod
    def _v_work(cls, v, info):
        from app.core import identity_formats as f
        return f.free_text(v, info.field_name.replace("_", " ").capitalize(), 100)

    @field_validator("address", "current_address", "permanent_address", mode="before")
    @classmethod
    def _v_address(cls, v, info):
        from app.core import identity_formats as f
        return f.free_text(v, info.field_name.replace("_", " ").capitalize(), 500)

    @field_validator("city", "state", "country", mode="before")
    @classmethod
    def _v_place(cls, v, info):
        from app.core import identity_formats as f
        return f.person_text(v, info.field_name.capitalize(), 100, letters_only=False)

    @field_validator("pincode", mode="before")
    @classmethod
    def _v_pin(cls, v):
        from app.core import identity_formats as f
        return f.pincode(v)



def _to_camel(s: str) -> str:
    parts = s.split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


class EmployeeResponse(BaseModel):
    id:                   int
    temporary_password:   Optional[str] = None      # only present in the reply to "add employee" when one was generated
    email:                str
    organization_id:      Optional[int] = None
    role:                 UserRole
    is_active:            bool
    must_change_password: bool = False
    first_name:           str
    last_name:            str
    full_name:            str
    phone:                Optional[str] = Field(None, serialization_alias="phoneNumber")
    date_of_birth:        Optional[date]
    gender:               Optional[Gender]
    profile_picture:      Optional[str]
    employee_id:          Optional[str] = None
    employee_code:        str
    legacy_code:          Optional[str] = None
    job_title:            str
    employment_type:      EmploymentType
    status:               EmployeeStatus
    date_of_joining:      date
    basic_salary:         Optional[Decimal]
    ctc:                  Optional[Decimal]
    department_id:        Optional[int]
    designation_id:       Optional[int]
    reporting_manager_id: Optional[int]
    department:           Optional[DepartmentResponse] = None
    work_email:           Optional[str]
    personal_email:       Optional[str]
    confirmation_date:    Optional[date]
    company:              Optional[str]
    business_unit:        Optional[str]
    division:             Optional[str]
    team:                 Optional[str]
    current_address:      Optional[str]
    permanent_address:    Optional[str]
    city:                 Optional[str]
    state:                Optional[str]
    country:              Optional[str]
    pincode:              Optional[str]
    created_at:           Optional[datetime]
    created_by:           Optional[int] = None
    updated_by:           Optional[int] = None

    # Extra fields the frontend expects in camelCase
    designationName:   Optional[str] = None
    departmentName:    Optional[str] = None
    managerName:       Optional[str] = None
    title:             Optional[str] = None
    workLocation:      Optional[str] = None
    shiftTiming:       Optional[str] = None
    products:          Optional[list[str]] = None
    emergency_contacts: Optional[list[dict]] = None
    notification_preferences: Optional[dict] = None
    travel_preferences: Optional[dict] = None
    language: Optional[str] = None
    timezone: Optional[str] = None

    model_config = {
        "from_attributes": True,
        "alias_generator": _to_camel,
        "populate_by_name": True,
    }

    @model_validator(mode="before")
    @classmethod
    def _populate_extra(cls, data):
        if isinstance(data, dict):
            return data
        fields = list(cls.model_fields.keys())
        result = {f: getattr(data, f, None) for f in fields}
        if hasattr(data, "designation"):
            d = data.designation
            if d is not None:
                result["designationName"] = getattr(d, "title", None) or getattr(d, "name", None)
        if hasattr(data, "department") and data.department:
            result["departmentName"] = data.department.name
        if hasattr(data, "reporting_manager") and data.reporting_manager:
            result["managerName"] = data.reporting_manager.full_name
        if result.get("designationName"):
            result["title"] = result["designationName"]
        return result


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


class SuccessResponse(BaseModel):
    message: str


class BulkEmployeeDeleteRequest(BaseModel):
    ids: List[int] = Field(..., description="Employee IDs to delete")


class BulkDeleteResultResponse(BaseModel):
    deactivated: int = 0
    deleted: int = 0
    failed: int = 0
    total: int = 0
    errors: List[dict] = []


class LoginRequest(BaseModel):
    email: EmailStr = Field(..., example="admin@zoiko.com")
    password: str = Field(..., example="SecurePassword123")


class ForgotPasswordRequest(BaseModel):
    email: EmailStr = Field(..., example="admin@zoiko.com")


class RefreshRequest(BaseModel):
    refresh_token: str


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200, example="John Doe")
    email: EmailStr = Field(..., example="admin@company.com")
    password: str = Field(..., min_length=8, example="SecurePass123!")
    organization: str = Field(..., min_length=1, max_length=200, example="Acme Inc.")
    plan_code: Literal["core", "advanced"] = Field(
        ...,
        description="Evaluation package scope. Enterprise is contract-priced "
        "and sales-led only (Section 2) — not a valid self-serve value.",
    )
    billing_cycle: Literal["monthly", "annual"] = Field(
        "monthly",
        description="Pricing cycle used for the registration quotation emailed "
        "to the registrant (see quotation_service.create_and_send_quotation).",
    )
    product: Optional[str] = Field(None, example="payroll")
    products: Optional[List[str]] = Field(None, example=["hr", "payroll"])
    org_type: Optional[str] = Field(None, example="corporation")
    phone: Optional[str] = Field(None, example="+1-555-0100")
    address: Optional[str] = Field(None, example="123 Main St, Suite 100")
    city: Optional[str] = Field(None, example="New York")
    state: Optional[str] = Field(None, example="NY")
    country: Optional[str] = Field(None, example="US")
    timezone: Optional[str] = Field(None, example="UTC")
    industry: Optional[str] = Field(None, example="Technology")
    tax_number: Optional[str] = Field(None, example="12-3456789")
    registered_email: Optional[str] = Field(None, example="company@yourcompany.com")
    # Set when the person arrived through "Continue with Google": proof that Google already confirmed the admin address.
    google_proof: Optional[str] = Field(None, max_length=2000)

    @field_validator("email", "registered_email", mode="after", check_fields=False)
    @classmethod
    def _v_real_email(cls, v, info):
        from app.core.email_quality import check_real_email
        return check_real_email(v, label="Email")


class UserCreateRequest(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100, example="Jane")
    last_name:  str = Field(..., min_length=1, max_length=100, example="Smith")
    email:      EmailStr = Field(..., example="jane.smith@company.com")
    phone:      Optional[str] = Field(None, example="+91 9876543210")

    @field_validator("phone")
    @classmethod
    def _valid_phone(cls, v):
        from app.core.phone import normalize_phone
        return normalize_phone(v)
    role:       UserRole = Field(..., example="hr_admin")
    job_title:  Optional[str] = Field(None, max_length=150, example="Software Engineer")
    organization_id: Optional[int] = Field(None, description="Target organization (Super Admin only)")
    confirm_super_admin: bool = Field(False, description="Must be true to create a Super Admin")
    # Everything the bulk import accepts, so adding one person captures the same information.
    date_of_joining: Optional[date] = None
    date_of_birth: Optional[date] = None
    confirmation_date: Optional[date] = None
    gender: Optional[Gender] = None
    employment_type: Optional[EmploymentType] = None
    status: Optional[Literal["active", "inactive", "pending"]] = None
    department_name: Optional[str] = Field(None, max_length=150, description="Created if it does not exist yet")
    designation_name: Optional[str] = Field(None, max_length=150, description="Created if it does not exist yet")
    work_email: Optional[str] = Field(None, max_length=254)
    personal_email: Optional[str] = Field(None, max_length=254)
    company: Optional[str] = Field(None, max_length=150)
    business_unit: Optional[str] = Field(None, max_length=150)
    division: Optional[str] = Field(None, max_length=150)
    team: Optional[str] = Field(None, max_length=150)
    current_address: Optional[str] = Field(None, max_length=500)
    permanent_address: Optional[str] = Field(None, max_length=500)
    address: Optional[str] = Field(None, max_length=500)
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=100)
    country: Optional[str] = Field(None, max_length=100)
    pincode: Optional[str] = Field(None, max_length=20)
    basic_salary: Optional[Decimal] = Field(None, ge=0)
    ctc: Optional[Decimal] = Field(None, ge=0)
    pan_number: Optional[str] = Field(None, max_length=20)
    uan_number: Optional[str] = Field(None, max_length=20)
    bank_account: Optional[str] = Field(None, max_length=50)
    bank_ifsc: Optional[str] = Field(None, max_length=20)

    @field_validator("email", "work_email", "personal_email", mode="after", check_fields=False)
    @classmethod
    def _v_real_email(cls, v, info):
        from app.core.email_quality import check_real_email
        return check_real_email(v, label="Email")


class UserUpdateRequest(BaseModel):
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name:  Optional[str] = Field(None, min_length=1, max_length=100)
    phone:      Optional[str] = None
    role:       Optional[UserRole] = None
    job_title:  Optional[str] = Field(None, max_length=150)
    is_active:  Optional[bool] = None
    confirm_super_admin: bool = False
    # Same extra fields as UserCreateRequest so an existing user can be fully edited.
    date_of_birth: Optional[date] = None
    confirmation_date: Optional[date] = None
    gender: Optional[Gender] = None
    employment_type: Optional[EmploymentType] = None
    status: Optional[Literal["active", "inactive", "pending"]] = None
    department_name: Optional[str] = Field(None, max_length=150, description="Created if it does not exist yet")
    designation_name: Optional[str] = Field(None, max_length=150, description="Created if it does not exist yet")
    work_email: Optional[str] = Field(None, max_length=254)
    personal_email: Optional[str] = Field(None, max_length=254)
    company: Optional[str] = Field(None, max_length=150)
    business_unit: Optional[str] = Field(None, max_length=150)
    division: Optional[str] = Field(None, max_length=150)
    team: Optional[str] = Field(None, max_length=150)
    current_address: Optional[str] = Field(None, max_length=500)
    permanent_address: Optional[str] = Field(None, max_length=500)
    address: Optional[str] = Field(None, max_length=500)
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=100)
    country: Optional[str] = Field(None, max_length=100)
    pincode: Optional[str] = Field(None, max_length=20)
    basic_salary: Optional[Decimal] = Field(None, ge=0)
    ctc: Optional[Decimal] = Field(None, ge=0)
    pan_number: Optional[str] = Field(None, max_length=20)
    uan_number: Optional[str] = Field(None, max_length=20)
    bank_account: Optional[str] = Field(None, max_length=50)
    bank_ifsc: Optional[str] = Field(None, max_length=20)

    @field_validator("work_email", "personal_email", mode="after", check_fields=False)
    @classmethod
    def _v_real_email(cls, v, info):
        from app.core.email_quality import check_real_email
        return check_real_email(v, label="Email")


class UserResponse(BaseModel):
    id:            int
    email:         str
    role:          UserRole
    is_active:     bool
    first_name:    str
    last_name:     str
    full_name:     str
    phone:         Optional[str]
    employee_id:   Optional[str] = None
    employee_code: str
    status:        EmployeeStatus
    job_title:     Optional[str] = None
    department:    Optional[str] = None
    created_at:    Optional[datetime]
    updated_at:    Optional[datetime]
    created_by:    Optional[int] = None
    updated_by:    Optional[int] = None
    # Full employee + profile details so the edit/view forms can be prefilled.
    date_of_birth:        Optional[date] = None
    date_of_joining:      Optional[date] = None
    confirmation_date:    Optional[date] = None
    gender:               Optional[Gender] = None
    employment_type:      Optional[EmploymentType] = None
    department_id:        Optional[int] = None
    designation_id:       Optional[int] = None
    designation:          Optional[str] = None
    work_email:           Optional[str] = None
    personal_email:       Optional[str] = None
    company:              Optional[str] = None
    business_unit:        Optional[str] = None
    division:             Optional[str] = None
    team:                 Optional[str] = None
    current_address:      Optional[str] = None
    permanent_address:    Optional[str] = None
    address:              Optional[str] = None
    city:                 Optional[str] = None
    state:                Optional[str] = None
    country:              Optional[str] = None
    pincode:              Optional[str] = None
    basic_salary:         Optional[Decimal] = None
    ctc:                  Optional[Decimal] = None
    pan_number:           Optional[str] = None
    uan_number:           Optional[str] = None
    bank_account:         Optional[str] = None
    bank_ifsc:            Optional[str] = None

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _populate_extra(cls, data):
        if isinstance(data, dict):
            return data
        result = {f: getattr(data, f, None) for f in cls.model_fields}
        desig = getattr(data, "designation", None)
        if desig is not None:
            result["designation"] = getattr(desig, "title", None) or getattr(desig, "name", None)
        profile = getattr(data, "_profile", None)
        if profile is not None:
            for field in ("pan_number", "uan_number", "bank_account", "bank_ifsc"):
                result[field] = getattr(profile, field, None)
        return result

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


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, example="OldPass123!")
    new_password:     str = Field(..., min_length=8, example="NewSecurePass456!")


class PasswordResetRequest(BaseModel):
    method: Literal["link", "temporary"] = "link"


class PasswordResetResponse(BaseModel):
    message:           str
    temporary_password: Optional[str] = None
    method:            str = "link"


class TokenPasswordRequest(BaseModel):
    token:    str = Field(..., min_length=1, description="Single-use token from the emailed link")
    password: str = Field(..., min_length=8, max_length=128, example="NewSecurePass456!")


# ═══════════════════════════════════════════════════════════════════════════════
# Employee Management Schemas (moved from hr/schemas)
# ═══════════════════════════════════════════════════════════════════════════════

class ChangeManagerRequest(BaseModel):
    employee_id: int
    new_manager_id: int
    effective_date: date
    reason: Optional[str] = None

class ConfirmProbationRequest(BaseModel):
    employee_id: int
    confirmation_date: date
    notes: Optional[str] = None

class EmployeeAnalyticsResponse(BaseModel):
    total_employees: int
    active_employees: int
    avg_tenure_months: float
    turnover_rate: float
    department_growth: list[dict]
    monthly_hiring_trend: list[dict]
    monthly_exit_trend: list[dict]
    probation_completion_rate: float
    promotion_rate: float
    transfer_rate: float

class EmployeeBenefitCreate(BaseModel):
    employee_id: int
    benefit_id: int
    coverage_start_date: Optional[date] = None
    coverage_end_date: Optional[date] = None

class EmployeeBenefitResponse(EmployeeBenefitCreate):
    id: int
    created_at: datetime
    updated_at: Optional[datetime]
    model_config = {"from_attributes": True}

class EmployeeCompensationCreate(BaseModel):
    employee_id: int
    structure_id: int
    pay_grade_id: Optional[int] = None
    band_id: Optional[int] = None
    effective_date: date

class EmployeeCompensationResponse(EmployeeCompensationCreate):
    id: int
    created_at: datetime
    updated_at: Optional[datetime]
    model_config = {"from_attributes": True}

class EmployeeCompensationUpdate(BaseModel):
    structure_id: Optional[int] = None
    pay_grade_id: Optional[int] = None
    band_id: Optional[int] = None
    effective_date: Optional[date] = None

class EmployeeDashboardResponse(BaseModel):
    total_employees: int = 0
    active_employees: int = 0
    inactive_employees: int = 0
    on_probation: int = 0
    new_hires_this_month: int = 0
    exits_this_month: int = 0
    department_distribution: list[dict] = []
    designation_distribution: list[dict] = []
    location_distribution: list[dict] = []
    lifecycle_events: list[dict] = []
    upcoming_probation_end: list[dict] = []
    upcoming_confirmations: list[dict] = []
    upcoming_anniversaries: list[dict] = []

class EmployeeExportRequest(BaseModel):
    report_type: str
    format: str
    filters: Optional[dict] = None

class EmployeeHistoryResponse(BaseModel):
    id: int
    employee_id: int
    organization_id: int
    field_name: str
    old_value: Optional[str]
    new_value: Optional[str]
    changed_by: Optional[int]
    change_reason: Optional[str]
    created_at: Optional[datetime]
    changer_name: Optional[str] = None

    model_config = {"from_attributes": True}

class EmployeeLifecycleCreate(BaseModel):
    employee_id: int
    organization_id: int
    event_type: str
    event_date: date
    effective_date: Optional[date] = None
    previous_value: Optional[dict] = None
    new_value: Optional[dict] = None
    reason: Optional[str] = None
    initiated_by: Optional[int] = None
    approved_by: Optional[int] = None
    status: str = "pending"
    documents: Optional[dict] = None
    notes: Optional[str] = None

class EmployeeLifecycleResponse(BaseModel):
    id: int
    employee_id: int
    organization_id: int
    event_type: str
    event_date: date
    effective_date: Optional[date]
    previous_value: Optional[dict]
    new_value: Optional[dict]
    reason: Optional[str]
    initiated_by: Optional[int]
    approved_by: Optional[int]
    status: str
    documents: Optional[dict]
    notes: Optional[str]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    employee_name: Optional[str] = None
    initiator_name: Optional[str] = None
    approver_name: Optional[str] = None

    model_config = {"from_attributes": True}

class EmployeeLifecycleUpdate(BaseModel):
    event_type: Optional[str] = None
    event_date: Optional[date] = None
    effective_date: Optional[date] = None
    previous_value: Optional[dict] = None
    new_value: Optional[dict] = None
    reason: Optional[str] = None
    initiated_by: Optional[int] = None
    approved_by: Optional[int] = None
    status: Optional[str] = None
    documents: Optional[dict] = None
    notes: Optional[str] = None

class EmployeeOrgChartResponse(BaseModel):
    employees: list[dict]
    reporting_lines: list[dict]

def _profile_rules():
    from app.core import identity_formats as f
    from app.core.phone import normalize_phone
    return {
        "pan_number": f.pan_number, "aadhar_number": f.aadhar_number, "bank_account": f.bank_account, "bank_ifsc": f.ifsc_code,
        "bank_name": f.bank_name, "uan_number": f.uan_number, "esic_number": f.esic_number, "pf_number": f.pf_number,
        "passport_number": f.passport_number, "visa_number": f.visa_number, "blood_group": f.blood_group, "marital_status": f.marital_status,
        "emergency_contact_phone": normalize_phone,
        "emergency_contact_name": lambda v: f.person_text(v, "Emergency contact name", 100),
        "emergency_contact_relation": lambda v: f.person_text(v, "Relation", 50),
        "nationality": lambda v: f.person_text(v, "Nationality", 50),
        "religion": lambda v: f.person_text(v, "Religion", 50),
        "skills": lambda v: f.free_text(v, "Skills"), "certifications": lambda v: f.free_text(v, "Certifications"),
        "projects": lambda v: f.free_text(v, "Projects"), "achievements": lambda v: f.free_text(v, "Achievements"),
        "notes": lambda v: f.free_text(v, "Notes", 5000),
    }


class _ProfileChecks(BaseModel):
    """Banking and identity details are checked for their format and stored cleaned up (capitals, no spaces); a blank
    box clears the stored value."""
    @field_validator(
        "pan_number", "aadhar_number", "bank_account", "bank_ifsc", "bank_name", "uan_number", "esic_number", "pf_number",
        "passport_number", "visa_number", "blood_group", "marital_status", "emergency_contact_phone", "emergency_contact_name",
        "emergency_contact_relation", "nationality", "religion", "skills", "certifications", "projects", "achievements", "notes",
        mode="before", check_fields=False,
    )
    @classmethod
    def _v_profile_field(cls, v, info):
        return _profile_rules()[info.field_name](v)

    @field_validator("passport_expiry", "visa_expiry", "work_permit_expiry", check_fields=False)
    @classmethod
    def _v_expiry(cls, v, info):
        from app.core import identity_formats as f
        label = {"passport_expiry": "Passport expiry", "visa_expiry": "Visa expiry", "work_permit_expiry": "Work permit expiry"}[info.field_name]
        return f.expiry_date(v, label)



class EmployeeProfileCreate(_ProfileChecks):
    employee_id: int
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    blood_group: Optional[str] = None
    marital_status: Optional[str] = None
    nationality: Optional[str] = None
    religion: Optional[str] = None
    pan_number: Optional[str] = None
    aadhar_number: Optional[str] = None
    uan_number: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    bank_ifsc: Optional[str] = None
    pf_number: Optional[str] = None
    esic_number: Optional[str] = None
    passport_number: Optional[str] = None
    passport_expiry: Optional[date] = None
    visa_number: Optional[str] = None
    visa_expiry: Optional[date] = None
    work_permit_expiry: Optional[date] = None
    skills: Optional[str] = None
    certifications: Optional[str] = None
    projects: Optional[str] = None
    achievements: Optional[str] = None
    notes: Optional[str] = None
    organization_id: int

class EmployeeProfileResponse(BaseModel):
    id: int
    employee_id: int
    organization_id: int
    emergency_contact_name: Optional[str]
    emergency_contact_phone: Optional[str]
    emergency_contact_relation: Optional[str]
    blood_group: Optional[str]
    marital_status: Optional[str]
    nationality: Optional[str]
    religion: Optional[str]
    pan_number: Optional[str]
    aadhar_number: Optional[str]
    uan_number: Optional[str]
    bank_name: Optional[str]
    bank_account: Optional[str]
    bank_ifsc: Optional[str]
    pf_number: Optional[str]
    esic_number: Optional[str]
    passport_number: Optional[str]
    passport_expiry: Optional[date]
    visa_number: Optional[str]
    visa_expiry: Optional[date]
    work_permit_expiry: Optional[date]
    skills: Optional[str]
    certifications: Optional[str]
    projects: Optional[str]
    achievements: Optional[str]
    notes: Optional[str]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}

class EmployeeProfileUpdate(_ProfileChecks):
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    blood_group: Optional[str] = None
    marital_status: Optional[str] = None
    nationality: Optional[str] = None
    religion: Optional[str] = None
    pan_number: Optional[str] = None
    aadhar_number: Optional[str] = None
    uan_number: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    bank_ifsc: Optional[str] = None
    pf_number: Optional[str] = None
    esic_number: Optional[str] = None
    passport_number: Optional[str] = None
    passport_expiry: Optional[date] = None
    visa_number: Optional[str] = None
    visa_expiry: Optional[date] = None
    work_permit_expiry: Optional[date] = None
    skills: Optional[str] = None
    certifications: Optional[str] = None
    projects: Optional[str] = None
    achievements: Optional[str] = None
    notes: Optional[str] = None

class EmployeeReportRequest(BaseModel):
    report_type: str
    filters: Optional[dict] = None
    format: str = "csv"

class EmployeeReportingCreate(BaseModel):
    employee_id: int
    organization_id: int
    manager_id: Optional[int] = None
    dotted_manager_id: Optional[int] = None
    department_id: Optional[int] = None
    designation_id: Optional[int] = None
    reporting_level: int = 1
    team_size: int = 0
    cost_center: Optional[str] = None
    location: Optional[str] = None
    is_direct_report: bool = True
    effective_from: date
    effective_to: Optional[date] = None

class EmployeeReportingResponse(BaseModel):
    id: int
    employee_id: int
    organization_id: int
    manager_id: Optional[int]
    dotted_manager_id: Optional[int]
    department_id: Optional[int]
    designation_id: Optional[int]
    reporting_level: int
    team_size: int
    cost_center: Optional[str]
    location: Optional[str]
    is_direct_report: bool
    effective_from: date
    effective_to: Optional[date]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    manager_name: Optional[str] = None
    dotted_manager_name: Optional[str] = None
    department_name: Optional[str] = None

    model_config = {"from_attributes": True}

class EmployeeReportingUpdate(BaseModel):
    manager_id: Optional[int] = None
    dotted_manager_id: Optional[int] = None
    department_id: Optional[int] = None
    designation_id: Optional[int] = None
    reporting_level: Optional[int] = None
    team_size: Optional[int] = None
    cost_center: Optional[str] = None
    location: Optional[str] = None
    is_direct_report: Optional[bool] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None

class ExitEmployeeRequest(BaseModel):
    employee_id: int
    exit_date: date
    exit_type: str
    reason: Optional[str] = None
    final_settlement_date: Optional[date] = None

class PromoteEmployeeRequest(BaseModel):
    employee_id: int
    new_designation_id: int
    new_salary: Optional[Decimal] = None
    effective_date: date
    reason: Optional[str] = None

class ResignationRequest(BaseModel):
    employee_id: int
    resignation_date: date
    last_working_date: date
    reason: Optional[str] = None
    notice_period_days: Optional[int] = None

class TransferEmployeeRequest(BaseModel):
    employee_id: int
    new_department_id: int
    new_manager_id: Optional[int] = None
    new_location: Optional[str] = None
    effective_date: date
    reason: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════════════════
# EMPLOYEE IMPORT
# ═══════════════════════════════════════════════════════════════════════════════

class ImportErrorRow(BaseModel):
    row: int
    employee_id: Optional[str] = None
    email: Optional[str] = None
    error: str


class ImportResultResponse(BaseModel):
    total_rows: int = 0
    created: int = 0
    updated: int = 0
    skipped: int = 0
    failed: int = 0
    departments_created: int = 0
    designations_created: int = 0
    errors: list[ImportErrorRow] = []

