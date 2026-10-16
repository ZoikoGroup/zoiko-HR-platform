"""Look up a business by its tax / VAT / company registration number in the official public registers, so a form can fill
in the legal name and registered address instead of having someone type them.

Registers used (all official, queried live):
  * EU member states + Northern Ireland (XI): VIES, the European Commission's VAT number service. No key needed.
  * Norway: Brønnøysund Register Centre (Enhetsregisteret). No key needed.
  * United Kingdom: Companies House (company registration number). Needs HR_COMPANIES_HOUSE_API_KEY (free).
  * Australia: ABN Lookup (ABN). Needs HR_ABN_LOOKUP_GUID (free).

Anything else answers `supported: False` with a plain reason; the form then stays manual. Answers are cached for a day.
"""
from __future__ import annotations

import logging
import os
import re
import time
from typing import Optional

import httpx

logger = logging.getLogger("zoiko.business_registry")

EU_VIES = {"AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", "FI", "FR", "HR", "HU", "IE", "IT", "LT", "LU", "LV",
           "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK", "XI"}
TIMEOUT = 8.0
_CACHE: dict[tuple, tuple[float, dict]] = {}
_CACHE_TTL = 24 * 3600


class LookupError_(Exception):
    """A lookup that could not be answered (bad number, register unavailable)."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message, self.status = message, status


def _clean(number: str) -> str:
    return re.sub(r"[\s.\-/]", "", str(number or "")).upper()


def _result(country: str, number: str, source: str, valid: bool, name=None, address_lines=None, city=None, postcode=None,
            region=None) -> dict:
    lines = [l.strip() for l in (address_lines or []) if l and str(l).strip()]
    return {
        "supported": True, "valid": valid, "country_code": country, "number": number, "source": source,
        "legal_name": (name or "").strip() or None,
        "address": ", ".join(lines + [x for x in (city, region, postcode) if x]) or None,
        "address_lines": lines, "city": city, "postcode": postcode, "region": region,
    }


def _vies(country: str, number: str) -> dict:
    ms = "EL" if country == "GR" else country
    vat = number[2:] if number.startswith(ms) or number.startswith(country) else number
    r = httpx.get(f"https://ec.europa.eu/taxation_customs/vies/rest-api/ms/{ms}/vat/{vat}", timeout=TIMEOUT)
    if r.status_code >= 500:
        raise LookupError_("The EU VAT register (VIES) is not answering right now. Try again in a minute.", 503)
    data = r.json()
    if data.get("userError") not in (None, "VALID", "INVALID"):
        raise LookupError_(f"The EU VAT register could not check this number ({data.get('userError')}).", 503)
    valid = bool(data.get("isValid"))
    name = data.get("name") if data.get("name") not in ("---", None) else None
    address = data.get("address") if data.get("address") not in ("---", None) else None
    lines = [l for l in re.split(r"[\n\r]+", address or "") if l.strip()]
    return _result(country, f"{ms}{vat}", "EU VIES", valid, name, lines)


def _brreg(number: str) -> dict:
    r = httpx.get(f"https://data.brreg.no/enhetsregisteret/api/enheter/{number}", timeout=TIMEOUT)
    if r.status_code in (404, 400, 410):
        return _result("NO", number, "Brønnøysund Register Centre", False)
    if r.status_code >= 500:
        raise LookupError_("The Norwegian business register is not answering right now.", 503)
    d = r.json()
    a = d.get("forretningsadresse") or d.get("postadresse") or {}
    return _result("NO", number, "Brønnøysund Register Centre", True, d.get("navn"), a.get("adresse") or [], a.get("poststed"), a.get("postnummer"))


def _companies_house(number: str) -> dict:
    key = os.getenv("HR_COMPANIES_HOUSE_API_KEY", "").strip()
    if not key:
        raise LookupError_("UK lookups need a Companies House API key (HR_COMPANIES_HOUSE_API_KEY) on the server.", 501)
    r = httpx.get(f"https://api.company-information.service.gov.uk/company/{number}", auth=(key, ""), timeout=TIMEOUT)
    if r.status_code == 404:
        return _result("GB", number, "Companies House", False)
    if r.status_code >= 400:
        raise LookupError_("Companies House did not answer the lookup.", 503)
    d = r.json()
    a = d.get("registered_office_address") or {}
    return _result("GB", number, "Companies House", d.get("company_status") not in ("dissolved",), d.get("company_name"),
                   [a.get("premises"), a.get("address_line_1"), a.get("address_line_2")], a.get("locality"), a.get("postal_code"), a.get("region"))


def _abn(number: str) -> dict:
    guid = os.getenv("HR_ABN_LOOKUP_GUID", "").strip()
    if not guid:
        raise LookupError_("Australian lookups need an ABN Lookup GUID (HR_ABN_LOOKUP_GUID) on the server.", 501)
    r = httpx.get("https://abr.business.gov.au/json/AbnDetails.aspx", params={"abn": number, "guid": guid, "callback": "cb"}, timeout=TIMEOUT)
    body = r.text.strip()
    body = body[body.find("(") + 1: body.rfind(")")] if body.startswith("cb(") else body
    import json
    d = json.loads(body or "{}")
    if d.get("Message"):
        return _result("AU", number, "ABN Lookup", False)
    return _result("AU", number, "ABN Lookup", d.get("AbnStatus") == "Active", d.get("EntityName"), [], None, d.get("AddressPostcode"), d.get("AddressState"))


def lookup(country: str, number: str, id_type: str | None = None) -> dict:
    """Look the number up in the register for its country and ID type (the format is checked first)."""
    from app.core import business_ids
    country = (country or "").strip().upper()
    t = business_ids.id_type(country, id_type)
    problem = business_ids.validate_id(country, t["key"], number)
    if problem:
        raise LookupError_(problem)
    if not t.get("lookup"):
        return {"supported": False, "valid": None, "country_code": country, "number": _clean(number), "id_type": t["key"],
                "message": f"There is no public register for {t['label']} we can check. The format looks right; enter the name and address manually."}
    number = _clean(number)
    if country == "GR":
        country_key = "EL"
    else:
        country_key = country
    if not country or len(country) != 2:
        raise LookupError_("Choose the country the business is registered in.")
    if len(number) < 4 or len(number) > 20 or not number.isalnum():
        raise LookupError_("Enter the registration / VAT number without spaces or symbols.")

    cached = _CACHE.get((country, number, t["key"]))
    if cached and time.time() - cached[0] < _CACHE_TTL:
        return cached[1]

    register = t["lookup"]
    try:
        if register == "vies":
            out = _vies(country, number)
        elif register == "brreg":
            out = _brreg(re.sub(r"\D", "", number))
        elif register == "companies_house":
            out = _companies_house(number)
        elif register == "abn":
            out = _abn(re.sub(r"\D", "", number))
        else:
            return {"supported": False, "valid": None, "country_code": country, "number": number, "id_type": t["key"],
                    "message": "There is no public register we can check for this number. Enter the details manually."}
    except LookupError_:
        raise
    except (httpx.HTTPError, ValueError) as e:
        logger.warning("business register lookup failed for %s: %s", country, type(e).__name__)
        raise LookupError_("The business register could not be reached. Try again, or enter the details manually.", 503)
    out = {**out, "id_type": t["key"]}

    _CACHE[(country, number, t["key"])] = (time.time(), out)
    return out
