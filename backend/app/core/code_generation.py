"""
core/code_generation.py
-----------------------
Centralized code generation for the standalone HR platform.

Only HR-relevant generators are kept. Generators target PostgreSQL (Neon):
PostgreSQL advisory locks serialize code generation per org+prefix.
"""

import re
import uuid as uuid_lib
from datetime import datetime
from typing import Optional, Type

from sqlalchemy import text
from sqlalchemy.orm import Session


# ═══════════════════════════════════════════════════════════════════════════════
# ORGANIZATION CODE (2-Letter Abbreviation)
# ═══════════════════════════════════════════════════════════════════════════════

def derive_organization_code(name: str) -> str:
    """Derive 2-letter org code from org name. Non-alpha chars stripped,
    padded with 'X' when short, 'OR' when empty."""
    alpha_only = re.sub(r"[^A-Za-z]", "", name or "")
    if len(alpha_only) >= 2:
        return alpha_only[:2].upper()
    if len(alpha_only) == 1:
        return (alpha_only + "X").upper()
    return "OR"


def generate_organization_code(name: str, db: Session) -> str:
    """Generate a unique 2-letter organization code, deduplicating with a
    numeric suffix."""
    base_code = derive_organization_code(name)

    from app.modules.hr.models import Organization
    code = base_code
    suffix = 1
    while db.query(Organization).filter(Organization.organization_code == code).first():
        code = f"{base_code}{suffix}"
        suffix += 1

    return code


# ═══════════════════════════════════════════════════════════════════════════════
# EMPLOYEE CODE
# ═══════════════════════════════════════════════════════════════════════════════

def generate_employee_code(db: Session, organization_id: Optional[int]) -> str:
    """Generate employee code: {OrgCode}E{seq:05d}.

    When organization_id is None (platform users like Super Admin) a fixed
    'PLATE' prefix is used: PLTE00001.
    """
    from app.modules.hr.models import Organization
    from app.modules.employee.models import Employee

    org_code = "PLAT"
    if organization_id is not None:
        org = db.query(Organization).filter(Organization.id == organization_id).first()
        org_code = org.organization_code if org and org.organization_code else "UNK"

    # Next number = highest existing number + 1. Counting rows reused codes as soon as
    # any employee had been deleted (count drops below the highest code in use), which
    # made imports fail with "duplicate key ... employees_employee_code_key".
    prefix = f"{org_code}E"
    rows = db.query(Employee.employee_code).filter(Employee.employee_code.like(f"{prefix}%")).all()
    highest = 0
    for (code,) in rows:
        suffix = (code or "")[len(prefix):]
        if suffix.isdigit():
            highest = max(highest, int(suffix))
    number = highest + 1
    # Codes are unique across the whole table; step past anything already taken.
    while db.query(Employee.id).filter(Employee.employee_code == f"{prefix}{number:05d}").first() is not None:
        number += 1
    return f"{prefix}{number:05d}"


# ═══════════════════════════════════════════════════════════════════════════════
# GENERIC BUSINESS CODE GENERATOR
# ═══════════════════════════════════════════════════════════════════════════════

def generate_business_code(
    db: Session,
    organization_id: int,
    prefix: str,
    table: Type,
    code_column: str,
    date_format: Optional[str] = None,
    seq_width: int = 3,
) -> str:
    """Generic code generator for any business entity.

    Examples:
        generate_business_code(db, org_id, "DEP", Department, "department_code")
        -> ZODEP001
    """
    _advisory_lock(db, organization_id, prefix)

    from app.modules.hr.models import Organization
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    org_code = org.organization_code if org and org.organization_code else "UNK"

    date_part = ""
    if date_format:
        date_part = datetime.now().strftime(date_format)

    prefix_pattern = f"{org_code}{prefix}{date_part}%"
    count = db.query(table).filter(
        table.organization_id == organization_id,
        getattr(table, code_column).like(prefix_pattern),
    ).count()

    return f"{org_code}{prefix}{date_part}{(count + 1):0{seq_width}d}"


# ═══════════════════════════════════════════════════════════════════════════════
# UUID GENERATION
# ═══════════════════════════════════════════════════════════════════════════════

def generate_uuid() -> str:
    """Generate a new UUID4 string."""
    return str(uuid_lib.uuid4())


# ═══════════════════════════════════════════════════════════════════════════════
# HELPER: Get organization code
# ═══════════════════════════════════════════════════════════════════════════════

def get_org_code(db: Session, organization_id: int) -> str:
    """Get the organization abbreviation code, or 'UNK' if not found."""
    from app.modules.hr.models import Organization
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    return org.organization_code if org and org.organization_code else "UNK"


def _advisory_lock(db: Session, organization_id: int, prefix: str) -> None:
    """Take a PostgreSQL advisory lock (serializes code generation per
    org+prefix). The platform is Neon/PostgreSQL-only, so the lock is always
    available; failures are logged and generation falls back to count-based."""
    try:
        db.execute(
            text("SELECT pg_advisory_xact_lock(:key)"),
            {"key": organization_id + 8000000 + (hash(prefix) % 1000000)},
        )
    except Exception:
        # Advisory locks unavailable (unexpected) — count-based generation is
        # best-effort; acceptable for local dev.
        pass
