"""Cancel the work a grant started, the moment the grant dies (ZHR-PRIV-001 F07, Phase 7).

There is no Celery here: exports, downloads and bulk reads run as ordinary requests or APScheduler/thread work. What this
module guarantees is that a revocation does not leave a job running: anything registered against a grant is cancelled
when that grant is revoked, and the count is returned so the caller can record it.

    jobs.register(grant.id, job.cancel)      # when the work starts
    jobs.cancel_for_grant(grant.id)          # from revoke_grant - runs every cancel callback once

A callback is best-effort: one that raises is logged and the rest still run, because a stuck cancel must never stop the
revocation itself.
"""
from __future__ import annotations

import logging
import threading
from typing import Callable, Optional

logger = logging.getLogger("zoiko.privacy.support")

_LOCK = threading.Lock()
_JOBS: dict[str, list[Callable[[], None]]] = {}


def register(grant_id: str, cancel: Callable[[], None]) -> None:
    """Tie a cancellable job to a grant. `cancel` is called (once) when the grant is revoked."""
    with _LOCK:
        _JOBS.setdefault(grant_id, []).append(cancel)


def pending_for_grant(grant_id: str) -> int:
    with _LOCK:
        return len(_JOBS.get(grant_id, ()))


def cancel_for_grant(grant_id: str, reason: Optional[str] = None) -> int:
    """Run every cancel callback for the grant and forget them. Returns how many were cancelled."""
    with _LOCK:
        callbacks = _JOBS.pop(grant_id, [])
    cancelled = 0
    for cancel in callbacks:
        try:
            cancel()
            cancelled += 1
        except Exception:
            logger.warning("a queued support job failed to cancel (grant=%s): %s", grant_id, reason, exc_info=True)
    if cancelled:
        logger.info("support revocation cancelled %d queued job(s) for grant %s", cancelled, grant_id)
    return cancelled


def clear() -> None:
    with _LOCK:
        _JOBS.clear()
