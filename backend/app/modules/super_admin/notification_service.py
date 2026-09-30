"""
modules/super_admin/notification_service.py
-------------------------------------------
Shared notification logic for ZHR-19 (Super Admin detail view) and ZHR-20
(recipient inbox in the Organization / User portals).

Scoping - the single place that decides who may see a notification
-------------------------------------------------------------------
A notification is visible to user U when ALL of these hold:
  * it is not ``system`` (internal Super Admin events are never delivered) and
    its status is ``sent``;
  * it was sent at or after U's account was created (no backlog for new joiners);
  * at least one of these audience rules matches:
      - ``target_type == "all"`` (broadcast to every non-super-admin user),
      - a ``user`` target equals U's id,
      - a ``role`` target equals U's role,
      - an ``org`` target equals U's organization AND (the notification's
        ``audience`` is ``all_members`` OR U holds an organization-admin role).
Super admins are never recipients. Everything is enforced in SQL on the server;
no id from the client is trusted. Read state is per recipient and lazy: a row in
``super_admin_notification_reads`` means "read"; no row means "unread".
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Iterable, Optional

from sqlalchemy import and_, delete, exists, func, insert, literal, not_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException, NotFoundException
from app.core.html_sanitizer import html_to_text, sanitize_html
from app.modules.employee.models import Employee, UserRole
from app.modules.hr.models import Organization
from app.modules.super_admin.models import (
    AuditAction,
    AuditLog,
    Notification,
    NotificationRead,
    NotificationTarget,
)

logger = logging.getLogger("zoiko.notifications")

ORG_ADMIN_ROLES = {UserRole.ADMIN.value, UserRole.HR_ADMIN.value, UserRole.BILLING_ADMIN.value}
RECIPIENT_ROLES = {r.value for r in UserRole if r != UserRole.SUPER_ADMIN}
ROLE_LABELS = {
    "admin": "Organization Admin",
    "hr_admin": "HR Admin",
    "billing_admin": "Billing Admin",
    "manager": "Manager",
    "employee": "Employee",
}
AUDIENCES = ("org_admins", "all_members")
DEFAULT_SENDER = "Zoiko HR Admin"
CONTENT_UNAVAILABLE = "Content not available for this notification"
PREVIEW_LENGTH = 140


def role_value(role) -> str:
    return role.value if hasattr(role, "value") else str(role)


def _sent_at():
    return func.coalesce(Notification.sent_at, Notification.created_at)


# ── Scoping ──────────────────────────────────────────────────────────────────

def _target_exists(kind: str, ref: str):
    return exists().where(
        NotificationTarget.notification_id == Notification.id,
        NotificationTarget.kind == kind,
        NotificationTarget.ref == ref,
    )


def visible_filter(user):
    """SQL condition: is this Notification row visible to ``user``?"""
    role = role_value(user.role)
    matches = [
        Notification.target_type == "all",
        _target_exists("user", str(user.id)),
        _target_exists("role", role),
    ]
    if user.organization_id is not None:
        org_match = _target_exists("org", str(user.organization_id))
        if role in ORG_ADMIN_ROLES:
            matches.append(org_match)
        else:
            matches.append(and_(org_match, Notification.audience == "all_members"))

    conditions = [
        Notification.target_type != "system",
        Notification.status == "sent",
        or_(*matches),
    ]
    if getattr(user, "created_at", None) is not None:
        conditions.append(_sent_at() >= user.created_at)
    return and_(*conditions)


def _read_exists(user):
    return exists().where(
        NotificationRead.notification_id == Notification.id,
        NotificationRead.user_id == user.id,
    )


def unread_count(db: Session, user) -> int:
    return int(
        db.query(func.count(Notification.id))
        .filter(visible_filter(user), not_(_read_exists(user)))
        .scalar() or 0
    )


def list_for_user(
    db: Session, user, *, unread_only: bool = False, page: int = 1, page_size: int = 20
) -> tuple[list[tuple[Notification, bool]], int]:
    """Newest first. Returns [(notification, is_read)], total matching the filter."""
    base = db.query(Notification).filter(visible_filter(user))
    if unread_only:
        base = base.filter(not_(_read_exists(user)))
    total = base.order_by(None).count()
    rows = (
        db.query(Notification, _read_exists(user).label("is_read_by_me"))
        .filter(visible_filter(user))
    )
    if unread_only:
        rows = rows.filter(not_(_read_exists(user)))
    rows = (
        rows.order_by(_sent_at().desc(), Notification.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return [(n, bool(r)) for n, r in rows], total


def get_for_user(db: Session, user, notification_id: int) -> tuple[Notification, bool]:
    """Fetch one notification in the user's scope. Anything else - missing OR out
    of scope - is the same 404, so existence is never revealed."""
    row = (
        db.query(Notification, _read_exists(user).label("is_read_by_me"))
        .filter(Notification.id == notification_id, visible_filter(user))
        .first()
    )
    if row is None:
        raise NotFoundException("Notification", notification_id)
    return row[0], bool(row[1])


def set_read(db: Session, user, notification_id: int, read: bool) -> None:
    notification, is_read = get_for_user(db, user, notification_id)
    if read and not is_read:
        try:
            db.add(NotificationRead(notification_id=notification.id, user_id=user.id, read_at=datetime.utcnow()))
            db.commit()
        except IntegrityError:  # concurrent request already recorded it - idempotent
            db.rollback()
    elif not read and is_read:
        db.execute(delete(NotificationRead).where(
            NotificationRead.notification_id == notification.id,
            NotificationRead.user_id == user.id,
        ))
        db.commit()


def mark_all_read(db: Session, user) -> int:
    """Mark every in-scope unread notification read for THIS user only, in one
    INSERT ... SELECT. Returns how many were newly marked."""
    pending = (
        select(Notification.id, literal(user.id), literal(datetime.utcnow()))
        .where(visible_filter(user), not_(_read_exists(user)))
    )
    try:
        result = db.execute(
            insert(NotificationRead).from_select(["notification_id", "user_id", "read_at"], pending)
        )
        db.commit()
        return int(result.rowcount or 0)
    except IntegrityError:  # raced with another request; state is already read
        db.rollback()
        return 0


# ── Content helpers ──────────────────────────────────────────────────────────

def content_available(n: Notification) -> bool:
    return bool((n.body_html or "").strip() or (n.message or "").strip())


def safe_body_html(n: Notification) -> str:
    """Sanitised HTML for display; plain-text messages are escaped into paragraphs."""
    if (n.body_html or "").strip():
        return sanitize_html(n.body_html)
    text = (n.message or "").strip()
    if not text:
        return ""
    paragraphs = [p for p in text.split("\n\n") if p.strip()]
    return "".join(f"<p>{sanitize_html_text(p)}</p>" for p in paragraphs)


def sanitize_html_text(text: str) -> str:
    from html import escape
    return escape(text, quote=False).replace("\n", "<br>")


def preview(n: Notification) -> str:
    text = (n.message or "").strip() or html_to_text(n.body_html)
    text = " ".join(text.split())
    return text if len(text) <= PREVIEW_LENGTH else text[: PREVIEW_LENGTH - 1].rstrip() + "…"


def sender_name(n: Notification) -> str:
    return n.sender_name or DEFAULT_SENDER


def sent_time(n: Notification) -> Optional[datetime]:
    return n.sent_at or n.created_at


# ── Targets: create / describe / count ──────────────────────────────────────

def _legacy_target_fields(data: dict) -> tuple[list[int], list[int]]:
    orgs = list(data.get("target_org_ids") or [])
    users = list(data.get("target_user_ids") or [])
    if data.get("target_org_id"):
        orgs.append(data["target_org_id"])
    if data.get("target_user_id"):
        users.append(data["target_user_id"])
    return sorted(set(orgs)), sorted(set(users))


def create_notification(db: Session, data: dict, actor) -> Notification:
    """Validate, sanitise and persist a notification (+ targets + audit) in one
    transaction. ``data`` carries the NotificationCreate fields."""
    title = (data.get("title") or "").strip()
    if not title:
        raise BadRequestException("Title is required.")

    body_html = sanitize_html(data.get("body_html"))
    message = (data.get("message") or "").strip() or html_to_text(body_html)
    if not message and not body_html:
        raise BadRequestException("A message is required.")

    audience = data.get("audience") or "org_admins"
    if audience not in AUDIENCES:
        raise BadRequestException(f"Audience must be one of: {', '.join(AUDIENCES)}.")

    org_ids, user_ids = _legacy_target_fields(data)
    roles = sorted({r.strip().lower() for r in (data.get("target_roles") or []) if r and r.strip()})

    bad_roles = [r for r in roles if r not in RECIPIENT_ROLES]
    if bad_roles:
        raise BadRequestException(
            f"Unknown or non-recipient role(s): {', '.join(bad_roles)}. "
            f"Valid roles: {', '.join(sorted(RECIPIENT_ROLES))}."
        )
    if org_ids:
        found = {i for (i,) in db.query(Organization.id).filter(Organization.id.in_(org_ids)).all()}
        if found != set(org_ids):
            raise BadRequestException(f"Organization(s) not found: {sorted(set(org_ids) - found)}.")
    if user_ids:
        found = {
            i for (i,) in db.query(Employee.id)
            .filter(Employee.id.in_(user_ids), Employee.role != UserRole.SUPER_ADMIN).all()
        }
        if found != set(user_ids):
            raise BadRequestException(
                f"User(s) not found or not eligible to receive notifications: {sorted(set(user_ids) - found)}."
            )

    requested_type = data.get("target_type")
    kinds = [k for k, v in (("organization", org_ids), ("user", user_ids), ("role", roles)) if v]
    if requested_type in ("organization", "user", "role") and not kinds:
        raise BadRequestException(f"Select at least one {requested_type} to send to.")
    if requested_type == "all" or not kinds:
        target_type = "all"
        org_ids, user_ids, roles = [], [], []
    else:
        target_type = kinds[0] if len(kinds) == 1 else "mixed"

    now = datetime.utcnow()
    notification = Notification(
        title=title,
        message=message,
        body_html=body_html or None,
        notification_type=data.get("notification_type") or "info",
        priority=data.get("priority") or "normal",
        sender_name=(data.get("sender_name") or "").strip() or DEFAULT_SENDER,
        channels=data.get("channels") or ["in_app"],
        target_type=target_type,
        audience=audience,
        status="sent",
        sent_at=now,
        created_by=getattr(actor, "id", None),
        created_at=now,
        # legacy mirror, so older readers of these columns keep working
        target_org_id=org_ids[0] if len(org_ids) == 1 else None,
        target_user_id=user_ids[0] if len(user_ids) == 1 else None,
    )
    notification.targets = (
        [NotificationTarget(kind="org", ref=str(i)) for i in org_ids]
        + [NotificationTarget(kind="user", ref=str(i)) for i in user_ids]
        + [NotificationTarget(kind="role", ref=r) for r in roles]
    )
    db.add(notification)
    db.flush()  # need the id for the audit row
    db.add(AuditLog(
        action=AuditAction.CREATE,
        entity_type="Notification",
        entity_id=notification.id,
        performed_by=getattr(actor, "id", None),
        performed_by_email=getattr(actor, "email", None),
        details={"title": title, "target_type": target_type, "audience": audience,
                 "orgs": org_ids, "users": user_ids, "roles": roles},
    ))
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(notification)
    return notification


def eligible_recipient_filter(n: Notification):
    """SQL condition over Employee: who is (currently) in this notification's audience.
    Mirrors ``visible_filter`` from the notification's side."""
    if n.target_type == "system" or n.status != "sent":
        return None
    base = [Employee.role != UserRole.SUPER_ADMIN, Employee.is_active.is_(True)]
    sent = sent_time(n)
    if sent is not None:
        base.append(or_(Employee.created_at.is_(None), Employee.created_at <= sent))
    if n.target_type == "all":
        return and_(*base)

    org_ids = [int(t.ref) for t in n.targets if t.kind == "org"]
    user_ids = [int(t.ref) for t in n.targets if t.kind == "user"]
    roles = [t.ref for t in n.targets if t.kind == "role"]
    parts = []
    if user_ids:
        parts.append(Employee.id.in_(user_ids))
    if roles:
        parts.append(Employee.role.in_([UserRole(r) for r in roles if r in RECIPIENT_ROLES]))
    if org_ids:
        org_part = Employee.organization_id.in_(org_ids)
        if n.audience != "all_members":
            org_part = and_(org_part, Employee.role.in_([UserRole(r) for r in ORG_ADMIN_ROLES]))
        parts.append(org_part)
    if not parts:
        return None
    return and_(*base, or_(*parts))


def recipient_stats(db: Session, n: Notification) -> dict:
    condition = eligible_recipient_filter(n)
    if condition is None:
        return {"recipient_count": 0, "read_count": 0, "unread_count": 0, "delivered_to_inbox": False}
    recipients = int(db.query(func.count(Employee.id)).filter(condition).scalar() or 0)
    read = int(
        db.query(func.count(NotificationRead.id))
        .join(Employee, Employee.id == NotificationRead.user_id)
        .filter(NotificationRead.notification_id == n.id, condition)
        .scalar() or 0
    )
    return {
        "recipient_count": recipients,
        "read_count": read,
        "unread_count": max(recipients - read, 0),
        "delivered_to_inbox": True,
    }


def describe_targets(db: Session, notifications: Iterable[Notification]) -> dict[int, dict]:
    """Readable audience per notification, resolved in batch:
    {id: {"summary": "Acme Ltd, Globex", "targets": [{"kind","ref","label"}]}}."""
    notifications = list(notifications)
    org_ids, user_ids = set(), set()
    for n in notifications:
        for t in n.targets:
            (org_ids if t.kind == "org" else user_ids if t.kind == "user" else set()).add(t.ref)
    org_names = {}
    if org_ids:
        org_names = {str(o.id): (o.name or f"Organization #{o.id}")
                     for o in db.query(Organization).filter(Organization.id.in_([int(i) for i in org_ids])).all()}
    user_names = {}
    if user_ids:
        user_names = {
            str(e.id): (f"{e.first_name or ''} {e.last_name or ''}".strip() or e.email)
            for e in db.query(Employee).filter(Employee.id.in_([int(i) for i in user_ids])).all()
        }

    result = {}
    for n in notifications:
        targets = []
        for t in n.targets:
            if t.kind == "org":
                label = org_names.get(t.ref, f"Deleted organization #{t.ref}")
            elif t.kind == "user":
                label = user_names.get(t.ref, f"Deleted user #{t.ref}")
            else:
                label = f"Role: {ROLE_LABELS.get(t.ref, t.ref)}"
            targets.append({"kind": t.kind, "ref": t.ref, "label": label})
        if n.target_type == "all":
            summary = "All users"
        elif n.target_type == "system":
            summary = "Internal event (Super Admin only)"
        else:
            orgs = [t["label"] for t in targets if t["kind"] == "org"]
            others = [t["label"] for t in targets if t["kind"] != "org"]
            parts = list(others)
            if orgs:
                who = "all members" if n.audience == "all_members" else "org admins only"
                parts.insert(0, f"{', '.join(orgs)} ({who})")
            summary = "; ".join(parts) if parts else "No audience"
        result[n.id] = {"summary": summary, "targets": targets}
    return result
