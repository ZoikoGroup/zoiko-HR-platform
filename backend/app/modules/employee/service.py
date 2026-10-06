import csv
import hashlib
import io
import logging
import os
import re
import secrets
import string
import tempfile
import threading
from datetime import date, datetime, timedelta
from typing import Optional, List
from decimal import Decimal

from sqlalchemy import cast, extract, func, Integer, text
from sqlalchemy.orm import Session

from app.database import Base
from app.modules.integrations.events import emit_event

logger = logging.getLogger("zoiko.employee.service")

from app.modules.employee.models import (
    Employee, EmploymentType, EmployeeStatus, UserRole, Gender,
    SecurityActionPurpose, SecurityActionToken,
)
from app.modules.employee.schema import (
    EmployeeCreate, EmployeeUpdate,
    UserCreateRequest, UserUpdateRequest,
    LoginRequest, RegisterRequest,
    ChangeManagerRequest, ConfirmProbationRequest,
    PromoteEmployeeRequest, TransferEmployeeRequest,
    ResignationRequest, ExitEmployeeRequest, EmployeeExportRequest,
    EmployeeCompensationCreate, EmployeeCompensationUpdate,
    EmployeeBenefitCreate,
)
from app.modules.hr.models import (
    Organization, OrganizationStatus, Department, Designation,
    EmployeeProfile, EmployeeReporting, EmployeeLifecycle, EmployeeHistory,
    EmployeeCompensation, EmployeeBenefit, Allowance, CompensationItem,
    Asset, LeaveRequest, LeaveBalance, AttendanceRecord, ShiftRoster,
    EssRequest, TravelRequest, TravelExpense, ComplianceRecord,
    PerformanceReview, PerformanceGoal, PerformanceKpi, PerformanceFeedback, Appraisal,
    LearningEnrollment, LearningCertification, LearningSkill, LearningQuizAttempt,
    LearningTrainingProgramAssignment, WfSuccession, HrDocument, DocumentAssignment,
    OnboardingNewHire,
    SalaryRevision, TravelApproval, TravelReceipt,
    RecruitmentInterviewFeedback, RecruitmentOfferApproval,
    Holiday, AssetMaintenanceRequest, AssetRequest, AssetReport, EngagementSurvey,
    OnboardingPreboardingTask, RecruitmentInterview, RecruitmentDocument,
    WfPlan, WfHeadcount, WfReport,
    LearningCourse, LearningPath, LearningAssessment, LearningTrainingProgram,
    LearningCalendarEvent, HrDocumentVersion, DocumentApprovalStep, DocumentApprovalLog,
)
from app.modules.super_admin.models import (
    AuditLog, Notification, SupportTicket, SecurityEvent, ApprovalHistory, LoginActivity,
)
from app.core.security import hash_password, verify_password, create_access_token
from app.core.exceptions import (
    NotFoundException, AlreadyExistsException,
    UnauthorizedException, BadRequestException, ZoikoException,
)


# ═══════════════════════════════════════════════════════════════════════════════
# HELPER
# ═══════════════════════════════════════════════════════════════════════════════

def derive_employee_id_prefix(org_name: str) -> str:
    """Derive a 2-letter employee-ID prefix from an organization name.

    Rules:
    - Strip all non-alpha characters from org_name.
    - Take the first two letters, uppercased.
    - If fewer than 2 alpha chars exist, pad with 'X' (e.g. "A1" -> "AX").
    - If no alpha chars at all, fall back to "OR".
    """
    alpha_only = re.sub(r"[^A-Za-z]", "", org_name or "")
    if len(alpha_only) >= 2:
        return alpha_only[:2].upper()
    if len(alpha_only) == 1:
        return (alpha_only + "X").upper()
    return "OR"


def _generate_employee_id(db: Session, organization_id: int) -> str:
    """Generate an org-scoped employee_id like ZO0001, AC0002, etc.

    Concurrency-safe via pg_advisory_xact_lock on (organization_id).
    Filters by LIKE '<prefix>%' so historical EMP####-style IDs are untouched.
    """
    from app.modules.hr.models import Organization

    db.execute(
        text("SELECT pg_advisory_xact_lock(:org_key)"),
        {"org_key": organization_id + 7000000},
    )

    org = db.query(Organization).filter(Organization.id == organization_id).first()
    prefix = org.employee_id_prefix if org and org.employee_id_prefix else "OR"

    like_pattern = f"{prefix}%"
    max_seq = (
        db.query(Employee.employee_id)
        .filter(
            Employee.organization_id == organization_id,
            Employee.employee_id.isnot(None),
            Employee.employee_id.like(like_pattern),
        )
        .all()
    )

    existing_nums = []
    for (eid,) in max_seq:
        num_part = eid[len(prefix):]
        if num_part.isdigit():
            existing_nums.append(int(num_part))

    next_num = max(existing_nums) + 1 if existing_nums else 1
    return f"{prefix}{next_num:04d}"



def _generate_temp_password(length: int = 12) -> str:
    chars = string.ascii_letters + string.digits
    return ''.join(secrets.choice(chars) for _ in range(length))


def _role_to_default_title(role: UserRole) -> str:
    titles = {
        UserRole.SUPER_ADMIN: "Super Administrator",
        UserRole.ADMIN: "Organization Administrator",
        UserRole.HR_ADMIN: "HR Administrator",
        UserRole.BILLING_ADMIN: "Billing Administrator",
        UserRole.EMPLOYEE: "Employee",
    }
    return titles.get(role, "Employee")


def _full_name(employee) -> str:
    return f"{employee.first_name} {employee.last_name}".strip() or employee.email


# ── Organization activity recording (ZHR-36) ──────────────────────────────────
# Every employee mutation funnels through these two helpers so the Super Admin's
# Workflows page shows the same shape for every action: which organization, which
# actor and role, which employee, what changed, success or failure, when (UTC).
# `activity` is imported lazily inside the helpers: activity_service reads the
# super_admin models, and importing it at module scope would close a cycle.

def _activity_org_name(db: Session, organization_id: Optional[int]) -> Optional[str]:
    """Denormalised onto the event so the sentence survives an org rename."""
    if organization_id is None:
        return None
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    return (org.organization_name or org.display_name or org.name) if org else None


def _resolve_actor(db: Session, actor):
    """Accepts an ORM row or a bare id, so call sites that only have an id still
    get a named actor and a role in the feed."""
    if actor is None or not isinstance(actor, int):
        return actor
    return db.query(Employee).filter(Employee.id == actor).first()


def _record(db: Session, action_type: str, actor, organization_id, *, commit: bool = True, **kwargs) -> None:
    from app.modules.super_admin import activity_service

    actor = _resolve_actor(db, actor)
    activity_service.record_activity(
        db,
        action_type=action_type,
        actor=actor,
        organization_id=organization_id,
        organization_name=_activity_org_name(db, organization_id),
        commit=commit,
        **kwargs,
    )


def _record_failure(action_type: str, db: Session, actor, organization_id, error,
                    **kwargs) -> None:
    """An action that was attempted and failed still belongs in the feed."""
    from app.modules.super_admin import activity_service

    activity_service.record_failure(
        db,
        action_type=action_type,
        actor=_resolve_actor(db, actor),
        organization_id=organization_id,
        error=error,
        **kwargs,
    )


def _employee_target(employee) -> dict:
    """Target bits for an employee row: name for the sentence, code for the label."""
    return {
        "target": employee,
        "target_name": _full_name(employee) if employee is not None else None,
        "entity_type": "Employee",
        "entity_id": getattr(employee, "id", None),
    }


def _record_employee_added(db: Session, actor, employee, organization_id) -> None:
    _record(db, "employee.added", actor, organization_id,
            **_employee_target(employee),
            changes=activity_diff_new(employee))


def activity_diff_new(employee) -> list:
    """A create event lists the fields it set, so the detail panel is not empty."""
    from app.modules.super_admin.activity_service import diff, json_safe

    # Table columns only: __dict__ also carries relationship collections, which
    # would lazy-load whole child tables just to describe one insert.
    return diff({}, {c.name: json_safe(getattr(employee, c.name, None))
                     for c in Employee.__table__.columns})


def _notify_email(sender_name: str, **kwargs) -> bool:
    """Best-effort outbound email — never blocks the underlying action."""
    try:
        from app.services import email_service
        sender_fn = getattr(email_service, sender_name)
        sender_fn(**kwargs)
        return True
    except Exception:
        logger.exception("Failed to send email via %s", sender_name)
        return False


def _notify_email_async(sender_name: str, **kwargs) -> None:
    """Fire-and-forget outbound email in a daemon thread. Never delays the HTTP
    response — SMTP connect/send timeouts (can be 10s+) previously blocked the
    reset-password and forgot-password endpoints, surfacing as browser
    "Failed to fetch" errors. The email service opens its own DB session(s), so
    the caller's request session is not touched from the thread."""

    def _run() -> None:
        try:
            from app.services import email_service
            getattr(email_service, sender_name)(**kwargs)
        except Exception:
            logger.exception("Failed to send async email via %s", sender_name)

    threading.Thread(target=_run, daemon=True).start()


# ═══════════════════════════════════════════════════════════════════════════════
# SECURITY ACTION TOKENS (single-use, expiring)
# ═══════════════════════════════════════════════════════════════════════════════

TOKEN_TTL_HOURS = 24            # invitations
RESET_TOKEN_TTL_MINUTES = 60    # password-reset links (short-lived)
RESET_RATE_LIMIT_PER_HOUR = 5   # admin-initiated resets per target user
TOKEN_TIMEZONE = "UTC"

LINK_RESET_ROLES = (
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.HR_ADMIN,
    UserRole.BILLING_ADMIN,
    UserRole.MANAGER,
)
INVALID_TOKEN_MESSAGE = "This link is invalid or has expired. Please request a new one."


def _token_hash(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _format_token_datetime(dt: datetime) -> str:
    return dt.strftime("%b %d, %Y at %I:%M %p")


def _org_workspace_name(db: Session, organization_id) -> str:
    if not organization_id:
        return ""
    from app.modules.hr.models import Organization
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    return (org.organization_name or org.display_name or "") if org else ""


def _revoke_outstanding_tokens(db: Session, email: str, purpose) -> int:
    return (
        db.query(SecurityActionToken)
        .filter(
            SecurityActionToken.email == email,
            SecurityActionToken.purpose == purpose,
            SecurityActionToken.used_at.is_(None),
        )
        .update({SecurityActionToken.used_at: datetime.utcnow()}, synchronize_session=False)
    )


PASSWORD_POLICY_MESSAGE = "Password must be at least 8 characters and include a letter and a number."


def validate_password_policy(password: str) -> None:
    if (
        not password
        or len(password) < 8
        or not any(c.isalpha() for c in password)
        or not any(c.isdigit() for c in password)
    ):
        raise BadRequestException(PASSWORD_POLICY_MESSAGE)


def _send_email_sync(db: Session, sender_name: str, recipient: str, **kwargs) -> tuple[bool, Optional[str]]:
    """Send an email now and report the real outcome (ok, reason). Used where
    the caller must know whether the email went out."""
    from app.services import email_service

    try:
        ok = getattr(email_service, sender_name)(email=recipient, db=db, **kwargs)
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Email send raised via %s", sender_name)
        return False, f"{type(exc).__name__}"
    if ok:
        return True, None
    from app.modules.super_admin.models import EmailDeliveryLog

    row = (
        db.query(EmailDeliveryLog)
        .filter(EmailDeliveryLog.recipient_email == recipient, EmailDeliveryLog.status != "sent")
        .order_by(EmailDeliveryLog.id.desc())
        .first()
    )
    reason = (row.error_message if row and row.error_message else "the mail server rejected or could not deliver it")
    return False, reason[:200]


def _issue_action_token(db: Session, email: str, organization_id, purpose) -> tuple[str, datetime]:
    """Create a single-use token row; returns (raw_token, expires_at). Only the
    SHA-256 hash is stored — the raw token is embedded in the emailed link."""
    raw_token = secrets.token_urlsafe(32)
    now = datetime.utcnow()
    if purpose == SecurityActionPurpose.RESET:
        expires_at = now + timedelta(minutes=RESET_TOKEN_TTL_MINUTES)
    else:
        expires_at = now + timedelta(hours=TOKEN_TTL_HOURS)
    # A new link supersedes every outstanding one for this user and purpose.
    _revoke_outstanding_tokens(db, email, purpose)
    token = SecurityActionToken(
        email=email,
        organization_id=organization_id,
        purpose=purpose,
        token_hash=_token_hash(raw_token),
        expires_at=expires_at,
    )
    db.add(token)
    db.flush()
    return raw_token, expires_at


def _action_link(purpose, raw_token: str) -> str:
    from app.config import settings

    base = (settings.API_BASE_URL or "http://localhost:8000").rstrip("/")
    path = "accept-invite" if purpose == SecurityActionPurpose.INVITE else "reset-password"
    return f"{base}/auth/{path}?token={raw_token}"


def _consume_action_token(db: Session, raw_token: str, purpose) -> Optional[dict]:
    """Atomically consume a single-use action token.

    Single UPDATE...RETURNING statement — no SELECT-then-UPDATE window, so two
    concurrent requests can never both succeed. The purpose filter blocks
    cross-use (invite tokens cannot reset passwords and vice versa). Returns
    {"email": ..., "organization_id": ...} or None when the token is unknown,
    expired, already used, or for the wrong purpose.
    """
    row = db.execute(
        text(
            """
            UPDATE security_action_tokens
            SET used_at = CURRENT_TIMESTAMP
            WHERE token_hash = :hash
              AND purpose = :purpose
              AND used_at IS NULL
              AND expires_at > :now
            RETURNING email, organization_id
            """
        ),
        {"hash": _token_hash(raw_token), "purpose": purpose.name, "now": datetime.utcnow()},
    ).fetchone()
    if row is None:
        return None
    return {"email": row[0], "organization_id": row[1]}


def validate_action_token(db: Session, raw_token: str, purpose) -> Optional[dict]:
    """Read-only validity check for the GET page. Returns a render context or
    None for EVERY invalid state (unknown, used, expired, wrong purpose) so the
    GET page cannot distinguish them.
    """
    row = db.execute(
        text(
            """
            SELECT email, organization_id, purpose, expires_at, used_at
            FROM security_action_tokens
            WHERE token_hash = :hash
            """
        ),
        {"hash": _token_hash(raw_token)},
    ).fetchone()
    if row is None:
        return None
    email, organization_id, purpose_stored, expires_at, used_at = row
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at)
        except ValueError:
            return None
    if (
        used_at is not None
        or purpose_stored != purpose.name
        or expires_at <= datetime.utcnow()
    ):
        return None
    employee = db.query(Employee).filter(Employee.email == email).first()
    return {
        "token": raw_token,
        "email": email,
        "organization_id": organization_id,
        "first_name": (employee.first_name or "") if employee else "",
        "workspace_name": _org_workspace_name(db, organization_id),
    }


def complete_action_token(db: Session, raw_token: str, purpose, new_password: str) -> dict:
    """Consume the token and set the new password in ONE transaction. Consuming
    first and only then mutating the employee means any failure rolls the used_at
    flag back with it. Raises BadRequestException (generic) for every invalid
    state — the same message whether the token never existed, expired, or was used.
    """
    validate_password_policy(new_password)
    consumed = _consume_action_token(db, raw_token, purpose)
    if consumed is None:
        raise BadRequestException(INVALID_TOKEN_MESSAGE)

    employee = db.query(Employee).filter(Employee.email == consumed["email"]).first()
    if not employee:
        raise BadRequestException(INVALID_TOKEN_MESSAGE)

    employee.hashed_password = hash_password(new_password)
    employee.password_changed_at = datetime.utcnow()  # signs out every earlier session
    employee.must_change_password = False
    db.commit()
    db.refresh(employee)

    _notify_email_async(
        "send_org_admin_password_changed_email",
        email=employee.email,
        first_name=employee.first_name or _full_name(employee),
        event_time_local=_format_token_datetime(datetime.utcnow()),
        timezone=TOKEN_TIMEZONE,
        organization_id=employee.organization_id,
    )
    return {"message": "Password set successfully. You can now sign in."}


# ═══════════════════════════════════════════════════════════════════════════════
# AUTH SERVICE
# ═══════════════════════════════════════════════════════════════════════════════

def login_employee(db: Session, data: LoginRequest) -> dict:
    employee = db.query(Employee).filter(Employee.email == data.email).first()
    if not employee:
        raise UnauthorizedException("Invalid email or password.")

    if not verify_password(data.password, employee.hashed_password):
        raise UnauthorizedException("Invalid email or password.")

    # A deleted organization is invisible to normal queries, so check it explicitly
    # and tell the user why, instead of a generic "invalid credentials".
    from app.modules.super_admin import organization_service
    if organization_service.is_deleted(db, employee.organization_id):
        raise UnauthorizedException(organization_service.DELETED_ORG_MESSAGE)

    if employee.organization_id:
        org = db.query(Organization).filter(Organization.id == employee.organization_id).first()
        if org:
            if org.status == OrganizationStatus.PENDING:
                raise UnauthorizedException(
                    "Your organization registration is awaiting Super Admin approval. "
                    "You will be able to sign in after approval."
                )
            elif org.status == OrganizationStatus.REJECTED:
                reason = f" Reason: {org.rejection_reason}" if org.rejection_reason else ""
                raise UnauthorizedException(
                    f"Your organization registration has been rejected.{reason}"
                )
            elif org.status == OrganizationStatus.SUSPENDED:
                raise UnauthorizedException(
                    "Your organization has been suspended. Please contact support."
                )
            elif org.status == OrganizationStatus.DEACTIVATED:
                raise UnauthorizedException(
                    "Your organization has been deactivated. Please contact support."
                )

            # Evaluation access gate: blocks login when the org's evaluation
            # was ended (manually or expired) and no paying subscription is
            # active — catches evaluations the super admin "End"-ed directly.
            if org.status in (OrganizationStatus.ACTIVE, OrganizationStatus.APPROVED):
                from app.modules.billing import service as billing_svc
                block_reason = billing_svc.evaluation_access_block_reason(db, org.id)
                if block_reason:
                    raise UnauthorizedException(block_reason)

    if not employee.is_active:
        raise UnauthorizedException("Your account has been deactivated.")

    if employee.status == EmployeeStatus.DEACTIVATED:
        raise UnauthorizedException("Your account has been deactivated.")

    from app.modules.hr.models import Organization as HrOrg
    org_obj = None
    if employee.organization_id:
        org_obj = db.query(HrOrg).filter(HrOrg.id == employee.organization_id).first()
    org_code = org_obj.organization_code if org_obj else None

    token = create_access_token(data={
        "sub":  employee.email,
        "role": employee.role.value,
        "id":   employee.id,
        "organization_id": employee.organization_id,
        "organization_code": org_code,
    })

    refresh_token = create_access_token(
        data={"sub": employee.email, "id": employee.id, "organization_id": employee.organization_id},
        expires_delta=timedelta(days=7),
    )

    # Serialize employee object using Pydantic schema
    from app.modules.employee.schema import EmployeeResponse
    emp_data = EmployeeResponse.model_validate(employee).model_dump()
    # The standalone HR platform exposes a single product module.
    emp_data["products"] = ["hr"]
    employee_serialized = EmployeeResponse.model_validate(emp_data)

    return {
        "access_token": token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "employee": employee_serialized,
    }


# TODO: This function is duplicated in hr/service.py.  Changes here must be
# mirrored there, or the two copies should be consolidated into one.
DEFAULT_EVALUATION_DAYS = 14


def register_enterprise(db: Session, data: RegisterRequest) -> dict:
    existing = db.query(Employee).filter(Employee.email == data.email).first()
    if existing:
        raise AlreadyExistsException("Employee", "email")

    from app.core.code_generation import generate_organization_code, generate_uuid, generate_employee_code

    org_code = generate_organization_code(data.organization, db)
    org_uuid = generate_uuid()

    # Also ensure legacy `code` is set (backward compat)
    legacy_code = data.organization[:50].upper().replace(" ", "_")
    suffix = 1
    while db.query(Organization).filter(Organization.organization_code == legacy_code).first():
        legacy_code = f"{data.organization[:45].upper().replace(' ', '_')}_{suffix}"
        suffix += 1

    org = Organization(
        name=data.organization,
        code=legacy_code,
        uuid=org_uuid,
        organization_code=org_code,
        organization_name=data.organization,
        status=OrganizationStatus.ACTIVE,
        is_active=True,
        address=data.address,
        city=data.city,
        state=data.state,
        country=data.country,
        timezone=data.timezone or "UTC",
        industry=data.industry,
        org_type=data.org_type,
        phone=data.phone,
        tax_number=data.tax_number,
        registered_email=data.registered_email,
        employee_id_prefix=derive_employee_id_prefix(data.organization),
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    emit_event(db, "organization.created", {"id": org.id, "name": org.name, "code": org.organization_code}, org.id)

    dept_code = f"MGMT_{org.id}"
    dept_department_code = f"{org_code}DEP001"
    dept = Department(name="Management", code=dept_code, department_code=dept_department_code, description="Company management", organization_id=org.id)
    db.add(dept)
    db.commit()
    db.refresh(dept)

    name_parts = data.name.strip().split(" ", 1)
    first_name = name_parts[0]
    last_name = name_parts[1] if len(name_parts) > 1 else "Admin"

    employee_code = generate_employee_code(db, organization_id=org.id)

    employee = Employee(
        email=data.email,
        hashed_password=hash_password(data.password),
        role=UserRole.ADMIN,
        is_active=True,
        first_name=first_name,
        last_name=last_name,
        phone="",
        employee_code=employee_code,
        job_title="System Administrator",
        employment_type=EmploymentType.FULL_TIME,
        status=EmployeeStatus.ACTIVE,
        date_of_joining=date.today(),
        department_id=dept.id,
        organization_id=org.id,
    )
    db.add(employee)
    db.commit()
    db.refresh(employee)

    from app.modules.billing import service as billing_service
    from app.modules.billing.models import DataClassification, BillingAuditAction

    evaluation = billing_service.start_evaluation(
        db,
        organization_id=org.id,
        evaluation_ends_at=datetime.utcnow() + timedelta(days=DEFAULT_EVALUATION_DAYS),
        approved_package_scope=data.plan_code,
        data_classification=DataClassification.SYNTHETIC,
        conversion_owner=data.email,
    )

    billing_service.log_billing_audit(
        db,
        actor=employee,
        organization_id=org.id,
        action=BillingAuditAction.EVALUATION_STARTED,
        entity_type="OrganizationEvaluation",
        entity_id=evaluation.id,
        before=None,
        after={
            "evaluation_ends_at": evaluation.evaluation_ends_at.isoformat(),
            "plan_code": data.plan_code,
        },
        reason="Self-serve registration",
    )

    from app.modules.super_admin.models import AuditLog, AuditAction, Notification
    audit = AuditLog(
        action=AuditAction.CREATE,
        entity_type="Organization",
        entity_id=org.id,
        performed_by=employee.id,
        performed_by_email=employee.email,
        details={
            "organization": org.name,
            "code": org.code,
            "status": org.status.value,
            "evaluation_id": evaluation.id,
            "plan_code": data.plan_code,
        },
    )
    db.add(audit)

    notification = Notification(
        title="New Organization Signed Up",
        message=f"Organization '{org.name}' signed up and started a {data.plan_code} evaluation. It is active immediately — no action needed.",
        notification_type="org_registration",
        priority="high",
        # Internal Super Admin event: target_org_id / target_user_id mean "the org this
        # is ABOUT", not recipients. "system" keeps it out of every recipient inbox
        # (the column default, "all", would broadcast it to the whole platform).
        target_type="system",
        target_org_id=org.id,
        target_user_id=employee.id,
    )
    db.add(notification)

    db.commit()

    # Send registration confirmation email (non-blocking)
    from app.services.email_service import send_registration_received
    try:
        send_registration_received(data.email, org.name, db=db)
    except Exception as e:
        logger.warning(f"[email] Failed to send registration email to admin {data.email}: {e}")

    if data.registered_email and data.registered_email != data.email:
        try:
            send_registration_received(data.registered_email, org.name, db=db)
        except Exception as e:
            logger.warning(f"[email] Failed to send registration email to {data.registered_email}: {e}")

    # Notify every Super Admin about the new organization (non-blocking)
    try:
        from app.services.email_service import send_new_organization_created
        from app.config import settings
        super_admins = db.query(Employee).filter(Employee.role == UserRole.SUPER_ADMIN).all()
        management_url = (
            f"{settings.FRONTEND_URL.rstrip('/')}/super-admin/organizations/{org.id}"
        )
        for sa in super_admins:
            send_new_organization_created(
                email=sa.email,
                recipient_first_name=sa.first_name or "there",
                organization_name=org.name,
                created_at_local=datetime.utcnow().strftime("%b %d, %Y at %I:%M %p"),
                timezone=org.timezone or "UTC",
                creator_name=_full_name(employee),
                management_url=management_url,
                db=db,
            )
    except Exception as e:
        logger.warning(f"[email] Failed to notify super admins about organization {org.name}: {e}")

    # Commercial quotation: email the registrant a quote for the selected
    # plan with an Accept/Reject link. Accepting notifies the registrant +
    # every Super Admin and sends an invoice (see quotation_service.py).
    # Never blocks registration itself — logs and continues on failure.
    from app.modules.billing import quotation_service
    quotation_service.create_and_send_quotation(
        db,
        organization=org,
        plan_code=data.plan_code,
        billing_cycle=data.billing_cycle,
        recipient_email=data.email,
        recipient_name=_full_name(employee),
    )

    return {
        "message": (
            "Evaluation workspace requested. It is not a paid subscription "
            "and will expire on the date shown unless approved and converted "
            "by your account team."
        ),
        "organization_id": org.id,
        "organization_name": org.name,
        "evaluation_ends_at": evaluation.evaluation_ends_at.isoformat(),
        "plan_code": data.plan_code,
    }


def change_password(
    db: Session,
    employee_id: int,
    current_password: str,
    new_password: str,
) -> dict:
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise NotFoundException("Employee", employee_id)

    if not verify_password(current_password, employee.hashed_password):
        raise UnauthorizedException("Current password is incorrect.")

    validate_password_policy(new_password)
    if verify_password(new_password, employee.hashed_password):
        raise BadRequestException("Your new password must be different from the current one.")

    employee.hashed_password = hash_password(new_password)
    employee.must_change_password = False
    db.commit()
    db.refresh(employee)

    if employee.role == UserRole.ADMIN:
        _notify_email(
            "send_org_admin_password_changed_email",
            email=employee.email,
            first_name=employee.first_name or _full_name(employee),
            event_time_local=_format_token_datetime(datetime.utcnow()),
            timezone=TOKEN_TIMEZONE,
            organization_id=employee.organization_id,
            db=db,
        )

    return {"message": "Password changed successfully."}


# ═══════════════════════════════════════════════════════════════════════════════
# USER MANAGEMENT SERVICE (Organization Admin)
# ═══════════════════════════════════════════════════════════════════════════════

def role_str(role) -> str:
    return getattr(role, "value", str(role))


_IMPORT_PLAIN_FIELDS = (
    "date_of_birth", "confirmation_date", "gender", "work_email", "personal_email", "company", "business_unit",
    "division", "team", "current_address", "permanent_address", "address", "city", "state", "country", "pincode",
    "basic_salary", "ctc",
)


def _clean(value):
    value = value.strip() if isinstance(value, str) else value
    return value if value not in ("", None) else None


def _import_style_fields(db: Session, data, organization_id, created_by=None) -> dict:
    """Employee columns for the extra fields a bulk import also accepts. Department and
    designation are matched by name (case-insensitive) within the organization and
    created when missing, exactly as the import does."""
    out = {}
    for name in _IMPORT_PLAIN_FIELDS:
        value = _clean(getattr(data, name, None))
        if value is not None:
            out[name] = value
    if data.confirmation_date is None:
        out.pop("confirmation_date", None)

    dept_name = _clean(data.department_name)
    if dept_name and organization_id:
        dept = db.query(Department).filter(Department.name.ilike(dept_name),
                                           Department.organization_id == organization_id).first()
        if dept is None:
            dept = Department(
                name=dept_name,
                code="DEPT" + hashlib.md5(f"{dept_name}_{organization_id}".encode()).hexdigest()[:6].upper(),
                description="Created when adding a user", organization_id=organization_id,
            )
            db.add(dept)
            db.flush()
        out["department_id"] = dept.id
    desig_name = _clean(data.designation_name)
    if desig_name and organization_id:
        desig = db.query(Designation).filter(Designation.title.ilike(desig_name),
                                             Designation.organization_id == organization_id).first()
        if desig is None:
            desig = Designation(title=desig_name, department_name=dept_name, organization_id=organization_id,
                                source="user_form", created_by=created_by)
            db.add(desig)
            db.flush()
        out["designation_id"] = desig.id

    profile = {k: _clean(getattr(data, k, None)) for k in ("pan_number", "uan_number", "bank_account", "bank_ifsc")}
    out["_profile"] = {k: v for k, v in profile.items() if v}
    return out


def create_organization_user(
    db: Session,
    data: "UserCreateRequest",
    organization_id: int,
    created_by_id: int,
    actor=None,
) -> Employee:
    """Invite a user into an organization and record the invite for the feed."""
    try:
        existing = db.query(Employee).filter(Employee.email == data.email).first()
        if existing:
            raise AlreadyExistsException("User", "email")

        temp_password = _generate_temp_password()
        role = data.role

        from app.core.code_generation import generate_employee_code
        new_employee_code = generate_employee_code(db, organization_id=organization_id)

        extra = _import_style_fields(db, data, organization_id, created_by=created_by_id)
        profile_fields = extra.pop("_profile", {})
        status = EmployeeStatus(data.status) if data.status else EmployeeStatus.ACTIVE
        employee = Employee(
            email=data.email,
            hashed_password=hash_password(temp_password),
            employee_code=new_employee_code,
            # Platform-level users (Super Admin) have no organization, so no org-scoped employee ID.
            employee_id=_generate_employee_id(db, organization_id=organization_id) if organization_id else None,
            role=role,
            is_active=status != EmployeeStatus.INACTIVE,
            first_name=data.first_name,
            last_name=data.last_name,
            phone=data.phone or "",
            job_title=data.job_title or _role_to_default_title(role),
            employment_type=data.employment_type or EmploymentType.FULL_TIME,
            status=status,
            date_of_joining=data.date_of_joining or date.today(),
            organization_id=organization_id,
            created_by=created_by_id,
            **extra,
        )
        db.add(employee)
        db.flush()
        if profile_fields and organization_id:
            db.add(EmployeeProfile(employee_id=employee.id, organization_id=organization_id, **profile_fields))
        db.commit()
        db.refresh(employee)
        emit_event(db, "user.created", {"id": employee.id, "email": employee.email, "role": role_str(role)}, organization_id)
        _record(
            db, "employee.invited", actor or created_by_id, organization_id,
            entity_type="Employee", entity_id=employee.id,
            target_name=_full_name(employee), target_code=employee.employee_code,
            changes=[{"field": "role", "label": "Role", "before": None,
                      "after": role_str(role)},
                     {"field": "email", "label": "Email", "before": None,
                      "after": employee.email}],
            details={"invite_link_sent": role in (UserRole.ADMIN, UserRole.SUPER_ADMIN)},
        )

        if role in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
            raw_token, expires_at = _issue_action_token(db, employee.email, employee.organization_id, SecurityActionPurpose.INVITE)
            db.commit()
            inviter = db.query(Employee).filter(Employee.id == created_by_id).first() if created_by_id else None
            inviter_name = _full_name(inviter) if inviter else ""
            _notify_email(
                "send_org_admin_invite_email",
                email=employee.email,
                first_name=employee.first_name or _full_name(employee),
                inviter_name=inviter_name,
                workspace_name=_org_workspace_name(db, employee.organization_id),
                expires_at_local=_format_token_datetime(expires_at),
                timezone=TOKEN_TIMEZONE,
                action_url=_action_link(SecurityActionPurpose.INVITE, raw_token),
                organization_id=employee.organization_id,
                db=db,
            )
        else:
            _notify_email(
                "send_employee_welcome_email",
                email=employee.email,
                employee_name=_full_name(employee),
                first_name=employee.first_name or _full_name(employee),
                workspace_name=_org_workspace_name(db, employee.organization_id),
                temporary_password=temp_password,
                organization_id=employee.organization_id,
                db=db,
            )

        return employee, temp_password
    except Exception as exc:
        _record_failure("employee.invited", db, actor or created_by_id,
                        organization_id, exc, target_name=data.email)
        raise


def get_organization_users(
    db: Session,
    organization_id: int,
    search: Optional[str] = None,
    role: Optional[UserRole] = None,
    status: Optional[str] = None,
    page: int = 1,
    per_page: int = 20,
) -> dict:
    per_page = min(per_page, 100)
    query = db.query(Employee).filter(Employee.organization_id == organization_id)

    if search:
        term = f"%{search}%"
        query = query.filter(
            (Employee.first_name.ilike(term)) |
            (Employee.last_name.ilike(term)) |
            (Employee.email.ilike(term)) |
            (Employee.employee_id.ilike(term)) |
            (Employee.employee_code.ilike(term))
        )

    if role:
        query = query.filter(Employee.role == role)

    if status:
        if status == "active":
            query = query.filter(Employee.is_active == True)
        elif status == "inactive":
            query = query.filter(Employee.is_active == False)

    total = query.count()
    users = query.order_by(Employee.created_at.desc()).offset(
        (page - 1) * per_page
    ).limit(per_page).all()

    return {"total": total, "page": page, "per_page": per_page, "items": users}


def get_organization_user(
    db: Session,
    user_id: int,
    organization_id: int,
    skip_org_filter: bool = False,
) -> Employee:
    query = db.query(Employee).filter(Employee.id == user_id)
    if not skip_org_filter:
        query = query.filter(Employee.organization_id == organization_id)
    user = query.first()
    if not user:
        raise NotFoundException("User", user_id)
    return user


def update_organization_user(
    db: Session,
    user_id: int,
    data: "UserUpdateRequest",
    organization_id: int,
    updated_by_id: int,
    skip_org_filter: bool = False,
) -> Employee:
    user = get_organization_user(db, user_id, organization_id, skip_org_filter)
    old_role = user.role
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)
    user.updated_by = updated_by_id
    db.commit()
    db.refresh(user)

    if "role" in update_data and user.role != old_role:
        if old_role == UserRole.ADMIN or user.role == UserRole.ADMIN:
            _notify_email(
                "send_org_admin_access_changed_email",
                email=user.email,
                first_name=user.first_name or _full_name(user),
                workspace_name=_org_workspace_name(db, user.organization_id),
                effective_date_local=date.today().strftime("%b %d, %Y"),
                organization_id=user.organization_id,
                db=db,
            )

    return user


def deactivate_organization_user(
    db: Session,
    user_id: int,
    organization_id: int,
    updated_by_id: int,
    skip_org_filter: bool = False,
) -> Employee:
    user = get_organization_user(db, user_id, organization_id, skip_org_filter)
    user.is_active = False
    user.status = EmployeeStatus.INACTIVE
    user.updated_by = updated_by_id
    db.commit()
    db.refresh(user)

    if user.role == UserRole.ADMIN:
        _notify_email(
            "send_org_admin_access_removed_email",
            email=user.email,
            first_name=user.first_name or _full_name(user),
            workspace_name=_org_workspace_name(db, user.organization_id),
            effective_date_local=date.today().strftime("%b %d, %Y"),
            organization_id=organization_id,
            db=db,
        )
    else:
        _notify_email(
            "send_employee_account_status_email",
            email=user.email,
            employee_name=_full_name(user),
            status="deactivated",
            organization_id=organization_id,
            db=db,
        )

    return user


def activate_organization_user(
    db: Session,
    user_id: int,
    organization_id: int,
    updated_by_id: int,
    skip_org_filter: bool = False,
) -> Employee:
    user = get_organization_user(db, user_id, organization_id, skip_org_filter)
    user.is_active = True
    user.status = EmployeeStatus.ACTIVE
    user.updated_by = updated_by_id
    db.commit()
    db.refresh(user)

    if user.role == UserRole.ADMIN:
        _notify_email(
            "send_org_admin_account_activated_email",
            email=user.email,
            first_name=user.first_name or _full_name(user),
            workspace_name=_org_workspace_name(db, user.organization_id),
            organization_id=organization_id,
            db=db,
        )
    else:
        _notify_email(
            "send_employee_account_status_email",
            email=user.email,
            employee_name=_full_name(user),
            status="activated",
            organization_id=organization_id,
            db=db,
        )

    return user


def suspend_organization_user(
    db: Session,
    user_id: int,
    organization_id: int,
    updated_by_id: int,
    skip_org_filter: bool = False,
) -> Employee:
    user = get_organization_user(db, user_id, organization_id, skip_org_filter)
    user.is_active = False
    user.status = EmployeeStatus.SUSPENDED
    user.updated_by = updated_by_id
    db.commit()
    db.refresh(user)

    if user.role == UserRole.ADMIN:
        _notify_email(
            "send_org_admin_account_locked_email",
            email=user.email,
            first_name=user.first_name or _full_name(user),
            organization_id=organization_id,
            db=db,
        )
    else:
        _notify_email(
            "send_employee_account_status_email",
            email=user.email,
            employee_name=_full_name(user),
            status="suspended",
            organization_id=organization_id,
            db=db,
        )

    return user


def archive_organization_user(
    db: Session,
    user_id: int,
    organization_id: int,
    updated_by_id: int,
    skip_org_filter: bool = False,
) -> Employee:
    user = get_organization_user(db, user_id, organization_id, skip_org_filter)
    user.is_active = False
    user.status = EmployeeStatus.ARCHIVED
    user.updated_by = updated_by_id
    db.commit()
    db.refresh(user)

    if user.role == UserRole.ADMIN:
        _notify_email(
            "send_org_admin_access_removed_email",
            email=user.email,
            first_name=user.first_name or _full_name(user),
            workspace_name=_org_workspace_name(db, user.organization_id),
            effective_date_local=date.today().strftime("%b %d, %Y"),
            organization_id=organization_id,
            db=db,
        )
    else:
        _notify_email(
            "send_employee_account_status_email",
            email=user.email,
            employee_name=_full_name(user),
            status="archived",
            organization_id=organization_id,
            db=db,
        )

    return user


def request_password_reset(db: Session, email: str) -> dict:
    """Public forgot-password flow for admin-class accounts (ADMIN, HR_ADMIN,
    BILLING_ADMIN). Issues a single-use RESET token and emails a link. Always
    returns the same generic message whether or not the email belongs to an
    active admin account — never discloses account existence (no user
    enumeration)."""
    generic_message = (
        "If an account exists for that email, a password reset link has been sent."
    )
    employee = db.query(Employee).filter(Employee.email == email).first()
    if (
        not employee
        or employee.role not in LINK_RESET_ROLES
        or not employee.is_active
    ):
        return {"message": generic_message}

    raw_token, expires_at = _issue_action_token(
        db, employee.email, employee.organization_id, SecurityActionPurpose.RESET
    )
    db.commit()

    _notify_email_async(
        "send_org_admin_password_reset_email",
        email=employee.email,
        first_name=employee.first_name or _full_name(employee),
        expires_at_local=_format_token_datetime(expires_at),
        timezone=TOKEN_TIMEZONE,
        action_url=_action_link(SecurityActionPurpose.RESET, raw_token),
        organization_id=employee.organization_id,
    )
    return {"message": generic_message}


def reset_user_password(
    db: Session,
    user_id: int,
    organization_id: int,
    updated_by_id: int,
    skip_org_filter: bool = False,
    method: str = "link",
) -> tuple[Employee, Optional[str]]:
    """Admin-initiated password reset.

    method="link": single-use, 60-minute emailed link. If the email cannot be
        sent the token is revoked and a clear 502 is raised (no dangling link).
    method="temporary": a temporary password is set (returned once); the user
        must change it at next login.
    Either way every session issued before now is invalidated.
    Returns (user, temp_password_or_None).
    """
    user = get_organization_user(db, user_id, organization_id, skip_org_filter)

    if user.id == updated_by_id:
        raise BadRequestException(
            "You cannot reset your own password here. Use your account settings to change it."
        )
    if method not in ("link", "temporary"):
        raise BadRequestException("Reset method must be 'link' or 'temporary'.")
    if not user.is_active:
        raise BadRequestException("This account is deactivated. Reactivate it before resetting the password.")

    # Per-user rate limit, counted from the audit trail of completed resets.
    from app.modules.super_admin.models import AuditAction, AuditLog

    recent = (
        db.query(AuditLog)
        .filter(
            AuditLog.action == AuditAction.PASSWORD_RESET,
            AuditLog.entity_type == "Employee",
            AuditLog.entity_id == user.id,
            AuditLog.created_at >= datetime.utcnow() - timedelta(hours=1),
        )
        .count()
    )
    if recent >= RESET_RATE_LIMIT_PER_HOUR:
        raise ZoikoException(
            429, "RATE_LIMITED",
            "Too many password resets for this user in the last hour. Please try again later.",
        )

    if method == "link":
        raw_token, expires_at = _issue_action_token(db, user.email, user.organization_id, SecurityActionPurpose.RESET)
        db.commit()
        ok, reason = _send_email_sync(
            db, "send_org_admin_password_reset_email", user.email,
            first_name=user.first_name or _full_name(user),
            expires_at_local=_format_token_datetime(expires_at),
            timezone=TOKEN_TIMEZONE,
            action_url=_action_link(SecurityActionPurpose.RESET, raw_token),
            organization_id=user.organization_id,
        )
        if not ok:
            _revoke_outstanding_tokens(db, user.email, SecurityActionPurpose.RESET)
            db.commit()
            raise ZoikoException(502, "EMAIL_SEND_FAILED", f"Email could not be sent: {reason}")
        user.updated_by = updated_by_id
        user.password_changed_at = datetime.utcnow()  # end existing sessions now
        db.commit()
        return user, None

    temp_password = _generate_temp_password()
    _revoke_outstanding_tokens(db, user.email, SecurityActionPurpose.RESET)
    user.hashed_password = hash_password(temp_password)
    user.must_change_password = True
    user.password_changed_at = datetime.utcnow()
    user.updated_by = updated_by_id
    db.commit()
    db.refresh(user)
    return user, temp_password


# ═══════════════════════════════════════════════════════════════════════════════
# EMPLOYEE CRUD
# ═══════════════════════════════════════════════════════════════════════════════

def create_employee(
    db: Session,
    data: EmployeeCreate,
    organization_id: Optional[int] = None,
    actor=None,
) -> Employee:
    """Create one employee and record the action for the platform activity feed.

    ``actor`` is the Employee who asked for it (the router passes
    ``current_user``); it is what the Super Admin's Workflows page shows, so an
    add is always attributable to a person and a role.
    """
    resolved_org_id = organization_id or (data.organization_id if hasattr(data, "organization_id") else None)
    try:
        existing = db.query(Employee).filter(Employee.email == data.email).first()
        if existing:
            raise AlreadyExistsException("Employee", "email")

        if data.department_id:
            dept = db.query(Department).filter(Department.id == data.department_id).first()
            if not dept:
                raise NotFoundException("Department", data.department_id)

        from app.core.code_generation import generate_employee_code

        employee_data = data.model_dump(exclude={"password"})
        employee_data.pop("employee_id", None)
        employee_data.pop("organization_id", None)
        if not resolved_org_id:
            raise BadRequestException("organization_id is required to create an employee")
        employee = Employee(
            **employee_data,
            hashed_password=hash_password(data.password),
            employee_code=generate_employee_code(db, organization_id=resolved_org_id),
            organization_id=resolved_org_id,
        )

        db.add(employee)
        db.commit()
        db.refresh(employee)
        emit_event(db, "user.created", {"id": employee.id, "email": employee.email, "role": role_str(employee.role)}, resolved_org_id)

        _record_employee_added(db, actor, employee, resolved_org_id)

        _notify_email(
            "send_employee_welcome_email",
            email=employee.email,
            employee_name=_full_name(employee),
            first_name=employee.first_name or _full_name(employee),
            workspace_name=_org_workspace_name(db, resolved_org_id),
            temporary_password=data.password,
            organization_id=resolved_org_id,
            db=db,
        )

        return employee
    except Exception as exc:
        attempted = f"{data.first_name} {data.last_name}".strip()
        _record_failure("employee.added", db, actor, resolved_org_id, exc,
                        target_name=attempted or None, entity_type="Employee")
        raise


# ═══════════════════════════════════════════════════════════════════════════════
# EMPLOYEE IMPORT
# ═══════════════════════════════════════════════════════════════════════════════

_COLUMN_MAP = {
    "employee id": "employee_id",
    "employee_id": "employee_id",
    "employee code": "employee_code",
    "employee_code": "employee_code",
    "first name": "first_name",
    "first_name": "first_name",
    "last name": "last_name",
    "last_name": "last_name",
    "email": "email",
    "password": "password",
    "phone": "phone",
    "job title": "job_title",
    "job_title": "job_title",
    "department": "department_name",
    "designation": "designation_name",
    "reporting manager": "reporting_manager",
    "reporting_manager": "reporting_manager",
    "employment type": "employment_type",
    "employment_type": "employment_type",
    "status": "status",
    "date of joining": "date_of_joining",
    "date_of_joining": "date_of_joining",
    "date of birth": "date_of_birth",
    "date_of_birth": "date_of_birth",
    "gender": "gender",
    "basic salary": "basic_salary",
    "basic_salary": "basic_salary",
    "hra": "hra",
    "hra amount": "hra",
    "hra_amount": "hra",
    "ctc": "ctc",
    "work email": "work_email",
    "work_email": "work_email",
    "personal email": "personal_email",
    "personal_email": "personal_email",
    "confirmation date": "confirmation_date",
    "confirmation_date": "confirmation_date",
    "company": "company",
    "business unit": "business_unit",
    "business_unit": "business_unit",
    "division": "division",
    "team": "team",
    "current address": "current_address",
    "current_address": "current_address",
    "permanent address": "permanent_address",
    "permanent_address": "permanent_address",
    "city": "city",
    "state": "state",
    "country": "country",
    "pincode": "pincode",
    "address": "address",
    "pan number": "pan_number",
    "pan_number": "pan_number",
    "pan": "pan_number",
    "uan": "uan_number",
    "uan number": "uan_number",
    "uan_number": "uan_number",
    "bank account number": "bank_account",
    "bank account": "bank_account",
    "bank_account": "bank_account",
    "bank_account_number": "bank_account",
    "ifsc code": "bank_ifsc",
    "ifsc_code": "bank_ifsc",
    "ifsc": "bank_ifsc",
}

_DATE_FIELDS = {"date_of_joining", "date_of_birth", "confirmation_date"}
_DECIMAL_FIELDS = {"basic_salary", "ctc", "hra"}
_ENUM_FIELDS = {
    "employment_type": {"full_time", "part_time", "contract", "intern", "probation"},
    "status": {"active", "inactive", "pending", "on_leave", "terminated", "resigned", "deactivated", "suspended", "locked", "archived", "password_reset_required"},
    "gender": {"male", "female", "other"},
}
_REQUIRED_FIELDS = {"first_name", "last_name", "email", "job_title", "date_of_joining"}


def _normalise_header(h: str) -> str:
    return _COLUMN_MAP.get(h.strip().lower(), h.strip().lower())


def _parse_date(val, row_num: int, field: str, errors: list) -> Optional[date]:
    if not val or str(val).strip() == "":
        return None
    try:
        if isinstance(val, date):
            return val
        if isinstance(val, datetime):
            return val.date()
        cleaned = str(val).strip()
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d"):
            try:
                return datetime.strptime(cleaned, fmt).date()
            except ValueError:
                continue
        # Excel serial date number
        try:
            from datetime import timedelta as td
            serial = float(cleaned)
            if 1 <= serial <= 2958465:
                return datetime(1899, 12, 30) + td(days=int(serial))
        except (ValueError, TypeError):
            pass
        errors.append({"row": row_num, "employee_id": "", "email": "", "field": field, "error": f"Invalid date for {field}: {val}"})
    except Exception:
        errors.append({"row": row_num, "employee_id": "", "email": "", "field": field, "error": f"Invalid date for {field}: {val}"})
    return None


def _parse_decimal(val, row_num: int, field: str, errors: list):
    if val is None or str(val).strip() == "":
        return None
    try:
        return Decimal(str(val).replace(",", ""))
    except Exception:
        errors.append({"row": row_num, "employee_id": "", "email": "", "field": field, "error": f"Invalid number for {field}: {val}"})
    return None


def _friendly_db_error(exc: Exception) -> str:
    """One readable line for a failed row: no SQL, no driver names."""
    text = str(exc)
    low = text.lower()
    if "employees_employee_code_key" in low:
        return "The generated employee code was already taken. Please import again."
    if "employees_email" in low or ("unique" in low and "email" in low):
        return "An employee with this email already exists."
    if "unique" in low or "duplicate key" in low:
        return "This row duplicates an existing record."
    text = text.split("[SQL")[0]
    text = re.sub(r"\(psycopg2[^)]*\)\s*", "", text)
    text = re.sub(r"\(sqlite3[^)]*\)\s*", "", text)
    first = next((ln.strip() for ln in text.splitlines() if ln.strip()), "Unexpected error")
    return first[:160]


def _parse_enum(val, field: str):
    if not val or str(val).strip() == "":
        return None
    cleaned = str(val).strip().lower().replace(" ", "_").replace("-", "_")
    allowed = _ENUM_FIELDS.get(field, set())
    if cleaned in allowed:
        return cleaned
    if not allowed:
        return val
    return None


def import_employees_from_file(
    db: Session,
    file_bytes: bytes,
    filename: str,
    organization_id: int,
    current_user_id: int,
    actor=None,
) -> dict:
    """Bulk-import employees and record ONE grouped activity event for the whole file.

    A 500-row import is one action by one person in one organization, so it is one
    event with success/failure counts — not 500 rows in the Super Admin's feed.
    """
    result = {
        "total_rows": 0,
        "created": 0,
        "updated": 0,
        "skipped": 0,
        "failed": 0,
        "departments_created": 0,
        "designations_created": 0,
        "errors": [],
    }

    try:
        rows = _parse_file(file_bytes, filename, result)
    except Exception as e:
        result["errors"].append({"row": 0, "employee_id": "", "email": "", "field": "file", "error": f"Failed to parse file: {e}"})
        return result

    if not rows:
        return result

    seen_emails = set()
    seen_import_ids = set()
    created_for_email = []

    # Use savepoints so individual row failures don't rollback valid rows
    for row_num, row in enumerate(rows, start=2):
        norm = {}
        for k, v in row.items():
            field = _normalise_header(k)
            norm[field] = v
        row_data = norm

        employee_id_val = str(row_data.get("employee_id", "")).strip() if row_data.get("employee_id") else ""
        email_val = str(row_data.get("email", "")).strip() if row_data.get("email") else ""

        # Validate required fields
        missing = [f for f in _REQUIRED_FIELDS if not row_data.get(f) or str(row_data.get(f, "")).strip() == ""]
        if missing:
            result["skipped"] += 1
            result["errors"].append({"row": row_num, "employee_id": employee_id_val, "email": email_val, "field": ", ".join(missing), "error": f"Missing required fields: {', '.join(missing)}"})
            continue

        # Validate email format
        email_val = str(row_data["email"]).strip()
        if not re.match(r"[^@]+@[^@]+\.[^@]+", email_val):
            result["skipped"] += 1
            result["errors"].append({"row": row_num, "employee_id": employee_id_val, "email": email_val, "field": "email", "error": "Invalid email format"})
            continue

        # Check duplicate by email within the same org (tenant isolation)
        existing = db.query(Employee).filter(
            Employee.email == email_val,
            Employee.organization_id == organization_id,
        ).first()

        # Check in-batch duplicates
        if email_val in seen_emails:
            result["skipped"] += 1
            result["errors"].append({"row": row_num, "employee_id": employee_id_val, "email": email_val, "field": "email", "error": "Duplicate email within import file"})
            continue
        seen_emails.add(email_val)

        if employee_id_val and employee_id_val in seen_import_ids:
            result["skipped"] += 1
            result["errors"].append({"row": row_num, "employee_id": employee_id_val, "email": email_val, "field": "employee_id", "error": "Duplicate employee ID within import file"})
            continue
        if employee_id_val:
            seen_import_ids.add(employee_id_val)

        # Parse fields
        payload = {
            "first_name": str(row_data.get("first_name", "")).strip(),
            "last_name": str(row_data.get("last_name", "")).strip(),
            "email": email_val,
            "phone": str(row_data.get("phone", "")).strip() or None,
            "job_title": str(row_data.get("job_title", "")).strip(),
            "work_email": str(row_data.get("work_email", "")).strip() or None,
            "personal_email": str(row_data.get("personal_email", "")).strip() or None,
            "company": str(row_data.get("company", "")).strip() or None,
            "business_unit": str(row_data.get("business_unit", "")).strip() or None,
            "division": str(row_data.get("division", "")).strip() or None,
            "team": str(row_data.get("team", "")).strip() or None,
            "current_address": str(row_data.get("current_address", "")).strip() or None,
            "permanent_address": str(row_data.get("permanent_address", "")).strip() or None,
            "city": str(row_data.get("city", "")).strip() or None,
            "state": str(row_data.get("state", "")).strip() or None,
            "country": str(row_data.get("country", "")).strip() or None,
            "pincode": str(row_data.get("pincode", "")).strip() or None,
            "address": str(row_data.get("address", "")).strip() or None,
        }

        # Date fields
        for f in _DATE_FIELDS:
            val = _parse_date(row_data.get(f), row_num, f, result["errors"])
            if val:
                payload[f] = val

        # Decimal fields
        for f in _DECIMAL_FIELDS:
            val = _parse_decimal(row_data.get(f), row_num, f, result["errors"])
            if val is not None:
                payload[f] = val

        # Employee profile fields (employee_profiles)
        profile_fields = {}
        for pf in ("pan_number", "uan_number", "bank_account", "bank_ifsc"):
            raw_val = row_data.get(pf)
            clean_val = str(raw_val).strip() if raw_val is not None else ""
            if clean_val:
                profile_fields[pf] = clean_val

        # HRA is an ANNUAL amount consumed downstream; keep it out of the Employee insert
        if "hra" in payload:
            payload.pop("hra")

        # Enum fields
        row_invalid = False
        # "Probation" is how sheets describe a new joiner's stage. It is not an account
        # status: they are active, on probation (and keep an explicit employment type).
        raw_status = str(row_data.get("status") or "").strip().lower().replace(" ", "_").replace("-", "_")
        if raw_status in ("probation", "on_probation"):
            row_data["status"] = "active"
            if not str(row_data.get("employment_type") or "").strip():
                row_data["employment_type"] = "probation"
        for f in ("employment_type", "status", "gender"):
            raw = row_data.get(f)
            parsed = _parse_enum(raw, f)
            if parsed:
                payload[f] = parsed
            elif raw and str(raw).strip():
                result["skipped"] += 1
                result["errors"].append({"row": row_num, "employee_id": employee_id_val, "email": email_val, "field": f, "error": f"Invalid {f}: {raw}. Allowed: {', '.join(sorted(_ENUM_FIELDS.get(f, [])) + (['probation'] if f == 'status' else []))}"})
                row_invalid = True
                break
        if row_invalid:
            continue

        # Resolve department by name – auto-create if not found
        dept_name = str(row_data.get("department_name", "")).strip()
        if dept_name:
            dept = db.query(Department).filter(
                Department.name.ilike(dept_name),
                Department.organization_id == organization_id,
            ).first()
            if dept:
                payload["department_id"] = dept.id
            else:
                dept_code = "DEPT" + hashlib.md5(f"{dept_name}_{organization_id}".encode()).hexdigest()[:6].upper()
                dept = Department(
                    name=dept_name,
                    code=dept_code,
                    description="Auto-created from employee import",
                    organization_id=organization_id,
                )
                db.add(dept)
                db.flush()
                payload["department_id"] = dept.id
                result["departments_created"] += 1

        # Resolve designation by title – auto-create if not found
        designation_name = str(row_data.get("designation_name", "")).strip()
        if designation_name:
            desig = db.query(Designation).filter(
                Designation.title.ilike(designation_name),
                Designation.organization_id == organization_id,
            ).first()
            if desig:
                payload["designation_id"] = desig.id
            else:
                desig = Designation(
                    title=designation_name,
                    department_name=dept_name or None,
                    organization_id=organization_id,
                    source="import",
                    created_by=current_user_id,
                )
                db.add(desig)
                db.flush()
                payload["designation_id"] = desig.id
                result["designations_created"] += 1

        # Password
        password = str(row_data.get("password", "")).strip() if row_data.get("password") else None
        if not password:
            password = _generate_temp_password()

        # Use savepoint per row so failures don't rollback valid rows
        try:
            with db.begin_nested():
                if existing:
                    for field, value in payload.items():
                        if value is not None:
                            setattr(existing, field, value)
                    if payload.get("status"):
                        # The status shown in User Management and the ability to sign in move together.
                        existing.is_active = payload["status"] in ("active", "pending", "on_leave", "password_reset_required")
                    existing.updated_by = current_user_id
                    employee = existing
                    result["updated"] += 1
                else:
                    from app.core.code_generation import generate_employee_code
                    emp_data = {k: v for k, v in payload.items() if v is not None}
                    employee = Employee(
                        **emp_data,
                        hashed_password=hash_password(password),
                        employee_code=generate_employee_code(db, organization_id=organization_id),
                        organization_id=organization_id,
                        role=UserRole.EMPLOYEE,
                        is_active=emp_data.get("status", "active") in ("active", "pending", "on_leave", "password_reset_required"),
                        created_by=current_user_id,
                    )
                    db.add(employee)
                    db.flush()
                    result["created"] += 1

                # Persist imported profile fields (employee_profiles)
                if profile_fields:
                    profile = db.query(EmployeeProfile).filter(EmployeeProfile.employee_id == employee.id).first()
                    if profile:
                        for field, value in profile_fields.items():
                            setattr(profile, field, value)
                    else:
                        db.add(EmployeeProfile(
                            employee_id=employee.id,
                            organization_id=organization_id,
                            **profile_fields,
                        ))

            if not existing:
                created_for_email.append({
                    "email": email_val,
                    "employee_name": f"{payload.get('first_name') or ''} {payload.get('last_name') or ''}".strip(),
                    "first_name": payload.get("first_name") or "",
                    "temporary_password": password,
                })
        except Exception as e:
            result["failed"] += 1
            result["errors"].append({"row": row_num, "employee_id": employee_id_val, "email": email_val, "field": "general", "error": f"{'Update' if existing else 'Create'} failed: {_friendly_db_error(e)}"})

        result["total_rows"] = row_num - 1

    import_committed = True
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        import_committed = False
        result["failed"] = result["total_rows"]
        result["created"] = 0
        result["updated"] = 0
        result["errors"].append({"row": 0, "employee_id": "", "email": "", "field": "general", "error": f"Bulk commit failed: {str(e)[:300]}"})

    if import_committed:
        workspace_name = _org_workspace_name(db, organization_id)
        for item in created_for_email:
            _notify_email(
                "send_employee_welcome_email",
                email=item["email"],
                employee_name=item["employee_name"] or item["email"],
                first_name=item.get("first_name") or item["employee_name"] or item["email"],
                workspace_name=workspace_name,
                temporary_password=item["temporary_password"],
                organization_id=organization_id,
                db=db,
            )

    result["total_rows"] = len(rows)

    # One grouped event for the whole file: what was imported, what failed, and
    # whether the transaction committed at all.
    _record_import_summary(db, actor, organization_id, result, filename, import_committed)
    return result


def _record_import_summary(db: Session, actor, organization_id: int, result: dict,
                           filename: str, import_committed: bool) -> None:
    """One activity event summarising a bulk import, with success/failure counts."""
    succeeded = (result.get("created", 0) or 0) + (result.get("updated", 0) or 0)
    failed = result.get("failed", 0) or 0
    counts = {
        "total": result.get("total_rows", 0) or 0,
        "created": result.get("created", 0) or 0,
        "updated": result.get("updated", 0) or 0,
        "skipped": result.get("skipped", 0) or 0,
        "succeeded": succeeded,
        "failed": failed,
    }
    # Failed only when nothing landed. A partially successful import is a success
    # that reports its failures, so the feed does not show a red row for a file
    # that mostly worked.
    status = "success" if (import_committed and (succeeded > 0 or failed == 0)) else "failed"
    error = None if status == "success" else (
        result["errors"][0]["error"] if result.get("errors") else "Import failed")
    first_errors = [
        {"row": e.get("row"), "email": e.get("email"), "error": str(e.get("error"))[:200]}
        for e in (result.get("errors") or [])[:10]
    ]
    _record(
        db, "employee.bulk_imported", actor, organization_id,
        entity_type="Employee", entity_id=None,
        target_name=f"{counts['total']} rows from {filename}",
        counts=counts,
        status=status,
        error=error,
        details={
            "filename": filename,
            "departments_created": result.get("departments_created", 0),
            "designations_created": result.get("designations_created", 0),
            "committed": import_committed,
            "first_errors": first_errors,
        },
        commit=True,
    )


def _parse_file(file_bytes: bytes, filename: str, result: dict) -> list[dict]:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext in ("xlsx", "xls"):
        return _parse_excel(file_bytes, result)
    elif ext == "csv":
        return _parse_csv(file_bytes, result)
    else:
        result["errors"].append({"row": 0, "employee_id": "", "email": "", "field": "file", "error": f"Unsupported file format: .{ext}. Use .xlsx, .xls, or .csv"})
        return []


def _parse_excel(file_bytes: bytes, result: dict) -> list[dict]:
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    ws = wb.active
    if ws is None:
        result["errors"].append({"row": 0, "employee_id": "", "email": "", "field": "file", "error": "Excel file has no sheets"})
        return []

    rows_iter = ws.iter_rows(values_only=True)
    try:
        headers = [str(c).strip() if c else "" for c in next(rows_iter)]
    except StopIteration:
        result["errors"].append({"row": 0, "employee_id": "", "email": "", "field": "file", "error": "Excel file is empty"})
        return []

    parsed = []
    for row_idx, row in enumerate(rows_iter, start=2):
        record = {}
        has_data = False
        for col_idx, val in enumerate(row):
            if col_idx < len(headers) and headers[col_idx]:
                record[headers[col_idx]] = val
                if val is not None and str(val).strip():
                    has_data = True
        if has_data:
            parsed.append(record)

    wb.close()
    return parsed


def _parse_csv(file_bytes: bytes, result: dict) -> list[dict]:
    text = file_bytes.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        result["errors"].append({"row": 0, "employee_id": "", "email": "", "field": "file", "error": "CSV file has no headers"})
        return []

    parsed = []
    for row_idx, row in enumerate(reader, start=2):
        cleaned = {k.strip(): v.strip() if v else "" for k, v in row.items()}
        has_data = any(v for v in cleaned.values())
        if has_data:
            parsed.append(cleaned)

    return parsed


def _generate_import_template_bytes() -> dict:
    """Generate sample import file bytes (.xlsx) and return as bytes."""
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Employee Import Template"

    headers = [
        "First Name", "Last Name", "Email", "Password",
        "Phone", "Job Title", "Department", "Designation", "Reporting Manager",
        "Employment Type", "Status", "Date of Joining", "Date of Birth",
        "Gender", "Basic Salary", "HRA", "CTC", "Work Email", "Personal Email",
        "Company", "Division", "Team",
        "Current Address", "Permanent Address", "City", "State", "Country",
        "Pincode", "PAN Number", "UAN", "Bank Account Number", "IFSC Code",
    ]

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="2563EB", end_color="2563EB", fill_type="solid")

    for col_idx, header in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")

    # Sample data row
    sample = [
        "John", "Doe", "john.doe@example.com", "Pass@1234",
        "+91-9876543210", "Software Engineer", "Engineering", "Senior Developer", "Jane Smith",
        "Full Time", "Active", "2024-01-15", "1995-06-15",
        "Male", "75000", "180000", "1200000", "john@company.com", "john@gmail.com",
        "ZoikoOne", "Engineering", "Frontend",
        "123 Main St, Mumbai", "456 Oak Ave, Mumbai", "Mumbai", "Maharashtra", "India",
        "400001", "ABCDE1234F", "101234567890", "12345678901", "SBIN0001234",
    ]

    for col_idx, val in enumerate(sample, start=1):
        ws.cell(row=2, column=col_idx, value=val)

    # Column widths
    for col in ws.columns:
        max_len = 0
        col_letter = col[0].column_letter
        for cell in col:
            if cell.value:
                max_len = max(max_len, len(str(cell.value)))
        ws.column_dimensions[col_letter].width = min(max_len + 3, 40)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    wb.close()
    return buf.read()


def get_all_employees(
    db: Session,
    page: int = 1,
    per_page: int = 20,
    search: Optional[str] = None,
    department_id: Optional[int] = None,
    status: Optional[EmployeeStatus] = None,
    organization_id: Optional[int] = None,
    visible_roles: Optional[list] = None,
) -> dict:
    per_page = min(per_page, 100)
    query = db.query(Employee)

    if organization_id:
        query = query.filter(Employee.organization_id == organization_id)

    if visible_roles:
        query = query.filter(Employee.role.in_(visible_roles))

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (Employee.first_name.ilike(search_term)) |
            (Employee.last_name.ilike(search_term)) |
            (Employee.email.ilike(search_term)) |
            (Employee.employee_id.ilike(search_term)) |
            (Employee.employee_code.ilike(search_term))
        )

    if department_id:
        query = query.filter(Employee.department_id == department_id)

    if status:
        query = query.filter(Employee.status == status)

    total = query.count()
    employees = query.offset((page - 1) * per_page).limit(per_page).all()

    return {
        "total":    total,
        "page":     page,
        "per_page": per_page,
        "items":    employees,
    }


def get_employees(
    db: Session,
    page: int = 1,
    per_page: int = 20,
    search: Optional[str] = None,
    department_id: Optional[int] = None,
    status: Optional[EmployeeStatus] = None,
    employment_type: Optional[EmploymentType] = None,
    organization_id: Optional[int] = None,
    visible_roles: Optional[list] = None,
) -> dict:
    per_page = min(per_page, 200)
    query = db.query(Employee)

    if organization_id:
        query = query.filter(Employee.organization_id == organization_id)

    # Exclude administrative roles from employee listing if not explicitly provided
    if visible_roles:
        query = query.filter(Employee.role.in_(visible_roles))
    else:
        query = query.filter(Employee.role == UserRole.EMPLOYEE)

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (Employee.first_name.ilike(search_term)) |
            (Employee.last_name.ilike(search_term)) |
            (Employee.email.ilike(search_term)) |
            (Employee.employee_id.ilike(search_term)) |
            (Employee.employee_code.ilike(search_term)) |
            (Employee.job_title.ilike(search_term))
        )

    if department_id:
        query = query.filter(Employee.department_id == department_id)

    if status:
        query = query.filter(Employee.status == status)

    if employment_type:
        query = query.filter(Employee.employment_type == employment_type)

    total = query.count()
    employees = query.offset((page - 1) * per_page).limit(per_page).all()

    return {
        "total":    total,
        "page":     page,
        "per_page": per_page,
        "items":    employees,
    }


def get_employee_by_id(db: Session, employee_id: int, organization_id: Optional[int] = None) -> Employee:
    query = db.query(Employee).filter(Employee.id == employee_id)
    if organization_id:
        query = query.filter(Employee.organization_id == organization_id)
    employee = query.first()
    if not employee:
        raise NotFoundException("Employee", employee_id)
    return employee


def update_employee(
    db: Session,
    employee_id: int,
    data: EmployeeUpdate,
    organization_id: Optional[int] = None,
    actor=None,
) -> Employee:
    """Update an employee and record exactly which fields moved, and to what."""
    employee = get_employee_by_id(db, employee_id, organization_id)
    org_id = employee.organization_id
    try:
        if data.department_id:
            dept_query = db.query(Department).filter(Department.id == data.department_id)
            if organization_id:
                dept_query = dept_query.filter(Department.organization_id == organization_id)
            dept = dept_query.first()
            if not dept:
                raise NotFoundException("Department", data.department_id)

        update_data = data.model_dump(exclude_unset=True)
        from app.modules.super_admin.activity_service import changes_from, snapshot

        before = snapshot(employee, update_data.keys())
        for field, value in update_data.items():
            setattr(employee, field, value)

        db.commit()
        db.refresh(employee)
        _record(
            db, "employee.updated", actor, org_id,
            **_employee_target(employee),
            changes=changes_from(before, update_data),
        )
        return employee
    except Exception as exc:
        _record_failure("employee.updated", db, actor, org_id, exc,
                        **_employee_target(employee))
        raise


def deactivate_employee(db: Session, employee_id: int, organization_id: Optional[int] = None,
                         actor=None) -> Employee:
    """Deactivate an employee and record the account-state change it caused."""
    employee = get_employee_by_id(db, employee_id, organization_id)
    org_id = employee.organization_id
    try:
        from app.modules.super_admin.activity_service import diff, json_safe

        before = {"status": json_safe(employee.status), "is_active": json_safe(employee.is_active)}
        employee.is_active = False
        employee.status = EmployeeStatus.TERMINATED

        event = EmployeeLifecycle(
            employee_id=employee_id,
            organization_id=employee.organization_id,
            event_type="exit",
            event_date=datetime.now().date(),
            status="completed",
            reason="Employee deactivated via admin action",
        )
        db.add(event)
        db.commit()
        db.refresh(employee)

        _record(
            db, "employee.deactivated", actor, org_id,
            **_employee_target(employee),
            changes=diff(before, {"status": json_safe(employee.status),
                                  "is_active": json_safe(employee.is_active)}),
        )

        _notify_email(
            "send_employee_account_status_email",
            email=employee.email,
            employee_name=_full_name(employee),
            status="deactivated",
            organization_id=employee.organization_id,
            db=db,
        )

        return employee
    except Exception as exc:
        _record_failure("employee.deactivated", db, actor, org_id, exc,
                        **_employee_target(employee))
        raise


# ═══════════════════════════════════════════════════════════════════════════════
# EMPLOYEE DELETE (hybrid: active → deactivate, inactive → permanent delete)
# ═══════════════════════════════════════════════════════════════════════════════

def _soft_delete_employee_record(db: Session, employee_id: int) -> Employee:
    """Mark an employee as terminated without committing (for bulk operations)."""
    employee = get_employee_by_id(db, employee_id)
    employee.is_active = False
    employee.status = EmployeeStatus.TERMINATED
    event = EmployeeLifecycle(
        employee_id=employee_id,
        organization_id=employee.organization_id,
        event_type="exit",
        event_date=datetime.now().date(),
        status="completed",
        reason="Employee deactivated via admin action",
    )
    db.add(event)
    db.flush()
    return employee


# Hard-delete safety: FK columns that reference employees.id but must NOT be
# deleted (or nulled) when an employee is permanently removed. Rows matching a
# deleted employee in any of these tables block the deletion to protect
# platform audit / support history.
_EMPLOYEE_HARD_DELETE_PRESERVE = {
    ("super_admin_approval_history", "performed_by"),
    ("super_admin_support_tickets", "raised_by"),
}


def _hard_delete_employee(db: Session, employee_id: int) -> None:
    """Permanently remove an employee and every reference owned by them.

    Walks the SQLAlchemy metadata for every FK column pointing at employees.id:
      - NULLs nullable columns (audit/actor references are preserved),
      - DELETEs rows whose non-null FK belongs to the employee being removed,
      - BLOCKS the deletion if a protected audit reference still points at it.
    """
    preserved_hits = []
    for table in Base.metadata.tables.values():
        for column in table.columns:
            for fk in column.foreign_keys:
                if fk.column.table.name != "employees" or fk.column.name != "id":
                    continue
                key = (table.name, column.name)
                params = {"employee_id": employee_id}
                if key in _EMPLOYEE_HARD_DELETE_PRESERVE:
                    hit = db.execute(
                        text(f"SELECT 1 FROM {table.name} WHERE {column.name} = :employee_id LIMIT 1"),
                        params,
                    ).first()
                    if hit:
                        preserved_hits.append(key)
                elif column.nullable:
                    db.execute(
                        text(f"UPDATE {table.name} SET {column.name} = NULL WHERE {column.name} = :employee_id"),
                        params,
                    )
                else:
                    db.execute(
                        text(f"DELETE FROM {table.name} WHERE {column.name} = :employee_id"),
                        params,
                    )

    if preserved_hits:
        raise BadRequestException(
            f"Cannot permanently delete employee {employee_id}: protected audit reference(s) exist "
            f"({', '.join(f'{t}.{c}' for t, c in preserved_hits)})."
        )

    db.execute(text("DELETE FROM employees WHERE id = :employee_id"), {"employee_id": employee_id})


def delete_employee(
    db: Session,
    employee_id: int,
    organization_id: Optional[int] = None,
    current_user_id: Optional[int] = None,
    actor=None,
) -> dict:
    """Hybrid delete for a single employee, recorded for the activity feed.

    Mirrors the existing UI behavior: the trash action deactivates active
    employees and permanently removes already-inactive ones. Whichever branch
    runs, the event says which one it was — a deactivated employee is not
    reported as deleted.
    """
    employee = get_employee_by_id(db, employee_id, organization_id)
    org_id = employee.organization_id
    actor = actor or (db.query(Employee).filter(Employee.id == current_user_id).first()
                      if current_user_id else None)
    # Captured up front: the hard-delete branch removes the row with raw SQL, so
    # every attribute access on `employee` after the commit would try to reload a
    # row that no longer exists.
    target_name = _full_name(employee)
    target_code = employee.employee_code
    action = "deactivated" if employee.status == EmployeeStatus.ACTIVE else "deleted"
    try:
        if action == "deactivated":
            _soft_delete_employee_record(db, employee_id)
            db.commit()
            _notify_email(
                "send_employee_account_status_email",
                email=employee.email,
                employee_name=target_name,
                status="deactivated",
                organization_id=org_id,
                db=db,
            )
            _record(db, "employee.deactivated", actor, org_id,
                    target_name=target_name, target_code=target_code,
                    entity_type="Employee", entity_id=employee_id)
            return {
                "action": "deactivated",
                "message": f"Employee {employee_id} has been deactivated.",
            }
        _hard_delete_employee(db, employee_id)
        db.commit()
        _record(db, "employee.deleted", actor, org_id,
                target_name=target_name, target_code=target_code,
                entity_type="Employee", entity_id=employee_id)
        return {
            "action": "deleted",
            "message": f"Employee {employee_id} has been permanently deleted.",
        }
    except Exception as exc:
        _record_failure(
            "employee.deactivated" if action == "deactivated" else "employee.deleted",
            db, actor, org_id, exc,
            target_name=target_name, target_code=target_code,
            entity_type="Employee", entity_id=employee_id,
        )
        raise


def bulk_delete_employees(
    db: Session,
    employee_ids: List[int],
    organization_id: Optional[int] = None,
    current_user_id: Optional[int] = None,
    actor=None,
    action_type: str = "employee.bulk_removed",
    target_name: Optional[str] = None,
) -> dict:
    """Delete multiple employees and record ONE grouped activity event.

    Each row is processed in its own savepoint so a single failure does not
    roll back the rest. Active employees are deactivated; inactive ones are
    permanently removed. The event reports how many of each happened.
    """
    result = {
        "deactivated": 0,
        "deleted": 0,
        "failed": 0,
        "total": len(employee_ids),
        "errors": [],
    }
    deactivated_for_email = []
    for employee_id in employee_ids:
        try:
            with db.begin_nested():
                employee = db.query(Employee).filter(Employee.id == employee_id).first()
                if not employee:
                    raise NotFoundException("Employee", employee_id)
                if organization_id and employee.organization_id != organization_id:
                    raise BadRequestException(
                        f"Access denied: employee {employee_id} does not belong to this organization"
                    )
                if employee.status == EmployeeStatus.ACTIVE:
                    _soft_delete_employee_record(db, employee_id)
                    result["deactivated"] += 1
                    deactivated_for_email.append(employee)
                else:
                    _hard_delete_employee(db, employee_id)
                    result["deleted"] += 1
        except Exception as exc:
            result["failed"] += 1
            result["errors"].append({
                "employee_id": employee_id,
                "error": str(exc)[:300],
            })
    db.commit()
    for employee in deactivated_for_email:
        _notify_email(
            "send_employee_account_status_email",
            email=employee.email,
            employee_name=_full_name(employee),
            status="deactivated",
            organization_id=employee.organization_id,
            db=db,
        )
    _record_bulk_removal(db, actor or (db.query(Employee).filter(Employee.id == current_user_id).first()
                                       if current_user_id else None),
                         organization_id, result, action_type, target_name)
    return result


def _record_bulk_removal(db: Session, actor, organization_id, result: dict,
                         action_type: str, target_name: Optional[str]) -> None:
    counts = {
        "total": result.get("total", 0),
        "succeeded": (result.get("deactivated", 0) or 0) + (result.get("deleted", 0) or 0),
        "deactivated": result.get("deactivated", 0) or 0,
        "deleted": result.get("deleted", 0) or 0,
        "failed": result.get("failed", 0) or 0,
    }
    _record(
        db, action_type, actor, organization_id,
        entity_type="Employee", entity_id=None,
        target_name=target_name or f"{counts['total']} employees",
        counts=counts,
        status="success" if counts["failed"] == 0 or counts["succeeded"] > 0 else "failed",
        details={"first_errors": [
            {"employee_id": e.get("employee_id"), "error": str(e.get("error"))[:200]}
            for e in (result.get("errors") or [])[:10]
        ]},
        commit=True,
    )


def delete_all_employees(
    db: Session,
    organization_id: Optional[int] = None,
    current_user_id: Optional[int] = None,
    actor=None,
) -> dict:
    """Deactivate every active employee and permanently remove every inactive
    employee in the organization (excluding the current admin, to avoid
    self-deletion). One grouped event, distinct from a selected bulk delete."""
    query = db.query(Employee).filter(Employee.role == UserRole.EMPLOYEE)
    if organization_id:
        query = query.filter(Employee.organization_id == organization_id)
    if current_user_id:
        query = query.filter(Employee.id != current_user_id)
    employee_ids = [row[0] for row in query.with_entities(Employee.id).all()]
    return bulk_delete_employees(
        db, employee_ids, organization_id=organization_id, current_user_id=current_user_id,
        actor=actor, action_type="employee.all_removed", target_name="all employees",
    )


# ═══════════════════════════════════════════════════════════════════════════════
# EMPLOYEE DASHBOARD
# ═══════════════════════════════════════════════════════════════════════════════

def get_employee_dashboard(db: Session, organization_id: Optional[int] = None) -> dict:
    base_filter = [Employee.organization_id == organization_id] if organization_id else []
    employee_filter = base_filter + [Employee.role == UserRole.EMPLOYEE]

    total = db.query(Employee).filter(*employee_filter).count()
    active = db.query(Employee).filter(*employee_filter, Employee.status == EmployeeStatus.ACTIVE).count()
    inactive = db.query(Employee).filter(*employee_filter, Employee.status != EmployeeStatus.ACTIVE).count()

    lc_filter = [EmployeeLifecycle.organization_id == organization_id] if organization_id else []
    probation = db.query(EmployeeLifecycle).filter(
        *lc_filter,
        EmployeeLifecycle.event_type == "probation_start",
        EmployeeLifecycle.status == "pending"
    ).count()

    from datetime import date as dt_date
    new_hires_this_month = db.query(Employee).filter(
        *employee_filter,
        extract("month", Employee.date_of_joining) == extract("month", dt_date.today()),
        extract("year", Employee.date_of_joining) == extract("year", dt_date.today())
    ).count()

    exits_this_month = db.query(Employee).filter(
        *employee_filter,
        extract("month", Employee.updated_at) == extract("month", dt_date.today()),
        extract("year", Employee.updated_at) == extract("year", dt_date.today()),
        Employee.status == EmployeeStatus.TERMINATED
    ).count()

    dept_breakdown = (
        db.query(Department.name, func.count(Employee.id))
        .join(Employee, Employee.department_id == Department.id, isouter=True)
        .filter(*employee_filter, Employee.status == EmployeeStatus.ACTIVE)
        .group_by(Department.name)
        .all()
    )

    designation_breakdown = (
        db.query(Employee.job_title, func.count(Employee.id))
        .filter(*employee_filter, Employee.status == EmployeeStatus.ACTIVE)
        .group_by(Employee.job_title)
        .all()
    )

    location_breakdown = (
        db.query(Employee.address, func.count(Employee.id))
        .filter(*employee_filter, Employee.status == EmployeeStatus.ACTIVE, Employee.address != None)
        .group_by(Employee.address)
        .all()
    )

    recent_lifecycle_events = []
    lifecycle_query = db.query(
        Employee.id, Employee.first_name, Employee.last_name,
        EmployeeLifecycle.event_type, EmployeeLifecycle.event_date,
        EmployeeLifecycle.status
    ).join(
        EmployeeLifecycle, Employee.id == EmployeeLifecycle.employee_id
    ).filter(*lc_filter).order_by(
        EmployeeLifecycle.created_at.desc()
    ).limit(10)

    for emp_id, first_name, last_name, event_type, event_date, status in lifecycle_query.all():
        recent_lifecycle_events.append({
            "employee_id": emp_id,
            "employee_name": f"{first_name} {last_name}",
            "event_type": event_type,
            "event_date": event_date,
            "status": status,
        })

    upcoming_probation_end = []
    for emp_id, first_name, last_name, event_date in db.query(
        Employee.id, Employee.first_name, Employee.last_name,
        EmployeeLifecycle.event_date
    ).join(
        EmployeeLifecycle, Employee.id == EmployeeLifecycle.employee_id
    ).filter(
        *lc_filter,
        EmployeeLifecycle.event_type == "probation_end",
        EmployeeLifecycle.status == "pending"
    ).order_by(EmployeeLifecycle.event_date).limit(5).all():
        upcoming_probation_end.append({
            "employee_id": emp_id,
            "employee_name": f"{first_name} {last_name}",
            "probation_end_date": event_date,
        })

    upcoming_confirmations = []
    for emp_id, first_name, last_name, event_date in db.query(
        Employee.id, Employee.first_name, Employee.last_name,
        EmployeeLifecycle.event_date
    ).join(
        EmployeeLifecycle, Employee.id == EmployeeLifecycle.employee_id
    ).filter(
        *lc_filter,
        EmployeeLifecycle.event_type == "confirmation",
        EmployeeLifecycle.status == "pending"
    ).order_by(EmployeeLifecycle.event_date).limit(5).all():
        upcoming_confirmations.append({
            "employee_id": emp_id,
            "employee_name": f"{first_name} {last_name}",
            "confirmation_date": event_date,
        })

    upcoming_anniversaries = []
    for emp_id, first_name, last_name, joining_date in db.query(
        Employee.id, Employee.first_name, Employee.last_name,
        Employee.date_of_joining
    ).filter(
        *base_filter,
        Employee.status == EmployeeStatus.ACTIVE,
        Employee.date_of_birth != None
    ).order_by(
        extract("month", Employee.date_of_birth),
        extract("day", Employee.date_of_birth)
    ).limit(5).all():
        today = dt_date.today()
        next_birthday = dt_date(today.year, joining_date.month, joining_date.day)
        if next_birthday < today:
            next_birthday = dt_date(today.year + 1, joining_date.month, joining_date.day)

        upcoming_anniversaries.append({
            "employee_id": emp_id,
            "employee_name": f"{first_name} {last_name}",
            "next_birthday": next_birthday,
            "join_date": joining_date,
        })

    return {
        "total_employees": total,
        "active_employees": active,
        "inactive_employees": inactive,
        "on_probation": probation,
        "new_hires_this_month": new_hires_this_month,
        "exits_this_month": exits_this_month,
        "department_distribution": [{"department": d, "count": c} for d, c in dept_breakdown],
        "designation_distribution": [{"designation": d, "count": c} for d, c in designation_breakdown],
        "location_distribution": [{"location": l, "count": c} for l, c in location_breakdown],
        "lifecycle_events": recent_lifecycle_events,
        "upcoming_probation_end": upcoming_probation_end,
        "upcoming_confirmations": upcoming_confirmations,
        "upcoming_anniversaries": upcoming_anniversaries,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# EMPLOYEE PROFILE
# ═══════════════════════════════════════════════════════════════════════════════

def get_employee_profile(db: Session, employee_id: int, **kwargs) -> EmployeeProfile:
    profile = db.query(EmployeeProfile).filter(EmployeeProfile.employee_id == employee_id).first()
    if not profile:
        raise NotFoundException("EmployeeProfile", employee_id)
    return profile


def create_employee_profile(db: Session, data) -> EmployeeProfile:
    profile = EmployeeProfile(**data.model_dump())
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def update_employee_profile(db: Session, employee_id: int, data, organization_id: Optional[int] = None,
                            actor=None) -> EmployeeProfile:
    """Update personal/bank/statutory details; recorded with sensitive values masked
    (bank account, IFSC, PAN, UAN never reach the activity feed)."""
    from app.modules.super_admin.activity_service import changes_from, snapshot

    profile = db.query(EmployeeProfile).filter(EmployeeProfile.employee_id == employee_id).first()
    update_data = data.model_dump(exclude_unset=True)
    before = snapshot(profile, update_data.keys()) if profile else {k: None for k in update_data}

    if not profile:
        profile = EmployeeProfile(
            employee_id=employee_id,
            organization_id=organization_id or 0,
            **update_data,
        )
        db.add(profile)
    else:
        for field, value in update_data.items():
            setattr(profile, field, value)

    db.commit()
    db.refresh(profile)
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if employee is not None:
        _record(db, "employee.updated", actor, employee.organization_id,
                **_employee_target(employee), changes=changes_from(before, update_data),
                details={"section": "profile"})
    return profile


# ═══════════════════════════════════════════════════════════════════════════════
# EMPLOYEE REPORTING
# ═══════════════════════════════════════════════════════════════════════════════

def get_employee_reporting(db: Session, employee_id: int) -> EmployeeReporting:
    reporting = db.query(EmployeeReporting).filter(EmployeeReporting.employee_id == employee_id).first()
    if not reporting:
        raise NotFoundException("EmployeeReporting", employee_id)
    return reporting


def create_employee_reporting(db: Session, data) -> EmployeeReporting:
    reporting = EmployeeReporting(**data.model_dump())
    db.add(reporting)
    db.commit()
    db.refresh(reporting)
    return reporting


def update_employee_reporting(db: Session, employee_id: int, data) -> EmployeeReporting:
    reporting = get_employee_reporting(db, employee_id)
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(reporting, field, value)
    db.commit()
    db.refresh(reporting)
    return reporting


# ═══════════════════════════════════════════════════════════════════════════════
# EMPLOYEE LIFECYCLE
# ═══════════════════════════════════════════════════════════════════════════════

def get_employee_lifecycle(db: Session, employee_id: Optional[int] = None, organization_id: Optional[int] = None) -> list[EmployeeLifecycle]:
    query = db.query(EmployeeLifecycle)
    if organization_id:
        query = query.filter(EmployeeLifecycle.organization_id == organization_id)
    if employee_id:
        query = query.filter(EmployeeLifecycle.employee_id == employee_id)
    return query.order_by(EmployeeLifecycle.event_date.desc()).all()


def create_employee_lifecycle_event(db: Session, data) -> EmployeeLifecycle:
    event = EmployeeLifecycle(**data.model_dump())
    db.add(event)
    db.commit()
    db.refresh(event)

    return event


def update_employee_lifecycle_event(db: Session, event_id: int, data) -> EmployeeLifecycle:
    event = db.query(EmployeeLifecycle).filter(EmployeeLifecycle.id == event_id).first()
    if not event:
        raise NotFoundException("EmployeeLifecycle", event_id)

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(event, field, value)

    db.commit()
    db.refresh(event)
    return event


# ═══════════════════════════════════════════════════════════════════════════════
# EMPLOYEE HISTORY
# ═══════════════════════════════════════════════════════════════════════════════

def get_employee_history(db: Session, employee_id: int) -> list[EmployeeHistory]:
    return db.query(EmployeeHistory).filter(
        EmployeeHistory.employee_id == employee_id
    ).order_by(EmployeeHistory.created_at.desc()).all()


def create_employee_history_entry(
    db: Session,
    employee_id: int,
    field_name: str,
    old_value: str,
    new_value: str,
    changed_by: Optional[int] = None,
    change_reason: Optional[str] = None,
) -> EmployeeHistory:
    history = EmployeeHistory(
        employee_id=employee_id,
        field_name=field_name,
        old_value=old_value,
        new_value=new_value,
        changed_by=changed_by,
        change_reason=change_reason,
    )
    db.add(history)
    db.commit()
    db.refresh(history)
    return history


# ═══════════════════════════════════════════════════════════════════════════════
# ORG CHART
# ═══════════════════════════════════════════════════════════════════════════════

def get_org_chart(db: Session, organization_id: int) -> dict:
    employees = db.query(
        Employee.id, Employee.first_name, Employee.last_name,
        Employee.job_title, Employee.department_id, Employee.status
    ).filter(
        Employee.organization_id == organization_id,
        Employee.status == EmployeeStatus.ACTIVE
    ).all()

    reporting = db.query(
        EmployeeReporting.employee_id, EmployeeReporting.manager_id
    ).filter(
        EmployeeReporting.organization_id == organization_id
    ).all()

    report_map = {r.employee_id: r.manager_id for r in reporting}

    departments = db.query(
        Department.id, Department.name
    ).filter(
        Department.id.in_([e.department_id for e in employees if e.department_id])
    ).all()

    dept_map = {d.id: d.name for d in departments}

    employee_map = {}
    for emp in employees:
        employee_map[emp.id] = {
            "id": emp.id,
            "name": f"{emp.first_name} {emp.last_name}",
            "job_title": emp.job_title,
            "department": dept_map.get(emp.department_id) if emp.department_id else None,
            "manager_id": report_map.get(emp.id),
            "status": emp.status,
            "children": [],
        }

    reporting_structure = []
    for emp in employees:
        manager_id = report_map.get(emp.id)
        if manager_id and manager_id in employee_map:
            employee_map[emp.id]["manager_name"] = employee_map[manager_id]["name"]
            employee_map[manager_id]["children"].append(employee_map[emp.id])
        else:
            reporting_structure.append(employee_map[emp.id])

    return {
        "employees": list(employee_map.values()),
        "reporting_structure": reporting_structure,
        "departments": dept_map,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# EMPLOYEE LIFECYCLE OPERATIONS
# ═══════════════════════════════════════════════════════════════════════════════

def change_manager(db: Session, data: ChangeManagerRequest) -> Employee:
    employee = get_employee_by_id(db, data.employee_id)

    reporting = db.query(EmployeeReporting).filter(
        EmployeeReporting.employee_id == data.employee_id
    ).first()

    old_manager_id = reporting.manager_id if reporting else None

    if not reporting:
        reporting = EmployeeReporting(
            employee_id=data.employee_id,
            organization_id=employee.organization_id or 1,
            manager_id=data.new_manager_id,
            effective_from=date.today(),
        )
        db.add(reporting)
    else:
        reporting.manager_id = data.new_manager_id

    db.commit()

    create_employee_history_entry(
        db, data.employee_id, "manager_id",
        str(old_manager_id), str(data.new_manager_id),
        change_reason=data.reason,
    )

    return employee


def confirm_probation(db: Session, data: ConfirmProbationRequest, organization_id: Optional[int] = None) -> EmployeeLifecycle:
    employee = get_employee_by_id(db, data.employee_id)

    employee.status = EmployeeStatus.ACTIVE
    employee.confirmation_date = data.confirmation_date

    event = EmployeeLifecycle(
        employee_id=data.employee_id,
        organization_id=employee.organization_id,
        event_type="confirmation",
        event_date=data.confirmation_date,
        status="completed",
        reason=data.notes,
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    _notify_email(
        "send_employee_lifecycle_email",
        email=employee.email,
        employee_name=_full_name(employee),
        event_type="confirmation",
        effective_date=str(data.confirmation_date) if data.confirmation_date else "",
        details=data.notes or "",
        organization_id=employee.organization_id,
        db=db,
    )

    return event


def promote_employee(db: Session, data: PromoteEmployeeRequest, organization_id: Optional[int] = None) -> EmployeeLifecycle:
    employee = get_employee_by_id(db, data.employee_id)

    if data.new_designation_id:
        employee.designation_id = data.new_designation_id
    if data.new_salary:
        employee.basic_salary = data.new_salary

    event = EmployeeLifecycle(
        employee_id=data.employee_id,
        organization_id=employee.organization_id,
        event_type="promotion",
        event_date=data.effective_date,
        status="completed",
        new_value={"designation_id": data.new_designation_id, "salary": str(data.new_salary)},
        reason=data.reason,
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    _notify_email(
        "send_employee_lifecycle_email",
        email=employee.email,
        employee_name=_full_name(employee),
        event_type="promotion",
        effective_date=str(data.effective_date) if data.effective_date else "",
        details=data.reason or "",
        organization_id=employee.organization_id,
        db=db,
    )

    return event


def transfer_employee(db: Session, data: TransferEmployeeRequest, organization_id: Optional[int] = None) -> EmployeeLifecycle:
    employee = get_employee_by_id(db, data.employee_id)

    if data.new_department_id:
        employee.department_id = data.new_department_id
    if data.new_manager_id:
        employee.reporting_manager_id = data.new_manager_id

    event = EmployeeLifecycle(
        employee_id=data.employee_id,
        organization_id=employee.organization_id,
        event_type="transfer",
        event_date=data.effective_date,
        status="completed",
        new_value={
            "department_id": data.new_department_id,
            "manager_id": data.new_manager_id,
            "location": data.new_location,
        },
        reason=data.reason,
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    _notify_email(
        "send_employee_lifecycle_email",
        email=employee.email,
        employee_name=_full_name(employee),
        event_type="transfer",
        effective_date=str(data.effective_date) if data.effective_date else "",
        details=data.reason or "",
        organization_id=employee.organization_id,
        db=db,
    )

    return event


def resign_employee(db: Session, data: ResignationRequest, organization_id: Optional[int] = None) -> EmployeeLifecycle:
    employee = get_employee_by_id(db, data.employee_id)

    employee.status = EmployeeStatus.RESIGNED
    employee.is_active = False

    event = EmployeeLifecycle(
        employee_id=data.employee_id,
        organization_id=employee.organization_id,
        event_type="resignation",
        event_date=data.resignation_date,
        status="completed",
        new_value={
            "status": "resigned",
            "last_working_date": str(data.last_working_date),
        },
        reason=data.reason,
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    _notify_email(
        "send_employee_lifecycle_email",
        email=employee.email,
        employee_name=_full_name(employee),
        event_type="resignation",
        effective_date=str(data.last_working_date) if data.last_working_date else "",
        details=data.reason or "",
        organization_id=employee.organization_id,
        db=db,
    )

    return event


def exit_employee(db: Session, data: ExitEmployeeRequest, organization_id: Optional[int] = None) -> EmployeeLifecycle:
    employee = get_employee_by_id(db, data.employee_id)

    employee.status = EmployeeStatus.TERMINATED
    employee.is_active = False

    event = EmployeeLifecycle(
        employee_id=data.employee_id,
        organization_id=employee.organization_id,
        event_type="exit",
        event_date=data.exit_date,
        status="completed",
        new_value={
            "status": data.exit_type,
            "final_settlement_date": str(data.final_settlement_date),
        },
        reason=data.reason,
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    _notify_email(
        "send_employee_lifecycle_email",
        email=employee.email,
        employee_name=_full_name(employee),
        event_type="exit",
        effective_date=str(data.exit_date) if data.exit_date else "",
        details=data.reason or "",
        organization_id=employee.organization_id,
        db=db,
    )

    return event


def get_employee_reports(db: Session, filters: Optional[dict] = None, organization_id: Optional[int] = None) -> list:
    query = db.query(Employee)
    if organization_id:
        query = query.filter(Employee.organization_id == organization_id)
    if filters:
        if "department_id" in filters:
            query = query.filter(Employee.department_id == filters["department_id"])
        if "status" in filters:
            query = query.filter(Employee.status == filters["status"])
        if "search" in filters:
            search_term = f"%{filters['search']}%"
            query = query.filter(
                (Employee.first_name.ilike(search_term)) |
                (Employee.last_name.ilike(search_term)) |
                (Employee.email.ilike(search_term)) |
                (Employee.employee_id.ilike(search_term)) |
                (Employee.employee_code.ilike(search_term))
            )

    return query.order_by(Employee.created_at.desc()).all()


def export_employee_reports(db: Session, data: EmployeeExportRequest, organization_id: Optional[int] = None) -> list:
    return get_employee_reports(db, data.filters, organization_id)


# ═══════════════════════════════════════════════════════════════════════════════
# EMPLOYEE COMPENSATION & BENEFITS
# ═══════════════════════════════════════════════════════════════════════════════

def create_employee_compensation(db: Session, data: EmployeeCompensationCreate, org_id: int,
                                 actor=None) -> EmployeeCompensation:
    comp = EmployeeCompensation(**data.model_dump(), organization_id=org_id)
    db.add(comp)
    db.commit()
    db.refresh(comp)
    _record(
        db, "payroll.compensation_added", actor, org_id,
        entity_type="EmployeeCompensation", entity_id=comp.id,
        **_compensation_target(db, comp),
        changes=activity_diff_object(comp),
    )
    return comp

def get_employee_compensations(db: Session, org_id: int, employee_id: Optional[int] = None) -> list[EmployeeCompensation]:
    query = db.query(EmployeeCompensation).filter(EmployeeCompensation.organization_id == org_id)
    if employee_id:
        query = query.filter(EmployeeCompensation.employee_id == employee_id)
    return query.all()

def get_employee_compensation(db: Session, comp_id: int, org_id: int) -> EmployeeCompensation:
    comp = db.query(EmployeeCompensation).filter(EmployeeCompensation.id == comp_id, EmployeeCompensation.organization_id == org_id).first()
    if not comp:
        raise NotFoundException("EmployeeCompensation", comp_id)
    return comp

def update_employee_compensation(db: Session, comp_id: int, data: EmployeeCompensationUpdate,
                                 org_id: int, actor=None) -> EmployeeCompensation:
    comp = get_employee_compensation(db, comp_id, org_id)
    update_data = data.model_dump(exclude_unset=True)
    from app.modules.super_admin.activity_service import changes_from, snapshot

    before = snapshot(comp, update_data.keys())
    for key, value in update_data.items():
        setattr(comp, key, value)
    db.commit()
    db.refresh(comp)
    _record(
        db, "payroll.compensation_updated", actor, org_id,
        entity_type="EmployeeCompensation", entity_id=comp.id,
        **_compensation_target(db, comp),
        changes=changes_from(before, update_data),
    )
    return comp

def delete_employee_compensation(db: Session, comp_id: int, org_id: int, actor=None) -> None:
    comp = get_employee_compensation(db, comp_id, org_id)
    target = _compensation_target(db, comp)
    from app.modules.hr.models import SalaryRevision
    db.query(SalaryRevision).filter(SalaryRevision.employee_compensation_id == comp_id).delete()
    db.delete(comp)
    db.commit()
    _record(db, "payroll.compensation_deleted", actor, org_id,
            entity_type="EmployeeCompensation", entity_id=comp_id, **target)

def create_employee_benefit(db: Session, data: EmployeeBenefitCreate, org_id: int,
                            actor=None) -> EmployeeBenefit:
    emp_benefit = EmployeeBenefit(**data.model_dump(), organization_id=org_id)
    db.add(emp_benefit)
    db.commit()
    db.refresh(emp_benefit)
    _record(
        db, "payroll.benefit_added", actor, org_id,
        entity_type="EmployeeBenefit", entity_id=emp_benefit.id,
        **_employee_target_for(db, emp_benefit.employee_id),
        changes=activity_diff_object(emp_benefit),
    )
    return emp_benefit


def _compensation_target(db: Session, comp) -> dict:
    """A compensation row is about an employee, so the feed names that employee.

    Only the target bits are returned; the caller owns ``entity_type``/
    ``entity_id``, which must stay the compensation row, not the employee.
    """
    employee_id = getattr(comp, "employee_id", None)
    if employee_id:
        employee = db.query(Employee).filter(Employee.id == employee_id).first()
        if employee is not None:
            return {"target_name": _full_name(employee),
                    "target_code": employee.employee_code}
    return {"target_name": f"compensation #{getattr(comp, 'id', '?')}"}


def _employee_target_for(db: Session, employee_id) -> dict:
    """Target bits only — the caller owns ``entity_type``/``entity_id``, which for
    a benefit is the benefit row, not the employee it belongs to."""
    if employee_id:
        employee = db.query(Employee).filter(Employee.id == employee_id).first()
        if employee is not None:
            return {"target_name": _full_name(employee),
                    "target_code": employee.employee_code}
    return {"target_name": f"employee #{employee_id}"}


def activity_diff_object(row) -> list:
    """Fields set on a freshly created row, for the detail panel."""
    from app.modules.super_admin.activity_service import diff, json_safe

    return diff({}, {c.name: json_safe(getattr(row, c.name, None))
                     for c in row.__table__.columns})

def get_employee_benefits(db: Session, org_id: int) -> list[EmployeeBenefit]:
    return db.query(EmployeeBenefit).filter(EmployeeBenefit.organization_id == org_id).all()

def delete_employee_benefit(db: Session, emp_benefit_id: int, org_id: int, actor=None) -> None:
    emp_benefit = db.query(EmployeeBenefit).filter(EmployeeBenefit.id == emp_benefit_id, EmployeeBenefit.organization_id == org_id).first()
    if not emp_benefit:
        raise NotFoundException("EmployeeBenefit", emp_benefit_id)
    target = _employee_target_for(db, getattr(emp_benefit, "employee_id", None))
    db.delete(emp_benefit)
    db.commit()
    _record(db, "payroll.benefit_deleted", actor, org_id,
            entity_type="EmployeeBenefit", entity_id=emp_benefit_id, **target)


def bulk_hard_delete_employees(db: Session, employee_ids: list[int], organization_id: int = None,
                               actor=None) -> dict:
    deleted = []
    failed = []
    for eid in employee_ids:
        try:
            q = db.query(Employee).filter(Employee.id == eid)
            if organization_id is not None:
                q = q.filter(Employee.organization_id == organization_id)
            emp = q.first()
            if not emp:
                failed.append({"id": eid, "reason": "Not found"})
                continue
            hard_delete_employee(db, eid, organization_id)
            deleted.append(eid)
        except Exception as ex:
            db.rollback()
            failed.append({"id": eid, "reason": str(ex)})
    _record(
        db, "employee.permanently_deleted", actor, organization_id,
        entity_type="Employee", entity_id=None,
        target_name=f"{len(employee_ids)} employees",
        counts={"total": len(employee_ids), "succeeded": len(deleted),
                "deleted": len(deleted), "failed": len(failed)},
        status="success" if not failed or deleted else "failed",
        details={"deleted_ids": deleted[:50],
                 "first_errors": [{"id": f["id"], "error": str(f["reason"])[:200]}
                                  for f in failed[:10]]},
        commit=True,
    )
    return {"deleted": deleted, "failed": failed}


def _project_fk_values(db: Session, table, ref_col_name: str, marked_pks: set) -> set:
    """Map a parent table's marked primary keys onto the column an FK targets."""
    pk_cols = list(table.primary_key.columns)
    if len(pk_cols) == 1 and pk_cols[0].name == ref_col_name:
        return {pk for (pk,) in marked_pks}
    vals = [pk for (pk,) in marked_pks]
    if not vals:
        return set()
    rows = db.execute(table.select().where(pk_cols[0].in_(vals))).all()
    return {getattr(r, ref_col_name) for r in rows if getattr(r, ref_col_name) is not None}


def _purge_employee_residuals(db: Session, employee_id: int) -> list[str]:
    """Delete every remaining row that references an employee being removed.

    `hard_delete_employee` cleans up the HR-owned tables explicitly, but many
    other modules (billing, assistant/chat, super-admin, knowledge, documents)
    also hold foreign keys onto `employees.id`. Rather than enumerate them,
    walk the FK graph from the employee — following only NOT NULL edges, which
    are the ones that actually block a hard delete — and remove the closure.
    Nullable FKs anywhere in the schema are severed with an UPDATE, then the
    owned rows are deleted children-before-parents."""
    from app.database import Base
    from sqlalchemy import tuple_

    # Force-register every model module so the FK graph is complete.
    import app.modules.hr.models  # noqa: F401
    import app.modules.employee.models  # noqa: F401
    import app.modules.billing.models  # noqa: F401
    import app.modules.assistant.models  # noqa: F401
    from app.modules.super_admin import models as _sam  # noqa: F401
    from app.modules.super_admin import command_center_models as _ccm  # noqa: F401

    tables = list(Base.metadata.tables.values())
    marked: dict[str, set] = {"employees": {(employee_id,)}}

    # Mark owned descendants through NOT NULL FKs only. Nullable references are
    # passive (approved_by, created_by, ...) and must not pull in whole other
    # entities such as the organization.
    changed = True
    while changed:
        changed = False
        for child in tables:
            for fk in child.foreign_keys:
                if fk.parent.nullable:
                    continue
                parent = fk.column.table
                parent_vals = marked.get(parent.name)
                if not parent_vals:
                    continue
                projected = _project_fk_values(db, parent, fk.column.name, parent_vals)
                if not projected:
                    continue
                pk_cols = list(child.primary_key.columns)
                if len(pk_cols) != 1:
                    continue
                rows = db.execute(child.select().where(fk.parent.in_(projected))).all()
                bucket = marked.setdefault(child.name, set())
                for r in rows:
                    pk = (getattr(r, pk_cols[0].name),)
                    if pk not in bucket:
                        bucket.add(pk)
                        changed = True

    covered = {name for name, pks in marked.items() if pks}

    # Sever every nullable FK that points at a row we are about to delete.
    for child in tables:
        for fk in child.foreign_keys:
            if not fk.parent.nullable or fk.column.table.name not in covered:
                continue
            ref_vals = _project_fk_values(db, fk.column.table, fk.column.name, marked[fk.column.table.name])
            if not ref_vals:
                continue
            db.execute(
                child.update().where(fk.parent.in_(ref_vals)).values({fk.parent.name: None})
            )

    # Order the remaining deletes children-before-parents on NOT NULL FKs.
    child_map: dict[str, set] = {}
    for tname in covered:
        for fk in Base.metadata.tables[tname].foreign_keys:
            parent_name = fk.column.table.name
            if parent_name == tname or parent_name not in covered or fk.parent.nullable:
                continue
            child_map.setdefault(parent_name, set()).add(tname)

    remaining = set(covered)
    order: list[str] = []
    while remaining:
        ready = sorted(t for t in remaining if not (child_map.get(t, set()) & remaining))
        if not ready:
            raise RuntimeError(
                f"Circular NOT NULL foreign-key dependency prevents deletion of employee "
                f"{employee_id}: {sorted(remaining)}"
            )
        for tname in ready:
            order.append(tname)
            remaining.discard(tname)

    purged = []
    for tname in order:
        table = Base.metadata.tables[tname]
        pks = marked[tname]
        pk_cols = list(table.primary_key.columns)
        if len(pk_cols) == 1:
            db.execute(table.delete().where(pk_cols[0].in_([pk for (pk,) in pks])))
        else:
            db.execute(table.delete().where(tuple_(*pk_cols).in_(list(pks))))
        purged.append(tname)
    return purged


def hard_delete_employee(db: Session, employee_id: int, organization_id: int = None) -> None:
    q = db.query(Employee).filter(Employee.id == employee_id)
    if organization_id is not None:
        q = q.filter(Employee.organization_id == organization_id)
    employee = q.first()
    if not employee:
        raise NotFoundException("Employee", employee_id)

    # Reassign reportees to NULL
    rpt_q = db.query(Employee).filter(Employee.reporting_manager_id == employee_id)
    if organization_id is not None:
        rpt_q = rpt_q.filter(Employee.organization_id == organization_id)
    rpt_q.update({"reporting_manager_id": None}, synchronize_session=False)

    # Nullify self-referencing creator/updater FKs
    db.query(Employee).filter(
        Employee.created_by == employee_id,
    ).update({"created_by": None}, synchronize_session=False)
    db.query(Employee).filter(
        Employee.updated_by == employee_id,
    ).update({"updated_by": None}, synchronize_session=False)

    # Delete one-to-one profile/relationship records
    db.query(EmployeeProfile).filter(EmployeeProfile.employee_id == employee_id).delete(synchronize_session=False)
    db.query(EmployeeReporting).filter(EmployeeReporting.employee_id == employee_id).delete(synchronize_session=False)
    db.query(EmployeeLifecycle).filter(EmployeeLifecycle.employee_id == employee_id).delete(synchronize_session=False)
    db.query(EmployeeHistory).filter(EmployeeHistory.employee_id == employee_id).delete(synchronize_session=False)

    # Nullify other employees' reporting records that reference this employee as manager
    db.query(EmployeeReporting).filter(
        EmployeeReporting.manager_id == employee_id,
    ).update({"manager_id": None}, synchronize_session=False)
    db.query(EmployeeReporting).filter(
        EmployeeReporting.dotted_manager_id == employee_id,
    ).update({"dotted_manager_id": None}, synchronize_session=False)

    # Delete salary revisions before compensation records
    # FK: salary_revisions.employee_compensation_id -> employee_compensations.id
    emp_comp_ids = [r[0] for r in db.query(EmployeeCompensation.id).filter(
        EmployeeCompensation.employee_id == employee_id
    ).all()]
    if emp_comp_ids:
        db.query(SalaryRevision).filter(
            SalaryRevision.employee_compensation_id.in_(emp_comp_ids)
        ).delete(synchronize_session=False)

    # Delete compensation & allowance records
    db.query(EmployeeCompensation).filter(EmployeeCompensation.employee_id == employee_id).delete(synchronize_session=False)
    db.query(EmployeeBenefit).filter(EmployeeBenefit.employee_id == employee_id).delete(synchronize_session=False)
    db.query(Allowance).filter(Allowance.employee_id == employee_id).delete(synchronize_session=False)
    db.query(CompensationItem).filter(CompensationItem.employee_id == employee_id).delete(synchronize_session=False)

    # Delete HR operational records
    db.query(LeaveRequest).filter(LeaveRequest.employee_id == employee_id).delete(synchronize_session=False)
    db.query(LeaveBalance).filter(LeaveBalance.employee_id == employee_id).delete(synchronize_session=False)
    db.query(AttendanceRecord).filter(AttendanceRecord.employee_id == employee_id).delete(synchronize_session=False)
    db.query(ShiftRoster).filter(ShiftRoster.employee_id == employee_id).delete(synchronize_session=False)
    db.query(EssRequest).filter(EssRequest.employee_id == employee_id).delete(synchronize_session=False)

    # Delete performance records
    db.query(PerformanceGoal).filter(PerformanceGoal.employee_id == employee_id).delete(synchronize_session=False)
    db.query(PerformanceKpi).filter(PerformanceKpi.employee_id == employee_id).delete(synchronize_session=False)
    db.query(PerformanceFeedback).filter(PerformanceFeedback.employee_id == employee_id).delete(synchronize_session=False)
    db.query(Appraisal).filter(Appraisal.employee_id == employee_id).delete(synchronize_session=False)
    db.query(PerformanceReview).filter(PerformanceReview.employee_id == employee_id).delete(synchronize_session=False)

    # Delete learning records
    db.query(LearningEnrollment).filter(LearningEnrollment.employee_id == employee_id).delete(synchronize_session=False)
    db.query(LearningCertification).filter(LearningCertification.employee_id == employee_id).delete(synchronize_session=False)
    db.query(LearningSkill).filter(LearningSkill.employee_id == employee_id).delete(synchronize_session=False)
    db.query(LearningQuizAttempt).filter(LearningQuizAttempt.employee_id == employee_id).delete(synchronize_session=False)
    db.query(LearningTrainingProgramAssignment).filter(LearningTrainingProgramAssignment.employee_id == employee_id).delete(synchronize_session=False)

    # Delete recruitment records where employee was interviewer or approver
    db.query(RecruitmentInterviewFeedback).filter(
        RecruitmentInterviewFeedback.interviewer_id == employee_id
    ).delete(synchronize_session=False)
    db.query(RecruitmentOfferApproval).filter(
        RecruitmentOfferApproval.approver_id == employee_id
    ).delete(synchronize_session=False)

    # Delete travel approvals linked to employee's requests and where employee is approver
    emp_request_ids = [r[0] for r in db.query(TravelRequest.id).filter(TravelRequest.employee_id == employee_id).all()]
    if emp_request_ids:
        db.query(TravelApproval).filter(TravelApproval.request_id.in_(emp_request_ids)).delete(synchronize_session=False)
    db.query(TravelApproval).filter(TravelApproval.approver_id == employee_id).delete(synchronize_session=False)

    # Delete travel receipts linked to employee's expenses
    emp_expense_ids = [r[0] for r in db.query(TravelExpense.id).filter(TravelExpense.employee_id == employee_id).all()]
    if emp_expense_ids:
        db.query(TravelReceipt).filter(TravelReceipt.expense_id.in_(emp_expense_ids)).delete(synchronize_session=False)

    # Delete travel expense & request records (expenses first, FK: travel_receipts.expense_id -> travel_expenses.id)
    db.query(TravelExpense).filter(TravelExpense.employee_id == employee_id).delete(synchronize_session=False)
    db.query(TravelRequest).filter(TravelRequest.employee_id == employee_id).delete(synchronize_session=False)
    db.query(WfSuccession).filter(WfSuccession.employee_id == employee_id).delete(synchronize_session=False)

    # Delete time & compliance records (HR-owned tables only)
    db.query(ComplianceRecord).filter(ComplianceRecord.employee_id == employee_id).delete(synchronize_session=False)

    # Nullify employee_id on records where it's nullable (prevents FK violations for other employees' records)
    db.query(Asset).filter(Asset.employee_id == employee_id).update({"employee_id": None}, synchronize_session=False)
    db.query(HrDocument).filter(HrDocument.employee_id == employee_id).update({"employee_id": None}, synchronize_session=False)
    db.query(HrDocument).filter(HrDocument.approved_by == employee_id).update({"approved_by": None}, synchronize_session=False)
    db.query(HrDocument).filter(HrDocument.uploaded_by == employee_id).update({"uploaded_by": None}, synchronize_session=False)
    db.query(DocumentAssignment).filter(DocumentAssignment.employee_id == employee_id).delete(synchronize_session=False)
    db.query(DocumentAssignment).filter(DocumentAssignment.assigned_by == employee_id).update({"assigned_by": None}, synchronize_session=False)
    db.query(OnboardingNewHire).filter(OnboardingNewHire.employee_id == employee_id).update({"employee_id": None}, synchronize_session=False)
    db.query(OnboardingNewHire).filter(OnboardingNewHire.manager_id == employee_id).update({"manager_id": None}, synchronize_session=False)
    db.query(OnboardingPreboardingTask).filter(OnboardingPreboardingTask.employee_id == employee_id).update({"employee_id": None}, synchronize_session=False)

    # Delete records that are intrinsically owned by this employee (NOT NULL FK — can't nullify)
    db.query(EngagementSurvey).filter(EngagementSurvey.employee_id == employee_id).delete(synchronize_session=False)
    db.query(SupportTicket).filter(SupportTicket.raised_by == employee_id).delete(synchronize_session=False)
    db.query(ApprovalHistory).filter(ApprovalHistory.performed_by == employee_id).delete(synchronize_session=False)

    # Nullify remaining nullable FKs to this employee across HR, assets, org, learning & workforce planning
    db.query(Organization).filter(Organization.approved_by == employee_id).update({"approved_by": None}, synchronize_session=False)
    db.query(Holiday).filter(Holiday.created_by == employee_id).update({"created_by": None}, synchronize_session=False)
    db.query(LeaveRequest).filter(LeaveRequest.reviewed_by == employee_id).update({"reviewed_by": None}, synchronize_session=False)
    db.query(ShiftRoster).filter(ShiftRoster.assigned_by == employee_id).update({"assigned_by": None}, synchronize_session=False)
    db.query(AssetMaintenanceRequest).filter(AssetMaintenanceRequest.reported_by_id == employee_id).update({"reported_by_id": None}, synchronize_session=False)
    db.query(AssetMaintenanceRequest).filter(AssetMaintenanceRequest.resolved_by == employee_id).update({"resolved_by": None}, synchronize_session=False)
    db.query(AssetRequest).filter(AssetRequest.employee_id == employee_id).update({"employee_id": None}, synchronize_session=False)
    db.query(AssetRequest).filter(AssetRequest.approved_by == employee_id).update({"approved_by": None}, synchronize_session=False)
    db.query(AssetReport).filter(AssetReport.generated_by == employee_id).update({"generated_by": None}, synchronize_session=False)

    db.query(PerformanceReview).filter(PerformanceReview.reviewer_id == employee_id).update({"reviewer_id": None}, synchronize_session=False)
    db.query(PerformanceReview).filter(PerformanceReview.hr_reviewer_id == employee_id).update({"hr_reviewer_id": None}, synchronize_session=False)
    db.query(PerformanceReview).filter(PerformanceReview.admin_reviewer_id == employee_id).update({"admin_reviewer_id": None}, synchronize_session=False)
    db.query(PerformanceFeedback).filter(PerformanceFeedback.reviewer_id == employee_id).update({"reviewer_id": None}, synchronize_session=False)
    db.query(Appraisal).filter(Appraisal.reviewer_id == employee_id).update({"reviewer_id": None}, synchronize_session=False)
    db.query(Appraisal).filter(Appraisal.hr_reviewer_id == employee_id).update({"hr_reviewer_id": None}, synchronize_session=False)
    db.query(Appraisal).filter(Appraisal.admin_reviewer_id == employee_id).update({"admin_reviewer_id": None}, synchronize_session=False)

    db.query(RecruitmentInterview).filter(RecruitmentInterview.interviewer_id == employee_id).update({"interviewer_id": None}, synchronize_session=False)
    db.query(RecruitmentDocument).filter(RecruitmentDocument.uploaded_by == employee_id).update({"uploaded_by": None}, synchronize_session=False)
    db.query(TravelReceipt).filter(TravelReceipt.verified_by == employee_id).update({"verified_by": None}, synchronize_session=False)

    db.query(WfPlan).filter(WfPlan.owner_id == employee_id).update({"owner_id": None}, synchronize_session=False)
    db.query(WfPlan).filter(WfPlan.created_by == employee_id).update({"created_by": None}, synchronize_session=False)
    db.query(WfPlan).filter(WfPlan.updated_by == employee_id).update({"updated_by": None}, synchronize_session=False)
    db.query(WfHeadcount).filter(WfHeadcount.created_by == employee_id).update({"created_by": None}, synchronize_session=False)
    db.query(WfHeadcount).filter(WfHeadcount.updated_by == employee_id).update({"updated_by": None}, synchronize_session=False)
    db.query(WfSuccession).filter(WfSuccession.successor_employee_id == employee_id).update({"successor_employee_id": None}, synchronize_session=False)
    db.query(WfSuccession).filter(WfSuccession.created_by == employee_id).update({"created_by": None}, synchronize_session=False)
    db.query(WfSuccession).filter(WfSuccession.updated_by == employee_id).update({"updated_by": None}, synchronize_session=False)
    db.query(WfReport).filter(WfReport.generated_by == employee_id).update({"generated_by": None}, synchronize_session=False)

    db.query(LearningCourse).filter(LearningCourse.created_by == employee_id).update({"created_by": None}, synchronize_session=False)
    db.query(LearningPath).filter(LearningPath.created_by == employee_id).update({"created_by": None}, synchronize_session=False)
    db.query(LearningCertification).filter(LearningCertification.created_by == employee_id).update({"created_by": None}, synchronize_session=False)
    db.query(LearningAssessment).filter(LearningAssessment.created_by == employee_id).update({"created_by": None}, synchronize_session=False)
    db.query(LearningTrainingProgram).filter(LearningTrainingProgram.instructor_id == employee_id).update({"instructor_id": None}, synchronize_session=False)
    db.query(LearningTrainingProgram).filter(LearningTrainingProgram.created_by == employee_id).update({"created_by": None}, synchronize_session=False)
    db.query(LearningCalendarEvent).filter(LearningCalendarEvent.created_by == employee_id).update({"created_by": None}, synchronize_session=False)

    # Nullify FKs from OTHER employees' lifecycle/history/document records pointing at this employee
    db.query(EmployeeLifecycle).filter(EmployeeLifecycle.initiated_by == employee_id).update({"initiated_by": None}, synchronize_session=False)
    db.query(EmployeeLifecycle).filter(EmployeeLifecycle.approved_by == employee_id).update({"approved_by": None}, synchronize_session=False)
    db.query(EmployeeHistory).filter(EmployeeHistory.changed_by == employee_id).update({"changed_by": None}, synchronize_session=False)
    db.query(HrDocumentVersion).filter(HrDocumentVersion.uploaded_by == employee_id).update({"uploaded_by": None}, synchronize_session=False)
    db.query(DocumentApprovalStep).filter(DocumentApprovalStep.approved_by == employee_id).update({"approved_by": None}, synchronize_session=False)
    db.query(DocumentApprovalLog).filter(DocumentApprovalLog.performed_by == employee_id).update({"performed_by": None}, synchronize_session=False)

    # Nullify FKs in platform admin module
    db.query(AuditLog).filter(AuditLog.performed_by == employee_id).update({"performed_by": None}, synchronize_session=False)
    db.query(Notification).filter(Notification.target_user_id == employee_id).update({"target_user_id": None}, synchronize_session=False)
    db.query(Notification).filter(Notification.created_by == employee_id).update({"created_by": None}, synchronize_session=False)
    db.query(SupportTicket).filter(SupportTicket.assigned_to == employee_id).update({"assigned_to": None}, synchronize_session=False)
    db.query(SecurityEvent).filter(SecurityEvent.user_id == employee_id).update({"user_id": None}, synchronize_session=False)
    db.query(SecurityEvent).filter(SecurityEvent.resolved_by == employee_id).update({"resolved_by": None}, synchronize_session=False)
    db.query(LoginActivity).filter(LoginActivity.user_id == employee_id).update({"user_id": None}, synchronize_session=False)

    db.flush()
    _purge_employee_residuals(db, employee_id)
    db.query(Employee).filter(Employee.id == employee_id).delete()
    db.commit()
