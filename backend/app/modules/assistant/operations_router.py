"""
modules/assistant/operations_router.py
------------------------------------------
Admin kill-switch controls. organization_id=None rows are platform-wide
(super_admin only); org-scoped rows are managed by that org's admins.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_admin, get_organization_id

from app.modules.assistant import audit_service
from app.modules.assistant.models import ChatOperationalControl, ControlType
from app.modules.assistant.schemas import OperationalControlUpdate, OperationalControlResponse

operations_router = APIRouter(prefix="/assistant/admin/controls", tags=["Assistant Admin - Controls"])


@operations_router.get("", response_model=list[OperationalControlResponse])
def list_controls(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
    organization_id: int = Depends(get_organization_id),
):
    controls = (
        db.query(ChatOperationalControl)
        .filter(ChatOperationalControl.organization_id == organization_id)
        .all()
    )
    by_type = {c.control_type: c for c in controls}
    return [
        {
            "control_type": ct.value,
            "is_enabled": by_type[ct].is_enabled if ct in by_type else False,
            "updated_at": by_type[ct].updated_at if ct in by_type else None,
        }
        for ct in ControlType
    ]


@operations_router.post("", response_model=OperationalControlResponse)
def set_control(
    payload: OperationalControlUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
    organization_id: int = Depends(get_organization_id),
):
    control_type = ControlType(payload.control_type)
    control = (
        db.query(ChatOperationalControl)
        .filter(ChatOperationalControl.organization_id == organization_id, ChatOperationalControl.control_type == control_type)
        .first()
    )
    if not control:
        control = ChatOperationalControl(organization_id=organization_id, control_type=control_type)
        db.add(control)
    control.is_enabled = payload.is_enabled
    control.updated_by = current_user.id
    db.flush()

    audit_service.record(db, organization_id, "operational_control_changed", "chat_operational_control",
                          control.id, current_user.id, {"control_type": control_type.value, "is_enabled": payload.is_enabled})
    db.commit()
    db.refresh(control)
    return {"control_type": control.control_type.value, "is_enabled": control.is_enabled, "updated_at": control.updated_at}
