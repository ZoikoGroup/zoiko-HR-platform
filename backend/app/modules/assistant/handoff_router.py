from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_user, get_organization_id

from app.modules.assistant import handoff_service
from app.modules.assistant.schemas import HandoffCreate, HandoffResponse

handoff_router = APIRouter(prefix="/assistant/handoffs", tags=["Assistant Handoff"])


@handoff_router.post("", response_model=HandoffResponse)
def create_handoff(
    payload: HandoffCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    organization_id: int = Depends(get_organization_id),
):
    return handoff_service.create_handoff(
        db, organization_id, current_user.id, payload.conversation_id, payload.turn_id,
        payload.reason, payload.issue_summary,
    )


@handoff_router.get("/{handoff_id}", response_model=HandoffResponse)
def get_handoff(
    handoff_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    organization_id: int = Depends(get_organization_id),
):
    return handoff_service.get_handoff(db, organization_id, handoff_id)
