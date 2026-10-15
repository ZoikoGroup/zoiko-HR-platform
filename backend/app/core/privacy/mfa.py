"""Second factor for platform accounts (ZHR-PRIV-001 B02, B06, B07 foundation).

TOTP (RFC 6238, via pyotp) is the factor shipped here. It is NOT phishing-resistant: the control standard prefers WebAuthn /
passkeys, which needs a maintained WebAuthn library and a browser ceremony that is not part of this change. This module is shaped
so a WebAuthn factor can be added next to it: a factor only has to answer "is this person present, now" and stamp `mfa_at`.

* The secret is stored encrypted (core.crypto), never in clear, and never returned after enrolment.
* A code can be used once (the last accepted time step is stored), and only within one step either side of now.
* A successful check puts `mfa_at` (epoch seconds) in the access token, and `require_fresh_mfa(max_age)` reads it, so a sensitive
  action can demand a check made a moment ago, not just somewhere in the session.
"""
from __future__ import annotations

import time
from typing import Optional

import pyotp
from fastapi import Depends, Request

from app.config import settings
from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.exceptions import ZoikoException

ISSUER = "Zoiko HR"
STEP = 30
MFA_REQUIRED_CODE = "MFA_REQUIRED"
MFA_ENROLLMENT_REQUIRED_CODE = "MFA_ENROLLMENT_REQUIRED"
MFA_INVALID_CODE = "MFA_INVALID"
MFA_STALE_CODE = "MFA_STEP_UP_REQUIRED"


def is_platform(employee) -> bool:
    return getattr(getattr(employee, "role", None), "value", getattr(employee, "role", None)) == "super_admin"


def new_secret() -> str:
    return pyotp.random_base32()


def provisioning_uri(email: str, secret: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=ISSUER)


def begin_enrollment(employee) -> dict:
    """A fresh secret, stored encrypted and NOT yet active (mfa_enabled stays false until a code proves the app has it)."""
    secret = new_secret()
    employee.mfa_secret = encrypt_secret(secret)
    employee.mfa_enabled = False
    employee.mfa_last_step = None
    return {"secret": secret, "otpauth_uri": provisioning_uri(employee.email, secret)}


def verify_code(employee, code: Optional[str], *, now: Optional[float] = None, consume: bool = True) -> bool:
    """True once for a correct current code. Replays and out-of-window codes fail."""
    code = "".join(ch for ch in str(code or "") if ch.isdigit())
    if len(code) != 6 or not employee.mfa_secret:
        return False
    secret = decrypt_secret(employee.mfa_secret)
    if not secret:
        return False
    now = time.time() if now is None else now
    totp = pyotp.TOTP(secret, interval=STEP)
    step = int(now // STEP)
    for candidate in (step - 1, step, step + 1):
        if candidate <= (employee.mfa_last_step or 0):
            continue                                                       # already used (or older than one already used)
        if totp.at(candidate * STEP) == code:
            if consume:
                employee.mfa_last_step = candidate
            return True
    return False


def gate_platform_sign_in(employee, code: Optional[str]) -> Optional[int]:
    """Decide whether a platform account may finish signing in. Returns the `mfa_at` to stamp on the token (None when no factor was
    checked because none is required and none is enrolled). Raises ZoikoException when a factor is needed and missing or wrong."""
    if employee.mfa_enabled:
        if not code:
            raise ZoikoException(401, MFA_REQUIRED_CODE, "Enter the 6-digit code from your authenticator app.")
        if not verify_code(employee, code):
            raise ZoikoException(401, MFA_INVALID_CODE, "That code is not valid. Check the code and try again.")
        employee.mfa_enrolled_at = employee.mfa_enrolled_at or _now()
        return int(time.time())
    if settings.PLATFORM_MFA_REQUIRED:
        raise ZoikoException(403, MFA_ENROLLMENT_REQUIRED_CODE,
                             "Platform accounts need a second factor. Set up your authenticator app to finish signing in.")
    return None


def _now():
    from datetime import datetime
    return datetime.utcnow()


def require_fresh_mfa(max_age_seconds: int = 300):
    """A FastAPI dependency factory: the caller's access token must carry an MFA check made within `max_age_seconds`.

        @router.post("/grants/{id}/approve", dependencies=[Depends(require_fresh_mfa(300))])

    Prompt 2 uses it for support-grant requests and approvals and for break-glass. The answer for a stale or missing check is a 403
    with a code the client turns into a "confirm with your authenticator" prompt."""
    from app.core.security import decode_access_token

    def _dep(request: Request):
        if not settings.SUPPORT_ACCESS_MFA_REQUIRED:
            return 0                                                     # dev escape hatch: no fresh factor demanded
        header = request.headers.get("authorization", "")
        payload = decode_access_token(header[7:].strip()) if header.lower().startswith("bearer ") else None
        at = int((payload or {}).get("mfa_at") or 0)
        if not at or time.time() - at > max_age_seconds:
            raise ZoikoException(403, MFA_STALE_CODE, "Confirm it is you: enter a fresh code from your authenticator app.")
        return at

    return _dep
