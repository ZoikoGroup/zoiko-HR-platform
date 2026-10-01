"""Super Admin > Workflows > Activity (ZHR-36).

One read-only feed of what people did inside EVERY organization, served from the
platform audit ledger (rows written by activity_service.record_activity).
Super Admin only: the router-level dependency rejects everyone else with 403.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_super_admin
from app.core.exceptions import BadRequestException, NotFoundException
from app.database import get_db
from app.modules.hr.models import Organization
from app.modules.super_admin import activity_service
from app.modules.super_admin.models import AuditLog

router = APIRouter(
    prefix="/super-admin/activity", tags=["Super Admin Activity"],
    dependencies=[Depends(get_current_super_admin)],
)

STATUSES = ("success", "failed")
MAX_PAGE_SIZE = 100


def _utc_naive(value: Optional[datetime]) -> Optional[datetime]:
    """The ledger stores naive UTC; accept any ISO datetime and normalise it."""
    if value is None:
        return None
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _types_in_group(group: str) -> list:
    return [k for k, (_v, g, _p) in activity_service.ACTION_CATALOG.items() if g.lower() == group.lower()]


def _org_names(db: Session, ids) -> dict:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    rows = (
        db.query(Organization).filter(Organization.id.in_(ids)).execution_options(include_deleted=True).all()
    )
    return {o.id: (o.organization_name or o.display_name or o.name) for o in rows}


def _activity_rows(db: Session):
    # Only organization activity: platform-level ledger rows (no action_type) live on the Audit Logs page.
    return db.query(AuditLog).filter(AuditLog.action_type.isnot(None))


@router.get("")
def list_events(
    organization_id: Optional[int] = Query(None, description="0 = events with no organization"),
    action_type: Optional[str] = Query(None, description="One or more action types, comma-separated"),
    action_group: Optional[str] = Query(None, description="Employee | Leave | Payroll | Settings | User"),
    actor_id: Optional[int] = None,
    actor: Optional[str] = Query(None, max_length=200, description="Actor name or email contains"),
    status: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    q: Optional[str] = Query(None, max_length=200, description="Search target, actor or organization"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE),
    db: Session = Depends(get_db),
):
    if status and status not in STATUSES:
        raise BadRequestException("status must be one of: " + ", ".join(STATUSES) + ".")
    query = _activity_rows(db)
    if organization_id is not None:
        query = query.filter(AuditLog.organization_id.is_(None) if organization_id == 0
                             else AuditLog.organization_id == organization_id)
    types = [t.strip() for t in (action_type or "").split(",") if t.strip()]
    if action_group:
        group_types = _types_in_group(action_group)
        if not group_types:
            raise BadRequestException(f"Unknown action group '{action_group}'.")
        types = [t for t in types if t in group_types] if types else group_types
        if not types:  # an action_type outside the chosen group matches nothing
            query = query.filter(AuditLog.id == -1)
    if types:
        query = query.filter(AuditLog.action_type.in_(types))
    if actor_id:
        query = query.filter(AuditLog.performed_by == actor_id)
    if actor and actor.strip():
        like = f"%{actor.strip().lower()}%"
        query = query.filter(or_(func.lower(func.coalesce(AuditLog.actor_name, "")).like(like),
                                 func.lower(func.coalesce(AuditLog.performed_by_email, "")).like(like)))
    if status:
        query = query.filter(AuditLog.status == status)
    start, end = _utc_naive(date_from), _utc_naive(date_to)
    if start:
        query = query.filter(AuditLog.created_at >= start)
    if end:
        query = query.filter(AuditLog.created_at <= end)
    term = (q or "").strip().lower()
    if term:
        like = f"%{term}%"
        matching_orgs = [
            o.id for o in db.query(Organization).filter(
                or_(func.lower(func.coalesce(Organization.organization_name, "")).like(like),
                    func.lower(func.coalesce(Organization.display_name, "")).like(like))
            ).execution_options(include_deleted=True).all()
        ]
        conds = [func.lower(func.coalesce(AuditLog.target_label, "")).like(like),
                 func.lower(func.coalesce(AuditLog.actor_name, "")).like(like),
                 func.lower(func.coalesce(AuditLog.performed_by_email, "")).like(like)]
        if matching_orgs:
            conds.append(AuditLog.organization_id.in_(matching_orgs))
        query = query.filter(or_(*conds))

    total = query.count()
    rows = (query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .offset((page - 1) * page_size).limit(page_size).all())
    names = _org_names(db, [r.organization_id for r in rows])
    return {"total": total, "page": page, "page_size": page_size,
            "events": [activity_service.event_view(db, r, names) for r in rows]}


@router.get("/filters")
def filter_options(db: Session = Depends(get_db)):
    """Everything the filter bar needs. Organizations are ALL live organizations
    (not only ones that already have activity) plus any that appear in the feed."""
    live = db.query(Organization).order_by(Organization.id).all()
    orgs = {o.id: (o.organization_name or o.display_name or o.name) for o in live}
    seen = [r[0] for r in db.query(AuditLog.organization_id).filter(
        AuditLog.action_type.isnot(None), AuditLog.organization_id.isnot(None)).distinct().all()]
    for oid, name in _org_names(db, [i for i in seen if i not in orgs]).items():
        orgs[oid] = f"{name} (deleted)"
    actors = (
        db.query(AuditLog.performed_by, AuditLog.actor_name, AuditLog.actor_role)
        .filter(AuditLog.action_type.isnot(None), AuditLog.performed_by.isnot(None))
        .distinct().limit(500).all()
    )
    seen_actor, actor_list = set(), []
    for pid, name, role in actors:
        if pid in seen_actor:
            continue
        seen_actor.add(pid)
        actor_list.append({"id": pid, "name": name or f"User {pid}", "role": role,
                           "role_label": activity_service.role_label(role) if role else None})
    actor_list.sort(key=lambda a: a["name"].lower())
    return {
        "organizations": [{"id": i, "name": n} for i, n in sorted(orgs.items(), key=lambda kv: kv[1].lower())],
        "action_types": [{"key": k, "label": v[0], "group": v[1]} for k, v in activity_service.ACTION_CATALOG.items()],
        "action_groups": activity_service.action_groups(),
        "actors": actor_list,
        "statuses": list(STATUSES),
    }


@router.get("/{event_id}")
def get_event(event_id: int, db: Session = Depends(get_db)):
    row = _activity_rows(db).filter(AuditLog.id == event_id).first()
    if row is None:
        raise NotFoundException("Activity event", event_id)
    return activity_service.event_view(db, row, _org_names(db, [row.organization_id]))
