"""
core/field_rules.py
-------------------
One rule set per kind of field (QA reports of 6 and 10 Nov 2026: B7–B13, B16–B38). The browser has the same rules with the same
messages in frontend/src/utils/fieldRules.js; both are tested against backend/tests/fixtures/field_rules_cases.json so they
cannot drift.

    clean(rule, value, country=None, label=None) -> the normalised value, None for blank; raises FieldRuleError(message)
    problem(rule, value, country=None, label=None) -> the message, or None when the value is fine (or blank)

Required-ness is the caller's business: a blank value is never an error here.

The rules are deliberately field-appropriate, not "letters only" everywhere: organization names have digits and symbols
(3M, 7-Eleven, AT&T), job titles have digits (Engineer II, C++ Developer), people's names have apostrophes, hyphens, accents and
non-Latin scripts (O'Brien, Jean-Luc, José, 王伟, अनिल), addresses have digits and punctuation.

Every free-text rule: trims and collapses repeated spaces; refuses control, invisible (zero-width…) and emoji characters; refuses
values made only of digits and/or symbols; refuses leading/trailing punctuation (a closing ")" or "." is fine, and "+"/"#" at the
end of a job title for C++ / C#) and three or more of the same symbol in a row.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Callable, Optional


class FieldRuleError(ValueError):
    """A value that breaks its field's rule. The message is written for the person filling in the form."""


# ── messages (identical in fieldRules.js) ───────────────────────────────────────────────────────────────────────────
MESSAGES = {
    "person_name": "Use letters only. Spaces, hyphens (-), apostrophes (') and full stops are allowed.",
    "org_name": "Use letters, numbers, spaces and & . , ' - ( ) / only. Include at least one letter.",
    "org_unit": "Use letters, numbers, spaces and & - / , . ( ) only. Include at least one letter.",
    "job_title": "Use letters, numbers, spaces and & - / , . ( ) + # only. Include at least one letter.",
    "industry": "Select an industry.",
    "place_name": "Use letters only. Spaces, hyphens, apostrophes and full stops are allowed.",
    "country": "Select a country.",
    "state": "Select a state/region.",
    "address": "Enter a full address (for example: 12 MG Road, Indiranagar). Only letters, numbers and , . - / # ' ( ) : are allowed.",
    "email": "Enter a valid email address, for example name@company.com.",
    "email_no_mail": "This email domain can't receive email. Check the address.",
    "country_first": "Select the employee's country first so this number can be checked.",
}

# (min, max) characters after trimming
LENGTHS = {
    "person_name": (1, 50), "person_full_name": (2, 100), "org_name": (2, 150), "org_unit": (2, 100), "job_title": (2, 100),
    "place_name": (2, 80), "address": (5, 250), "industry_other": (2, 100),
}


def length_message(rule: str) -> str:
    lo, hi = LENGTHS[rule]
    return f"Use {lo} to {hi} characters."


# ── character classes ───────────────────────────────────────────────────────────────────────────────────────────────
def _is_letter(ch: str) -> bool:
    return unicodedata.category(ch).startswith("L")


def _is_mark(ch: str) -> bool:
    return unicodedata.category(ch).startswith("M")


def _is_digit(ch: str) -> bool:
    return unicodedata.category(ch) == "Nd"


_SPACES = re.compile(r"[ \t]+")


def _tidy(value, *, multiline: bool = False) -> str:
    text = str(value).replace("\r\n", "\n").replace("\r", "\n")
    if multiline:
        lines = [_SPACES.sub(" ", line).strip() for line in text.split("\n")]
        return "\n".join(line for line in lines if line)
    return " ".join(text.split())


def _repeated_symbols(text: str) -> bool:
    """Three or more of the same non-letter, non-digit, non-space character in a row (---, ..., @@@)."""
    run, last = 0, ""
    for ch in text:
        if ch == last and not (_is_letter(ch) or _is_digit(ch) or ch.isspace()):
            run += 1
            if run >= 3:
                return True
        else:
            run, last = 1, ch
    return False


def _text_rule(text: str, *, allowed: str, digits: bool, start_letter: bool, end_ok: str, start_ok: str = "",
               newline: bool = False) -> bool:
    """True when `text` passes the shared free-text checks for one rule."""
    for ch in text:
        if _is_letter(ch) or _is_mark(ch) or ch == " " or ch in allowed:
            continue
        if digits and _is_digit(ch):
            continue
        if newline and ch == "\n":
            continue
        return False                                   # control / invisible / emoji / any symbol not on the list
    if not any(_is_letter(ch) for ch in text):
        return False                                   # only digits and/or symbols
    first, last = text[0], text[-1]
    if start_letter and not _is_letter(first):
        return False
    if not (_is_letter(first) or (digits and _is_digit(first)) or first in start_ok):
        return False
    if not (_is_letter(last) or _is_mark(last) or (digits and _is_digit(last)) or last in end_ok):
        return False
    return not _repeated_symbols(text)


def _free_text(rule: str, value, label: Optional[str]) -> str:
    text = _tidy(value, multiline=rule == "address")
    lo, hi = LENGTHS[rule]
    if rule == "person_name":
        ok = _text_rule(text, allowed="'’-.", digits=False, start_letter=True, end_ok=".")
    elif rule == "person_full_name":
        ok = _text_rule(text, allowed="'’-.", digits=False, start_letter=True, end_ok=".")
    elif rule == "org_name":
        ok = _text_rule(text, allowed="&.,'’-()/", digits=True, start_letter=False, end_ok=").")
    elif rule in ("org_unit", "industry_other"):
        ok = _text_rule(text, allowed="&-/,.()", digits=True, start_letter=False, end_ok=").")
    elif rule == "job_title":
        ok = _text_rule(text, allowed="&-/,.()+#", digits=True, start_letter=False, end_ok=").+#")
    elif rule == "place_name":
        ok = _text_rule(text, allowed="'’-.", digits=False, start_letter=True, end_ok=".")
    elif rule == "address":
        ok = _text_rule(text, allowed=",.-/#'’():", digits=True, start_letter=False, end_ok=").", start_ok="#", newline=True)
        if ok:
            words = [w for w in re.split(r"[\s,]+", text) if w]
            ok = any(_is_digit(ch) for ch in text) or len([w for w in words if any(_is_letter(c) for c in w)]) >= 2
    else:  # pragma: no cover
        raise KeyError(rule)
    if not ok:
        key = "person_name" if rule == "person_full_name" else ("org_unit" if rule == "industry_other" else rule)
        raise FieldRuleError(MESSAGES[key])
    if not (lo <= len(text) <= hi):
        raise FieldRuleError(length_message(rule))
    return text


# ── industry (a fixed list; "Other" carries a free-text name under org_unit rules) ────────────────────────────────────
INDUSTRIES = (
    "Accounting", "Advertising & Marketing", "Aerospace & Defence", "Agriculture", "Automotive", "Banking", "Biotechnology",
    "Construction", "Consulting", "Consumer Goods", "Education", "Energy & Utilities", "Engineering", "Entertainment & Media",
    "Financial Services", "Food & Beverage", "Government & Public Sector", "Healthcare", "Hospitality & Travel",
    "Human Resources & Staffing", "Information Technology", "Insurance", "Legal", "Logistics & Transportation", "Manufacturing",
    "Mining", "Non-profit", "Pharmaceuticals", "Real Estate", "Retail & E-commerce", "Software", "Telecommunications", "Other",
)
_INDUSTRY_BY_LOWER = {i.lower(): i for i in INDUSTRIES}


def _industry(value, label) -> str:
    text = _tidy(value)
    hit = _INDUSTRY_BY_LOWER.get(text.lower())
    if hit:
        return hit
    if text.lower().startswith("other:"):
        return "Other: " + _free_text("industry_other", text.split(":", 1)[1], label)
    # an older free-text industry ("Technology") is accepted when it reads as a department-like name
    raise FieldRuleError(MESSAGES["industry"])


# ── country / state ─────────────────────────────────────────────────────────────────────────────────────────────────
def country_iso(value) -> Optional[str]:
    from app.core import regions
    if value is None or not str(value).strip():
        return None
    return regions.country_code_strict(str(value))


def country_name(iso: Optional[str]) -> Optional[str]:
    from app.core import regions
    return regions._BY_CODE[iso][1] if iso and iso in regions._BY_CODE else None


def _country(value, label) -> str:
    """Stored as the canonical country NAME (what every employee record, import template, statutory label and salary
    currency already uses); a name, ISO code or alias is accepted."""
    iso = country_iso(value)
    if not iso:
        raise FieldRuleError(MESSAGES["country"])
    return country_name(iso)


# Standard region codes people (and older records / import files) use instead of the name: ISO 3166-2 / postal codes.
STATE_CODES = {
    "IN": {"AN": "Andaman and Nicobar Islands", "AP": "Andhra Pradesh", "AR": "Arunachal Pradesh", "AS": "Assam", "BR": "Bihar",
           "CH": "Chandigarh", "CG": "Chhattisgarh", "CT": "Chhattisgarh", "DH": "Dadra and Nagar Haveli and Daman and Diu",
           "DL": "Delhi", "GA": "Goa", "GJ": "Gujarat", "HR": "Haryana", "HP": "Himachal Pradesh", "JK": "Jammu and Kashmir",
           "JH": "Jharkhand", "KA": "Karnataka", "KL": "Kerala", "LA": "Ladakh", "LD": "Lakshadweep", "MP": "Madhya Pradesh",
           "MH": "Maharashtra", "MN": "Manipur", "ML": "Meghalaya", "MZ": "Mizoram", "NL": "Nagaland", "OD": "Odisha", "OR": "Odisha",
           "PY": "Puducherry", "PB": "Punjab", "RJ": "Rajasthan", "SK": "Sikkim", "TN": "Tamil Nadu", "TG": "Telangana",
           "TS": "Telangana", "TR": "Tripura", "UP": "Uttar Pradesh", "UK": "Uttarakhand", "UT": "Uttarakhand", "WB": "West Bengal"},
    "US": {"AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado",
           "CT": "Connecticut", "DE": "Delaware", "DC": "District of Columbia", "FL": "Florida", "GA": "Georgia", "HI": "Hawaii",
           "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana",
           "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
           "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey",
           "NM": "New Mexico", "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
           "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota",
           "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
           "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming"},
    "CA": {"AB": "Alberta", "BC": "British Columbia", "MB": "Manitoba", "NB": "New Brunswick", "NL": "Newfoundland and Labrador",
           "NT": "Northwest Territories", "NS": "Nova Scotia", "NU": "Nunavut", "ON": "Ontario", "PE": "Prince Edward Island",
           "QC": "Quebec", "SK": "Saskatchewan", "YT": "Yukon"},
    "AU": {"ACT": "Australian Capital Territory", "NSW": "New South Wales", "NT": "Northern Territory", "QLD": "Queensland",
           "SA": "South Australia", "TAS": "Tasmania", "VIC": "Victoria", "WA": "Western Australia"},
}


def _state(value, country, label) -> str:
    from app.core.business_ids import REGIONS
    iso = country_iso(country)
    text = _tidy(value)
    regions_for = REGIONS.get(iso or "")
    if regions_for:
        by_code = STATE_CODES.get(iso, {}).get(text.upper().replace(".", ""))
        if by_code:
            return by_code
        hit = next((r for r in regions_for if r.lower() == text.lower()), None)
        if not hit:
            raise FieldRuleError(MESSAGES["state"])
        return hit
    return _free_text("place_name", text, label)


# ── email ───────────────────────────────────────────────────────────────────────────────────────────────────────────
_EMAIL = re.compile(
    r"^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*"
    r"@([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$"
)


def _email(value, label) -> str:
    from app.core.email_quality import problem_with_domain
    text = str(value).strip()
    if len(text) > 254 or not _EMAIL.match(text) or len(text.split("@")[0]) > 64:
        raise FieldRuleError(MESSAGES["email"])
    local, domain = text.rsplit("@", 1)
    text = f"{local}@{domain.lower()}"
    from app.config import settings
    if getattr(settings, "EMAIL_REAL_ONLY", True):         # placeholder / disposable domains (switch: EMAIL_REAL_ONLY)
        problem = problem_with_domain(domain)
        if problem:
            raise FieldRuleError(problem)
    return text


def email_deliverable(value) -> Optional[str]:
    """Server-only: the message when the domain has no MX (nor A/AAAA) record. A DNS failure is NOT an error (people are
    never blocked by a resolver outage); the invitation / verification e-mail then confirms the address."""
    from app.config import settings
    from app.core.email_quality import _domain_of, _domain_receives_mail
    if not getattr(settings, "EMAIL_REAL_ONLY", True) or not getattr(settings, "EMAIL_DNS_CHECK", True):
        return None
    return MESSAGES["email_no_mail"] if _domain_receives_mail(_domain_of(str(value))) is False else None


# ── phone ───────────────────────────────────────────────────────────────────────────────────────────────────────────
DEFAULT_PHONE_REGION = "IN"           # a number typed without "+" and without a country: the original 10-digit Indian rule
_PHONE_CHARS = re.compile(r"^[0-9 +\-()]+$")


def phone_message(country_iso_code: Optional[str]) -> str:
    return f"Enter a valid phone number for {country_name(country_iso_code) or 'the selected country'}."


def _phone(value, country) -> str:
    import phonenumbers
    text = str(value).strip()
    iso = country_iso(country) or DEFAULT_PHONE_REGION
    if not _PHONE_CHARS.match(text) or text.count("+") > 1 or ("+" in text and not text.startswith("+")):
        raise FieldRuleError(phone_message(iso))
    try:
        number = phonenumbers.parse(text, None if text.startswith("+") else iso)
    except phonenumbers.NumberParseException:
        raise FieldRuleError(phone_message(iso))
    if not phonenumbers.is_valid_number(number):
        region = phonenumbers.region_code_for_number(number) if text.startswith("+") else iso
        raise FieldRuleError(phone_message(region or iso))
    return phonenumbers.format_number(number, phonenumbers.PhoneNumberFormat.E164)


# ── postal code ─────────────────────────────────────────────────────────────────────────────────────────────────────
POSTAL = {
    "IN": (r"^[1-9]\d{5}$", "560001"), "US": (r"^\d{5}(-\d{4})?$", "94105"), "GB": (r"^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$", "SW1A 1AA"),
    "CA": (r"^[A-Z]\d[A-Z] ?\d[A-Z]\d$", "M5V 1J1"), "AU": (r"^\d{4}$", "2000"), "AE": (r"^\d{1,7}$", "12345"),
    "SG": (r"^\d{6}$", "018956"), "NZ": (r"^\d{4}$", "6011"), "ZA": (r"^\d{4}$", "2196"), "SA": (r"^\d{5}$", "11564"),
    "DE": (r"^\d{5}$", "10115"), "FR": (r"^\d{5}$", "75001"), "ES": (r"^\d{5}$", "28001"), "IT": (r"^\d{5}$", "00118"),
    "NL": (r"^\d{4} ?[A-Z]{2}$", "1012 AB"), "BE": (r"^\d{4}$", "1000"), "AT": (r"^\d{4}$", "1010"), "PT": (r"^\d{4}-\d{3}$", "1000-001"),
    "PL": (r"^\d{2}-\d{3}$", "00-001"), "SE": (r"^\d{3} ?\d{2}$", "111 22"), "DK": (r"^\d{4}$", "1050"), "FI": (r"^\d{5}$", "00100"),
    "IE": (r"^[A-Z]\d[\dW] ?[A-Z\d]{4}$", "D02 X285"), "CZ": (r"^\d{3} ?\d{2}$", "110 00"), "GR": (r"^\d{3} ?\d{2}$", "105 57"),
    "NO": (r"^\d{4}$", "0150"), "JP": (r"^\d{3}-?\d{4}$", "100-0001"), "CH": (r"^\d{4}$", "8001"),
}
_POSTAL_GENERIC = r"^[A-Z0-9][A-Z0-9 \-]{1,8}[A-Z0-9]$"


def postal_message(iso: Optional[str]) -> str:
    example = POSTAL.get(iso or "", (None, "560001"))[1]
    return f"Enter a valid postal code for {country_name(iso) or 'the selected country'} (for example {example})."


def _postal(value, country) -> str:
    iso = country_iso(country)
    text = " ".join(str(value).strip().upper().split())
    pattern = POSTAL.get(iso or "", (_POSTAL_GENERIC, None))[0]
    if not re.match(pattern, text):
        raise FieldRuleError(postal_message(iso))
    return text


# ── organization registration / tax number (per country and ID type, incl. check digits) ─────────────────────────────
def _org_registration(value, country, id_key=None) -> str:
    from app.core import business_ids
    iso = country_iso(country)
    message = business_ids.validate_id(iso, id_key, str(value))
    if message:
        raise FieldRuleError(message)
    return business_ids.clean(value)


# ── statutory: labels follow the employee's country (import_countries.py / employeeStatutory.js) ───────────────────────
def statutory_label(field: str, country) -> tuple[str, str]:
    """(label, example) for pan_number / uan_number / bank_account / bank_ifsc in this country."""
    from app.modules.employee import import_countries
    row = import_countries.for_country(country_name(country_iso(country)) or country)
    _heading, label, example = row["ids"][field]
    return label.replace(" (optional)", ""), example


IBAN_COUNTRIES = {"AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV",
                  "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK", "AE", "SA", "CH", "NO", "IS", "LI", "QA", "BH", "KW", "TR", "IL",
                  "JO", "PK"}
_IBAN_LENGTHS = {"DE": 22, "FR": 27, "ES": 24, "IT": 27, "NL": 18, "IE": 22, "AE": 23, "SA": 24, "BE": 16, "AT": 20, "CH": 21,
                 "PT": 25, "PL": 28, "SE": 24, "DK": 18, "FI": 18, "NO": 15, "GR": 27, "CZ": 24, "LU": 20}


def iban_ok(text: str) -> bool:
    if not re.match(r"^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$", text):
        return False
    expected = _IBAN_LENGTHS.get(text[:2])
    if expected and len(text) != expected:
        return False
    rearranged = text[4:] + text[:4]
    digits = "".join(str(int(ch, 36)) for ch in rearranged)
    return int(digits) % 97 == 1


def aba_ok(text: str) -> bool:
    if not re.match(r"^\d{9}$", text):
        return False
    d = [int(c) for c in text]
    return (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10 == 0


def _ssn_ok(digits: str) -> bool:
    area, group, serial = digits[:3], digits[3:5], digits[5:]
    if area in ("000", "666") or group == "00" or serial == "0000":
        return False
    if area.startswith("9"):                           # ITIN: 9XX with group 50–65, 70–88, 90–92, 94–99
        g = int(group)
        return 50 <= g <= 65 or 70 <= g <= 88 or 90 <= g <= 92 or 94 <= g <= 99
    return True


def _statutory(rule: str, value, country, label) -> str:
    iso = country_iso(country)
    if not iso:
        raise FieldRuleError(MESSAGES["country_first"])
    field = {"tax_id_person": "pan_number", "social_payroll_ref": "uan_number", "bank_account": "bank_account",
             "bank_routing": "bank_ifsc"}[rule]
    name, example = statutory_label(field, iso)
    raw = str(value).strip().upper()
    compact = re.sub(r"[\s\-]", "", raw)
    bad = (f"Enter a valid {label or name}" + (f" (for example {example})." if example else "."))

    if rule == "tax_id_person":
        if iso == "IN":
            ok = bool(re.match(r"^[A-Z]{5}[0-9]{4}[A-Z]$", compact))
        elif iso == "US":
            ok = bool(re.match(r"^\d{3}-?\d{2}-?\d{4}$", raw.replace(" ", ""))) and _ssn_ok(compact)
        elif iso == "GB":
            ok = bool(re.match(r"^[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]$", compact))
        else:
            ok = bool(re.match(r"^[A-Z0-9]{4,20}$", compact))
        if not ok:
            raise FieldRuleError(bad)
        return compact
    if rule == "social_payroll_ref":
        if iso == "IN":
            ok = bool(re.match(r"^\d{12}$", compact))
            result = compact
        else:
            result = raw.replace(" ", "")
            ok = bool(re.match(r"^[A-Z0-9][A-Z0-9\-]{2,18}[A-Z0-9]$", result))
        if not ok:
            raise FieldRuleError(bad)
        return result
    if rule == "bank_account":
        if iso in IBAN_COUNTRIES:
            ok = iban_ok(compact)
            bad = f"Enter a valid IBAN (for example {example or 'DE89 3704 0044 0532 0130 00'})."
        elif iso == "IN":
            ok = bool(re.match(r"^\d{9,18}$", compact))
            bad = "Enter a valid bank account number (digits only, 9–18 for India)."
        elif iso == "US":
            ok = bool(re.match(r"^\d{4,17}$", compact))
            bad = "Enter a valid bank account number (digits only, 4–17 for the United States)."
        else:
            ok = bool(re.match(r"^\d{6,20}$", compact))
            bad = "Enter a valid bank account number (digits only, 6–20)."
        if ok and iso not in IBAN_COUNTRIES and len(set(compact)) == 1:
            ok = False
        if not ok:
            raise FieldRuleError(bad)
        return compact
    # bank_routing
    if iso == "IN":
        ok = bool(re.match(r"^[A-Z]{4}0[A-Z0-9]{6}$", compact))
    elif iso == "US":
        ok = aba_ok(compact)
    elif iso in ("GB", "AU"):
        ok = bool(re.match(r"^\d{6}$", compact))
    elif iso in IBAN_COUNTRIES:
        ok = bool(re.match(r"^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$", compact))
    else:
        ok = bool(re.match(r"^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$", compact) or re.match(r"^\d{3,12}$", compact))
    if not ok:
        raise FieldRuleError(bad)
    return compact


# ── the API ─────────────────────────────────────────────────────────────────────────────────────────────────────────
FREE_TEXT = ("person_name", "person_full_name", "org_name", "org_unit", "job_title", "place_name", "address")
RULES = (*FREE_TEXT, "industry", "country", "state", "email", "phone", "postal_code", "org_registration", "tax_id_person",
         "social_payroll_ref", "bank_account", "bank_routing")


def clean(rule: str, value, country=None, label: Optional[str] = None, *, id_key: Optional[str] = None):
    """The value normalised for storage; None when blank. Raises FieldRuleError(message)."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)                             # a spreadsheet cell holding a number
    if rule in FREE_TEXT:
        return _free_text(rule, value, label)
    if rule == "industry":
        return _industry(value, label)
    if rule == "country":
        return _country(value, label)
    if rule == "state":
        return _state(value, country, label)
    if rule == "email":
        return _email(value, label)
    if rule == "phone":
        return _phone(value, country)
    if rule == "postal_code":
        return _postal(value, country)
    if rule == "org_registration":
        return _org_registration(value, country, id_key)
    if rule in ("tax_id_person", "social_payroll_ref", "bank_account", "bank_routing"):
        return _statutory(rule, value, country, label)
    raise KeyError(rule)


def problem(rule: str, value, country=None, label: Optional[str] = None, *, id_key: Optional[str] = None) -> Optional[str]:
    try:
        clean(rule, value, country, label, id_key=id_key)
        return None
    except FieldRuleError as e:
        return str(e)


def validator(rule: str, *, country_field: Optional[str] = None) -> Callable:
    """A pydantic `mode="after"` field-validator body: `return field_rules.validator("person_name")(v, info)`."""
    def run(v, info=None):
        country = None
        if country_field and info is not None and getattr(info, "data", None):
            country = info.data.get(country_field)
        try:
            return clean(rule, v, country)
        except FieldRuleError as e:
            raise ValueError(str(e))
    return run


# ── whole records ───────────────────────────────────────────────────────────────────────────────────────────────────
# Employee / user fields and the rule each one follows (Add User, Edit User, HR employee forms, ESS profile, import).
EMPLOYEE_FIELDS = {
    "first_name": "person_name", "last_name": "person_name",
    "email": "email", "work_email": "email", "personal_email": "email",
    "phone": "phone",
    "job_title": "job_title",
    "department_name": "org_unit", "designation_name": "org_unit", "business_unit": "org_unit", "division": "org_unit",
    "team": "org_unit",
    "company": "org_name",
    "current_address": "address", "permanent_address": "address", "address": "address",
    "city": "place_name", "state": "state", "country": "country", "pincode": "postal_code",
    "pan_number": "tax_id_person", "uan_number": "social_payroll_ref", "bank_account": "bank_account", "bank_ifsc": "bank_routing",
}
COUNTRY_DRIVEN = {"state", "postal_code", "phone", "tax_id_person", "social_payroll_ref", "bank_account", "bank_routing"}


def validate_record(values: dict, spec: dict, *, country=None, previous: Optional[dict] = None,
                    check_mail_domain: bool = False) -> tuple[dict, dict]:
    """(cleaned, errors) for the fields of `values` that `spec` names.

    previous: the stored values. A field whose value did not change is NOT re-checked (legacy records that predate these
    rules can still be saved), and the stored country is used when the request does not send one.
    check_mail_domain: also refuse an e-mail domain that has no mail servers (server-side only; a DNS failure is allowed).
    """
    previous = previous or {}
    cleaned, errors = {}, {}
    record_country = values.get("country") if str(values.get("country") or "").strip() else previous.get("country")
    country = country or record_country
    country_changed = bool(previous) and "country" in values and not _same(values["country"], previous.get("country"))
    for field, rule in spec.items():
        if field not in values:
            continue
        value = values[field]
        if previous and _same(value, previous.get(field)) and not (country_changed and rule in COUNTRY_DRIVEN):
            continue                                    # unchanged legacy value: leave it alone (unless its country changed)
        try:
            out = clean(rule, value, country if rule in COUNTRY_DRIVEN else None)
            if rule == "email" and out and check_mail_domain:
                problem_text = email_deliverable(out)
                if problem_text:
                    raise FieldRuleError(problem_text)
            cleaned[field] = out
        except FieldRuleError as e:
            errors[field] = str(e)
    return cleaned, errors


def _same(new, old) -> bool:
    def norm(v):
        return " ".join(str(v).split()).lower() if v not in (None, "") else ""
    return norm(new) == norm(old)


def raise_if_errors(errors: dict) -> None:
    """422 in FastAPI's usual shape, one entry per field, so a form can show each message under its own box."""
    if not errors:
        return
    from fastapi.exceptions import RequestValidationError
    raise RequestValidationError([{"type": "value_error", "loc": ("body", field), "msg": message, "input": None}
                                  for field, message in errors.items()])


# Registration (B7-B13): request field -> rule
REGISTRATION_FIELDS = {
    "organization": "org_name", "name": "person_full_name", "email": "email", "registered_email": "email",
    "phone": "phone", "tax_number": "org_registration", "industry": "industry", "address": "address",
    "city": "place_name", "state": "state", "country": "country",
}


def check_registration(data) -> None:
    """Runs the registration rules over a RegisterRequest, writes the cleaned values back and answers 422 per field."""
    values = {k: getattr(data, k, None) for k in REGISTRATION_FIELDS}
    country = values.get("country")
    cleaned, errors = {}, {}
    for field, rule in REGISTRATION_FIELDS.items():
        value = values[field]
        if value is None or (isinstance(value, str) and not value.strip()):
            continue
        try:
            out = clean(rule, value, country if rule in COUNTRY_DRIVEN | {"org_registration"} else None,
                        id_key=getattr(data, "tax_id_type", None) if rule == "org_registration" else None)
            if rule == "email" and out:
                problem_text = email_deliverable(out)
                if problem_text:
                    raise FieldRuleError(problem_text)
            cleaned[field] = out
        except FieldRuleError as e:
            errors[field] = str(e)
    raise_if_errors(errors)
    for field, value in cleaned.items():
        setattr(data, field, value)
