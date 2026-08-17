from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_user, get_organization_id
from app.core.exceptions import BadRequestException

from app.modules.assistant import action_service
from app.modules.assistant.models import ChatWorkflowField, ChatWorkflowValidation
from app.modules.assistant.schemas import WorkflowResponse, WorkflowConfirmRequest

action_router = APIRouter(prefix="/assistant/workflows", tags=["Assistant Actions"])


def _serialize(db: Session, workflow) -> dict:
    fields = db.query(ChatWorkflowField).filter(ChatWorkflowField.workflow_id == workflow.id).all()
    validations = db.query(ChatWorkflowValidation).filter(ChatWorkflowValidation.workflow_id == workflow.id).all()
    confirmation_token = None
    from app.modules.assistant.models import WorkflowStatus
    if workflow.status == WorkflowStatus.VALIDATED:
        confirmation_token = action_service.get_confirmation_token(db, workflow)
    return {
        "id": workflow.id,
        "workflow_type": workflow.workflow_type,
        "status": workflow.status.value if hasattr(workflow.status, "value") else workflow.status,
        "version": workflow.version,
        "fields": [
            {"field_name": f.field_name, "field_value": f.field_value, "is_valid": f.is_valid,
             "validation_message": f.validation_message}
            for f in fields
        ],
        "validation_messages": [v.message for v in validations if not v.passed and v.message],
        "confirmation_token": confirmation_token,
        "created_at": workflow.created_at,
        "updated_at": workflow.updated_at,
    }


@action_router.get("/{workflow_id}", response_model=WorkflowResponse)
def get_workflow(
    workflow_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    organization_id: int = Depends(get_organization_id),
):
    workflow = action_service.get_workflow(db, organization_id, current_user.id, workflow_id)
    return _serialize(db, workflow)


@action_router.patch("/{workflow_id}", response_model=WorkflowResponse)
def update_workflow_fields(
    workflow_id: int,
    updates: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    organization_id: int = Depends(get_organization_id),
):
    workflow = action_service.update_fields(db, organization_id, current_user.id, workflow_id, updates)
    return _serialize(db, workflow)


@action_router.post("/{workflow_id}/validate", response_model=WorkflowResponse)
def validate_workflow(
    workflow_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    organization_id: int = Depends(get_organization_id),
):
    workflow = action_service.validate_workflow(db, organization_id, current_user.id, workflow_id)
    return _serialize(db, workflow)


@action_router.post("/{workflow_id}/confirm", response_model=WorkflowResponse)
def confirm_workflow(
    workflow_id: int,
    payload: WorkflowConfirmRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    organization_id: int = Depends(get_organization_id),
):
    workflow = action_service.confirm_workflow(
        db, organization_id, current_user.id, workflow_id, payload.confirmation_token,
    )
    return _serialize(db, workflow)


@action_router.post("/{workflow_id}/execute", response_model=WorkflowResponse)
def execute_workflow(
    workflow_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    organization_id: int = Depends(get_organization_id),
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
):
    if not idempotency_key:
        raise BadRequestException("Idempotency-Key header is required to execute a workflow.")
    workflow = action_service.execute_workflow(db, organization_id, current_user.id, workflow_id, idempotency_key)
    return _serialize(db, workflow)


@action_router.post("/{workflow_id}/cancel", response_model=WorkflowResponse)
def cancel_workflow(
    workflow_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    organization_id: int = Depends(get_organization_id),
):
    workflow = action_service.cancel_workflow(db, organization_id, current_user.id, workflow_id)
    return _serialize(db, workflow)
