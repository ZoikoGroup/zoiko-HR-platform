"""Audience- and scope-bound tokens between Zoiko products (ZHR-PRIV-001 D05).

A token minted for ZoikoTime, Payroll, Docs Pro, ZoikoID or Zoiko One is NOT a Zoiko HR token, even when the products share a
signing key: Zoiko HR accepts only tokens whose audience is `zoiko-hr` and whose scopes cover the request. A platform role or a
support grant in one product never carries over to another, because nothing here reads a role from a service token at all.

Service token claims: aud (must be zoiko-hr), typ = "service", sub = "svc:<product>", tenants (list of organization ids),
scope (list of "<resource>:<action>"), exp.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional

from jose import JWTError, jwt

from app.config import settings
from app.core.privacy.context import SERVICE
from app.core.privacy.policy import Context, Subject

HR_AUDIENCE = "zoiko-hr"


class ServiceTokenError(Exception):
    """The token is not acceptable. The message is for logs; clients just get a refusal."""


def issue_service_token(product: str, tenants: Iterable[int], scopes: Iterable[str], ttl_minutes: int = 15, audience: str = HR_AUDIENCE) -> str:
    claims = {
        "aud": audience, "typ": "service", "sub": f"svc:{product}", "tenants": sorted(set(int(t) for t in tenants)),
        "scope": sorted(set(scopes)), "iat": int(datetime.now(timezone.utc).timestamp()),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes),
    }
    return jwt.encode(claims, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def verify_service_token(token: str, *, resource: Optional[str] = None, action: Optional[str] = None) -> Subject:
    """The SERVICE Subject for a valid Zoiko HR service token. Raises ServiceTokenError for anything else."""
    try:
        claims = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM], options={"verify_aud": False})
    except JWTError as exc:
        raise ServiceTokenError("invalid token") from exc
    aud = claims.get("aud")
    auds = aud if isinstance(aud, list) else [aud]
    if auds != [HR_AUDIENCE]:
        raise ServiceTokenError("wrong audience")                      # a ZoikoTime / Payroll / Docs Pro token, or none at all
    if claims.get("typ") != "service" or not str(claims.get("sub", "")).startswith("svc:"):
        raise ServiceTokenError("not a service token")                  # a human access token is never a service token
    if "role" in claims:
        raise ServiceTokenError("a service token carries no role")      # roles never propagate between products
    scopes = frozenset(claims.get("scope") or [])
    tenants = frozenset(int(t) for t in (claims.get("tenants") or []))
    if not tenants or not scopes:
        raise ServiceTokenError("no tenant or scope")
    if resource and action and f"{resource}:{action}" not in scopes:
        raise ServiceTokenError("scope does not cover the request")
    return Subject(actor_id=None, plane=SERVICE, tenant_ids=tenants, service_scopes=scopes)


def service_context() -> Context:
    return Context(source="integration", token_audience=HR_AUDIENCE)


def reject_foreign_audience(payload: Optional[dict]) -> Optional[dict]:
    """Used by human-token decoding: a token that names another product as its audience is not valid here (None); a token with no
    audience (every token issued before audiences existed) is still accepted, so nobody is signed out by this."""
    if payload is None:
        return None
    aud = payload.get("aud")
    if aud is None:
        return payload
    auds = aud if isinstance(aud, list) else [aud]
    return payload if auds == [HR_AUDIENCE] else None
