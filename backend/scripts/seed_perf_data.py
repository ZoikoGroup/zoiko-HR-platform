"""
seed_perf_data.py
-----------------
Realistic data volume for performance work (Phase 2). NEVER run against production.

    HR_DEBUG=true HR_DATABASE_URL=postgresql://postgres@localhost:55432/perf python -m scripts.seed_perf_data

Guards:
  * refuses to run unless HR_DEBUG=true;
  * refuses a database host that is not local (localhost / 127.0.0.1 / ::1 / sqlite) unless
    HR_PERF_SEED_ALLOW_REMOTE=true is also set.

Idempotent: every org, person and row carries a "perf-" marker; a re-run tops each table up to the target volume
instead of duplicating it, so it can be re-run after schema changes.

Volume (defaults; override with --orgs / --staff):
  50 organizations (each with a billing subscription; a few on evaluation, past due, deleted)
  5,000 employees (100 per org; org 1 has 600 so lists can be measured at 10 vs 100 vs 600 rows), with
        departments, designations and reporting managers
  50,000 super-admin audit log rows
  12 months of daily BillableWorkforceSnapshot and BillingEntitlementSnapshot rows per org (~18k each)
  refunds, invoices, leave requests (2 per employee), attendance (last 30 days per employee)
Logins (password Passw0rd1): perf-super@zoikohr-perf.com (super admin), hr@perf-org001.com (HR admin, org 1)
"""
import argparse
import os
import sys
import time
from datetime import date, datetime, timedelta
from urllib.parse import urlparse

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)

PASSWORD = "Passw0rd1"
SUPER_EMAIL = "perf-super@zoikohr-perf.com"


def _guard():
    if os.getenv("HR_DEBUG", "").strip().lower() not in ("1", "true", "yes", "on"):
        sys.exit("Refusing to seed: set HR_DEBUG=true (dev databases only).")
    url = os.getenv("HR_DATABASE_URL", "")
    if not url:
        sys.exit("Refusing to seed: HR_DATABASE_URL is not set in the environment (the .env value is not used here).")
    host = urlparse(url.replace("postgresql+psycopg2", "postgresql")).hostname
    local = url.startswith("sqlite") or host in ("localhost", "127.0.0.1", "::1")
    if not local and os.getenv("HR_PERF_SEED_ALLOW_REMOTE", "").lower() != "true":
        sys.exit(f"Refusing to seed a non-local database host ({host}). Set HR_PERF_SEED_ALLOW_REMOTE=true only for a dev DB.")


def _bulk(db, model, rows, chunk=5000):
    from sqlalchemy import insert
    for i in range(0, len(rows), chunk):
        db.execute(insert(model), rows[i:i + chunk])
    db.commit()


def seed(n_orgs: int, staff: int, big_org_staff: int):
    from sqlalchemy import func
    from app.core.security import hash_password
    from app.database import SessionLocal
    from app.modules.billing.models import (
        BillableWorkforceSnapshot, BillingEntitlementSnapshot, BillingInvoice, BillingPlan, BillingRefundRequest,
        BillingSubscription, EvaluationStatus, OrganizationEvaluation, PlanCode, RefundRequestStatus, RefundRequestType,
        SubscriptionStatus,
    )
    from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
    from app.modules.hr.models import (
        AttendanceRecord, AttendanceStatus, Department, Designation, LeaveRequest, LeaveType, Organization,
        OrganizationStatus, RequestStatus,
    )
    from app.modules.super_admin.models import AuditAction, AuditLog

    t0 = time.monotonic()
    db = SessionLocal()
    now = datetime.utcnow()
    today = date.today()
    hashed = hash_password(PASSWORD)

    # plans
    for code, price in (("core", 12), ("advanced", 25), ("enterprise", None)):
        if not db.query(BillingPlan).filter(BillingPlan.code == code).first():
            db.add(BillingPlan(code=code, name=code.title(), catalog_version="2026.1", monthly_price=price,
                               annual_price=price * 10 if price else None))
    db.commit()
    plans = {(p.code.value if hasattr(p.code, "value") else p.code): p for p in db.query(BillingPlan).all()}

    # super admin
    if not db.query(Employee).filter(Employee.email == SUPER_EMAIL).first():
        db.add(Employee(email=SUPER_EMAIL, hashed_password=hashed, employee_code="PERF-SA", role=UserRole.SUPER_ADMIN,
                        first_name="Perf", last_name="Super", job_title="Platform admin", employment_type=EmploymentType.FULL_TIME,
                        status=EmployeeStatus.ACTIVE, is_active=True, date_of_joining=date(2023, 1, 1)))
        db.commit()

    statuses = [SubscriptionStatus.ACTIVE] * 6 + [SubscriptionStatus.EVALUATION] * 3 + [SubscriptionStatus.PAST_DUE]
    org_ids = []
    for i in range(1, n_orgs + 1):
        name = f"Perf Org {i:03d}"
        org = (db.query(Organization).filter(Organization.organization_name == name)
               .execution_options(include_deleted=True).first())
        if org is None:
            org = Organization(name=name, organization_name=name, display_name=f"Perf {i:03d}", status=OrganizationStatus.ACTIVE,
                               organization_code=f"PERF{i:03d}")
            db.add(org)
            db.flush()
            st = SubscriptionStatus.EVALUATION if i == 1 else statuses[i % len(statuses)]
            plan = plans["advanced" if i % 3 == 0 else "core"]
            db.add(BillingSubscription(organization_id=org.id, status=st, plan_id=plan.id, plan_code=plan.code, quantity=staff))
            if st == SubscriptionStatus.EVALUATION:
                db.add(OrganizationEvaluation(organization_id=org.id, evaluation_ends_at=now + timedelta(days=10),
                                              status=EvaluationStatus.ACTIVE))
            if i in (n_orgs, n_orgs - 1):        # a couple of soft-deleted orgs, so name lookups meet them
                org.deleted_at = now - timedelta(days=3)
            db.commit()
        org_ids.append(org.id)
    print(f"orgs ready: {len(org_ids)}")

    # departments / designations / employees
    for idx, oid in enumerate(org_ids, start=1):
        want = big_org_staff if idx == 1 else staff
        have = db.query(func.count(Employee.id)).filter(Employee.organization_id == oid).scalar()
        if have >= want:
            continue
        depts = db.query(Department).filter(Department.organization_id == oid).all()
        if not depts:
            _bulk(db, Department, [{"name": f"Dept {d}", "code": f"P{idx:03d}D{d}", "organization_id": oid} for d in range(8)])
            depts = db.query(Department).filter(Department.organization_id == oid).all()
        desigs = db.query(Designation).filter(Designation.organization_id == oid).all()
        if not desigs:
            _bulk(db, Designation, [{"title": f"Role {d}", "designation_code": f"P{idx:03d}R{d}", "organization_id": oid,
                                     "status": "active", "employees_count": 0} for d in range(10)])
            desigs = db.query(Designation).filter(Designation.organization_id == oid).all()
        rows = []
        for k in range(have, want):
            role = UserRole.HR_ADMIN if k == 0 else (UserRole.MANAGER if k % 20 == 1 else UserRole.EMPLOYEE)
            rows.append({
                "email": f"hr@perf-org{idx:03d}.com" if k == 0 else f"p{k:04d}@perf-org{idx:03d}.com",
                "hashed_password": hashed if k == 0 else "x", "employee_code": f"P{idx:03d}{k:04d}", "role": role,
                "first_name": f"First{k}", "last_name": f"Org{idx}", "job_title": "Engineer",
                "employment_type": EmploymentType.FULL_TIME, "status": EmployeeStatus.ACTIVE, "is_active": True,
                "date_of_joining": date(2022, 1, 1) + timedelta(days=k % 900), "organization_id": oid,
                "department_id": depts[k % len(depts)].id, "designation_id": desigs[k % len(desigs)].id,
                "email_verified": True,
            })
        _bulk(db, Employee, rows)
        # managers: every employee reports to the nearest manager above them
        mgrs = [e for (e,) in db.query(Employee.id).filter(Employee.organization_id == oid, Employee.role == UserRole.MANAGER).order_by(Employee.id)]
        if mgrs:
            for n, (eid,) in enumerate(db.query(Employee.id).filter(Employee.organization_id == oid, Employee.role == UserRole.EMPLOYEE,
                                                                   Employee.reporting_manager_id.is_(None)).order_by(Employee.id)):
                db.query(Employee).filter(Employee.id == eid).update({"reporting_manager_id": mgrs[n % len(mgrs)]}, synchronize_session=False)
            db.commit()
    print(f"employees: {db.query(func.count(Employee.id)).scalar()}")

    # snapshots: 12 months daily per org
    for oid in org_ids:
        if db.query(func.count(BillableWorkforceSnapshot.id)).filter(BillableWorkforceSnapshot.organization_id == oid).scalar() >= 365:
            continue
        pkg = PlanCode.CORE
        _bulk(db, BillableWorkforceSnapshot, [{"organization_id": oid, "quantity": staff - (d % 7), "snapshot_at": now - timedelta(days=d),
                                               "reconciliation_status": "derived_from_hr_state"} for d in range(365)])
        _bulk(db, BillingEntitlementSnapshot, [{"organization_id": oid, "package": pkg, "computed_at": now - timedelta(days=d)} for d in range(365)])
    print(f"snapshots: {db.query(func.count(BillableWorkforceSnapshot.id)).scalar()} workforce, "
          f"{db.query(func.count(BillingEntitlementSnapshot.id)).scalar()} entitlement")

    # refunds + invoices
    if db.query(func.count(BillingInvoice.id)).filter(BillingInvoice.stripe_invoice_id.like("in_perf_%")).scalar() == 0:
        inv, ref = [], []
        for oid in org_ids:
            for m in range(12):
                inv.append({"organization_id": oid, "stripe_invoice_id": f"in_perf_{oid}_{m}", "status": "paid"})
            for r in range(4):
                ref.append({"organization_id": oid, "request_type": RefundRequestType.REFUND, "amount_cents": 1500 * (r + 1),
                            "reason": "duplicate charge", "requested_by": "ops@zoikohr.com",
                            "status": RefundRequestStatus.PENDING_APPROVAL if r % 2 else RefundRequestStatus.APPROVED_AND_PROCESSED})
        _bulk(db, BillingInvoice, inv)
        _bulk(db, BillingRefundRequest, ref)

    # leave + attendance
    if db.query(func.count(LeaveRequest.id)).scalar() < len(org_ids) * staff:
        lt = list(LeaveType)[:4]
        st = [RequestStatus.PENDING, RequestStatus.APPROVED, RequestStatus.REJECTED]
        rows = []
        for (eid, oid) in db.query(Employee.id, Employee.organization_id).filter(Employee.organization_id.in_(org_ids)):
            for j in range(2):
                start = today - timedelta(days=(eid * 7 + j * 40) % 200)
                rows.append({"employee_id": eid, "organization_id": oid, "leave_type": lt[(eid + j) % 4], "start_date": start,
                             "end_date": start + timedelta(days=1), "days": 2, "status": st[(eid + j) % 3], "reason": "perf"})
        _bulk(db, LeaveRequest, rows)
    if db.query(func.count(AttendanceRecord.id)).scalar() < len(org_ids) * staff * 20:
        rows = []
        for (eid, oid) in db.query(Employee.id, Employee.organization_id).filter(Employee.organization_id.in_(org_ids)):
            for d in range(30):
                day = today - timedelta(days=d)
                if day.weekday() >= 5:
                    continue
                rows.append({"employee_id": eid, "organization_id": oid, "date": day,
                             "status": AttendanceStatus.PRESENT if (eid + d) % 9 else AttendanceStatus.ABSENT})
        _bulk(db, AttendanceRecord, rows, chunk=10000)
    print(f"leave: {db.query(func.count(LeaveRequest.id)).scalar()}  attendance: {db.query(func.count(AttendanceRecord.id)).scalar()}")

    # audit logs
    have = db.query(func.count(AuditLog.id)).scalar()
    if have < 50000:
        acts = list(AuditAction)
        _bulk(db, AuditLog, [{"action": acts[a % len(acts)], "entity_type": "organization", "entity_id": str(org_ids[a % len(org_ids)]),
                              "organization_id": org_ids[a % len(org_ids)], "actor_name": "Perf Super", "actor_role": "super_admin",
                              "action_type": acts[a % len(acts)].value, "status": "success",
                              "created_at": now - timedelta(minutes=a)} for a in range(have, 50000)], chunk=10000)
    print(f"audit logs: {db.query(func.count(AuditLog.id)).scalar()}")
    db.close()
    print(f"done in {time.monotonic() - t0:.0f}s. Logins: {SUPER_EMAIL} / hr@perf-org001.com, password {PASSWORD}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--orgs", type=int, default=50)
    ap.add_argument("--staff", type=int, default=100)
    ap.add_argument("--big-org-staff", type=int, default=600)
    a = ap.parse_args()
    _guard()
    seed(a.orgs, a.staff, a.big_org_staff)
