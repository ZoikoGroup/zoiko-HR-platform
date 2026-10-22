"""Where generated document bytes live.

`DocumentStore` is the only thing the engine talks to; `LocalDocumentStore` keeps files on disk under HR_GENERATED_DOCS_DIR
(default $UPLOAD_BASE_DIR/generated_documents), filed per tenant (`t<org>/…`, core/privacy/files). An S3/GCS store can replace
it later by implementing the same four methods; callers only ever hold the opaque key the store returns.

The directory MUST be on persistent storage (README "File storage"): a container without a volume loses every generated
document, signature evidence included, on restart.

C3/C4 documents are written encrypted (Fernet, key derived from SECRET_KEY for this purpose only); `get()` decrypts.
"""
from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Optional, Protocol

from app.config import settings
from app.core.crypto import fernet_for
from app.core.privacy.files import tenant_upload_path

_PURPOSE = b"zoiko-hr-generated-document-v1"
_SAFE_NAME = re.compile(r"^[A-Za-z0-9._-]{1,160}$")


class DocumentStore(Protocol):
    def put(self, organization_id: Optional[int], name: str, data: bytes, *, encrypt: bool = False) -> str: ...
    def get(self, key: str) -> bytes: ...
    def exists(self, key: str) -> bool: ...
    def key_tenant(self, key: str) -> Optional[int]: ...


def root_dir() -> str:
    configured = settings.GENERATED_DOCS_DIR or os.environ.get("HR_GENERATED_DOCS_DIR")
    if configured:
        return configured
    return os.path.join(os.environ.get("UPLOAD_BASE_DIR") or "/tmp/uploads", "generated_documents")


class LocalDocumentStore:
    """Keys look like `t12/AB-2026-000001-1a2b3c4d5e6f.pdf` (or `platform/...` for platform governance records)."""

    ENC_SUFFIX = ".enc"

    def __init__(self, root: Optional[str] = None):
        self.root = root or root_dir()

    def put(self, organization_id, name, data, *, encrypt=False):
        if not _SAFE_NAME.match(name):
            raise ValueError("unsafe file name")
        if encrypt:
            data = fernet_for(_PURPOSE).encrypt(data)
            name += self.ENC_SUFFIX
        if organization_id is None:
            folder = os.path.join(self.root, "platform")
            os.makedirs(folder, exist_ok=True)
            path, key = os.path.join(folder, name), f"platform/{name}"
        else:
            path = tenant_upload_path(self.root, organization_id, name)
            key = f"t{int(organization_id)}/{name}"
        tmp = path + ".tmp"
        with open(tmp, "wb") as fh:
            fh.write(data)
        os.replace(tmp, path)
        return key

    def _path(self, key: str) -> str:
        parts = str(key).replace("\\", "/").split("/")
        if len(parts) != 2 or not _SAFE_NAME.match(parts[1]) or not re.match(r"^(t\d+|platform)$", parts[0]):
            raise ValueError("invalid document key")
        return os.path.join(self.root, parts[0], parts[1])

    def exists(self, key):
        try:
            return os.path.isfile(self._path(key))
        except ValueError:
            return False

    def get(self, key):
        with open(self._path(key), "rb") as fh:
            data = fh.read()
        if str(key).endswith(self.ENC_SUFFIX):
            data = fernet_for(_PURPOSE).decrypt(data)
        return data

    def key_tenant(self, key):
        head = str(key or "").split("/")[0]
        return int(head[1:]) if re.match(r"^t\d+$", head) else None

    def absolute_path(self, key: str) -> str:
        """Plain (unencrypted) files only: used to point an hr_documents row at the same bytes."""
        if str(key).endswith(self.ENC_SUFFIX):
            raise ValueError("encrypted files have no servable plain path")
        return str(Path(self._path(key)).resolve())


_store: Optional[DocumentStore] = None


def get_store() -> DocumentStore:
    global _store
    if _store is None:
        _store = LocalDocumentStore()
    return _store


def set_store(store: Optional[DocumentStore]) -> None:
    """Tests (and a future object store) swap the implementation here."""
    global _store
    _store = store


def encrypt_text(text: str) -> str:
    return fernet_for(_PURPOSE).encrypt(text.encode("utf-8")).decode("ascii")


def decrypt_text(token: str) -> str:
    return fernet_for(_PURPOSE).decrypt(token.encode("ascii")).decode("utf-8")
