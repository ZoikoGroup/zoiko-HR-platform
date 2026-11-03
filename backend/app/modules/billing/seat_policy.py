"""
modules/billing/seat_policy.py
------------------------------
How many people an organization's plan lets it have on the platform (its seats). A Product decision, enforced here:

  Core        50 seats
  Advanced    250 seats
  Evaluation  250 seats (a trial previews Advanced, as in country_policy)
  Enterprise  no limit (contract-priced, set per contract)
  no plan     no limit (nothing has been bought yet; same rule the other plan gates use for "not configured")

A seat is an Employee row of the organization that is enabled (is_active) and not in a former status (terminated,
resigned, inactive, deactivated, archived). Every role counts, admins included: a seat is a person who can use the
platform. Invited (pending) people count, so inviting cannot be used to get past the limit.

Enforced in two layers:
  1. Explicit checks where people are added or reactivated (create, invite, import, activate), so the caller gets the
     refusal before anything else happens (no welcome e-mail for someone who was never created).
  2. A before_flush guard on every Session (install(), wired in app/database.py), so no other code path can add a seat
     past the limit: any new Employee, or any existing one moving into a seat, is counted at flush time against the
     database under a row lock on the organization's subscription, so two concurrent adds cannot both take the last seat.

Existing data is never touched: an organization already over its limit (data from before this rule, or a downgrade
the blocker allowed) keeps everyone and can edit them; it just cannot add anyone until it is back under the limit.
A move to a plan with fewer seats than the organization uses is refused (downgrade_blockers.check_seat_blocker,
check_plan_fits for checkout and conversion).
"""
from __future__ import annotations

import logging
from collections import defaultdict
from typing import Optional

from sqlalchemy import event, inspect as sa_inspect
from sqlalchemy.orm import Session

from app.core.exceptions import ZoikoException

logger = logging.getLogger("zoiko.billing.seats")

PLAN_SEAT_LIMITS: dict[str, int] = {"core": 50, "advanced": 250}
_PREVIEW_PLAN = {"evaluation": "advanced"}

# Statuses that free the seat (same set country_policy treats as former).
FORMER_STATUSES = frozenset({"terminated", "resigned", "inactive", "deactivated", "archived"})

UPGRADE_HINT = "Remove or deactivate people you no longer need, or upgrade your plan in Billing & Plan."


class SeatLimitExceeded(ZoikoException):
    def __init__(self, message: str):
        super().__init__(status_code=400, error_code="PLAN_SEAT_LIMIT", message=message)


def _status_value(status) -> str:
    return str(getattr(status, "value", status) or "").lower()


def occupies_seat(status, is_active) -> bool:
    """True when a person with this status / enabled flag takes a seat. A missing status means the model default
    (active); a missing is_active means enabled."""
    if is_active is False:
        return False
    return _status_value(status) not in FORMER_STATUSES


def plan_of(db: Session, organization_id: int) -> Optional[str]:
    from app.modules.billing import country_policy
    return country_policy.plan_of(db, organization_id)


def seat_limit(db: Session, organization_id: Optional[int], plan: Optional[str] = None) -> Optional[int]:
    """The organization's seat limit, or None for no limit. `plan` overrides the current plan (a move target)."""
    if organization_id is None:
        return None
    plan = plan if plan is not None else plan_of(db, organization_id)
    plan = str(getattr(plan, "value", plan) or "").lower()
    return PLAN_SEAT_LIMITS.get(_PREVIEW_PLAN.get(plan, plan))


def seats_in_use(db: Session, organization_id: int) -> int:
    from app.modules.employee.models import Employee
    rows = (
        db.query(Employee.status, Employee.is_active)
        .filter(Employee.organization_id == organization_id)
        .all()
    )
    return sum(1 for status, is_active in rows if occupies_seat(status, is_active))


def _plan_label(db: Session, organization_id: int, plan: Optional[str] = None) -> str:
    plan = plan if plan is not None else plan_of(db, organization_id)
    plan = str(getattr(plan, "value", plan) or "").lower()
    return "evaluation (Advanced preview)" if plan == "evaluation" else plan.title()


def _refusal(db: Session, organization_id: int, limit: int, in_use: int, adding: int) -> str:
    label = _plan_label(db, organization_id)
    if adding == 1:
        what = "One more person cannot be added"
    else:
        what = f"{adding} more people cannot be added"
    return (f"{what}: your {label} plan includes {limit} users and {in_use} are in use. {UPGRADE_HINT}")


def check_can_add(db: Session, organization_id: Optional[int], adding: int = 1) -> None:
    """Refuse adding `adding` seats when it would take the organization past its plan's limit."""
    if organization_id is None or adding <= 0:
        return
    limit = seat_limit(db, organization_id)
    if limit is None:
        return
    in_use = seats_in_use(db, organization_id)
    if in_use + adding > limit:
        raise SeatLimitExceeded(_refusal(db, organization_id, limit, in_use, adding))


def seat_refusal(db: Session, organization_id: Optional[int], adding: int = 1) -> Optional[str]:
    """check_can_add as a message (None = allowed), for per-row reporting such as an import."""
    try:
        check_can_add(db, organization_id, adding)
    except SeatLimitExceeded as e:
        return e.message
    return None


def usage(db: Session, organization_id: int) -> dict:
    """What the organization pages show: {plan, seat_limit (None = unlimited), seats_used, seats_remaining}."""
    limit = seat_limit(db, organization_id)
    used = seats_in_use(db, organization_id)
    return {
        "plan": plan_of(db, organization_id),
        "seat_limit": limit,
        "seats_used": used,
        "seats_remaining": None if limit is None else max(0, limit - used),
    }


def downgrade_refusal(db: Session, organization_id: int, target_plan) -> Optional[str]:
    """Why the organization cannot move to `target_plan` with the people it has now (None = it can)."""
    limit = seat_limit(db, organization_id, plan=target_plan)
    if limit is None:
        return None
    in_use = seats_in_use(db, organization_id)
    if in_use <= limit:
        return None
    label = _plan_label(db, organization_id, target_plan)
    return (f"The {label} plan includes {limit} users, but your organization has {in_use}. "
            f"Remove or deactivate {in_use - limit} before moving to {label}.")


def check_plan_fits(db: Session, organization_id: int, target_plan) -> None:
    """Refuse a purchase, conversion or plan assignment whose seat limit is below what the organization uses."""
    message = downgrade_refusal(db, organization_id, target_plan)
    if message:
        raise SeatLimitExceeded(message)


# ── Session guard: no code path adds a seat past the limit ─────────────────────

_SEAT_ATTRS = ("organization_id", "status", "is_active")


def _stored_seat_values(session: Session, employees) -> dict:
    """{id: (organization_id, status, is_active)} as the database has them. Read from the database rather than from
    attribute history: after a commit the attributes are expired, so setting one records no old value."""
    from app.modules.employee.models import Employee
    ids = [e.id for e in employees if e.id is not None]
    if not ids:
        return {}
    rows = session.query(Employee.id, Employee.organization_id, Employee.status, Employee.is_active).filter(Employee.id.in_(ids)).all()
    return {r[0]: (r[1], r[2], r[3]) for r in rows}


def _tenant_fallback() -> Optional[int]:
    try:
        from app.core.privacy import context as ctx
        c = ctx.current()
        return getattr(c, "tenant_id", None) if c is not None else None
    except Exception:
        return None


def _seat_changes(session: Session) -> dict[int, int]:
    """Net seats each organization gains in this flush."""
    from app.modules.employee.models import Employee

    net: dict[int, int] = defaultdict(int)
    for obj in session.new:
        if isinstance(obj, Employee) and occupies_seat(obj.status, obj.is_active):
            org = obj.organization_id or _tenant_fallback()
            if org is not None:
                net[org] += 1
    changed = [
        obj for obj in session.dirty
        if isinstance(obj, Employee) and sa_inspect(obj).persistent
        and any(sa_inspect(obj).attrs[a].history.added for a in _SEAT_ATTRS)
    ]
    deleted = [obj for obj in session.deleted if isinstance(obj, Employee)]
    if changed or deleted:
        with session.no_autoflush:
            stored = _stored_seat_values(session, changed + deleted)
        for obj in changed:
            if obj.id not in stored:
                continue
            old_org, old_status, old_active = stored[obj.id]
            if occupies_seat(old_status, old_active) and old_org is not None:
                net[old_org] -= 1
            if occupies_seat(obj.status, obj.is_active) and obj.organization_id is not None:
                net[obj.organization_id] += 1
        for obj in deleted:
            if obj.id in stored:
                old_org, old_status, old_active = stored[obj.id]
                if occupies_seat(old_status, old_active) and old_org is not None:
                    net[old_org] -= 1
    return {org: n for org, n in net.items() if n > 0}


def _lock_subscription(session: Session, organization_id: int) -> None:
    """Serialize seat additions per organization (Postgres row lock; a no-op on SQLite)."""
    from app.modules.billing.models import BillingSubscription
    session.query(BillingSubscription.id).filter(
        BillingSubscription.organization_id == organization_id
    ).with_for_update().first()


def _guard_flush(session: Session, _flush_context, _instances) -> None:
    gains = _seat_changes(session)
    if not gains:
        return
    with session.no_autoflush:
        for org, adding in gains.items():
            limit = seat_limit(session, org)
            if limit is None:
                continue
            _lock_subscription(session, org)
            in_use = seats_in_use(session, org)  # database state: this flush's changes are not in it yet
            if in_use + adding > limit:
                logger.info("seat limit refused: org=%s limit=%s in_use=%s adding=%s", org, limit, in_use, adding)
                raise SeatLimitExceeded(_refusal(session, org, limit, in_use, adding))


_installed = False


def install() -> None:
    global _installed
    if _installed:
        return
    event.listen(Session, "before_flush", _guard_flush)
    _installed = True
