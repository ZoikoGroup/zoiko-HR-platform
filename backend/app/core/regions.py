"""Countries and their currencies: one source of truth for "which currency does this person's region pay in".

`country_code()` turns whatever a record holds ("India", "IN", "Bengaluru, India", "UK") into an ISO 3166-1 alpha-2 code;
`currency_for()` gives that country's ISO 4217 currency. The frontend reads the same table from /hr/reference/regions.
"""
from __future__ import annotations

import re
from typing import Optional

# (ISO 3166-1 alpha-2, name, ISO 4217 currency)
COUNTRIES: list[tuple[str, str, str]] = [
    ("AE", "United Arab Emirates", "AED"), ("AF", "Afghanistan", "AFN"), ("AL", "Albania", "ALL"), ("AM", "Armenia", "AMD"),
    ("AO", "Angola", "AOA"), ("AR", "Argentina", "ARS"), ("AT", "Austria", "EUR"), ("AU", "Australia", "AUD"),
    ("AZ", "Azerbaijan", "AZN"), ("BA", "Bosnia and Herzegovina", "BAM"), ("BD", "Bangladesh", "BDT"), ("BE", "Belgium", "EUR"),
    ("BG", "Bulgaria", "BGN"), ("BH", "Bahrain", "BHD"), ("BN", "Brunei", "BND"), ("BO", "Bolivia", "BOB"),
    ("BR", "Brazil", "BRL"), ("BT", "Bhutan", "BTN"), ("BW", "Botswana", "BWP"), ("BY", "Belarus", "BYN"),
    ("CA", "Canada", "CAD"), ("CH", "Switzerland", "CHF"), ("CL", "Chile", "CLP"), ("CN", "China", "CNY"),
    ("CO", "Colombia", "COP"), ("CR", "Costa Rica", "CRC"), ("CY", "Cyprus", "EUR"), ("CZ", "Czech Republic", "CZK"),
    ("DE", "Germany", "EUR"), ("DK", "Denmark", "DKK"), ("DO", "Dominican Republic", "DOP"), ("DZ", "Algeria", "DZD"),
    ("EC", "Ecuador", "USD"), ("EE", "Estonia", "EUR"), ("EG", "Egypt", "EGP"), ("ES", "Spain", "EUR"),
    ("ET", "Ethiopia", "ETB"), ("FI", "Finland", "EUR"), ("FJ", "Fiji", "FJD"), ("FR", "France", "EUR"),
    ("GB", "United Kingdom", "GBP"), ("GE", "Georgia", "GEL"), ("GH", "Ghana", "GHS"), ("GR", "Greece", "EUR"),
    ("GT", "Guatemala", "GTQ"), ("HK", "Hong Kong", "HKD"), ("HN", "Honduras", "HNL"), ("HR", "Croatia", "EUR"),
    ("HU", "Hungary", "HUF"), ("ID", "Indonesia", "IDR"), ("IE", "Ireland", "EUR"), ("IL", "Israel", "ILS"),
    ("IN", "India", "INR"), ("IQ", "Iraq", "IQD"), ("IS", "Iceland", "ISK"), ("IT", "Italy", "EUR"),
    ("JM", "Jamaica", "JMD"), ("JO", "Jordan", "JOD"), ("JP", "Japan", "JPY"), ("KE", "Kenya", "KES"),
    ("KH", "Cambodia", "KHR"), ("KR", "South Korea", "KRW"), ("KW", "Kuwait", "KWD"), ("KZ", "Kazakhstan", "KZT"),
    ("LA", "Laos", "LAK"), ("LB", "Lebanon", "LBP"), ("LK", "Sri Lanka", "LKR"), ("LT", "Lithuania", "EUR"),
    ("LU", "Luxembourg", "EUR"), ("LV", "Latvia", "EUR"), ("MA", "Morocco", "MAD"), ("MD", "Moldova", "MDL"),
    ("MK", "North Macedonia", "MKD"), ("MM", "Myanmar", "MMK"), ("MN", "Mongolia", "MNT"), ("MT", "Malta", "EUR"),
    ("MU", "Mauritius", "MUR"), ("MV", "Maldives", "MVR"), ("MX", "Mexico", "MXN"), ("MY", "Malaysia", "MYR"),
    ("MZ", "Mozambique", "MZN"), ("NA", "Namibia", "NAD"), ("NG", "Nigeria", "NGN"), ("NL", "Netherlands", "EUR"),
    ("NO", "Norway", "NOK"), ("NP", "Nepal", "NPR"), ("NZ", "New Zealand", "NZD"), ("OM", "Oman", "OMR"),
    ("PA", "Panama", "PAB"), ("PE", "Peru", "PEN"), ("PH", "Philippines", "PHP"), ("PK", "Pakistan", "PKR"),
    ("PL", "Poland", "PLN"), ("PT", "Portugal", "EUR"), ("PY", "Paraguay", "PYG"), ("QA", "Qatar", "QAR"),
    ("RO", "Romania", "RON"), ("RS", "Serbia", "RSD"), ("RU", "Russia", "RUB"), ("RW", "Rwanda", "RWF"),
    ("SA", "Saudi Arabia", "SAR"), ("SE", "Sweden", "SEK"), ("SG", "Singapore", "SGD"), ("SI", "Slovenia", "EUR"),
    ("SK", "Slovakia", "EUR"), ("SN", "Senegal", "XOF"), ("SV", "El Salvador", "USD"), ("TH", "Thailand", "THB"),
    ("TN", "Tunisia", "TND"), ("TR", "Turkey", "TRY"), ("TT", "Trinidad and Tobago", "TTD"), ("TW", "Taiwan", "TWD"),
    ("TZ", "Tanzania", "TZS"), ("UA", "Ukraine", "UAH"), ("UG", "Uganda", "UGX"), ("US", "United States", "USD"),
    ("UY", "Uruguay", "UYU"), ("UZ", "Uzbekistan", "UZS"), ("VE", "Venezuela", "VES"), ("VN", "Vietnam", "VND"),
    ("ZA", "South Africa", "ZAR"), ("ZM", "Zambia", "ZMW"), ("ZW", "Zimbabwe", "USD"),
]

CURRENCY_NAMES: dict[str, str] = {
    "USD": "US Dollar", "EUR": "Euro", "GBP": "British Pound", "INR": "Indian Rupee", "AED": "UAE Dirham", "AUD": "Australian Dollar",
    "CAD": "Canadian Dollar", "SGD": "Singapore Dollar", "JPY": "Japanese Yen", "CNY": "Chinese Yuan", "CHF": "Swiss Franc",
    "NZD": "New Zealand Dollar", "ZAR": "South African Rand", "SAR": "Saudi Riyal", "QAR": "Qatari Riyal", "KWD": "Kuwaiti Dinar",
    "BHD": "Bahraini Dinar", "OMR": "Omani Rial", "HKD": "Hong Kong Dollar", "SEK": "Swedish Krona", "NOK": "Norwegian Krone",
    "DKK": "Danish Krone", "PLN": "Polish Zloty", "CZK": "Czech Koruna", "HUF": "Hungarian Forint", "RON": "Romanian Leu",
    "BGN": "Bulgarian Lev", "TRY": "Turkish Lira", "ILS": "Israeli Shekel", "EGP": "Egyptian Pound", "NGN": "Nigerian Naira",
    "KES": "Kenyan Shilling", "GHS": "Ghanaian Cedi", "PKR": "Pakistani Rupee", "BDT": "Bangladeshi Taka", "LKR": "Sri Lankan Rupee",
    "NPR": "Nepalese Rupee", "MYR": "Malaysian Ringgit", "IDR": "Indonesian Rupiah", "PHP": "Philippine Peso", "THB": "Thai Baht",
    "VND": "Vietnamese Dong", "KRW": "South Korean Won", "TWD": "Taiwan Dollar", "BRL": "Brazilian Real", "MXN": "Mexican Peso",
    "ARS": "Argentine Peso", "CLP": "Chilean Peso", "COP": "Colombian Peso", "PEN": "Peruvian Sol", "RUB": "Russian Ruble",
    "UAH": "Ukrainian Hryvnia", "MAD": "Moroccan Dirham",
}

_BY_CODE = {c: (c, n, cur) for c, n, cur in COUNTRIES}
_ALIASES = {
    "usa": "US", "us": "US", "u.s.": "US", "u.s.a.": "US", "america": "US", "united states of america": "US",
    "uk": "GB", "u.k.": "GB", "england": "GB", "scotland": "GB", "wales": "GB", "northern ireland": "GB", "great britain": "GB", "britain": "GB",
    "uae": "AE", "u.a.e.": "AE", "dubai": "AE", "abu dhabi": "AE", "korea": "KR", "republic of korea": "KR", "czechia": "CZ",
    "holland": "NL", "the netherlands": "NL", "türkiye": "TR", "turkiye": "TR", "russian federation": "RU", "viet nam": "VN",
    "bharat": "IN", "bengaluru": "IN", "bangalore": "IN", "mumbai": "IN", "delhi": "IN", "new delhi": "IN", "hyderabad": "IN",
    "chennai": "IN", "pune": "IN", "kolkata": "IN", "london": "GB", "manchester": "GB", "new york": "US", "san francisco": "US",
    "singapore city": "SG", "toronto": "CA", "sydney": "AU", "melbourne": "AU", "berlin": "DE", "paris": "FR",
}
_BY_NAME = {n.lower(): c for c, n, _ in COUNTRIES}

DEFAULT_CURRENCY = "USD"


def all_currencies() -> list[str]:
    return sorted({cur for _, _, cur in COUNTRIES} | set(CURRENCY_NAMES))


def is_currency(code: Optional[str]) -> bool:
    return bool(code) and code.upper() in set(all_currencies())


def _lookup(token: str) -> Optional[str]:
    t = token.strip().strip(".").lower()
    if not t:
        return None
    if len(t) == 2 and t.upper() in _BY_CODE:
        return t.upper()
    return _BY_NAME.get(t) or _ALIASES.get(t) or _ALIASES.get(t + ".")


def country_code(value: Optional[str]) -> Optional[str]:
    """ISO alpha-2 for a country name, code, alias, or a free-text location that ends in (or mentions) one."""
    if not value:
        return None
    text = str(value).strip()
    hit = _lookup(text)
    if hit:
        return hit
    parts = [p for p in re.split(r"[,/|\-–()]", text) if p.strip()]
    for part in reversed(parts):                 # "City, State, Country": the country is usually last
        hit = _lookup(part)
        if hit:
            return hit
    low = text.lower()
    for name, code in sorted(_BY_NAME.items(), key=lambda kv: -len(kv[0])):
        if re.search(rf"\b{re.escape(name)}\b", low):
            return code
    for alias, code in _ALIASES.items():
        if len(alias) > 3 and re.search(rf"\b{re.escape(alias)}\b", low):
            return code
    return None


def country_code_strict(value: Optional[str]) -> Optional[str]:
    """ISO alpha-2 only when the whole value IS a country code, name or alias. No scanning of free text: for legal
    jurisdiction facts a near-miss must stay unknown (country_code() would read "New Jersey, USA" or "Indiana" loosely)."""
    if not value:
        return None
    t = str(value).strip().strip(".").lower()
    if t in _CITY_ALIASES:
        return None
    return _lookup(t)


# Aliases above that name a city, not a country: fine for display defaults, never for a jurisdiction fact.
_CITY_ALIASES = {
    "dubai", "abu dhabi", "bengaluru", "bangalore", "mumbai", "delhi", "new delhi", "hyderabad", "chennai", "pune", "kolkata",
    "london", "manchester", "new york", "san francisco", "singapore city", "toronto", "sydney", "melbourne", "berlin", "paris",
}


def currency_for(country: Optional[str], fallback: Optional[str] = None) -> str:
    code = country_code(country)
    if code:
        return _BY_CODE[code][2]
    return (fallback or DEFAULT_CURRENCY).upper()


def country_name(code: Optional[str]) -> Optional[str]:
    return _BY_CODE[code][1] if code and code in _BY_CODE else None


def reference_payload() -> dict:
    return {
        "countries": [{"code": c, "name": n, "currency": cur} for c, n, cur in sorted(COUNTRIES, key=lambda x: x[1])],
        "currencies": [{"code": c, "name": CURRENCY_NAMES.get(c, c)} for c in all_currencies()],
    }
