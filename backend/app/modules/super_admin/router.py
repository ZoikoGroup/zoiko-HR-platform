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

from fastapi import APIRouter, Depends, Header, HTTPException, Request
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
    AuditAction, AuditLog, LoginActivity, Notification, PlatformSetting, ApprovalHistory, EmailDeliveryLog,
)
from app.modules.super_admin.schemas import (
    DashboardStats, OrganizationDetail, OrganizationStatusUpdate, OrganizationSummary,
    PlatformSettingItem, PlatformSettingUpdate, SuperAdminBootstrapRequest,
    AuditLogItem, LoginActivityItem, NotificationItem, NotificationCreate,
    EmailDeliveryLogItem, EmailDeliveryLogResponse,
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
    (
        "entitlement_staged_org_ids",
        settings.ENFORCE_ENTITLEMENTS_ORG_IDS,
        "Comma-separated organization IDs for staged entitlement enforcement "
        "rollout (empty = enforce for every organization). Edited live via "
        "PUT /super-admin/platform-settings/entitlement_staged_org_ids — no "
        "redeploy needed. See the runbook comment in entitlement_middleware.py.",
        "entitlements",
    ),
]


def _seed_platform_settings(db: Session) -> int:
    """Insert any default platform settings missing from the table (per-key,
    not all-or-nothing) — so a setting added after a platform was already
    bootstrapped still gets its default row on the next startup."""
    existing_keys = {row.key for row in db.query(PlatformSetting.key).all()}
    created = 0
    for key, value, desc, cat in _PLATFORM_SETTING_DEFAULTS:
        if key in existing_keys:
            continue
        db.add(PlatformSetting(key=key, value=value, description=desc, category=cat))
        created += 1
    if created:
        db.commit()
    return created


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

def _org_ids_by_plan(db: Session, plan: str):
    """Resolve a plan filter value to the set of organization ids that match.

    Accepted values: ``core|advanced|enterprise`` (billing subscription plan
    code), ``evaluation`` (active OrganizationEvaluation row) and
    ``not_assigned`` (no subscription and no active evaluation). Unknown plan
    values return ``None``, meaning "no organizations match".
    """
    from app.modules.hr.models import Organization
    from app.modules.billing.models import BillingSubscription, OrganizationEvaluation, PlanCode

    norm = plan.strip().lower().replace(" ", "_")

    if norm in ("evaluation", "trial"):
        return {
            org_id
            for (org_id,) in db.query(OrganizationEvaluation.organization_id)
            .filter(OrganizationEvaluation.status == "active")
            .all()
        }

    if norm in ("not_assigned", "none", "no_plan"):
        subscribed = {org_id for (org_id,) in db.query(BillingSubscription.organization_id).all()}
        evaluating = {
            org_id
            for (org_id,) in db.query(OrganizationEvaluation.organization_id)
            .filter(OrganizationEvaluation.status == "active")
            .all()
        }
        return {o_id for (o_id,) in db.query(Organization.id).all()} - subscribed - evaluating

    code = next((c for c in PlanCode if c.value == norm), None)
    if code is None:
        return None
    return {
        org_id
        for (org_id,) in db.query(BillingSubscription.organization_id)
        .filter(BillingSubscription.plan_code == code)
        .all()
    }


@router.get("/organizations", summary="List all organizations")
def list_organizations(
    status: Optional[str] = None,
    search: Optional[str] = None,
    plan: Optional[str] = None,
    created_from: Optional[str] = None,
    created_to: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    _=Depends(get_current_super_admin),
):
    from datetime import datetime, timedelta
    import sqlalchemy as sa
    from app.modules.hr.models import Organization, OrganizationStatus
    from app.modules.employee.models import Employee, EmployeeStatus, UserRole
    from app.modules.billing.models import BillingSubscription, OrganizationEvaluation
    from app.modules.billing.models import PlanCode as BillingPlanCode

    q = db.query(Organization)
    if status:
        q = q.filter(Organization.status.ilike(status))
    if search:
        term = f"%{search}%"
        # Organization.name is a Python @property (organization_name or
        # display_name — the old `name` column was never created), so it has
        # no SQL expression to filter on; querying it directly crashes with
        # "'property' object has no attribute 'ilike'". Filter on the real
        # underlying columns instead.
        q = q.filter(
            Organization.organization_name.ilike(term)
            | Organization.display_name.ilike(term)
            | Organization.organization_code.ilike(term)
        )
    if created_from:
        try:
            q = q.filter(Organization.created_at >= datetime.fromisoformat(created_from))
        except ValueError:
            pass
    if created_to:
        try:
            end = datetime.fromisoformat(created_to)
            q = q.filter(
                Organization.created_at
                <= end.replace(hour=23, minute=59, second=59, microsecond=999999)
            )
        except ValueError:
            pass
    if plan:
        plan_org_ids = _org_ids_by_plan(db, plan)
        if plan_org_ids is None:
            q = q.filter(sa.sql.false())
        elif plan_org_ids:
            q = q.filter(Organization.id.in_(plan_org_ids))
        else:
            q = q.filter(sa.sql.false())
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
        org_type=org.org_type,
        phone=org.phone,
        tax_number=org.tax_number,
        registered_email=org.registered_email,
        hr_admins=hr_admins,
        managers=managers,
        evaluation_ends_at=evaluation.evaluation_ends_at if evaluation else None,
    )


# ── Two-step confirmation tokens (Prompt 5) ────────────────────────────────
# Destructive / irrevocable organization actions require a one-time,
# time-bounded, actor-bound confirmation token that is minted first and
# presented back on the mutating call.

_CONFIRMATION_HEADER_ID = "X-Confirmation-Id"
_CONFIRMATION_HEADER_TOKEN = "X-Confirmation-Token"


def _consume_confirmation(db: Session, current_user, org_id: int, purpose, confirmation_id, confirmation_token):
    """Consume a one-time confirmation token, enforcing purpose, actor-binding
    and expiry. Raises BadRequestException on any violation."""
    from app.modules.billing.delinquency_service import confirm_token
    from app.modules.billing.models import ConfirmationTokenPurpose

    try:
        confirm_token(
            db,
            token_id=confirmation_id,
            raw_token=confirmation_token,
            purpose=ConfirmationTokenPurpose(purpose),
            actor_id=current_user.id,
        )
    except ValueError as e:
        raise BadRequestException(str(e))


@router.post("/organizations/{org_id}/confirmation-tokens", summary="Mint a confirmation token for a destructive org action")
def mint_confirmation_token_endpoint(
    org_id: int,
    purpose: str = "update_organization_status",
    db: Session = Depends(get_db),
    current_user=Depends(get_current_super_admin),
):
    from app.modules.billing.delinquency_service import mint_confirmation_token
    from app.modules.billing.models import ConfirmationTokenPurpose

    if org_id < 0:
        raise BadRequestException("Invalid organization id.")
    try:
        purpose_enum = ConfirmationTokenPurpose(purpose)
    except ValueError:
        raise BadRequestException(f"Invalid confirmation purpose '{purpose}'.")

    token, raw = mint_confirmation_token(
        db,
        organization_id=org_id,
        purpose=purpose_enum,
        actor_id=current_user.id,
        actor_email=current_user.email,
        token_ttl_hours=24,
        token_metadata={"purpose": purpose},
    )
    return {
        "confirmation_id": token.id,
        "token": raw,
        "purpose": purpose,
        "organization_id": org_id,
        "expires_at": token.expires_at.isoformat(),
    }


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

    # Two-step confirmation for destructive transitions (Prompt 5).
    _destructive = (
        OrganizationStatus.SUSPENDED,
        OrganizationStatus.DEACTIVATED,
        OrganizationStatus.REJECTED,
        OrganizationStatus.ON_HOLD,
    )
    if new_status in _destructive:
        if not data.confirmation_id or not data.confirmation_token:
            raise BadRequestException(
                "Destructive status change requires a confirmation token. "
                "POST /super-admin/organizations/{org_id}/confirmation-tokens "
                "with purpose='update_organization_status' first, then pass "
                "confirmation_id + confirmation_token."
            )
        _consume_confirmation(
            db, current_user, org.id, "update_organization_status",
            data.confirmation_id, data.confirmation_token,
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


def _project_marked_values(db: Session, table, ref_col_name: str, marked_pks: set) -> set:
    """Map marked parent primary keys onto the column referenced by an FK.

    Most FKs reference the parent's single-column PK, so we project directly.
    Anything else is resolved with a real query (covers unique-column FKs)."""
    pk_cols = list(table.primary_key.columns)
    if len(pk_cols) == 1:
        pk_col = pk_cols[0]
        if pk_col.name == ref_col_name:
            return {pk for (pk,) in marked_pks}
        vals = [pk for (pk,) in marked_pks]
        rows = db.execute(table.select().where(pk_col.in_(vals))).all()
        return {getattr(r, ref_col_name) for r in rows if getattr(r, ref_col_name) is not None}
    from sqlalchemy import tuple_
    from app.database import Base
    ref_col = Base.metadata.tables[table.name].c[ref_col_name]
    rows = db.execute(table.select().where(tuple_(*pk_cols).in_(list(marked_pks)))).all()
    return {getattr(r, ref_col_name) for r in rows if getattr(r, ref_col_name) is not None}


def _teardown_organization(db: Session, org_id: int) -> list[str]:
    """Recursively collect and delete every row tied to an organization.

    Seeds the purge set with the organization itself, its members
    (employees) and every row carrying a direct organizations FK, then
    walks the foreign-key graph until a fixpoint so grandchildren rows
    (records referencing employees, departments, etc.) are removed too.
    Deletion order is children-before-parents (reverse topological)."""
    from app.database import Base
    from sqlalchemy import tuple_

    # Force-register every model module so the FK graph below is complete.
    import app.modules.hr.models  # noqa: F401
    import app.modules.employee.models  # noqa: F401
    import app.modules.billing.models  # noqa: F401
    import app.modules.assistant.models  # noqa: F401
    from app.modules.super_admin import command_center_models  # noqa: F401

    from app.modules.employee.models import Employee

    tables = list(Base.metadata.tables.values())
    marked_pks: dict[str, set] = {"organizations": {(org_id,)}}

    member_ids = [row[0] for row in db.query(Employee.id).filter(Employee.organization_id == org_id).all()]
    if member_ids:
        marked_pks["employees"] = {(eid,) for eid in member_ids}

    # Seed: every table with a direct FK to organizations.
    for table in tables:
        if table.name == "organizations":
            continue
        for fk in table.foreign_keys:
            if fk.column.table.name != "organizations":
                continue
            pk_cols = list(table.primary_key.columns)
            if len(pk_cols) != 1:
                continue
            rows = db.execute(table.select().where(fk.parent == org_id)).all()
            if rows:
                marked_pks.setdefault(table.name, set()).update(
                    (getattr(r, pk_cols[0].name),) for r in rows
                )
            break

    # Propagate: mark child rows whose parent rows are marked. Idempotent fixpoint.
    changed = True
    while changed:
        changed = False
        for child in tables:
            for fk in child.foreign_keys:
                parent = fk.column.table
                parent_vals = marked_pks.get(parent.name)
                if not parent_vals:
                    continue
                projected = _project_marked_values(db, parent, fk.column.name, parent_vals)
                if not projected:
                    continue
                pk_cols = list(child.primary_key.columns)
                if len(pk_cols) != 1:
                    continue
                rows = db.execute(child.select().where(fk.parent.in_(projected))).all()
                for r in rows:
                    pk = (getattr(r, pk_cols[0].name),)
                    bucket = marked_pks.setdefault(child.name, set())
                    if pk in bucket:
                        continue
                    bucket.add(pk)
                    changed = True

    # The schema has FK cycles (departments <-> employees <-> organizations,
    # etc.), so a simple topological table order is unreliable. Two-phase
    # delete instead:
    #   1. NULL out every *nullable* FK that points at a table inside the purge
    #      set. This severs the cycles (all cyclic edges are nullable).
    #   2. Delete remaining rows leaf-first, ordering only by NOT NULL FKs.
    covered = {name for name, pks in marked_pks.items() if pks}

    for tname in covered:
        table = Base.metadata.tables[tname]
        pk_cols = list(table.primary_key.columns)
        if len(pk_cols) != 1:
            continue
        pk_values = [pk[0] for pk in marked_pks[tname]]
        for fk in table.foreign_keys:
            if fk.column.table.name not in covered or not fk.parent.nullable:
                continue
            db.execute(
                table.update()
                .where(pk_cols[0].in_(pk_values))
                .values({fk.parent.name: None})
            )

    # Leaf-first ordering: a table is safe to delete once no other remaining
    # table holds a NOT NULL FK pointing at it.
    child_map: dict[str, set] = {}
    for tname in covered:
        for fk in Base.metadata.tables[tname].foreign_keys:
            parent_name = fk.column.table.name
            if parent_name == tname or parent_name not in covered:
                continue
            if fk.parent.nullable:
                continue
            child_map.setdefault(parent_name, set()).add(tname)

    remaining = set(covered)
    order: list[str] = []
    while remaining:
        ready = sorted(t for t in remaining if not (child_map.get(t, set()) & remaining))
        if not ready:
            raise ZoikoException(
                500, "DELETE_ORGANIZATION_FAILED",
                "Circular NOT NULL foreign-key dependency prevents deletion of "
                f"organization {org_id}: {sorted(remaining)}",
            )
        for tname in ready:
            order.append(tname)
            remaining.discard(tname)

    purged = []
    for tname in order:
        table = Base.metadata.tables[tname]
        pks = marked_pks[tname]
        pk_cols = list(table.primary_key.columns)
        if len(pk_cols) == 1:
            db.execute(table.delete().where(pk_cols[0].in_([pk for (pk,) in pks])))
        else:
            db.execute(table.delete().where(tuple_(*pk_cols).in_(list(pks))))
        purged.append(tname)
    return purged


@router.delete("/organizations/{org_id}", summary="Delete an organization permanently (hard delete)")
def delete_organization(
    org_id: int,
    x_confirmation_id: Optional[str] = Header(None, alias=_CONFIRMATION_HEADER_ID),
    x_confirmation_token: Optional[str] = Header(None, alias=_CONFIRMATION_HEADER_TOKEN),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_super_admin),
):
    from app.modules.hr.models import Organization

    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise NotFoundException("Organization", org_id)

    # Snapshot display fields now — the teardown below deletes the ORM row, so
    # any later attribute access on `org` would raise ObjectDeletedError.
    org_name = org.name
    org_code = org.organization_code

    # Two-step confirmation for irreversible hard-delete (Prompt 5).
    if not x_confirmation_id or not x_confirmation_token:
        raise BadRequestException(
            "Deleting an organization requires a confirmation token. "
            "POST /super-admin/organizations/{org_id}/confirmation-tokens with "
            "purpose='delete_organization' first, then send X-Confirmation-Id and "
            "X-Confirmation-Token headers."
        )
    try:
        confirmation_id = int(x_confirmation_id)
    except (TypeError, ValueError):
        raise BadRequestException("Invalid X-Confirmation-Id.")
    _consume_confirmation(
        db, current_user, org.id, "delete_organization",
        confirmation_id, x_confirmation_token,
    )

    # Full recursive teardown: organization + employees + every row that
    # references them, transitively (FK graph fixpoint). Single transaction.
    try:
        purged = _teardown_organization(db, org.id)
    except Exception as exc:
        db.rollback()
        logger.error("Organization %s hard-delete failed: %s", org_id, exc, exc_info=True)
        raise ZoikoException(500, "DELETE_ORGANIZATION_FAILED",
                             f"Failed to permanently delete organization '{org_name}'. "
                             "No changes were committed.") from exc

    db.add(AuditLog(
        action=AuditAction.DELETE,
        entity_type="Organization",
        entity_id=org_id,
        performed_by=current_user.id,
        performed_by_email=current_user.email,
        details={"name": org_name, "code": org_code, "purged_tables": purged},
    ))
    db.commit()

    return {"message": f"Organization '{org_name}' has been permanently deleted successfully."}


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
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_super_admin),
):
    q = db.query(AuditLog)
    if action:
        try:
            q = q.filter(AuditLog.action == AuditAction(action))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid action: {action}")
    if entity_type:
        q = q.filter(AuditLog.entity_type == entity_type)
    if entity_id is not None:
        q = q.filter(AuditLog.entity_id == entity_id)
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


@router.get("/email-logs", response_model=EmailDeliveryLogResponse, summary="List email delivery logs")
def list_email_logs(
    status: Optional[str] = None,
    recipient_email: Optional[str] = None,
    organization_id: Optional[int] = None,
    page: int = 1,
    limit: int = 50,
    db: Session = Depends(get_db),
    _=Depends(get_current_super_admin),
):
    query = db.query(EmailDeliveryLog)
    if status:
        query = query.filter(EmailDeliveryLog.status == status)
    if recipient_email:
        query = query.filter(EmailDeliveryLog.recipient_email.ilike(f"%{recipient_email}%"))
    if organization_id:
        query = query.filter(EmailDeliveryLog.organization_id == organization_id)

    total = query.count()
    offset = (page - 1) * limit
    logs = query.order_by(EmailDeliveryLog.sent_at.desc()).offset(offset).limit(limit).all()

    return EmailDeliveryLogResponse(
        list=[EmailDeliveryLogItem.model_validate(l) for l in logs],
        total=total,
        page=page,
        limit=limit,
    )


# ── Public health probe (no auth) ─────────────────────────────────────────────
@router.get("/health", include_in_schema=False, summary="Readiness probe")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc_info:
        logger.error("Health check DB connectivity failed: %s", exc_info)
        raise ZoikoException(503, "SERVICE_UNAVAILABLE", "Database unreachable") from exc_info
    return {"status": "ok"}


@router.get("/cache-stats", summary="Redis response cache stats", tags=["Super Admin"])
def cache_stats(current_user=Depends(get_current_super_admin)):
    """Return basic cache health and connection info for monitoring."""
    from app.core.response_cache import cache_stats
    from app.core.redis_client import ping as redis_ping
    return {
        "redis_ping": redis_ping(),
        "stats": cache_stats(),
    }
