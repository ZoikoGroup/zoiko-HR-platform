"""Load test for the template engine (Prompt 4 §C10). Synthetic data on a throwaway SQLite file, never a real database.

    ENVIRONMENT=testing HR_DATABASE_URL=sqlite:///<scratch>.db python scripts/doc_templates_load_test.py [employees] [shift_people]

Publishes a policy (HR-POL-025) to N employees (default 2,000) and sends shift notices (HR-TIM-003) to M people (default 500),
measuring the time to generate each document (p50 / p95 / max), the total wall time and the number of SQL statements, and prints a
Markdown table for docs/templates/performance.md.
"""
import os
import statistics
import sys
import tempfile
import time
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("ENVIRONMENT", "testing")


def main(n_people: int = 2000, n_shift: int = 500) -> str:
    from sqlalchemy import create_engine, event
    from sqlalchemy.orm import sessionmaker
    from app.database import Base
    import app.main  # noqa: F401  (every model)
    from app.modules.assistant import embeddings
    from app.modules.doc_templates import blocks, bootstrap, distribution, service, starters, storage
    from app.modules.doc_templates.models import EmployerEntity, JurisdictionPack, PolicyDistribution, TemplateClause, TemplateVariant
    from app.modules.employee.models import Employee, EmploymentType, EmployeeStatus, UserRole
    from app.modules.hr import time_documents, work_settings
    from app.modules.hr.models import Organization, OrganizationStatus, Shift

    url = os.environ.get("HR_DATABASE_URL", "")
    if not url.startswith("sqlite"):
        raise SystemExit("Refusing: the load test runs only on a throwaway SQLite database.")
    path = url.replace("sqlite:///", "")
    if os.path.exists(path):
        os.remove(path)
    engine = create_engine(url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    S = sessionmaker(bind=engine, expire_on_commit=False)
    db = S()
    statements = {"n": 0}
    event.listen(engine, "before_cursor_execute", lambda *a, **k: statements.__setitem__("n", statements["n"] + 1))
    storage.set_store(storage.LocalDocumentStore(tempfile.mkdtemp(prefix="zhr-load-")))
    embeddings.embed_batch = lambda texts: [[0.01] * 384 for _ in texts]
    distribution.BULK_INLINE, distribution.SESSION_FACTORY = True, lambda: db

    db.add(Organization(id=1, name="LOAD-A", organization_name="Load Tenant Ltd", organization_code="LA", status=OrganizationStatus.ACTIVE,
                        country="United Kingdom", currency="GBP"))
    db.commit()
    bootstrap.seed(db)
    db.add(EmployerEntity(organization_id=1, legal_name="Load Employer Ltd", country="GB", city="Leeds", is_default=True, status="active",
                          registration_type="company_number", registration_number="00000000"))
    db.commit()
    hr = Employee(email="hr@load.example.com", hashed_password="x", employee_code="LHR", role=UserRole.HR_ADMIN, first_name="Harper", last_name="Load",
                  job_title="HR", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(),
                  organization_id=1, is_active=True, email_verified=True)
    db.add(hr)
    db.add_all([Employee(email=f"p{i}@load.example.com", hashed_password="x", employee_code=f"L{i}", role=UserRole.EMPLOYEE, first_name="Load",
                         last_name=str(i), job_title="t", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE,
                         date_of_joining=date.today(), organization_id=1, is_active=True, email_verified=True, work_country="GB",
                         employing_entity_id=1) for i in range(n_people)])
    db.commit()
    pack = JurisdictionPack(scope_type="PLATFORM", country="GB", status="ACTIVE", created_at=datetime.utcnow(), signed_off_by_name="Load test")
    db.add(pack)
    db.commit()
    for cid in ("HR-POL-025", "HR-TIM-003"):
        s = starters.latest(db, cid)
        for key in s["clause_rules"]["mandatory"] + s["clause_rules"]["optional"]:
            if not db.query(TemplateClause).filter_by(clause_key=key, pack_id=pack.id).first():
                text = f"Load-test clause {key}."
                db.add(TemplateClause(clause_key=key, pack_id=pack.id, language="en", version=1, status="ACTIVE", text=text,
                                      checksum=blocks.checksum(key, text, "en")))
        v = TemplateVariant(canonical_id=cid, pack_id=pack.id, language="en", version=1, status="ACTIVE", release_mode="PLATFORM_COUNSEL",
                            content=s["content"], field_contract=s["field_contract"], clause_rules=s["clause_rules"], options=s["options"],
                            effective_from=date.today() - timedelta(days=1))
        v.checksum = blocks.checksum(v.content, v.field_contract, v.clause_rules, v.applicability, v.options, v.language)
        db.add(v)
    db.commit()
    hr = db.query(Employee).filter_by(email="hr@load.example.com").one()
    work_settings.save(db, hr, {"owner_name": "Head of People", "contact": "people@load.example.com", "leave_year_label": "Calendar year",
                                "annual_leave_notice_days": 14}, "policies")

    timings: list[float] = []
    real_generate = service.generate

    def timed(*a, **k):
        t0 = time.perf_counter()
        try:
            return real_generate(*a, **k)
        finally:
            timings.append(time.perf_counter() - t0)
    service.generate = timed

    def run(label, fn):
        timings.clear()
        statements["n"] = 0
        t0 = time.perf_counter()
        fn()
        wall = time.perf_counter() - t0
        q = sorted(timings)
        return {"label": label, "documents": len(q), "wall_s": round(wall, 1),
                "p50_ms": round(statistics.median(q) * 1000) if q else None,
                "p95_ms": round(q[int(len(q) * 0.95) - 1] * 1000) if q else None, "max_ms": round(q[-1] * 1000) if q else None,
                "sql_per_document": round(statements["n"] / len(q), 1) if q else None}

    def publish_policy():
        d = PolicyDistribution(organization_id=1, canonical_id="HR-POL-025", title="Annual leave policy", audience={"type": "all"},
                               requires="ACKNOWLEDGE", status="DRAFT", created_by=hr.id, reminder_days=[7, 1])
        db.add(d)
        db.commit()
        distribution.publish(db, hr, d, confirm_partial=True)

    shift = Shift(name="Early", start_time="06:00", end_time="14:00", organization_id=1)
    db.add(shift)
    db.commit()
    people = [e.id for e in db.query(Employee).filter(Employee.role == UserRole.EMPLOYEE).limit(n_shift).all()]

    def shift_notices():
        for i in range(0, len(people), 200):
            time_documents.publish_roster(db, hr, {"shift_id": shift.id, "employee_ids": people[i:i + 200], "start_date": date.today() + timedelta(days=7),
                                                   "end_date": date.today() + timedelta(days=13), "weekdays": [0, 1, 2, 3, 4]})

    rows = [run(f"Publish HR-POL-025 to {n_people} employees", publish_policy), run(f"Shift notices HR-TIM-003 for {n_shift} people", shift_notices)]
    lines = ["| Scenario | Documents | Wall time (s) | p50 (ms) | p95 (ms) | max (ms) | SQL statements per document |", "|---|---|---|---|---|---|---|"]
    for r in rows:
        lines.append(f"| {r['label']} | {r['documents']} | {r['wall_s']} | {r['p50_ms']} | {r['p95_ms']} | {r['max_ms']} | {r['sql_per_document']} |")
    table = "\n".join(lines)
    print(table)
    db.close()
    return table


if __name__ == "__main__":
    args = [int(x) for x in sys.argv[1:3]]
    main(*args)
