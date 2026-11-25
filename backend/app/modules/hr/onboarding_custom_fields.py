"""The organisation's own document fields (Onboarding › Settings › "Your document fields").

Every organisation writes its own templates, and its templates ask for things the platform does not know: a shift allowance,
a relocation bonus, a pension scheme, a cost centre. Each such field is defined here once and printed in any template as
``{{custom.<key>}}``.

A field has
  * ``key``     – the merge-field name (lower case letters, digits and "_", starting with a letter); printed as
                  ``{{custom.<key>}}``. Once a document has used it, it is never renamed (only switched off).
  * ``label``   – what HR sees ("Shift allowance").
  * ``type``    – text | long_text | number | money | date | choice | yes_no. The value is checked against it and printed
                  in the organisation's format (dates as the Company Profile's date format, money with its currency).
  * ``source``  – where the value comes from:
                    hr        HR types it for each new hire (in the new hire's document panel);
                    candidate the new hire fills it in on the portal (one of the portal form's own fields);
                    fixed     the same value for every hire, set here.
  * ``required`` – a required field without a value holds the documents that print it (they are never sent with a gap);
                  an optional one prints nothing.

Stored as one JSON row per organisation (`organization_configs`, CONFIG_KEY). Every read and write is scoped by
organization_id; every change writes an organisation-activity audit event.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import date
from typing import Optional

from fastapi import HTTPException

from app.modules.hr.models import OrganizationConfig

logger = logging.getLogger("zoiko.onboarding.custom_fields")

CONFIG_KEY = "onboarding_custom_fields.config"
PREFIX = "custom."
KEY = re.compile(r"^[a-z][a-z0-9_]{1,39}$")
TYPES = {"text": "Text", "long_text": "Paragraph", "number": "Number", "money": "Amount of money", "date": "Date",
         "choice": "Choice from a list", "yes_no": "Yes / No"}
SOURCES = {"hr": "HR enters it for each new hire", "candidate": "The new hire fills it in on the portal",
           "fixed": "The same for every new hire"}
MAX_FIELDS = 60
MAX_OPTIONS = 30
_NUMBER = re.compile(r"^-?\d{1,12}(?:[.,]\d{1,4})?$")


# ── keys ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
def token(key: str) -> str:
    return PREFIX + key


def is_custom_token(name: Optional[str]) -> bool:
    """`custom.<key>` with a well-formed key (whether an organisation defines it is a separate question)."""
    return bool(name) and str(name).startswith(PREFIX) and bool(KEY.match(str(name)[len(PREFIX):]))


def key_of(name: str) -> str:
    return str(name)[len(PREFIX):] if str(name).startswith(PREFIX) else str(name)


def slug_for(text: str) -> str:
    """A field key proposed for a placeholder or label someone wrote ("Shift Allowance" / "ShiftAllowance" → shift_allowance)."""
    raw = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", str(text or "").strip())       # camelCase → camel_Case
    raw = raw.split(":", 1)[-1]
    if raw.lower().startswith("custom."):
        raw = raw[7:]
    slug = re.sub(r"[^a-z0-9]+", "_", raw.lower()).strip("_")
    slug = re.sub(r"^[0-9_]+", "", slug)[:40].rstrip("_")
    return slug if KEY.match(slug or "") else ""


def label_for(text: str) -> str:
    """A readable label for a placeholder name ("shift_allowance" → "Shift allowance")."""
    words = slug_for(text).replace("_", " ").strip()
    return (words[:1].upper() + words[1:]) if words else ""


# ── storage ──────────────────────────────────────────────────────────────────────────────────────────────────────────
def _row(db, organization_id: int):
    return db.query(OrganizationConfig).filter(OrganizationConfig.organization_id == organization_id,
                                               OrganizationConfig.key == CONFIG_KEY).first()


def _load(db, organization_id: int) -> dict:
    row = _row(db, organization_id)
    if row is None or not row.value:
        return {"fields": [], "version": 0}
    try:
        data = json.loads(row.value)
    except (TypeError, ValueError):
        logger.warning("custom fields of organisation %s are not valid JSON; treated as none", organization_id)
        return {"fields": [], "version": 0}
    if not isinstance(data, dict) or not isinstance(data.get("fields"), list):
        return {"fields": [], "version": 0}
    return data


def fields(db, organization_id: int, *, include_inactive: bool = False) -> list[dict]:
    from app.modules.hr import onboarding_package as P
    data = P._cached(db, ("custom_fields", organization_id), lambda: _load(db, organization_id))
    out = [dict(f) for f in data.get("fields") or [] if isinstance(f, dict) and KEY.match(str(f.get("key") or ""))]
    return out if include_inactive else [f for f in out if f.get("active", True)]


def field(db, organization_id: int, name: str) -> Optional[dict]:
    k = key_of(name)
    return next((f for f in fields(db, organization_id) if f["key"] == k), None)


def tokens(db, organization_id: int) -> set:
    """`custom.<key>` of every active field of the organisation."""
    return {token(f["key"]) for f in fields(db, organization_id)}


def optional_tokens(db, organization_id: int) -> set:
    """Fields that print nothing (instead of holding the document) when they have no value."""
    return {token(f["key"]) for f in fields(db, organization_id) if not f.get("required")}


# ── validation ───────────────────────────────────────────────────────────────────────────────────────────────────────
def _clean_text(value, limit: int) -> str:
    return " ".join(str(value or "").split())[:limit]


def check_value(f: dict, value) -> tuple[Optional[str], Optional[str]]:
    """(stored value, problem). An empty value is (None, None)."""
    t = f.get("type") or "text"
    v = str(value if value is not None else "").strip()
    if v == "":
        return None, None
    label = f.get("label") or f.get("key")
    if t == "long_text":
        return v[:4000], None
    if t in ("number", "money"):
        n = v.replace(" ", "").replace(",", "") if t == "money" else v.replace(" ", "")
        for sym in ("₹", "$", "£", "€"):
            n = n.replace(sym, "")
        if not _NUMBER.match(n):
            return None, f"{label} must be a number."
        return n.replace(",", "."), None
    if t == "date":
        try:
            return date.fromisoformat(v[:10]).isoformat(), None
        except ValueError:
            return None, f"{label} must be a date such as 2026-07-06."
    if t == "choice":
        options = [str(o) for o in f.get("options") or []]
        match = next((o for o in options if o.casefold() == v.casefold()), None)
        if match is None:
            return None, f"{label} must be one of: {', '.join(options)}."
        return match, None
    if t == "yes_no":
        low = v.casefold()
        if low in ("yes", "y", "true", "1"):
            return "yes", None
        if low in ("no", "n", "false", "0"):
            return "no", None
        return None, f"{label} must be Yes or No."
    return v[:500], None


def _clean_field(raw, existing: dict, used_keys: set) -> dict:
    if not isinstance(raw, dict):
        raise HTTPException(422, "Each field must be an object.")
    key = str(raw.get("key") or "").strip()
    if not KEY.match(key):
        raise HTTPException(422, f"“{key or '(empty)'}” cannot be a field name: use 2–40 lower-case letters, digits or _, "
                                 "starting with a letter (e.g. shift_allowance).")
    label = _clean_text(raw.get("label"), 120)
    if not label:
        raise HTTPException(422, f"Give the field {key} a label.")
    t = raw.get("type") or "text"
    if t not in TYPES:
        raise HTTPException(422, f"{label}: the type must be one of {', '.join(TYPES)}.")
    source = raw.get("source") or "hr"
    if source not in SOURCES:
        raise HTTPException(422, f"{label}: where the value comes from must be one of {', '.join(SOURCES)}.")
    out = {"key": key, "label": label, "type": t, "source": source, "required": bool(raw.get("required", True)),
           "help": _clean_text(raw.get("help"), 300), "active": bool(raw.get("active", True))}
    if t == "choice":
        options = [_clean_text(o, 120) for o in raw.get("options") or [] if _clean_text(o, 120)]
        options = list(dict.fromkeys(options))
        if not options:
            raise HTTPException(422, f"{label}: a choice needs at least one option.")
        if len(options) > MAX_OPTIONS:
            raise HTTPException(422, f"{label}: at most {MAX_OPTIONS} options.")
        out["options"] = options
    if source == "candidate":
        portal = str(raw.get("portal_field") or f"custom_{key}")[:60]
        out["portal_field"] = portal
    if source == "fixed":
        stored, problem = check_value(out, raw.get("value"))
        if problem:
            raise HTTPException(422, problem)
        if stored is None and out["required"]:
            raise HTTPException(422, f"{label}: give the value printed for every new hire.")
        out["value"] = stored
    if key in used_keys and existing.get(key) and existing[key].get("type") != t:
        raise HTTPException(422, f"{label}: documents already use this field, so its type cannot change. Add a new field.")
    return out


def _keys_in_documents(db, organization_id: int) -> set:
    """Field keys the organisation's own templates already print (they cannot be removed or re-typed)."""
    from app.modules.doc_templates.models import TemplateVariant
    from app.modules.hr import onboarding_package_content as C
    used: set = set()
    for (content,) in (db.query(TemplateVariant.content).filter(TemplateVariant.owner_organization_id == organization_id).all()):
        try:
            text = json.dumps(content or [], ensure_ascii=False)
        except (TypeError, ValueError):
            continue
        for m in C.TOKEN_RE.finditer(text):
            if is_custom_token(m.group(1)):
                used.add(key_of(m.group(1)))
    return used


def save(db, actor, items: list) -> dict:
    """Replace the organisation's field list. A field that a template already prints cannot be deleted (switch it off)."""
    from app.modules.doc_templates import access
    access.require_hr(actor)
    org_id = actor.organization_id
    if not isinstance(items, list):
        raise HTTPException(422, "fields must be a list.")
    if len(items) > MAX_FIELDS:
        raise HTTPException(422, f"At most {MAX_FIELDS} fields.")
    data = _load(db, org_id)
    existing = {f.get("key"): f for f in data.get("fields") or [] if isinstance(f, dict)}
    used = _keys_in_documents(db, org_id)
    cleaned, seen = [], set()
    for raw in items:
        f = _clean_field(raw, existing, used)
        if f["key"] in seen:
            raise HTTPException(422, f"The field name {f['key']} is used twice.")
        seen.add(f["key"])
        cleaned.append(f)
    removed = [k for k in existing if k not in seen]
    in_use = sorted(k for k in removed if k in used)
    if in_use:
        raise HTTPException(422, f"Your documents print {', '.join('{{custom.%s}}' % k for k in in_use)}: switch the field off "
                                 "instead of deleting it.")
    data = {"fields": cleaned, "version": int(data.get("version") or 0) + 1}
    row = _row(db, org_id)
    if row is None:
        row = OrganizationConfig(organization_id=org_id, key=CONFIG_KEY, category="onboarding_package",
                                 description="The organisation's own document fields ({{custom.<key>}})")
        db.add(row)
    row.value = json.dumps(data)
    db.commit()
    from app.modules.hr import onboarding_package as P
    (db.info.get(P._CACHE_KEY) or {}).pop(("custom_fields", org_id), None)
    from app.modules.hr import onboarding_package_org as ORG
    ORG.audit(db, actor, "onboarding_custom_fields_saved", {"fields": sorted(seen), "removed": removed})
    return view(db, org_id)


def add(db, actor, raw: dict) -> dict:
    """Add one field (e.g. from an unknown placeholder in an uploaded document). An existing key is returned unchanged."""
    current = fields(db, actor.organization_id, include_inactive=True)
    raw = dict(raw or {})
    if not raw.get("key") and raw.get("placeholder"):
        raw["key"] = slug_for(raw["placeholder"])
        raw.setdefault("label", label_for(raw["placeholder"]))
    if any(f["key"] == raw.get("key") for f in current):
        return view(db, actor.organization_id)
    return save(db, actor, current + [raw])


def view(db, organization_id: int) -> dict:
    used = _keys_in_documents(db, organization_id)
    items = []
    for f in fields(db, organization_id, include_inactive=True):
        items.append({**f, "token": "{{%s}}" % token(f["key"]), "in_use": f["key"] in used})
    return {"fields": items, "types": [{"value": k, "label": v} for k, v in TYPES.items()],
            "sources": [{"value": k, "label": v} for k, v in SOURCES.items()], "max_fields": MAX_FIELDS}


# ── values for a hire ────────────────────────────────────────────────────────────────────────────────────────────────
def _portal_value(hire, f: dict):
    details = getattr(hire, "profile_details", None) or {}
    want = f.get("portal_field") or f"custom_{f['key']}"
    for bag in (details.get("custom_fields") or {}, details):
        if isinstance(bag, dict) and bag.get(want) not in (None, ""):
            return bag.get(want)
    emp = getattr(hire, "employee", None)
    if emp is not None and isinstance(getattr(emp, "custom_fields", None), dict):
        return emp.custom_fields.get(want)
    return None


def format_value(f: dict, stored, *, date_format: str = "DMY", currency: Optional[str] = None,
                 grouping: Optional[str] = None) -> Optional[str]:
    if stored in (None, ""):
        return None
    t = f.get("type") or "text"
    from app.modules.hr import doc_formatting as DF
    try:
        if t == "date":
            return DF.format_date_long(stored, date_format)
        if t == "money":
            return DF.format_money(float(str(stored).replace(",", "")), currency, grouping)
        if t == "number":
            n = float(str(stored).replace(",", "."))
            return f"{n:,.0f}" if n.is_integer() else f"{n:,.2f}"
        if t == "yes_no":
            return "Yes" if str(stored).casefold() in ("yes", "true", "1") else "No"
    except (TypeError, ValueError):
        return str(stored)
    return str(stored)


def raw_value(db, hire, f: dict):
    """The value before formatting: HR's entry, the new hire's portal answer, or the fixed value."""
    if f.get("source") == "fixed":
        return f.get("value")
    if f.get("source") == "candidate":
        return _portal_value(hire, f)
    from app.modules.hr import onboarding_package as P
    return P.hire_inputs(hire).get(token(f["key"]))


def values_for_hire(db, hire, profile: Optional[dict] = None, currency: Optional[str] = None) -> dict:
    """{"custom.<key>": printed value or None} for every active field of the hire's organisation."""
    out = {}
    org_fields = fields(db, hire.organization_id)
    if not org_fields:
        return out
    if profile is None:
        from app.modules.hr import onboarding_package as P
        profile = P._profile_for(db, hire.organization_id)
    fmt = (profile or {}).get("date_format") or "DMY"
    cur = currency or (profile or {}).get("currency") or None
    grouping = (profile or {}).get("number_grouping") or None
    for f in org_fields:
        out[token(f["key"])] = format_value(f, raw_value(db, hire, f), date_format=fmt, currency=cur, grouping=grouping)
    return out


def check_hire_input(db, organization_id: int, name: str, value) -> Optional[str]:
    """HR's value for an `hr` field (stored form), or 422 when the field is not one HR types or the value is wrong."""
    f = field(db, organization_id, name)
    if f is None or f.get("source") != "hr":
        raise HTTPException(422, f"{name} cannot be set here.")
    stored, problem = check_value(f, value)
    if problem:
        raise HTTPException(422, problem)
    return stored


def missing_info(db, organization_id: int, name: str) -> dict:
    """How the document panel describes a missing custom field (who provides it and where)."""
    f = field(db, organization_id, name) or {}
    src = f.get("source")
    out = {"meaning": f.get("label") or key_of(name), "custom": True, "input_type": f.get("type") or "text",
           "options": list(f.get("options") or []), "help": f.get("help") or ""}
    if not f:
        out.update({"source": "Not defined – add it under Settings › Your document fields", "editable": False,
                    "candidate_provides": False, "settings_path": "/zoiko-hr/onboarding/settings#custom-fields"})
    elif src == "hr":
        out.update({"source": "Entered by HR for this new hire", "editable": True, "candidate_provides": False,
                    "settings_path": None})
    elif src == "candidate":
        out.update({"source": "The new hire fills it in on the portal", "editable": False, "candidate_provides": True,
                    "settings_path": None})
    else:
        out.update({"source": "Settings › Your document fields", "editable": False, "candidate_provides": False,
                    "settings_path": "/zoiko-hr/onboarding/settings#custom-fields"})
    return out
