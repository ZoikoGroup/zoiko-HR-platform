"""
modules/assistant/conversation_service.py
-----------------------------------------------
Conversation and turn CRUD, plus the entry point that kicks off orchestration
(or routes into the action engine for workflow-triggering intents).
"""

import re

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundException
from app.modules.assistant import orchestration_service, action_service, audit_service, safety_service, guardrails, scope_service
from app.modules.assistant.models import (
    ChatConversation, ChatTurn, ChatResponse, ChatResponseProvenance,
    KnowledgeSourceVersion, KnowledgeSource, TurnStatus,
)
from app.modules.employee.models import Employee

_HR_RECORD_EMPLOYEE_RE = re.compile(r"employee_id=(\d+)")


def create_conversation(db: Session, organization_id: int, employee_id: int, title: str | None) -> ChatConversation:
    conversation = ChatConversation(organization_id=organization_id, employee_id=employee_id, title=title)
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


def list_conversations(db: Session, organization_id: int, employee_id: int) -> list[ChatConversation]:
    return (
        db.query(ChatConversation)
        .filter(ChatConversation.organization_id == organization_id, ChatConversation.employee_id == employee_id)
        .order_by(ChatConversation.updated_at.desc().nullslast(), ChatConversation.created_at.desc())
        .all()
    )


def get_conversation(db: Session, organization_id: int, employee_id: int, conversation_id: int) -> ChatConversation:
    conversation = (
        db.query(ChatConversation)
        .filter(ChatConversation.id == conversation_id, ChatConversation.organization_id == organization_id,
                ChatConversation.employee_id == employee_id)
        .first()
    )
    if not conversation:
        raise NotFoundException("Conversation", conversation_id)
    return conversation


def rename_conversation(db: Session, organization_id: int, employee_id: int, conversation_id: int, title: str) -> ChatConversation:
    conversation = get_conversation(db, organization_id, employee_id, conversation_id)
    conversation.title = title
    db.commit()
    db.refresh(conversation)
    return conversation


def delete_conversation(db: Session, organization_id: int, employee_id: int, conversation_id: int) -> None:
    conversation = get_conversation(db, organization_id, employee_id, conversation_id)
    db.delete(conversation)
    db.commit()


def create_and_process_turn(db: Session, conversation: ChatConversation, employee, text: str,
                             subject_employee_id: int | None = None) -> ChatTurn:
    """Step 1 of orchestration (create the turn row), then either routes to
    the action engine (for action-triggering intents) or runs the standard
    answer pipeline. `subject_employee_id` (WF-09 manager scope) is
    re-authorized here on every turn — never trusted from the client alone."""
    subject = scope_service.resolve_authorized_subject(db, employee, subject_employee_id)

    next_seq = (
        db.query(ChatTurn)
        .filter(ChatTurn.conversation_id == conversation.id)
        .count()
    ) + 1

    turn = ChatTurn(
        conversation_id=conversation.id,
        organization_id=conversation.organization_id,
        employee_id=employee.id,
        sequence_no=next_seq,
        user_input_text=text,
        status=TurnStatus.ACCEPTED,
    )
    db.add(turn)
    db.commit()
    db.refresh(turn)
    audit_service.record(db, conversation.organization_id, "turn_created", "chat_turn", turn.id, employee.id,
                          {"subject_employee_id": subject.id} if subject.id != employee.id else None)

    # Injection-attempt monitoring (AI Guardrail spec, Section 32) — logged
    # only, never blocks or changes routing. Role separation between system
    # and user messages is the real defense; this is a security signal.
    for signal in guardrails.detect_injection_signals(text):
        safety_service.record(db, conversation.organization_id, f"injection_signal:{signal}",
                               turn_id=turn.id, employee_id=employee.id, flush=False)
    db.commit()

    # Hard-block restricted categories (self-harm, adverse-employment
    # recommendations, third-party medical inference) short-circuit before
    # any intent routing or model call.
    if orchestration_service.apply_hard_block_if_needed(db, turn, employee):
        return turn

    intent = orchestration_service.classify_intent(text)
    if intent == "book_leave":
        return action_service.start_book_leave_workflow(db, turn, employee)

    return orchestration_service.process_turn(db, turn, employee, subject=subject)


def get_turn(db: Session, organization_id: int, turn_id: int) -> ChatTurn:
    turn = db.query(ChatTurn).filter(ChatTurn.id == turn_id, ChatTurn.organization_id == organization_id).first()
    if not turn:
        raise NotFoundException("Turn", turn_id)
    return turn


def list_turns(db: Session, organization_id: int, employee_id: int, conversation_id: int) -> list[ChatTurn]:
    get_conversation(db, organization_id, employee_id, conversation_id)  # 404s if not owned
    return (
        db.query(ChatTurn)
        .filter(ChatTurn.conversation_id == conversation_id, ChatTurn.organization_id == organization_id)
        .order_by(ChatTurn.sequence_no)
        .all()
    )


def serialize_turn(db: Session, turn: ChatTurn) -> dict:
    """Builds the TurnResponse payload: sources enriched with real source
    metadata (WF-05 source detail — title, authority tier, version, effective
    dates, excerpt) and the resolved subject identity for manager-scope
    turns (WF-09), plus any linked workflow id."""
    response = db.query(ChatResponse).filter(ChatResponse.turn_id == turn.id).first()
    sources = []
    next_actions = []
    subject_employee_id = None
    subject_name = None

    if response:
        provenance = (
            db.query(ChatResponseProvenance)
            .filter(ChatResponseProvenance.response_id == response.id)
            .all()
        )
        for p in provenance:
            if p.knowledge_source_version_id:
                version = (
                    db.query(KnowledgeSourceVersion)
                    .filter(KnowledgeSourceVersion.id == p.knowledge_source_version_id)
                    .first()
                )
                source = (
                    db.query(KnowledgeSource).filter(KnowledgeSource.id == version.knowledge_source_id).first()
                    if version else None
                )
                sources.append({
                    "label": source.title if source else f"Policy source v{p.knowledge_source_version_id}",
                    "knowledge_source_id": source.id if source else None,
                    "knowledge_source_version_id": p.knowledge_source_version_id,
                    "authority_tier": source.authority_tier if source else None,
                    "source_type": source.source_type if source else None,
                    "version_no": version.version_no if version else None,
                    "effective_from": version.effective_from if version else None,
                    "effective_to": version.effective_to if version else None,
                    "excerpt": (version.content_text[:280] + ("..." if len(version.content_text) > 280 else "")) if version else None,
                })
            elif p.hr_record_ref:
                sources.append({"label": "HR record", "hr_record_ref": p.hr_record_ref})
                match = _HR_RECORD_EMPLOYEE_RE.search(p.hr_record_ref)
                if match:
                    ref_employee_id = int(match.group(1))
                    if ref_employee_id != turn.employee_id:
                        subject_employee_id = ref_employee_id
                        subject = db.query(Employee).filter(Employee.id == ref_employee_id).first()
                        subject_name = subject.full_name if subject else None
        next_actions = response.next_actions or []

    workflow_id = turn.workflow.id if turn.workflow else None

    return {
        "id": turn.id,
        "conversation_id": turn.conversation_id,
        "sequence_no": turn.sequence_no,
        "user_input_text": turn.user_input_text,
        "intent": turn.intent,
        "status": turn.status.value if hasattr(turn.status, "value") else turn.status,
        "error_message": turn.error_message,
        "answer_text": response.answer_text if response else None,
        "answer_type": response.answer_type.value if response and hasattr(response.answer_type, "value") else (response.answer_type if response else None),
        "confidence_state": response.confidence_state.value if response and hasattr(response.confidence_state, "value") else (response.confidence_state if response else None),
        "sources": sources,
        "next_actions": next_actions,
        "workflow_id": workflow_id,
        "subject_employee_id": subject_employee_id,
        "subject_name": subject_name,
        "created_at": turn.created_at,
        "completed_at": turn.completed_at,
    }
