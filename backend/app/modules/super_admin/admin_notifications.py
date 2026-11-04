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

