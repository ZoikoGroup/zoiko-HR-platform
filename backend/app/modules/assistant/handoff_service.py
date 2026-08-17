"""
modules/assistant/handoff_service.py
----------------------------------------
Human handoff: creates a case/ticket record for HR to follow up on. No
external ticketing system is integrated in v1 — the record itself (with a
generated reference) is the "ticket"; wiring it to a real HR case system is
a follow-up integration, not a v1 blocker.
"""

import secrets

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundException
from app.modules.assistant import audit_service
from app.modules.assistant.models import ChatHandoff, HandoffStatus


def create_handoff(db: Session, organization_id: int, employee_id: int, conversation_id: int,
                    turn_id: int | None, reason: str, issue_summary: str) -> ChatHandoff:
    ticket_reference = f"HR-{secrets.token_hex(4).upper()}"
    handoff = ChatHandoff(
        conversation_id=conversation_id, turn_id=turn_id, organization_id=organization_id,
        employee_id=employee_id, reason=reason, issue_summary=issue_summary,
        status=HandoffStatus.SENT, ticket_reference=ticket_reference,
    )
    db.add(handoff)
    db.flush()
    audit_service.record(db, organization_id, "handoff_created", "chat_handoff", handoff.id, employee_id)
    db.commit()
    db.refresh(handoff)
    return handoff


def get_handoff(db: Session, organization_id: int, handoff_id: int) -> ChatHandoff:
    handoff = (
        db.query(ChatHandoff)
        .filter(ChatHandoff.id == handoff_id, ChatHandoff.organization_id == organization_id)
        .first()
    )
    if not handoff:
        raise NotFoundException("Handoff", handoff_id)
    return handoff
