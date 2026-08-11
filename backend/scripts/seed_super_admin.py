"""
seed_super_admin.py
-------------------
CLI to bootstrap the platform Super Admin without the HTTP endpoint.

Usage (from backend/):
    python -m scripts.seed_super_admin <email> <password> [--name "Platform Owner"]

The setup key is read from SUPER_ADMIN_SETUP_KEY in the environment / .env.
If the setup key is empty, the script refuses to run. Running this twice for
the same email is a no-op (returns the existing Super Admin untouched).
"""

import argparse
import logging
import os
import sys

from app.config import settings
from app.database import initialize_database, SessionLocal

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("zoiko.seed")


def _split_name(full_name: str) -> tuple[str, str]:
    parts = (full_name or "").strip().split(None, 1)
    first = parts[0] if parts else "Platform"
    last = parts[1] if len(parts) > 1 else "Owner"
    return first, last


def bootstrap_super_admin(email: str, password: str, name: str) -> str:
    from datetime import date

    from app.core.security import hash_password
    from app.core.code_generation import generate_employee_code
    from app.modules.employee.models import (
        Employee, EmploymentType, EmployeeStatus, UserRole,
    )
    from app.modules.super_admin.models import AuditAction, AuditLog
    from app.modules.super_admin.router import _seed_platform_settings

    initialize_database()
    db = SessionLocal()
    try:
        existing = db.query(Employee).filter(Employee.email == email).first()
        if existing:
            return f"Super Admin already exists for {email} (id={existing.id})."

        employee_code = generate_employee_code(db, None)
        first_name, last_name = _split_name(name)
        super_admin = Employee(
            email=email,
            hashed_password=hash_password(password),
            role=UserRole.SUPER_ADMIN,
            is_active=True,
            first_name=first_name,
            last_name=last_name,
            phone="",
            employee_code=employee_code,
            employee_id=None,
            job_title="Super Administrator",
            employment_type=EmploymentType.FULL_TIME,
            status=EmployeeStatus.ACTIVE,
            date_of_joining=date.today(),
            organization_id=None,
        )
        db.add(super_admin)
        db.commit()
        db.refresh(super_admin)

        seeded = _seed_platform_settings(db)

        db.add(AuditLog(
            action=AuditAction.CREATE,
            entity_type="SuperAdmin",
            entity_id=super_admin.id,
            performed_by=super_admin.id,
            performed_by_email=super_admin.email,
            details={"action": "bootstrap", "platform_settings_seeded": seeded},
        ))
        db.commit()
        logger.info("Super Admin bootstrapped: %s", super_admin.email)
        return f"Super Admin created: {super_admin.email} (id={super_admin.id}, code={super_admin.employee_code})"
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Bootstrap the platform Super Admin.")
    parser.add_argument("email", help="Super Admin email address")
    parser.add_argument("password", help="Super Admin password")
    parser.add_argument("--name", default="Platform Owner", help="Display name (default: Platform Owner)")
    args = parser.parse_args()

    if not settings.SUPER_ADMIN_SETUP_KEY:
        print(
            "ERROR: SUPER_ADMIN_SETUP_KEY is empty. Set it in your .env to enable "
            "the Super Admin bootstrap, then re-run.",
            file=sys.stderr,
        )
        return 1

    print(bootstrap_super_admin(args.email, args.password, args.name))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
