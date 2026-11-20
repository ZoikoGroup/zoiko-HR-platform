"""Document tasks: what a person must do about a document (ZHR-DOCS-ARCH-001 §6.4).

At most one open task per (person, kind, target): `open_key` is unique while the task is open and cleared when it closes,
so opening the same task twice returns the existing one. Closing is by target (document / category), never by guessing.
"""
from datetime import datetime, timedelta
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.modules.hr.documents.automation.ladder import resolve_ladder
from app.modules.hr.documents.automation.models import OPEN_TASK_STATUSES, DocumentTask, TaskStatus


def open_key(kind: str, *, employee_id=None, assignee_role=None, document_id=None, employee_category_id=None,
             ack_round_id=None, generated_document_id=None) -> str:
    who = f"e{employee_id}" if employee_id else f"r{assignee_role}"
    target = (f"d{document_id or 0}.c{employee_category_id or 0}.a{ack_round_id or 0}.g{generated_document_id or 0}")
    return f"{kind}:{who}:{target}"[:120]


def open_task(db: Session, organization_id: int, kind: str, *, employee_id: Optional[int] = None,
              assignee_role: Optional[str] = None, document_id: Optional[int] = None, version_id: Optional[int] = None,
              employee_category_id: Optional[int] = None, ack_round_id: Optional[int] = None,
              generated_document_id: Optional[int] = None, due_in_days: Optional[int] = None, ladder=None,
              source: str = "system", rule_id: Optional[int] = None, created_by: Optional[int] = None,
              now: Optional[datetime] = None) -> tuple[DocumentTask, bool]:
    """(task, created). Returns the already-open task when there is one."""
    now = now or datetime.utcnow()
    key = open_key(kind, employee_id=employee_id, assignee_role=assignee_role, document_id=document_id,
                   employee_category_id=employee_category_id, ack_round_id=ack_round_id,
                   generated_document_id=generated_document_id)
    existing = db.query(DocumentTask).filter(DocumentTask.open_key == key).first()
    if existing is not None:
        return existing, False
    for pending in db.new:                                   # opened earlier in this same transaction
        if isinstance(pending, DocumentTask) and pending.open_key == key:
            return pending, False
    task = DocumentTask(
        organization_id=organization_id, kind=kind, employee_id=employee_id, assignee_role=assignee_role,
        document_id=document_id, version_id=version_id, employee_category_id=employee_category_id,
        ack_round_id=ack_round_id, generated_document_id=generated_document_id, open_key=key,
        status=TaskStatus.OPEN.value, due_at=(now + timedelta(days=due_in_days)) if due_in_days else None,
        escalation_level=0, ladder=ladder if ladder is not None else resolve_ladder(), source=source, rule_id=rule_id,
        created_by=created_by, created_at=now)
    db.add(task)
    db.flush()
    return task, True


def _close(task: DocumentTask, status: str, reason: str, now: datetime) -> None:
    task.status = status
    task.closed_at = now
    task.close_reason = reason[:30]
    task.open_key = None


def close_tasks(db: Session, organization_id: int, *, kinds: Iterable[str], employee_id: Optional[int] = None,
                document_id: Optional[int] = None, employee_category_id: Optional[int] = None,
                generated_document_id: Optional[int] = None, reason: str = "completed", status: str = TaskStatus.DONE.value, now: Optional[datetime] = None) -> int:
    """Close the open tasks of the given kinds for a target. Returns how many were closed."""
    now = now or datetime.utcnow()
    q = db.query(DocumentTask).filter(DocumentTask.organization_id == organization_id, DocumentTask.kind.in_(list(kinds)),
                                      DocumentTask.status.in_(OPEN_TASK_STATUSES))
    if employee_id is not None:
        q = q.filter(DocumentTask.employee_id == employee_id)
    if document_id is not None:
        q = q.filter(DocumentTask.document_id == document_id)
    if employee_category_id is not None:
        q = q.filter(DocumentTask.employee_category_id == employee_category_id)
    if generated_document_id is not None:
        q = q.filter(DocumentTask.generated_document_id == generated_document_id)
    tasks = q.all()
    for t in tasks:
        _close(t, status, reason, now)
    return len(tasks)


def cancel_for_employee(db: Session, organization_id: int, employee_id: int, reason: str, now: Optional[datetime] = None) -> int:
    """Cancel every open task of a person (e.g. they left the organization)."""
    now = now or datetime.utcnow()
    tasks = (db.query(DocumentTask)
             .filter(DocumentTask.organization_id == organization_id, DocumentTask.employee_id == employee_id,
                     DocumentTask.status.in_(OPEN_TASK_STATUSES)).all())
    for t in tasks:
        _close(t, TaskStatus.CANCELLED.value, reason, now)
    return len(tasks)


def open_tasks_for(db: Session, organization_id: int, employee_id: int) -> list[DocumentTask]:
    return (db.query(DocumentTask)
            .filter(DocumentTask.organization_id == organization_id, DocumentTask.employee_id == employee_id,
                    DocumentTask.status.in_(OPEN_TASK_STATUSES))
            .order_by(DocumentTask.due_at.is_(None), DocumentTask.due_at, DocumentTask.id).all())
