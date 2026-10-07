"""The period an appraisal covers: a year, a pair of consecutive years, or a quarter / half of a year."""

import re
from typing import Optional

MIN_YEAR, MAX_YEAR = 2000, 2100
PERIOD_HELP = "Enter the appraisal period as a year (2025), consecutive years (2024-2025), or a quarter or half (Q1 2026, H2 2025)."

_YEAR = r"(\d{4})"
_RANGE = re.compile(rf"^{_YEAR}\s*[-–—/]\s*(\d{{4}}|\d{{2}})$")
_PART = re.compile(r"^(?:(Q[1-4])|(H[1-2]))[\s-]*(\d{4})$", re.IGNORECASE)
_SINGLE = re.compile(r"^(\d{4})$")


def _year_ok(year: int) -> bool:
    return MIN_YEAR <= year <= MAX_YEAR


def normalize_appraisal_period(value: Optional[str]) -> str:
    """Return the period in its standard written form, or raise ValueError with a message fit for the user."""
    text = " ".join(str(value or "").split())
    if not text:
        raise ValueError("The appraisal period is required. " + PERIOD_HELP)

    if m := _SINGLE.match(text):
        year = int(m.group(1))
        if not _year_ok(year):
            raise ValueError(f"{year} is not a valid year. Use a year between {MIN_YEAR} and {MAX_YEAR}.")
        return str(year)

    if m := _RANGE.match(text):
        start = int(m.group(1))
        end_raw = m.group(2)
        end = int(end_raw) if len(end_raw) == 4 else (start // 100) * 100 + int(end_raw)
        if not (_year_ok(start) and _year_ok(end)):
            raise ValueError(f"'{text}' has a year outside {MIN_YEAR}-{MAX_YEAR}. Years must have four digits, like 2024-2025.")
        if end != start + 1:
            raise ValueError(f"'{text}' is not a valid period. The second year must be the year after the first, like {start}-{start + 1}.")
        return f"{start}-{end}"

    if m := _PART.match(text):
        year = int(m.group(3))
        if not _year_ok(year):
            raise ValueError(f"{year} is not a valid year. Use a year between {MIN_YEAR} and {MAX_YEAR}.")
        return f"{(m.group(1) or m.group(2)).upper()} {year}"

    raise ValueError(f"'{text}' is not a valid appraisal period. " + PERIOD_HELP)
