"""Seam for support-access events (ZHR-PRIV-001 F01-F06).

Every support-access event (request, approval, grant, access, denial, export, revocation, break-glass) is emitted here.
The event carries NAMES and NON-SENSITIVE metadata only - never a field value, a record payload, a password or a full
bank/medical value. Phase 9 replaces the in-memory tail with the immutable, hash-chained `privacy_audit_events` store;
this module keeps the call sites stable and provides the in-memory tail that tests read.
"""
from __future__ import annotations

import logging

logger = logging.getLogger("zoiko.privacy.audit")

RECENT: list[dict] = []
RECENT_MAX = 2000

# The complete event vocabulary (Phase 9).
EVENT_TYPES = frozenset({
    "GRANT_REQUESTED", "GRANT_SUBMITTED", "APPROVAL_DECIDED", "GRANT_ISSUED", "ACCESS_ALLOWED", "ACCESS_DENIED",
    "EXPORT_REQUESTED", "DOWNLOAD", "GRANT_REVOKED", "GRANT_EXPIRED", "BREAK_GLASS_STARTED", "BREAK_GLASS_CONFIRMED",
    "BREAK_GLASS_ENDED", "KILL_SWITCH", "AUTHORISER_DESIGNATED", "AUTHORISER_REVOKED", "TENANT_NOTIFIED",
    "POLICY_ERROR", "ROLE_CHANGED", "AUDIT_VERIFY_FAILED",
})


def emit(event_type: str, **fields) -> dict:
    """Record one event. The caller (Phase 9 store) is responsible for persistence; this keeps an in-memory tail."""
    event = {"event_type": event_type, **fields}
    RECENT.append(event)
    del RECENT[: max(0, len(RECENT) - RECENT_MAX)]
    logger.info("support-access %s %s", event_type, {k: v for k, v in fields.items() if k != "detail"})
    return event


def recent() -> list[dict]:
    return list(RECENT)


def reset() -> None:
    RECENT.clear()
