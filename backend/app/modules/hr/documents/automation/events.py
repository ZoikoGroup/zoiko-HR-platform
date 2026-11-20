"""Domain events of the documents module (ZHR-DOCS-ARCH-001 §11).

Payloads carry ids, statuses, dates and category keys only: no names, contents or identity numbers. `emit()` validates a
payload against its model and writes the outbox rows INSIDE the caller's transaction (integrations.events.emit_event with
in_tx=True), so an event exists exactly when the business change it describes is committed.
"""
from datetime import date
from typing import ClassVar, Literal, Optional

from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session


class DomainEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: ClassVar[str]
    description: ClassVar[str]


class EmployeeCreated(DomainEvent):
    type = "employee.created"
    description = "An employee record was created (ids only)."
    employee_id: int
    department_id: Optional[int] = None
    designation_id: Optional[int] = None
    employment_type: Optional[str] = None
    joining_date: Optional[date] = None
    source: Literal["manual", "onboarding", "import"] = "manual"


class EmployeeRoleChanged(DomainEvent):
    type = "employee.role_changed"
    description = "An employee's role, department or designation changed (ids only)."
    employee_id: int
    from_role: Optional[str] = None
    to_role: Optional[str] = None
    from_department_id: Optional[int] = None
    to_department_id: Optional[int] = None
    from_designation_id: Optional[int] = None
    to_designation_id: Optional[int] = None
    changed_by: Optional[int] = None


class EmployeeExited(DomainEvent):
    type = "employee.exited"
    description = "An employee left the organization (ids and dates only)."
    employee_id: int
    exit_date: Optional[date] = None
    exit_type: Optional[str] = None
    last_working_day: Optional[date] = None


class DocumentUploaded(DomainEvent):
    type = "document.uploaded"
    description = "A document version was uploaded (ids, category and pre-check outcome only)."
    document_id: int
    version_id: int
    version: int
    scope: Literal["employee", "company"]
    category_key: Optional[str] = None
    employee_id: Optional[int] = None
    source: str
    precheck: Optional[Literal["pass", "warn", "fail"]] = None


class DocumentApproved(DomainEvent):
    type = "document.approved"
    description = "A document version was approved, by a person or automatically (ids only)."
    document_id: int
    version_id: int
    scope: Literal["employee", "company"]
    category_key: Optional[str] = None
    employee_id: Optional[int] = None
    decided_by: Optional[int] = None
    decided_role: Optional[str] = None
    auto: bool = False


class DocumentRejected(DomainEvent):
    type = "document.rejected"
    description = "A document version was rejected or a fresh copy was requested (ids and reason code only)."
    document_id: int
    version_id: int
    category_key: Optional[str] = None
    employee_id: Optional[int] = None
    reason_code: Optional[str] = None
    reupload: bool = False


class DocumentExpiring(DomainEvent):
    type = "document.expiring"
    description = "An approved document expires in 30, 15 or 7 days (ids and dates only)."
    document_id: int
    category_key: Optional[str] = None
    employee_id: Optional[int] = None
    expiry_date: date
    days_left: int


class UploadedDocumentExpired(DomainEvent):
    # Shares the existing catalog type with generated documents; `kind` tells them apart.
    type = "document.expired"
    description = "A document expired."
    document_id: int
    kind: Literal["uploaded", "generated"] = "uploaded"
    category_key: Optional[str] = None
    employee_id: Optional[int] = None


class UploadedDocumentAcknowledged(DomainEvent):
    type = "document.acknowledged"
    description = "A recipient acknowledged a document."
    document_id: int
    version_id: Optional[int] = None
    kind: Literal["uploaded", "generated"] = "uploaded"
    employee_id: int


class PolicyVersionPublished(DomainEvent):
    type = "policy.version_published"
    description = "A new version of a company policy was published (ids, version and audience size only)."
    policy_canonical_id: Optional[str] = None
    version: Optional[str] = None
    distribution_id: Optional[int] = None
    document_id: Optional[int] = None
    material: bool = True
    effective_from: Optional[date] = None
    audience_count: int = 0


class SignatureCompleted(DomainEvent):
    type = "signature.completed"
    description = "Every required party signed a generated document (alias of document.executed, ids only)."
    document_id: int
    canonical_id: Optional[str] = None
    hr_document_id: Optional[int] = None
    recipient_employee_id: Optional[int] = None


class TaskOverdue(DomainEvent):
    type = "task.overdue"
    description = "A document task passed a step of its escalation ladder (ids only)."
    task_id: int
    kind: str
    level: int
    employee_id: Optional[int] = None
    assignee_role: Optional[str] = None


EVENT_MODELS: dict[str, type[DomainEvent]] = {m.type: m for m in (
    EmployeeCreated, EmployeeRoleChanged, EmployeeExited, DocumentUploaded, DocumentApproved, DocumentRejected,
    DocumentExpiring, PolicyVersionPublished, SignatureCompleted, TaskOverdue,
)}
# Types this module also emits but which already exist in the catalog (generated documents).
SHARED_EVENT_MODELS: dict[str, type[DomainEvent]] = {
    UploadedDocumentExpired.type: UploadedDocumentExpired,
    UploadedDocumentAcknowledged.type: UploadedDocumentAcknowledged,
}


def catalog_entries() -> dict[str, str]:
    """New entries for integrations.events.EVENT_CATALOG."""
    return {t: m.description for t, m in EVENT_MODELS.items()}


def emit(db: Session, organization_id: int, event: DomainEvent) -> Optional[str]:
    """Queue `event` in the current transaction. Returns the event id (None if the event could not be queued)."""
    from app.modules.integrations.events import emit_event
    data = event.model_dump(mode="json", exclude_none=True)
    return emit_event(db, event.type, data, organization_id, in_tx=True)
