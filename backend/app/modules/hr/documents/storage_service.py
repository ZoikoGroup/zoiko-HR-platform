"""Where uploaded document bytes live (ZHR-DOCS-ARCH-001 §8 / security requirement 4). The only module that touches files.

New uploads go through run_prechecks and are written ENCRYPTED (Fernet, a key derived from SECRET_KEY for this purpose
only) under a tenant prefix: keys look like `t12/<random>.pdf.henc`. Legacy rows keep their absolute `file_path` until
scripts/encrypt_hr_documents.py moves them; open_for_read() serves both. Files are only ever served after an authorization
check, inline through the API or through a short-lived signed link (core/privacy/files). There are no public URLs.
"""
import hashlib
import os
import secrets
from dataclasses import dataclass
from typing import Optional

from app.core.crypto import fernet_for
from app.core.exceptions import ZoikoException
from app.modules.doc_templates.storage import LocalDocumentStore
from app.modules.hr.documents.precheck import EMPLOYEE_EXTENSIONS, PrecheckResult, extension_of, run_prechecks

_PURPOSE = b"zoiko-hr-uploaded-document-v1"
ENC_SUFFIX = ".henc"


class UploadRejected(ZoikoException):
    """422 with the failed checks, so the uploader sees exactly what to fix."""

    def __init__(self, result: PrecheckResult):
        failures = result.failures
        message = failures[0].message if failures else "The file was not accepted."
        super().__init__(status_code=422, error_code="DOC_PRECHECK_FAILED", message=message)
        self.checks = [c.as_dict() for c in result.checks]
        self.extra = {"checks": self.checks}


@dataclass
class StoredFile:
    storage_key: str
    sha256: str
    size: int
    mime_type: Optional[str]
    file_name: str
    is_encrypted: bool
    precheck: PrecheckResult


def upload_root() -> str:
    from app.modules.hr import router as hr_router
    return os.path.join(getattr(hr_router, "_DOCUMENT_UPLOAD_DIR", None) or "/tmp/uploads/hr_documents", "store")


_store: Optional[LocalDocumentStore] = None


def get_store() -> LocalDocumentStore:
    global _store
    if _store is None:
        _store = LocalDocumentStore(root=upload_root())
    return _store


def set_store(store: Optional[LocalDocumentStore]) -> None:
    """Tests (and a future object store) swap the implementation here."""
    global _store
    _store = store


def _safe_display_name(filename: str) -> str:
    base = os.path.basename((filename or "").replace("\\", "/")).strip() or "document"
    return base[:255]


def store_upload(organization_id: int, data: bytes, filename: str, *, allowed_extensions=EMPLOYEE_EXTENSIONS) -> StoredFile:
    """Pre-check, encrypt and store. Raises UploadRejected when a blocking check fails (nothing is written)."""
    result = run_prechecks(data, filename, allowed_extensions=allowed_extensions)
    if result.status == "fail":
        raise UploadRejected(result)
    ext = extension_of(filename)
    name = f"{secrets.token_hex(16)}{ext}{ENC_SUFFIX}"
    key = get_store().put(organization_id, name, fernet_for(_PURPOSE).encrypt(data))
    return StoredFile(storage_key=key, sha256=hashlib.sha256(data).hexdigest(), size=len(data), mime_type=result.mime_type,
                      file_name=_safe_display_name(filename), is_encrypted=True, precheck=result)


def read_key(key: str) -> bytes:
    data = get_store().get(key)
    return fernet_for(_PURPOSE).decrypt(data) if str(key).endswith(ENC_SUFFIX) else data


def encrypt_existing(organization_id: int, plain: bytes, original_name: str) -> tuple[str, str]:
    """(storage_key, sha256) for bytes moved from a legacy path (scripts/encrypt_hr_documents.py)."""
    ext = extension_of(original_name) or ".bin"
    name = f"{secrets.token_hex(16)}{ext}{ENC_SUFFIX}"
    key = get_store().put(organization_id, name, fernet_for(_PURPOSE).encrypt(plain))
    return key, hashlib.sha256(plain).hexdigest()


def open_for_read(obj) -> Optional[bytes]:
    """The plain bytes of a document or version (new encrypted store first, then the legacy path). None if missing."""
    key = getattr(obj, "storage_key", None)
    if key:
        try:
            return read_key(key)
        except (OSError, ValueError):
            return None
    from app.core.privacy.files import belongs_to_tenant
    from app.modules.hr.file_storage import resolve_stored_file
    path = resolve_stored_file(getattr(obj, "file_path", None))
    if not path:
        return None
    org = getattr(obj, "organization_id", None)
    if org is not None and not belongs_to_tenant(path, org):
        return None
    with open(path, "rb") as fh:
        return fh.read()
