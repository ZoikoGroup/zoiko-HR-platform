from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_user, get_organization_id
from app.core.rate_limiter import limiter
from fastapi import Request

from app.modules.assistant import privacy_service
from app.modules.assistant.schemas import PrivacyRequestCreate, PrivacyRequestResponse, SuccessResponse

privacy_router = APIRouter(prefix="/assistant/privacy-requests", tags=["Assistant Privacy"])


@privacy_router.get("", response_model=list[PrivacyRequestResponse])
def list_privacy_requests(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    organization_id: int = Depends(get_organization_id),
):
    requests = privacy_service.list_privacy_requests(db, organization_id, current_user.id)
    return [
        {"id": r.id, "request_type": r.request_type.value, "status": r.status.value,
         "created_at": r.created_at, "completed_at": r.completed_at, "result": None}
        for r in requests
    ]


@privacy_router.post("", response_model=PrivacyRequestResponse)
@limiter.limit("5/hour")
def create_privacy_request(
    request: Request,
    payload: PrivacyRequestCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    organization_id: int = Depends(get_organization_id),
):
    """Self-service only: employees act on their own assistant data. Export
    and delete run synchronously and return their result inline; restrict
    takes effect immediately for future turns."""
    return privacy_service.create_and_process_privacy_request(
        db, organization_id, current_user.id, payload.request_type,
    )


@privacy_router.post("/unrestrict", response_model=SuccessResponse)
@limiter.limit("5/hour")
def unrestrict(
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    organization_id: int = Depends(get_organization_id),
):
    """Lifts a previously-submitted 'restrict' request — data-subject
    rights are the employee's to exercise in both directions."""
    result = privacy_service.lift_employee_restriction(db, organization_id, current_user.id)
    return SuccessResponse(message=result["message"])
