"""
modules/super_admin/router.py
-----------------------------
Super Admin endpoints for the standalone HR platform.

Super Admin is a platform-wide role (Employee with role=SUPER_ADMIN and no
organization). The first Super Admin is bootstrapped via a setup-key protected
endpoint (or scripts/seed_super_admin.py) and then logs in through the normal
/auth/login flow.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.core.dependencies import get_current_super_admin
from app.core.exceptions import BadRequestException, NotFoundException, UnauthorizedException
from app.core.security import hash_password

from app.modules.super_admin.models import (
    AuditAction, AuditLog, LoginActivity, Notification, PlatformSetting, ApprovalHistory,
)
from app.modules.super_admin.schemas import (
    DashboardStats, OrganizationDetail, OrganizationStatusUpdate, OrganizationSummary,
    PlatformSettingItem, PlatformSettingUpdate, SuperAdminBootstrapRequest,
    AuditLogItem, LoginActivityItem, NotificationItem, NotificationCreate,
)

logger = logging.getLogger("zoiko.super_admin")

router = APIRouter(prefix="/super-admin", tags=["Super Admin"])

_SETTER = "current_user"  # unused placeholder to keep helpers uniform

_PLATFORM_SETTING_DEFAULTS = [
    ("site_name", "Zoiko HR Platform", "Platform display name", "branding"),
    ("logo_url", "", "Logo URL for the platform", "branding"),
    ("primary_color", "#FF7A00", "Primary brand color", "branding"),
    ("smtp_host", settings.SMTP_HOST, "SMTP server host", "email"),
    ("smtp_port", settings.SMTP_PORT, "SMTP server port", "email"),
    ("smtp_username", settings.SMTP_USERNAME, "SMTP authentication username", "email"),
    ("smtp_from_email", settings.SMTP_FROM_EMAIL, "Default from email address", "email"),
    ("password_min_length", "8", "Minimum password length requirement", "security"),
    ("max_file_size_mb", "10", "Maximum file upload size in MB", "file_upload"),
]


def _seed_platform_settings(db: Session) -> int:
    """Insert default platform settings if none exist. Returns count created."""
    if db.query(PlatformSetting).first():
        return 0
    for key, value, desc, cat in _PLATFORM_SETTING_DEFAULTS:
        db.add(PlatformSetting(key=key, value=value, description=desc, category=cat))
    db.commit()
    return len(_PLATFORM_SETTING_DEFAULTS)


# ═══════════════════════════════════════════════════════════════════════════════
# BOOTSTRAP (setup-key protected)
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/bootstrap", summary="Create the platform Super Admin (setup-key protected)")
def bootstrap_super_admin(data: SuperAdminBootstrapRequest, db: Session = Depends(get_db)):
    if not settings.SUPER_ADMIN_SETUP_KEY:
        raise UnauthorizedException(
            "Super Admin bootstrap is disabled. Set SUPER_ADMIN_SETUP_KEY in the environment."
        )
    if data.setup_key != settings.SUPER_ADMIN_SETUP_KEY:
        raise UnauthorizedException("Invalid setup key.")

    from datetime import date
    from app.modules.employee.models import Employee, EmploymentType, EmployeeStatus, UserRole, Gender
    from app.core.code_generation import generate_employee_code

    existing = db.query(Employee).filter(Employee.email == data.email).first()
    if existing:
        return {"message": "Super Admin already exists for this email.", "created": False}

    employee_code = generate_employee_code(db, None)

    super_admin = Employee(
        email=data.email,
        hashed_password=hash_password(data.password),
        role=UserRole.SUPER_ADMIN,
        is_active=True,
        first_name=data.first_name,
        last_name=data.last_name,
        phone="",
        employee_code=employee_code,
        employee_id=None,
        job_title="Super Administrator",
        employment_type=EmploymentType.FULL_TIME,
        status=EmployeeStatus.ACTIVE,
        date_of_joining=date.today(),
        organization_id=None,
    )
    db.add(super_admin)
    db.commit()
    db.refresh(super_admin)

    created = _seed_platform_settings(db)

    db.add(AuditLog(
        action=AuditAction.CREATE,
        entity_type="SuperAdmin",
        entity_id=super_admin.id,
        performed_by=super_admin.id,
        performed_by_email=super_admin.email,
        details={"action": "bootstrap", "platform_settings_seeded": created},
    ))
    db.commit()

    logger.info("Super Admin bootstrapped: %s", super_admin.email)
    return {"message": "Super Admin created successfully.", "created": True}


# ═══════════════════════════════════════════════════════════════════════════════
# DASHBOARD
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/dashboard/stats", response_model=DashboardStats, summary="Platform dashboard stats")
def dashboard_stats(db: Session = Depends(get_db), _=Depends(get_current_super_admin)):
    from app.modules.hr.models import Organization, OrganizationStatus
    from app.modules.employee.models import Employee, UserRole, EmployeeStatus

    orgs = db.query(Organization).all()
    employees = db.query(Employee).all()

    def _count_org(status) -> int:
        return sum(1 for o in orgs if o.status and o.status.value == status.value)

    def _count_emp_role(role) -> int:
        return sum(1 for e in employees if e.role and e.role.value == role.value)

    total_employees = len(employees)
    active_employees = sum(
        1 for e in employees if e.status and e.status.value == EmployeeStatus.ACTIVE.value
    )

    recent = sorted(orgs, key=lambda o: o.created_at or __import__("datetime").datetime.min, reverse=True)[:5]

    def _summary(o):
        org_emps = [e for e in employees if e.organization_id == o.id]
        return OrganizationSummary(
            id=o.id,
            name=o.name,
            organization_code=o.organization_code,
            status=o.status.value if o.status else None,
            is_active=bool(o.is_active),
            total_employees=len(org_emps),
            active_employees=sum(
                1 for e in org_emps if e.status and e.status.value == EmployeeStatus.ACTIVE.value
            ),
            created_at=o.created_at,
        )

    return DashboardStats(
        total_organizations=len(orgs),
        active_organizations=_count_org(OrganizationStatus.ACTIVE),
        suspended_organizations=_count_org(OrganizationStatus.SUSPENDED),
        total_employees=total_employees,
        active_employees=active_employees,
        total_admins=_count_emp_role(UserRole.ADMIN),
        total_hr_admins=_count_emp_role(UserRole.HR_ADMIN),
        recent_organizations=[_summary(o) for o in recent],
    )


# ═══════════════════════════════════════════════════════════════════════════════
# ORGANIZATIONS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/organizations", summary="List all organizations")
def list_organizations(
    status: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    _=Depends(get_current_super_admin),
):
    from app.modules.hr.models import Organization
    from app.modules.employee.models import Employee, EmployeeStatus

    q = db.query(Organization)
    if status:
        q = q.filter(Organization.status == status)
    if search:
        term = f"%{search}%"
        q = q.filter(Organization.name.ilike(term))
    total = q.count()
    orgs = q.order_by(Organization.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    employees = db.query(Employee).all()
    result = []
    for o in orgs:
        org_emps = [e for e in employees if e.organization_id == o.id]
        result.append(OrganizationSummary(
            id=o.id,
            name=o.name,
            organization_code=o.organization_code,
            status=o.status.value if o.status else None,
            is_active=bool(o.is_active),
            total_employees=len(org_emps),
            active_employees=sum(
                1 for e in org_emps if e.status and e.status.value == EmployeeStatus.ACTIVE.value
            ),
            created_at=o.created_at,
        ))
    return {"organizations": result, "total": total}


@router.get("/organizations/{org_id}", response_model=OrganizationDetail, summary="Organization detail")
def get_organization(org_id: int, db: Session = Depends(get_db), _=Depends(get_current_super_admin)):
    from app.modules.hr.models import Organization
    from app.modules.employee.models import Employee, UserRole, EmployeeStatus

    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise NotFoundException("Organization", org_id)

    employees = db.query(Employee).filter(Employee.organization_id == org_id).all()
    admin = next((e for e in employees if e.role and e.role.value == UserRole.ADMIN.value), None)
    hr_admins = sum(1 for e in employees if e.role and e.role.value == UserRole.HR_ADMIN.value)
    managers = sum(1 for e in employees if e.role and e.role.value == UserRole.MANAGER.value)

    return OrganizationDetail(
        id=org.id,
        name=org.name,
        organization_code=org.organization_code,
        status=org.status.value if org.status else None,
        is_active=bool(org.is_active),
        total_employees=len(employees),
        active_employees=sum(
            1 for e in employees if e.status and e.status.value == EmployeeStatus.ACTIVE.value
        ),
        created_at=org.created_at,
        domain=org.domain,
        address=org.address,
        country=org.country,
        state=org.state,
        city=org.city,
        timezone=org.timezone,
        industry=org.industry,
        admin_name=admin.full_name if admin else None,
        admin_email=admin.email if admin else None,
        hr_admins=hr_admins,
        managers=managers,
    )


@router.post("/organizations/{org_id}/status", summary="Update organization status")
def update_organization_status(
    org_id: int,
    data: OrganizationStatusUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_super_admin),
):
    from app.modules.hr.models import Organization, OrganizationStatus

    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise NotFoundException("Organization", org_id)

    status_map = {
        "active": OrganizationStatus.ACTIVE,
        "suspended": OrganizationStatus.SUSPENDED,
        "deactivated": OrganizationStatus.DEACTIVATED,
        "on_hold": OrganizationStatus.ON_HOLD,
        "approved": OrganizationStatus.APPROVED,
        "rejected": OrganizationStatus.REJECTED,
    }
    new_status = status_map.get(data.status.strip().lower())
    if new_status is None:
        raise BadRequestException(
            f"Invalid status '{data.status}'. Allowed: {', '.join(status_map)}"
        )

    previous = org.status.value if org.status else None
    org.status = new_status
    org.is_active = new_status in (OrganizationStatus.ACTIVE, OrganizationStatus.APPROVED)
    if new_status == OrganizationStatus.SUSPENDED:
        org.suspended_at = __import__("datetime").datetime.utcnow()
    db.commit()

    db.add(ApprovalHistory(
        organization_id=org.id,
        action="status_change",
        previous_status=previous,
        new_status=new_status.value,
        performed_by=current_user.id,
        reason=data.reason,
    ))
    db.add(AuditLog(
        action=AuditAction.CONFIG_CHANGE,
        entity_type="Organization",
        entity_id=org.id,
        performed_by=current_user.id,
        performed_by_email=current_user.email,
        details={"previous_status": previous, "new_status": new_status.value, "reason": data.reason},
    ))
    db.commit()

    return {"message": f"Organization {org.name} status set to {new_status.value}."}


# ═══════════════════════════════════════════════════════════════════════════════
# AUDIT / ACTIVITY / NOTIFICATIONS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/audit-logs", summary="Recent audit logs")
def list_audit_logs(
    limit: int = 50,
    db: Session = Depends(get_db),
    _=Depends(get_current_super_admin),
):
    q = db.query(AuditLog)
    total = q.count()
    rows = q.order_by(AuditLog.created_at.desc()).limit(min(limit, 200)).all()
    return {"logs": rows, "total": total}


@router.get("/login-activity", summary="Recent login activity")
def list_login_activity(
    limit: int = 50,
    db: Session = Depends(get_db),
    _=Depends(get_current_super_admin),
):
    q = db.query(LoginActivity)
    total = q.count()
    rows = q.order_by(LoginActivity.created_at.desc()).limit(min(limit, 200)).all()
    return {"activities": rows, "total": total}


@router.get("/notifications", summary="Platform notifications")
def list_notifications(
    limit: int = 50,
    db: Session = Depends(get_db),
    _=Depends(get_current_super_admin),
):
    q = db.query(Notification)
    total = q.count()
    rows = q.order_by(Notification.created_at.desc()).limit(min(limit, 200)).all()
    return {"notifications": rows, "total": total}


@router.post("/notifications", response_model=NotificationItem, summary="Create a platform notification")
def create_notification(
    data: NotificationCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_super_admin),
):
    row = Notification(
        title=data.title,
        message=data.message,
        notification_type=data.notification_type,
        priority=data.priority,
        target_org_id=data.target_org_id,
        target_user_id=data.target_user_id,
        created_by=current_user.id,
    )
    db.add(row)
    db.add(AuditLog(
        action=AuditAction.CONFIG_CHANGE,
        entity_type="Notification",
        entity_id=current_user.id,
        performed_by=current_user.id,
        performed_by_email=current_user.email,
        details={"title": data.title},
    ))
    db.commit()
    db.refresh(row)
    return row


@router.put("/notifications/{notification_id}/read", summary="Mark a notification as read")
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_super_admin),
):
    row = db.query(Notification).filter(Notification.id == notification_id).first()
    if not row:
        raise NotFoundException("Notification", notification_id)
    row.is_read = True
    db.commit()
    db.refresh(row)
    return row


@router.delete("/notifications/{notification_id}", summary="Delete a notification")
def delete_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_super_admin),
):
    row = db.query(Notification).filter(Notification.id == notification_id).first()
    if not row:
        raise NotFoundException("Notification", notification_id)
    db.delete(row)
    db.commit()
    return {"message": "Notification deleted."}


# ═══════════════════════════════════════════════════════════════════════════════
# PLATFORM SETTINGS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/platform-settings", response_model=list[PlatformSettingItem], summary="List platform settings")
def list_platform_settings(db: Session = Depends(get_db), _=Depends(get_current_super_admin)):
    return db.query(PlatformSetting).order_by(PlatformSetting.category, PlatformSetting.key).all()


@router.put("/platform-settings/{key}", response_model=PlatformSettingItem, summary="Update a platform setting")
def update_platform_setting(
    key: str,
    data: PlatformSettingUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_super_admin),
):
    row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
    if not row:
        raise NotFoundException("PlatformSetting", key)
    row.value = data.value
    db.commit()
    db.refresh(row)
    db.add(AuditLog(
        action=AuditAction.CONFIG_CHANGE,
        entity_type="PlatformSetting",
        entity_id=row.id,
        performed_by=current_user.id,
        performed_by_email=current_user.email,
        details={"key": key},
    ))
    db.commit()
    return row


# ── Public health probe (no auth) ─────────────────────────────────────────────
@router.get("/health", include_in_schema=False, summary="Liveness probe")
def health():
    return {"status": "ok"}
