"""
reset_super_admin.py
--------------------
CLI to reset the Super Admin password directly in the database.

Usage (from backend/):
    python -m scripts.reset_super_admin <email> <new_password>
"""

import sys

from app.config import settings
from app.database import initialize_database, SessionLocal
from app.core.security import hash_password
from app.modules.employee.models import Employee, UserRole


def reset_super_admin(email: str, new_password: str) -> str:
    initialize_database()
    db = SessionLocal()
    try:
        employee = db.query(Employee).filter(
            Employee.email == email,
            Employee.role == UserRole.SUPER_ADMIN,
        ).first()

        if not employee:
            return f"No Super Admin found with email: {email}"

        employee.hashed_password = hash_password(new_password)
        db.commit()
        return f"Password reset for Super Admin: {email} (id={employee.id})"
    finally:
        db.close()


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: python -m scripts.reset_super_admin <email> <new_password>", file=sys.stderr)
        return 1

    email = sys.argv[1]
    new_password = sys.argv[2]

    print(reset_super_admin(email, new_password))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
