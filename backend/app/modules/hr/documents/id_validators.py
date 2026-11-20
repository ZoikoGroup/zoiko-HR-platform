"""Identity-number validators by jurisdiction (ZHR-DOCS-ARCH-001 §14.1 check 5).

Decision Q1 (2026-11-19): the documents module must work in every jurisdiction, so nothing country-specific is built into
the categories. A category opts into a format check by naming a validator key here (`id_number_field`). Results only WARN
the reviewer; a person still decides. Numbers are never stored in full: `mask()` keeps the last four characters.

Add a jurisdiction by registering a function that returns None when the value looks valid, or a short message.
"""
import re
from typing import Callable, Optional

Validator = Callable[[str], Optional[str]]
REGISTRY: dict[str, tuple[str, Validator]] = {}


def register(key: str, label: str):
    def wrap(fn: Validator) -> Validator:
        REGISTRY[key] = (label, fn)
        return fn
    return wrap


def _compact(value: str) -> str:
    return re.sub(r"[\s\-./]", "", str(value or "")).upper()


# Verhoeff checksum tables (used by India's Aadhaar).
_D = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
      [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
      [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
      [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]]
_P = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
      [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
      [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]]


def verhoeff_valid(digits: str) -> bool:
    if not digits.isdigit():
        return False
    c = 0
    for i, ch in enumerate(reversed(digits)):
        c = _D[c][_P[i % 8][int(ch)]]
    return c == 0


@register("in.aadhaar", "Aadhaar number (India)")
def _aadhaar(value: str) -> Optional[str]:
    v = _compact(value)
    if not re.fullmatch(r"[2-9]\d{11}", v):
        return "should be 12 digits and cannot start with 0 or 1"
    if not verhoeff_valid(v):
        return "fails the Aadhaar checksum (a digit may be mistyped)"
    return None


@register("in.pan", "PAN (India)")
def _pan(value: str) -> Optional[str]:
    v = _compact(value)
    if not re.fullmatch(r"[A-Z]{5}\d{4}[A-Z]", v):
        return "should look like ABCDE1234F"
    if v[3] != "P":
        return "is not an individual's PAN (4th letter is not P)"
    return None


@register("passport", "Passport number (any country)")
def _passport(value: str) -> Optional[str]:
    v = _compact(value)
    if not re.fullmatch(r"[A-Z0-9]{6,12}", v):
        return "should be 6 to 12 letters and digits"
    return None


def validate(key: Optional[str], value: Optional[str]) -> Optional[str]:
    """None when there is nothing to check or the value looks valid; otherwise a message for the reviewer."""
    if not key or key not in REGISTRY or not (value or "").strip():
        return None
    label, fn = REGISTRY[key]
    problem = fn(value)
    return f"The {label} {problem}." if problem else None


def mask(value: Optional[str]) -> Optional[str]:
    v = _compact(value or "")
    if not v:
        return None
    return "•" * max(len(v) - 4, 0) + v[-4:]


def choices() -> list[dict]:
    return [{"key": k, "label": label} for k, (label, _) in sorted(REGISTRY.items())]
