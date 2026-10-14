"""Dual control: one person asks, a DIFFERENT authorised person approves, then it runs once (ZHR-PRIV-001 B06, D09).

Nobody can approve their own request, a request expires, an approval is for one kind of action and runs once, and the payload holds
only what is needed to run it (ids, counts, a role name), never personal data.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException, ForbiddenException, NotFoundException
from app.modules.super_admin.models import ApprovalRequest

TTL_HOURS = 24
PLATFORM = "PLATFORM"
TENANT = "TENANT"


def _role(user) -> str:
    return getattr(user.role, "value", str(user.role))


def can_approve(user, req: ApprovalRequest) -> bool:
    if req.approver_plane == PLATFORM:
        return _role(user) == "super_admin" and user.is_active
    return _role(user) in ("admin",) and user.is_active and user.organization_id == req.organization_id


def request_approval(db: Session, kind: str, requester, payload: dict, *, organization_id: Optional[int] = None, plane: str = PLATFORM,
                     ttl_hours: int = TTL_HOURS) -> ApprovalRequest:
    req = ApprovalRequest(kind=kind, organization_id=organization_id, requested_by=requester.id, approver_plane=plane, payload=payload or {},
                          status="pending", expires_at=datetime.utcnow() + timedelta(hours=ttl_hours))
    db.add(req)
    db.flush()
    return req


def _load(db: Session, request_id: int) -> ApprovalRequest:
    req = db.query(ApprovalRequest).filter(ApprovalRequest.id == request_id).first()
    if req is None:
        raise NotFoundException("Approval request", request_id)
    return req


def _expire_if_due(db: Session, req: ApprovalRequest) -> None:
    if req.status == "pending" and req.expires_at <= datetime.utcnow():
        req.status = "expired"
        db.flush()


def decide(db: Session, request_id: int, approver, approve: bool) -> ApprovalRequest:
    req = _load(db, request_id)
    _expire_if_due(db, req)
    if req.status != "pending":
        raise BadRequestException(f"This request is {req.status} and can no longer be decided.")
    if req.requested_by == approver.id:
        raise ForbiddenException("You cannot approve your own request. Another authorised person must.")       # B06: nobody grants themselves anything
    if not can_approve(approver, req):
        raise ForbiddenException("You are not allowed to decide this request.")
    req.status = "approved" if approve else "rejected"
    req.decided_by, req.decided_at = approver.id, datetime.utcnow()
    db.flush()
    return req


def consume(db: Session, request_id: int, kind: str) -> ApprovalRequest:
    """Mark an approved request as run (exactly once). Raises unless it is approved, unexpired, of this kind and not yet run."""
    req = _load(db, request_id)
    if req.kind != kind or req.status != "approved" or req.executed_at is not None:
        raise BadRequestException("This request has not been approved, or has already been carried out.")
    if req.expires_at <= datetime.utcnow() - timedelta(hours=TTL_HOURS):                                      # approved long ago and never run
        raise BadRequestException("This approval has expired.")
    req.status, req.executed_at = "executed", datetime.utcnow()
    db.flush()
    return req


def pending_for(db: Session, user, limit: int = 50) -> list[ApprovalRequest]:
    rows = db.query(ApprovalRequest).filter(ApprovalRequest.status == "pending").order_by(ApprovalRequest.id.desc()).limit(limit).all()
    return [r for r in rows if r.expires_at > datetime.utcnow() and (can_approve(user, r) or r.requested_by == user.id)]


def gate_high_impact(db: Session, user, kind: str, payload: dict, approval_id: Optional[int]):
    """Dual control for a tenant action (ZHR-PRIV-001 D09). Returns None when the action may run now (the setting is off, or `approval_id`
    names an approved request, made by this person for exactly this payload, which is spent here). Otherwise records a request for a
    DIFFERENT organization admin to approve and returns the 202 response to send instead of running the action."""
    from fastapi.responses import JSONResponse
    from app.config import settings
    if not settings.DUAL_CONTROL_HIGH_IMPACT:
        return None
    if approval_id is None:
        req = request_approval(db, kind, user, payload, organization_id=user.organization_id, plane=TENANT)
        db.commit()
        return JSONResponse(status_code=202, content={
            "approval_required": True, "approval_id": req.id,
            "message": "This action needs a second organization administrator's approval. Ask them to approve it, then repeat it with the approval id."})
    req = _load(db, approval_id)
    if (req.kind != kind or req.requested_by != user.id or req.organization_id != user.organization_id
            or (req.payload or {}) != payload):
        raise ForbiddenException("This approval is not for this action.")
    consume(db, approval_id, kind)
    db.commit()
    return None
