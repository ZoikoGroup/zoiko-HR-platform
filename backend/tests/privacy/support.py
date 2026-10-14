"""Shared helpers for the privacy suite: canaries, token minting, user factory."""
from __future__ import annotations

from datetime import date

from app.core.security import create_access_token, hash_password
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole

PW = "Passw0rd1"

# Canaries: unique, greppable, obviously fake.
CANARY = {
    "name_a1": "CanaryAlpha", "last_a1": "ZZSURNAMEA1",
    "name_a2": "CanaryBeta", "last_a2": "ZZSURNAMEA2",
    "name_b1": "CanaryGamma", "last_b1": "ZZSURNAMEB1",
    "email_a1": "canary.a1@tenant-a.example.com", "email_b1": "canary.b1@tenant-b.example.com",
    "iban_a1": "CANARY-IBAN-A1-000111", "iban_b1": "CANARY-IBAN-B1-000222",
    "pan_a1": "CANARYPAN1", "medical_a1": "CANARY-MEDICAL-A1", "phone_a1": "+000-CANARY-PHONE-A1",
    "salary_a1": 987654, "salary_b1": 876543,
}


def _emp(db, email, role, org, first, last, **extra):
    e = Employee(
        email=email, hashed_password=hash_password(PW), employee_code=f"C-{email}", role=role, first_name=first, last_name=last,
        job_title="t", is_active=True, employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE,
        date_of_joining=date.today(), organization_id=org, email_verified=True, **extra,
    )
    db.add(e)
    db.commit()
    return e


def token_for(user) -> dict:
    data = {"sub": user.email, "role": user.role.value, "id": user.id, "organization_id": user.organization_id}
    return {"Authorization": f"Bearer {create_access_token(data)}"}




def all_canaries_in(text: str, *keys) -> list[str]:
    """Which of the named canaries (default: every sensitive one) appear in `text`."""
    names = keys or ("name_a1", "last_a1", "name_a2", "last_a2", "name_b1", "last_b1", "email_a1", "email_b1", "iban_a1", "iban_b1", "pan_a1", "medical_a1", "phone_a1")
    return [CANARY[k] for k in names if str(CANARY[k]) in text]
