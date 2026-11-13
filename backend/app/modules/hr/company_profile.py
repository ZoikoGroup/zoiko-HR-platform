"""Company Profile: every organisation's own employer particulars, kept in Settings.

It is the only source of employer details printed in generated documents (the onboarding package first). Stored as one
JSON row per organisation in `organization_configs` under PROFILE_KEY, next to the offer-package settings
(`onboarding_package.config`), which reads the employer fields it shares from here (see OWNED_BY_PROFILE).

Rules:
- Company particulars are only what HR entered or confirmed. A new organisation's profile starts empty; nothing is copied
  from the Organization record. `prefill()` only *proposes* values from that record for HR to review and save.
- Every read and write is scoped by organization_id.
- Every save writes one organisation-activity audit event (which keys changed; registration numbers are masked).
"""
from __future__ import annotations

import json
import logging
import re
from typing import Optional

from fastapi import HTTPException

from app.modules.hr.models import Organization, OrganizationConfig

logger = logging.getLogger("zoiko.company_profile")

PROFILE_KEY = "company_profile.config"
LEGACY_KEY = "onboarding_package.config"        # where the employer fields lived before the Company Profile existed
VERSION = 1

EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")
URL = re.compile(r"^(https?://)?[A-Za-z0-9.-]+\.[A-Za-z]{2,}(/\S*)?$")
NOTICE_UNITS = ("calendar_days", "business_days", "weeks", "months")

# key: (group, label, kind, options) — kind: text | email | url | bool | int | enum | list | hex | country | currency | regid
# options: max length for text/list items, (min, max) for int, allowed values for enum, ID type for regid
FIELDS: dict[str, tuple] = {
    # Identity
    "legal_name": ("identity", "Legal name", "text", 200),
    "short_name": ("identity", "Short name", "text", 200),
    "group_name": ("identity", "Group name", "text", 200),
    "header_label": ("identity", "Document header label", "text", 60),
    "associated_companies_clause": ("identity", "Add \"(and its associated companies)\" in agreements", "bool", None),
    "cin": ("identity", "CIN", "regid", "cin"),
    "gstin": ("identity", "GSTIN", "regid", "gstin"),
    "pan": ("identity", "PAN", "regid", "pan"),
    "other_registration_type": ("identity", "Other registration type", "text", 60),
    "other_registration_number": ("identity", "Other registration number", "text", 60),
    # Registered address (structured)
    "address_line1": ("address", "Address line 1", "text", 200),
    "address_line2": ("address", "Address line 2", "text", 200),
    "city": ("address", "City", "text", 100),
    "city_display": ("address", "City as printed", "text", 100),
    "district": ("address", "District", "text", 100),
    "state": ("address", "State / region", "text", 100),
    "postal_code": ("address", "Postal code", "text", 20),
    "country": ("address", "Country", "country", None),
    # Contacts
    "phone": ("contacts", "Phone", "text", 40),
    "website": ("contacts", "Website", "url", 255),
    "general_email": ("contacts", "General e-mail", "email", 255),
    "hr_contact_name": ("contacts", "HR contact name", "text", 200),
    "hr_contact_email": ("contacts", "HR contact e-mail", "email", 255),
    "onboarding_return_email": ("contacts", "Return signed documents to", "email", 255),
    "reports_email": ("contacts", "Daily report e-mail", "email", 255),
    "reports_channel_text": ("contacts", "Daily report channel", "text", 200),
    # Signatory
    "signatory_name": ("signatory", "Signatory name", "text", 200),
    "signatory_title": ("signatory", "Signatory title", "text", 200),
    "signatory_sign_off": ("signatory", "Sign-off", "text", 120),
    "signatory_id": ("signatory", "Authorised signatory record", "int", (1, 2**31 - 1)),
    # Legal & policy defaults
    "jurisdiction_country": ("legal", "Jurisdiction country", "country", None),
    "jurisdiction_city": ("legal", "Jurisdiction city", "text", 100),
    "governing_law_text": ("legal", "Governing law wording", "text", 500),
    "notice_period_value": ("legal", "Notice period (employee)", "int", (0, 365)),
    "notice_period_unit": ("legal", "Notice period unit (employee)", "enum", NOTICE_UNITS),
    "employer_notice_value": ("legal", "Notice period (employer)", "int", (0, 365)),
    "employer_notice_unit": ("legal", "Notice period unit (employer)", "enum", NOTICE_UNITS),
    "non_solicit_post_termination_months": ("legal", "Non-solicitation after termination (months)", "int", (0, 60)),
    "nda_non_solicit_months": ("legal", "NDA non-solicitation (months)", "int", (0, 60)),
    "nda_non_compete_months": ("legal", "NDA non-compete (months)", "int", (0, 60)),
    "nda_confidentiality_duration": ("legal", "NDA confidentiality duration", "text", 120),
    "pay_day_of_month": ("legal", "Pay day of month", "int", (1, 28)),
    "pay_frequency": ("legal", "Pay frequency", "text", 60),
    "stipend_gross_label": ("legal", "Print \"(gross)\" after pay", "bool", None),
    "time_tracking_tool_name": ("legal", "Time-tracking tool", "text", 120),
    "task_system_name": ("legal", "Task / project system", "text", 200),
    "compliance_documents": ("legal", "Documents to submit before starting", "list", 120),
    "affidavit_submission_hours": ("legal", "Affidavit due within (hours)", "int", (1, 720)),
    "affidavit_requires_notary": ("legal", "Affidavit needs a notary", "bool", None),
    "affidavit_stamp_paper_note": ("legal", "Stamp paper note", "text", 500),
    "brands": ("legal", "Brands", "list", 80),
    "brand_label": ("legal", "Brand column label", "text", 60),
    "copyright_holder": ("legal", "Copyright holder", "text", 200),
    "velocity_motto": ("legal", "Velocity report motto", "text", 200),
    "velocity_deadline_text": ("legal", "Velocity report deadline", "text", 200),
    # Formatting
    "brand_primary": ("formatting", "Primary colour", "hex", None),
    "brand_accent": ("formatting", "Accent colour", "hex", None),
    "paper": ("formatting", "Paper size", "enum", ("A4", "LETTER")),
    "spelling": ("formatting", "Spelling", "enum", ("UK", "US")),
    "date_format": ("formatting", "Date format", "enum", ("DMY", "MDY")),
    "name_caps_in_address_block": ("formatting", "Employee name in capitals in address blocks", "bool", None),
    "currency": ("formatting", "Currency", "currency", None),
    "number_grouping": ("formatting", "Number grouping", "enum", ("indian", "international")),
}
LIST_MAX_ITEMS = {"compliance_documents": 20, "brands": 30}
REGISTRATION_KEYS = {"cin", "gstin", "pan", "other_registration_number"}      # masked in the audit log

# required before documents can be issued (completeness)
REQUIRED = ("legal_name", "address_line1", "city", "state", "postal_code", "country", "hr_contact_name", "hr_contact_email",
            "signatory_name", "signatory_title", "jurisdiction_country", "jurisdiction_city", "notice_period_value",
            "notice_period_unit")

# The offer-package settings fields this profile owns: onboarding_package.get_config prints these from here, and a save of
# any of them through the offer-package settings API is written here.
OWNED_BY_PROFILE = ("legal_name", "header_label", "signatory_name", "signatory_title", "hr_contact_name", "hr_contact_email",
                    "brand_primary", "brand_accent", "paper", "spelling", "date_format", "pay_frequency")

_US = {"us", "usa", "united states", "united states of america"}
_CURRENCY_BY_COUNTRY = {"IN": "INR", "US": "USD", "GB": "GBP", "AE": "AED", "SG": "SGD", "AU": "AUD", "CA": "CAD",
                        "NZ": "NZD", "IE": "EUR", "DE": "EUR", "FR": "EUR", "NL": "EUR", "ES": "EUR", "IT": "EUR"}


# ── defaults ─────────────────────────────────────────────────────────────────────────────────────────────────────────

def _org_country_code(org) -> str:
    """The organisation's country as ISO-2, for formatting defaults only (never printed as a company particular)."""
    from app.core import regions
    raw = (getattr(org, "country", "") or "").strip()
    if raw.lower() in _US:
        return "US"
    return (regions.country_code(raw) or "").upper() if raw else ""


def defaults(org) -> dict:
    """An empty profile. Only the formatting defaults follow the organisation's country (paper, spelling, date format,
    currency, grouping); no company particular is ever taken from the Organization record."""
    cc = _org_country_code(org)
    us = cc == "US"
    currency = _CURRENCY_BY_COUNTRY.get(cc, "")
    out = {}
    for key, (_g, _l, kind, _o) in FIELDS.items():
        out[key] = [] if kind == "list" else (False if kind == "bool" else (None if kind == "int" else ""))
    out.update({
        "brand_primary": "#0B3D91", "brand_accent": "#00A3E0",
        "paper": "LETTER" if us else "A4", "spelling": "US" if us else "UK", "date_format": "MDY" if us else "DMY",
        "currency": currency, "number_grouping": "indian" if currency == "INR" else "international",
        "name_caps_in_address_block": True, "stipend_gross_label": False, "associated_companies_clause": False,
        "affidavit_requires_notary": False,
    })
    out["registered_address_text"] = ""          # a free-text address entered before addresses were structured
    return out


# ── storage ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def _row(db, organization_id: int, key: str = PROFILE_KEY):
    return db.query(OrganizationConfig).filter(OrganizationConfig.organization_id == organization_id,
                                               OrganizationConfig.key == key).first()


def _load(row) -> dict:
    if row is None or not row.value:
        return {}
    try:
        stored = json.loads(row.value)
        return stored if isinstance(stored, dict) else {}
    except json.JSONDecodeError:
        logger.warning("company profile row %s is not valid JSON", getattr(row, "id", None))
        return {}


def _write(db, organization_id: int, profile: dict) -> None:
    row = _row(db, organization_id)
    if row is None:
        row = OrganizationConfig(organization_id=organization_id, key=PROFILE_KEY, category="company_profile",
                                 description="Company Profile: the employer particulars printed in generated documents")
        db.add(row)
    row.value = json.dumps({**profile, "_version": VERSION})
    db.commit()


def _migrate_legacy(db, organization_id: int, profile: dict) -> dict:
    """First read for an organisation that has no profile yet: carry over the employer fields it already saved in the
    offer-package settings (idempotent: runs only while no profile row exists)."""
    legacy = _load(_row(db, organization_id, LEGACY_KEY))
    carried = []
    for key in OWNED_BY_PROFILE:
        value = legacy.get(key)
        if value not in (None, ""):
            profile[key] = value
            carried.append(key)
    if (legacy.get("registered_address") or "").strip():
        profile["registered_address_text"] = legacy["registered_address"].strip()
        carried.append("registered_address")
    if carried:
        logger.info("company profile for org %s created from the offer-package settings: %s", organization_id, ", ".join(carried))
    return profile


def ensure_profile(db, organization_id: int) -> None:
    """Make sure the organisation has its profile row (new organisations, and the start-up backfill)."""
    if _row(db, organization_id) is None:
        get_profile(db, organization_id)


def backfill_all(db) -> int:
    """Create the profile row for every organisation that has none. Idempotent; returns how many were created."""
    have = {oid for (oid,) in db.query(OrganizationConfig.organization_id).filter(OrganizationConfig.key == PROFILE_KEY).all()}
    created = 0
    for (oid,) in db.query(Organization.id).all():
        if oid not in have:
            get_profile(db, oid)
            created += 1
    return created


def get_profile(db, organization_id: int) -> dict:
    """The organisation's profile: defaults, overlaid with what is stored. Creates the row on first read."""
    profile = defaults(db.get(Organization, organization_id))
    row = _row(db, organization_id)
    if row is None:
        profile = _migrate_legacy(db, organization_id, profile)
        _write(db, organization_id, profile)
        return profile
    stored = _load(row)
    profile.update({k: v for k, v in stored.items() if k in profile and v is not None})
    return profile


# ── derived values used by the documents ─────────────────────────────────────────────────────────────────────────────

def address_parts(profile: dict) -> list[str]:
    """The registered address as printed lines: structured parts when entered, else the legacy free-text address."""
    if not (profile.get("address_line1") or "").strip():
        text = (profile.get("registered_address_text") or "").strip()
        return [ln.strip() for ln in text.splitlines() if ln.strip()]
    from app.core import regions
    city = (profile.get("city_display") or profile.get("city") or "").strip()
    postal = (profile.get("postal_code") or "").strip()
    country = regions.country_name(profile.get("country") or "") or (profile.get("country") or "")
    lines = [profile.get("address_line1"), profile.get("address_line2"),
             " ".join(p for p in (city, postal) if p) if (profile.get("country") or "").upper() != "IN"
             else "-".join(p for p in (city, postal) if p),
             profile.get("district"), profile.get("state"), country]
    return [str(p).strip().rstrip(".") for p in lines if p and str(p).strip()]


def registered_address(profile: dict) -> str:
    """The registered address on one line (the offer-package settings' `registered_address`)."""
    return ", ".join(address_parts(profile))


# ── validation and saving ────────────────────────────────────────────────────────────────────────────────────────────

def _clean(key: str, value, errors: dict):
    _g, label, kind, opt = FIELDS[key]
    if kind == "bool":
        return bool(value)
    if kind == "int":
        if value in (None, ""):
            return None
        try:
            n = int(value)
        except (TypeError, ValueError):
            errors[key] = f"{label} must be a whole number."
            return None
        lo, hi = opt
        if not lo <= n <= hi:
            errors[key] = f"{label} must be between {lo} and {hi}."
        return n
    if kind == "list":
        items = value if isinstance(value, list) else []
        out = [str(i).strip()[:opt] for i in items if str(i or "").strip()]
        limit = LIST_MAX_ITEMS.get(key, 30)
        if len(out) > limit:
            errors[key] = f"{label}: at most {limit} entries."
        return out[:limit]
    text = str(value or "").strip()
    if kind == "text":
        if len(text) > opt:
            errors[key] = f"{label} must be {opt} characters or fewer."
        return text[:opt]
    if not text:
        return ""
    if kind == "email":
        if len(text) > opt or not EMAIL.match(text):
            errors[key] = f"{label} is not a valid e-mail address."
        return text
    if kind == "url":
        if len(text) > opt or not URL.match(text):
            errors[key] = f"{label} is not a valid web address."
        return text
    if kind == "hex":
        if not HEX.match(text):
            errors[key] = f"{label} must be a hex colour such as #0B3D91."
        return text.upper()
    if kind == "enum":
        v = text.upper() if opt[0].isupper() else text.lower()
        if v not in opt:
            errors[key] = f"{label} must be one of {', '.join(opt)}."
        return v
    if kind == "country":
        v = text.upper()
        from app.core import regions
        if not re.fullmatch(r"[A-Z]{2}", v) or not regions.country_name(v):
            errors[key] = f"{label} must be a 2-letter country code such as IN."
        return v
    if kind == "currency":
        v = text.upper()
        if not re.fullmatch(r"[A-Z]{3}", v):
            errors[key] = f"{label} must be a 3-letter currency code such as INR."
        return v
    if kind == "regid":
        from app.core import business_ids
        v = business_ids.clean(text)
        msg = business_ids.validate_id("IN", opt, v)
        if msg:
            errors[key] = msg
        return v
    return text


def _validate_cross(profile: dict, errors: dict) -> None:
    from app.core import business_ids
    if profile.get("postal_code") and "postal_code" not in errors:
        msg = business_ids.validate_postal(profile.get("country") or None, profile["postal_code"])
        if msg:
            errors["postal_code"] = msg
    if bool(profile.get("employer_notice_value") is not None) != bool(profile.get("employer_notice_unit")):
        errors.setdefault("employer_notice_unit", "Enter both the employer's notice period and its unit, or neither.")


def _audit(db, actor, organization_id: int, before: dict, after: dict) -> None:
    changed = [k for k in after if k in FIELDS and before.get(k) != after.get(k)]
    if not changed:
        return
    try:
        from app.modules.super_admin.activity_service import record_activity
        changes = []
        for k in changed:
            masked = k in REGISTRATION_KEYS
            changes.append({"field": k, "label": FIELDS[k][1], "masked": masked,
                            "before": "••••" if masked and before.get(k) else before.get(k),
                            "after": "••••" if masked and after.get(k) else after.get(k)})
        record_activity(db, action_type="settings.company_profile_updated", actor=actor, organization_id=organization_id,
                        target_name="Company Profile", entity_type="company_profile", changes=changes,
                        details={"changed_keys": changed})
    except Exception:
        db.rollback()
        logger.exception("company profile audit event failed for org %s", organization_id)


def save_profile(db, actor, data: dict, *, partial_keys: Optional[set] = None) -> dict:
    """Validate and save. Raises 422 with {"message", "errors": {key: message}} when anything is invalid; nothing is saved
    then. `data` may hold any subset of the fields; unknown keys are rejected."""
    organization_id = actor.organization_id
    if not isinstance(data, dict):
        raise HTTPException(422, {"message": "The company profile must be an object.", "errors": {}})
    before = get_profile(db, organization_id)
    profile = dict(before)
    errors: dict = {}
    for key, value in data.items():
        if key == "registered_address_text":
            profile[key] = str(value or "").strip()[:500]
            continue
        if key not in FIELDS:
            errors[key] = "Unknown field."
            continue
        profile[key] = _clean(key, value, errors)
    _validate_cross(profile, errors)
    if profile.get("signatory_id") and "signatory_id" not in errors:
        from app.modules.doc_templates.models import AuthorisedSignatory
        sig = db.get(AuthorisedSignatory, profile["signatory_id"])
        if sig is None or sig.organization_id != organization_id:
            errors["signatory_id"] = "That authorised signatory was not found."
    if errors:
        raise HTTPException(422, {"message": "Some company details need correcting.", "errors": errors})
    _write(db, organization_id, profile)
    _audit(db, actor, organization_id, before, profile)
    return profile


def update_owned_fields(db, actor, values: dict) -> None:
    """Called by the offer-package settings save for the employer fields this profile owns (already validated there)."""
    data = {k: v for k, v in values.items() if k in OWNED_BY_PROFILE}
    if "registered_address" in values:
        data["registered_address_text"] = values["registered_address"]
    if data:
        save_profile(db, actor, data)


# ── views ────────────────────────────────────────────────────────────────────────────────────────────────────────────

def completeness(profile: dict) -> dict:
    missing = []
    for key in REQUIRED:
        v = profile.get(key)
        if v in (None, "", []):
            missing.append({"key": key, "label": FIELDS[key][1]})
    done = len(REQUIRED) - len(missing)
    return {"percent": round(100 * done / len(REQUIRED)), "required": len(REQUIRED), "missing": missing,
            "complete": not missing}


def fields_spec() -> list[dict]:
    return [{"key": k, "group": g, "label": l, "kind": kind, "required": k in REQUIRED,
             "options": list(o) if kind == "enum" else None} for k, (g, l, kind, o) in FIELDS.items()]


def profile_view(db, organization_id: int) -> dict:
    profile = get_profile(db, organization_id)
    out = {k: v for k, v in profile.items() if not k.startswith("_")}
    return {"profile": out, "completeness": completeness(profile), "fields": fields_spec(),
            "registered_address": registered_address(profile)}


def prefill(db, organization_id: int) -> dict:
    """Proposed values from the Organization record and the default employer entity. Never saved here: HR reviews them in
    the form and saves. Only empty profile fields are proposed."""
    org = db.get(Organization, organization_id)
    profile = get_profile(db, organization_id)
    proposal: dict = {}

    def offer(key, value):
        if value not in (None, "") and profile.get(key) in (None, "", []) and key not in proposal:   # the entity wins
            proposal[key] = value

    entity = None
    try:
        from app.modules.doc_templates.preflight import default_entity
        entity = default_entity(db, organization_id)
    except Exception:
        entity = None
    if entity is not None:
        offer("legal_name", getattr(entity, "legal_name", None))
        raw = getattr(entity, "address_lines", None) or str(getattr(entity, "address", "") or "").splitlines()
        lines = [str(ln).strip() for ln in raw if str(ln or "").strip()]
        if lines:
            offer("address_line1", lines[0])
            offer("address_line2", ", ".join(lines[1:]) or None)
        offer("city", getattr(entity, "city", None))
        offer("state", getattr(entity, "region", None))
        offer("postal_code", getattr(entity, "postal_code", None))
        offer("country", (getattr(entity, "country", None) or "").upper() or None)
        tax_id = getattr(entity, "tax_id", None)
        if tax_id:
            from app.core import business_ids
            for key in ("gstin", "pan", "cin"):
                if not business_ids.validate_id("IN", key, business_ids.clean(tax_id)):
                    offer(key, business_ids.clean(tax_id))
                    break
        reg_type = (getattr(entity, "registration_type", "") or "").lower()
        if reg_type in ("cin", "gstin", "pan"):
            offer(reg_type, getattr(entity, "registration_number", None))
        elif getattr(entity, "registration_number", None):
            offer("other_registration_type", reg_type.replace("_", " ").title() or None)
            offer("other_registration_number", entity.registration_number)
        offer("phone", getattr(entity, "phone", None))
        offer("general_email", getattr(entity, "email", None))
    if org is not None:
        offer("legal_name", getattr(org, "organization_name", None) or getattr(org, "display_name", None))
        offer("website", getattr(org, "website", None))
        offer("city", getattr(org, "city", None))
        offer("state", getattr(org, "state", None))
        offer("address_line1", getattr(org, "address", None))
        cc = _org_country_code(org)
        offer("country", cc or None)
        offer("jurisdiction_country", cc or None)
    return {"proposal": proposal, "saved": False,
            "note": "Proposed from your organisation record. Review the values and save to use them in documents."}
