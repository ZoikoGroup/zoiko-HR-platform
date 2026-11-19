"""Security checks for company documents uploaded to "Set up docs for your organisation" and the Word template import.

* The real type comes from the content (magic bytes), never the extension: PDF, DOCX or plain UTF-8 text only.
* Refused: archives other than a DOCX, executables, macro-enabled Word files (.docm, vbaProject.bin), password-protected or
  encrypted PDFs and DOCX files, files over the size limit, DOCX zip bombs (total uncompressed size and member count).
* Malware scan with ClamAV (clamd INSTREAM) when CLAMAV_HOST is set. Without a scanner a file is marked clean only outside
  production; in production uploads are refused with a message for the admin.
"""
from __future__ import annotations

import io
import os
import socket
import struct
import zipfile
from dataclasses import dataclass
from typing import Optional

from fastapi import HTTPException

MAX_DOCX_UNCOMPRESSED = 100 * 1024 * 1024
MAX_DOCX_MEMBERS = 2000
MAX_RATIO = 1000                       # uncompressed / compressed, per member (zip bomb guard; Word XML compresses well)
DOCX_MAIN = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
DOTX_MAIN = "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml"
MACRO_MAIN = "application/vnd.ms-word.document.macroEnabled.main+xml"
TEXT_LIKE_LIMIT = 5 * 1024 * 1024
OLE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"     # old .doc, and every encrypted Office file (EncryptedPackage)
EXEC_MAGIC = (b"MZ", b"\x7fELF", b"\xca\xfe\xba\xbe", b"\xcf\xfa\xed\xfe", b"\xfe\xed\xfa", b"#!")
ARCHIVE_MAGIC = (b"Rar!", b"7z\xbc\xaf", b"\x1f\x8b", b"BZh", b"\xfd7zXZ")


@dataclass
class Checked:
    kind: str                          # pdf | docx | txt
    media_type: str
    page_count: Optional[int] = None


def _reject(message: str) -> HTTPException:
    return HTTPException(422, {"code": "FILE_REJECTED", "message": message})


def sniff(data: bytes, filename: str = "") -> str:
    """pdf | docx | txt, from the content. Anything else is refused."""
    if not data:
        raise _reject("The file is empty.")
    head = data[:8]
    if head.startswith(b"%PDF-"):
        return "pdf"
    if head.startswith(OLE_MAGIC):
        if (filename or "").lower().endswith((".docx", ".docm")):
            raise _reject("This Word file is password-protected or encrypted. Remove the password and upload it again.")
        raise _reject("Old .doc files are not accepted. Save the document as .docx and upload it again.")
    if head.startswith(b"PK\x03\x04"):
        return "docx"                  # confirmed (and archives refused) by check_docx
    if any(head.startswith(m) for m in EXEC_MAGIC) or any(head.startswith(m) for m in ARCHIVE_MAGIC):
        raise _reject("Programs and archives are not accepted. Upload a PDF, Word (.docx) or text file.")
    try:
        text = data[:TEXT_LIKE_LIMIT].decode("utf-8")
    except UnicodeDecodeError:
        raise _reject("This file type is not accepted. Upload a PDF, Word (.docx) or text file.")
    if "\x00" in text:
        raise _reject("This file type is not accepted. Upload a PDF, Word (.docx) or text file.")
    return "txt"


def check_docx(data: bytes) -> None:
    """A real .docx: not macro-enabled, not encrypted, within the uncompressed size and member limits."""
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise _reject("The Word file is damaged and cannot be read.")
    infos = zf.infolist()
    if len(infos) > MAX_DOCX_MEMBERS:
        raise _reject("The Word file contains too many parts.")
    total = 0
    for i in infos:
        total += i.file_size
        if i.file_size > 10 * 1024 * 1024 and i.file_size / max(i.compress_size, 1) > MAX_RATIO:
            raise _reject("The Word file expands to an unsafe size.")
        if i.flag_bits & 0x1:
            raise _reject("This Word file is password-protected or encrypted. Remove the password and upload it again.")
    if total > MAX_DOCX_UNCOMPRESSED:
        raise _reject("The Word file expands to more than 100 MB.")
    names = {i.filename for i in infos}
    if "[Content_Types].xml" not in names or "word/document.xml" not in names:
        raise _reject("This is an archive, not a Word document. Upload a .docx file.")
    if any(n.lower().endswith("vbaproject.bin") for n in names):
        raise _reject("Macro-enabled Word files (.docm) are not accepted. Save the document as .docx (without macros).")
    ctypes = zf.read("[Content_Types].xml").decode("utf-8", "replace")
    if MACRO_MAIN in ctypes or "macroEnabled" in ctypes:
        raise _reject("Macro-enabled Word files (.docm) are not accepted. Save the document as .docx (without macros).")
    if DOCX_MAIN not in ctypes and DOTX_MAIN not in ctypes:
        raise _reject("This is not a Word document. Upload a .docx file.")


def check_pdf(data: bytes) -> int:
    """Page count of a readable, unencrypted PDF."""
    from pypdf import PdfReader
    try:
        reader = PdfReader(io.BytesIO(data))
    except Exception:
        raise _reject("The PDF is damaged and cannot be read.")
    if reader.is_encrypted:
        raise _reject("This PDF is password-protected or encrypted. Remove the password and upload it again.")
    try:
        return len(reader.pages)
    except Exception:
        raise _reject("The PDF is damaged and cannot be read.")


def _production() -> bool:
    env = (os.getenv("ENVIRONMENT") or os.getenv("APP_ENV") or "").strip().lower()
    return env in {"production", "prod", "staging"}


def scan(data: bytes) -> str:
    """clean | rejected. Raises when no scanner is configured in production."""
    from app.config import settings
    host = (getattr(settings, "CLAMAV_HOST", "") or "").strip()
    if not host:
        if _production():
            raise HTTPException(503, {"code": "SCANNER_REQUIRED",
                                      "message": "Uploads are switched off: no malware scanner is configured for this deployment. "
                                                 "Ask your platform administrator to set CLAMAV_HOST."})
        return "clean"
    try:
        with socket.create_connection((host, int(getattr(settings, "CLAMAV_PORT", 3310) or 3310)), timeout=30) as s:
            s.sendall(b"zINSTREAM\0")
            for i in range(0, len(data), 64 * 1024):
                chunk = data[i:i + 64 * 1024]
                s.sendall(struct.pack(">I", len(chunk)) + chunk)
            s.sendall(struct.pack(">I", 0))
            reply = s.recv(4096).decode("utf-8", "replace")
    except OSError:
        raise HTTPException(503, {"code": "SCANNER_UNAVAILABLE",
                                  "message": "The malware scanner could not be reached. Try again in a few minutes."})
    return "clean" if reply.strip("\0 \n").endswith("OK") else "rejected"


def check(data: bytes, filename: str, *, max_bytes: int, allowed=("pdf", "docx", "txt")) -> Checked:
    """Every intake check in order; returns what the file really is."""
    if len(data) > max_bytes:
        raise _reject(f"The file is larger than {max_bytes // (1024 * 1024)} MB.")
    if (filename or "").lower().endswith((".docm", ".dotm", ".exe", ".bat", ".cmd", ".js", ".vbs", ".zip", ".rar", ".7z")):
        raise _reject("This file type is not accepted. Upload a PDF, Word (.docx) or text file.")
    kind = sniff(data, filename)
    if kind not in allowed:
        raise _reject("Upload Word documents (.docx) only. Open the file in Word and use Save As › Word Document."
                      if allowed == ("docx",) else "This file type is not accepted here. Upload a PDF, Word (.docx) or text file.")
    pages = None
    if kind == "docx":
        check_docx(data)
    elif kind == "pdf":
        pages = check_pdf(data)
    if scan(data) != "clean":
        raise _reject("The malware scan rejected this file.")
    media = {"pdf": "application/pdf", "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
             "txt": "text/plain"}[kind]
    return Checked(kind=kind, media_type=media, page_count=pages)
