"""How a business is identified and addressed in each country: which registration / tax numbers exist (GSTIN, EIN, ABN,
TRN, VAT...), what they look like, which of them a public register can look up, and how an address is written there
(state vs province vs emirate, PIN code vs ZIP vs postcode, the list of regions).

One table drives both the form (served by /hr/reference/business-formats) and the server-side checks, so they agree.
"""
from __future__ import annotations

import re
from typing import Optional

EU_VAT = {"AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV",
          "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"}

REGIONS = {
    "IN": ["Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
           "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
           "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
           "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
           "Uttar Pradesh", "Uttarakhand", "West Bengal"],
    "US": ["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "District of Columbia",
           "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine",
           "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
           "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
           "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia",
           "Washington", "West Virginia", "Wisconsin", "Wyoming"],
    "CA": ["Alberta", "British Columbia", "Manitoba", "New Brunswick", "Newfoundland and Labrador", "Northwest Territories",
           "Nova Scotia", "Nunavut", "Ontario", "Prince Edward Island", "Quebec", "Saskatchewan", "Yukon"],
    "AU": ["Australian Capital Territory", "New South Wales", "Northern Territory", "Queensland", "South Australia", "Tasmania",
           "Victoria", "Western Australia"],
    "AE": ["Abu Dhabi", "Ajman", "Dubai", "Fujairah", "Ras Al Khaimah", "Sharjah", "Umm Al Quwain"],
    "GB": ["England", "Northern Ireland", "Scotland", "Wales"],
}


def _id(key, label, placeholder, pattern, hint, lookup=False, checksum=None):
    return {"key": key, "label": label, "placeholder": placeholder, "pattern": pattern, "hint": hint, "lookup": lookup,
            "checksum": checksum}


# country -> ID types (the first is the default) and address conventions
FORMATS: dict[str, dict] = {
    "IN": {"ids": [
        _id("gstin", "GSTIN", "27AAPFU0939F1ZV", r"^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$", "15 characters: state code, PAN, entity code, Z, check digit.", checksum="gstin"),
        _id("cin", "CIN (company)", "L17110MH1973PLC019786", r"^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$", "21 characters from the MCA certificate of incorporation."),
        _id("pan", "PAN", "AAPFU0939F", r"^[A-Z]{5}\d{4}[A-Z]$", "10 characters: 5 letters, 4 digits, 1 letter."),
        _id("llpin", "LLPIN (LLP)", "AAA-1234", r"^[A-Z]{3}\d{4}$", "LLP identification number."),
    ], "region_label": "State / UT", "postal_label": "PIN code", "postal_pattern": r"^\d{6}$", "postal_placeholder": "400001"},
    "US": {"ids": [
        _id("ein", "EIN", "12-3456789", r"^\d{9}$", "Employer Identification Number (9 digits, written 12-3456789)."),
    ], "region_label": "State", "postal_label": "ZIP code", "postal_pattern": r"^\d{5}(-\d{4})?$", "postal_placeholder": "94105"},
    "GB": {"ids": [
        _id("company_number", "Company number", "00445790", r"^([A-Z]{2}\d{6}|\d{8})$", "8 characters from Companies House (e.g. 00445790, SC123456).", lookup="companies_house"),
        _id("vat", "VAT number", "GB123456789", r"^(GB)?(\d{9}|\d{12}|GD\d{3}|HA\d{3})$", "GB followed by 9 digits."),
        _id("utr", "UTR", "1234567890", r"^\d{10}$", "10-digit Unique Taxpayer Reference."),
    ], "region_label": "Nation", "postal_label": "Postcode", "postal_pattern": r"^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$", "postal_placeholder": "SW1A 1AA"},
    "CA": {"ids": [
        _id("bn", "Business Number (BN)", "123456789RT0001", r"^\d{9}([A-Z]{2}\d{4})?$", "9-digit BN, optionally with a program account (RT0001)."),
    ], "region_label": "Province / territory", "postal_label": "Postal code", "postal_pattern": r"^[A-Z]\d[A-Z] ?\d[A-Z]\d$", "postal_placeholder": "M5V 1J1"},
    "AU": {"ids": [
        _id("abn", "ABN", "51 824 753 556", r"^\d{11}$", "11-digit Australian Business Number.", lookup="abn", checksum="abn"),
        _id("acn", "ACN", "004 085 616", r"^\d{9}$", "9-digit Australian Company Number.", checksum="acn"),
    ], "region_label": "State / territory", "postal_label": "Postcode", "postal_pattern": r"^\d{4}$", "postal_placeholder": "2000"},
    "AE": {"ids": [
        _id("trn", "TRN", "100123456700003", r"^\d{15}$", "15-digit Tax Registration Number from the FTA."),
        _id("trade_license", "Trade licence no.", "CN-1234567", r"^[A-Z0-9\-/]{4,20}$", "Number on the trade licence."),
    ], "region_label": "Emirate", "postal_label": "P.O. Box", "postal_pattern": r"^\d{1,7}$", "postal_placeholder": "12345"},
    "SG": {"ids": [
        _id("uen", "UEN", "201912345K", r"^(\d{8}[A-Z]|\d{9}[A-Z]|[TSR]\d{2}[A-Z]{2}\d{4}[A-Z])$", "Unique Entity Number from ACRA."),
        _id("gst", "GST reg. no.", "M90312345A", r"^([A-Z]\d{8}[A-Z]|\d{9}[A-Z])$", "GST registration number (often the UEN)."),
    ], "region_label": None, "postal_label": "Postal code", "postal_pattern": r"^\d{6}$", "postal_placeholder": "018956"},
    "NO": {"ids": [
        _id("orgnr", "Organisation number", "923609016", r"^\d{9}$", "9-digit organisasjonsnummer.", lookup="brreg"),
    ], "region_label": None, "postal_label": "Postnummer", "postal_pattern": r"^\d{4}$", "postal_placeholder": "0150"},
    "NZ": {"ids": [
        _id("nzbn", "NZBN", "9429041234567", r"^94\d{11}$", "13-digit New Zealand Business Number."),
        _id("gst", "GST number", "123-456-789", r"^\d{8,9}$", "8 or 9 digits."),
    ], "region_label": "Region", "postal_label": "Postcode", "postal_pattern": r"^\d{4}$", "postal_placeholder": "6011"},
    "ZA": {"ids": [
        _id("vat", "VAT number", "4123456789", r"^4\d{9}$", "10 digits starting with 4."),
        _id("cipc", "Company reg. no.", "2019/123456/07", r"^\d{12}$", "CIPC registration number (YYYY/NNNNNN/NN)."),
    ], "region_label": "Province", "postal_label": "Postal code", "postal_pattern": r"^\d{4}$", "postal_placeholder": "2196"},
    "SA": {"ids": [
        _id("vat", "VAT number", "300123456700003", r"^3\d{13}3$", "15 digits, starting and ending with 3."),
        _id("cr", "Commercial registration", "1010123456", r"^\d{10}$", "10-digit CR number."),
    ], "region_label": "Region", "postal_label": "Postal code", "postal_pattern": r"^\d{5}$", "postal_placeholder": "11564"},
}
_EU_POSTAL = {"DE": r"^\d{5}$", "FR": r"^\d{5}$", "ES": r"^\d{5}$", "IT": r"^\d{5}$", "NL": r"^\d{4} ?[A-Z]{2}$",
              "BE": r"^\d{4}$", "AT": r"^\d{4}$", "PT": r"^\d{4}-\d{3}$", "PL": r"^\d{2}-\d{3}$", "SE": r"^\d{3} ?\d{2}$",
              "DK": r"^\d{4}$", "FI": r"^\d{5}$", "IE": r"^[A-Z]\d[\dW] ?[A-Z\d]{4}$", "CZ": r"^\d{3} ?\d{2}$", "GR": r"^\d{3} ?\d{2}$"}
for _cc in EU_VAT:
    FORMATS.setdefault(_cc, {"ids": [
        _id("vat", "VAT number", f"{'EL' if _cc == 'GR' else _cc}123456789", r"^[A-Z0-9]{2,14}$",
            f"EU VAT number; the {'EL' if _cc == 'GR' else _cc} prefix is added for you. Verified with the EU VIES register.", lookup="vies"),
    ], "region_label": "Region", "postal_label": "Postal code", "postal_pattern": _EU_POSTAL.get(_cc), "postal_placeholder": None})

DEFAULT = {"ids": [_id("tax_id", "Tax / registration number", "", r"^[A-Z0-9]{4,30}$", "The business's tax or company registration number.")],
           "region_label": "State / region", "postal_label": "Postal code", "postal_pattern": None, "postal_placeholder": None}


def clean(number: Optional[str]) -> str:
    return re.sub(r"[\s.\-/]", "", str(number or "")).upper()


def format_for(country: Optional[str]) -> dict:
    return FORMATS.get((country or "").upper(), DEFAULT)


def id_type(country: Optional[str], key: Optional[str]) -> dict:
    ids = format_for(country)["ids"]
    return next((i for i in ids if i["key"] == key), ids[0])


# ── check digits ─────────────────────────────────────────────────────────────────────────────────────────────────────
def _gstin_ok(v: str) -> bool:
    chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    total = 0
    for i, ch in enumerate(v[:14]):
        product = chars.index(ch) * (2 if i % 2 else 1)
        total += product // 36 + product % 36
    return chars[(36 - total % 36) % 36] == v[14]


def _abn_ok(v: str) -> bool:
    weights = (10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19)
    digits = [int(c) for c in v]
    digits[0] -= 1
    return sum(d * w for d, w in zip(digits, weights)) % 89 == 0


def _acn_ok(v: str) -> bool:
    total = sum(int(c) * w for c, w in zip(v[:8], (8, 7, 6, 5, 4, 3, 2, 1)))
    return (10 - total % 10) % 10 == int(v[8])


_CHECKSUMS = {"gstin": _gstin_ok, "abn": _abn_ok, "acn": _acn_ok}


def validate_id(country: Optional[str], key: Optional[str], number: Optional[str]) -> Optional[str]:
    """None when the number fits the country's format for that ID type, else a message for the person filling the form."""
    if not number:
        return None
    t = id_type(country, key)
    v = clean(number)
    if t["key"] == "vat" and (country or "").upper() in EU_VAT:
        prefix = "EL" if country.upper() == "GR" else country.upper()
        v = v[len(prefix):] if v.startswith(prefix) else v
    if not re.match(t["pattern"], v):
        return f"That doesn't look like a valid {t['label']}. {t['hint']}"
    check = _CHECKSUMS.get(t.get("checksum") or "")
    if check and not check(v):
        return f"That {t['label']} fails its check digit. Please re-check the number."
    return None


def validate_postal(country: Optional[str], postal: Optional[str]) -> Optional[str]:
    if not postal:
        return None
    f = format_for(country)
    if f.get("postal_pattern") and not re.match(f["postal_pattern"], str(postal).strip().upper()):
        return f"Enter a valid {f['postal_label']}" + (f" (e.g. {f['postal_placeholder']})." if f.get("postal_placeholder") else ".")
    return None


def payload() -> dict:
    """Everything the form needs, keyed by ISO country code, plus the fallback used for any other country."""
    def public(f):
        return {**{k: v for k, v in f.items() if k != "ids"},
                "ids": [{k: v for k, v in i.items() if k != "checksum"} for i in f["ids"]]}
    return {"countries": {cc: {**public(f), "regions": REGIONS.get(cc)} for cc, f in FORMATS.items()},
            "default": {**public(DEFAULT), "regions": None}}
