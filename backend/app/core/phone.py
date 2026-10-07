"""One rule for phone numbers typed into user forms and bulk imports.

A phone number is the 10-digit national number, optionally preceded by a country code: `9876543210`,
`+91 98765 43210`, `+1 (555) 010-0100`. Spaces, hyphens, dots and brackets are allowed as separators; anything else,
or more or fewer than 10 digits after the country code, is rejected instead of being stored.
"""
import re
from typing import Optional

PHONE_ERROR = "Enter a valid 10-digit phone number, optionally with a country code (for example +91 9876543210)."

_SEPARATORS = re.compile(r"[\s\-().]")
_PHONE = re.compile(r"^(\+\d{1,3})?\d{10}$")


def normalize_phone(value) -> Optional[str]:
    """Return the cleaned phone number (separators removed, `+` kept), None for blank. Raises ValueError if invalid."""
    if isinstance(value, float) and value.is_integer():
        value = int(value)  # a spreadsheet cell that holds a number: 9876543210.0 -> 9876543210
    text = "" if value is None else str(value).strip()
    if not text:
        return None
    compact = _SEPARATORS.sub("", text)
    if not _PHONE.match(compact):
        raise ValueError(PHONE_ERROR)
    return compact
