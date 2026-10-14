"""Signed, session-bound support capability tokens (ZHR-PRIV-001 B06, B07, D05).

A support grant is delivered as a signed token (JWT) attached to the grantee's platform session only - an HttpOnly,
Secure, SameSite=Strict cookie. It is never rendered in the UI, never placed in a URL, and is useless outside the exact
session and device it was issued for.

Claims:
    jti   unique token id                grant_id  the grant row
    sub   grantee account id             person    the human behind the account
    tenant the single tenant it is for   aud       always "zoiko-hr-support" (no cross-product reuse)
    scope_hash sha-256 of the effective scope   iat/exp  validity window
    rv    revocation_version at issue    sid       bound session id      dev  bound device fingerprint
    pv    policy version at issue

The signing key comes from HR_SUPPORT_GRANT_SIGNING_KEY; with nothing configured it falls back to a value derived from
SECRET_KEY so dev/test work, and production is expected to set (and rotate) a dedicated key. An asymmetric PEM placed
in that setting switches the algorithm to RS256 automatically.
"""
from __future__ import annotations

import hashlib
import time
from typing import Optional

from jose import JWTError, jwt

from app.config import settings

AUDIENCE = "zoiko-hr-support"
ALG_HS = "HS256"
ALG_RS = "RS256"
_DEFAULT_MAX_AGE = 120 * 60


class GrantTokenError(Exception):
    """The capability token is not acceptable. The message is for logs; clients only ever get a refusal."""


def _signing_key() -> str:
    configured = getattr(settings, "SUPPORT_GRANT_SIGNING_KEY", "") or ""
    if configured:
        return configured
    return hashlib.sha256(("support-grant:" + settings.SECRET_KEY).encode()).hexdigest()


def _algorithm(key: str) -> str:
    return ALG_RS if "BEGIN" in key and "PRIVATE KEY" in key else ALG_HS


def issue(*, grant_id: str, grantee_account_id: int, person_id: int, tenant_id: int, scope_hash: str,
          revocation_version: int, session_id: str, device_fingerprint: str, policy_version: str,
          ttl_seconds: int, jti: str, now: Optional[float] = None) -> str:
    now = now if now is not None else time.time()
    key = _signing_key()
    claims = {
        "jti": jti, "grant_id": grant_id, "sub": str(grantee_account_id), "person": person_id,
        "tenant": tenant_id, "aud": AUDIENCE, "scope_hash": scope_hash, "iat": int(now),
        "exp": int(now + ttl_seconds), "rv": revocation_version, "sid": session_id, "dev": device_fingerprint,
        "pv": policy_version,
    }
    return jwt.encode(claims, key, algorithm=_algorithm(key))


def verify(token: str, *, now: Optional[float] = None) -> dict:
    """Verify signature, audience and expiry. Raises GrantTokenError on anything else."""
    if not token:
        raise GrantTokenError("no token")
    key = _signing_key()
    try:
        claims = jwt.decode(
            token, key, algorithms=[_algorithm(key)], audience=AUDIENCE,
            options={"verify_aud": True, "require_exp": True, "require_iat": True},
        )
    except JWTError as exc:                                   # bad signature, wrong audience, expired, malformed
        raise GrantTokenError(str(exc))
    if now is not None and int(claims.get("exp", 0)) <= int(now):
        raise GrantTokenError("expired")
    if int(claims.get("exp", 0)) - int(claims.get("iat", 0)) > _DEFAULT_MAX_AGE:
        raise GrantTokenError("token validity longer than the hard maximum")
    return claims
