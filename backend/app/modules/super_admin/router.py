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
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.core.dependencies import get_current_super_admin
from app.core.exceptions import (
    BadRequestException, NotFoundException, UnauthorizedException, ZoikoException,
)
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
    if not secrets.compare_digest(data.setup_key, settings.SUPER_ADMIN_SETUP_KEY):
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
    from app.modules.hr.models import Organization, OrganizationStatus
    from app.modules.employee.models import Employee, EmployeeStatus, UserRole
    from app.modules.billing.models import BillingSubscription, OrganizationEvaluation
    from app.modules.billing.models import PlanCode as BillingPlanCode

    q = db.query(Organization)
    if status:
        q = q.filter(Organization.status.ilike(status))
    if search:
        term = f"%{search}%"
        q = q.filter(
            Organization.name.ilike(term)
            | Organization.organization_code.ilike(term)
        )
    total = q.count()
    orgs = q.order_by(Organization.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    all_employees = db.query(Employee).filter(Employee.organization_id.in_([o.id for o in orgs])).all() if orgs else []
    emp_by_org = {}
    for e in all_employees:
        emp_by_org.setdefault(e.organization_id, []).append(e)

    plan_display = {
        BillingPlanCode.CORE: "Core",
        BillingPlanCode.ADVANCED: "Advanced",
        BillingPlanCode.ENTERPRISE: "Enterprise",
    }

    org_ids = [o.id for o in orgs]
    subs = {}
    evals = {}
    if org_ids:
        for sub in db.query(BillingSubscription).filter(BillingSubscription.organization_id.in_(org_ids)).all():
            subs[sub.organization_id] = sub
        for ev in db.query(OrganizationEvaluation).filter(
            OrganizationEvaluation.organization_id.in_(org_ids),
            OrganizationEvaluation.status == "active",
        ).all():
            evals[ev.organization_id] = ev

    approver_ids = {o.approved_by for o in orgs if o.approved_by}
    approvers = {}
    if approver_ids:
        for emp in db.query(Employee).filter(Employee.id.in_(approver_ids)).all():
            approvers[emp.id] = emp

    result = []
    for o in orgs:
        org_emps = emp_by_org.get(o.id, [])
        admin = next((e for e in org_emps if e.role and e.role.value == UserRole.ADMIN.value), None)
        sub = subs.get(o.id)
        ev = evals.get(o.id)
        sub_plan = None
        eval_end = None

        if sub and sub.plan_code:
            sub_plan = plan_display.get(sub.plan_code, sub.plan_code.value if hasattr(sub.plan_code, 'value') else str(sub.plan_code))
        elif sub and sub.status and sub.status.value == "EVALUATION":
            sub_plan = "Evaluation"

        if ev:
            eval_end = ev.evaluation_ends_at
        elif not sub_plan or sub_plan == "Evaluation":
            from datetime import datetime, timedelta
            default_eval_days = 14
            base = o.created_at or datetime.utcnow()
            eval_end = base + timedelta(days=default_eval_days)
            if not sub_plan:
                sub_plan = "Evaluation"

        approver = approvers.get(o.approved_by)

        result.append(OrganizationSummary(
            id=o.id,
            name=o.name,
            code=o.code,
            organization_code=o.organization_code,
            status=o.status.value if o.status else None,
            is_active=bool(o.is_active),
            total_employees=len(org_emps),
            user_count=len(org_emps),
            active_employees=sum(
                1 for e in org_emps if e.status and e.status.value == EmployeeStatus.ACTIVE.value
            ),
            subscription_plan=sub_plan,
            evaluation_ends_at=eval_end,
            admin_name=admin.full_name if admin else None,
            admin_email=admin.email if admin else None,
            approved_by_name=approver.full_name if approver else None,
            approved_at=o.approved_at,
            suspended_at=o.suspended_at,
            reactivated_at=o.reactivated_at,
            rejection_reason=o.rejection_reason,
            created_at=o.created_at,
        ))
    return {"organizations": result, "total": total}


@router.get("/organizations/{org_id}", response_model=OrganizationDetail, summary="Organization detail")
def get_organization(org_id: int, db: Session = Depends(get_db), _=Depends(get_current_super_admin)):
    from app.modules.hr.models import Organization
    from app.modules.employee.models import Employee, UserRole, EmployeeStatus
    from app.modules.billing.models import BillingSubscription, OrganizationEvaluation
    from app.modules.billing.models import PlanCode as BillingPlanCode

    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise NotFoundException("Organization", org_id)

    employees = db.query(Employee).filter(Employee.organization_id == org_id).all()
    admin = next((e for e in employees if e.role and e.role.value == UserRole.ADMIN.value), None)
    hr_admins = sum(1 for e in employees if e.role and e.role.value == UserRole.HR_ADMIN.value)
    managers = sum(1 for e in employees if e.role and e.role.value == UserRole.MANAGER.value)

    plan_display = {
        BillingPlanCode.CORE: "Core",
        BillingPlanCode.ADVANCED: "Advanced",
        BillingPlanCode.ENTERPRISE: "Enterprise",
    }

    sub = db.query(BillingSubscription).filter(BillingSubscription.organization_id == org_id).first()
    sub_plan = None
    if sub and sub.plan_code:
        sub_plan = plan_display.get(sub.plan_code, sub.plan_code.value if hasattr(sub.plan_code, 'value') else str(sub.plan_code))
    elif sub and sub.status and sub.status.value == "EVALUATION":
        sub_plan = "Evaluation"

    evaluation = db.query(OrganizationEvaluation).filter(
        OrganizationEvaluation.organization_id == org_id,
        OrganizationEvaluation.status == "active",
    ).first()

    approver = None
    if org.approved_by:
        approver = db.query(Employee).filter(Employee.id == org.approved_by).first()

    return OrganizationDetail(
        id=org.id,
        name=org.name,
        code=org.code,
        organization_code=org.organization_code,
        status=org.status.value if org.status else None,
        is_active=bool(org.is_active),
        total_employees=len(employees),
        user_count=len(employees),
        active_employees=sum(
            1 for e in employees if e.status and e.status.value == EmployeeStatus.ACTIVE.value
        ),
        subscription_plan=sub_plan,
        admin_name=admin.full_name if admin else None,
        admin_email=admin.email if admin else None,
        approved_by_name=approver.full_name if approver else None,
        approved_at=org.approved_at,
        suspended_at=org.suspended_at,
        reactivated_at=org.reactivated_at,
        rejection_reason=org.rejection_reason,
        created_at=org.created_at,
        domain=org.domain,
        address=org.address,
        country=org.country,
        state=org.state,
        city=org.city,
        timezone=org.timezone,
        industry=org.industry,
        hr_admins=hr_admins,
        managers=managers,
        evaluation_ends_at=evaluation.evaluation_ends_at if evaluation else None,
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

    from datetime import datetime as _dt
    now = _dt.utcnow()

    if new_status == OrganizationStatus.APPROVED:
        org.approved_by = current_user.id
        org.approved_at = now
    elif new_status == OrganizationStatus.REJECTED:
        org.rejection_reason = data.reason
    elif new_status == OrganizationStatus.SUSPENDED:
        org.suspended_at = now
    elif new_status == OrganizationStatus.ACTIVE and previous and previous.lower() in ("suspended", "on_hold"):
        org.reactivated_at = now
    elif new_status == OrganizationStatus.ON_HOLD:
        org.on_hold_at = now
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


@router.delete("/organizations/{org_id}", summary="Delete a rejected organization (hard delete)")
def delete_organization(
    org_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_super_admin),
):
    from app.modules.hr.models import Organization, OrganizationStatus
    from app.modules.employee.models import Employee
    from app.modules.billing.models import BillingSubscription, OrganizationEvaluation, BillingAuditLog, BillingConversion

    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise NotFoundException("Organization", org_id)

    if org.status != OrganizationStatus.REJECTED:
        raise BadRequestException("Only rejected organizations can be deleted.")

    for log in db.query(BillingAuditLog).filter(BillingAuditLog.organization_id == org_id).all():
        db.delete(log)
    for conv in db.query(BillingConversion).filter(BillingConversion.organization_id == org_id).all():
        db.delete(conv)
    for ev in db.query(OrganizationEvaluation).filter(OrganizationEvaluation.organization_id == org_id).all():
        db.delete(ev)
    for sub in db.query(BillingSubscription).filter(BillingSubscription.organization_id == org_id).all():
        db.delete(sub)
    for emp in db.query(Employee).filter(Employee.organization_id == org_id).all():
        emp.organization_id = None
    db.flush()

    db.add(AuditLog(
        action=AuditAction.DELETE,
        entity_type="Organization",
        entity_id=org.id,
        performed_by=current_user.id,
        performed_by_email=current_user.email,
        details={"name": org.name, "code": org.organization_code},
    ))
    db.delete(org)
    db.commit()

    return {"message": f"Organization '{org.name}' has been permanently deleted."}


# ═══════════════════════════════════════════════════════════════════════════════
# AUDIT LOGS (org-scoped)
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/organizations/{org_id}/audit-logs", summary="Audit logs for a specific organization")
def get_organization_audit_logs(
    org_id: int,
    limit: int = 50,
    db: Session = Depends(get_db),
    _=Depends(get_current_super_admin),
):
    from app.modules.hr.models import Organization
    if not db.query(Organization).filter(Organization.id == org_id).first():
        raise NotFoundException("Organization", org_id)

    q = db.query(AuditLog).filter(
        AuditLog.entity_type == "Organization",
        AuditLog.entity_id == org_id,
    )
    total = q.count()
    rows = q.order_by(AuditLog.created_at.desc()).limit(min(limit, 200)).all()
    return {"logs": rows, "total": total}


# ═══════════════════════════════════════════════════════════════════════════════
# USERS (platform-wide)
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/users", summary="List all platform users across organizations")
def list_users(
    search: Optional[str] = None,
    role: Optional[str] = None,
    status: Optional[str] = None,
    organization_id: Optional[int] = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    _=Depends(get_current_super_admin),
):
    from app.modules.employee.models import Employee, EmployeeStatus, UserRole

    q = db.query(Employee)

    if search:
        term = f"%{search}%"
        q = q.filter(
            Employee.first_name.ilike(term)
            | Employee.last_name.ilike(term)
            | Employee.email.ilike(term)
            | Employee.employee_code.ilike(term)
        )
    if role:
        try:
            role_enum = UserRole(role)
            q = q.filter(Employee.role == role_enum)
        except ValueError:
            pass
    if status:
        try:
            status_enum = EmployeeStatus(status)
            q = q.filter(Employee.status == status_enum)
        except ValueError:
            pass
    if organization_id:
        q = q.filter(Employee.organization_id == organization_id)

    total = q.count()
    rows = (
        q.order_by(Employee.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    org_ids = {e.organization_id for e in rows if e.organization_id}
    org_names = {}
    if org_ids:
        from app.modules.hr.models import Organization
        for org in db.query(Organization).filter(Organization.id.in_(org_ids)).all():
            org_names[org.id] = org.name

    users = []
    for e in rows:
        users.append({
            "id": e.id,
            "email": e.email,
            "role": e.role.value if e.role else None,
            "is_active": bool(e.is_active),
            "first_name": e.first_name or "",
            "last_name": e.last_name or "",
            "full_name": e.full_name,
            "phone": e.phone,
            "employee_code": e.employee_code,
            "status": e.status.value if e.status else None,
            "job_title": e.job_title,
            "organization_id": e.organization_id,
            "organization_name": org_names.get(e.organization_id),
            "created_at": str(e.created_at) if e.created_at else None,
        })

    return {"users": users, "total": total}


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
@router.get("/health", include_in_schema=False, summary="Readiness probe")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc_info:
        logger.error("Health check DB connectivity failed: %s", exc_info)
        raise ZoikoException(503, "SERVICE_UNAVAILABLE", "Database unreachable") from exc_info
    return {"status": "ok"}
