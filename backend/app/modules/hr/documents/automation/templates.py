"""Organization wording for document notifications (ZHR-DOCS-ARCH-001 §15.3 Templates tab).

The platform wording (hr_notifications.EVENTS + the email layout) is the default. An org may override the subject and body
of an event, per channel (email / in_app). Overrides are PLAIN TEXT with `{{name}}` placeholders from a fixed list: no
template code runs, HTML is stripped, and an unknown placeholder is rejected when saving, so nothing an admin types can
reach another person's data or break the email layout.
"""
import re
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.core.html_sanitizer import html_to_text
from app.modules.hr.documents import errors
from app.modules.hr.documents.automation.models import NotificationTemplate

CHANNELS = ("email", "in_app")
VARIABLES = {
    "first_name": "The recipient's first name",
    "title": "The document or category name",
    "date": "The relevant date (expiry, due date)",
    "organization": "Your organization's name",
}
SAMPLE = {"first_name": "Asha", "title": "Passport", "date": "30 Nov 2026", "organization": "Acme Ltd"}
_PLACEHOLDER = re.compile(r"\{\{\s*([a-zA-Z_]+)\s*\}\}")
MAX_SUBJECT, MAX_BODY = 200, 4000


def catalog() -> list[dict]:
    """Every document event an org can reword, with the platform default."""
    from app.modules.hr.hr_notifications import EVENTS
    out = []
    for key, (_, heading, message) in EVENTS.items():
        if key.startswith("document."):
            out.append({"key": key, "default_subject": heading, "default_body": _to_placeholders(message)})
    return out


def _to_placeholders(text: str) -> str:
    return re.sub(r"\{(title|date)\}", r"{{\1}}", text)


def _keys() -> set:
    return {c["key"] for c in catalog()}


def validate(key: str, channel: str, subject: Optional[str], body: str) -> tuple[Optional[str], str]:
    if key not in _keys():
        raise errors.invalid("Unknown notification.", field="key")
    if channel not in CHANNELS:
        raise errors.invalid("Channel must be email or in_app.", field="channel")
    body = html_to_text(body or "").strip()
    subject = html_to_text(subject or "").strip() or None
    if not body:
        raise errors.invalid("Write the message.", field="body")
    if len(body) > MAX_BODY or (subject and len(subject) > MAX_SUBJECT):
        raise errors.invalid("The message is too long.", field="body")
    for text in (subject or "", body):
        unknown = {m for m in _PLACEHOLDER.findall(text) if m not in VARIABLES}
        if unknown:
            raise errors.invalid(f"Unknown placeholder: {', '.join(sorted(unknown))}.", field="body")
    return subject, body


def render(text: Optional[str], context: dict) -> Optional[str]:
    if text is None:
        return None
    return _PLACEHOLDER.sub(lambda m: str(context.get(m.group(1)) or ""), text)


def override(db: Session, organization_id: int, key: str, channel: str, locale: str = "en") -> Optional[NotificationTemplate]:
    try:
        return (db.query(NotificationTemplate)
                .filter(NotificationTemplate.organization_id == organization_id, NotificationTemplate.key == key,
                        NotificationTemplate.channel == channel, NotificationTemplate.locale == locale,
                        NotificationTemplate.is_active.is_(True)).first())
    except Exception:                                    # wording must never stop a notification
        return None


def list_templates(db: Session, organization_id: int) -> list[dict]:
    rows = {(r.key, r.channel): r for r in db.query(NotificationTemplate)
            .filter(NotificationTemplate.organization_id == organization_id, NotificationTemplate.locale == "en")}
    out = []
    for c in catalog():
        item = {**c, "overrides": {}}
        for ch in CHANNELS:
            r = rows.get((c["key"], ch))
            item["overrides"][ch] = ({"subject": r.subject, "body": r.body, "is_active": bool(r.is_active),
                                      "updated_at": r.updated_at.isoformat() if r.updated_at else None} if r else None)
        out.append(item)
    return out


def put(db: Session, actor, key: str, channel: str, subject: Optional[str], body: str) -> dict:
    from app.modules.hr.documents import audit_service
    subject, body = validate(key, channel, subject, body)
    org = actor.organization_id
    row = (db.query(NotificationTemplate).filter(NotificationTemplate.organization_id == org, NotificationTemplate.key == key,
                                                 NotificationTemplate.channel == channel, NotificationTemplate.locale == "en").first())
    if row is None:
        row = NotificationTemplate(organization_id=org, key=key, channel=channel, locale="en", body=body)
        db.add(row)
    row.subject, row.body, row.is_active, row.updated_by, row.updated_at = subject, body, True, actor.id, datetime.utcnow()
    db.flush()
    audit_service.record(db, org_id=org, actor=actor, action="notification_template_saved", target_type="notification_template",
                         target_id=row.id, after={"key": key, "channel": channel})
    db.commit()
    return {"key": key, "channel": channel, "subject": subject, "body": body}


def delete(db: Session, actor, key: str, channel: str) -> None:
    from app.modules.hr.documents import audit_service
    org = actor.organization_id
    q = db.query(NotificationTemplate).filter(NotificationTemplate.organization_id == org, NotificationTemplate.key == key,
                                              NotificationTemplate.channel == channel)
    row = q.first()
    if row is not None:
        row_id = row.id
        q.delete(synchronize_session=False)
        audit_service.record(db, org_id=org, actor=actor, action="notification_template_reverted",
                             target_type="notification_template", target_id=row_id, after={"key": key, "channel": channel})
        db.commit()


def preview(key: str, channel: str, subject: Optional[str], body: str) -> dict:
    subject, body = validate(key, channel, subject, body)
    return {"subject": render(subject, SAMPLE), "body": render(body, SAMPLE), "sample": SAMPLE}
