"""Structured content: the block vocabulary and its save-time validation.

A variant's `content` is a list of blocks (docs/templates/architecture.md §Content). Validation runs when a variant or clause is
saved, so unknown fields, unknown clauses, prohibited clauses, bad conditions and removed locked blocks are refused before any
document can be generated.
"""
from __future__ import annotations

import hashlib
import json
import re
from typing import Iterable

from app.core.privacy.classification import Level
from app.modules.doc_templates import conditions, fields, resolver

BLOCK_TYPES = ("letterhead", "heading", "paragraph", "list", "table", "field_group", "form_fields", "checklist", "clause",
               "declaration", "signature_block", "page_break")
LIST_STYLES = ("bullet", "number", "check")
DECLARATION_MODES = ("acknowledge", "sign", "consent")
PARTIES = ("employer", "employee", "candidate", "witness", "reviewer")
FORM_TYPES = ("text", "textarea", "date", "number", "select", "checkbox")
ROLES = ("admin", "hr_admin", "manager", "employee")
_KEY = re.compile(r"^[a-z][a-z0-9_]{0,79}$")
_COMMON = {"type", "include_when", "locked", "id"}
_ALLOWED_KEYS = {
    "letterhead": set(),
    "heading": {"text", "level"},
    "paragraph": {"text", "style"},
    "list": {"style", "items", "items_from"},
    "table": {"columns", "rows", "rows_from"},
    "field_group": {"fields", "labels"},
    "form_fields": {"fields"},
    "checklist": {"items"},
    "clause": {"key", "required"},
    "declaration": {"text", "mode"},
    "signature_block": {"parties"},
    "page_break": set(),
}
MAX_BLOCKS = 400
MAX_TEXT = 20000


def canonical_json(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)


def checksum(*parts) -> str:
    return hashlib.sha256(canonical_json(list(parts)).encode("utf-8")).hexdigest()


def _texts(block: dict) -> Iterable[str]:
    t = block.get("type")
    if t in ("heading", "paragraph", "declaration"):
        yield block.get("text") or ""
    elif t == "list":
        for item in block.get("items") or []:
            yield item if isinstance(item, str) else ""
    elif t == "table":
        for col in block.get("columns") or []:
            yield col if isinstance(col, str) else ""
        for row in block.get("rows") or []:
            for cell in row if isinstance(row, list) else []:
                yield cell if isinstance(cell, str) else ""


def references(content: list) -> dict:
    """Field keys, clause keys and whether the required block is used, across the whole content."""
    field_keys, clause_keys, required_block = set(), set(), False
    for block in content or []:
        if not isinstance(block, dict):
            continue
        for text in _texts(block):
            field_keys |= resolver.field_keys(text)
            clause_keys |= resolver.clause_keys(text)
            required_block = required_block or resolver.uses_required_block(text)
        if block.get("type") == "field_group":
            field_keys |= {f for f in block.get("fields") or [] if isinstance(f, str)}
        if block.get("type") == "table" and isinstance(block.get("rows_from"), str):
            field_keys.add(block["rows_from"])
        if block.get("type") == "list" and isinstance(block.get("items_from"), str):
            field_keys.add(block["items_from"])
        if block.get("type") == "clause" and isinstance(block.get("key"), str):
            clause_keys.add(block["key"])
        if block.get("include_when"):
            field_keys |= set(conditions.fields_in(block["include_when"]))
    return {"fields": field_keys, "clauses": clause_keys, "required_block": required_block}


def validate_content(content, field_contract, clause_rules, *, allow_system_fields: bool = False) -> list[str]:
    """All problems with a variant's content, field contract and clause rules ([] = valid)."""
    problems: list[str] = []
    if not isinstance(content, list) or not content:
        return ["content must be a non-empty list of blocks"]
    if len(content) > MAX_BLOCKS:
        problems.append(f"content has more than {MAX_BLOCKS} blocks")

    def known(key: str) -> bool:
        fd = fields.REGISTRY.get(key)
        return fd is not None and (allow_system_fields or not fd.system_only)

    contract_required = list((field_contract or {}).get("required") or [])
    contract_optional = list((field_contract or {}).get("optional") or [])
    if not isinstance(field_contract, dict):
        problems.append("field_contract must be an object with 'required' and 'optional' lists")
    for key in contract_required + contract_optional:
        if not known(key):
            problems.append(f"unknown field in field_contract: {key}")

    rules = clause_rules if isinstance(clause_rules, dict) else {}
    mandatory = list(rules.get("mandatory") or [])
    optional = list(rules.get("optional") or [])
    prohibited = list(rules.get("prohibited") or [])
    for key in mandatory + optional + prohibited:
        if not isinstance(key, str) or not _KEY.match(key):
            problems.append(f"invalid clause key in clause_rules: {key!r}")
    if set(mandatory) & set(prohibited):
        problems.append(f"clauses both mandatory and prohibited: {sorted(set(mandatory) & set(prohibited))}")

    for i, block in enumerate(content):
        where = f"block {i + 1}"
        if not isinstance(block, dict):
            problems.append(f"{where}: must be an object")
            continue
        t = block.get("type")
        if t not in BLOCK_TYPES:
            problems.append(f"{where}: unknown block type {t!r}")
            continue
        extra = set(block) - _COMMON - _ALLOWED_KEYS[t]
        if extra:
            problems.append(f"{where} ({t}): unknown keys {sorted(extra)}")
        for text in _texts(block):
            if not isinstance(text, str) or len(text) > MAX_TEXT:
                problems.append(f"{where} ({t}): text must be a string of at most {MAX_TEXT} characters")
                continue
            for key in resolver.field_keys(text):
                if not known(key):
                    problems.append(f"{where} ({t}): unknown field {{{{{key}}}}}")
        if block.get("include_when") is not None:
            problems += [f"{where}: {p}" for p in conditions.validate(block["include_when"], known)]
        if "locked" in block and not isinstance(block["locked"], bool):
            problems.append(f"{where}: 'locked' must be true or false")
        problems += [f"{where} ({t}): {p}" for p in _validate_block(t, block, known)]

    refs = references(content)
    declared = set(contract_required) | set(contract_optional)
    for key in sorted(refs["fields"] - declared):
        if known(key):
            problems.append(f"field {key} is used in the content but missing from field_contract")
    for key in sorted(refs["clauses"]):
        if key in prohibited:
            problems.append(f"prohibited clause used in content: {key}")
        elif key not in mandatory and key not in optional:
            problems.append(f"clause {key} is used in the content but not declared in clause_rules")
    return problems


def _validate_block(t: str, b: dict, known) -> list[str]:
    p: list[str] = []
    if t == "heading":
        if not isinstance(b.get("text"), str) or not b["text"].strip():
            p.append("heading needs text")
        if b.get("level", 1) not in (1, 2, 3):
            p.append("heading level must be 1, 2 or 3")
    elif t == "paragraph":
        if not isinstance(b.get("text"), str):
            p.append("paragraph needs text")
        if b.get("style") not in (None, "normal", "small", "notice"):
            p.append("paragraph style must be normal, small or notice")
    elif t == "list":
        if b.get("style", "bullet") not in LIST_STYLES:
            p.append(f"list style must be one of {LIST_STYLES}")
        if "items_from" in b:
            if not isinstance(b["items_from"], str) or not known(b["items_from"]):
                p.append(f"unknown items_from field: {b.get('items_from')!r}")
            elif fields.REGISTRY[b["items_from"]].type != "list":
                p.append(f"items_from field {b['items_from']} is not a list field")
        elif not isinstance(b.get("items"), list) or not b["items"] or not all(isinstance(i, str) for i in b["items"]):
            p.append("list needs a non-empty list of text items (or items_from)")
    elif t == "table":
        cols = b.get("columns")
        if not isinstance(cols, list) or not cols or not all(isinstance(c, str) for c in cols):
            p.append("table needs a list of column headings")
        if "rows_from" in b:
            if not isinstance(b["rows_from"], str) or not known(b["rows_from"]):
                p.append(f"unknown rows_from field: {b.get('rows_from')!r}")
            elif fields.REGISTRY[b["rows_from"]].type != "rows":
                p.append(f"rows_from field {b['rows_from']} is not a table field")
        elif not isinstance(b.get("rows"), list) or not all(isinstance(r, list) for r in b["rows"]):
            p.append("table needs rows (a list of lists) or rows_from")
        elif cols and any(len(r) != len(cols) for r in b["rows"]):
            p.append("every table row must have one cell per column")
    elif t == "field_group":
        fs = b.get("fields")
        if not isinstance(fs, list) or not fs:
            p.append("field_group needs a list of field keys")
        else:
            p += [f"unknown field {f!r}" for f in fs if not isinstance(f, str) or not known(f)]
        if "labels" in b and not isinstance(b["labels"], dict):
            p.append("field_group labels must map field keys to labels")
    elif t == "form_fields":
        fs = b.get("fields")
        if not isinstance(fs, list) or not fs:
            p.append("form_fields needs a list of field definitions")
        else:
            seen = set()
            levels = {lvl.value for lvl in Level}
            for f in fs:
                if not isinstance(f, dict) or not _KEY.match(str(f.get("key", ""))):
                    p.append(f"form field needs a snake_case key: {f!r}")
                    continue
                if f["key"] in seen:
                    p.append(f"duplicate form field key {f['key']}")
                seen.add(f["key"])
                if not isinstance(f.get("label"), str) or not f["label"].strip():
                    p.append(f"form field {f['key']} needs a label")
                if f.get("type", "text") not in FORM_TYPES:
                    p.append(f"form field {f['key']}: type must be one of {FORM_TYPES}")
                if f.get("type") == "select" and not (isinstance(f.get("options"), list) and f["options"]):
                    p.append(f"form field {f['key']}: select needs options")
                if f.get("classification") is not None and f["classification"] not in levels:
                    p.append(f"form field {f['key']}: unknown classification {f['classification']!r}")
    elif t == "checklist":
        items = b.get("items")
        if not isinstance(items, list) or not items:
            p.append("checklist needs items")
        else:
            for it in items:
                if not isinstance(it, dict) or not _KEY.match(str(it.get("key", ""))) or not isinstance(it.get("label"), str):
                    p.append(f"checklist item needs key and label: {it!r}")
                    continue
                if it.get("owner_role") is not None and it["owner_role"] not in ROLES:
                    p.append(f"checklist item {it['key']}: unknown owner_role {it['owner_role']!r}")
                if it.get("due_offset_days") is not None and not isinstance(it["due_offset_days"], int):
                    p.append(f"checklist item {it['key']}: due_offset_days must be a whole number")
    elif t == "clause":
        if not isinstance(b.get("key"), str) or not _KEY.match(b["key"]):
            p.append("clause block needs a clause key")
    elif t == "declaration":
        if not isinstance(b.get("text"), str) or not b["text"].strip():
            p.append("declaration needs text")
        if b.get("mode") not in DECLARATION_MODES:
            p.append(f"declaration mode must be one of {DECLARATION_MODES}")
    elif t == "signature_block":
        parties = b.get("parties")
        if not isinstance(parties, list) or not parties or any(x not in PARTIES for x in parties):
            p.append(f"signature_block parties must be a non-empty subset of {PARTIES}")
    return p


def locked_blocks_preserved(base: list, new: list) -> list[str]:
    """Every block marked locked in `base` must be present, unchanged, in `new` (order may change)."""
    new_set = {canonical_json(b) for b in new or [] if isinstance(b, dict)}
    problems = []
    for b in base or []:
        if isinstance(b, dict) and b.get("locked") and canonical_json(b) not in new_set:
            problems.append(f"locked {b.get('type')} block cannot be removed or edited"
                            + (f" (id {b['id']})" if b.get("id") else ""))
    return problems
