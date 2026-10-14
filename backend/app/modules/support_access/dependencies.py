"""Enforcement dependencies for support grants (ZHR-PRIV-001 B06, B07, B12, D05; Phase 6).

The cookie carries the signed capability. Every check the standard names runs here, in order, before any handler sees a
row: signature/audience/expiry, the live grant row, the revocation version, the policy version, the grantee, the bound
session and device, and fresh MFA. Only then is a PLATFORM subject built with the grant attached, so `policy` decides the
SCOPE. Anything missing is a refusal - a support route never runs without a live, matching grant.
"""
from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass, replace
from datetime import datetime
from typing import Optional

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.config import settings
from app.core.dependencies import get_current_user
from app.core.privacy import policy
from app.core.security import decode_access_token
from app.database import get_db
from app.modules.support_access import cache, granttokens, service
from app.modules.support_access.models import SupportGrant

SUPPORT_COOKIE = "zhr_support_grant"
# The capability cookie is only ever sent to the enforcement path.
SUPPORT_COOKIE_PATH = "/support"


class SupportAccessRefused(HTTPException):
    def __init__(self, detail: str = "No usable support grant", status_code: int = 403):
        super().__init__(status_code=status_code, detail=detail)


def access_payload(request: Request) -> Optional[dict]:
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return decode_access_token(header[7:].strip())
    return None


def session_fingerprint(payload: Optional[dict], user) -> str:
    """A stable id for 'this sign-in': the account plus the token's issue time."""
    raw = f"{getattr(user, 'id', '')}:{getattr(user, 'organization_id', '')}:{(payload or {}).get('iat', 0)}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def device_fingerprint(request: Request) -> str:
    raw = "|".join([request.headers.get("user-agent", ""), request.headers.get("accept-language", "")])
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def cookie_token(request: Request) -> Optional[str]:
    return request.cookies.get(SUPPORT_COOKIE)


@dataclass
class GrantContext:
    grant: SupportGrant
    claims: dict
    user: object
    mfa_at: int
    session_id: str

    def subject(self) -> policy.Subject:
        base = policy.subject_for_user(self.user, session_id=self.session_id, mfa_verified_at=float(self.mfa_at))
        return replace(base, grant=service.grant_capability(self.grant))

    @property
    def tenant_id(self) -> int:
        return self.grant.tenant_id


def grant_context(
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
) -> GrantContext:
    """The FastAPI dependency every support data route depends on."""
    token = cookie_token(request)
    if not token:
        raise SupportAccessRefused("No active support grant in this session")
    try:
        claims = granttokens.verify(token)
    except granttokens.GrantTokenError:
        raise SupportAccessRefused("The support capability is not valid")

    if not service.is_platform_account(user):
        raise SupportAccessRefused("A support grant is usable only by a platform account")

    grant = db.get(SupportGrant, claims.get("grant_id"))
    if grant is None:
        raise SupportAccessRefused("The support grant no longer exists")

    if cache.get(grant.id) is cache.REVOKED:
        raise SupportAccessRefused("The support grant has been revoked")
    if grant.revoked_at is not None:
        raise SupportAccessRefused("The support grant has been revoked")
    if int(grant.revocation_version or 1) != int(claims.get("rv") or 0):
        raise SupportAccessRefused("The support grant has been superseded")
    if grant.expires_at <= datetime.utcnow():
        raise SupportAccessRefused("The support grant has expired")
    if grant.policy_version != policy.POLICY_VERSION:
        raise SupportAccessRefused("The authorisation policy changed; the grant is no longer valid")

    if grant.grantee_person_id != getattr(user, "id", None):
        raise SupportAccessRefused("This grant belongs to another person")
    if str(grant.grantee_account_id) != str(claims.get("sub")):
        raise SupportAccessRefused("This grant belongs to another account")
    if claims.get("sid") != grant.session_id:
        raise SupportAccessRefused("This grant was issued to a different session")
    if claims.get("dev") != grant.device_fingerprint:
        raise SupportAccessRefused("This grant was issued to a different device")
    if not getattr(user, "is_active", True):
        raise SupportAccessRefused("Your account is no longer active")

    payload = access_payload(request)
    at = int((payload or {}).get("mfa_at") or 0)
    if not at or time.time() - at > settings.SUPPORT_GRANT_MFA_MAX_AGE_SECONDS:
        raise SupportAccessRefused("Confirm it is you: your sign-in check is no longer fresh enough")

    grant.last_access_at = datetime.utcnow()
    sid = session_fingerprint(payload, user)
    return GrantContext(grant=grant, claims=claims, user=user, mfa_at=at, session_id=sid)
