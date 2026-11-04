"""Routes for temporary support sign-ins.

  /support-access/*            platform operator (super admin): request, list, cancel, generate credentials, end
  /org/me/support-access/*     organization admin: review, approve, reject, revoke, see what was viewed
  /auth/support-session        the support session itself: reference and time left, for the in-app banner
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_org_admin, get_current_super_admin, get_current_user
from app.core.exceptions import UnauthorizedException
from app.database import get_db
from app.modules.support_login import service

operator_router = APIRouter(prefix="/support-access", tags=["Support Access (temporary sign-in)"])
tenant_router = APIRouter(prefix="/org/me/support-access", tags=["Support Access (organization)"])
session_router = APIRouter(prefix="/auth", tags=["Authentication"])


class CreateRequest(BaseModel):
    organization_id: int
    justification: str = Field(..., min_length=10, max_length=2000)
    ticket_reference: Optional[str] = Field(None, max_length=100)
    duration_minutes: int = Field(..., description="5, 15 or 30")


class Decision(BaseModel):
    note: Optional[str] = Field(None, max_length=1000)


# ── operator ─────────────────────────────────────────────────────────────────────────────────────────────────────────
@operator_router.post("/requests", summary="Ask an organization for temporary read-only access")
def create_request(data: CreateRequest, db: Session = Depends(get_db), operator=Depends(get_current_super_admin)):
    return service.create_request(db, operator, data.organization_id, data.justification, data.ticket_reference, data.duration_minutes)


@operator_router.get("/requests", summary="All temporary access requests")
def list_requests(status: Optional[str] = Query(None), db: Session = Depends(get_db), operator=Depends(get_current_super_admin)):
    return service.list_for_operator(db, operator, status)


@operator_router.post("/requests/{request_id}/cancel", summary="Withdraw a pending or approved request")
def cancel_request(request_id: int, db: Session = Depends(get_db), operator=Depends(get_current_super_admin)):
    return service.cancel_request(db, operator, request_id)


@operator_router.post("/requests/{request_id}/credentials", summary="Generate the one-time username and password (shown once)")
def issue_credentials(request_id: int, db: Session = Depends(get_db), operator=Depends(get_current_super_admin)):
    return service.issue_credentials(db, operator, request_id)


@operator_router.post("/requests/{request_id}/end", summary="End a live session early")
def end_session(request_id: int, db: Session = Depends(get_db), operator=Depends(get_current_super_admin)):
    return service.end_session(db, operator, request_id, by_tenant=False)


# ── organization admin ───────────────────────────────────────────────────────────────────────────────────────────────
@tenant_router.get("/requests", summary="Support access requests for my organization")
def tenant_requests(db: Session = Depends(get_db), admin=Depends(get_current_org_admin)):
    return service.list_for_org(db, admin)


@tenant_router.post("/requests/{request_id}/approve", summary="Approve a request")
def tenant_approve(request_id: int, data: Decision = Decision(), db: Session = Depends(get_db), admin=Depends(get_current_org_admin)):
    return service.decide(db, admin, request_id, True, data.note)


@tenant_router.post("/requests/{request_id}/reject", summary="Reject a request")
def tenant_reject(request_id: int, data: Decision, db: Session = Depends(get_db), admin=Depends(get_current_org_admin)):
    return service.decide(db, admin, request_id, False, data.note)


@tenant_router.post("/requests/{request_id}/revoke", summary="End a live support session now")
def tenant_revoke(request_id: int, db: Session = Depends(get_db), admin=Depends(get_current_org_admin)):
    return service.revoke(db, admin, request_id)


@tenant_router.get("/requests/{request_id}/activity", summary="Every page the support session opened")
def tenant_activity(request_id: int, db: Session = Depends(get_db), admin=Depends(get_current_org_admin)):
    return service.access_log(db, admin, request_id)


# ── the support session itself ───────────────────────────────────────────────────────────────────────────────────────
@session_router.get("/support-session", summary="The current temporary support session (time left, organization)")
def current_support_session(request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    from app.core.security import decode_access_token
    auth = request.headers.get("authorization", "")
    payload = decode_access_token(auth[7:].strip()) if auth.lower().startswith("bearer ") else None
    if not payload or not payload.get("sls"):
        raise UnauthorizedException("This is not a support session.")
    return service.current_session_info(db, int(payload["sls"]))
