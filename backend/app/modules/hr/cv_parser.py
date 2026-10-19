"""CV / resume text extraction and structured field parsing.

Supports PDF (via pypdf) and DOCX (via zipfile + XML). Returns a dict of
candidate fields that can be used to pre-fill the candidate form.
"""
from __future__ import annotations

import io
import re
import zipfile
from typing import Optional

# Common regex patterns for extracting candidate info
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_PHONE_RE = re.compile(r"(\+?\d[\d\s\-().]{7,}\d)")
# Years of experience: "5 years", "3+ years", "5 yrs", etc.
_EXPERIENCE_RE = re.compile(r"(\d+)\+?\s*(?:years?|yrs?|yr)\b", re.IGNORECASE)
# Common job title keywords
_TITLE_KEYWORDS = [
    "engineer", "developer", "manager", "analyst", "designer", "consultant",
    "architect", "lead", "intern", "director", "specialist", "administrator",
    "coordinator", "associate", "executive", "officer", "scientist", "researcher",
    "technician", "support", "qa", "tester", "devops", "data", "product",
    "marketing", "sales", "hr", "finance", "accountant", "auditor",
    "software", "frontend", "backend", "fullstack", "full stack", "web",
    "mobile", "android", "ios", "python", "java", "react", "node",
]
# Common location patterns
_LOCATION_RE = re.compile(
    r"\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*),?\s*([A-Z][a-zA-Z]+)?\b"
)


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text from a PDF file."""
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(file_bytes))
    parts = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            parts.append(text)
    return "\n".join(parts)


def extract_text_from_docx(file_bytes: bytes) -> str:
    """Extract text from a DOCX file using zipfile + XML."""
    parts = []
    with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
        for name in zf.namelist():
            if name == "word/document.xml":
                xml = zf.read(name).decode("utf-8", errors="ignore")
                # Strip XML tags, keep text
                text = re.sub(r"<[^>]+>", " ", xml)
                # Decode XML entities
                text = text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&apos;", "'")
                parts.append(text)
            elif name.startswith("word/") and name.endswith(".xml"):
                xml = zf.read(name).decode("utf-8", errors="ignore")
                text = re.sub(r"<[^>]+>", " ", xml)
                text = text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&apos;", "'")
                parts.append(text)
    return "\n".join(parts)


def extract_text(file_bytes: bytes, filename: str) -> str:
    """Extract text from a file based on extension."""
    lower = filename.lower()
    if lower.endswith(".pdf"):
        return extract_text_from_pdf(file_bytes)
    elif lower.endswith(".docx"):
        return extract_text_from_docx(file_bytes)
    elif lower.endswith(".doc"):
        # .doc is binary; try to extract readable text
        text = file_bytes.decode("utf-8", errors="ignore")
        # Remove non-printable chars
        text = re.sub(r"[^\x20-\x7E\n\r\t]", " ", text)
        return text
    elif lower.endswith(".txt"):
        return file_bytes.decode("utf-8", errors="ignore")
    else:
        # Try PDF first, then docx, then plain text
        try:
            return extract_text_from_pdf(file_bytes)
        except Exception:
            try:
                return extract_text_from_docx(file_bytes)
            except Exception:
                return file_bytes.decode("utf-8", errors="ignore")


def _clean_text(text: str) -> str:
    """Clean and normalize extracted text."""
    # Remove excessive whitespace
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def _extract_email(text: str) -> Optional[str]:
    m = _EMAIL_RE.search(text)
    return m.group(0).lower() if m else None


def _extract_phone(text: str) -> Optional[str]:
    m = _PHONE_RE.search(text)
    if m:
        phone = m.group(1).strip()
        # Remove extra spaces
        phone = re.sub(r"\s+", " ", phone)
        return phone
    return None


def _extract_experience(text: str) -> Optional[int]:
    m = _EXPERIENCE_RE.search(text)
    if m:
        years = int(m.group(1))
        if 0 <= years <= 60:
            return years
    return None


def _extract_name(text: str) -> Optional[str]:
    """Try to extract name from the first few lines of the CV."""
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    for line in lines[:5]:
        # Skip lines that look like emails, phones, or URLs
        if "@" in line or re.search(r"\d{5,}", line) or "http" in line.lower():
            continue
        # A name is typically 2-4 words, all capitalized
        words = line.split()
        if 1 <= len(words) <= 4 and all(w[0].isupper() for w in words if w and w[0].isalpha()):
            # Make sure it's not a section header
            lower = line.lower()
            if any(kw in lower for kw in ["experience", "education", "skills", "summary", "objective", "profile", "contact", "resume", "cv"]):
                continue
            return line
    return None


def _extract_position(text: str) -> Optional[str]:
    """Try to extract job title / position from the CV."""
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    for line in lines[:10]:
        lower = line.lower()
        if any(kw in lower for kw in _TITLE_KEYWORDS):
            # Check if it's a short line (likely a title, not a sentence)
            if len(line) < 80 and len(line.split()) <= 6:
                return line
    # Try to find "Position: X" or "Title: X" patterns
    m = re.search(r"(?:position|title|role|current role)[:\s]+([^\n]{3,60})", text, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return None


def _extract_location(text: str) -> Optional[str]:
    """Try to extract location from the CV."""
    # Look for "Location: X" patterns
    m = re.search(r"(?:location|address|city|based in)[:\s]+([^\n]{3,60})", text, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    # Try common city patterns
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    for line in lines[:10]:
        if any(city in line for city in ["Bangalore", "Mumbai", "Delhi", "Hyderabad", "Chennai", "Pune", "Kolkata", "Noida", "Gurgaon", "Ahmedabad"]):
            return line
    return None


def parse_cv(file_bytes: bytes, filename: str) -> dict:
    """Parse a CV file and return structured candidate data."""
    text = extract_text(file_bytes, filename)
    text = _clean_text(text)

    name = _extract_name(text)
    email = _extract_email(text)
    phone = _extract_phone(text)
    experience = _extract_experience(text)
    position = _extract_position(text)
    location = _extract_location(text)

    return {
        "name": name or "",
        "email": email or "",
        "phone": phone or "",
        "position": position or "",
        "experience": experience,
        "location": location or "",
        "resume_text": text[:5000],  # Store first 5000 chars
    }