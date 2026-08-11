"""
core/dependencies.py
--------------------
Reusable FastAPI dependencies for the standalone HR platform.

Role model (lowest number = highest privilege):
  super_admin  0  platform-wide (all orgs)
  admin        1  org admin — full control within own org
  hr_admin     2  HR admin within own org
  manager      3  manager within own org
  employee     4  self-service (ESS) only
"""

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.security import decode_access_token
from app.core.exceptions import ForbiddenException, UnauthorizedException

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


# ── Role Hierarchy ───────────────────────────────────────────────────────────
ROLE_HIERARCHY = {
    "super_admin": 0,
    "admin": 1,
    "hr_admin": 2,
    "manager": 3,
    "employee": 4,
}

# ── Role Creation Rules ─────────────────────────────────────────────────────
ROLE_CREATION_RULES = {
    "super_admin": ["admin"],
    "admin": ["admin", "hr_admin", "manager", "employee"],
    "hr_admin": ["manager", "employee"],
    "manager": [],
    "employee": [],
}

# ── What each role can do within the HR platform ────────────────────────────
ROLE_PERMISSIONS = {
    "super_admin": ["all", "manage_platforms", "manage_organizations", "view_reports", "manage_users"],
    "admin": ["manage_organization", "manage_users", "manage_hr", "manage_departments", "manage_employees", "manage_attendance", "manage_leave", "manage_assets", "manage_learning", "manage_performance", "manage_recruitment", "manage_ess", "manage_travel"],
    "hr_admin": ["manage_hr", "manage_departments", "manage_employees", "manage_attendance", "manage_leave", "manage_assets", "manage_learning", "manage_performance", "manage_recruitment", "manage_ess", "manage_travel"],
    "manager": ["view_subordinates", "approve_attendance", "approve_leave", "manage_performance"],
    "employee": ["view_profile", "request_leave", "clock_in_out", "view_assets", "ess"],
}


def can_create_role(creator_role, target_role) -> bool:
    """Check if a user with creator_role may create a user with target_role."""
    allowed = ROLE_CREATION_RULES.get(creator_role, [])
    return target_role in allowed


def get_role_level(role) -> int:
    """Get the hierarchy level for a role value. Lower = higher privilege."""
    return ROLE_HIERARCHY.get(role, 999)


def get_allowed_creation_roles(creator_role) -> list:
    """Return the list of target roles the creator_role is allowed to create."""
    return ROLE_CREATION_RULES.get(creator_role, [])


__all__ = [
    "get_db", "get_current_user", "get_current_admin",
    "get_current_org_admin", "get_current_super_admin",
    "get_organization_id", "get_super_admin_organization_id",
    "require_organization_access",
]


def _role_value(role) -> str:
    return role.value if hasattr(role, "value") else str(role)


# ── Get Current Logged-In User ──────────────────────────────────────────────
def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Decode the JWT and return the current Employee. Raises 401 if invalid."""
    payload = decode_access_token(token)
    if payload is None:
        raise UnauthorizedException("Invalid or expired token. Please log in again.")

    email: str = payload.get("sub")
    if email is None:
        raise UnauthorizedException("Token is missing user information.")

    from app.modules.hr.models import Employee

    user = db.query(Employee).filter(Employee.email == email).first()
    if user is None:
        raise UnauthorizedException("User account not found. Please log in again.")

    jwt_org_id = payload.get("organization_id")
    if jwt_org_id is not None and user.organization_id is not None:
        if jwt_org_id != user.organization_id:
            import logging
            logging.getLogger("zoiko").warning(
                f"JWT org_id mismatch for user {user.email}: "
                f"token={jwt_org_id}, db={user.organization_id}. "
                f"Rejecting request — user should re-authenticate."
            )
            raise UnauthorizedException("Your session is outdated. Please log in again.")

    return user


# ── Require Admin-Level Role (super_admin / admin / hr_admin) ───────────────
def get_current_admin(current_user=Depends(get_current_user)):
    """Require an admin-tier role for HR management actions."""
    allowed_roles = ["super_admin", "admin", "hr_admin"]
    role_val = _role_value(current_user.role)
    if role_val not in allowed_roles:
        raise ForbiddenException(
            f"This action requires admin privileges. Your role: {role_val}"
        )
    return current_user


# ── Require Organization Admin (org-scoped configuration) ───────────────────
def get_current_org_admin(current_user=Depends(get_current_user)):
    """Only 'admin' and 'super_admin' — used for org configuration endpoints."""
    role_val = _role_value(current_user.role)
    allowed_roles = ["super_admin", "admin"]
    if role_val not in allowed_roles:
        raise ForbiddenException(
            f"This action requires organization admin privileges. Your role: {role_val}"
        )
    return current_user


# ── Require Super Admin (platform-wide) ─────────────────────────────────────
def get_current_super_admin(current_user=Depends(get_current_user)):
    """Only super_admin — used for the platform admin dashboard."""
    role_val = _role_value(current_user.role)
    if role_val != "super_admin":
        raise ForbiddenException(
            f"This action requires Super Admin privileges. Your role: {role_val}"
        )
    return current_user


# ── Organization Isolation Helpers ──────────────────────────────────────────
def get_organization_id(current_user=Depends(get_current_user)) -> int:
    """Return the current user's organization_id. Super Admin must scope explicitly."""
    role_val = _role_value(current_user.role)
    if role_val == "super_admin":
        raise ForbiddenException(
            "Super Admin must use get_super_admin_organization_id() to explicitly select an organization."
        )
    if current_user.organization_id is None:
        raise ForbiddenException("User is not associated with any organization.")
    return current_user.organization_id


def get_super_admin_organization_id(
    organization_id: int = None,
    current_user=Depends(get_current_user),
) -> int:
    """Super Admin must provide organization_id explicitly; others are rejected."""
    role_val = _role_value(current_user.role)
    if role_val != "super_admin":
        raise ForbiddenException("Only Super Admin can use this dependency.")
    if organization_id is None:
        raise ForbiddenException(
            "Super Admin must provide organization_id query parameter to access organization data."
        )
    return organization_id


def require_organization_access(
    target_organization_id: int,
    current_user=Depends(get_current_user),
) -> bool:
    """Verify the current user may access the target organization."""
    role_val = _role_value(current_user.role)
    if role_val == "super_admin":
        return True
    if current_user.organization_id != target_organization_id:
        import logging
        logging.getLogger("zoiko").warning(
            f"CROSS-ORG ACCESS BLOCKED: user={current_user.email} "
            f"role={role_val} user_org={current_user.organization_id} "
            f"target_org={target_organization_id}"
        )
        raise ForbiddenException(
            f"Access denied: You can only access data from your own organization (ID: {current_user.organization_id})."
        )
    return True
