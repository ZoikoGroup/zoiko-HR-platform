"""The support-access workflow (ZHR-PRIV-001 section 02, Phases 2-5; revocation core for Phase 7).

One place turns a request into a grant, and one place turns a grant off. Handlers call these functions; they never write
a status themselves. Every state change and every refusal can be audited because the reason is a first-class value.

    create_request -> submit_request -> tenant_approve -> [independent_approve ...] -> activate_grant -> revoke/expire
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.core.exceptions import BadRequestException, ForbiddenException, NotFoundException
from app.core.privacy import policy
from app.core.privacy.classification import Level
from app.modules.support_access import events, granttokens, jobs, scopes as sc, state as st
from app.modules.support_access.models import (
    APPROVAL_WINDOW_HOURS,
    DEFAULT_DURATION_MINUTES,
    MAX_DURATION_MINUTES,
    Approval,
    ApprovalDecision,
    ApprovalType,
    BreakGlassSession,
    BreakGlassStatus,
    GrantKind,
    PurposeCategory,
    RequestStatus,
    RevocationEvent,
    RevocationTarget,
    SupportAccessRequest,
    SupportGrant,
    TenantAuthoriser,
)

logger = logging.getLogger("zoiko.privacy.support")

# employee.role values that may designate an authoriser. TENANT_ADMIN maps from "admin"; the product has no TENANT_OWNER.
DESIGNATOR_ROLES = frozenset({"admin"})
PLATFORM_ROLE = "super_admin"
APPROVED_DECISIONS = frozenset({ApprovalDecision.APPROVED.value, ApprovalDecision.APPROVED_NARROWED.value})
TENANT = ApprovalType.TENANT.value
SECURITY = ApprovalType.SECURITY.value
PRIVACY = ApprovalType.PRIVACY.value
ONE_AT_A_TIME_STATUSES = tuple(st.OPEN_STATUSES)


def _role(user) -> str:
    return getattr(getattr(user, "role", None), "value", str(getattr(user, "role", "")))


def is_platform_account(user) -> bool:
    return _role(user) == PLATFORM_ROLE


def is_tenant_designator(user) -> bool:
    return _role(user) in DESIGNATOR_ROLES and getattr(user, "is_active", True)


def _epoch(dt: datetime) -> float:
    """Naive-UTC datetime -> epoch seconds (matches granttokens, which uses time.time())."""
    return (dt - datetime(1970, 1, 1)).total_seconds()


def _now(now: Optional[datetime] = None) -> datetime:
    return now or datetime.utcnow()


# ── approval routing ────────────────────────────────────────────────────────────────────────────────────────────────
def required_approval_types(scope: dict) -> set[str]:
    """Which INDEPENDENT (platform) approvals a scope needs, on top of the tenant's own. TENANT is always required."""
    need: set[str] = set()
    if sc.requires_security_approval(scope):
        need.add(SECURITY)
    if sc.requires_privacy_approval(scope):
        need.add(PRIVACY)
    return need


def authoriser_covers(authoriser: TenantAuthoriser, scope: dict) -> bool:
    """A tenant authoriser may only approve the categories its designation allows (SPECIAL_CATEGORY is opt-in)."""
    allowed = set(authoriser.scope_limits or [])
    return set(sc.categories(scope)) <= allowed


def _active_authoriser(db: Session, tenant_id: int, user_id: int) -> Optional[TenantAuthoriser]:
    return (
        db.query(TenantAuthoriser)
        .filter(TenantAuthoriser.tenant_id == tenant_id, TenantAuthoriser.user_id == user_id, TenantAuthoriser.revoked_at.is_(None))
        .first()
    )


def _approved_types(db: Session, request: SupportAccessRequest) -> set[str]:
    rows = db.query(Approval).filter(Approval.request_id == request.id, Approval.decision.in_(tuple(APPROVED_DECISIONS))).all()
    return {r.approval_type for r in rows}


def effective_scope(request: SupportAccessRequest) -> dict:
    """The intersection of the request and every approving (narrowed) scope."""
    scopes = [request.requested_scope]
    for a in request.approvals or []:
        if a.approved_scope and a.decision in APPROVED_DECISIONS:
            scopes.append(a.approved_scope)
    return sc.intersect(scopes) if len(scopes) > 1 else request.requested_scope


# ── creating a request (Phase 2) ────────────────────────────────────────────────────────────────────────────────────
def _reference(db: Session, now: datetime) -> str:
    prefix = f"SAR-{now.year}-"
    last = (
        db.query(func.max(SupportAccessRequest.reference))
        .filter(SupportAccessRequest.reference.like(prefix + "%"))
        .scalar()
    )
    n = int(last.rsplit("-", 1)[-1]) + 1 if last else 1
    return f"{prefix}{n:06d}"


def create_request(
    db: Session,
    *,
    requester,
    tenant_id: int,
    ticket_reference: str,
    purpose: str,
    purpose_category: str,
    requested_scope,
    duration_minutes=None,
    legal_basis_reference: Optional[str] = None,
    account_id: Optional[int] = None,
    one_at_a_time: bool = True,
    record_threshold: int = sc.DEFAULT_RECORD_THRESHOLD,
    now: Optional[datetime] = None,
) -> SupportAccessRequest:
    """Create a DRAFT request. This grants nothing; it only records what would be asked for."""
    if not is_platform_account(requester):
        raise ForbiddenException("only a platform engineer can request support access")
    if not (ticket_reference or "").strip():
        raise BadRequestException("a ticket reference is required")
    if len((purpose or "").strip()) < 10:
        raise BadRequestException("a purpose of at least 10 characters is required")
    if purpose_category not in {c.value for c in PurposeCategory}:
        raise BadRequestException("unknown purpose category")

    try:
        scope = sc.validate_scope(requested_scope, purpose_category=purpose_category)
        duration = sc.validate_duration(duration_minutes if duration_minutes is not None else DEFAULT_DURATION_MINUTES)
    except sc.ScopeError as exc:
        raise BadRequestException(str(exc))

    risk = sc.compute_risk(scope, record_threshold=record_threshold)
    if sc.requires_privacy_approval(scope) and not (legal_basis_reference or "").strip():
        raise BadRequestException("special-category access needs a documented legal basis reference")

    if one_at_a_time:
        open_row = (
            db.query(SupportAccessRequest)
            .filter(
                SupportAccessRequest.requester_person_id == requester.id,
                SupportAccessRequest.tenant_id == tenant_id,
                SupportAccessRequest.status.in_(ONE_AT_A_TIME_STATUSES),
            )
            .first()
        )
        if open_row is not None:
            raise BadRequestException("you already have an open request for this tenant")

    now = _now(now)
    request = SupportAccessRequest(
        reference=_reference(db, now),
        tenant_id=tenant_id,
        requester_person_id=requester.id,
        requester_account_id=account_id if account_id is not None else requester.id,
        ticket_reference=ticket_reference.strip(),
        purpose=purpose.strip(),
        purpose_category=purpose_category,
        risk_level=risk.value,
        status=RequestStatus.DRAFT.value,
        requested_scope=scope,
        requested_duration_minutes=duration,
        legal_basis_reference=(legal_basis_reference or None),
        created_at=now,
    )
    db.add(request)
    db.flush()
    events.emit("GRANT_REQUESTED", db=db, request_id=request.id, tenant_id=tenant_id, actor_person_id=requester.id,
                risk_level=risk.value, purpose_category=purpose_category, ticket_reference=request.ticket_reference)
    return request


def submit_request(db: Session, request: SupportAccessRequest, *, actor, now: Optional[datetime] = None) -> SupportAccessRequest:
    if request.requester_person_id != getattr(actor, "id", None):
        raise ForbiddenException("only the requester can submit this request")
    if request.status != RequestStatus.DRAFT.value:
        raise BadRequestException("only a draft can be submitted")
    now = _now(now)
    request.approval_expires_at = now + timedelta(hours=APPROVAL_WINDOW_HOURS)
    st.transition(request, RequestStatus.PENDING_TENANT.value, now=now)
    events.emit("GRANT_SUBMITTED", db=db, request_id=request.id, tenant_id=request.tenant_id, actor_person_id=actor.id)
    notify_tenant(db, request, "REQUEST_SUBMITTED")
    return request


def cancel_request(db: Session, request: SupportAccessRequest, *, actor, reason: Optional[str] = None, now: Optional[datetime] = None) -> SupportAccessRequest:
    if request.requester_person_id != getattr(actor, "id", None):
        raise ForbiddenException("only the requester can cancel this request")
    if st.is_terminal(request.status):
        return request
    now = _now(now)
    st.transition(request, RequestStatus.CANCELLED.value, reason=reason or "cancelled by requester", now=now)
    events.emit("GRANT_REVOKED", db=db, request_id=request.id, tenant_id=request.tenant_id, actor_person_id=actor.id, detail="cancelled")
    return request


# ── tenant authorisation (Phase 3) ──────────────────────────────────────────────────────────────────────────────────
def tenant_decide(
    db: Session,
    request: SupportAccessRequest,
    *,
    approver,
    decision: str,
    approved_scope=None,
    comment: Optional[str] = None,
    now: Optional[datetime] = None,
) -> SupportAccessRequest:
    if request.status != RequestStatus.PENDING_TENANT.value:
        raise BadRequestException("this request is not awaiting tenant approval")
    now = _now(now)
    _expire_if_window_closed(db, request, now=now)

    authoriser = _active_authoriser(db, request.tenant_id, getattr(approver, "id", None))
    if authoriser is None:
        raise ForbiddenException("you are not a designated authoriser for this tenant")
    if approver.id == request.requester_person_id:
        raise ForbiddenException("an approver cannot approve their own request")
    if is_platform_account(approver):
        # a platform account can never act as a tenant approver, even if the same address exists in both planes
        raise ForbiddenException("a platform account cannot approve as a tenant")

    if decision == ApprovalDecision.REJECTED.value:
        db.add(_approval(request, TENANT, approver, ApprovalDecision.REJECTED.value, None, comment, now))
        st.transition(request, RequestStatus.REJECTED.value, reason=comment or "rejected by tenant", now=now)
        events.emit("APPROVAL_DECIDED", db=db, request_id=request.id, tenant_id=request.tenant_id, actor_person_id=approver.id, decision="REJECTED", approval_type=TENANT)
        return request

    if decision not in APPROVED_DECISIONS:
        raise BadRequestException("unknown decision")
    narrowed = _narrow(request.requested_scope, approved_scope)
    if not authoriser_covers(authoriser, narrowed):
        raise ForbiddenException("your authoriser scope does not cover every requested data category")
    decided = ApprovalDecision.APPROVED_NARROWED.value if narrowed != request.requested_scope else ApprovalDecision.APPROVED.value
    db.add(_approval(request, TENANT, approver, decided, narrowed, comment, now))
    events.emit("APPROVAL_DECIDED", db=db, request_id=request.id, tenant_id=request.tenant_id, actor_person_id=approver.id, decision=decided, approval_type=TENANT)
    db.flush()
    _advance(db, request, now=now)
    return request


def _approval(request, approval_type, approver, decision, scope, comment, now) -> Approval:
    return Approval(
        request_id=request.id, approval_type=approval_type, approver_person_id=approver.id,
        approver_account_id=getattr(approver, "id", None), decision=decision, approved_scope=scope,
        comment=comment, mfa_verified_at=now, decided_at=now,
    )


def _narrow(requested: dict, approved_scope) -> dict:
    if approved_scope is None:
        return requested
    try:
        return sc.assert_narrowing(requested, approved_scope)
    except sc.ScopeError as exc:
        raise BadRequestException(str(exc))


# ── independent approval (Phase 4) ─────────────────────────────────────────────────────────────────────────────────
def independent_decide(
    db: Session,
    request: SupportAccessRequest,
    *,
    approver,
    approval_type: str,
    decision: str = ApprovalDecision.APPROVED.value,
    approved_scope=None,
    comment: Optional[str] = None,
    legal_basis_reference: Optional[str] = None,
    now: Optional[datetime] = None,
) -> SupportAccessRequest:
    if request.status != RequestStatus.PENDING_INDEPENDENT.value:
        raise BadRequestException("this request is not awaiting independent approval")
    if approval_type not in (SECURITY, PRIVACY):
        raise BadRequestException("an independent approval is SECURITY or PRIVACY")
    if not is_platform_account(approver):
        raise ForbiddenException("an independent approver is a platform SECURITY/PRIVACY approver")
    if approver.id == request.requester_person_id:
        raise ForbiddenException("an approver cannot approve their own request")
    if _is_tenant_approver(db, request, approver.id):
        raise ForbiddenException("an independent approver must differ from the tenant approver")

    now = _now(now)
    scope_now = effective_scope(request)

    if decision == ApprovalDecision.REJECTED.value:
        db.add(_approval(request, approval_type, approver, ApprovalDecision.REJECTED.value, None, comment, now))
        st.transition(request, RequestStatus.REJECTED.value, reason=comment or f"rejected by {approval_type.lower()}", now=now)
        events.emit("APPROVAL_DECIDED", db=db, request_id=request.id, tenant_id=request.tenant_id, actor_person_id=approver.id, decision="REJECTED", approval_type=approval_type)
        return request

    if approval_type == PRIVACY and sc.requires_privacy_approval(scope_now):
        if not (legal_basis_reference or request.legal_basis_reference or "").strip():
            raise BadRequestException("special-category access needs a documented legal basis reference")

    narrowed = _narrow(request.requested_scope, approved_scope)
    decided = ApprovalDecision.APPROVED_NARROWED.value if narrowed != request.requested_scope else ApprovalDecision.APPROVED.value
    db.add(_approval(request, approval_type, approver, decided, narrowed, comment, now))
    events.emit("APPROVAL_DECIDED", db=db, request_id=request.id, tenant_id=request.tenant_id, actor_person_id=approver.id, decision=decided, approval_type=approval_type)
    db.flush()
    _advance(db, request, now=now)
    return request


def _is_tenant_approver(db: Session, request: SupportAccessRequest, person_id: int) -> bool:
    return (
        db.query(Approval)
        .filter(Approval.request_id == request.id, Approval.approval_type == TENANT, Approval.approver_person_id == person_id)
        .first()
        is not None
    )


def _advance(db: Session, request: SupportAccessRequest, *, now: datetime) -> None:
    """Move the request forward when the approvals it needs are in. A HIGH request is never issued on one approval."""
    if request.status == RequestStatus.PENDING_TENANT.value:
        if TENANT not in _approved_types(db, request):
            return
        db.refresh(request)
        if required_approval_types(effective_scope(request)):
            st.transition(request, RequestStatus.PENDING_INDEPENDENT.value, now=now)
            return
        st.transition(request, RequestStatus.APPROVED.value, now=now)
        return

    if request.status == RequestStatus.PENDING_INDEPENDENT.value:
        db.refresh(request)
        need = required_approval_types(effective_scope(request))
        if need <= _approved_types(db, request):
            st.transition(request, RequestStatus.APPROVED.value, now=now)
        return


# ── grant issuance (Phase 5) ───────────────────────────────────────────────────────────────────────────────────────
def grant_capability(grant: SupportGrant) -> policy.GrantCapability:
    s = grant.effective_scope or {}
    return policy.GrantCapability(
        grant_id=grant.id,
        tenant_id=grant.tenant_id,
        kind=grant.kind,
        resources=frozenset(s.get("resources", [])),
        record_ids=frozenset(s.get("record_ids", [])),
        entity_ids=frozenset(s.get("entity_ids", [])),
        department_ids=frozenset(s.get("department_ids", [])),
        jurisdictions=frozenset(s.get("jurisdictions", [])),
        fields={r: frozenset(names) for r, names in (s.get("fields") or {}).items()},
        actions=frozenset(s.get("actions", [])),
        expires_at=_epoch(grant.expires_at),
        policy_version=grant.policy_version,
    )


def activate_grant(
    db: Session,
    request: SupportAccessRequest,
    *,
    grantee,
    session_id: str,
    device_fingerprint: str,
    now: Optional[datetime] = None,
):
    """Issue the signed capability for an APPROVED request and start the clock. Returns (grant, token)."""
    if request.status != RequestStatus.APPROVED.value:
        raise BadRequestException("the request is not approved")
    now = _now(now)
    effective = effective_scope(request)
    ttl = min(int(request.requested_duration_minutes or DEFAULT_DURATION_MINUTES), MAX_DURATION_MINUTES)
    jti = uuid.uuid4().hex
    grant = SupportGrant(
        request_id=request.id,
        tenant_id=request.tenant_id,
        grantee_person_id=getattr(grantee, "id", None),
        grantee_account_id=getattr(grantee, "id", None),
        kind=GrantKind.STANDARD.value,
        effective_scope=effective,
        issued_at=now,
        expires_at=now + timedelta(minutes=ttl),
        revocation_version=1,
        session_id=session_id,
        device_fingerprint=device_fingerprint,
        policy_version=policy.POLICY_VERSION,
        token_jti=jti,
    )
    db.add(grant)
    db.flush()
    token = granttokens.issue(
        grant_id=grant.id, grantee_account_id=grantee.id, person_id=grantee.id, tenant_id=request.tenant_id,
        scope_hash=sc.scope_hash(effective), revocation_version=grant.revocation_version, session_id=session_id,
        device_fingerprint=device_fingerprint, policy_version=policy.POLICY_VERSION, ttl_seconds=ttl * 60, jti=jti,
        now=_epoch(now),
    )
    st.transition(request, RequestStatus.ACTIVE.value, now=now)
    events.emit("GRANT_ISSUED", db=db, request_id=request.id, grant_id=grant.id, tenant_id=request.tenant_id,
                actor_person_id=grant.grantee_person_id, expires_at=grant.expires_at.isoformat())
    notify_tenant(db, request, "ACCESS_STARTED")
    return grant, token


def close_grant(db: Session, grant: SupportGrant, *, actor_id: Optional[int] = None, reason: str = "closed", now: Optional[datetime] = None) -> SupportGrant:
    if grant.revoked_at is None:
        revoke_grant(db, grant, actor_id=actor_id, reason=reason, now=now)
    return grant


# ── revocation and expiry (Phase 7) ────────────────────────────────────────────────────────────────────────────────
def revoke_grant(db: Session, grant: SupportGrant, *, actor_id: Optional[int], reason: str, now: Optional[datetime] = None) -> SupportGrant:
    """Kill one grant. Idempotent. Bumps revocation_version so a token already in flight is refused."""
    if grant.revoked_at is not None:
        return grant
    now = _now(now)
    grant.revoked_at = now
    grant.revoke_reason = reason
    grant.revoked_by = actor_id
    grant.revocation_version = (grant.revocation_version or 1) + 1
    db.add(RevocationEvent(target_type="GRANT", target_ref=grant.id, tenant_id=grant.tenant_id,
                           actor_person_id=actor_id, reason=reason, requested_at=now, propagated_at=now,
                           propagation_confirmed=True))
    request = grant.request
    if request is not None and not st.is_terminal(request.status):
        st.transition(request, RequestStatus.REVOKED.value, reason=reason, now=now)
    events.emit("GRANT_REVOKED", db=db, grant_id=grant.id, request_id=grant.request_id, tenant_id=grant.tenant_id,
                actor_person_id=actor_id, reason=reason)
    _invalidate_cache(grant)
    jobs.cancel_for_grant(grant.id, reason=reason)
    return grant


def expire_stale(db: Session, *, now: Optional[datetime] = None, limit: int = 500) -> dict:
    """Expire grants whose time is up and requests whose approval window closed. Called by the periodic task."""
    now = _now(now)
    expired_grants = (
        db.query(SupportGrant)
        .filter(SupportGrant.revoked_at.is_(None), SupportGrant.expires_at <= now)
        .limit(limit)
        .all()
    )
    for g in expired_grants:
        g.revoked_at = now
        g.revoke_reason = "expired"
        g.revocation_version = (g.revocation_version or 1) + 1
        db.add(RevocationEvent(target_type="GRANT", target_ref=g.id, tenant_id=g.tenant_id, reason="expired",
                               requested_at=now, propagated_at=now, propagation_confirmed=True))
        if g.request is not None and g.request.status == RequestStatus.ACTIVE.value:
            st.transition(g.request, RequestStatus.EXPIRED.value, reason="expired", now=now)
        events.emit("GRANT_EXPIRED", db=db, grant_id=g.id, tenant_id=g.tenant_id)
        _invalidate_cache(g)

    stale_requests = (
        db.query(SupportAccessRequest)
        .filter(
            SupportAccessRequest.approval_expires_at.isnot(None),
            SupportAccessRequest.approval_expires_at <= now,
            SupportAccessRequest.status.in_((RequestStatus.PENDING_TENANT.value, RequestStatus.PENDING_INDEPENDENT.value)),
        )
        .limit(limit)
        .all()
    )
    for r in stale_requests:
        _expire_if_window_closed(db, r, now=now)
    return {"grants": len(expired_grants), "requests": len(stale_requests)}


def _expire_if_window_closed(db: Session, request: SupportAccessRequest, *, now: datetime) -> None:
    if request.approval_expires_at is not None and request.approval_expires_at <= now and request.status in (
        RequestStatus.PENDING_TENANT.value, RequestStatus.PENDING_INDEPENDENT.value,
    ):
        st.transition(request, RequestStatus.EXPIRED.value, reason="approval window closed", now=now)


def _invalidate_cache(grant: SupportGrant) -> None:
    """Best-effort: drop any cached live-grant decision. Phase 7 adds the Redis pub/sub fan-out."""
    try:
        from app.modules.support_access.cache import forget_grant

        forget_grant(grant.id)
    except Exception:
        logger.debug("grant cache invalidation skipped", exc_info=True)


# ── notifications (Phase 11 seam) ───────────────────────────────────────────────────────────────────────────────────
def notify_tenant(db: Session, request: SupportAccessRequest, event_type: str) -> None:
    """Tell the tenant's authorisers something happened. Content is the reference and the SHAPE of the scope, no values."""
    summary = sc.summary(effective_scope(request))
    events.emit("TENANT_NOTIFIED", db=db, request_id=request.id, tenant_id=request.tenant_id, trigger=event_type, summary=summary)
    logger.info("tenant %s notified: %s for %s", request.tenant_id, event_type, request.reference)


# ── kill switch: revoke by person, session, tenant or globally (Phase 7) ───────────────────────────────────────────
def _live_grants_query(db: Session):
    return db.query(SupportGrant).filter(SupportGrant.revoked_at.is_(None), SupportGrant.expires_at > datetime.utcnow())


def kill_switch(
    db: Session,
    *,
    scope: str,
    target,
    actor_id: Optional[int],
    reason: str,
    now: Optional[datetime] = None,
) -> dict:
    """The emergency stop. Revokes every live grant the scope names and records one KILL_SWITCH event.

    scope: PERSON (target = person id) | SESSION (target = session id) | TENANT (target = tenant id) | GLOBAL (no target).
    """
    scope = (scope or "").upper()
    target_map = {"PERSON": RevocationTarget.PERSON, "SESSION": RevocationTarget.SESSION,
                  "TENANT": RevocationTarget.TENANT, "GLOBAL": RevocationTarget.GLOBAL}
    if scope not in target_map:
        raise BadRequestException("scope must be one of PERSON, SESSION, TENANT, GLOBAL")
    if scope != "GLOBAL" and target in (None, ""):
        raise BadRequestException(f"a {scope} kill switch needs a target")
    now = _now(now)

    q = _live_grants_query(db)
    if scope == "PERSON":
        q = q.filter(SupportGrant.grantee_person_id == int(target))
    elif scope == "SESSION":
        q = q.filter(SupportGrant.session_id == str(target))
    elif scope == "TENANT":
        q = q.filter(SupportGrant.tenant_id == int(target))
    grants = q.all()

    tenant_id = int(target) if scope == "TENANT" else None
    for grant in grants:
        revoke_grant(db, grant, actor_id=actor_id, reason=f"kill switch ({scope})", now=now)

    # one record for the switch itself, on top of the per-grant GRANT_REVOKED rows
    db.add(RevocationEvent(
        target_type=scope, target_ref=None if scope == "GLOBAL" else str(target),
        tenant_id=tenant_id, actor_person_id=actor_id, reason=reason,
        requested_at=now, propagated_at=now, propagation_confirmed=True,
    ))
    events.emit("KILL_SWITCH", db=db, tenant_id=tenant_id, actor_person_id=actor_id,
                scope=scope, revoked=len(grants), reason=reason)
    return {"scope": scope, "target": None if scope == "GLOBAL" else str(target), "revoked": len(grants)}


def revocations_for_tenant(db: Session, tenant_id: int, limit: int = 200) -> list[RevocationEvent]:
    return (
        db.query(RevocationEvent)
        .filter(RevocationEvent.tenant_id == tenant_id)
        .order_by(RevocationEvent.requested_at.desc())
        .limit(limit)
        .all()
    )


def recent_revocations(db: Session, limit: int = 200) -> list[RevocationEvent]:
    return db.query(RevocationEvent).order_by(RevocationEvent.requested_at.desc()).limit(limit).all()


# ── read helpers ────────────────────────────────────────────────────────────────────────────────────────────────────
def get_request(db: Session, request_id: int) -> SupportAccessRequest:
    request = db.get(SupportAccessRequest, request_id)
    if request is None:
        raise NotFoundException("support access request not found")
    return request


def pending_for_tenant(db: Session, tenant_id: int) -> list[SupportAccessRequest]:
    return (
        db.query(SupportAccessRequest)
        .filter(SupportAccessRequest.tenant_id == tenant_id)
        .order_by(SupportAccessRequest.created_at.desc())
        .all()
    )


def active_grants(db: Session, *, tenant_id: Optional[int] = None, person_id: Optional[int] = None) -> list[SupportGrant]:
    q = db.query(SupportGrant).filter(SupportGrant.revoked_at.is_(None), SupportGrant.expires_at > datetime.utcnow())
    if tenant_id is not None:
        q = q.filter(SupportGrant.tenant_id == tenant_id)
    if person_id is not None:
        q = q.filter(SupportGrant.grantee_person_id == person_id)
    return q.all()


def designate_authoriser(db: Session, *, tenant_id: int, user, designated_by, scope_limits, now: Optional[datetime] = None) -> TenantAuthoriser:
    if not is_tenant_designator(designated_by):
        raise ForbiddenException("only a tenant administrator can designate an authoriser")
    if getattr(user, "organization_id", None) != tenant_id:
        raise BadRequestException("the authoriser must belong to this tenant")
    if is_platform_account(user):
        raise BadRequestException("a platform account cannot be a tenant authoriser")
    now = _now(now)
    existing = _active_authoriser(db, tenant_id, user.id)
    if existing is not None:
        return existing
    row = TenantAuthoriser(tenant_id=tenant_id, user_id=user.id, designated_by=getattr(designated_by, "id", None),
                           designated_at=now, scope_limits=list(scope_limits))
    db.add(row)
    db.flush()
    events.emit("AUTHORISER_DESIGNATED", db=db, tenant_id=tenant_id, actor_person_id=getattr(designated_by, "id", None), user_id=user.id)
    return row


def revoke_authoriser(db: Session, row: TenantAuthoriser, *, actor, now: Optional[datetime] = None) -> TenantAuthoriser:
    if not is_tenant_designator(actor) or getattr(actor, "organization_id", None) != row.tenant_id:
        raise ForbiddenException("only a tenant administrator of this tenant can revoke an authoriser")
    row.revoked_at = _now(now)
    row.revoked_by = getattr(actor, "id", None)
    events.emit("AUTHORISER_REVOKED", db=db, tenant_id=row.tenant_id, actor_person_id=getattr(actor, "id", None), user_id=row.user_id)
    return row


# ── break-glass (Phase 8) ───────────────────────────────────────────────────────────────────────────────────────────
# Emergency access for a live incident. Two platform people, a fresh MFA check on both, read-only, no special-category
# data, capped well below a normal grant, and reviewed afterwards. It cannot be renewed: when it ends, it is over.
BREAKGLASS_CONFIRM_WINDOW_MINUTES = 15


def _breakglass_scope(scope) -> dict:
    """Validate and then TIGHTEN a break-glass scope: read verbs only, never special-category or secret data."""
    try:
        canonical = sc.validate_scope(scope)
    except sc.ScopeError as exc:
        raise BadRequestException(str(exc))
    for action in canonical["actions"]:
        if action not in policy.READ_ACTIONS:
            raise BadRequestException("break-glass is read-only; the requested scope asks for a write action")
    touched = sc.levels_touched(canonical)
    if Level.SPECIAL_CATEGORY in touched or Level.SECRET in touched:
        raise BadRequestException("break-glass may never touch special-category or secret data")
    return canonical


def start_breakglass(
    db: Session,
    *,
    initiator,
    tenant_id: int,
    incident_reference: str,
    reason: str,
    scope,
    now: Optional[datetime] = None,
) -> BreakGlassSession:
    """Open an emergency session. It grants nothing until a SECOND platform person confirms it."""
    if not is_platform_account(initiator):
        raise ForbiddenException("only a platform engineer can start break-glass")
    if not (incident_reference or "").strip():
        raise BadRequestException("an incident reference is required")
    if len((reason or "").strip()) < 10:
        raise BadRequestException("a reason of at least 10 characters is required")
    canonical = _breakglass_scope(scope)
    now = _now(now)
    session = BreakGlassSession(
        incident_reference=incident_reference,
        reason=reason,
        tenant_id=tenant_id,
        initiator_person_id=getattr(initiator, "id", None),
        scope=canonical,
        status=BreakGlassStatus.PENDING_CONFIRMATION.value,
        confirm_deadline=now + timedelta(minutes=BREAKGLASS_CONFIRM_WINDOW_MINUTES),
    )
    db.add(session)
    db.flush()
    events.emit("BREAK_GLASS_STARTED", db=db, tenant_id=tenant_id, actor_person_id=getattr(initiator, "id", None),
                payload_summary=sc.summary(canonical))
    events.emit("TENANT_NOTIFIED", db=db, tenant_id=tenant_id, trigger="BREAK_GLASS_STARTED", summary=sc.summary(canonical))
    return session


def confirm_breakglass(
    db: Session,
    session: BreakGlassSession,
    *,
    responder,
    session_id: str,
    device_fingerprint: str,
    now: Optional[datetime] = None,
) -> tuple[BreakGlassSession, str]:
    """The SECOND person confirms. Issues the read-only capability. Returns (session, token)."""
    if not is_platform_account(responder):
        raise ForbiddenException("only a platform engineer can confirm break-glass")
    if getattr(responder, "id", None) == session.initiator_person_id:
        raise ForbiddenException("break-glass needs two different people: the initiator cannot confirm their own session")
    if session.status != BreakGlassStatus.PENDING_CONFIRMATION.value:
        raise BadRequestException("this break-glass session is not awaiting confirmation")
    now = _now(now)
    if session.confirm_deadline is not None and now > session.confirm_deadline:
        st.transition_breakglass(session, BreakGlassStatus.LAPSED.value, now=now)
        raise BadRequestException("the confirmation window for this break-glass session has closed")

    effective = _breakglass_scope(session.scope)
    ttl = min(int(settings.SUPPORT_BREAKGLASS_MAX_MINUTES), 60)
    jti = uuid.uuid4().hex
    grant = SupportGrant(
        request_id=None,
        tenant_id=session.tenant_id,
        grantee_person_id=getattr(responder, "id", None),
        grantee_account_id=getattr(responder, "id", None),
        kind=GrantKind.BREAK_GLASS.value,
        effective_scope=effective,
        issued_at=now,
        expires_at=now + timedelta(minutes=ttl),
        revocation_version=1,
        session_id=session_id,
        device_fingerprint=device_fingerprint,
        policy_version=policy.POLICY_VERSION,
        token_jti=jti,
    )
    db.add(grant)
    db.flush()
    token = granttokens.issue(
        grant_id=grant.id, grantee_account_id=responder.id, person_id=responder.id, tenant_id=session.tenant_id,
        scope_hash=sc.scope_hash(effective), revocation_version=grant.revocation_version, session_id=session_id,
        device_fingerprint=device_fingerprint, policy_version=policy.POLICY_VERSION, ttl_seconds=ttl * 60, jti=jti,
        now=_epoch(now),
    )
    session.second_responder_person_id = getattr(responder, "id", None)
    session.grant_id = grant.id
    session.expires_at = grant.expires_at
    st.transition_breakglass(session, BreakGlassStatus.ACTIVE.value, now=now)
    events.emit("BREAK_GLASS_CONFIRMED", db=db, tenant_id=session.tenant_id, grant_id=grant.id,
                actor_person_id=getattr(responder, "id", None), expires_at=grant.expires_at.isoformat())
    events.emit("TENANT_NOTIFIED", db=db, tenant_id=session.tenant_id, trigger="BREAK_GLASS_CONFIRMED",
                summary=sc.summary(effective))
    return session, token


def end_breakglass(db: Session, session: BreakGlassSession, *, actor, now: Optional[datetime] = None) -> BreakGlassSession:
    """End an active session: the capability dies with it."""
    if session.status != BreakGlassStatus.ACTIVE.value:
        raise BadRequestException("this break-glass session is not active")
    now = _now(now)
    st.transition_breakglass(session, BreakGlassStatus.ENDED.value, now=now)
    session.ended_by = getattr(actor, "id", None)
    if session.grant_id:
        grant = db.get(SupportGrant, session.grant_id)
        if grant is not None and grant.revoked_at is None:
            revoke_grant(db, grant, actor_id=getattr(actor, "id", None), reason="break-glass ended", now=now)
    events.emit("BREAK_GLASS_ENDED", db=db, tenant_id=session.tenant_id, actor_person_id=getattr(actor, "id", None))
    return session


def expire_breakglass(db: Session, *, now: Optional[datetime] = None, limit: int = 200) -> int:
    """Lapse break-glass sessions a second person never confirmed."""
    now = _now(now)
    rows = (
        db.query(BreakGlassSession)
        .filter(
            BreakGlassSession.status == BreakGlassStatus.PENDING_CONFIRMATION.value,
            BreakGlassSession.confirm_deadline.isnot(None),
            BreakGlassSession.confirm_deadline <= now,
        )
        .limit(limit)
        .all()
    )
    for s in rows:
        st.transition_breakglass(s, BreakGlassStatus.LAPSED.value, now=now)
    return len(rows)


def get_breakglass(db: Session, session_id: str) -> BreakGlassSession:
    row = db.get(BreakGlassSession, session_id)
    if row is None:
        raise NotFoundException("break-glass session not found")
    return row


def breakglass_for_tenant(db: Session, tenant_id: int) -> list[BreakGlassSession]:
    return (
        db.query(BreakGlassSession)
        .filter(BreakGlassSession.tenant_id == tenant_id)
        .order_by(BreakGlassSession.created_at.desc())
        .all()
    )


def active_breakglass(db: Session, *, tenant_id: Optional[int] = None) -> list[BreakGlassSession]:
    q = db.query(BreakGlassSession).filter(BreakGlassSession.status == BreakGlassStatus.ACTIVE.value)
    if tenant_id is not None:
        q = q.filter(BreakGlassSession.tenant_id == tenant_id)
    return q.all()
