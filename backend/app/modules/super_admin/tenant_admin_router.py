"""Platform management of TENANT ADMIN ACCOUNTS (ZHR-PRIV-001 A01, E01).

The platform runs tenants, so it can add an organization's administrator, send them a password-reset link, and suspend or
reactivate the account. It cannot do any of that for anyone else in the tenant: every action here is refused unless the target
is an organization admin. The answer is a minimised view (pseudonymous reference, masked address), never the person.

These replace the platform's use of /hr/admin/users, which is a tenant-plane route and closed to platform identities.
"""
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_super_admin
from app.core.exceptions import NotFoundException
from app.core.privacy.minimise import mask_email, pseudonym
from app.core.rate_limiter import limiter
from app.database import get_db
from app.modules.employee import service
from app.modules.employee.models import Employee, UserRole
from app.modules.employee.schema import PasswordResetRequest, PasswordResetResponse, UserCreateRequest
from app.modules.hr.models import Organization
from app.modules.super_admin.models import AuditAction, AuditLog

router = APIRouter(prefix="/super-admin/users", tags=["Super Admin"], dependencies=[Depends(get_current_super_admin)])


class TenantAdminCreate(BaseModel):
    organization_id: int
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    phone: Optional[str] = None


def _view(e: Employee) -> dict:
    ref = pseudonym(e.id, "Org Admin")
    return {"id": e.id, "email": mask_email(e.email), "role": e.role.value if e.role else None, "is_active": bool(e.is_active),
            "first_name": ref, "last_name": "", "full_name": ref, "status": e.status.value if e.status else None,
            "organization_id": e.organization_id}


def _admin_target(db: Session, user_id: int) -> Employee:
    """The account to act on, only if it is an organization admin. Anyone else looks like a missing account."""
    user = service.get_organization_user(db, user_id, None, skip_org_filter=True)
    if user.role != UserRole.ADMIN or user.organization_id is None:
        raise NotFoundException("User", user_id)
    return user


def _audit(db: Session, actor, action: AuditAction, target: Employee, details: dict) -> None:
    db.add(AuditLog(action=action, entity_type="Employee", entity_id=target.id, performed_by=actor.id, performed_by_email=actor.email,
                    organization_id=target.organization_id, details={**details, "target_role": "admin"}))


@router.post("", status_code=201, summary="Add an organization administrator")
def create_tenant_admin(data: TenantAdminCreate, db: Session = Depends(get_db), current_user=Depends(get_current_super_admin)):
    if not db.query(Organization.id).filter(Organization.id == data.organization_id).first():
        raise NotFoundException("Organization", data.organization_id)
    payload = UserCreateRequest(first_name=data.first_name, last_name=data.last_name, email=data.email, phone=data.phone,
                                role=UserRole.ADMIN, organization_id=data.organization_id)
    employee, _temp = service.create_organization_user(db, payload, organization_id=data.organization_id, created_by_id=current_user.id, actor=current_user)
    _audit(db, current_user, AuditAction.CREATE, employee, {"event": "tenant_admin.created", "organization_id": data.organization_id})
    db.commit()
    return {"message": "Invitation sent. The administrator sets their own password through the secure link.", "user": _view(employee), "temporary_password": None}


@router.post("/{user_id}/reset-password", response_model=PasswordResetResponse, summary="Reset an organization administrator's password")
@limiter.limit("10/minute")
def reset_tenant_admin_password(request: Request, user_id: int, data: PasswordResetRequest = Body(default_factory=PasswordResetRequest),
                                db: Session = Depends(get_db), current_user=Depends(get_current_super_admin)):
    target = _admin_target(db, user_id)
    user, temp_password = service.reset_user_password(db, target.id, organization_id=target.organization_id, updated_by_id=current_user.id,
                                                      skip_org_filter=True, method=data.method)
    _audit(db, current_user, AuditAction.PASSWORD_RESET, user, {"event": "tenant_admin.password_reset", "method": data.method})
    db.commit()
    if temp_password is None:
        return PasswordResetResponse(message=f"Reset link sent to the administrator. It expires in {service.RESET_TOKEN_TTL_MINUTES} minutes.", temporary_password=None, method="link")
    return PasswordResetResponse(message="Temporary password set. They must change it at next sign-in.", temporary_password=temp_password, method="temporary")


@router.post("/{user_id}/suspend", summary="Suspend an organization administrator")
def suspend_tenant_admin(user_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_super_admin)):
    target = _admin_target(db, user_id)
    user = service.suspend_organization_user(db, target.id, organization_id=target.organization_id, updated_by_id=current_user.id, skip_org_filter=True)
    _audit(db, current_user, AuditAction.SUSPEND, user, {"event": "tenant_admin.suspended"})
    db.commit()
    return _view(user)


@router.post("/{user_id}/activate", summary="Reactivate an organization administrator")
def activate_tenant_admin(user_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_super_admin)):
    target = _admin_target(db, user_id)
    user = service.activate_organization_user(db, target.id, organization_id=target.organization_id, updated_by_id=current_user.id, skip_org_filter=True)
    _audit(db, current_user, AuditAction.ACTIVATE, user, {"event": "tenant_admin.activated"})
    db.commit()
    return _view(user)
