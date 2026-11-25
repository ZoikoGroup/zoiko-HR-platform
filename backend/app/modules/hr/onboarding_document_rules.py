"""Per-document rules of an organisation's onboarding package: who receives a document, and when it is prepared.

"Include when" (``conditions``): a list of {field, op, value}; every condition must hold for a hire to receive the document.
An empty list means every hire (and the engagement-profile audience of the row still applies). Conditions look at:

    country           the hire's work country (ISO code)        is / is_not / any_of / none_of
    department        the hire's department                     is / is_not / any_of / none_of / contains
    employment_type   full_time, part_time, contract …          is / is_not / any_of / none_of
    position          the job title                             is / is_not / contains / any_of / none_of
    work_arrangement  onsite / hybrid / remote                  is / is_not / any_of / none_of
    engagement        the hire's engagement profile (slug)      is / is_not / any_of / none_of
    role              the hire's role profile (slug)            is / is_not / any_of / none_of
    custom.<key>      one of the organisation's own fields      every operator, gt / lt for numbers, money and dates

Text compares ignore case and surrounding spaces. A field with no value never matches is / any_of / contains / gt / lt, and
always matches is_not / none_of / not_set.

"When to prepare it" (``send_when``):
    manual             HR presses Send (today's behaviour; the default for every existing row)
    hire_created       when the new hire is created (an accepted offer, or HR adding them)
    details_submitted  when the new hire submits their details in the onboarding portal
    days_before_start  ``send_days_before`` days before the start date (checked every morning)
"""
from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import HTTPException

TRIGGERS = {"manual": "When HR sends it", "hire_created": "When the new hire is created (offer accepted)",
            "details_submitted": "When the new hire submits their details", "days_before_start": "Days before the start date"}
OPS = {"is": "is", "is_not": "is not", "any_of": "is one of", "none_of": "is none of", "contains": "contains",
       "set": "has a value", "not_set": "has no value", "gt": "is more than", "lt": "is less than"}
BASE_FIELDS = {
    "country": ("Work country", "country"),
    "department": ("Department", "text"),
    "employment_type": ("Employment type", "choice"),
    "position": ("Job title", "text"),
    "work_arrangement": ("Work arrangement", "choice"),
    "engagement": ("Engagement profile", "choice"),
    "role": ("Role profile", "choice"),
}
EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "temporary", "intern", "consultant"]
WORK_ARRANGEMENTS = ["onsite", "hybrid", "remote"]
MAX_CONDITIONS = 10
_LIST_OPS = ("any_of", "none_of")
_ORDER_OPS = ("gt", "lt")


# ── what a hire is ───────────────────────────────────────────────────────────────────────────────────────────────────
def hire_facts(db, hire) -> dict:
    """The values conditions are checked against (raw, not formatted)."""
    from app.modules.hr import onboarding_custom_fields as CF
    from app.modules.hr import onboarding_package as P

    def build():
        _cand, offer, req = P._offer_for(db, hire)
        eng, role = P.hire_profiles(db, hire)
        from app.core import regions
        country = (getattr(offer, "work_country", None) if offer is not None else None) or getattr(hire, "work_country", None)
        facts = {
            "country": (regions.country_code(country) or country or "").upper() or None,
            "department": getattr(hire, "department_name", None) or (getattr(req, "department", None) if req else None),
            "employment_type": getattr(hire, "employment_type", None) or (getattr(offer, "employment_type", None) if offer else None),
            "position": getattr(hire, "position", None) or (getattr(offer, "position", None) if offer else None),
            "work_arrangement": getattr(offer, "work_arrangement", None) if offer is not None else None,
            "engagement": (eng or {}).get("slug"),
            "role": (role or {}).get("slug"),
        }
        for f in CF.fields(db, hire.organization_id):
            facts[CF.token(f["key"])] = CF.raw_value(db, hire, f)
        return facts
    return P._cached(db, ("rule_facts", getattr(hire, "id", None)), build)


def _norm(v) -> str:
    return " ".join(str(v if v is not None else "").split()).casefold()


def _as_number(v) -> Optional[float]:
    if v in (None, ""):
        return None
    if isinstance(v, date):
        return float(v.toordinal())
    s = str(v).strip()
    try:
        return float(date.fromisoformat(s[:10]).toordinal()) if len(s) >= 10 and s[4] == "-" else float(s.replace(",", ""))
    except (ValueError, IndexError):
        return None


def condition_holds(c: dict, facts: dict) -> bool:
    field, op, want = c.get("field"), c.get("op"), c.get("value")
    have = facts.get(field)
    empty = have in (None, "") or (isinstance(have, str) and not have.strip())
    if op == "set":
        return not empty
    if op == "not_set":
        return empty
    if op in ("is_not", "none_of"):
        if empty:
            return True
        wanted = want if isinstance(want, list) else [want]
        return _norm(have) not in {_norm(w) for w in wanted}
    if empty:
        return False
    if op in ("is", "any_of"):
        wanted = want if isinstance(want, list) else [want]
        return _norm(have) in {_norm(w) for w in wanted}
    if op == "contains":
        return _norm(want) in _norm(have)
    if op in _ORDER_OPS:
        a, b = _as_number(have), _as_number(want)
        if a is None or b is None:
            return False
        return a > b if op == "gt" else a < b
    return False


def matches(conditions, facts: dict) -> bool:
    return all(condition_holds(c, facts) for c in (conditions or []) if isinstance(c, dict))


def applies(db, row, hire) -> bool:
    """Whether the row's "include when" conditions hold for the hire."""
    if not getattr(row, "conditions", None):
        return True
    return matches(row.conditions, hire_facts(db, hire))


# ── settings ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def field_catalogue(db, organization_id: int) -> list[dict]:
    """The fields conditions can use, with their kind and (for choices) the values to pick from."""
    from app.modules.hr import onboarding_custom_fields as CF
    from app.modules.hr import onboarding_profiles as PR
    out = []
    for key, (label, kind) in BASE_FIELDS.items():
        item = {"value": key, "label": label, "kind": kind, "options": []}
        if key == "employment_type":
            item["options"] = [{"value": v, "label": v.replace("_", " ").capitalize()} for v in EMPLOYMENT_TYPES]
        elif key == "work_arrangement":
            item["options"] = [{"value": v, "label": v.capitalize()} for v in WORK_ARRANGEMENTS]
        elif key == "engagement":
            item["options"] = [{"value": p["slug"], "label": p.get("name") or p["slug"]}
                               for p in PR.engagement_profiles(db, organization_id) if p.get("slug")]
        elif key == "role":
            item["options"] = [{"value": p["slug"], "label": p.get("title") or p["slug"]}
                               for p in PR.role_profiles(db, organization_id) if p.get("slug")]
        out.append(item)
    for f in CF.fields(db, organization_id):
        kind = {"money": "number", "number": "number", "date": "date", "choice": "choice", "yes_no": "choice"}.get(f["type"], "text")
        options = ([{"value": o, "label": o} for o in f.get("options") or []] if f["type"] == "choice"
                   else [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}] if f["type"] == "yes_no" else [])
        out.append({"value": CF.token(f["key"]), "label": f["label"], "kind": kind, "options": options, "custom": True})
    return out


def ops_for(kind: str) -> list[str]:
    if kind in ("number", "date"):
        return ["is", "is_not", "gt", "lt", "set", "not_set"]
    if kind == "text":
        return ["is", "is_not", "contains", "any_of", "none_of", "set", "not_set"]
    return ["is", "is_not", "any_of", "none_of", "set", "not_set"]


def clean_conditions(db, organization_id: int, raw, *, title: str = "This document") -> list:
    if raw in (None, ""):
        return []
    if not isinstance(raw, list):
        raise HTTPException(422, f"{title}: conditions must be a list.")
    if len(raw) > MAX_CONDITIONS:
        raise HTTPException(422, f"{title}: at most {MAX_CONDITIONS} conditions.")
    catalogue = {f["value"]: f for f in field_catalogue(db, organization_id)}
    out = []
    for c in raw:
        if not isinstance(c, dict):
            raise HTTPException(422, f"{title}: each condition must be an object.")
        field, op = c.get("field"), c.get("op")
        f = catalogue.get(field)
        if f is None:
            raise HTTPException(422, f"{title}: unknown condition field {field!r}.")
        if op not in ops_for(f["kind"]):
            raise HTTPException(422, f"{title}: “{f['label']}” cannot use “{OPS.get(op, op)}”.")
        value = c.get("value")
        if op in ("set", "not_set"):
            value = None
        elif op in _LIST_OPS:
            items = value if isinstance(value, list) else [v for v in str(value or "").split(",")]
            value = [" ".join(str(v).split())[:120] for v in items if str(v).strip()][:30]
            if not value:
                raise HTTPException(422, f"{title}: “{f['label']} {OPS[op]}” needs at least one value.")
        else:
            value = " ".join(str(value if value is not None else "").split())[:120]
            if not value:
                raise HTTPException(422, f"{title}: “{f['label']} {OPS[op]}” needs a value.")
            if op in _ORDER_OPS and _as_number(value) is None:
                raise HTTPException(422, f"{title}: “{f['label']} {OPS[op]}” needs a number or a date.")
        if field == "country" and value:
            from app.core import regions
            vals = value if isinstance(value, list) else [value]
            codes = []
            for v in vals:
                code = (regions.country_code(v) or "").upper()
                if not code:
                    raise HTTPException(422, f"{title}: unknown country {v!r}.")
                codes.append(code)
            value = codes if isinstance(value, list) else codes[0]
        out.append({"field": field, "op": op, "value": value})
    return out


def clean_trigger(send_when, days, *, title: str = "This document") -> tuple[Optional[str], Optional[int]]:
    if send_when in (None, "", "manual"):
        return ("manual" if send_when == "manual" else None), None
    if send_when not in TRIGGERS:
        raise HTTPException(422, f"{title}: when to prepare it must be one of {', '.join(TRIGGERS)}.")
    if send_when != "days_before_start":
        return send_when, None
    try:
        n = int(days)
    except (TypeError, ValueError):
        raise HTTPException(422, f"{title}: give the number of days before the start date.")
    if not 0 <= n <= 90:
        raise HTTPException(422, f"{title}: the number of days before the start date must be between 0 and 90.")
    return send_when, n


def describe(conditions) -> str:
    """"Work country is IN and Department is one of Sales, Support" (for lists and notifications)."""
    parts = []
    for c in conditions or []:
        v = c.get("value")
        shown = ", ".join(v) if isinstance(v, list) else (v or "")
        name = BASE_FIELDS.get(c.get("field"), (str(c.get("field")).replace("custom.", ""),))[0]
        parts.append(f"{name} {OPS.get(c.get('op'), c.get('op'))}{(' ' + shown) if shown else ''}")
    return " and ".join(parts)
