import json
import time

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_user, get_organization_id
from app.core.rate_limiter import limiter
from app.core.exceptions import NotFoundException

from app.modules.assistant import conversation_service, audit_service, orchestration_service
from app.modules.assistant.models import ChatFeedback
from app.modules.assistant.schemas import (
    ConversationCreate, ConversationResponse, ConversationListResponse, ConversationRename,
    TurnCreate, TurnResponse, TurnListResponse, FeedbackCreate, SuccessResponse,
)

conversation_router = APIRouter(prefix="/assistant", tags=["Assistant"])


@conversation_router.get("/capabilities")
def get_capabilities(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    organization_id: int = Depends(get_organization_id),
):
    from app.modules.assistant import guardrails
    return {
        "generation_enabled": guardrails.is_generation_enabled(db, organization_id, employee_id=current_user.id),
        "actions_enabled": guardrails.is_actions_enabled(db, organization_id, employee_id=current_user.id),
        "supported_workflow_types": ["book_leave"],
        "employee_restricted": guardrails.is_employee_processing_restricted(db, current_user.id),
    }


@conversation_router.post("/conversations", response_model=ConversationResponse)
def create_conversation(
    payload: ConversationCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    organization_id: int = Depends(get_organization_id),
):
    return conversation_service.create_conversation(db, organization_id, current_user.id, payload.title)


@conversation_router.get("/conversations", response_model=ConversationListResponse)
def list_conversations(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    organization_id: int = Depends(get_organization_id),
):
    items = conversation_service.list_conversations(db, organization_id, current_user.id)
    return {"total": len(items), "items": items}


@conversation_router.get("/conversations/{conversation_id}", response_model=ConversationResponse)
def get_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    organization_id: int = Depends(get_organization_id),
):
    return conversation_service.get_conversation(db, organization_id, current_user.id, conversation_id)


@conversation_router.patch("/conversations/{conversation_id}", response_model=ConversationResponse)
def rename_conversation(
    conversation_id: int,
    payload: ConversationRename,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    organization_id: int = Depends(get_organization_id),
):
    # Not run through sanitize_input(): that HTML-escapes quotes/apostrophes
    # for content later rendered as raw HTML. React already auto-escapes
    # JSX text nodes, so pre-escaping here only left literal `&#39;`/`&#34;`
    # on screen instead of preventing anything.
    title = payload.title.strip()
    return conversation_service.rename_conversation(db, organization_id, current_user.id, conversation_id, title)


@conversation_router.delete("/conversations/{conversation_id}", response_model=SuccessResponse)
def delete_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    organization_id: int = Depends(get_organization_id),
):
    conversation_service.delete_conversation(db, organization_id, current_user.id, conversation_id)
    return SuccessResponse(message="Conversation deleted.")


@conversation_router.get("/conversations/{conversation_id}/turns", response_model=TurnListResponse)
def list_turns(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    organization_id: int = Depends(get_organization_id),
):
    turns = conversation_service.list_turns(db, organization_id, current_user.id, conversation_id)
    items = [conversation_service.serialize_turn(db, t) for t in turns]
    return {"total": len(items), "items": items}


@conversation_router.post("/conversations/{conversation_id}/turns", response_model=TurnResponse)
@limiter.limit("20/minute")
def create_turn(
    request: Request,
    conversation_id: int,
    payload: TurnCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    organization_id: int = Depends(get_organization_id),
):
    conversation = conversation_service.get_conversation(db, organization_id, current_user.id, conversation_id)
    # See rename_conversation() above — same reasoning: no HTML pre-escaping,
    # it only corrupted what's shown to the user, fed to Groq, and audited.
    text = payload.text.strip()
    turn = conversation_service.create_and_process_turn(db, conversation, current_user, text,
                                                          subject_employee_id=payload.subject_employee_id,
                                                          attachment_id=payload.attachment_id)
    return conversation_service.serialize_turn(db, turn)


@conversation_router.get("/turns/{turn_id}", response_model=TurnResponse)
def get_turn(
    turn_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    organization_id: int = Depends(get_organization_id),
):
    turn = conversation_service.get_turn(db, organization_id, turn_id)
    return conversation_service.serialize_turn(db, turn)


@conversation_router.get("/turns/{turn_id}/stream")
def stream_turn(
    turn_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    organization_id: int = Depends(get_organization_id),
):
    """Every intent except policy_qa/attachment_qa is instant (no model
    call at all — chitchat, leave balance, org headcount, etc. are all
    resolved synchronously in POST .../turns), so those are replayed as a
    word-chunked SSE stream purely for a consistent progressive-reveal UX,
    not because anything is still being computed.

    A turn POST left in GENERATING status, though, has a real model call
    still pending — that branch drives orchestration_service.stream_generation()
    for actual token-by-token streaming (Groq's plain-text completions
    stream for real; only its JSON mode can't — see llm_client.py). This
    endpoint is a plain sync generator on purpose: Starlette's
    StreamingResponse runs a non-async content iterable via
    iterate_in_threadpool automatically, so the blocking network waits
    inside the Groq SDK's sync streaming client never block the event loop,
    without a manual thread bridge here."""
    turn = conversation_service.get_turn(db, organization_id, turn_id)

    if turn.status.value == "generating":
        # FastAPI closes the Depends(get_db) session as soon as this endpoint
        # function returns the StreamingResponse object — but the generator
        # body below only actually runs afterward, while the response body is
        # being streamed. Using the request-scoped `db`/`current_user` here
        # hits "Instance is not persistent within this Session" once that
        # session is closed mid-stream. The generator opens its own session
        # instead, scoped to its own lifetime, and closes it when done.
        employee_id = current_user.id

        def event_stream_real():
            from app.database import SessionLocal
            from app.modules.hr.models import Employee
            stream_db = SessionLocal()
            try:
                stream_turn_obj = conversation_service.get_turn(stream_db, organization_id, turn_id)
                stream_employee = stream_db.query(Employee).filter(Employee.id == employee_id).first()
                yield f"event: turn.accepted\ndata: {json.dumps({'turn_id': turn_id})}\n\n"
                for event in orchestration_service.stream_generation(stream_db, stream_turn_obj, stream_employee):
                    if event[0] == "delta":
                        yield f"event: text.delta\ndata: {json.dumps({'delta': event[1]})}\n\n"
                    else:
                        final_payload = conversation_service.serialize_turn(stream_db, event[1])
                        yield f"event: turn.completed\ndata: {json.dumps(final_payload, default=str)}\n\n"
            finally:
                stream_db.close()

        return StreamingResponse(event_stream_real(), media_type="text/event-stream")

    payload = conversation_service.serialize_turn(db, turn)
    answer_text = payload.get("answer_text") or ""

    def event_stream():
        yield f"event: turn.accepted\ndata: {json.dumps({'turn_id': turn_id})}\n\n"
        words = answer_text.split(" ")
        buffer = ""
        for i, word in enumerate(words):
            buffer += (" " if buffer else "") + word
            if i % 3 == 2 or i == len(words) - 1:
                yield f"event: text.delta\ndata: {json.dumps({'delta': buffer})}\n\n"
                buffer = ""
                time.sleep(0.03)
        yield f"event: turn.completed\ndata: {json.dumps(payload, default=str)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@conversation_router.post("/feedback", response_model=SuccessResponse)
def submit_feedback(
    payload: FeedbackCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    organization_id: int = Depends(get_organization_id),
):
    turn = conversation_service.get_turn(db, organization_id, payload.turn_id)
    from app.modules.assistant.models import ChatResponse
    response = db.query(ChatResponse).filter(ChatResponse.turn_id == turn.id).first()
    feedback = ChatFeedback(
        turn_id=turn.id, response_id=response.id if response else None, employee_id=current_user.id,
        rating=payload.rating, reason_code=payload.reason_code, comment=payload.comment,
    )
    db.add(feedback)
    audit_service.record(db, organization_id, "feedback_submitted", "chat_feedback", None, current_user.id,
                          {"turn_id": turn.id, "rating": payload.rating})
    db.commit()
    return SuccessResponse(message="Thanks for the feedback.")
