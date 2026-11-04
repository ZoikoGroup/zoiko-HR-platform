"""Report people whose work country could not be backfilled (migration d7e1a0b2c3f4), as CSV on stdout.

    python scripts/doc_templates_jurisdiction_report.py > jurisdiction_gaps.csv

Lists organization id, employee id, employee code and the country text that was recorded, so HR can set the work country
explicitly (HR → employee profile → Jurisdiction). Nothing is guessed or changed by this script. The same list is available
per organization at GET /hr/legal-entities/jurisdiction-gaps.
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main() -> int:
    from app.database import SessionLocal
    from app.modules.employee.models import Employee
    db = SessionLocal()
    try:
        rows = db.query(Employee).filter(Employee.work_country.is_(None), Employee.organization_id.isnot(None)) \
            .order_by(Employee.organization_id, Employee.id).all()
        w = csv.writer(sys.stdout)
        w.writerow(["organization_id", "employee_id", "employee_code", "recorded_country"])
        for e in rows:
            w.writerow([e.organization_id, e.id, e.employee_code, e.country or ""])
        print(f"{len(rows)} people without a work country", file=sys.stderr)
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
