"""
modules/assistant/scope_service.py
--------------------------------------
Manager/delegated-scope resolution (AI Guardrail spec Section 14; UI/UX spec
WF-09). Authorization is always resolved server-side against the reporting
relationship — a client-supplied subject id is never trusted on its own,
and a denied lookup never reveals whether the subject exists.
"""

from sqlalchemy.orm import Session

from app.core.exceptions import ForbiddenException
from app.modules.employee.models import Employee, UserRole

_SCOPE_OVERRIDE_ROLES = {UserRole.ADMIN, UserRole.HR_ADMIN, UserRole.SUPER_ADMIN}


def get_team_members(db: Session, manager: Employee) -> list[Employee]:
    """Direct reports only (WF-09: 'no inferred access beyond the authorized
    team graph'). Admin/HR admin roles do not get every employee here —
    this endpoint is specifically the manager's own reporting line; broader
    org-wide employee browsing already exists in the HR admin module."""
    return (
        db.query(Employee)
        .filter(Employee.reporting_manager_id == manager.id, Employee.organization_id == manager.organization_id)
        .order_by(Employee.first_name)
        .all()
    )


def resolve_authorized_subject(db: Session, actor: Employee, subject_employee_id: int | None) -> Employee:
    """Returns the Employee the turn should be answered about. Defaults to
    the acting user (self-scope). If a subject is requested, fail closed:
    the actor must either directly manage that employee, or hold an
    admin-tier role within the same organization. A denied lookup raises
    the same generic error regardless of whether the subject exists, to
    avoid leaking existence across scope."""
    if subject_employee_id is None or subject_employee_id == actor.id:
        return actor

    subject = (
        db.query(Employee)
        .filter(Employee.id == subject_employee_id, Employee.organization_id == actor.organization_id)
        .first()
    )
    role_val = actor.role.value if hasattr(actor.role, "value") else str(actor.role)
    is_direct_report = subject is not None and subject.reporting_manager_id == actor.id
    is_org_admin = role_val in {r.value for r in _SCOPE_OVERRIDE_ROLES}

    if subject is None or not (is_direct_report or is_org_admin):
        raise ForbiddenException("This information is not available in your current scope.")

    return subject
