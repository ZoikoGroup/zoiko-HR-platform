"""Engagement Profiles and Role Profiles (Onboarding › Settings), per organisation.

- An Engagement Profile holds the terms of a kind of engagement: what the person is called in the documents ("Employee",
  or e.g. a programme associate), the assessment / probation period, how pay is described, working days and hours, and the
  leave rule. Every organisation has the built-in neutral "Standard Employee" profile, so tenants that never configure one
  keep today's wording.
- A Role Profile holds the role's own text: about the role, grouped responsibilities, the headline duties for the offer
  letter, the contract duties paragraph, skills, work setup, performance structure and the KPI areas. A hire's documents
  print their role's text only — when no profile matches, the documents stay drafts; another role's text is never borrowed.

Stored as one JSON row per organisation (`organization_configs`, PROFILES_KEY). Every read/write is scoped by
organization_id; every change writes an organisation-activity audit event.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Optional

from fastapi import HTTPException

from app.modules.hr.models import OnboardingNewHire, OrganizationConfig

logger = logging.getLogger("zoiko.onboarding.profiles")

PROFILES_KEY = "onboarding_profiles.config"
SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{1,59}$")
DAYS = ("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN")
TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
STANDARD_SLUG = "standard-employee"

# key: (kind, option) — text: max length; int/float: (min, max); enum: allowed; list: item max length; days; time; bool
ENGAGEMENT_FIELDS: dict[str, tuple] = {
    "name": ("text", 120),
    "programme_name": ("text", 200), "programme_short": ("text", 120),
    "party_term": ("text", 60), "engagement_term": ("text", 60),
    "employment_type": ("text", 60),
    "remuneration_type": ("enum", ("salary", "stipend", "fee")), "remuneration_label": ("text", 60),
    "assessment_months": ("int", (0, 36)), "assessment_label": ("text", 80),
    "conversion_text": ("text", 4000),
    "working_days": ("days", None), "start_time": ("time", None), "end_time": ("time", None), "timezone_label": ("text", 20),
    "work_schedule": ("text", 300), "saturday_rule": ("text", 300),
    "leave_rule": ("text", 2000),
    "leave_accrual_days_per_month": ("float", (0, 10)), "leave_cap_in_period": ("float", (0, 365)),
    "paid_leave_after_months": ("int", (0, 36)), "carry_forward_on_conversion": ("bool", None),
    "workspace_requirements": ("list", 500),
}
ROLE_FIELDS: dict[str, tuple] = {
    "title": ("text", 200),
    "about": ("paragraphs", 3000),
    "responsibility_groups": ("groups", None),        # [{heading, bullets: [..]}]
    "offer_responsibilities": ("list", 600),           # "Label: sentence"
    "contract_duties": ("text", 4000),
    "required_skills": ("list", 300),
    "work_setup": ("list", 300),
    "performance_structure": ("list", 500),
    "kpi_areas": ("kpis", None),                       # [{title, bullets: [..], success}]
}
LIST_LIMIT = 40
GROUP_LIMIT = 12


def standard_engagement() -> dict:
    """The neutral built-in profile every organisation has (today's wording: "Employee", "Probation", "Salary")."""
    return {"slug": STANDARD_SLUG, "name": "Standard Employee", "builtin": True, "default": True,
            "programme_name": "", "programme_short": "", "party_term": "Employee", "engagement_term": "employment",
            "employment_type": "", "remuneration_type": "salary", "remuneration_label": "Salary",
            "assessment_months": None, "assessment_label": "Probation", "conversion_text": "",
            "working_days": ["MON", "TUE", "WED", "THU", "FRI"], "start_time": "", "end_time": "", "timezone_label": "",
            "work_schedule": "", "saturday_rule": "", "leave_rule": "", "leave_accrual_days_per_month": None,
            "leave_cap_in_period": None, "paid_leave_after_months": None, "carry_forward_on_conversion": False,
            "workspace_requirements": []}


# ── storage ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def _row(db, organization_id: int):
    return db.query(OrganizationConfig).filter(OrganizationConfig.organization_id == organization_id,
                                               OrganizationConfig.key == PROFILES_KEY).first()


def _load(db, organization_id: int) -> dict:
    row = _row(db, organization_id)
    data = {}
    if row is not None and row.value:
        try:
            data = json.loads(row.value) or {}
        except json.JSONDecodeError:
            logger.warning("onboarding profiles for org %s are not valid JSON", organization_id)
    return {"engagement_profiles": list(data.get("engagement_profiles") or []), "role_profiles": list(data.get("role_profiles") or [])}


def _write(db, organization_id: int, data: dict) -> None:
    row = _row(db, organization_id)
    if row is None:
        row = OrganizationConfig(organization_id=organization_id, key=PROFILES_KEY, category="onboarding_package",
                                 description="Onboarding Engagement Profiles and Role Profiles")
        db.add(row)
    row.value = json.dumps(data)
    db.commit()


def engagement_profiles(db, organization_id: int) -> list[dict]:
    """The organisation's engagement profiles, the built-in Standard Employee first. Exactly one is the default."""
    stored = [p for p in _load(db, organization_id)["engagement_profiles"] if p.get("slug") != STANDARD_SLUG]
    std = standard_engagement()
    std_override = next((p for p in _load(db, organization_id)["engagement_profiles"] if p.get("slug") == STANDARD_SLUG), None)
    if std_override is not None:
        std["default"] = bool(std_override.get("default"))
    if any(p.get("default") for p in stored):
        std["default"] = False
    elif not std["default"]:
        std["default"] = True
    return [std] + stored


def role_profiles(db, organization_id: int) -> list[dict]:
    return _load(db, organization_id)["role_profiles"]


def view(db, organization_id: int) -> dict:
    return {"engagement_profiles": engagement_profiles(db, organization_id), "role_profiles": role_profiles(db, organization_id),
            "engagement_fields": list(ENGAGEMENT_FIELDS), "role_fields": list(ROLE_FIELDS)}


# ── matching for a hire ──────────────────────────────────────────────────────────────────────────────────────────────

def engagement_for(db, organization_id: int, slug: Optional[str]) -> Optional[dict]:
    profiles = engagement_profiles(db, organization_id)
    if slug:
        return next((p for p in profiles if p["slug"] == slug), None)
    return next((p for p in profiles if p.get("default")), profiles[0])


def _norm_title(t: Optional[str]) -> str:
    return re.sub(r"[\s–—-]+", " ", (t or "")).strip().casefold()


def role_for(db, organization_id: int, slug: Optional[str], position: Optional[str]) -> Optional[dict]:
    """The hire's role profile: the one HR chose, else the profile whose title matches the position. None when neither —
    never another role's profile."""
    profiles = role_profiles(db, organization_id)
    if slug:
        return next((p for p in profiles if p.get("slug") == slug), None)
    want = _norm_title(position)
    if not want:
        return None
    return next((p for p in profiles if _norm_title(p.get("title")) == want), None)


# ── validation ───────────────────────────────────────────────────────────────────────────────────────────────────────

def _text_list(value, limit: int, max_items: int = LIST_LIMIT) -> list[str]:
    items = value if isinstance(value, list) else []
    return [str(i).strip()[:limit] for i in items if str(i or "").strip()][:max_items]


def _clean(fields: dict, data: dict, errors: dict) -> dict:
    out = {}
    for key, value in data.items():
        if key in ("slug", "builtin"):
            continue
        if key == "default":
            out[key] = bool(value)
            continue
        if key not in fields:
            errors[key] = "Unknown field."
            continue
        kind, opt = fields[key]
        if kind == "text":
            text = str(value or "").strip()
            if len(text) > opt:
                errors[key] = f"Must be {opt} characters or fewer."
            out[key] = text[:opt]
        elif kind == "paragraphs":
            paras = value if isinstance(value, list) else [p for p in str(value or "").split("\n\n")]
            out[key] = _text_list(paras, opt, 12)
        elif kind == "list":
            out[key] = _text_list(value, opt)
        elif kind == "bool":
            out[key] = bool(value)
        elif kind in ("int", "float"):
            if value in (None, ""):
                out[key] = None
                continue
            try:
                n = int(value) if kind == "int" else float(value)
            except (TypeError, ValueError):
                errors[key] = "Must be a number."
                continue
            lo, hi = opt
            if not lo <= n <= hi:
                errors[key] = f"Must be between {lo} and {hi}."
            out[key] = n
        elif kind == "enum":
            v = str(value or "").strip().lower()
            if v not in opt:
                errors[key] = f"Must be one of {', '.join(opt)}."
            out[key] = v
        elif kind == "days":
            days = [str(d).strip().upper()[:3] for d in (value if isinstance(value, list) else [])]
            if any(d not in DAYS for d in days):
                errors[key] = "Use day codes MON … SUN."
            out[key] = [d for d in DAYS if d in days]
        elif kind == "time":
            v = str(value or "").strip()
            if v and not TIME.match(v):
                errors[key] = "Use 24-hour time such as 10:30."
            out[key] = v
        elif kind == "groups":
            groups = []
            for g in (value if isinstance(value, list) else [])[:GROUP_LIMIT]:
                g = g if isinstance(g, dict) else {}
                heading = str(g.get("heading") or "").strip()[:200]
                bullets = _text_list(g.get("bullets"), 600)
                if heading or bullets:
                    groups.append({"heading": heading, "bullets": bullets})
            out[key] = groups
        elif kind == "kpis":
            areas = []
            for a in (value if isinstance(value, list) else [])[:GROUP_LIMIT]:
                a = a if isinstance(a, dict) else {}
                title = str(a.get("title") or "").strip()[:200]
                bullets = _text_list(a.get("bullets"), 600)
                success = str(a.get("success") or "").strip()[:1000]
                if title or bullets or success:
                    areas.append({"title": title, "bullets": bullets, "success": success})
            out[key] = areas
    return out


def _check_slug(slug: str) -> None:
    if not SLUG.match(slug or ""):
        raise HTTPException(422, {"message": "Use a short id of lower-case letters, digits and hyphens.", "errors": {"slug": "Invalid id."}})


def _audit(db, actor, kind: str, slug: str, action: str, keys: list[str]) -> None:
    try:
        from app.modules.super_admin.activity_service import record_activity
        record_activity(db, action_type=f"settings.{kind}_profile_{action}", actor=actor, organization_id=actor.organization_id,
                        target_name=f"{kind.title()} profile {slug}", entity_type=f"{kind}_profile",
                        details={"slug": slug, "changed_keys": keys})
    except Exception:
        db.rollback()
        logger.exception("profile audit event failed")


def save_engagement(db, actor, slug: str, data: dict) -> dict:
    _check_slug(slug)
    errors: dict = {}
    clean = _clean(ENGAGEMENT_FIELDS, data or {}, errors)
    if errors:
        raise HTTPException(422, {"message": "Some engagement profile values need correcting.", "errors": errors})
    store = _load(db, actor.organization_id)
    profiles = store["engagement_profiles"]
    if slug == STANDARD_SLUG:
        if set(clean) - {"default"}:
            raise HTTPException(409, "The built-in Standard Employee profile cannot be edited. Duplicate it to change its wording.")
        existing = next((p for p in profiles if p.get("slug") == slug), None) or {"slug": slug}
        existing.update(clean)
        profiles = [p for p in profiles if p.get("slug") != slug] + [existing]
    else:
        existing = next((p for p in profiles if p.get("slug") == slug), None)
        if existing is None:
            if not clean.get("name"):
                raise HTTPException(422, {"message": "Give the profile a name.", "errors": {"name": "Required."}})
            existing = {**{k: v for k, v in standard_engagement().items() if k not in ("builtin", "default", "name")}, "slug": slug}
            profiles.append(existing)
        existing.update(clean)
    if clean.get("default"):
        for p in profiles:
            p["default"] = p.get("slug") == slug
    store["engagement_profiles"] = profiles
    _write(db, actor.organization_id, store)
    _audit(db, actor, "engagement", slug, "saved", sorted(clean))
    return engagement_for(db, actor.organization_id, slug)


def save_role(db, actor, slug: str, data: dict) -> dict:
    _check_slug(slug)
    errors: dict = {}
    clean = _clean(ROLE_FIELDS, data or {}, errors)
    clean.pop("default", None)
    if errors:
        raise HTTPException(422, {"message": "Some role profile values need correcting.", "errors": errors})
    store = _load(db, actor.organization_id)
    profiles = store["role_profiles"]
    existing = next((p for p in profiles if p.get("slug") == slug), None)
    if existing is None:
        if not clean.get("title"):
            raise HTTPException(422, {"message": "Give the role a title.", "errors": {"title": "Required."}})
        existing = {"slug": slug}
        profiles.append(existing)
    existing.update(clean)
    title = _norm_title(existing.get("title"))
    if any(p is not existing and _norm_title(p.get("title")) == title for p in profiles):
        raise HTTPException(409, "Another role profile already has this title.")
    store["role_profiles"] = profiles
    _write(db, actor.organization_id, store)
    _audit(db, actor, "role", slug, "saved", sorted(clean))
    return existing


def _used_by_unsent_hire(db, organization_id: int, key: str, slug: str) -> Optional[str]:
    hires = db.query(OnboardingNewHire).filter(OnboardingNewHire.organization_id == organization_id,
                                               OnboardingNewHire.status.notin_(("completed", "cancelled"))).all()
    for h in hires:
        details = h.profile_details or {}
        if (details.get("_package_inputs") or {}).get(key) == slug and not (details.get("_package") or {}).get("sent_at"):
            return h.candidate_name
    return None


def delete_engagement(db, actor, slug: str) -> None:
    if slug == STANDARD_SLUG:
        raise HTTPException(409, "The built-in Standard Employee profile cannot be deleted.")
    who = _used_by_unsent_hire(db, actor.organization_id, "engagement_profile_slug", slug)
    if who:
        raise HTTPException(409, f"{who}'s documents use this profile and have not been sent yet. Change their profile first.")
    store = _load(db, actor.organization_id)
    before = len(store["engagement_profiles"])
    store["engagement_profiles"] = [p for p in store["engagement_profiles"] if p.get("slug") != slug]
    if len(store["engagement_profiles"]) == before:
        raise HTTPException(404, "Engagement profile not found.")
    _write(db, actor.organization_id, store)
    _audit(db, actor, "engagement", slug, "deleted", [])


def delete_role(db, actor, slug: str) -> None:
    who = _used_by_unsent_hire(db, actor.organization_id, "role_profile_slug", slug)
    if who:
        raise HTTPException(409, f"{who}'s documents use this role profile and have not been sent yet. Change their role first.")
    store = _load(db, actor.organization_id)
    before = len(store["role_profiles"])
    store["role_profiles"] = [p for p in store["role_profiles"] if p.get("slug") != slug]
    if len(store["role_profiles"]) == before:
        raise HTTPException(404, "Role profile not found.")
    _write(db, actor.organization_id, store)
    _audit(db, actor, "role", slug, "deleted", [])
