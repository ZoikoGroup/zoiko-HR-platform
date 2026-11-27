"""
modules/assistant/analytics_service.py
----------------------------------------
Copilot analytics (M1-16): one copilot_events row per finished answer, and the weekly summary built from them.

What a row holds: the asker's role, the intent, the menu screen it was asked from, the outcome, latency, provider and
model, the asker's thumbs up/down, and whether a Talk-to-HR ticket followed. What it never holds: the question, the
answer, or who asked. "Top questions without answers" is therefore reported by intent and screen, not by wording.

Recording never breaks answering: it runs in a savepoint, and any error is logged and dropped.
"""
from __future__ import annotations

import datetime as dt
import logging
from collections import Counter

from sqlalchemy.orm import Session

from app.modules.assistant import platform_guide
from app.modules.assistant.models import AnswerType, ChatModelRun, CopilotEvent

logger = logging.getLogger("zoiko.assistant")

ANSWERED, GENERAL, NO_ANSWER, REFUSED, ACTION, FAILED = (
    "answered", "general_guidance", "no_answer", "refused", "action", "failed")
UNANSWERED = (NO_ANSWER, GENERAL)            # the asker didn't get an answer from the organization's own content


def outcome_for(answer_type, answer_text: str | None) -> str:
    value = getattr(answer_type, "value", answer_type)
    if value == AnswerType.RESTRICTED.value:
        return REFUSED
    if value == AnswerType.NO_ANSWER.value:
        return NO_ANSWER
    if value == AnswerType.ACTION.value:
        return ACTION
    if value == AnswerType.PARTIAL.value and "hasn't published a policy" in (answer_text or "").replace("’", "'"):
        return GENERAL
    return ANSWERED


def _role_of(db: Session, employee_id) -> str | None:
    from app.modules.employee.models import Employee
    employee = db.get(Employee, employee_id) if employee_id else None
    role = getattr(employee, "role", None)
    return getattr(role, "value", role)


def record(db: Session, turn, outcome: str, answer_type=None) -> None:
    """Add the event for a finished turn to the current transaction (the caller commits). Never raises."""
    try:
        with db.begin_nested():
            role = _role_of(db, turn.employee_id)
            page = platform_guide.screen_for_route(getattr(turn, "page_route", None), role)
            run = (db.query(ChatModelRun).filter(ChatModelRun.turn_id == turn.id)
                   .order_by(ChatModelRun.id.desc()).first())
            created = getattr(turn, "created_at", None)
            latency = int((dt.datetime.utcnow() - created).total_seconds() * 1000) if created else None
            db.add(CopilotEvent(
                organization_id=turn.organization_id, turn_id=turn.id, asker_role=role,
                # the booking flow never sets turn.intent; it is the one action the assistant drafts today
                intent=(turn.intent or ("book_leave" if outcome == ACTION else ""))[:50] or None,
                page_screen=page["href"] if page else None,
                outcome=outcome, answer_type=getattr(answer_type, "value", answer_type),
                latency_ms=latency if latency is not None and latency >= 0 else None,
                provider=getattr(run, "provider", None), model=getattr(run, "model_name", None),
                handed_off=False,
            ))
            db.flush()
    except Exception as exc:                                     # noqa: BLE001 — analytics must never break an answer
        logger.warning("copilot event not recorded for turn %s: %s", getattr(turn, "id", None), exc)


def _event_for(db: Session, organization_id: int, turn_id: int | None):
    if not turn_id:
        return None
    return (db.query(CopilotEvent)
            .filter(CopilotEvent.organization_id == organization_id, CopilotEvent.turn_id == turn_id)
            .order_by(CopilotEvent.id.desc()).first())


def mark_feedback(db: Session, organization_id: int, turn_id: int, rating: str, reason_code: str | None) -> None:
    try:
        with db.begin_nested():
            event = _event_for(db, organization_id, turn_id)
            if event:
                event.feedback = (rating or "")[:10] or None
                event.feedback_code = (reason_code or "")[:30] or None
                db.flush()
    except Exception as exc:                                     # noqa: BLE001
        logger.warning("copilot feedback not recorded for turn %s: %s", turn_id, exc)


def mark_handoff(db: Session, organization_id: int, turn_id: int | None) -> None:
    try:
        with db.begin_nested():
            event = _event_for(db, organization_id, turn_id)
            if event:
                event.handed_off = True
                db.flush()
    except Exception as exc:                                     # noqa: BLE001
        logger.warning("copilot handoff not recorded for turn %s: %s", turn_id, exc)


def _percentile(values: list[int], pct: float) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(round(pct / 100 * (len(ordered) - 1))))]


def weekly_summary(db: Session, organization_id: int | None = None, days: int = 7,
                   now: dt.datetime | None = None, top: int = 10) -> dict:
    """The weekly copilot report. organization_id=None covers every organization (platform view)."""
    now = now or dt.datetime.utcnow()
    since = now - dt.timedelta(days=days)
    q = db.query(CopilotEvent).filter(CopilotEvent.created_at >= since, CopilotEvent.created_at < now)
    if organization_id is not None:
        q = q.filter(CopilotEvent.organization_id == organization_id)
    events = q.all()

    outcomes = Counter(e.outcome for e in events)
    rated = [e for e in events if e.feedback in ("up", "down")]
    down = [e for e in rated if e.feedback == "down"]
    unanswered = Counter((e.intent or "unknown", e.page_screen or "-") for e in events if e.outcome in UNANSWERED)
    disliked = Counter((e.intent or "unknown", e.page_screen or "-") for e in down)
    latencies = [e.latency_ms for e in events if e.latency_ms is not None and e.outcome != FAILED]
    total = len(events)
    return {
        "from": since.isoformat(timespec="minutes"), "to": now.isoformat(timespec="minutes"),
        "organization_id": organization_id,
        "answers": total,
        "outcomes": dict(outcomes.most_common()),
        "answered_rate": round(100 * outcomes.get(ANSWERED, 0) / total, 1) if total else None,
        "unanswered_rate": round(100 * sum(outcomes.get(o, 0) for o in UNANSWERED) / total, 1) if total else None,
        "handoff_rate": round(100 * sum(1 for e in events if e.handed_off) / total, 1) if total else None,
        "feedback": {"rated": len(rated), "down": len(down),
                     "thumbs_down_rate": round(100 * len(down) / len(rated), 1) if rated else None,
                     "down_reasons": dict(Counter(e.feedback_code or "none" for e in down).most_common())},
        "latency_ms": {"p50": _percentile(latencies, 50), "p95": _percentile(latencies, 95)},
        "models": dict(Counter(f"{e.provider}/{e.model}" for e in events if e.model).most_common()),
        "top_unanswered": [{"intent": i, "screen": s, "count": n} for (i, s), n in unanswered.most_common(top)],
        "top_thumbs_down": [{"intent": i, "screen": s, "count": n} for (i, s), n in disliked.most_common(top)],
    }
