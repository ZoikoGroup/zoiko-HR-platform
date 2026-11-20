"""Rule definitions: validation and condition evaluation (ZHR-DOCS-ARCH-001 §15.1).

A definition is data, never code:
    {"conditions": {"all": [{"field": "data.category_key", "op": "in", "value": [...]}, ...]},
     "actions": [{"type": "notify", ...}, ...]}
Fields come from a whitelisted context (automation/context.py); operators are a fixed set; nesting is at most two levels.
"""
from typing import Any

MAX_CONDITIONS = 10
MAX_ACTIONS = 8
MAX_DEPTH = 2
OPERATORS = ("eq", "ne", "in", "not_in", "gt", "gte", "lt", "lte", "exists", "contains")
FIELD_PREFIXES = ("data.", "employee.", "category.", "org.")
# Actions a rule may never perform: approving a person's document, widening access, deleting files, crossing tenants.
FORBIDDEN_ACTIONS = frozenset({"approve", "approve_document", "auto_approve", "widen_access", "set_access", "delete_file",
                               "delete_documents", "change_organization"})


class RuleInvalid(ValueError):
    def __init__(self, errors: list[str]):
        super().__init__("; ".join(errors))
        self.errors = errors


def _walk(node: Any, depth: int, errors: list[str], counter: list[int]) -> None:
    if not isinstance(node, dict):
        errors.append("a condition must be an object")
        return
    groups = [k for k in ("all", "any") if k in node]
    if groups:
        if len(groups) != 1 or len(node) != 1:
            errors.append("a condition group has exactly one of 'all' / 'any'")
            return
        if depth >= MAX_DEPTH:
            errors.append(f"conditions nest at most {MAX_DEPTH} levels")
            return
        children = node[groups[0]]
        if not isinstance(children, list):
            errors.append(f"'{groups[0]}' must be a list")
            return
        for child in children:
            _walk(child, depth + 1, errors, counter)
        return
    counter[0] += 1
    field, op = node.get("field"), node.get("op")
    if not isinstance(field, str) or not field.startswith(FIELD_PREFIXES):
        errors.append(f"unknown field {field!r}")
    if op not in OPERATORS:
        errors.append(f"unknown operator {op!r}")
    if op in ("in", "not_in") and not isinstance(node.get("value"), list):
        errors.append(f"'{op}' needs a list value")


def validate_definition(definition: Any) -> dict:
    """The definition, normalised; raises RuleInvalid with every problem found."""
    errors: list[str] = []
    if not isinstance(definition, dict):
        raise RuleInvalid(["a rule definition must be an object"])
    conditions = definition.get("conditions") or {"all": []}
    counter = [0]
    _walk(conditions, 0, errors, counter)
    if counter[0] > MAX_CONDITIONS:
        errors.append(f"at most {MAX_CONDITIONS} conditions")
    actions = definition.get("actions")
    if not isinstance(actions, list) or not actions:
        errors.append("a rule needs at least one action")
        actions = []
    if len(actions) > MAX_ACTIONS:
        errors.append(f"at most {MAX_ACTIONS} actions")
    from app.modules.hr.documents.automation.actions import ACTIONS
    for i, action in enumerate(actions):
        kind = action.get("type") if isinstance(action, dict) else None
        if kind in FORBIDDEN_ACTIONS:
            errors.append(f"action {i + 1}: '{kind}' is not allowed in a rule")
        elif kind not in ACTIONS:
            errors.append(f"action {i + 1}: unknown action {kind!r}")
    if errors:
        raise RuleInvalid(errors)
    return {"conditions": conditions, "actions": actions}


def _resolve(ctx: dict, path: str) -> tuple[bool, Any]:
    cur: Any = ctx
    for part in path.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return False, None
    return True, cur


def _compare(op: str, found: bool, actual: Any, expected: Any) -> bool:
    if op == "exists":
        return found and actual is not None
    if not found:
        return op in ("ne", "not_in")
    try:
        if op == "eq":
            return actual == expected
        if op == "ne":
            return actual != expected
        if op == "in":
            return actual in (expected or [])
        if op == "not_in":
            return actual not in (expected or [])
        if op == "contains":
            return expected in actual if isinstance(actual, (list, str)) else False
        if actual is None or expected is None:
            return False
        if op == "gt":
            return actual > expected
        if op == "gte":
            return actual >= expected
        if op == "lt":
            return actual < expected
        if op == "lte":
            return actual <= expected
    except TypeError:
        return False
    return False


def evaluate(conditions: Any, ctx: dict) -> bool:
    if not conditions:
        return True
    if "all" in conditions:
        return all(evaluate(c, ctx) for c in conditions["all"])
    if "any" in conditions:
        items = conditions["any"]
        return any(evaluate(c, ctx) for c in items) if items else True
    found, actual = _resolve(ctx, conditions.get("field", ""))
    return _compare(conditions.get("op"), found, actual, conditions.get("value"))
