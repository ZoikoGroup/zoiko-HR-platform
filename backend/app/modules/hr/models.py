"""
modules/hr/models.py
--------------------
SQLAlchemy models (tables) + enum classes for the HR module.
"""

import enum
from datetime import datetime, date
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    Column, Integer, String, Numeric, Boolean, Date, DateTime,
    Text, Enum, ForeignKey, Float, JSON, Time, UniqueConstraint,
)
from sqlalchemy.orm import Session, relationship
from sqlalchemy.sql import func

from app.database import Base

from app.modules.employee.models import (
    CaseInsensitiveEnum, EmploymentType, EmployeeStatus, UserRole, Gender, Employee,
)


class OrganizationStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    ACTIVE = "active"
    ON_HOLD = "on_hold"
    REJECTED = "rejected"
    SUSPENDED = "suspended"
    DEACTIVATED = "deactivated"

class AttendanceStatus(str, enum.Enum):
    PRESENT = "present"
    ABSENT  = "absent"
    ON_LEAVE = "on_leave"
    HOLIDAY = "holiday"
    REMOTE  = "remote"
    HALF_DAY = "half_day"
    LATE    = "late"

class LeaveType(str, enum.Enum):
    SICK     = "sick"
    CASUAL   = "casual"
    ANNUAL   = "annual"
    MATERNITY = "maternity"
    PATERNITY = "paternity"
    UNPAID   = "unpaid"
    OTHER    = "other"
    EMERGENCY = "emergency"
    STUDY    = "study"
    EARNED   = "earned"
    COMP_OFF = "comp_off"
    SABBATICAL = "sabbatical"
    BEREAVEMENT = "bereavement"
    WORK_FROM_HOME = "work_from_home"

class RequestStatus(str, enum.Enum):
    PENDING     = "pending"
    IN_PROGRESS = "in_progress"
    APPROVED    = "approved"
    REJECTED    = "rejected"
    CANCELLED   = "cancelled"
    COMPLETED   = "completed"

class AssetStatus(str, enum.Enum):
    AVAILABLE   = "available"
    ASSIGNED    = "assigned"
    MAINTENANCE = "maintenance"
    RETIRED     = "retired"
    LOST        = "lost"
    BROKEN      = "broken"

class AssetCondition(str, enum.Enum):
    NEW        = "new"
    GOOD       = "good"
    FAIR       = "fair"
    POOR       = "poor"
    DAMAGED    = "damaged"

class MaintenancePriority(str, enum.Enum):
    LOW    = "low"
    MEDIUM = "medium"
    HIGH   = "high"
    URGENT = "urgent"

class MaintenanceStatus(str, enum.Enum):
    OPEN       = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED   = "resolved"
    CANCELLED  = "cancelled"

class RequestPriority(str, enum.Enum):
    LOW    = "low"
    MEDIUM = "medium"
    HIGH   = "high"

class AssetRequestStatus(str, enum.Enum):
    PENDING   = "pending"
    APPROVED  = "approved"
    REJECTED  = "rejected"
    FULFILLED = "fulfilled"
    CANCELLED = "cancelled"

class OnboardingStatus(str, enum.Enum):
    OFFER_SENT     = "offer_sent"
    OFFER_ACCEPTED = "offer_accepted"
    PRE_JOINING    = "pre_joining"
    IN_PROGRESS    = "in_progress"
    COMPLETED      = "completed"
    CANCELLED      = "cancelled"

class ShiftType(str, enum.Enum):
    GENERAL = "general"
    MORNING = "morning"
    EVENING = "evening"
    NIGHT   = "night"
    FLEXI   = "flexi"


# ═══════════════════════════════════════════════════════════════════════════════
# AUTHORIZATION & ORGANIZATION
# ═══════════════════════════════════════════════════════════════════════════════

class Organization(Base):
    __tablename__ = "organizations"

    id                = Column(Integer, primary_key=True, index=True)
    uuid              = Column(String(36), unique=True, nullable=True, index=True)
    organization_code = Column(String(10), unique=True, nullable=True, index=True)
    organization_name = Column(String(200), nullable=True)
    display_name      = Column(String(200), nullable=True)
    language          = Column(String(10), default="en", nullable=True)
    website           = Column(String(255), nullable=True)
    logo_url          = Column(String(500), nullable=True)
    is_active         = Column(Boolean, default=True)
    status            = Column(CaseInsensitiveEnum(OrganizationStatus), default=OrganizationStatus.PENDING, nullable=False)
    approved_by       = Column(Integer, ForeignKey("employees.id"), nullable=True)
    approved_at       = Column(DateTime, nullable=True)
    rejection_reason  = Column(Text, nullable=True)
    suspended_at      = Column(DateTime, nullable=True)
    on_hold_at        = Column(DateTime, nullable=True)
    reactivated_at    = Column(DateTime, nullable=True)
    created_at        = Column(DateTime, server_default=func.now())
    updated_at        = Column(DateTime, onupdate=func.now())
    domain            = Column(String(255), nullable=True)
    address           = Column(Text, nullable=True)
    country           = Column(String(100), nullable=True)
    state             = Column(String(100), nullable=True)
    city              = Column(String(100), nullable=True)
    timezone          = Column(String(100), default="UTC")
    currency          = Column(String(3), default="USD")
    industry          = Column(String(200), nullable=True)
    employee_id_prefix = Column(String(10), nullable=True)

    @property
    def name(self):
        """Legacy alias for the org's display name. The old `name` column was
        never created in the database; `organization_name`/`display_name` are
        the real columns. Kept as a property so existing `org.name` reads and
        writes keep working without touching every caller."""
        return self.organization_name or self.display_name or ""

    @name.setter
    def name(self, value):
        self.organization_name = value

    @property
    def code(self):
        """Legacy alias for `organization_code` (the old `code` column was
        never created in the database)."""
        return self.organization_code or ""

    @code.setter
    def code(self, value):
        self.organization_code = value

    employees         = relationship("Employee", back_populates="organization", foreign_keys="Employee.organization_id")
    approver          = relationship("Employee", foreign_keys=[approved_by])


# ═══════════════════════════════════════════════════════════════════════════════
# DEPARTMENT
# ═══════════════════════════════════════════════════════════════════════════════
# modules/hr/models.py

class Department(Base):
    __tablename__ = "departments"

    id                 = Column(Integer, primary_key=True, index=True)
    name               = Column(String(100), nullable=False)
    code               = Column(String(20), nullable=False, unique=True)
    department_code    = Column(String(20), nullable=True, unique=True)
    description        = Column(Text, nullable=True)
    is_active          = Column(Boolean, default=True)
    created_at         = Column(DateTime, server_default=func.now())
    
    # ── Missing Fields Causing Frontend Bugs ──
    head               = Column(String(100), nullable=True)
    budget             = Column(Numeric(12, 2), default=0.00, nullable=True)
    spent_budget       = Column(Numeric(12, 2), default=0.00, nullable=True)
    establishment_year = Column(Integer, nullable=True)
    parent_id          = Column(Integer, ForeignKey("departments.id"), nullable=True)

    organization_id    = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)

    employees          = relationship("Employee", back_populates="department")
    organization       = relationship("Organization")


# ═══════════════════════════════════════════════════════════════════════════════
# ATTENDANCE
# ═══════════════════════════════════════════════════════════════════════════════

class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id          = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    date        = Column(Date, nullable=False, index=True)
    status      = Column(Enum(AttendanceStatus), default=AttendanceStatus.PRESENT, nullable=False)
    check_in    = Column(DateTime, nullable=True)
    check_out   = Column(DateTime, nullable=True)
    break_start = Column(DateTime, nullable=True)
    break_end   = Column(DateTime, nullable=True)
    total_hours = Column(Numeric(5, 2), nullable=True)
    notes       = Column(Text, nullable=True)
    is_deleted  = Column(Boolean, default=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    created_at  = Column(DateTime, server_default=func.now())
    updated_at  = Column(DateTime, onupdate=func.now())

    employee    = relationship("Employee", back_populates="attendance_records")
    organization = relationship("Organization")


class Shift(Base):
    __tablename__ = "shifts"

    id                    = Column(Integer, primary_key=True, index=True)
    name                  = Column(String(100), nullable=False)
    shift_type            = Column(Enum(ShiftType), default=ShiftType.GENERAL, nullable=False)
    start_time            = Column(String(5), nullable=False)
    end_time              = Column(String(5), nullable=False)
    grace_time_minutes    = Column(Integer, default=0)
    break_duration_minutes= Column(Integer, default=60)
    is_overtime_eligible  = Column(Boolean, default=True)
    requires_attendance   = Column(Boolean, default=True)
    description           = Column(Text, nullable=True)
    is_active             = Column(Boolean, default=True)
    organization_id       = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    created_at            = Column(DateTime, server_default=func.now())
    updated_at            = Column(DateTime, onupdate=func.now())


class ShiftRoster(Base):
    __tablename__ = "shift_rosters"

    id          = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    shift_id    = Column(Integer, ForeignKey("shifts.id"), nullable=False)
    date        = Column(Date, nullable=False)
    is_active   = Column(Boolean, default=True)
    assigned_by = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at  = Column(DateTime, server_default=func.now())
    updated_at  = Column(DateTime, onupdate=func.now())


class Holiday(Base):
    __tablename__ = "holidays"

    id             = Column(Integer, primary_key=True, index=True)
    name           = Column(String(150), nullable=False)
    date           = Column(Date, nullable=False)
    type           = Column(String(50), default="public")
    is_recurring   = Column(Boolean, default=False)
    description    = Column(Text, nullable=True)
    is_active      = Column(Boolean, default=True)
    created_by     = Column(Integer, ForeignKey("employees.id"), nullable=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    created_at     = Column(DateTime, server_default=func.now())
    updated_at     = Column(DateTime, onupdate=func.now())


# ═══════════════════════════════════════════════════════════════════════════════
# LEAVE
# ═══════════════════════════════════════════════════════════════════════════════

class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    id              = Column(Integer, primary_key=True, index=True)
    employee_id     = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    leave_type      = Column(Enum(LeaveType), nullable=False)
    start_date      = Column(Date, nullable=False)
    end_date        = Column(Date, nullable=False)
    days            = Column(Integer, nullable=False, default=1)
    reason          = Column(Text, nullable=True)
    status          = Column(Enum(RequestStatus), default=RequestStatus.PENDING, nullable=False)
    reviewed_by     = Column(Integer, ForeignKey("employees.id"), nullable=True)
    reviewed_at     = Column(DateTime, nullable=True)
    created_at      = Column(DateTime, server_default=func.now())
    updated_at      = Column(DateTime, server_default=func.now(), onupdate=func.now())

    employee = relationship("Employee", back_populates="leave_requests", foreign_keys=[employee_id])
    reviewer = relationship("Employee", back_populates="reviewed_leave_requests", foreign_keys=[reviewed_by])


class LeaveTypeConfig(Base):
    __tablename__ = "leave_type_configs"
    __table_args__ = (
        UniqueConstraint("organization_id", "code", name="uq_org_leave_type_config_code"),
    )

    id                  = Column(Integer, primary_key=True, index=True)
    organization_id     = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    name                = Column(String(100), nullable=False)
    code                = Column(String(100), nullable=False)
    default_days_per_year = Column(Integer, nullable=False, default=0)
    carry_forward_allowed  = Column(Boolean, default=False)
    carry_forward_max_days = Column(Integer, nullable=True)
    min_notice_days     = Column(Integer, nullable=True)
    max_consecutive_days = Column(Integer, nullable=True)
    requires_approval   = Column(Boolean, default=True)
    is_active           = Column(Boolean, default=True)
    color               = Column(String(7), nullable=True)
    icon                = Column(String(50), nullable=True)
    created_at          = Column(DateTime, server_default=func.now())
    updated_at          = Column(DateTime, server_default=func.now(), onupdate=func.now())


class LeaveSetting(Base):
    __tablename__ = "leave_settings"

    id                  = Column(Integer, primary_key=True, index=True)
    organization_id     = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True, unique=True)
    working_days        = Column(JSON, nullable=False, default=list)
    leave_year_start    = Column(Date, nullable=True)
    max_consecutive_days = Column(Integer, nullable=True)
    carry_forward_limit  = Column(Integer, default=0)
    approval_workflow   = Column(String(20), default="manager")
    escalation_days     = Column(Integer, default=3)
    auto_approve_days   = Column(Integer, default=1)
    notification_on_submit  = Column(Boolean, default=True)
    notification_on_approve = Column(Boolean, default=True)
    notification_on_reject  = Column(Boolean, default=True)
    created_at          = Column(DateTime, server_default=func.now())
    updated_at          = Column(DateTime, server_default=func.now(), onupdate=func.now())


class LeaveBalance(Base):
    __tablename__ = "leave_balances"

    id              = Column(Integer, primary_key=True, index=True)
    employee_id     = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    leave_type      = Column(Enum(LeaveType), nullable=False)
    total_days      = Column(Integer, nullable=False, default=0)
    used_days       = Column(Integer, nullable=False, default=0)
    pending_days    = Column(Integer, nullable=False, default=0)
    year            = Column(Integer, nullable=False)
    created_at      = Column(DateTime, server_default=func.now())
    updated_at      = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("employee_id", "leave_type", "year", name="uq_employee_leave_year"),
    )


# ═══════════════════════════════════════════════════════════════════════════════
# ASSETS
# ═══════════════════════════════════════════════════════════════════════════════

class Asset(Base):
    __tablename__ = "assets"

    id            = Column(Integer, primary_key=True, index=True)
    employee_id   = Column(Integer, ForeignKey("employees.id"), nullable=True, index=True)
    name          = Column(String(150), nullable=False)
    asset_tag     = Column(String(100), nullable=False, unique=True)
    category      = Column(String(100), nullable=True)
    serial_number = Column(String(200), nullable=True)
    department    = Column(String(100), nullable=True)
    assigned_date = Column(Date, nullable=True)
    purchase_date = Column(Date, nullable=True)
    purchase_cost = Column(Numeric(12, 2), nullable=True)
    condition     = Column(Enum(AssetCondition), nullable=True)
    status        = Column(Enum(AssetStatus), default=AssetStatus.AVAILABLE, nullable=False)
    notes         = Column(Text, nullable=True)
    deleted_at    = Column(DateTime, nullable=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    created_at    = Column(DateTime, server_default=func.now())
    updated_at    = Column(DateTime, onupdate=func.now())

    employee      = relationship("Employee", back_populates="assets")


class AssetMaintenanceRequest(Base):
    __tablename__ = "asset_maintenance_requests"

    id            = Column(Integer, primary_key=True, index=True)
    asset_id      = Column(Integer, ForeignKey("assets.id"), nullable=False, index=True)
    asset_name    = Column(String(150), nullable=True)
    asset_tag     = Column(String(100), nullable=True)
    issue         = Column(Text, nullable=False)
    priority      = Column(Enum(MaintenancePriority), default=MaintenancePriority.MEDIUM, nullable=False)
    reported_by   = Column(String(150), nullable=True)
    reported_by_id= Column(Integer, ForeignKey("employees.id"), nullable=True)
    reported_on   = Column(Date, nullable=False)
    status        = Column(Enum(MaintenanceStatus), default=MaintenanceStatus.OPEN, nullable=False)
    resolution    = Column(Text, nullable=True)
    resolved_by   = Column(Integer, ForeignKey("employees.id"), nullable=True)
    resolved_on   = Column(DateTime, nullable=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    created_at    = Column(DateTime, server_default=func.now())
    updated_at    = Column(DateTime, onupdate=func.now())


class AssetRequest(Base):
    __tablename__ = "asset_requests"

    id            = Column(Integer, primary_key=True, index=True)
    employee_id   = Column(Integer, ForeignKey("employees.id"), nullable=True)
    employee_name = Column(String(150), nullable=True)
    asset_type    = Column(String(100), nullable=False)
    quantity      = Column(Integer, default=1)
    priority      = Column(Enum(RequestPriority), default=RequestPriority.MEDIUM, nullable=False)
    reason        = Column(Text, nullable=True)
    notes         = Column(Text, nullable=True)
    status        = Column(Enum(AssetRequestStatus), default=AssetRequestStatus.PENDING, nullable=False)
    requested_on  = Column(Date, nullable=False)
    approved_by   = Column(Integer, ForeignKey("employees.id"), nullable=True)
    approved_on   = Column(DateTime, nullable=True)
    fulfilled_on  = Column(DateTime, nullable=True)
    cancelled_on  = Column(DateTime, nullable=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    created_at    = Column(DateTime, server_default=func.now())
    updated_at    = Column(DateTime, onupdate=func.now())


class AssetCategory(Base):
    __tablename__ = "asset_categories"

    id             = Column(Integer, primary_key=True, index=True)
    name           = Column(String(100), nullable=False, unique=True)
    description    = Column(Text, nullable=True)
    is_active      = Column(Boolean, default=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    created_at     = Column(DateTime, server_default=func.now())


class AssetReport(Base):
    __tablename__ = "asset_reports"

    id           = Column(Integer, primary_key=True, index=True)
    report_type  = Column(String(50), nullable=False)
    title        = Column(String(200), nullable=False)
    description  = Column(Text, nullable=True)
    generated_by = Column(Integer, ForeignKey("employees.id"), nullable=True)
    parameters   = Column(JSON, nullable=True)
    file_url     = Column(String(500), nullable=True)
    created_at   = Column(DateTime, server_default=func.now())


class AssetSetting(Base):
    __tablename__ = "asset_settings"

    id            = Column(Integer, primary_key=True, index=True)
    setting_key   = Column(String(100), nullable=False, unique=True)
    setting_value = Column(Text, nullable=True)
    updated_at    = Column(DateTime, onupdate=func.now())


# ═══════════════════════════════════════════════════════════════════════════════
# COMPENSATION – Pay Grades
# ═══════════════════════════════════════════════════════════════════════════════

class PayGrade(Base):
    __tablename__ = "pay_grades"

    id              = Column(Integer, primary_key=True, index=True)
    name            = Column(String(100), nullable=False)
    min_salary      = Column(Numeric(12, 2), nullable=False)
    max_salary      = Column(Numeric(12, 2), nullable=False)
    description     = Column(Text, nullable=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    created_at      = Column(DateTime, server_default=func.now())
    updated_at      = Column(DateTime, onupdate=func.now())


class CompensationBand(Base):
    __tablename__ = "compensation_bands"

    id              = Column(Integer, primary_key=True, index=True)
    band_name       = Column(String(100), nullable=False)
    level           = Column(Integer, nullable=False)
    min_salary      = Column(Numeric(12, 2), nullable=False)
    max_salary      = Column(Numeric(12, 2), nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    created_at      = Column(DateTime, server_default=func.now())
    updated_at      = Column(DateTime, onupdate=func.now())


class SalaryComponent(Base):
    __tablename__ = "salary_components"

    id              = Column(Integer, primary_key=True, index=True)
    name            = Column(String(100), nullable=False)
    component_type  = Column(String(20), nullable=False)
    is_taxable      = Column(Boolean, default=True)
    default_amount  = Column(Numeric(12, 2), nullable=True)
    description     = Column(Text, nullable=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    created_at      = Column(DateTime, server_default=func.now())
    updated_at      = Column(DateTime, onupdate=func.now())


class SalaryStructure(Base):
    __tablename__ = "salary_structures"

    id              = Column(Integer, primary_key=True, index=True)
    name            = Column(String(100), nullable=False)
    is_active       = Column(Boolean, default=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    created_at      = Column(DateTime, server_default=func.now())
    updated_at      = Column(DateTime, onupdate=func.now())


class StructureComponent(Base):
    __tablename__ = "structure_components"

    id                = Column(Integer, primary_key=True, index=True)
    structure_id      = Column(Integer, ForeignKey("salary_structures.id"), nullable=False)
    component_id      = Column(Integer, ForeignKey("salary_components.id"), nullable=False)
    amount_or_formula = Column(String(255), nullable=False)
    created_at        = Column(DateTime, server_default=func.now())
    updated_at        = Column(DateTime, onupdate=func.now())


class EmployeeCompensation(Base):
    __tablename__ = "employee_compensations"

    id              = Column(Integer, primary_key=True, index=True)
    employee_id     = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    structure_id    = Column(Integer, ForeignKey("salary_structures.id"), nullable=False)
    pay_grade_id    = Column(Integer, ForeignKey("pay_grades.id"), nullable=True)
    band_id         = Column(Integer, ForeignKey("compensation_bands.id"), nullable=True)
    effective_date  = Column(Date, nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    created_at      = Column(DateTime, server_default=func.now())
    updated_at      = Column(DateTime, onupdate=func.now())


class SalaryRevision(Base):
    __tablename__ = "salary_revisions"

    id                       = Column(Integer, primary_key=True, index=True)
    employee_compensation_id = Column(Integer, ForeignKey("employee_compensations.id"), nullable=False)
    old_salary               = Column(Numeric(12, 2), nullable=True)
    new_salary               = Column(Numeric(12, 2), nullable=False)
    effective_date           = Column(Date, nullable=False)
    reason                   = Column(Text, nullable=True)
    organization_id          = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    created_at               = Column(DateTime, server_default=func.now())
    updated_at               = Column(DateTime, onupdate=func.now())


class Allowance(Base):
    __tablename__ = "allowances"

    id              = Column(Integer, primary_key=True, index=True)
    employee_id     = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    allowance_type  = Column(String(100), nullable=False)
    amount          = Column(Numeric(12, 2), nullable=False)
    effective_date  = Column(Date, nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    created_at      = Column(DateTime, server_default=func.now())
    updated_at      = Column(DateTime, onupdate=func.now())


class Benefit(Base):
    __tablename__ = "benefits"

    id              = Column(Integer, primary_key=True, index=True)
    name            = Column(String(200), nullable=False)
    description     = Column(Text, nullable=True)
    is_active       = Column(Boolean, default=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    created_at      = Column(DateTime, server_default=func.now())
    updated_at      = Column(DateTime, onupdate=func.now())


class EmployeeBenefit(Base):
    __tablename__ = "employee_benefits"

    id                  = Column(Integer, primary_key=True, index=True)
    employee_id         = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    benefit_id          = Column(Integer, ForeignKey("benefits.id"), nullable=False)
    coverage_start_date = Column(Date, nullable=True)
    coverage_end_date   = Column(Date, nullable=True)
    organization_id     = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    created_at          = Column(DateTime, server_default=func.now())
    updated_at          = Column(DateTime, onupdate=func.now())


class CompensationItem(Base):
    __tablename__ = "compensation_items"

    id          = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    amount      = Column(Numeric(12, 2), nullable=False)
    item_type   = Column(String(50), nullable=False)
    description = Column(Text, nullable=True)
    created_at  = Column(DateTime, server_default=func.now())


# ═══════════════════════════════════════════════════════════════════════════════
# COMPLIANCE  (employee-level compliance records — simple one-off acknowledgement
# log used by the legacy ESS flow. The full Compliance & Risk Management module
# — Policy Library, Tracking & Audits, Violations & Corrective Actions, Risk
# Register — lives below in this same file and owns the other compliance_* tables)
# ═══════════════════════════════════════════════════════════════════════════════

class ComplianceRecord(Base):
    __tablename__ = "compliance_records"

    id             = Column(Integer, primary_key=True, index=True)
    employee_id    = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    policy_name    = Column(String(200), nullable=False)
    status         = Column(Enum(RequestStatus), default=RequestStatus.PENDING, nullable=False)
    completed_at   = Column(DateTime, nullable=True)
    notes          = Column(Text, nullable=True)
    created_at     = Column(DateTime, server_default=func.now())


# ═══════════════════════════════════════════════════════════════════════════════
# COMPLIANCE & RISK MANAGEMENT MODULE
# Backs the "/comply" frontend (dashboard, policy library, tracking & audits,
# violations & corrective actions, risk register). Schemas for all of this
# already existed in schemas.py, and hrService.js already calls these routes —
# the models/service/router wiring was the missing piece.
# ═══════════════════════════════════════════════════════════════════════════════

# NOTE: CompliancePolicy and PolicyAcknowledgement are defined in
# app.modules.comply.models to avoid duplicate table registration.


class Audit(Base):
    __tablename__ = "compliance_audits"

    id          = Column(Integer, primary_key=True, index=True)
    title       = Column(String(255), nullable=False)
    auditor     = Column(String(200), nullable=True)
    score       = Column(Float, nullable=True)
    status      = Column(String(50), default="pending", nullable=False)
    created_at  = Column(DateTime, server_default=func.now())


class RegulatoryRequirement(Base):
    __tablename__ = "compliance_regulations"

    id           = Column(Integer, primary_key=True, index=True)
    name         = Column(String(255), nullable=False)
    jurisdiction = Column(String(150), nullable=True)
    category     = Column(String(100), nullable=True)
    status       = Column(String(50), default="active", nullable=False)
    created_at   = Column(DateTime, server_default=func.now())


class RiskAssessment(Base):
    __tablename__ = "compliance_risks"

    id                  = Column(Integer, primary_key=True, index=True)
    title               = Column(String(255), nullable=False)
    category            = Column(String(100), nullable=True)
    risk_score          = Column(Integer, default=0, nullable=False)
    mitigation_strategy = Column(Text, nullable=True)
    status              = Column(String(50), default="open", nullable=False)
    created_at          = Column(DateTime, server_default=func.now())


class ComplianceViolation(Base):
    __tablename__ = "compliance_violations"

    id          = Column(Integer, primary_key=True, index=True)
    title       = Column(String(255), nullable=False)
    violation   = Column(Text, nullable=True)
    policy      = Column(String(255), nullable=True)
    employee    = Column(String(200), nullable=True)
    reported_by = Column(String(200), nullable=True)
    severity    = Column(String(50), nullable=True)
    status      = Column(String(50), default="investigating", nullable=False)
    date        = Column(Date, nullable=True)
    created_at  = Column(DateTime, server_default=func.now())

    corrective_actions = relationship(
        "CorrectiveAction", back_populates="violation_ref", cascade="all, delete-orphan"
    )


class CorrectiveAction(Base):
    __tablename__ = "compliance_corrective_actions"

    id           = Column(Integer, primary_key=True, index=True)
    title        = Column(String(255), nullable=False)
    violation_id = Column(Integer, ForeignKey("compliance_violations.id"), nullable=True, index=True)
    assigned_to  = Column(String(200), nullable=True)
    status       = Column(String(50), default="pending", nullable=False)
    deadline     = Column(Date, nullable=True)
    created_at   = Column(DateTime, server_default=func.now())

    violation_ref = relationship("ComplianceViolation", back_populates="corrective_actions")


# ═══════════════════════════════════════════════════════════════════════════════
# ENGAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════

class EngagementSurvey(Base):
    __tablename__ = "engagement_surveys"

    id             = Column(Integer, primary_key=True, index=True)
    employee_id    = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    survey_name    = Column(String(200), nullable=False)
    score          = Column(Integer, nullable=False)
    comments       = Column(Text, nullable=True)
    completed_at   = Column(DateTime, nullable=True)
    created_at     = Column(DateTime, server_default=func.now())


# ═══════════════════════════════════════════════════════════════════════════════
# ESS (Employee Self Service)
# ═══════════════════════════════════════════════════════════════════════════════

class EssRequest(Base):
    __tablename__ = "ess_requests"

    id             = Column(Integer, primary_key=True, index=True)
    employee_id    = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    request_type   = Column(String(100), nullable=False)
    description    = Column(Text, nullable=True)
    status         = Column(Enum(RequestStatus), default=RequestStatus.PENDING, nullable=False)
    created_at     = Column(DateTime, server_default=func.now())
    resolved_at    = Column(DateTime, nullable=True)


# ═══════════════════════════════════════════════════════════════════════════════
# ONBOARDING
# ═══════════════════════════════════════════════════════════════════════════════

class OnboardingNewHire(Base):
    __tablename__ = "onboarding_new_hires"

    id              = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    employee_id     = Column(Integer, ForeignKey("employees.id"), nullable=True)
    candidate_name  = Column(String(150), nullable=False)
    email           = Column(String(255), nullable=False)
    phone           = Column(String(50), nullable=True)
    position        = Column(String(150), nullable=False)
    department_id   = Column(Integer, ForeignKey("departments.id"), nullable=True)
    manager_id      = Column(Integer, ForeignKey("employees.id"), nullable=True)
    joining_date    = Column(Date, nullable=True)
    status          = Column(String(50), default="offer_sent", nullable=False)
    joining_status  = Column(String(50), default="not_joined", nullable=False)
    notes           = Column(Text, nullable=True)
    is_deleted      = Column(Boolean, default=False, nullable=False)
    created_by      = Column(String(100), nullable=True)
    created_at      = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at      = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    department = relationship("Department")
    manager    = relationship("Employee", foreign_keys=[manager_id])
    employee   = relationship("Employee", foreign_keys=[employee_id])
    tasks      = relationship("OnboardingPreboardingTask", back_populates="new_hire", cascade="all, delete-orphan")
    documents  = relationship("OnboardingDocument", back_populates="new_hire", cascade="all, delete-orphan")
    checklists = relationship("OnboardingChecklist", back_populates="new_hire", cascade="all, delete-orphan")
    orientation_attendees = relationship("OnboardingOrientationAttendee", back_populates="new_hire", cascade="all, delete-orphan")

    @property
    def department_name(self) -> Optional[str]:
        return self.department.name if self.department else None

    @property
    def manager_name(self) -> Optional[str]:
        return f"{self.manager.first_name} {self.manager.last_name}".strip() if self.manager else None


class OnboardingPreboardingTask(Base):
    __tablename__ = "onboarding_preboarding_tasks"

    id                      = Column(Integer, primary_key=True, index=True)
    organization_id         = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    onboarding_new_hire_id  = Column(Integer, ForeignKey("onboarding_new_hires.id"), nullable=True)
    employee_id             = Column(Integer, ForeignKey("employees.id"), nullable=True)
    title                   = Column(String(200), nullable=False)
    description             = Column(Text, nullable=True)
    due_date                = Column(Date, nullable=True)
    completed               = Column(Boolean, default=False, nullable=False)
    completed_at            = Column(DateTime, nullable=True)
    is_deleted              = Column(Boolean, default=False, nullable=False)
    created_by              = Column(String(100), nullable=True)
    created_at              = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at              = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    new_hire = relationship("OnboardingNewHire", back_populates="tasks")
    employee = relationship("Employee")


class OnboardingDocument(Base):
    __tablename__ = "onboarding_documents"

    id                      = Column(Integer, primary_key=True, index=True)
    organization_id         = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    onboarding_new_hire_id  = Column(Integer, ForeignKey("onboarding_new_hires.id"), nullable=True)
    title                   = Column(String(200), nullable=False)
    category                = Column(String(100), nullable=False)
    file_path               = Column(String(500), nullable=True)
    status                  = Column(String(50), default="pending", nullable=False)
    rejection_reason        = Column(Text, nullable=True)
    is_deleted              = Column(Boolean, default=False, nullable=False)
    created_by              = Column(String(100), nullable=True)
    created_at              = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at              = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    new_hire = relationship("OnboardingNewHire", back_populates="documents")


class OnboardingChecklist(Base):
    __tablename__ = "onboarding_checklists"

    id                      = Column(Integer, primary_key=True, index=True)
    organization_id         = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    onboarding_new_hire_id  = Column(Integer, ForeignKey("onboarding_new_hires.id"), nullable=True)
    template_id             = Column(Integer, ForeignKey("onboarding_checklists.id"), nullable=True)
    name                    = Column(String(200), nullable=False)
    description            = Column(Text, nullable=True)
    category                = Column(String(100), default="HR", nullable=False)
    status                  = Column(String(50), default="pending", nullable=False)
    is_deleted              = Column(Boolean, default=False, nullable=False)
    created_by              = Column(String(100), nullable=True)
    created_at              = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at              = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    new_hire = relationship("OnboardingNewHire", back_populates="checklists")
    items    = relationship("OnboardingChecklistItem", back_populates="checklist", cascade="all, delete-orphan")


class OnboardingChecklistItem(Base):
    __tablename__ = "onboarding_checklist_items"

    id           = Column(Integer, primary_key=True, index=True)
    organization_id       = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    checklist_id          = Column(Integer, ForeignKey("onboarding_checklists.id"), nullable=False)
    title                 = Column(String(200), nullable=False)
    description           = Column(Text, nullable=True)
    completed             = Column(Boolean, default=False, nullable=False)
    completed_at          = Column(DateTime, nullable=True)
    due_date              = Column(Date, nullable=True)
    is_deleted            = Column(Boolean, default=False, nullable=False)
    created_by            = Column(String(100), nullable=True)
    created_at            = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at            = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    checklist = relationship("OnboardingChecklist", back_populates="items")


class OnboardingOrientation(Base):
    __tablename__ = "onboarding_orientations"

    id           = Column(Integer, primary_key=True, index=True)
    organization_id         = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    title                   = Column(String(200), nullable=False)
    date                    = Column(Date, nullable=False)
    time                    = Column(String(100), nullable=True)
    location                = Column(String(200), nullable=True)
    meeting_link            = Column(String(500), nullable=True)
    presenter               = Column(String(200), nullable=True)
    status                  = Column(String(50), default="scheduled", nullable=False)
    is_deleted              = Column(Boolean, default=False, nullable=False)
    created_by              = Column(String(100), nullable=True)
    created_at              = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at              = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    attendees    = relationship("OnboardingOrientationAttendee", back_populates="session", cascade="all, delete-orphan")


class OnboardingOrientationAttendee(Base):
    __tablename__ = "onboarding_orientation_attendees"

    id                     = Column(Integer, primary_key=True, index=True)
    organization_id        = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    session_id             = Column(Integer, ForeignKey("onboarding_orientations.id"), nullable=False)
    onboarding_new_hire_id = Column(Integer, ForeignKey("onboarding_new_hires.id"), nullable=False)
    status                 = Column(String(50), default="pending", nullable=False)
    is_deleted             = Column(Boolean, default=False, nullable=False)
    created_at             = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at             = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    session  = relationship("OnboardingOrientation", back_populates="attendees")
    new_hire = relationship("OnboardingNewHire", back_populates="orientation_attendees")


class OnboardingActivity(Base):
    __tablename__ = "onboarding_activities"

    id                     = Column(Integer, primary_key=True, index=True)
    organization_id        = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    onboarding_new_hire_id = Column(Integer, ForeignKey("onboarding_new_hires.id"), nullable=True)
    action                 = Column(String(200), nullable=False)
    description            = Column(Text, nullable=False)
    created_at             = Column(DateTime, server_default=func.now(), nullable=False)

    new_hire = relationship("OnboardingNewHire")


# ═══════════════════════════════════════════════════════════════════════════════
# PERFORMANCE
# ═══════════════════════════════════════════════════════════════════════════════

class PerformanceReview(Base):
    __tablename__ = "performance_reviews"

    id             = Column(Integer, primary_key=True, index=True)
    employee_id    = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    reviewer_id    = Column(Integer, ForeignKey("employees.id"), nullable=True)
    hr_reviewer_id    = Column(Integer, ForeignKey("employees.id"), nullable=True)
    admin_reviewer_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    cycle          = Column(String(50), nullable=False)
    rating         = Column(Integer, nullable=False)
    comments       = Column(Text, nullable=True)
    status         = Column(Enum(RequestStatus), default=RequestStatus.PENDING, nullable=False)
    created_at     = Column(DateTime, server_default=func.now())
    reviewed_at    = Column(DateTime, nullable=True)


class GoalStatus(str, enum.Enum):
    NOT_STARTED = "not_started"
    ON_TRACK    = "on_track"
    AT_RISK     = "at_risk"
    COMPLETED   = "completed"

class FeedbackType(str, enum.Enum):
    PEER    = "peer"
    MANAGER = "manager"
    SELF    = "self"
    DEGREE_360 = "360"

class AppraisalStatus(str, enum.Enum):
    DRAFT     = "draft"
    SUBMITTED = "submitted"
    APPROVED  = "approved"
    REJECTED  = "rejected"

class PerformanceGoal(Base):
    __tablename__ = "performance_goals"

    id             = Column(Integer, primary_key=True, index=True)
    employee_id    = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    title          = Column(String(255), nullable=False)
    description    = Column(Text, nullable=True)
    goal_type      = Column(String(50), default="okr")
    quarter        = Column(String(20), nullable=True)
    year           = Column(Integer, nullable=True)
    progress       = Column(Integer, default=0)
    status         = Column(Enum(GoalStatus), default=GoalStatus.NOT_STARTED, nullable=False)
    due_date       = Column(Date, nullable=True)
    created_at     = Column(DateTime, server_default=func.now())
    updated_at     = Column(DateTime, nullable=True, onupdate=func.now())


class PerformanceKpi(Base):
    __tablename__ = "performance_kpis"

    id             = Column(Integer, primary_key=True, index=True)
    employee_id    = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    goal_id        = Column(Integer, ForeignKey("performance_goals.id"), nullable=True)
    name           = Column(String(255), nullable=False)
    target_value   = Column(Float, nullable=True)
    actual_value   = Column(Float, nullable=True)
    unit           = Column(String(50), nullable=True)
    weight         = Column(Float, default=1.0)
    period         = Column(String(50), nullable=True)
    created_at     = Column(DateTime, server_default=func.now())
    updated_at     = Column(DateTime, nullable=True, onupdate=func.now())


class PerformanceFeedback(Base):
    __tablename__ = "performance_feedback"

    id             = Column(Integer, primary_key=True, index=True)
    employee_id    = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    reviewer_id    = Column(Integer, ForeignKey("employees.id"), nullable=True)
    review_id      = Column(Integer, ForeignKey("performance_reviews.id"), nullable=True)
    feedback_type  = Column(String(50), default="peer")
    rating         = Column(Integer, nullable=True)
    comments       = Column(Text, nullable=True)
    strengths      = Column(Text, nullable=True)
    improvements   = Column(Text, nullable=True)
    submitted_at   = Column(DateTime, server_default=func.now())
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)


class Appraisal(Base):
    __tablename__ = "performance_appraisals"

    id             = Column(Integer, primary_key=True, index=True)
    employee_id    = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    reviewer_id    = Column(Integer, ForeignKey("employees.id"), nullable=True)
    hr_reviewer_id    = Column(Integer, ForeignKey("employees.id"), nullable=True)
    admin_reviewer_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    cycle          = Column(String(50), nullable=False)
    self_score     = Column(Float, nullable=True)
    manager_score  = Column(Float, nullable=True)
    final_score    = Column(Float, nullable=True)
    recommendation = Column(String(50), nullable=True)
    salary_hike    = Column(Float, nullable=True)
    comments       = Column(Text, nullable=True)
    status         = Column(Enum(AppraisalStatus), default=AppraisalStatus.DRAFT, nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    created_at     = Column(DateTime, server_default=func.now())
    reviewed_at    = Column(DateTime, nullable=True)


class RecruitmentCandidateStatus(str, enum.Enum):
    APPLIED    = "applied"
    SCREENING  = "screening"
    INTERVIEW  = "interview"
    OFFER      = "offer"
    HIRED      = "hired"
    REJECTED   = "rejected"

class RequisitionStatus(str, enum.Enum):
    DRAFT   = "draft"
    PENDING = "pending"
    OPEN    = "open"
    CLOSED  = "closed"
    ON_HOLD = "on_hold"

class InterviewStatus(str, enum.Enum):
    SCHEDULED   = "scheduled"
    IN_PROGRESS = "in_progress"
    COMPLETED   = "completed"
    CANCELLED   = "cancelled"

class OfferStatus(str, enum.Enum):
    DRAFT     = "draft"
    PENDING   = "pending"
    APPROVED  = "approved"
    REJECTED  = "rejected"
    ACCEPTED  = "accepted"
    WITHDRAWN = "withdrawn"
    COUNTERED = "countered"


# ═══════════════════════════════════════════════════════════════════════════════
# RECRUITMENT
# ═══════════════════════════════════════════════════════════════════════════════

class RecruitmentCandidate(Base):
    __tablename__ = "recruitment_candidates"

    id             = Column(Integer, primary_key=True, index=True)
    name           = Column(String(150), nullable=False)
    email          = Column(String(255), nullable=False)
    phone          = Column(String(50), nullable=True)
    position       = Column(String(150), nullable=False)
    source         = Column(String(100), nullable=True)
    status         = Column(Enum(RecruitmentCandidateStatus), default=RecruitmentCandidateStatus.APPLIED, nullable=False)
    location       = Column(String(150), nullable=True)
    experience     = Column(Integer, nullable=True)
    resume_link    = Column(String(500), nullable=True)
    applied_at     = Column(DateTime, server_default=func.now())
    notes          = Column(Text, nullable=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    onboarding_new_hire_id = Column(Integer, ForeignKey("onboarding_new_hires.id"), nullable=True)
    requisition_id = Column(Integer, ForeignKey("recruitment_requisitions.id"), nullable=True, index=True)
    created_at     = Column(DateTime, server_default=func.now())
    updated_at     = Column(DateTime, onupdate=func.now())


class RecruitmentRequisition(Base):
    __tablename__ = "recruitment_requisitions"

    id             = Column(Integer, primary_key=True, index=True)
    title          = Column(String(200), nullable=False)
    department     = Column(String(100), nullable=False)
    location       = Column(String(150), nullable=True)
    openings       = Column(Integer, default=1)
    filled         = Column(Integer, default=0)
    priority       = Column(String(20), default="medium")
    status         = Column(Enum(RequisitionStatus), default=RequisitionStatus.DRAFT, nullable=False)
    description    = Column(Text, nullable=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    created_at     = Column(DateTime, server_default=func.now())
    updated_at     = Column(DateTime, onupdate=func.now())


class RecruitmentInterview(Base):
    __tablename__ = "recruitment_interviews"

    id             = Column(Integer, primary_key=True, index=True)
    candidate_id   = Column(Integer, ForeignKey("recruitment_candidates.id"), nullable=True)
    candidate_name = Column(String(150), nullable=False)
    position       = Column(String(150), nullable=False)
    interview_type = Column(String(50), default="in_person")
    interview_date = Column(Date, nullable=False)
    start_time     = Column(String(10), nullable=True)
    end_time       = Column(String(10), nullable=True)
    interviewer    = Column(String(150), nullable=True)
    interviewer_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    status         = Column(Enum(InterviewStatus), default=InterviewStatus.SCHEDULED, nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    feedback       = Column(Text, nullable=True)
    rating         = Column(Integer, nullable=True)
    notes          = Column(Text, nullable=True)
    created_at     = Column(DateTime, server_default=func.now())
    updated_at     = Column(DateTime, onupdate=func.now())


class RecruitmentOffer(Base):
    __tablename__ = "recruitment_offers"

    id             = Column(Integer, primary_key=True, index=True)
    candidate_id   = Column(Integer, ForeignKey("recruitment_candidates.id"), nullable=True)
    candidate_name = Column(String(150), nullable=False)
    position       = Column(String(150), nullable=False)
    salary         = Column(Numeric(12, 2), nullable=True)
    equity         = Column(String(50), nullable=True)
    joining_date   = Column(Date, nullable=True)
    status         = Column(Enum(OfferStatus), default=OfferStatus.DRAFT, nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    notes          = Column(Text, nullable=True)
    created_at     = Column(DateTime, server_default=func.now())
    updated_at     = Column(DateTime, onupdate=func.now())


class RecruitmentDocument(Base):
    __tablename__ = "recruitment_documents"

    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(Integer, ForeignKey("recruitment_candidates.id"), nullable=False)
    document_type = Column(String(50), nullable=False)
    file_path = Column(String(500), nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    file_name = Column(String(255), nullable=False)
    file_size = Column(Integer, nullable=True)
    uploaded_by = Column(Integer, ForeignKey("employees.id"), nullable=True)
    upload_date = Column(DateTime, server_default=func.now())


class RecruitmentApplication(Base):
    __tablename__ = "recruitment_applications"

    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(Integer, ForeignKey("recruitment_candidates.id"), nullable=False)
    requisition_id = Column(Integer, ForeignKey("recruitment_requisitions.id"), nullable=False)
    application_date = Column(DateTime, server_default=func.now())
    status = Column(String(20), nullable=False, default="new")
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    notes = Column(Text, nullable=True)
    cover_letter_path = Column(String(500), nullable=True)


class RecruitmentInterviewFeedback(Base):
    __tablename__ = "recruitment_interview_feedback"

    id = Column(Integer, primary_key=True, index=True)
    interview_id = Column(Integer, ForeignKey("recruitment_interviews.id"), nullable=False)
    interviewer_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    rating = Column(Integer, nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    feedback = Column(Text, nullable=True)
    strengths = Column(Text, nullable=True)
    improvements = Column(Text, nullable=True)
    created_date = Column(DateTime, server_default=func.now())


class RecruitmentOfferApproval(Base):
    __tablename__ = "recruitment_offer_approvals"

    id = Column(Integer, primary_key=True, index=True)
    offer_id = Column(Integer, ForeignKey("recruitment_offers.id"), nullable=False)
    approver_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    approval_status = Column(String(20), nullable=False, default="pending")
    comments = Column(Text, nullable=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    approved_date = Column(DateTime, server_default=func.now())


# ═══════════════════════════════════════════════════════════════════════════════
# TRAVEL
# ═══════════════════════════════════════════════════════════════════════════════

class TravelRequest(Base):
    __tablename__ = "travel_requests"

    id              = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    employee_id     = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    destination     = Column(String(200), nullable=False)
    purpose         = Column(Text, nullable=True)
    start_date      = Column(Date, nullable=False)
    end_date        = Column(Date, nullable=False)
    status          = Column(Enum(RequestStatus), default=RequestStatus.PENDING, nullable=False)
    approved_at     = Column(DateTime, nullable=True)
    created_at      = Column(DateTime, server_default=func.now())

    organization   = relationship("Organization")
    employee       = relationship("Employee")
    approvals      = relationship("TravelApproval", back_populates="request")
    expenses       = relationship("TravelExpense", back_populates="request")


class TravelApproval(Base):
    __tablename__ = "travel_approvals"

    id              = Column(Integer, primary_key=True, index=True)
    request_id      = Column(Integer, ForeignKey("travel_requests.id"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    approver_id     = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    approval_level = Column(Integer, nullable=False)
    status          = Column(Enum(RequestStatus), default=RequestStatus.PENDING, nullable=False)
    comments        = Column(Text, nullable=True)
    approved_at     = Column(DateTime, nullable=True)
    created_at      = Column(DateTime, server_default=func.now())

    request       = relationship("TravelRequest", back_populates="approvals")
    organization = relationship("Organization")
    approver     = relationship("Employee", foreign_keys=[approver_id])


class TravelExpense(Base):
    __tablename__ = "travel_expenses"

    id              = Column(Integer, primary_key=True, index=True)
    request_id      = Column(Integer, ForeignKey("travel_requests.id"), nullable=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    employee_id     = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    expense_type    = Column(String(100), nullable=False)
    amount          = Column(Numeric(12, 2), nullable=False)
    currency        = Column(String(3), default="USD")
    description     = Column(Text, nullable=True)
    receipt_url     = Column(String(500), nullable=True)
    status          = Column(Enum(RequestStatus), default=RequestStatus.PENDING, nullable=False)
    submitted_at    = Column(DateTime, server_default=func.now())
    approved_at     = Column(DateTime, nullable=True)
    reimbursed_at  = Column(DateTime, nullable=True)
    created_at      = Column(DateTime, server_default=func.now())

    request       = relationship("TravelRequest", back_populates="expenses")
    organization = relationship("Organization")
    employee      = relationship("Employee", foreign_keys=[employee_id])
    receipts      = relationship("TravelReceipt", back_populates="expense")


class TravelReceipt(Base):
    __tablename__ = "travel_receipts"

    id              = Column(Integer, primary_key=True, index=True)
    expense_id      = Column(Integer, ForeignKey("travel_expenses.id"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    receipt_number  = Column(String(100), nullable=False, unique=True)
    receipt_url     = Column(String(500), nullable=False)
    amount          = Column(Numeric(12, 2), nullable=False)
    vendor_name     = Column(String(200), nullable=False)
    expense_date    = Column(Date, nullable=False)
    uploaded_at     = Column(DateTime, server_default=func.now())
    verified        = Column(Boolean, default=False)
    verified_at     = Column(DateTime, nullable=True)
    verified_by     = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at      = Column(DateTime, server_default=func.now())

    expense       = relationship("TravelExpense", back_populates="receipts")
    organization = relationship("Organization")
    verifier     = relationship("Employee", foreign_keys=[verified_by])


class TravelPolicy(Base):
    __tablename__ = "travel_policies"

    id              = Column(Integer, primary_key=True, index=True)
    policy_name     = Column(String(200), nullable=False)
    policy_type     = Column(String(50), nullable=False)
    description     = Column(Text, nullable=True)
    max_daily_allowance = Column(Numeric(12, 2), nullable=True)
    max_trip_duration  = Column(Integer, nullable=True)
    max_per_diem      = Column(Numeric(12, 2), nullable=True)
    is_active        = Column(Boolean, default=True)
    effective_date   = Column(Date, nullable=False)
    expiry_date      = Column(Date, nullable=True)
    organization_id    = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    created_at       = Column(DateTime, server_default=func.now())
    updated_at       = Column(DateTime, onupdate=func.now())

    organization     = relationship("Organization")


class TravelSetting(Base):
    __tablename__ = "travel_settings"

    id                      = Column(Integer, primary_key=True, index=True)
    organization_id         = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    approval_workflow       = Column(String(20), default="manager")
    expense_limit_per_day   = Column(Numeric(12, 2), default=500.00)
    max_trip_duration       = Column(Integer, default=30)
    auto_approve_threshold  = Column(Integer, default=1000)
    reimbursement_deadline  = Column(Integer, default=30)
    notification_enabled    = Column(Boolean, default=True)
    created_at              = Column(DateTime, server_default=func.now())
    updated_at              = Column(DateTime, onupdate=func.now())

    organization = relationship("Organization")


# ═══════════════════════════════════════════════════════════════════════════════
# WORKFORCE PLANNING (Legacy table — retained for backward compatibility)
# ═══════════════════════════════════════════════════════════════════════════════

class WorkforcePlan(Base):
    __tablename__ = "workforce_plans"

    id               = Column(Integer, primary_key=True, index=True)
    department_id    = Column(Integer, ForeignKey("departments.id"), nullable=True)
    year             = Column(Integer, nullable=False)
    headcount_target = Column(Integer, nullable=False)
    notes            = Column(Text, nullable=True)
    organization_id  = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)


# ═══════════════════════════════════════════════════════════════════════════════
# WORKFORCE PLANNING — PRODUCTION MODELS (new tables)
# ═══════════════════════════════════════════════════════════════════════════════

class WfPlan(Base):
    __tablename__ = "wf_plans"

    id               = Column(Integer, primary_key=True, index=True)
    organization_id  = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    department_id    = Column(Integer, ForeignKey("departments.id"), nullable=True, index=True)
    title            = Column(String(200), nullable=False)
    description      = Column(Text, nullable=True)
    plan_year        = Column(Integer, nullable=False, index=True)
    status           = Column(String(20), default="draft", nullable=False)
    owner_id         = Column(Integer, ForeignKey("employees.id"), nullable=True, index=True)
    budget           = Column(Numeric(14, 2), nullable=True, default=0)
    target_headcount = Column(Integer, nullable=True, default=0)
    current_headcount= Column(Integer, nullable=True, default=0)
    created_by       = Column(Integer, ForeignKey("employees.id"), nullable=True)
    updated_by       = Column(Integer, ForeignKey("employees.id"), nullable=True)
    deleted_at       = Column(DateTime, nullable=True)
    created_at       = Column(DateTime, server_default=func.now())
    updated_at       = Column(DateTime, onupdate=func.now())

    owner = relationship("Employee", foreign_keys=[owner_id], lazy="joined")


class WfHeadcount(Base):
    __tablename__ = "wf_headcounts"

    id                 = Column(Integer, primary_key=True, index=True)
    organization_id    = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    department_id      = Column(Integer, ForeignKey("departments.id"), nullable=True, index=True)
    fiscal_year        = Column(Integer, nullable=False, index=True)
    approved_positions = Column(Integer, default=0)
    filled_positions   = Column(Integer, default=0)
    vacant_positions   = Column(Integer, default=0)
    planned_hires      = Column(Integer, default=0)
    projected_cost     = Column(Numeric(14, 2), nullable=True, default=0)
    created_by         = Column(Integer, ForeignKey("employees.id"), nullable=True)
    updated_by         = Column(Integer, ForeignKey("employees.id"), nullable=True)
    deleted_at         = Column(DateTime, nullable=True)
    created_at         = Column(DateTime, server_default=func.now())
    updated_at         = Column(DateTime, onupdate=func.now())

    department = relationship("Department", lazy="joined")


class WfSuccession(Base):
    __tablename__ = "wf_successions"

    id                  = Column(Integer, primary_key=True, index=True)
    organization_id     = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    employee_id         = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    successor_employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True, index=True)
    readiness_level     = Column(String(20), default="not_ready")
    risk_level          = Column(String(20), default="medium")
    target_position     = Column(String(200), nullable=True)
    review_date         = Column(Date, nullable=True)
    notes               = Column(Text, nullable=True)
    created_by          = Column(Integer, ForeignKey("employees.id"), nullable=True)
    updated_by          = Column(Integer, ForeignKey("employees.id"), nullable=True)
    deleted_at          = Column(DateTime, nullable=True)
    created_at          = Column(DateTime, server_default=func.now())
    updated_at          = Column(DateTime, onupdate=func.now())

    employee = relationship("Employee", foreign_keys=[employee_id], lazy="joined")
    successor = relationship("Employee", foreign_keys=[successor_employee_id], lazy="joined")


class WfReport(Base):
    __tablename__ = "wf_reports"

    id              = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    report_name     = Column(String(200), nullable=False)
    report_type     = Column(String(50), nullable=False)
    generated_by    = Column(Integer, ForeignKey("employees.id"), nullable=True)
    generated_at    = Column(DateTime, server_default=func.now())
    created_at      = Column(DateTime, server_default=func.now())


# ═══════════════════════════════════════════════════════════════════════════════
# LEARNING & DEVELOPMENT
# ═══════════════════════════════════════════════════════════════════════════════

class LearningCourse(Base):
    __tablename__ = "learning_courses"

    id             = Column(Integer, primary_key=True, index=True)
    course_name    = Column(String(200), nullable=False)
    description    = Column(Text, nullable=True)
    course_type    = Column(String(50), nullable=True)
    category       = Column(String(100), nullable=True)
    provider       = Column(String(150), nullable=True)
    duration_hours = Column(Integer, nullable=True)
    cost           = Column(Numeric(10, 2), nullable=True)
    status         = Column(String(20), default="active")
    created_by     = Column(Integer, ForeignKey("employees.id"), nullable=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    created_at     = Column(DateTime, server_default=func.now())
    updated_at     = Column(DateTime, onupdate=func.now())

    enrollments    = relationship("LearningEnrollment", back_populates="course")


class LearningEnrollment(Base):
    __tablename__ = "learning_enrollments"

    id           = Column(Integer, primary_key=True, index=True)
    course_id    = Column(Integer, ForeignKey("learning_courses.id"), nullable=False)
    employee_id  = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    status       = Column(String(20), default="enrolled")
    progress_pct = Column(Integer, default=0)
    enrolled_at  = Column(DateTime, server_default=func.now())
    started_at   = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    score        = Column(Integer, nullable=True)
    notes        = Column(Text, nullable=True)
    created_at   = Column(DateTime, server_default=func.now())
    updated_at   = Column(DateTime, onupdate=func.now())

    course       = relationship("LearningCourse", back_populates="enrollments")
    employee     = relationship("Employee", back_populates="learning_enrollments")


class LearningPath(Base):
    __tablename__ = "learning_paths"

    id             = Column(Integer, primary_key=True, index=True)
    name           = Column(String(200), nullable=False)
    description    = Column(Text, nullable=True)
    created_by     = Column(Integer, ForeignKey("employees.id"), nullable=True)
    is_active      = Column(Boolean, default=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    created_at     = Column(DateTime, server_default=func.now())
    updated_at     = Column(DateTime, onupdate=func.now())


class LearningPathItem(Base):
    __tablename__ = "learning_path_items"

    id         = Column(Integer, primary_key=True, index=True)
    path_id    = Column(Integer, ForeignKey("learning_paths.id"), nullable=False)
    course_id  = Column(Integer, ForeignKey("learning_courses.id"), nullable=False)
    sort_order = Column(Integer, default=0)
    is_required= Column(Boolean, default=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)


class LearningCertification(Base):
    __tablename__ = "learning_certifications"

    id                    = Column(Integer, primary_key=True, index=True)
    employee_id           = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    certification_name    = Column(String(200), nullable=False)
    issuing_organization  = Column(String(200), nullable=True)
    issue_date            = Column(Date, nullable=False)
    expiry_date           = Column(Date, nullable=True)
    credential_url        = Column(String(500), nullable=True)
    status                = Column(String(20), default="active")
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    created_by            = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at            = Column(DateTime, server_default=func.now())
    updated_at            = Column(DateTime, onupdate=func.now())


class LearningSkill(Base):
    __tablename__ = "learning_skills"

    id                = Column(Integer, primary_key=True, index=True)
    employee_id       = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    skill_name        = Column(String(200), nullable=False)
    category          = Column(String(100), nullable=True)
    proficiency_level = Column(Integer, default=3)
    organization_id   = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    created_at        = Column(DateTime, server_default=func.now())
    updated_at        = Column(DateTime, onupdate=func.now())


class LearningAssessment(Base):
    __tablename__ = "learning_assessments"

    id              = Column(Integer, primary_key=True, index=True)
    course_id       = Column(Integer, ForeignKey("learning_courses.id"), nullable=False)
    title           = Column(String(200), nullable=False)
    description     = Column(Text, nullable=True)
    passing_score   = Column(Integer, default=70)
    max_attempts    = Column(Integer, nullable=True)
    duration_minutes= Column(Integer, nullable=True)
    is_active       = Column(Boolean, default=True)
    created_by      = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at      = Column(DateTime, server_default=func.now())
    updated_at      = Column(DateTime, onupdate=func.now())


class LearningAssessmentQuestion(Base):
    __tablename__ = "learning_assessment_questions"

    id             = Column(Integer, primary_key=True, index=True)
    assessment_id  = Column(Integer, ForeignKey("learning_assessments.id"), nullable=False)
    question_text  = Column(Text, nullable=False)
    question_type  = Column(String(50), default="multiple_choice")
    options        = Column(JSON, nullable=True)
    correct_answer = Column(String(500), nullable=True)
    points         = Column(Integer, default=1)
    sort_order     = Column(Integer, default=0)
    created_at     = Column(DateTime, server_default=func.now())


class LearningQuizAttempt(Base):
    __tablename__ = "learning_quiz_attempts"

    id             = Column(Integer, primary_key=True, index=True)
    assessment_id  = Column(Integer, ForeignKey("learning_assessments.id"), nullable=False)
    employee_id    = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    enrollment_id  = Column(Integer, ForeignKey("learning_enrollments.id"), nullable=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    started_at     = Column(DateTime, nullable=True)
    completed_at   = Column(DateTime, nullable=True)
    score          = Column(Integer, nullable=True)
    passed         = Column(Boolean, nullable=True)
    answers        = Column(JSON, nullable=True)
    attempt_number = Column(Integer, default=1)
    status         = Column(String(20), default="in_progress")
    created_at     = Column(DateTime, server_default=func.now())


class LearningTrainingProgram(Base):
    __tablename__ = "learning_training_programs"

    id               = Column(Integer, primary_key=True, index=True)
    name             = Column(String(200), nullable=False)
    description      = Column(Text, nullable=True)
    instructor_id    = Column(Integer, ForeignKey("employees.id"), nullable=True)
    start_date       = Column(Date, nullable=True)
    end_date         = Column(Date, nullable=True)
    status           = Column(String(20), default="planned")
    max_participants = Column(Integer, nullable=True)
    created_by       = Column(Integer, ForeignKey("employees.id"), nullable=True)
    organization_id  = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    created_at       = Column(DateTime, server_default=func.now())
    updated_at       = Column(DateTime, onupdate=func.now())

    assignments      = relationship("LearningTrainingProgramAssignment", back_populates="program")


class LearningTrainingProgramAssignment(Base):
    __tablename__ = "learning_training_program_assignments"

    id          = Column(Integer, primary_key=True, index=True)
    program_id  = Column(Integer, ForeignKey("learning_training_programs.id"), nullable=False)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    status      = Column(String(20), default="assigned")
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    attended_at = Column(DateTime, nullable=True)
    created_at  = Column(DateTime, server_default=func.now())

    program = relationship("LearningTrainingProgram", back_populates="assignments")


class LearningCalendarEvent(Base):
    __tablename__ = "learning_calendar_events"

    id          = Column(Integer, primary_key=True, index=True)
    title       = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    event_date  = Column(Date, nullable=False)
    start_time  = Column(DateTime, nullable=True)
    end_time    = Column(DateTime, nullable=True)
    event_type  = Column(String(50), default="session")
    course_id   = Column(Integer, ForeignKey("learning_courses.id"), nullable=True)
    program_id  = Column(Integer, ForeignKey("learning_training_programs.id"), nullable=True)
    location    = Column(String(200), nullable=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    created_by  = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at  = Column(DateTime, server_default=func.now())
    updated_at  = Column(DateTime, onupdate=func.now())


# ════════════════════════════════════════════════════════════════════════════════
# EMPLOYEE MANAGEMENT
# ════════════════════════════════════════════════════════════════════════════════

class EmployeeProfile(Base):
    __tablename__ = "employee_profiles"

    id              = Column(Integer, primary_key=True, index=True)
    employee_id     = Column(Integer, ForeignKey("employees.id"), nullable=False, unique=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    emergency_contact_name  = Column(String(150), nullable=True)
    emergency_contact_phone = Column(String(50), nullable=True)
    emergency_contact_relation = Column(String(50), nullable=True)
    blood_group     = Column(String(10), nullable=True)
    marital_status  = Column(String(20), nullable=True)
    nationality     = Column(String(50), nullable=True)
    religion        = Column(String(50), nullable=True)
    pan_number      = Column(String(20), nullable=True)
    aadhar_number   = Column(String(20), nullable=True)
    uan_number      = Column(String(20), nullable=True)
    bank_name       = Column(String(100), nullable=True)
    bank_account    = Column(String(50), nullable=True)
    bank_ifsc       = Column(String(20), nullable=True)
    pf_number       = Column(String(50), nullable=True)
    esic_number     = Column(String(50), nullable=True)
    passport_number = Column(String(50), nullable=True)
    passport_expiry = Column(Date, nullable=True)
    visa_number     = Column(String(50), nullable=True)
    visa_expiry     = Column(Date, nullable=True)
    work_permit_expiry = Column(Date, nullable=True)
    skills          = Column(Text, nullable=True)
    certifications  = Column(Text, nullable=True)
    projects        = Column(Text, nullable=True)
    achievements    = Column(Text, nullable=True)
    notes           = Column(Text, nullable=True)
    created_at      = Column(DateTime, server_default=func.now())
    updated_at      = Column(DateTime, onupdate=func.now())

    employee        = relationship("Employee", backref="profile")
    organization    = relationship("Organization")


class EmployeeReporting(Base):
    __tablename__ = "employee_reporting"

    id              = Column(Integer, primary_key=True, index=True)
    employee_id     = Column(Integer, ForeignKey("employees.id"), nullable=False, unique=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    manager_id      = Column(Integer, ForeignKey("employees.id"), nullable=True, index=True)
    dotted_manager_id = Column(Integer, ForeignKey("employees.id"), nullable=True, index=True)
    department_id   = Column(Integer, ForeignKey("departments.id"), nullable=True, index=True)
    designation_id  = Column(Integer, nullable=True)
    reporting_level = Column(Integer, default=1)
    team_size       = Column(Integer, default=0)
    cost_center     = Column(String(50), nullable=True)
    location        = Column(String(100), nullable=True)
    is_direct_report = Column(Boolean, default=True)
    effective_from  = Column(Date, nullable=False)
    effective_to    = Column(Date, nullable=True)
    created_at      = Column(DateTime, server_default=func.now())
    updated_at      = Column(DateTime, onupdate=func.now())

    employee        = relationship("Employee", backref="reporting", foreign_keys=[employee_id])
    manager         = relationship("Employee", foreign_keys=[manager_id])
    dotted_manager  = relationship("Employee", foreign_keys=[dotted_manager_id])
    department      = relationship("Department")
    organization    = relationship("Organization")


class EmployeeLifecycle(Base):
    __tablename__ = "employee_lifecycle"

    id              = Column(Integer, primary_key=True, index=True)
    employee_id     = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    event_type      = Column(String(50), nullable=False, index=True)
    event_date      = Column(Date, nullable=False)
    effective_date  = Column(Date, nullable=True)
    previous_value  = Column(JSON, nullable=True)
    new_value       = Column(JSON, nullable=True)
    reason          = Column(Text, nullable=True)
    initiated_by    = Column(Integer, ForeignKey("employees.id"), nullable=True)
    approved_by     = Column(Integer, ForeignKey("employees.id"), nullable=True)
    status          = Column(String(20), default="pending", nullable=False)
    documents       = Column(JSON, nullable=True)
    notes           = Column(Text, nullable=True)
    created_at      = Column(DateTime, server_default=func.now())
    updated_at      = Column(DateTime, onupdate=func.now())

    employee        = relationship("Employee", backref="lifecycle_events", foreign_keys=[employee_id])
    initiator       = relationship("Employee", foreign_keys=[initiated_by])
    approver        = relationship("Employee", foreign_keys=[approved_by])
    organization    = relationship("Organization")


class EmployeeHistory(Base):
    __tablename__ = "employee_history"

    id              = Column(Integer, primary_key=True, index=True)
    employee_id     = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    field_name      = Column(String(100), nullable=False)
    old_value       = Column(Text, nullable=True)
    new_value       = Column(Text, nullable=True)
    changed_by      = Column(Integer, ForeignKey("employees.id"), nullable=True)
    change_reason   = Column(Text, nullable=True)
    created_at      = Column(DateTime, server_default=func.now())

    employee        = relationship("Employee", backref="history", foreign_keys=[employee_id])
    changer         = relationship("Employee", foreign_keys=[changed_by])
    organization    = relationship("Organization")


class EmployeeLifecycleStatus(str, enum.Enum):
    PROBATION_START    = "probation_start"
    PROBATION_END      = "probation_end"
    CONFIRMATION       = "confirmation"
    PROMOTION          = "promotion"
    TRANSFER           = "transfer"
    RESIGNATION        = "resignation"
    EXIT               = "exit"
    REHIRE             = "rehire"
    CONTRACT_RENEWAL   = "contract_renewal"
    ROLE_CHANGE        = "role_change"
    DEPARTMENT_CHANGE  = "department_change"
    MANAGER_CHANGE     = "manager_change"
    LOCATION_CHANGE    = "location_change"
    SALARY_REVISION    = "salary_revision"
    LEAVE_OF_ABSENCE   = "leave_of_absence"
    RETURN_FROM_LEAVE  = "return_from_leave"


class EmployeeLifecycleEventStatus(str, enum.Enum):
    PENDING   = "pending"
    APPROVED  = "approved"
    REJECTED  = "rejected"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

# ════════════════════════════════════════════════════════════════════════════════
# DESIGNATION MODELS
# ════════════════════════════════════════════════════════════════════════════════

class Designation(Base):
    __tablename__ = "designations"

    id              = Column(Integer, primary_key=True, index=True)
    title           = Column(String(150), nullable=False)
    designation_code = Column(String(20), nullable=True, unique=True)
    department_name = Column(String(150), nullable=True)
    level           = Column(String(10), nullable=True)   # L1 … L10
    description     = Column(Text, nullable=True)
    status          = Column(String(20), nullable=False, default="active")
    min_salary      = Column(Float, nullable=True)
    max_salary      = Column(Float, nullable=True)
    employees_count = Column(Integer, nullable=False, default=0)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    organization    = relationship("Organization")

# ════════════════════════════════════════════════════════════════════════════════
# HR DOCUMENTS  (company-wide + employee documents)
# ════════════════════════════════════════════════════════════════════════════════

class HrDocumentStatus(str, enum.Enum):
    PENDING  = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED  = "expired"

class HrDocumentCategory(str, enum.Enum):
    COMPANY  = "company"
    EMPLOYEE = "employee"
    POLICY   = "policy"
    CONTRACT = "contract"
    PAYSLIP  = "payslip"
    TAX      = "tax"
    OTHER    = "other"


class HrDocument(Base):
    __tablename__ = "hr_documents"

    id              = Column(Integer, primary_key=True, index=True)
    title           = Column(String(255), nullable=False)
    description     = Column(Text, nullable=True)
    # category distinguishes "company" docs from "employee" docs in the UI
    category        = Column(Enum(HrDocumentCategory), default=HrDocumentCategory.OTHER, nullable=False)
    document_type   = Column(String(100), nullable=True)   # e.g. "offer_letter", "policy"
    file_path       = Column(String(500), nullable=True)   # server-side storage path
    file_name       = Column(String(255), nullable=True)   # original uploaded file name
    file_size       = Column(Integer, nullable=True)       # bytes
    mime_type       = Column(String(100), nullable=True)
    status          = Column(Enum(HrDocumentStatus), default=HrDocumentStatus.PENDING, nullable=False, index=True)
    rejection_reason = Column(Text, nullable=True)
    # optional link to a specific employee
    employee_id     = Column(Integer, ForeignKey("employees.id"), nullable=True, index=True)
    # who uploaded/created this document
    uploaded_by     = Column(Integer, ForeignKey("employees.id"), nullable=True)
    expiry_date     = Column(Date, nullable=True)
    tags            = Column(JSON, nullable=True)           # list[str] for free-form tags
    is_deleted      = Column(Boolean, default=False, nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    created_at      = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at      = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    current_version = Column(Integer, default=1, nullable=False)
    access_control  = Column(JSON, nullable=True)
    approved_by     = Column(Integer, ForeignKey("employees.id"), nullable=True)
    approved_at     = Column(DateTime, nullable=True)
    is_template     = Column(Boolean, default=False, nullable=False)

    employee        = relationship("Employee", foreign_keys=[employee_id], backref="hr_documents")
    uploader        = relationship("Employee", foreign_keys=[uploaded_by])
    organization    = relationship("Organization")
    approver        = relationship("Employee", foreign_keys=[approved_by])
    versions        = relationship("HrDocumentVersion", back_populates="document", order_by="HrDocumentVersion.version.desc()")
    approval_steps  = relationship("DocumentApprovalStep", back_populates="document", order_by="DocumentApprovalStep.step_order")
    approval_logs   = relationship("DocumentApprovalLog", back_populates="document", order_by="DocumentApprovalLog.created_at.desc()")
    assignments     = relationship("DocumentAssignment", back_populates="document", order_by="DocumentAssignment.assigned_at.desc()")


# ════════════════════════════════════════════════════════════════════════════════
# DOCUMENT VERSION HISTORY
# ════════════════════════════════════════════════════════════════════════════════

class HrDocumentVersion(Base):
    __tablename__ = "hr_document_versions"

    id              = Column(Integer, primary_key=True, index=True)
    document_id     = Column(Integer, ForeignKey("hr_documents.id"), nullable=False, index=True)
    version         = Column(Integer, nullable=False)
    file_path       = Column(String(500), nullable=True)
    file_name       = Column(String(255), nullable=True)
    file_size       = Column(Integer, nullable=True)
    mime_type       = Column(String(100), nullable=True)
    uploaded_by     = Column(Integer, ForeignKey("employees.id"), nullable=True)
    change_notes    = Column(Text, nullable=True)
    created_at      = Column(DateTime, server_default=func.now(), nullable=False)

    document        = relationship("HrDocument", back_populates="versions")
    uploader        = relationship("Employee")


# ════════════════════════════════════════════════════════════════════════════════
# DOCUMENT APPROVAL WORKFLOW — multi-step chain
# ════════════════════════════════════════════════════════════════════════════════

class ApprovalStepStatus(str, enum.Enum):
    PENDING  = "pending"
    APPROVED = "approved"
    SKIPPED  = "skipped"
    REJECTED = "rejected"

class DocumentApprovalStep(Base):
    """
    Each row is one step in a document's approval chain.
    Default chain: manager -> hr_admin -> admin
    If org admin (admin) or HR admin (hr_admin) approves at any step,
    all remaining steps are auto-skipped and document is approved.
    """
    __tablename__ = "document_approval_steps"

    id              = Column(Integer, primary_key=True, index=True)
    document_id     = Column(Integer, ForeignKey("hr_documents.id"), nullable=False, index=True)
    step_order      = Column(Integer, nullable=False)
    required_role   = Column(String(50), nullable=False)  # "manager", "hr_admin", "admin"
    status          = Column(Enum(ApprovalStepStatus), default=ApprovalStepStatus.PENDING, nullable=False)
    approved_by     = Column(Integer, ForeignKey("employees.id"), nullable=True)
    approved_at     = Column(DateTime, nullable=True)
    comment         = Column(Text, nullable=True)
    created_at      = Column(DateTime, server_default=func.now(), nullable=False)

    document        = relationship("HrDocument", back_populates="approval_steps")
    approver        = relationship("Employee", foreign_keys=[approved_by])


class DocumentApprovalLog(Base):
    """Audit trail for every approval/rejection action on documents."""
    __tablename__ = "document_approval_logs"

    id              = Column(Integer, primary_key=True, index=True)
    document_id     = Column(Integer, ForeignKey("hr_documents.id"), nullable=False, index=True)
    action          = Column(String(20), nullable=False)  # "approved", "rejected", "skipped", "version_uploaded"
    step_id         = Column(Integer, ForeignKey("document_approval_steps.id"), nullable=True)
    performed_by    = Column(Integer, ForeignKey("employees.id"), nullable=True)
    role_at_time    = Column(String(50), nullable=True)
    comment         = Column(Text, nullable=True)
    created_at      = Column(DateTime, server_default=func.now(), nullable=False)

    document        = relationship("HrDocument", back_populates="approval_logs")
    step            = relationship("DocumentApprovalStep")
    performer       = relationship("Employee", foreign_keys=[performed_by])


# ════════════════════════════════════════════════════════════════════════════════
# DOCUMENT-EMPLOYEE ASSIGNMENTS  (assign company docs to employees)
# ════════════════════════════════════════════════════════════════════════════════

class AssignmentStatus(str, enum.Enum):
    PENDING      = "pending"
    ACKNOWLEDGED = "acknowledged"
    COMPLETED    = "completed"


class DocumentAssignment(Base):
    """
    Tracks which company documents have been assigned to which employees.
    Employees can acknowledge/review assigned documents.
    """
    __tablename__ = "document_assignments"

    id              = Column(Integer, primary_key=True, index=True)
    document_id     = Column(Integer, ForeignKey("hr_documents.id"), nullable=False, index=True)
    employee_id     = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    assigned_by     = Column(Integer, ForeignKey("employees.id"), nullable=True)
    status          = Column(Enum(AssignmentStatus), default=AssignmentStatus.PENDING, nullable=False)
    notes           = Column(Text, nullable=True)
    acknowledged_at = Column(DateTime, nullable=True)
    assigned_at     = Column(DateTime, server_default=func.now(), nullable=False)

    document        = relationship("HrDocument", back_populates="assignments")
    employee        = relationship("Employee", foreign_keys=[employee_id])
    assigner        = relationship("Employee", foreign_keys=[assigned_by])


# ════════════════════════════════════════════════════════════════════════════════
# ORGANIZATION CONFIGURATION  (per-org key-value settings)
# ════════════════════════════════════════════════════════════════════════════════

class OrganizationConfig(Base):
    """
    Per-organization configuration key-value store.
    Allows each tenant to customize behavior without global config changes.

    Examples:
        - "leave_year_start_month": "1"
        - "default_currency": "INR"
        - "fiscal_year_start": "2025-04-01"
        - "timezone": "Asia/Kolkata"
        - "date_format": "DD/MM/YYYY"
        - "enable_self_service_leave": "true"
    """
    __tablename__ = "organization_configs"

    id              = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    key             = Column(String(200), nullable=False)
    value           = Column(Text, nullable=True)
    description     = Column(Text, nullable=True)
    category        = Column(String(100), default="general")
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    updated_at      = Column(DateTime(timezone=True), onupdate=func.now())

    organization    = relationship("Organization", backref="configs")

    __table_args__ = (
        UniqueConstraint("organization_id", "key", name="uq_org_config_key"),
    )