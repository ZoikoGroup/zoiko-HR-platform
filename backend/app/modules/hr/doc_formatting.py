"""Formatters for generated documents: one implementation for every date, amount, address, name and notice period, so
a value can only ever print one way (no typed weekdays, no five spellings of one address).

Pure functions, no database access. Used by the onboarding package value builder and its renderers."""
from __future__ import annotations

import re
import unicodedata
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Iterable, Optional, Union

DateLike = Union[date, datetime, str, None]

_MONTHS = ("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November",
           "December")
_SYMBOLS = {"INR": "₹", "USD": "$", "GBP": "£", "EUR": "€", "AED": "AED ", "SGD": "S$", "AUD": "A$", "CAD": "C$", "NZD": "NZ$",
            "JPY": "¥"}
_NO_MINOR_UNITS = {"JPY", "KRW"}
_UNIT_WORDS = {"calendar_days": ("day", "days"), "business_days": ("business day", "business days"), "weeks": ("week", "weeks"),
               "months": ("month", "months")}
# words kept in their written case when an address is normalised (roman numerals, ordinals, common abbreviations)
_ROMAN = re.compile(r"^(?=[ivxlcdm]+$)m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$", re.I)


def to_date(value: DateLike) -> Optional[date]:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def ordinal(n: int) -> str:
    """1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st, 22nd, 23rd, 31st."""
    if 10 <= n % 100 <= 20:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def format_date(value: DateLike, fmt: str = "DMY") -> str:
    """"6 July 2026" (DMY) or "July 6, 2026" (MDY)."""
    d = to_date(value)
    if d is None:
        return ""
    month = _MONTHS[d.month - 1]
    return f"{month} {d.day}, {d.year}" if (fmt or "DMY").upper() == "MDY" else f"{d.day} {month} {d.year}"


def format_date_long(value: DateLike, fmt: str = "DMY") -> str:
    """The date with its weekday, always computed from the date: "Saturday, 1 August 2026"."""
    d = to_date(value)
    if d is None:
        return ""
    return f"{d.strftime('%A')}, {format_date(d, fmt)}"


def format_date_legal(value: DateLike) -> str:
    """The recital / attestation form: "6th day of July, 2026"."""
    d = to_date(value)
    if d is None:
        return ""
    return f"{ordinal(d.day)} day of {_MONTHS[d.month - 1]}, {d.year}"


def weekday_code(value: DateLike) -> Optional[str]:
    d = to_date(value)
    return ("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN")[d.weekday()] if d else None


def _group_indian(digits: str) -> str:
    if len(digits) <= 3:
        return digits
    head, tail = digits[:-3], digits[-3:]
    parts = []
    while len(head) > 2:
        parts.insert(0, head[-2:])
        head = head[:-2]
    if head:
        parts.insert(0, head)
    return ",".join(parts + [tail])


def default_grouping(currency: Optional[str]) -> str:
    return "indian" if (currency or "").upper() == "INR" else "international"


def format_money(amount, currency: Optional[str] = None, grouping: Optional[str] = None, *, symbol: bool = True) -> str:
    """"₹12,000", "₹1,20,000", "$12,000.00", "£42,000.50". Whole INR amounts print without ".00"."""
    if amount in (None, ""):
        return ""
    try:
        value = Decimal(str(amount))
    except Exception:
        return str(amount)
    cur = (currency or "").upper()
    grouping = grouping or default_grouping(cur)
    negative = value < 0
    value = abs(value)
    whole_only = cur in _NO_MINOR_UNITS or (cur == "INR" and value == value.to_integral_value())
    value = value.quantize(Decimal("1") if whole_only else Decimal("0.01"), rounding=ROUND_HALF_UP)
    text = f"{value:f}"
    integer, _, fraction = text.partition(".")
    integer = _group_indian(integer) if grouping == "indian" else f"{int(integer):,}"
    number = integer + (f".{fraction}" if fraction else "")
    prefix = (_SYMBOLS.get(cur, f"{cur} ") if symbol and cur else "")
    return f"{'-' if negative else ''}{prefix}{number}"


def _title_word(word: str) -> str:
    if not word:
        return word
    if _ROMAN.match(word) and len(word) <= 5 and word.lower() not in ("mi", "di", "vi", "mid", "lid", "dim", "mix", "civil", "mild"):
        return word.upper()
    if any(ch.isdigit() for ch in word):
        return word                              # "2nd", "17", "Flat-704" stay as written
    if word.isupper() and len(word) <= 4:
        return word                              # "PIN", "MG" stay as written
    return word[0].upper() + word[1:]


def normalise_address_part(part) -> str:
    """Collapse spaces, drop a trailing full stop, capitalise words ("II stage" → "II Stage")."""
    text = re.sub(r"\s+", " ", str(part or "")).strip().rstrip(".,").strip()
    return " ".join(_title_word(w) for w in text.split(" "))


_ADDRESS_ORDER = ("house", "building", "street", "address_line1", "address_line2", "address", "landmark", "locality")


def address_lines(parts: dict, country: Optional[str] = None) -> list[str]:
    """Structured address → printed lines. India layout ends with "District: X, State: Y" and "PIN Code: 500072"."""
    parts = parts or {}
    cc = (country or parts.get("country") or "").upper()
    lines = [normalise_address_part(parts.get(k)) for k in _ADDRESS_ORDER if parts.get(k)]
    city = normalise_address_part(parts.get("city_display") or parts.get("city"))
    district = normalise_address_part(parts.get("district"))
    state = normalise_address_part(parts.get("state"))
    postal = re.sub(r"\s+", " ", str(parts.get("postal_code") or "")).strip()
    if cc == "IN":
        if city:
            lines.append(city)
        tail = ", ".join(x for x in (f"District: {district}" if district else "", f"State: {state}" if state else "") if x)
        if tail:
            lines.append(tail)
        if postal:
            lines.append(f"PIN Code: {postal}")
    else:
        locality = " ".join(x for x in (city, postal) if x)
        for x in (locality, district, state):
            if x:
                lines.append(x)
        from app.core import regions
        name = regions.country_name(cc) if cc else ""
        if name:
            lines.append(name)
    out = []
    for ln in lines:                              # never print the same line twice (e.g. a locality repeated as the city)
        if ln and ln.lower() not in (o.lower() for o in out):
            out.append(ln)
    return out


def format_address_block(parts: dict, country: Optional[str] = None) -> str:
    return "\n".join(address_lines(parts, country))


def format_address_inline(parts: dict, country: Optional[str] = None) -> str:
    return ", ".join(address_lines(parts, country))


def initials(name: Optional[str]) -> str:
    """"Ravuri Rugvedh" → "RR" (letters only, ASCII-folded)."""
    words = [w for w in re.split(r"[\s\-]+", transliterate(name or "")) if w]
    return "".join(w[0].upper() for w in words if w[0].isalpha())


def name_caps(name: Optional[str]) -> str:
    return re.sub(r"\s+", " ", (name or "")).strip().upper()


def name_title(name: Optional[str]) -> str:
    """Body-text form: each word capitalised, the rest as entered ("ravuri RUGVEDH" → "Ravuri Rugvedh")."""
    words = re.sub(r"\s+", " ", (name or "")).strip().split(" ")
    return " ".join(w[:1].upper() + w[1:].lower() if w.isupper() or w.islower() else w for w in words if w)


def transliterate(text: str) -> str:
    """ASCII-fold for file names ("José Ñúñez" → "Jose Nunez"); characters with no ASCII form are dropped."""
    return unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode("ascii")


def pluralise(n, singular: str, plural: Optional[str] = None) -> str:
    try:
        one = float(n) == 1
    except (TypeError, ValueError):
        one = False
    return singular if one else (plural or singular + "s")


def notice_text(value, unit: Optional[str]) -> str:
    """"15 business days' written notice", "1 month's written notice", "15 days' written notice"."""
    if value in (None, "") or not unit:
        return ""
    one, many = _UNIT_WORDS.get(unit, ("day", "days"))
    word = pluralise(value, one, many)
    possessive = f"{word}'" if word.endswith("s") else f"{word}'s"
    n = int(value) if float(value) == int(float(value)) else value
    return f"{n} {possessive} written notice"


def bullet_join(items: Iterable[str]) -> str:
    return "; ".join(str(i).strip() for i in items if str(i or "").strip())
