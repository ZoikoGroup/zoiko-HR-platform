"""
modules/super_admin/admin_notifications.py
------------------------------------------
Helper functions to create in-app notifications for organization admins
(admin, hr_admin, billing_admin) when key actions happen in the platform.

Usage:
    from app.modules.super_admin.admin_notifications import notify_org_admins

    notify_org_admins(
        db, org_id=current_user.organization_id,
        title="Leave Request Approved",
        message="John Doe's leave from 15 Jan to 20 Jan has been approved.",
        notification_type="leave",
    )
"""
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.modules.super_admin.models import Notification, NotificationTarget


def notify_org_admins(
    db: Session,
    *,
    org_id: int,
    title: str,
    message: str,
    notification_type: str = "info",
    priority: str = "normal",
    sender_name: str = "Zoiko HR",
) -> Notification:
    """Create a notification visible to all org-admin-level users of an organization.

    This creates a single ``Notification`` row with ``target_type="organization"``
    and ``audience="org_admins"`` plus a ``NotificationTarget(kind="org", ref=org_id)``.
    The existing ``visible_filter()`` in ``notification_service.py`` will resolve
    who can see it (admin / hr_admin / billing_admin roles in that organization).
    """
    now = datetime.now(timezone.utc)
    notification = Notification(
        title=title,
        message=message,
        notification_type=notification_type,
        priority=priority,
        sender_name=sender_name,
        target_type="organization",
        audience="org_admins",
        status="sent",
        sent_at=now,
        channels=["in_app"],
    )
    notification.targets = [
        NotificationTarget(kind="org", ref=str(org_id)),
    ]
    db.add(notification)
    db.flush()  # so the caller can read notification.id if needed
    return notification



def notify_users(
    db: Session,
    *,
    org_id: int,
    user_ids,
    title: str,
    message: str,
    notification_type: str = "info",
    priority: str = "normal",
    link: str | None = None,
    sender_name: str = "Zoiko HR",
):
    """Create ONE notification visible only to the given people (A5).

    ``user_ids`` are login ids, which in this codebase are ``employees.id`` (an Employee row is the account). People who
    cannot sign in (inactive, not in ``org_id``, unknown ids) are skipped and logged at info level with ids only, so a
    notification never reaches someone outside the organization. Returns the Notification, or None when nobody is left.
    The caller commits (so the notification lands in the same transaction as the action where possible).
    """
    import logging

    from app.modules.employee.models import Employee

    log = logging.getLogger("zoiko.notifications")
    wanted = sorted({int(u) for u in (user_ids or []) if u is not None})
    if not wanted:
        return None
    rows = db.query(Employee.id, Employee.organization_id, Employee.is_active).filter(Employee.id.in_(wanted)).all()
    allowed = [r.id for r in rows if r.organization_id == org_id and r.is_active is not False]
    skipped = sorted(set(wanted) - set(allowed))
    if skipped:
        log.info("notification %r: skipped recipients without an active login in org %s: %s", notification_type, org_id, skipped)
    if not allowed:
        return None
    if link is not None and not str(link).startswith("/"):
        link = None                                    # in-app paths only, never an external URL
    notification = Notification(
        title=title[:300],
        message=message,
        notification_type=notification_type,
        priority=priority,
        sender_name=sender_name,
        target_type="user",
        audience="org_admins",
        status="sent",
        sent_at=datetime.now(timezone.utc),
        channels=["in_app"],
        target_org_id=org_id,
        link=link,
    )
    notification.targets = [NotificationTarget(kind="user", ref=str(uid)) for uid in allowed]
    db.add(notification)
    db.flush()
    return notification


def org_admin_user_ids(db: Session, org_id: int, roles=("admin", "hr_admin")) -> list[int]:
    """Active admin / HR admin logins of one organization (the HR side of an approval)."""
    from app.modules.employee.models import Employee, UserRole

    values = [UserRole(r) for r in roles]
    return [r.id for r in db.query(Employee.id).filter(
        Employee.organization_id == org_id, Employee.role.in_(values), Employee.is_active.isnot(False)).all()]
