"""
modules/assistant/privacy_service.py
----------------------------------------
Self-service data-subject rights (AI Guardrail spec Section 27; FRS-13003):
export, delete, restrict. Self-service only — an employee acts on their own
assistant data, not an admin acting on someone else's. Every request is
processed synchronously (no async worker exists in this stack) and is
itself an audited action.
"""

import datetime

from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException
from app.modules.assistant import audit_service, retention_service, guardrails
from app.modules.assistant.models import (
    ChatPrivacyRequest, PrivacyRequestType, PrivacyRequestStatus,
    ChatConversation, ChatTurn, ChatResponse, ChatFeedback, ChatHandoff,
)


def lift_employee_restriction(db: Session, organization_id: int, employee_id: int) -> dict:
    """Data-subject rights are the employee's to exercise both ways — GDPR
    Art. 18-style restriction is meant to be liftable once the employee no
    longer wants it, not a one-way lock-out. See
    guardrails.is_employee_processing_restricted() for how this is read
    back without any new column/enum."""
    if not guardrails.is_employee_processing_restricted(db, employee_id):
        raise BadRequestException("Your account is not currently restricted.")
    audit_service.record(db, organization_id, guardrails.UNRESTRICT_EVENT_TYPE, "employee", employee_id, employee_id)
    db.commit()
    return {"message": "Assistant processing has been re-enabled for your account."}


def create_and_process_privacy_request(db: Session, organization_id: int, employee_id: int, request_type: str) -> dict:
    request_type_enum = PrivacyRequestType(request_type)
    request = ChatPrivacyRequest(
        organization_id=organization_id, employee_id=employee_id,
        request_type=request_type_enum, status=PrivacyRequestStatus.PENDING,
    )
    db.add(request)
    db.flush()

    if request_type_enum == PrivacyRequestType.EXPORT:
        payload = _export_employee_data(db, organization_id, employee_id)
    elif request_type_enum == PrivacyRequestType.DELETE:
        payload = _delete_employee_data(db, organization_id, employee_id)
    elif request_type_enum == PrivacyRequestType.RESTRICT:
        payload = {"message": "Future assistant processing is now restricted for your account."}
    else:
        raise BadRequestException(f"Unsupported privacy request type: {request_type}")

    request.status = PrivacyRequestStatus.COMPLETED
    request.completed_at = datetime.datetime.utcnow()
    audit_service.record(db, organization_id, f"privacy_request_{request_type}", "chat_privacy_request",
                          request.id, employee_id)
    db.commit()
    db.refresh(request)

    return {
        "id": request.id,
        "request_type": request.request_type.value,
        "status": request.status.value,
        "created_at": request.created_at,
        "completed_at": request.completed_at,
        "result": payload,
    }


def list_privacy_requests(db: Session, organization_id: int, employee_id: int) -> list[ChatPrivacyRequest]:
    return (
        db.query(ChatPrivacyRequest)
        .filter(ChatPrivacyRequest.organization_id == organization_id, ChatPrivacyRequest.employee_id == employee_id)
        .order_by(ChatPrivacyRequest.created_at.desc())
        .all()
    )


def _export_employee_data(db: Session, organization_id: int, employee_id: int) -> dict:
    """Right-of-access export: every conversation/turn/response/feedback/
    handoff the employee's own account produced. Excludes internal fields
    (model names, latency, safety-event categories) that aren't the
    employee's personal data."""
    conversations = (
        db.query(ChatConversation)
        .filter(ChatConversation.organization_id == organization_id, ChatConversation.employee_id == employee_id)
        .all()
    )
    export = []
    for conv in conversations:
        turns = db.query(ChatTurn).filter(ChatTurn.conversation_id == conv.id).order_by(ChatTurn.sequence_no).all()
        turn_payload = []
        for turn in turns:
            response = db.query(ChatResponse).filter(ChatResponse.turn_id == turn.id).first()
            feedback = db.query(ChatFeedback).filter(ChatFeedback.turn_id == turn.id).all()
            turn_payload.append({
                "sequence_no": turn.sequence_no,
                "text": turn.user_input_text,
                "status": turn.status.value if hasattr(turn.status, "value") else turn.status,
                "created_at": turn.created_at.isoformat() if turn.created_at else None,
                "answer_text": response.answer_text if response else None,
                "feedback": [{"rating": f.rating, "reason_code": f.reason_code, "comment": f.comment} for f in feedback],
            })
        export.append({
            "conversation_id": conv.id,
            "title": conv.title,
            "created_at": conv.created_at.isoformat() if conv.created_at else None,
            "turns": turn_payload,
        })

    handoffs = db.query(ChatHandoff).filter(ChatHandoff.organization_id == organization_id, ChatHandoff.employee_id == employee_id).all()
    return {
        "conversations": export,
        "handoffs": [
            {"reason": h.reason, "issue_summary": h.issue_summary, "status": h.status.value if hasattr(h.status, "value") else h.status,
             "ticket_reference": h.ticket_reference, "created_at": h.created_at.isoformat() if h.created_at else None}
            for h in handoffs
        ],
    }


def _delete_employee_data(db: Session, organization_id: int, employee_id: int) -> dict:
    """Right-to-erasure: deletes every conversation the employee owns.
    Action evidence and audit events are never deleted — they're the
    organization's compliance record of what actually happened, not the
    employee's personal conversational content."""
    conversations = (
        db.query(ChatConversation)
        .filter(ChatConversation.organization_id == organization_id, ChatConversation.employee_id == employee_id)
        .all()
    )
    count = len(conversations)
    for conv in conversations:
        retention_service.cascade_delete_conversation(db, conv)
    db.query(ChatHandoff).filter(
        ChatHandoff.organization_id == organization_id, ChatHandoff.employee_id == employee_id,
    ).delete(synchronize_session=False)
    return {"conversations_deleted": count}
