"""Virus-scan hook for uploads (ZHR-DOCS-ARCH-001 §14.1 check 3).

HR_AV_SCANNER=clamd (with HR_CLAMD_HOST / HR_CLAMD_PORT) streams each upload to a ClamAV daemon over its INSTREAM protocol
(standard library only). Anything else, including unset, uses NoopScanner: uploads are marked 'skipped', never 'clean'.
"""
import logging
import os
import socket
import struct
from dataclasses import dataclass
from typing import Optional, Protocol

logger = logging.getLogger("zoiko.documents")


@dataclass
class ScanResult:
    status: str                      # clean | infected | skipped | error
    signature: Optional[str] = None


class Scanner(Protocol):
    def scan(self, data: bytes, filename: str) -> ScanResult: ...


class NoopScanner:
    def scan(self, data: bytes, filename: str) -> ScanResult:
        return ScanResult("skipped")


class ClamdScanner:
    CHUNK = 64 * 1024

    def __init__(self, host: str, port: int, timeout: float = 15.0):
        self.host, self.port, self.timeout = host, port, timeout

    def scan(self, data: bytes, filename: str) -> ScanResult:
        try:
            with socket.create_connection((self.host, self.port), timeout=self.timeout) as sock:
                sock.sendall(b"zINSTREAM\0")
                for i in range(0, len(data), self.CHUNK):
                    chunk = data[i:i + self.CHUNK]
                    sock.sendall(struct.pack("!L", len(chunk)) + chunk)
                sock.sendall(struct.pack("!L", 0))
                reply = b""
                while not reply.endswith(b"\0"):
                    part = sock.recv(4096)
                    if not part:
                        break
                    reply += part
            text = reply.rstrip(b"\0").decode("utf-8", "replace")
            if text.endswith("OK"):
                return ScanResult("clean")
            if "FOUND" in text:
                return ScanResult("infected", text.split(":", 1)[-1].replace("FOUND", "").strip()[:120])
            return ScanResult("error", text[:120])
        except OSError as exc:
            logger.warning("virus scanner unavailable: %s", exc)
            return ScanResult("error", "scanner unavailable")


_scanner: Optional[Scanner] = None


def get_scanner() -> Scanner:
    global _scanner
    if _scanner is None:
        if os.environ.get("HR_AV_SCANNER", "").strip().lower() == "clamd":
            _scanner = ClamdScanner(os.environ.get("HR_CLAMD_HOST", "127.0.0.1"), int(os.environ.get("HR_CLAMD_PORT", "3310")))
        else:
            _scanner = NoopScanner()
    return _scanner


def set_scanner(scanner: Optional[Scanner]) -> None:
    """Tests swap the scanner here."""
    global _scanner
    _scanner = scanner
