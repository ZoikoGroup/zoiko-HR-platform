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


def record(db: Session, turn, outcome: str, answer_type=None, provider_error: bool = False) -> None:
    """Add the event for a finished turn to the current transaction (the caller commits). Never raises."""
    try:
        with db.begin_nested():
            role = _role_of(db, turn.employee_id)
            page = platform_guide.screen_for_route(getattr(turn, "page_route", None), role)
            runs = db.query(ChatModelRun).filter(ChatModelRun.turn_id == turn.id).order_by(ChatModelRun.id).all()
            run = runs[-1] if runs else None
            metrics = getattr(turn, "_copilot_metrics", None) or {}
            p_tok = [r.prompt_tokens for r in runs if r.prompt_tokens is not None]
            c_tok = [r.completion_tokens for r in runs if r.completion_tokens is not None]
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
                first_token_ms=metrics.get("first_token_ms"),
                prompt_tokens=sum(p_tok) if p_tok else None, completion_tokens=sum(c_tok) if c_tok else None,
                fallback_used=bool(metrics.get("fallback")), provider_error=bool(provider_error),
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


# ── M1-17 monitoring ─────────────────────────────────────────────────────────────────────────────────────────────────
def _prices() -> dict:
    import json
    from app.config import settings
    try:
        return {k: (float(v[0]), float(v[1])) for k, v in json.loads(settings.COPILOT_PRICES_USD_PER_MTOK).items()}
    except Exception:                                            # noqa: BLE001 — a bad setting must not stop the report
        logger.warning("HR_COPILOT_PRICES_USD_PER_MTOK is not valid JSON {model: [input, output]}; spend not estimated")
        return {}


def estimated_spend_usd(events) -> tuple[float, int, int, list[str]]:
    """(estimated USD, prompt tokens, completion tokens, models with tokens but no price)."""
    prices, total, p_sum, c_sum, unpriced = _prices(), 0.0, 0, 0, set()
    for e in events:
        p, c = e.prompt_tokens or 0, e.completion_tokens or 0
        p_sum, c_sum = p_sum + p, c_sum + c
        if not (p or c):
            continue
        price = prices.get(e.model or "")
        if price is None:
            unpriced.add(e.model or "unknown")
            continue
        total += p / 1e6 * price[0] + c / 1e6 * price[1]
    return round(total, 4), p_sum, c_sum, sorted(unpriced)


def health(db: Session, hours: int = 24, now: dt.datetime | None = None) -> dict:
    """Copilot health over the last `hours`, across every organization, with the alerts that are firing.

    Error rate (failed answers), p95 time to first word, model-provider errors, fallbacks to the backup model and the
    estimated token spend, each against its HR_COPILOT_ALERT_* threshold."""
    from app.config import settings
    now = now or dt.datetime.utcnow()
    since = now - dt.timedelta(hours=hours)
    events = db.query(CopilotEvent).filter(CopilotEvent.created_at >= since, CopilotEvent.created_at < now).all()
    total = len(events)
    failed = [e for e in events if e.outcome == FAILED]
    provider_errors = sum(1 for e in events if e.provider_error)
    with_model = [e for e in events if e.model]
    fallbacks = sum(1 for e in with_model if e.fallback_used)
    first_words = [e.first_token_ms for e in events if e.first_token_ms is not None]
    spend, p_tok, c_tok, unpriced = estimated_spend_usd(events)
    m = {
        "from": since.isoformat(timespec="minutes"), "to": now.isoformat(timespec="minutes"), "answers": total,
        "error_rate_pct": round(100 * len(failed) / total, 1) if total else None,
        "provider_errors": provider_errors,
        "fallbacks": fallbacks,
        "fallback_rate_pct": round(100 * fallbacks / len(with_model), 1) if with_model else None,
        "first_word_ms": {"p50": _percentile(first_words, 50), "p95": _percentile(first_words, 95),
                          "answers_measured": len(first_words)},
        "tokens": {"prompt": p_tok, "completion": c_tok},
        "estimated_spend_usd": spend, "unpriced_models": unpriced,
    }
    enough = total >= settings.COPILOT_ALERT_MIN_ANSWERS
    alerts = []
    if enough and m["error_rate_pct"] is not None and m["error_rate_pct"] > settings.COPILOT_ALERT_ERROR_RATE_PCT:
        alerts.append(f"error rate {m['error_rate_pct']}% > {settings.COPILOT_ALERT_ERROR_RATE_PCT}%")
    p95 = m["first_word_ms"]["p95"]
    if len(first_words) >= settings.COPILOT_ALERT_MIN_ANSWERS and p95 is not None             and p95 > settings.COPILOT_ALERT_P95_FIRST_WORD_MS:
        alerts.append(f"p95 time to first word {p95} ms > {settings.COPILOT_ALERT_P95_FIRST_WORD_MS} ms")
    if provider_errors > settings.COPILOT_ALERT_PROVIDER_ERRORS:
        alerts.append(f"{provider_errors} model-provider errors > {settings.COPILOT_ALERT_PROVIDER_ERRORS}")
    if enough and m["fallback_rate_pct"] is not None and m["fallback_rate_pct"] > settings.COPILOT_ALERT_FALLBACK_RATE_PCT:
        alerts.append(f"fallback rate {m['fallback_rate_pct']}% > {settings.COPILOT_ALERT_FALLBACK_RATE_PCT}%")
    if spend * (24 / hours) > settings.COPILOT_ALERT_DAILY_SPEND_USD:
        alerts.append(f"estimated spend ${round(spend * 24 / hours, 2)}/day > ${settings.COPILOT_ALERT_DAILY_SPEND_USD}/day")
    if unpriced:
        alerts.append(f"no price set for {', '.join(unpriced)}: spend is under-estimated (HR_COPILOT_PRICES_USD_PER_MTOK)")
    m["alerts"] = alerts
    return m
