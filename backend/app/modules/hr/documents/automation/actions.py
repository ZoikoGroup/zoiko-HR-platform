"""Typed, allow-listed actions a rule may run (ZHR-DOCS-ARCH-001 §15.1).

A handler receives the action's parameters, the run's context and the run; it returns a StepResult. It raises
RetryableError for a temporary problem (the run is retried with backoff) and PermanentError for one that will not go away
(the run fails without retries). With `dry=True` a handler must not change anything or send anything: it describes what it
would do. Handlers are registered with @action and reach domain services only through their public functions.
"""
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Callable, Optional

MAX_DELAY_SECONDS = 7 * 24 * 3600


class RetryableError(RuntimeError):
    pass


class PermanentError(RuntimeError):
    pass


@dataclass
class StepResult:
    ok: bool = True
    detail: dict = field(default_factory=dict)
    resume_at: Optional[datetime] = None      # set by `delay`: the run continues with the NEXT step at this time
    defer_until: Optional[datetime] = None    # set by quiet hours: THIS step runs again at this time (nothing was done)


ActionHandler = Callable[..., StepResult]
ACTIONS: dict[str, ActionHandler] = {}


def action(name: str):
    def register(fn: ActionHandler) -> ActionHandler:
        ACTIONS[name] = fn
        return fn
    return register


@action("delay")
def _delay(db, params: dict, ctx: dict, run, *, dry: bool, now: datetime) -> StepResult:
    try:
        seconds = int(params.get("seconds", 0))
    except (TypeError, ValueError):
        raise PermanentError("delay needs whole seconds")
    if seconds <= 0 or seconds > MAX_DELAY_SECONDS:
        raise PermanentError(f"delay must be between 1 second and {MAX_DELAY_SECONDS // 86400} days")
    return StepResult(detail={"seconds": seconds}, resume_at=None if dry else now + timedelta(seconds=seconds))


@action("log")
def _log(db, params: dict, ctx: dict, run, *, dry: bool, now: datetime) -> StepResult:
    """Records a note in the run's results. Useful for testing rules in shadow mode."""
    return StepResult(detail={"message": str(params.get("message", ""))[:200]})


def run_action(db, spec: dict, ctx: dict, run, *, dry: bool, now: datetime) -> StepResult:
    kind = spec.get("type")
    handler = ACTIONS.get(kind)
    if handler is None:
        raise PermanentError(f"unknown action {kind!r}")
    params: dict[str, Any] = {k: v for k, v in spec.items() if k != "type"}
    return handler(db, params, ctx, run, dry=dry, now=now)


# The documents actions register themselves into ACTIONS (kept in their own module; imported last to avoid a cycle).
from app.modules.hr.documents.automation import doc_actions  # noqa: E402,F401
