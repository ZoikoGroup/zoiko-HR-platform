"""Pre-check 6: reading the document's text (ZHR-DOCS-ARCH-001 §14.1, Phase 7). OFF unless the organization turns on the
`ocr` automation feature AND (for images / scanned PDFs) the server has Tesseract installed (`HR_OCR_ENABLED=1`).

It only ever WARNS a reviewer: the name on the document does not look like the employee's, or the expiry date printed on
it differs from the one entered. It never blocks or approves anything, and no extracted text is stored — only the
outcome, with dates and numbers masked.
"""
import io
import logging
import os
import re
import shutil
from datetime import date, datetime
from difflib import SequenceMatcher
from typing import Optional

logger = logging.getLogger("zoiko.documents.ocr")
NAME_MATCH = 0.85
MAX_CHARS = 20000
_DATE = re.compile(r"\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b|\b(\d{4})-(\d{2})-(\d{2})\b")


def ocr_engine_available() -> bool:
    if os.environ.get("HR_OCR_ENABLED", "").lower() not in ("1", "true", "yes", "on"):
        return False
    try:
        import pytesseract  # noqa: F401
    except ImportError:
        return False
    return shutil.which("tesseract") is not None


def extract_text(data: bytes, mime: Optional[str]) -> str:
    """The document's text: the PDF's own text layer first, OCR for images (and text-less PDFs are skipped)."""
    mime = (mime or "").lower()
    try:
        if mime == "application/pdf" or data[:4] == b"%PDF":
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(data))
            text = " ".join((p.extract_text() or "") for p in reader.pages[:5])
            return text[:MAX_CHARS]
        if mime.startswith("image/") and ocr_engine_available():
            import pytesseract
            from PIL import Image
            return (pytesseract.image_to_string(Image.open(io.BytesIO(data))) or "")[:MAX_CHARS]
    except Exception:
        logger.info("text extraction skipped (unreadable file)")
    return ""


def _tokens(text: str) -> list[str]:
    return [t for t in re.split(r"[^a-z]+", text.lower()) if len(t) > 1]


def name_score(text: str, legal_name: str) -> float:
    """How well the person's name appears in the text (0..1): each part of the name is matched against the closest word
    (documents print surname and given names apart and in any order), and the parts are averaged."""
    want = _tokens(legal_name)
    words = set(_tokens(text))
    if not want or not words:
        return 0.0
    return sum(max(SequenceMatcher(None, part, w).ratio() for w in words) for part in want) / len(want)


def dates_in(text: str) -> list[date]:
    out = []
    for m in _DATE.finditer(text):
        try:
            if m.group(3):
                d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
                out.append(date(y, mo, d) if mo <= 12 else date(y, d, mo))
            else:
                out.append(date(int(m.group(4)), int(m.group(5)), int(m.group(6))))
        except ValueError:
            continue
    return out


def analyse(data: bytes, mime: Optional[str], *, legal_name: Optional[str], expiry_date: Optional[date] = None):
    """Check objects for pre-check 6 (empty when there is no readable text)."""
    from app.modules.hr.documents.precheck import Check
    text = extract_text(data, mime)
    if not text.strip():
        return []
    checks = []
    if legal_name:
        score = name_score(text, legal_name)
        if score >= NAME_MATCH:
            checks.append(Check("ocr_name", "pass", "The name on the document matches the employee."))
        else:
            checks.append(Check("ocr_name", "warn", "The name on the document doesn't clearly match the employee. Check it is theirs.",
                                {"score": round(score, 2)}))
    if expiry_date is not None:
        found = [d for d in dates_in(text) if d.year >= expiry_date.year - 1]
        if found and expiry_date not in found:
            checks.append(Check("ocr_expiry", "warn", "The expiry date entered doesn't appear on the document.",
                                {"candidates": len(found)}))
    return checks


def add_ocr_checks(result, db, *, organization_id: int, data: bytes, mime: Optional[str], person, expiry_date=None):
    """Append pre-check 6 when the organization turned it on. Never raises."""
    try:
        from app.modules.hr.documents.automation.limits import feature_enabled, org_settings
        if not feature_enabled(org_settings(db, organization_id), "ocr"):
            return result
        name = f"{getattr(person, 'first_name', '') or ''} {getattr(person, 'last_name', '') or ''}".strip()
        result.checks.extend(analyse(data, mime, legal_name=name or None, expiry_date=expiry_date))
    except Exception:
        logger.exception("pre-check 6 failed (organization %s)", organization_id)
    return result
