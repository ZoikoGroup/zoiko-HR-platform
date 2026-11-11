"""Sign in with Google (OpenID Connect, authorization-code flow).

Only people who ALREADY have an account in Zoiko HR can sign in this way: Google proves who they are (a verified e-mail
address), and the account, its organization and its status are checked exactly as for a password sign-in. Nobody is
created from a Google sign-in.

The flow
  1. GET  /auth/google/login     -> sends the browser to Google (state signed + bound to this browser by a cookie)
  2. GET  /auth/google/callback  -> Google returns here with a code; we exchange it, read the verified e-mail, and send the
                                    browser back to the app with a short-lived one-time ticket (never the tokens)
  3. POST /auth/google/exchange  -> the app trades the ticket for the same tokens a password sign-in returns
It works once GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set, and the redirect address
{API_BASE_URL}/auth/google/callback is registered in the Google Cloud console.
"""
import base64
import hashlib
import hmac
import json
import logging
import secrets
import time
from typing import Optional
from urllib.parse import urlencode, urlparse

import httpx

from app.config import settings

logger = logging.getLogger("zoiko.auth.google")

AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"

STATE_TTL_SECONDS = 600
TICKET_TTL_SECONDS = 60
NONCE_COOKIE = "zhr_google_nonce"

# what the browser is told when a sign-in does not work (shown on the login page)
ERRORS = {
    "not_configured": "Sign in with Google is not set up for this site yet. Use your email and password.",
    "cancelled": "Google sign-in was cancelled.",
    "failed": "Google sign-in did not complete. Please try again.",
    "unverified": "Google could not confirm this email address. Use an account whose email is verified.",
    "no_account": "No Zoiko HR account uses this Google email address. Ask your administrator to add you, then try again.",
    "expired": "That sign-in link expired. Please try again.",
}

_used_tickets: dict[str, float] = {}      # ticket id -> expiry; stops a ticket being used twice by this process


def is_configured() -> bool:
    return bool((settings.GOOGLE_CLIENT_ID or "").strip() and (settings.GOOGLE_CLIENT_SECRET or "").strip())


def _is_local(url: str) -> bool:
    host = (urlparse(url or "").hostname or "").lower()
    return host in ("", "localhost", "127.0.0.1", "0.0.0.0") or host.endswith(".local")


def redirect_uri(request=None) -> str:
    """The callback address Google sends the browser back to. It must match, character for character, an authorized redirect
    URI of the OAuth client, and the token exchange must send the same value.

    GOOGLE_REDIRECT_URI wins; then {API_BASE_URL}/auth/google/callback. A1 (QA 10 Nov 2026): production had API_BASE_URL unset,
    so Google was sent http://localhost:8000/auth/google/callback and sign-in could never finish. When the configured base is
    a local address but the request reached a public host, the public address of THIS request is used instead (and logged
    so the configuration gets fixed)."""
    explicit = (settings.GOOGLE_REDIRECT_URI or "").strip()
    if explicit:
        return explicit
    configured = f"{(settings.API_BASE_URL or 'http://localhost:8000').rstrip('/')}/auth/google/callback"
    if request is not None and _is_local(configured):
        here = str(request.url_for("google_callback"))
        if not _is_local(here):
            logger.warning("[google] API_BASE_URL is a local address (%s); using this request's address %s. Set API_BASE_URL "
                           "or GOOGLE_REDIRECT_URI in the server environment.", settings.API_BASE_URL, here)
            return here
    return configured


def _allowed_app_origins() -> set[str]:
    origins = {o.strip().rstrip("/") for o in (settings.CORS_ORIGINS or "").split(",") if o.strip()}
    if settings.FRONTEND_URL:
        origins.add(settings.FRONTEND_URL.strip().rstrip("/"))
    return origins


def app_origin_from(candidate: Optional[str]) -> Optional[str]:
    """The app origin the person started from (scheme://host[:port]), when it is one this API serves (CORS_ORIGINS /
    FRONTEND_URL). Anything else is ignored, so the callback can never be turned into an open redirect."""
    if not candidate:
        return None
    parsed = urlparse(candidate.strip())
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return None
    origin = f"{parsed.scheme}://{parsed.netloc}".lower()
    return origin if origin in {o.lower() for o in _allowed_app_origins()} else None


def _frontend_base(origin: Optional[str] = None) -> str:
    configured = (settings.FRONTEND_URL or "http://localhost:5173").rstrip("/")
    if origin and (_is_local(configured) or origin == configured.lower()):
        return origin
    return configured


def frontend_register_url(origin: Optional[str] = None, **params) -> str:
    base = f"{_frontend_base(origin)}/register"
    return f"{base}?{urlencode(params)}" if params else base


def frontend_login_url(origin: Optional[str] = None, **params) -> str:
    base = f"{_frontend_base(origin)}/login"
    return f"{base}?{urlencode(params)}" if params else base


def origin_in_state(state: Optional[str]) -> Optional[str]:
    """The app origin recorded in a (validly signed, unexpired) state, re-checked against the allow-list."""
    payload = _open("state", state or "")
    return app_origin_from(payload.get("o")) if payload else None


# ── small signed blobs (state and ticket). They are not JWTs on purpose: a ticket must never be usable as an access token.
def _key(purpose: str) -> bytes:
    return hashlib.sha256(f"{settings.SECRET_KEY}:google:{purpose}".encode()).digest()


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(purpose: str, payload: dict) -> str:
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    mac = _b64(hmac.new(_key(purpose), body.encode(), hashlib.sha256).digest())
    return f"{body}.{mac}"


def _open(purpose: str, blob: str) -> Optional[dict]:
    try:
        body, mac = blob.split(".", 1)
        expected = _b64(hmac.new(_key(purpose), body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(mac, expected):
            return None
        payload = json.loads(_unb64(body))
    except Exception:
        return None
    if not isinstance(payload, dict) or payload.get("exp", 0) < time.time():
        return None
    return payload


# ── step 1
def new_nonce() -> str:
    return secrets.token_urlsafe(24)


def authorize_url(nonce: str, request=None, origin: Optional[str] = None) -> str:
    payload = {"n": hashlib.sha256(nonce.encode()).hexdigest(), "exp": time.time() + STATE_TTL_SECONDS}
    if origin:
        payload["o"] = origin
    state = _sign("state", payload)
    return AUTHORIZE_URL + "?" + urlencode({
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri(request),
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "prompt": "select_account",
        "access_type": "online",
    })


# ── step 2
def state_matches_browser(state: str, nonce_cookie: Optional[str]) -> bool:
    payload = _open("state", state or "")
    if not payload or not nonce_cookie:
        return False
    return hmac.compare_digest(payload.get("n", ""), hashlib.sha256(nonce_cookie.encode()).hexdigest())


def verified_profile_for_code(code: str, request=None) -> dict:
    """{"email", "name", "error"}: the verified e-mail (and display name) Google vouches for, or why there isn't one."""
    email, problem, name = _profile_for_code(code, request)
    return {"email": email, "name": name, "error": problem}


def verified_email_for_code(code: str, request=None) -> tuple[Optional[str], Optional[str]]:
    """(email, error_key): the verified e-mail Google vouches for, or why there isn't one."""
    email, problem, _ = _profile_for_code(code, request)
    return email, problem


def _profile_for_code(code: str, request=None) -> tuple[Optional[str], Optional[str], str]:
    try:
        with httpx.Client(timeout=10.0) as client:
            token = client.post(TOKEN_URL, data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": redirect_uri(request),
                "grant_type": "authorization_code",
            })
            if token.status_code != 200:
                # the body names the problem (invalid_grant, redirect_uri_mismatch, invalid_client); it holds no personal data
                logger.warning("[google] token exchange refused: %s %s", token.status_code, token.text[:200])
                return None, "failed", ""
            access = token.json().get("access_token")
            if not access:
                return None, "failed", ""
            info = client.get(USERINFO_URL, headers={"Authorization": f"Bearer {access}"})
            if info.status_code != 200:
                logger.warning("[google] userinfo refused: %s", info.status_code)
                return None, "failed", ""
            profile = info.json()
    except Exception:
        logger.exception("[google] could not reach Google")
        return None, "failed", ""
    email = (profile.get("email") or "").strip().lower()
    verified = profile.get("email_verified")
    name = " ".join(str(profile.get("name") or "").split())[:200]
    if not email or verified not in (True, "true"):
        return None, "unverified", ""
    return email, None, name


SIGNUP_PROOF_TTL_SECONDS = 30 * 60


def make_signup_proof(email: str) -> str:
    """Signed proof that Google confirmed this person controls `email`. It travels with them to the Register page, so the
    organization they create there starts with its address already confirmed."""
    return _sign("signup", {"email": (email or "").strip().lower(), "exp": time.time() + SIGNUP_PROOF_TTL_SECONDS})


def signup_proof_matches(proof: Optional[str], email: str) -> bool:
    payload = _open("signup", proof or "")
    return bool(payload) and hmac.compare_digest(str(payload.get("email", "")), (email or "").strip().lower())


def make_ticket(employee_id: int) -> str:
    return _sign("ticket", {"eid": employee_id, "jti": secrets.token_urlsafe(12), "exp": time.time() + TICKET_TTL_SECONDS})


# ── step 3
def _claim_once(jti: str, expires_at: float) -> bool:
    """True the first time a ticket id is seen. With Redis (HR_REDIS_URL) the claim is shared by every worker and instance,
    so a ticket cannot be replayed on another one (A1); without it, this process remembers it."""
    from app.core.redis_client import get_redis
    client = get_redis()
    if client is not None:
        try:
            ttl = max(int(expires_at - time.time()) + 5, 1)
            return bool(client.set(f"zhr:google:ticket:{jti}", "1", nx=True, ex=ttl))
        except Exception:
            logger.warning("[google] shared ticket store unavailable; using this process's memory")
    now = time.time()
    for old in [j for j, exp in _used_tickets.items() if exp < now]:
        _used_tickets.pop(old, None)
    if jti in _used_tickets:
        return False
    _used_tickets[jti] = expires_at
    return True


def redeem_ticket(ticket: str) -> Optional[int]:
    """The employee id the ticket was made for, once; None when it is forged, expired or already used."""
    payload = _open("ticket", ticket or "")
    if not payload:
        return None
    jti = payload.get("jti")
    if not jti or not _claim_once(jti, payload["exp"]):
        return None
    return payload.get("eid")
