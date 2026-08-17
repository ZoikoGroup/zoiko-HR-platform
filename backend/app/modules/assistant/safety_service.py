"""
modules/assistant/safety_service.py
--------------------------------------
Records guardrail signals (restricted-category hits, injection pattern
detections, disclosure blocks, citation failures, source conflicts) for
production monitoring, per the AI Guardrail spec (Section 32). Deliberately
stores category + minimal structured detail only — never raw message
content — matching the spec's logging-privacy rule (Section 27).
"""

from sqlalchemy.orm import Session

from app.modules.assistant.models import ChatSafetyEvent


def record(
    db: Session,
    organization_id: int,
    category: str,
    turn_id: int | None = None,
    employee_id: int | None = None,
    detail: dict | None = None,
    flush: bool = True,
) -> ChatSafetyEvent:
    event = ChatSafetyEvent(
        organization_id=organization_id, turn_id=turn_id, employee_id=employee_id,
        category=category, detail=detail or {},
    )
    db.add(event)
    if flush:
        db.flush()
    return event
