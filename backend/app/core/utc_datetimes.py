"""
utc_datetimes.py
----------------
Platform-wide UTC timestamp normalization for JSON API responses.

The platform stores timestamps as naive UTC (``datetime.utcnow()`` defaults and
Postgres ``func.now()`` on ``TIMESTAMP WITHOUT TIME ZONE`` columns). FastAPI /
Pydantic serialize those as bare ISO strings, e.g. ``"2026-09-24T10:30:00"``, with
no ``Z``/offset. Browsers parse bare ISO strings as *local* time, so every
``new Date(value).toLocaleString()`` in the frontend renders the wrong instant —
the further the browser is from UTC, the worse the drift.

This module normalizes JSON responses at the API boundary: any string value that
is exactly an ISO-8601 timestamp without a timezone designator gets ``Z``
appended, so browsers parse it as UTC and convert to the viewer's local time
correctly. Values that already carry a timezone (``Z`` / ``+hh:mm`` / ``-hh:mm``)
and non-timestamp strings are left untouched.
"""

import json
import re
from typing import Optional

# Matches a full ISO-8601 datetime with NO trailing timezone designator:
#   "2026-09-24T10:30:00" or "2026-09-24T10:30:00.123456"
_NAIVE_ISO_TIMESTAMP = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?$"
)


def _normalize(value):
    if isinstance(value, dict):
        return {k: _normalize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_normalize(v) for v in value]
    if isinstance(value, str) and _NAIVE_ISO_TIMESTAMP.fullmatch(value):
        return value + "Z"
    return value


def append_utc_suffix(body: bytes) -> Optional[bytes]:
    """Return ``body`` with ``Z`` suffix on naive ISO timestamps.

    Returns ``None`` when no transformation was needed so callers can pass the
    original response through untouched (no re-encoding, no header churn).
    """
    if b"T" not in body:
        return None

    try:
        text = body.decode("utf-8")
    except UnicodeDecodeError:
        return None

    try:
        data = json.loads(text)
    except (ValueError, TypeError):
        return None

    if not isinstance(data, (dict, list)):
        return None

    normalized = _normalize(data)
    if normalized == data:
        return None

    # Re-encode with the same separators Starlette's JSONResponse uses so the
    # serialized shape (and downstream content-length) stays consistent.
    return json.dumps(
        normalized,
        ensure_ascii=False,
        allow_nan=False,
        indent=None,
        separators=(",", ":"),
    ).encode("utf-8")