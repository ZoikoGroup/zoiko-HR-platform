"""`include_when` conditions on content blocks: a tiny data grammar evaluated in Python, never `eval`.

    {"field": "employment.employment_type", "op": "in", "value": ["part_time"]}
    {"all": [cond, cond]}   {"any": [cond, cond]}          (nesting depth at most 2)

Ops: eq, ne, in, not_in, present, absent. Field keys must be registered in fields.py. Anything else is a validation error at
save time; at render time an invalid condition raises (the engine fails closed rather than guessing).
"""
from __future__ import annotations

from typing import Any, Callable, Iterable

OPS = ("eq", "ne", "in", "not_in", "present", "absent")
MAX_DEPTH = 2


class ConditionError(ValueError):
    pass


def validate(cond: Any, known_field: Callable[[str], bool], depth: int = 0) -> list[str]:
    """Problems with a condition ([] when valid)."""
    if not isinstance(cond, dict):
        return ["condition must be an object"]
    if "all" in cond or "any" in cond:
        if depth >= MAX_DEPTH:
            return [f"conditions may nest at most {MAX_DEPTH} levels"]
        key = "all" if "all" in cond else "any"
        if set(cond) != {key} or not isinstance(cond[key], list) or not cond[key]:
            return [f"'{key}' must be the only key and hold a non-empty list"]
        out = []
        for c in cond[key]:
            out += validate(c, known_field, depth + 1)
        return out
    if set(cond) - {"field", "op", "value"}:
        return [f"unknown condition keys: {sorted(set(cond) - {'field', 'op', 'value'})}"]
    field, op = cond.get("field"), cond.get("op")
    problems = []
    if not isinstance(field, str) or not known_field(field):
        problems.append(f"unknown field in condition: {field!r}")
    if op not in OPS:
        problems.append(f"unknown condition op: {op!r}")
    elif op in ("in", "not_in") and not isinstance(cond.get("value"), list):
        problems.append(f"'{op}' needs a list value")
    elif op in ("eq", "ne") and "value" not in cond:
        problems.append(f"'{op}' needs a value")
    return problems


def _norm(v):
    return v.value if hasattr(v, "value") else v


def evaluate(cond: Any, values: dict, depth: int = 0) -> bool:
    if not isinstance(cond, dict):
        raise ConditionError("condition must be an object")
    if "all" in cond:
        if depth >= MAX_DEPTH:
            raise ConditionError("condition nested too deep")
        return all(evaluate(c, values, depth + 1) for c in cond["all"])
    if "any" in cond:
        if depth >= MAX_DEPTH:
            raise ConditionError("condition nested too deep")
        return any(evaluate(c, values, depth + 1) for c in cond["any"])
    op = cond.get("op")
    actual = _norm(values.get(cond.get("field")))
    present = actual not in (None, "", [], {})
    if op == "present":
        return present
    if op == "absent":
        return not present
    expected = cond.get("value")
    if op == "eq":
        return actual == expected
    if op == "ne":
        return actual != expected
    if op == "in":
        return actual in (expected or [])
    if op == "not_in":
        return actual not in (expected or [])
    raise ConditionError(f"unknown op {op!r}")


def fields_in(cond: Any) -> Iterable[str]:
    if not isinstance(cond, dict):
        return []
    if "all" in cond or "any" in cond:
        out = []
        for c in cond.get("all") or cond.get("any") or []:
            out += list(fields_in(c))
        return out
    return [cond["field"]] if isinstance(cond.get("field"), str) else []
