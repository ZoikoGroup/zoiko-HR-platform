"""The ONE place an organization is deleted or restored (ZHR-35).

Every entry point (Organizations page, Organization detail, User Management)
calls delete_organization(). It is a soft delete: nothing is removed, so
documents, invoices, refunds and audit logs are retained.

What a delete changes, in a single transaction:
  * organizations.deleted_at / deleted_by / delete_reason are set and
    is_active becomes False;
  * every member of the organization (Super Admins are never members) is
    deactivated, and password_changed_at is stamped so every token issued
    before now stops working (sessions and refresh tokens are revoked);
  * the ids of the users it deactivated are stored in deletion_snapshot, so a
    restore reactivates exactly those users and nobody who was already inactive;
  * an audit row is written.

Billing follows the existing cancel logic (billing.service.cancel_subscription is
a local status change, it never calls the payment provider): a paying (active or
past-due) subscription is moved to "cancel at period end" and its previous status
is stored in deletion_snapshot, so restore puts it back. Trials are left alone
(they end by themselves, with no charge), as are subscriptions that are already
suspended, canceled or terminated."""

from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException, NotFoundException
from app.modules.employee.models import Employee, UserRole
from app.modules.hr.models import Organization
from app.modules.super_admin.models import AuditAction, AuditLog

RESTORE_WINDOW_DAYS = 90
# Paying subscriptions are scheduled to cancel when their organization is deleted.
_CANCELLABLE = ("active", "past_due")
DELETED_ORG_MESSAGE = "This organization's account has been deactivated. Please contact support."


def org_names_by_id(db: Session, ids, *, include_deleted: bool = False) -> dict:
    """{organization id: display name} for just these ids (the orgs on the current page), selecting only the name columns.

    The name is what `Organization.name` returns (organization_name, else display_name, else ""). By default the global
    soft-delete filter applies, so a deleted org has no entry, exactly like the old `{o.id: o.name for o in
    db.query(Organization).all()}` maps this replaces. include_deleted=True keeps deleted orgs' names (history views)."""
    wanted = {i for i in ids if i is not None}
    if not wanted:
        return {}
    q = db.query(Organization.id, Organization.organization_name, Organization.display_name).filter(Organization.id.in_(wanted))
    if include_deleted:
        q = q.execution_options(include_deleted=True)
    return {oid: (oname or dname or "") for oid, oname, dname in q}


def is_deleted(db: Session, org_id: Optional[int]) -> bool:
    """True when the organization exists but is soft-deleted (used by login,
    token refresh and every authenticated request)."""
    if not org_id:
        return False
    deleted_at = (
        db.query(Organization.deleted_at).filter(Organization.id == org_id)
        .execution_options(include_deleted=True).scalar()
    )
    return deleted_at is not None


def visible_employees(db: Session, *entities):
    """Employees query that leaves out members of soft-deleted organizations
    (platform users with no organization, i.e. Super Admins, are kept). Use for
    platform-wide lists and counts so they match the Organizations page."""
    from sqlalchemy import or_

    q = db.query(*(entities or (Employee,)))
    return q.outerjoin(Organization, Organization.id == Employee.organization_id).filter(
        or_(Employee.organization_id.is_(None), Organization.id.isnot(None))
    )


def get_organization(db: Session, org_id: int, include_deleted: bool = True) -> Organization:
    q = db.query(Organization).filter(Organization.id == org_id)
    if include_deleted:
        q = q.execution_options(include_deleted=True)
    org = q.first()
    if org is None:
        raise NotFoundException("Organization", org_id)
    return org


def _members(db: Session, org_id: int):
    return db.query(Employee).filter(Employee.organization_id == org_id, Employee.role != UserRole.SUPER_ADMIN).all()


def _subscription(db: Session, org_id: int):
    from app.modules.billing.models import BillingSubscription

    return db.query(BillingSubscription).filter(BillingSubscription.organization_id == org_id).first()


def _status_value(sub) -> Optional[str]:
    v = getattr(sub.status, "value", sub.status) if sub is not None else None
    return str(v).lower() if v else None


def deletion_impact(db: Session, org_id: int) -> dict:
    """What deleting this organization would do, for the confirmation dialog."""
    org = get_organization(db, org_id)
    members = _members(db, org_id)
    subscription = None
    will_cancel = False
    try:
        sub = _subscription(db, org_id)
        if sub is not None:
            plan = getattr(sub.plan_code, "value", sub.plan_code)
            will_cancel = _status_value(sub) in _CANCELLABLE
            subscription = {"status": _status_value(sub), "plan": str(plan) if plan else None,
                            "will_be_scheduled_to_cancel": will_cancel}
    except Exception:  # impact is informational; never block the dialog on billing
        subscription = None
    return {
        "organization_id": org.id, "name": org.name, "already_deleted": org.deleted_at is not None,
        "users_total": len(members), "users_active": sum(1 for m in members if m.is_active),
        "subscription": subscription,
        "restore_window_days": RESTORE_WINDOW_DAYS,
        "effects": [
            "All of the organization's users lose access immediately and are signed out.",
            "The organization disappears from every list and from dashboard counts.",
            "Documents, invoices, refunds, audit logs and other records are kept.",
            f"A Super Admin can restore it within {RESTORE_WINDOW_DAYS} days.",
            ("The paid subscription is scheduled to cancel at the end of its period; restoring the organization undoes this."
             if will_cancel else "Its subscription (if any) is left as it is: trials end on their own and nothing is charged."),
        ],
    }


def _invalidate_entitlements(org_id: int) -> None:
    try:
        from app.modules.billing.entitlement_service import invalidate_entitlement_cache

        invalidate_entitlement_cache(org_id)
    except Exception:  # a cache problem must not undo a committed delete/restore
        pass


def delete_organization(db: Session, org_id: int, actor, confirm_name: Optional[str], reason: Optional[str] = None,
                        source: str = "organizations") -> Organization:
    org = get_organization(db, org_id)
    if org.deleted_at is not None:
        raise BadRequestException("This organization has already been deleted.")
    if (confirm_name or "").strip() != (org.name or "").strip():
        raise BadRequestException("Type the organization's exact name to confirm the deletion.")

    now = datetime.utcnow()
    deactivated = []
    members = _members(db, org.id)
    for m in members:
        if m.is_active:
            deactivated.append(m.id)
            m.is_active = False
        m.password_changed_at = now  # every earlier token (session or refresh) is now rejected
    snapshot = {
        "deactivated_user_ids": deactivated,
        "was_active": bool(org.is_active),
        "status": getattr(org.status, "value", str(org.status)),
        "subscription": None,
    }
    sub = _subscription(db, org.id)
    if sub is not None and _status_value(sub) in _CANCELLABLE:
        from app.modules.billing.models import BillingAuditAction, SubscriptionStatus
        from app.modules.billing.service import log_billing_audit

        snapshot["subscription"] = {"id": sub.id, "previous_status": _status_value(sub)}
        sub.status = SubscriptionStatus.CANCEL_AT_PERIOD_END
        log_billing_audit(
            db, actor=actor, organization_id=org.id, action=BillingAuditAction.SUBSCRIPTION_CANCELED,
            entity_type="BillingSubscription", entity_id=sub.id,
            before={"status": snapshot["subscription"]["previous_status"]}, after={"status": "cancel_at_period_end"},
            reason="Organization deleted", source="organization-delete", commit=False,
        )
    org.deletion_snapshot = snapshot
    org.is_active = False
    org.deleted_at, org.deleted_by = now, actor.id
    org.delete_reason = (reason or "").strip()[:1000] or None
    db.add(AuditLog(
        action=AuditAction.DELETE, entity_type="Organization", entity_id=org.id,
        performed_by=actor.id, performed_by_email=actor.email,
        details={"event": "organization.deleted", "name": org.name, "reason": org.delete_reason, "source": source,
                 "users_deactivated": len(deactivated), "users_total": len(members), "soft_delete": True,
                 "subscription_scheduled_to_cancel": snapshot["subscription"] is not None},
    ))
    db.commit()
    _invalidate_entitlements(org.id)
    return org


def restore_organization(db: Session, org_id: int, actor) -> Organization:
    org = get_organization(db, org_id)
    if org.deleted_at is None:
        raise BadRequestException("This organization is not deleted.")
    if datetime.utcnow() - org.deleted_at > timedelta(days=RESTORE_WINDOW_DAYS):
        raise BadRequestException(
            f"The {RESTORE_WINDOW_DAYS}-day restore window has passed. Contact engineering to recover this organization."
        )
    snapshot = org.deletion_snapshot or {}
    ids = snapshot.get("deactivated_user_ids") or []
    restored = 0
    if ids:
        for m in db.query(Employee).filter(Employee.id.in_(ids), Employee.organization_id == org.id).all():
            m.is_active = True  # sessions stay revoked: password_changed_at is untouched, users sign in again
            restored += 1
    org.is_active = bool(snapshot.get("was_active", True))
    reverted_subscription = False
    sub_info = snapshot.get("subscription")
    if sub_info:
        from app.modules.billing.models import BillingAuditAction, SubscriptionStatus
        from app.modules.billing.service import log_billing_audit

        sub = _subscription(db, org.id)
        # Only undo OUR change: if billing moved the subscription since, leave it alone.
        if sub is not None and _status_value(sub) == "cancel_at_period_end":
            sub.status = SubscriptionStatus(sub_info["previous_status"])
            reverted_subscription = True
            log_billing_audit(
                db, actor=actor, organization_id=org.id, action=BillingAuditAction.SUBSCRIPTION_REACTIVATED,
                entity_type="BillingSubscription", entity_id=sub.id,
                before={"status": "cancel_at_period_end"}, after={"status": sub_info["previous_status"]},
                reason="Organization restored", source="organization-restore", commit=False,
            )
    org.deleted_at = org.deleted_by = org.delete_reason = org.deletion_snapshot = None
    db.add(AuditLog(
        action=AuditAction.UPDATE, entity_type="Organization", entity_id=org.id,
        performed_by=actor.id, performed_by_email=actor.email,
        details={"event": "organization.restored", "name": org.name, "users_reactivated": restored,
                 "subscription_restored": reverted_subscription},
    ))
    db.commit()
    _invalidate_entitlements(org.id)
    return org
