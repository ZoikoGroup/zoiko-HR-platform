"""
modules/assistant/audit_service.py
-------------------------------------
Append-only audit trail. Every consequential state transition writes a row
here in the same DB transaction as the change it records — no separate
outbox/queue needed since this is a single Postgres database, not a
distributed system.
"""

from sqlalchemy.orm import Session

from app.modules.assistant.models import ChatAuditEvent


def record(
    db: Session,
    organization_id: int,
    event_type: str,
    entity_type: str,
    entity_id: int | None = None,
    actor_employee_id: int | None = None,
    payload: dict | None = None,
    flush: bool = True,
) -> ChatAuditEvent:
    """Add an audit row to the current transaction. Does not commit —
    callers append this to the same transaction as the state change it
    records, then commit once."""
    event = ChatAuditEvent(
        organization_id=organization_id,
        actor_employee_id=actor_employee_id,
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        payload=payload or {},
    )
    db.add(event)
    if flush:
        db.flush()
    return event
