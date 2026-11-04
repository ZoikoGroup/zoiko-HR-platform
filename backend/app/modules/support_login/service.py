"""Request -> tenant approval -> temporary read-only sign-in.

Status only moves forward:

    PENDING ──approve──> APPROVED ──generate credentials──> ACTIVE ──time runs out / operator ends──> COMPLETED
       │                    │                                  └──tenant revokes──> REVOKED
       ├──reject──> REJECTED├──cancel──> CANCELLED
       ├──cancel──> CANCELLED
       └──no decision in time──> EXPIRED  (APPROVED also expires when credentials are never generated)

Time-based moves (EXPIRED, COMPLETED) are applied lazily whenever a request is read, so no scheduler is needed.
"""
from __future__ import annotations

import logging
import secrets
import string
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.exceptions import (
    BadRequestException,
    ForbiddenException,
    NotFoundException,
    UnauthorizedException,
)
from app.core.security import create_access_token, hash_password, verify_password
from app.modules.employee.models import Employee, UserRole
from app.modules.hr.models import Organization
from app.modules.support_login.models import (
    ALLOWED_DURATIONS,
    OPEN_STATUSES,
    LoginRequestStatus as S,
    SupportLoginAccessLog,
    SupportLoginRequest,
    SupportLoginSession,
)

logger = logging.getLogger("zoiko.support_login")

USERNAME_DOMAIN = "support.zoikohr.com"
PENDING_TTL = timedelta(hours=48)          # an org admin has this long to decide
APPROVAL_TTL = timedelta(hours=24)         # after approval, the operator has this long to generate credentials
READ_ONLY_MESSAGE = "This is a read-only support session. Changes are not allowed."
ENDED_MESSAGE = "This temporary support session has ended."


def _now() -> datetime:
    return datetime.utcnow()


def _role(user) -> str:
    return user.role.value if hasattr(user.role, "value") else str(user.role)


def is_support_username(email: str) -> bool:
    return str(email or "").strip().lower().endswith("@" + USERNAME_DOMAIN)


# ── lazy time-based transitions ──────────────────────────────────────────────────────────────────────────────────────
def _settle(req: SupportLoginRequest, now: Optional[datetime] = None) -> bool:
    """Apply any expiry that is due. True when something changed (the caller commits)."""
    now = now or _now()
    if req.status == S.PENDING.value and req.pending_expires_at and now >= req.pending_expires_at:
        req.status = S.EXPIRED.value
        return True
    if req.status == S.APPROVED.value and req.approval_expires_at and now >= req.approval_expires_at:
        req.status = S.EXPIRED.value
        return True
    if req.status == S.ACTIVE.value and req.session is not None and now >= req.session.expires_at:
        req.status = S.COMPLETED.value
        if req.session.ended_at is None:
            req.session.ended_at = req.session.expires_at
            req.session.end_cause = "expired"
        return True
    return False


def _settle_all(db: Session, rows) -> None:
    now = _now()
    if any([_settle(r, now) for r in rows]):
        db.commit()


# ── serialisation ────────────────────────────────────────────────────────────────────────────────────────────────────
def _org_names(db: Session, org_ids) -> dict[int, str]:
    ids = {i for i in org_ids if i}
    if not ids:
        return {}
    rows = db.query(Organization).filter(Organization.id.in_(ids)).all()
    return {o.id: (o.name or f"Organization {o.id}") for o in rows}


def _session_dict(s: Optional[SupportLoginSession]) -> Optional[dict]:
    if s is None:
        return None
    now = _now()
    live = s.ended_at is None and now < s.expires_at
    return {
        "id": s.id,
        "username": s.username,
        "issued_at": s.issued_at,
        "expires_at": s.expires_at,
        "first_login_at": s.first_login_at,
        "last_seen_at": s.last_seen_at,
        "ended_at": s.ended_at,
        "end_cause": s.end_cause,
        "ended_by_email": s.ended_by_email,
        "request_count": s.request_count or 0,
        "is_live": live,
        "seconds_remaining": max(int((s.expires_at - now).total_seconds()), 0) if live else 0,
    }


def _request_dict(r: SupportLoginRequest, org_names: dict[int, str], viewer_id: Optional[int] = None) -> dict:
    return {
        "id": r.id,
        "reference": r.reference,
        "organization_id": r.organization_id,
        "organization_name": org_names.get(r.organization_id),
        "requested_by_email": r.requested_by_email,
        "is_mine": viewer_id is not None and r.requested_by == viewer_id,
        "justification": r.justification,
        "ticket_reference": r.ticket_reference,
        "duration_minutes": r.duration_minutes,
        "status": r.status,
        "decided_by_email": r.decided_by_email,
        "decided_at": r.decided_at,
        "decision_note": r.decision_note,
        "pending_expires_at": r.pending_expires_at,
        "approval_expires_at": r.approval_expires_at,
        "created_at": r.created_at,
        "session": _session_dict(r.session),
        "access": "read_only",
    }


def _org_admins(db: Session, organization_id: int) -> list[Employee]:
    return (
        db.query(Employee)
        .filter(Employee.organization_id == organization_id, Employee.role == UserRole.ADMIN, Employee.is_active.is_(True))
        .order_by(Employee.id)
        .all()
    )


def _audit(db: Session, actor, action, req: SupportLoginRequest, details: dict) -> None:
    from app.modules.super_admin.models import AuditLog
    db.add(AuditLog(
        action=action,
        entity_type="SupportLoginRequest",
        entity_id=req.id,
        performed_by=getattr(actor, "id", None),
        performed_by_email=getattr(actor, "email", None),
        organization_id=req.organization_id,
        details=details,
    ))


def _frontend_base() -> str:
    try:
        from app.services.email_service import _login_url
        return _login_url().rsplit("/login", 1)[0]
    except Exception:
        return ""


def _notify_org_admins(db: Session, req: SupportLoginRequest, operator, org_name: str) -> None:
    """In-app notification plus an e-mail to every active admin of the organization. Never fails the request."""
    admins = _org_admins(db, req.organization_id)
    if not admins:
        return
    message = (
        f"Zoiko support ({operator.email}) is asking for {req.duration_minutes} minutes of read-only access to "
        f"{org_name}. Reason: {req.justification}"
        + (f" (ticket {req.ticket_reference})" if req.ticket_reference else "")
        + ". Review it under Settings > Support Access."
    )
    try:
        from app.modules.super_admin import notification_service
        notification_service.create_notification(db, {
            "title": f"Support access request {req.reference}",
            "message": message,
            "notification_type": "warning",
            "priority": "high",
            "sender_name": "Zoiko Support",
            "target_type": "user",
            "target_user_ids": [a.id for a in admins],
            "audience": "org_admins",
        }, operator)
    except Exception:
        db.rollback()
        logger.exception("support login request notification failed")
    try:
        from app.services.email_service import send_support_login_requested
        url = f"{_frontend_base()}/organization-admin/support-access"
        for admin in admins:
            send_support_login_requested(
                admin.email, (admin.first_name or "").strip() or "there", org_name, operator.email, req.reference,
                req.duration_minutes, req.justification, req.ticket_reference or "—", url,
                db=db, organization_id=req.organization_id,
            )
    except Exception:
        logger.exception("support login request e-mail failed")


# ── operator (super admin) ───────────────────────────────────────────────────────────────────────────────────────────
def _generate_ticket_reference() -> str:
    """Generate a ticket reference in the format ZHR-YYYY-NNNNN."""
    from datetime import datetime
    now = datetime.utcnow()
    # Use a short random suffix to ensure uniqueness
    suffix = secrets.token_hex(3).upper()[:6]
    return f"ZHR-{now.year}-{suffix}"


def create_request(db: Session, operator, organization_id: int, justification: str, ticket_reference: Optional[str], duration_minutes: int) -> dict:
    justification = (justification or "").strip()
    if len(justification) < 10:
        raise BadRequestException("Describe why you need access (at least 10 characters).")
    if duration_minutes not in ALLOWED_DURATIONS:
        raise BadRequestException("Duration must be 5, 15 or 30 minutes.")
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    if org is None:
        raise NotFoundException("Organization")
    status = getattr(org.status, "value", org.status)
    if str(status).lower() not in ("active", "approved"):
        raise BadRequestException(f"Support access is only available for active organizations (this one is {status}).")
    if not _org_admins(db, organization_id):
        raise BadRequestException("This organization has no active admin who could approve the request.")

    existing = (
        db.query(SupportLoginRequest)
        .filter(SupportLoginRequest.organization_id == organization_id,
                SupportLoginRequest.requested_by == operator.id,
                SupportLoginRequest.status.in_(OPEN_STATUSES))
        .all()
    )
    _settle_all(db, existing)
    if any(r.status in OPEN_STATUSES for r in existing):
        raise BadRequestException("You already have an open request for this organization. Cancel it or wait for it to finish.")

    now = _now()
    ticket_ref = (ticket_reference or "").strip() or _generate_ticket_reference()
    req = SupportLoginRequest(
        reference=f"TMP-{secrets.token_hex(4).upper()}",
        organization_id=organization_id,
        requested_by=operator.id,
        requested_by_email=operator.email,
        justification=justification[:2000],
        ticket_reference=ticket_ref[:100],
        duration_minutes=duration_minutes,
        status=S.PENDING.value,
        pending_expires_at=now + PENDING_TTL,
    )
    db.add(req)
    db.flush()
    req.reference = f"SLR-{now.year}-{req.id:06d}"
    from app.modules.super_admin.models import AuditAction
    _audit(db, operator, AuditAction.CREATE, req, {"event": "support_login_requested", "organization_id": organization_id,
                                                       "duration_minutes": duration_minutes, "reference": req.reference})
    db.commit()
    db.refresh(req)
    org_name = org.name or f"Organization {org.id}"
    _notify_org_admins(db, req, operator, org_name)
    return _request_dict(req, {org.id: org_name}, operator.id)


def list_for_operator(db: Session, operator, status: Optional[str] = None) -> list[dict]:
    q = db.query(SupportLoginRequest)
    rows = q.order_by(SupportLoginRequest.created_at.desc(), SupportLoginRequest.id.desc()).limit(200).all()
    _settle_all(db, rows)
    if status:
        rows = [r for r in rows if r.status == status.upper()]
    names = _org_names(db, [r.organization_id for r in rows])
    return [_request_dict(r, names, operator.id) for r in rows]


def _get(db: Session, request_id: int, organization_id: Optional[int] = None) -> SupportLoginRequest:
    q = db.query(SupportLoginRequest).filter(SupportLoginRequest.id == request_id)
    if organization_id is not None:
        q = q.filter(SupportLoginRequest.organization_id == organization_id)
    req = q.first()
    if req is None:
        raise NotFoundException("Support access request")
    if _settle(req):
        db.commit()
    return req


def cancel_request(db: Session, operator, request_id: int) -> dict:
    req = _get(db, request_id)
    if req.requested_by != operator.id:
        raise ForbiddenException("Only the operator who asked for this access can cancel it.")
    if req.status not in (S.PENDING.value, S.APPROVED.value):
        raise BadRequestException(f"A {req.status.lower()} request cannot be cancelled.")
    req.status = S.CANCELLED.value
    from app.modules.super_admin.models import AuditAction
    _audit(db, operator, AuditAction.UPDATE, req, {"event": "support_login_cancelled", "reference": req.reference})
    db.commit()
    return _request_dict(req, _org_names(db, [req.organization_id]), operator.id)


def _new_password() -> str:
    alphabet = string.ascii_letters + string.digits
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(14)) + secrets.choice("!@#$%*") + secrets.choice(string.digits)
        if any(c.islower() for c in pw) and any(c.isupper() for c in pw):
            return pw


def issue_credentials(db: Session, operator, request_id: int) -> dict:
    """Generate the one-time username and password. The clock starts now; the password is returned only this once."""
    req = _get(db, request_id)
    if req.requested_by != operator.id:
        raise ForbiddenException("Only the operator who asked for this access can generate its credentials.")
    if req.status != S.APPROVED.value:
        raise BadRequestException(
            "Credentials can only be generated once, for an approved request."
            if req.status != S.PENDING.value else "The organization has not approved this request yet."
        )
    acting = None
    if req.decided_by:
        acting = db.query(Employee).filter(Employee.id == req.decided_by, Employee.organization_id == req.organization_id,
                                           Employee.role == UserRole.ADMIN, Employee.is_active.is_(True)).first()
    if acting is None:
        admins = _org_admins(db, req.organization_id)
        acting = admins[0] if admins else None
    if acting is None:
        raise BadRequestException("The organization no longer has an active admin; credentials cannot be issued.")

    now = _now()
    password = _new_password()
    username = f"support-{secrets.token_hex(4)}@{USERNAME_DOMAIN}"
    session = SupportLoginSession(
        request_id=req.id,
        organization_id=req.organization_id,
        acting_user_id=acting.id,
        username=username,
        password_hash=hash_password(password),
        issued_at=now,
        expires_at=now + timedelta(minutes=req.duration_minutes),
        request_count=0,
    )
    db.add(session)
    req.status = S.ACTIVE.value
    from app.modules.super_admin.models import AuditAction
    _audit(db, operator, AuditAction.CREATE, req, {"event": "support_login_credentials_issued", "reference": req.reference,
                                                       "expires_at": session.expires_at.isoformat() + "Z"})
    db.commit()
    db.refresh(req)
    out = _request_dict(req, _org_names(db, [req.organization_id]), operator.id)
    out["credentials"] = {"username": username, "password": password, "expires_at": session.expires_at,
                          "login_url": f"{_frontend_base()}/login"}
    return out


def end_session(db: Session, actor, request_id: int, by_tenant: bool, organization_id: Optional[int] = None) -> dict:
    req = _get(db, request_id, organization_id)
    if not by_tenant and req.requested_by != actor.id:
        raise ForbiddenException("Only the operator who asked for this access can end it.")
    if req.status != S.ACTIVE.value or req.session is None:
        raise BadRequestException("There is no live session to end.")
    now = _now()
    req.status = S.REVOKED.value if by_tenant else S.COMPLETED.value
    req.session.ended_at = now
    req.session.end_cause = "revoked_by_tenant" if by_tenant else "ended_by_operator"
    req.session.ended_by_email = actor.email
    from app.modules.super_admin.models import AuditAction
    _audit(db, actor, AuditAction.DISABLE, req, {"event": "support_login_session_ended", "reference": req.reference,
                                                     "cause": req.session.end_cause})
    db.commit()
    return _request_dict(req, _org_names(db, [req.organization_id]), actor.id)


# ── tenant (org admin) ───────────────────────────────────────────────────────────────────────────────────────────────
def _require_org_admin(user) -> int:
    if _role(user) != UserRole.ADMIN.value or not user.organization_id:
        raise ForbiddenException("Only an organization admin can manage support access.")
    return user.organization_id


def list_for_org(db: Session, admin) -> list[dict]:
    org_id = _require_org_admin(admin)
    rows = (
        db.query(SupportLoginRequest)
        .filter(SupportLoginRequest.organization_id == org_id)
        .order_by(SupportLoginRequest.created_at.desc(), SupportLoginRequest.id.desc())
        .limit(200)
        .all()
    )
    _settle_all(db, rows)
    names = _org_names(db, [org_id])
    out = []
    for r in rows:
        d = _request_dict(r, names)
        if d["session"]:
            d["session"].pop("username", None)
        out.append(d)
    return out


def decide(db: Session, admin, request_id: int, approve: bool, note: Optional[str]) -> dict:
    org_id = _require_org_admin(admin)
    req = _get(db, request_id, org_id)
    if req.status != S.PENDING.value:
        raise BadRequestException(f"This request is already {req.status.lower()}.")
    note = (note or "").strip()[:1000] or None
    if not approve and not note:
        raise BadRequestException("Say why you are rejecting the request.")
    now = _now()
    req.status = S.APPROVED.value if approve else S.REJECTED.value
    req.decided_by = admin.id
    req.decided_by_email = admin.email
    req.decided_at = now
    req.decision_note = note
    if approve:
        req.approval_expires_at = now + APPROVAL_TTL
    from app.modules.super_admin.models import AuditAction
    _audit(db, admin, AuditAction.APPROVED if approve else AuditAction.REJECTED, req,
           {"event": "support_login_decided", "reference": req.reference, "decision": req.status})
    db.commit()
    d = _request_dict(req, _org_names(db, [org_id]))
    return d


def revoke(db: Session, admin, request_id: int) -> dict:
    org_id = _require_org_admin(admin)
    return end_session(db, admin, request_id, by_tenant=True, organization_id=org_id)


def access_log(db: Session, admin, request_id: int) -> list[dict]:
    org_id = _require_org_admin(admin)
    req = _get(db, request_id, org_id)
    if req.session is None:
        return []
    rows = (
        db.query(SupportLoginAccessLog)
        .filter(SupportLoginAccessLog.session_id == req.session.id, SupportLoginAccessLog.organization_id == org_id)
        .order_by(SupportLoginAccessLog.at.desc())
        .limit(500)
        .all()
    )
    return [{"method": r.method, "path": r.path, "outcome": r.outcome, "at": r.at} for r in rows]


# ── sign-in with temporary credentials ───────────────────────────────────────────────────────────────────────────────
def _tokens(db: Session, session: SupportLoginSession, acting: Employee) -> tuple[str, str]:
    from app.core import org_access
    remaining = session.expires_at - _now()
    org_code = org_access.get_org_access(db, session.organization_id).organization_code
    access = create_access_token(data={
        "sub": acting.email,
        "role": _role(acting),
        "id": acting.id,
        "organization_id": session.organization_id,
        "organization_code": org_code,
        "aud": "zoiko-hr",
        "sls": session.id,          # support login session
        "ro": True,                 # read-only: the privacy middleware refuses every write
    }, expires_delta=remaining)
    refresh = create_access_token(data={
        "sub": acting.email, "id": acting.id, "organization_id": session.organization_id, "aud": "zoiko-hr",
        "typ": "refresh", "sls": session.id,
    }, expires_delta=remaining)
    return access, refresh


def _live_session(db: Session, session_id: int) -> tuple[SupportLoginSession, Employee]:
    session = db.query(SupportLoginSession).filter(SupportLoginSession.id == session_id).first()
    if session is None:
        raise UnauthorizedException(ENDED_MESSAGE)
    req = session.request
    if req is not None and _settle(req):
        db.commit()
    if session.ended_at is not None or _now() >= session.expires_at or (req is not None and req.status != S.ACTIVE.value):
        raise UnauthorizedException(ENDED_MESSAGE)
    acting = db.query(Employee).filter(Employee.id == session.acting_user_id, Employee.is_active.is_(True)).first()
    if acting is None or acting.organization_id != session.organization_id:
        raise UnauthorizedException(ENDED_MESSAGE)
    return session, acting


def sign_in(db: Session, username: str, password: str) -> dict:
    username = str(username or "").strip().lower()
    session = db.query(SupportLoginSession).filter(func.lower(SupportLoginSession.username) == username).first()
    if session is None or not verify_password(password or "", session.password_hash):
        raise UnauthorizedException("Invalid email or password.")
    session, acting = _live_session(db, session.id)
    now = _now()
    if session.first_login_at is None:
        session.first_login_at = now
    session.last_seen_at = now
    db.commit()
    access, refresh = _tokens(db, session, acting)
    return {"access_token": access, "refresh_token": refresh, "token_type": "bearer",
            "employee": _employee_payload(acting), "support_session": True}


def refresh(db: Session, payload: dict, refresh_token: str) -> dict:
    session, acting = _live_session(db, int(payload["sls"]))
    access, _ = _tokens(db, session, acting)
    return {"access_token": access, "refresh_token": refresh_token, "token_type": "bearer", "employee": _employee_payload(acting)}


def _employee_payload(acting: Employee):
    from app.modules.employee.schema import EmployeeResponse
    data = EmployeeResponse.model_validate(acting).model_dump()
    data["products"] = ["hr"]
    return EmployeeResponse.model_validate(data)


def current_session_info(db: Session, session_id: int) -> dict:
    session, _ = _live_session(db, session_id)
    req = session.request
    return {
        "reference": req.reference if req else None,
        "organization_id": session.organization_id,
        "organization_name": _org_names(db, [session.organization_id]).get(session.organization_id),
        "expires_at": session.expires_at,
        "seconds_remaining": max(int((session.expires_at - _now()).total_seconds()), 0),
        "read_only": True,
    }
