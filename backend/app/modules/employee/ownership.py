"""Who a request may name, and whose records a caller may see.

One place for the rule every module needs when an `employee_id` arrives in a request body or query: the person must belong to
the caller's organization (and, for things handed to them, still be working there). A person in another organization, or an
id that does not exist, gets the same 404, so the answer never reveals whether someone exists elsewhere.

The visibility rule shared by the Learning, Travel and Assets modules:
  - admin tier (super_admin, admin, hr_admin): every record in the organization
  - manager: their own records and their direct reports' (Employee.reporting_manager_id == manager.id)
  - everyone else (employee, billing_admin, ...): their own records only
"""
from __future__ import annotations

from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.core.exceptions import ForbiddenException, NotFoundException
from app.modules.employee.models import Employee, EmployeeStatus, UserRole

ADMIN_ROLES = frozenset({UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR_ADMIN})

# A person can still be handed an asset, a course or a trip while they work here, are on leave, are about to start
# (pending: equipment is issued during onboarding) or must reset their password. Leavers and locked-out accounts cannot.
WORKING_STATUSES = frozenset({
    EmployeeStatus.ACTIVE, EmployeeStatus.ON_LEAVE, EmployeeStatus.PENDING, EmployeeStatus.PASSWORD_RESET_REQUIRED,
})

ADMIN_ONLY_MESSAGE = "Only an organization admin or HR admin can do this."


def _role(user) -> Optional[UserRole]:
    role = getattr(user, "role", None)
    try:
        return UserRole(getattr(role, "value", role))
    except ValueError:
        return None


def is_admin(user) -> bool:
    return _role(user) in ADMIN_ROLES


def is_manager(user) -> bool:
    return _role(user) == UserRole.MANAGER


def require_admin(user) -> None:
    if not is_admin(user):
        raise ForbiddenException(ADMIN_ONLY_MESSAGE)


def get_org_employee_or_404(db: Session, organization_id: Optional[int], employee_id: Optional[int], *,
                            active_only: bool = True) -> Employee:
    """The employee `employee_id` if they belong to `organization_id` (and are still working there when `active_only`),
    else 404. Another organization's employee and a made-up id look the same."""
    if employee_id is None or organization_id is None:
        raise NotFoundException("Employee", employee_id)
    employee = db.query(Employee).filter(Employee.id == employee_id, Employee.organization_id == organization_id).first()
    if employee is None:
        raise NotFoundException("Employee", employee_id)
    if active_only and _status(employee) not in WORKING_STATUSES:
        raise NotFoundException("Employee", employee_id)
    return employee


def _status(employee) -> Optional[EmployeeStatus]:
    status = getattr(employee, "status", None)
    try:
        return EmployeeStatus(getattr(status, "value", status))
    except ValueError:
        return None


def direct_report_ids(db: Session, manager) -> set[int]:
    rows = db.query(Employee.id).filter(Employee.reporting_manager_id == manager.id,
                                        Employee.organization_id == manager.organization_id).all()
    return {r[0] for r in rows}


def is_direct_report(db: Session, manager, employee_id: Optional[int]) -> bool:
    if employee_id is None or not is_manager(manager):
        return False
    return db.query(Employee.id).filter(Employee.id == employee_id, Employee.reporting_manager_id == manager.id,
                                        Employee.organization_id == manager.organization_id).first() is not None


def visible_employee_ids(db: Session, user) -> Optional[set[int]]:
    """None = no restriction (admin tier); otherwise the ids whose records `user` may see."""
    if is_admin(user):
        return None
    ids = {user.id}
    if is_manager(user):
        ids |= direct_report_ids(db, user)
    return ids


def can_see_employee(db: Session, user, employee_id: Optional[int]) -> bool:
    if is_admin(user):
        return True
    if employee_id is not None and employee_id == user.id:
        return True
    return is_direct_report(db, user, employee_id)


def scoped_employee_filter(db: Session, user, requested: Optional[int]) -> Optional[list[int]]:
    """The employee ids a list query must be limited to, or None for no limit.

    Admin tier: the requested employee (or everyone). Others: their visible set, narrowed to `requested` when given; asking
    for someone outside it returns an empty list rather than an error, so a list never confirms who exists."""
    visible = visible_employee_ids(db, user)
    if visible is None:
        return [requested] if requested else None
    if requested:
        return [requested] if requested in visible else []
    return sorted(visible)


def on_behalf_employee_id(user, requested: Optional[int]) -> int:
    """Who a self-service record (a trip, a claim, an enrollment) is for. Only the admin tier may name someone else."""
    if requested is None or requested == user.id:
        return user.id
    if not is_admin(user):
        raise ForbiddenException("You can only do this for yourself. An organization admin or HR admin can do it for someone else.")
    return requested


def filter_ids(query, column, ids: Optional[Iterable[int]]):
    """Apply a scoped_employee_filter() result to a query: None leaves it alone, [] matches nothing."""
    if ids is None:
        return query
    return query.filter(column.in_(list(ids)))          # an empty list matches nothing
