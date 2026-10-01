"""Super Admin support desk (ZHR-34).

Cross-organization view over the existing support tickets - the assistant's
"Talk to HR" handoffs (ChatHandoff). Adds what the desk needs on top of them:
priority, assignee, a reply thread, status changes, a notification to the
requester on every reply, and an audit row for every action.

Ticket status mapping (kept on the existing HandoffStatus enum, so no database
enum change): new = SENT, in_progress = OPEN, resolved = RESOLVED."""

import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_super_admin
from app.core.exceptions import BadRequestException, NotFoundException
from app.database import get_db
from app.modules.assistant.models import ChatHandoff, ChatHandoffMessage, HandoffStatus
from app.modules.employee.models import Employee, UserRole
from app.modules.hr.models import Organization
from app.modules.super_admin import notification_service
from app.modules.super_admin.models import AuditAction, AuditLog

router = APIRouter(
    prefix="/super-admin/support", tags=["Super Admin Support"],
    dependencies=[Depends(get_current_super_admin)],
)

STATUS_TO_ENUM = {"new": HandoffStatus.SENT, "in_progress": HandoffStatus.OPEN, "resolved": HandoffStatus.RESOLVED}
ENUM_TO_STATUS = {v: k for k, v in STATUS_TO_ENUM.items()}
PRIORITIES = ("low", "normal", "high", "urgent")


class TicketPatch(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_to: Optional[int] = Field(default=None, description="Super Admin employee id; 0 unassigns")
    resolution_note: Optional[str] = Field(default=None, max_length=2000)


class ReplyIn(BaseModel):
    body: str = Field(min_length=1, max_length=5000)
    resolve: bool = False


def _iso(dt) -> Optional[str]:
    return dt.isoformat() + "Z" if isinstance(dt, datetime.datetime) else None


def _name(e: Optional[Employee]) -> Optional[str]:
    return f"{e.first_name} {e.last_name}".strip() if e else None


def _view(h: ChatHandoff, org, requester, assignee) -> dict:
    return {
        "id": h.id, "reference": h.ticket_reference, "subject": (h.issue_summary or "")[:120],
        "summary": h.issue_summary, "reason": h.reason, "status": ENUM_TO_STATUS.get(h.status, "new"),
        "priority": h.priority or "normal", "organization_id": h.organization_id,
        "organization_name": (org.organization_name or org.display_name) if org else None,
        "requester_id": h.employee_id, "requester_name": _name(requester),
        "requester_email": requester.email if requester else None,
        "assignee_id": h.assigned_to, "assignee_name": _name(assignee),
        "resolution_note": h.resolution_note, "created_at": _iso(h.created_at),
        "updated_at": _iso(h.updated_at or h.created_at), "resolved_at": _iso(h.resolved_at),
    }


def _base(db: Session):
    return (
        db.query(ChatHandoff, Organization, Employee)
        .join(Organization, Organization.id == ChatHandoff.organization_id)
        .join(Employee, Employee.id == ChatHandoff.employee_id)
    )


def _audit(db: Session, user, ticket_id: int, details: dict, action=AuditAction.UPDATE) -> None:
    db.add(AuditLog(action=action, entity_type="SupportTicket", entity_id=ticket_id,
                    performed_by=user.id, performed_by_email=user.email, details=details))


def _load(db: Session, ticket_id: int):
    row = _base(db).filter(ChatHandoff.id == ticket_id).first()
    if row is None:
        raise NotFoundException("Ticket", ticket_id)
    return row


def _assignee(db: Session, h: ChatHandoff) -> Optional[Employee]:
    return db.query(Employee).filter(Employee.id == h.assigned_to).first() if h.assigned_to else None


@router.get("/assignees")
def list_assignees(db: Session = Depends(get_db)):
    rows = db.query(Employee).filter(Employee.role == UserRole.SUPER_ADMIN, Employee.is_active.is_(True)).order_by(Employee.first_name).all()
    return {"assignees": [{"id": e.id, "name": _name(e), "email": e.email} for e in rows]}


@router.get("/tickets")
def list_tickets(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    organization_id: Optional[int] = None,
    assignee_id: Optional[int] = Query(None, description="0 = unassigned"),
    date_from: Optional[datetime.datetime] = None,
    date_to: Optional[datetime.datetime] = None,
    q: Optional[str] = Query(None, max_length=200),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    if status and status not in STATUS_TO_ENUM:
        raise BadRequestException("status must be one of: new, in_progress, resolved.")
    if priority and priority not in PRIORITIES:
        raise BadRequestException("priority must be one of: " + ", ".join(PRIORITIES) + ".")
    query = _base(db)
    if status:
        query = query.filter(ChatHandoff.status == STATUS_TO_ENUM[status])
    if priority:
        query = query.filter(ChatHandoff.priority == priority)
    if organization_id:
        query = query.filter(ChatHandoff.organization_id == organization_id)
    if assignee_id is not None:
        query = query.filter(ChatHandoff.assigned_to.is_(None) if assignee_id == 0 else ChatHandoff.assigned_to == assignee_id)
    if date_from:
        query = query.filter(ChatHandoff.created_at >= date_from.replace(tzinfo=None))
    if date_to:
        query = query.filter(ChatHandoff.created_at <= date_to.replace(tzinfo=None))
    term = (q or "").strip().lower()
    if term:
        like = f"%{term}%"
        query = query.filter(or_(
            func.lower(func.coalesce(ChatHandoff.ticket_reference, "")).like(like),
            func.lower(ChatHandoff.issue_summary).like(like),
            func.lower(Employee.first_name).like(like), func.lower(Employee.last_name).like(like),
            func.lower(Employee.first_name + " " + Employee.last_name).like(like),
            func.lower(Employee.email).like(like),
        ))
    total = query.count()
    rows = query.order_by(ChatHandoff.created_at.desc(), ChatHandoff.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    ids = {h.assigned_to for h, _, _ in rows if h.assigned_to}
    assignees = {e.id: e for e in db.query(Employee).filter(Employee.id.in_(ids)).all()} if ids else {}
    return {"total": total, "page": page, "page_size": page_size,
            "tickets": [_view(h, o, r, assignees.get(h.assigned_to)) for h, o, r in rows]}


def _thread(db: Session, h: ChatHandoff, requester: Employee) -> list:
    out = [{"id": 0, "author_id": h.employee_id, "author_name": _name(requester), "author_role": "requester",
            "body": h.issue_summary, "created_at": _iso(h.created_at)}]
    msgs = db.query(ChatHandoffMessage).filter(ChatHandoffMessage.handoff_id == h.id).order_by(ChatHandoffMessage.id).all()
    authors = {e.id: e for e in db.query(Employee).filter(Employee.id.in_({m.author_id for m in msgs})).all()} if msgs else {}
    for m in msgs:
        out.append({"id": m.id, "author_id": m.author_id, "author_name": _name(authors.get(m.author_id)),
                    "author_role": m.author_role, "body": m.body, "created_at": _iso(m.created_at)})
    return out


@router.get("/tickets/{ticket_id}")
def get_ticket(ticket_id: int, db: Session = Depends(get_db)):
    h, org, requester = _load(db, ticket_id)
    return {**_view(h, org, requester, _assignee(db, h)), "thread": _thread(db, h, requester)}


@router.patch("/tickets/{ticket_id}")
def update_ticket(ticket_id: int, body: TicketPatch, db: Session = Depends(get_db), user=Depends(get_current_super_admin)):
    h, org, requester = _load(db, ticket_id)
    changes = {}
    if body.status is not None:
        if body.status not in STATUS_TO_ENUM:
            raise BadRequestException("status must be one of: new, in_progress, resolved.")
        new = STATUS_TO_ENUM[body.status]
        if new != h.status:
            changes["status"] = {"from": ENUM_TO_STATUS.get(h.status), "to": body.status}
            h.status = new
            if new == HandoffStatus.RESOLVED:
                h.resolved_by, h.resolved_at = user.id, datetime.datetime.utcnow()
            else:
                h.resolved_by = h.resolved_at = None
    if body.priority is not None:
        if body.priority not in PRIORITIES:
            raise BadRequestException("priority must be one of: " + ", ".join(PRIORITIES) + ".")
        if body.priority != (h.priority or "normal"):
            changes["priority"] = {"from": h.priority or "normal", "to": body.priority}
            h.priority = body.priority
    if body.assigned_to is not None:
        if body.assigned_to == 0:
            target = None
        else:
            target = db.query(Employee).filter(Employee.id == body.assigned_to, Employee.role == UserRole.SUPER_ADMIN,
                                               Employee.is_active.is_(True)).first()
            if target is None:
                raise BadRequestException("Tickets can only be assigned to an active Super Admin.")
        new_id = target.id if target else None
        if new_id != h.assigned_to:
            changes["assignee"] = {"from": h.assigned_to, "to": new_id}
            h.assigned_to = new_id
    if body.resolution_note is not None:
        h.resolution_note = body.resolution_note.strip() or None
        changes["resolution_note"] = True
    if not changes:
        return {**_view(h, org, requester, _assignee(db, h))}
    h.updated_at = datetime.datetime.utcnow()
    _audit(db, user, h.id, {"event": "support.ticket_updated", "reference": h.ticket_reference,
                            "organization_id": h.organization_id, "changes": changes})
    db.commit()
    return _view(h, org, requester, _assignee(db, h))


@router.post("/tickets/{ticket_id}/reply", status_code=201)
def reply_to_ticket(ticket_id: int, body: ReplyIn, db: Session = Depends(get_db), user=Depends(get_current_super_admin)):
    h, org, requester = _load(db, ticket_id)
    text = body.body.strip()
    if not text:
        raise BadRequestException("A reply cannot be empty.")
    if h.status == HandoffStatus.RESOLVED and not body.resolve:
        raise BadRequestException("This ticket is resolved. Reopen it to reply.")
    db.add(ChatHandoffMessage(handoff_id=h.id, author_id=user.id, author_role="staff", body=text))
    if body.resolve:
        h.status, h.resolved_by, h.resolved_at = HandoffStatus.RESOLVED, user.id, datetime.datetime.utcnow()
        h.resolution_note = text[:2000]
    elif h.status == HandoffStatus.SENT:
        h.status = HandoffStatus.OPEN  # first staff reply moves it to in progress
    if h.assigned_to is None:
        h.assigned_to = user.id
    h.updated_at = datetime.datetime.utcnow()
    _audit(db, user, h.id, {"event": "support.ticket_replied", "reference": h.ticket_reference,
                            "organization_id": h.organization_id, "resolved": body.resolve})
    db.commit()
    notified = True
    try:  # in-app notification to the requester; a delivery problem must not lose the reply
        notification_service.create_notification(db, {
            "title": f"Update on your support ticket {h.ticket_reference}",
            "message": text, "notification_type": "support", "target_user_ids": [h.employee_id],
        }, user)
    except Exception:
        db.rollback()
        notified = False
    return {**_view(h, org, requester, _assignee(db, h)), "thread": _thread(db, h, requester), "notified": notified}
