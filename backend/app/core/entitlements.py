"""
core/entitlements.py
--------------------
FastAPI dependency for server-authoritative entitlement enforcement.

Usage:
    @router.post("/some-endpoint", dependencies=[Depends(require_entitlement("hr.some.feature"))])
    def some_endpoint(...): ...

The dependency calls check_entitlement() and:
  - Returns normally if ENTITLED_AVAILABLE
  - Returns normally for READ_ONLY on a GET/HEAD request (Section 14.1: a
    read-only feature may still be viewed, only mutation is blocked) — same
    method-based read/write distinction entitlement_middleware.py already
    uses for its 129 mapped routes; check_entitlement() itself has no
    `action` parameter (unlike the spec's illustrative contract in Section 15),
    so both enforcement layers infer read-vs-write from the HTTP method
    instead of a caller-supplied flag. Kept consistent between the two
    rather than adding a second, divergent mechanism.
  - Raises 403 with {"entitlement_state": ..., "feature_key": ...} for every
    other case (including a mutating request under READ_ONLY)

This allows the frontend to render the correct message per state:
  - NOT_ENTITLED → upgrade CTA
  - ENTITLED_NOT_CONFIGURED → "contact support, not configured yet"
  - DEPENDENCY_UNAVAILABLE → "contact support, prerequisite missing"
  - ENTITLED_POLICY_BLOCKED → "disabled by your admin"
"""

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.modules.billing.entitlement_service import (
    check_entitlement,
    ENTITLED_AVAILABLE,
    READ_ONLY,
)
from app.modules.hr.models import Employee

_READ_METHODS = frozenset({"GET", "HEAD"})


def require_entitlement(feature_key: str):
    """Return a FastAPI dependency that enforces entitlement for feature_key."""

    async def _enforce(
        request: Request,
        current_user: Employee = Depends(
            __import__("app.core.dependencies", fromlist=["get_current_user"]).get_current_user
        ),
        db: Session = Depends(get_db),
    ):
        organization_id = current_user.organization_id
        if organization_id is None:
            raise HTTPException(
                status_code=403,
                detail={
                    "entitlement_state": "NOT_ENTITLED",
                    "feature_key": feature_key,
                },
            )

        result = check_entitlement(db, organization_id, feature_key)
        state = result["state"]

        if state == ENTITLED_AVAILABLE:
            return current_user

        if state == READ_ONLY and request.method.upper() in _READ_METHODS:
            return current_user

        raise HTTPException(
            status_code=403,
            detail={
                "entitlement_state": state,
                "feature_key": feature_key,
            },
        )

    return _enforce
