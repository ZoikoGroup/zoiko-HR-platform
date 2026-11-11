"""Counts stored values that do not meet the field rules introduced for the QA reports of 6 / 10 Nov 2026 (B7-B38).

Nothing is changed. The output has counts only: per organization id and per field, how many stored values would be refused if
they were typed today (no names, e-mails or values are printed: ZHR-PRIV-001). Such records stay editable: the forms and the API
check a field only when its value changes.

    python scripts/field_rules_report.py            # table
    python scripts/field_rules_report.py --json     # machine-readable
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def build(db) -> dict:
    from app.core import field_rules
    from app.modules.employee.models import Employee
    from app.modules.hr.models import EmployeeProfile, Organization

    counts: dict = defaultdict(lambda: defaultdict(int))
    totals: dict = defaultdict(int)
    profiles = {p.employee_id: p for p in db.query(EmployeeProfile).all()}
    for e in db.query(Employee).yield_per(500):
        org = e.organization_id or 0
        totals[org] += 1
        profile = profiles.get(e.id)
        for field, rule in field_rules.EMPLOYEE_FIELDS.items():
            if field in ("department_name", "designation_name"):
                continue                                    # stored as department / designation records, not on the employee
            if field in ("pan_number", "uan_number", "bank_account", "bank_ifsc"):
                value = getattr(profile, field, None) if profile is not None else None
            else:
                value = getattr(e, field, None)
            if value in (None, ""):
                continue
            country = e.country if rule in field_rules.COUNTRY_DRIVEN else None
            if field_rules.problem(rule, value, country):
                counts[org][field] += 1
    for o in db.query(Organization).all():
        for field, rule in (("organization_name", "org_name"), ("city", "place_name"), ("address", "address"), ("phone", "phone")):
            value = getattr(o, field, None)
            if value and field_rules.problem(rule, value, getattr(o, "country", None) if rule == "phone" else None):
                counts[o.id][f"organization.{field}"] += 1
    return {"organizations": {str(org): {"employees": totals.get(org, 0), "non_conforming": dict(sorted(fields.items()))}
                              for org, fields in sorted(counts.items())}}


def main() -> None:
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        report = build(db)
    finally:
        db.close()
    if "--json" in sys.argv:
        print(json.dumps(report, indent=2))
        return
    for org, row in report["organizations"].items():
        print(f"organization {org} ({row['employees']} people)")
        for field, n in row["non_conforming"].items():
            print(f"  {field:<28} {n}")


if __name__ == "__main__":
    main()
