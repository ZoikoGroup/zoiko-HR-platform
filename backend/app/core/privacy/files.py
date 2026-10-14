"""Tenant files (ZHR-PRIV-001 C05, E08).

* New uploads are stored under a tenant prefix (`<root>/t<organization_id>/<random name>`), so a path alone says whose file it is and
  a download can refuse a path that belongs to another tenant.
* A download link can be issued after the normal authorization check: it is short-lived (default 5 minutes, never more), bound to
  one object and one tenant, and signed with a key derived from the server secret. There are no permanent public URLs.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import time
from typing import Optional

from app.config import settings

MAX_TTL_SECONDS = 300
_TENANT_SEGMENT = re.compile(r"^t(\d+)$")


def tenant_upload_path(root: str, organization_id: int, filename: str) -> str:
    """`<root>/t<org>/<filename>`, creating the directory. Refuses a missing organization (fail closed)."""
    if organization_id is None:
        raise ValueError("an upload needs an organization")
    folder = os.path.join(root, f"t{int(organization_id)}")
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, os.path.basename(filename))


def path_tenant(path: str) -> Optional[int]:
    """The tenant a stored path was filed under, or None for files stored before prefixes existed."""
    for seg in str(path or "").replace("\\", "/").split("/"):
        m = _TENANT_SEGMENT.match(seg)
        if m:
            return int(m.group(1))
    return None


def belongs_to_tenant(path: str, organization_id: Optional[int]) -> bool:
    """False only when the path is filed under a DIFFERENT tenant. Older, unprefixed files are still served (their record is
    already looked up by organization), they are just not covered by this extra check."""
    owner = path_tenant(path)
    return owner is None or owner == organization_id


def _key() -> bytes:
    return hashlib.sha256(b"zhr-signed-file-v1" + settings.SECRET_KEY.encode()).digest()


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def sign_download(kind: str, object_id: int, organization_id: int, ttl_seconds: int = MAX_TTL_SECONDS, now: Optional[float] = None) -> str:
    ttl = max(1, min(int(ttl_seconds), MAX_TTL_SECONDS))
    payload = json.dumps({"k": kind, "o": int(object_id), "t": int(organization_id), "e": int((time.time() if now is None else now) + ttl)}, separators=(",", ":")).encode()
    return _b64(payload) + "." + _b64(hmac.new(_key(), payload, hashlib.sha256).digest())


def verify_download(token: str, *, now: Optional[float] = None) -> dict:
    """{'kind','object_id','organization_id'} for a valid, unexpired link; raises ValueError otherwise."""
    try:
        body, sig = token.split(".", 1)
        payload = _unb64(body)
        if not hmac.compare_digest(_unb64(sig), hmac.new(_key(), payload, hashlib.sha256).digest()):
            raise ValueError("bad signature")
        data = json.loads(payload)
        if (time.time() if now is None else now) > data["e"]:
            raise ValueError("expired")
        return {"kind": data["k"], "object_id": data["o"], "organization_id": data["t"]}
    except (ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
        raise ValueError("invalid link") from exc
