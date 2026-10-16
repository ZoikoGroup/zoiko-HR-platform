"""The per-request check for a temporary support sign-in, called by the privacy middleware for every request whose token
carries a support session (`sls`). It runs before any route, cache or entitlement code, so:

  * a session that ended (expired, ended by the operator, revoked by the tenant) is refused at once, even for a GET the
    response cache could answer;
  * every write is refused: the session is read-only whatever the route would otherwise allow;
  * every request is logged for the tenant's admins to review.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from app.modules.support_login.service import ENDED_MESSAGE, READ_ONLY_MESSAGE

logger = logging.getLogger("zoiko.support_login")

SAFE_METHODS = ("GET", "HEAD", "OPTIONS")
LOGOUT_PATH = "/auth/logout"
# Background polling the app does on its own: not useful in the tenant's "what was viewed" list.
_NOT_LOGGED = ("/auth/me", "/auth/support-session", "/notifications/unread-count")


def _session_factory():
    from app.database import SessionLocal
    return SessionLocal()


def check(session_id, organization_id, method: str, path: str) -> Optional[tuple[int, str, str]]:
    """None when the request may go ahead, else (status, error_code, message). Signing out ends the session and answers
    (200, "LOGGED_OUT", ...)."""
    from app.modules.support_login.models import LoginRequestStatus as S, SupportLoginAccessLog, SupportLoginSession
    from app.modules.support_login.service import _settle

    method = (method or "GET").upper()
    if method == "OPTIONS":
        return None
    db = _session_factory()
    try:
        try:
            sid = int(session_id)
        except (TypeError, ValueError):
            return 401, "SUPPORT_SESSION_ENDED", ENDED_MESSAGE
        session = db.query(SupportLoginSession).filter(SupportLoginSession.id == sid).first()
        if session is None or (organization_id is not None and session.organization_id != organization_id):
            return 401, "SUPPORT_SESSION_ENDED", ENDED_MESSAGE
        now = datetime.utcnow()
        req = session.request
        if req is not None and _settle(req, now):
            db.commit()
        if session.ended_at is not None or now >= session.expires_at or (req is not None and req.status != S.ACTIVE.value):
            return 401, "SUPPORT_SESSION_ENDED", ENDED_MESSAGE

        clean_path = (path or "/")[:500]
        if method not in SAFE_METHODS and clean_path.rstrip("/") == LOGOUT_PATH:
            session.ended_at = now
            session.end_cause = "ended_by_operator"
            session.last_seen_at = now
            if req is not None:
                req.status = S.COMPLETED.value
            db.commit()
            return 200, "LOGGED_OUT", "Logged out successfully."

        blocked = method not in SAFE_METHODS
        session.last_seen_at = now
        session.request_count = (session.request_count or 0) + 1
        if blocked or not any(clean_path.startswith(p) for p in _NOT_LOGGED):
            db.add(SupportLoginAccessLog(
                session_id=session.id, organization_id=session.organization_id, method=method, path=clean_path,
                outcome="blocked_write" if blocked else "allowed", at=now,
            ))
        db.commit()
        if blocked:
            return 403, "SUPPORT_SESSION_READ_ONLY", READ_ONLY_MESSAGE
        return None
    except Exception:
        db.rollback()
        logger.exception("support session check failed")
        return 503, "SUPPORT_SESSION_CHECK_FAILED", "The support session could not be verified. Try again."
    finally:
        db.close()
