"""Server-side formatting of dates and money for documents.

Replaces the browser's hard-coded `en-IN` / `en-GB` formatting (offers.jsx, OfferLetterTemplate.tsx): the format follows the
document language and the employer entity's country. Money always carries its ISO currency code, so an amount is never
ambiguous. No locale library is installed, so the rules are deliberately small and explicit; a language other than English
falls back to ISO dates (2026-10-21) rather than guessing month names.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Optional

_MONTHS = ("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December")
_MONTH_FIRST = {"US", "PH", "FM", "MH", "PW"}           # "October 21, 2026"
_ZERO_DECIMAL = {"JPY", "KRW", "VND", "CLP", "ISK", "UGX", "XAF", "XOF", "PYG", "RWF"}
_DECIMAL_COMMA = {"de", "fr", "es", "it", "pt", "nl", "da", "nb", "sv", "fi", "pl", "cs", "tr", "id", "ru"}


def _lang(language: Optional[str]) -> str:
    return (language or "en").split("-")[0].lower()


def format_date(value, language: Optional[str] = "en", country: Optional[str] = None) -> str:
    if value in (None, ""):
        return ""
    if isinstance(value, str):
        try:
            value = date.fromisoformat(value[:10])
        except ValueError:
            return value
    if isinstance(value, datetime):
        value = value.date()
    if _lang(language) != "en":
        return value.isoformat()
    month = _MONTHS[value.month - 1]
    if (country or "").upper() in _MONTH_FIRST:
        return f"{month} {value.day}, {value.year}"
    return f"{value.day} {month} {value.year}"


def format_datetime_utc(value: Optional[datetime]) -> str:
    if not value:
        return ""
    return value.strftime("%Y-%m-%d %H:%M:%S UTC")


def _group(int_part: str, sep: str, indian: bool) -> str:
    if len(int_part) <= 3:
        return int_part
    if indian:                                            # 12,34,567
        head, tail = int_part[:-3], int_part[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        return sep.join(groups + [tail])
    groups = []
    while int_part:
        groups.insert(0, int_part[-3:])
        int_part = int_part[:-3]
    return sep.join(groups)


def format_money(amount, currency: Optional[str], language: Optional[str] = "en", country: Optional[str] = None) -> str:
    if amount in (None, ""):
        return ""
    try:
        value = Decimal(str(amount))
    except (InvalidOperation, ValueError):
        return str(amount)
    code = (currency or "").upper()
    places = 0 if code in _ZERO_DECIMAL else 2
    value = value.quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP)
    negative = value < 0
    text = f"{abs(value):.{places}f}"
    int_part, _, frac = text.partition(".")
    comma_decimal = _lang(language) in _DECIMAL_COMMA
    group_sep, dec_sep = (".", ",") if comma_decimal else (",", ".")
    out = _group(int_part, group_sep, indian=(country or "").upper() == "IN" and not comma_decimal)
    if places:
        out = f"{out}{dec_sep}{frac}"
    out = f"-{out}" if negative else out
    return f"{code} {out}".strip()


def format_value(value, kind: str, language: Optional[str], country: Optional[str], currency: Optional[str] = None) -> str:
    if value is None:
        return ""
    if kind == "date":
        return format_date(value, language, country)
    if kind == "datetime":
        return format_datetime_utc(value) if isinstance(value, datetime) else str(value)
    if kind == "money":
        if isinstance(value, dict):
            return format_money(value.get("amount"), value.get("currency") or currency, language, country)
        return format_money(value, currency, language, country)
    if kind == "bool":
        return "Yes" if value else "No"
    if kind == "list":
        return ", ".join(str(v) for v in value if v not in (None, "")) if isinstance(value, (list, tuple)) else str(value)
    return str(value)
