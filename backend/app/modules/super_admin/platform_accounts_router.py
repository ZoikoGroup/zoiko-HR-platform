"""Platform (super admin) accounts: named people, second factor, dual control (ZHR-PRIV-001 B01, B02, B06).

* Every platform account belongs to one named person: generic or shared addresses are refused.
* Adding or removing a platform administrator is a REQUEST that a different platform administrator must approve. Nobody can approve
  their own request, so nobody can grant themselves access.
* When the account asking has a second factor, the request needs a fresh code (`/auth/mfa/step-up`).
"""
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_super_admin
from app.core.exceptions import BadRequestException, NotFoundException, ZoikoException
from app.core.privacy import accounts, approvals, mfa
from app.core.privacy.sessions import revoke_all_sessions
from app.database import get_db
from app.modules.employee import service
from app.modules.employee.models import Employee, UserRole
from app.modules.employee.schema import UserCreateRequest
from app.modules.super_admin.models import ApprovalRequest, AuditAction, AuditLog

router = APIRouter(prefix="/super-admin/platform-accounts", tags=["Super Admin"], dependencies=[Depends(get_current_super_admin)])

FRESH_SECONDS = 300


def fresh_mfa_if_enrolled(request_headers_dep=None):
    """A platform account that HAS a second factor must show a check made in the last five minutes for these actions."""
    from app.core.security import decode_access_token

    def _dep(request: Request, current_user=Depends(get_current_super_admin)):
        if not current_user.mfa_enabled:
            return
        header = request.headers.get("authorization", "")
        payload = decode_access_token(header[7:].strip()) if header.lower().startswith("bearer ") else None
        at = int((payload or {}).get("mfa_at") or 0)
        if not at or time.time() - at > FRESH_SECONDS:
            raise ZoikoException(403, mfa.MFA_STALE_CODE, "Confirm it is you: enter a fresh code from your authenticator app.")
    return _dep


class PlatformAccountRequest(BaseModel):
    email: EmailStr
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)


def _view(e: Employee) -> dict:
    return {"id": e.id, "email": e.email, "name": e.full_name, "is_active": bool(e.is_active), "mfa_enabled": bool(e.mfa_enabled),
            "generic": accounts.is_generic_account(e.email)}


def _request_view(r: ApprovalRequest, viewer) -> dict:
    payload = dict(r.payload or {})
    return {"id": r.id, "kind": r.kind, "status": r.status, "requested_by": r.requested_by, "payload": payload,
            "expires_at": r.expires_at.isoformat() if r.expires_at else None,
            "can_decide": r.status == "pending" and r.requested_by != viewer.id and approvals.can_approve(viewer, r)}


@router.get("", summary="Platform accounts")
def list_platform_accounts(db: Session = Depends(get_db)):
    rows = db.query(Employee).filter(Employee.role == UserRole.SUPER_ADMIN).order_by(Employee.id).all()
    return {"accounts": [_view(e) for e in rows]}


@router.post("", status_code=202, summary="Ask for a new platform administrator (needs a second administrator's approval)",
             dependencies=[Depends(fresh_mfa_if_enrolled())])
def request_platform_account(data: PlatformAccountRequest, db: Session = Depends(get_db), current_user=Depends(get_current_super_admin)):
    if accounts.is_generic_account(data.email):
        raise BadRequestException(accounts.GENERIC_MESSAGE)
    if db.query(Employee.id).filter(Employee.email == data.email).first():
        raise BadRequestException("An account with this address already exists.")
    req = approvals.request_approval(db, "platform_account_create", current_user,
                                     {"email": str(data.email), "first_name": data.first_name.strip(), "last_name": data.last_name.strip()})
    db.add(AuditLog(action=AuditAction.CREATE, entity_type="ApprovalRequest", entity_id=req.id, performed_by=current_user.id,
                    performed_by_email=current_user.email, details={"event": "platform_account.requested"}))
    db.commit()
    return _request_view(req, current_user)


@router.post("/{account_id}/deactivation-request", status_code=202, summary="Ask for a platform administrator to be removed",
             dependencies=[Depends(fresh_mfa_if_enrolled())])
def request_platform_deactivation(account_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_super_admin)):
    target = db.query(Employee).filter(Employee.id == account_id, Employee.role == UserRole.SUPER_ADMIN).first()
    if target is None:
        raise NotFoundException("Platform account", account_id)
    if target.id == current_user.id:
        raise BadRequestException("You cannot ask for your own account to be removed.")
    active = db.query(Employee).filter(Employee.role == UserRole.SUPER_ADMIN, Employee.is_active.is_(True)).count()
    if active <= 2:
        raise BadRequestException("There must always be at least two active platform administrators.")
    req = approvals.request_approval(db, "platform_account_deactivate", current_user, {"account_id": target.id})
    db.add(AuditLog(action=AuditAction.CREATE, entity_type="ApprovalRequest", entity_id=req.id, performed_by=current_user.id,
                    performed_by_email=current_user.email, details={"event": "platform_account.deactivation_requested", "account_id": target.id}))
    db.commit()
    return _request_view(req, current_user)


@router.get("/requests", summary="Pending requests you made or may decide")
def list_requests(db: Session = Depends(get_db), current_user=Depends(get_current_super_admin)):
    return {"requests": [_request_view(r, current_user) for r in approvals.pending_for(db, current_user)
                         if r.kind.startswith("platform_account_")]}


@router.post("/requests/{request_id}/approve", summary="Approve a request made by another administrator",
             dependencies=[Depends(fresh_mfa_if_enrolled())])
def approve_request(request_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_super_admin)):
    req = approvals.decide(db, request_id, current_user, True)
    result: dict = {}
    if req.kind == "platform_account_create":
        p = req.payload or {}
        approvals.consume(db, req.id, "platform_account_create")
        data = UserCreateRequest(first_name=p["first_name"], last_name=p["last_name"], email=p["email"], role=UserRole.SUPER_ADMIN,
                                 confirm_super_admin=True)
        employee, _ = service.create_organization_user(db, data, organization_id=None, created_by_id=req.requested_by, actor=current_user)
        result = {"created": _view(employee)}
        db.add(AuditLog(action=AuditAction.CREATE, entity_type="Employee", entity_id=employee.id, performed_by=current_user.id,
                        performed_by_email=current_user.email, details={"event": "platform_account.created", "requested_by": req.requested_by}))
    elif req.kind == "platform_account_deactivate":
        approvals.consume(db, req.id, "platform_account_deactivate")
        target = db.query(Employee).filter(Employee.id == (req.payload or {}).get("account_id"), Employee.role == UserRole.SUPER_ADMIN).first()
        if target is None:
            raise NotFoundException("Platform account", (req.payload or {}).get("account_id"))
        target.is_active = False
        revoke_all_sessions(target)
        result = {"deactivated": _view(target)}
        db.add(AuditLog(action=AuditAction.DEACTIVATE, entity_type="Employee", entity_id=target.id, performed_by=current_user.id,
                        performed_by_email=current_user.email, details={"event": "platform_account.deactivated", "requested_by": req.requested_by}))
    else:
        raise HTTPException(status_code=404, detail="Not Found")
    db.commit()
    return {"request": _request_view(req, current_user), **result}


@router.post("/requests/{request_id}/reject", summary="Reject a request made by another administrator")
def reject_request(request_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_super_admin)):
    req = approvals.decide(db, request_id, current_user, False)
    db.add(AuditLog(action=AuditAction.REJECTED, entity_type="ApprovalRequest", entity_id=req.id, performed_by=current_user.id,
                    performed_by_email=current_user.email, details={"event": "platform_account.request_rejected", "kind": req.kind}))
    db.commit()
    return _request_view(req, current_user)
