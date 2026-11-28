"""
core/rate_limiter.py
--------------------
Shared rate limiter instance for the entire application.
Avoids circular imports by centralizing the limiter.

M1-10:
- Limits are counted per SIGNED-IN USER (the id in the access token), and per client IP only for requests without a
  valid token. Per IP, everyone in an office behind one public address shared a single counter.
- `tenant_key` counts per organization, for limits that protect the organization as a whole (the copilot).
- Counters live in Redis when HR_REDIS_URL is set, so they survive restarts and are shared by every worker. If Redis
  is unreachable the limiter falls back to process memory and never fails the request (in_memory_fallback,
  swallow_errors). Without HR_REDIS_URL it uses process memory, as before.
- Keys are prefixed with the product ("zhr"), so another Zoiko product sharing the Redis has its own counters.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings


def _token_payload(request):
    """The verified access-token payload, or None. Only the signature and claims are checked — no database."""
    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        return None
    try:
        from app.core.security import decode_access_token
        return decode_access_token(auth[7:].strip())
    except Exception:                                  # noqa: BLE001 — a bad token just falls back to the IP
        return None


def _client_ip(request) -> str:
    try:
        from app.core.client_ip import get_client_ip
        return get_client_ip(request) or get_remote_address(request)
    except Exception:                                  # noqa: BLE001
        return get_remote_address(request)


def rate_limit_key(request) -> str:
    """Per signed-in user; per client IP when there is no valid token (sign-in, public pages)."""
    payload = _token_payload(request)
    if payload and payload.get("id") is not None:
        return f"user:{payload['id']}"
    return f"ip:{_client_ip(request)}"


def tenant_key(request) -> str:
    """Per organization, for limits that protect a whole organization; per user/IP for accounts without one."""
    payload = _token_payload(request)
    if payload and payload.get("organization_id"):
        return f"org:{payload['organization_id']}"
    return rate_limit_key(request)


def _storage_options() -> dict:
    if settings.REDIS_URL:
        return {"storage_uri": settings.REDIS_URL, "in_memory_fallback_enabled": True}
    return {"storage_uri": "memory://"}


limiter = Limiter(
    key_func=rate_limit_key,
    default_limits=["200/hour", "60/minute"],
    key_prefix="zhr",
    swallow_errors=True,
    **_storage_options(),
)
