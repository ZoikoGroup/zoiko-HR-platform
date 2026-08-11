import enum
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Column, Integer, String, Numeric, Boolean, Date, DateTime,
    Text, ForeignKey, UniqueConstraint, JSON, Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.types import TypeDecorator, VARCHAR

from app.database import Base


class CaseInsensitiveEnum(TypeDecorator):
    impl = VARCHAR
    cache_ok = True

    def __init__(self, enum_class, *args, **kwargs):
        self.enum_class = enum_class
        self._value_to_enum = {e.value.lower(): e for e in enum_class}
        self._name_to_enum = {e.name.upper(): e for e in enum_class}
        super().__init__(*args, **kwargs)

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, self.enum_class):
            return value.name
        if isinstance(value, str):
            try:
                return self.enum_class(value).name
            except ValueError:
                pass
            try:
                return self.enum_class[value.upper()].name
            except KeyError:
                pass
        raise ValueError(f"Invalid value for {self.enum_class.__name__}: {value}")

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, self.enum_class):
            return value
        val_lower = value.lower()
        if val_lower in self._value_to_enum:
            return self._value_to_enum[val_lower]
        val_upper = value.upper()
        if val_upper in self._name_to_enum:
            return self._name_to_enum[val_upper]
        try:
            return self.enum_class(value)
        except ValueError:
            raise ValueError(f"Invalid enum value for {self.enum_class.__name__}: {value}")


class EmploymentType(str, enum.Enum):
    FULL_TIME  = "full_time"
    PART_TIME  = "part_time"
    CONTRACT   = "contract"
    INTERN     = "intern"
    PROBATION  = "probation"


class EmployeeStatus(str, enum.Enum):
    ACTIVE     = "active"
    INACTIVE   = "inactive"
    PENDING    = "pending"
    ON_LEAVE   = "on_leave"
    TERMINATED = "terminated"
    RESIGNED   = "resigned"
    DEACTIVATED = "deactivated"
    SUSPENDED  = "suspended"
    LOCKED     = "locked"
    ARCHIVED   = "archived"
    PASSWORD_RESET_REQUIRED = "password_reset_required"


class UserRole(str, enum.Enum):
    SUPER_ADMIN         = "super_admin"
    ADMIN               = "admin"
    HR_ADMIN            = "hr_admin"
    BILLING_ADMIN       = "billing_admin"
    MANAGER             = "manager"
    EMPLOYEE            = "employee"


class Gender(str, enum.Enum):
    MALE   = "male"
    FEMALE = "female"
    OTHER  = "other"


class SecurityActionPurpose(str, enum.Enum):
    INVITE = "invite"
    RESET  = "reset"


class SecurityActionToken(Base):
    """Single-use, expiring token for org-admin account actions (invite setup,
    password reset). Only the SHA-256 hash of the token is stored — the raw
    token travels solely inside the emailed link.
    """
    __tablename__ = "security_action_tokens"
    __table_args__ = (
        Index("ix_security_action_tokens_token_hash", "token_hash"),
    )

    id              = Column(Integer, primary_key=True, index=True)
    email           = Column(String(255), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)
    purpose         = Column(CaseInsensitiveEnum(SecurityActionPurpose), nullable=False)
    token_hash      = Column(String(64), nullable=False)
    expires_at      = Column(DateTime, nullable=False)
    used_at         = Column(DateTime, nullable=True)
    created_at      = Column(DateTime, server_default=func.now())


class Employee(Base):
    __tablename__ = "employees"
    __table_args__ = ()

    id                  = Column(Integer, primary_key=True, index=True)
    email               = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password     = Column(String(255), nullable=False)
    employee_id         = Column(String(20), nullable=True, index=True)
    employee_code       = Column(String(20), unique=True, nullable=False)
    legacy_code         = Column(String(20), nullable=True)
    role                = Column(CaseInsensitiveEnum(UserRole), default=UserRole.EMPLOYEE, nullable=False)
    is_active           = Column(Boolean, default=True)
    first_name          = Column(String(100), nullable=False)
    last_name           = Column(String(100), nullable=False)
    phone               = Column(String(50), nullable=True)
    date_of_birth       = Column(Date, nullable=True)
    gender              = Column(CaseInsensitiveEnum(Gender), nullable=True)
    profile_picture     = Column(String(500), nullable=True)
    address             = Column(Text, nullable=True)
    job_title           = Column(String(200), nullable=False)
    employment_type     = Column(CaseInsensitiveEnum(EmploymentType), default=EmploymentType.FULL_TIME, nullable=False)
    status              = Column(CaseInsensitiveEnum(EmployeeStatus), default=EmployeeStatus.ACTIVE, nullable=False)
    date_of_joining     = Column(Date, nullable=False)
    basic_salary        = Column(Numeric(12, 2), nullable=True)
    department_id       = Column(Integer, ForeignKey("departments.id"), nullable=True)
    designation_id      = Column(Integer, ForeignKey("designations.id"), nullable=True)
    reporting_manager_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    organization_id     = Column(Integer, ForeignKey("organizations.id"), nullable=True)
    work_email          = Column(String(255), nullable=True)
    personal_email      = Column(String(255), nullable=True)
    confirmation_date   = Column(Date, nullable=True)
    company             = Column(String(200), nullable=True)
    business_unit       = Column(String(200), nullable=True)
    division            = Column(String(200), nullable=True)
    team                = Column(String(200), nullable=True)
    ctc                 = Column(Numeric(12, 2), nullable=True)
    current_address     = Column(Text, nullable=True)
    permanent_address   = Column(Text, nullable=True)
    city                = Column(String(100), nullable=True)
    state               = Column(String(100), nullable=True)
    country             = Column(String(100), nullable=True)
    pincode             = Column(String(20), nullable=True)
    emergency_contacts  = Column(JSON, default=list, nullable=True)
    created_at          = Column(DateTime, server_default=func.now())
    updated_at          = Column(DateTime, onupdate=func.now())
    created_by          = Column(Integer, ForeignKey("employees.id"), nullable=True)
    updated_by          = Column(Integer, ForeignKey("employees.id"), nullable=True)

    department     = relationship("Department", back_populates="employees")
    designation    = relationship("Designation", backref="employees")
    reporting_manager = relationship("Employee", remote_side="Employee.id", foreign_keys=[reporting_manager_id], backref="reportees")
    organization   = relationship("Organization", back_populates="employees", foreign_keys=[organization_id])
    leave_requests = relationship("LeaveRequest", back_populates="employee", foreign_keys="LeaveRequest.employee_id")
    reviewed_leave_requests = relationship("LeaveRequest", back_populates="reviewer", foreign_keys="LeaveRequest.reviewed_by")
    learning_enrollments = relationship("LearningEnrollment", back_populates="employee")
    attendance_records = relationship("AttendanceRecord", back_populates="employee")
    assets = relationship("Asset", back_populates="employee")

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"
