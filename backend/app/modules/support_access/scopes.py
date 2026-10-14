"""Grant scope: strict schema, narrowing, intersection and server-side risk (ZHR-PRIV-001 B05-B07, E03, E06).

A scope is the exact, bounded answer to "what may this grant touch". It is a plain JSON document so it can travel through
the state machine and be stored on the request, the approvals and the grant. Every field is validated against the data
classification registry, so an unknown table, an unknown column or a `SECRET` column can never be requested - and a scope
that would be tenant-wide is simply not expressible: record ids are explicit, and an empty list means "no records", never
"all".

Canonical form (lists sorted, no duplicates) so a scope hashes to a stable `scope_hash`:

    {
      "resources": ["employees"],
      "record_ids": [12, 34],
      "entity_ids": [],
      "department_ids": [],
      "jurisdictions": [],
      "fields": {"employees": ["first_name", "job_title"]},
      "actions": ["read"]
    }
"""
from __future__ import annotations

import hashlib
import json
from typing import Any, Iterable, Mapping, Optional

from app.core.privacy import classification as cls
from app.core.privacy.classification import Level
from app.modules.support_access.models import (
    GRANTABLE_ACTIONS,
    HIGH_RISK_ACTIONS,
    MAX_DURATION_MINUTES,
    PurposeCategory,
    RiskLevel,
)

SCOPE_KEYS = frozenset(
    {"resources", "record_ids", "entity_ids", "department_ids", "jurisdictions", "fields", "actions"}
)
_ID_LIST_KEYS = ("record_ids", "entity_ids", "department_ids")
# A field at one of these levels, a write/export action, or a large record set makes the request HIGH risk.
HIGH_RISK_FIELD_LEVELS = frozenset(
    {Level.FINANCIAL, Level.SPECIAL_CATEGORY, Level.TENANT_BUSINESS_FINANCE, Level.TENANT_CUSTOMER}
)
DEFAULT_RECORD_THRESHOLD = 25


class ScopeError(ValueError):
    """The scope is not acceptable. The message names the offending part only (a table, a column, a key); never a value."""


# ── validation ──────────────────────────────────────────────────────────────────────────────────────────────────────
def _table(table: str):
    from app.database import Base

    return Base.metadata.tables.get(table)


def _known_resource(table: str) -> bool:
    """A resource is a real, classified tenant data-plane table. Control-plane tables cannot be the subject of a grant."""
    if _table(table) is None:
        return False
    base = cls.table_default(table)
    if base == cls.UNCLASSIFIED:
        return False
    return base not in cls.PLATFORM_VISIBLE


def _known_column(table: str, column: str) -> bool:
    t = _table(table)
    return t is not None and column in t.c


def _int_list(value: Any, key: str) -> list[int]:
    if value is None:
        return []
    if not isinstance(value, (list, tuple)):
        raise ScopeError(f"{key} must be a list")
    out = []
    for item in value:
        if isinstance(item, bool) or not isinstance(item, int):
            try:
                item = int(item)
            except (TypeError, ValueError):
                raise ScopeError(f"{key} must contain integers")
        out.append(int(item))
    return sorted(set(out))


def _str_list(value: Any, key: str) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, (list, tuple)):
        raise ScopeError(f"{key} must be a list")
    out = []
    for item in value:
        if not isinstance(item, str):
            raise ScopeError(f"{key} must contain strings")
        out.append(item.strip())
    return sorted({x for x in out if x})


def validate_scope(scope: Any, *, purpose_category: Optional[str] = None) -> dict:
    """Return the canonical scope, or raise ScopeError. Strict: unknown keys, resources, fields or actions are refused."""
    if not isinstance(scope, Mapping):
        raise ScopeError("scope must be an object")
    unknown = set(scope) - SCOPE_KEYS
    if unknown:
        raise ScopeError(f"unknown scope keys: {', '.join(sorted(unknown))}")

    resources = _str_list(scope.get("resources"), "resources")
    if not resources:
        raise ScopeError("resources must name at least one resource")
    for r in resources:
        if not _known_resource(r):
            raise ScopeError(f"unknown resource: {r}")

    ids = {k: _int_list(scope.get(k), k) for k in _ID_LIST_KEYS}
    jurisdictions = _str_list(scope.get("jurisdictions"), "jurisdictions")

    raw_fields = scope.get("fields")
    if not isinstance(raw_fields, Mapping) or not raw_fields:
        raise ScopeError("fields must map every resource to at least one field")
    fields: dict[str, list[str]] = {}
    for res, names in raw_fields.items():
        if res not in resources:
            raise ScopeError(f"fields names a resource not in resources: {res}")
        names = _str_list(names, f"fields.{res}")
        if not names:
            raise ScopeError(f"fields.{res} must name at least one field")
        for name in names:
            if not _known_column(res, name):
                raise ScopeError(f"unknown field: {res}.{name}")
            level = cls.classify(res, name)
            if level == cls.UNCLASSIFIED:
                raise ScopeError(f"unknown or unclassified field: {res}.{name}")
            if Level(level) == Level.SECRET:
                raise ScopeError(f"field can never be requested: {res}.{name}")
        fields[res] = names
    missing = set(resources) - set(fields)
    if missing:
        raise ScopeError(f"fields must cover every resource (missing: {', '.join(sorted(missing))})")

    actions = _str_list(scope.get("actions"), "actions")
    if not actions:
        raise ScopeError("actions must name at least one action")
    for a in actions:
        if a not in GRANTABLE_ACTIONS:
            raise ScopeError(f"action can never be requested: {a}")
    if "update" in actions and purpose_category != PurposeCategory.DATA_CORRECTION_ASSIST.value:
        raise ScopeError("update requires purpose_category DATA_CORRECTION_ASSIST")

    return {
        "resources": resources,
        "record_ids": ids["record_ids"],
        "entity_ids": ids["entity_ids"],
        "department_ids": ids["department_ids"],
        "jurisdictions": jurisdictions,
        "fields": {r: fields[r] for r in resources},
        "actions": actions,
    }


def validate_duration(minutes: Any) -> int:
    try:
        minutes = int(minutes)
    except (TypeError, ValueError):
        raise ScopeError("duration must be a number of minutes")
    if minutes < 1 or minutes > MAX_DURATION_MINUTES:
        raise ScopeError(f"duration must be between 1 and {MAX_DURATION_MINUTES} minutes")
    return minutes


# ── canonical hash ──────────────────────────────────────────────────────────────────────────────────────────────────
def canonical(scope: Mapping[str, Any]) -> str:
    return json.dumps(scope, sort_keys=True, separators=(",", ":"))


def scope_hash(scope: Mapping[str, Any]) -> str:
    return hashlib.sha256(canonical(scope).encode()).hexdigest()


# ── narrowing / intersection ────────────────────────────────────────────────────────────────────────────────────────
def _subset(a: Iterable, b: Iterable) -> bool:
    return set(a) <= set(b)


def narrower_or_equal(requested: Mapping[str, Any], approved: Mapping[str, Any]) -> bool:
    """True when `approved` only SHRINKS `requested`. Any widening (or a new key, resource, action or field) is False."""
    if not _subset(approved.get("resources", []), requested.get("resources", [])):
        return False
    for key in _ID_LIST_KEYS + ("jurisdictions",):
        if not _subset(approved.get(key, []), requested.get(key, [])):
            return False
    if not _subset(approved.get("actions", []), requested.get("actions", [])):
        return False
    req_fields = requested.get("fields", {})
    for res, names in approved.get("fields", {}).items():
        if res not in req_fields or not _subset(names, req_fields[res]):
            return False
    return True


def assert_narrowing(requested: Mapping[str, Any], approved: Any) -> dict:
    """Validate and canonicalise an approving scope, refusing anything that widens the request."""
    canon = validate_scope(approved)
    if not narrower_or_equal(requested, canon):
        raise ScopeError("an approval may only narrow the requested scope")
    return canon


def _field_intersection(scopes: list[Mapping[str, Any]]) -> dict[str, list[str]]:
    resources = set(scopes[0].get("fields", {}))
    for s in scopes[1:]:
        resources &= set(s.get("fields", {}))
    out: dict[str, list[str]] = {}
    for res in sorted(resources):
        names = set(scopes[0]["fields"][res])
        for s in scopes[1:]:
            names &= set(s["fields"].get(res, []))
        if names:
            out[res] = sorted(names)
    return out


def intersect(scopes: list[Mapping[str, Any]]) -> dict:
    """The effective scope: only what EVERY scope allows (the intersection of the request and all approvals)."""
    if not scopes:
        raise ScopeError("no scopes to intersect")
    fields = _field_intersection(scopes)
    resources = sorted(fields)

    def _inter(key: str) -> list:
        out = set(scopes[0].get(key, []))
        for s in scopes[1:]:
            out &= set(s.get(key, []))
        return sorted(out)

    result = {
        "resources": resources,
        "record_ids": _inter("record_ids"),
        "entity_ids": _inter("entity_ids"),
        "department_ids": _inter("department_ids"),
        "jurisdictions": _inter("jurisdictions"),
        "fields": fields,
        "actions": _inter("actions"),
    }
    if not resources or not result["actions"]:
        raise ScopeError("the effective scope is empty")
    return result


# ── risk and categories ─────────────────────────────────────────────────────────────────────────────────────────────
def levels_touched(scope: Mapping[str, Any]) -> set[Level]:
    """Every classification level the scope reaches, through any requested field."""
    out: set[Level] = set()
    for res, names in scope.get("fields", {}).items():
        for name in names:
            level = cls.classify(res, name)
            if level != cls.UNCLASSIFIED:
                out.add(Level(level))
    return out


def compute_risk(scope: Mapping[str, Any], *, record_threshold: int = DEFAULT_RECORD_THRESHOLD) -> RiskLevel:
    """HIGH when a sensitive field, an export/download/bulk/update action, or a large record set is involved."""
    if levels_touched(scope) & HIGH_RISK_FIELD_LEVELS:
        return RiskLevel.HIGH
    if set(scope.get("actions", [])) & HIGH_RISK_ACTIONS:
        return RiskLevel.HIGH
    if len(scope.get("record_ids", [])) > record_threshold:
        return RiskLevel.HIGH
    return RiskLevel.STANDARD


def requires_privacy_approval(scope: Mapping[str, Any]) -> bool:
    """SPECIAL_CATEGORY data needs a Privacy approver (and a documented legal basis), never tenant consent alone (E10)."""
    return Level.SPECIAL_CATEGORY in levels_touched(scope)


def requires_security_approval(scope: Mapping[str, Any]) -> bool:
    """Financial / tenant-business-finance data, and every export, download, bulk read or write, need Security."""
    levels = levels_touched(scope)
    if levels & {Level.FINANCIAL, Level.TENANT_BUSINESS_FINANCE}:
        return True
    return bool(set(scope.get("actions", [])) & HIGH_RISK_ACTIONS)


def categories(scope: Mapping[str, Any]) -> list[str]:
    return sorted(l.value for l in levels_touched(scope))


def summary(scope: Mapping[str, Any]) -> dict:
    """A non-identifying description for notifications and lists: resources, categories, counts, actions, duration-ish."""
    return {
        "resources": list(scope.get("resources", [])),
        "record_count": len(scope.get("record_ids", [])),
        "department_count": len(scope.get("department_ids", [])),
        "entity_count": len(scope.get("entity_ids", [])),
        "categories": categories(scope),
        "actions": list(scope.get("actions", [])),
    }
