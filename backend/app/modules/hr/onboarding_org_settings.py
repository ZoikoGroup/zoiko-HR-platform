"""Organisation-specific portal forms (HR-ONB-001 / HR-ONB-003) and editable document request categories.

Portal forms
  * Core fields stay locked: they can be neither hidden nor changed (and every field a jurisdiction pack makes required).
  * Any other optional field can be hidden; up to 20 custom fields can be added per form (key ``custom_<slug>``) with a
    label, help text, required flag, a type from blocks.FORM_TYPES, options for a select, an optional field rule and a data
    classification.
  * visible fields = starter fields → minus hidden → plus added fields → in field_order → pack requirements applied.
  * Each save bumps the form version. A submitted form keeps the field list (and version) it was submitted with.
  * Verified custom values are kept under ``custom_fields`` on the hire's details or the employee — never in core columns.

Document request categories
  * Seeded with the five categories used today (``is_system``: label editable, key not).
  * Add, rename, describe, accepted file types, maximum size, required by default, reorder, deactivate (a category is never
    hard-deleted once used).
"""
from __future__ import annotations

import re
from typing import Optional

from fastapi import HTTPException

from app.modules.doc_templates import blocks as B
from app.modules.hr.docs_setup_models import OrgDocumentRequestCategory, OrgFormOverride

CUSTOMISABLE_FORMS = ("HR-ONB-001", "HR-ONB-003")
LOCKED_CORE = {
    "HR-ONB-001": ("legal_first_name", "legal_last_name", "date_of_birth", "personal_email", "mobile_phone", "address_line1", "city",
                   "postal_code", "country"),
    "HR-ONB-003": ("contact1_name", "contact1_relationship", "contact1_phone"),
}
MAX_CUSTOM_FIELDS = 20
CUSTOM_CLASSIFICATIONS = ("PERSONAL_BASIC", "PERSONAL_CONFIDENTIAL")
_SLUG = re.compile(r"[^a-z0-9]+")


def _slug(text: str) -> str:
    return _SLUG.sub("_", str(text or "").lower()).strip("_")[:40]


# ── portal forms ─────────────────────────────────────────────────────────────────────────────────────────────────────
def get_override(db, organization_id: int, canonical_id: str) -> Optional[OrgFormOverride]:
    return (db.query(OrgFormOverride).filter(OrgFormOverride.organization_id == organization_id,
                                             OrgFormOverride.canonical_id == canonical_id).first())


def form_version(db, organization_id: int, canonical_id: str) -> int:
    o = get_override(db, organization_id, canonical_id)
    return o.version if o is not None else 0


def apply_override(fields: list, override: Optional[OrgFormOverride]) -> list:
    """starter fields → minus hidden → plus added → in field_order (core fields can never be hidden)."""
    if override is None:
        return fields
    hidden = set(override.hidden_keys or [])
    out = [f for f in fields if f["key"] not in hidden]
    for f in override.added_fields or []:
        out.append({**f, "custom": True})
    order = [k for k in (override.field_order or []) if isinstance(k, str)]
    if order:
        pos = {k: i for i, k in enumerate(order)}
        out.sort(key=lambda f: pos.get(f["key"], len(pos) + out.index(f)))
    return out


def _starter_fields(db, canonical_id: str) -> list:
    from app.modules.hr.onboarding_documents import _starter_fields as sf
    return sf(db, canonical_id)


def form_settings(db, organization_id: int, canonical_id: str) -> dict:
    from app.core import field_rules
    from app.modules.hr.onboarding_documents import FORMS, OPTIONAL_BY_PACK
    if canonical_id not in CUSTOMISABLE_FORMS:
        raise HTTPException(404, "This form cannot be changed by the organisation.")
    o = get_override(db, organization_id, canonical_id)
    starter = _starter_fields(db, canonical_id)
    locked = set(LOCKED_CORE[canonical_id]) | set(OPTIONAL_BY_PACK)
    return {"canonical_id": canonical_id, "title": FORMS[canonical_id], "version": o.version if o else 0,
            "fields": [{"key": f["key"], "label": f.get("label"), "type": f.get("type", "text"), "required": bool(f.get("required")),
                        "locked": f["key"] in locked,
                        "locked_reason": ("Core field – always collected" if f["key"] in LOCKED_CORE[canonical_id]
                                          else "Collected when the jurisdiction pack requires it" if f["key"] in OPTIONAL_BY_PACK
                                          else None),
                        "hidden": f["key"] in set((o.hidden_keys if o else None) or [])} for f in starter],
            "added_fields": list((o.added_fields if o else None) or []),
            "field_order": list((o.field_order if o else None) or []),
            "types": list(B.FORM_TYPES), "rules": sorted(field_rules.RULES), "classifications": list(CUSTOM_CLASSIFICATIONS),
            "max_custom_fields": MAX_CUSTOM_FIELDS}


def _clean_added(raw, existing_keys: set) -> list:
    from app.core import field_rules
    if raw in (None, ""):
        return []
    if not isinstance(raw, list):
        raise HTTPException(422, "added_fields must be a list.")
    if len(raw) > MAX_CUSTOM_FIELDS:
        raise HTTPException(422, f"A form can have at most {MAX_CUSTOM_FIELDS} custom fields.")
    out, seen = [], set()
    for i, f in enumerate(raw, 1):
        if not isinstance(f, dict):
            raise HTTPException(422, f"Custom field {i} must be an object.")
        label = " ".join(str(f.get("label") or "").split())[:120]
        if not label:
            raise HTTPException(422, f"Custom field {i} needs a label.")
        key = str(f.get("key") or "")
        if not key.startswith("custom_"):
            key = "custom_" + (_slug(label) or f"field_{i}")
        if not re.fullmatch(r"custom_[a-z0-9_]{1,40}", key):
            raise HTTPException(422, f"Custom field {label}: the key must be custom_ followed by letters, digits or _.")
        if key in seen or key in existing_keys:
            raise HTTPException(422, f"Custom field {label}: the key {key} is already used.")
        seen.add(key)
        typ = f.get("type") or "text"
        if typ not in B.FORM_TYPES:
            raise HTTPException(422, f"Custom field {label}: type must be one of {', '.join(B.FORM_TYPES)}.")
        options = None
        if typ == "select":
            options = [" ".join(str(x).split())[:120] for x in (f.get("options") or []) if str(x).strip()]
            if not options:
                raise HTTPException(422, f"Custom field {label}: a list needs options to choose from.")
            if len(options) > 50:
                raise HTTPException(422, f"Custom field {label}: at most 50 options.")
        rule = f.get("rule") or None
        if rule is not None and rule not in field_rules.RULES:
            raise HTTPException(422, f"Custom field {label}: unknown validation rule {rule}.")
        cls = f.get("classification") or "PERSONAL_BASIC"
        if cls not in CUSTOM_CLASSIFICATIONS:
            raise HTTPException(422, f"Custom field {label}: classification must be {' or '.join(CUSTOM_CLASSIFICATIONS)}.")
        item = {"key": key, "label": label, "type": typ, "required": bool(f.get("required")),
                "help": " ".join(str(f.get("help") or "").split())[:300] or None, "classification": cls}
        if options:
            item["options"] = options
        if rule:
            item["rule"] = rule
        out.append(item)
    return out


def save_form_settings(db, actor, canonical_id: str, data: dict, *, session_id: Optional[int] = None, commit: bool = True) -> dict:
    from app.modules.doc_templates import access
    from app.modules.hr.onboarding_documents import OPTIONAL_BY_PACK
    access.require_hr(actor)
    if canonical_id not in CUSTOMISABLE_FORMS:
        raise HTTPException(404, "This form cannot be changed by the organisation.")
    data = data or {}
    starter_keys = {f["key"] for f in _starter_fields(db, canonical_id)}
    locked = set(LOCKED_CORE[canonical_id]) | set(OPTIONAL_BY_PACK)
    hidden = data.get("hidden_keys") or []
    if not isinstance(hidden, list) or not all(isinstance(k, str) for k in hidden):
        raise HTTPException(422, "hidden_keys must be a list of field keys.")
    bad = [k for k in hidden if k in locked]
    if bad:
        raise HTTPException(422, f"These fields are always collected and cannot be hidden: {', '.join(bad)}.")
    unknown = [k for k in hidden if k not in starter_keys]
    if unknown:
        raise HTTPException(422, f"Unknown fields: {', '.join(unknown)}.")
    added = _clean_added(data.get("added_fields"), starter_keys)
    order = data.get("field_order") or []
    if not isinstance(order, list) or not all(isinstance(k, str) for k in order):
        raise HTTPException(422, "field_order must be a list of field keys.")
    allowed = starter_keys | {f["key"] for f in added}
    order = [k for k in dict.fromkeys(order) if k in allowed]
    o = get_override(db, actor.organization_id, canonical_id)
    if o is None:
        o = OrgFormOverride(organization_id=actor.organization_id, canonical_id=canonical_id, version=0)
        db.add(o)
    o.hidden_keys, o.added_fields, o.field_order = sorted(set(hidden)), added, order
    o.version = (o.version or 0) + 1
    o.updated_by = actor.id
    if commit:
        db.commit()
        _audit(db, actor, "onboarding_form_changed", {"form": canonical_id, "version": o.version, "hidden": o.hidden_keys,
                                                       "added": [f["key"] for f in added], "session_id": session_id})
    else:
        db.flush()
    return form_settings(db, actor.organization_id, canonical_id)


def _audit(db, actor, action: str, details: dict) -> None:
    from app.modules.hr import onboarding_package_org as ORG
    ORG.audit(db, actor, action, details)


# ── document request categories ──────────────────────────────────────────────────────────────────────────────────────
SYSTEM_CATEGORIES = (("id_proof", "ID proof"), ("education_certificates", "Education certificates"),
                     ("experience_letters", "Experience letters"), ("bank_details", "Bank details"), ("other", "Other document"))
FILE_TYPES = ("pdf", "jpg", "jpeg", "png", "doc", "docx", "heic", "webp")
DEFAULT_TYPES = ["pdf", "jpg", "jpeg", "png"]
MAX_SIZE_MB = 20


def categories(db, organization_id: int, *, include_inactive: bool = True) -> list[OrgDocumentRequestCategory]:
    rows = (db.query(OrgDocumentRequestCategory).filter(OrgDocumentRequestCategory.organization_id == organization_id)
            .order_by(OrgDocumentRequestCategory.sort_order, OrgDocumentRequestCategory.id).all())
    have = {r.key for r in rows}
    added = False
    for i, (key, label) in enumerate(SYSTEM_CATEGORIES):
        if key not in have:
            r = OrgDocumentRequestCategory(organization_id=organization_id, key=key, label=label, is_system=True, active=True,
                                           required_by_default=key in ("id_proof", "bank_details"),
                                           accepted_types=list(DEFAULT_TYPES), max_size_mb=10, sort_order=(i + 1) * 10)
            db.add(r)
            rows.append(r)
            added = True
    if added:
        db.commit()
        rows.sort(key=lambda r: (r.sort_order, r.id or 0))
    return [r for r in rows if include_inactive or r.active]


def category_map(db, organization_id: int) -> dict:
    return {r.key: r for r in categories(db, organization_id)}


def active_keys(db, organization_id: int) -> set:
    return {r.key for r in categories(db, organization_id, include_inactive=False)}


def label_for(db, organization_id: int, key: str) -> str:
    r = category_map(db, organization_id).get(key)
    if r is not None:
        return r.label
    from app.modules.hr.onboarding_flow import DOCUMENT_LABELS
    return DOCUMENT_LABELS.get(key, key.replace("_", " ").capitalize())


def _used(db, organization_id: int, key: str) -> bool:
    from app.modules.hr.models import OnboardingDocument
    return db.query(OnboardingDocument.id).filter(OnboardingDocument.organization_id == organization_id,
                                                  OnboardingDocument.category == key).first() is not None


def ser_category(db, r: OrgDocumentRequestCategory) -> dict:
    return {"id": r.id, "key": r.key, "label": r.label, "description": r.description, "required_by_default": r.required_by_default,
            "accepted_types": list(r.accepted_types or DEFAULT_TYPES), "max_size_mb": r.max_size_mb, "sort_order": r.sort_order,
            "active": r.active, "is_system": r.is_system, "used": _used(db, r.organization_id, r.key)}


def categories_view(db, organization_id: int) -> dict:
    return {"categories": [ser_category(db, r) for r in categories(db, organization_id)], "file_types": list(FILE_TYPES),
            "max_size_mb": MAX_SIZE_MB}


def _clean_category(data: dict, partial: bool) -> dict:
    out = {}
    if "label" in data or not partial:
        label = " ".join(str(data.get("label") or "").split())[:120]
        if not label:
            raise HTTPException(422, "Give the category a name.")
        out["label"] = label
    if "description" in data:
        out["description"] = " ".join(str(data.get("description") or "").split())[:500] or None
    if "accepted_types" in data:
        types = [str(t).lower().lstrip(".") for t in (data.get("accepted_types") or [])]
        bad = [t for t in types if t not in FILE_TYPES]
        if bad or not types:
            raise HTTPException(422, f"Accepted file types must be chosen from {', '.join(FILE_TYPES)}.")
        out["accepted_types"] = list(dict.fromkeys(types))
    if "max_size_mb" in data:
        try:
            n = int(data["max_size_mb"])
        except (TypeError, ValueError):
            n = 0
        if not 1 <= n <= MAX_SIZE_MB:
            raise HTTPException(422, f"Maximum size must be between 1 and {MAX_SIZE_MB} MB.")
        out["max_size_mb"] = n
    for flag in ("required_by_default", "active"):
        if flag in data:
            out[flag] = bool(data[flag])
    if "sort_order" in data:
        try:
            out["sort_order"] = int(data["sort_order"])
        except (TypeError, ValueError):
            raise HTTPException(422, "sort_order must be a number.")
    return out


def create_category(db, actor, data: dict, *, session_id: Optional[int] = None, commit: bool = True) -> OrgDocumentRequestCategory:
    from app.modules.doc_templates import access
    access.require_hr(actor)
    rows = categories(db, actor.organization_id)
    fields = _clean_category(data or {}, partial=False)
    key = _slug((data or {}).get("key") or fields["label"])
    if not key:
        raise HTTPException(422, "Give the category a name with letters or digits.")
    from app.modules.hr.onboarding_flow import DOCUMENT_LABELS
    from app.modules.hr import onboarding_package_org as ORG
    if any(r.key == key for r in rows) or ORG.is_package_category(key) or (key in DOCUMENT_LABELS and key not in dict(SYSTEM_CATEGORIES)):
        raise HTTPException(409, f"A category called {fields['label']} already exists.")
    if len([r for r in rows if r.active]) >= 50:
        raise HTTPException(422, "An organisation can have at most 50 active categories.")
    r = OrgDocumentRequestCategory(organization_id=actor.organization_id, key=key, is_system=False, active=True,
                                   accepted_types=list(DEFAULT_TYPES), max_size_mb=10,
                                   sort_order=max([x.sort_order for x in rows] or [0]) + 10, created_by_session_id=session_id)
    for k, v in fields.items():
        setattr(r, k, v)
    db.add(r)
    if commit:
        db.commit()
        _audit(db, actor, "onboarding_upload_category_added", {"key": key, "session_id": session_id})
    else:
        db.flush()
    return r


def _own(db, actor, category_id: int) -> OrgDocumentRequestCategory:
    r = db.get(OrgDocumentRequestCategory, category_id)
    if r is None or r.organization_id != actor.organization_id:
        raise HTTPException(404, "Category not found.")
    return r


def update_category(db, actor, category_id: int, data: dict) -> OrgDocumentRequestCategory:
    from app.modules.doc_templates import access
    access.require_hr(actor)
    r = _own(db, actor, category_id)
    if "key" in (data or {}) and data["key"] != r.key:
        raise HTTPException(422, "A category's key cannot change.")
    for k, v in _clean_category(data or {}, partial=True).items():
        setattr(r, k, v)
    db.commit()
    _audit(db, actor, "onboarding_upload_category_changed", {"key": r.key, "changed": sorted((data or {}).keys())})
    return r


def delete_category(db, actor, category_id: int) -> dict:
    """A used or system category is deactivated (never hard-deleted); an unused one is removed."""
    from app.modules.doc_templates import access
    access.require_hr(actor)
    r = _own(db, actor, category_id)
    if r.is_system or _used(db, actor.organization_id, r.key):
        r.active = False
        db.commit()
        _audit(db, actor, "onboarding_upload_category_deactivated", {"key": r.key})
        return {"deleted": False, "deactivated": True}
    db.delete(r)
    db.commit()
    _audit(db, actor, "onboarding_upload_category_deleted", {"key": r.key})
    return {"deleted": True, "deactivated": False}


def check_upload(db, organization_id: int, key: str, filename: str, size: int) -> None:
    """The category's own accepted file types and maximum size (portal uploads)."""
    r = category_map(db, organization_id).get(key)
    if r is None:
        return                                        # package documents (complete-and-return) and old rows: generic checks only
    ext = (filename or "").rsplit(".", 1)[-1].lower() if "." in (filename or "") else ""
    types = r.accepted_types or DEFAULT_TYPES
    if ext not in types:
        raise HTTPException(400, f"{r.label} must be one of: {', '.join(t.upper() for t in types)}.")
    if size > (r.max_size_mb or 10) * 1024 * 1024:
        raise HTTPException(400, f"{r.label} can be at most {r.max_size_mb} MB.")
