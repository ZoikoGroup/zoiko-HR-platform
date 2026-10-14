"""Support-access HTTP surface (ZHR-PRIV-001 section 02, Phases 2-7).

Three groups:

  /super-admin/support-access  the platform request/approval API (control plane). A platform token may call it; the
                               handlers only ever touch grant metadata.
  /hr/support-access           the tenant's own approval, authoriser and "Revoke now" API (data plane; the platform is
                               refused here by the middleware).
  /support/tenants/...         the ONLY place tenant data is served to a platform identity, and only ever under a live,
                               validated, scope-checked grant - every handler depends on `grant_context`.

No handler writes a status directly; they call the service, which uses the state machine.
"""
from __future__ import annotations

import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_super_admin, get_current_user
from app.core.privacy import policy
from app.core.privacy.mfa import require_fresh_mfa
from app.database import get_db
from app.modules.support_access import events, scopes as sc, service
from app.modules.support_access import audit as audit_store
from app.modules.support_access.dependencies import (
    SUPPORT_COOKIE,
    SUPPORT_COOKIE_PATH,
    GrantContext,
    access_payload,
    device_fingerprint,
    grant_context,
    session_fingerprint,
)
from app.modules.support_access.models import (
    ApprovalDecision,
    BreakGlassSession,
    BreakGlassStatus,
    RequestStatus,
    SupportAccessRequest,
    SupportGrant,
    TenantAuthoriser,
)

platform_router = APIRouter(prefix="/super-admin/support-access", tags=["support-access (platform)"])
tenant_router = APIRouter(prefix="/hr/support-access", tags=["support-access (tenant)"])
support_data_router = APIRouter(prefix="/support", tags=["support-access (enforced)"])

_COOKIE_SECURE = os.environ.get("ENVIRONMENT", "production").lower() != "testing"


# ── bodies ──────────────────────────────────────────────────────────────────────────────────────────────────────────
class ScopeBody(BaseModel):
    resources: list[str]
    record_ids: list[int] = Field(default_factory=list)
    entity_ids: list[int] = Field(default_factory=list)
    department_ids: list[int] = Field(default_factory=list)
    jurisdictions: list[str] = Field(default_factory=list)
    fields: dict[str, list[str]]
    actions: list[str]


class CreateRequestBody(BaseModel):
    tenant_id: int
    ticket_reference: str
    purpose: str
    purpose_category: str
    scope: ScopeBody
    duration_minutes: Optional[int] = None
    legal_basis_reference: Optional[str] = None
    submit: bool = True


class DecisionBody(BaseModel):
    decision: str = ApprovalDecision.APPROVED.value
    approved_scope: Optional[ScopeBody] = None
    comment: Optional[str] = None


class IndependentBody(DecisionBody):
    approval_type: str
    legal_basis_reference: Optional[str] = None


class AuthoriserBody(BaseModel):
    user_id: int
    scope_limits: list[str]
    note: Optional[str] = None


class StartBreakGlassBody(BaseModel):
    tenant_id: int
    incident_reference: str
    reason: str
    scope: ScopeBody


class KillSwitchBody(BaseModel):
    scope: str                       # PERSON | SESSION | TENANT | GLOBAL
    target: Optional[str] = None
    reason: str


# ── views (names and shapes only; never a field value) ─────────────────────────────────────────────────────────────
def _scope_out(scope: Optional[dict]) -> Optional[dict]:
    return sc.summary(scope) if scope else None


def _request_out(req: SupportAccessRequest) -> dict:
    return {
        "id": req.id,
        "reference": req.reference,
        "tenant_id": req.tenant_id,
        "status": req.status,
        "risk_level": req.risk_level,
        "purpose_category": req.purpose_category,
        "ticket_reference": req.ticket_reference,
        "requested_duration_minutes": req.requested_duration_minutes,
        "requested_scope": _scope_out(req.requested_scope),
        "created_at": req.created_at.isoformat() if req.created_at else None,
        "approval_expires_at": req.approval_expires_at.isoformat() if req.approval_expires_at else None,
        "close_reason": req.close_reason,
    }


def _grant_out(grant: SupportGrant) -> dict:
    return {
        "id": grant.id,
        "tenant_id": grant.tenant_id,
        "kind": grant.kind,
        "status": "REVOKED" if grant.revoked_at else "ACTIVE",
        "issued_at": grant.issued_at.isoformat() if grant.issued_at else None,
        "expires_at": grant.expires_at.isoformat() if grant.expires_at else None,
        "revocation_version": grant.revocation_version,
        "scope": _scope_out(grant.effective_scope),
    }


def _breakglass_out(session: BreakGlassSession) -> dict:
    return {
        "id": session.id,
        "tenant_id": session.tenant_id,
        "incident_reference": session.incident_reference,
        "status": session.status,
        "initiator_person_id": session.initiator_person_id,
        "second_responder_person_id": session.second_responder_person_id,
        "confirm_deadline": session.confirm_deadline.isoformat() if session.confirm_deadline else None,
        "started_at": session.started_at.isoformat() if session.started_at else None,
        "expires_at": session.expires_at.isoformat() if session.expires_at else None,
        "ended_at": session.ended_at.isoformat() if session.ended_at else None,
        "review_status": session.review_status,
        "scope": _scope_out(session.scope),
    }


def _revocation_out(row) -> dict:
    return {
        "id": row.id,
        "target_type": row.target_type,
        "target_ref": row.target_ref,
        "tenant_id": row.tenant_id,
        "reason": row.reason,
        "requested_at": row.requested_at.isoformat() if row.requested_at else None,
        "propagated_at": row.propagated_at.isoformat() if row.propagated_at else None,
        "propagation_confirmed": row.propagation_confirmed,
    }


# ══ platform: request and approve ══════════════════════════════════════════════════════════════════════════════════
@platform_router.post("/requests", status_code=201)
def create_request(
    payload: CreateRequestBody,
    db: Session = Depends(get_db),
    user=Depends(get_current_super_admin),
    _mfa=Depends(require_fresh_mfa(600)),
):
    req = service.create_request(
        db,
        requester=user,
        tenant_id=payload.tenant_id,
        ticket_reference=payload.ticket_reference,
        purpose=payload.purpose,
        purpose_category=payload.purpose_category,
        requested_scope=payload.scope.model_dump(),
        duration_minutes=payload.duration_minutes,
        legal_basis_reference=payload.legal_basis_reference,
    )
    if payload.submit:
        service.submit_request(db, req, actor=user)
    db.commit()
    return _request_out(req)


@platform_router.get("/requests")
def my_requests(db: Session = Depends(get_db), user=Depends(get_current_super_admin)):
    rows = (
        db.query(SupportAccessRequest)
        .filter(SupportAccessRequest.requester_person_id == user.id)
        .order_by(SupportAccessRequest.created_at.desc())
        .all()
    )
    return [_request_out(r) for r in rows]


@platform_router.post("/requests/{request_id}/cancel")
def cancel_request(
    request_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_super_admin),
):
    req = service.get_request(db, request_id)
    service.cancel_request(db, req, actor=user)
    db.commit()
    return _request_out(req)


@platform_router.post("/requests/{request_id}/independent-approve")
def independent_approve(
    request_id: int,
    payload: IndependentBody,
    db: Session = Depends(get_db),
    user=Depends(get_current_super_admin),
    _mfa=Depends(require_fresh_mfa(300)),
):
    req = service.get_request(db, request_id)
    service.independent_decide(
        db, req, approver=user, approval_type=payload.approval_type, decision=payload.decision,
        approved_scope=payload.approved_scope.model_dump() if payload.approved_scope else None,
        comment=payload.comment, legal_basis_reference=payload.legal_basis_reference,
    )
    db.commit()
    return _request_out(req)


@platform_router.post("/requests/{request_id}/activate")
def activate_request(
    request_id: int,
    http: Request,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(get_current_super_admin),
    _mfa=Depends(require_fresh_mfa(300)),
):
    req = service.get_request(db, request_id)
    if req.requester_person_id != user.id:
        raise HTTPException(403, "Only the requester may activate this grant")
    payload = access_payload(http)
    grant, token = service.activate_grant(
        db, req, grantee=user,
        session_id=session_fingerprint(payload, user),
        device_fingerprint=device_fingerprint(http),
    )
    db.commit()
    ttl = max(0, int((grant.expires_at - datetime.utcnow()).total_seconds()))
    response.set_cookie(
        SUPPORT_COOKIE, token, max_age=ttl, httponly=True, secure=_COOKIE_SECURE, samesite="strict",
        path=SUPPORT_COOKIE_PATH,
    )
    return _grant_out(grant)


@platform_router.get("/grants")
def platform_grants(db: Session = Depends(get_db), user=Depends(get_current_super_admin)):
    return [_grant_out(g) for g in service.active_grants(db)]


@platform_router.post("/grants/{grant_id}/revoke")
def platform_revoke(
    grant_id: str,
    reason: str = Query(default="revoked by platform"),
    db: Session = Depends(get_db),
    user=Depends(get_current_super_admin),
):
    grant = db.get(SupportGrant, grant_id)
    if grant is None:
        raise HTTPException(404, "grant not found")
    service.revoke_grant(db, grant, actor_id=user.id, reason=reason)
    db.commit()
    return _grant_out(grant)


# ══ audit chain: integrity of the whole record (Phase 9) ═════════════════════════════════════════════════════════════
@platform_router.get("/audit/verify")
def audit_verify(db: Session = Depends(get_db), user=Depends(get_current_super_admin)):
    """Recompute the hash chain. `ok=False` names the first row that no longer matches: an edit or a deletion here."""
    ok, first_bad = audit_store.verify_chain(db)
    return {
        "ok": ok,
        "first_bad_id": first_bad,
        "head_hash": audit_store.head_hash(db),
        "count": db.query(audit_store.PrivacyAuditEvent).count(),
        "genesis": audit_store.GENESIS,
    }


# ══ platform: break-glass (Phase 8) - two-person, read-only, ≤60 min, reviewed ══════════════════════════════════════
@platform_router.post("/breakglass", status_code=201)
def start_breakglass(
    payload: StartBreakGlassBody,
    db: Session = Depends(get_db),
    user=Depends(get_current_super_admin),
    _mfa=Depends(require_fresh_mfa(300)),
):
    """Open an emergency session. It grants nothing until a DIFFERENT platform engineer confirms it."""
    session = service.start_breakglass(
        db,
        initiator=user,
        tenant_id=payload.tenant_id,
        incident_reference=payload.incident_reference,
        reason=payload.reason,
        scope=payload.scope.model_dump(),
    )
    db.commit()
    return _breakglass_out(session)


@platform_router.get("/breakglass")
def list_breakglass(db: Session = Depends(get_db), user=Depends(get_current_super_admin)):
    return [_breakglass_out(s) for s in service.active_breakglass(db)]


@platform_router.post("/breakglass/{session_id}/confirm")
def confirm_breakglass(
    session_id: str,
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(get_current_super_admin),
    _mfa=Depends(require_fresh_mfa(300)),
):
    """The second person confirms. Issues a read-only, ≤60-minute capability and hands it back as a cookie."""
    session = service.get_breakglass(db, session_id)
    payload = access_payload(request)
    session, token = service.confirm_breakglass(
        db, session, responder=user, session_id=session_fingerprint(payload, user),
        device_fingerprint=device_fingerprint(request),
    )
    db.commit()
    ttl = max(0, int((session.expires_at - datetime.utcnow()).total_seconds()))
    response.set_cookie(
        SUPPORT_COOKIE, token, max_age=ttl, path=SUPPORT_COOKIE_PATH, httponly=True, samesite="strict",
        secure=_COOKIE_SECURE,
    )
    return {"session": _breakglass_out(session), "grant": _grant_out(db.get(SupportGrant, session.grant_id))}


@platform_router.post("/breakglass/{session_id}/end")
def end_breakglass(
    session_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_super_admin),
    _mfa=Depends(require_fresh_mfa(300)),
):
    session = service.get_breakglass(db, session_id)
    service.end_breakglass(db, session, actor=user)
    db.commit()
    return _breakglass_out(session)


# ══ platform: kill switch and revocation record (Phase 7) ═══════════════════════════════════════════════════════════
@platform_router.post("/kill-switch")
def platform_kill_switch(
    payload: KillSwitchBody,
    db: Session = Depends(get_db),
    user=Depends(get_current_super_admin),
    _mfa=Depends(require_fresh_mfa(300)),
):
    """Revoke every live grant a person, a session, a tenant or the whole platform is holding. One call, immediate."""
    result = service.kill_switch(
        db, scope=payload.scope, target=payload.target, actor_id=user.id, reason=payload.reason,
    )
    db.commit()
    return result


@platform_router.get("/revocations")
def platform_revocations(db: Session = Depends(get_db), user=Depends(get_current_super_admin)):
    return [_revocation_out(r) for r in service.recent_revocations(db)]


# ══ tenant: authorise, revoke, view ═════════════════════════════════════════════════════════════════════════════════
@tenant_router.get("/requests")
def tenant_requests(db: Session = Depends(get_db), user=Depends(get_current_user)):
    if getattr(user, "organization_id", None) is None:
        raise HTTPException(403, "Tenant scope required")
    return [_request_out(r) for r in service.pending_for_tenant(db, user.organization_id)]


@tenant_router.post("/requests/{request_id}/approve")
def tenant_approve(
    request_id: int,
    payload: DecisionBody,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _mfa=Depends(require_fresh_mfa(600)),
):
    req = service.get_request(db, request_id)
    if user.organization_id != req.tenant_id:
        raise HTTPException(404, "Not Found")
    service.tenant_decide(
        db, req, approver=user, decision=payload.decision,
        approved_scope=payload.approved_scope.model_dump() if payload.approved_scope else None,
        comment=payload.comment,
    )
    db.commit()
    return _request_out(req)


@tenant_router.post("/requests/{request_id}/reject")
def tenant_reject(
    request_id: int,
    payload: DecisionBody,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _mfa=Depends(require_fresh_mfa(600)),
):
    req = service.get_request(db, request_id)
    if user.organization_id != req.tenant_id:
        raise HTTPException(404, "Not Found")
    service.tenant_decide(
        db, req, approver=user, decision=ApprovalDecision.REJECTED.value, comment=payload.comment,
    )
    db.commit()
    return _request_out(req)


@tenant_router.post("/authorisers", status_code=201)
def designate_authoriser(
    payload: AuthoriserBody,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _mfa=Depends(require_fresh_mfa(600)),
):
    from app.modules.employee.models import Employee

    target = db.query(Employee).filter(Employee.id == payload.user_id).first()
    if target is None:
        raise HTTPException(404, "user not found")
    row = service.designate_authoriser(
        db, tenant_id=user.organization_id, user=target, designated_by=user, scope_limits=payload.scope_limits,
    )
    row.note = payload.note
    db.commit()
    return {"id": row.id, "tenant_id": row.tenant_id, "user_id": row.user_id, "scope_limits": row.scope_limits}


@tenant_router.delete("/authorisers/{authoriser_id}")
def revoke_authoriser(
    authoriser_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _mfa=Depends(require_fresh_mfa(600)),
):
    row = db.get(TenantAuthoriser, authoriser_id)
    if row is None or row.tenant_id != user.organization_id:
        raise HTTPException(404, "authoriser not found")
    service.revoke_authoriser(db, row, actor=user)
    db.commit()
    return {"id": row.id, "revoked": True}


@tenant_router.get("/grants")
def tenant_grants(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return [_grant_out(g) for g in service.active_grants(db, tenant_id=user.organization_id)]


@tenant_router.post("/grants/{grant_id}/revoke")
def tenant_revoke(
    grant_id: str,
    reason: str = Query(default="revoked by tenant"),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _mfa=Depends(require_fresh_mfa(300)),
):
    """The tenant's own "Revoke now": any live grant on this tenant dies immediately."""
    grant = db.get(SupportGrant, grant_id)
    if grant is None or grant.tenant_id != user.organization_id:
        raise HTTPException(404, "grant not found")
    service.revoke_grant(db, grant, actor_id=user.id, reason=reason)
    db.commit()
    return _grant_out(grant)


@tenant_router.get("/breakglass")
def tenant_breakglass(db: Session = Depends(get_db), user=Depends(get_current_user)):
    """The tenant sees every emergency session on their own data, active or past."""
    if getattr(user, "organization_id", None) is None:
        raise HTTPException(403, "Tenant scope required")
    return [_breakglass_out(s) for s in service.breakglass_for_tenant(db, user.organization_id)]


@tenant_router.post("/kill-switch")
def tenant_kill_switch(
    payload: KillSwitchBody,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _mfa=Depends(require_fresh_mfa(300)),
):
    """The tenant's own emergency stop. It may only ever reach its own tenant - the scope is forced, not trusted."""
    if getattr(user, "organization_id", None) is None:
        raise HTTPException(403, "Tenant scope required")
    result = service.kill_switch(
        db, scope="TENANT", target=str(user.organization_id), actor_id=user.id, reason=payload.reason,
    )
    db.commit()
    return result


@tenant_router.get("/revocations")
def tenant_revocations(db: Session = Depends(get_db), user=Depends(get_current_user)):
    if getattr(user, "organization_id", None) is None:
        raise HTTPException(403, "Tenant scope required")
    return [_revocation_out(r) for r in service.revocations_for_tenant(db, user.organization_id)]


# ══ the enforced data path ══════════════════════════════════════════════════════════════════════════════════════════
def _fields_param(fields: Optional[str]) -> Optional[tuple[str, ...]]:
    """When the caller names fields, that exact list is used and a field outside the grant refuses the request (T04).

    When it does not, `None` is passed to the policy, which returns exactly the fields the grant permits and masks the
    rest - so the platform's default view IS the grant, never the whole row."""
    if not fields:
        return None
    return tuple(f.strip() for f in fields.split(",") if f.strip())


def _authorize(g: GrantContext, db: Session, action: str, tenant_id: int, requested: Optional[tuple[str, ...]], *, record_id: Optional[int]):
    resource = policy.Resource(type="employees", tenant_id=tenant_id, record_id=record_id, owner_id=record_id)
    decision = policy.authorize(g.subject(), action, resource, fields=requested)
    if not decision.allow:
        # A denial is itself an auditable event, and it must survive the 403 that follows: its own commit.
        events.emit("ACCESS_DENIED", db=db, tenant_id=tenant_id, grant_id=g.grant.id, actor_person_id=g.user.id,
                    action=action, reason=decision.reason_code)
        db.commit()
        raise HTTPException(403, decision.reason_code)
    return decision


@support_data_router.get("/tenants/{tenant_id}/employees")
def list_employees(
    tenant_id: int,
    fields: Optional[str] = None,
    db: Session = Depends(get_db),
    g: GrantContext = Depends(grant_context),
):
    from app.modules.employee.models import Employee

    requested = _fields_param(fields)
    rows = db.query(Employee).filter(Employee.organization_id == tenant_id).all()
    out = []
    for emp in rows:
        decision = policy.authorize(g.subject(), "list", policy.Resource(type="employees", tenant_id=tenant_id, record_id=emp.id, owner_id=emp.id), fields=requested)
        if not decision.allow:
            continue
        out.append({"id": emp.id, **{f: getattr(emp, f, None) for f in decision.allowed_fields}})
    if not rows:
        # still check the grant covers this tenant/resource at all, so an empty tenant is not a silent allow
        _authorize(g, db, "list", tenant_id, requested, record_id=None)
    events.emit("ACCESS_ALLOWED", db=db, tenant_id=tenant_id, grant_id=g.grant.id, actor_person_id=g.user.id, action="list", count=len(out))
    db.commit()
    return out


@support_data_router.get("/tenants/{tenant_id}/employees/{employee_id}")
def read_employee(
    tenant_id: int,
    employee_id: int,
    fields: Optional[str] = None,
    db: Session = Depends(get_db),
    g: GrantContext = Depends(grant_context),
):
    from app.modules.employee.models import Employee

    requested = _fields_param(fields)
    decision = _authorize(g, db, "read", tenant_id, requested, record_id=employee_id)
    emp = db.query(Employee).filter(Employee.id == employee_id, Employee.organization_id == tenant_id).first()
    if emp is None:
        raise HTTPException(404, "Not Found")
    events.emit("ACCESS_ALLOWED", db=db, tenant_id=tenant_id, grant_id=g.grant.id, actor_person_id=g.user.id, action="read")
    db.commit()
    return {"id": emp.id, **{f: getattr(emp, f, None) for f in decision.allowed_fields}}


@support_data_router.get("/tenants/{tenant_id}/employees/{employee_id}/export")
def export_employee(
    tenant_id: int,
    employee_id: int,
    fields: Optional[str] = None,
    db: Session = Depends(get_db),
    g: GrantContext = Depends(grant_context),
):
    """Export is a SEPARATE action: a read grant never implies it (E07)."""
    from app.modules.employee.models import Employee

    requested = _fields_param(fields)
    events.emit("EXPORT_REQUESTED", db=db, tenant_id=tenant_id, grant_id=g.grant.id, actor_person_id=g.user.id)
    decision = _authorize(g, db, "export", tenant_id, requested, record_id=employee_id)
    emp = db.query(Employee).filter(Employee.id == employee_id, Employee.organization_id == tenant_id).first()
    if emp is None:
        raise HTTPException(404, "Not Found")
    db.commit()
    return {"exported": True, "id": emp.id, "fields": list(decision.allowed_fields)}
