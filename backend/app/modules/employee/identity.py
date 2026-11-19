"""E-mail identity, scoped per organization.

An address identifies at most ONE account inside an organization (uq_employees_organization_email), but the same address may
hold a separate account in each organization, each with its own password, role and status. Platform accounts
(organization_id IS NULL) are their own scope. Uniqueness is therefore always checked inside ONE scope, never across
organizations.

Sign-in is the only place an address is looked up across organizations, because the person has not said which one they
mean yet. Even there an account is only offered when the password matches THAT account (passwords are per account), and when
more than one matches the person chooses: nothing here picks an organization for them.

Shared by employee/service.py, hr/service.py and the super admin routes, so the rules live in one place.
"""
from __future__ import annotations

from datetime import timedelta
from typing import Iterable, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.exceptions import UnauthorizedException, ZoikoException
from app.modules.employee.models import Employee, EmployeeStatus

DUPLICATE_EMAIL_CODE = "ALREADY_EXISTS"
DUPLICATE_EMAIL_MESSAGE = "An employee with this email already exists in this organization."
DUPLICATE_PLATFORM_EMAIL_MESSAGE = "A platform account with this email already exists."
INVALID_CREDENTIALS_MESSAGE = "Invalid email or password."

SELECTION_TOKEN_TYPE = "org_select"
SELECTION_TOKEN_TTL = timedelta(minutes=5)
SELECTION_EXPIRED_MESSAGE = "This sign-in has expired. Please sign in again."
SELECTION_UNKNOWN_ORG_MESSAGE = "Choose one of the organizations listed for your account."
PLATFORM_CHOICE_NAME = "Zoiko HR platform administration"


def normalize_email(email) -> str:
    """The stored form of an address: trimmed and lower-cased, so per-organization uniqueness cannot be dodged by casing."""
    return str(email or "").strip().lower()


def _in_scope(query, organization_id: Optional[int]):
    if organization_id is None:
        return query.filter(Employee.organization_id.is_(None))
    return query.filter(Employee.organization_id == organization_id)


def account_in_organization(db: Session, email, organization_id: Optional[int], *, exclude_id: Optional[int] = None) -> Optional[Employee]:
    """The account with this address in ONE organization (organization_id=None: the platform accounts), or None."""
    q = _in_scope(db.query(Employee).filter(func.lower(Employee.email) == normalize_email(email)), organization_id)
    if exclude_id is not None:
        q = q.filter(Employee.id != exclude_id)
    return q.first()


INACTIVE_DUPLICATE_HINT = (" That account is archived or deactivated: reactivate it in User Management instead of adding the "
                           "person again.")


def duplicate_email_exception(organization_id: Optional[int], existing: Optional[Employee] = None) -> ZoikoException:
    """The one answer for "this address is already used in this organization" (409), whoever finds it: the app check, or
    the database's unique index when two requests race."""
    if organization_id is None:
        return ZoikoException(409, DUPLICATE_EMAIL_CODE, DUPLICATE_PLATFORM_EMAIL_MESSAGE)
    message = DUPLICATE_EMAIL_MESSAGE
    if existing is not None and (not existing.is_active or existing.status in (EmployeeStatus.ARCHIVED, EmployeeStatus.DEACTIVATED)):
        message += INACTIVE_DUPLICATE_HINT          # archived rows still hold their address in the organization
    return ZoikoException(409, DUPLICATE_EMAIL_CODE, message)


def ensure_email_free(db: Session, email, organization_id: Optional[int], *, exclude_id: Optional[int] = None) -> str:
    """Refuses (409) an address that already has an account in THIS organization; returns the normalised address.
    An account with the same address in another organization is not a conflict. Archived and deactivated accounts still
    count (the address stays theirs, so reactivating them keeps their history); the message says how to bring them back."""
    clean = normalize_email(email)
    existing = account_in_organization(db, clean, organization_id, exclude_id=exclude_id)
    if existing is not None:
        raise duplicate_email_exception(organization_id, existing)
    return clean


# The database's guarantee (migration d1e2f3a4b5c6): these unique indexes reject a duplicate that slipped past the check.
DUPLICATE_EMAIL_INDEXES = ("uq_employees_org_lower_email", "uq_employees_platform_lower_email", "uq_employees_organization_email")


def is_duplicate_email_error(exc) -> bool:
    """True for the IntegrityError a unique e-mail index raises (PostgreSQL or SQLite wording)."""
    from sqlalchemy.exc import IntegrityError
    if not isinstance(exc, IntegrityError):
        return False
    text = str(getattr(exc, "orig", exc)).lower()
    return any(name in text for name in DUPLICATE_EMAIL_INDEXES) or "employees.email" in text


def duplicate_email_exception_from(exc) -> ZoikoException:
    text = str(getattr(exc, "orig", exc)).lower()
    return duplicate_email_exception(None if "uq_employees_platform_lower_email" in text else 0)


# ── Sign-in ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

def sign_in_candidates(db: Session, email) -> list:
    """Every account for this address, in every organization and the platform. Accounts of deleted organizations are kept
    (the deleted-organization filter applies to Organization rows, not to employees), so the caller can explain why one of
    them cannot sign in."""
    return (db.query(Employee)
            .filter(func.lower(Employee.email) == normalize_email(email))
            .order_by(Employee.id)
            .all())


def _org_deleted(db: Session, organization_id: Optional[int]) -> bool:
    if not organization_id:
        return False
    from app.core import org_access
    try:
        return bool(org_access.get_org_access(db, organization_id).deleted)
    except Exception:
        return False


def is_usable(db: Session, employee: Employee) -> bool:
    """May this account be offered at sign-in at all: active, not deactivated, and its organization not deleted. Other
    organization states (suspended, evaluation ended...) are explained by issue_login once the account is chosen."""
    if not employee.is_active:
        return False
    if employee.status == EmployeeStatus.DEACTIVATED:
        return False
    return not _org_deleted(db, employee.organization_id)


_TIMING_DUMMY_HASH: Optional[str] = None


def _dummy_hash() -> str:
    global _TIMING_DUMMY_HASH
    if _TIMING_DUMMY_HASH is None:
        from app.core.security import hash_password
        _TIMING_DUMMY_HASH = hash_password("timing-equaliser-not-a-password-9")
    return _TIMING_DUMMY_HASH


def sign_in_password_checks() -> int:
    """How many password checks every sign-in performs at least (HR_SIGN_IN_PASSWORD_CHECKS, default 3)."""
    import os
    try:
        return max(1, int(os.environ.get("HR_SIGN_IN_PASSWORD_CHECKS", "3")))
    except ValueError:
        return 3


def password_matches(db: Session, email, password: str) -> list:
    """The accounts for this address whose OWN password is `password`.

    Constant work: every attempt costs the same number of password checks (sign_in_password_checks(), padded with checks
    against a dummy hash), whether the address is unknown or has one, two or three accounts, and whether the password is
    right or wrong. So neither an answer nor its timing tells how many organizations an address belongs to. Only an address
    with MORE accounts than that floor costs more (one check per account)."""
    from app.core.security import verify_password
    candidates = [e for e in sign_in_candidates(db, email) if e.hashed_password]
    matches = [e for e in candidates if verify_password(password, e.hashed_password)]
    for _ in range(sign_in_password_checks() - len(candidates)):
        verify_password(password, _dummy_hash())
    return matches


def narrow_to_organization(db: Session, accounts: list, organization_id: Optional[int] = None,
                           organization_code: Optional[str] = None) -> list:
    """Keep only the account in the organization the person named (by id or code), when they named one."""
    if organization_id is not None:
        accounts = [e for e in accounts if e.organization_id == organization_id]
    if organization_code:
        wanted = organization_code.strip().upper()
        accounts = [e for e in accounts if (_org_code(db, e.organization_id) or "").upper() == wanted]
    return accounts


def resolve_sign_in(db: Session, accounts: list) -> tuple[Optional[Employee], list]:
    """(the one account to sign in to, []) or (None, the usable accounts to choose from).

    No account usable: the first matching one is returned anyway, so issue_login explains why it cannot sign in (deactivated,
    organization deleted), the same answer a single account always got."""
    if not accounts:
        raise UnauthorizedException(INVALID_CREDENTIALS_MESSAGE)
    usable = [e for e in accounts if is_usable(db, e)]
    if len(usable) == 1:
        return usable[0], []
    if not usable:
        return accounts[0], []
    return None, usable


# ── Choosing the organization ────────────────────────────────────────────────────────────────────────────────────────────

def _org_code(db: Session, organization_id: Optional[int]) -> Optional[str]:
    if not organization_id:
        return None
    from app.core import org_access
    try:
        return org_access.get_org_access(db, organization_id).organization_code
    except Exception:
        return None


def _org_name(db: Session, organization_id: Optional[int]) -> str:
    if not organization_id:
        return PLATFORM_CHOICE_NAME
    from app.modules.hr.models import Organization
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    return (org.organization_name or org.display_name or "") if org else ""


def organization_choices(db: Session, accounts: Iterable[Employee]) -> list:
    return [{
        "id": e.organization_id,
        "name": _org_name(db, e.organization_id),
        "code": _org_code(db, e.organization_id),
        "role": e.role.value if hasattr(e.role, "value") else str(e.role),
    } for e in accounts]


def make_selection_token(email: str, accounts: Iterable[Employee]) -> str:
    """A short-lived signed token naming the accounts the password matched. It has no `sub` and no `id`, so it is neither an
    access token (get_current_user refuses it) nor a refresh token (/auth/refresh refuses it)."""
    import secrets
    from app.core.security import create_access_token
    return create_access_token(
        {"typ": SELECTION_TOKEN_TYPE, "sel_email": normalize_email(email), "eids": [e.id for e in accounts],
         "jti": secrets.token_urlsafe(16), "aud": "zoiko-hr"},
        expires_delta=SELECTION_TOKEN_TTL,
    )


# Single use: a selection token signs in ONCE. It is spent only when that sign-in succeeds, so asking for the authenticator
# code (MFA_REQUIRED) and trying again with it still works. With Redis (HR_REDIS_URL) the spent list is shared by every
# worker and instance; without it, this process remembers it until the token would have expired anyway.
_spent_selections: dict = {}


def _selection_key(jti: str) -> str:
    return f"zhr:orgsel:{jti}"


def selection_already_used(jti: str) -> bool:
    from app.core.redis_client import get_redis
    client = get_redis()
    if client is not None:
        try:
            return bool(client.exists(_selection_key(jti)))
        except Exception:
            pass
    return jti in _spent_selections


def spend_selection(jti: str, expires_at: float) -> bool:
    """True the first time; False when the token was already used (a replay, or two tabs at once)."""
    import time
    from app.core.redis_client import get_redis
    client = get_redis()
    if client is not None:
        try:
            return bool(client.set(_selection_key(jti), "1", nx=True, ex=max(int(expires_at - time.time()) + 5, 1)))
        except Exception:
            pass
    now = time.time()
    for old in [j for j, exp in _spent_selections.items() if exp < now]:
        _spent_selections.pop(old, None)
    if jti in _spent_selections:
        return False
    _spent_selections[jti] = expires_at
    return True


def selection_response(db: Session, email: str, accounts: list) -> dict:
    return {
        "requires_org_selection": True,
        "message": "Your email address has an account in more than one organization. Choose the one to sign in to.",
        "organizations": organization_choices(db, accounts),
        "selection_token": make_selection_token(email, accounts),
    }


def open_selection(selection_token: str) -> dict:
    """The verified payload of a selection token that is still unused, or 401."""
    from app.core.security import decode_access_token
    payload = decode_access_token(selection_token or "")
    if (not payload or payload.get("typ") != SELECTION_TOKEN_TYPE or not payload.get("eids") or not payload.get("jti")
            or selection_already_used(payload["jti"])):
        raise UnauthorizedException(SELECTION_EXPIRED_MESSAGE)
    return payload


def account_from_selection(db: Session, selection_token: str, organization_id: Optional[int]) -> Employee:
    """The account the person chose from the list their password unlocked. Refuses an expired, forged or already used
    token, an organization that was not on the list, and an account whose password changed after the list was made."""
    from app.core.security import token_predates_password_change
    payload = open_selection(selection_token)
    email = payload.get("sel_email") or ""
    chosen = [e for e in db.query(Employee).filter(Employee.id.in_(list(payload["eids"]))).all()
              if e.organization_id == organization_id and normalize_email(e.email) == email]
    if not chosen:
        raise ZoikoException(400, "ORGANIZATION_NOT_OFFERED", SELECTION_UNKNOWN_ORG_MESSAGE)
    employee = chosen[0]
    if token_predates_password_change(payload, employee):
        raise UnauthorizedException(SELECTION_EXPIRED_MESSAGE)
    return employee
