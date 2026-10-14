"""Who sees which fields of an EMPLOYEE record (ZHR-PRIV-001 E02, E03, E06, T05).

Applied when an employee record is serialized, from the signed identity of the request (never from anything in the request):

  yourself                       everything about you
  organization admin, HR admin   everything (as before; whether HR should see pay is a decision recorded in roles_matrix.md)
  a manager, for a direct report their people-and-leave fields (BASIC + CONFIDENTIAL), never pay or cases
  everyone else in the organization   the company directory: name, title, department, designation, work e-mail, photo

Masked fields come back empty (null) and the record says which ones in `redacted`, so a screen can show "hidden" rather than a wrong
blank. Outside a signed-in tenant request (sign-in, scripts, tests, the platform plane) nothing is masked here: the platform never
reaches these routes at all.
"""
from __future__ import annotations

from typing import Iterable, Optional

from app.core.privacy import classification as cls
from app.core.privacy import context as ctx
from app.core.privacy.classification import Level

# what any member of the organization may see of a colleague (camelCase extras of the response included)
DIRECTORY = frozenset({
    "id", "first_name", "last_name", "full_name", "job_title", "work_email", "department_id", "designation_id", "department", "profile_picture",
    "organization_id", "role", "is_active", "status", "designationName", "departmentName", "managerName", "title", "products",
    "reporting_manager_id", "date_of_joining", "employment_type", "temporary_password", "must_change_password", "created_at", "created_by", "updated_by",
})
FULL_ACCESS_ROLES = frozenset({"admin", "hr_admin"})
MANAGER_LEVELS = frozenset({Level.PLATFORM_META, Level.TENANT_AGGREGATE, Level.PERSONAL_BASIC, Level.PERSONAL_CONFIDENTIAL})


def fields_to_mask(record_id: Optional[int], reporting_manager_id: Optional[int], names: Iterable[str]) -> set[str]:
    """The names (snake_case) to blank for the current viewer; empty when nothing applies."""
    c = ctx.current()
    if c is None or c.plane != ctx.TENANT or c.tenant_id is None or c.actor_id is None:
        return set()
    if record_id is not None and record_id == c.actor_id:
        return set()                                                   # your own record
    role = c.role or ""
    if role in FULL_ACCESS_ROLES:
        return set()
    names = list(names)
    if role == "manager" and reporting_manager_id is not None and reporting_manager_id == c.actor_id:
        allowed = MANAGER_LEVELS
        return {n for n in names if n not in DIRECTORY and _level(n) not in allowed}
    return {n for n in names if n not in DIRECTORY}


def _level(name: str):
    level = cls.classify("employees", name)
    return level if level != cls.UNCLASSIFIED else Level.SECRET     # an unknown field is hidden, never shown
