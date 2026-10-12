"""Super Admin approvals oversight (ZHR-29).

A cross-organization view of real leave requests, with approve/reject that
reuses the organization portal's own review service (status, leave balances
and employee email are handled there - nothing is duplicated). Leave requests
are the only approvable item type the product has today; the response carries
a `request_type` so other types can be added without changing the contract."""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_super_admin
from app.core.exceptions import BadRequestException, NotFoundException
from app.database import get_db
from app.modules.employee.models import Employee
from app.modules.hr import service as hr_service
from app.modules.hr.models import LeaveRequest, Organization, RequestStatus
from app.modules.hr.schemas import LeaveRequestUpdate
from app.modules.super_admin.models import AuditAction, AuditLog

router = APIRouter(
    prefix="/super-admin/approvals", tags=["Super Admin Approvals"],
    dependencies=[Depends(get_current_super_admin)],
)

PENDING = (RequestStatus.PENDING, RequestStatus.IN_PROGRESS)
STATUS_FILTERS = {
    "pending": PENDING,
    "approved": (RequestStatus.APPROVED,),
    "rejected": (RequestStatus.REJECTED,),
}


class DecisionIn(BaseModel):
    comment: Optional[str] = Field(default=None, max_length=1000)


def _iso(dt) -> Optional[str]:
    return dt.isoformat() + "Z" if isinstance(dt, datetime) else None


def _name(e: Optional[Employee]) -> Optional[str]:
    return f"{e.first_name} {e.last_name}".strip() if e else None


def _view(l: LeaveRequest, emp: Optional[Employee], org: Optional[Organization], rev: Optional[Employee]) -> dict:
    status = l.status.value if hasattr(l.status, "value") else str(l.status)
    pending = l.status in PENDING
    return {
        "id": l.id, "request_type": "leave", "status": "pending" if pending else status,
        "employee_id": l.employee_id, "employee_name": _name(emp), "employee_email": emp.email if emp else None,
        "organization_id": l.organization_id,
        "organization_name": (org.organization_name or org.display_name) if org else None,
        "leave_type": l.leave_type.value if hasattr(l.leave_type, "value") else str(l.leave_type),
        "start_date": l.start_date.isoformat(), "end_date": l.end_date.isoformat(), "days": l.days,
        "reason": l.reason, "submitted_at": _iso(l.created_at),
        "current_approver": "Organization admin / HR" if pending else None,
        "reviewed_by": _name(rev), "reviewed_at": _iso(l.reviewed_at),
    }


def _base_query(db: Session):
    return (
        db.query(LeaveRequest, Employee, Organization)
        .join(Employee, Employee.id == LeaveRequest.employee_id)
        .join(Organization, Organization.id == LeaveRequest.organization_id)
    )


@router.get("")
def list_approvals(
    status: str = Query("pending"),
    organization_id: Optional[int] = None,
    request_type: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    q: Optional[str] = Query(None, max_length=200),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    if status != "all" and status not in STATUS_FILTERS:
        raise BadRequestException("status must be one of: pending, approved, rejected, all.")
    if request_type not in (None, "", "leave"):
        return {"total": 0, "page": page, "page_size": page_size, "approvals": []}
    query = _base_query(db)
    if status != "all":
        query = query.filter(LeaveRequest.status.in_(STATUS_FILTERS[status]))
    if organization_id:
        query = query.filter(LeaveRequest.organization_id == organization_id)
    if date_from:
        query = query.filter(LeaveRequest.created_at >= date_from.replace(tzinfo=None))
    if date_to:
        query = query.filter(LeaveRequest.created_at <= date_to.replace(tzinfo=None))
    term = (q or "").strip().lower()
    if term:
        like = f"%{term}%"
        query = query.filter(or_(
            func.lower(Employee.first_name).like(like),
            func.lower(Employee.last_name).like(like),
            func.lower(Employee.first_name + " " + Employee.last_name).like(like),
            func.lower(Employee.email).like(like),
        ))
    total = query.count()
    # Oldest pending first (longest waiting); decided items newest first.
    order = (LeaveRequest.created_at.asc(), LeaveRequest.id.asc()) if status == "pending" else (
        LeaveRequest.created_at.desc(), LeaveRequest.id.desc())
    rows = query.order_by(*order).offset((page - 1) * page_size).limit(page_size).all()
    reviewer_ids = {l.reviewed_by for l, _, _ in rows if l.reviewed_by}
    reviewers = {e.id: e for e in db.query(Employee).filter(Employee.id.in_(reviewer_ids)).all()} if reviewer_ids else {}
    return {"total": total, "page": page, "page_size": page_size,
            "approvals": [_view(l, e, o, reviewers.get(l.reviewed_by)) for l, e, o in rows]}


@router.get("/summary")
def approvals_summary(organization_id: Optional[int] = None, db: Session = Depends(get_db)):
    now = datetime.utcnow()
    month_start = datetime(now.year, now.month, 1)

    def count(statuses, since=None):
        q = db.query(func.count(LeaveRequest.id)).filter(LeaveRequest.status.in_(statuses))
        if organization_id:
            q = q.filter(LeaveRequest.organization_id == organization_id)
        if since:
            q = q.filter(LeaveRequest.reviewed_at >= since)
        return q.scalar() or 0

    return {
        "pending": count(PENDING),
        "approved_this_month": count((RequestStatus.APPROVED,), month_start),
        "rejected_this_month": count((RequestStatus.REJECTED,), month_start),
    }


def _decide(db: Session, leave_id: int, user, approve: bool, comment: Optional[str]) -> dict:
    leave = db.query(LeaveRequest).filter(LeaveRequest.id == leave_id).first()
    if leave is None:
        raise NotFoundException("Leave request", leave_id)
    if leave.status not in PENDING:
        raise BadRequestException("This request has already been decided.")
    comment = (comment or "").strip()
    if not approve and not comment:
        raise BadRequestException("A comment is required when rejecting a request.")
    before = leave.status.value if hasattr(leave.status, "value") else str(leave.status)
    # Same code path the organization portal uses: status, reviewer, leave
    # balances (pending -> used / released) and the employee email.
    hr_service.review_leave_request(
        db, leave_id,
        LeaveRequestUpdate(status=RequestStatus.APPROVED if approve else RequestStatus.REJECTED),
        leave.organization_id, user.id,
    )
    db.add(AuditLog(
        action=AuditAction.APPROVED if approve else AuditAction.REJECTED,
        entity_type="LeaveRequest", entity_id=leave_id, performed_by=user.id, performed_by_email=user.email,
        details={"event": "approval.leave_approved" if approve else "approval.leave_rejected",
                 "organization_id": leave.organization_id, "employee_id": leave.employee_id,
                 "days": leave.days, "previous_status": before, "comment": comment or None},
    ))
    db.commit()
    row = _base_query(db).filter(LeaveRequest.id == leave_id).first()
    rev = db.query(Employee).filter(Employee.id == leave.reviewed_by).first() if leave.reviewed_by else None
    return _view(row[0], row[1], row[2], rev)


@router.post("/leave/{leave_id}/approve")
def approve_leave(leave_id: int, body: DecisionIn, db: Session = Depends(get_db), user=Depends(get_current_super_admin)):
    return _decide(db, leave_id, user, True, body.comment)


@router.post("/leave/{leave_id}/reject")
def reject_leave(leave_id: int, body: DecisionIn, db: Session = Depends(get_db), user=Depends(get_current_super_admin)):
    return _decide(db, leave_id, user, False, body.comment)
