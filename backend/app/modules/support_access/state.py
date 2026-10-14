"""The request/grant state machine (ZHR-PRIV-001 section 02, B08).

Status is not a free variable. Every change goes through `transition()`, which refuses a jump the lifecycle does not
allow. A test scans the codebase and fails on any direct status assignment outside this module, so a handler cannot
quietly move a request to APPROVED.

    DRAFT ─submit─▶ PENDING_TENANT ─┬─(standard)────────────────────▶ APPROVED ─activate─▶ ACTIVE ─▶ CLOSED
                                    └─(high risk)─▶ PENDING_INDEPENDENT ─▶ APPROVED
    any non-terminal ─▶ REJECTED | CANCELLED | EXPIRED ;  ACTIVE ─▶ REVOKED | EXPIRED
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from app.modules.support_access.models import (
    BreakGlassStatus,
    RequestStatus,
    SupportAccessRequest,
)

S = RequestStatus

# status -> the statuses it may move to
ALLOWED: dict[str, frozenset[str]] = {
    S.DRAFT.value: frozenset({S.PENDING_TENANT.value, S.CANCELLED.value}),
    S.PENDING_TENANT.value: frozenset(
        {S.PENDING_INDEPENDENT.value, S.APPROVED.value, S.REJECTED.value, S.CANCELLED.value, S.EXPIRED.value}
    ),
    S.PENDING_INDEPENDENT.value: frozenset(
        {S.APPROVED.value, S.REJECTED.value, S.CANCELLED.value, S.EXPIRED.value}
    ),
    S.APPROVED.value: frozenset({S.ACTIVE.value, S.CANCELLED.value, S.EXPIRED.value}),
    S.ACTIVE.value: frozenset({S.CLOSED.value, S.EXPIRED.value, S.REVOKED.value}),
    S.CLOSED.value: frozenset(),
    S.EXPIRED.value: frozenset(),
    S.REVOKED.value: frozenset(),
    S.REJECTED.value: frozenset(),
    S.CANCELLED.value: frozenset(),
}

TERMINAL = frozenset({S.CLOSED.value, S.EXPIRED.value, S.REVOKED.value, S.REJECTED.value, S.CANCELLED.value})

# Which statuses still block a fresh request from the same engineer for the same tenant (one at a time).
OPEN_STATUSES = frozenset({S.DRAFT.value, S.PENDING_TENANT.value, S.PENDING_INDEPENDENT.value, S.APPROVED.value, S.ACTIVE.value})

BREAKGLASS_ALLOWED: dict[str, frozenset[str]] = {
    BreakGlassStatus.PENDING_CONFIRMATION.value: frozenset(
        {BreakGlassStatus.ACTIVE.value, BreakGlassStatus.LAPSED.value, BreakGlassStatus.ENDED.value}
    ),
    BreakGlassStatus.ACTIVE.value: frozenset({BreakGlassStatus.ENDED.value}),
    BreakGlassStatus.ENDED.value: frozenset(),
    BreakGlassStatus.LAPSED.value: frozenset(),
}


class TransitionError(RuntimeError):
    """An illegal lifecycle move. Carries no data, only the two status names."""


def can_transition(current: str, target: str) -> bool:
    return target in ALLOWED.get(current, frozenset())


def can_transition_breakglass(current: str, target: str) -> bool:
    return target in BREAKGLASS_ALLOWED.get(current, frozenset())


def transition_breakglass(session, target: str, *, now: Optional[datetime] = None):
    """Move a break-glass session to `target`, refusing an illegal jump. The caller commits.

    Like `transition`, this is the only place a break-glass status is written; the codebase scan excludes this module.
    """
    current = session.status
    if current == target:
        return session
    if not can_transition_breakglass(current, target):
        raise TransitionError(f"break-glass {current} -> {target} is not allowed")
    now = now or datetime.utcnow()
    if target == BreakGlassStatus.ACTIVE.value and session.started_at is None:
        session.started_at = now
    if target in (BreakGlassStatus.ENDED.value, BreakGlassStatus.LAPSED.value):
        session.ended_at = now
    session.status = target                                       # the one authorised break-glass write
    return session


def _stamp(request: SupportAccessRequest, target: str, now: datetime) -> None:
    request.updated_at = now
    if target == S.PENDING_TENANT.value and request.submitted_at is None:
        request.submitted_at = now
    if target in TERMINAL:
        request.closed_at = now


def transition(
    request: SupportAccessRequest,
    target: str,
    *,
    reason: Optional[str] = None,
    now: Optional[datetime] = None,
) -> SupportAccessRequest:
    """Move a request to `target`, refusing an illegal jump. The caller commits."""
    current = request.status
    if current == target:
        return request
    if not can_transition(current, target):
        raise TransitionError(f"{current} -> {target} is not allowed")
    now = now or datetime.utcnow()
    if target in (S.REJECTED.value, S.CANCELLED.value, S.REVOKED.value, S.EXPIRED.value):
        request.close_reason = reason or target
    _stamp(request, target, now)
    request.status = target                                        # the one and only authorised write
    return request


def is_terminal(status: str) -> bool:
    return status in TERMINAL


def is_open(status: str) -> bool:
    return status in OPEN_STATUSES


def approval_window_end(now: datetime, hours: int) -> datetime:
    return now + timedelta(hours=hours)
