"""Upload pre-checks (ZHR-DOCS-ARCH-001 §14.1).

Checks 1-3 run on every upload and BLOCK a bad file: allowed type and size, contents that match the file's type (magic
bytes, not the browser's label), files that open (no corrupt or password-protected PDFs, images that decode, Office files
without macros), and the virus-scan hook. Checks 4-7 (duplicates, ID-number formats, OCR, expiry sanity) only WARN and are
added in later phases. Pre-checks never approve anything.
"""
import io
import zipfile
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from app.modules.hr.documents.scan import get_scanner

ENGINE_VERSION = "1"
MAX_BYTES = 10 * 1024 * 1024

# Employees may upload these; company documents also accept the wider office set the legacy uploader allowed.
EMPLOYEE_EXTENSIONS = frozenset({".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx", ".xls", ".xlsx"})
COMPANY_EXTENSIONS = EMPLOYEE_EXTENSIONS | frozenset({".csv", ".tsv", ".txt", ".rtf", ".pptx", ".ppt", ".odt", ".ods",
                                                       ".odp", ".gif", ".webp", ".bmp"})
MIME_BY_EXT = {
    ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif",
    ".webp": "image/webp", ".bmp": "image/bmp", ".doc": "application/msword", ".xls": "application/vnd.ms-excel",
    ".ppt": "application/vnd.ms-powerpoint",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".odt": "application/vnd.oasis.opendocument.text", ".ods": "application/vnd.oasis.opendocument.spreadsheet",
    ".odp": "application/vnd.oasis.opendocument.presentation", ".csv": "text/csv", ".tsv": "text/tab-separated-values",
    ".txt": "text/plain", ".rtf": "application/rtf",
}
_OLE = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
_OOXML = (".docx", ".xlsx", ".pptx")
_ODF = (".odt", ".ods", ".odp")
_TEXT = (".csv", ".tsv", ".txt")


@dataclass
class Check:
    code: str
    status: str                  # pass | warn | fail
    message: str
    data: Optional[dict] = None

    def as_dict(self) -> dict:
        out = {"code": self.code, "status": self.status, "message": self.message}
        if self.data:
            out["data"] = self.data
        return out


@dataclass
class PrecheckResult:
    checks: list[Check] = field(default_factory=list)
    scan_status: str = "skipped"
    mime_type: Optional[str] = None

    @property
    def status(self) -> str:
        states = {c.status for c in self.checks}
        return "fail" if "fail" in states else ("warn" if "warn" in states else "pass")

    @property
    def failures(self) -> list[Check]:
        return [c for c in self.checks if c.status == "fail"]

    def as_dict(self) -> dict:
        return {"status": self.status, "checks": [c.as_dict() for c in self.checks],
                "ran_at": datetime.utcnow().isoformat() + "Z", "engine_version": ENGINE_VERSION}


def extension_of(filename: str) -> str:
    name = (filename or "").lower().strip()
    return name[name.rfind("."):] if "." in name else ""


def _sniff(ext: str, data: bytes) -> bool:
    head = data[:16]
    if ext == ".pdf":
        return data[:1024].lstrip().startswith(b"%PDF")
    if ext in (".jpg", ".jpeg"):
        return head.startswith(b"\xff\xd8\xff")
    if ext == ".png":
        return head.startswith(b"\x89PNG\r\n\x1a\n")
    if ext == ".gif":
        return head.startswith((b"GIF87a", b"GIF89a"))
    if ext == ".webp":
        return head[:4] == b"RIFF" and data[8:12] == b"WEBP"
    if ext == ".bmp":
        return head.startswith(b"BM")
    if ext in (".doc", ".xls", ".ppt"):
        return head.startswith(_OLE)
    if ext in _OOXML or ext in _ODF:
        return head.startswith(b"PK\x03\x04")
    if ext == ".rtf":
        return head.startswith(b"{\\rtf")
    if ext in _TEXT:
        return b"\x00" not in data[:8192]
    return False


def _opens(ext: str, data: bytes) -> Optional[str]:
    """None when the file opens; otherwise what is wrong with it (shown to the uploader)."""
    try:
        if ext == ".pdf":
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(data))
            if reader.is_encrypted:
                return "The PDF is password-protected. Upload a copy without a password."
            _ = len(reader.pages)
        elif ext in (".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"):
            from PIL import Image
            with Image.open(io.BytesIO(data)) as img:
                img.verify()
        elif ext in _OOXML or ext in _ODF:
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                names = zf.namelist()
                if zf.testzip() is not None:
                    return "The file is damaged."
                if ext in _OOXML and "[Content_Types].xml" not in names:
                    return "The file is not a valid Office document."
                if any(n.lower().endswith("vbaproject.bin") for n in names):
                    return "Files with macros are not accepted."
    except Exception:
        return "The file is damaged or could not be opened."
    return None


def run_prechecks(data: bytes, filename: str, *, allowed_extensions=EMPLOYEE_EXTENSIONS) -> PrecheckResult:
    result = PrecheckResult()
    ext = extension_of(filename)
    if ext not in allowed_extensions:
        allowed = ", ".join(sorted(e.lstrip(".").upper() for e in allowed_extensions))
        result.checks.append(Check("type", "fail", f"This file type is not accepted. Allowed: {allowed}."))
        return result
    result.mime_type = MIME_BY_EXT.get(ext)
    if not data:
        result.checks.append(Check("size", "fail", "The file is empty."))
        return result
    if len(data) > MAX_BYTES:
        result.checks.append(Check("size", "fail", f"The file is larger than {MAX_BYTES // (1024 * 1024)} MB."))
        return result
    result.checks.append(Check("type", "pass", "File type accepted."))
    if not _sniff(ext, data):
        result.checks.append(Check("content", "fail", "The file's contents do not match its type."))
        return result
    problem = _opens(ext, data)
    if problem:
        result.checks.append(Check("integrity", "fail", problem))
        return result
    result.checks.append(Check("integrity", "pass", "The file opens."))
    scan = get_scanner().scan(data, filename)
    result.scan_status = scan.status
    if scan.status == "infected":
        result.checks.append(Check("virus", "fail", "The file was flagged by the virus scanner.", {"signature": scan.signature}))
    elif scan.status == "error":
        result.checks.append(Check("virus", "warn", "The virus scanner could not check this file."))
    elif scan.status == "clean":
        result.checks.append(Check("virus", "pass", "No threats found."))
    return result


# ── context checks (4, 5, 7): need the database and the upload's metadata; they only ever WARN ────────────────────

def add_context_checks(result: PrecheckResult, db, *, organization_id: int, employee_id, sha256: str, category,
                       id_number=None, expiry_date=None, exclude_document_id=None, today=None) -> PrecheckResult:
    from datetime import date as _date, timedelta as _td
    from app.modules.hr.documents import id_validators
    from app.modules.hr.models import HrDocument, HrDocumentVersion

    # 4. the same file again (by content hash)
    rows = (db.query(HrDocumentVersion.version, HrDocument.id, HrDocument.employee_id)
            .join(HrDocument, HrDocument.id == HrDocumentVersion.document_id)
            .filter(HrDocumentVersion.sha256 == sha256, HrDocument.organization_id == organization_id,
                    HrDocument.is_deleted.is_(False))
            .all())
    same_person = [r for r in rows if r.employee_id == employee_id]
    other_people = [r for r in rows if r.employee_id not in (None, employee_id)]
    if same_person:
        result.checks.append(Check("duplicate", "warn", f"This is the same file as an earlier upload (version {same_person[0].version}).",
                                   {"document_id": same_person[0].id}))
    if other_people:
        result.checks.append(Check("duplicate_other_person", "warn",
                                   "The same file was uploaded for another employee. Check it is really this person's document."))

    # 5. identity-number format, when the category asks for one (jurisdiction registry)
    key = getattr(category, "id_number_field", None)
    if key and id_number:
        problem = id_validators.validate(key, id_number)
        masked = id_validators.mask(id_number)
        if problem:
            result.checks.append(Check("id_number", "warn", problem, {"number": masked}))
        else:
            result.checks.append(Check("id_number", "pass", "The number's format looks right.", {"number": masked}))

    # 7. expiry sanity
    today = today or _date.today()
    if expiry_date is not None and expiry_date <= today + _td(days=30):
        result.checks.append(Check("expiry_soon", "warn", f"This document expires on {expiry_date:%d %b %Y}, within 30 days."))
    return result
