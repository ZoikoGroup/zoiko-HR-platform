"""Platform event catalog + emitter. Events feed Hub webhooks and Workflow triggers."""

import logging
import uuid
from datetime import datetime

from sqlalchemy.orm import Session

logger = logging.getLogger("zoiko.integrations")

# Only events that are actually emitted somewhere in the codebase.
EVENT_CATALOG = {
    "organization.created": "A new organization was registered.",
    "organization.deleted": "An organization was permanently deleted.",
    "user.created": "A user account was created.",
    "subscription.converted": "An evaluation was converted to a paid subscription.",
    "refund.created": "A refund or credit request was created.",
}


def emit_event(db: Session, event_type: str, data: dict, organization_id: int | None = None) -> None:
    """Queue webhook deliveries and workflow executions for an event.

    Call AFTER the originating transaction is committed. Never raises: an
    integration problem must not break the business action that caused it."""
    if event_type not in EVENT_CATALOG:
        logger.warning("emit_event: unknown event %s", event_type)
        return
    try:
        from app.modules.integrations.models import (
            Webhook, WebhookDelivery, Workflow, WorkflowExecution,
        )

        now = datetime.utcnow()
        event_id = uuid.uuid4().hex
        envelope = {
            "id": event_id,
            "type": event_type,
            "created_at": now.isoformat() + "Z",
            "organization_id": organization_id,
            "data": data,
        }
        for wh in db.query(Webhook).filter(Webhook.is_active.is_(True)).all():
            if event_type in (wh.events or []):
                db.add(WebhookDelivery(
                    webhook_id=wh.id, event_id=event_id, event_type=event_type,
                    payload=envelope, status="pending", attempt=0, next_attempt_at=now,
                ))
        for wf in db.query(Workflow).filter(
            Workflow.is_active.is_(True), Workflow.trigger_event == event_type
        ).all():
            db.add(WorkflowExecution(
                workflow_id=wf.id, workflow_name=wf.name, trigger_event=event_type,
                trigger_payload=envelope, triggered_by="event",
                steps_snapshot=wf.steps or [], status="pending",
            ))
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("emit_event(%s) failed", event_type)
