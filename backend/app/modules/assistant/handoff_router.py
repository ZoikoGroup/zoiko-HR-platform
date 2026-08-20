from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_user, get_current_admin, get_organization_id

from app.modules.assistant import handoff_service
from app.modules.assistant.schemas import HandoffCreate, HandoffResponse, HandoffAdminResponse, HandoffResolve

handoff_router = APIRouter(prefix="/assistant/handoffs", tags=["Assistant Handoff"])
handoff_admin_router = APIRouter(prefix="/assistant/admin/handoffs", tags=["Assistant Handoff Admin"])


def _to_handoff_response(handoff, already_open: bool = False) -> dict:
    return {
        "id": handoff.id,
        "status": handoff.status.value if hasattr(handoff.status, "value") else handoff.status,
        "ticket_reference": handoff.ticket_reference,
        "created_at": handoff.created_at,
        "already_open": already_open,
    }


@handoff_router.post("", response_model=HandoffResponse)
def create_handoff(
    payload: HandoffCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    organization_id: int = Depends(get_organization_id),
):
    handoff, is_new = handoff_service.create_handoff(
        db, organization_id, current_user.id, payload.conversation_id, payload.turn_id,
        payload.reason, payload.issue_summary,
    )
    return _to_handoff_response(handoff, already_open=not is_new)


@handoff_router.get("/{handoff_id}", response_model=HandoffResponse)
def get_handoff(
    handoff_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    organization_id: int = Depends(get_organization_id),
):
    return _to_handoff_response(handoff_service.get_handoff(db, organization_id, handoff_id))


@handoff_router.get("/mine/open", response_model=Optional[HandoffResponse])
def get_my_open_handoff(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    organization_id: int = Depends(get_organization_id),
):
    """Lets the employee's own UI show "you already have an open ticket"
    before they fill out a new form, rather than only finding out on submit."""
    handoff = handoff_service.get_open_handoff_for_employee(db, organization_id, current_user.id)
    return _to_handoff_response(handoff, already_open=True) if handoff else None


@handoff_admin_router.get("", response_model=list[HandoffAdminResponse])
def list_handoffs(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
    organization_id: int = Depends(get_organization_id),
):
    """Org-scoped ticket queue — every admin sees every ticket raised in
    their organization (confirmed with HR: no per-reviewer restriction)."""
    handoffs = handoff_service.list_handoffs(db, organization_id, status)
    return [handoff_service.serialize_handoff(db, h) for h in handoffs]


@handoff_admin_router.post("/{handoff_id}/resolve", response_model=HandoffAdminResponse)
def resolve_handoff(
    handoff_id: int,
    payload: HandoffResolve,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
    organization_id: int = Depends(get_organization_id),
):
    handoff = handoff_service.resolve_handoff(
        db, organization_id, handoff_id, current_user.id, payload.resolution_note,
    )
    return handoff_service.serialize_handoff(db, handoff)
