"""
modules/super_admin/notification_router.py
------------------------------------------
Recipient-side notification endpoints (ZHR-20) for Organization and User portals.

Every endpoint derives the audience from the authenticated user - never from
request parameters - via notification_service's single scoping query. A
notification outside the caller's scope is indistinguishable from a missing one
(404), so its existence is never revealed. Super admins are not recipients.
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.core.exceptions import ForbiddenException
from app.database import get_db
from app.modules.super_admin import notification_service as svc

recipient_router = APIRouter(prefix="/notifications", tags=["Notifications"])


def get_notification_recipient(current_user=Depends(get_current_user)):
    if svc.role_value(current_user.role) == "super_admin":
        raise ForbiddenException(
            "Super admins manage notifications from the Notification Center; they are not recipients."
        )
    return current_user


def _summary_item(n, is_read: bool) -> dict:
    return {
        "id": n.id,
        "title": n.title,
        "preview": svc.preview(n),
        "sender_name": svc.sender_name(n),
        "notification_type": n.notification_type,
        "priority": n.priority,
        "sent_at": svc.sent_time(n),
        "is_read": is_read,
    }


def _detail_item(n, is_read: bool) -> dict:
    item = _summary_item(n, is_read)
    item.update({
        "body_html": svc.safe_body_html(n),
        "content_available": svc.content_available(n),
        "content_unavailable_message": None if svc.content_available(n) else svc.CONTENT_UNAVAILABLE,
    })
    return item


@recipient_router.get("", summary="My notifications (newest first)")
def list_my_notifications(
    filter: str = Query("all", pattern="^(all|unread)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user=Depends(get_notification_recipient),
):
    rows, total = svc.list_for_user(db, user, unread_only=(filter == "unread"), page=page, page_size=page_size)
    return {
        "items": [_summary_item(n, r) for n, r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
        "unread_count": svc.unread_count(db, user),
    }


@recipient_router.get("/unread-count", summary="Unread badge count (polled)")
def my_unread_count(db: Session = Depends(get_db), user=Depends(get_notification_recipient)):
    return {"unread_count": svc.unread_count(db, user)}


@recipient_router.post("/read-all", summary="Mark all of my notifications as read")
def read_all(db: Session = Depends(get_db), user=Depends(get_notification_recipient)):
    updated = svc.mark_all_read(db, user)
    return {"updated": updated, "unread_count": svc.unread_count(db, user)}


@recipient_router.get("/{notification_id}", summary="Open a notification (marks it read)")
def open_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_notification_recipient),
):
    svc.get_for_user(db, user, notification_id)        # 404 when out of scope
    svc.set_read(db, user, notification_id, True)      # idempotent
    n, is_read = svc.get_for_user(db, user, notification_id)
    return {**_detail_item(n, is_read), "unread_count": svc.unread_count(db, user)}


@recipient_router.post("/{notification_id}/read", summary="Mark as read")
def mark_read(notification_id: int, db: Session = Depends(get_db), user=Depends(get_notification_recipient)):
    svc.set_read(db, user, notification_id, True)
    return {"id": notification_id, "is_read": True, "unread_count": svc.unread_count(db, user)}


@recipient_router.post("/{notification_id}/unread", summary="Mark as unread")
def mark_unread(notification_id: int, db: Session = Depends(get_db), user=Depends(get_notification_recipient)):
    svc.set_read(db, user, notification_id, False)
    return {"id": notification_id, "is_read": False, "unread_count": svc.unread_count(db, user)}
