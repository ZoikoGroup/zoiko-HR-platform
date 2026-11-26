"""Organization › "View audit log" (QA bug 29): what people did inside the caller's own organisation.

    GET /hr/organization/audit-log          the organisation's activity, newest first (organisation admins only)

Served from the same ledger as the platform's Activity page (super_admin.activity_service.record_activity), but scoped to
the caller's organisation, which may see its own people's names and the fields they changed. IP addresses and the raw
internal details are left out.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_org_admin
from app.core.exceptions import BadRequestException
from app.database import get_db
from app.modules.super_admin import activity_service
from app.modules.super_admin.models import AuditLog

router = APIRouter(prefix="/hr/organization", tags=["Organization audit log"])
MAX_PAGE_SIZE = 100


def _utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is not None and value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _view(db: Session, row: AuditLog, names: dict) -> dict:
    out = activity_service.event_view(db, row, names)
    out.pop("ip_address", None)
    out.pop("details", None)
    out.pop("actor_id", None)
    return out


@router.get("/audit-log", summary="What people did inside this organisation (organisation admins)")
def audit_log(
    action_group: Optional[str] = Query(None, description="Employee | Leave | Payroll | Settings | User | Other"),
    status: Optional[str] = Query(None, pattern="^(success|failed)$"),
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    q: Optional[str] = Query(None, max_length=200, description="Search the person or the record"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=MAX_PAGE_SIZE),
    db: Session = Depends(get_db),
    user=Depends(get_current_org_admin),
):
    org_id = getattr(user, "organization_id", None)
    if not org_id:
        raise BadRequestException("This page shows an organisation's own log. Sign in as an organisation admin.")
    query = db.query(AuditLog).filter(AuditLog.organization_id == org_id, AuditLog.action_type.isnot(None))
    if action_group:
        types = [k for k, (_v, g, _p) in activity_service.ACTION_CATALOG.items() if g.lower() == action_group.lower()]
        if not types:
            raise BadRequestException(f"Unknown area '{action_group}'.")
        query = query.filter(AuditLog.action_type.in_(types))
    if status:
        query = query.filter(AuditLog.status == status)
    start, end = _utc(date_from), _utc(date_to)
    if start:
        query = query.filter(AuditLog.created_at >= start)
    if end:
        query = query.filter(AuditLog.created_at <= end)
    term = (q or "").strip()
    if term:
        like = f"%{term}%"
        query = query.filter(or_(AuditLog.actor_name.ilike(like), AuditLog.performed_by_email.ilike(like),
                                 AuditLog.target_label.ilike(like)))
    total = query.count()
    rows = (query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .offset((page - 1) * page_size).limit(page_size).all())
    return {"total": total, "page": page, "page_size": page_size,
            "areas": [g["key"] for g in activity_service.action_groups()],
            "events": [_view(db, r, {}) for r in rows]}
