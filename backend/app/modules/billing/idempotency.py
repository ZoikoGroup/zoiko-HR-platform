"""
modules/billing/idempotency.py
-------------------------------
Reusable idempotency dependency/decorator for mutating billing endpoints.

Accepts an `Idempotency-Key` header on every mutating billing endpoint.
Stores (idempotency_key, org_id, endpoint) → result in
billing_idempotency_keys table. On duplicate key:
  - Same request body → replay stored result (200 with original body)
  - Different request body → 409 Conflict (not a silent replay)

Usage as a FastAPI dependency:

    @router.post("/billing/checkout-session")
    def create_checkout_session(
        ...
        idempotency_record: dict = Depends(require_idempotency("checkout-session")),
    ):
        ...

Or as a decorator wrapper (same behavior):

    result = execute_idempotent(db, key, org_id, endpoint, body, handler_fn)
"""

import hashlib
import json
import logging

from fastapi import Header, HTTPException
from sqlalchemy.orm import Session

from app.modules.billing.models import BillingIdempotencyKey

logger = logging.getLogger("zoiko.billing.idempotency")

_MISSING_KEY_MSG = "Idempotency-Key header is required for this endpoint."


def _hash_body(body: dict | None) -> str:
    """SHA-256 hash of the JSON-serialized request body for comparison."""
    raw = json.dumps(body, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def execute_idempotent(
    db: Session,
    idempotency_key: str,
    org_id: int,
    endpoint: str,
    request_body: dict | None,
    handler_fn,
):
    """Execute `handler_fn` inside an idempotency guard.

    If the same (key, org_id, endpoint) already exists:
      - same body hash → return stored result
      - different body hash → raise 409

    Returns (result_dict, status_code, is_replay).
    """
    body_hash = _hash_body(request_body)

    existing = (
        db.query(BillingIdempotencyKey)
        .filter(
            BillingIdempotencyKey.idempotency_key == idempotency_key,
            BillingIdempotencyKey.organization_id == org_id,
            BillingIdempotencyKey.endpoint == endpoint,
        )
        .first()
    )

    if existing:
        if existing.request_body_hash != body_hash:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Idempotency key '{idempotency_key}' was already used with a "
                    "different request body. Use a new key or retry with the same body."
                ),
            )
        # Replay: return stored result
        logger.info(
            "[idempotency] Replay key=%s endpoint=%s org=%d — returning stored result",
            idempotency_key, endpoint, org_id,
        )
        return existing.result_body, existing.result_status_code, True

    # First execution: run handler, store result
    result = handler_fn()
    if isinstance(result, tuple):
        result_body, status_code = result
    elif isinstance(result, dict):
        result_body, status_code = result, 200
    else:
        result_body, status_code = {"result": result}, 200

    record = BillingIdempotencyKey(
        idempotency_key=idempotency_key,
        organization_id=org_id,
        endpoint=endpoint,
        request_body_hash=body_hash,
        result_status_code=status_code,
        result_body=result_body,
    )
    db.add(record)
    db.commit()
    logger.info(
        "[idempotency] Stored key=%s endpoint=%s org=%d status=%d",
        idempotency_key, endpoint, org_id, status_code,
    )
    return result_body, status_code, False


def require_idempotency_key(
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
) -> str:
    """FastAPI dependency that extracts the Idempotency-Key header."""
    return idempotency_key
