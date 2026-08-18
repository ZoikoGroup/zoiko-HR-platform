"""
modules/assistant/retention_service.py
------------------------------------------
Cascading conversation deletion. Deletes every row a conversation owns
EXCEPT `chat_action_evidence` and `chat_audit_events` — those are immutable
evidence/audit trail that survive conversation deletion by design (see
models.py: "chat_action_evidence ... never cascade-deleted with its
conversation"). Neither table has an FK relationship to conversation/turn
for exactly this reason, so they're untouched by construction, not by
special-casing here.

No ORM `cascade="all, delete-orphan"` relationships exist for these tables
(most don't even have a `relationship()` declared), so this is done via
explicit, ordered bulk deletes rather than relying on `db.delete(parent)`
to cascade — which is also why the previous plain `db.delete(conversation)`
in conversation_service was a latent bug: it would hit a foreign-key
violation the moment a conversation had any turns.
"""

from sqlalchemy.orm import Session

from app.modules.assistant.models import (
    ChatConversation, ChatTurn, ChatResponse, ChatResponseProvenance,
    ChatModelRun, ChatToolCall, ChatFeedback, ChatHandoff,
    ChatRetrievalRun, ChatRetrievalHit, ChatAttachment, ChatAttachmentProcessing,
    ChatWorkflow, ChatWorkflowField, ChatWorkflowValidation,
    ChatWorkflowConfirmation, ChatWorkflowExecution, ChatWorkflowReconciliation,
)


def cascade_delete_conversation(db: Session, conversation: ChatConversation) -> None:
    turn_ids = [row[0] for row in db.query(ChatTurn.id).filter(ChatTurn.conversation_id == conversation.id).all()]

    if turn_ids:
        response_ids = [row[0] for row in db.query(ChatResponse.id).filter(ChatResponse.turn_id.in_(turn_ids)).all()]
        workflow_ids = [row[0] for row in db.query(ChatWorkflow.id).filter(ChatWorkflow.turn_id.in_(turn_ids)).all()]
        retrieval_run_ids = [row[0] for row in db.query(ChatRetrievalRun.id).filter(ChatRetrievalRun.turn_id.in_(turn_ids)).all()]

        if workflow_ids:
            execution_ids = [row[0] for row in db.query(ChatWorkflowExecution.id).filter(ChatWorkflowExecution.workflow_id.in_(workflow_ids)).all()]
            if execution_ids:
                db.query(ChatWorkflowReconciliation).filter(ChatWorkflowReconciliation.workflow_execution_id.in_(execution_ids)).delete(synchronize_session=False)
            db.query(ChatWorkflowExecution).filter(ChatWorkflowExecution.workflow_id.in_(workflow_ids)).delete(synchronize_session=False)
            db.query(ChatWorkflowConfirmation).filter(ChatWorkflowConfirmation.workflow_id.in_(workflow_ids)).delete(synchronize_session=False)
            db.query(ChatWorkflowValidation).filter(ChatWorkflowValidation.workflow_id.in_(workflow_ids)).delete(synchronize_session=False)
            db.query(ChatWorkflowField).filter(ChatWorkflowField.workflow_id.in_(workflow_ids)).delete(synchronize_session=False)
            db.query(ChatWorkflow).filter(ChatWorkflow.id.in_(workflow_ids)).delete(synchronize_session=False)

        if retrieval_run_ids:
            db.query(ChatRetrievalHit).filter(ChatRetrievalHit.retrieval_run_id.in_(retrieval_run_ids)).delete(synchronize_session=False)
            db.query(ChatRetrievalRun).filter(ChatRetrievalRun.id.in_(retrieval_run_ids)).delete(synchronize_session=False)

        if response_ids:
            db.query(ChatResponseProvenance).filter(ChatResponseProvenance.response_id.in_(response_ids)).delete(synchronize_session=False)
        db.query(ChatResponse).filter(ChatResponse.turn_id.in_(turn_ids)).delete(synchronize_session=False)
        db.query(ChatModelRun).filter(ChatModelRun.turn_id.in_(turn_ids)).delete(synchronize_session=False)
        db.query(ChatToolCall).filter(ChatToolCall.turn_id.in_(turn_ids)).delete(synchronize_session=False)
        db.query(ChatFeedback).filter(ChatFeedback.turn_id.in_(turn_ids)).delete(synchronize_session=False)

    db.query(ChatHandoff).filter(ChatHandoff.conversation_id == conversation.id).delete(synchronize_session=False)

    attachment_ids = [row[0] for row in db.query(ChatAttachment.id).filter(ChatAttachment.conversation_id == conversation.id).all()]
    if attachment_ids:
        db.query(ChatAttachmentProcessing).filter(ChatAttachmentProcessing.attachment_id.in_(attachment_ids)).delete(synchronize_session=False)
        db.query(ChatAttachment).filter(ChatAttachment.id.in_(attachment_ids)).delete(synchronize_session=False)

    if turn_ids:
        db.query(ChatTurn).filter(ChatTurn.id.in_(turn_ids)).delete(synchronize_session=False)

    db.delete(conversation)
