"""
modules/assistant/handoff_service.py
----------------------------------------
Human handoff: creates a case/ticket record for HR to follow up on. The
original spec assumed this would route to an external case/ticketing system
(Zendesk/Freshdesk/Jira Service Desk-style — see the DB schema doc's
route_ref/external_case_ref design) via a Product/Ops decision that was left
unresolved. Confirmed directly with HR: no such system exists today, so this
is a first-party queue instead — org admins list and resolve tickets here.
Revisit if HR later adopts a real case-management tool.
"""

import datetime
import secrets

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundException, BadRequestException
from app.modules.assistant import audit_service
from app.modules.assistant.models import ChatHandoff, HandoffStatus
from app.modules.employee.models import Employee


def get_open_handoff_for_employee(db: Session, organization_id: int, employee_id: int) -> ChatHandoff | None:
    """An employee's own in-flight ticket, if any — status is anything short
    of RESOLVED (i.e. OPEN or SENT). Used both to dedupe on creation and to
    let the employee's own UI show "you already have an open ticket" before
    they fill out a new form."""
    return (
        db.query(ChatHandoff)
        .filter(
            ChatHandoff.organization_id == organization_id,
            ChatHandoff.employee_id == employee_id,
            ChatHandoff.status != HandoffStatus.RESOLVED,
        )
        .order_by(ChatHandoff.created_at.desc())
        .first()
    )


def create_handoff(db: Session, organization_id: int, employee_id: int, conversation_id: int,
                    turn_id: int | None, reason: str, issue_summary: str) -> tuple[ChatHandoff, bool]:
    """Returns (handoff, is_new). One open ticket per employee at a time —
    an employee with an unresolved ticket gets that same ticket back rather
    than a second one; a new ticket can only be opened once admin resolves
    the existing one. Enforced here (not just in the UI) so it holds even if
    the employee opens the "Talk to HR" form from more than one place."""
    existing = get_open_handoff_for_employee(db, organization_id, employee_id)
    if existing:
        return existing, False

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
    return handoff, True


def get_handoff(db: Session, organization_id: int, handoff_id: int) -> ChatHandoff:
    handoff = (
        db.query(ChatHandoff)
        .filter(ChatHandoff.id == handoff_id, ChatHandoff.organization_id == organization_id)
        .first()
    )
    if not handoff:
        raise NotFoundException("Handoff", handoff_id)
    return handoff


def list_handoffs(db: Session, organization_id: int, status: str | None = None) -> list[ChatHandoff]:
    """Org-scoped queue for admins — every org admin sees every ticket
    raised in their organization (confirmed with HR: no per-reviewer
    assignment or role restriction requested)."""
    query = db.query(ChatHandoff).filter(ChatHandoff.organization_id == organization_id)
    if status:
        query = query.filter(ChatHandoff.status == HandoffStatus(status))
    return query.order_by(ChatHandoff.created_at.desc()).all()


def resolve_handoff(db: Session, organization_id: int, handoff_id: int, resolved_by: int,
                     resolution_note: str | None = None) -> ChatHandoff:
    handoff = get_handoff(db, organization_id, handoff_id)
    if handoff.status == HandoffStatus.RESOLVED:
        raise BadRequestException("This ticket is already resolved.")
    handoff.status = HandoffStatus.RESOLVED
    handoff.resolution_note = resolution_note
    handoff.resolved_by = resolved_by
    handoff.resolved_at = datetime.datetime.utcnow()
    audit_service.record(db, organization_id, "handoff_resolved", "chat_handoff", handoff.id, resolved_by)
    db.commit()
    db.refresh(handoff)
    return handoff


def serialize_handoff(db: Session, handoff: ChatHandoff) -> dict:
    employee = db.query(Employee).filter(Employee.id == handoff.employee_id).first()
    resolver = db.query(Employee).filter(Employee.id == handoff.resolved_by).first() if handoff.resolved_by else None
    return {
        "id": handoff.id,
        "ticket_reference": handoff.ticket_reference,
        "status": handoff.status.value if hasattr(handoff.status, "value") else handoff.status,
        "reason": handoff.reason,
        "issue_summary": handoff.issue_summary,
        "employee_id": handoff.employee_id,
        "employee_name": employee.full_name if employee else None,
        "conversation_id": handoff.conversation_id,
        "resolution_note": handoff.resolution_note,
        "resolved_by_name": resolver.full_name if resolver else None,
        "resolved_at": handoff.resolved_at,
        "created_at": handoff.created_at,
    }
