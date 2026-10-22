"""The document status state machine: the ONLY writer of generated_documents.status.

Any other assignment raises immediately (attribute listener below), and tests/doc_templates/test_state_machine.py scans the module for
direct assignments. Every transition appends a document_events row (IDs and statuses only, never contents).
"""
from __future__ import annotations

import contextvars
from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import event

from app.modules.doc_templates.models import DocumentEvent, GeneratedDocument

TRANSITIONS: dict[str, set[str]] = {
    "REQUESTED": {"CONTEXT_VALIDATED", "REJECTED"},
    "CONTEXT_VALIDATED": {"RENDERED_DRAFT", "REJECTED"},
    "RENDERED_DRAFT": {"PENDING_APPROVAL", "HUMAN_APPROVED", "CANCELLED"},
    "PENDING_APPROVAL": {"HUMAN_APPROVED", "REJECTED", "CANCELLED"},
    "HUMAN_APPROVED": {"ISSUED", "CANCELLED"},
    "ISSUED": {"ACKNOWLEDGED", "EXECUTED", "DECLINED", "EXPIRED", "CANCELLED", "CORRECTED", "SUPERSEDED", "RETAINED"},
    "ACKNOWLEDGED": {"RETAINED", "CORRECTED", "SUPERSEDED"},
    "EXECUTED": {"RETAINED", "CORRECTED", "SUPERSEDED"},
    "DECLINED": {"RETAINED", "CORRECTED"},
    "EXPIRED": {"RETAINED", "CORRECTED"},
    "CORRECTED": {"RETAINED"},
    "SUPERSEDED": {"RETAINED"},
    "REJECTED": set(),
    "CANCELLED": set(),
    "RETAINED": set(),
}
DRAFT_STATES = {"REQUESTED", "CONTEXT_VALIDATED", "RENDERED_DRAFT", "PENDING_APPROVAL", "HUMAN_APPROVED"}
TERMINAL = {"REJECTED", "CANCELLED", "RETAINED"}

_writing = contextvars.ContextVar("doc_state_writing", default=False)


class IllegalTransition(HTTPException):
    def __init__(self, current: str, target: str):
        super().__init__(409, f"A document in status {current} cannot move to {target}.")


def add_event(db, doc: GeneratedDocument, event_type: str, *, actor_id: Optional[int] = None, actor_type: str = "employee",
              detail: Optional[dict] = None, at: Optional[datetime] = None) -> DocumentEvent:
    ev = DocumentEvent(organization_id=doc.organization_id, document_id=doc.id, event_type=event_type, actor_type=actor_type,
                       actor_id=actor_id, detail=detail or None, created_at=at or datetime.utcnow())
    db.add(ev)
    return ev


def _set(doc: GeneratedDocument, value: str) -> None:
    token = _writing.set(True)
    try:
        doc.status = value
        doc.status_changed_at = datetime.utcnow()
    finally:
        _writing.reset(token)


def initial(doc: GeneratedDocument) -> None:
    """A brand-new document starts REQUESTED (the only status set outside `transition`)."""
    _set(doc, "REQUESTED")


def transition(db, doc: GeneratedDocument, target: str, *, actor_id: Optional[int] = None, actor_type: str = "employee",
               event_type: Optional[str] = None, detail: Optional[dict] = None) -> None:
    current = doc.status
    if target == "LEGAL_HOLD":
        if current == "LEGAL_HOLD":
            raise IllegalTransition(current, target)
        doc.status_before_hold = current
    elif current == "LEGAL_HOLD":
        if target != doc.status_before_hold:
            raise IllegalTransition(current, target)
        doc.status_before_hold = None
    elif target not in TRANSITIONS.get(current, set()):
        raise IllegalTransition(current, target)
    _set(doc, target)
    add_event(db, doc, event_type or target.lower(), actor_id=actor_id, actor_type=actor_type,
              detail={"from": current, "to": target, **(detail or {})})


@event.listens_for(GeneratedDocument.status, "set", propagate=True)
def _on_status_set(target, value, oldvalue, initiator):
    if not _writing.get():
        raise RuntimeError("generated_documents.status may only be changed by doc_templates.state")
    return value
