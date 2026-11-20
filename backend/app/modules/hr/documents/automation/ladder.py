"""Escalation ladders (ZHR-DOCS-ARCH-001 §12.2): when an open task reminds whom, and when it becomes overdue.

    [{"after_days": 0,  "action": "notify", "to": "assignee",  "channels": ["in_app", "email"]},
     {"after_days": 3,  "action": "notify", "to": "assignee",  "channels": ["email"]},
     {"after_days": 7,  "action": "notify", "to": "manager",   "channels": ["in_app", "email"]},
     {"after_days": 14, "action": "notify", "to": "hr_admins", "channels": ["in_app"], "mark_overdue": true}]

A task's ladder is fixed when the task is opened (category ladder, else the organization default, else DEFAULT_LADDER).
Step 0 is the first notice, sent when the task opens; the escalation job handles the later steps.
"""
from datetime import datetime, timedelta
from typing import Optional

MAX_STEPS = 6
RECIPIENTS = ("assignee", "manager", "hr_admins", "org_admins")
CHANNELS = ("in_app", "email", "slack", "sms")

DEFAULT_LADDER = (
    {"after_days": 0, "action": "notify", "to": "assignee", "channels": ["in_app", "email"]},
    {"after_days": 3, "action": "notify", "to": "assignee", "channels": ["email"]},
    {"after_days": 7, "action": "notify", "to": "manager", "channels": ["in_app", "email"]},
    {"after_days": 14, "action": "notify", "to": "hr_admins", "channels": ["in_app"], "mark_overdue": True},
)


class LadderInvalid(ValueError):
    pass


def validate_ladder(steps) -> list[dict]:
    if not isinstance(steps, list) or not steps:
        raise LadderInvalid("A ladder needs at least one step.")
    if len(steps) > MAX_STEPS:
        raise LadderInvalid(f"A ladder has at most {MAX_STEPS} steps.")
    out, last = [], -1
    for i, step in enumerate(steps):
        if not isinstance(step, dict):
            raise LadderInvalid(f"Step {i + 1} is not valid.")
        try:
            after = int(step.get("after_days"))
        except (TypeError, ValueError):
            raise LadderInvalid(f"Step {i + 1}: after_days must be a whole number.") from None
        if after < 0 or after <= last:
            raise LadderInvalid("Each step must come later than the one before it.")
        to = step.get("to")
        if to not in RECIPIENTS:
            raise LadderInvalid(f"Step {i + 1}: unknown recipient {to!r}.")
        channels = [c for c in (step.get("channels") or ["in_app"]) if c in CHANNELS]
        if not channels:
            raise LadderInvalid(f"Step {i + 1}: choose at least one channel.")
        out.append({"after_days": after, "action": "notify", "to": to, "channels": channels,
                    "mark_overdue": bool(step.get("mark_overdue"))})
        last = after
    return out


def resolve_ladder(category_ladder=None, org_default=None) -> list[dict]:
    for candidate in (category_ladder, org_default):
        if candidate:
            try:
                return validate_ladder(candidate)
            except LadderInvalid:
                continue
    return [dict(s) for s in DEFAULT_LADDER]


def due_step(ladder: list[dict], opened_at: datetime, level: int, now: Optional[datetime] = None) -> Optional[tuple[int, dict]]:
    """(next level, step) when the task has reached its next step; None when nothing is due (or the ladder is done).
    `level` is the number of steps already sent."""
    now = now or datetime.utcnow()
    if level >= len(ladder):
        return None
    step = ladder[level]
    if now >= opened_at + timedelta(days=int(step["after_days"])):
        return level + 1, step
    return None
