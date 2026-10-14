"""Minimised forms of tenant data for platform (super admin) views (ZHR-PRIV-001 A08, D03, E01).

The platform operates tenants; it does not read their people. These helpers turn identifiable values into the forms the
platform may see: suppressed small counts, pseudonymous actor references, masked contact addresses, generic failure codes.
"""
from __future__ import annotations

import hashlib
import hmac
import re
from typing import Optional

from app.config import settings


def min_cohort() -> int:
    return max(int(getattr(settings, "PRIVACY_MIN_COHORT", 10) or 10), 1)


def suppress(count: Optional[int]) -> Optional[int]:
    """The count, or None when the group is smaller than PRIVACY_MIN_COHORT (render None as '<N' with suppressed_label)."""
    if count is None:
        return None
    return None if count < min_cohort() else count


def suppressed_label() -> str:
    return f"<{min_cohort()}"


def count_view(count: Optional[int]) -> dict:
    """{'value': n|None, 'label': '12' | '<10'} for a group count shown to a platform user."""
    v = suppress(count)
    return {"value": v, "label": suppressed_label() if v is None and count is not None else ("" if v is None else str(v))}


def pseudonym(actor_id: Optional[int], role_label: str = "User") -> str:
    """A stable, non-reversible reference such as 'Org Admin #a3f9'. The same person always gets the same one, but it cannot be
    turned back into a name or an id without the server key."""
    if actor_id is None:
        return role_label
    digest = hmac.new(settings.SECRET_KEY.encode(), f"actor:{actor_id}".encode(), hashlib.sha256).hexdigest()[:4]
    return f"{role_label} #{digest}"


_ROLE_LABELS = {"admin": "Org Admin", "hr_admin": "HR Admin", "manager": "Manager", "employee": "Employee", "billing_admin": "Billing Admin", "super_admin": "Platform Admin"}


def role_label(role: Optional[str]) -> str:
    return _ROLE_LABELS.get((role or "").lower(), "User")


def mask_email(email: Optional[str]) -> Optional[str]:
    """j***@acme.com: enough to recognise your own tenant admin, not enough to contact or enumerate people."""
    if not email or "@" not in email:
        return None
    name, _, domain = email.partition("@")
    return f"{name[:1]}{'*' * max(len(name) - 1, 2)}@{domain}"


# Failure reasons the platform may see: generic codes, never row data.
_FAILURE_CODES = (
    (re.compile(r"already exists|duplicate|unique", re.I), "DUPLICATE"),
    (re.compile(r"limit|quota|seats|plan", re.I), "PLAN_LIMIT"),
    (re.compile(r"permission|forbidden|not allowed|denied", re.I), "NOT_PERMITTED"),
    (re.compile(r"invalid|required|must|format|valid", re.I), "VALIDATION_ERROR"),
)


def failure_code(message: Optional[str]) -> Optional[str]:
    if not message:
        return None
    for pattern, code in _FAILURE_CODES:
        if pattern.search(message):
            return code
    return "ERROR"


_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_SENSITIVE_KEY = re.compile(r"(email|first_name|last_name|full_name|(^|_)name$|phone|mobile|address|password|token|secret|salary|ctc|iban|bank|"
                            r"account|(^|_)pan(_|$)|aadhaar|aadhar|ssn|dob|birth|reason_text|target_label)", re.I)
_KEEP_KEYS = {"organization_name", "org_name", "plan", "plan_code", "status", "previous_status", "new_status", "action_type", "counts", "organization", "role"}


def mask_emails_in(text: str) -> str:
    return _EMAIL_RE.sub(lambda m: mask_email(m.group(0)) or "••••", text)


def sanitize_details(value, key: str = ""):
    """Recursively strip personal values from an audit `details` blob before a platform user sees it: emails are masked,
    values under person-ish keys are replaced, everything else is kept (plan, status, counts...)."""
    if isinstance(value, dict):
        return {k: sanitize_details(v, str(k)) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [sanitize_details(v, key) for v in value]
    if isinstance(value, str):
        if key not in _KEEP_KEYS and _SENSITIVE_KEY.search(key):
            return mask_email(value) if "@" in value else "••••"
        return mask_emails_in(value)
    return value
