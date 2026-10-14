"""Synthetic tenants for non-production use (ZHR-PRIV-001 F03): TENANT-A and TENANT-B, fake people of different sensitivity.

    HR_DEBUG=true python scripts/seed_synthetic_tenants.py

Everything here is invented: names, e-mail addresses (reserved example domains), numbers, bank values. Idempotent. REFUSES to run unless
the database looks like a development one (sqlite, localhost, or HR_DEBUG=true with a local host) or HR_ALLOW_SYNTHETIC_SEED=1 is set,
so it cannot be pointed at a real tenant's data by accident. Real people's data in staging or demo needs a governed exception.
"""
import os
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("ENVIRONMENT", "development")

TENANTS = {
    "TENANT-A": {"slug": "tenant-a", "people": [
        ("admin", "Avery", "Admin", "admin", "Engineering", 0),
        ("hr", "Harper", "Human", "hr_admin", "People", 0),
        ("manager", "Morgan", "Manager", "manager", "Engineering", 0),
        ("ada", "Ada", "Alpha", "employee", "Engineering", 120000),
        ("ben", "Ben", "Beta", "employee", "Sales", 80000),
    ]},
    "TENANT-B": {"slug": "tenant-b", "people": [
        ("admin", "Blair", "Admin", "admin", "Operations", 0),
        ("cleo", "Cleo", "Gamma", "employee", "Operations", 95000),
    ]},
}
PASSWORD = "Synthetic#Passw0rd1"


def _allowed() -> bool:
    from app.config import settings
    url = (settings.DATABASE_URL or "").lower()
    local = url.startswith("sqlite") or any(h in url for h in ("localhost", "127.0.0.1", "[::1]"))
    return bool(os.environ.get("HR_ALLOW_SYNTHETIC_SEED")) or local


def seed(db) -> dict:
    from app.core.security import hash_password
    from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
    from app.modules.hr.models import EmployeeProfile, Organization, OrganizationStatus
    created = {}
    for name, spec in TENANTS.items():
        org = db.query(Organization).filter(Organization.organization_name == name).first()
        if org is None:
            org = Organization(name=name, organization_name=name, status=OrganizationStatus.ACTIVE)
            db.add(org)
            db.commit()
        created[name] = org.id
        for n, (key, first, last, role, dept, salary) in enumerate(spec["people"], start=1):
            email = f"{key}@{spec['slug']}.example.com"
            if db.query(Employee).filter(Employee.email == email, Employee.organization_id == org.id).first():
                continue
            person = Employee(
                email=email, hashed_password=hash_password(PASSWORD), employee_code=f"SYN{org.id}{n:03d}", role=UserRole(role),
                first_name=first, last_name=last, phone=f"+000-555-{org.id}{n:04d}", job_title=dept + " staff", is_active=True,
                employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today() - timedelta(days=200 + n),
                basic_salary=salary or None, ctc=(salary * 1.2) if salary else None, organization_id=org.id, email_verified=True,
                personal_email=f"{key}.private@{spec['slug']}.example.org", current_address=f"{n} Synthetic Street",
            )
            db.add(person)
            db.commit()
            if salary:
                db.add(EmployeeProfile(employee_id=person.id, organization_id=org.id, bank_account=f"SYN-IBAN-{org.id}-{n:04d}",
                                       pan_number=f"SYNPA{n:04d}X", blood_group="O+", religion="synthetic", emergency_contact_name="Sam Synthetic"))
                db.commit()
    return created


def main() -> int:
    if not _allowed():
        print("refusing: the database does not look like a development one. Set HR_ALLOW_SYNTHETIC_SEED=1 to override (never on real data).")
        return 2
    from app.database import SessionLocal
    import app.main  # noqa: F401
    db = SessionLocal()
    try:
        ids = seed(db)
        print(f"synthetic tenants ready: {ids}  (password for every account: {PASSWORD})")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
