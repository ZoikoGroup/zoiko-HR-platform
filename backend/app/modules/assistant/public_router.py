"""
modules/assistant/public_router.py
--------------------------------------
Unauthenticated API for zoikohr.com's public chat widget. Deliberately a
SEPARATE router from the authenticated `/assistant` API (no shared
`get_current_user`/`get_organization_id` dependency anywhere in this file)
rather than one endpoint branching on whether a token is present — a wrong
branch in a shared endpoint is a much easier way to leak HR data than a
route that structurally has no access to it at all.
"""

import logging

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.rate_limiter import limiter
from app.modules.assistant import public_service
from app.modules.assistant.schemas import PublicAskRequest, PublicAskResponse

logger = logging.getLogger("zoiko.assistant")

public_router = APIRouter(prefix="/assistant/public", tags=["Assistant Public"])


@public_router.post("/ask", response_model=PublicAskResponse)
@limiter.limit("10/minute")
def ask_public(request: Request, payload: PublicAskRequest, db: Session = Depends(get_db)):
    try:
        result = public_service.answer_public_question(
            db,
            question=payload.question,
            history=[h.model_dump() for h in payload.history],
            session_id=payload.session_id,
        )
        return result
    except Exception as e:
        # No unhandled exception may ever reach an anonymous internet caller
        # as a stack trace — degrade to a safe canned response instead.
        logger.error("Public assistant request failed unexpectedly: %s", e)
        return {
            "answer_text": "The assistant is temporarily unavailable. Please try again shortly.",
            "answer_type": "no_answer",
            "confidence_state": "no_reliable_answer",
            "sources": [],
        }
