"""Single source of truth for user roles (ZHR-32).

Which roles exist, how they are described, whether they belong to the platform
or to an organization, and which roles each caller may assign. The frontend
reads this through GET /hr/admin/roles instead of keeping its own list."""

from typing import List, Optional

from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException, ForbiddenException
from app.modules.employee.models import UserRole

PLATFORM = "platform"
ORGANIZATION = "organization"

ROLE_CATALOG = [
    {
        "value": UserRole.SUPER_ADMIN.value, "label": "Super Admin", "scope": PLATFORM,
        "description": "Platform-wide access across every organization. Not tied to an organization.",
    },
    {
        "value": UserRole.ADMIN.value, "label": "Organization Admin", "scope": ORGANIZATION,
        "description": "Full control of one organization: users, settings, billing and HR.",
    },
    {
        "value": UserRole.HR_ADMIN.value, "label": "HR Admin", "scope": ORGANIZATION,
        "description": "Manages employees, leave, documents and other HR data in one organization.",
    },
    {
        "value": UserRole.BILLING_ADMIN.value, "label": "Billing Admin", "scope": ORGANIZATION,
        "description": "Manages the organization's subscription, invoices and payment details.",
    },
    {
        "value": UserRole.MANAGER.value, "label": "Manager", "scope": ORGANIZATION,
        "description": "Leads a team; sees and approves requests from their reports.",
    },
    {
        "value": UserRole.EMPLOYEE.value, "label": "Employee", "scope": ORGANIZATION,
        "description": "Self-service access to their own profile, leave, payslips and documents.",
    },
]
_BY_VALUE = {r["value"]: r for r in ROLE_CATALOG}

# caller role -> roles they may assign (create or change to)
ASSIGNABLE_BY = {
    UserRole.SUPER_ADMIN.value: [r["value"] for r in ROLE_CATALOG],
    UserRole.ADMIN.value: [
        UserRole.ADMIN.value, UserRole.HR_ADMIN.value, UserRole.BILLING_ADMIN.value,
        UserRole.MANAGER.value, UserRole.EMPLOYEE.value,
    ],
    UserRole.HR_ADMIN.value: [UserRole.EMPLOYEE.value],
}


def role_value(role) -> str:
    return role.value if hasattr(role, "value") else str(role)


def is_platform_role(role) -> bool:
    return _BY_VALUE[role_value(role)]["scope"] == PLATFORM


def assignable_roles(caller_role) -> List[dict]:
    allowed = ASSIGNABLE_BY.get(role_value(caller_role), [])
    return [dict(_BY_VALUE[v]) for v in allowed]


def resolve_target_organization(
    db: Session, caller, role, requested_org_id: Optional[int], confirm_super_admin: bool = False,
) -> Optional[int]:
    """Validate a role assignment and return the organization the user belongs to.

    Raises 4xx with a readable message for: a role the caller may not assign,
    an organization-level role without an organization, an organization that
    doesn't exist, a platform role given an organization, and a Super Admin
    creation without explicit confirmation."""
    caller_role = role_value(caller.role)
    target = role_value(role)
    if target not in _BY_VALUE:
        raise BadRequestException(f"Unknown role '{target}'.")
    allowed = ASSIGNABLE_BY.get(caller_role)
    if allowed is None:
        raise ForbiddenException(f"Role '{caller_role}' does not have permission to assign roles.")
    if target not in allowed:
        raise ForbiddenException(
            f"Your role ({caller_role}) cannot assign the '{target}' role. "
            f"You can assign: {', '.join(allowed)}."
        )

    if is_platform_role(target):
        if requested_org_id:
            raise BadRequestException("Super Admins are platform-level and cannot belong to an organization.")
        if not confirm_super_admin:
            raise BadRequestException(
                "Creating a Super Admin gives full platform access. Confirm explicitly to continue."
            )
        return None

    if caller_role == UserRole.SUPER_ADMIN.value:
        if not requested_org_id:
            raise BadRequestException("Select an organization: this role belongs to a specific organization.")
        from app.modules.hr.models import Organization

        if db.query(Organization.id).filter(Organization.id == requested_org_id).first() is None:
            raise BadRequestException("The selected organization does not exist.")
        return requested_org_id

    # Organization-scoped callers always act inside their own organization.
    if requested_org_id and requested_org_id != caller.organization_id:
        raise ForbiddenException("You can only manage users in your own organization.")
    if not caller.organization_id:
        raise BadRequestException("Your account is not attached to an organization.")
    return caller.organization_id
