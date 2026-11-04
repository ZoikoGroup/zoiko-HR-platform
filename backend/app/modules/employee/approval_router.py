"""Second-administrator approvals for high-impact actions inside one organization (ZHR-PRIV-001 D09).

An organization admin who asks for a delete-all or a large bulk delete (when the deployment turns dual control on) creates a request
here; a DIFFERENT admin of the SAME organization approves or rejects it; the first admin then repeats the action with the approval id.
Nobody can approve their own request, a platform identity cannot approve for a tenant (the path is under /hr, closed to the platform).
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_admin, get_current_user
from app.core.privacy import approvals
from app.core.exceptions import ForbiddenException
from app.database import get_db
from app.modules.super_admin.models import ApprovalRequest, AuditAction, AuditLog
from app.modules.super_admin.admin_notifications import notify_org_admins

router = APIRouter(prefix="/hr/approvals", tags=["Approvals"])


def _view(r: ApprovalRequest, viewer) -> dict:
    payload = dict(r.payload or {})
    if "ids" in payload:                                         # counts, not the people
        payload = {"count": len(payload["ids"])}
    return {"id": r.id, "kind": r.kind, "status": r.status, "requested_by": r.requested_by, "payload": payload,
            "expires_at": r.expires_at.isoformat() if r.expires_at else None,
            "can_decide": r.status == "pending" and r.requested_by != viewer.id and approvals.can_approve(viewer, r)}


@router.get("", summary="Pending approvals in my organization")
def list_pending(db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    rows = [r for r in approvals.pending_for(db, current_user) if r.organization_id == current_user.organization_id]
    return {"requests": [_view(r, current_user) for r in rows]}


def _decide(db: Session, request_id: int, user, approve: bool) -> dict:
    req = approvals.decide(db, request_id, user, approve)
    if req.organization_id != user.organization_id:
        raise ForbiddenException("You are not allowed to decide this request.")
    db.add(AuditLog(action=AuditAction.APPROVED if approve else AuditAction.REJECTED, entity_type="ApprovalRequest", entity_id=req.id,
                    performed_by=user.id, performed_by_email=user.email, organization_id=req.organization_id,
                    details={"event": f"approval.{req.status}", "kind": req.kind, "requested_by": req.requested_by}))
    # Notify org admins about the approval decision
    try:
        decision = "Approved" if approve else "Rejected"
        notify_org_admins(
            db, org_id=req.organization_id,
            title=f"Approval Request {decision}",
            message=f"Approval request #{req.id} ({req.kind}) has been {decision.lower()} by {user.first_name} {user.last_name}.",
            notification_type="approval",
        )
    except Exception:
        pass
    db.commit()
    return _view(req, user)


@router.post("/{request_id}/approve", summary="Approve a request made by another administrator")
def approve(request_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return _decide(db, request_id, current_user, True)


@router.post("/{request_id}/reject", summary="Reject a request made by another administrator")
def reject(request_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return _decide(db, request_id, current_user, False)
